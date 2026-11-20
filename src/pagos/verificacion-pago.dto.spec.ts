import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PendientesQueryDto,
  VerificarPagoDto,
} from './verificacion-pago.dto.js';

const validar = (datos: object) =>
  validate(plainToInstance(VerificarPagoDto, datos), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
describe('BE-24.1: contrato de decisión', () => {
  it('permite verificar sin motivo', async () =>
    expect(await validar({ estado: 'VERIFICADO' })).toHaveLength(0));
  it.each([
    undefined,
    null,
    '',
    ' '.repeat(30),
    'a'.repeat(19),
    'a'.repeat(501),
    123,
    ['a'.repeat(20)],
  ])('rechazar exige motivo válido: %j', async (motivo) =>
    expect(
      (await validar({ estado: 'RECHAZADO', motivo })).length,
    ).toBeGreaterThan(0),
  );
  it.each([20, 500])(
    'acepta el límite de %s caracteres después de recortar',
    async (n) => {
      const dto = plainToInstance(VerificarPagoDto, {
        estado: 'RECHAZADO',
        motivo: '  ' + 'a'.repeat(n) + '  ',
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.motivo).toBe('a'.repeat(n));
    },
  );
  it.each([
    {},
    { estado: 'PENDIENTE' },
    { estado: 'verificado' },
    { estado: ['VERIFICADO'] },
    { estado: 'VERIFICADO', verificadoPor: 'otro' },
    { estado: 'VERIFICADO', verificadoEn: '2026-11-18' },
  ])('rechaza una decisión o identidad inválida %j', async (dto) =>
    expect((await validar(dto)).length).toBeGreaterThan(0),
  );
  it('define valores predeterminados de paginación', async () => {
    const dto = plainToInstance(PendientesQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, pageSize: 20 });
  });
  it.each([
    { page: 0 },
    { page: -1 },
    { page: '1.5' },
    { page: 'abc' },
    { pageSize: 0 },
    { pageSize: 51 },
    { page: ['1', '2'] },
  ])('rechaza paginación %j', async (datos) =>
    expect(
      (await validate(plainToInstance(PendientesQueryDto, datos))).length,
    ).toBeGreaterThan(0),
  );
});
