import type { INestApplication } from '@nestjs/common';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1cAAAAASUVORK5CYII=',
  'base64',
);
const jpg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const mp4 = Buffer.from(
  '00000018667479706d703432000000006d70343269736f6d',
  'hex',
);
const mib = 1024 * 1024;

function conTamano(firma: Buffer, bytes: number) {
  const archivo = Buffer.alloc(bytes);
  firma.copy(archivo);
  return archivo;
}

describe('BE-17.1: subida a la galería de partidos', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let uploads: string;
  let organizador: string;
  let organizadorId: string;
  let capitan: string;
  let partidoId: number;
  const client = () => request(app.getHttpServer());
  const ruta = () => `/api/v1/partidos/${partidoId}/galeria`;
  const subir = () =>
    client().post(ruta()).auth(organizador, { type: 'bearer' });

  beforeAll(async () => {
    uploads = await mkdtemp(join(tmpdir(), 'npcs-h17-'));
    vi.stubEnv('UPLOADS_DIR', uploads);
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (email: string) => {
      const res = await client()
        .post('/api/v1/auth/login')
        .send({ email, password: 'Liga2026!' })
        .expect(200);
      return res.body.accessToken as string;
    };
    organizador = await login('organizador@liga.test');
    capitan = await login('capitan.tigres-fc.ap26@liga.test');
    const me = await client()
      .get('/api/v1/auth/me')
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    organizadorId = me.body.id as string;
    const partidos = await db.query<{ id: number }>(`
      SELECT id FROM partido
      WHERE NOT EXISTS (SELECT 1 FROM contenido_galeria WHERE partido_id = partido.id)
      ORDER BY id LIMIT 1
    `);
    expect(partidos.rows).toHaveLength(1);
    partidoId = partidos.rows[0].id;
  }, 20000);

  afterEach(async () => {
    if (!partidoId) return;
    await db.query('DELETE FROM contenido_galeria WHERE partido_id = $1', [
      partidoId,
    ]);
    await rm(join(uploads, 'galeria'), { recursive: true, force: true });
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
    if (uploads) await rm(uploads, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('publica archivos válidos de un lote mixto y guarda sus metadatos y bytes en privado', async () => {
    const descripcion = 'a'.repeat(200);
    const res = await subir()
      .field('descripcion', descripcion)
      .attach('archivos[]', png, 'gol.png')
      .attach('archivos[]', Buffer.from('%PDF-1.7 archivo'), {
        filename: 'falso.png',
        contentType: 'image/png',
      })
      .attach('archivos[]', jpg, 'equipo.jpeg')
      .attach('archivos[]', mp4, 'jugada.mp4')
      .expect(200);
    expect(res.body).toMatchObject({
      partidoId,
      totalActivos: 3,
      limite: 30,
      resultados: [
        {
          nombre: 'gol.png',
          estado: 'PUBLICADO',
          contenidoId: expect.any(String),
        },
        {
          nombre: 'falso.png',
          estado: 'ERROR',
          motivo: expect.stringContaining('Formato'),
        },
        {
          nombre: 'equipo.jpeg',
          estado: 'PUBLICADO',
          contenidoId: expect.any(String),
        },
        {
          nombre: 'jugada.mp4',
          estado: 'PUBLICADO',
          contenidoId: expect.any(String),
        },
      ],
    });
    const { rows } = await db.query<{
      id: string;
      storage_key: string;
      nombre_original: string;
      mime_type: string;
      tamano_bytes: number;
      descripcion: string;
      subido_por: string;
    }>('SELECT * FROM contenido_galeria WHERE partido_id = $1', [partidoId]);
    const foto = rows.find((row) => row.nombre_original === 'gol.png');
    expect(foto).toMatchObject({
      id: res.body.resultados[0].contenidoId,
      mime_type: 'image/png',
      tamano_bytes: png.length,
      descripcion,
      subido_por: organizadorId,
    });
    expect(await readFile(join(uploads, foto!.storage_key))).toEqual(png);
    expect(await readdir(join(uploads, 'galeria'))).toHaveLength(3);
    await client().get(`/uploads/${foto!.storage_key}`).expect(404);
  });

  it('permite los tamaños exactos y sigue procesando el lote después de excederlos', async () => {
    const res = await subir()
      .attach('archivos[]', conTamano(jpg, 5 * mib + 1), 'foto-grande.jpg')
      .attach('archivos[]', conTamano(mp4, 50 * mib + 1), 'video-grande.mp4')
      .attach('archivos[]', conTamano(jpg, 5 * mib), 'foto-limite.jpg')
      .attach('archivos[]', conTamano(mp4, 50 * mib), 'video-limite.mp4')
      .expect(200);
    expect(res.body).toMatchObject({
      totalActivos: 2,
      resultados: [
        { estado: 'ERROR', motivo: expect.stringContaining('5 MiB') },
        { estado: 'ERROR', motivo: expect.stringContaining('50 MiB') },
        { estado: 'PUBLICADO' },
        { estado: 'PUBLICADO' },
      ],
    });
  }, 20000);

  it('valida la sesión, el rol, el partido y el formulario antes de publicar', async () => {
    await client().post(ruta()).expect(401);
    await client().post(ruta()).auth(capitan, { type: 'bearer' }).expect(403);
    await client()
      .post('/api/v1/partidos/2147483647/galeria')
      .auth(organizador, { type: 'bearer' })
      .attach('archivos[]', png, 'gol.png')
      .expect(404);
    await subir().send({ descripcion: 'sin multipart' }).expect(400);
    await subir().field('descripcion', 'sin archivos').expect(400);
    await subir()
      .field('descripcion', 'a'.repeat(201))
      .attach('archivos[]', png, 'gol.png')
      .expect(400);
    expect(await readdir(join(uploads, 'galeria'))).toEqual([]);
  });

  it('devuelve el mismo identificador si se reintenta una subida confirmada', async () => {
    const enviar = () =>
      subir().attach('archivos[]', png, 'gol.png').expect(200);
    const [primera, segunda] = await Promise.all([enviar(), enviar()]);
    expect(primera.body).toMatchObject({
      totalActivos: 1,
      resultados: [{ estado: 'PUBLICADO', contenidoId: expect.any(String) }],
    });
    expect(segunda.body).toEqual(primera.body);
    expect(await readdir(join(uploads, 'galeria'))).toHaveLength(1);
  });

  it('retira el archivo privado si PostgreSQL rechaza sus metadatos', async () => {
    await db.query(`
      ALTER TABLE contenido_galeria ADD CONSTRAINT prueba_be171_insert
      CHECK (nombre_original <> 'fallo-insert-be171.png') NOT VALID
    `);
    try {
      const res = await subir()
        .attach('archivos[]', png, 'fallo-insert-be171.png')
        .attach('archivos[]', png, 'gol.png')
        .expect(200);
      expect(res.body).toMatchObject({
        totalActivos: 1,
        resultados: [
          { estado: 'ERROR', motivo: expect.stringContaining('reintentarlo') },
          { estado: 'PUBLICADO' },
        ],
      });
      expect(await readdir(join(uploads, 'galeria'))).toHaveLength(1);
    } finally {
      await db.query(
        'ALTER TABLE contenido_galeria DROP CONSTRAINT prueba_be171_insert',
      );
    }
  });

  it('solo concede el último cupo a una subida entre dos solicitudes concurrentes', async () => {
    await db.query(
      `
      INSERT INTO contenido_galeria
        (id, partido_id, tipo, storage_key, nombre_original, mime_type, tamano_bytes, subido_por)
      SELECT gen_random_uuid(), $1, 'FOTO', 'h17-fixture/' || g, 'fixture.jpg',
        'image/jpeg', 1, $2
      FROM generate_series(1, 29) g
    `,
      [partidoId, organizadorId],
    );
    const respuestas = await Promise.all([
      subir().attach('archivos[]', png, 'primera.png').expect(200),
      subir().attach('archivos[]', png, 'segunda.png').expect(200),
    ]);
    expect(respuestas.map((res) => res.body.totalActivos)).toEqual([30, 30]);
    expect(respuestas.map((res) => res.body.resultados[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ estado: 'PUBLICADO' }),
        expect.objectContaining({
          estado: 'ERROR',
          motivo: expect.stringContaining('30 archivos'),
        }),
      ]),
    );
    expect(await readdir(join(uploads, 'galeria'))).toHaveLength(1);
  });
});
