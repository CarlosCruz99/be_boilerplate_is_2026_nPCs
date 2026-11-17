import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
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
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { ArbitroAsignado } from '../autorizacion/arbitro-asignado.decorator.js';
import {
  IniciarPartidoParamsDto,
  IniciarPartidoRespuestaDto,
} from '../dto/iniciar-partido.dto.js';
import { IniciarPartidoService } from '../services/iniciar-partido.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@Controller('partidos')
export class IniciarPartidoController {
  constructor(private readonly partidos: IniciarPartidoService) {}

  @Post(':partidoId/iniciar')
  @HttpCode(200)
  @ArbitroAsignado()
  @ApiOperation({
    summary: 'Inicia un partido PROGRAMADO',
    description:
      'Solo el árbitro asignado. Sin cuerpo; se acepta un objeto vacío. Guarda EN_CURSO, inicioReal del servidor y bitácora INICIAR atómicamente. No impone restricciones sobre la hora programada.',
  })
  @ApiParam({
    name: 'partidoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
  })
  @ApiOkResponse({ type: IniciarPartidoRespuestaDto })
  @ApiBadRequestResponse({
    description: 'Identificador inválido o cuerpo con datos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  @ApiConflictResponse({
    description: 'No se puede cambiar de “{estado actual}” a “En curso”.',
  })
  iniciar(
    @Param() { partidoId }: IniciarPartidoParamsDto,
    @CurrentUser() usuario: User,
    @Body() cuerpo: unknown,
  ): Promise<IniciarPartidoRespuestaDto> {
    if (
      cuerpo !== undefined &&
      (cuerpo === null ||
        typeof cuerpo !== 'object' ||
        Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length > 0)
    ) {
      throw new BadRequestException(
        'Esta acción no admite datos en el cuerpo.',
      );
    }
    return this.partidos.iniciar(partidoId, usuario);
  }
}
