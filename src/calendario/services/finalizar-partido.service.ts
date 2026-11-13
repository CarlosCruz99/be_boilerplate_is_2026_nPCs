import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { PosicionesService } from '../../posiciones/posiciones.service.js';
import { AvisosService } from '../../avisos/services/avisos.service.js';
import {
  ArbitroPartidoService,
  type ActorPartido,
} from '../autorizacion/arbitro-partido.service.js';
import type { FinalizarPartidoRespuestaDto } from '../dto/finalizar-partido.dto.js';

export function tituloResultado(
  local: string,
  visitante: string,
  golesLocal: number,
  golesVisitante: number,
): string {
  const prefijo = 'Resultado final: ';
  const marcador = ` ${golesLocal}-${golesVisitante} `;
  const disponible = 120 - prefijo.length - marcador.length;
  let limiteLocal = Math.min(local.length, Math.floor(disponible / 2));
  const limiteVisitante = Math.min(visitante.length, disponible - limiteLocal);
  limiteLocal = Math.min(local.length, disponible - limiteVisitante);
  const acortar = (nombre: string, limite: number) =>
    nombre.length <= limite
      ? nombre
      : nombre.slice(0, limite - 1).replace(/[\uD800-\uDBFF]$/, '') + '…';
  return (
    prefijo +
    acortar(local, limiteLocal) +
    marcador +
    acortar(visitante, limiteVisitante)
  );
}

@Injectable()
export class FinalizarPartidoService {
  private readonly logger = new Logger(FinalizarPartidoService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacion: ArbitroPartidoService,
    private readonly posiciones: PosicionesService,
    private readonly avisos: AvisosService,
  ) {}

  async finalizar(
    partidoId: number,
    usuario: ActorPartido,
  ): Promise<FinalizarPartidoRespuestaDto> {
    this.autorizacion.exigirRol(usuario, partidoId);
    const resultado = await this.prisma.$transaction(
      async (db) => {
        const referencia = await db.partido.findUnique({
          where: { id: partidoId },
          select: { temporadaId: true },
        });
        if (!referencia) throw new NotFoundException('El partido no existe.');
        // Orden común con calendario, marcador y recálculo. FOR UPDATE coordina con H9.
        await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM partido WHERE id=${partidoId} FOR UPDATE`;
        const partido = await db.partido.findUnique({
          where: { id: partidoId },
          select: {
            id: true,
            temporadaId: true,
            arbitroId: true,
            estado: true,
            equipoLocalId: true,
            equipoVisitanteId: true,
            golesLocal: true,
            golesVisitante: true,
            faltasLocal: true,
            faltasVisitante: true,
            local: { select: { nombre: true } },
            visitante: { select: { nombre: true } },
            jornada: { select: { numero: true } },
          },
        });
        if (!partido) throw new NotFoundException('El partido no existe.');
        this.autorizacion.exigirAsignacion(usuario, partido);
        if (partido.estado !== 'EN_CURSO')
          throw new ConflictException('El partido no está en curso.');
        const finReal = new Date();
        await db.partido.update({
          where: { id: partidoId },
          data: { estado: 'FINALIZADO', finReal },
        });
        await db.bitacoraMarcador.create({
          data: {
            partidoId,
            usuarioId: usuario.id,
            accion: 'FINALIZAR',
            fechaRegistro: finReal,
            golesLocal: partido.golesLocal,
            golesVisitante: partido.golesVisitante,
            faltasLocal: partido.faltasLocal,
            faltasVisitante: partido.faltasVisitante,
          },
        });
        await this.posiciones.recalcular(partido.temporadaId, db);
        return { partido, finReal };
      },
      { isolationLevel: 'ReadCommitted' },
    );

    // H20 se ejecuta solo tras confirmar el resultado. Cada equipo se intenta
    // independientemente: un fallo no impide avisar al otro ni revierte el resultado.
    const { partido, finReal } = resultado;
    await Promise.all(
      [partido.equipoLocalId, partido.equipoVisitanteId].map(
        async (equipoId) => {
          try {
            await this.avisos.send({
              moduloOrigen: 'RESULTADOS',
              tipo: 'RESULTADO_FINALIZADO',
              destinatario: { equipoId, temporadaId: partido.temporadaId },
              titulo: tituloResultado(
                partido.local.nombre,
                partido.visitante.nombre,
                partido.golesLocal,
                partido.golesVisitante,
              ),
              mensaje: `El partido de la jornada ${partido.jornada.numero} terminó ${partido.golesLocal}-${partido.golesVisitante}.`,
              referencia: { tipo: 'PARTIDO', id: partidoId },
              claveIdempotencia: `partido-${partidoId}-finalizado`,
            });
          } catch (error) {
            this.logger.error({
              evento: 'AVISO_RESULTADO_FINALIZADO_FALLIDO',
              partidoId,
              equipoId,
              fecha: new Date().toISOString(),
              error: error instanceof Error ? error.name : 'Error desconocido',
            });
          }
        },
      ),
    );
    return {
      partidoId,
      estado: 'FINALIZADO',
      golesLocal: partido.golesLocal,
      golesVisitante: partido.golesVisitante,
      finReal: finReal.toISOString(),
    };
  }
}
