import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class MarcadorParamsDto {
  @IsUrlId()
  partidoId!: number;
}

export class ActualizarMarcadorDto {
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  @IsInt()
  @Min(0)
  @Max(99)
  golesLocal!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  @IsInt()
  @Min(0)
  @Max(99)
  golesVisitante!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  @IsInt()
  @Min(0)
  @Max(99)
  faltasLocal!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  @IsInt()
  @Min(0)
  @Max(99)
  faltasVisitante!: number;
}

export class MarcadorRespuestaDto {
  @ApiProperty({ type: 'integer' })
  partidoId!: number;
  @ApiProperty({ enum: ['EN_CURSO'] })
  estado!: 'EN_CURSO';
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  golesLocal!: number;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  golesVisitante!: number;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  faltasLocal!: number;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  faltasVisitante!: number;
  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: string;
}
