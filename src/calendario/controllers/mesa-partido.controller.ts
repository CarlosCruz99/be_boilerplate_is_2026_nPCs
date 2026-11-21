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
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { ArbitroAsignado } from '../autorizacion/arbitro-asignado.decorator.js';
import {
  MesaPartidoParamsDto,
  MesaPartidoRespuestaDto,
} from '../dto/mesa-partido.dto.js';
import { MesaPartidoService } from '../services/mesa-partido.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@Controller('partidos')
export class MesaPartidoController {
  constructor(private readonly mesa: MesaPartidoService) {}

  @Get(':partidoId/mesa')
  @ArbitroAsignado()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary:
      'Consulta el estado operativo del partido para la mesa del árbitro',
    description:
      'Solo el árbitro asignado. Devuelve marcador, faltas, tiempos reales y participantes en cualquier estado del partido.',
  })
  @ApiParam({
    name: 'partidoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiOkResponse({ type: MesaPartidoRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'El identificador del partido debe ser un entero positivo válido.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({
    description: 'No tienes permiso para esta acción.',
    schema: { example: { mensaje: 'No tienes permiso para esta acción.' } },
  })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  consultar(
    @Param() { partidoId }: MesaPartidoParamsDto,
    @CurrentUser() usuario: User,
  ): Promise<MesaPartidoRespuestaDto> {
    return this.mesa.consultar(partidoId, usuario);
  }
}
