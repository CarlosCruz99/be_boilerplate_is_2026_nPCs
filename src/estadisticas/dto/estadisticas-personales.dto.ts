import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class TemporadaEstadisticasParamsDto {
  @IsUrlId()
  temporadaId!: number;
}

export class SinParametrosEstadisticasDto {}

export class AcumuladosEstadisticasDto {
  @ApiProperty({ type: 'integer', minimum: 0 })
  goles!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  asistencias!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  tarjetas!: number;
}

export class PartidoEstadisticaPersonalDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  partidoId!: number;

  @ApiProperty({ format: 'date-time' })
  fecha!: string;

  @ApiProperty({ type: String })
  rival!: string;

  @ApiProperty({ type: 'integer', minimum: 0 })
  goles!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  asistencias!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  tarjetas!: number;
}

export class MisEstadisticasDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  temporadaId!: number;

  @ApiProperty({ type: AcumuladosEstadisticasDto })
  acumulados!: AcumuladosEstadisticasDto;

  @ApiProperty({ type: [PartidoEstadisticaPersonalDto] })
  partidos!: PartidoEstadisticaPersonalDto[];
}
