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
  ProximosPartidosParamsDto,
  ProximosPartidosRespuestaDto,
} from './proximos-partidos.dto.js';
import { ProximosPartidosService } from './proximos-partidos.service.js';

@ApiTags('posiciones')
@ApiBearerAuth()
@Roles('JUGADOR')
@Controller('equipos')
export class ProximosPartidosController {
  constructor(private readonly partidos: ProximosPartidosService) {}
  @Get(':equipoId/proximos-partidos')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Próximos rivales exclusivamente para el capitán',
    description:
      'Equipo INSCRITO de la temporada actual. Solo PROGRAMADO, jornada PUBLICADA e inicio no anterior al instante de consulta. Orden inicio ASC, id ASC. Rival sin posición: lugar y puntos null. Una transacción RepeatableRead mantiene coherentes autorización, temporada y clasificación; no recalcula ni escribe. Lista vacía si no quedan partidos.',
  })
  @ApiParam({
    name: 'equipoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiOkResponse({ type: ProximosPartidosRespuestaDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
  @ApiForbiddenResponse({
    description:
      'No es el capitán o el equipo no está inscrito en la temporada actual.',
  })
  @ApiNotFoundResponse({
    description: 'Equipo inexistente o sin temporada actual.',
  })
  consultar(
    @Param() { equipoId }: ProximosPartidosParamsDto,
    @CurrentUser() usuario: User,
  ) {
    return this.partidos.consultar(equipoId, usuario);
  }
}
