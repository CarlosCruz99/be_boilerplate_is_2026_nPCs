import { ApiProperty } from '@nestjs/swagger';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';
export class PosicionEquipoParamsDto {
  @IsUrlId() equipoId!: number;
}
export class PosicionEquipoDto {
  @ApiProperty({ type: 'integer' }) lugar!: number;
  @ApiProperty({ type: 'integer' }) equipoId!: number;
  @ApiProperty() equipo!: string;
  @ApiProperty({ type: 'integer' }) pj!: number;
  @ApiProperty({ type: 'integer' }) pg!: number;
  @ApiProperty({ type: 'integer' }) pe!: number;
  @ApiProperty({ type: 'integer' }) pp!: number;
  @ApiProperty({ type: 'integer' }) gf!: number;
  @ApiProperty({ type: 'integer' }) gc!: number;
  @ApiProperty({ type: 'integer' }) dg!: number;
  @ApiProperty({ type: 'integer' }) puntos!: number;
}
export class TablaPosicionesDto {
  @ApiProperty({ type: 'integer' }) temporadaId!: number;
  @ApiProperty({ type: [PosicionEquipoDto] }) posiciones!: PosicionEquipoDto[];
}
