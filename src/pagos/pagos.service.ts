import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import { createHash } from 'node:crypto';
import { AvisosService } from '../avisos/services/avisos.service.js';
import { fechaCivilSalvador } from '../calendario/utils/fecha-salvador.js';
import {
  ComprobantesService,
  type Comprobante,
} from './comprobantes.service.js';
import {
  centavosPago,
  dinero,
  type RegistrarPagoDto,
  type PagoRespuestaDto,
  type CuotaSaldoDto,
} from './pago.dto.js';

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly comprobantes: ComprobantesService,
    private readonly avisos: AvisosService,
  ) {}
  private async saldo(db: Prisma.TransactionClient, cuotaId: number) {
    const [saldo] = await db.$queryRaw<
      { saldo: string; disponible: string }[]
    >`SELECT saldo::text,disponible::text FROM fn_saldo_cuota(${cuotaId})`;
    return saldo;
  }
  async listar(
    equipoId: number,
    temporadaId: number,
    usuarioId: string,
  ): Promise<{ cuotas: CuotaSaldoDto[] }> {
    const equipo = await this.prisma.equipo.findUnique({
      where: { id: equipoId },
      select: { capitanId: true, temporadaId: true },
    });
    if (!equipo) throw new NotFoundException('El equipo no existe.');
    if (equipo.capitanId !== usuarioId)
      throw new ForbiddenException('No tienes permiso para esta acción.');
    if (equipo.temporadaId !== temporadaId)
      throw new NotFoundException('El equipo no pertenece a esa temporada.');
    const cuotas = await this.prisma.$queryRaw<CuotaSaldoDto[]>`
      SELECT c.id,c.equipo_id AS "equipoId",c.concepto,
      s.monto_total::text AS "montoTotal",s.total_verificado::text AS "totalVerificado",
      s.saldo::text,s.pendiente_verificacion::text AS "pendienteVerificacion",s.disponible::text
      FROM cuota c JOIN fn_saldo_cuota() s ON s.cuota_id=c.id
      WHERE c.equipo_id=${equipoId} AND c.temporada_id=${temporadaId} ORDER BY c.id`;
    return { cuotas };
  }
  async registrar(
    cuotaId: number,
    dto: RegistrarPagoDto,
    archivo: Comprobante | undefined,
    clave: string | undefined,
    usuarioId: string,
  ) {
    if (!clave || clave.length > 100 || !/^[\x21-\x7e]+$/.test(clave))
      throw new BadRequestException(
        'Idempotency-Key es obligatoria: 1 a 100 caracteres visibles sin espacios.',
      );
    const mime = await this.comprobantes.validar(archivo);
    const buffer = archivo!.buffer;
    const monto = dinero(centavosPago(dto.monto)!);
    let archivoNuevo: string | undefined;
    let resultado;
    try {
      resultado = await this.prisma.$transaction(
        async (db) => {
          // Serializa claves del mismo usuario incluso si apuntan a cuotas diferentes.
          await db.$queryRaw`SELECT id FROM usuario WHERE id=${usuarioId}::uuid FOR NO KEY UPDATE`;
          await db.$queryRaw`SELECT id FROM cuota WHERE id=${cuotaId} FOR UPDATE`;
          const cuota = await db.cuota.findUnique({
            where: { id: cuotaId },
            select: { id: true, equipo: { select: { capitanId: true } } },
          });
          if (!cuota) throw new NotFoundException('La cuota no existe.');
          if (cuota.equipo.capitanId !== usuarioId)
            throw new ForbiddenException('No tienes permiso para esta acción.');
          const previo = await db.pago.findUnique({
            where: {
              registradoPor_claveIdempotencia: {
                registradoPor: usuarioId,
                claveIdempotencia: clave,
              },
            },
          });
          if (previo) {
            const hash = (b: Buffer) =>
              createHash('sha256').update(b).digest('hex');
            if (
              previo.cuotaId !== cuotaId ||
              previo.monto.toFixed(2) !== monto ||
              previo.fechaPago.toISOString().slice(0, 10) !== dto.fechaPago ||
              hash(await this.comprobantes.leer(previo.comprobanteClave)) !==
                hash(buffer)
            )
              throw new ConflictException(
                'Idempotency-Key ya se utilizó con contenido distinto.',
              );
            return {
              pago: previo,
              saldos: await this.saldo(db, cuotaId),
              repetido: true,
            };
          }
          if (dto.fechaPago > fechaCivilSalvador())
            throw new BadRequestException(
              'La fecha de pago no puede ser futura en El Salvador.',
            );
          const saldos = await this.saldo(db, cuotaId);
          if (centavosPago(monto)! > BigInt(saldos.disponible.replace('.', '')))
            throw new ConflictException({
              mensaje: 'El monto supera el disponible de la cuota.',
              disponible: saldos.disponible,
            });
          archivoNuevo = await this.comprobantes.guardar(buffer);
          const pago = await db.pago.create({
            data: {
              cuotaId,
              monto,
              fechaPago: new Date(dto.fechaPago + 'T00:00:00Z'),
              comprobanteClave: archivoNuevo,
              comprobanteMime: mime,
              comprobanteBytes: buffer.length,
              registradoPor: usuarioId,
              claveIdempotencia: clave,
            },
          });
          return {
            pago,
            saldos: await this.saldo(db, cuotaId),
            repetido: false,
          };
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      if (archivoNuevo) await this.comprobantes.eliminar(archivoNuevo);
      throw error;
    }
    const { pago, saldos, repetido } = resultado;
    const respuesta: PagoRespuestaDto = {
      id: pago.id,
      cuotaId: pago.cuotaId,
      monto: pago.monto.toFixed(2),
      fechaPago: pago.fechaPago.toISOString().slice(0, 10),
      estado: pago.estado,
      ...saldos,
      mensaje:
        pago.estado === 'PENDIENTE'
          ? 'El saldo se actualizará cuando un organizador apruebe el pago.'
          : 'El pago ya fue revisado.',
    };
    if (pago.estado === 'PENDIENTE') {
      try {
        // También permite recuperar un aviso fallido en un reintento; H20 evita duplicados.
        await this.avisos.send({
          moduloOrigen: 'PAGOS',
          tipo: 'PAGO_REGISTRADO',
          destinatario: { usuarioId },
          titulo: 'Pago registrado',
          mensaje: `Registraste un pago de $${respuesta.monto}; está Pendiente de verificación.`,
          referencia: { tipo: 'PAGO', id: pago.id },
          claveIdempotencia: `pago-${pago.id}`,
        });
      } catch (error) {
        this.logger.error({
          evento: 'AVISO_PAGO_FALLIDO',
          pagoId: pago.id,
          error: error instanceof Error ? error.name : 'Error desconocido',
        });
        respuesta.advertencia =
          'El pago se registró, pero no se pudo enviar el aviso.';
      }
    }
    return { respuesta, repetido };
  }
}
