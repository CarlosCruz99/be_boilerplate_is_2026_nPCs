import { ApiProperty } from '@nestjs/swagger';
import { RolUsuario, type User } from '@PrismaClient';

export class RegisteredUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ enum: RolUsuario })
  rol!: RolUsuario;

  static fromEntity({ id, email, nombre, rol }: User): RegisteredUserDto {
    return { id, email, nombre, rol };
  }
}
