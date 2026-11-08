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
  ApiExtraModels,
  getSchemaPath,
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
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  CrearEquipoDto,
  EquipoDto,
  MiEquipoDto,
  MiEquipoQueryDto,
} from '../dto/equipo.dto.js';
import {
  ListarEquiposQueryDto,
  ListadoEquiposDto,
  DetalleEquipoParamsDto,
  DetalleEquipoDto,
} from '../dto/consulta-equipos.dto.js';
import {
  ValidarEquipoDto,
  ValidacionEquipoRespuestaDto,
  RequisitosNoCumplidosDto,
  TemporadaCompletaDto,
} from '../dto/validacion-equipo.dto.js';
import { ValidacionEquiposService } from '../services/validacion-equipos.service.js';
import { EquiposService } from '../services/equipos.service.js';

@ApiTags('equipos')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Datos inválidos.' })
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
@Roles('JUGADOR')
@Controller('equipos')
export class EquiposController {
  constructor(
    private readonly equipos: EquiposService,
    private readonly validacion: ValidacionEquiposService,
  ) {}

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

  @Get()
  @Roles('ORGANIZADOR')
  @ApiOperation({
    summary: 'Lista equipos por temporada y estado para revisión',
  })
  @ApiOkResponse({ type: ListadoEquiposDto })
  listar(@Query() query: ListarEquiposQueryDto): Promise<ListadoEquiposDto> {
    return this.equipos.listar(query);
  }

  @Get(':id')
  @Roles('ORGANIZADOR')
  @ApiOperation({
    summary: 'Consulta un equipo y sus jugadores con edad calculada',
  })
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: DetalleEquipoDto })
  @ApiNotFoundResponse({ description: 'El equipo no existe.' })
  detalle(@Param() { id }: DetalleEquipoParamsDto): Promise<DetalleEquipoDto> {
    return this.equipos.detalle(id);
  }

  @Patch(':id/validacion')
  @Roles('ORGANIZADOR')
  @ApiOperation({
    summary: 'Aprueba o rechaza un equipo pendiente',
    description:
      'Aprobar requiere 7 jugadores de al menos 16 años y cupo según maxEquipos de la temporada. Rechazar requiere un motivo de 20 a 500 caracteres.',
  })
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: ValidacionEquipoRespuestaDto })
  @ApiNotFoundResponse({ description: 'El equipo no existe.' })
  @ApiConflictResponse({ description: 'El equipo ya fue validado.' })
  @ApiExtraModels(RequisitosNoCumplidosDto, TemporadaCompletaDto)
  @ApiUnprocessableEntityResponse({
    description: 'Plantilla inválida o temporada completa.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(RequisitosNoCumplidosDto) },
        { $ref: getSchemaPath(TemporadaCompletaDto) },
      ],
    },
  })
  validar(
    @Param() { id }: DetalleEquipoParamsDto,
    @CurrentUser() user: User,
    @Body() dto: ValidarEquipoDto,
  ): Promise<ValidacionEquipoRespuestaDto> {
    return this.validacion.validar(id, user.id, dto);
  }
}
