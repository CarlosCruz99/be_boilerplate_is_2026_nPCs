import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class ParticipantesParamsDto {
  @IsUrlId()
  partidoId!: number;
}

export class RegistrarParticipantesDto {
  @ApiProperty({
    type: 'array',
    maxItems: 30,
    uniqueItems: true,
    items: { type: 'integer', minimum: 1, maximum: 2147483647 },
    description: 'Lista completa; [] elimina todos los participantes.',
  })
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  jugadorIds!: number[];
}

export class ParticipanteRespuestaDto {
  @ApiProperty({ type: 'integer' }) id!: number;
  @ApiProperty() nombre!: string;
}

export class ParticipantesRespuestaDto {
  @ApiProperty({ type: 'integer' }) partidoId!: number;
  @ApiProperty({ type: [ParticipanteRespuestaDto] })
  local!: ParticipanteRespuestaDto[];
  @ApiProperty({ type: [ParticipanteRespuestaDto] })
  visitante!: ParticipanteRespuestaDto[];
}
