import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-6.1: listado público', () => {
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
      [`BE61-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE61') RETURNING id",
      [`BE61-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE61',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be61-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE61-${randomUUID()}`, temporadaId, id, organizadorId],
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

  const url = '/api/v1/partidos';
  let localId: number;
  let visitanteId: number;
  beforeEach(async () => {
    const p = (
      await db.query(
        'SELECT equipo_local_id,equipo_visitante_id FROM partido WHERE id=$1',
        [partidoId],
      )
    ).rows[0];
    localId = p.equipo_local_id;
    visitanteId = p.equipo_visitante_id;
    await db.query(
      'UPDATE partido SET goles_local=2,goles_visitante=1 WHERE id=$1',
      [partidoId],
    );
  });
  async function publicar() {
    await db.query(
      "UPDATE jornada SET estado='PUBLICADA',publicada_en=now(),publicada_por=$2 WHERE temporada_id=$1",
      [temporadaId, organizadorId],
    );
  }
  const consultar = (query = '', token?: string) => {
    const r = client().get(url + query);
    return token ? r.auth(token, { type: 'bearer' }) : r;
  };
  it('sin sesión ve partidos publicados y combina estado con equipo local o visitante', async () => {
    await publicar();
    for (const equipoId of [localId, visitanteId]) {
      const inicio = Date.now();
      const r = await consultar(`?estado=EN_CURSO&equipoId=${equipoId}`).expect(
        200,
      );
      expect(Date.now() - inicio).toBeLessThan(2000);
      expect(r.body).toEqual({
        total: 1,
        page: 1,
        pageSize: 20,
        partidos: [
          {
            id: partidoId,
            jornada: 1,
            inicio: '2060-02-01T14:00:00.000Z',
            estado: 'EN_CURSO',
            local: { id: localId, nombre: expect.any(String), goles: 2 },
            visitante: {
              id: visitanteId,
              nombre: expect.any(String),
              goles: 1,
            },
          },
        ],
      });
    }
    expect(
      (await consultar(`?estado=FINALIZADO&equipoId=${localId}`).expect(200))
        .body.total,
    ).toBe(0);
  });
  it('borradores solo para organizador activo, sin caché compartida', async () => {
    for (const token of [
      undefined,
      capitan,
      jugador,
      arbitro,
      otroArbitro,
      'invalido',
    ]) {
      const r = await consultar(`?equipoId=${localId}`, token).expect(200);
      expect(r.body.partidos).toEqual([]);
      expect(r.body.total).toBe(0);
    }
    const r = await consultar(`?equipoId=${localId}`, organizador).expect(200);
    expect(r.body.total).toBe(1);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers.vary).toContain('Authorization');
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      organizadorId,
    ]);
    try {
      expect(
        (await consultar(`?equipoId=${localId}`, organizador).expect(200)).body
          .total,
      ).toBe(0);
    } finally {
      await db.query('UPDATE usuario SET is_active=true WHERE id=$1', [
        organizadorId,
      ]);
    }
  });
  it('PROGRAMADO devuelve goles null y FINALIZADO los valores oficiales', async () => {
    await publicar();
    await db.query(
      "UPDATE partido SET estado='PROGRAMADO',inicio_real=NULL WHERE id=$1",
      [partidoId],
    );
    const programado = await consultar(`?equipoId=${localId}`).expect(200);
    expect(programado.body.partidos[0].local.goles).toBeNull();
    expect(programado.body.partidos[0].visitante.goles).toBeNull();
    await db.query(
      "UPDATE partido SET estado='FINALIZADO',inicio_real=inicio,fin_real=fin WHERE id=$1",
      [partidoId],
    );
    expect(
      (await consultar(`?equipoId=${localId}`).expect(200)).body.partidos[0]
        .local.goles,
    ).toBe(2);
  });
  it('no lista CANCELADO ni siquiera al organizador', async () => {
    await publicar();
    await db.query(
      "UPDATE partido SET estado='CANCELADO',inicio_real=NULL WHERE id=$1",
      [partidoId],
    );
    for (const token of [undefined, organizador])
      expect(
        (await consultar(`?equipoId=${localId}`, token).expect(200)).body.total,
      ).toBe(0);
  });
  it('pagina y ordena como PostgreSQL, incluyendo desempates por id', async () => {
    await publicar();
    const esperado = (
      await db.query(
        "SELECT p.id FROM partido p JOIN jornada j ON j.id=p.jornada_id WHERE j.estado='PUBLICADA' AND p.estado<>'CANCELADO' ORDER BY p.inicio DESC,p.id DESC",
      )
    ).rows.map((r) => r.id);
    expect(esperado.length).toBeGreaterThan(20);
    const p1 = await consultar().expect(200);
    expect(p1.body.page).toBe(1);
    expect(p1.body.pageSize).toBe(20);
    expect(p1.body.total).toBe(esperado.length);
    expect(p1.body.partidos.map((p: { id: number }) => p.id)).toEqual(
      esperado.slice(0, 20),
    );
    const p2 = await consultar('?page=2&pageSize=20').expect(200);
    expect(p2.body.partidos.map((p: { id: number }) => p.id)).toEqual(
      esperado.slice(20, 40),
    );
    const fuera = await consultar('?page=2147483647&pageSize=1').expect(200);
    expect(fuera.body.partidos).toEqual([]);
    expect(fuera.body.total).toBe(esperado.length);
  });
  it.each([
    'estado=CANCELADO',
    'estado=OTRO',
    'equipoId=0',
    'page=0',
    'pageSize=51',
    'pageSize=1.5',
    'equipoId=abc',
    'page=2147483647&pageSize=50',
    'temporadaId=1',
    'estado=EN_CURSO&estado=FINALIZADO',
  ])('rechaza %s con 400', async (query) => {
    await consultar('?' + query).expect(400);
  });
  it('equipo inexistente y página sin resultados dan lista vacía con el contrato completo', async () => {
    expect((await consultar('?equipoId=2147483647').expect(200)).body).toEqual({
      total: 0,
      page: 1,
      pageSize: 20,
      partidos: [],
    });
  });
  it('documenta el contrato público en Swagger', async () => {
    const r = await client().get('/api/docs-json').expect(200);
    const operacion = r.body.paths[url].get;
    expect(operacion.responses['200']).toBeDefined();
    expect(operacion.responses['400']).toBeDefined();
  });
});
