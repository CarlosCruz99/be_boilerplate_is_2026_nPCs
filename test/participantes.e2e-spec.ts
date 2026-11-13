import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-5.5: participantes en PostgreSQL', () => {
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
  let jugadores: number[];
  const client = () => request(app.getHttpServer());

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
      [`BE55-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE55') RETURNING id",
      [`BE55-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE55',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be55-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE55-${randomUUID()}`, temporadaId, id, organizadorId],
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
    await db.query('DELETE FROM participacion_partido WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query('DELETE FROM estadistica_partido WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query('DELETE FROM bitacora_marcador WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query('DELETE FROM partido WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jornada WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jugador WHERE id=ANY($1::int[])', [
      jugadores ?? [],
    ]);
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

  beforeEach(async () => {
    jugadores = [];
    const p = (
      await db.query(
        'SELECT equipo_local_id,equipo_visitante_id FROM partido WHERE id=$1',
        [partidoId],
      )
    ).rows[0];
    for (let i = 0; i < 3; i++) {
      const j = await db.query<{ id: number }>(
        "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES ($1,'1990-01-01',$2,'/foto.png') RETURNING id",
        [`Jugador ${i}`, randomUUID().slice(0, 20)],
      );
      jugadores.push(j.rows[0].id);
      if (i < 2)
        await db.query(
          'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
          [
            i === 0 ? p.equipo_local_id : p.equipo_visitante_id,
            j.rows[0].id,
            temporadaId,
          ],
        );
    }
  });
  const url = (id = partidoId) => `/api/v1/partidos/${id}/participantes`;
  const registrar = (
    jugadorIds: unknown = jugadores.slice(0, 2),
    token = arbitro,
  ) => client().put(url()).auth(token, { type: 'bearer' }).send({ jugadorIds });
  const lista = async () =>
    (
      await db.query(
        'SELECT jugador_id FROM participacion_partido WHERE partido_id=$1 ORDER BY jugador_id',
        [partidoId],
      )
    ).rows.map((r) => r.jugador_id);

  it('guarda, reemplaza, repite y vacía la lista completa sin modificar marcador', async () => {
    const r = await registrar().expect(200);
    expect(r.body).toEqual({
      partidoId,
      local: [{ id: jugadores[0], nombre: 'Jugador 0' }],
      visitante: [{ id: jugadores[1], nombre: 'Jugador 1' }],
    });
    await registrar([jugadores[1]]).expect(200);
    await registrar([jugadores[1]]).expect(200);
    expect(await lista()).toEqual([jugadores[1]]);
    const vacio = await registrar([]).expect(200);
    expect(vacio.body).toEqual({ partidoId, local: [], visitante: [] });
    expect(await lista()).toEqual([]);
    await comprobarSinCambios();
  });
  it('conserva las estadísticas H9 al retirar al jugador', async () => {
    await registrar([jugadores[0]]).expect(200);
    await db.query(
      'INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES ($1,$2,2,1,1)',
      [partidoId, jugadores[0]],
    );
    const previa = (
      await db.query('SELECT * FROM estadistica_partido WHERE partido_id=$1', [
        partidoId,
      ])
    ).rows;
    await registrar([]).expect(200);
    expect(await lista()).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT * FROM estadistica_partido WHERE partido_id=$1',
          [partidoId],
        )
      ).rows,
    ).toEqual(previa);
  });
  it('rechaza jugadores ajenos, inexistentes y de otra temporada sin borrar la lista anterior', async () => {
    await registrar([jugadores[0]]).expect(200);
    const ajeno = (
      await db.query(
        'SELECT jugador_id FROM equipo_jugador WHERE temporada_id<>$1 LIMIT 1',
        [temporadaId],
      )
    ).rows[0].jugador_id;
    for (const id of [jugadores[2], 2147483647, ajeno]) {
      await registrar([jugadores[1], id]).expect(422);
      expect(await lista()).toEqual([jugadores[0]]);
    }
  });
  it.each(['PROGRAMADO', 'FINALIZADO', 'CANCELADO'])(
    'rechaza estado %s',
    async (estado) => {
      await db.query(
        "UPDATE partido SET estado=$2::estado_partido,inicio_real=CASE WHEN $2='FINALIZADO' THEN inicio ELSE NULL END,fin_real=CASE WHEN $2='FINALIZADO' THEN fin ELSE NULL END WHERE id=$1",
        [partidoId, estado],
      );
      await registrar().expect(409);
      expect(await lista()).toEqual([]);
    },
  );
  it('exige sesión, árbitro asignado e identificador válido', async () => {
    await client().put(url()).send({ jugadorIds: [] }).expect(401);
    for (const token of [otroArbitro, organizador, capitan, jugador])
      await registrar([], token).expect(403);
    await registrar([], 'invalido').expect(401);
    await client()
      .put(url(2147483647))
      .auth(arbitro, { type: 'bearer' })
      .send({ jugadorIds: [] })
      .expect(404);
    await client()
      .put('/api/v1/partidos/abc/participantes')
      .auth(arbitro, { type: 'bearer' })
      .send({ jugadorIds: [] })
      .expect(400);
  });
  it.each(
    [
      null,
      '1',
      [1, 1],
      [0],
      ['1'],
      Array.from({ length: 31 }, (_, i) => i + 1),
    ].map((dato) => ({ dato })),
  )('rechaza arreglo inválido %j', async ({ dato }) => {
    await registrar(dato).expect(400);
    expect(await lista()).toEqual([]);
  });
  it('exige jugadorIds y rechaza campos no permitidos', async () => {
    await client()
      .put(url())
      .auth(arbitro, { type: 'bearer' })
      .send({})
      .expect(400);
    await client()
      .put(url())
      .auth(arbitro, { type: 'bearer' })
      .send({ jugadorIds: [], equipoId: 1 })
      .expect(400);
  });
  it('revierte el borrado si falla la inserción del reemplazo', async () => {
    await registrar([jugadores[0]]).expect(200);
    await db.query(
      "CREATE FUNCTION be55_fallo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE55'; END $$",
    );
    try {
      await db.query(
        `CREATE TRIGGER be55_fallo BEFORE INSERT ON participacion_partido FOR EACH ROW WHEN (NEW.partido_id=${partidoId}) EXECUTE FUNCTION be55_fallo()`,
      );
      await registrar([jugadores[1]]).expect(500);
      expect(await lista()).toEqual([jugadores[0]]);
    } finally {
      await db.query(
        'DROP TRIGGER IF EXISTS be55_fallo ON participacion_partido',
      );
      await db.query('DROP FUNCTION be55_fallo()');
    }
  });
  it('serializa reemplazos concurrentes sin mezclar ambas listas', async () => {
    await Promise.all([
      registrar([jugadores[0]]).expect(200),
      registrar([jugadores[1]]).expect(200),
    ]);
    const guardados = await lista();
    expect(guardados).toHaveLength(1);
    expect(jugadores.slice(0, 2)).toContain(guardados[0]);
  });
});
