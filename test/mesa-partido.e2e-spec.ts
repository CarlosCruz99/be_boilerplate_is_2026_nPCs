import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-5 · mesa operativa del árbitro', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let arbitro: string;
  let arbitroId: string;
  let otroArbitro: string;
  let otroArbitroId: string;
  let organizador: string;
  let organizadorId: string;
  let capitan: string;
  let capitanId: string;
  let jugador: string;
  let temporadaId: number;
  let canchaId: number;
  let partidoId: number;
  let otroCapitanId: string;
  let localId: number;
  let visitanteId: number;
  let localNombre: string;
  let visitanteNombre: string;
  let jugadorIds: number[];

  const client = () => request(app.getHttpServer());
  const mesa = (id: number | string = partidoId, token = arbitro) =>
    client().get(`/api/v1/partidos/${id}/mesa`).auth(token, { type: 'bearer' });

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
    const arb2 = await login('arbitro2@liga.test');
    otroArbitro = arb2.token;
    otroArbitroId = arb2.id;
    const org = await login('organizador@liga.test');
    organizador = org.token;
    organizadorId = org.id;
    const cap = await login('capitan.tigres-fc.ap26@liga.test');
    capitan = cap.token;
    capitanId = cap.id;
    jugador = (await login('demo@example.com', 'Demo1234!')).token;
  }, 20000);

  beforeEach(async () => {
    jugadorIds = [];
    const t = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2060-01-01','2060-12-31') RETURNING id",
      [`MESA-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas Mesa') RETURNING id",
      [`MESA-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán Mesa',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `mesa-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    localNombre = `Local-${randomUUID().slice(0, 8)}`;
    visitanteNombre = `Visit-${randomUUID().slice(0, 8)}`;
    const equipos: number[] = [];
    for (const [idx, id] of [capitanId, otroCapitanId].entries()) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [
          idx === 0 ? localNombre : visitanteNombre,
          temporadaId,
          id,
          organizadorId,
        ],
      );
      equipos.push(e.rows[0].id);
    }
    [localId, visitanteId] = equipos;
    for (const [idx, equipoId] of equipos.entries()) {
      const jg = await db.query<{ id: number }>(
        "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES ($1,'2000-01-01',$2,'/uploads/jugadores/1.png') RETURNING id",
        [`Jugador Mesa ${idx + 1}`, `MESA-${randomUUID().slice(0, 12)}`],
      );
      const jId = jg.rows[0].id;
      jugadorIds.push(jId);
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [equipoId, jId, temporadaId],
      );
    }
    const j = await db.query<{ id: number }>(
      'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
      [temporadaId],
    );
    const p = await db.query<{ id: number }>(
      `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real)
      VALUES ($1,$2,$3,$4,$5,$6,'2060-02-01T14:00:00Z','2060-02-01T15:30:00Z','PROGRAMADO',NULL) RETURNING id`,
      [temporadaId, j.rows[0].id, localId, visitanteId, canchaId, arbitroId],
    );
    partidoId = p.rows[0].id;
  });

  afterEach(async () => {
    await db.query('DELETE FROM participacion_partido WHERE partido_id=$1', [
      partidoId,
    ]);
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
    await db.query('DELETE FROM equipo_jugador WHERE temporada_id=$1', [
      temporadaId,
    ]);
    for (const jId of jugadorIds) {
      await db.query('DELETE FROM jugador WHERE id=$1', [jId]);
    }
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
    await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
    await db.query('DELETE FROM usuario WHERE id=$1', [otroCapitanId]);
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('devuelve el estado completo en PROGRAMADO, EN_CURSO y FINALIZADO', async () => {
    const programado = await mesa().expect(200);
    expect(programado.body).toEqual({
      partidoId,
      estado: 'PROGRAMADO',
      local: { id: localId, nombre: localNombre },
      visitante: { id: visitanteId, nombre: visitanteNombre },
      golesLocal: 0,
      golesVisitante: 0,
      faltasLocal: 0,
      faltasVisitante: 0,
      inicioReal: null,
      finReal: null,
      participantes: { partidoId, local: [], visitante: [] },
    });

    await client()
      .post(`/api/v1/partidos/${partidoId}/iniciar`)
      .auth(arbitro, { type: 'bearer' })
      .expect(200);
    await client()
      .patch(`/api/v1/partidos/${partidoId}/marcador`)
      .auth(arbitro, { type: 'bearer' })
      .send({
        golesLocal: 3,
        golesVisitante: 2,
        faltasLocal: 4,
        faltasVisitante: 1,
      })
      .expect(200);
    await client()
      .put(`/api/v1/partidos/${partidoId}/participantes`)
      .auth(arbitro, { type: 'bearer' })
      .send({ jugadorIds })
      .expect(200);

    const enCurso = await mesa().expect(200);
    expect(enCurso.body).toEqual({
      partidoId,
      estado: 'EN_CURSO',
      local: { id: localId, nombre: localNombre },
      visitante: { id: visitanteId, nombre: visitanteNombre },
      golesLocal: 3,
      golesVisitante: 2,
      faltasLocal: 4,
      faltasVisitante: 1,
      inicioReal: expect.any(String),
      finReal: null,
      participantes: {
        partidoId,
        local: [{ id: jugadorIds[0], nombre: 'Jugador Mesa 1' }],
        visitante: [{ id: jugadorIds[1], nombre: 'Jugador Mesa 2' }],
      },
    });

    await client()
      .post(`/api/v1/partidos/${partidoId}/finalizar`)
      .auth(arbitro, { type: 'bearer' })
      .expect(200);

    const finalizado = await mesa().expect(200);
    expect(finalizado.body).toMatchObject({
      partidoId,
      estado: 'FINALIZADO',
      golesLocal: 3,
      golesVisitante: 2,
      finReal: expect.any(String),
    });
  });

  it('permite consultar CANCELADO y respeta sustitución de árbitro', async () => {
    await client()
      .put(`/api/v1/partidos/${partidoId}/arbitro`)
      .auth(organizador, { type: 'bearer' })
      .send({ arbitroId: otroArbitroId })
      .expect(200);

    await mesa(partidoId, arbitro).expect(403);
    await mesa(partidoId, otroArbitro).expect(200);

    await db.query("UPDATE partido SET estado='CANCELADO' WHERE id=$1", [
      partidoId,
    ]);
    const cancelado = await mesa(partidoId, otroArbitro).expect(200);
    expect(cancelado.body.estado).toBe('CANCELADO');
  });

  it('exige autenticación, árbitro asignado e identificador válido', async () => {
    await client().get(`/api/v1/partidos/${partidoId}/mesa`).expect(401);
    for (const token of [otroArbitro, organizador, capitan, jugador]) {
      await mesa(partidoId, token).expect(403);
    }
    for (const idInvalido of ['0', '-1', 'abc']) {
      await mesa(idInvalido).expect(400);
    }
    await mesa(2147483647).expect(404);
  });
});
