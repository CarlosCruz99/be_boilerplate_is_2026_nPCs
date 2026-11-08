import { describe, expect, it } from 'vitest';
import { buildCalendario, CANCHAS } from '../../prisma/seeds/calendario-data.js';

const EQUIPOS = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112];
const ARBITROS = ['arb-a', 'arb-b', 'arb-c', 'arb-d'];
const cal = buildCalendario([...EQUIPOS].reverse(), ARBITROS); // desordenados a propósito

const porEquipo = (id: number) => cal.partidos.filter((p) => p.localId === id || p.visitanteId === id);

describe('Calendario de prueba (DB-3.2)', () => {
  it('genera 11 jornadas y 66 partidos, 6 por jornada', () => {
    expect(cal.jornadas).toHaveLength(11);
    expect(cal.partidos).toHaveLength(66);
    for (let j = 1; j <= 11; j++) expect(cal.partidos.filter((p) => p.jornada === j)).toHaveLength(6);
  });

  it('jornadas 1 a 4 Publicadas y 5 a 11 en Borrador', () => {
    expect(cal.jornadas.filter((j) => j.estado === 'PUBLICADA').map((j) => j.numero)).toEqual([1, 2, 3, 4]);
    expect(cal.jornadas.filter((j) => j.estado === 'BORRADOR')).toHaveLength(7);
  });

  it('cada equipo juega exactamente 11 partidos y 1 por jornada', () => {
    for (const id of EQUIPOS) {
      const ps = porEquipo(id);
      expect(ps).toHaveLength(11);
      expect(new Set(ps.map((p) => p.jornada)).size).toBe(11);
    }
  });

  it('cada par de equipos aparece exactamente una vez (solo ida)', () => {
    const pares = cal.partidos.map((p) => [p.localId, p.visitanteId].sort((a, b) => a - b).join('-'));
    expect(new Set(pares).size).toBe(66);
  });

  it('nadie juega contra sí mismo', () => {
    expect(cal.partidos.every((p) => p.localId !== p.visitanteId)).toBe(true);
  });

  it('cada árbitro tiene 16 o 17 partidos', () => {
    for (const a of ARBITROS) {
      const n = cal.partidos.filter((p) => p.arbitroId === a).length;
      expect([16, 17]).toContain(n);
    }
  });

  it('ningún árbitro ni cancha tiene dos partidos a la misma hora', () => {
    const arb = cal.partidos.map((p) => `${p.arbitroId}|${p.inicio.toISOString()}`);
    const can = cal.partidos.map((p) => `${p.cancha}|${p.inicio.toISOString()}`);
    expect(new Set(arb).size).toBe(66);
    expect(new Set(can).size).toBe(66);
  });

  it('fechas: jornada 1 el sábado 2026-11-07 y jornada 11 el 2027-01-16; cada una +7 días', () => {
    const j = (n: number) => cal.partidos.find((p) => p.jornada === n)!.inicio;
    expect(j(1).toISOString().slice(0, 10)).toBe('2026-11-07');
    expect(j(11).toISOString().slice(0, 10)).toBe('2027-01-16');
    expect(j(2).getTime() - j(1).getTime()).toBe(7 * 24 * 3600_000);
  });

  it('turnos 08:00, 09:30 y 11:00 de El Salvador (14:00, 15:30 y 17:00 UTC), 2 canchas por turno', () => {
    const horas = [...new Set(cal.partidos.filter((p) => p.jornada === 1).map((p) => p.inicio.toISOString().slice(11, 16)))];
    expect(horas).toEqual(['14:00', '15:30', '17:00']);
    expect(CANCHAS).toHaveLength(2);
    const j1 = cal.partidos.filter((p) => p.jornada === 1);
    expect(j1.map((p) => p.cancha)).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('cada partido dura 90 minutos', () => {
    expect(cal.partidos.every((p) => p.fin.getTime() - p.inicio.getTime() === 90 * 60_000)).toBe(true);
  });

  it('el árbitro del partido k (por jornada, turno y cancha) es arbitros[k % 4]', () => {
    cal.partidos.forEach((p, k) => expect(p.arbitroId).toBe(ARBITROS[k % 4]));
  });

  it('es determinista y no depende del orden de entrada', () => {
    expect(buildCalendario(EQUIPOS, ARBITROS)).toEqual(cal);
  });

  it('rechaza una cantidad de equipos distinta de 12', () => {
    expect(() => buildCalendario(EQUIPOS.slice(0, 10), ARBITROS)).toThrow();
  });
});
