import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Prisma } from '@PrismaClient';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  Length,
  Max,
  Min,
  NotContains,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsId } from '../../inscripciones/dto/id.decorator.js';
import { RegistroEstadisticaDto } from './estadisticas-partido.dto.js';

const maximoEntero = 2_147_483_647;
const cantidad = {
  type: 'integer',
  minimum: 0,
  maximum: maximoEntero,
} as const;
const golMarcador = { type: 'integer', minimum: 0, maximum: 99 } as const;

class EstadisticaCorreccionDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: maximoEntero })
  @IsId()
  jugadorId!: number;

  @ApiProperty(cantidad)
  @IsInt()
  @Min(0)
  @Max(maximoEntero)
  goles!: number;

  @ApiProperty(cantidad)
  @IsInt()
  @Min(0)
  @Max(maximoEntero)
  asistencias!: number;

  @ApiProperty(cantidad)
  @IsInt()
  @Min(0)
  @Max(maximoEntero)
  tarjetas!: number;
}

export class AplicarCorreccionDto {
  @ApiProperty({ type: String, minLength: 20, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(20, 500)
  @NotContains('\0', { message: 'motivo: contiene un carácter no permitido.' })
  motivo!: string;

  @ApiPropertyOptional({
    ...golMarcador,
    description: 'Se envía con golesVisitante.',
  })
  @ValidateIf(
    (dto: AplicarCorreccionDto) =>
      dto.golesLocal !== undefined || dto.golesVisitante !== undefined,
  )
  @IsInt()
  @Min(0)
  @Max(99)
  golesLocal?: number;

  @ApiPropertyOptional({
    ...golMarcador,
    description: 'Se envía con golesLocal.',
  })
  @ValidateIf(
    (dto: AplicarCorreccionDto) =>
      dto.golesLocal !== undefined || dto.golesVisitante !== undefined,
  )
  @IsInt()
  @Min(0)
  @Max(99)
  golesVisitante?: number;

  @ApiPropertyOptional({ type: [EstadisticaCorreccionDto], minItems: 1 })
  @ValidateIf((dto: AplicarCorreccionDto) => dto.estadisticas !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique((fila: EstadisticaCorreccionDto | null) => fila?.jugadorId, {
    message: 'estadisticas: jugadorId debe ser único dentro de la corrección.',
  })
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => EstadisticaCorreccionDto)
  estadisticas?: EstadisticaCorreccionDto[];
}

export class ValoresCorreccionDto {
  @ApiProperty(golMarcador)
  golesLocal!: number;

  @ApiProperty(golMarcador)
  golesVisitante!: number;

  @ApiProperty({ type: [RegistroEstadisticaDto] })
  estadisticas!: RegistroEstadisticaDto[];
}

export class CorreccionPartidoRespuestaDto {
  @ApiProperty({ type: 'integer' })
  partidoId!: number;

  @ApiProperty({ enum: ['FINALIZADO'] })
  estado!: 'FINALIZADO';

  @ApiProperty({ type: 'integer' })
  correccionId!: number;

  @ApiProperty({ type: ValoresCorreccionDto })
  antes!: ValoresCorreccionDto;

  @ApiProperty({ type: ValoresCorreccionDto })
  despues!: ValoresCorreccionDto;
}

export class BitacoraCorreccionDto {
  @ApiProperty({ type: 'integer' })
  id!: number;

  @ApiProperty({ type: String, format: 'uuid' })
  usuarioId!: string;

  @ApiProperty({ type: String })
  responsable!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  fecha!: string;

  @ApiProperty({ type: String })
  motivo!: string;

  @ApiProperty({ type: ValoresCorreccionDto })
  antes!: Prisma.JsonValue;

  @ApiProperty({ type: ValoresCorreccionDto })
  despues!: Prisma.JsonValue;
}
