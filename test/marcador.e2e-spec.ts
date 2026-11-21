import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-5.1: marcador y bitácora en PostgreSQL', () => {
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
      [`BE51-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE51') RETURNING id",
      [`BE51-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE51',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be51-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE51-${randomUUID()}`, temporadaId, id, organizadorId],
      );
      equipos.push(e.rows[0].id);
    }
    const j = await db.query<{ id: number }>(
      'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
      [temporadaId],
    );
    const p = await db.query<{ id: number }>(
      `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real)
      VALUES ($1,$2,$3,$4,$5,$6,'2060-02-01T14:00:00Z','2060-02-01T15:30:00Z','EN_CURSO','2060-02-01T14:00:00Z') RETURNING id`,
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

  it('guarda los cuatro valores y una bitácora con el actor y fecha de respuesta, en menos de 2 s', async () => {
    const inicio = performance.now();
    const r = await guardar().expect(200);
    expect(performance.now() - inicio).toBeLessThan(2000);
    expect(r.body).toEqual({
      partidoId,
      estado: 'EN_CURSO',
      ...valores,
      actualizadoEn: expect.any(String),
    });
    const p = (await db.query('SELECT * FROM partido WHERE id=$1', [partidoId]))
      .rows[0];
    expect(p).toMatchObject({
      estado: 'EN_CURSO',
      goles_local: 2,
      goles_visitante: 1,
      faltas_local: 4,
      faltas_visitante: 6,
      fin_real: null,
    });
    const filas = await filasBitacora();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      usuario_id: arbitroId,
      accion: 'ACTUALIZAR',
      goles_local: 2,
      goles_visitante: 1,
      faltas_local: 4,
      faltas_visitante: 6,
    });
    expect(filas[0].fecha_registro.toISOString()).toBe(r.body.actualizadoEn);
  });

  it('permite corregir a la baja y registra cada guardado, incluso si repite valores', async () => {
    await guardar().expect(200);
    const cero = {
      golesLocal: 0,
      golesVisitante: 0,
      faltasLocal: 0,
      faltasVisitante: 0,
    };
    await guardar(cero).expect(200);
    await guardar(cero).expect(200);
    expect(await filasBitacora()).toHaveLength(3);
  });

  it.each(['PROGRAMADO', 'FINALIZADO', 'CANCELADO'])(
    'rechaza %s con 409 sin escribir',
    async (estado) => {
      await db.query(
        "UPDATE partido SET estado=$2::estado_partido,inicio_real=CASE WHEN $2='FINALIZADO' THEN inicio ELSE NULL END,fin_real=CASE WHEN $2='FINALIZADO' THEN fin ELSE NULL END WHERE id=$1",
        [partidoId, estado],
      );
      const r = await guardar().expect(409);
      if (estado === 'FINALIZADO')
        expect(r.body.message).toBe(
          'El partido ya está finalizado. Solo procede la corrección autorizada (H23).',
        );
      if (estado === 'PROGRAMADO')
        expect(r.body.message).toBe('El partido aún no está en curso.');
      await comprobarSinCambios();
    },
  );

  it.each([
    { golesLocal: -1 },
    { golesVisitante: 100 },
    { faltasLocal: 1.5 },
    { faltasVisitante: '6' },
    { golesLocal: null },
    { faltasLocal: false },
    { usuarioId: 'inventado' },
  ])('rechaza datos inválidos %j con 400', async (cambio) => {
    await guardar({ ...valores, ...cambio }).expect(400);
    await comprobarSinCambios();
  });

  it.each(Object.keys(valores))('exige el campo %s', async (campo) => {
    const incompleto: Record<string, number> = { ...valores };
    delete incompleto[campo];
    await guardar(incompleto).expect(400);
    await comprobarSinCambios();
  });

  it('bloquea otros árbitros, organizador, capitán y jugador con 403', async () => {
    for (const token of [otroArbitro, organizador, capitan, jugador]) {
      const r = await guardar(valores, token).expect(403);
      expect(r.body).toEqual({
        mensaje: 'No tienes permiso para esta acción.',
      });
    }
    await comprobarSinCambios();
  });

  it('exige sesión válida con 401 y distingue partido inexistente con 404', async () => {
    await client().patch(ruta()).send(valores).expect(401);
    await guardar(valores, 'invalido').expect(401);
    await client()
      .patch(ruta(2147483647))
      .auth(arbitro, { type: 'bearer' })
      .send(valores)
      .expect(404);
    await client()
      .patch('/api/v1/partidos/abc/marcador')
      .auth(arbitro, { type: 'bearer' })
      .send(valores)
      .expect(400);
    await comprobarSinCambios();
  });

  it('revierte el marcador si falla la escritura de bitácora', async () => {
    await db.query(
      `CREATE FUNCTION be51_fallar_bitacora() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo de prueba BE51'; END $$`,
    );
    try {
      await db.query(
        `CREATE TRIGGER be51_fallo BEFORE INSERT ON bitacora_marcador FOR EACH ROW WHEN (NEW.partido_id=${partidoId}) EXECUTE FUNCTION be51_fallar_bitacora()`,
      );
      await guardar().expect(500);
      await comprobarSinCambios();
    } finally {
      await db.query('DROP TRIGGER IF EXISTS be51_fallo ON bitacora_marcador');
      await db.query('DROP FUNCTION be51_fallar_bitacora()');
    }
  });

  it('serializa dos guardados sin mezclar los valores de sus bitácoras', async () => {
    const segundo = {
      golesLocal: 9,
      golesVisitante: 8,
      faltasLocal: 7,
      faltasVisitante: 6,
    };
    await Promise.all([guardar().expect(200), guardar(segundo).expect(200)]);
    const filas = await filasBitacora();
    expect(filas).toHaveLength(2);
    const p = (await db.query('SELECT * FROM partido WHERE id=$1', [partidoId]))
      .rows[0];
    for (const campo of [
      'goles_local',
      'goles_visitante',
      'faltas_local',
      'faltas_visitante',
    ]) {
      expect(p[campo]).toBe(filas[1][campo]);
    }
  });
});
