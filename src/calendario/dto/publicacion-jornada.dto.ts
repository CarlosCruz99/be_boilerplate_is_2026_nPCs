import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class PublicarJornadaParamsDto {
  @IsUrlId()
  id!: number;
}

export class JornadaPublicadaDto {
  @ApiProperty()
  id!: number;
  @ApiProperty({ enum: ['PUBLICADA'] })
  estado!: 'PUBLICADA';
  @ApiProperty({ format: 'date-time' })
  publicadaEn!: string;
}
