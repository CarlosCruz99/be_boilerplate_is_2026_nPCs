import { ApiProperty } from '@nestjs/swagger';

export class VinculacionDto {
  @ApiProperty()
  jugadorId!: number;

  @ApiProperty({ type: Number, nullable: true })
  equipoId!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  temporadaId!: number | null;
}
