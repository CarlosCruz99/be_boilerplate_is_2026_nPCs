import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';
import type { ReporteDeportivoDto } from '../src/reportes/reporte-deportivo.dto.js';

type Sesion = { id: string; token: string };

describe('BE-22.1 · reporte deportivo de temporada', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let organizador: Sesion;
  let jugador: Sesion;
  let capitan: Sesion;
  let arbitro: Sesion;
  let aperturaId: number;
  let clausura25Id: number;

  const api = '/api/v1';
  const bearer = { type: 'bearer' } as const;
  const cliente = () => request(app.getHttpServer());
  const ruta = (temporadaId: number | string) =>
    `${api}/temporadas/${temporadaId}/reporte-deportivo`;
  const consultar = (temporadaId: number | string, token: string, query = '') =>
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
    const email = `h22-${randomUUID()}@liga.test`;
    const res = await cliente()
      .post(`${api}/users`)
      .send({
        nombre,
        email,
        password: 'ClaveH22123',
        fechaNacimiento: '2001-03-14',
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
    clausura25Id = (
      await db.query<{ id: number }>(
        "SELECT id FROM temporada WHERE nombre = 'Clausura 2025'",
      )
    ).rows[0].id;
  }, 20_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('rechaza sin sesión (401), roles no organizador (403), entradas inválidas (400), temporada inexistente (404) y escrituras', async () => {
    await cliente().get(ruta(aperturaId)).expect(401);
    await cliente()
      .get(ruta(aperturaId))
      .auth('token-invalido', bearer)
      .expect(401);

    await consultar(aperturaId, jugador.token).expect(403);
    await consultar(aperturaId, capitan.token).expect(403);
    await consultar(aperturaId, arbitro.token).expect(403);

    for (const idInvalido of ['0', '-1', 'abc', '1.5', '2147483648']) {
      await consultar(idInvalido, organizador.token).expect(400);
    }

    await consultar(aperturaId, organizador.token, '?extra=1').expect(400);
    await cliente()
      .get(ruta(aperturaId))
      .auth(organizador.token, bearer)
      .send({ totalPartidos: 99 })
      .expect(400);

    await consultar(999_999, organizador.token).expect(404);

    for (const metodo of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await cliente()
        [metodo](ruta(aperturaId))
        .auth(organizador.token, bearer)
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });

  it('consulta los datos sembrados (DB-1.4) con encabezados no-store y formato ISO 8601', async () => {
    const clausura = await consultar(clausura25Id, organizador.token).expect(
      200,
    );
    expect(clausura.get('Cache-Control')).toBe('private, no-store');
    expect(clausura.get('Vary')).toContain('Authorization');

    const bodyClausura = clausura.body as ReporteDeportivoDto;
    expect(bodyClausura.temporadaId).toBe(clausura25Id);
    expect(bodyClausura.totalPartidos).toBe(2);
    expect(bodyClausura.totalGoles).toBe(3);
    expect(bodyClausura.totalTarjetas).toBeGreaterThanOrEqual(0);
    expect(bodyClausura.totalAsistencias).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(bodyClausura.generadoEn))).toBe(false);

    const apertura = await consultar(aperturaId, organizador.token).expect(200);
    const bodyApertura = apertura.body as ReporteDeportivoDto;
    expect(bodyApertura.temporadaId).toBe(aperturaId);
    expect(bodyApertura.totalPartidos).toBe(18);
    expect(bodyApertura.totalGoles).toBeGreaterThan(0);
  });

  describe('reglas de agregación, aislamiento y reflejo en vivo (DB-22.1, H5 y H23)', () => {
    let temporadaAId: number;
    let temporadaBId: number;
    let canchaId: number;
    let usuariosTemporales: string[];
    let jugadoresIds: number[];
    let eqA1: number;
    let p1: number;
    let p2: number;
    let p3Programado: number;
    let p4EnCurso: number;
    let p5Cancelado: number;
    let p6SinStats: number;
    let pOtraTemporada: number;

    beforeEach(async () => {
      const clave = randomUUID().slice(0, 8);
      temporadaAId = (
        await db.query<{ id: number }>(
          "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2064-01-01','2064-06-30') RETURNING id",
          [`H22-A-${clave}`],
        )
      ).rows[0].id;
      temporadaBId = (
        await db.query<{ id: number }>(
          "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2064-07-01','2064-12-31') RETURNING id",
          [`H22-B-${clave}`],
        )
      ).rows[0].id;
      canchaId = (
        await db.query<{ id: number }>(
          "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Cancha H22') RETURNING id",
          [`H22-${clave}`],
        )
      ).rows[0].id;

      usuariosTemporales = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          registrarUsuario(`Cap${i + 1} ${clave}`),
        ),
      );

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

      eqA1 = await crearEquipo(
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
      const eqA5 = await crearEquipo(
        `Club A5 ${clave}`,
        temporadaAId,
        usuariosTemporales[4],
      );
      const eqA6 = await crearEquipo(
        `Club A6 ${clave}`,
        temporadaAId,
        usuariosTemporales[5],
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
      for (let i = 0; i < 7; i += 1) {
        const jId = (
          await db.query<{ id: number }>(
            "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES ($1,'2000-01-01',$2,'/foto.jpg') RETURNING id",
            [`Jugador H22 ${i + 1} ${clave}`, `H22-${i}-${clave}`],
          )
        ).rows[0].id;
        jugadoresIds.push(jId);
        await db.query(
          'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
          [i < 6 ? eqA1 : eqA2, jId, temporadaAId],
        );
      }
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [eqB1, jugadoresIds[5], temporadaBId],
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

      const crearPartido = async (opts: {
        tempId: number;
        jornId: number;
        localId: number;
        visitId: number;
        inicio: string;
        fin: string;
        estado: 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO';
        golesLocal?: number;
        golesVisitante?: number;
      }) =>
        (
          await db.query<{ id: number }>(
            `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real,fin_real,goles_local,goles_visitante)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::estado_partido,
               CASE WHEN $9::text IN ('EN_CURSO','FINALIZADO') THEN now()-interval '2 hours' ELSE NULL END,
               CASE WHEN $9::text = 'FINALIZADO' THEN now() ELSE NULL END,
               $10,$11)
             RETURNING id`,
            [
              opts.tempId,
              opts.jornId,
              opts.localId,
              opts.visitId,
              canchaId,
              arbitro.id,
              opts.inicio,
              opts.fin,
              opts.estado,
              opts.golesLocal ?? 0,
              opts.golesVisitante ?? 0,
            ],
          )
        ).rows[0].id;

      p1 = await crearPartido({
        tempId: temporadaAId,
        jornId: jornadaA,
        localId: eqA1,
        visitId: eqA2,
        inicio: '2064-02-01T14:00:00Z',
        fin: '2064-02-01T15:30:00Z',
        estado: 'FINALIZADO',
        golesLocal: 2,
        golesVisitante: 1,
      });
      p2 = await crearPartido({
        tempId: temporadaAId,
        jornId: jornadaA,
        localId: eqA1,
        visitId: eqA3,
        inicio: '2064-02-08T14:00:00Z',
        fin: '2064-02-08T15:30:00Z',
        estado: 'FINALIZADO',
        golesLocal: 0,
        golesVisitante: 0,
      });
      p3Programado = await crearPartido({
        tempId: temporadaAId,
        jornId: jornadaA,
        localId: eqA1,
        visitId: eqA4,
        inicio: '2064-02-15T14:00:00Z',
        fin: '2064-02-15T15:30:00Z',
        estado: 'PROGRAMADO',
        golesLocal: 6,
        golesVisitante: 6,
      });
      p4EnCurso = await crearPartido({
        tempId: temporadaAId,
        jornId: jornadaA,
        localId: eqA1,
        visitId: eqA5,
        inicio: '2064-02-22T14:00:00Z',
        fin: '2064-02-22T15:30:00Z',
        estado: 'EN_CURSO',
        golesLocal: 4,
        golesVisitante: 4,
      });
      p5Cancelado = await crearPartido({
        tempId: temporadaAId,
        jornId: jornadaA,
        localId: eqA2,
        visitId: eqA3,
        inicio: '2064-03-01T14:00:00Z',
        fin: '2064-03-01T15:30:00Z',
        estado: 'CANCELADO',
        golesLocal: 3,
        golesVisitante: 3,
      });
      p6SinStats = await crearPartido({
        tempId: temporadaAId,
        jornId: jornadaA,
        localId: eqA1,
        visitId: eqA6,
        inicio: '2064-03-08T14:00:00Z',
        fin: '2064-03-08T15:30:00Z',
        estado: 'PROGRAMADO',
        golesLocal: 0,
        golesVisitante: 0,
      });
      pOtraTemporada = await crearPartido({
        tempId: temporadaBId,
        jornId: jornadaB,
        localId: eqB1,
        visitId: eqB2,
        inicio: '2064-08-01T14:00:00Z',
        fin: '2064-08-01T15:30:00Z',
        estado: 'FINALIZADO',
        golesLocal: 3,
        golesVisitante: 2,
      });
    });

    afterEach(async () => {
      const temporadas = [temporadaAId, temporadaBId];
      await db.query(
        `DELETE FROM aviso
         WHERE usuario_id = ANY($1)
            OR (referencia_tipo = 'PARTIDO' AND referencia_id IN (SELECT id FROM partido WHERE temporada_id = ANY($2)))`,
        [usuariosTemporales, temporadas],
      );
      await db.query(
        'DELETE FROM estadistica_partido WHERE partido_id IN (SELECT id FROM partido WHERE temporada_id = ANY($1))',
        [temporadas],
      );
      await db.query(
        'DELETE FROM bitacora_marcador WHERE partido_id IN (SELECT id FROM partido WHERE temporada_id = ANY($1))',
        [temporadas],
      );
      await db.query('DELETE FROM partido WHERE temporada_id = ANY($1)', [
        temporadas,
      ]);
      await db.query('DELETE FROM jornada WHERE temporada_id = ANY($1)', [
        temporadas,
      ]);
      await db.query('DELETE FROM posicion WHERE temporada_id = ANY($1)', [
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

    it('devuelve cuatro ceros cuando la temporada existe sin partidos FINALIZADO', async () => {
      await db.query('DELETE FROM partido WHERE id = ANY($1)', [[p1, p2]]);

      const res = await consultar(temporadaAId, organizador.token).expect(200);
      expect(res.get('Cache-Control')).toBe('private, no-store');
      expect(res.body).toEqual({
        temporadaId: temporadaAId,
        totalPartidos: 0,
        totalGoles: 0,
        totalTarjetas: 0,
        totalAsistencias: 0,
        generadoEn: expect.any(String),
      });
      expect(
        Number.isNaN(Date.parse((res.body as ReporteDeportivoDto).generadoEn)),
      ).toBe(false);
    });

    it('calcula indicadores exactos T1 sin duplicaciones, excluye no oficiales/otras temporadas y refleja H5 y H23', async () => {
      const [ja, jb, jc, jd, je, jf, jg] = jugadoresIds;
      await db.query(
        `INSERT INTO estadistica_partido(partido_id,jugador_id,goles,tarjetas,asistencias) VALUES
         ($1,$7,2,2,1), ($1,$8,0,1,1), ($1,$9,0,0,0),
         ($2,$7,0,1,1), ($2,$8,0,0,0),
         ($3,$9,0,9,9), ($4,$9,0,9,9), ($5,$10,0,9,9),
         ($6,$11,5,7,7)`,
        [
          p1,
          p2,
          p3Programado,
          p4EnCurso,
          p5Cancelado,
          pOtraTemporada,
          ja,
          jb,
          jc,
          jg,
          jf,
        ],
      );

      // Escenario T1: P1 (2-1, 3t, 2a) + P2 (0-0, 1t, 1a) => 2 / 3 / 4 / 3.
      const resT1 = await consultar(temporadaAId, organizador.token).expect(
        200,
      );
      expect(resT1.body).toMatchObject({
        temporadaId: temporadaAId,
        totalPartidos: 2,
        totalGoles: 3,
        totalTarjetas: 4,
        totalAsistencias: 3,
      });

      // La otra temporada B está aislada (1 partido 3-2, 7 tarjetas, 7 asistencias).
      const resOtra = await consultar(temporadaBId, organizador.token).expect(
        200,
      );
      expect(resOtra.body).toMatchObject({
        temporadaId: temporadaBId,
        totalPartidos: 1,
        totalGoles: 5,
        totalTarjetas: 7,
        totalAsistencias: 7,
      });

      // Más filas de estadísticas en cero NO multiplican partidos ni goles.
      await db.query(
        `INSERT INTO estadistica_partido(partido_id,jugador_id,goles,tarjetas,asistencias) VALUES
         ($1,$3,0,0,0), ($1,$4,0,0,0), ($2,$3,0,0,0), ($2,$4,0,0,0)`,
        [p1, p2, jd, je],
      );
      const resSinDuplicar = await consultar(
        temporadaAId,
        organizador.token,
      ).expect(200);
      expect(resSinDuplicar.body).toMatchObject({
        totalPartidos: 2,
        totalGoles: 3,
        totalTarjetas: 4,
        totalAsistencias: 3,
      });

      // Partido FINALIZADO sin filas en estadistica_partido sigue contando partido y goles (+1 partido, +1 gol).
      await db.query(
        "UPDATE partido SET estado='EN_CURSO', inicio_real=now() WHERE id=$1",
        [p6SinStats],
      );
      await db.query(
        "UPDATE partido SET estado='FINALIZADO', fin_real=now(), goles_local=1, goles_visitante=0 WHERE id=$1",
        [p6SinStats],
      );
      const resSinStats = await consultar(
        temporadaAId,
        organizador.token,
      ).expect(200);
      expect(resSinStats.body).toMatchObject({
        totalPartidos: 3,
        totalGoles: 4,
        totalTarjetas: 4,
        totalAsistencias: 3,
      });

      // Finalización real vía H5 (p4EnCurso 4-4, que ya tiene 9t y 9a) se refleja de inmediato.
      await cliente()
        .post(`${api}/partidos/${p4EnCurso}/finalizar`)
        .auth(arbitro.token, bearer)
        .send({})
        .expect(200);
      const resTrasH5 = await consultar(temporadaAId, organizador.token).expect(
        200,
      );
      expect(resTrasH5.body).toMatchObject({
        temporadaId: temporadaAId,
        totalPartidos: 4,
        totalGoles: 12,
        totalTarjetas: 13,
        totalAsistencias: 12,
      });

      // Corrección oficial (H23): p1 pasa a 3-1 y ja pasa a 0 tarjetas y 2 asistencias.
      await db.query(
        'UPDATE partido SET goles_local = 3, goles_visitante = 1 WHERE id = $1',
        [p1],
      );
      await db.query(
        'UPDATE estadistica_partido SET tarjetas = 0, asistencias = 2 WHERE partido_id = $1 AND jugador_id = $2',
        [p1, ja],
      );
      const resTrasH23 = await consultar(
        temporadaAId,
        organizador.token,
      ).expect(200);
      expect(resTrasH23.body).toMatchObject({
        temporadaId: temporadaAId,
        totalPartidos: 4,
        totalGoles: 13,
        totalTarjetas: 11,
        totalAsistencias: 13,
      });
    });
  });

  it('documenta GET /api/v1/temporadas/{temporadaId}/reporte-deportivo en Swagger', async () => {
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
      paths[`${api}/temporadas/{temporadaId}/reporte-deportivo`]?.get;
    expect(operacion).toBeDefined();
    expect(Object.keys(operacion.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '500']),
    );
    expect(operacion.security).toEqual(
      expect.arrayContaining([{ bearer: [] }]),
    );
    expect(components.schemas.ReporteDeportivoDto).toBeDefined();
  });
});
