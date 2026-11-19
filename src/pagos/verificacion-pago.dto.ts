import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';

export class RevisionPagoParamsDto {
  @ApiProperty({ minimum: 1 }) @IsUrlId() id!: number;
}

export class PendientesQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class VerificarPagoDto {
  @ApiProperty({ enum: ['VERIFICADO', 'RECHAZADO'] })
  @IsIn(['VERIFICADO', 'RECHAZADO'])
  estado!: 'VERIFICADO' | 'RECHAZADO';

  @ApiPropertyOptional({
    minLength: 20,
    maxLength: 500,
    description:
      'Obligatorio al rechazar; se recortan espacios de los extremos.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: VerificarPagoDto, valor: unknown) =>
      dto.estado === 'RECHAZADO' || valor !== undefined,
  )
  @IsString()
  @Length(20, 500)
  motivo?: string;
}

export class VerificacionPagoDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['VERIFICADO', 'RECHAZADO'] }) estado!: string;
  @ApiProperty({ format: 'uuid' }) verificadoPor!: string;
  @ApiProperty({ type: String, format: 'date-time' }) verificadoEn!: string;
  @ApiProperty({ type: String, example: '100.00' }) saldo!: string;
  @ApiProperty({ type: String, example: '40.00' }) disponible!: string;
}

export class EquipoRevisionDto {
  @ApiProperty() id!: number;
  @ApiProperty() nombre!: string;
}

export class PagoPendienteDto {
  @ApiProperty() id!: number;
  @ApiProperty() cuotaId!: number;
  @ApiProperty({ type: EquipoRevisionDto }) equipo!: EquipoRevisionDto;
  @ApiProperty({ enum: ['INSCRIPCION', 'ARBITRAJE'] }) concepto!: string;
  @ApiProperty({ type: String, example: '60.00' }) monto!: string;
  @ApiProperty({ type: String, format: 'date' }) fechaPago!: string;
}

export class BandejaPagosDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: [PagoPendienteDto] }) pagos!: PagoPendienteDto[];
}

export class CuotaRevisionDto {
  @ApiProperty() id!: number;
  @ApiProperty() temporadaId!: number;
  @ApiProperty({ type: EquipoRevisionDto }) equipo!: EquipoRevisionDto;
  @ApiProperty({ enum: ['INSCRIPCION', 'ARBITRAJE'] }) concepto!: string;
  @ApiProperty({ type: String, example: '100.00' }) montoTotal!: string;
  @ApiProperty({ type: String, example: '100.00' }) saldo!: string;
  @ApiProperty({ type: String, example: '40.00' }) disponible!: string;
}

export class RevisionPagoDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['PENDIENTE', 'VERIFICADO', 'RECHAZADO'] })
  estado!: string;
  @ApiProperty({ type: String, example: '60.00' }) monto!: string;
  @ApiProperty({ type: String, format: 'date' }) fechaPago!: string;
  @ApiProperty({ type: CuotaRevisionDto }) cuota!: CuotaRevisionDto;
  @ApiProperty() tieneComprobante!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  verificadoPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  verificadoEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoRechazo!: string | null;
}
