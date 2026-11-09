import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  CalendarioDelEquipoDto,
  DetallePartidoCalendarioDto,
  EquipoCalendarioParamsDto,
} from '../dto/consulta-calendario.dto.js';
import { PartidoParamsDto } from '../dto/partido.dto.js';
import { ConsultaCalendarioService } from '../services/consulta-calendario.service.js';

@ApiTags('calendario')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'El identificador debe ser un entero positivo.',
})
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@Roles('JUGADOR', 'ORGANIZADOR')
@Controller()
export class ConsultaCalendarioController {
  constructor(private readonly calendario: ConsultaCalendarioService) {}

  @Get('equipos/:equipoId/partidos')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'equipoId', schema: { type: 'integer', minimum: 1 } })
  @ApiOperation({
    summary: 'Consulta el calendario del equipo',
    description:
      'Excluye los cancelados. Los jugadores solo ven jornadas publicadas de su equipo.',
  })
  @ApiOkResponse({ type: CalendarioDelEquipoDto })
  @ApiForbiddenResponse({
    description:
      'Acceso denegado o equipo sin inscripción (código EQUIPO_NO_INSCRITO).',
  })
  @ApiNotFoundResponse({ description: 'El equipo no existe.' })
  listar(
    @CurrentUser() usuario: User,
    @Param() { equipoId }: EquipoCalendarioParamsDto,
  ): Promise<CalendarioDelEquipoDto> {
    return this.calendario.listar(equipoId, usuario);
  }

  @Get('partidos/:id')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiOperation({
    summary: 'Consulta un partido con sus dos equipos, cancha y árbitro',
  })
  @ApiOkResponse({ type: DetallePartidoCalendarioDto })
  @ApiForbiddenResponse({
    description: 'La cuenta no tiene acceso a este partido.',
  })
  @ApiNotFoundResponse({
    description: 'Partido inexistente u oculto para un jugador del equipo.',
  })
  detalle(
    @CurrentUser() usuario: User,
    @Param() { id }: PartidoParamsDto,
  ): Promise<DetallePartidoCalendarioDto> {
    return this.calendario.detalle(id, usuario);
  }
}
