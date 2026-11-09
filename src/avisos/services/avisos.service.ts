import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma, ReferenciaAviso } from '@PrismaClient';
import type {
  CrearAvisoDto,
  ResultadoEnvioAvisos,
} from '../avisos.contract.js';
import { validarAviso } from '../dto/validar-aviso.js';

@Injectable()
export class AvisosService {
  constructor(private readonly prisma: PrismaService) {}

  async send(
    entrada: CrearAvisoDto,
    transaccion?: Prisma.TransactionClient,
  ): Promise<ResultadoEnvioAvisos> {
    const { dto, datosSerializados } = validarAviso(entrada);
    const enviar = async (
      db: Prisma.TransactionClient,
    ): Promise<ResultadoEnvioAvisos> => {
      let destinatarios: string[];
      if ('usuarioId' in dto.destinatario) {
        const usuarioId = dto.destinatario.usuarioId as string;
        const usuario = await db.user.findUnique({
          where: { id: usuarioId },
          select: { id: true },
        });
        if (!usuario) throw new NotFoundException('El destinatario no existe.');
        destinatarios = [usuario.id];
      } else {
        const { equipoId, temporadaId } = dto.destinatario as {
          equipoId: number;
          temporadaId: number;
        };
        const equipo = await db.equipo.findFirst({
          where: { id: equipoId, temporadaId },
          select: {
            capitanId: true,
            jugadores: {
              where: { temporadaId },
              select: { jugador: { select: { usuarioId: true } } },
            },
          },
        });
        if (!equipo)
          throw new NotFoundException(
            'El equipo destinatario no existe en esa temporada.',
          );
        destinatarios = [
          ...new Set(
            [
              equipo.capitanId,
              ...equipo.jugadores.map((j) => j.jugador.usuarioId),
            ].filter((id): id is string => id !== null),
          ),
        ];
        if (!destinatarios.length)
          throw new NotFoundException('El equipo no tiene destinatarios.');
      }
      if (datosSerializados !== undefined) {
        // jsonb::text agrega separadores: validar también el tamaño real que
        // exige el CHECK de DB-20.1, antes de cualquier escritura de avisos.
        const [tamano] = await db.$queryRaw<
          { bytes: number }[]
        >`SELECT octet_length(${datosSerializados}::jsonb::text) AS bytes`;
        if (tamano.bytes > 2048)
          throw new BadRequestException('datos: supera 2048 bytes en JSONB.');
      }
      const creados = await db.aviso.createManyAndReturn({
        data: destinatarios.map((usuarioId) => ({
          usuarioId,
          moduloOrigen: dto.moduloOrigen,
          tipo: dto.tipo,
          titulo: dto.titulo,
          mensaje: dto.mensaje,
          referenciaTipo: dto.referencia?.tipo as ReferenciaAviso | undefined,
          referenciaId: dto.referencia?.id as number | undefined,
          datos:
            datosSerializados === undefined
              ? undefined
              : (JSON.parse(datosSerializados) as Prisma.InputJsonValue),
          claveIdempotencia: dto.claveIdempotencia,
        })),
        skipDuplicates: true,
        select: { id: true },
      });
      return {
        avisosCreados: creados.length,
        avisoIds: creados.map((a) => a.id),
      };
    };
    // H16 comparte su transacción: no queda PUBLICADA si falla algún aviso.
    return transaccion ? enviar(transaccion) : this.prisma.$transaction(enviar);
  }
}
