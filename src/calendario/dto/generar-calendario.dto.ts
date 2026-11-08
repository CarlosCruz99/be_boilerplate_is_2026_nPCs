import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class GenerarCalendarioDto {
  @ApiProperty({
    format: 'date',
    example: '2027-02-13',
    description: 'Fecha posterior a hoy en El Salvador, en formato YYYY-MM-DD.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  fechaPrimeraJornada!: string;

  @ApiProperty({
    example: '08:00',
    description: 'Hora local de El Salvador, formato HH:mm de 24 horas.',
  })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  horaPrimerTurno!: string;

  @ApiProperty({
    type: [Number],
    minItems: 1,
    uniqueItems: true,
    description:
      'Canchas activas, sin duplicados. Se conserva el orden indicado.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  canchaIds!: number[];

  @ApiPropertyOptional({
    type: [String],
    minItems: 1,
    uniqueItems: true,
    description:
      'UUID de árbitros activos en orden de asignación. Si se omite, se usan todos los árbitros activos ordenados por id.',
    items: { type: 'string', format: 'uuid' },
  })
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((id: unknown) =>
          typeof id === 'string' ? id.toLowerCase() : id,
        )
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  arbitroIds?: string[];
}

export class CalendarioGeneradoDto {
  @ApiProperty()
  temporadaId!: number;
  @ApiProperty({ example: 11 })
  jornadas!: number;
  @ApiProperty({ example: 66 })
  partidos!: number;
  @ApiProperty({ enum: ['BORRADOR'] })
  estadoJornadas!: 'BORRADOR';
}
