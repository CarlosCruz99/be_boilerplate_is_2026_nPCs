import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  ListadoPartidosQueryDto,
  ListadoPartidosRespuestaDto,
} from '../dto/listado-partidos.dto.js';
import { ListadoPartidosService } from '../services/listado-partidos.service.js';

@ApiTags('partidos')
@Controller('partidos')
export class ListadoPartidosController {
  constructor(private readonly partidos: ListadoPartidosService) {}
  @Get()
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Lista partidos públicamente con filtros y paginación',
    security: [{}, { bearer: [] }],
    description:
      'No requiere sesión. Solo un organizador activo con token válido ve jornadas BORRADOR. Token inválido se trata como acceso anónimo según el guard público existente. Excluye CANCELADO. Orden inicio DESC, id DESC. PROGRAMADO muestra goles null. Un equipo inexistente da lista vacía. Total y filas comparten snapshot. Parámetros desconocidos o fuera de rango: 400.',
  })
  @ApiOkResponse({ type: ListadoPartidosRespuestaDto })
  @ApiBadRequestResponse({ description: 'Filtros o paginación inválidos.' })
  listar(
    @Query() query: ListadoPartidosQueryDto,
    @CurrentUser() usuario: User | undefined,
  ): Promise<ListadoPartidosRespuestaDto> {
    return this.partidos.listar(query, usuario);
  }
}
