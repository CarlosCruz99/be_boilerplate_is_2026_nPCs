import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  ComprobanteParamsDto,
  HistorialPagosDto,
  HistorialParamsDto,
  HistorialQueryDto,
} from './historial-pagos.dto.js';
import { HistorialPagosService } from './historial-pagos.service.js';

@ApiTags('pagos')
@ApiBearerAuth()
@Roles('JUGADOR')
@Controller()
@ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
@ApiForbiddenResponse({
  description: 'Solo el capitán del equipo puede acceder.',
})
@ApiBadRequestResponse({ description: 'Identificadores o filtros inválidos.' })
@ApiNotFoundResponse({ description: 'Recurso o comprobante inexistente.' })
@ApiInternalServerErrorResponse({
  description:
    'Error de consulta o almacenamiento; no se sustituye por una lista vacía.',
})
export class HistorialPagosController {
  constructor(private readonly historial: HistorialPagosService) {}
  private validarCuerpo(cuerpo: unknown): void {
    if (
      cuerpo !== undefined &&
      (cuerpo === null ||
        typeof cuerpo !== 'object' ||
        Array.isArray(cuerpo) ||
        Object.keys(cuerpo).length > 0)
    )
      throw new BadRequestException(
        'La consulta no admite datos en el cuerpo.',
      );
  }
  @Get('equipos/:equipoId/pagos')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Consulta el historial completo del equipo representado',
    description:
      'Solo la cuenta JUGADOR que capitanea el equipo. Temporada obligatoria, concepto opcional. Orden fechaPago DESC, id DESC. Muestra todos los estados; cuatro totales exactos del mismo conjunto filtrado. tieneComprobante comprueba existencia real, sin devolver clave ni URL. Sin filtro concepto=null. Sin pagos: lista vacía y cuatro 0.00. La consulta no verifica ni modifica pagos.',
  })
  @ApiParam({ name: 'equipoId', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: HistorialPagosDto })
  @ApiUnprocessableEntityResponse({
    description: 'El equipo pertenece a otra temporada.',
  })
  consultar(
    @Param() { equipoId }: HistorialParamsDto,
    @Query() query: HistorialQueryDto,
    @CurrentUser() usuario: User,
    @Body() cuerpo: unknown,
  ) {
    this.validarCuerpo(cuerpo);
    return this.historial.consultar(equipoId, query, usuario);
  }
  @Get('pagos/:pagoId/comprobante')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Descarga privada del comprobante del equipo representado',
    description:
      'Revalida rol y capitanía actual. Transmite el archivo con MIME persistido y nombre pago-{id}; no expone clave interna ni URL permanente. Sin archivo: 404.',
  })
  @ApiParam({ name: 'pagoId', schema: { type: 'integer', minimum: 1 } })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'Archivo privado adjunto.',
    schema: { type: 'string', format: 'binary' },
  })
  descargar(
    @Param() { pagoId }: ComprobanteParamsDto,
    @CurrentUser() usuario: User,
    @Body() cuerpo: unknown,
  ) {
    this.validarCuerpo(cuerpo);
    return this.historial.descargar(pagoId, usuario);
  }
}
