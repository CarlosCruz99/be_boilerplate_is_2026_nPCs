import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import type { Response } from 'express';
import {
  EquipoCuotasParamsDto,
  EquipoCuotasQueryDto,
  PagoParamsDto,
  RegistrarPagoDto,
  PagoRespuestaDto,
  CuotasSaldoRespuestaDto,
} from './pago.dto.js';
import { MAX_COMPROBANTE, type Comprobante } from './comprobantes.service.js';
import { PagosService } from './pagos.service.js';

@ApiTags('pagos')
@ApiBearerAuth()
@Roles('JUGADOR')
@ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
@ApiForbiddenResponse({
  description: 'Solo el capitán del equipo puede acceder.',
})
@ApiBadRequestResponse({ description: 'Datos o identificadores inválidos.' })
@ApiNotFoundResponse({ description: 'Equipo o cuota inexistente.' })
@Controller()
export class PagosController {
  constructor(private readonly pagos: PagosService) {}
  @Get('equipos/:equipoId/cuotas')
  @ApiOperation({ summary: 'Consulta cuotas y saldos del equipo representado' })
  @ApiOkResponse({ type: CuotasSaldoRespuestaDto })
  listar(
    @Param() { equipoId }: EquipoCuotasParamsDto,
    @Query() { temporadaId }: EquipoCuotasQueryDto,
    @CurrentUser() usuario: User,
  ) {
    return this.pagos.listar(equipoId, temporadaId, usuario.id);
  }
  @Post('cuotas/:cuotaId/pagos')
  @UseInterceptors(
    FileInterceptor('comprobante', {
      limits: {
        fileSize: MAX_COMPROBANTE,
        files: 1,
        fields: 2,
        fieldSize: 1024,
      },
    }),
  )
  @ApiOperation({
    summary: 'Registra un pago pendiente con comprobante privado',
    description:
      'Idempotency-Key obligatoria. Mismo usuario, cuota, monto normalizado, fecha y bytes: 200 sin duplicar; contenido diferente: 409. Saldo y disponible actuales. Si falla el aviso se conserva el pago y se añade advertencia.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['monto', 'fechaPago', 'comprobante'],
      properties: {
        monto: { type: 'string', example: '60.00' },
        fechaPago: { type: 'string', format: 'date' },
        comprobante: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ type: PagoRespuestaDto })
  @ApiOkResponse({
    type: PagoRespuestaDto,
    description: 'Reintento del mismo pago.',
  })
  @ApiConflictResponse({
    description: 'Disponible insuficiente o clave con contenido distinto.',
  })
  @ApiPayloadTooLargeResponse({ description: 'Comprobante mayor a 5 MiB.' })
  @ApiUnsupportedMediaTypeResponse({
    description: 'Contenido diferente de PDF, JPEG o PNG.',
  })
  async registrar(
    @Param() { cuotaId }: PagoParamsDto,
    @Body() dto: RegistrarPagoDto,
    @UploadedFile() archivo: Comprobante | undefined,
    @Headers('idempotency-key') clave: string | undefined,
    @CurrentUser() usuario: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    const r = await this.pagos.registrar(
      cuotaId,
      dto,
      archivo,
      clave,
      usuario.id,
    );
    response.status(r.repetido ? 200 : 201);
    return r.respuesta;
  }
}
