import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { ok } from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('API (e2e)', () => {
  let app: INestApplication<Server>;
  const client = () => request(app.getHttpServer());
  const api = '/api/v1';
  const validUser = () => ({
    nombre: 'Ana López',
    email: `h1-${randomUUID()}@liga.test`,
    password: 'unaclave1',
    fechaNacimiento: '2004-05-12',
  });

  beforeAll(async () => {
    // El build de Nest emite los metadatos de los decoradores usados por DI y los DTO.
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    // Mantiene el mismo servidor abierto durante las solicitudes simultáneas.
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
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
});
