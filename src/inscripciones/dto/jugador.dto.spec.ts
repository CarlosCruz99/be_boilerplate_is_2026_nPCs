import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgregarJugadorDto } from './jugador.dto.js';

describe('DTO de ficha de jugador', () => {
  const datos = {
    nombreCompleto: ' Ana López ',
    identificacion: '01234567-8',
    fechaNacimiento: '2004-02-29',
  };

  it('acepta una fecha bisiesta y recorta el nombre', async () => {
    const ficha = plainToInstance(AgregarJugadorDto, datos);
    expect(ficha.nombreCompleto).toBe('Ana López');
    await expect(validate(ficha)).resolves.toEqual([]);
  });

  it('rechaza una fecha que no existe y caracteres ajenos a la identificación', async () => {
    const ficha = plainToInstance(AgregarJugadorDto, {
      ...datos,
      fechaNacimiento: '2003-02-29',
      identificacion: '0123/4',
    });
    expect(
      (await validate(ficha)).map(({ property }) => property).sort(),
    ).toEqual(['fechaNacimiento', 'identificacion']);
  });
});
