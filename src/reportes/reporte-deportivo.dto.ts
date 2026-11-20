import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';

export class TemporadaReporteDeportivoParamsDto {
  @IsUrlId()
  temporadaId!: number;
}

export class SinParametrosReporteDeportivoDto {}

export class ReporteDeportivoDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  temporadaId!: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 2 })
  totalPartidos!: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 3 })
  totalGoles!: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 4 })
  totalTarjetas!: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 3 })
  totalAsistencias!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-04T18:00:00.000Z',
  })
  generadoEn!: string;
}
