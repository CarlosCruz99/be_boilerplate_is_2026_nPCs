import { horarioPublicacion } from './horario-publicacion.js';

describe('horario del aviso de publicación', () => {
  it('usa fecha y hora civil de El Salvador', () => {
    expect(horarioPublicacion(new Date('2028-01-02T02:30:00Z'))).toEqual({
      fecha: '2028-01-01',
      hora: '20:30',
    });
  });
  it('representa medianoche como 00:00', () => {
    expect(horarioPublicacion(new Date('2028-01-02T06:00:00Z'))).toEqual({
      fecha: '2028-01-02',
      hora: '00:00',
    });
  });
});
