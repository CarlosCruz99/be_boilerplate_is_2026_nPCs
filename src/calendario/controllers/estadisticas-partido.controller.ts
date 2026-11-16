import { Body, Controller, Get, Header, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
  CantidadesEstadisticaDto,
  EstadisticaJugadorParamsDto,
  EstadisticasPartidoDto,
  RegistroEstadisticaDto,
  validarCantidades,
} from '../dto/estadisticas-partido.dto.js';
import { MarcadorParamsDto } from '../dto/marcador.dto.js';
import { EstadisticasPartidoService } from '../services/estadisticas-partido.service.js';

const id = { type: 'integer', minimum: 1, maximum: 2_147_483_647 } as const;

@ApiTags('partidos')
@ApiBearerAuth()
@ArbitroAsignado()
@ApiParam({ name: 'partidoId', schema: id })
@ApiBadRequestResponse({ description: 'Identificador o formato inválido.' })
@ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
@ApiForbiddenResponse({ description: 'Se requiere el árbitro asignado.' })
@ApiNotFoundResponse({ description: 'El partido o jugador no existe.' })
@Controller('partidos/:partidoId/estadisticas')
export class EstadisticasPartidoController {
  constructor(private readonly estadisticas: EstadisticasPartidoService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Consulta estadísticas y jugadores habilitados del partido',
  })
  @ApiOkResponse({ type: EstadisticasPartidoDto })
  consultar(
    @Param() { partidoId }: MarcadorParamsDto,
    @CurrentUser() usuario: User,
  ): Promise<EstadisticasPartidoDto> {
    return this.estadisticas.consultar(partidoId, usuario);
  }

  @Put(':jugadorId')
  @ApiOperation({
    summary: 'Reemplaza las estadísticas de un jugador en un partido en curso',
  })
  @ApiParam({ name: 'jugadorId', schema: id })
  @ApiBody({ type: CantidadesEstadisticaDto })
  @ApiOkResponse({ type: RegistroEstadisticaDto })
  @ApiConflictResponse({ description: 'El partido no está en curso.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Cantidades inválidas o jugador sin inscripción en un equipo del partido.',
  })
  guardar(
    @Param() { partidoId, jugadorId }: EstadisticaJugadorParamsDto,
    @Body() cuerpo: unknown,
    @CurrentUser() usuario: User,
  ): Promise<RegistroEstadisticaDto> {
    return this.estadisticas.guardar(
      partidoId,
      jugadorId,
      validarCantidades(cuerpo),
      usuario,
    );
  }
}
