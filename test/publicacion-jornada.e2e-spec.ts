import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';
import type { AvisosService as ServicioAvisos } from '../src/avisos/services/avisos.service.js';
import type { CrearAvisoDto } from '../src/avisos/avisos.contract.js';

describe('BE-16.1: publicación y servicio central de avisos', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let avisos: ServicioAvisos;
  let organizador: string;
  let organizadorId: string;
  let capitan: string;
  let capitanId: string;
  let arbitro: string;
  let arbitroId: string;
  let temporadaId: number;
  let jornadaId: number;
  let canchaId: number;
  let equipos: number[];
  let capitanes: string[];
  let usuarios: string[];
  let jugadores: number[];
  const api = '/api/v1';
  const client = () => request(app.getHttpServer());
  const ruta = (id = jornadaId) => `${api}/jornadas/${id}/publicar`;
  const publicar = (id = jornadaId) =>
    client().post(ruta(id)).auth(organizador, { type: 'bearer' });
  const clave = () => `prueba-be16-${randomUUID()}`;

  beforeAll(async () => {
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const entradaAvisos = '../dist/avisos/services/avisos.service.js';
    const modulo = (await import(
      /* @vite-ignore */ entradaAvisos
    )) as typeof import('../src/avisos/services/avisos.service.js');
    avisos = app.get(modulo.AvisosService);
    const login = async (email: string) => {
      const r = await client()
        .post(`${api}/auth/login`)
        .send({ email, password: 'Liga2026!' })
        .expect(200);
      const token = r.body.accessToken as string;
      const me = await client()
        .get(`${api}/auth/me`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      return { token, id: me.body.id as string };
    };
    const org = await login('organizador@liga.test');
    organizador = org.token;
    organizadorId = org.id;
    const cap = await login('capitan.tigres-fc.ap26@liga.test');
    capitan = cap.token;
    capitanId = cap.id;
    const arb = await login('arbitro1@liga.test');
    arbitro = arb.token;
    arbitroId = arb.id;
  }, 15000);

  beforeEach(async () => {
    usuarios = [];
    jugadores = [];
    equipos = [];
    capitanes = [];
    const t = await db.query<{ id: number }>(
      "INSERT INTO temporada(nombre,fecha_inicio,fecha_fin) VALUES ($1,'2027-01-01','2099-12-31') RETURNING id",
      [`BE16-${randomUUID()}`],
    );
    temporadaId = t.rows[0].id;
    const j = await db.query<{ id: number }>(
      'INSERT INTO jornada(temporada_id,numero) VALUES ($1,3) RETURNING id',
      [temporadaId],
    );
    jornadaId = j.rows[0].id;
    const c = await db.query<{ id: number }>(
      'INSERT INTO cancha(nombre,direccion) VALUES ($1,$2) RETURNING id',
      [`BE16-${randomUUID()}`, 'Cancha de prueba'],
    );
    canchaId = c.rows[0].id;
    for (let i = 0; i < 7; i++) {
      const id = i === 0 ? capitanId : await usuario();
      capitanes.push(id);
      const e = await db.query<{ id: number }>(
        "INSERT INTO equipo(nombre,temporada_id,capitan_id,estado,validado_por,fecha_validacion) VALUES ($1,$2,$3,'INSCRITO',$4,now()) RETURNING id",
        [`Equipo ${i}`, temporadaId, id, organizadorId],
      );
      equipos.push(e.rows[0].id);
    }
    for (let i = 0; i < 3; i++) {
      await db.query(
        `INSERT INTO partido(temporada_id,jornada_id,equipo_local_id,equipo_visitante_id,cancha_id,arbitro_id,inicio,fin,estado)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::estado_partido)`,
        [
          temporadaId,
          jornadaId,
          equipos[i * 2],
          equipos[i * 2 + 1],
          canchaId,
          arbitroId,
          new Date(`2028-01-02T0${i * 2 + 2}:30:00Z`),
          new Date(`2028-01-02T0${i * 2 + 4}:00:00Z`),
          i === 2 ? 'CANCELADO' : 'PROGRAMADO',
        ],
      );
    }
  });
  afterEach(async () => {
    await db.query(
      "DELETE FROM aviso WHERE (referencia_tipo='JORNADA' AND referencia_id IN (SELECT id FROM jornada WHERE temporada_id=$1)) OR usuario_id=ANY($2::uuid[])",
      [temporadaId, usuarios],
    );
    await db.query('DELETE FROM partido WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jornada WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM equipo WHERE temporada_id=$1', [temporadaId]);
    await db.query('DELETE FROM jugador WHERE id=ANY($1::int[])', [jugadores]);
    await db.query('DELETE FROM temporada WHERE id=$1', [temporadaId]);
    await db.query('DELETE FROM cancha WHERE id=$1', [canchaId]);
    await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])', [usuarios]);
  });
  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  async function usuario() {
    const id = randomUUID();
    usuarios.push(id);
    await db.query(
      "INSERT INTO usuario(id,email,password_hash,nombre,fecha_nacimiento,updated_at) VALUES ($1,$2,'sin-login','Usuario BE16','2000-01-01',now())",
      [id, `${id}@liga.test`],
    );
    return id;
  }
  async function estado() {
    const r = await db.query(
      'SELECT estado,publicada_en,publicada_por FROM jornada WHERE id=$1',
      [jornadaId],
    );
    return r.rows[0];
  }
  async function avisosJornada() {
    const r = await db.query(
      "SELECT * FROM aviso WHERE referencia_tipo='JORNADA' AND referencia_id=$1 ORDER BY id",
      [jornadaId],
    );
    return r.rows;
  }
  const envio = (cambios: Partial<CrearAvisoDto> = {}): CrearAvisoDto => ({
    moduloOrigen: 'CALENDARIO',
    tipo: 'JORNADA_PUBLICADA',
    destinatario: { usuarioId: capitanes[1] },
    titulo: 'Título',
    mensaje: 'Mensaje',
    claveIdempotencia: clave(),
    ...cambios,
  });

  it('publica, registra quién/cuándo y crea solo un aviso por capitán participante', async () => {
    const previo = await client()
      .get(`${api}/equipos/${equipos[0]}/partidos`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    expect(previo.body.total).toBe(0);
    const r = await publicar().expect(200);
    expect(r.body).toEqual({
      id: jornadaId,
      estado: 'PUBLICADA',
      publicadaEn: expect.any(String),
    });
    const guardado = await estado();
    expect(guardado.estado).toBe('PUBLICADA');
    expect(guardado.publicada_por).toBe(organizadorId);
    expect((guardado.publicada_en as Date).toISOString()).toBe(
      r.body.publicadaEn,
    );
    const creados = await avisosJornada();
    expect(creados).toHaveLength(4);
    expect(new Set(creados.map((a) => a.usuario_id))).toEqual(
      new Set(capitanes.slice(0, 4)),
    );
    const propio = creados.find((a) => a.usuario_id === capitanId)!;
    expect(propio).toMatchObject({
      modulo_origen: 'CALENDARIO',
      tipo: 'JORNADA_PUBLICADA',
      titulo: 'Calendario publicado: jornada 3',
      leido_en: null,
      clave_idempotencia: `jornada-${jornadaId}-capitan-${capitanId}`,
      datos: {
        jornada: 3,
        rival: 'Equipo 1',
        fecha: '2028-01-01',
        hora: '20:30',
        cancha: expect.any(String),
      },
    });
    const visible = await client()
      .get(`${api}/equipos/${equipos[0]}/partidos`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    expect(visible.body.total).toBe(1);
    expect(Date.now() - (propio.creado_en as Date).getTime()).toBeLessThan(
      60000,
    );
    await publicar().expect(409);
    expect(await avisosJornada()).toHaveLength(4);
    expect((await estado()).publicada_en).toEqual(guardado.publicada_en);
  });

  it('no publica sin sesión, con otros roles, cuerpo no vacío o id inválido', async () => {
    await client().post(ruta()).expect(401);
    for (const token of [capitan, arbitro])
      await client().post(ruta()).auth(token, { type: 'bearer' }).expect(403);
    await publicar().send({ publicadaPorId: capitanId }).expect(400);
    await publicar(0).expect(400);
    await publicar(2147483647).expect(404);
    expect(await estado()).toEqual({
      estado: 'BORRADOR',
      publicada_en: null,
      publicada_por: null,
    });
    expect(await avisosJornada()).toHaveLength(0);
  });

  it('no publica jornadas vacías o con todos los partidos cancelados', async () => {
    await db.query(
      "UPDATE partido SET estado='CANCELADO' WHERE jornada_id=$1",
      [jornadaId],
    );
    await publicar().expect(422);
    await db.query('DELETE FROM partido WHERE jornada_id=$1', [jornadaId]);
    await publicar().expect(422);
    expect((await estado()).estado).toBe('BORRADOR');
    expect(await avisosJornada()).toHaveLength(0);
  });

  it('dos publicaciones simultáneas guardan una sola publicación y cuatro avisos', async () => {
    const bloqueo = await db.connect();
    let peticiones: Promise<request.Response>[] = [];
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM temporada WHERE id=$1 FOR UPDATE', [
        temporadaId,
      ]);
      peticiones = [publicar(), publicar()].map((p) => Promise.resolve(p));
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
      200, 409,
    ]);
    expect(await avisosJornada()).toHaveLength(4);
  }, 15000);

  it('revierte publicación y avisos previos si falla un destinatario posterior', async () => {
    const nombre = `be16_fallo_${randomUUID().replaceAll('-', '')}`;
    await db.query(
      `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo BE16 de prueba'; END; $$`,
    );
    try {
      await db.query(
        `CREATE TRIGGER ${nombre} BEFORE INSERT ON aviso FOR EACH ROW WHEN (NEW.usuario_id='${capitanes[2]}'::uuid AND NEW.referencia_id=${jornadaId}) EXECUTE FUNCTION ${nombre}()`,
      );
      await publicar().expect(500);
      expect(await avisosJornada()).toHaveLength(0);
      expect(await estado()).toEqual({
        estado: 'BORRADOR',
        publicada_en: null,
        publicada_por: null,
      });
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${nombre} ON aviso`);
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
  });

  it('el servicio central guarda un usuario y omite reintentos con la misma clave', async () => {
    const dto = envio();
    const resultados = await Promise.all([avisos.send(dto), avisos.send(dto)]);
    expect(
      resultados.map((r) => r.avisosCreados).sort((a, b) => a - b),
    ).toEqual([0, 1]);
    const sinClave = envio({ claveIdempotencia: undefined });
    expect((await avisos.send(sinClave)).avisosCreados).toBe(1);
    expect((await avisos.send(sinClave)).avisosCreados).toBe(1);
  });

  it('el servicio central resuelve un equipo, deduplica y omite fichas sin cuenta', async () => {
    const miembro = await usuario();
    for (const cuenta of [capitanes[2], miembro, null]) {
      const r = await db.query<{ id: number }>(
        "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url,usuario_id) VALUES ('Jugador BE16','2000-01-01',$1,'/foto.png',$2) RETURNING id",
        [randomUUID().slice(0, 20), cuenta],
      );
      jugadores.push(r.rows[0].id);
      await db.query(
        'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
        [equipos[2], r.rows[0].id, temporadaId],
      );
    }
    const r = await avisos.send(
      envio({ destinatario: { equipoId: equipos[2], temporadaId } }),
    );
    expect(r.avisosCreados).toBe(2);
    const filas = await db.query(
      'SELECT usuario_id FROM aviso WHERE id=ANY($1::int[])',
      [r.avisoIds],
    );
    expect(
      new Set(filas.rows.map((a: { usuario_id: string }) => a.usuario_id)),
    ).toEqual(new Set([capitanes[2], miembro]));
  });

  it('el servicio central valida destinatarios y el tamaño JSONB real sin escribir', async () => {
    const dto = envio();
    await expect(avisos.send({ ...dto, titulo: '' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      avisos.send({ ...dto, destinatario: { usuarioId: randomUUID() } }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      avisos.send({
        ...dto,
        destinatario: { equipoId: 2147483647, temporadaId },
      }),
    ).rejects.toMatchObject({ status: 404 });
    const datos = Object.fromEntries(
      Array.from({ length: 170 }, (_, i) => [`k${i}`, 'a']),
    );
    expect(Buffer.byteLength(JSON.stringify(datos))).toBeLessThanOrEqual(2048);
    await expect(avisos.send({ ...dto, datos })).rejects.toMatchObject({
      status: 400,
    });
    const r = await db.query(
      'SELECT 1 FROM aviso WHERE clave_idempotencia=$1',
      [dto.claveIdempotencia],
    );
    expect(r.rowCount).toBe(0);
  });

  it('el servicio central revierte todo el lote si falla un destinatario del equipo', async () => {
    const miembro = await usuario();
    const r = await db.query<{ id: number }>(
      "INSERT INTO jugador(nombre_completo,fecha_nacimiento,identificacion,foto_url,usuario_id) VALUES ('Jugador BE16','2000-01-01',$1,'/foto.png',$2) RETURNING id",
      [randomUUID().slice(0, 20), miembro],
    );
    jugadores.push(r.rows[0].id);
    await db.query(
      'INSERT INTO equipo_jugador(equipo_id,jugador_id,temporada_id) VALUES ($1,$2,$3)',
      [equipos[2], r.rows[0].id, temporadaId],
    );
    const nombre = `h20_fallo_${randomUUID().replaceAll('-', '')}`;
    await db.query(
      `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo H20 de prueba'; END; $$`,
    );
    const dto = envio({ destinatario: { equipoId: equipos[2], temporadaId } });
    try {
      await db.query(
        `CREATE TRIGGER ${nombre} BEFORE INSERT ON aviso FOR EACH ROW WHEN (NEW.usuario_id='${miembro}'::uuid) EXECUTE FUNCTION ${nombre}()`,
      );
      await expect(avisos.send(dto)).rejects.toBeDefined();
      const filas = await db.query(
        'SELECT 1 FROM aviso WHERE clave_idempotencia=$1',
        [dto.claveIdempotencia],
      );
      expect(filas.rowCount).toBe(0);
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${nombre} ON aviso`);
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
  });

  it('documenta el endpoint y sus respuestas en Swagger', async () => {
    const r = await client().get('/api/docs-json').expect(200);
    const operacion = r.body.paths[`${api}/jornadas/{id}/publicar`].post;
    for (const codigo of ['200', '400', '401', '403', '404', '409', '422'])
      expect(operacion.responses[codigo]).toBeDefined();
  });
});
