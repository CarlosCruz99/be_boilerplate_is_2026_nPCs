/**
 * DB-1.2 · Datos de prueba de H1 (A.2 del documento de historias).
 *
 * Este archivo es PURO: no importa Prisma ni toca la base. Solo arma la
 * descripción del dataset, de modo que se puede probar sin base de datos
 * (test/seed/h1-dataset.spec.ts). Quien escribe en la base es h1.ts.
 *
 * Todo es determinista (sin números aleatorios): correr el seed dos veces
 * produce exactamente los mismos registros.
 */

export const PASSWORD_PRUEBA = 'Liga2026!';
export const ORGANIZADOR_EMAIL = 'organizador@liga.test';
export const FOTO_EJEMPLO = '/uploads/seed/jugador-ejemplo.png';

export type Rol = 'JUGADOR' | 'ARBITRO' | 'ORGANIZADOR';
export type EstadoEquipo = 'PENDIENTE' | 'INSCRITO' | 'RECHAZADO';

export interface UsuarioSeed {
  email: string;
  nombre: string;
  rol: Rol;
  fechaNacimiento: string; // AAAA-MM-DD
}

export interface JugadorSeed {
  identificacion: string; // SEED-0001, SEED-0002...
  nombreCompleto: string;
  fechaNacimiento: string; // AAAA-MM-DD
  /** Correo de la cuenta Jugador ligada a esta ficha (jugador.usuario_id). */
  usuarioEmail?: string;
}

export interface EquipoSeed {
  nombre: string;
  estado: EstadoEquipo;
  capitanEmail: string;
  motivoRechazo?: string;
  fechaValidacion?: string; // ISO 8601, solo si ya fue decidido
  jugadores: JugadorSeed[];
}

export interface TemporadaSeed {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  maxEquipos: number;
  inscripcionAbierta: boolean;
  actual: boolean;
  equipos: EquipoSeed[];
}

export interface DatasetH1 {
  usuarios: UsuarioSeed[];
  temporadas: TemporadaSeed[];
}

const NOMBRES = [
  'Luis', 'Ana', 'Carlos', 'María', 'José', 'Sofía', 'Miguel', 'Lucía', 'Diego', 'Valeria',
  'Andrés', 'Camila', 'Mateo', 'Daniela', 'Jorge', 'Paola', 'Ricardo', 'Fernanda', 'Pablo', 'Gabriela',
  'Héctor', 'Natalia', 'Oscar', 'Karla', 'Raúl', 'Ximena', 'Iván', 'Elena', 'Marcos', 'Renata',
];
const APELLIDOS = [
  'Pérez', 'López', 'Martínez', 'García', 'Hernández', 'Ramírez', 'Flores', 'Mejía', 'Rivas', 'Castillo',
  'Aguilar', 'Molina', 'Cruz', 'Ortiz', 'Vásquez', 'Guzmán', 'Mendoza', 'Rojas', 'Argueta', 'Quintanilla',
  'Menjívar', 'Alvarado', 'Portillo', 'Cáceres', 'Linares', 'Bonilla', 'Zelaya', 'Chávez', 'Domínguez', 'Escobar',
];

const MOTIVO_RECHAZO = 'Faltan los documentos de identidad de varios jugadores del equipo.';

function pad(n: number, ancho: number): string {
  return String(n).padStart(ancho, '0');
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Resta años a una fecha AAAA-MM-DD (para "cumple 16 hoy", "tiene 15 años"). */
export function restarAnios(fecha: string, anios: number, diasExtra = 0): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  d.setUTCDate(d.getUTCDate() - diasExtra);
  return d.toISOString().slice(0, 10);
}

/** Fecha de nacimiento fija y adulta (1988 a 2005) para la ficha número n. */
function nacimientoAdulto(n: number): string {
  const anio = 1988 + ((n * 3) % 18);
  const mes = 1 + (n % 12);
  const dia = 1 + ((n * 5) % 28);
  return `${anio}-${pad(mes, 2)}-${pad(dia, 2)}`;
}

function nombrePersona(n: number): string {
  const nombre = NOMBRES[n % NOMBRES.length];
  const apellido = APELLIDOS[(n * 7 + Math.floor(n / NOMBRES.length)) % APELLIDOS.length];
  return `${nombre} ${apellido}`;
}

interface EspecEquipo {
  nombre: string;
  estado: EstadoEquipo;
  jugadores: number;
  motivoRechazo?: string;
  /** Casos especiales de edad. */
  cumple16Hoy?: boolean;
  tieneUnoDe15?: boolean;
}

interface EspecTemporada {
  nombre: string;
  codigo: string; // para los correos: ap26, cl27, cl25
  fechaInicio: string;
  fechaFin: string;
  inscripcionAbierta: boolean;
  actual: boolean;
  fechaValidacion: string;
  equipos: EspecEquipo[];
}

const ESPECIFICACION: EspecTemporada[] = [
  {
    nombre: 'Apertura 2026', codigo: 'ap26',
    fechaInicio: '2026-11-07', fechaFin: '2027-01-16',
    inscripcionAbierta: false, actual: true,
    fechaValidacion: '2026-10-20T15:00:00Z',
    equipos: [
      // 12 Inscritos (de 7 a 15 jugadores; uno con 7 y uno con 15)
      { nombre: 'Tigres FC', estado: 'INSCRITO', jugadores: 7 },
      { nombre: 'Leones FC', estado: 'INSCRITO', jugadores: 15 },
      { nombre: 'Águilas FC', estado: 'INSCRITO', jugadores: 9 },
      { nombre: 'Pumas FC', estado: 'INSCRITO', jugadores: 10 },
      { nombre: 'Halcones FC', estado: 'INSCRITO', jugadores: 11 },
      { nombre: 'Lobos FC', estado: 'INSCRITO', jugadores: 12 },
      { nombre: 'Osos FC', estado: 'INSCRITO', jugadores: 13 },
      { nombre: 'Toros FC', estado: 'INSCRITO', jugadores: 14 },
      { nombre: 'Cobras FC', estado: 'INSCRITO', jugadores: 8 },
      { nombre: 'Jaguares FC', estado: 'INSCRITO', jugadores: 10 },
      { nombre: 'Pirañas FC', estado: 'INSCRITO', jugadores: 12 },
      { nombre: 'Rayos FC', estado: 'INSCRITO', jugadores: 9 },
      // 1 Pendiente con 9 jugadores válidos (prueba de "temporada completa").
      // Incluye una jugadora que cumple 16 años hoy.
      { nombre: 'Panteras FC', estado: 'PENDIENTE', jugadores: 9, cumple16Hoy: true },
    ],
  },
  {
    nombre: 'Clausura 2027', codigo: 'cl27',
    fechaInicio: '2027-03-01', fechaFin: '2027-06-30',
    inscripcionAbierta: true, actual: false,
    fechaValidacion: '2026-10-25T15:00:00Z',
    equipos: [
      { nombre: 'Dragones FC', estado: 'INSCRITO', jugadores: 8 },
      { nombre: 'Búhos FC', estado: 'INSCRITO', jugadores: 9 },
      { nombre: 'Zorros FC', estado: 'INSCRITO', jugadores: 10 },
      { nombre: 'Delfines FC', estado: 'INSCRITO', jugadores: 11 },
      { nombre: 'Tiburones FC', estado: 'INSCRITO', jugadores: 8 },
      { nombre: 'Gavilanes FC', estado: 'INSCRITO', jugadores: 9 },
      { nombre: 'Venados FC', estado: 'INSCRITO', jugadores: 12 },
      { nombre: 'Coyotes FC', estado: 'INSCRITO', jugadores: 10 },
      { nombre: 'Cóndores FC', estado: 'INSCRITO', jugadores: 8 },
      { nombre: 'Mapaches FC', estado: 'INSCRITO', jugadores: 9 },
      { nombre: 'Alacranes FC', estado: 'PENDIENTE', jugadores: 9 }, // válido
      { nombre: 'Colibríes FC', estado: 'PENDIENTE', jugadores: 5 }, // pocos jugadores
      { nombre: 'Tucanes FC', estado: 'PENDIENTE', jugadores: 8, tieneUnoDe15: true },
      { nombre: 'Iguanas FC', estado: 'RECHAZADO', jugadores: 8, motivoRechazo: MOTIVO_RECHAZO },
    ],
  },
  {
    nombre: 'Clausura 2025', codigo: 'cl25',
    fechaInicio: '2025-03-01', fechaFin: '2025-06-30',
    inscripcionAbierta: false, actual: false,
    fechaValidacion: '2025-02-20T15:00:00Z',
    equipos: [
      { nombre: 'Tigres FC', estado: 'INSCRITO', jugadores: 8 },
      { nombre: 'Leones FC', estado: 'INSCRITO', jugadores: 8 },
      { nombre: 'Águilas FC', estado: 'INSCRITO', jugadores: 8 },
      { nombre: 'Pumas FC', estado: 'INSCRITO', jugadores: 8 },
    ],
  },
];

/**
 * @param hoy fecha de hoy (AAAA-MM-DD, hora de El Salvador). Solo la usan los
 *            casos "cumple 16 años hoy" y "tiene 15 años".
 */
export function buildH1Dataset(hoy: string): DatasetH1 {
  const usuarios: UsuarioSeed[] = [];
  const temporadas: TemporadaSeed[] = [];

  usuarios.push({
    email: ORGANIZADOR_EMAIL, nombre: 'Olga Organizadora', rol: 'ORGANIZADOR', fechaNacimiento: '1985-05-10',
  });
  ['Carlos Mena', 'Rosa Soto', 'Jorge Gil', 'Patricia Díaz'].forEach((nombre, i) => {
    usuarios.push({
      email: `arbitro${i + 1}@liga.test`, nombre, rol: 'ARBITRO', fechaNacimiento: `198${i}-0${i + 3}-15`,
    });
  });

  let ficha = 0; // contador global de fichas: SEED-0001...
  let capitanes = 0;
  let cuentasJugador = 0;

  for (const t of ESPECIFICACION) {
    const equipos: EquipoSeed[] = [];
    for (const e of t.equipos) {
      capitanes += 1;
      const capitanEmail = `capitan.${slug(e.nombre)}.${t.codigo}@liga.test`;
      usuarios.push({
        email: capitanEmail,
        nombre: `Capitán ${nombrePersona(200 + capitanes)}`,
        rol: 'JUGADOR',
        fechaNacimiento: nacimientoAdulto(200 + capitanes),
      });

      const jugadores: JugadorSeed[] = [];
      for (let i = 0; i < e.jugadores; i++) {
        ficha += 1;
        let fechaNacimiento = nacimientoAdulto(ficha);
        if (e.cumple16Hoy && i === 0) fechaNacimiento = restarAnios(hoy, 16);
        if (e.tieneUnoDe15 && i === 0) fechaNacimiento = restarAnios(hoy, 15, 180);
        const j: JugadorSeed = {
          identificacion: `SEED-${pad(ficha, 4)}`,
          nombreCompleto: nombrePersona(ficha),
          fechaNacimiento,
        };
        // 12 cuentas Jugador ligadas: la primera ficha de cada Inscrito de Apertura 2026.
        if (t.codigo === 'ap26' && e.estado === 'INSCRITO' && i === 0) {
          cuentasJugador += 1;
          j.usuarioEmail = `jugador${pad(cuentasJugador, 2)}@liga.test`;
          usuarios.push({
            email: j.usuarioEmail, nombre: j.nombreCompleto, rol: 'JUGADOR', fechaNacimiento: j.fechaNacimiento,
          });
        }
        jugadores.push(j);
      }

      const decidido = e.estado !== 'PENDIENTE';
      equipos.push({
        nombre: e.nombre,
        estado: e.estado,
        capitanEmail,
        motivoRechazo: e.motivoRechazo,
        fechaValidacion: decidido ? t.fechaValidacion : undefined,
        jugadores,
      });
    }
    temporadas.push({
      nombre: t.nombre,
      fechaInicio: t.fechaInicio,
      fechaFin: t.fechaFin,
      maxEquipos: 12,
      inscripcionAbierta: t.inscripcionAbierta,
      actual: t.actual,
      equipos,
    });
  }
  return { usuarios, temporadas };
}
