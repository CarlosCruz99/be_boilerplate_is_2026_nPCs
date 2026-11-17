import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListadoPartidosQueryDto } from './listado-partidos.dto.js';
describe('BE-6.1: filtros y paginación', () => {
  it('aplica valores predeterminados', async () => {
    const dto = plainToInstance(ListadoPartidosQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, pageSize: 20 });
  });
  it.each(['PROGRAMADO', 'EN_CURSO', 'FINALIZADO'])(
    'acepta %s',
    async (estado) => {
      expect(
        await validate(
          plainToInstance(ListadoPartidosQueryDto, {
            estado,
            equipoId: '3',
            page: '2',
            pageSize: '50',
          }),
        ),
      ).toHaveLength(0);
    },
  );
  it.each([
    { estado: 'CANCELADO' },
    { estado: '' },
    { estado: null },
    { equipoId: '0' },
    { equipoId: '1.5' },
    { page: '0' },
    { page: '-1' },
    { page: 'abc' },
    { pageSize: '51' },
    { pageSize: '0' },
    { pageSize: '1.5' },
    { page: '1e2' },
  ])('rechaza %j', async (entrada) => {
    expect(
      (await validate(plainToInstance(ListadoPartidosQueryDto, entrada)))
        .length,
    ).toBeGreaterThan(0);
  });
});
