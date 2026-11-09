import type { CrearAvisoDto } from '../../avisos/avisos.contract.js';
import { horarioPublicacion } from './horario-publicacion.js';

export interface PartidoParaAviso {
  inicio: Date;
  cancha: { nombre: string };
  local: { nombre: string; capitanId: string };
  visitante: { nombre: string; capitanId: string };
}

export function avisosPublicacion(
  jornada: { id: number; numero: number },
  partidos: PartidoParaAviso[],
): CrearAvisoDto[] {
  const avisos = new Map<string, CrearAvisoDto>();
  for (const partido of partidos) {
    const { fecha, hora } = horarioPublicacion(partido.inicio);
    for (const [equipo, rival] of [
      [partido.local, partido.visitante],
      [partido.visitante, partido.local],
    ]) {
      // La jornada correcta tiene un solo partido por equipo. Deducir por
      // capitán también protege la unicidad ante datos históricos repetidos.
      if (avisos.has(equipo.capitanId)) continue;
      avisos.set(equipo.capitanId, {
        moduloOrigen: 'CALENDARIO',
        tipo: 'JORNADA_PUBLICADA',
        destinatario: { usuarioId: equipo.capitanId },
        titulo: `Calendario publicado: jornada ${jornada.numero}`,
        mensaje: `Tu equipo juega contra ${rival.nombre} el ${fecha} a las ${hora} en ${partido.cancha.nombre}.`,
        referencia: { tipo: 'JORNADA', id: jornada.id },
        datos: {
          jornada: jornada.numero,
          rival: rival.nombre,
          fecha,
          hora,
          cancha: partido.cancha.nombre,
        },
        claveIdempotencia: `jornada-${jornada.id}-capitan-${equipo.capitanId}`,
      });
    }
  }
  return [...avisos.values()];
}
