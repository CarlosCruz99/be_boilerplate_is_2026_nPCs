import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-5.2: finalización y posiciones en PostgreSQL', () => {
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
      [`BE52-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE52') RETURNING id",
      [`BE52-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE52',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be52-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE52-${randomUUID()}`, temporadaId, id, organizadorId],
      );
      equipos.push(e.rows[0].id);
    }
    const j = await db.query<{ id: number }>(
      'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
      [temporadaId],
    );
    const p = await db.query<{ id: number }>(
      `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real)
      VALUES ($1,$2,$3,$4,$5,$6,'2060-02-01T14:00:00Z','2060-02-01T15:30:00Z','EN_CURSO',now()-interval '2 hours') RETURNING id`,
      [temporadaId, j.rows[0].id, ...equipos, canchaId, arbitroId],
    );
    partidoId = p.rows[0].id;
  });
  afterEach(async () => {
    await db.query('DELETE FROM bitacora_marcador WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query(
      "DELETE FROM aviso WHERE referencia_tipo='PARTIDO' AND referencia_id=$1",
      [partidoId],
    );
    await db.query('DELETE FROM posicion WHERE temporada_id=$1', [temporadaId]);
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

  const finalUrl = (id = partidoId) => `/api/v1/partidos/${id}/finalizar`;
  const finalizar = (token = arbitro) =>
    client().post(finalUrl()).auth(token, { type: 'bearer' });
  const avisosFinales = async () =>
    (
      await db.query(
        "SELECT * FROM aviso WHERE referencia_tipo='PARTIDO' AND referencia_id=$1",
        [partidoId],
      )
    ).rows;

  it('finaliza con 200, deja bitácora, recalcula posiciones y envía avisos reales a ambos capitanes', async () => {
    await guardar().expect(200);
    const antes = Date.now();
    const r = await finalizar().expect(200);
    expect(Date.now() - antes).toBeLessThan(2000);
    expect(r.body).toEqual({
      partidoId,
      estado: 'FINALIZADO',
      golesLocal: 2,
      golesVisitante: 1,
      finReal: expect.any(String),
    });
    expect(Date.parse(r.body.finReal)).toBeGreaterThanOrEqual(antes);
    const p = (await db.query('SELECT * FROM partido WHERE id=$1', [partidoId]))
      .rows[0];
    expect(p.estado).toBe('FINALIZADO');
    expect(p.fin_real.toISOString()).toBe(r.body.finReal);
    expect(p.fin_real.getTime()).toBeGreaterThanOrEqual(
      p.inicio_real.getTime(),
    );
    const filas = await filasBitacora();
    expect(filas.map((f) => f.accion)).toEqual(['ACTUALIZAR', 'FINALIZAR']);
    expect(filas[1]).toMatchObject({
      usuario_id: arbitroId,
      goles_local: 2,
      goles_visitante: 1,
      faltas_local: 4,
      faltas_visitante: 6,
    });
    const tabla = (
      await db.query(
        'SELECT * FROM posicion WHERE temporada_id=$1 ORDER BY puntos DESC',
        [temporadaId],
      )
    ).rows;
    expect(tabla).toHaveLength(2);
    expect(tabla[0]).toMatchObject({
      pj: 1,
      pg: 1,
      pe: 0,
      pp: 0,
      gf: 2,
      gc: 1,
      dg: 1,
      puntos: 3,
    });
    expect(tabla[1]).toMatchObject({
      pj: 1,
      pg: 0,
      pe: 0,
      pp: 1,
      gf: 1,
      gc: 2,
      dg: -1,
      puntos: 0,
    });
    const avisos = await avisosFinales();
    expect(avisos).toHaveLength(2);
    expect(new Set(avisos.map((a) => a.usuario_id))).toEqual(
      new Set([capitanId, otroCapitanId]),
    );
    for (const aviso of avisos)
      expect(aviso).toMatchObject({
        modulo_origen: 'RESULTADOS',
        tipo: 'RESULTADO_FINALIZADO',
        mensaje: 'El partido de la jornada 1 terminó 2-1.',
        clave_idempotencia: `partido-${partidoId}-finalizado`,
      });
    await guardar().expect(409);
    await finalizar().expect(409);
    expect(await avisosFinales()).toHaveLength(2);
    expect(await filasBitacora()).toHaveLength(2);
  });

  it.each(['PROGRAMADO', 'FINALIZADO', 'CANCELADO'])(
    'rechaza %s sin escribir bitácora ni avisos',
    async (estado) => {
      await db.query(
        "UPDATE partido SET estado=$2::estado_partido,inicio_real=CASE WHEN $2='FINALIZADO' THEN inicio ELSE NULL END,fin_real=CASE WHEN $2='FINALIZADO' THEN fin ELSE NULL END WHERE id=$1",
        [partidoId, estado],
      );
      const previo = (
        await db.query('SELECT * FROM partido WHERE id=$1', [partidoId])
      ).rows[0];
      await finalizar().expect(409);
      expect(
        (await db.query('SELECT * FROM partido WHERE id=$1', [partidoId]))
          .rows[0],
      ).toEqual(previo);
      await comprobarSinCambios();
      expect(await avisosFinales()).toHaveLength(0);
    },
  );

  it('rechaza otros árbitros, organizador, capitán y jugador', async () => {
    for (const token of [otroArbitro, organizador, capitan, jugador])
      await finalizar(token).expect(403);
    await comprobarSinCambios();
    expect(await avisosFinales()).toHaveLength(0);
  });
  it('exige sesión y valida partido e identificador', async () => {
    await client().post(finalUrl()).expect(401);
    await finalizar('invalido').expect(401);
    await client()
      .post(finalUrl(2147483647))
      .auth(arbitro, { type: 'bearer' })
      .expect(404);
    await client()
      .post('/api/v1/partidos/abc/finalizar')
      .auth(arbitro, { type: 'bearer' })
      .expect(400);
    await comprobarSinCambios();
  });
  it.each([{ finReal: '2000-01-01T00:00:00Z' }, { golesLocal: 2 }, []])(
    'rechaza cuerpo %j',
    async (cuerpo) => {
      await finalizar().send(cuerpo).expect(400);
      await comprobarSinCambios();
    },
  );

  it('revierte resultado y bitácora si falla el recálculo', async () => {
    await db.query(
      "CREATE FUNCTION be52_fallar_posicion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE52 posiciones'; END $$",
    );
    try {
      await db.query(
        `CREATE TRIGGER be52_fallo BEFORE INSERT OR UPDATE ON posicion FOR EACH ROW WHEN (NEW.temporada_id=${temporadaId}) EXECUTE FUNCTION be52_fallar_posicion()`,
      );
      await finalizar().expect(500);
      expect(
        (
          await db.query('SELECT estado,fin_real FROM partido WHERE id=$1', [
            partidoId,
          ])
        ).rows[0],
      ).toEqual({ estado: 'EN_CURSO', fin_real: null });
      await comprobarSinCambios();
      expect(await avisosFinales()).toHaveLength(0);
      expect(
        (
          await db.query('SELECT * FROM posicion WHERE temporada_id=$1', [
            temporadaId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS be52_fallo ON posicion');
      await db.query('DROP FUNCTION be52_fallar_posicion()');
    }
  });

  it('dos finalizaciones simultáneas solo cuentan una vez el resultado y los avisos', async () => {
    const respuestas = await Promise.all([finalizar(), finalizar()]);
    expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(await filasBitacora()).toHaveLength(1);
    expect(await avisosFinales()).toHaveLength(2);
    const tabla = (
      await db.query(
        'SELECT pj,pe,puntos FROM posicion WHERE temporada_id=$1',
        [temporadaId],
      )
    ).rows;
    expect(tabla).toEqual([
      { pj: 1, pe: 1, puntos: 1 },
      { pj: 1, pe: 1, puntos: 1 },
    ]);
  });

  it('no revierte al fallar un aviso y aún envía el del otro equipo', async () => {
    await db.query(
      "CREATE FUNCTION be52_fallar_aviso() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE52 aviso'; END $$",
    );
    try {
      await db.query(
        `CREATE TRIGGER be52_fallo_aviso BEFORE INSERT ON aviso FOR EACH ROW WHEN (NEW.usuario_id='${capitanId}'::uuid AND NEW.referencia_id=${partidoId}) EXECUTE FUNCTION be52_fallar_aviso()`,
      );
      await finalizar().send({}).expect(200);
      expect(
        (await db.query('SELECT estado FROM partido WHERE id=$1', [partidoId]))
          .rows[0].estado,
      ).toBe('FINALIZADO');
      expect(await filasBitacora()).toHaveLength(1);
      const avisos = await avisosFinales();
      expect(avisos).toHaveLength(1);
      expect(avisos[0].usuario_id).toBe(otroCapitanId);
      expect(
        (
          await db.query('SELECT * FROM posicion WHERE temporada_id=$1', [
            temporadaId,
          ])
        ).rowCount,
      ).toBe(2);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS be52_fallo_aviso ON aviso');
      await db.query('DROP FUNCTION be52_fallar_aviso()');
    }
  });
});
