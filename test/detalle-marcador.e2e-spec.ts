import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-6.2: detalle público del marcador', () => {
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
      [`BE62-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const c = await db.query<{ id: number }>(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas BE62') RETURNING id",
      [`BE62-${randomUUID()}`],
    );
    canchaId = c.rows[0].id;
    const u = await db.query<{ id: string }>(
      "INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at) VALUES ($1,'Capitán BE62',$2,'sin-login','1990-01-01',now()) RETURNING id",
      [randomUUID(), `be62-${randomUUID()}@liga.test`],
    );
    otroCapitanId = u.rows[0].id;
    const equipos: number[] = [];
    for (const id of [capitanId, otroCapitanId]) {
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`BE62-${randomUUID()}`, temporadaId, id, organizadorId],
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
      "UPDATE partido SET inicio_real=now()-interval '52 minutes 10 seconds',goles_local=5,goles_visitante=2,faltas_local=4,faltas_visitante=6 WHERE id=$1",
      [partidoId],
    );
    await db.query(
      'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
      [localId, jugadores[2], temporadaId],
    );
    await db.query(
      'INSERT INTO participacion_partido(partido_id,jugador_id,equipo_id) VALUES ($1,$2,$3),($1,$4,$5)',
      [partidoId, jugadores[0], localId, jugadores[1], visitanteId],
    );
    await db.query(
      'INSERT INTO estadistica_partido(partido_id,jugador_id,goles) VALUES ($1,$2,1),($1,$3,2),($1,$4,0)',
      [partidoId, jugadores[0], jugadores[2], jugadores[1]],
    );
  });
  const ruta = (id: number | string = partidoId) =>
    `/api/v1/partidos/${id}/marcador`;
  const consultar = (token?: string, id: number | string = partidoId) => {
    const r = client().get(ruta(id));
    return token ? r.auth(token, { type: 'bearer' }) : r;
  };
  async function publicar() {
    await db.query(
      "UPDATE jornada SET estado='PUBLICADA',publicada_en=now(),publicada_por=$2 WHERE temporada_id=$1",
      [temporadaId, organizadorId],
    );
  }
  it('devuelve marcador, faltas, participantes y goleadores de fuentes independientes sin sesión', async () => {
    await publicar();
    const inicio = Date.now();
    const r = await consultar().expect(200);
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(r.body).toEqual({
      partidoId,
      estado: 'EN_CURSO',
      local: {
        equipoId: localId,
        nombre: expect.any(String),
        goles: 5,
        faltas: 4,
        jugadores: [{ id: jugadores[0], nombre: 'Jugador 0' }],
      },
      visitante: {
        equipoId: visitanteId,
        nombre: expect.any(String),
        goles: 2,
        faltas: 6,
        jugadores: [{ id: jugadores[1], nombre: 'Jugador 1' }],
      },
      goleadores: [
        {
          jugadorId: jugadores[2],
          nombre: 'Jugador 2',
          equipoId: localId,
          goles: 2,
        },
        {
          jugadorId: jugadores[0],
          nombre: 'Jugador 0',
          equipoId: localId,
          goles: 1,
        },
      ],
      duracionMinutos: 52,
    });
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers.vary).toContain('Authorization');
    // No expone identificación, nacimiento, cuenta ni foto de las fichas.
    expect(JSON.stringify(r.body)).not.toMatch(
      /identificacion|fechaNacimiento|usuarioId|fotoUrl/,
    );
  });
  it('oculta borradores para anónimos y otros roles; solo organizador activo ve el detalle', async () => {
    for (const token of [
      undefined,
      capitan,
      jugador,
      arbitro,
      otroArbitro,
      'invalido',
    ])
      await consultar(token).expect(404);
    await consultar(organizador).expect(200);
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      organizadorId,
    ]);
    try {
      await consultar(organizador).expect(404);
    } finally {
      await db.query('UPDATE usuario SET is_active=true WHERE id=$1', [
        organizadorId,
      ]);
    }
  });
  it('publicado se puede consultar con cualquier rol o token inválido', async () => {
    await publicar();
    for (const token of [capitan, jugador, arbitro, organizador, 'invalido'])
      await consultar(token).expect(200);
  });
  it.each([
    { estado: 'PROGRAMADO', mensaje: 'Este partido aún no comienza.' },
    { estado: 'CANCELADO', mensaje: 'Este partido fue cancelado.' },
  ])(
    'rechaza $estado sin exponer marcador y prioriza ocultar borrador',
    async ({ estado, mensaje }) => {
      await db.query(
        'UPDATE partido SET estado=$2::estado_partido,inicio_real=NULL,fin_real=NULL WHERE id=$1',
        [partidoId, estado],
      );
      await consultar().expect(404);
      await publicar();
      const r = await consultar().expect(409);
      expect(r.body.message).toBe(mensaje);
      expect(r.body.local).toBeUndefined();
      expect(r.body.goleadores).toBeUndefined();
    },
  );
  it('duración finalizada usa tiempos reales aunque sean distintos del horario programado', async () => {
    await publicar();
    await db.query(
      "UPDATE partido SET estado='FINALIZADO',inicio_real='2026-11-01T14:00:00Z',fin_real='2026-11-01T15:35:59Z' WHERE id=$1",
      [partidoId],
    );
    const r = await consultar().expect(200);
    expect(r.body.estado).toBe('FINALIZADO');
    expect(r.body.duracionMinutos).toBe(95);
  });
  it('inicio real futuro da duración 0', async () => {
    await publicar();
    await db.query(
      "UPDATE partido SET inicio_real='2099-01-01T00:00:00Z' WHERE id=$1",
      [partidoId],
    );
    expect((await consultar().expect(200)).body.duracionMinutos).toBe(0);
  });
  it('acepta listas vacías aunque el marcador sea mayor que cero', async () => {
    await publicar();
    await db.query('DELETE FROM participacion_partido WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query('DELETE FROM estadistica_partido WHERE partido_id=$1', [
      partidoId,
    ]);
    const r = await consultar().expect(200);
    expect(r.body.local.jugadores).toEqual([]);
    expect(r.body.visitante.jugadores).toEqual([]);
    expect(r.body.goleadores).toEqual([]);
    expect(r.body.local.goles).toBe(5);
  });
  it('la siguiente consulta refleja los cambios de H5 y H9 sin caché', async () => {
    await publicar();
    await consultar().expect(200);
    await client()
      .patch(ruta())
      .auth(arbitro, { type: 'bearer' })
      .send({
        golesLocal: 6,
        golesVisitante: 3,
        faltasLocal: 7,
        faltasVisitante: 8,
      })
      .expect(200);
    await client()
      .put(`/api/v1/partidos/${partidoId}/estadisticas/${jugadores[0]}`)
      .auth(arbitro, { type: 'bearer' })
      .send({ goles: 3, asistencias: 0, tarjetas: 0 })
      .expect(200);
    const r = await consultar().expect(200);
    expect(r.body.local).toMatchObject({ goles: 6, faltas: 7 });
    expect(r.body.visitante).toMatchObject({ goles: 3, faltas: 8 });
    expect(r.body.goleadores[0]).toMatchObject({
      jugadorId: jugadores[0],
      goles: 3,
    });
  });
  it('responde 404 para inexistente y 400 para identificador inválido', async () => {
    await consultar(undefined, 2147483647).expect(404);
    for (const id of ['abc', '0', '-1', '1.5', '2147483648'])
      await consultar(undefined, id).expect(400);
  });
  it('documenta respuestas y acceso público opcional en Swagger', async () => {
    const r = await client().get('/api/docs-json').expect(200);
    const op = r.body.paths['/api/v1/partidos/{partidoId}/marcador'].get;
    for (const codigo of ['200', '400', '404', '409'])
      expect(op.responses[codigo]).toBeDefined();
    expect(op.security).toContainEqual({});
  });
});
