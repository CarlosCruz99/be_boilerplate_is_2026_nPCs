import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  DecisionEquipo,
  type ValidarEquipoDto,
  type ValidacionEquipoRespuestaDto,
} from '../dto/validacion-equipo.dto.js';
import { calcularEdad } from '../utils/edad.js';

@Injectable()
export class ValidacionEquiposService {
  constructor(private readonly prisma: PrismaService) {}

  async validar(
    id: number,
    organizadorId: string,
    dto: ValidarEquipoDto,
  ): Promise<ValidacionEquipoRespuestaDto> {
    return this.prisma.$transaction(
      async (db) => {
        const referenciaEquipo = await db.equipo.findUnique({
          where: { id },
          select: { temporadaId: true },
        });
        if (!referenciaEquipo)
          throw new NotFoundException('El equipo no existe.');

        // Siempre temporada -> equipo: serializa decisiones de cupo y se coordina
        // con el bloqueo de equipo de las altas y bajas de PlantillasService.
        const [temporada] = await db.$queryRaw<{ maxEquipos: number }[]>`
        SELECT max_equipos AS "maxEquipos" FROM temporada
        WHERE id = ${referenciaEquipo.temporadaId} FOR UPDATE
      `;
        if (!temporada) throw new NotFoundException('La temporada no existe.');
        await db.$queryRaw`SELECT id FROM equipo WHERE id = ${id} FOR NO KEY UPDATE`;
        const equipo = await db.equipo.findUnique({
          where: { id },
          select: { estado: true, temporadaId: true },
        });
        if (!equipo) throw new NotFoundException('El equipo no existe.');
        if (equipo.estado !== 'PENDIENTE') {
          throw new ConflictException('El equipo ya fue validado.');
        }
        const fechaValidacion = new Date();
        if (dto.decision === DecisionEquipo.APROBAR) {
          const plantilla = await db.equipoJugador.findMany({
            where: { equipoId: id },
            orderBy: { jugadorId: 'asc' },
            select: {
              jugador: {
                select: {
                  id: true,
                  nombreCompleto: true,
                  fechaNacimiento: true,
                },
              },
            },
          });
          const fallas: string[] = [];
          if (plantilla.length < 7)
            fallas.push('El equipo debe tener al menos 7 jugadores.');
          for (const { jugador } of plantilla) {
            if (calcularEdad(jugador.fechaNacimiento, fechaValidacion) < 16) {
              fallas.push(
                `El jugador ${jugador.nombreCompleto} (id ${jugador.id}) no tiene 16 años cumplidos.`,
              );
            }
          }
          if (fallas.length)
            throw new UnprocessableEntityException({
              codigo: 'REQUISITOS_NO_CUMPLIDOS',
              fallas,
            });
          const inscritos = await db.equipo.count({
            where: { temporadaId: equipo.temporadaId, estado: 'INSCRITO' },
          });
          if (inscritos >= temporada.maxEquipos) {
            throw new UnprocessableEntityException({
              codigo: 'TEMPORADA_COMPLETA',
              mensaje: 'La temporada está completa.',
            });
          }
        }

        const resultado = await db.equipo.update({
          where: { id },
          data: {
            estado:
              dto.decision === DecisionEquipo.APROBAR
                ? 'INSCRITO'
                : 'RECHAZADO',
            validadoPor: organizadorId,
            fechaValidacion,
            motivoRechazo:
              dto.decision === DecisionEquipo.RECHAZAR ? dto.motivo! : null,
          },
          select: {
            id: true,
            estado: true,
            validadoPor: true,
            fechaValidacion: true,
            motivoRechazo: true,
          },
        });
        return {
          ...resultado,
          validadoPor: resultado.validadoPor!,
          fechaValidacion: resultado.fechaValidacion!.toISOString(),
        };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
