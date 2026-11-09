import { describe, expect, it } from 'vitest';
import { AVISOS_A, AVISOS_B, buildAvisos, LEIDOS_A, PLANTILLAS } from '../../prisma/seeds/avisos-data.js';

const IDS = { a: 'uuid-a', b: 'uuid-b', c: 'uuid-c' };
const avisos = buildAvisos(IDS);
const de = (id: string) => avisos.filter((x) => x.usuarioId === id);

describe('Avisos de prueba (DB-20.1)', () => {
  it('A tiene 45 avisos: 20 leídos y 25 sin leer', () => {
    expect(de(IDS.a)).toHaveLength(AVISOS_A);
    expect(de(IDS.a).filter((x) => x.leidoEn !== null)).toHaveLength(LEIDOS_A);
    expect(de(IDS.a).filter((x) => x.leidoEn === null)).toHaveLength(25);
  });

  it('B tiene 2 avisos y C ninguno', () => {
    expect(de(IDS.b)).toHaveLength(AVISOS_B);
    expect(de(IDS.c)).toHaveLength(0);
  });

  it('la clave de idempotencia es única por usuario y está presente en todos', () => {
    const claves = avisos.map((x) => `${x.usuarioId}|${x.claveIdempotencia}`);
    expect(new Set(claves).size).toBe(avisos.length);
    for (const x of avisos) expect(x.claveIdempotencia.length).toBeLessThanOrEqual(100);
  });

  it('cada tipo corresponde a su módulo (contrato de H20)', () => {
    const esperado: Record<string, string> = {
      PARTIDO_MODIFICADO: 'CALENDARIO', JORNADA_PUBLICADA: 'CALENDARIO',
      CUOTA_REGISTRADA: 'PAGOS', PAGO_REGISTRADO: 'PAGOS',
      RESULTADO_FINALIZADO: 'RESULTADOS', RESULTADO_CORREGIDO: 'RESULTADOS',
    };
    for (const x of avisos) expect(x.moduloOrigen).toBe(esperado[x.tipo]);
    expect(new Set(PLANTILLAS.map((p) => p.tipo)).size).toBe(6);
  });

  it('título y mensaje respetan los límites de la tabla', () => {
    for (const x of avisos) {
      expect(x.titulo.trim().length).toBeGreaterThan(0);
      expect(x.titulo.length).toBeLessThanOrEqual(120);
      expect(x.mensaje.trim().length).toBeGreaterThan(0);
      expect(x.mensaje.length).toBeLessThanOrEqual(500);
    }
  });

  it('la lectura nunca es anterior a la creación y los datos pesan menos de 2048 bytes', () => {
    for (const x of avisos) {
      if (x.leidoEn) expect(x.leidoEn.getTime()).toBeGreaterThanOrEqual(x.creadoEn.getTime());
      if (x.datos) expect(JSON.stringify(x.datos).length).toBeLessThanOrEqual(2048);
    }
  });

  it('es determinista: dos corridas dan lo mismo', () => {
    expect(JSON.stringify(buildAvisos(IDS))).toBe(JSON.stringify(buildAvisos(IDS)));
  });
});
