import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerarCalendarioDto } from './generar-calendario.dto.js';

const valido = {
  fechaPrimeraJornada: '2028-02-12',
  horaPrimerTurno: '08:00',
  canchaIds: [1, 2],
  arbitroIds: [
    'abcdef01-0000-4000-8000-000000000001',
    'abcdef01-0000-4000-8000-000000000002',
  ],
};
describe('DTO generación de calendario', () => {
  it('acepta UUID y permite omitir árbitros', async () => {
    expect(
      await validate(plainToInstance(GenerarCalendarioDto, valido)),
    ).toHaveLength(0);
    const { arbitroIds: _arbitros, ...sinArbitros } = valido;
    expect(
      await validate(plainToInstance(GenerarCalendarioDto, sinArbitros)),
    ).toHaveLength(0);
  });
  it.each([
    { fechaPrimeraJornada: '2028-02-30' },
    { fechaPrimeraJornada: '2028-02-12T00:00:00Z' },
    { horaPrimerTurno: '24:00' },
    { horaPrimerTurno: '8:00' },
    { horaPrimerTurno: '08:60' },
    { canchaIds: [] },
    { canchaIds: [1, 1] },
    { canchaIds: ['1'] },
    { canchaIds: [0] },
    { canchaIds: null },
    { arbitroIds: [] },
    { arbitroIds: null },
    { arbitroIds: [11, 12] },
    { arbitroIds: [valido.arbitroIds[0], valido.arbitroIds[0].toUpperCase()] },
  ])('rechaza parámetros inválidos %j', async (cambio) => {
    expect(
      (
        await validate(
          plainToInstance(GenerarCalendarioDto, { ...valido, ...cambio }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
