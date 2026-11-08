import { ConflictException } from '@nestjs/common';

/** Prisma puede envolver el error del adaptador en meta/cause. No expone SQL al cliente. */
export function traducirConflictoPartido(error: unknown): never {
  const partes: string[] = [];
  const vistos = new Set<object>();
  const visitar = (valor: unknown, nivel = 0): void => {
    if (typeof valor === 'string') {
      partes.push(valor);
      return;
    }
    if (!valor || typeof valor !== 'object' || nivel > 6 || vistos.has(valor))
      return;
    vistos.add(valor);
    const objeto = valor as Record<string, unknown>;
    for (const campo of [
      'code',
      'originalCode',
      'message',
      'originalMessage',
      'constraint',
      'index',
      'target',
      'meta',
      'cause',
      'driverAdapterError',
    ]) {
      visitar(objeto[campo], nivel + 1);
    }
  };
  visitar(error);
  const detalle = partes.join(' ');
  if (detalle.includes('23P01')) {
    if (detalle.includes('ex_partido_cancha'))
      throw new ConflictException(
        'Esa cancha ya tiene un partido en ese horario.',
      );
    if (detalle.includes('ex_partido_arbitro'))
      throw new ConflictException(
        'Ese árbitro ya tiene un partido en ese horario.',
      );
  }
  if (
    (detalle.includes('23505') || detalle.includes('P2002')) &&
    detalle.includes('uq_partido_cruce_temporada')
  ) {
    throw new ConflictException(
      'Esos equipos ya se enfrentan en la temporada.',
    );
  }
  throw error;
}
