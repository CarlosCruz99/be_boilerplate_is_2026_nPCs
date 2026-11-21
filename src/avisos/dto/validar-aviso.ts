import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsObject,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  isUUID,
  validateSync,
} from 'class-validator';
import { ModuloOrigenAviso, TipoAviso, ReferenciaAviso } from '@PrismaClient';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class AvisoValidable {
  @IsEnum(ModuloOrigenAviso)
  moduloOrigen!: ModuloOrigenAviso;
  @IsEnum(TipoAviso)
  tipo!: TipoAviso;
  @IsDefined()
  @IsObject()
  destinatario!: Record<string, unknown>;
  @Transform(recortar)
  @IsString()
  @Length(1, 120)
  titulo!: string;
  @Transform(recortar)
  @IsString()
  @Length(1, 500)
  mensaje!: string;
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsObject()
  referencia?: Record<string, unknown>;
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsObject()
  datos?: object;
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  claveIdempotencia?: string;
}

const modulos: Record<TipoAviso, ModuloOrigenAviso> = {
  PARTIDO_MODIFICADO: 'CALENDARIO',
  JORNADA_PUBLICADA: 'CALENDARIO',
  CUOTA_REGISTRADA: 'PAGOS',
  PAGO_REGISTRADO: 'PAGOS',
  RESULTADO_FINALIZADO: 'RESULTADOS',
  RESULTADO_CORREGIDO: 'RESULTADOS',
};
const idValido = (id: unknown) =>
  typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647;

export function validarAviso(entrada: unknown) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada))
    throw new BadRequestException('aviso: debe ser un objeto.');
  let dto: AvisoValidable;
  try {
    dto = plainToInstance(AvisoValidable, entrada);
  } catch {
    throw new BadRequestException('aviso: datos no serializables.');
  }
  const errores = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: false,
  });
  if (errores.length)
    throw new BadRequestException(
      `Campos inválidos: ${errores.map((e) => e.property).join(', ')}.`,
    );
  if (modulos[dto.tipo] !== dto.moduloOrigen)
    throw new BadRequestException(
      'moduloOrigen: no corresponde al tipo de aviso.',
    );
  const destino = dto.destinatario;
  const claves = Object.keys(destino).sort().join(',');
  if (claves === 'usuarioId') {
    if (typeof destino.usuarioId !== 'string' || !isUUID(destino.usuarioId))
      throw new BadRequestException('destinatario.usuarioId: UUID inválido.');
  } else if (claves === 'equipoId,temporadaId') {
    if (!idValido(destino.equipoId) || !idValido(destino.temporadaId))
      throw new BadRequestException(
        'destinatario: equipoId y temporadaId deben ser enteros positivos.',
      );
  } else
    throw new BadRequestException(
      'destinatario: usa usuarioId o equipoId y temporadaId.',
    );
  if (dto.referencia !== undefined) {
    if (
      Object.keys(dto.referencia).sort().join(',') !== 'id,tipo' ||
      !Object.values(ReferenciaAviso).includes(
        dto.referencia.tipo as ReferenciaAviso,
      ) ||
      !idValido(dto.referencia.id)
    ) {
      throw new BadRequestException(
        'referencia: requiere tipo válido e id positivo.',
      );
    }
  }
  let datosSerializados: string | undefined;
  if (dto.datos !== undefined) {
    try {
      datosSerializados = JSON.stringify(
        dto.datos,
        (_clave, valor: unknown) => {
          if (
            typeof valor === 'undefined' ||
            typeof valor === 'function' ||
            typeof valor === 'symbol' ||
            typeof valor === 'bigint' ||
            (typeof valor === 'number' && !Number.isFinite(valor))
          )
            throw new Error('JSON inválido');
          return valor;
        },
      );
    } catch {
      throw new BadRequestException('datos: debe contener JSON serializable.');
    }
    if (typeof datosSerializados !== 'string')
      throw new BadRequestException('datos: debe contener JSON serializable.');
    if (Buffer.byteLength(datosSerializados, 'utf8') > 2048)
      throw new BadRequestException('datos: supera 2048 bytes.');
  }
  return { dto, datosSerializados };
}
