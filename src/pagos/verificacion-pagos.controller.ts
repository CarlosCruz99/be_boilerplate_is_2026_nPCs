import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  BandejaPagosDto,
  PendientesQueryDto,
  RevisionPagoDto,
  RevisionPagoParamsDto,
  VerificacionPagoDto,
  VerificarPagoDto,
} from './verificacion-pago.dto.js';
import { VerificacionPagosService } from './verificacion-pagos.service.js';

@ApiTags('pagos')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@ApiBadRequestResponse({
  description: 'Datos, identificador o paginación inválidos.',
})
@ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
@ApiForbiddenResponse({ description: 'No tienes permiso para esta acción.' })
@ApiNotFoundResponse({ description: 'Pago o comprobante inexistente.' })
@ApiInternalServerErrorResponse({
  description: 'Fallo real de consulta, almacenamiento o transacción.',
})
@Controller('pagos')
export class VerificacionPagosController {
  constructor(private readonly verificacion: VerificacionPagosService) {}

  @Get('pendientes')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Lista pagos pendientes de todas las temporadas',
    description:
      'Solo ORGANIZADOR. Orden creadoEn ASC, id ASC (más antiguos primero). Página predeterminada 1, tamaño 20, máximo 50. Total y página comparten instantánea; un resultado vacío válido no oculta errores.',
  })
  @ApiOkResponse({ type: BandejaPagosDto })
  pendientes(@Query() query: PendientesQueryDto) {
    return this.verificacion.pendientes(query);
  }

  @Get(':id/revision')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Consulta el detalle privado de un pago para revisión',
    description:
      'Disponible también después de resolverlo. Devuelve saldos actuales, auditoría, motivo y existencia real del archivo, sin claves de almacenamiento ni URL pública.',
  })
  @ApiOkResponse({ type: RevisionPagoDto })
  revision(@Param() { id }: RevisionPagoParamsDto) {
    return this.verificacion.revision(id);
  }

  @Get(':id/revision/comprobante')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Descarga el comprobante privado para revisión',
    description:
      'Solo ORGANIZADOR, incluso si el pago ya fue resuelto. El acceso del capitán continúa en la ruta separada de H14. Archivo ausente: 404; fallo de almacenamiento: 500.',
  })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'Archivo adjunto privado.',
    schema: { type: 'string', format: 'binary' },
  })
  comprobante(@Param() { id }: RevisionPagoParamsDto) {
    return this.verificacion.comprobante(id);
  }

  @Patch(':id/verificacion')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Verifica o rechaza un pago pendiente',
    description:
      'Solo ORGANIZADOR. Identidad obtenida de la sesión. RECHAZADO exige motivo de 20 a 500 caracteres tras recortar espacios; al VERIFICAR el motivo persistido queda null. Bloquea cuota antes de pago, revalida PENDIENTE y guarda estado, responsable y fecha atómicamente. Solo una decisión concurrente tiene éxito. Verificar reduce saldo; rechazar libera disponible. No envía avisos adicionales, no modifica monto ni cuota. Verificar requiere archivo existente; rechazar no.',
  })
  @ApiOkResponse({ type: VerificacionPagoDto })
  @ApiConflictResponse({ description: 'El pago ya fue resuelto.' })
  @ApiUnprocessableEntityResponse({
    description: 'Comprobante ausente al verificar; se conserva PENDIENTE.',
  })
  resolver(
    @Param() { id }: RevisionPagoParamsDto,
    @Body() dto: VerificarPagoDto,
    @CurrentUser() usuario: User,
  ) {
    return this.verificacion.resolver(id, dto, usuario.id);
  }
}
