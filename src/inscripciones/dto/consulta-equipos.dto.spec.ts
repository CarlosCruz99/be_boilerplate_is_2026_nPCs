import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ListarEquiposQueryDto,
  DetalleEquipoParamsDto,
} from './consulta-equipos.dto.js';

describe('consulta de equipos H2', () => {
  it('aplica el contrato predeterminado y convierte la temporada', async () => {
    const dto = plainToInstance(ListarEquiposQueryDto, { temporadaId: '2' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual({
      temporadaId: 2,
      estado: 'PENDIENTE',
      page: 1,
      pageSize: 20,
    });
  });
  it.each([
    {},
    { temporadaId: '0' },
    { temporadaId: '-1' },
    { temporadaId: '1e2' },
    { temporadaId: '2', estado: 'OTRO' },
    { temporadaId: '2', estado: null },
    { temporadaId: '2', page: '0' },
    { temporadaId: '2', page: '1.5' },
    { temporadaId: '2', pageSize: '51' },
    { temporadaId: '2', pageSize: '' },
    { temporadaId: ['1', '2'] },
  ])('rechaza parámetros inválidos: %j', async (entrada) => {
    expect(
      (await validate(plainToInstance(ListarEquiposQueryDto, entrada))).length,
    ).toBeGreaterThan(0);
  });
  it('acepta filtros y límites explícitos', async () => {
    const dto = plainToInstance(ListarEquiposQueryDto, {
      temporadaId: '2',
      estado: 'RECHAZADO',
      page: '2',
      pageSize: '50',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each(['0', '-1', '1.2', 'mi-equipo'])(
    'rechaza id de detalle %s',
    async (id) => {
      expect(
        (await validate(plainToInstance(DetalleEquipoParamsDto, { id })))
          .length,
      ).toBeGreaterThan(0);
    },
  );
});
