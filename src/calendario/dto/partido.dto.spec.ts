import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearPartidoDto, EditarPartidoDto } from './partido.dto.js';

const valido = {
  temporadaId: 1,
  jornada: 1,
  equipoLocalId: 1,
  equipoVisitanteId: 2,
  canchaId: 1,
  arbitroId: '00000000-0000-4000-8000-000000000012',
  inicio: '2027-02-13T14:00:00Z',
};
describe('DTO de partidos', () => {
  it('acepta datos y zona horaria explícita', async () => {
    expect(
      await validate(plainToInstance(CrearPartidoDto, valido)),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CrearPartidoDto, {
          ...valido,
          inicio: '2027-02-13T08:00:00-06:00',
        }),
      ),
    ).toHaveLength(0);
  });
  it.each([
    { arbitroId: undefined },
    { arbitroId: '12' },
    { jornada: 32768 },
    { jornada: 0 },
    { canchaId: '1' },
    { inicio: '2027-02-30T14:00:00Z' },
    { inicio: '2027-02-13' },
    { inicio: '2027-02-13T14:00:00' },
  ])('rechaza datos inválidos %j', async (cambio) => {
    expect(
      (
        await validate(
          plainToInstance(CrearPartidoDto, { ...valido, ...cambio }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { canchaId: null },
    { arbitroId: null },
    { inicio: null },
    { estado: 'EN_CURSO' },
    { estado: null },
  ])('rechaza valores opcionales inválidos %j', async (datos) => {
    expect(
      (await validate(plainToInstance(EditarPartidoDto, datos))).length,
    ).toBeGreaterThan(0);
  });
});
