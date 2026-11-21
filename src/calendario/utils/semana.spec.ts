import { limitesSemana } from './semana.js';

describe('semana de El Salvador', () => {
  it('mantiene domingo local aunque en UTC ya sea lunes', () => {
    const limites = limitesSemana(new Date('2027-01-04T05:59:59Z'));
    expect(limites.desde.toISOString()).toBe('2026-12-28T06:00:00.000Z');
    expect(limites.hasta.toISOString()).toBe('2027-01-04T06:00:00.000Z');
  });
  it('abre otra semana exactamente a las 00:00 del lunes local', () => {
    const limites = limitesSemana(new Date('2027-01-04T06:00:00Z'));
    expect(limites.desde.toISOString()).toBe('2027-01-04T06:00:00.000Z');
    expect(limites.hasta.toISOString()).toBe('2027-01-11T06:00:00.000Z');
  });
});
