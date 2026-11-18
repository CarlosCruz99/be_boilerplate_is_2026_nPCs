import { mapearPosicion } from './consulta-posiciones.service.js';
describe('BE-7.1: mapeo de filas oficiales', () => {
  it('mapea columnas sin alterar el lugar, diferencia negativa ni valores cero', () => {
    expect(
      mapearPosicion({
        lugar: 7,
        equipo_id: 12,
        nombre: 'Equipo A',
        pj: 5,
        pg: 0,
        pe: 1,
        pp: 4,
        gf: 0,
        gc: 9,
        dg: -9,
        puntos: 1,
      }),
    ).toEqual({
      lugar: 7,
      equipoId: 12,
      equipo: 'Equipo A',
      pj: 5,
      pg: 0,
      pe: 1,
      pp: 4,
      gf: 0,
      gc: 9,
      dg: -9,
      puntos: 1,
    });
  });
  it('no expone columnas adicionales ni convierte lugar en BigInt', () => {
    const fila = {
      lugar: 1,
      equipo_id: 3,
      nombre: 'Líder',
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      gf: 0,
      gc: 0,
      dg: 0,
      puntos: 0,
      temporada_id: 99,
    };
    const resultado = mapearPosicion(fila);
    expect(resultado).not.toHaveProperty('temporada_id');
    expect(JSON.parse(JSON.stringify(resultado)).lugar).toBe(1);
  });
});
