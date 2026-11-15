import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { centavosPago, dinero, RegistrarPagoDto } from './pago.dto.js';
describe('H13: dinero exacto y fecha civil', () => {
  it.each(['0.01', '60', '60.5', '9999999999.99'])('acepta %s', (v) =>
    expect(centavosPago(v)).not.toBeNull(),
  );
  it.each([
    null,
    undefined,
    60,
    '0',
    '-1',
    '1.005',
    '1e2',
    '10000000000',
    ' 5',
  ])('rechaza %j', (v) => expect(centavosPago(v)).toBeNull());
  it('normaliza sin punto flotante', () =>
    expect(dinero(centavosPago('60.5')!)).toBe('60.50'));
  it.each(['2027-02-29', '2030-01-01T00:00:00Z', '01/01/2030'])(
    'rechaza fecha %s',
    async (fechaPago) => {
      expect(
        (
          await validate(
            plainToInstance(RegistrarPagoDto, { monto: '1.00', fechaPago }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
});
