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
import { Roles } from '@Auth/decorators';
import { PartidoParamsDto } from '../dto/partido.dto.js';
import { CalendarioOrganizadorDto } from '../dto/calendario-organizador.dto.js';
import { CalendarioOrganizadorService } from '../services/calendario-organizador.service.js';

@ApiTags('calendario')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('temporadas/:id/calendario')
export class CalendarioOrganizadorController {
  constructor(private readonly calendario: CalendarioOrganizadorService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiOperation({
    summary: 'Consulta jornadas y partidos de una temporada para organización',
    description:
      'Consulta de solo lectura con ID y estado de las jornadas, borradores, cancelados y nombres de equipos, cancha y árbitro.',
  })
  @ApiOkResponse({ type: CalendarioOrganizadorDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
  @ApiForbiddenResponse({ description: 'La cuenta no es organizador.' })
  @ApiNotFoundResponse({ description: 'La temporada no existe.' })
  consultar(
    @Param() { id }: PartidoParamsDto,
  ): Promise<CalendarioOrganizadorDto> {
    return this.calendario.consultar(id);
  }
}
