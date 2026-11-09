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
  JornadaPublicadaDto,
  PublicarJornadaParamsDto,
} from '../dto/publicacion-jornada.dto.js';
import { PublicacionJornadaService } from '../services/publicacion-jornada.service.js';

@ApiTags('jornadas')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('jornadas')
export class PublicacionJornadaController {
  constructor(private readonly publicacion: PublicacionJornadaService) {}

  @Post(':id/publicar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publica una jornada y crea un aviso por capitán',
    description:
      'Sin cuerpo. Excluye partidos CANCELADO. Publicación y avisos se confirman en una sola transacción. No admite republicar.',
  })
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: JornadaPublicadaDto })
  @ApiBadRequestResponse({
    description: 'Identificador inválido o cuerpo no vacío.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
  @ApiNotFoundResponse({ description: 'La jornada no existe.' })
  @ApiConflictResponse({ description: 'La jornada ya está publicada.' })
  @ApiUnprocessableEntityResponse({
    description: 'La jornada no tiene partidos no cancelados.',
  })
  publicar(
    @Param() { id }: PublicarJornadaParamsDto,
    @CurrentUser() usuario: User,
    @Body() cuerpo: unknown,
  ): Promise<JornadaPublicadaDto> {
    if (
      cuerpo !== undefined &&
      (cuerpo === null ||
        typeof cuerpo !== 'object' ||
        Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length !== 0)
    )
      throw new BadRequestException('La publicación no recibe cuerpo.');
    return this.publicacion.publicar(id, usuario.id);
  }
}
