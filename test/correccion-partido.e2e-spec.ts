import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';

describe('BE-23.1 · corrección oficial', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let organizador: { id: string; token: string };
  let arbitro: { id: string; token: string };
  let jugador: { id: string; token: string };
  let jugadorUsuarioId: string;
  let capitanes: { id: string; token: string }[];
  let temporadaId: number;
  let canchaId: number;
  let jornadaId: number;
  let partidoId: number;
  let equipos: number[];
  let jugadores: number[];
  const bearer = { type: 'bearer' } as const;
  const motivo = 'La revisión oficial confirmó el cambio en el acta.';
  const acta = { motivo, golesLocal: 1, golesVisitante: 3 };
  const cliente = () => request(app.getHttpServer());
  const ruta = (id: number | string = partidoId) =>
    `/api/v1/partidos/${id}/correccion-oficial`;
  const corregir = (cuerpo: object, token = organizador.token) =>
    cliente().patch(ruta()).auth(token, bearer).send(cuerpo);
  const bitacora = () => cliente().get(ruta()).auth(organizador.token, bearer);

  async function login(email: string) {
    const { body } = await cliente()
      .post('/api/v1/auth/login')
      .send({ email, password: 'Liga2026!' })
      .expect(200);
    const token = body.accessToken as string;
    const perfil = await cliente()
      .get('/api/v1/auth/me')
      .auth(token, bearer)
      .expect(200);
    return { id: perfil.body.id as string, token };
  }

  async function insertarId(sql: string, params: (string | number | null)[]) {
    return (await db.query<{ id: number }>(sql, params)).rows[0].id;
  }

  function crearPartido(visitanteId: number, inicio: string, fin: string) {
    return insertarId(
      `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,
                          arbitro_id,inicio,fin,estado,inicio_real,fin_real,goles_local,goles_visitante)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'FINALIZADO',$7,$8,2,1) RETURNING id`,
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
  }

  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    jugadorUsuarioId = randomUUID();
    const correo = `h23-${jugadorUsuarioId}@liga.test`;
    await db.query(
      `INSERT INTO usuario(id,nombre,email,password_hash,fecha_nacimiento,updated_at)
       SELECT $1,'Jugador H23',$2,password_hash,'2000-01-01',now()
       FROM usuario WHERE email='organizador@liga.test'`,
      [jugadorUsuarioId, correo],
    );
    [organizador, arbitro, jugador, ...capitanes] = await Promise.all([
      login('organizador@liga.test'),
      login('arbitro1@liga.test'),
      login(correo),
      login('capitan.tigres-fc.ap26@liga.test'),
      login('capitan.leones-fc.ap26@liga.test'),
      login('capitan.aguilas-fc.ap26@liga.test'),
    ]);
  }, 20_000);

  beforeEach(async () => {
    const clave = `H23-${randomUUID()}`;
    equipos = [];
    jugadores = [];
    temporadaId = await insertarId(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2065-01-01','2065-12-31') RETURNING id",
      [clave],
    );
    canchaId = await insertarId(
      "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas H23') RETURNING id",
      [clave],
    );
    for (const [i, capitan] of capitanes.entries()) {
      const equipoId = await insertarId(
        `INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion)
         VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id`,
        [`Equipo H23 ${i}`, temporadaId, capitan.id, organizador.id],
      );
      const jugadorId = await insertarId(
        `INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url,usuario_id)
         VALUES ($1,'2000-01-01',$2,'/foto.jpg',$3) RETURNING id`,
        [
          `Jugador H23 ${i}`,
          randomUUID().slice(0, 20),
          i === 0 ? jugador.id : null,
        ],
      );
      equipos.push(equipoId);
      jugadores.push(jugadorId);
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [equipoId, jugadorId, temporadaId],
      );
    }
    jornadaId = await insertarId(
      `INSERT INTO jornada(temporada_id,numero,estado,publicada_en,publicada_por)
       VALUES ($1,1,'PUBLICADA',now(),$2) RETURNING id`,
      [temporadaId, organizador.id],
    );
    partidoId = await crearPartido(
      equipos[1],
      '2065-02-01T14:00:00Z',
      '2065-02-01T15:30:00Z',
    );
    await db.query(
      'INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES ($1,$2,1,1,0)',
      [partidoId, jugadores[0]],
    );
  });

  afterEach(async () => {
    const conexion = await db.connect();
    try {
      await conexion.query('BEGIN');
      // El bloqueo DDL y la restauración del trigger se limitan a esta transacción.
      await conexion.query(
        'ALTER TABLE correccion_partido DISABLE TRIGGER tr_correccion_partido_inmutable',
      );
      await conexion.query(
        'DELETE FROM correccion_partido WHERE partido_id IN (SELECT id FROM partido WHERE temporada_id=$1)',
        [temporadaId],
      );
      await conexion.query(
        'ALTER TABLE correccion_partido ENABLE TRIGGER tr_correccion_partido_inmutable',
      );
      await conexion.query(
        "DELETE FROM aviso WHERE referencia_tipo='PARTIDO' AND referencia_id IN (SELECT id FROM partido WHERE temporada_id=$1)",
        [temporadaId],
      );
      await conexion.query(
        'DELETE FROM estadistica_partido WHERE partido_id IN (SELECT id FROM partido WHERE temporada_id=$1)',
        [temporadaId],
      );
      await conexion.query('DELETE FROM posicion WHERE temporada_id=$1', [
        temporadaId,
      ]);
      await conexion.query('DELETE FROM partido WHERE temporada_id=$1', [
        temporadaId,
      ]);
      await conexion.query('DELETE FROM jornada WHERE temporada_id=$1', [
        temporadaId,
      ]);
      await conexion.query('DELETE FROM equipo WHERE temporada_id=$1', [
        temporadaId,
      ]);
      await conexion.query('DELETE FROM jugador WHERE id=ANY($1::int[])', [
        jugadores,
      ]);
      await conexion.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
      await conexion.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
      await conexion.query('COMMIT');
    } catch (error) {
      await conexion.query('ROLLBACK');
      throw error;
    } finally {
      conexion.release();
    }
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.query('DELETE FROM usuario WHERE id=$1', [jugadorUsuarioId]);
      await db.end();
    }
  });

  const primeraEstadistica = () => ({
    jugadorId: jugadores[0],
    goles: 2,
    asistencias: 3,
    tarjetas: 1,
  });

  async function avisos() {
    return (
      await db.query(
        `SELECT usuario_id,titulo,mensaje,clave_idempotencia FROM aviso
       WHERE tipo='RESULTADO_CORREGIDO' AND referencia_tipo='PARTIDO' AND referencia_id=$1`,
        [partidoId],
      )
    ).rows;
  }

  async function comprobarSinCambios() {
    const marcador = await db.query(
      'SELECT goles_local,goles_visitante FROM partido WHERE id=$1',
      [partidoId],
    );
    expect(marcador.rows).toEqual([{ goles_local: 2, goles_visitante: 1 }]);
    const estadisticas = await db.query(
      'SELECT jugador_id,goles,asistencias,tarjetas FROM estadistica_partido WHERE partido_id=$1',
      [partidoId],
    );
    expect(estadisticas.rows).toEqual([
      { jugador_id: jugadores[0], goles: 1, asistencias: 1, tarjetas: 0 },
    ]);
    const historial = await bitacora().expect(200);
    expect(historial.body).toEqual([]);
    expect(await avisos()).toEqual([]);
  }

  it('corrige el marcador y las estadísticas, audita y actualiza las consultas H6, H7, H10, H11 y H22', async () => {
    const estadistica = primeraEstadistica();
    const { body } = await corregir({
      ...acta,
      motivo: ` ${motivo} `,
      estadisticas: [estadistica],
    }).expect(200);
    const antes = {
      golesLocal: 2,
      golesVisitante: 1,
      estadisticas: [{ ...estadistica, goles: 1, asistencias: 1, tarjetas: 0 }],
    };
    const despues = {
      golesLocal: 1,
      golesVisitante: 3,
      estadisticas: [estadistica],
    };
    const correccionId = body.correccionId as number;
    expect(body).toEqual({
      partidoId,
      estado: 'FINALIZADO',
      correccionId: expect.any(Number),
      antes,
      despues,
    });
    const historial = await bitacora()
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(historial.body).toEqual([
      {
        id: correccionId,
        usuarioId: organizador.id,
        responsable: expect.any(String),
        fecha: expect.any(String),
        motivo,
        antes,
        despues,
      },
    ]);
    expect(Number.isNaN(Date.parse(historial.body[0].fecha as string))).toBe(
      false,
    );

    const marcador = await cliente()
      .get(`/api/v1/partidos/${partidoId}/marcador`)
      .expect(200);
    expect(marcador.body).toMatchObject({
      estado: 'FINALIZADO',
      local: { goles: 1 },
      visitante: { goles: 3 },
      goleadores: [{ jugadorId: estadistica.jugadorId, goles: 2 }],
    });

    const activas = await db.query<{ id: number }>(
      'SELECT id FROM temporada WHERE actual=true',
    );
    try {
      await db.query('UPDATE temporada SET actual=false WHERE actual=true');
      await db.query('UPDATE temporada SET actual=true WHERE id=$1', [
        temporadaId,
      ]);
      const tabla = await cliente().get('/api/v1/posiciones').expect(200);
      expect(tabla.body).toMatchObject({
        temporadaId,
        posiciones: [
          expect.objectContaining({
            equipoId: equipos[1],
            pj: 1,
            gf: 3,
            gc: 1,
            puntos: 3,
          }),
          expect.objectContaining({ equipoId: equipos[2], pj: 0 }),
          expect.objectContaining({
            equipoId: equipos[0],
            pj: 1,
            gf: 1,
            gc: 3,
            puntos: 0,
          }),
        ],
      });
    } finally {
      await db.query('UPDATE temporada SET actual=false WHERE id=$1', [
        temporadaId,
      ]);
      await db.query(
        'UPDATE temporada SET actual=true WHERE id=ANY($1::int[])',
        [activas.rows.map(({ id }) => id)],
      );
    }

    const temporada = `/api/v1/temporadas/${temporadaId}`;
    const personal = await cliente()
      .get(`${temporada}/mis-estadisticas`)
      .auth(jugador.token, bearer)
      .expect(200);
    expect(personal.body).toMatchObject({
      acumulados: { goles: 2, asistencias: 3, tarjetas: 1 },
      partidos: [{ partidoId, goles: 2 }],
    });
    const destacados = await cliente()
      .get(`${temporada}/jugadores-destacados?metrica=goles`)
      .auth(organizador.token, bearer)
      .expect(200);
    expect(destacados.body).toMatchObject({
      jugadores: [{ jugadorId: estadistica.jugadorId, total: 2, posicion: 1 }],
    });
    const reporte = await cliente()
      .get(`${temporada}/reporte-deportivo`)
      .auth(organizador.token, bearer)
      .expect(200);
    expect(reporte.body).toMatchObject({
      totalPartidos: 1,
      totalGoles: 4,
      totalTarjetas: 1,
      totalAsistencias: 3,
    });

    const notificaciones = await avisos();
    expect(notificaciones).toHaveLength(3);
    expect(notificaciones.map((aviso) => aviso.usuario_id)).toEqual(
      expect.arrayContaining([capitanes[0].id, capitanes[1].id, jugador.id]),
    );
    for (const aviso of notificaciones) {
      expect(aviso).toMatchObject({
        titulo: 'Resultado corregido',
        mensaje: 'El resultado del partido de la jornada 1 se corrigió a 1-3.',
        clave_idempotencia: `partido-${partidoId}-correccion-${correccionId}`,
      });
    }
  });

  it('admite estadísticas sin marcador y conserva los totales por encima de un entero de 32 bits', async () => {
    const segundo = await crearPartido(
      equipos[2],
      '2065-02-02T14:00:00Z',
      '2065-02-02T15:30:00Z',
    );
    await db.query(
      'INSERT INTO estadistica_partido(partido_id,jugador_id,goles,asistencias,tarjetas) VALUES ($1,$2,1,1,1)',
      [segundo, jugadores[0]],
    );
    const maximo = {
      jugadorId: jugadores[0],
      goles: 2_147_483_647,
      asistencias: 2_147_483_647,
      tarjetas: 2_147_483_647,
    };
    const nuevoRegistro = {
      jugadorId: jugadores[1],
      goles: 0,
      asistencias: 0,
      tarjetas: 0,
    };
    const { body } = await corregir({
      motivo,
      estadisticas: [nuevoRegistro, maximo],
    }).expect(200);
    expect(body).toMatchObject({
      antes: {
        golesLocal: 2,
        golesVisitante: 1,
        estadisticas: [{ jugadorId: jugadores[0] }],
      },
      despues: {
        golesLocal: 2,
        golesVisitante: 1,
        estadisticas: [maximo, nuevoRegistro],
      },
    });
    const temporada = `/api/v1/temporadas/${temporadaId}`;
    const destacados = await cliente()
      .get(`${temporada}/jugadores-destacados?metrica=goles`)
      .auth(organizador.token, bearer)
      .expect(200);
    expect(destacados.body.jugadores[0]).toMatchObject({
      jugadorId: jugadores[0],
      total: 2_147_483_648,
    });
    const reporte = await cliente()
      .get(`${temporada}/reporte-deportivo`)
      .auth(organizador.token, bearer)
      .expect(200);
    expect(reporte.body).toMatchObject({
      totalPartidos: 2,
      totalGoles: 6,
      totalTarjetas: 2_147_483_648,
      totalAsistencias: 2_147_483_648,
    });
  });

  it('protege ambas rutas y distingue identificador inválido de partido inexistente', async () => {
    await cliente().get(ruta()).expect(401);
    await cliente().patch(ruta()).send(acta).expect(401);
    for (const actor of [arbitro, capitanes[0], jugador]) {
      await cliente().get(ruta()).auth(actor.token, bearer).expect(403);
      const { body } = await corregir(acta, actor.token).expect(403);
      expect(body.message).toBe('No tienes permiso para esta acción.');
    }
    await cliente()
      .get(ruta('abc'))
      .auth(organizador.token, bearer)
      .expect(400);
    await cliente()
      .get(ruta(2_147_483_647))
      .auth(organizador.token, bearer)
      .expect(404);
    await cliente()
      .patch(ruta(2_147_483_647))
      .auth(organizador.token, bearer)
      .send(acta)
      .expect(404);
    await comprobarSinCambios();
  });

  it('rechaza cuerpos inválidos y jugadores de un tercer equipo sin aplicar cambios parciales', async () => {
    const estadistica = primeraEstadistica();
    const invalidos = [
      [],
      {},
      { motivo },
      { ...acta, motivo: ' '.repeat(20) },
      { ...acta, motivo: 'a'.repeat(501) },
      { ...acta, motivo: `${motivo}\0` },
      { motivo, golesLocal: 2 },
      { ...acta, golesVisitante: -1 },
      { ...acta, golesLocal: 1.2 },
      { ...acta, golesLocal: '1' },
      { ...acta, golesLocal: null },
      { ...acta, golesLocal: 100 },
      { ...acta, estado: 'EN_CURSO' },
      { ...acta, estadisticas: [] },
      { ...acta, estadisticas: null },
      { ...acta, estadisticas: [null] },
      { ...acta, estadisticas: [[estadistica]] },
      { ...acta, estadisticas: [{ ...estadistica, tarjetas: -1 }] },
      { ...acta, estadisticas: [{ ...estadistica, asistencias: 1.5 }] },
      { ...acta, estadisticas: [{ ...estadistica, goles: 2_147_483_648 }] },
      { ...acta, estadisticas: [{ ...estadistica, extra: true }] },
      { ...acta, estadisticas: [estadistica, estadistica] },
      { ...acta, golesLocal: 2, golesVisitante: 1 },
    ];
    for (const contexto of invalidos) {
      const respuesta = await corregir(contexto);
      expect(respuesta.status, JSON.stringify(contexto)).toBe(400);
    }
    await cliente()
      .patch(ruta())
      .auth(organizador.token, bearer)
      .type('json')
      .send(
        `{"motivo":${JSON.stringify(motivo)},"estadisticas":[{"jugadorId":${jugadores[0]},"goles":1,"asistencias":1,"tarjetas":-0}]}`,
      )
      .expect(400);
    for (const jugadorId of [jugadores[2], 2_147_483_647]) {
      const { body } = await corregir({
        ...acta,
        estadisticas: [estadistica, { ...estadistica, jugadorId }],
      }).expect(422);
      expect(body.message).toContain(`jugadorId ${jugadorId}`);
    }
    await comprobarSinCambios();
  });

  it.each(['PROGRAMADO', 'EN_CURSO', 'CANCELADO'])(
    'devuelve 409 para un partido %s',
    async (estado) => {
      await db.query(
        `UPDATE partido SET estado=$2::estado_partido,
                     inicio_real=CASE WHEN $2='EN_CURSO' THEN inicio ELSE NULL END,fin_real=NULL,
                     goles_local=0,goles_visitante=0 WHERE id=$1`,
        [partidoId, estado],
      );
      const { body } = await corregir(acta).expect(409);
      expect(body.message).toBe(
        'Solo se puede corregir un partido Finalizado.',
      );
      expect((await bitacora().expect(200)).body).toEqual([]);
      expect(await avisos()).toEqual([]);
    },
  );

  it('revierte marcador, estadísticas y bitácora si falla el recálculo', async () => {
    await db.query(`CREATE FUNCTION h23_fallo_recalculo() RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN RAISE EXCEPTION 'Fallo de prueba H23'; END $$`);
    try {
      await db.query(`CREATE TRIGGER h23_fallo BEFORE INSERT ON posicion FOR EACH ROW
                      WHEN (NEW.temporada_id=${temporadaId}) EXECUTE FUNCTION h23_fallo_recalculo()`);
      await corregir({ ...acta, estadisticas: [primeraEstadistica()] }).expect(
        500,
      );
      await comprobarSinCambios();
      expect(
        (
          await db.query('SELECT 1 FROM posicion WHERE temporada_id=$1', [
            temporadaId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await db.query('DROP TRIGGER IF EXISTS h23_fallo ON posicion');
      await db.query('DROP FUNCTION h23_fallo_recalculo()');
    }
  });

  it('serializa correcciones simultáneas y evita duplicar una corrección idéntica', async () => {
    await Promise.all([
      corregir(acta).expect(200),
      corregir({ ...acta, golesLocal: 0 }).expect(200),
    ]);
    const { body: historial } = await bitacora().expect(200);
    expect(historial).toHaveLength(2);
    expect(historial[0].antes).toEqual(historial[1].despues);
    expect(historial[1].antes).toMatchObject({
      golesLocal: 2,
      golesVisitante: 1,
    });
    await corregir({
      motivo,
      golesLocal: historial[0].despues.golesLocal as number,
      golesVisitante: 3,
    }).expect(400);
    expect((await bitacora().expect(200)).body).toEqual(historial);
    expect(await avisos()).toHaveLength(6);
  });
});
