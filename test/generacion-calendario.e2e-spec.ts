import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-3.2: generación transaccional del calendario', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let organizador: string;
  let jugador: string;
  let tokenArbitro: string;
  let organizadorId: string;
  let temporadaId: number;
  let temporadas: number[];
  let usuarios: string[];
  let canchas: number[];
  let arbitros: string[];
  const api = '/api/v1';
  const client = () => request(app.getHttpServer());
  const fecha = `${new Date().getUTCFullYear() + 2}-02-12`;
  const ruta = (id = temporadaId) =>
    `${api}/temporadas/${id}/calendario/generar`;
  const datos = (cambios: Record<string, unknown> = {}) => ({
    fechaPrimeraJornada: fecha,
    horaPrimerTurno: '08:00',
    canchaIds: canchas,
    arbitroIds: arbitros,
    ...cambios,
  });
  const generar = (cambios: Record<string, unknown> = {}, id = temporadaId) =>
    client()
      .post(ruta(id))
      .auth(organizador, { type: 'bearer' })
      .send(datos(cambios));

  beforeAll(async () => {
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (email: string) => {
      const r = await client()
        .post(`${api}/auth/login`)
        .send({ email, password: 'Liga2026!' })
        .expect(200);
      return r.body.accessToken as string;
    };
    organizador = await login('organizador@liga.test');
    jugador = await login('capitan.panteras-fc.ap26@liga.test');
    tokenArbitro = await login('arbitro1@liga.test');
    const sesion = await client()
      .get(`${api}/auth/me`)
      .auth(organizador, { type: 'bearer' })
      .expect(200);
    organizadorId = sesion.body.id as string;
  }, 15000);

  beforeEach(async () => {
    temporadas = [];
    usuarios = [];
    canchas = [];
    arbitros = [];
    temporadaId = await nuevaTemporada();
    for (let i = 0; i < 2; i++) {
      const r = await db.query<{ id: number }>(
        'INSERT INTO cancha(nombre,direccion) VALUES ($1,$2) RETURNING id',
        [`BE32-${randomUUID()}`, 'Dirección de prueba'],
      );
      canchas.push(r.rows[0].id);
    }
    for (let i = 0; i < 4; i++) arbitros.push(await usuario('ARBITRO'));
  });
  afterEach(async () => {
    await db.query('DELETE FROM partido WHERE temporada_id=ANY($1::int[])', [
      temporadas,
    ]);
    await db.query('DELETE FROM jornada WHERE temporada_id=ANY($1::int[])', [
      temporadas,
    ]);
    await db.query('DELETE FROM equipo WHERE temporada_id=ANY($1::int[])', [
      temporadas,
    ]);
    await db.query('DELETE FROM temporada WHERE id=ANY($1::int[])', [
      temporadas,
    ]);
    await db.query('DELETE FROM cancha WHERE id=ANY($1::int[])', [canchas]);
    await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])', [usuarios]);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  async function usuario(rol: string) {
    const id = randomUUID();
    usuarios.push(id);
    await db.query(
      "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,rol,updated_at) VALUES ($1,$2,'sin-login','Usuario BE32','2000-01-01',$3::rol_usuario,now())",
      [id, `${id}@liga.test`, rol],
    );
    return id;
  }
  async function nuevaTemporada(cupo = 12, inscritos = cupo) {
    const r = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin,max_equipos) VALUES ($1,'2027-01-01','2099-12-31',$2) RETURNING id",
      [`BE32-${randomUUID()}`, cupo],
    );
    const id = r.rows[0].id;
    temporadas.push(id);
    for (let i = 0; i < inscritos; i++) {
      const capitan = await usuario('JUGADOR');
      await db.query(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now())",
        [`Equipo ${i}`, id, capitan, organizadorId],
      );
    }
    return id;
  }
  async function conteos(id = temporadaId) {
    const r = await db.query<{ partidos: number; jornadas: number }>(
      'SELECT (SELECT count(*)::int FROM partido WHERE temporada_id=$1) AS partidos, (SELECT count(*)::int FROM jornada WHERE temporada_id=$1) AS jornadas',
      [id],
    );
    return r.rows[0];
  }

  it('genera 66 partidos en 11 jornadas BORRADOR, cruces únicos, horarios y carga de árbitros', async () => {
    const r = await generar().expect(201);
    expect(r.body).toEqual({
      temporadaId,
      jornadas: 11,
      partidos: 66,
      estadoJornadas: 'BORRADOR',
    });
    expect(await conteos()).toEqual({ jornadas: 11, partidos: 66 });
    const jornadas = await db.query(
      'SELECT j.numero,j.estado,count(p.id)::int AS partidos FROM jornada j JOIN partido p ON p.jornada_id=j.id WHERE j.temporada_id=$1 GROUP BY j.id ORDER BY j.numero',
      [temporadaId],
    );
    expect(jornadas.rows).toEqual(
      Array.from({ length: 11 }, (_, i) => ({
        numero: i + 1,
        estado: 'BORRADOR',
        partidos: 6,
      })),
    );
    const equipos = await db.query(
      'SELECT e.id,count(p.id)::int AS partidos,count(DISTINCT p.jornada_id)::int AS jornadas FROM equipo e JOIN partido p ON p.equipo_local_id=e.id OR p.equipo_visitante_id=e.id WHERE e.temporada_id=$1 GROUP BY e.id',
      [temporadaId],
    );
    expect(equipos.rows).toHaveLength(12);
    for (const equipo of equipos.rows)
      expect(equipo).toMatchObject({ partidos: 11, jornadas: 11 });
    const cruces = await db.query(
      'SELECT DISTINCT LEAST(equipo_local_id,equipo_visitante_id),GREATEST(equipo_local_id,equipo_visitante_id) FROM partido WHERE temporada_id=$1',
      [temporadaId],
    );
    expect(cruces.rowCount).toBe(66);
    const carga = await db.query(
      'SELECT count(*)::int AS total FROM partido WHERE temporada_id=$1 GROUP BY arbitro_id ORDER BY total',
      [temporadaId],
    );
    expect(carga.rows.map((row: { total: number }) => row.total)).toEqual([
      16, 16, 17, 17,
    ]);
    const choques = await db.query(
      'SELECT 1 FROM partido a JOIN partido b ON a.id<b.id AND (a.cancha_id=b.cancha_id OR a.arbitro_id=b.arbitro_id) AND tstzrange(a.inicio,a.fin) && tstzrange(b.inicio,b.fin) WHERE a.temporada_id=$1 AND b.temporada_id=$1',
      [temporadaId],
    );
    expect(choques.rowCount).toBe(0);
    const tiempos = await db.query(
      'SELECT j.numero,p.inicio,p.fin FROM partido p JOIN jornada j ON j.id=p.jornada_id WHERE p.temporada_id=$1 ORDER BY j.numero,p.inicio,p.cancha_id',
      [temporadaId],
    );
    for (const fila of tiempos.rows)
      expect(
        (fila.fin as Date).getTime() - (fila.inicio as Date).getTime(),
      ).toBe(90 * 60000);
    expect((tiempos.rows[0].inicio as Date).toISOString()).toBe(
      `${fecha}T14:00:00.000Z`,
    );
    expect(
      (tiempos.rows[6].inicio as Date).getTime() -
        (tiempos.rows[0].inicio as Date).getTime(),
    ).toBe(7 * 86400000);
    await generar().expect(409);
    expect(await conteos()).toEqual({ jornadas: 11, partidos: 66 });
  });

  it('exige organizador y valida cuerpo, UUID, listas e identificador', async () => {
    await client().post(ruta()).send(datos()).expect(401);
    for (const token of [jugador, tokenArbitro])
      await client()
        .post(ruta())
        .auth(token, { type: 'bearer' })
        .send(datos())
        .expect(403);
    for (const cambio of [
      { fechaPrimeraJornada: '2000-01-01' },
      { fechaPrimeraJornada: '2028-02-30' },
      { fechaPrimeraJornada: `${fecha}T00:00:00Z` },
      { horaPrimerTurno: '24:00' },
      { canchaIds: [] },
      { canchaIds: [canchas[0], canchas[0]] },
      { arbitroIds: [] },
      { arbitroIds: [11] },
      { arbitroIds: null },
      { arbitroIds: [arbitros[0], arbitros[0]] },
      { estadoJornadas: 'PUBLICADA' },
    ])
      await generar(cambio).expect(400);
    await generar({}, 0).expect(400);
    expect(await conteos()).toEqual({ jornadas: 0, partidos: 0 });
  });

  it('rechaza la fecha de hoy aunque la hora del turno todavía sea futura', async () => {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
      partes.find((p) => p.type === tipo)!.value;
    await generar({
      fechaPrimeraJornada: `${valor('year')}-${valor('month')}-${valor('day')}`,
      horaPrimerTurno: '23:00',
    }).expect(400);
  });

  it('devuelve 404 por temporada, cancha o árbitro inexistentes', async () => {
    await generar({}, 2147483647).expect(404);
    await generar({ canchaIds: [2147483647] }).expect(404);
    await generar({ arbitroIds: [randomUUID(), arbitros[0]] }).expect(404);
    expect(await conteos()).toEqual({ jornadas: 0, partidos: 0 });
  });

  it('devuelve inscritos, requeridos y faltan cuando solo hay diez de doce', async () => {
    const id = await nuevaTemporada(12, 10);
    const r = await generar({}, id).expect(422);
    expect(r.body).toEqual({ inscritos: 10, requeridos: 12, faltan: 2 });
    expect(await conteos(id)).toEqual({ jornadas: 0, partidos: 0 });
  });

  it('valida árbitros suficientes, activos y de rol correcto, y canchas activas', async () => {
    const insuficientes = await generar({ arbitroIds: [arbitros[0]] }).expect(
      422,
    );
    expect(insuficientes.body).toEqual({ arbitros: 1, requeridos: 2 });
    await generar({ arbitroIds: [organizadorId, arbitros[0]] }).expect(422);
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      arbitros[0],
    ]);
    await generar().expect(422);
    await db.query('UPDATE usuario SET is_active=true WHERE id=$1', [
      arbitros[0],
    ]);
    await db.query('UPDATE cancha SET activa=false WHERE id=$1', [canchas[0]]);
    await generar().expect(422);
    expect(await conteos()).toEqual({ jornadas: 0, partidos: 0 });
  });

  it('al omitir árbitros usa todos los activos y excluye cuentas inactivas', async () => {
    await db.query('UPDATE usuario SET is_active=false WHERE id=$1', [
      arbitros[0],
    ]);
    const activos = await db.query<{ id: string }>(
      "SELECT id FROM usuario WHERE rol='ARBITRO' AND is_active ORDER BY id",
    );
    await generar({ arbitroIds: undefined }).expect(201);
    const asignados = await db.query<{ arbitro_id: string }>(
      'SELECT DISTINCT arbitro_id FROM partido WHERE temporada_id=$1 ORDER BY arbitro_id',
      [temporadaId],
    );
    expect(asignados.rows.map((r) => r.arbitro_id)).toEqual(
      activos.rows.map((r) => r.id),
    );
  });

  it('con una cancha permite un árbitro y seis turnos consecutivos', async () => {
    await generar({
      canchaIds: [canchas[0]],
      arbitroIds: [arbitros[0]],
      horaPrimerTurno: '15:00',
    }).expect(201);
    const r = await db.query(
      'SELECT min(inicio) AS inicio,max(fin) AS fin FROM partido p JOIN jornada j ON j.id=p.jornada_id WHERE p.temporada_id=$1 AND j.numero=1',
      [temporadaId],
    );
    expect(
      (r.rows[0].fin as Date).getTime() - (r.rows[0].inicio as Date).getTime(),
    ).toBe(9 * 3600000);
    expect((r.rows[0].fin as Date).getUTCHours()).toBe(6);
  });

  it('no crea nada si los turnos no caben en el día', async () => {
    await generar({ horaPrimerTurno: '19:31' }).expect(422);
    expect(await conteos()).toEqual({ jornadas: 0, partidos: 0 });
  });

  it.each([4, 5])(
    'genera para cupo %i y deja descansos si es impar',
    async (cupo) => {
      const id = await nuevaTemporada(cupo);
      const r = await generar({}, id).expect(201);
      expect(r.body).toEqual({
        temporadaId: id,
        jornadas: cupo % 2 === 0 ? cupo - 1 : cupo,
        partidos: (cupo * (cupo - 1)) / 2,
        estadoJornadas: 'BORRADOR',
      });
      const equipos = await db.query(
        'SELECT e.id,count(p.id)::int AS partidos,count(DISTINCT p.jornada_id)::int AS jornadas FROM equipo e JOIN partido p ON p.equipo_local_id=e.id OR p.equipo_visitante_id=e.id WHERE e.temporada_id=$1 GROUP BY e.id',
        [id],
      );
      expect(equipos.rows).toHaveLength(cupo);
      for (const equipo of equipos.rows)
        expect(equipo).toMatchObject({
          partidos: cupo - 1,
          jornadas: cupo - 1,
        });
    },
  );

  it('reutiliza jornadas BORRADOR sin perder su id y rechaza PUBLICADA', async () => {
    const previa = await db.query<{ id: number }>(
      'INSERT INTO jornada(temporada_id,numero) VALUES ($1,1) RETURNING id',
      [temporadaId],
    );
    await generar().expect(201);
    const r = await db.query(
      'SELECT id FROM jornada WHERE temporada_id=$1 AND numero=1',
      [temporadaId],
    );
    expect(r.rows[0].id).toBe(previa.rows[0].id);
    const otra = await nuevaTemporada(4);
    await db.query(
      "INSERT INTO jornada(temporada_id,numero,estado,publicada_en,publicada_por) VALUES ($1,1,'PUBLICADA',now(),(SELECT id FROM usuario WHERE email='organizador@liga.test'))",
      [otra],
    );
    await generar({}, otra).expect(409);
    expect(await conteos(otra)).toEqual({ jornadas: 1, partidos: 0 });
  });

  it('regenera si todos están cancelados y conserva las filas históricas', async () => {
    await generar().expect(201);
    const originales = await db.query<{ id: number }>(
      'SELECT id FROM partido WHERE temporada_id=$1 ORDER BY id',
      [temporadaId],
    );
    await db.query(
      "UPDATE partido SET estado='CANCELADO' WHERE temporada_id=$1",
      [temporadaId],
    );
    await generar().expect(201);
    expect(await conteos()).toEqual({ jornadas: 11, partidos: 132 });
    const cancelados = await db.query<{ id: number }>(
      "SELECT id FROM partido WHERE temporada_id=$1 AND estado='CANCELADO' ORDER BY id",
      [temporadaId],
    );
    expect(cancelados.rows).toEqual(originales.rows);
  });

  it('rechaza partidos EN_CURSO y FINALIZADO al igual que PROGRAMADO', async () => {
    await generar().expect(201);
    for (const estado of ['EN_CURSO', 'FINALIZADO']) {
      await db.query(
        `UPDATE partido SET estado=$2::estado_partido, inicio_real=inicio,
          fin_real=CASE WHEN $2::estado_partido='FINALIZADO' THEN fin END
          WHERE temporada_id=$1`,
        [temporadaId, estado],
      );
      await generar().expect(409);
    }
  });

  it('dos generaciones simultáneas dejan un solo calendario', async () => {
    const bloqueo = await db.connect();
    let peticiones: Promise<request.Response>[] = [];
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM temporada WHERE id=$1 FOR UPDATE', [
        temporadaId,
      ]);
      peticiones = [generar(), generar()].map((p) => Promise.resolve(p));
      const limite = Date.now() + 3000;
      let esperando = 0;
      while (esperando < 2 && Date.now() < limite) {
        const r = await db.query<{ total: string }>(
          "SELECT count(*) AS total FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM temporada%' AND query LIKE '%FOR UPDATE%'",
        );
        esperando = Number(r.rows[0].total);
        if (esperando < 2)
          await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(esperando).toBeGreaterThanOrEqual(2);
    } finally {
      await bloqueo.query('ROLLBACK');
      bloqueo.release();
    }
    const resultados = await Promise.all(peticiones);
    expect(resultados.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await conteos()).toEqual({ jornadas: 11, partidos: 66 });
  }, 15000);

  it('un conflicto de recursos con otra temporada revierte todo', async () => {
    await generar().expect(201);
    const otra = await nuevaTemporada(4);
    const r = await generar({}, otra).expect(409);
    expect(r.body.message).toMatch(/cancha|árbitro/);
    expect(await conteos(otra)).toEqual({ jornadas: 0, partidos: 0 });
  });

  it('un fallo a mitad de la inserción no deja partidos ni jornadas nuevas', async () => {
    const nombre = `be32_fallo_${randomUUID().replaceAll('-', '')}`;
    await db.query(
      `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT count(*) FROM partido WHERE temporada_id=NEW.temporada_id) >= 33 THEN RAISE EXCEPTION 'Fallo BE32 de prueba'; END IF; RETURN NEW; END; $$`,
    );
    try {
      await db.query(
        `CREATE TRIGGER ${nombre} BEFORE INSERT ON partido FOR EACH ROW WHEN (NEW.temporada_id=${temporadaId}) EXECUTE FUNCTION ${nombre}()`,
      );
      await generar().expect(500);
      expect(await conteos()).toEqual({ jornadas: 0, partidos: 0 });
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${nombre} ON partido`);
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
  });

  it('publica el endpoint, el UUID de árbitros y las respuestas en Swagger', async () => {
    const r = await client().get('/api/docs-json').expect(200);
    const operacion =
      r.body.paths[`${api}/temporadas/{id}/calendario/generar`].post;
    for (const codigo of ['201', '400', '401', '403', '404', '409', '422'])
      expect(operacion.responses[codigo]).toBeDefined();
    expect(
      r.body.components.schemas.GenerarCalendarioDto.properties.arbitroIds
        .items,
    ).toMatchObject({ type: 'string', format: 'uuid' });
  });
});
