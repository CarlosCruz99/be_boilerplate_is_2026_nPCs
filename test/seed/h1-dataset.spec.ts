import { describe, expect, it } from 'vitest';
import { buildH1Dataset, restarAnios } from '../../prisma/seeds/h1-data.js';

const HOY = '2026-11-07';
const ds = buildH1Dataset(HOY);
const temporada = (nombre: string) => ds.temporadas.find((t) => t.nombre === nombre)!;
const cuenta = (t: string, estado: string) =>
  temporada(t).equipos.filter((e) => e.estado === estado).length;
const todasLasFichas = ds.temporadas.flatMap((t) => t.equipos.flatMap((e) => e.jugadores));

describe('Dataset de H1 (DB-1.2)', () => {
  it('Apertura 2026: 12 Inscritos y 1 Pendiente con 9 jugadores', () => {
    expect(cuenta('Apertura 2026', 'INSCRITO')).toBe(12);
    expect(cuenta('Apertura 2026', 'PENDIENTE')).toBe(1);
    const pendiente = temporada('Apertura 2026').equipos.find((e) => e.estado === 'PENDIENTE')!;
    expect(pendiente.jugadores).toHaveLength(9);
  });

  it('Apertura 2026: Inscritos de 7 a 15 jugadores; uno con 7 y uno con 15', () => {
    const n = temporada('Apertura 2026').equipos.filter((e) => e.estado === 'INSCRITO').map((e) => e.jugadores.length);
    expect(Math.min(...n)).toBe(7);
    expect(Math.max(...n)).toBe(15);
    expect(n.filter((x) => x === 7)).toHaveLength(1);
    expect(n.filter((x) => x === 15)).toHaveLength(1);
  });

  it('Clausura 2027: 10 Inscritos, 3 Pendientes y 1 Rechazado con motivo de más de 20 caracteres', () => {
    expect(cuenta('Clausura 2027', 'INSCRITO')).toBe(10);
    expect(cuenta('Clausura 2027', 'PENDIENTE')).toBe(3);
    expect(cuenta('Clausura 2027', 'RECHAZADO')).toBe(1);
    const rechazado = temporada('Clausura 2027').equipos.find((e) => e.estado === 'RECHAZADO')!;
    expect(rechazado.motivoRechazo!.length).toBeGreaterThan(20);
  });

  it('Clausura 2027: pendientes de 9 (válido), 5 y 8 jugadores (uno de 15 años)', () => {
    const p = temporada('Clausura 2027').equipos.filter((e) => e.estado === 'PENDIENTE');
    expect(p.map((e) => e.jugadores.length).sort()).toEqual([5, 8, 9]);
    const de15 = p.find((e) => e.jugadores.length === 8)!.jugadores.filter((j) => j.fechaNacimiento > restarAnios(HOY, 16));
    expect(de15).toHaveLength(1);
    const valido = p.find((e) => e.jugadores.length === 9)!;
    expect(valido.jugadores.every((j) => j.fechaNacimiento <= restarAnios(HOY, 16))).toBe(true);
  });

  it('Clausura 2025: 4 Inscritos', () => {
    expect(cuenta('Clausura 2025', 'INSCRITO')).toBe(4);
    expect(temporada('Clausura 2025').equipos).toHaveLength(4);
  });

  it('Indicadores de cada temporada', () => {
    const a = temporada('Apertura 2026');
    expect([a.actual, a.inscripcionAbierta, a.maxEquipos]).toEqual([true, false, 12]);
    expect(temporada('Clausura 2027').inscripcionAbierta).toBe(true);
    expect(ds.temporadas.filter((t) => t.actual)).toHaveLength(1);
  });

  it('Existe un jugador que cumple 16 años hoy', () => {
    expect(todasLasFichas.filter((j) => j.fechaNacimiento === restarAnios(HOY, 16))).toHaveLength(1);
  });

  it('1 organizador, 4 árbitros y 12 cuentas Jugador ligadas a fichas distintas', () => {
    expect(ds.usuarios.filter((u) => u.rol === 'ORGANIZADOR')).toHaveLength(1);
    expect(ds.usuarios.filter((u) => u.rol === 'ARBITRO')).toHaveLength(4);
    const ligadas = todasLasFichas.filter((j) => j.usuarioEmail);
    expect(ligadas).toHaveLength(12);
    expect(new Set(ligadas.map((j) => j.usuarioEmail)).size).toBe(12);
    const apertura = temporada('Apertura 2026').equipos.filter((e) => e.estado === 'INSCRITO');
    expect(apertura.every((e) => e.jugadores.some((j) => j.usuarioEmail))).toBe(true);
  });

  it('Una cuenta capitana por equipo, con correos únicos', () => {
    const equipos = ds.temporadas.flatMap((t) => t.equipos);
    expect(equipos).toHaveLength(31);
    expect(new Set(equipos.map((e) => e.capitanEmail)).size).toBe(31);
    const emails = ds.usuarios.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('Identificaciones únicas y con el formato permitido (5 a 20; letras, números, guiones)', () => {
    const ids = todasLasFichas.map((j) => j.identificacion);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => /^[A-Za-z0-9-]{5,20}$/.test(i))).toBe(true);
  });

  it('Reglas de datos: nombres de 3 a 120, nacimientos no futuros, equipos de 3 a 50', () => {
    expect(todasLasFichas.every((j) => j.nombreCompleto.length >= 3 && j.nombreCompleto.length <= 120)).toBe(true);
    expect(todasLasFichas.every((j) => j.fechaNacimiento <= HOY)).toBe(true);
    expect(ds.usuarios.every((u) => u.nombre.length >= 3 && u.fechaNacimiento <= HOY)).toBe(true);
    const equipos = ds.temporadas.flatMap((t) => t.equipos);
    expect(equipos.every((e) => e.nombre.length >= 3 && e.nombre.length <= 50)).toBe(true);
  });

  it('Ningún equipo pasa de 15 jugadores y no hay nombres repetidos en una temporada', () => {
    for (const t of ds.temporadas) {
      expect(t.equipos.every((e) => e.jugadores.length <= 15)).toBe(true);
      const nombres = t.equipos.map((e) => e.nombre.toLowerCase());
      expect(new Set(nombres).size).toBe(nombres.length);
    }
  });

  it('Es determinista: dos construcciones dan lo mismo (base de la idempotencia)', () => {
    expect(buildH1Dataset(HOY)).toEqual(buildH1Dataset(HOY));
  });
});
