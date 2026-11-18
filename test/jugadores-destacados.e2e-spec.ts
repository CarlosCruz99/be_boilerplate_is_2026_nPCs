import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';
import type { JugadoresDestacadosRespuestaDto } from '../src/estadisticas/dto/jugadores-destacados.dto.js';

type Sesion = { id: string; token: string };

describe('BE-11.1 · jugadores destacados de la temporada', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let organizador: Sesion;
  let jugador: Sesion;
  let capitan: Sesion;
  let arbitro: Sesion;
  let aperturaId: number;

  const api = '/api/v1';
  const bearer = { type: 'bearer' } as const;
  const cliente = () => request(app.getHttpServer());
  const ruta = (temporadaId: number | string) =>
    `${api}/temporadas/${temporadaId}/jugadores-destacados`;
  const consultar = (
    temporadaId: number | string,
    token: string,
    query = '?metrica=goles',
  ) =>
    cliente()
      .get(`${ruta(temporadaId)}${query}`)
      .auth(token, bearer);

  async function login(email: string): Promise<Sesion> {
    const acceso = await cliente()
      .post(`${api}/auth/login`)
      .send({ email, password: 'Liga2026!' })
      .expect(200);
    const token = (acceso.body as { accessToken: string }).accessToken;
    const perfil = await cliente()
      .get(`${api}/auth/me`)
      .auth(token, bearer)
      .expect(200);
    return { id: (perfil.body as { id: string }).id, token };
  }

  async function registrarUsuario(nombre: string): Promise<string> {
    const email = `h11-${randomUUID()}@liga.test`;
    const res = await cliente()
      .post(`${api}/users`)
      .send({
        nombre,
        email,
        password: 'ClaveH11123',
        fechaNacimiento: '2001-04-12',
      })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });

    [organizador, jugador, capitan, arbitro] = await Promise.all([
      login('organizador@liga.test'),
      login('jugador01@liga.test'),
      login('capitan.tigres-fc.ap26@liga.test'),
      login('arbitro1@liga.test'),
    ]);
    aperturaId = (
      await db.query<{ id: number }>(
        "SELECT id FROM temporada WHERE nombre = 'Apertura 2026'",
      )
    ).rows[0].id;
  }, 20_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('rechaza sin sesión (401), roles no organizador (403), temporada inexistente (404) y parámetros inválidos (400)', async () => {
    await cliente()
      .get(`${ruta(aperturaId)}?metrica=goles`)
      .expect(401);
    await cliente()
      .get(`${ruta(aperturaId)}?metrica=goles`)
      .auth('token-invalido', bearer)
      .expect(401);

    await consultar(aperturaId, jugador.token).expect(403);
    await consultar(aperturaId, capitan.token).expect(403);
    await consultar(aperturaId, arbitro.token).expect(403);

    for (const idInvalido of ['0', '-1', 'abc', '1.5', '2147483648']) {
      await consultar(idInvalido, organizador.token).expect(400);
    }

    for (const queryInvalido of [
      '',
      '?metrica=',
      '?metrica=tarjetas',
      '?metrica=GOLES',
      '?metrica=goles%3B%20DROP%20TABLE%20jugador',
      '?metrica=goles&extra=1',
    ]) {
      await consultar(aperturaId, organizador.token, queryInvalido).expect(400);
    }

    await cliente()
      .get(`${ruta(aperturaId)}?metrica=goles`)
      .auth(organizador.token, bearer)
      .send({ extra: true })
      .expect(400);

    await consultar(999_999, organizador.token).expect(404);
  });

  it('consulta el seed consolidado (DB-1.4) en orden descendente y posiciones densas', async () => {
    const res = await consultar(
      aperturaId,
      organizador.token,
      '?metrica=goles',
    ).expect(200);
    expect(res.get('Cache-Control')).toBe('private, no-store');

    const body = res.body as JugadoresDestacadosRespuestaDto;
    expect(body.temporadaId).toBe(aperturaId);
    expect(body.metrica).toBe('goles');
    expect(body.jugadores.length).toBeGreaterThan(0);

    let posicionEsperada = 1;
    for (let i = 0; i < body.jugadores.length; i += 1) {
      if (i > 0) {
        const previo = body.jugadores[i - 1];
        const actual = body.jugadores[i];
        expect(actual.total).toBeLessThanOrEqual(previo.total);
        if (actual.total < previo.total) {
          posicionEsperada += 1;
        } else {
          expect(actual.jugadorId).toBeGreaterThan(previo.jugadorId);
        }
      }
      expect(body.jugadores[i].posicion).toBe(posicionEsperada);
    }
  });

  describe('reglas de clasificación, empates, exclusiones y actualización tras corrección', () => {
    let usuariosTemporales: string[];
    let temporadaAId: number;
    let temporadaBId: number;
    let canchaId: number;
    let jugadoresIds: number[];
    let partidosA: number[];
    let partidoB: number;

    beforeEach(async () => {
      const clave = randomUUID().slice(0, 8);
      temporadaAId = (
        await db.query<{ id: number }>(
          "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2063-01-01','2063-06-30') RETURNING id",
          [`H11-A-${clave}`],
        )
      ).rows[0].id;
      temporadaBId = (
        await db.query<{ id: number }>(
          "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2063-07-01','2063-12-31') RETURNING id",
          [`H11-B-${clave}`],
        )
      ).rows[0].id;
      canchaId = (
        await db.query<{ id: number }>(
          "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Cancha H11') RETURNING id",
          [`H11-${clave}`],
        )
      ).rows[0].id;

      usuariosTemporales = await Promise.all([
        registrarUsuario(`Cap1 ${clave}`),
        registrarUsuario(`Cap2 ${clave}`),
        registrarUsuario(`Cap3 ${clave}`),
        registrarUsuario(`Cap4 ${clave}`),
      ]);

      const crearEquipo = async (
        nombre: string,
        tempId: number,
        capId: string,
      ) =>
        (
          await db.query<{ id: number }>(
            "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
            [nombre, tempId, capId, organizador.id],
          )
        ).rows[0].id;

      const eqA1 = await crearEquipo(
        `Club A1 ${clave}`,
        temporadaAId,
        usuariosTemporales[0],
      );
      const eqA2 = await crearEquipo(
        `Club A2 ${clave}`,
        temporadaAId,
        usuariosTemporales[1],
      );
      const eqA3 = await crearEquipo(
        `Club A3 ${clave}`,
        temporadaAId,
        usuariosTemporales[2],
      );
      const eqA4 = await crearEquipo(
        `Club A4 ${clave}`,
        temporadaAId,
        usuariosTemporales[3],
      );

      const eqB1 = await crearEquipo(
        `Club B1 ${clave}`,
        temporadaBId,
        usuariosTemporales[0],
      );
      const eqB2 = await crearEquipo(
        `Club B2 ${clave}`,
        temporadaBId,
        usuariosTemporales[1],
      );

      jugadoresIds = [];
      for (let i = 0; i < 6; i += 1) {
        const jId = (
          await db.query<{ id: number }>(
            "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES ($1,'2000-01-01',$2,'/foto.jpg') RETURNING id",
            [`Jugador ${i + 1} ${clave}`, `H11-${i}-${clave}`],
          )
        ).rows[0].id;
        jugadoresIds.push(jId);
        await db.query(
          'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
          [eqA1, jId, temporadaAId],
        );
      }
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [eqB1, jugadoresIds[0], temporadaBId],
      );

      const jornadaA = (
        await db.query<{ id: number }>(
          "INSERT INTO jornada(temporada_id,numero,estado,publicada_en,publicada_por) VALUES ($1,1,'PUBLICADA',now(),$2) RETURNING id",
          [temporadaAId, organizador.id],
        )
      ).rows[0].id;
      const jornadaB = (
        await db.query<{ id: number }>(
          "INSERT INTO jornada(temporada_id,numero,estado,publicada_en,publicada_por) VALUES ($1,1,'PUBLICADA',now(),$2) RETURNING id",
          [temporadaBId, organizador.id],
        )
      ).rows[0].id;

      const crearPartido = async (
        tempId: number,
        jornId: number,
        localId: number,
        visitId: number,
        inicio: string,
        fin: string,
        estado: 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO',
      ) =>
        (
          await db.query<{ id: number }>(
            `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real,fin_real)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::estado_partido,
               CASE WHEN $9::text IN ('EN_CURSO','FINALIZADO') THEN now()-interval '2 hours' ELSE NULL END,
               CASE WHEN $9::text = 'FINALIZADO' THEN now() ELSE NULL END)
             RETURNING id`,
            [
              tempId,
              jornId,
              localId,
              visitId,
              canchaId,
              arbitro.id,
              inicio,
              fin,
              estado,
            ],
          )
        ).rows[0].id;

      partidosA = [
        await crearPartido(
          temporadaAId,
          jornadaA,
          eqA1,
          eqA2,
          '2063-02-01T14:00:00Z',
          '2063-02-01T15:30:00Z',
          'FINALIZADO',
        ),
        await crearPartido(
          temporadaAId,
          jornadaA,
          eqA1,
          eqA3,
          '2063-02-08T14:00:00Z',
          '2063-02-08T15:30:00Z',
          'FINALIZADO',
        ),
        await crearPartido(
          temporadaAId,
          jornadaA,
          eqA1,
          eqA4,
          '2063-02-15T14:00:00Z',
          '2063-02-15T15:30:00Z',
          'PROGRAMADO',
        ),
      ];
      partidoB = await crearPartido(
        temporadaBId,
        jornadaB,
        eqB1,
        eqB2,
        '2063-08-01T14:00:00Z',
        '2063-08-01T15:30:00Z',
        'FINALIZADO',
      );
    });

    afterEach(async () => {
      const temporadas = [temporadaAId, temporadaBId];
      await db.query(
        'DELETE FROM estadistica_partido WHERE partido_id IN (SELECT id FROM partido WHERE temporada_id = ANY($1))',
        [temporadas],
      );
      await db.query('DELETE FROM partido WHERE temporada_id = ANY($1)', [
        temporadas,
      ]);
      await db.query('DELETE FROM jornada WHERE temporada_id = ANY($1)', [
        temporadas,
      ]);
      await db.query(
        'DELETE FROM equipo_jugador WHERE temporada_id = ANY($1)',
        [temporadas],
      );
      await db.query('DELETE FROM equipo WHERE temporada_id = ANY($1)', [
        temporadas,
      ]);
      await db.query('DELETE FROM jugador WHERE id = ANY($1)', [jugadoresIds]);
      await db.query('DELETE FROM cancha WHERE id = $1', [canchaId]);
      await db.query('DELETE FROM temporada WHERE id = ANY($1)', [temporadas]);
      await db.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [
        usuariosTemporales,
      ]);
      await db.query('DELETE FROM usuario WHERE id = ANY($1)', [
        usuariosTemporales,
      ]);
    });

    it('devuelve lista vacía cuando la temporada válida no tiene registros oficiales', async () => {
      const res = await consultar(
        temporadaAId,
        organizador.token,
        '?metrica=goles',
      ).expect(200);
      expect(res.body).toEqual({
        temporadaId: temporadaAId,
        metrica: 'goles',
        jugadores: [],
      });
    });

    it('calcula goles y asistencias con DENSE_RANK, excluye no oficiales/otra temporada y refleja correcciones', async () => {
      const [ja, jb, jc, jd, je, jf] = jugadoresIds;
      await db.query(
        `INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias) VALUES
         ($1,$3,3,1), ($2,$3,2,0),
         ($1,$4,3,4),
         ($2,$5,3,1),
         ($1,$6,1,0),
         ($1,$7,0,0),
         ($9,$8,9,9),
         ($10,$3,7,0)`,
        [
          partidosA[0],
          partidosA[1],
          ja,
          jb,
          jc,
          jd,
          je,
          jf,
          partidosA[2],
          partidoB,
        ],
      );

      const golesRes = await consultar(
        temporadaAId,
        organizador.token,
        '?metrica=goles',
      ).expect(200);
      const golesBody = golesRes.body as JugadoresDestacadosRespuestaDto;
      expect(golesBody.temporadaId).toBe(temporadaAId);
      expect(golesBody.metrica).toBe('goles');
      expect(
        golesBody.jugadores.map((j) => [j.jugadorId, j.total, j.posicion]),
      ).toEqual([
        [ja, 5, 1],
        [jb, 3, 2],
        [jc, 3, 2],
        [jd, 1, 3],
        [je, 0, 4],
      ]);

      const asistRes = await consultar(
        temporadaAId,
        organizador.token,
        '?metrica=asistencias',
      ).expect(200);
      const asistBody = asistRes.body as JugadoresDestacadosRespuestaDto;
      expect(
        asistBody.jugadores.map((j) => [j.jugadorId, j.total, j.posicion]),
      ).toEqual([
        [jb, 4, 1],
        [ja, 1, 2],
        [jc, 1, 2],
        [jd, 0, 3],
        [je, 0, 3],
      ]);

      // Otra temporada aislada: solo ja con 7 goles.
      const otraTemp = await consultar(
        temporadaBId,
        organizador.token,
        '?metrica=goles',
      ).expect(200);
      expect(
        (otraTemp.body as JugadoresDestacadosRespuestaDto).jugadores.map(
          (j) => [j.jugadorId, j.total, j.posicion],
        ),
      ).toEqual([[ja, 7, 1]]);

      // Corrección autorizada (simula H23): ja pasa de 5 a 2 goles -> jb y jc empatan en posición 1.
      await db.query(
        'UPDATE estadistica_partido SET goles = 0 WHERE partido_id = $1 AND jugador_id = $2',
        [partidosA[0], ja],
      );
      const corregida = await consultar(
        temporadaAId,
        organizador.token,
        '?metrica=goles',
      ).expect(200);
      expect(
        (corregida.body as JugadoresDestacadosRespuestaDto).jugadores.map(
          (j) => [j.jugadorId, j.total, j.posicion],
        ),
      ).toEqual([
        [jb, 3, 1],
        [jc, 3, 1],
        [ja, 2, 2],
        [jd, 1, 3],
        [je, 0, 4],
      ]);
    });
  });

  it('documenta GET /api/v1/temporadas/{temporadaId}/jugadores-destacados en Swagger', async () => {
    const res = await cliente().get('/api/docs-json').expect(200);
    const { paths, components } = res.body as {
      paths: Record<
        string,
        Record<
          string,
          {
            responses: Record<string, unknown>;
            parameters?: { name: string; schema?: { enum?: string[] } }[];
            security?: unknown[];
          }
        >
      >;
      components: { schemas: Record<string, unknown> };
    };
    const operacion =
      paths[`${api}/temporadas/{temporadaId}/jugadores-destacados`]?.get;
    expect(operacion).toBeDefined();
    expect(Object.keys(operacion.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(operacion.security).toEqual(
      expect.arrayContaining([{ bearer: [] }]),
    );
    expect(operacion.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'metrica',
          schema: expect.objectContaining({ enum: ['goles', 'asistencias'] }),
        }),
      ]),
    );
    expect(components.schemas.JugadoresDestacadosRespuestaDto).toBeDefined();
  });
});
