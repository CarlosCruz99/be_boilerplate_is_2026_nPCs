import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidarEquipoDto } from './validacion-equipo.dto.js';

describe('decisión de inscripción', () => {
  it.each([
    {},
    { decision: 'OTRA' },
    { decision: null },
    { decision: 'RECHAZAR' },
    { decision: 'RECHAZAR', motivo: null },
    { decision: 'RECHAZAR', motivo: ' '.repeat(20) },
    { decision: 'RECHAZAR', motivo: 'a'.repeat(19) },
    { decision: 'RECHAZAR', motivo: 'a'.repeat(501) },
    { decision: 'RECHAZAR', motivo: 123 },
  ])('rechaza una decisión o motivo inválido %j', async (datos) => {
    expect(
      (await validate(plainToInstance(ValidarEquipoDto, datos))).length,
    ).toBeGreaterThan(0);
  });
  it('permite aprobar sin motivo', async () => {
    expect(
      await validate(
        plainToInstance(ValidarEquipoDto, { decision: 'APROBAR' }),
      ),
    ).toHaveLength(0);
  });
  it.each([20, 500])(
    'recorta y acepta el límite de %i caracteres',
    async (length) => {
      const dto = plainToInstance(ValidarEquipoDto, {
        decision: 'RECHAZAR',
        motivo: `  ${'a'.repeat(length)}  `,
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.motivo).toHaveLength(length);
    },
  );
});
