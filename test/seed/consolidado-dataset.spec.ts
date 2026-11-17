import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildCuotasPagos,
  buildResultadosApertura,
  buildResultadosClausura,
  INDICE_EN_CURSO,
  PARTICIPANTES_POR_EQUIPO,
  PARTIDOS_FINALIZADOS,
  type PartidoBase,
  type Plantillas,
} from '../../prisma/seeds/consolidado-data.js';

/** 12 equipos de 8 jugadores y 66 partidos de prueba (la misma forma que DB-1.2 y DB-3.2). */
function entradas(): { partidos: PartidoBase[]; plantillas: Plantillas } {
  const plantillas: Plantillas = new Map();
  for (let e = 1; e <= 12; e++) plantillas.set(e, Array.from({ length: 8 }, (_, j) => e * 100 + j + 1));
  const partidos: PartidoBase[] = [];
  for (let k = 0; k < 66; k++) {
    partidos.push({
      id: 500 + k,
      inicio: new Date(Date.UTC(2026, 10, 7 + 7 * Math.floor(k / 6), 14, 0)),
      localId: (k % 12) + 1,
      visitanteId: ((k + 5) % 12) + 1,
    });
  }
  return { partidos, plantillas };
}
const sumar = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('DB-1.4 · marcadores y estadísticas de Apertura 2026', () => {
  const { partidos, plantillas } = entradas();
  const res = buildResultadosApertura(partidos, plantillas);

  it('18 Finalizados (jornadas 1 a 3) y 1 En curso (primer partido de la jornada 4)', () => {
    expect(res).toHaveLength(PARTIDOS_FINALIZADOS + 1);
    expect(res.filter((r) => r.estado === 'FINALIZADO')).toHaveLength(18);
    expect(res.filter((r) => r.estado === 'EN_CURSO')).toHaveLength(1);
    expect(res[INDICE_EN_CURSO].partidoId).toBe(partidos[INDICE_EN_CURSO].id);
    expect(res.map((r) => r.partidoId)).toEqual(partidos.slice(0, 19).map((p) => p.id));
  });

  it('los goles de las estadísticas de cada lado suman el marcador del partido', () => {
    for (const r of res) {
      const p = partidos.find((x) => x.id === r.partidoId)!;
      const local = new Set(plantillas.get(p.localId));
      const golesLocal = sumar(r.estadisticas.filter((e) => local.has(e.jugadorId)).map((e) => e.goles));
      const golesVisitante = sumar(r.estadisticas.filter((e) => !local.has(e.jugadorId)).map((e) => e.goles));
      expect(golesLocal).toBe(r.golesLocal);
      expect(golesVisitante).toBe(r.golesVisitante);
    }
  });

  it('cada partido tiene 7 participantes por equipo y una estadística por participante', () => {
    for (const r of res) {
      expect(r.participantes).toHaveLength(2 * PARTICIPANTES_POR_EQUIPO);
      expect(r.estadisticas).toHaveLength(2 * PARTICIPANTES_POR_EQUIPO);
      expect(new Set(r.estadisticas.map((e) => e.jugadorId)).size).toBe(r.estadisticas.length);
      expect(new Set(r.participantes.map((x) => x.jugadorId))).toEqual(new Set(r.estadisticas.map((e) => e.jugadorId)));
    }
  });

  it('las asistencias no superan los goles de su equipo y ningún valor es negativo', () => {
    for (const r of res) {
      const p = partidos.find((x) => x.id === r.partidoId)!;
      const local = new Set(plantillas.get(p.localId));
      const asistLocal = sumar(r.estadisticas.filter((e) => local.has(e.jugadorId)).map((e) => e.asistencias));
      const asistVisitante = sumar(r.estadisticas.filter((e) => !local.has(e.jugadorId)).map((e) => e.asistencias));
      expect(asistLocal).toBeLessThanOrEqual(r.golesLocal);
      expect(asistVisitante).toBeLessThanOrEqual(r.golesVisitante);
      for (const e of r.estadisticas) {
        expect(e.goles).toBeGreaterThanOrEqual(0);
        expect(e.asistencias).toBeGreaterThanOrEqual(0);
        expect(e.tarjetas).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('el partido 12 conserva la fila que sembró DB-9.1 (1 gol, 0 asistencias, 1 tarjeta del primer jugador local)', () => {
    const r = res[11];
    const primero = plantillas.get(partidos[11].localId)![0];
    expect(r.estadisticas.find((e) => e.jugadorId === primero)).toEqual({ jugadorId: primero, goles: 1, asistencias: 0, tarjetas: 1 });
  });

  it('hay variedad de resultados: empates, un 0-0, goleadas y victorias de visitante', () => {
    const fin = res.filter((r) => r.estado === 'FINALIZADO');
    expect(fin.some((r) => r.golesLocal === r.golesVisitante && r.golesLocal > 0)).toBe(true);
    expect(fin.some((r) => r.golesLocal === 0 && r.golesVisitante === 0)).toBe(true);
    expect(fin.some((r) => r.golesLocal >= 3)).toBe(true);
    expect(fin.some((r) => r.golesVisitante > r.golesLocal)).toBe(true);
  });

  it('tiempos reales coherentes: inicio real tras el inicio programado y fin real tras el inicio real; En curso sin fin', () => {
    for (const r of res) {
      const p = partidos.find((x) => x.id === r.partidoId)!;
      expect(r.inicioReal.getTime()).toBeGreaterThan(p.inicio.getTime());
      if (r.estado === 'FINALIZADO') expect(r.finReal!.getTime()).toBeGreaterThan(r.inicioReal.getTime());
      else expect(r.finReal).toBe(null);
    }
  });

  it('el partido En curso tiene marcador parcial 1-0', () => {
    expect([res[18].golesLocal, res[18].golesVisitante]).toEqual([1, 0]);
  });

  it('exige 7 jugadores por equipo', () => {
    const corta: Plantillas = new Map(plantillas);
    corta.set(partidos[0].localId, [1, 2, 3]);
    expect(() => buildResultadosApertura(partidos, corta)).toThrow();
  });
});

describe('DB-1.4 · Clausura 2025', () => {
  const { plantillas } = entradas();
  const dos: PartidoBase[] = [
    { id: 900, inicio: new Date('2025-10-04T14:00:00Z'), localId: 1, visitanteId: 2 },
    { id: 901, inicio: new Date('2025-10-04T15:30:00Z'), localId: 3, visitanteId: 4 },
  ];
  it('2 partidos Finalizados con marcadores 2-1 y 0-0 y estadísticas coherentes', () => {
    const r = buildResultadosClausura(dos, plantillas);
    expect(r.map((x) => x.estado)).toEqual(['FINALIZADO', 'FINALIZADO']);
    expect(r.map((x) => [x.golesLocal, x.golesVisitante])).toEqual([[2, 1], [0, 0]]);
    expect(sumar(r[0].estadisticas.map((e) => e.goles))).toBe(3);
    expect(sumar(r[1].estadisticas.map((e) => e.goles))).toBe(0);
  });
  it('rechaza una cantidad de partidos distinta de 2', () => {
    expect(() => buildResultadosClausura(dos.slice(0, 1), plantillas)).toThrow();
  });
});

describe('DB-1.4 · cuotas y pagos de Apertura 2026', () => {
  const { cuotas, pagos } = buildCuotasPagos();
  const montoDe = (ref: string, estados: string[]) =>
    pagos.filter((p) => p.cuotaRef === ref && estados.includes(p.estado)).reduce((s, p) => s + Number(p.monto), 0);

  it('equipo 4 y del 7 al 12 no tienen cuotas; solo hay cuotas de los equipos 1, 2, 3, 5 y 6', () => {
    expect([...new Set(cuotas.map((c) => c.equipoIndice))].sort()).toEqual([1, 2, 3, 5, 6]);
  });

  it('equipo 1: todo pagado y verificado', () => {
    for (const c of cuotas.filter((x) => x.equipoIndice === 1)) {
      expect(montoDe(c.ref, ['VERIFICADO'])).toBe(Number(c.monto));
      expect(montoDe(c.ref, ['PENDIENTE', 'RECHAZADO'])).toBe(0);
    }
  });

  it('equipo 2: saldo con vencimiento futuro', () => {
    const c = cuotas.find((x) => x.ref === 'E2-INSCRIPCION')!;
    expect(montoDe(c.ref, ['VERIFICADO'])).toBe(40);
    expect(c.fechaVencimiento > '2027-01-01').toBe(true);
  });

  it('equipo 3: saldo con vencimiento pasado y un pago Pendiente de 50 que no reduce el saldo', () => {
    const c = cuotas.find((x) => x.ref === 'E3-INSCRIPCION')!;
    expect(c.fechaVencimiento < '2026-11-01').toBe(true);
    expect(montoDe(c.ref, ['VERIFICADO'])).toBe(30);
    expect(montoDe(c.ref, ['PENDIENTE'])).toBe(50);
  });

  it('equipo 5: inscripción 100 verificada; arbitraje 25.50 con Pendiente 25.50 y Rechazado 10.00 con motivo de 20+ caracteres', () => {
    expect(montoDe('E5-INSCRIPCION', ['VERIFICADO'])).toBe(100);
    expect(montoDe('E5-ARBITRAJE', ['PENDIENTE'])).toBe(25.5);
    expect(montoDe('E5-ARBITRAJE', ['RECHAZADO'])).toBe(10);
    const rechazado = pagos.find((p) => p.estado === 'RECHAZADO')!;
    expect(rechazado.motivoRechazo!.trim().length).toBeGreaterThanOrEqual(20);
  });

  it('equipo 6 tiene pagos propios', () => {
    expect(pagos.filter((p) => p.cuotaRef.startsWith('E6-'))).toHaveLength(2);
  });

  it('ningún pago deja Pendiente + Verificado por encima del monto de su cuota', () => {
    for (const c of cuotas) expect(montoDe(c.ref, ['PENDIENTE', 'VERIFICADO'])).toBeLessThanOrEqual(Number(c.monto));
  });

  it('los pagos resueltos traen cuándo se resolvieron; los Pendientes no; solo los Rechazados traen motivo', () => {
    for (const p of pagos) {
      expect(p.verificadoEn === null).toBe(p.estado === 'PENDIENTE');
      expect(p.motivoRechazo !== null).toBe(p.estado === 'RECHAZADO');
    }
  });

  it('claves de comprobante únicas y cada pago apunta a una cuota del dataset', () => {
    expect(new Set(pagos.map((p) => p.comprobanteClave)).size).toBe(pagos.length);
    const refs = new Set(cuotas.map((c) => c.ref));
    for (const p of pagos) expect(refs.has(p.cuotaRef)).toBe(true);
  });

  it('arbitraje solo con partido; inscripción sin partido', () => {
    for (const c of cuotas) expect(c.conPartido).toBe(c.concepto === 'ARBITRAJE');
  });
});

describe('DB-1.4 · determinismo: no depende del día en que se corre', () => {
  it('dos construcciones producen exactamente lo mismo', () => {
    const { partidos, plantillas } = entradas();
    expect(buildResultadosApertura(partidos, plantillas)).toEqual(buildResultadosApertura(partidos, plantillas));
    expect(buildCuotasPagos()).toEqual(buildCuotasPagos());
  });
  it('el código del dataset no lee la hora actual ni números aleatorios', () => {
    const fuente = readFileSync(new URL('../../prisma/seeds/consolidado-data.ts', import.meta.url), 'utf8');
    expect(/Date\.now\(|new Date\(\)|Math\.random/.test(fuente)).toBe(false);
  });
});
