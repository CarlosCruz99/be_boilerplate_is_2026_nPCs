import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsUUID,
  Matches,
  Max,
  ValidateIf,
} from 'class-validator';
import { EstadoPartido } from '@PrismaClient';
import { IsId, IsUrlId } from '../../inscripciones/dto/id.decorator.js';

const FECHA_CON_ZONA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export class CrearPartidoDto {
  @ApiProperty({ minimum: 1 })
  @IsId()
  temporadaId!: number;
  @ApiProperty({
    minimum: 1,
    maximum: 32767,
    description: 'Número de jornada. Se crea en BORRADOR si no existe.',
  })
  @IsId()
  @Max(32767)
  jornada!: number;
  @ApiProperty({ minimum: 1 })
  @IsId()
  equipoLocalId!: number;
  @ApiProperty({ minimum: 1 })
  @IsId()
  equipoVisitanteId!: number;
  @ApiProperty({ minimum: 1 })
  @IsId()
  canchaId!: number;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  arbitroId!: string;
  @ApiProperty({
    format: 'date-time',
    example: '2027-02-13T14:00:00Z',
    description:
      'Inicio futuro ISO 8601 con zona horaria explícita. El servidor calcula fin (+90 minutos).',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(FECHA_CON_ZONA)
  inicio!: string;
}

export class EditarPartidoDto {
  @ApiPropertyOptional({ minimum: 1 })
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsId()
  canchaId?: number;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsUUID()
  arbitroId?: string;
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inicio futuro ISO 8601 con zona horaria explícita.',
  })
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(FECHA_CON_ZONA)
  inicio?: string;
  @ApiPropertyOptional({ enum: ['CANCELADO'] })
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsIn(['CANCELADO'])
  estado?: 'CANCELADO';
}

export class PartidoParamsDto {
  @IsUrlId()
  id!: number;
}

export class PartidoRespuestaDto {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  jornada!: number;
  @ApiProperty()
  equipoLocalId!: number;
  @ApiProperty()
  equipoVisitanteId!: number;
  @ApiProperty()
  canchaId!: number;
  @ApiProperty({ format: 'uuid' })
  arbitroId!: string;
  @ApiProperty({ format: 'date-time' })
  inicio!: string;
  @ApiProperty({ format: 'date-time' })
  fin!: string;
  @ApiProperty({ enum: EstadoPartido })
  estado!: EstadoPartido;
}

export class ArbitroRespuestaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  nombre!: string;
}

export class CanchasQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filtra activas o inactivas. Sin filtro devuelve todas.',
  })
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activa?: boolean;
}

export class CanchaRespuestaDto {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  nombre!: string;
  @ApiProperty()
  direccion!: string;
  @ApiProperty()
  activa!: boolean;
}
