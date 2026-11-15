import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsString,
  Matches,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { ConceptoCuota } from '@PrismaClient';
import { IsId } from '../inscripciones/dto/id.decorator.js';

// Céntimos exactos: no convertir dinero a punto flotante ni redondear entradas.
export function centavos(monto: unknown): bigint | null {
  if (
    typeof monto !== 'string' ||
    monto.length > 32 ||
    !/^\d+(?:\.\d{1,2})?$/.test(monto)
  )
    return null;
  const [entero, decimal = ''] = monto.split('.');
  const valor = BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0'));
  return valor > 0n && valor <= 10000000n ? valor : null;
}

export class CrearCuotaDto {
  @ApiProperty({ minimum: 1 }) @IsId() temporadaId!: number;
  @ApiProperty({ minimum: 1 }) @IsId() equipoId!: number;
  @ApiProperty({ enum: ConceptoCuota })
  @IsEnum(ConceptoCuota)
  concepto!: ConceptoCuota;
  @ApiProperty({
    type: String,
    example: '125.00',
    description:
      'USD > 0 y <= 100000.00; máximo dos decimales, sin exponentes ni redondeo.',
  })
  @ValidateBy({
    name: 'montoCuota',
    validator: {
      validate: (valor: unknown) => centavos(valor) !== null,
      defaultMessage: () =>
        'monto debe ser una cadena decimal mayor que 0 y hasta 100000.00, con máximo dos decimales.',
    },
  })
  monto!: string;
  @ApiProperty({ example: '2026-12-31', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  fechaVencimiento!: string;
  @ApiPropertyOptional({
    minimum: 1,
    nullable: true,
    description:
      'Obligatorio en ARBITRAJE. INSCRIPCION solo admite ausencia o null.',
  })
  @ValidateIf(
    (dto: CrearCuotaDto, valor: unknown) =>
      dto.concepto === 'ARBITRAJE' || (valor !== undefined && valor !== null),
  )
  @IsId()
  partidoId?: number | null;
}

export class CuotaRespuestaDto {
  @ApiProperty() id!: number;
  @ApiProperty() temporadaId!: number;
  @ApiProperty() equipoId!: number;
  @ApiProperty({ enum: ConceptoCuota }) concepto!: ConceptoCuota;
  @ApiProperty({ type: String, example: '125.00' }) monto!: string;
  @ApiProperty({ format: 'date' }) fechaVencimiento!: string;
  @ApiProperty({ type: Number, nullable: true }) partidoId!: number | null;
  @ApiPropertyOptional({
    description: 'Solo si la cuota se creó pero no se pudo enviar el aviso.',
  })
  advertencia?: string;
}
