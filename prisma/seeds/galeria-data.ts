/**
 * DB-17.1: datos de prueba de la galería. Módulo puro (no toca la base).
 * Un partido con 30 elementos activos, otro con uno y un tercero sin ninguno.
 * Los archivos NO existen físicamente: solo se siembran los metadatos.
 */
export type TipoContenido = 'FOTO' | 'VIDEO';

export interface ContenidoSeed {
  partidoId: number;
  tipo: TipoContenido;
  storageKey: string;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: number;
  descripcion: string | null;
  creadoEn: Date;
}

export const LIMITE_ACTIVOS = 30;
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const BASE_FECHA = new Date('2026-11-01T15:00:00Z');

function contenido(partidoId: number, i: number, tipoVideo: boolean): ContenidoSeed {
  const n = String(i).padStart(2, '0');
  const mime = tipoVideo ? 'video/mp4' : i % 2 === 0 ? 'image/png' : 'image/jpeg';
  const ext = tipoVideo ? 'mp4' : i % 2 === 0 ? 'png' : 'jpg';
  return {
    partidoId,
    tipo: tipoVideo ? 'VIDEO' : 'FOTO',
    storageKey: `seed/galeria/p${partidoId}-${n}.${ext}`,
    nombreOriginal: `${tipoVideo ? 'video' : 'foto'}-${n}.${ext}`,
    mimeType: mime,
    tamanoBytes: tipoVideo ? 20 * 1024 * 1024 + i * 100_000 : 200_000 + i * 10_000,
    // El elemento 10 lleva una descripción de exactamente 200 caracteres (límite); cada tercero no lleva.
    descripcion: i === 10 ? 'x'.repeat(200) : i % 3 === 0 ? null : `Momento ${i} del partido`,
    // Grupos de 3 con la misma fecha: obliga a la paginación a desempatar por id.
    creadoEn: new Date(BASE_FECHA.getTime() + Math.floor((i - 1) / 3) * 60_000),
  };
}

export function buildGaleria(ids: { treinta: number; uno: number }): ContenidoSeed[] {
  const items: ContenidoSeed[] = [];
  for (let i = 1; i <= LIMITE_ACTIVOS; i++) items.push(contenido(ids.treinta, i, i % 6 === 0)); // 25 fotos y 5 videos
  items.push(contenido(ids.uno, 1, false));
  return items;
}
