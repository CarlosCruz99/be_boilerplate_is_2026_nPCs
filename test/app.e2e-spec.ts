import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { ok } from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('API (e2e)', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let uploads: string;
  const client = () => request(app.getHttpServer());
  const api = '/api/v1';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1cAAAAASUVORK5CYII=',
    'base64',
  );
  const jpg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGB' +
      'YUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAB' +
      'AAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhBy' +
      'JxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKT' +
      'lJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAA' +
      'AAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRom' +
      'JygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExc' +
      'bHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooor8MP9Uz/2Q==',
    'base64',
  );
  const datosFicha = () => ({
    nombreCompleto: 'Ana López',
    fechaNacimiento: '2004-05-12',
    identificacion: randomUUID().slice(0, 13),
  });
  const validUser = () => ({
    nombre: 'Ana López',
    email: `h1-${randomUUID()}@liga.test`,
    password: 'unaclave1',
    fechaNacimiento: '2004-05-12',
  });

  beforeAll(async () => {
    uploads = await mkdtemp(join(tmpdir(), 'npcs-h1-'));
    vi.stubEnv('UPLOADS_DIR', uploads);
    // El build de Nest emite los metadatos de los decoradores usados por DI y los DTO.
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    // Mantiene el mismo servidor abierto durante las solicitudes simultáneas.
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
    vi.unstubAllEnvs();
    if (uploads) await rm(uploads, { recursive: true, force: true });
  });

  async function login(email: string, password = 'Liga2026!') {
    const response = await client()
      .post(`${api}/auth/login`)
      .send({ email, password })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function register() {
    const created = await client()
      .post(`${api}/users`)
      .send(validUser())
      .expect(201);
    const token = created.get('X-Access-Token');
    ok(token, 'El registro debe entregar un access token');
    return token;
  }

  async function temporadas(token: string) {
    const response = await client()
      .get(`${api}/temporadas`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    return response.body as {
      id: number;
      nombre: string;
      actual: boolean;
      inscripcionAbierta: boolean;
    }[];
  }

  async function nuevoEquipo() {
    const token = await register();
    const abierta = (await temporadas(token)).find(
      (season) => season.inscripcionAbierta,
    )!;
    const nombre = `Equipo ${randomUUID()}`;
    const response = await client()
      .post(`${api}/equipos`)
      .auth(token, { type: 'bearer' })
      .send({ nombre, temporadaId: abierta.id })
      .expect(201);
    return {
      ...(response.body as { id: number; nombre: string; temporadaId: number }),
      token,
    };
  }

  const plantilla = (equipoId: number) =>
    `${api}/equipos/${equipoId}/jugadores`;
  function agregar(equipoId: number, token: string, datos = datosFicha()) {
    return client()
      .post(plantilla(equipoId))
      .auth(token, { type: 'bearer' })
      .field(datos);
  }

  const rutaVincular = `${api}/jugadores/vincular`;
  function vincular(
    token: string,
    { identificacion, fechaNacimiento }: ReturnType<typeof datosFicha>,
  ) {
    return client()
      .post(rutaVincular)
      .auth(token, { type: 'bearer' })
      .send({ identificacion, fechaNacimiento });
  }

  it('mantiene el health check público', async () => {
    await client()
      .get(api)
      .set('Authorization', 'Bearer invalid')
      .expect(200, 'Hello World!');
  });

  it('registra JUGADOR e inicia sesión con el JWT y el refresh token existentes', async () => {
    const input = validUser();
    const created = await client().post(`${api}/users`).send(input).expect(201);
    const { id } = created.body as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.body).toEqual({
      id,
      email: input.email,
      nombre: input.nombre,
      rol: 'JUGADOR',
    });
    expect(created.get('Cache-Control')).toBe('no-store');
    const accessToken = created.get('X-Access-Token');
    ok(accessToken, 'El registro debe entregar un access token');
    await client()
      .get(`${api}/auth/me`)
      .auth(accessToken, { type: 'bearer' })
      .expect(200, {
        id,
        email: input.email,
        nombre: input.nombre,
        rol: 'JUGADOR',
        equipoActualId: null,
        capitaneaEquipoId: null,
      });
    await client()
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: created.get('X-Refresh-Token') })
      .expect(200);
  });

  it('rechaza rol, campos extra y datos inválidos en el registro', async () => {
    for (const extra of [{ rol: 'ORGANIZADOR' }, { telefono: '123' }]) {
      const result = await client()
        .post(`${api}/users`)
        .send({ ...validUser(), ...extra })
        .expect(400);
      expect(result.body).toMatchObject({ message: 'Campo no permitido.' });
    }
    for (const invalid of [
      { nombre: '  Ab  ' },
      { email: 'invalido' },
      { password: 'solo-letras' },
      { password: `${'á'.repeat(36)}1` },
      { fechaNacimiento: '2004-02-30' },
      { fechaNacimiento: '2999-01-01' },
      { fechaNacimiento: '2004-05-12T00:00:00Z' },
    ]) {
      await client()
        .post(`${api}/users`)
        .send({ ...validUser(), ...invalid })
        .expect(400);
    }
  });

  it('rechaza el correo duplicado incluso con otra capitalización', async () => {
    const input = validUser();
    const responses = await Promise.all([
      client().post(`${api}/users`).send(input),
      client()
        .post(`${api}/users`)
        .send({ ...input, email: input.email.toUpperCase() }),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(
      responses.find((response) => response.status === 409)?.body,
    ).toMatchObject({
      message: 'Este correo ya está registrado.',
    });
  });

  it('devuelve 401 sin sesión y resuelve el equipo actual de capitán y jugador del seed', async () => {
    const unauthorized = await client().get(`${api}/auth/me`).expect(401);
    expect(unauthorized.body).toMatchObject({
      message: 'Sesión no válida. Inicia sesión.',
    });
    await client()
      .get(`${api}/auth/me`)
      .auth('invalid', { type: 'bearer' })
      .expect(401);

    const tokens = await Promise.all([
      login('capitan.tigres-fc.ap26@liga.test'),
      login('jugador01@liga.test'),
      login('demo@example.com', 'Demo1234!'),
    ]);
    const profiles = await Promise.all(
      tokens.map((token) =>
        client()
          .get(`${api}/auth/me`)
          .auth(token, { type: 'bearer' })
          .expect(200),
      ),
    );
    const [captainProfile, playerProfile, demoProfile] = profiles.map(
      (response) =>
        response.body as {
          equipoActualId: number | null;
          capitaneaEquipoId: number | null;
        },
    );
    expect(captainProfile.equipoActualId).toBeGreaterThan(0);
    expect(captainProfile.capitaneaEquipoId).toBe(
      captainProfile.equipoActualId,
    );
    expect(playerProfile.equipoActualId).toBe(captainProfile.equipoActualId);
    expect(playerProfile.capitaneaEquipoId).toBeNull();
    expect(demoProfile).toMatchObject({
      equipoActualId: null,
      capitaneaEquipoId: null,
    });
  });

  it('consulta temporadas con sesión, filtros booleanos y fechas ISO', async () => {
    await client().get(`${api}/temporadas`).expect(401);
    const token = await login('arbitro1@liga.test');
    const abierta = await client()
      .get(`${api}/temporadas?inscripcionAbierta=true`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(abierta.body).toEqual([
      {
        id: expect.any(Number),
        nombre: 'Clausura 2027',
        actual: false,
        inscripcionAbierta: true,
        fechaInicio: '2027-03-01',
        fechaFin: '2027-06-30',
      },
    ]);
    const cerradas = await client()
      .get(`${api}/temporadas?inscripcionAbierta=false`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(cerradas.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nombre: 'Apertura 2026',
          inscripcionAbierta: false,
        }),
      ]),
    );
    await client()
      .get(`${api}/temporadas?inscripcionAbierta=1`)
      .auth(token, { type: 'bearer' })
      .expect(400);
  });

  it('inscribe un equipo pendiente y devuelve su capitanía, motivo y contador', async () => {
    const token = await register();
    const [abierta] = (await temporadas(token)).filter(
      (season) => season.inscripcionAbierta,
    );
    const nombre = `Equipo ${randomUUID()}`;
    const input = { nombre: ` ${nombre} `, temporadaId: abierta.id };
    const created = await client()
      .post(`${api}/equipos`)
      .auth(token, { type: 'bearer' })
      .send(input)
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(Number),
      nombre,
      temporadaId: abierta.id,
      capitanId: expect.any(String),
      estado: 'PENDIENTE',
    });
    const ownTeam = await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=${abierta.id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(ownTeam.body).toMatchObject({
      nombre,
      estado: 'PENDIENTE',
      motivoRechazo: null,
      totalJugadores: 0,
    });

    const rejected = await login('capitan.iguanas-fc.cl27@liga.test');
    const rejectedTeam = await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=${abierta.id}`)
      .auth(rejected, { type: 'bearer' })
      .expect(200);
    expect(rejectedTeam.body).toMatchObject({
      estado: 'RECHAZADO',
      motivoRechazo: expect.stringMatching(/.{20,}/),
      totalJugadores: 8,
    });
    const profile = await client()
      .get(`${api}/auth/me`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(profile.body).toMatchObject({
      equipoActualId: null,
      capitaneaEquipoId: null,
    });
  });

  it('rechaza inscripciones inválidas, cerradas, ajenas y duplicadas', async () => {
    const [token, arbitro, organizador] = await Promise.all([
      register(),
      login('arbitro1@liga.test'),
      login('organizador@liga.test'),
    ]);
    const seasons = await temporadas(token);
    const abierta = seasons.find((season) => season.inscripcionAbierta)!;
    const cerrada = seasons.find((season) => !season.inscripcionAbierta)!;
    const post = (bearer: string) =>
      client().post(`${api}/equipos`).auth(bearer, { type: 'bearer' });
    const valid = { nombre: 'Nuevo equipo', temporadaId: abierta.id };

    await client().post(`${api}/equipos`).send(valid).expect(401);
    for (const forbidden of [arbitro, organizador])
      await post(forbidden).send(valid).expect(403);
    for (const invalid of [
      { nombre: '  ' },
      { nombre: 'a'.repeat(51) },
      { temporadaId: -1 },
      { temporadaId: '1' },
      { temporadaId: 2_147_483_648 },
      { capitanId: randomUUID() },
    ])
      await post(token)
        .send({ ...valid, ...invalid })
        .expect(400);
    await post(token)
      .send({ ...valid, temporadaId: 2_147_483_647 })
      .expect(404);
    await post(token)
      .send({ ...valid, temporadaId: cerrada.id })
      .expect(422);
    await post(token)
      .send({ ...valid, nombre: 'dRaGoNeS fc' })
      .expect(409);
    const capitan = await login('capitan.iguanas-fc.cl27@liga.test');
    await post(capitan).send(valid).expect(409);
    await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=${abierta.id}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
    await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=1e0`)
      .auth(token, { type: 'bearer' })
      .expect(400);
  });

  it('agrega, descarga, lista y quita una ficha del equipo pendiente', async () => {
    const equipo = await nuevoEquipo();
    const datos = datosFicha();
    const exacta = Buffer.concat([
      png,
      Buffer.alloc(2 * 1024 * 1024 - png.length),
    ]);
    const alta = await agregar(equipo.id, equipo.token, datos)
      .attach('foto', exacta, 'jugadora.png')
      .expect(201);
    const { id, fotoUrl } = alta.body as { id: number; fotoUrl: string };
    expect(alta.body).toEqual({
      id,
      equipoId: equipo.id,
      ...datos,
      fotoUrl: `/uploads/jugadores/${id}.png`,
      usuarioId: null,
    });
    const otraCuenta = await register();
    await client().get(fotoUrl).expect(401);
    await client()
      .get(fotoUrl)
      .auth(otraCuenta, { type: 'bearer' })
      .expect(404);
    const foto = await client()
      .get(fotoUrl)
      .auth(equipo.token, { type: 'bearer' })
      .expect('Content-Type', /image\/png/)
      .expect(200);
    expect((foto.body as Buffer).equals(exacta)).toBe(true);
    await client()
      .get(plantilla(equipo.id))
      .auth(equipo.token, { type: 'bearer' })
      .expect(200, [alta.body]);
    await client()
      .delete(`${plantilla(equipo.id)}/${id}`)
      .auth(otraCuenta, { type: 'bearer' })
      .expect(403);
    await client()
      .delete(`${plantilla(equipo.id)}/${id}`)
      .auth(equipo.token, { type: 'bearer' })
      .expect(204);
    await client()
      .delete(`${plantilla(equipo.id)}/${id}`)
      .auth(equipo.token, { type: 'bearer' })
      .expect(404);
    await client()
      .get(plantilla(equipo.id))
      .auth(equipo.token, { type: 'bearer' })
      .expect(200, []);
    const propio = await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=${equipo.temporadaId}`)
      .auth(equipo.token, { type: 'bearer' })
      .expect(200);
    expect(propio.body).toMatchObject({ totalJugadores: 0 });
  });

  it('reconoce un JPG por contenido y lo sirve con el tipo correcto', async () => {
    const equipo = await nuevoEquipo();
    const alta = await agregar(equipo.id, equipo.token)
      .attach('foto', jpg, {
        filename: 'subida.bin',
        contentType: 'application/octet-stream',
      })
      .expect(201);
    const { id, fotoUrl } = alta.body as { id: number; fotoUrl: string };
    expect(fotoUrl).toBe(`/uploads/jugadores/${id}.jpg`);
    const foto = await client()
      .get(fotoUrl)
      .auth(equipo.token, { type: 'bearer' })
      .expect('Content-Type', /image\/jpeg/)
      .expect(200);
    expect((foto.body as Buffer).equals(jpg)).toBe(true);
  });

  it('rechaza fotos demasiado grandes, PDF renombrado, campos inválidos y equipos ajenos', async () => {
    const equipo = await nuevoEquipo();
    const otraCuenta = await register();
    await client().get(plantilla(equipo.id)).expect(401);
    await client()
      .get(plantilla(equipo.id))
      .auth(otraCuenta, { type: 'bearer' })
      .expect(403);
    await agregar(equipo.id, otraCuenta)
      .attach('foto', png, 'jugadora.png')
      .expect(403);
    await agregar(2_147_483_647, equipo.token)
      .attach('foto', png, 'jugadora.png')
      .expect(404);
    await agregar(equipo.id, equipo.token).expect(400);
    for (const invalido of [
      { nombreCompleto: 'a'.repeat(121) },
      { fechaNacimiento: '2004-02-30' },
      { fechaNacimiento: '2999-01-01' },
      { identificacion: '!!123' },
    ])
      await agregar(equipo.id, equipo.token, { ...datosFicha(), ...invalido })
        .attach('foto', png, 'jugadora.png')
        .expect(400);
    await agregar(equipo.id, equipo.token)
      .attach(
        'foto',
        Buffer.alloc(Math.ceil(2.1 * 1024 * 1024)),
        'jugadora.png',
      )
      .expect(413);
    await agregar(equipo.id, equipo.token)
      .attach('foto', Buffer.from('%PDF-1.7\nfake'), {
        filename: 'falso.jpg',
        contentType: 'image/jpeg',
      })
      .expect(415);
  });

  it('bloquea modificaciones en equipos inscritos y rechazados', async () => {
    for (const [email, temporada] of [
      ['capitan.tigres-fc.ap26@liga.test', 'Apertura 2026'],
      ['capitan.iguanas-fc.cl27@liga.test', 'Clausura 2027'],
    ]) {
      const token = await login(email);
      const { id: temporadaId } = (await temporadas(token)).find(
        (season) => season.nombre === temporada,
      )!;
      const propio = await client()
        .get(`${api}/equipos/mi-equipo?temporadaId=${temporadaId}`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      const { id } = propio.body as { id: number };
      const alta = await agregar(id, token)
        .attach('foto', png, 'jugadora.png')
        .expect(422);
      const baja = await client()
        .delete(`${plantilla(id)}/1`)
        .auth(token, { type: 'bearer' })
        .expect(422);
      for (const response of [alta, baja]) {
        expect(response.body).toMatchObject({
          message: 'El equipo ya no puede modificarse.',
        });
      }
    }
  });

  it('reutiliza una ficha de otra temporada solo si los datos coinciden', async () => {
    const equipo = await nuevoEquipo();
    const capitan = await login('capitan.tigres-fc.ap26@liga.test');
    const { id: temporadaId } = (await temporadas(capitan)).find(
      (season) => season.actual,
    )!;
    const anterior = await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=${temporadaId}`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    const lista = await client()
      .get(plantilla((anterior.body as { id: number }).id))
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    const [{ id, nombreCompleto, fechaNacimiento, identificacion, fotoUrl }] =
      lista.body as (ReturnType<typeof datosFicha> & {
        id: number;
        fotoUrl: string;
      })[];
    const datos = { nombreCompleto, fechaNacimiento, identificacion };
    await agregar(equipo.id, equipo.token, {
      ...datos,
      nombreCompleto: 'Otro nombre',
    })
      .attach('foto', png, 'nueva.png')
      .expect(409);
    try {
      const alta = await agregar(equipo.id, equipo.token, datos)
        .attach('foto', png, 'nueva.png')
        .expect(201);
      expect(alta.body).toMatchObject({ id, fotoUrl, equipoId: equipo.id });
      await agregar(equipo.id, equipo.token, datos)
        .attach('foto', png, 'nueva.png')
        .expect(409);
    } finally {
      await client()
        .delete(`${plantilla(equipo.id)}/${id}`)
        .auth(equipo.token, { type: 'bearer' });
    }
  });

  it('permite solo una inscripción simultánea de la misma ficha en dos equipos', async () => {
    const equipos = await Promise.all([nuevoEquipo(), nuevoEquipo()]);
    const datos = datosFicha();
    const resultados = await Promise.all(
      equipos.map((equipo) =>
        agregar(equipo.id, equipo.token, datos).attach(
          'foto',
          png,
          'jugadora.png',
        ),
      ),
    );
    expect(
      resultados.map(({ status }) => status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    const ganador =
      equipos[resultados.findIndex(({ status }) => status === 201)];
    const rechazo = resultados.find(({ status }) => status === 409);
    expect(rechazo?.body).toMatchObject({
      message: expect.stringContaining(ganador.nombre),
    });
  });

  it('asigna un solo cupo cuando dos solicitudes compiten por el jugador 15', async () => {
    const equipo = await nuevoEquipo();
    for (let i = 0; i < 14; i++) {
      await agregar(equipo.id, equipo.token)
        .attach('foto', png, 'jugadora.png')
        .expect(201);
    }
    const resultados = await Promise.all([
      agregar(equipo.id, equipo.token).attach('foto', png, 'jugadora.png'),
      agregar(equipo.id, equipo.token).attach('foto', png, 'jugadora.png'),
    ]);
    expect(
      resultados.map(({ status }) => status).sort((a, b) => a - b),
    ).toEqual([201, 422]);
    expect(resultados.find(({ status }) => status === 422)?.body).toMatchObject(
      {
        message: 'El equipo ya tiene 15 jugadores.',
      },
    );
    const lista = await client()
      .get(plantilla(equipo.id))
      .auth(equipo.token, { type: 'bearer' })
      .expect(200);
    expect(lista.body).toHaveLength(15);
  }, 15_000);

  it('revierte la ficha y limpia la foto si falla la confirmación de la inscripción', async () => {
    const equipo = await nuevoEquipo();
    const datos = datosFicha();
    const carpeta = join(uploads, 'jugadores');
    await mkdir(carpeta, { recursive: true });
    const inicial = (await readdir(carpeta)).sort();
    const nombre = `h1_fallo_${randomUUID().replaceAll('-', '')}`;
    await db.query(`CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fallo de prueba al confirmar la inscripción'; END; $$`);
    try {
      await db.query(`CREATE CONSTRAINT TRIGGER ${nombre} AFTER INSERT ON equipo_jugador
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.equipo_id = ${equipo.id})
        EXECUTE FUNCTION ${nombre}()`);
      await agregar(equipo.id, equipo.token, datos)
        .attach('foto', png, 'jugadora.png')
        .expect(500);
      expect((await readdir(carpeta)).sort()).toEqual(inicial);
      const { rowCount } = await db.query(
        'SELECT 1 FROM jugador WHERE identificacion = $1',
        [datos.identificacion],
      );
      expect(rowCount).toBe(0);
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${nombre} ON equipo_jugador`);
      await db.query(`DROP FUNCTION ${nombre}()`);
    }
  });

  it('vincula una ficha con preferencia por la temporada actual y actualiza auth/me', async () => {
    const futuro = await nuevoEquipo();
    const capitan = await login('capitan.panteras-fc.ap26@liga.test');
    const { id: temporadaId } = (await temporadas(capitan)).find(
      (season) => season.actual,
    )!;
    const propio = await client()
      .get(`${api}/equipos/mi-equipo?temporadaId=${temporadaId}`)
      .auth(capitan, { type: 'bearer' })
      .expect(200);
    const { id: equipoId } = propio.body as { id: number };
    const datos = datosFicha();
    const alta = await agregar(equipoId, capitan, datos)
      .attach('foto', png, 'jugadora.png')
      .expect(201);
    const { id: jugadorId, fotoUrl } = alta.body as {
      id: number;
      fotoUrl: string;
    };
    try {
      await agregar(futuro.id, futuro.token, datos)
        .attach('foto', png, 'jugadora.png')
        .expect(201);
      const token = await register();
      await vincular(token, datos).expect(200, {
        jugadorId,
        equipoId,
        temporadaId,
      });
      const me = await client()
        .get(`${api}/auth/me`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(me.body).toMatchObject({
        equipoActualId: equipoId,
        capitaneaEquipoId: null,
      });
      await client().get(fotoUrl).auth(token, { type: 'bearer' }).expect(200);
      const otro = await register();
      const repetida = await vincular(otro, datos).expect(409);
      expect(repetida.body).toMatchObject({
        message: 'Esa ficha ya está vinculada.',
      });
    } finally {
      await client()
        .delete(`${plantilla(equipoId)}/${jugadorId}`)
        .auth(capitan, { type: 'bearer' })
        .expect(204);
    }
  });

  it('devuelve la inscripción de otra temporada y bloquea crear otro equipo allí', async () => {
    const equipo = await nuevoEquipo();
    const token = await register();
    const datos = datosFicha();
    const alta = await agregar(equipo.id, equipo.token, datos)
      .attach('foto', png, 'jugadora.png')
      .expect(201);
    const { id: jugadorId } = alta.body as { id: number };
    await vincular(token, datos).expect(200, {
      jugadorId,
      equipoId: equipo.id,
      temporadaId: equipo.temporadaId,
    });
    const me = await client()
      .get(`${api}/auth/me`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(me.body).toMatchObject({
      equipoActualId: null,
      capitaneaEquipoId: null,
    });
    await client()
      .post(`${api}/equipos`)
      .auth(token, { type: 'bearer' })
      .send({
        nombre: `Equipo ${randomUUID()}`,
        temporadaId: equipo.temporadaId,
      })
      .expect(409);
  });

  it('permite vincular una ficha retirada con ambos identificadores de inscripción nulos', async () => {
    const equipo = await nuevoEquipo();
    const datos = datosFicha();
    const alta = await agregar(equipo.id, equipo.token, datos)
      .attach('foto', png, 'jugadora.png')
      .expect(201);
    const { id: jugadorId } = alta.body as { id: number };
    await client()
      .delete(`${plantilla(equipo.id)}/${jugadorId}`)
      .auth(equipo.token, { type: 'bearer' })
      .expect(204);
    await vincular(await register(), datos).expect(200, {
      jugadorId,
      equipoId: null,
      temporadaId: null,
    });
  });

  it('devuelve los errores de sesión, rol y datos sin distinguir los dos casos de 404', async () => {
    const equipo = await nuevoEquipo();
    const datos = datosFicha();
    await agregar(equipo.id, equipo.token, datos)
      .attach('foto', png, 'jugadora.png')
      .expect(201);
    await client().post(rutaVincular).send(datos).expect(401);
    for (const email of ['arbitro1@liga.test', 'organizador@liga.test']) {
      await vincular(await login(email), datos).expect(403);
    }
    const token = await register();
    await vincular(token, { ...datos, identificacion: '#' }).expect(400);
    await vincular(token, { ...datos, fechaNacimiento: '2004-06-31' }).expect(
      400,
    );
    await client()
      .post(rutaVincular)
      .auth(token, { type: 'bearer' })
      .send({
        identificacion: datos.identificacion,
        fechaNacimiento: datos.fechaNacimiento,
        usuarioId: randomUUID(),
      })
      .expect(400);
    const inexistente = await vincular(token, datosFicha()).expect(404);
    const fechaDistinta = await vincular(token, {
      ...datos,
      fechaNacimiento: '2004-05-13',
    }).expect(404);
    expect(inexistente.body).toEqual(fechaDistinta.body);
    expect(fechaDistinta.body).toMatchObject({
      message: 'No encontramos una ficha con esos datos.',
    });
  });

  it('acepta una vinculación simultánea por ficha y por cuenta', async () => {
    const equipo = await nuevoEquipo();
    const [primera, segunda, tercera] = [
      datosFicha(),
      datosFicha(),
      datosFicha(),
    ];
    for (const datos of [primera, segunda, tercera]) {
      await agregar(equipo.id, equipo.token, datos)
        .attach('foto', png, 'jugadora.png')
        .expect(201);
    }
    const tokens = await Promise.all([register(), register(), register()]);
    const porFicha = await Promise.all([
      vincular(tokens[0], primera),
      vincular(tokens[1], primera),
    ]);
    expect(porFicha.map(({ status }) => status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const porCuenta = await Promise.all([
      vincular(tokens[2], segunda),
      vincular(tokens[2], tercera),
    ]);
    expect(porCuenta.map(({ status }) => status).sort((a, b) => a - b)).toEqual(
      [200, 409],
    );
    expect(porCuenta.find(({ status }) => status === 409)?.body).toMatchObject({
      message: 'Tu cuenta ya tiene una ficha vinculada.',
    });
  });

  it('publica el contrato de los endpoints de H1 en Swagger', async () => {
    const documento = await client().get('/api/docs-json').expect(200);
    const { paths } = documento.body as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(paths[`${api}/users`].post).toMatchObject({
      responses: { 201: { headers: { 'X-Access-Token': expect.any(Object) } } },
    });
    expect(paths[`${api}/auth/me`]).toHaveProperty('get');
    expect(paths[`${api}/temporadas`]).toHaveProperty('get');
    expect(paths[`${api}/equipos`]).toHaveProperty('post');
    expect(paths[`${api}/equipos/mi-equipo`]).toHaveProperty('get');
    expect(paths[`${api}/equipos/{equipoId}/jugadores`].post).toMatchObject({
      requestBody: { content: { 'multipart/form-data': expect.any(Object) } },
    });
    expect(paths[`${api}/equipos/{equipoId}/jugadores`]).toHaveProperty('get');
    expect(
      paths[`${api}/equipos/{equipoId}/jugadores/{jugadorId}`],
    ).toHaveProperty('delete');
    expect(paths[rutaVincular]).toHaveProperty('post');
    expect(paths['/uploads/jugadores/{archivo}']).toHaveProperty('get');
  });
});
