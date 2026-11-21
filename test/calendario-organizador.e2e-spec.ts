import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';

describe('Lectura del calendario del organizador', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let org: string;
  let capitan: string;
  let arbitro: string;
  let temporadaId: number;
  let canchaId: number;
  let jornadaId: number;
  const usuarios: string[] = [];
  const ruta = (id: number | string = temporadaId) =>
    `/api/v1/temporadas/${id}/calendario`;
  const client = () => request(app.getHttpServer());
  beforeAll(async () => {
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    async function usuario(rol: 'JUGADOR' | 'ORGANIZADOR' | 'ARBITRO') {
      const email = `lectura-${randomUUID()}@liga.test`;
      const registro = await client()
        .post('/api/v1/users')
        .send({
          nombre: 'Prueba calendario',
          email,
          password: 'Prueba1234',
          fechaNacimiento: '1990-01-01',
        })
        .expect(201);
      const id = registro.body.id as string;
      usuarios.push(id);
      await db.query('UPDATE usuario SET rol=$1::rol_usuario WHERE id=$2', [
        rol,
        id,
      ]);
      const login = await client()
        .post('/api/v1/auth/login')
        .send({ email, password: 'Prueba1234' })
        .expect(200);
      return { id, token: login.body.accessToken as string };
    }
    const organizador = await usuario('ORGANIZADOR');
    org = organizador.token;
    const cap = await usuario('JUGADOR');
    capitan = cap.token;
    const arb = await usuario('ARBITRO');
    arbitro = arb.token;
    const otro = await usuario('JUGADOR');
    temporadaId = (
      await db.query<{ id: number }>(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2035-01-01','2035-12-31') RETURNING id",
        [`Lectura-${randomUUID()}`],
      )
    ).rows[0].id;
    jornadaId = (
      await db.query<{ id: number }>(
        'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
        [temporadaId],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO jornada(temporada_id,numero,estado,publicada_en,publicada_por) VALUES ($1,2,'PUBLICADA',now(),$2)",
      [temporadaId, organizador.id],
    );
    const equipos: number[] = [];
    for (const [i, id] of [cap.id, otro.id].entries())
      equipos.push(
        (
          await db.query<{ id: number }>(
            "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
            [i === 0 ? 'Local' : 'Visitante', temporadaId, id, organizador.id],
          )
        ).rows[0].id,
      );
    canchaId = (
      await db.query<{ id: number }>(
        "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Dirección de prueba') RETURNING id",
        [`Lectura-${randomUUID()}`],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado) VALUES ($1,$2,$3,$4,$5,$6,'2035-02-10T14:00:00Z','2035-02-10T15:30:00Z','CANCELADO')",
      [temporadaId, jornadaId, ...equipos, canchaId, arb.id],
    );
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (db) {
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
      await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])', [
        usuarios,
      ]);
      await db.end();
    }
  });
  it('exige sesión y el rol organizador', async () => {
    await client().get(ruta()).expect(401);
    for (const token of [capitan, arbitro])
      await client().get(ruta()).auth(token, { type: 'bearer' }).expect(403);
  });
  it('distingue id inválido y temporada inexistente', async () => {
    await client().get(ruta('abc')).auth(org, { type: 'bearer' }).expect(400);
    await client()
      .get(ruta(2147483647))
      .auth(org, { type: 'bearer' })
      .expect(404);
  });
  it('documenta el ID obligatorio de temporada en Swagger', async () => {
    const respuesta = await client().get('/api/docs-json').expect(200);
    const { paths } = respuesta.body as {
      paths: Record<string, { get: { parameters: unknown[] } }>;
    };
    expect(paths[ruta('{id}')].get.parameters).toContainEqual({
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'integer', minimum: 1 },
    });
  });
  it('incluye borradores, publicadas, jornadas vacías y cancelados con datos de presentación', async () => {
    const res = await client()
      .get(ruta())
      .auth(org, { type: 'bearer' })
      .expect(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toMatchObject({
      temporadaId,
      jornadas: [
        {
          id: jornadaId,
          numero: 1,
          estado: 'BORRADOR',
          publicadaEn: null,
          partidos: [
            {
              jornada: 1,
              estado: 'CANCELADO',
              inicio: '2035-02-10T14:00:00.000Z',
              fin: '2035-02-10T15:30:00.000Z',
              local: { nombre: 'Local' },
              visitante: { nombre: 'Visitante' },
              cancha: { id: canchaId },
              arbitro: { nombre: 'Prueba calendario' },
            },
          ],
        },
        {
          numero: 2,
          estado: 'PUBLICADA',
          publicadaEn: expect.any(String),
          partidos: [],
        },
      ],
    });
  });
});
