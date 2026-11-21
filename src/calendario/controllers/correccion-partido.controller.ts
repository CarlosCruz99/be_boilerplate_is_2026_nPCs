import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
} from '@nestjs/common';
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
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  AplicarCorreccionDto,
  BitacoraCorreccionDto,
  CorreccionPartidoRespuestaDto,
} from '../dto/correccion-partido.dto.js';
import { MarcadorParamsDto } from '../dto/marcador.dto.js';
import { CorreccionPartidoService } from '../services/correccion-partido.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@ApiParam({
  name: 'partidoId',
  schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
})
@ApiBadRequestResponse({ description: 'Identificador o datos inválidos.' })
@ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
@ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
@ApiNotFoundResponse({ description: 'El partido no existe.' })
@Roles('ORGANIZADOR')
@Controller('partidos/:partidoId/correccion-oficial')
export class CorreccionPartidoController {
  constructor(private readonly correcciones: CorreccionPartidoService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Consulta las correcciones del partido, de la más reciente a la más antigua',
  })
  @ApiOkResponse({ type: [BitacoraCorreccionDto] })
  consultar(
    @Param() { partidoId }: MarcadorParamsDto,
  ): Promise<BitacoraCorreccionDto[]> {
    return this.correcciones.consultar(partidoId);
  }

  @Patch()
  @ApiOperation({
    summary: 'Corrige el marcador o las estadísticas de un partido finalizado',
    description:
      'Envía el marcador completo, estadísticas de al menos un jugador o ambos bloques.',
  })
  @ApiBody({ type: AplicarCorreccionDto })
  @ApiOkResponse({ type: CorreccionPartidoRespuestaDto })
  @ApiConflictResponse({
    description: 'Solo se puede corregir un partido Finalizado.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'jugadorId sin inscripción en un equipo del partido en la temporada.',
  })
  aplicar(
    @Param() { partidoId }: MarcadorParamsDto,
    @Body() cuerpo: AplicarCorreccionDto,
    @CurrentUser() usuario: User,
  ): Promise<CorreccionPartidoRespuestaDto> {
    if (cuerpo?.golesLocal === undefined && !cuerpo?.estadisticas?.length) {
      throw new BadRequestException(
        'Envía el marcador o las estadísticas por jugador.',
      );
    }
    return this.correcciones.aplicar(partidoId, cuerpo, usuario.id);
  }
}
