import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { EstadoEquipo } from '@PrismaClient';
import { IsId, IsUrlId } from './id.decorator.js';

export class CrearEquipoDto {
  @ApiProperty({ example: 'Tigres FC', minLength: 3, maxLength: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 50)
  nombre!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsId()
  temporadaId!: number;
}

export class MiEquipoQueryDto {
  @ApiProperty({ example: 2, minimum: 1 })
  @IsUrlId()
  temporadaId!: number;
}

export class EquipoDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  temporadaId!: number;

  @ApiProperty({ format: 'uuid' })
  capitanId!: string;

  @ApiProperty({ enum: EstadoEquipo })
  estado!: EstadoEquipo;
}

export class MiEquipoDto extends EquipoDto {
  @ApiProperty({ type: String, nullable: true })
  motivoRechazo!: string | null;

  @ApiProperty()
  totalJugadores!: number;
}
