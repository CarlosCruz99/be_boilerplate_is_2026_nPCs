import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
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
import type { Request } from 'express';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  AvisoDto,
  AvisoParamsDto,
  AvisosQueryDto,
  ConteoAvisosDto,
  LecturaAvisoDto,
  PaginaAvisosDto,
  SinParametrosAvisoDto,
} from '../dto/consulta-avisos.dto.js';
import { ConsultaAvisosService } from '../services/consulta-avisos.service.js';

@ApiTags('avisos')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'Identificador, paginación o parámetros inválidos.',
})
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@ApiForbiddenResponse({ description: 'La cuenta no puede acceder al recurso.' })
@Roles('JUGADOR')
@Controller('avisos')
export class AvisosController {
  constructor(private readonly avisos: ConsultaAvisosService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Lista los avisos propios del más reciente al más antiguo',
  })
  @ApiOkResponse({ type: PaginaAvisosDto })
  listar(
    @CurrentUser() usuario: User,
    @Query() query: AvisosQueryDto,
  ): Promise<PaginaAvisosDto> {
    return this.avisos.listar(usuario.id, query);
  }

  @Get('no-leidos/conteo')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Cuenta los avisos propios sin leer' })
  @ApiOkResponse({ type: ConteoAvisosDto })
  contar(
    @CurrentUser() usuario: User,
    @Query() _query: SinParametrosAvisoDto,
  ): Promise<ConteoAvisosDto> {
    return this.avisos.contarNoLeidos(usuario.id);
  }

  @Get(':avisoId')
  @Header('Cache-Control', 'private, no-store')
  @ApiParam({ name: 'avisoId', schema: { type: 'integer', minimum: 1 } })
  @ApiOperation({ summary: 'Consulta un aviso propio sin marcarlo como leído' })
  @ApiOkResponse({ type: AvisoDto })
  @ApiNotFoundResponse({ description: 'El aviso no existe.' })
  detalle(
    @CurrentUser() usuario: User,
    @Param() { avisoId }: AvisoParamsDto,
    @Query() _query: SinParametrosAvisoDto,
  ): Promise<AvisoDto> {
    return this.avisos.detalle(usuario.id, avisoId);
  }

  @Patch(':avisoId/leido')
  @Header('Cache-Control', 'private, no-store')
  @ApiParam({ name: 'avisoId', schema: { type: 'integer', minimum: 1 } })
  @ApiOperation({
    summary: 'Marca un aviso propio como leído',
    description:
      'Solo recibe el ID de la ruta y conserva la fecha de la primera lectura.',
  })
  @ApiOkResponse({ type: LecturaAvisoDto })
  @ApiNotFoundResponse({ description: 'El aviso no existe.' })
  marcarLeido(
    @CurrentUser() usuario: User,
    @Param() { avisoId }: AvisoParamsDto,
    @Query() _query: SinParametrosAvisoDto,
    @Req() request: Request,
  ): Promise<LecturaAvisoDto> {
    const cuerpo: unknown = request.body;
    if (
      cuerpo !== undefined &&
      (cuerpo === null ||
        typeof cuerpo !== 'object' ||
        Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length > 0)
    ) {
      throw new BadRequestException('Campo no permitido.');
    }
    return this.avisos.marcarLeido(usuario.id, avisoId);
  }
}
