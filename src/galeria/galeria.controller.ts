import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import type { Request } from 'express';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';
import { GaleriaService } from './galeria.service.js';

class GaleriaParamsDto {
  @IsUrlId()
  partidoId!: number;
}

@ApiTags('galería')
@ApiBearerAuth()
@Roles('ORGANIZADOR')
@Controller('partidos/:partidoId/galeria')
export class GaleriaController {
  constructor(private readonly galeria: GaleriaService) {}

  @Post()
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
