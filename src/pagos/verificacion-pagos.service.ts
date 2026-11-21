import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import { ComprobantesService } from './comprobantes.service.js';
import { descargarComprobante } from './descargar-comprobante.js';
import type {
  BandejaPagosDto,
  PagoPendienteDto,
  PendientesQueryDto,
  RevisionPagoDto,
  VerificacionPagoDto,
  VerificarPagoDto,
} from './verificacion-pago.dto.js';

@Injectable()
export class VerificacionPagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: ComprobantesService,
  ) {}

  async pendientes({
    page,
    pageSize,
  }: PendientesQueryDto): Promise<BandejaPagosDto> {
    return this.prisma.$transaction(
      async (db) => {
        const total = await db.pago.count({ where: { estado: 'PENDIENTE' } });
        const pagos = await db.$queryRaw<PagoPendienteDto[]>`
        SELECT p.id, p.cuota_id AS "cuotaId", json_build_object('id',e.id,'nombre',e.nombre) AS equipo,
          c.concepto, p.monto::text AS monto, p.fecha_pago::text AS "fechaPago"
        FROM pago p JOIN cuota c ON c.id=p.cuota_id JOIN equipo e ON e.id=c.equipo_id
        WHERE p.estado='PENDIENTE'
        ORDER BY p.creado_en ASC,p.id ASC OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}
      `;
        return { total, page, pageSize, pagos };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private async saldos(db: Prisma.TransactionClient, cuotaId: number) {
    const [saldo] = await db.$queryRaw<{ saldo: string; disponible: string }[]>`
      SELECT saldo::text,disponible::text FROM fn_saldo_cuota(${cuotaId})`;
    if (!saldo)
      throw new InternalServerErrorException(
        'No se pudo calcular el saldo de la cuota.',
      );
    return saldo;
  }

  async revision(id: number): Promise<RevisionPagoDto> {
    const resultado = await this.prisma.$transaction(
      async (db) => {
        const pago = await db.pago.findUnique({
          where: { id },
          select: {
            id: true,
            estado: true,
            monto: true,
            fechaPago: true,
            comprobanteClave: true,
            verificadoPor: true,
            verificadoEn: true,
            motivoRechazo: true,
            cuota: {
              select: {
                id: true,
                temporadaId: true,
                concepto: true,
                monto: true,
                equipo: { select: { id: true, nombre: true } },
              },
            },
          },
        });
        if (!pago) throw new NotFoundException('El pago no existe.');
        return { pago, saldos: await this.saldos(db, pago.cuota.id) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const { pago, saldos } = resultado;
    return {
      id: pago.id,
      estado: pago.estado,
      monto: pago.monto.toFixed(2),
      fechaPago: pago.fechaPago.toISOString().slice(0, 10),
      cuota: {
        id: pago.cuota.id,
        temporadaId: pago.cuota.temporadaId,
        equipo: pago.cuota.equipo,
        concepto: pago.cuota.concepto,
        montoTotal: pago.cuota.monto.toFixed(2),
        ...saldos,
      },
      tieneComprobante: await this.archivos.existe(pago.comprobanteClave),
      verificadoPor: pago.verificadoPor,
      verificadoEn: pago.verificadoEn?.toISOString() ?? null,
      motivoRechazo: pago.motivoRechazo,
    };
  }

  async comprobante(id: number) {
    const pago = await this.prisma.pago.findUnique({
      where: { id },
      select: {
        comprobanteClave: true,
        comprobanteMime: true,
        comprobanteBytes: true,
      },
    });
    if (!pago) throw new NotFoundException('El pago no existe.');
    // El controlador exige ORGANIZADOR; H14 conserva su autorización de capitán.
    return descargarComprobante(this.archivos, id, pago);
  }

  async resolver(
    id: number,
    dto: VerificarPagoDto,
    organizadorId: string,
  ): Promise<VerificacionPagoDto> {
    return this.prisma.$transaction(
      async (db) => {
        const referencia = await db.pago.findUnique({
          where: { id },
          select: { cuotaId: true },
        });
        if (!referencia) throw new NotFoundException('El pago no existe.');
        // Orden compartido con H13 y el trigger de DB-13.1: cuota antes de pago.
        await db.$queryRaw`SELECT id FROM cuota WHERE id=${referencia.cuotaId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM pago WHERE id=${id} FOR UPDATE`;
        const pago = await db.pago.findUnique({
          where: { id },
          select: { estado: true, cuotaId: true, comprobanteClave: true },
        });
        if (!pago) throw new NotFoundException('El pago no existe.');
        if (pago.cuotaId !== referencia.cuotaId)
          throw new ConflictException(
            'La cuota del pago cambió. Actualiza e intenta de nuevo.',
          );
        if (pago.estado !== 'PENDIENTE')
          throw new ConflictException('El pago ya fue resuelto.');
        // Decisión acordada: no confirmar un pago cuyo archivo privado ya no existe.
        // El rechazo sí permite liberar la reserva aunque falte el comprobante.
        if (
          dto.estado === 'VERIFICADO' &&
          !(await this.archivos.existe(pago.comprobanteClave))
        )
          throw new UnprocessableEntityException(
            'El comprobante no está disponible. No se puede verificar el pago.',
          );
        const verificadoEn = new Date();
        const actualizados = await db.pago.updateMany({
          where: { id, estado: 'PENDIENTE' },
          data: {
            estado: dto.estado,
            verificadoPor: organizadorId,
            verificadoEn,
            motivoRechazo: dto.estado === 'RECHAZADO' ? dto.motivo! : null,
          },
        });
        if (actualizados.count !== 1)
          throw new ConflictException('El pago ya fue resuelto.');
        // El mismo cliente transaccional ve la decisión; cualquier fallo revierte todo.
        return {
          id,
          estado: dto.estado,
          verificadoPor: organizadorId,
          verificadoEn: verificadoEn.toISOString(),
          ...(await this.saldos(db, pago.cuotaId)),
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
