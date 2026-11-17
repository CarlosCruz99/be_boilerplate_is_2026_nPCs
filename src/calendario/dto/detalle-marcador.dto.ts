import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class DetalleMarcadorParamsDto {
  @IsUrlId() partidoId!: number;
}
export class ParticipanteMarcadorDto {
  @ApiProperty({ type: 'integer' }) id!: number;
  @ApiProperty() nombre!: string;
}
export class EquipoDetalleMarcadorDto {
  @ApiProperty({ type: 'integer' }) equipoId!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ type: 'integer' }) goles!: number;
  @ApiProperty({ type: 'integer' }) faltas!: number;
  @ApiProperty({ type: [ParticipanteMarcadorDto] })
  jugadores!: ParticipanteMarcadorDto[];
}
export class GoleadorMarcadorDto {
  @ApiProperty({ type: 'integer' }) jugadorId!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ type: 'integer' }) equipoId!: number;
  @ApiProperty({ type: 'integer', minimum: 1 }) goles!: number;
}
export class DetalleMarcadorRespuestaDto {
  @ApiProperty({ type: 'integer' }) partidoId!: number;
  @ApiProperty({ enum: ['EN_CURSO', 'FINALIZADO'] }) estado!: string;
  @ApiProperty({ type: EquipoDetalleMarcadorDto })
  local!: EquipoDetalleMarcadorDto;
  @ApiProperty({ type: EquipoDetalleMarcadorDto })
  visitante!: EquipoDetalleMarcadorDto;
  @ApiProperty({ type: [GoleadorMarcadorDto] })
  goleadores!: GoleadorMarcadorDto[];
  @ApiProperty({ type: 'integer', minimum: 0 }) duracionMinutos!: number;
}
