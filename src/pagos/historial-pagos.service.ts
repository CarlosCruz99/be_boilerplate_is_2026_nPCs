import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  StreamableFile,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import { ComprobantesService } from './comprobantes.service.js';
import { descargarComprobante } from './descargar-comprobante.js';
import { centavosPago, dinero } from './pago.dto.js';
import type {
  HistorialPagosDto,
  HistorialQueryDto,
  TotalesHistorialDto,
} from './historial-pagos.dto.js';

type ActorHistorial = Pick<User, 'id' | 'rol' | 'isActive'>;
export function autorizarHistorial(
  usuario: ActorHistorial | undefined,
  capitanId: string,
): void {
  if (!usuario?.isActive)
    throw new UnauthorizedException('Sesión no válida. Inicia sesión.');
  if (usuario.rol !== 'JUGADOR' || usuario.id !== capitanId)
    throw new ForbiddenException('No tienes permiso para esta acción.');
}
export function totalizarHistorial(
  pagos: { monto: string; estado: string }[],
): TotalesHistorialDto {
  let total = 0n,
    verificado = 0n,
    pendiente = 0n,
    rechazado = 0n;
  for (const pago of pagos) {
    const importe = centavosPago(pago.monto);
    if (importe === null)
      throw new InternalServerErrorException(
        'El historial contiene un monto inválido.',
      );
    total += importe;
    if (pago.estado === 'VERIFICADO') verificado += importe;
    else if (pago.estado === 'PENDIENTE') pendiente += importe;
    else if (pago.estado === 'RECHAZADO') rechazado += importe;
    else
      throw new InternalServerErrorException(
        'El historial contiene un estado inválido.',
      );
  }
  return {
    totalRegistrado: dinero(total),
    totalVerificado: dinero(verificado),
    pendienteVerificacion: dinero(pendiente),
    totalRechazado: dinero(rechazado),
  };
}

@Injectable()
export class HistorialPagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comprobantes: ComprobantesService,
  ) {}
  async consultar(
    equipoId: number,
    query: HistorialQueryDto,
    usuario: ActorHistorial,
  ): Promise<HistorialPagosDto> {
    const filas = await this.prisma.$transaction(
      async (db) => {
        const equipo = await db.equipo.findUnique({
          where: { id: equipoId },
          select: { capitanId: true, temporadaId: true },
        });
        if (!equipo) throw new NotFoundException('El equipo no existe.');
        autorizarHistorial(usuario, equipo.capitanId);
        const temporada = await db.temporada.findUnique({
          where: { id: query.temporadaId },
          select: { id: true },
        });
        if (!temporada) throw new NotFoundException('La temporada no existe.');
        if (equipo.temporadaId !== query.temporadaId)
          throw new UnprocessableEntityException(
            'El equipo no pertenece a la temporada solicitada.',
          );
        return db.pago.findMany({
          where: {
            cuota: {
              equipoId,
              temporadaId: query.temporadaId,
              ...(query.concepto === undefined
                ? {}
                : { concepto: query.concepto }),
            },
          },
          select: {
            id: true,
            monto: true,
            fechaPago: true,
            estado: true,
            motivoRechazo: true,
            comprobanteClave: true,
            cuota: { select: { concepto: true } },
          },
          orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
    // Sumas exactas del mismo conjunto completo (sin segunda lectura ni paginación).
    const pagos = [];
    for (const fila of filas)
      pagos.push({
        id: fila.id,
        concepto: fila.cuota.concepto,
        monto: fila.monto.toFixed(2),
        fechaPago: fila.fechaPago.toISOString().slice(0, 10),
        estado: fila.estado,
        motivoRechazo: fila.motivoRechazo,
        tieneComprobante: await this.comprobantes.existe(fila.comprobanteClave),
      });
    return {
      equipoId,
      temporadaId: query.temporadaId,
      concepto: query.concepto ?? null,
      pagos,
      totales: totalizarHistorial(pagos),
    };
  }
  async descargar(
    pagoId: number,
    usuario: ActorHistorial,
  ): Promise<StreamableFile> {
    const pago = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      select: {
        comprobanteClave: true,
        comprobanteMime: true,
        comprobanteBytes: true,
        cuota: { select: { equipo: { select: { capitanId: true } } } },
      },
    });
    if (!pago) throw new NotFoundException('El pago no existe.');
    autorizarHistorial(usuario, pago.cuota.equipo.capitanId);
    return descargarComprobante(this.comprobantes, pagoId, pago);
  }
}
