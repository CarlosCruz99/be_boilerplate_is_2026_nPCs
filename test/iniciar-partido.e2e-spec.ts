import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-5.4: inicio del partido en PostgreSQL', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let arbitro: string;
  let arbitroId: string;
  let otroArbitro: string;
  let organizador: string;
  let organizadorId: string;
  let capitan: string;
  let capitanId: string;
  let jugador: string;
  let temporadaId: number;
  let canchaId: number;
  let partidoId: number;
  let otroCapitanId: string;
  const valores = {
    golesLocal: 2,
    golesVisitante: 1,
    faltasLocal: 4,
    faltasVisitante: 6,
  };
  const client = () => request(app.getHttpServer());
  const ruta = (id = partidoId) => `/api/v1/partidos/${id}/marcador`;
  const guardar = (datos: unknown = valores, token = arbitro) =>
    client().patch(ruta()).auth(token, { type: 'bearer' }).send(datos);

  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (email: string, password = 'Liga2026!') => {
      const r = await client()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const token = r.body.accessToken as string;
      const me = await client()
        .get('/api/v1/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      return { token, id: me.body.id as string };
    };
    const arb = await login('arbitro1@liga.test');
    arbitro = arb.token;
    arbitroId = arb.id;
    otroArbitro = (await login('arbitro2@liga.test')).token;
    const org = await login('organizador@liga.test');
    organizador = org.token;
    organizadorId = org.id;
    const cap = await login('capitan.tigres-fc.ap26@liga.test');
    capitan = cap.token;
    capitanId = cap.id;
    jugador = (await login('demo@example.com', 'Demo1234!')).token;
  }, 20000);

  beforeEach(async () => {
    const t = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2060-01-01','2060-12-31') RETURNING id",
      [`BE54-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE54') RETURNING id",
      [`BE54-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE54',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be54-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE54-${randomUUID()}`, temporadaId, id, organizadorId],
      );
      equipos.push(e.rows[0].id);
    }
    const j = await db.query<{ id: number }>(
      'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
      [temporadaId],
    );
    const p = await db.query<{ id: number }>(
      `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real)
      VALUES ($1,$2,$3,$4,$5,$6,'2060-02-01T14:00:00Z','2060-02-01T15:30:00Z','PROGRAMADO',NULL) RETURNING id`,
      [temporadaId, j.rows[0].id, ...equipos, canchaId, arbitroId],
    );
    partidoId = p.rows[0].id;
  });
  afterEach(async () => {
    await db.query('DELETE FROM bitacora_marcador WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query('DELETE FROM partido WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jornada WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
    await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
    await db.query('DELETE FROM usuario WHERE id=$1', [otroCapitanId]);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  const filasBitacora = async () =>
    (
      await db.query(
        'SELECT * FROM bitacora_marcador WHERE partido_id=$1 ORDER BY id',
        [partidoId],
      )
    ).rows;
  async function comprobarSinCambios() {
    const p = (
      await db.query(
        'SELECT goles_local,goles_visitante,faltas_local,faltas_visitante FROM partido WHERE id=$1',
        [partidoId],
      )
    ).rows[0];
    expect(Object.values(p)).toEqual([0, 0, 0, 0]);
    expect(await filasBitacora()).toHaveLength(0);
  }

  const inicioUrl = (id = partidoId) => `/api/v1/partidos/${id}/iniciar`;
  const iniciar = (token = arbitro) =>
    client().post(inicioUrl()).auth(token, { type: 'bearer' });

  it('inicia con 200, hora del servidor y una instantánea INICIAR; después permite guardar el marcador', async () => {
    const antes = Date.now();
    const r = await iniciar().expect(200);
    expect(r.body).toEqual({
      partidoId,
      estado: 'EN_CURSO',
      inicioReal: expect.any(String),
    });
    expect(Date.parse(r.body.inicioReal)).toBeGreaterThanOrEqual(antes);
    expect(Date.parse(r.body.inicioReal)).toBeLessThanOrEqual(Date.now());
    const p = (await db.query('SELECT * FROM partido WHERE id=$1', [partidoId]))
      .rows[0];
    expect(p.estado).toBe('EN_CURSO');
    expect(p.inicio_real.toISOString()).toBe(r.body.inicioReal);
    expect(p.fin_real).toBeNull();
    const filas = await filasBitacora();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      usuario_id: arbitroId,
      accion: 'INICIAR',
      goles_local: 0,
      goles_visitante: 0,
      faltas_local: 0,
      faltas_visitante: 0,
    });
    expect(filas[0].fecha_registro.toISOString()).toBe(r.body.inicioReal);
    await guardar().expect(200);
    expect((await filasBitacora()).map((fila) => fila.accion)).toEqual([
      'INICIAR',
      'ACTUALIZAR',
    ]);
  });

  it('conserva el marcador al iniciar y acepta un objeto vacío', async () => {
    await db.query(
      'UPDATE partido SET goles_local=2,faltas_visitante=3 WHERE id=$1',
      [partidoId],
    );
    await iniciar().send({}).expect(200);
    expect((await filasBitacora())[0]).toMatchObject({
      goles_local: 2,
      faltas_visitante: 3,
    });
    const p = (
      await db.query(
        'SELECT goles_local,faltas_visitante FROM partido WHERE id=$1',
        [partidoId],
      )
    ).rows[0];
    expect(p).toEqual({ goles_local: 2, faltas_visitante: 3 });
  });

  it.each(['EN_CURSO', 'FINALIZADO', 'CANCELADO'])(
    'rechaza %s con 409 y conserva estado y tiempos',
    async (estado) => {
      await db.query(
        "UPDATE partido SET estado=$2::estado_partido,inicio_real=CASE WHEN $2 IN ('EN_CURSO','FINALIZADO') THEN inicio ELSE NULL END,fin_real=CASE WHEN $2='FINALIZADO' THEN fin ELSE NULL END WHERE id=$1",
        [partidoId, estado],
      );
      const anterior = (
        await db.query('SELECT * FROM partido WHERE id=$1', [partidoId])
      ).rows[0];
      const r = await iniciar().expect(409);
      const nombres: Record<string, string> = {
        EN_CURSO: 'En curso',
        FINALIZADO: 'Finalizado',
        CANCELADO: 'Cancelado',
      };
      expect(r.body.message).toBe(
        `No se puede cambiar de “${nombres[estado]}” a “En curso”.`,
      );
      expect(
        (await db.query('SELECT * FROM partido WHERE id=$1', [partidoId]))
          .rows[0],
      ).toEqual(anterior);
      expect(await filasBitacora()).toHaveLength(0);
    },
  );

  it('rechaza un segundo inicio y no reemplaza la hora ni duplica la bitácora', async () => {
    const r = await iniciar().expect(200);
    await iniciar().expect(409);
    const p = (
      await db.query('SELECT inicio_real FROM partido WHERE id=$1', [partidoId])
    ).rows[0];
    expect(p.inicio_real.toISOString()).toBe(r.body.inicioReal);
    expect(await filasBitacora()).toHaveLength(1);
  });

  it('rechaza otros árbitros, organizador, capitán y jugador', async () => {
    for (const token of [otroArbitro, organizador, capitan, jugador]) {
      const r = await iniciar(token).expect(403);
      expect(r.body).toEqual({
        mensaje: 'No tienes permiso para esta acción.',
      });
    }
    await comprobarSinCambios();
    expect(
      (
        await db.query('SELECT estado,inicio_real FROM partido WHERE id=$1', [
          partidoId,
        ])
      ).rows[0],
    ).toEqual({ estado: 'PROGRAMADO', inicio_real: null });
  });

  it('exige sesión, valida id y devuelve 404 para partido inexistente', async () => {
    await client().post(inicioUrl()).expect(401);
    await iniciar('invalido').expect(401);
    await client()
      .post(inicioUrl(2147483647))
      .auth(arbitro, { type: 'bearer' })
      .expect(404);
    await client()
      .post('/api/v1/partidos/abc/iniciar')
      .auth(arbitro, { type: 'bearer' })
      .expect(400);
    await comprobarSinCambios();
  });

  it.each([
    { inicioReal: '2000-01-01T00:00:00Z' },
    { estado: 'EN_CURSO' },
    { golesLocal: 1 },
    [],
  ])('rechaza cuerpo %j sin iniciar', async (cuerpo) => {
    await iniciar().send(cuerpo).expect(400);
    expect(
      (
        await db.query('SELECT estado,inicio_real FROM partido WHERE id=$1', [
          partidoId,
        ])
      ).rows[0],
    ).toEqual({ estado: 'PROGRAMADO', inicio_real: null });
    await comprobarSinCambios();
  });

  it('revierte estado e inicioReal si falla la bitácora', async () => {
    await db.query(
      `CREATE FUNCTION be54_fallar_bitacora() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo de prueba BE54'; END $$`,
    );
    try {
      await db.query(
        `CREATE TRIGGER be54_fallo BEFORE INSERT ON bitacora_marcador FOR EACH ROW WHEN (NEW.partido_id=${partidoId}) EXECUTE FUNCTION be54_fallar_bitacora()`,
      );
      await iniciar().expect(500);
      expect(
        (
          await db.query('SELECT estado,inicio_real FROM partido WHERE id=$1', [
            partidoId,
          ])
        ).rows[0],
      ).toEqual({ estado: 'PROGRAMADO', inicio_real: null });
      await comprobarSinCambios();
    } finally {
      await db.query('DROP TRIGGER IF EXISTS be54_fallo ON bitacora_marcador');
      await db.query('DROP FUNCTION be54_fallar_bitacora()');
    }
  });

  it('dos inicios simultáneos producen un 200, un 409 y una sola bitácora', async () => {
    const respuestas = await Promise.all([iniciar(), iniciar()]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const filas = await filasBitacora();
    expect(filas).toHaveLength(1);
    expect(filas[0].accion).toBe('INICIAR');
  });
});
