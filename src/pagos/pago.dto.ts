import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsString, Matches, ValidateBy } from 'class-validator';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';

export function centavosPago(valor: unknown): bigint | null {
  if (typeof valor !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(valor))
    return null;
  const [entero, decimal = ''] = valor.split('.');
  const monto = BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0'));
  return monto > 0n && monto <= 999999999999n ? monto : null;
}
export function dinero(centavos: bigint): string {
  return `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, '0')}`;
}
export class EquipoCuotasParamsDto {
  @IsUrlId() equipoId!: number;
}
export class EquipoCuotasQueryDto {
  @ApiProperty({ minimum: 1 }) @IsUrlId() temporadaId!: number;
}
export class PagoParamsDto {
  @IsUrlId() cuotaId!: number;
}
export class RegistrarPagoDto {
  @ApiProperty({ example: '60.00', type: String })
  @ValidateBy({
    name: 'montoPago',
    validator: {
      validate: (v: unknown) => centavosPago(v) !== null,
      defaultMessage: () =>
        'monto debe ser una cadena decimal positiva, con máximo dos decimales y dentro de NUMERIC(12,2).',
    },
  })
  monto!: string;
  @ApiProperty({ format: 'date', example: '2026-11-15' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  fechaPago!: string;
}
export class PagoRespuestaDto {
  @ApiProperty() id!: number;
  @ApiProperty() cuotaId!: number;
  @ApiProperty({ example: '60.00' }) monto!: string;
  @ApiProperty({ format: 'date' }) fechaPago!: string;
  @ApiProperty({ enum: ['PENDIENTE', 'VERIFICADO', 'RECHAZADO'] })
  estado!: string;
  @ApiProperty({ example: '100.00' }) saldo!: string;
  @ApiProperty({ example: '40.00' }) disponible!: string;
  @ApiProperty() mensaje!: string;
  @ApiPropertyOptional() advertencia?: string;
}
export class CuotaSaldoDto {
  @ApiProperty() id!: number;
  @ApiProperty() equipoId!: number;
  @ApiProperty({ enum: ['INSCRIPCION', 'ARBITRAJE'] }) concepto!: string;
  @ApiProperty() montoTotal!: string;
  @ApiProperty() totalVerificado!: string;
  @ApiProperty() saldo!: string;
  @ApiProperty() pendienteVerificacion!: string;
  @ApiProperty() disponible!: string;
}
export class CuotasSaldoRespuestaDto {
  @ApiProperty({ type: [CuotaSaldoDto] }) cuotas!: CuotaSaldoDto[];
}
