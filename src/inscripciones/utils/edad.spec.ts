import { calcularEdad } from './edad.js';

describe('edad civil de El Salvador', () => {
  const nacimiento = new Date('2010-11-08T00:00:00Z');
  it('no adelanta el cumpleaños por el cambio de fecha UTC', () => {
    expect(calcularEdad(nacimiento, new Date('2026-11-08T05:59:59Z'))).toBe(15);
    expect(calcularEdad(nacimiento, new Date('2026-11-08T06:00:00Z'))).toBe(16);
  });
  it('conserva años cumplidos después del cumpleaños', () => {
    expect(calcularEdad(nacimiento, new Date('2026-12-01T12:00:00Z'))).toBe(16);
  });
  it('compara mes y día para nacimientos bisiestos', () => {
    const bisiesto = new Date('2008-02-29T00:00:00Z');
    expect(calcularEdad(bisiesto, new Date('2024-02-28T12:00:00Z'))).toBe(15);
    expect(calcularEdad(bisiesto, new Date('2024-02-29T12:00:00Z'))).toBe(16);
  });
  it('usa el 28 de febrero en años no bisiestos, incluidos siglos no divisibles por 400', () => {
    const nacimiento = new Date('2008-02-29T00:00:00Z');
    expect(calcularEdad(nacimiento, new Date('2026-02-27T12:00:00Z'))).toBe(17);
    expect(calcularEdad(nacimiento, new Date('2026-02-28T05:59:59Z'))).toBe(17);
    expect(calcularEdad(nacimiento, new Date('2026-02-28T06:00:00Z'))).toBe(18);
    expect(calcularEdad(nacimiento, new Date('2100-02-28T12:00:00Z'))).toBe(92);
  });
});
