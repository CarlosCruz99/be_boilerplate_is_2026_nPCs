import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class TemporadasQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsIn(['true', 'false'])
  inscripcionAbierta?: 'true' | 'false';
}

export class TemporadaDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ format: 'date' })
  fechaInicio!: string;

  @ApiProperty({ format: 'date' })
  fechaFin!: string;

  @ApiProperty()
  actual!: boolean;

  @ApiProperty()
  inscripcionAbierta!: boolean;
}
