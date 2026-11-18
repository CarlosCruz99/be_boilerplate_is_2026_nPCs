import { ValidationPipe } from '@nestjs/common';
import {
  JugadoresDestacadosQueryDto,
  TemporadaDestacadosParamsDto,
} from './jugadores-destacados.dto.js';

describe('BE-11.1 DTO jugadores destacados', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('acepta temporadaId válido y metrica goles o asistencias', async () => {
    const params = (await pipe.transform(
      { temporadaId: '3' },
      { type: 'param', metatype: TemporadaDestacadosParamsDto },
    )) as TemporadaDestacadosParamsDto;
    expect(params.temporadaId).toBe(3);

    for (const metrica of ['goles', 'asistencias']) {
      const query = (await pipe.transform(
        { metrica },
        { type: 'query', metatype: JugadoresDestacadosQueryDto },
      )) as JugadoresDestacadosQueryDto;
      expect(query.metrica).toBe(metrica);
    }
  });

  it.each(['0', '-2', 'abc', '1.5', '2147483648'])(
    'rechaza temporadaId inválido: %s',
    async (temporadaId) => {
      await expect(
        pipe.transform(
          { temporadaId },
          { type: 'param', metatype: TemporadaDestacadosParamsDto },
        ),
      ).rejects.toThrow();
    },
  );

  it.each([
    {},
    { metrica: '' },
    { metrica: 'tarjetas' },
    { metrica: 'GOLES' },
    { metrica: 'goles; DROP TABLE jugador' },
    { metrica: 'goles', extra: '1' },
  ])('rechaza query inválido: %j', async (entrada) => {
    await expect(
      pipe.transform(entrada, {
        type: 'query',
        metatype: JugadoresDestacadosQueryDto,
      }),
    ).rejects.toThrow();
  });
});
