import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  CrearEquipoDto,
  EquipoDto,
  MiEquipoDto,
  MiEquipoQueryDto,
} from '../dto/equipo.dto.js';
import { EquiposService } from '../services/equipos.service.js';

@ApiTags('equipos')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Datos inválidos.' })
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
@Roles('JUGADOR')
@Controller('equipos')
export class EquiposController {
  constructor(private readonly equipos: EquiposService) {}

  @Post()
  @ApiOperation({ summary: 'Inscribe un equipo en una temporada abierta' })
  @ApiCreatedResponse({ type: EquipoDto })
  @ApiNotFoundResponse({ description: 'La temporada no existe.' })
  @ApiConflictResponse({
    description: 'El nombre o la cuenta ya tienen equipo en esta temporada.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'La inscripción está cerrada.',
  })
  crear(
    @CurrentUser() user: User,
    @Body() dto: CrearEquipoDto,
  ): Promise<EquipoDto> {
    return this.equipos.crear(user.id, dto);
  }

  @Get('mi-equipo')
  @ApiOperation({
    summary: 'Consulta el equipo que capitanea la cuenta en una temporada',
  })
  @ApiOkResponse({ type: MiEquipoDto })
  @ApiNotFoundResponse({
    description: 'La cuenta no capitanea un equipo en esa temporada.',
  })
  miEquipo(
    @CurrentUser() user: User,
    @Query() query: MiEquipoQueryDto,
  ): Promise<MiEquipoDto> {
    return this.equipos.miEquipo(user.id, query.temporadaId);
  }
}
