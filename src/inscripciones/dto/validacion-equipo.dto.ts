import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length, ValidateIf } from 'class-validator';
import { EstadoEquipo } from '@PrismaClient';

export enum DecisionEquipo {
  APROBAR = 'APROBAR',
  RECHAZAR = 'RECHAZAR',
}

export class ValidarEquipoDto {
  @ApiProperty({ enum: DecisionEquipo })
  @IsEnum(DecisionEquipo)
  decision!: DecisionEquipo;

  @ApiPropertyOptional({
    minLength: 20,
    maxLength: 500,
    description:
      'Obligatorio al RECHAZAR. Se recortan los espacios exteriores.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ValidarEquipoDto) =>
      dto.decision === DecisionEquipo.RECHAZAR || dto.motivo !== undefined,
  )
  @IsString()
  @Length(20, 500)
  motivo?: string;
}

export class ValidacionEquipoRespuestaDto {
  @ApiProperty()
  id!: number;
  @ApiProperty({ enum: EstadoEquipo })
  estado!: EstadoEquipo;
  @ApiProperty({ format: 'uuid' })
  validadoPor!: string;
  @ApiProperty({ format: 'date-time' })
  fechaValidacion!: string;
  @ApiProperty({ type: String, nullable: true })
  motivoRechazo!: string | null;
}

export class RequisitosNoCumplidosDto {
  @ApiProperty({
    example: 'REQUISITOS_NO_CUMPLIDOS',
    enum: ['REQUISITOS_NO_CUMPLIDOS'],
  })
  codigo!: string;
  @ApiProperty({
    type: [String],
    example: ['El equipo debe tener al menos 7 jugadores.'],
  })
  fallas!: string[];
}

export class TemporadaCompletaDto {
  @ApiProperty({ example: 'TEMPORADA_COMPLETA', enum: ['TEMPORADA_COMPLETA'] })
  codigo!: string;
  @ApiProperty({ example: 'La temporada está completa.' })
  mensaje!: string;
}
