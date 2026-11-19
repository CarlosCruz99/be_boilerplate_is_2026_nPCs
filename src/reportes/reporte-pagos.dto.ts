import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import { IsUrlId } from '../inscripciones/dto/id.decorator.js';

export const CONCEPTOS_REPORTE = ['TODOS', 'INSCRIPCION', 'ARBITRAJE'] as const;
export const ESTADOS_REPORTE = [
  'MOROSO',
  'CON_SALDO',
  'PAGADO',
  'SIN_CUOTAS',
] as const;
export type ConceptoReporte = (typeof CONCEPTOS_REPORTE)[number];
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

export class ReportePagosQueryDto {
  @ApiProperty({ minimum: 1, description: 'Temporada obligatoria.' })
  @IsUrlId()
  temporadaId!: number;

  @ApiPropertyOptional({ enum: CONCEPTOS_REPORTE, default: 'TODOS' })
  @IsIn(CONCEPTOS_REPORTE)
  concepto: ConceptoReporte = 'TODOS';

  @ApiPropertyOptional({ enum: ESTADOS_REPORTE })
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsIn(ESTADOS_REPORTE)
  estado?: EstadoReporte;
}

export class EquipoReportePagosDto {
  @ApiProperty() equipoId!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ type: String, example: '125.50' }) totalCuotas!: string;
  @ApiProperty({ type: String, example: '25.50' }) pagado!: string;
  @ApiProperty({ type: String, example: '100.00' }) saldoPendiente!: string;
  @ApiProperty({ enum: ESTADOS_REPORTE }) estado!: EstadoReporte;
  @ApiProperty({ type: String, format: 'date', nullable: true }) vencidoDesde!:
    string | null;
}

export class TotalesReportePagosDto {
  @ApiProperty({ type: String, example: '125.50' }) totalCuotas!: string;
  @ApiProperty({ type: String, example: '25.50' }) pagado!: string;
  @ApiProperty({ type: String, example: '100.00' }) saldoPendiente!: string;
  @ApiProperty({ minimum: 0 }) equiposMorosos!: number;
}

export class ReportePagosDto {
  @ApiProperty() temporadaId!: number;
  @ApiProperty({ enum: CONCEPTOS_REPORTE }) concepto!: ConceptoReporte;
  @ApiProperty({ type: String, format: 'date-time' }) generadoEn!: string;
  @ApiProperty({ type: [EquipoReportePagosDto] })
  equipos!: EquipoReportePagosDto[];
  @ApiProperty({ type: TotalesReportePagosDto })
  totales!: TotalesReportePagosDto;
}
