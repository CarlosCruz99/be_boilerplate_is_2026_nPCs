import type { INestApplication } from '@nestjs/common';
import { ok } from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import type {
  AvisoDto,
  LecturaAvisoDto,
  PaginaAvisosDto,
} from '../src/avisos/dto/consulta-avisos.dto.js';
import type { createApp as CreateApp } from '../src/create-app.js';

type Sesion = { id: string; token: string };

describe('BE-19.1 bandeja de avisos', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let capitanA: Sesion;
  let capitanB: Sesion;
  let capitanC: Sesion;
  let arbitro: Sesion;
  let organizador: Sesion;
  const api = '/api/v1';
  const ruta = `${api}/avisos`;
  const rutaConteo = `${ruta}/no-leidos/conteo`;
  const cliente = () => request(app.getHttpServer());
  const bearer = { type: 'bearer' } as const;
  const consultar = (sesion: Sesion, url = ruta) =>
    cliente().get(url).auth(sesion.token, bearer);
  const leer = (sesion: Sesion, id: string | number, query = '') =>
    cliente().patch(`${ruta}/${id}/leido${query}`).auth(sesion.token, bearer);

  async function login(email: string): Promise<Sesion> {
    const acceso = await cliente()
      .post(`${api}/auth/login`)
      .send({ email, password: 'Liga2026!' })
      .expect(200);
    const { accessToken } = acceso.body as { accessToken: string };
    const perfil = await cliente()
      .get(`${api}/auth/me`)
      .auth(accessToken, bearer)
      .expect(200);
    return { token: accessToken, id: (perfil.body as { id: string }).id };
  }

  async function avisoSinLeer(usuarioId: string): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      'SELECT id FROM aviso WHERE usuario_id = $1 AND leido_en IS NULL ORDER BY id LIMIT 1',
      [usuarioId],
    );
    return rows[0].id;
  }

  beforeAll(async () => {
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    [capitanA, capitanB, capitanC, arbitro, organizador] = await Promise.all([
      login('capitan.tigres-fc.ap26@liga.test'),
      login('capitan.leones-fc.ap26@liga.test'),
      login('capitan.aguilas-fc.ap26@liga.test'),
      login('arbitro1@liga.test'),
      login('organizador@liga.test'),
    ]);
  }, 15_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('pagina solo los 45 avisos propios en 20, 20 y 5 con desempate por ID', async () => {
    const { rows: fechas } = await db.query<{ id: number; creado_en: Date }>(
      'SELECT id, creado_en FROM aviso WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC LIMIT 2',
      [capitanA.id],
    );
    const [primero, segundo] = fechas;
    await db.query('UPDATE aviso SET creado_en = $2 WHERE id = $1', [
      segundo.id,
      primero.creado_en,
    ]);
    try {
      const { rows: propios } = await db.query<{ id: number }>(
        'SELECT id FROM aviso WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC',
        [capitanA.id],
      );
      const ids: number[] = [];
      for (const [pagina, longitud] of [
        [1, 20],
        [2, 20],
        [3, 5],
      ] as const) {
        const response = await consultar(
          capitanA,
          pagina === 1 ? ruta : `${ruta}?pagina=${pagina}`,
        )
          .expect('Cache-Control', 'private, no-store')
          .expect(200);
        const listado = response.body as PaginaAvisosDto;
        expect(listado).toMatchObject({ pagina, limite: 20, total: 45 });
        expect(listado.datos).toHaveLength(longitud);
        ids.push(...listado.datos.map(({ id }) => id));
      }
      expect(ids).toEqual(propios.map(({ id }) => id));
      expect(ids.slice(0, 2)).toEqual(
        [primero.id, segundo.id].toSorted((a, b) => b - a),
      );
    } finally {
      await db.query('UPDATE aviso SET creado_en = $2 WHERE id = $1', [
        segundo.id,
        segundo.creado_en,
      ]);
    }
  });

  it('respeta el límite, el total fuera de rango y el destinatario sin avisos', async () => {
    const otro = await consultar(capitanB, `${ruta}?limite=1`).expect(200);
    expect(otro.body).toMatchObject({ pagina: 1, limite: 1, total: 2 });
    expect((otro.body as PaginaAvisosDto).datos).toHaveLength(1);
    const completa = await consultar(capitanA, `${ruta}?limite=50`).expect(200);
    expect((completa.body as PaginaAvisosDto).datos).toHaveLength(45);
    await consultar(
      capitanA,
      `${ruta}?pagina=${Number.MAX_SAFE_INTEGER}&limite=50`,
    ).expect(200, {
      pagina: Number.MAX_SAFE_INTEGER,
      limite: 50,
      total: 45,
      datos: [],
    });
    await consultar(capitanC).expect(200, {
      pagina: 1,
      limite: 20,
      total: 0,
      datos: [],
    });
    await consultar(capitanC, rutaConteo).expect(200, { total: 0 });
  });

  it('consulta el aviso completo y conserva el estado hasta el primer PATCH', async () => {
    const id = await avisoSinLeer(capitanA.id);
    await consultar(capitanA, rutaConteo)
      .expect('Cache-Control', 'private, no-store')
      .expect(200, { total: 25 });
    const listado = (await consultar(capitanA, `${ruta}?limite=50`).expect(200))
      .body as PaginaAvisosDto;
    const { body } = await consultar(capitanA, `${ruta}/${id}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    const aviso = body as AvisoDto;
    expect(aviso).toEqual(listado.datos.find((fila) => fila.id === id));
    expect(aviso).toMatchObject({
      id,
      creadoEn: expect.stringMatching(/Z$/),
      leidoEn: null,
    });
    expect(Object.keys(aviso).toSorted()).toEqual(
      [
        'id',
        'moduloOrigen',
        'tipo',
        'titulo',
        'mensaje',
        'creadoEn',
        'leidoEn',
        'referencia',
        'datos',
      ].toSorted(),
    );
    await consultar(capitanA, rutaConteo).expect(200, { total: 25 });

    try {
      const primera = await leer(capitanA, id)
        .expect('Cache-Control', 'private, no-store')
        .expect(200);
      const lectura = primera.body as LecturaAvisoDto;
      expect(lectura).toEqual({ id, leidoEn: expect.stringMatching(/Z$/) });
      await leer(capitanA, id).expect(200, lectura);
      const detalle = await consultar(capitanA, `${ruta}/${id}`).expect(200);
      expect(detalle.body).toMatchObject(lectura);
      await consultar(capitanA, rutaConteo).expect(200, { total: 24 });
    } finally {
      await db.query('UPDATE aviso SET leido_en = NULL WHERE id = $1', [id]);
    }
  });

  it('devuelve la misma primera lectura en dos solicitudes simultáneas', async () => {
    const id = await avisoSinLeer(capitanA.id);
    try {
      const [primera, segunda] = await Promise.all([
        leer(capitanA, id).expect(200),
        leer(capitanA, id).expect(200),
      ]);
      expect(primera.body).toEqual(segunda.body);
      const guardado = await db.query<{ leido_en: Date }>(
        'SELECT leido_en FROM aviso WHERE id = $1',
        [id],
      );
      expect(primera.body).toEqual({
        id,
        leidoEn: guardado.rows[0].leido_en.toISOString(),
      });
      await consultar(capitanA, rutaConteo).expect(200, { total: 24 });
    } finally {
      await db.query('UPDATE aviso SET leido_en = NULL WHERE id = $1', [id]);
    }
  });

  it('exige sesión y rol jugador en las cuatro rutas', async () => {
    const id = await avisoSinLeer(capitanA.id);
    for (const url of [ruta, rutaConteo, `${ruta}/${id}`]) {
      await cliente().get(url).expect(401);
      for (const otroRol of [arbitro, organizador])
        await consultar(otroRol, url).expect(403);
    }
    await cliente().patch(`${ruta}/${id}/leido`).expect(401);
    for (const otroRol of [arbitro, organizador])
      await leer(otroRol, id).expect(403);
  });

  it('rechaza un aviso ajeno sin exponerlo ni modificarlo y distingue el inexistente', async () => {
    const id = await avisoSinLeer(capitanB.id);
    const ajeno = (await consultar(capitanB, `${ruta}/${id}`).expect(200))
      .body as AvisoDto;
    const denegado = {
      statusCode: 403,
      error: 'Forbidden',
      message: 'No tienes permiso para ver este aviso.',
    };
    await consultar(capitanA, `${ruta}/${id}`).expect(403, denegado);
    await leer(capitanA, id).expect(403, denegado);
    await consultar(capitanB, `${ruta}/${id}`).expect(200, ajeno);
    await consultar(capitanB, rutaConteo).expect(200, { total: 1 });
    await consultar(capitanA, `${ruta}/2147483647`).expect(404);
    await leer(capitanA, 2_147_483_647).expect(404);
  });

  it('rechaza IDs, paginación y campos ajenos al contrato', async () => {
    for (const query of [
      'pagina=0',
      'pagina=1.5',
      'pagina=9007199254740992',
      'limite=0',
      'limite=51',
      'limite=1&limite=2',
      'usuarioId=ajeno',
    ]) {
      await consultar(capitanA, `${ruta}?${query}`).expect(400);
    }
    for (const id of ['0', '-2', '1e0', '2147483648']) {
      await consultar(capitanA, `${ruta}/${id}`).expect(400);
      await leer(capitanA, id).expect(400);
    }
    const propio = await avisoSinLeer(capitanA.id);
    await consultar(capitanA, `${rutaConteo}?usuarioId=${capitanB.id}`).expect(
      400,
    );
    await consultar(
      capitanA,
      `${ruta}/${propio}?usuarioId=${capitanB.id}`,
    ).expect(400);
    await leer(capitanA, propio, `?usuarioId=${capitanB.id}`).expect(400);
    await leer(capitanA, propio).send({ usuarioId: capitanB.id }).expect(400);
    await leer(capitanA, propio)
      .send({ leidoEn: '2026-11-08T12:00:00Z' })
      .expect(400);
    await leer(capitanA, propio).send([]).expect(400);
    await consultar(capitanA, rutaConteo).expect(200, { total: 25 });
  });

  it('muestra en menos de 5 segundos el aviso generado por H16 con su payload completo', async () => {
    const anio = new Date().getUTCFullYear() + 3;
    const fecha = `${anio}-01-03`;
    const { rows: temporadas } = await db.query<{ id: number }>(
      'INSERT INTO temporada(nombre, fecha_inicio, fecha_fin) VALUES ($1, $2, $3) RETURNING id',
      [`H19-${randomUUID()}`, `${anio}-01-01`, `${anio}-12-31`],
    );
    const temporadaId = temporadas[0].id;
    try {
      const { rows: jornadas } = await db.query<{ id: number }>(
        'INSERT INTO jornada(temporada_id, numero) VALUES ($1, 3) RETURNING id',
        [temporadaId],
      );
      const jornadaId = jornadas[0].id;
      const { rows: equipos } = await db.query<{ id: number }>(
        `INSERT INTO equipo(nombre, temporada_id, capitan_id, estado, validado_por, fecha_validacion)
         VALUES ('Local H19', $1, $2, 'INSCRITO', $4, now()),
                ('Rival H19', $1, $3, 'INSCRITO', $4, now()) RETURNING id`,
        [temporadaId, capitanA.id, capitanB.id, organizador.id],
      );
      const { rows: canchas } = await db.query<{ id: number; nombre: string }>(
        'SELECT id, nombre FROM cancha WHERE activa ORDER BY id LIMIT 1',
      );
      const cancha = canchas[0];
      await db.query(
        `INSERT INTO partido(temporada_id, jornada_id, equipo_local_id, equipo_visitante_id, cancha_id, arbitro_id, inicio, fin)
         VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz + interval '90 minutes')`,
        [
          temporadaId,
          jornadaId,
          equipos[0].id,
          equipos[1].id,
          cancha.id,
          arbitro.id,
          `${fecha}T14:00:00Z`,
        ],
      );

      const inicio = performance.now();
      await cliente()
        .post(`${api}/jornadas/${jornadaId}/publicar`)
        .auth(organizador.token, bearer)
        .expect(200);
      let nuevo: AvisoDto | undefined;
      await expect
        .poll(
          async () => {
            const bandeja = (await consultar(capitanA).expect(200))
              .body as PaginaAvisosDto;
            nuevo = bandeja.datos.find(
              (aviso) =>
                aviso.referencia?.tipo === 'JORNADA' &&
                aviso.referencia.id === jornadaId,
            );
            return nuevo;
          },
          {
            timeout: Math.max(1, 5_000 - (performance.now() - inicio)),
            interval: 50,
          },
        )
        .toMatchObject({
          tipo: 'JORNADA_PUBLICADA',
          moduloOrigen: 'CALENDARIO',
          referencia: { tipo: 'JORNADA', id: jornadaId },
          datos: {
            jornada: 3,
            rival: 'Rival H19',
            fecha,
            hora: '08:00',
            cancha: cancha.nombre,
          },
          leidoEn: null,
        });
      const duracion = performance.now() - inicio;
      expect(duracion).toBeLessThan(5_000);
      console.log(`H19_AVISO_H16_MS ${duracion.toFixed(1)}`);
      ok(nuevo);
      await consultar(capitanA, `${ruta}/${nuevo.id}`).expect(200, nuevo);
    } finally {
      await db.query(
        "DELETE FROM aviso WHERE referencia_tipo = 'JORNADA' AND referencia_id IN (SELECT id FROM jornada WHERE temporada_id = $1)",
        [temporadaId],
      );
      await db.query('DELETE FROM partido WHERE temporada_id = $1', [
        temporadaId,
      ]);
      await db.query('DELETE FROM jornada WHERE temporada_id = $1', [
        temporadaId,
      ]);
      await db.query('DELETE FROM equipo WHERE temporada_id = $1', [
        temporadaId,
      ]);
      await db.query('DELETE FROM temporada WHERE id = $1', [temporadaId]);
    }
  }, 15_000);

  it('expone las cuatro rutas, los errores y la paginación en Swagger', async () => {
    const { body } = await cliente().get('/api/docs-json').expect(200);
    const { paths, components } = body as {
      paths: Record<
        string,
        Record<
          string,
          {
            responses: Record<string, unknown>;
            parameters?: unknown[];
            security?: unknown[];
          }
        >
      >;
      components: { schemas: Record<string, unknown> };
    };
    const operaciones = [
      paths[ruta].get,
      paths[rutaConteo].get,
      paths[`${ruta}/{avisoId}`].get,
      paths[`${ruta}/{avisoId}/leido`].patch,
    ];
    for (const operacion of operaciones) {
      expect(Object.keys(operacion.responses)).toEqual(
        expect.arrayContaining(['200', '400', '401', '403']),
      );
      expect(operacion.security).toEqual(
        expect.arrayContaining([{ bearer: [] }]),
      );
    }
    for (const operacion of operaciones.slice(2))
      expect(operacion.responses).toHaveProperty('404');
    expect(operaciones[0].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pagina',
          schema: expect.objectContaining({ default: 1 }),
        }),
        expect.objectContaining({
          name: 'limite',
          schema: expect.objectContaining({ default: 20, maximum: 50 }),
        }),
      ]),
    );
    expect(components.schemas.AvisoDto).toMatchObject({
      properties: { datos: { nullable: true }, referencia: { nullable: true } },
    });
  });
});
