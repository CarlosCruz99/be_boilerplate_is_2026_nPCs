import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { buildH1Dataset, FOTO_EJEMPLO, ORGANIZADOR_EMAIL } from './h1-data.js';

/** Fecha de hoy en El Salvador (AAAA-MM-DD). */
function hoyElSalvador(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });
}

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * DB-1.2: temporadas, equipos, jugadores y usuarios de prueba.
 * Idempotente: todo se escribe con upsert sobre una clave natural
 *  - usuario: email
 *  - temporada: nombre
 *  - equipo: (temporada, capitán). Cada equipo tiene su propia cuenta capitana.
 *  - jugador: identificacion
 *  - equipo_jugador: (equipo, jugador)
 */
export async function seedH1(prisma: PrismaClient, passwordHash: string): Promise<void> {
  const { usuarios, temporadas } = buildH1Dataset(hoyElSalvador());

  // 1. Usuarios (organizador, árbitros, capitanes y cuentas de jugador).
  const idPorEmail = new Map<string, string>();
  for (const u of usuarios) {
    const datos = {
      passwordHash,
      isActive: true,
      rol: u.rol,
      nombre: u.nombre,
      fechaNacimiento: dia(u.fechaNacimiento),
    };
    const fila = await prisma.user.upsert({
      where: { email: u.email },
      update: datos,
      create: { email: u.email, ...datos },
      select: { id: true },
    });
    idPorEmail.set(u.email, fila.id);
  }
  const organizadorId = idPorEmail.get(ORGANIZADOR_EMAIL)!;

  // 2. Temporadas, equipos, fichas de jugador y su pertenencia al equipo.
  for (const t of temporadas) {
    const temporada = await prisma.temporada.upsert({
      where: { nombre: t.nombre },
      update: {
        fechaInicio: dia(t.fechaInicio),
        fechaFin: dia(t.fechaFin),
        maxEquipos: t.maxEquipos,
        inscripcionAbierta: t.inscripcionAbierta,
        actual: t.actual,
      },
      create: {
        nombre: t.nombre,
        fechaInicio: dia(t.fechaInicio),
        fechaFin: dia(t.fechaFin),
        maxEquipos: t.maxEquipos,
        inscripcionAbierta: t.inscripcionAbierta,
        actual: t.actual,
      },
    });

    for (const e of t.equipos) {
      const capitanId = idPorEmail.get(e.capitanEmail)!;
      const decidido = e.estado !== 'PENDIENTE';
      const datosEquipo = {
        nombre: e.nombre,
        estado: e.estado,
        motivoRechazo: e.motivoRechazo ?? null,
        validadoPor: decidido ? organizadorId : null,
        fechaValidacion: e.fechaValidacion ? new Date(e.fechaValidacion) : null,
      };
      const equipo = await prisma.equipo.upsert({
        where: { temporadaId_capitanId: { temporadaId: temporada.id, capitanId } },
        update: datosEquipo,
        create: { temporadaId: temporada.id, capitanId, ...datosEquipo },
      });

      for (const j of e.jugadores) {
        const usuarioId = j.usuarioEmail ? idPorEmail.get(j.usuarioEmail) : undefined;
        const datosJugador = {
          nombreCompleto: j.nombreCompleto,
          fechaNacimiento: dia(j.fechaNacimiento),
          fotoUrl: FOTO_EJEMPLO,
          // undefined = no tocar: si QA vincula otra ficha, el seed no la desvincula.
          usuarioId,
        };
        const jugador = await prisma.jugador.upsert({
          where: { identificacion: j.identificacion },
          update: datosJugador,
          create: { identificacion: j.identificacion, ...datosJugador },
        });
        await prisma.equipoJugador.upsert({
          where: { equipoId_jugadorId: { equipoId: equipo.id, jugadorId: jugador.id } },
          update: {},
          create: { equipoId: equipo.id, jugadorId: jugador.id, temporadaId: temporada.id },
        });
      }
    }
  }

  const resumen = temporadas
    .map((t) => `${t.nombre}: ${t.equipos.length} equipos, ${t.equipos.reduce((n, e) => n + e.jugadores.length, 0)} jugadores`)
    .join(' | ');
  console.log(`Seed H1 listo (${usuarios.length} usuarios). ${resumen}`);
}
