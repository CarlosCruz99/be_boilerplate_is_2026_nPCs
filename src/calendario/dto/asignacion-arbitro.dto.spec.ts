import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AsignarArbitroDto } from './asignacion-arbitro.dto.js';
describe('H25: UUID de árbitro obligatorio', () => {
  it('acepta UUID', async () =>
    expect(
      await validate(
        plainToInstance(AsignarArbitroDto, {
          arbitroId: '00000000-0000-4000-8000-000000000001',
        }),
      ),
    ).toHaveLength(0));
  it.each([undefined, null, 1, '1', '', 'no-es-uuid'])(
    'rechaza %j',
    async (arbitroId) => {
      expect(
        (await validate(plainToInstance(AsignarArbitroDto, { arbitroId })))
          .length,
      ).toBeGreaterThan(0);
    },
  );
});
