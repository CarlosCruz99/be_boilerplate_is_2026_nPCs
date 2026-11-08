import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, Max } from 'class-validator';
import { EstadoEquipo } from '@PrismaClient';
import { IsUrlId } from './id.decorator.js';

export class ListarEquiposQueryDto {
  @ApiProperty({ minimum: 1, example: 2 })
  @IsUrlId()
  temporadaId!: number;

  @ApiPropertyOptional({ enum: EstadoEquipo, default: EstadoEquipo.PENDIENTE })
  @IsEnum(EstadoEquipo)
  estado: EstadoEquipo = EstadoEquipo.PENDIENTE;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsUrlId()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsUrlId()
  @Max(50)
  pageSize: number = 20;
}

export class DetalleEquipoParamsDto {
  @IsUrlId()
  id!: number;
}

export class ResumenEquipoDto {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  nombre!: string;
  @ApiProperty({ enum: EstadoEquipo })
  estado!: EstadoEquipo;
  @ApiProperty()
  nombreCapitan!: string;
  @ApiProperty()
  totalJugadores!: number;
  @ApiProperty({ format: 'date-time' })
  creadoEn!: string;
}

export class ListadoEquiposDto {
  @ApiProperty({ type: [ResumenEquipoDto] })
  items!: ResumenEquipoDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  page!: number;
  @ApiProperty()
  pageSize!: number;
}

export class JugadorDetalleDto {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  nombreCompleto!: string;
  @ApiProperty({
    description: 'Años cumplidos a la fecha actual de El Salvador.',
  })
  edad!: number;
  @ApiProperty({
    description: 'Ruta de descarga autenticada de la fotografía.',
  })
  fotoUrl!: string;
}

export class DetalleEquipoDto extends ResumenEquipoDto {
  @ApiProperty()
  temporadaId!: number;
  @ApiProperty({ format: 'uuid' })
  capitanId!: string;
  @ApiProperty({ type: String, nullable: true })
  motivoRechazo!: string | null;
  @ApiProperty({ type: [JugadorDetalleDto] })
  jugadores!: JugadorDetalleDto[];
}
