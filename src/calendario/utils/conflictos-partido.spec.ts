import { traducirConflictoPartido } from './conflictos-partido.js';

describe('errores de restricciones de partidos', () => {
  it.each([
    [
      '23P01',
      'ex_partido_cancha',
      'Esa cancha ya tiene un partido en ese horario.',
    ],
    [
      '23P01',
      'ex_partido_arbitro',
      'Ese árbitro ya tiene un partido en ese horario.',
    ],
    [
      '23505',
      'uq_partido_cruce_temporada',
      'Esos equipos ya se enfrentan en la temporada.',
    ],
  ])('traduce %s %s sin exponer SQL', (code, constraint, message) => {
    expect.assertions(1);
    const error = {
      meta: {
        driverAdapterError: {
          cause: { originalCode: code, originalMessage: constraint },
        },
      },
    };
    try {
      traducirConflictoPartido(error);
    } catch (resultado) {
      expect(resultado).toMatchObject({ status: 409, message });
    }
  });
  it('propaga errores desconocidos', () => {
    const error = new Error('Fallo inesperado');
    expect(() => traducirConflictoPartido(error)).toThrow(error);
  });
});
