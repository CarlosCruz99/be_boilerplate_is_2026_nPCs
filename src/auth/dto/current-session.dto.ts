import { ApiProperty } from '@nestjs/swagger';
import { RegisteredUserDto } from '../../users/dto/registered-user.dto.js';

export class CurrentSessionDto extends RegisteredUserDto {
  @ApiProperty({ type: Number, nullable: true })
  equipoActualId!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  capitaneaEquipoId!: number | null;
}
