import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  Header,
  HttpCode,
  Param,
  PayloadTooLargeException,
  Post,
  StreamableFile,
  UnsupportedMediaTypeException,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  AgregarJugadorDto,
  EquipoJugadorParamsDto,
  EquipoParamsDto,
  JugadorDto,
  SubirJugadorDto,
} from '../dto/jugador.dto.js';
import { FotosJugadorService } from '../services/fotos-jugador.service.js';
import { PlantillasService } from '../services/plantillas.service.js';

const MAX_FOTO_BYTES = 2 * 1024 * 1024;
const formatoFoto = new FileTypeValidator({
  fileType: /^image\/(jpeg|png)$/,
  overrideMimeType: true,
});

@ApiTags('jugadores')
@ApiBearerAuth()
@ApiParam({ name: 'equipoId', type: Number })
@ApiBadRequestResponse({ description: 'Datos inválidos o incompletos.' })
@ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
@ApiForbiddenResponse({ description: 'La cuenta no capitanea este equipo.' })
@ApiNotFoundResponse({ description: 'El equipo o el jugador no existe.' })
@Roles('JUGADOR')
@Controller('equipos/:equipoId/jugadores')
export class EquipoJugadoresController {
  constructor(private readonly plantillas: PlantillasService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('foto', {
      limits: {
        fileSize: MAX_FOTO_BYTES + 1,
        files: 1,
        fields: 3,
        fieldSize: 1024,
      },
    }),
  )
  @ApiOperation({ summary: 'Agrega una ficha de jugador al equipo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubirJugadorDto })
  @ApiCreatedResponse({ type: JugadorDto })
  @ApiConflictResponse({
    description: 'Jugador duplicado o datos distintos en una ficha existente.',
  })
  @ApiPayloadTooLargeResponse({ description: 'La foto supera los 2 MiB.' })
  @ApiUnsupportedMediaTypeResponse({
    description: 'El contenido de la foto no es JPG ni PNG.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Equipo no editable o sin cupo.',
  })
  async agregar(
    @CurrentUser() user: User,
    @Param() { equipoId }: EquipoParamsDto,
    @Body() dto: AgregarJugadorDto,
    @UploadedFile()
    archivo?: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<JugadorDto> {
    if (!archivo) throw new BadRequestException('La foto es obligatoria.');
    if (archivo.size > MAX_FOTO_BYTES) {
      throw new PayloadTooLargeException('La foto supera los 2 MiB.');
    }
    if (!(await formatoFoto.isValid(archivo))) {
      throw new UnsupportedMediaTypeException(
        'La foto debe ser un archivo JPG o PNG.',
      );
    }
    return this.plantillas.agregar(equipoId, user.id, dto, {
      buffer: archivo.buffer,
      extension: archivo.mimetype === 'image/png' ? 'png' : 'jpg',
    });
  }

  @Get()
  @ApiOperation({
    summary: 'Lista los jugadores del equipo que capitanea la cuenta',
  })
  @ApiOkResponse({ type: JugadorDto, isArray: true })
  listar(
    @CurrentUser() user: User,
    @Param() { equipoId }: EquipoParamsDto,
  ): Promise<JugadorDto[]> {
    return this.plantillas.listar(equipoId, user.id);
  }

  @Delete(':jugadorId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quita a un jugador de un equipo pendiente' })
  @ApiParam({ name: 'jugadorId', type: Number })
  @ApiNoContentResponse()
  @ApiUnprocessableEntityResponse({
    description: 'El equipo ya no puede modificarse.',
  })
  quitar(
    @CurrentUser() user: User,
    @Param() params: EquipoJugadorParamsDto,
  ): Promise<void> {
    return this.plantillas.quitar(params.equipoId, user.id, params.jugadorId);
  }
}

@ApiTags('jugadores')
@ApiBearerAuth()
@Controller('uploads/jugadores')
export class FotosJugadorController {
  constructor(private readonly fotos: FotosJugadorService) {}

  @Get(':archivo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary:
      'Descarga la foto de una ficha propia o de un equipo que se capitanea',
  })
  @ApiParam({ name: 'archivo', type: String, example: '120.jpg' })
  @ApiProduces('image/jpeg', 'image/png')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  @ApiNotFoundResponse({
    description: 'La foto no existe o la cuenta no tiene acceso.',
  })
  descargar(
    @CurrentUser() user: User,
    @Param('archivo') archivo: string,
  ): Promise<StreamableFile> {
    return this.fotos.descargar(archivo, user.id);
  }
}
