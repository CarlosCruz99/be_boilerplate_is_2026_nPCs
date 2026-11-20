import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoContenidoGaleria } from '@PrismaClient';
import { Equals, IsUUID } from 'class-validator';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';

export const elementosPorPagina = 6;
export const tiposArchivoGaleria = [
  'image/jpeg',
  'image/png',
  'video/mp4',
] as const;

export class GaleriaParamsDto {
  @IsUrlId()
  partidoId!: number;
}

export class ArchivoGaleriaParamsDto extends GaleriaParamsDto {
  @IsUUID()
  contenidoId!: string;
}

export class GaleriaQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @IsUrlId()
  page = 1;

  @ApiPropertyOptional({
    type: 'integer',
    enum: [elementosPorPagina],
    default: elementosPorPagina,
  })
  @IsUrlId()
  @Equals(elementosPorPagina, { message: 'pageSize debe ser 6.' })
  pageSize = elementosPorPagina;
}

class ContenidoGaleriaDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TipoContenidoGaleria })
  tipo!: TipoContenidoGaleria;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: string;

  @ApiProperty({ enum: tiposArchivoGaleria })
  mimeType!: string;

  @ApiProperty({
    description: 'Ruta relativa del archivo. Requiere Bearer JWT.',
  })
  url!: string;
}

export class PaginaGaleriaDto {
  @ApiProperty({ type: [ContenidoGaleriaDto] })
  items!: ContenidoGaleriaDto[];

  @ApiProperty({ type: 'integer', minimum: 1 })
  page!: number;

  @ApiProperty({ type: 'integer', enum: [elementosPorPagina] })
  pageSize!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  totalElementos!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  totalPaginas!: number;
}
