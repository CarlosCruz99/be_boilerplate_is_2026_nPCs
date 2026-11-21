import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { DatosFichaDto } from '../dto/jugador.dto.js';
import { VinculacionDto } from '../dto/vinculacion.dto.js';
import { VinculacionService } from '../services/vinculacion.service.js';

@ApiTags('jugadores')
@ApiBearerAuth()
@Roles('JUGADOR')
@Controller('jugadores')
export class VinculacionController {
  constructor(private readonly fichas: VinculacionService) {}

  @Post('vincular')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Vincula una ficha de jugador con la cuenta autenticada',
  })
  @ApiOkResponse({ type: VinculacionDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
  @ApiNotFoundResponse({
    description: 'No encontramos una ficha con esos datos.',
  })
  @ApiConflictResponse({
    description: 'La ficha ya está vinculada o la cuenta ya tiene ficha.',
  })
  vincular(
    @CurrentUser() user: User,
    @Body() datos: DatosFichaDto,
  ): Promise<VinculacionDto> {
    return this.fichas.vincular(user.id, datos);
  }
}
