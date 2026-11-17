import { Body, Controller, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { ArbitroAsignado } from '../autorizacion/arbitro-asignado.decorator.js';
import {
  ParticipantesParamsDto,
  ParticipantesRespuestaDto,
  RegistrarParticipantesDto,
} from '../dto/participantes.dto.js';
import { ParticipantesService } from '../services/participantes.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@Controller('partidos')
export class ParticipantesController {
  constructor(private readonly participantes: ParticipantesService) {}
  @Put(':partidoId/participantes')
  @ArbitroAsignado()
  @ApiOperation({
    summary: 'Reemplaza todos los participantes de un partido EN_CURSO',
    description:
      'Solo el árbitro asignado. jugadorIds obligatorio: 0 a 30 enteros positivos sin repetidos. [] vacía la lista. Cada jugador debe estar inscrito en uno de los dos equipos en la temporada. Las estadísticas H9 se conservan al retirarlo. Respuesta ordenada por id dentro de cada equipo.',
  })
  @ApiParam({
    name: 'partidoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiOkResponse({ type: ParticipantesRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'Identificador inválido, arreglo ausente/inválido, repetidos, más de 30 jugadores o campos no permitidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  @ApiConflictResponse({
    description:
      'El partido no está En curso. Finalizado solo permite corrección autorizada H23.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Algún jugador no está inscrito en uno de los equipos en la temporada del partido.',
  })
  registrar(
    @Param() { partidoId }: ParticipantesParamsDto,
    @Body() dto: RegistrarParticipantesDto,
    @CurrentUser() usuario: User,
  ): Promise<ParticipantesRespuestaDto> {
    return this.participantes.registrar(partidoId, dto, usuario);
  }
}
