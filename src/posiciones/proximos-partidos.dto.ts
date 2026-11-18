import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';
export class ProximosPartidosParamsDto {
  @IsUrlId() equipoId!: number;
}
export class RivalProximoDto {
  @ApiProperty({ type: 'integer' }) equipoId!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ type: 'integer', nullable: true }) lugar!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) puntos!: number | null;
}
export class ProximoPartidoDto {
  @ApiProperty({ type: 'integer' }) partidoId!: number;
  @ApiProperty({ format: 'date-time' }) fechaHora!: string;
  @ApiProperty({ type: RivalProximoDto }) rival!: RivalProximoDto;
}
export class ProximosPartidosRespuestaDto {
  @ApiProperty({ type: 'integer' }) equipoId!: number;
  @ApiProperty({ type: [ProximoPartidoDto] }) proximos!: ProximoPartidoDto[];
}
