import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrarParticipantesDto } from './participantes.dto.js';

describe('BE-5.5: lista completa de participantes', () => {
  it.each(
    [[], [1], Array.from({ length: 30 }, (_, i) => i + 1)].map(
      (jugadorIds) => ({ jugadorIds }),
    ),
  )('acepta %j', async ({ jugadorIds }) => {
    expect(
      await validate(
        plainToInstance(RegistrarParticipantesDto, { jugadorIds }),
      ),
    ).toHaveLength(0);
  });
  it.each(
    [
      undefined,
      null,
      '1',
      1,
      {},
      [1, 1],
      [0],
      [-1],
      [1.5],
      ['1'],
      [true],
      [null],
      [2147483648],
      Array.from({ length: 31 }, (_, i) => i + 1),
    ].map((jugadorIds) => ({ jugadorIds })),
  )('rechaza %j', async ({ jugadorIds }) => {
    expect(
      (
        await validate(
          plainToInstance(RegistrarParticipantesDto, { jugadorIds }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
