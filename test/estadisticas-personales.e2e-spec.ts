import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';
import type { MisEstadisticasDto } from '../src/estadisticas/dto/estadisticas-personales.dto.js';

type Sesion = { id: string; token: string };

describe('BE-10.1 · estadísticas personales del jugador', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let jugadorSeed: Sesion;
  let organizador: Sesion;
  let arbitro: Sesion;
  let sinFicha: Sesion;
  let jugadorPendiente: Sesion;
  let aperturaId: number;
  let clausura27Id: number;

  const api = '/api/v1';
  const bearer = { type: 'bearer' } as const;
  const cliente = () => request(app.getHttpServer());
  const ruta = (temporadaId: number | string) =>
    `${api}/temporadas/${temporadaId}/mis-estadisticas`;
  const consultar = (temporadaId: number | string, token: string, query = '') =>
    cliente()
      .get(`${ruta(temporadaId)}${query}`)
      .auth(token, bearer);

  async function login(email: string, password = 'Liga2026!'): Promise<Sesion> {
    const acceso = await cliente()
      .post(`${api}/auth/login`)
      .send({ email, password })
      .expect(200);
    const token = (acceso.body as { accessToken: string }).accessToken;
    const perfil = await cliente()
      .get(`${api}/auth/me`)
      .auth(token, bearer)
      .expect(200);
    return { id: (perfil.body as { id: string }).id, token };
  }

  async function registrarJugador(nombre: string): Promise<Sesion> {
    const email = `h10-${randomUUID()}@liga.test`;
    const registro = await cliente()
      .post(`${api}/users`)
      .send({
        nombre,
        email,
        password: 'ClaveH10123',
        fechaNacimiento: '2001-05-10',
      })
      .expect(201);
    const token = registro.get('X-Access-Token');
    expect(token).toBeTruthy();
    return { id: (registro.body as { id: string }).id, token: token! };
  }

  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });

    [jugadorSeed, organizador, arbitro, sinFicha] = await Promise.all([
      login('jugador01@liga.test'),
      login('organizador@liga.test'),
      login('arbitro1@liga.test'),
      login('demo@example.com', 'Demo1234!'),
    ]);
    aperturaId = (
      await db.query<{ id: number }>(
        "SELECT id FROM temporada WHERE nombre = 'Apertura 2026'",
      )
    ).rows[0].id;
    clausura27Id = (
      await db.query<{ id: number }>(
        "SELECT id FROM temporada WHERE nombre = 'Clausura 2027'",
      )
    ).rows[0].id;

    // Cuenta vinculada a un jugador de un equipo PENDIENTE en Apertura 2026.
    jugadorPendiente = await registrarJugador('Jugador Pendiente H10');
    const vinculadoPendiente = await db.query(
      `UPDATE jugador SET usuario_id = $1
       WHERE id = (
         SELECT ej.jugador_id
         FROM equipo_jugador ej
         JOIN equipo e ON e.id = ej.equipo_id
         JOIN jugador j ON j.id = ej.jugador_id
         WHERE e.temporada_id = $2
           AND e.estado = 'PENDIENTE'
           AND j.usuario_id IS NULL
         ORDER BY ej.jugador_id
         LIMIT 1
       )`,
      [jugadorPendiente.id, aperturaId],
    );
    expect(vinculadoPendiente.rowCount).toBe(1);
  }, 20_000);

  afterAll(async () => {
    if (jugadorPendiente) {
      await db.query(
        'UPDATE jugador SET usuario_id = NULL WHERE usuario_id = $1',
        [jugadorPendiente.id],
      );
      await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [
        jugadorPendiente.id,
      ]);
      await db.query('DELETE FROM usuario WHERE id = $1', [
        jugadorPendiente.id,
      ]);
    }
    await app?.close();
    await db?.end();
  });

  it('rechaza sin sesión (401), roles distintos (403) y formatos o parámetros inválidos (400)', async () => {
    await cliente().get(ruta(aperturaId)).expect(401);
    await cliente()
      .get(ruta(aperturaId))
      .auth('token-invalido', bearer)
      .expect(401);

    await consultar(aperturaId, organizador.token).expect(403);
    await consultar(aperturaId, arbitro.token).expect(403);

    for (const idInvalido of ['0', '-1', 'abc', '1.5', '2147483648']) {
      await consultar(idInvalido, jugadorSeed.token).expect(400);
    }

    await consultar(aperturaId, jugadorSeed.token, '?jugadorId=1').expect(400);
    await cliente()
      .get(ruta(aperturaId))
      .auth(jugadorSeed.token, bearer)
      .send({ jugadorId: 1 })
      .expect(400);
  });

  it('devuelve 404 para temporada inexistente y 403 si falta ficha, inscripción o equipo INSCRITO', async () => {
    await consultar(999_999, jugadorSeed.token).expect(404);
    await consultar(999_999, sinFicha.token).expect(404);

    await consultar(aperturaId, sinFicha.token).expect(403);
    await consultar(clausura27Id, jugadorSeed.token).expect(403);
    await consultar(aperturaId, jugadorPendiente.token).expect(403);
  });

  it('consulta los acumulados y detalle oficiales del seed consolidado (DB-1.4)', async () => {
    const respuesta = await consultar(aperturaId, jugadorSeed.token).expect(
      200,
    );
    expect(respuesta.get('Cache-Control')).toBe('private, no-store');

    const body = respuesta.body as MisEstadisticasDto;
    expect(body.temporadaId).toBe(aperturaId);
    expect(body.partidos.length).toBeGreaterThan(0);
    const suma = body.partidos.reduce(
      (acc, p) => ({
        goles: acc.goles + p.goles,
        asistencias: acc.asistencias + p.asistencias,
        tarjetas: acc.tarjetas + p.tarjetas,
      }),
      { goles: 0, asistencias: 0, tarjetas: 0 },
    );
    expect(body.acumulados).toEqual(suma);
  });

  describe('reglas de cálculo, exclusión, orden y actualización', () => {
    let usuarioJugador: Sesion;
    let usuarioCompanero: Sesion;
    let usuariosTemporales: string[];
    let temporadaAId: number;
    let temporadaBId: number;
    let canchaId: number;
    let equipoA1: number;
    let rivalesA: number[];
    let equipoB1: number;
    let equipoB2: number;
    let jugadorId: number;
    let companeroId: number;
    let partidosA: number[];
    let partidoB: number;

    beforeEach(async () => {
      const clave = randomUUID().slice(0, 8);
      usuarioJugador = await registrarJugador(`Jugador H10 ${clave}`);
      usuarioCompanero = await registrarJugador(`Compañero H10 ${clave}`);

      temporadaAId = (
        await db.query<{ id: number }>(
          "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2062-01-01','2062-06-30') RETURNING id",
          [`H10-A-${clave}`],
        )
      ).rows[0].id;
      temporadaBId = (
        await db.query<{ id: number }>(
          "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2062-07-01','2062-12-31') RETURNING id",
          [`H10-B-${clave}`],
        )
      ).rows[0].id;
      canchaId = (
        await db.query<{ id: number }>(
          "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Cancha H10') RETURNING id",
          [`H10-${clave}`],
        )
      ).rows[0].id;

      const crearEquipo = async (nombre: string, tempId: number) =>
        (
          await db.query<{ id: number }>(
            "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
            [nombre, tempId, organizador.id, organizador.id],
          )
        ).rows[0].id;

      // Nota: equipo usa (temporada_id, capitan_id) UNIQUE; usamos capitanes distintos por temporada.
      const capitanesRivales = await Promise.all([
        registrarJugador(`Cap1 ${clave}`),
        registrarJugador(`Cap2 ${clave}`),
        registrarJugador(`Cap3 ${clave}`),
        registrarJugador(`Cap4 ${clave}`),
        registrarJugador(`Cap5 ${clave}`),
      ]);
      usuariosTemporales = [
        usuarioJugador.id,
        usuarioCompanero.id,
        ...capitanesRivales.map((c) => c.id),
      ];
      equipoA1 = await crearEquipo(`Club Propio ${clave}`, temporadaAId);
      const nombresRivales = [
        'Rival Uno',
        'Rival Dos',
        'Rival Tres',
        'Rival Cuatro',
        'Rival Cinco',
      ];
      rivalesA = await Promise.all(
        capitanesRivales.map(async (cap, idx) => {
          const { rows } = await db.query<{ id: number }>(
            "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
            [
              `${nombresRivales[idx]} ${clave}`,
              temporadaAId,
              cap.id,
              organizador.id,
            ],
          );
          return rows[0].id;
        }),
      );

      equipoB1 = await crearEquipo(`Club Otro ${clave}`, temporadaBId);
      equipoB2 = (
        await db.query<{ id: number }>(
          "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
          [
            `Rival Otro ${clave}`,
            temporadaBId,
            capitanesRivales[0].id,
            organizador.id,
          ],
        )
      ).rows[0].id;

      jugadorId = (
        await db.query<{ id: number }>(
          "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url,usuario_id) VALUES ($1,'2000-01-01',$2,'/foto.jpg',$3) RETURNING id",
          [`Jugador A ${clave}`, `H10A-${clave}`, usuarioJugador.id],
        )
      ).rows[0].id;
      companeroId = (
        await db.query<{ id: number }>(
          "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url,usuario_id) VALUES ($1,'2000-02-02',$2,'/foto.jpg',$3) RETURNING id",
          [`Jugador B ${clave}`, `H10B-${clave}`, usuarioCompanero.id],
        )
      ).rows[0].id;

      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3),($1,$4,$3),($5,$2,$6)',
        [
          equipoA1,
          jugadorId,
          temporadaAId,
          companeroId,
          equipoB1,
          temporadaBId,
        ],
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

      // 0: Finalizado más antiguo (local vs Rival Uno)
      // 1: Finalizado intermedio (visitante vs Rival Dos)
      // 2: Finalizado más reciente (local vs Rival Tres)
      // 3: Programado (no oficial)
      // 4: En curso (no oficial)
      // 5: Cancelado (no oficial)
      partidosA = [
        await crearPartido(
          temporadaAId,
          jornadaA,
          equipoA1,
          rivalesA[0],
          '2062-02-01T14:00:00Z',
          '2062-02-01T15:30:00Z',
          'FINALIZADO',
        ),
        await crearPartido(
          temporadaAId,
          jornadaA,
          rivalesA[1],
          equipoA1,
          '2062-02-08T16:00:00Z',
          '2062-02-08T17:30:00Z',
          'FINALIZADO',
        ),
        await crearPartido(
          temporadaAId,
          jornadaA,
          equipoA1,
          rivalesA[2],
          '2062-02-15T16:00:00Z',
          '2062-02-15T17:30:00Z',
          'FINALIZADO',
        ),
        await crearPartido(
          temporadaAId,
          jornadaA,
          equipoA1,
          rivalesA[3],
          '2062-03-01T14:00:00Z',
          '2062-03-01T15:30:00Z',
          'PROGRAMADO',
        ),
        await crearPartido(
          temporadaAId,
          jornadaA,
          rivalesA[4],
          equipoA1,
          '2062-03-08T14:00:00Z',
          '2062-03-08T15:30:00Z',
          'EN_CURSO',
        ),
        await crearPartido(
          temporadaAId,
          jornadaA,
          equipoA1,
          rivalesA[1],
          '2062-03-15T14:00:00Z',
          '2062-03-15T15:30:00Z',
          'CANCELADO',
        ),
      ];
      partidoB = await crearPartido(
        temporadaBId,
        jornadaB,
        equipoB1,
        equipoB2,
        '2062-08-01T14:00:00Z',
        '2062-08-01T15:30:00Z',
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
      await db.query('DELETE FROM jugador WHERE id = ANY($1)', [
        [jugadorId, companeroId],
      ]);
      await db.query('DELETE FROM cancha WHERE id = $1', [canchaId]);
      await db.query('DELETE FROM temporada WHERE id = ANY($1)', [temporadas]);
      await db.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [
        usuariosTemporales,
      ]);
      await db.query('DELETE FROM usuario WHERE id = ANY($1)', [
        usuariosTemporales,
      ]);
    });

    it('devuelve acumulados en cero y partidos=[] si el jugador inscrito no tiene registros oficiales', async () => {
      const res = await consultar(temporadaAId, usuarioJugador.token).expect(
        200,
      );
      expect(res.body).toEqual({
        temporadaId: temporadaAId,
        acumulados: { goles: 0, asistencias: 0, tarjetas: 0 },
        partidos: [],
      });
    });

    it('suma solo partidos FINALIZADO de la temporada, excluye no oficiales y otros jugadores, ordena DESC y refleja cambios', async () => {
      await db.query(
        `INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES
         ($1,$2,2,1,0),
         ($3,$2,1,0,1),
         ($4,$2,0,2,1),
         ($5,$2,9,9,9),
         ($6,$2,8,8,8),
         ($7,$2,7,7,7),
         ($8,$2,5,5,5),
         ($1,$9,6,6,6)`,
        [
          partidosA[0],
          jugadorId,
          partidosA[1],
          partidosA[2],
          partidosA[3],
          partidosA[4],
          partidosA[5],
          partidoB,
          companeroId,
        ],
      );

      const antes = await consultar(temporadaAId, usuarioJugador.token).expect(
        200,
      );
      const body = antes.body as MisEstadisticasDto;
      expect(body.temporadaId).toBe(temporadaAId);
      expect(body.acumulados).toEqual({
        goles: 3,
        asistencias: 3,
        tarjetas: 2,
      });
      expect(body.partidos.map((p) => p.partidoId)).toEqual([
        partidosA[2],
        partidosA[1],
        partidosA[0],
      ]);
      expect(body.partidos[0]).toEqual({
        partidoId: partidosA[2],
        fecha: '2062-02-15T16:00:00.000Z',
        rival: expect.stringMatching(/^Rival Tres /),
        goles: 0,
        asistencias: 2,
        tarjetas: 1,
      });
      expect(body.partidos[1]).toEqual({
        partidoId: partidosA[1],
        fecha: '2062-02-08T16:00:00.000Z',
        rival: expect.stringMatching(/^Rival Dos /),
        goles: 1,
        asistencias: 0,
        tarjetas: 1,
      });
      expect(body.partidos[2]).toEqual({
        partidoId: partidosA[0],
        fecha: '2062-02-01T14:00:00.000Z',
        rival: expect.stringMatching(/^Rival Uno /),
        goles: 2,
        asistencias: 1,
        tarjetas: 0,
      });

      // Otra temporada del mismo jugador devuelve solo su estadística de esa temporada.
      const otraTemp = await consultar(
        temporadaBId,
        usuarioJugador.token,
      ).expect(200);
      expect((otraTemp.body as MisEstadisticasDto).acumulados).toEqual({
        goles: 5,
        asistencias: 5,
        tarjetas: 5,
      });

      // Refleja inmediatamente una actualización posterior (p. ej. corrección oficial H23).
      await db.query(
        'UPDATE estadistica_partido SET goles = 4 WHERE partido_id = $1 AND jugador_id = $2',
        [partidosA[0], jugadorId],
      );
      const corregida = await consultar(
        temporadaAId,
        usuarioJugador.token,
      ).expect(200);
      expect((corregida.body as MisEstadisticasDto).acumulados.goles).toBe(5);

      // La consulta es de solo lectura: la cantidad de filas no cambia.
      const filas = await db.query<{ count: string }>(
        'SELECT count(*) FROM estadistica_partido WHERE jugador_id = $1',
        [jugadorId],
      );
      expect(Number(filas.rows[0].count)).toBe(7);
    });
  });

  it('documenta GET /api/v1/temporadas/{temporadaId}/mis-estadisticas en Swagger', async () => {
    const res = await cliente().get('/api/docs-json').expect(200);
    const { paths, components } = res.body as {
      paths: Record<
        string,
        Record<
          string,
          {
            responses: Record<string, unknown>;
            security?: unknown[];
          }
        >
      >;
      components: { schemas: Record<string, unknown> };
    };
    const operacion =
      paths[`${api}/temporadas/{temporadaId}/mis-estadisticas`]?.get;
    expect(operacion).toBeDefined();
    expect(Object.keys(operacion.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(operacion.security).toEqual(
      expect.arrayContaining([{ bearer: [] }]),
    );
    expect(components.schemas.MisEstadisticasDto).toBeDefined();
  });
});
