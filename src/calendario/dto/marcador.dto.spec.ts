import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActualizarMarcadorDto } from './marcador.dto.js';

describe('BE-5.1: validación estricta del marcador y faltas', () => {
  const valido = {
    golesLocal: 2,
    golesVisitante: 1,
    faltasLocal: 4,
    faltasVisitante: 6,
  };
  const campos = Object.keys(valido);
  it.each([0, 99])(
    'acepta el límite %i en los cuatro campos',
    async (valor) => {
      expect(
        await validate(
          plainToInstance(
            ActualizarMarcadorDto,
            Object.fromEntries(campos.map((campo) => [campo, valor])),
          ),
        ),
      ).toHaveLength(0);
    },
  );
  describe.each(campos)('%s', (campo) => {
    it.each([undefined, null, -1, 100, 1.5, '2', true, [], {}, NaN, Infinity])(
      'rechaza %j',
      async (valor) => {
        const errores = await validate(
          plainToInstance(ActualizarMarcadorDto, { ...valido, [campo]: valor }),
        );
        expect(errores.some((error) => error.property === campo)).toBe(true);
      },
    );
  });
});
