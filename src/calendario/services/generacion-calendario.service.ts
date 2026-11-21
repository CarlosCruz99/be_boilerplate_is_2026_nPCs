import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type {
  GenerarCalendarioDto,
  CalendarioGeneradoDto,
} from '../dto/generar-calendario.dto.js';
import { construirCalendarioIda } from '../utils/calendario-ida.js';
import { fechaCivilSalvador } from '../utils/fecha-salvador.js';
import { traducirConflictoPartido } from '../utils/conflictos-partido.js';

@Injectable()
export class GeneracionCalendarioService {
  constructor(private readonly prisma: PrismaService) {}

  async generar(
    temporadaId: number,
    dto: GenerarCalendarioDto,
  ): Promise<CalendarioGeneradoDto> {
    try {
      return await this.prisma.$transaction(
        async (db) => {
          // Compartido con H2 y BE-3.1: aprobación, altas y generación no pueden
          // cambiar la temporada entre comprobar inscritos/calendario y guardar.
          const [temporada] = await db.$queryRaw<{ maxEquipos: number }[]>`
          SELECT max_equipos AS "maxEquipos" FROM temporada WHERE id=${temporadaId} FOR UPDATE
        `;
          if (!temporada)
            throw new NotFoundException('La temporada no existe.');
          if (dto.fechaPrimeraJornada <= fechaCivilSalvador())
            throw new BadRequestException(
              'La primera jornada debe tener una fecha futura en El Salvador.',
            );
          if (
            await db.partido.count({
              where: { temporadaId, estado: { not: 'CANCELADO' } },
            })
          ) {
            throw new ConflictException(
              'La temporada ya tiene partidos no cancelados.',
            );
          }
          const existentes = await db.jornada.findMany({
            where: { temporadaId },
            select: { id: true, numero: true, estado: true },
          });
          if (existentes.some((j) => j.estado === 'PUBLICADA'))
            throw new ConflictException(
              'La temporada tiene jornadas publicadas.',
            );
          const equipos = await db.equipo.findMany({
            where: { temporadaId, estado: 'INSCRITO' },
            select: { id: true },
            orderBy: { id: 'asc' },
          });
          if (equipos.length !== temporada.maxEquipos) {
            throw new UnprocessableEntityException({
              inscritos: equipos.length,
              requeridos: temporada.maxEquipos,
              faltan: Math.max(0, temporada.maxEquipos - equipos.length),
            });
          }
          const canchas = await db.cancha.findMany({
            where: { id: { in: dto.canchaIds } },
            select: { id: true, activa: true },
          });
          if (canchas.length !== dto.canchaIds.length)
            throw new NotFoundException('La cancha no existe.');
          if (canchas.some((c) => !c.activa))
            throw new UnprocessableEntityException('La cancha está inactiva.');
          const candidatos = await db.user.findMany({
            where:
              dto.arbitroIds === undefined
                ? { rol: 'ARBITRO', isActive: true }
                : { id: { in: dto.arbitroIds } },
            select: { id: true, rol: true, isActive: true },
            orderBy: { id: 'asc' },
          });
          if (
            dto.arbitroIds !== undefined &&
            candidatos.length !== dto.arbitroIds.length
          )
            throw new NotFoundException('El árbitro no existe.');
          if (candidatos.some((a) => a.rol !== 'ARBITRO'))
            throw new UnprocessableEntityException(
              'El usuario elegido no es árbitro.',
            );
          if (candidatos.some((a) => !a.isActive))
            throw new UnprocessableEntityException('El árbitro está inactivo.');
          const arbitroIds = dto.arbitroIds ?? candidatos.map((a) => a.id);
          const simultaneas = Math.min(
            dto.canchaIds.length,
            Math.floor(equipos.length / 2),
          );
          if (arbitroIds.length < simultaneas)
            throw new UnprocessableEntityException({
              arbitros: arbitroIds.length,
              requeridos: simultaneas,
            });
          let plan: ReturnType<typeof construirCalendarioIda>;
          try {
            plan = construirCalendarioIda({
              equipoIds: equipos.map((e) => e.id),
              canchaIds: dto.canchaIds,
              arbitroIds,
              fechaPrimeraJornada: dto.fechaPrimeraJornada,
              horaPrimerTurno: dto.horaPrimerTurno,
            });
          } catch (error) {
            if (error instanceof RangeError)
              throw new UnprocessableEntityException(error.message);
            throw error;
          }
          const jornadas = new Map(existentes.map((j) => [j.numero, j.id]));
          for (let numero = 1; numero <= plan.jornadas; numero++) {
            if (!jornadas.has(numero)) {
              const jornada = await db.jornada.create({
                data: { temporadaId, numero, estado: 'BORRADOR' },
                select: { id: true },
              });
              jornadas.set(numero, jornada.id);
            }
          }
          // Nunca se borran los cancelados ni se cambia el estado de jornadas
          // previas. Las exclusiones SQL resuelven conflictos con otras temporadas.
          for (const p of plan.partidos) {
            await db.$queryRaw`
            INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin)
            VALUES (${temporadaId},${jornadas.get(p.jornada)!},${p.equipoLocalId},${p.equipoVisitanteId},${p.canchaId},${p.arbitroId}::uuid,${p.inicio},${p.fin}) RETURNING id
          `;
          }
          return {
            temporadaId,
            jornadas: plan.jornadas,
            partidos: plan.partidos.length,
            estadoJornadas: 'BORRADOR' as const,
          };
        },
        { isolationLevel: 'ReadCommitted', timeout: 15000 },
      );
    } catch (error) {
      traducirConflictoPartido(error);
    }
  }
}
