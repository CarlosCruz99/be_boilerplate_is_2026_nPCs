import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';
import {
  ArbitroRespuestaDto,
  CanchaRespuestaDto,
  PartidoRespuestaDto,
} from './partido.dto.js';

export class EquipoCalendarioParamsDto {
  @IsUrlId()
  equipoId!: number;
}

export class EquipoCalendarioDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  nombre!: string;
}

export class CanchaCalendarioDto extends PickType(CanchaRespuestaDto, [
  'id',
  'nombre',
  'direccion',
] as const) {}

class DatosPartidoCalendarioDto extends PickType(PartidoRespuestaDto, [
  'id',
  'jornada',
  'inicio',
  'fin',
  'estado',
] as const) {
  @ApiProperty({ type: CanchaCalendarioDto })
  cancha!: CanchaCalendarioDto;

  @ApiProperty({ type: ArbitroRespuestaDto })
  arbitro!: ArbitroRespuestaDto;
}

export class PartidoDelEquipoDto extends DatosPartidoCalendarioDto {
  @ApiProperty({ type: EquipoCalendarioDto })
  rival!: EquipoCalendarioDto;

  @ApiProperty({ enum: ['LOCAL', 'VISITANTE'] })
  condicion!: 'LOCAL' | 'VISITANTE';
}

export class CalendarioDelEquipoDto {
  @ApiProperty()
  equipoId!: number;

  @ApiProperty({
    description: 'Cantidad de partidos visibles después de filtrar.',
  })
  total!: number;

  @ApiProperty({ type: [PartidoDelEquipoDto] })
  partidos!: PartidoDelEquipoDto[];
}

export class DetallePartidoCalendarioDto extends DatosPartidoCalendarioDto {
  @ApiProperty({ type: EquipoCalendarioDto })
  local!: EquipoCalendarioDto;

  @ApiProperty({ type: EquipoCalendarioDto })
  visitante!: EquipoCalendarioDto;
}
