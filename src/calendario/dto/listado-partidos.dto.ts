import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, Max, ValidateIf } from 'class-validator';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class ListadoPartidosQueryDto {
  @ApiPropertyOptional({ enum: ['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'] })
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsIn(['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'])
  estado?: 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO';
  @ApiPropertyOptional({ minimum: 1 })
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsUrlId()
  equipoId?: number;
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsUrlId() page: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsUrlId()
  @Max(50)
  pageSize: number = 20;
}
export class EquipoMarcadorResumenDto {
  @ApiProperty({ type: 'integer' }) id!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'null para PROGRAMADO.',
  })
  goles!: number | null;
}
export class PartidoListadoDto {
  @ApiProperty({ type: 'integer' }) id!: number;
  @ApiProperty({ type: 'integer' }) jornada!: number;
  @ApiProperty({ format: 'date-time' }) inicio!: string;
  @ApiProperty({ enum: ['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'] })
  estado!: string;
  @ApiProperty({ type: EquipoMarcadorResumenDto })
  local!: EquipoMarcadorResumenDto;
  @ApiProperty({ type: EquipoMarcadorResumenDto })
  visitante!: EquipoMarcadorResumenDto;
}
export class ListadoPartidosRespuestaDto {
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: 'integer' }) page!: number;
  @ApiProperty({ type: 'integer' }) pageSize!: number;
  @ApiProperty({ type: [PartidoListadoDto] }) partidos!: PartidoListadoDto[];
}
