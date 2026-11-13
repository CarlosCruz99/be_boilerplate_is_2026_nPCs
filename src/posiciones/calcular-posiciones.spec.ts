import { calcularPosiciones } from './calcular-posiciones.js';

describe('BE-8.1 · cálculo de posiciones', () => {
  it('asigna 3 puntos por victoria, 1 por empate y 0 por derrota', () => {
    const tabla = calcularPosiciones(
      [1, 2, 3, 4],
      [
        {
          equipoLocalId: 1,
          equipoVisitanteId: 2,
          golesLocal: 4,
          golesVisitante: 2,
        },
        {
          equipoLocalId: 3,
          equipoVisitanteId: 1,
          golesLocal: 1,
          golesVisitante: 1,
        },
      ],
    );
    expect(tabla).toEqual([
      {
        equipoId: 1,
        pj: 2,
        pg: 1,
        pe: 1,
        pp: 0,
        gf: 5,
        gc: 3,
        dg: 2,
        puntos: 4,
      },
      {
        equipoId: 2,
        pj: 1,
        pg: 0,
        pe: 0,
        pp: 1,
        gf: 2,
        gc: 4,
        dg: -2,
        puntos: 0,
      },
      {
        equipoId: 3,
        pj: 1,
        pg: 0,
        pe: 1,
        pp: 0,
        gf: 1,
        gc: 1,
        dg: 0,
        puntos: 1,
      },
      {
        equipoId: 4,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        gf: 0,
        gc: 0,
        dg: 0,
        puntos: 0,
      },
    ]);
  });
});
