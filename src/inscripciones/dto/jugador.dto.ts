import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { IsBirthDate } from '../../common/decorators/is-birth-date.decorator.js';
import { IsUrlId } from './id.decorator.js';

export class DatosFichaDto {
  @ApiProperty({ example: '01234567-8', minLength: 5, maxLength: 20 })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{5,20}$/, {
    message:
      'La identificación debe tener entre 5 y 20 letras, números o guiones.',
  })
  identificacion!: string;

  @ApiProperty({ example: '2004-05-12', format: 'date' })
  @IsBirthDate()
  fechaNacimiento!: string;
}

export class AgregarJugadorDto extends DatosFichaDto {
  @ApiProperty({ example: 'Ana López', minLength: 3, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 120)
  nombreCompleto!: string;
}

export class SubirJugadorDto extends AgregarJugadorDto {
  @ApiProperty({
    type: String,
    format: 'binary',
    description: 'JPG o PNG de hasta 2 MiB.',
  })
  foto!: unknown;
}

export class EquipoParamsDto {
  @IsUrlId()
  equipoId!: number;
}

export class EquipoJugadorParamsDto extends EquipoParamsDto {
  @IsUrlId()
  jugadorId!: number;
}

export class JugadorDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  equipoId!: number;

  @ApiProperty()
  nombreCompleto!: string;

  @ApiProperty({ format: 'date' })
  fechaNacimiento!: string;

  @ApiProperty()
  identificacion!: string;

  @ApiProperty()
  fotoUrl!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  usuarioId!: string | null;
}
