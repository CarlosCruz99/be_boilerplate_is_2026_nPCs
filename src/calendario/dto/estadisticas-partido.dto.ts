import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { EstadoPartido } from '@PrismaClient';
import { IsUrlId } from '../../inscripciones/dto/id.decorator.js';
import { MarcadorParamsDto } from './marcador.dto.js';

const limiteEntero = 2_147_483_647;
const campos = ['goles', 'asistencias', 'tarjetas'] as const;
const cantidad = {
  type: 'integer',
  minimum: 0,
  maximum: limiteEntero,
} as const;

export class EstadisticaJugadorParamsDto extends MarcadorParamsDto {
  @IsUrlId()
  jugadorId!: number;
}

export class CantidadesEstadisticaDto {
  @ApiProperty(cantidad)
  goles!: number;

  @ApiProperty(cantidad)
  asistencias!: number;

  @ApiProperty(cantidad)
  tarjetas!: number;
}

export function validarCantidades(cuerpo: unknown): CantidadesEstadisticaDto {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new BadRequestException('Envía goles, asistencias y tarjetas.');
  }
  const datos = cuerpo as Record<string, unknown>;
  if (
    Object.keys(datos).length !== campos.length ||
    campos.some((campo) => !Object.hasOwn(datos, campo))
  ) {
    throw new BadRequestException(
      'Envía únicamente goles, asistencias y tarjetas.',
    );
  }
  const valores = campos.map((campo) => datos[campo]);
  if (
    !valores.every(
      (valor): valor is number =>
        typeof valor === 'number' &&
        Number.isInteger(valor) &&
        valor >= 0 &&
        valor <= limiteEntero,
    )
  ) {
    throw new UnprocessableEntityException(
      'Las cantidades deben ser enteros no negativos dentro del rango permitido.',
    );
  }
  const [goles, asistencias, tarjetas] = valores;
  return { goles, asistencias, tarjetas };
}

export class RegistroEstadisticaDto extends CantidadesEstadisticaDto {
  @ApiProperty({ type: 'integer' })
  jugadorId!: number;
}

class JugadorHabilitadoDto {
  @ApiProperty({ type: 'integer' })
  jugadorId!: number;

  @ApiProperty({ type: String })
  nombre!: string;

  @ApiProperty({ type: 'integer' })
  equipoId!: number;
}

export class EstadisticasPartidoDto {
  @ApiProperty({ type: 'integer' })
  partidoId!: number;

  @ApiProperty({ type: 'integer' })
  temporadaId!: number;

  @ApiProperty({ enum: EstadoPartido })
  estado!: EstadoPartido;

  @ApiProperty({ type: Boolean })
  resultadoOficial!: boolean;

  @ApiProperty({ type: [JugadorHabilitadoDto] })
  jugadoresHabilitados!: JugadorHabilitadoDto[];

  @ApiProperty({ type: [RegistroEstadisticaDto] })
  registros!: RegistroEstadisticaDto[];
}
