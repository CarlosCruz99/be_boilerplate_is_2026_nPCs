import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, ValidateIf } from 'class-validator';
import { ConceptoCuota } from '@PrismaClient';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';
export class HistorialParamsDto {
  @IsUrlId() equipoId!: number;
}
export class HistorialQueryDto {
  @ApiProperty({ minimum: 1 }) @IsUrlId() temporadaId!: number;
  @ApiPropertyOptional({ enum: ConceptoCuota })
  @ValidateIf((_dto, v: unknown) => v !== undefined)
  @IsEnum(ConceptoCuota)
  concepto?: ConceptoCuota;
}
export class ComprobanteParamsDto {
  @IsUrlId() pagoId!: number;
}
export class PagoHistorialDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ConceptoCuota }) concepto!: ConceptoCuota;
  @ApiProperty({ example: '25.50' }) monto!: string;
  @ApiProperty({ format: 'date' }) fechaPago!: string;
  @ApiProperty({ enum: ['PENDIENTE', 'VERIFICADO', 'RECHAZADO'] })
  estado!: string;
  @ApiProperty() tieneComprobante!: boolean;
  @ApiProperty({ type: String, nullable: true }) motivoRechazo!: string | null;
}
export class TotalesHistorialDto {
  @ApiProperty({ example: '135.50' }) totalRegistrado!: string;
  @ApiProperty({ example: '100.00' }) totalVerificado!: string;
  @ApiProperty({ example: '25.50' }) pendienteVerificacion!: string;
  @ApiProperty({ example: '10.00' }) totalRechazado!: string;
}
export class HistorialPagosDto {
  @ApiProperty() equipoId!: number;
  @ApiProperty() temporadaId!: number;
  @ApiProperty({ enum: ConceptoCuota, nullable: true })
  concepto!: ConceptoCuota | null;
  @ApiProperty({ type: [PagoHistorialDto] }) pagos!: PagoHistorialDto[];
  @ApiProperty({ type: TotalesHistorialDto }) totales!: TotalesHistorialDto;
}
