import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import type { Request, Response } from 'express';
import {
  ArchivoGaleriaParamsDto,
  GaleriaParamsDto,
  GaleriaQueryDto,
  PaginaGaleriaDto,
  tiposArchivoGaleria,
} from './consulta-galeria.dto.js';
import { ConsultaGaleriaService } from './consulta-galeria.service.js';
import { GaleriaService } from './galeria.service.js';

const archivoBinario = { type: 'string', format: 'binary' } as const;

@ApiTags('galería')
@ApiBearerAuth()
@Controller('partidos/:partidoId/galeria')
export class GaleriaController {
  constructor(
    private readonly galeria: GaleriaService,
    private readonly consulta: ConsultaGaleriaService,
  ) {}

  @Get()
  @Roles('ORGANIZADOR', 'JUGADOR')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Consulta los elementos activos de la galería, seis por página',
  })
  @ApiParam({ name: 'partidoId', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: PaginaGaleriaDto })
  @ApiBadRequestResponse({
    description: 'Identificador o paginación inválida.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
  @ApiForbiddenResponse({
    description: 'La cuenta no tiene acceso a la galería del partido.',
  })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  listar(
    @Param() { partidoId }: GaleriaParamsDto,
    @Query() { page }: GaleriaQueryDto,
    @CurrentUser() usuario: User,
  ): Promise<PaginaGaleriaDto> {
    return this.consulta.listar(partidoId, page, usuario);
  }

  @Get(':contenidoId/archivo')
  @Roles('ORGANIZADOR', 'JUGADOR')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary:
      'Abre un archivo privado de galería con soporte de rangos de bytes',
  })
  @ApiParam({ name: 'partidoId', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'contenidoId', schema: { type: 'string', format: 'uuid' } })
  @ApiProduces(...tiposArchivoGaleria)
  @ApiOkResponse({ schema: archivoBinario })
  @ApiResponse({
    status: 206,
    schema: archivoBinario,
    description: 'Rango de bytes solicitado.',
  })
  @ApiResponse({ status: 416, description: 'Rango fuera del archivo.' })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
  @ApiForbiddenResponse({
    description: 'La cuenta no tiene acceso a la galería del partido.',
  })
  @ApiNotFoundResponse({
    description: 'El partido o el archivo de la galería no existe.',
  })
  async archivo(
    @Param() { partidoId, contenidoId }: ArchivoGaleriaParamsDto,
    @CurrentUser() usuario: User,
    @Res() respuesta: Response,
  ): Promise<void> {
    const { ruta, mimeType } = await this.consulta.archivo(
      partidoId,
      contenidoId,
      usuario,
    );
    // Express lee por streaming y resuelve Range y HEAD sobre el archivo real.
    return new Promise<void>((resolver, rechazar) => {
      respuesta.sendFile(
        ruta,
        {
          cacheControl: false,
          lastModified: false,
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': 'inline',
          },
        },
        (error) => {
          if (!error || respuesta.destroyed) return resolver();
          if (respuesta.headersSent) {
            respuesta.destroy();
            return resolver();
          }
          respuesta.removeHeader('Content-Type');
          respuesta.removeHeader('Content-Disposition');
          respuesta.removeHeader('Content-Length');
          if (
            'statusCode' in error &&
            error.statusCode === HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE
          ) {
            return rechazar(
              new HttpException(
                'El rango solicitado está fuera del archivo.',
                HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
              ),
            );
          }
          if ('code' in error && error.code === 'ENOENT') {
            return rechazar(
              new NotFoundException('El archivo de la galería no existe.'),
            );
          }
          rechazar(
            new InternalServerErrorException(
              'No se pudo abrir el archivo de la galería.',
            ),
          );
        },
      );
    });
  }

  @Post()
  @Roles('ORGANIZADOR')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Publica fotos y videos de un partido con un resultado por archivo',
  })
  @ApiParam({ name: 'partidoId', schema: { type: 'integer', minimum: 1 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['archivos[]'],
      properties: {
        'archivos[]': {
          type: 'array',
          maxItems: 30,
          items: { type: 'string', format: 'binary' },
        },
        descripcion: { type: 'string', maxLength: 200 },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Resultado por archivo. Un lote puede incluir publicaciones y errores.',
    schema: {
      example: {
        partidoId: 12,
        totalActivos: 1,
        limite: 30,
        resultados: [
          {
            nombre: 'gol.png',
            estado: 'PUBLICADO',
            contenidoId: 'd2cadb13-7d40-4e59-a08b-314e429a0494',
          },
          {
            nombre: 'acta.pdf',
            estado: 'ERROR',
            motivo: 'Formato no permitido. Usa JPG, PNG o MP4.',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Identificador o solicitud multipart inválida.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida.' })
  @ApiForbiddenResponse({ description: 'Solo un organizador puede publicar.' })
  @ApiNotFoundResponse({ description: 'El partido no existe.' })
  subir(
    @Param() { partidoId }: GaleriaParamsDto,
    @CurrentUser() organizador: User,
    @Req() req: Request,
  ) {
    return this.galeria.subir(partidoId, organizador.id, req);
  }
}
