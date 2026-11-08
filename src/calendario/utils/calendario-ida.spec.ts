import { construirCalendarioIda } from './calendario-ida.js';

const equipos = Array.from({ length: 12 }, (_, i) => i + 1);
const canchas = [10, 20];
const arbitros = ['a', 'b', 'c', 'd'];
const generar = (campos = {}) =>
  construirCalendarioIda({
    equipoIds: equipos,
    canchaIds: canchas,
    arbitroIds: arbitros,
    fechaPrimeraJornada: '2028-02-12',
    horaPrimerTurno: '08:00',
    ...campos,
  });

describe('calendario de ida', () => {
  it('genera 11 jornadas, 66 partidos y cada cruce exactamente una vez', () => {
    const plan = generar();
    expect(plan.jornadas).toBe(11);
    expect(plan.partidos).toHaveLength(66);
    const cruces = new Set<string>();
    for (const partido of plan.partidos) {
      const par = [partido.equipoLocalId, partido.equipoVisitanteId]
        .sort((a, b) => a - b)
        .join('-');
      expect(cruces.has(par)).toBe(false);
      cruces.add(par);
      expect(partido.equipoLocalId).not.toBe(partido.equipoVisitanteId);
      expect(partido.fin.getTime() - partido.inicio.getTime()).toBe(90 * 60000);
    }
    for (const id of equipos) {
      const propios = plan.partidos.filter(
        (p) => p.equipoLocalId === id || p.equipoVisitanteId === id,
      );
      expect(propios).toHaveLength(11);
      expect(new Set(propios.map((p) => p.jornada)).size).toBe(11);
    }
    for (let jornada = 1; jornada <= 11; jornada++)
      expect(plan.partidos.filter((p) => p.jornada === jornada)).toHaveLength(
        6,
      );
  });

  it('usa el orden de canchas y árbitros pedido y convierte 08:00 local a 14:00Z', () => {
    const plan = generar();
    expect(plan.partidos[0]).toMatchObject({
      jornada: 1,
      equipoLocalId: 1,
      equipoVisitanteId: 12,
      canchaId: 10,
      arbitroId: 'a',
    });
    expect(plan.partidos[1]).toMatchObject({
      equipoLocalId: 11,
      equipoVisitanteId: 2,
      canchaId: 20,
      arbitroId: 'b',
    });
    expect(plan.partidos[0].inicio.toISOString()).toBe(
      '2028-02-12T14:00:00.000Z',
    );
    expect(plan.partidos[1].inicio).toEqual(plan.partidos[0].inicio);
    expect(plan.partidos[2].inicio.toISOString()).toBe(
      '2028-02-12T15:30:00.000Z',
    );
    expect(plan.partidos[6].inicio.toISOString()).toBe(
      '2028-02-19T14:00:00.000Z',
    );
  });

  it('reparte 16 o 17 partidos por árbitro y nunca traslapa un recurso', () => {
    const plan = generar();
    for (const arbitro of arbitros)
      expect([16, 17]).toContain(
        plan.partidos.filter((p) => p.arbitroId === arbitro).length,
      );
    for (let i = 0; i < plan.partidos.length; i++) {
      for (let j = i + 1; j < plan.partidos.length; j++) {
        const a = plan.partidos[i];
        const b = plan.partidos[j];
        if (a.canchaId === b.canchaId || a.arbitroId === b.arbitroId)
          expect(a.inicio < b.fin && b.inicio < a.fin).toBe(false);
      }
    }
  });

  it('ordena los equipos y no modifica las entradas', () => {
    const entrada = [...equipos].reverse();
    const original = [...entrada];
    expect(generar({ equipoIds: entrada })).toEqual(generar());
    expect(entrada).toEqual(original);
  });

  it('con una cancha programa seis turnos consecutivos', () => {
    const plan = generar({
      canchaIds: [10],
      arbitroIds: ['a'],
      horaPrimerTurno: '15:00',
    });
    expect(plan.partidos[0].inicio.toISOString()).toBe(
      '2028-02-12T21:00:00.000Z',
    );
    expect(plan.partidos[5].fin.toISOString()).toBe('2028-02-13T06:00:00.000Z');
    expect(
      plan.partidos[5].inicio.getTime() - plan.partidos[0].inicio.getTime(),
    ).toBe(450 * 60000);
  });

  it('rechaza turnos que terminan después de medianoche local', () => {
    expect(() => generar({ horaPrimerTurno: '19:31' })).toThrow(RangeError);
    expect(() =>
      generar({ canchaIds: [10], horaPrimerTurno: '15:01' }),
    ).toThrow(RangeError);
  });

  it.each([2, 3, 4, 5, 13, 20])(
    'adapta el círculo a %i equipos y descansa una vez si es impar',
    (cantidad) => {
      const ids = Array.from({ length: cantidad }, (_, i) => i + 1);
      const plan = generar({ equipoIds: ids });
      const rondas = cantidad % 2 === 0 ? cantidad - 1 : cantidad;
      expect(plan.jornadas).toBe(rondas);
      expect(plan.partidos).toHaveLength((cantidad * (cantidad - 1)) / 2);
      const cruces = plan.partidos.map((p) =>
        [p.equipoLocalId, p.equipoVisitanteId].sort((a, b) => a - b).join('-'),
      );
      expect(new Set(cruces).size).toBe(cruces.length);
      for (const id of ids) {
        const propios = plan.partidos.filter(
          (p) => p.equipoLocalId === id || p.equipoVisitanteId === id,
        );
        expect(propios).toHaveLength(cantidad - 1);
        expect(new Set(propios.map((p) => p.jornada)).size).toBe(cantidad - 1);
        expect(rondas - propios.length).toBe(cantidad % 2);
      }
    },
  );
});
