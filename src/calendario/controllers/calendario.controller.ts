import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import {
  ArbitroRespuestaDto,
  CanchaRespuestaDto,
  CanchasQueryDto,
  CrearPartidoDto,
  EditarPartidoDto,
  PartidoParamsDto,
  PartidoRespuestaDto,
} from '../dto/partido.dto.js';
import { PartidosService } from '../services/partidos.service.js';

@ApiTags('partidos')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
@ApiBadRequestResponse({
  description:
    'Datos inválidos, inicio no futuro, cuerpo vacío o cancelación mezclada con otros cambios.',
})
@ApiNotFoundResponse({
  description: 'Temporada, equipo, cancha, árbitro o partido inexistente.',
})
@ApiConflictResponse({
  description: 'Cancha o árbitro ocupado, cruce repetido o partido EN_CURSO.',
})
@ApiUnprocessableEntityResponse({
  description:
    'Equipos iguales o no inscritos, partido semanal del equipo, cancha inactiva, árbitro no elegible o partido FINALIZADO/CANCELADO.',
})
@Controller('partidos')
export class PartidosController {
  constructor(private readonly partidos: PartidosService) {}

  @Post()
  @ApiOperation({
    summary: 'Agenda un partido de 90 minutos con árbitro',
    description:
      'Crea la jornada en BORRADOR si no existe. Solo un partido no cancelado por equipo y semana, lunes a domingo de El Salvador. El cliente no envía fin.',
  })
  @ApiCreatedResponse({ type: PartidoRespuestaDto })
  crear(@Body() dto: CrearPartidoDto): Promise<PartidoRespuestaDto> {
    return this.partidos.crear(dto);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiOperation({
    summary: 'Reprograma o cancela un partido',
    description:
      'Permite canchaId, arbitroId e inicio; para cancelar, enviar solo {"estado":"CANCELADO"}. No modifica equipos ni jornada. PROGRAMADO puede cancelarse aun si su inicio ya pasó. Avisos de cambios en jornadas publicadas pendientes de BE-15.1.',
  })
  @ApiOkResponse({ type: PartidoRespuestaDto })
  editar(
    @Param() { id }: PartidoParamsDto,
    @Body() dto: EditarPartidoDto,
  ): Promise<PartidoRespuestaDto> {
    return this.partidos.editar(id, dto);
  }
}

@ApiTags('arbitros')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
@Controller('arbitros')
export class ArbitrosController {
  constructor(private readonly partidos: PartidosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los árbitros elegibles para asignación' })
  @ApiOkResponse({ type: ArbitroRespuestaDto, isArray: true })
  listar(): Promise<ArbitroRespuestaDto[]> {
    return this.partidos.arbitros();
  }
}

@ApiTags('canchas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@ApiBadRequestResponse({ description: 'activa debe ser true o false.' })
@Controller('canchas')
export class CanchasController {
  constructor(private readonly partidos: PartidosService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista canchas con sesión y filtro opcional de actividad',
  })
  @ApiOkResponse({ type: CanchaRespuestaDto, isArray: true })
  listar(@Query() query: CanchasQueryDto): Promise<CanchaRespuestaDto[]> {
    return this.partidos.canchas(query.activa);
  }
}
