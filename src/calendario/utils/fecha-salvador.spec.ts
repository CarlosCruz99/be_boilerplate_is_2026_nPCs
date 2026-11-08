import { fechaCivilSalvador } from './fecha-salvador.js';

describe('fecha civil usada por el generador', () => {
  it('cambia de fecha a medianoche de El Salvador, no de UTC', () => {
    expect(fechaCivilSalvador(new Date('2028-01-01T05:59:59Z'))).toBe(
      '2027-12-31',
    );
    expect(fechaCivilSalvador(new Date('2028-01-01T06:00:00Z'))).toBe(
      '2028-01-01',
    );
  });
});
