import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearCuotaDto, centavos } from './cuota.dto.js';
describe('BE-12.1: dinero y formatos', () => {
  const datos = {
    temporadaId: 1,
    equipoId: 2,
    concepto: 'INSCRIPCION',
    monto: '125.00',
    fechaVencimiento: '2030-01-01',
  };
  it.each(['0.01', '1', '125.5', '100000.00'])('acepta %s', async (monto) => {
    expect(centavos(monto)).not.toBeNull();
    expect(
      await validate(plainToInstance(CrearCuotaDto, { ...datos, monto })),
    ).toHaveLength(0);
  });
  it.each([
    null,
    undefined,
    125,
    '0',
    '-1',
    '1.001',
    '100000.01',
    '9999999999.99',
    '1e2',
    ' 1',
    '1,25',
    '.5',
    'Infinity',
  ])('rechaza %j', async (monto) => {
    expect(centavos(monto)).toBeNull();
    expect(
      (await validate(plainToInstance(CrearCuotaDto, { ...datos, monto })))
        .length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { fechaVencimiento: '2027-02-29' },
    { fechaVencimiento: '2030-01-01T00:00:00Z' },
    { concepto: 'OTRO' },
    { equipoId: '2' },
    { concepto: 'ARBITRAJE' },
    { concepto: 'ARBITRAJE', partidoId: null },
  ])('rechaza %j', async (cambio) => {
    expect(
      (await validate(plainToInstance(CrearCuotaDto, { ...datos, ...cambio })))
        .length,
    ).toBeGreaterThan(0);
  });
});
