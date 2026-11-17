import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AsignarArbitroDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  arbitroId!: string;
}

export class ArbitroAsignadoRespuestaDto {
  @ApiProperty({ type: 'integer' }) partidoId!: number;
  @ApiProperty({ format: 'uuid' }) arbitroId!: string;
  @ApiProperty() arbitroNombre!: string;
}
export class ArbitroDisponibleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
}
export class ArbitrosDisponiblesRespuestaDto {
  @ApiProperty({ type: 'integer' }) partidoId!: number;
  @ApiProperty({ type: [ArbitroDisponibleDto] })
  arbitros!: ArbitroDisponibleDto[];
}
