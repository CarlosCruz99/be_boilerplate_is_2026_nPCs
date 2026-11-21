import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-25.1: asignación del árbitro', () => {
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
  let candidatoId: string;
  let extras: number[];
  let canchasExtras: number[];
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
    candidatoId = (
      await db.query('SELECT id FROM usuario WHERE email=$1', [
        'arbitro2@liga.test',
      ])
    ).rows[0].id;
    const org = await login('organizador@liga.test');
    organizador = org.token;
    organizadorId = org.id;
    const cap = await login('capitan.tigres-fc.ap26@liga.test');
    capitan = cap.token;
    capitanId = cap.id;
    jugador = (await login('demo@example.com', 'Demo1234!')).token;
  }, 20000);

  beforeEach(async () => {
    extras = [];
    canchasExtras = [];
    const t = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2060-01-01','2060-12-31') RETURNING id",
      [`BE251-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE251') RETURNING id",
      [`BE251-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE251',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be251-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE251-${randomUUID()}`, temporadaId, id, organizadorId],
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
    for (const id of extras) {
      await db.query('DELETE FROM partido WHERE temporada_id=$1', [id]);
      await db.query('DELETE FROM jornada WHERE temporada_id=$1', [id]);
      await db.query('DELETE FROM equipo WHERE temporada_id=$1', [id]);
      await db.query('DELETE FROM temporada WHERE id=$1', [id]);
    }
    for (const id of canchasExtras)
      await db.query('DELETE FROM cancha WHERE id=$1', [id]);
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

  const ruta = (id = partidoId) => `/api/v1/partidos/${id}/arbitro`;
  const asignar = (
    arbitroId = candidatoId,
    id = partidoId,
    token = organizador,
  ) =>
    client().put(ruta(id)).auth(token, { type: 'bearer' }).send({ arbitroId });
  const disponibles = (token = organizador) =>
    client()
      .get(`/api/v1/partidos/${partidoId}/arbitros-disponibles`)
      .auth(token, { type: 'bearer' });
  async function otroPartido(
    arbitroInicial: string,
    inicio = '2060-02-01T14:00:00Z',
  ) {
    const t = (
      await db.query(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2060-01-01','2060-12-31') RETURNING id",
        [randomUUID()],
      )
    ).rows[0].id;
    extras.push(t);
    const cancha = (
      await db.query(
        "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Prueba H25') RETURNING id",
        [randomUUID()],
      )
    ).rows[0].id;
    canchasExtras.push(cancha);
    const equipos: number[] = [];
    for (const cap of [capitanId, otroCapitanId])
      equipos.push(
        (
          await db.query(
            "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
            [randomUUID(), t, cap, organizadorId],
          )
        ).rows[0].id,
      );
    const j = (
      await db.query(
        'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
        [t],
      )
    ).rows[0].id;
    return (
      await db.query(
        "INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin) VALUES ($1,$2,$3,$4,$5,$6,$7,$7::timestamptz+interval '90 minutes') RETURNING id",
        [t, j, ...equipos, cancha, arbitroInicial, inicio],
      )
    ).rows[0].id as number;
  }
  it('lista candidatos activos, incluye al actual y permite repetir asignación', async () => {
    const r = await disponibles().expect(200);
    expect(r.body.partidoId).toBe(partidoId);
    expect(r.body.arbitros.map((a: { id: string }) => a.id)).toEqual(
      expect.arrayContaining([arbitroId, candidatoId]),
    );
    await asignar(arbitroId).expect(200);
    const p = await asignar().expect(200);
    expect(p.body).toMatchObject({
      partidoId,
      arbitroId: candidatoId,
      arbitroNombre: expect.any(String),
    });
    await asignar().expect(200);
    await comprobarSinCambios();
  });
  it('el anterior pierde acceso a H5 y el nuevo puede iniciar y guardar marcador', async () => {
    await asignar().expect(200);
    await db.query(
      "UPDATE jornada SET estado='PUBLICADA',publicada_en=now(),publicada_por=$2 WHERE temporada_id=$1",
      [temporadaId, organizadorId],
    );
    const visible = await client()
      .get(`/api/v1/partidos/${partidoId}`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    expect(visible.body.arbitro.id).toBe(candidatoId);
    await client()
      .get(`/api/v1/partidos/${partidoId}`)
      .auth(arbitro, { type: 'bearer' })
      .expect(403);
    await client()
      .get(`/api/v1/partidos/${partidoId}`)
      .auth(otroArbitro, { type: 'bearer' })
      .expect(200);
    await client()
      .post(`/api/v1/partidos/${partidoId}/iniciar`)
      .auth(arbitro, { type: 'bearer' })
      .expect(403);
    await client()
      .post(`/api/v1/partidos/${partidoId}/iniciar`)
      .auth(otroArbitro, { type: 'bearer' })
      .expect(200);
    const datos = {
      golesLocal: 1,
      golesVisitante: 0,
      faltasLocal: 0,
      faltasVisitante: 0,
    };
    await client()
      .patch(`/api/v1/partidos/${partidoId}/marcador`)
      .auth(arbitro, { type: 'bearer' })
      .send(datos)
      .expect(403);
    await client()
      .patch(`/api/v1/partidos/${partidoId}/marcador`)
      .auth(otroArbitro, { type: 'bearer' })
      .send(datos)
      .expect(200);
  });
  it('rechaza cruce y conserva al árbitro anterior', async () => {
    await otroPartido(candidatoId);
    const lista = await disponibles().expect(200);
    expect(lista.body.arbitros.map((a: { id: string }) => a.id)).not.toContain(
      candidatoId,
    );
    await asignar().expect(409);
    expect(
      (
        await db.query('SELECT arbitro_id FROM partido WHERE id=$1', [
          partidoId,
        ])
      ).rows[0].arbitro_id,
    ).toBe(arbitroId);
  });
  it('permite horarios contiguos y partidos cancelados no ocupan al árbitro', async () => {
    const otro = await otroPartido(candidatoId, '2060-02-01T15:30:00Z');
    await asignar().expect(200);
    await asignar(arbitroId).expect(200);
    await db.query(
      "UPDATE partido SET inicio='2060-02-01T14:00:00Z',fin='2060-02-01T15:30:00Z',estado='CANCELADO' WHERE id=$1",
      [otro],
    );
    await asignar().expect(200);
  });
  it.each(['EN_CURSO', 'FINALIZADO', 'CANCELADO'])(
    'rechaza estado %s en ambas rutas',
    async (estado) => {
      await db.query(
        "UPDATE partido SET estado=$2::estado_partido,inicio_real=CASE WHEN $2 IN ('EN_CURSO','FINALIZADO') THEN inicio ELSE NULL END,fin_real=CASE WHEN $2='FINALIZADO' THEN fin ELSE NULL END WHERE id=$1",
        [partidoId, estado],
      );
      await disponibles().expect(409);
      await asignar().expect(409);
    },
  );
  it('exige organizador, UUID y referencia existente', async () => {
    await client().put(ruta()).send({ arbitroId: candidatoId }).expect(401);
    for (const token of [arbitro, capitan, jugador]) {
      await asignar(candidatoId, partidoId, token).expect(403);
      await disponibles(token).expect(403);
    }
    await client()
      .put(ruta())
      .auth(organizador, { type: 'bearer' })
      .send({ arbitroId: 1 })
      .expect(400);
    await client()
      .put(ruta())
      .auth(organizador, { type: 'bearer' })
      .send({})
      .expect(400);
    await asignar(randomUUID()).expect(404);
    await asignar(candidatoId, 2147483647).expect(404);
  });
  it('rechaza candidato inactivo y usuario con otro rol', async () => {
    await asignar(organizadorId).expect(422);
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      candidatoId,
    ]);
    try {
      await asignar().expect(422);
      expect(
        (await disponibles().expect(200)).body.arbitros.map(
          (a: { id: string }) => a.id,
        ),
      ).not.toContain(candidatoId);
    } finally {
      await db.query('UPDATE usuario SET is_active=true WHERE id=$1', [
        candidatoId,
      ]);
    }
  });
  it('dos organizadores no asignan al mismo candidato a partidos traslapados en temporadas diferentes', async () => {
    const tercero = (
      await db.query('SELECT id FROM usuario WHERE email=$1', [
        'arbitro3@liga.test',
      ])
    ).rows[0].id;
    const otro = await otroPartido(tercero);
    const r = await Promise.all([asignar(), asignar(candidatoId, otro)]);
    expect(r.map((x) => x.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(
      (
        await db.query(
          'SELECT id FROM partido WHERE id=ANY($1::int[]) AND arbitro_id=$2',
          [[partidoId, otro], candidatoId],
        )
      ).rowCount,
    ).toBe(1);
  });
});
