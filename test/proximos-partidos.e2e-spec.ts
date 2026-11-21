import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-7.2: próximos rivales exclusivos del capitán', () => {
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
      [`BE72-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE72') RETURNING id",
      [`BE72-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE72',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be72-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE72-${randomUUID()}`, temporadaId, id, organizadorId],
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
    await db.query('DELETE FROM posicion WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
    await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
    await db.query('DELETE FROM usuario WHERE id=$1', [otroCapitanId]);
    await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])', [
      usuariosExtra ?? [],
    ]);
    await db.query('UPDATE temporada SET actual=true WHERE id=ANY($1::int[])', [
      anteriores ?? [],
    ]);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  let anteriores: number[];
  let usuariosExtra: string[];
  let localId: number;
  let rivalId: number;
  let extraRivalId: number;
  let segundoPartidoId: number;
  beforeEach(async () => {
    anteriores = (
      await db.query('SELECT id FROM temporada WHERE actual=true')
    ).rows.map((r) => r.id);
    await db.query('UPDATE temporada SET actual=false WHERE actual=true');
    await db.query('UPDATE temporada SET actual=true WHERE id=$1', [
      temporadaId,
    ]);
    usuariosExtra = [];
    const p = (
      await db.query(
        'SELECT equipo_local_id,equipo_visitante_id FROM partido WHERE id=$1',
        [partidoId],
      )
    ).rows[0];
    localId = p.equipo_local_id;
    rivalId = p.equipo_visitante_id;
    await db.query(
      "UPDATE jornada SET estado='PUBLICADA',publicada_en=now(),publicada_por=$2 WHERE temporada_id=$1",
      [temporadaId, organizadorId],
    );
    const user = randomUUID();
    usuariosExtra.push(user);
    await db.query(
      "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,updated_at) VALUES ($1,$2,'sin-login','Capitán rival','1990-01-01',now())",
      [user, user + '@liga.test'],
    );
    extraRivalId = (
      await db.query(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ('Rival sin fila',$1,$2,'INSCRITO',$3,now()) RETURNING id",
        [temporadaId, user, organizadorId],
      )
    ).rows[0].id;
    const j = (
      await db.query(
        "INSERT INTO jornada(temporada_id,numero,estado,publicada_en,publicada_por) VALUES ($1,2,'PUBLICADA',now(),$2) RETURNING id",
        [temporadaId, organizadorId],
      )
    ).rows[0].id;
    // Equipo consultado juega de visitante: comprueba ambos lados del cruce.
    segundoPartidoId = (
      await db.query(
        "INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin) VALUES ($1,$2,$3,$4,$5,$6,'2060-02-08T14:00:00Z','2060-02-08T15:30:00Z') RETURNING id",
        [temporadaId, j, extraRivalId, localId, canchaId, arbitroId],
      )
    ).rows[0].id;
    await db.query(
      'INSERT INTO posicion(temporada_id,equipo_id,pj,pg,pe,pp,gf,gc,dg,puntos) VALUES ($1,$2,1,1,0,0,2,0,2,3)',
      [temporadaId, rivalId],
    );
  });
  const ruta = (id: number | string = localId) =>
    `/api/v1/equipos/${id}/proximos-partidos`;
  const consultar = (token = capitan, id: number | string = localId) =>
    client().get(ruta(id)).auth(token, { type: 'bearer' });
  it('lista en orden ascendente, identifica local/visitante e incluye rival sin posición', async () => {
    const inicio = Date.now();
    const r = await consultar().expect(200);
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(r.body).toEqual({
      equipoId: localId,
      proximos: [
        {
          partidoId,
          fechaHora: '2060-02-01T14:00:00.000Z',
          rival: {
            equipoId: rivalId,
            nombre: expect.any(String),
            lugar: 1,
            puntos: 3,
          },
        },
        {
          partidoId: segundoPartidoId,
          fechaHora: '2060-02-08T14:00:00.000Z',
          rival: {
            equipoId: extraRivalId,
            nombre: 'Rival sin fila',
            lugar: null,
            puntos: null,
          },
        },
      ],
    });
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers.vary).toContain('Authorization');
  });
  it('usa el lugar global de la vista, no un ranking reducido a los rivales', async () => {
    await db.query(
      'INSERT INTO posicion(temporada_id,equipo_id,pj,pg,pe,pp,gf,gc,dg,puntos) VALUES ($1,$2,2,2,0,0,4,0,4,6)',
      [temporadaId, localId],
    );
    const r = await consultar().expect(200);
    expect(r.body.proximos[0].rival.lugar).toBe(2);
  });
  it.each(['EN_CURSO', 'FINALIZADO', 'CANCELADO'])(
    'excluye estado %s',
    async (estado) => {
      await db.query(
        "UPDATE partido SET estado=$2::estado_partido,inicio_real=CASE WHEN $2 IN ('EN_CURSO','FINALIZADO') THEN inicio ELSE NULL END,fin_real=CASE WHEN $2='FINALIZADO' THEN fin ELSE NULL END WHERE id=$1",
        [partidoId, estado],
      );
      expect(
        (await consultar().expect(200)).body.proximos.map(
          (p: { partidoId: number }) => p.partidoId,
        ),
      ).toEqual([segundoPartidoId]);
    },
  );
  it('excluye borradores y devuelve lista vacía si no quedan publicados', async () => {
    await db.query(
      "UPDATE jornada SET estado='BORRADOR',publicada_en=NULL,publicada_por=NULL WHERE temporada_id=$1",
      [temporadaId],
    );
    expect((await consultar().expect(200)).body).toEqual({
      equipoId: localId,
      proximos: [],
    });
  });
  it('excluye programados con inicio pasado', async () => {
    await db.query(
      "UPDATE partido SET inicio='2000-01-01T14:00:00Z',fin='2000-01-01T15:30:00Z' WHERE id=$1",
      [partidoId],
    );
    expect(
      (await consultar().expect(200)).body.proximos.map(
        (p: { partidoId: number }) => p.partidoId,
      ),
    ).toEqual([segundoPartidoId]);
  });
  it('solo el capitán del equipo tiene acceso', async () => {
    await client().get(ruta()).expect(401);
    await consultar('invalido').expect(401);
    for (const token of [jugador, organizador, arbitro, otroArbitro])
      await consultar(token).expect(403);
    await consultar(capitan, rivalId).expect(403);
    // El GET público de posiciones no debe publicar próximos rivales.
    expect(
      (await client().get('/api/v1/posiciones').expect(200)).body,
    ).not.toHaveProperty('proximos');
  });
  it('equipo inexistente da 404 e identificador inválido 400', async () => {
    await consultar(capitan, 2147483647).expect(404);
    for (const id of ['0', '-1', 'abc', '1.5'])
      await consultar(capitan, id).expect(400);
  });
  it('rechaza equipos no inscritos y de temporadas anteriores con 403', async () => {
    const anterior = (
      await db.query(
        'SELECT id FROM equipo WHERE capitan_id=$1 AND temporada_id<>$2 LIMIT 1',
        [capitanId, temporadaId],
      )
    ).rows[0].id;
    await consultar(capitan, anterior).expect(403);
    await db.query(
      "UPDATE equipo SET estado='PENDIENTE',validado_por=NULL,fecha_validacion=NULL WHERE id=$1",
      [localId],
    );
    await consultar().expect(403);
  });
  it('sin temporada actual da 404 al capitán autorizado', async () => {
    await db.query('UPDATE temporada SET actual=false WHERE id=$1', [
      temporadaId,
    ]);
    expect((await consultar().expect(404)).body.message).toBe(
      'No hay temporada actual.',
    );
  });
  it('consulta de solo lectura documentada en Swagger', async () => {
    const antes = (
      await db.query(
        'SELECT * FROM partido WHERE temporada_id=$1 ORDER BY id',
        [temporadaId],
      )
    ).rows;
    await consultar().expect(200);
    expect(
      (
        await db.query(
          'SELECT * FROM partido WHERE temporada_id=$1 ORDER BY id',
          [temporadaId],
        )
      ).rows,
    ).toEqual(antes);
    const r = await client().get('/api/docs-json').expect(200);
    const op = r.body.paths['/api/v1/equipos/{equipoId}/proximos-partidos'].get;
    for (const codigo of ['200', '400', '401', '403', '404'])
      expect(op.responses[codigo]).toBeDefined();
  });
});
