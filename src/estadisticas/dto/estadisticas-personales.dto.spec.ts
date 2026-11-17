import { ValidationPipe } from '@nestjs/common';
import {
  SinParametrosEstadisticasDto,
  TemporadaEstadisticasParamsDto,
} from './estadisticas-personales.dto.js';

describe('BE-10.1 DTO estadísticas personales', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('acepta temporadaId entero positivo', async () => {
    const resultado = (await pipe.transform(
      { temporadaId: '7' },
      { type: 'param', metatype: TemporadaEstadisticasParamsDto },
    )) as TemporadaEstadisticasParamsDto;
    expect(resultado.temporadaId).toBe(7);
  });

  it.each(['0', '-1', 'abc', '1.5', '2147483648'])(
    'rechaza temporadaId inválido: %s',
    async (temporadaId) => {
      await expect(
        pipe.transform(
          { temporadaId },
          { type: 'param', metatype: TemporadaEstadisticasParamsDto },
        ),
      ).rejects.toThrow();
    },
  );

  it('rechaza query params adicionales como jugadorId', async () => {
    await expect(
      pipe.transform(
        { jugadorId: '12' },
        { type: 'query', metatype: SinParametrosEstadisticasDto },
      ),
    ).rejects.toThrow();
  });
});
