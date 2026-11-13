import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class IniciarPartidoParamsDto {
  @IsUrlId()
  partidoId!: number;
}

export class IniciarPartidoRespuestaDto {
  @ApiProperty({ type: 'integer' })
  partidoId!: number;
  @ApiProperty({ enum: ['EN_CURSO'] })
  estado!: 'EN_CURSO';
  @ApiProperty({ type: String, format: 'date-time' })
  inicioReal!: string;
}
