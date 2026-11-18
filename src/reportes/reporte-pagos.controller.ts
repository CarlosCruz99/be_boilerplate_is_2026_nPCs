import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { ReportePagosDto, ReportePagosQueryDto } from './reporte-pagos.dto.js';
import { ReportePagosService } from './reporte-pagos.service.js';

@ApiTags('reportes')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('reportes')
export class ReportePagosController {
  constructor(private readonly reporte: ReportePagosService) {}

  @Get('pagos')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Consulta el estado de pagos de los equipos inscritos',
    description:
      'Temporada obligatoria. Solo ORGANIZADOR. Consulta en vivo la vista DB-21.1; pagado incluye únicamente VERIFICADO. MOROSO > CON_SALDO > PAGADO > SIN_CUOTAS, por nombre dentro del grupo. El concepto determina los montos y el estado; equipos sin cuotas del concepto permanecen con ceros y SIN_CUOTAS. Totales exactos de los equipos después de filtrar por estado. Vencimientos según America/El_Salvador; vence hoy todavía no es moroso. Sin paginación ni escrituras. Una lista vacía válida devuelve totales 0.00; los fallos reales devuelven 500.',
  })
  @ApiOkResponse({ type: ReportePagosDto })
  @ApiBadRequestResponse({ description: 'Temporada o filtros inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
  @ApiForbiddenResponse({ description: 'Acceso exclusivo para organizadores.' })
  @ApiNotFoundResponse({ description: 'Temporada inexistente.' })
  @ApiInternalServerErrorResponse({
    description:
      'Error al consultar el reporte; no se devuelven ceros ficticios.',
  })
  consultar(@Query() query: ReportePagosQueryDto) {
    return this.reporte.consultar(query);
  }
}
