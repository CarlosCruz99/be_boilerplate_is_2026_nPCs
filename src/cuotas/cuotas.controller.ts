import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { CrearCuotaDto, CuotaRespuestaDto } from './cuota.dto.js';
import { CuotasService } from './cuotas.service.js';

@ApiTags('cuotas')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('cuotas')
export class CuotasController {
  constructor(private readonly cuotas: CuotasService) {}
  @Post()
  @ApiOperation({
    summary: 'Registra una cuota de inscripción o arbitraje',
    description:
      'Solo organizador. Fecha no anterior a hoy en El Salvador. Partido obligatorio solo para arbitraje y no cancelado. Si falla el aviso, devuelve 201 conservando la cuota y agrega advertencia; no repetir el registro.',
  })
  @ApiCreatedResponse({ type: CuotaRespuestaDto })
  @ApiBadRequestResponse({
    description:
      'Campos o formatos inválidos, monto fuera de rango o fecha anterior a hoy.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
  @ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
  @ApiNotFoundResponse({
    description: 'Temporada, equipo o partido inexistente.',
  })
  @ApiConflictResponse({ description: 'Cuota duplicada.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Equipo no inscrito en la temporada o partido incompatible/cancelado.',
  })
  crear(
    @Body() dto: CrearCuotaDto,
    @CurrentUser() usuario: User,
  ): Promise<CuotaRespuestaDto> {
    return this.cuotas.crear(dto, usuario.id);
  }
}
