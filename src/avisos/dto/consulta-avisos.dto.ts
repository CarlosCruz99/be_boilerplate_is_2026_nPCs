import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  ModuloOrigenAviso,
  ReferenciaAviso,
  TipoAviso,
  type Prisma,
} from '@PrismaClient';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';

export class AvisosQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsUrlId()
  @Max(50)
  limite: number = 20;
}

export class AvisoParamsDto {
  @IsUrlId()
  avisoId!: number;
}

export class SinParametrosAvisoDto {}

export class ReferenciaAvisoDto {
  @ApiProperty({ enum: ReferenciaAviso })
  tipo!: ReferenciaAviso;

  @ApiProperty()
  id!: number;
}

export class AvisoDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: ModuloOrigenAviso })
  moduloOrigen!: ModuloOrigenAviso;

  @ApiProperty({ enum: TipoAviso })
  tipo!: TipoAviso;

  @ApiProperty()
  titulo!: string;

  @ApiProperty()
  mensaje!: string;

  @ApiProperty({ format: 'date-time' })
  creadoEn!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  leidoEn!: string | null;

  @ApiProperty({ type: ReferenciaAvisoDto, nullable: true })
  referencia!: ReferenciaAvisoDto | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  datos!: Prisma.JsonObject | null;
}

export class ConteoAvisosDto {
  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class PaginaAvisosDto extends ConteoAvisosDto {
  @ApiProperty({ type: [AvisoDto] })
  datos!: AvisoDto[];

  @ApiProperty()
  pagina!: number;

  @ApiProperty()
  limite!: number;
}

export class LecturaAvisoDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ format: 'date-time' })
  leidoEn!: string;
}
