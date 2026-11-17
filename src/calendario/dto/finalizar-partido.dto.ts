import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class FinalizarPartidoParamsDto {
  @IsUrlId()
  partidoId!: number;
}
export class FinalizarPartidoRespuestaDto {
  @ApiProperty({ type: 'integer' }) partidoId!: number;
  @ApiProperty({ enum: ['FINALIZADO'] }) estado!: 'FINALIZADO';
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  golesLocal!: number;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  golesVisitante!: number;
  @ApiProperty({ type: String, format: 'date-time' }) finReal!: string;
}
