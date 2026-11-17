import { Body, Controller, Get, Header, Param, Put } from '@nestjs/common';
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
import { Roles } from '@Auth/decorators';
import { PartidoParamsDto } from '../dto/partido.dto.js';
import {
  AsignarArbitroDto,
  ArbitroAsignadoRespuestaDto,
  ArbitrosDisponiblesRespuestaDto,
} from '../dto/asignacion-arbitro.dto.js';
import { AsignacionArbitroService } from '../services/asignacion-arbitro.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('partidos')
@ApiParam({
  name: 'id',
  schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
})
@ApiBadRequestResponse({
  description: 'Identificador, UUID o cuerpo inválidos.',
})
@ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
@ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
@ApiNotFoundResponse({ description: 'Partido o árbitro inexistente.' })
@ApiConflictResponse({
  description: 'Partido no Programado o árbitro ocupado.',
})
export class AsignacionArbitroController {
  constructor(private readonly arbitros: AsignacionArbitroService) {}
  @Get(':id/arbitros-disponibles')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Lista árbitros activos sin cruce para un partido Programado',
    description:
      'Incluye al árbitro actual si es elegible. Intervalos [inicio, fin): horarios contiguos se permiten. No reserva disponibilidad; PUT vuelve a comprobarla.',
  })
  @ApiOkResponse({ type: ArbitrosDisponiblesRespuestaDto })
  disponibles(@Param() { id }: PartidoParamsDto) {
    return this.arbitros.disponibles(id);
  }
  @Put(':id/arbitro')
  @ApiOperation({
    summary: 'Asigna o sustituye al árbitro de un partido Programado',
    description:
      'Solo modifica arbitroId. Seleccionar el mismo árbitro elegible devuelve 200. No impone inicio futuro. El árbitro anterior pierde los permisos de H5.',
  })
  @ApiOkResponse({ type: ArbitroAsignadoRespuestaDto })
  @ApiUnprocessableEntityResponse({
    description: 'El candidato debe ser un árbitro activo.',
  })
  asignar(@Param() { id }: PartidoParamsDto, @Body() dto: AsignarArbitroDto) {
    return this.arbitros.asignar(id, dto.arbitroId);
  }
}
