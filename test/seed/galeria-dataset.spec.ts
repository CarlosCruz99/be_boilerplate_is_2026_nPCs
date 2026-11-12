import { describe, expect, it } from 'vitest';
import {
  buildGaleria, LIMITE_ACTIVOS, MAX_FOTO_BYTES, MAX_VIDEO_BYTES,
} from '../../prisma/seeds/galeria-data.js';

const items = buildGaleria({ treinta: 100, uno: 200 });
const de = (id: number) => items.filter((x) => x.partidoId === id);

describe('Galería de prueba (DB-17.1)', () => {
  it('un partido con 30 elementos y otro con uno', () => {
    expect(de(100)).toHaveLength(LIMITE_ACTIVOS);
    expect(de(200)).toHaveLength(1);
    expect(items).toHaveLength(31);
  });

  it('el partido de 30 tiene 25 fotos y 5 videos', () => {
    expect(de(100).filter((x) => x.tipo === 'FOTO')).toHaveLength(25);
    expect(de(100).filter((x) => x.tipo === 'VIDEO')).toHaveLength(5);
  });

  it('las claves de almacenamiento son únicas', () => {
    expect(new Set(items.map((x) => x.storageKey)).size).toBe(items.length);
  });

  it('formato y tamaño respetan los límites (5 MiB fotos, 50 MiB videos)', () => {
    for (const x of items) {
      if (x.tipo === 'FOTO') {
        expect(['image/jpeg', 'image/png']).toContain(x.mimeType);
        expect(x.tamanoBytes).toBeGreaterThan(0);
        expect(x.tamanoBytes).toBeLessThanOrEqual(MAX_FOTO_BYTES);
      } else {
        expect(x.mimeType).toBe('video/mp4');
        expect(x.tamanoBytes).toBeGreaterThan(0);
        expect(x.tamanoBytes).toBeLessThanOrEqual(MAX_VIDEO_BYTES);
      }
    }
  });

  it('las descripciones no pasan de 200 caracteres y una llega justo al límite', () => {
    for (const x of items) if (x.descripcion) expect(x.descripcion.length).toBeLessThanOrEqual(200);
    expect(items.some((x) => x.descripcion?.length === 200)).toBe(true);
  });

  it('hay fechas repetidas para probar el desempate de la paginación', () => {
    const fechas = de(100).map((x) => x.creadoEn.getTime());
    expect(new Set(fechas).size).toBeLessThan(fechas.length);
  });

  it('es determinista: dos corridas dan lo mismo', () => {
    expect(JSON.stringify(buildGaleria({ treinta: 100, uno: 200 }))).toBe(JSON.stringify(items));
  });
});
