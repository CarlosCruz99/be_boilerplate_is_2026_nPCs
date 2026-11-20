import { ValidationPipe } from '@nestjs/common';
import {
  SinParametrosReporteDeportivoDto,
  TemporadaReporteDeportivoParamsDto,
} from './reporte-deportivo.dto.js';

describe('BE-22.1 DTO reporte deportivo', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('acepta temporadaId entero positivo', async () => {
    const resultado = (await pipe.transform(
      { temporadaId: '4' },
      { type: 'param', metatype: TemporadaReporteDeportivoParamsDto },
    )) as TemporadaReporteDeportivoParamsDto;
    expect(resultado.temporadaId).toBe(4);
  });

  it.each(['0', '-1', 'abc', '1.5', '2147483648'])(
    'rechaza temporadaId inválido: %s',
    async (temporadaId) => {
      await expect(
        pipe.transform(
          { temporadaId },
          { type: 'param', metatype: TemporadaReporteDeportivoParamsDto },
        ),
      ).rejects.toThrow();
    },
  );

  it('rechaza query params inesperados', async () => {
    await expect(
      pipe.transform(
        { extra: '1' },
        { type: 'query', metatype: SinParametrosReporteDeportivoDto },
      ),
    ).rejects.toThrow();
  });
});
