import { duracionPartido } from './duracion-partido.js';
describe('BE-6.2: duración real del partido', () => {
  const inicio = new Date('2026-11-17T12:00:00Z');
  it.each([
    { segundos: 0, minutos: 0 },
    { segundos: 59, minutos: 0 },
    { segundos: 60, minutos: 1 },
    { segundos: 3157, minutos: 52 },
    { segundos: 7200, minutos: 120 },
    { segundos: -60, minutos: 0 },
  ])('calcula $segundos segundos', ({ segundos, minutos }) => {
    expect(
      duracionPartido(
        inicio,
        null,
        new Date(inicio.getTime() + segundos * 1000),
      ),
    ).toBe(minutos);
  });
  it('usa finReal al finalizar, independientemente del reloj', () => {
    expect(
      duracionPartido(
        inicio,
        new Date('2026-11-17T13:35:59Z'),
        new Date('2030-01-01'),
      ),
    ).toBe(95);
  });
  it('mide tiempo real al cambiar la fecha, sin depender de la zona', () => {
    expect(
      duracionPartido(
        new Date('2026-11-17T23:50:00-06:00'),
        null,
        new Date('2026-11-18T00:15:59-06:00'),
      ),
    ).toBe(25);
  });
});
