interface PartidoFinalizado {
  equipoLocalId: number;
  equipoVisitanteId: number;
  golesLocal: number;
  golesVisitante: number;
}

interface FilaPosicion {
  equipoId: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  puntos: number;
}

function acumular(fila: FilaPosicion, aFavor: number, enContra: number): void {
  fila.pj++;
  if (aFavor > enContra) fila.pg++;
  else if (aFavor === enContra) fila.pe++;
  else fila.pp++;
  fila.gf += aFavor;
  fila.gc += enContra;
  fila.dg = fila.gf - fila.gc;
  fila.puntos = fila.pg * 3 + fila.pe;
}

export function calcularPosiciones(
  equipos: readonly number[],
  partidos: readonly PartidoFinalizado[],
): FilaPosicion[] {
  const filas = new Map(
    equipos.map((equipoId) => [
      equipoId,
      { equipoId, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, puntos: 0 },
    ]),
  );
  for (const partido of partidos) {
    // El FK compuesto de partido garantiza que ambos equipos sean de la temporada.
    acumular(
      filas.get(partido.equipoLocalId)!,
      partido.golesLocal,
      partido.golesVisitante,
    );
    acumular(
      filas.get(partido.equipoVisitanteId)!,
      partido.golesVisitante,
      partido.golesLocal,
    );
  }
  return [...filas.values()];
}
