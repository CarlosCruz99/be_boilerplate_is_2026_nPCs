import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearEquipoDto, MiEquipoQueryDto } from './equipo.dto.js';

describe('DTO de equipos', () => {
  it('recorta el nombre y conserva un identificador numérico en el cuerpo', async () => {
    const equipo = plainToInstance(CrearEquipoDto, {
      nombre: ' Tigres FC ',
      temporadaId: 2,
    });
    expect(equipo.nombre).toBe('Tigres FC');
    await expect(validate(equipo)).resolves.toEqual([]);
  });

  it('convierte solo dígitos decimales en el parámetro de temporada', async () => {
    const query = plainToInstance(MiEquipoQueryDto, { temporadaId: '2' });
    expect(query.temporadaId).toBe(2);
    await expect(validate(query)).resolves.toEqual([]);
    const invalido = plainToInstance(MiEquipoQueryDto, { temporadaId: '2e0' });
    expect(await validate(invalido)).toHaveLength(1);
  });
});
