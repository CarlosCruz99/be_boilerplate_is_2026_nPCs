import { ApiProperty } from '@nestjs/swagger';
import { EstadoJornada } from '@PrismaClient';
import { PartidoRespuestaDto, ArbitroRespuestaDto } from './partido.dto.js';
import {
  CanchaCalendarioDto,
  EquipoCalendarioDto,
} from './consulta-calendario.dto.js';

export class PartidoOrganizadorDto extends PartidoRespuestaDto {
  @ApiProperty({ type: EquipoCalendarioDto })
  local!: EquipoCalendarioDto;
  @ApiProperty({ type: EquipoCalendarioDto })
  visitante!: EquipoCalendarioDto;
  @ApiProperty({ type: CanchaCalendarioDto })
  cancha!: CanchaCalendarioDto;
  @ApiProperty({ type: ArbitroRespuestaDto })
  arbitro!: ArbitroRespuestaDto;
}
export class JornadaOrganizadorDto {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  numero!: number;
  @ApiProperty({ enum: EstadoJornada })
  estado!: EstadoJornada;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  publicadaEn!: string | null;
  @ApiProperty({ type: [PartidoOrganizadorDto] })
  partidos!: PartidoOrganizadorDto[];
}
export class CalendarioOrganizadorDto {
  @ApiProperty()
  temporadaId!: number;
  @ApiProperty({ type: [JornadaOrganizadorDto] })
  jornadas!: JornadaOrganizadorDto[];
}
