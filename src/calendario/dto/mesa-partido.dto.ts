import { ApiProperty } from '@nestjs/swagger';
import { EstadoPartido } from '@PrismaClient';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';
import { ParticipantesRespuestaDto } from './participantes.dto.js';

export class MesaPartidoParamsDto {
  @IsUrlId()
  partidoId!: number;
}

export class EquipoMesaDto {
  @ApiProperty({ type: 'integer' })
  id!: number;

  @ApiProperty()
  nombre!: string;
}

export class MesaPartidoRespuestaDto {
  @ApiProperty({ type: 'integer' })
  partidoId!: number;

  @ApiProperty({ enum: EstadoPartido })
  estado!: EstadoPartido;

  @ApiProperty({ type: EquipoMesaDto })
  local!: EquipoMesaDto;

  @ApiProperty({ type: EquipoMesaDto })
  visitante!: EquipoMesaDto;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  golesLocal!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  golesVisitante!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  faltasLocal!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 99 })
  faltasVisitante!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  inicioReal!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finReal!: string | null;

  @ApiProperty({ type: ParticipantesRespuestaDto })
  participantes!: ParticipantesRespuestaDto;
}
