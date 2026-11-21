import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';
import { IsBirthDate } from '../../common/decorators/is-birth-date.decorator.js';

export class CreateUserDto {
  @ApiProperty({ example: 'Ana López', minLength: 3, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 120)
  nombre!: string;

  @ApiProperty({
    description: 'Email del usuario. Se normaliza a minúsculas y sin espacios.',
    example: 'nestor@example.com',
    format: 'email',
    maxLength: 254,
  })
  @IsNormalizedEmail()
  email!: string;

  @ApiProperty({
    description:
      'Contraseña con al menos una letra y un número. Máximo 72 bytes.',
    example: 'Str0ngPass',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  // bcrypt trunca silenciosamente en 72 bytes, así que se rechaza antes de hashear.
  @IsByteLength(0, 72, {
    message: 'La contraseña no puede superar los 72 bytes.',
  })
  @Matches(/^(?=.*\p{L})(?=.*\d).+$/su, {
    message: 'La contraseña debe incluir al menos una letra y un número.',
  })
  password!: string;

  @ApiProperty({ format: 'date', example: '2004-05-12' })
  @IsBirthDate()
  fechaNacimiento!: string;
}
