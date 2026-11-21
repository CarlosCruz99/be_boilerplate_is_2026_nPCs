import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ArbitroPartidoService,
  type ActorPartido,
} from '../autorizacion/arbitro-partido.service.js';
import type { IniciarPartidoRespuestaDto } from '../dto/iniciar-partido.dto.js';

const estados = {
  PROGRAMADO: 'Programado',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
} as const;

@Injectable()
export class IniciarPartidoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacion: ArbitroPartidoService,
  ) {}

  iniciar(
    partidoId: number,
    usuario: ActorPartido,
  ): Promise<IniciarPartidoRespuestaDto> {
    this.autorizacion.exigirRol(usuario, partidoId);
    return this.prisma.$transaction(
      async (db) => {
        const referencia = await db.partido.findUnique({
          where: { id: partidoId },
          select: { temporadaId: true },
        });
        if (!referencia) throw new NotFoundException('El partido no existe.');
        // Mismo orden que calendario y marcador, para coordinar inicio/reprogramación/cancelación.
        await db.$queryRaw`SELECT id FROM temporada WHERE id=${referencia.temporadaId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM partido WHERE id=${partidoId} FOR UPDATE`;
        const partido = await db.partido.findUnique({
          where: { id: partidoId },
          select: {
            id: true,
            arbitroId: true,
            estado: true,
            golesLocal: true,
            golesVisitante: true,
            faltasLocal: true,
            faltasVisitante: true,
          },
        });
        if (!partido) throw new NotFoundException('El partido no existe.');
        this.autorizacion.exigirAsignacion(usuario, partido);
        if (partido.estado !== 'PROGRAMADO')
          throw new ConflictException(
            `No se puede cambiar de “${estados[partido.estado]}” a “En curso”.`,
          );
        // Hora del servidor tomada después de obtener los bloqueos; no se recibe del cliente.
        const inicioReal = new Date();
        const iniciado = await db.partido.update({
          where: { id: partidoId },
          data: { estado: 'EN_CURSO', inicioReal },
          select: { inicioReal: true },
        });
        await db.bitacoraMarcador.create({
          data: {
            partidoId,
            usuarioId: usuario.id,
            accion: 'INICIAR',
            fechaRegistro: inicioReal,
            golesLocal: partido.golesLocal,
            golesVisitante: partido.golesVisitante,
            faltasLocal: partido.faltasLocal,
            faltasVisitante: partido.faltasVisitante,
          },
        });
        return {
          partidoId,
          estado: 'EN_CURSO',
          inicioReal: iniciado.inicioReal!.toISOString(),
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
