import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { PartidoParamsDto } from '../dto/partido.dto.js';
import {
  GenerarCalendarioDto,
  CalendarioGeneradoDto,
} from '../dto/generar-calendario.dto.js';
import { GeneracionCalendarioService } from '../services/generacion-calendario.service.js';

@ApiTags('calendario')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('temporadas/:id/calendario')
export class GeneracionCalendarioController {
  constructor(private readonly generacion: GeneracionCalendarioService) {}

  @Post('generar')
  @ApiOperation({
    summary: 'Genera el calendario de ida con canchas y árbitros',
    description:
      'Exige tantos INSCRITO como maxEquipos. Con 12 equipos crea 11 jornadas y 66 partidos. Con cupo impar hay un descanso por equipo. Usa hora de El Salvador. Conserva partidos cancelados y reutiliza jornadas BORRADOR; rechaza cualquier jornada PUBLICADA. Todo se guarda en una transacción.',
  })
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiCreatedResponse({ type: CalendarioGeneradoDto })
  @ApiBadRequestResponse({
    description:
      'Fecha no futura, hora inválida, listas vacías, IDs duplicados o cuerpo inválido.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
  @ApiNotFoundResponse({
    description: 'Temporada, cancha o árbitro inexistente.',
  })
  @ApiConflictResponse({
    description:
      'Partidos no cancelados o jornadas publicadas existentes; conflicto de cancha o árbitro con otra temporada.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Inscritos distintos al cupo: { inscritos, requeridos, faltan }. Árbitros insuficientes: { arbitros, requeridos }. También cancha inactiva, árbitro inactivo/sin rol o jornada que no cabe en el día.',
  })
  generar(
    @Param() { id }: PartidoParamsDto,
    @Body() dto: GenerarCalendarioDto,
  ): Promise<CalendarioGeneradoDto> {
    return this.generacion.generar(id, dto);
  }
}
