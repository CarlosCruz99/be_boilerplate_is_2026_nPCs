import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';
import type { PaginaGaleriaDto } from '../src/galeria/consulta-galeria.dto.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1cAAAAASUVORK5CYII=',
  'base64',
);
const mp4 = Buffer.from(
  '00000018667479706d703432000000006d70343269736f6d',
  'hex',
);

type Actor = { id: string; token: string };

describe('BE-18.1 · consulta y archivos privados de galería', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let uploads: string;
  let organizador: Actor;
  let arbitro: Actor;
  let jugador: Actor;
  let capitan: Actor;
  let visitante: Actor;
  let otroCapitan: Actor;
  let jugadorId: number;
  let temporadaId: number;
  let canchaId: number;
  let equipoVisitanteId: number;
  let partidoId: number;
  let otroPartidoId: number;
  const jwt = { type: 'bearer' } as const;
  const cliente = () => request(app.getHttpServer());
  const ruta = (id: number | string = partidoId) =>
    `/api/v1/partidos/${id}/galeria`;
  const archivo = (id: string, partido = partidoId) =>
    `${ruta(partido)}/${id}/archivo`;
  const consultar = (actor = capitan, sufijo = '') =>
    cliente().get(`${ruta()}${sufijo}`).auth(actor.token, jwt);
  const subir = (partido = partidoId) =>
    cliente().post(ruta(partido)).auth(organizador.token, jwt);

  async function login(email: string): Promise<Actor> {
    const acceso = await cliente()
      .post('/api/v1/auth/login')
      .send({ email, password: 'Liga2026!' })
      .expect(200);
    const token = acceso.body.accessToken as string;
    const perfil = await cliente()
      .get('/api/v1/auth/me')
      .auth(token, jwt)
      .expect(200);
    return { id: perfil.body.id as string, token };
  }

  async function idConsulta(
    sql: string,
    parametros: (number | string)[],
  ): Promise<number> {
    const { rows } = await db.query<{ id: number }>(sql, parametros);
    return rows[0].id;
  }

  function leer(
    url: string,
    actor = capitan,
    init?: RequestInit,
  ): Promise<Response> {
    const { port } = app.getHttpServer().address() as AddressInfo;
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${actor.token}`);
    return fetch(`http://127.0.0.1:${port}${url}`, {
      ...init,
      headers,
    });
  }

  beforeAll(async () => {
    uploads = await mkdtemp(join(tmpdir(), 'npcs-h18-'));
    vi.stubEnv('UPLOADS_DIR', uploads);
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    [organizador, arbitro, jugador, capitan, visitante, otroCapitan] =
      await Promise.all([
        login('organizador@liga.test'),
        login('arbitro1@liga.test'),
        login('jugador01@liga.test'),
        login('capitan.tigres-fc.ap26@liga.test'),
        login('capitan.leones-fc.ap26@liga.test'),
        login('capitan.aguilas-fc.ap26@liga.test'),
      ]);
    const nombre = `H18-${randomUUID()}`;
    temporadaId = await idConsulta(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2071-01-01','2071-12-31') RETURNING id",
      [nombre],
    );
    canchaId = await idConsulta(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas H18') RETURNING id",
      [nombre],
    );
    const equipos = await Promise.all(
      [capitan, visitante, otroCapitan].map(({ id }, i) =>
        idConsulta(
          `INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion)
       VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id`,
          [`Equipo H18 ${i + 1}`, temporadaId, id, organizador.id],
        ),
      ),
    );
    equipoVisitanteId = equipos[1];
    jugadorId = await idConsulta('SELECT id FROM jugador WHERE usuario_id=$1', [
      jugador.id,
    ]);
    await db.query(
      'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
      [equipoVisitanteId, jugadorId, temporadaId],
    );
    const jornadaId = await idConsulta(
      `INSERT INTO jornada(temporada_id,numero,estado,publicada_en,publicada_por)
      VALUES ($1,1,'PUBLICADA',now(),$2) RETURNING id`,
      [temporadaId, organizador.id],
    );
    const crearPartido = (visitanteId: number, inicio: string, fin: string) =>
      idConsulta(
        `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          temporadaId,
          jornadaId,
          equipos[0],
          visitanteId,
          canchaId,
          arbitro.id,
          inicio,
          fin,
        ],
      );
    partidoId = await crearPartido(
      equipoVisitanteId,
      '2071-02-01T14:00:00Z',
      '2071-02-01T15:30:00Z',
    );
    otroPartidoId = await crearPartido(
      equipos[2],
      '2071-02-02T14:00:00Z',
      '2071-02-02T15:30:00Z',
    );
  }, 25_000);

  afterEach(async () => {
    if (!partidoId) return;
    await db.query(
      'DELETE FROM contenido_galeria WHERE partido_id IN ($1,$2)',
      [partidoId, otroPartidoId],
    );
    await rm(join(uploads, 'galeria'), { recursive: true, force: true });
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      try {
        if (temporadaId) {
          await db.query('DELETE FROM partido WHERE temporada_id=$1', [
            temporadaId,
          ]);
          await db.query('DELETE FROM jornada WHERE temporada_id=$1', [
            temporadaId,
          ]);
          await db.query('DELETE FROM equipo WHERE temporada_id=$1', [
            temporadaId,
          ]);
          await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
        }
        if (canchaId)
          await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
      } finally {
        await db.end();
      }
    }
    if (uploads) await rm(uploads, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('pagina seis activos por página con orden estable por fecha e identificador', async () => {
    expect((await consultar().expect(200)).body).toEqual({
      items: [],
      page: 1,
      pageSize: 6,
      totalElementos: 0,
      totalPaginas: 0,
    });
    const peticion = subir().field('descripcion', 'Jugada de prueba');
    for (let i = 0; i < 8; i++)
      peticion.attach('archivos[]', png, `jugada-${i}.png`);
    const carga = await peticion.expect(200);
    const ids = (carga.body.resultados as { contenidoId: string }[]).map(
      ({ contenidoId }) => contenidoId,
    );
    await db.query(
      `UPDATE contenido_galeria SET creado_en=CASE WHEN id=$2 THEN '2071-03-02T15:00:00Z'::timestamptz
                          ELSE '2071-03-01T15:00:00Z'::timestamptz END WHERE partido_id=$1`,
      [partidoId, ids[6]],
    );
    await db.query(
      "UPDATE contenido_galeria SET estado='ELIMINADO',eliminado_en=now(),eliminado_por=$2 WHERE id=$1",
      [ids[7], organizador.id],
    );

    const esperado = [
      ids[6],
      ...ids.slice(0, 6).sort((a, b) => b.localeCompare(a)),
    ];
    const primera = await consultar(capitan, '?page=1&pageSize=6')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    const segunda = await consultar(visitante, '?page=2').expect(200);
    const pagina = primera.body as PaginaGaleriaDto;
    expect(pagina).toMatchObject({
      page: 1,
      pageSize: 6,
      totalElementos: 7,
      totalPaginas: 2,
    });
    expect(pagina.items.map(({ id }) => id)).toEqual(esperado.slice(0, 6));
    expect(pagina.items[0]).toEqual({
      id: ids[6],
      tipo: 'FOTO',
      descripcion: 'Jugada de prueba',
      creadoEn: '2071-03-02T15:00:00.000Z',
      mimeType: 'image/png',
      url: archivo(ids[6]),
    });
    expect(segunda.body).toMatchObject({
      page: 2,
      totalElementos: 7,
      totalPaginas: 2,
      items: [{ id: esperado[6] }],
    });
    expect(
      (await consultar(jugador, '?page=2147483647').expect(200)).body,
    ).toEqual({
      items: [],
      page: 2147483647,
      pageSize: 6,
      totalElementos: 7,
      totalPaginas: 2,
    });
    await cliente()
      .get(archivo(ids[7]))
      .auth(organizador.token, jwt)
      .expect(404);
  });

  it('protege el listado y los archivos por rol, partido y pertenencia actual', async () => {
    const carga = await subir()
      .attach('archivos[]', png, 'privada.png')
      .expect(200);
    const id = carga.body.resultados[0].contenidoId as string;
    for (const url of [ruta(), archivo(id)]) {
      await cliente().get(url).expect(401);
      await cliente().get(url).auth(arbitro.token, jwt).expect(403);
      await cliente().get(url).auth(otroCapitan.token, jwt).expect(403);
      await cliente().get(url).auth(jugador.token, jwt).expect(200);
      await cliente().get(url).auth(organizador.token, jwt).expect(200);
    }
    await cliente()
      .get(archivo(id, otroPartidoId))
      .auth(capitan.token, jwt)
      .expect(404);
    await cliente()
      .post(ruta())
      .auth(jugador.token, jwt)
      .attach('archivos[]', png, 'prohibida.png')
      .expect(403);

    await db.query(
      'DELETE FROM equipo_jugador WHERE equipo_id=$1 AND jugador_id=$2',
      [equipoVisitanteId, jugadorId],
    );
    try {
      await cliente().get(archivo(id)).auth(jugador.token, jwt).expect(403);
      await consultar(jugador).expect(403);
    } finally {
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [equipoVisitanteId, jugadorId, temporadaId],
      );
    }
  });

  it('envía fotos y rangos de MP4 en privado con sus tipos MIME', async () => {
    const carga = await subir()
      .attach('archivos[]', png, 'foto.png')
      .attach('archivos[]', mp4, 'video.mp4')
      .expect(200);
    const [fotoId, videoId] = (
      carga.body.resultados as { contenidoId: string }[]
    ).map(({ contenidoId }) => contenidoId);
    const foto = await leer(archivo(fotoId));
    expect(foto.status).toBe(200);
    expect(foto.headers.get('content-type')).toBe('image/png');
    expect(foto.headers.get('content-disposition')).toBe('inline');
    expect(foto.headers.get('cache-control')).toBe('private, no-store');
    expect(foto.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await foto.arrayBuffer())).toEqual(png);

    const parcial = await leer(archivo(videoId), visitante, {
      headers: { Range: 'bytes=4-11' },
    });
    expect(parcial.status).toBe(206);
    expect(parcial.headers.get('content-type')).toBe('video/mp4');
    expect(parcial.headers.get('accept-ranges')).toBe('bytes');
    expect(parcial.headers.get('content-range')).toBe(
      `bytes 4-11/${mp4.length}`,
    );
    expect(Buffer.from(await parcial.arrayBuffer())).toEqual(
      mp4.subarray(4, 12),
    );

    const imposible = await leer(archivo(videoId), capitan, {
      headers: { Range: 'bytes=1000-' },
    });
    expect(imposible.status).toBe(416);
    expect(imposible.headers.get('content-range')).toBe(
      `bytes */${mp4.length}`,
    );
    expect(imposible.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await imposible.json()).toMatchObject({ statusCode: 416 });
    const cabeza = await leer(archivo(videoId), capitan, { method: 'HEAD' });
    expect(cabeza.status).toBe(200);
    expect(cabeza.headers.get('content-length')).toBe(String(mp4.length));
    expect((await cabeza.arrayBuffer()).byteLength).toBe(0);
  });

  it('distingue parámetros inválidos, recursos inexistentes y archivos de seed ausentes', async () => {
    for (const query of [
      '?page=0',
      '?page=1.5',
      '?page=2147483648',
      '?page=1&page=2',
      '?pageSize=7',
      '?limite=6',
    ]) {
      await consultar(capitan, query).expect(400);
    }
    await cliente().get(ruta('invalido')).auth(capitan.token, jwt).expect(400);
    await cliente()
      .get(archivo('invalido'))
      .auth(capitan.token, jwt)
      .expect(400);
    await cliente()
      .get(ruta(2_147_483_647))
      .auth(capitan.token, jwt)
      .expect(404);
    await cliente()
      .get(archivo(randomUUID()))
      .auth(capitan.token, jwt)
      .expect(404);
    const {
      rows: [seed],
    } = await db.query<{ id: string; partido_id: number }>(
      "SELECT id, partido_id FROM contenido_galeria WHERE storage_key LIKE 'seed/galeria/%' LIMIT 1",
    );
    await cliente()
      .get(archivo(seed.id, seed.partido_id))
      .auth(organizador.token, jwt)
      .expect(404);
  });
});
