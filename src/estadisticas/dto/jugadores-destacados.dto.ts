import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export const METRICAS_DESTACADOS = ['goles', 'asistencias'] as const;
export type MetricaDestacados = (typeof METRICAS_DESTACADOS)[number];

export class TemporadaDestacadosParamsDto {
  @IsUrlId()
  temporadaId!: number;
}

export class JugadoresDestacadosQueryDto {
  @ApiProperty({ enum: METRICAS_DESTACADOS })
  @IsIn(METRICAS_DESTACADOS, {
    message: 'metrica debe ser goles o asistencias.',
  })
  metrica!: MetricaDestacados;
}

export class JugadorDestacadoDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  jugadorId!: number;

  @ApiProperty({ type: String })
  nombre!: string;

  @ApiProperty({ type: 'integer', minimum: 0 })
  total!: number;

  @ApiProperty({ type: 'integer', minimum: 1 })
  posicion!: number;
}

export class JugadoresDestacadosRespuestaDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  temporadaId!: number;

  @ApiProperty({ enum: METRICAS_DESTACADOS })
  metrica!: MetricaDestacados;

  @ApiProperty({ type: [JugadorDestacadoDto] })
  jugadores!: JugadorDestacadoDto[];
}
