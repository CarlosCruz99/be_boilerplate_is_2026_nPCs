/**
 * DB-3.2 · Generador PURO del calendario de prueba (sin Prisma ni base de datos).
 *
 * Método del círculo con 12 equipos: 11 rondas de 6 partidos, cada par una sola
 * vez (solo hay partido de ida). Es determinista: mismas entradas, mismo calendario.
 * Quien escribe en la base es prisma/seed-calendario.ts.
 */

export const PRIMERA_JORNADA = '2026-11-07'; // sábado
export const DIAS_ENTRE_JORNADAS = 7;
/** Turnos en minutos desde las 00:00 UTC: 14:00, 15:30 y 17:00 UTC = 08:00, 09:30 y 11:00 en El Salvador. */
export const TURNOS_UTC_MIN = [14 * 60, 15 * 60 + 30, 17 * 60];
export const DURACION_MIN = 90;
export const CANCHAS = [
  { nombre: 'Cancha 1', direccion: 'Colonia Escalón, San Salvador (dirección ficticia)' },
  { nombre: 'Cancha 2', direccion: 'Colonia Médica, San Salvador (dirección ficticia)' },
];
/** Las jornadas 1 a 4 nacen Publicadas; de la 5 a la 11, en Borrador. */
export const ULTIMA_JORNADA_PUBLICADA = 4;
/** DB-16.1: momento (fijo, para que el seed sea reproducible) en que se "publicaron" las jornadas 1 a 4. */
export const PUBLICADA_EN_SEED = new Date('2026-11-06T18:00:00Z');

export interface JornadaCalendario {
  numero: number;
  estado: 'PUBLICADA' | 'BORRADOR';
}

export interface PartidoCalendario {
  jornada: number;
  turno: number; // 0, 1, 2
  cancha: number; // índice en CANCHAS: 0 o 1
  localId: number;
  visitanteId: number;
  arbitroId: string;
  inicio: Date;
  fin: Date;
}

export interface Calendario {
  jornadas: JornadaCalendario[];
  partidos: PartidoCalendario[];
}

/**
 * @param equipoIds ids de los 12 equipos INSCRITO (se ordenan por id).
 * @param arbitroIds ids de los 4 árbitros, en el orden en que se reparten.
 */
export function buildCalendario(equipoIds: number[], arbitroIds: string[]): Calendario {
  if (equipoIds.length !== 12) throw new Error(`Se necesitan 12 equipos y llegaron ${equipoIds.length}.`);
  if (arbitroIds.length < CANCHAS.length) throw new Error('Se necesitan al menos tantos árbitros como canchas.');

  const base = new Date(`${PRIMERA_JORNADA}T00:00:00Z`).getTime();
  const MIN = 60_000;
  const DIA = 24 * 60 * MIN;

  let arreglo = [...equipoIds].sort((a, b) => a - b);
  const jornadas: JornadaCalendario[] = [];
  const partidos: PartidoCalendario[] = [];

  for (let r = 0; r < 11; r++) {
    jornadas.push({ numero: r + 1, estado: r + 1 <= ULTIMA_JORNADA_PUBLICADA ? 'PUBLICADA' : 'BORRADOR' });

    for (let i = 0; i < 6; i++) {
      const a = arreglo[i];
      const b = arreglo[11 - i];
      const [localId, visitanteId] = (i + r) % 2 === 0 ? [a, b] : [b, a]; // el local se alterna
      const turno = Math.floor(i / 2);
      const cancha = i % 2;
      // Orden por jornada, turno y cancha: el partido k = r*6 + i. Los dos
      // partidos simultáneos de un turno son consecutivos, así que sus árbitros son distintos.
      const k = r * 6 + i;
      const inicioMs = base + r * DIAS_ENTRE_JORNADAS * DIA + TURNOS_UTC_MIN[turno] * MIN;
      partidos.push({
        jornada: r + 1,
        turno,
        cancha,
        localId,
        visitanteId,
        arbitroId: arbitroIds[k % arbitroIds.length],
        inicio: new Date(inicioMs),
        fin: new Date(inicioMs + DURACION_MIN * MIN),
      });
    }
    // Se fija el primero y los otros 11 rotan una posición.
    arreglo = [arreglo[0], arreglo[11], ...arreglo.slice(1, 11)];
  }
  return { jornadas, partidos };
}
