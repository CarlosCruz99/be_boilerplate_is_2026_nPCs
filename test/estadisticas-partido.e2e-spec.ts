import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CrearApp } from '../src/create-app.js';

describe('BE-9.1 · estadísticas de un partido', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let arbitro: { id: string; token: string };
  let suplente: { id: string; token: string };
  let organizador: { id: string; token: string };
  let capitanes: { id: string; token: string }[];
  let temporadaId: number;
  let canchaId: number;
  let partidoId: number;
  let equipos: number[];
  let jugadores: number[];
  const datos = { goles: 2, asistencias: 1, tarjetas: 0 };
  const bearer = { type: 'bearer' } as const;
  const cliente = () => request(app.getHttpServer());
  const ruta = (id: number | string = partidoId) =>
    `/api/v1/partidos/${id}/estadisticas`;
  const consultar = (token = arbitro.token, id: number | string = partidoId) =>
    cliente().get(ruta(id)).auth(token, bearer);
  const guardar = (
    cuerpo: object = datos,
    jugador: number | string = jugadores[0],
    token = arbitro.token,
  ) => cliente().put(`${ruta()}/${jugador}`).auth(token, bearer).send(cuerpo);

  async function login(email: string) {
    const acceso = await cliente()
      .post('/api/v1/auth/login')
      .send({ email, password: 'Liga2026!' })
      .expect(200);
    const token = acceso.body.accessToken as string;
    const perfil = await cliente()
      .get('/api/v1/auth/me')
      .auth(token, bearer)
      .expect(200);
    return { id: perfil.body.id as string, token };
  }

  beforeAll(async () => {
    const entrada = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entrada)) as {
      createApp: typeof CrearApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    [arbitro, suplente, organizador, ...capitanes] = await Promise.all([
      login('arbitro1@liga.test'),
      login('arbitro2@liga.test'),
      login('organizador@liga.test'),
      login('capitan.tigres-fc.ap26@liga.test'),
      login('capitan.leones-fc.ap26@liga.test'),
      login('capitan.aguilas-fc.ap26@liga.test'),
    ]);
  }, 20_000);

  beforeEach(async () => {
    const clave = randomUUID();
    equipos = [];
    jugadores = [];
    temporadaId = (
      await db.query<{ id: number }>(
        "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2061-01-01','2061-12-31') RETURNING id",
        [`H9-${clave}`],
      )
    ).rows[0].id;
    canchaId = (
      await db.query<{ id: number }>(
        "INSERT INTO cancha(nombre,direccion) VALUES ($1,'Pruebas H9') RETURNING id",
        [`H9-${clave}`],
      )
    ).rows[0].id;
    for (const [i, capitan] of capitanes.entries()) {
      const equipo = (
        await db.query<{ id: number }>(
          "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
          [`Equipo H9 ${i}`, temporadaId, capitan.id, organizador.id],
        )
      ).rows[0].id;
      const jugador = (
        await db.query<{ id: number }>(
          "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url) VALUES ($1,'2000-01-01',$2,'/foto.jpg') RETURNING id",
          [`Jugador H9 ${i}`, randomUUID().slice(0, 20)],
        )
      ).rows[0].id;
      equipos.push(equipo);
      jugadores.push(jugador);
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [equipo, jugador, temporadaId],
      );
    }
    const jornada = (
      await db.query<{ id: number }>(
        'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
        [temporadaId],
      )
    ).rows[0].id;
    partidoId = (
      await db.query<{ id: number }>(
        `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado,inicio_real)
       VALUES ($1,$2,$3,$4,$5,$6,'2061-02-01T14:00:00Z','2061-02-01T15:30:00Z','EN_CURSO',now()-interval '2 hours') RETURNING id`,
        [temporadaId, jornada, equipos[0], equipos[1], canchaId, arbitro.id],
      )
    ).rows[0].id;
  });

  afterEach(async () => {
    await db.query('DELETE FROM estadistica_partido WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query('DELETE FROM bitacora_marcador WHERE partido_id=$1', [
      partidoId,
    ]);
    await db.query(
      "DELETE FROM aviso WHERE referencia_tipo='PARTIDO' AND referencia_id=$1",
      [partidoId],
    );
    await db.query('DELETE FROM posicion WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM partido WHERE id=$1', [partidoId]);
    await db.query('DELETE FROM jornada WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jugador WHERE id=ANY($1::int[])', [jugadores]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
    await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('consulta ambos equipos y reemplaza cantidades sin duplicar el registro', async () => {
    await consultar()
      .expect('Cache-Control', 'private, no-store')
      .expect(200, {
        partidoId,
        temporadaId,
        estado: 'EN_CURSO',
        resultadoOficial: false,
        jugadoresHabilitados: equipos.slice(0, 2).map((equipoId, i) => ({
          jugadorId: jugadores[i],
          nombre: `Jugador H9 ${i}`,
          equipoId,
        })),
        registros: [],
      });
    await Promise.all([
      guardar().expect(200, { jugadorId: jugadores[0], ...datos }),
      guardar().expect(200, { jugadorId: jugadores[0], ...datos }),
    ]);
    const correccion = { goles: 0, asistencias: 2, tarjetas: 1 };
    await guardar(correccion).expect(200, {
      jugadorId: jugadores[0],
      ...correccion,
    });
    const lectura = await consultar().expect(200);
    expect(lectura.body.registros).toEqual([
      { jugadorId: jugadores[0], ...correccion },
    ]);
  });

  it('exige la asignación vigente tanto en la lectura como en la escritura', async () => {
    await cliente().get(ruta()).expect(401);
    await cliente().put(`${ruta()}/${jugadores[0]}`).send(datos).expect(401);
    for (const { token } of [suplente, organizador, capitanes[0]]) {
      await consultar(token).expect(403);
      await guardar(datos, jugadores[0], token).expect(403);
    }
    await db.query('UPDATE partido SET arbitro_id=$2 WHERE id=$1', [
      partidoId,
      suplente.id,
    ]);
    await consultar().expect(403);
    await guardar().expect(403);
    await consultar(suplente.token).expect(200);
    await guardar(datos, jugadores[0], suplente.token).expect(200);
  });

  it('distingue errores de formato, valores, inscripción y recursos inexistentes', async () => {
    await guardar().expect(200);
    await guardar({ goles: 2 }).expect(400);
    await guardar({ ...datos, usuarioId: arbitro.id }).expect(400);
    await guardar(datos, '0').expect(400);
    await consultar(arbitro.token, 'no-valido').expect(400);
    await consultar(arbitro.token, 2_147_483_647).expect(404);
    await guardar(datos, 2_147_483_647).expect(404);
    await guardar(datos, jugadores[2]).expect(422);
    for (const goles of [-1, 1.5, '2', 2_147_483_648]) {
      await guardar({ ...datos, goles }).expect(422);
    }
    const lectura = await consultar().expect(200);
    expect(lectura.body.registros).toEqual([
      { jugadorId: jugadores[0], ...datos },
    ]);
  });

  it('rechaza el guardado en partidos programados o cancelados', async () => {
    for (const estado of ['PROGRAMADO', 'CANCELADO']) {
      await db.query(
        'UPDATE partido SET estado=$2::estado_partido, inicio_real=NULL WHERE id=$1',
        [partidoId, estado],
      );
      await guardar().expect(409);
    }
  });

  it('reanuda el PUT después de la finalización de H5 y conserva las estadísticas oficiales', async () => {
    await guardar().expect(200);
    const bloqueo = await db.connect();
    const pendientes: Promise<request.Response>[] = [];
    const esperarBloqueo = async (tabla: 'partido' | 'temporada') => {
      await expect
        .poll(
          async () => {
            const { rows } = await db.query<{ esperando: boolean }>(
              "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE $1) AS esperando",
              [`%FROM ${tabla} WHERE id=%FOR UPDATE%`],
            );
            return rows[0].esperando;
          },
          { timeout: 2500, interval: 25 },
        )
        .toBe(true);
    };
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM partido WHERE id=$1 FOR UPDATE', [
        partidoId,
      ]);
      pendientes.push(
        Promise.resolve(
          cliente()
            .post(`/api/v1/partidos/${partidoId}/finalizar`)
            .auth(arbitro.token, bearer),
        ),
      );
      await esperarBloqueo('partido');
      pendientes.push(Promise.resolve(guardar({ ...datos, goles: 9 })));
      await esperarBloqueo('temporada');
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
      await Promise.allSettled(pendientes);
    }
    const [finalizado, escritura] = await Promise.all(pendientes);
    expect(finalizado.status).toBe(200);
    expect(escritura.status).toBe(409);
    expect(escritura.body.message).toContain('corrección autorizada (H23)');
    const lectura = await consultar().expect(200);
    expect(lectura.body).toMatchObject({
      estado: 'FINALIZADO',
      resultadoOficial: true,
      registros: [{ jugadorId: jugadores[0], ...datos }],
    });
  });
});
