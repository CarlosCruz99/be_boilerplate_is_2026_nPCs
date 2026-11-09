import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import type {
  CalendarioDelEquipoDto,
  DetallePartidoCalendarioDto,
} from '../src/calendario/dto/consulta-calendario.dto.js';
import type { createApp as CreateApp } from '../src/create-app.js';

describe('BE-4.1 calendario del equipo', () => {
  let app: INestApplication<Server>;
  let db: Pool;
  let equipoId: number;
  let temporadaId: number;
  let otroEquipoId: number;
  let pendienteId: number;
  let equipoVacioId: number;
  let partidoAjenoId: number;
  let capitan: string;
  let jugador: string;
  let organizador: string;
  let arbitro: string;
  let sinEquipo: string;
  let capitanPendiente: string;
  let capitanSinPartidos: string;
  const api = '/api/v1';
  const client = () => request(app.getHttpServer());
  const rutaEquipo = (id: number | string) => `${api}/equipos/${id}/partidos`;
  const rutaPartido = (id: number | string) => `${api}/partidos/${id}`;
  const bearer = { type: 'bearer' } as const;
  const listar = (id: number | string, token: string) =>
    client().get(rutaEquipo(id)).auth(token, bearer);
  const detalle = (id: number | string, token: string) =>
    client().get(rutaPartido(id)).auth(token, bearer);

  async function login(email: string, password = 'Liga2026!') {
    const respuesta = await client()
      .post(`${api}/auth/login`)
      .send({ email, password })
      .expect(200);
    return (respuesta.body as { accessToken: string }).accessToken;
  }

  async function equipoDe(email: string) {
    const { rows } = await db.query<{ id: number; temporada_id: number }>(
      'SELECT e.id, e.temporada_id FROM equipo e JOIN usuario u ON u.id = e.capitan_id WHERE u.email = $1',
      [email],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  beforeAll(async () => {
    const entry = '../dist/create-app.js';
    const { createApp } = (await import(/* @vite-ignore */ entry)) as {
      createApp: typeof CreateApp;
    };
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = new Pool({ connectionString: process.env.DATABASE_URL });

    const emailCapitan = 'capitan.tigres-fc.ap26@liga.test';
    const emailPendiente = 'capitan.panteras-fc.ap26@liga.test';
    const emailSinPartidos = 'capitan.dragones-fc.cl27@liga.test';
    [
      capitan,
      jugador,
      organizador,
      arbitro,
      sinEquipo,
      capitanPendiente,
      capitanSinPartidos,
    ] = await Promise.all([
      login(emailCapitan),
      login('jugador01@liga.test'),
      login('organizador@liga.test'),
      login('arbitro1@liga.test'),
      login('demo@example.com', 'Demo1234!'),
      login(emailPendiente),
      login(emailSinPartidos),
    ]);
    ({ id: equipoId, temporada_id: temporadaId } =
      await equipoDe(emailCapitan));
    ({ id: otroEquipoId } = await equipoDe('capitan.leones-fc.ap26@liga.test'));
    ({ id: pendienteId } = await equipoDe(emailPendiente));
    ({ id: equipoVacioId } = await equipoDe(emailSinPartidos));
    const partidoAjeno = await db.query<{ id: number }>(
      `SELECT p.id FROM partido p JOIN jornada j ON j.id = p.jornada_id
       WHERE p.temporada_id = $1 AND j.estado = 'PUBLICADA'
         AND p.equipo_local_id <> $2 AND p.equipo_visitante_id <> $2
       ORDER BY p.id LIMIT 1`,
      [temporadaId, equipoId],
    );
    partidoAjenoId = partidoAjeno.rows[0].id;
  }, 15_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('lista los cuatro partidos publicados para capitán y jugador, con datos completos y ordenados', async () => {
    const inicio = performance.now();
    const respuesta = await listar(equipoId, capitan)
      .expect('Cache-Control', 'no-store')
      .expect(200);
    const duracion = performance.now() - inicio;
    expect(duracion).toBeLessThan(1000);
    console.info(
      `BE-4.1 listado HTTP con seed de 66 partidos: ${duracion.toFixed(1)} ms`,
    );

    const lista = respuesta.body as CalendarioDelEquipoDto;
    expect(lista.equipoId).toBe(equipoId);
    expect(lista.total).toBe(4);
    expect(lista.partidos.map((p) => p.jornada)).toEqual([1, 2, 3, 4]);
    expect(lista.partidos).toHaveLength(lista.total);
    const inicios = lista.partidos.map((p) => Date.parse(p.inicio));
    expect(inicios).toEqual(inicios.toSorted((a, b) => a - b));
    const otro = await listar(equipoId, jugador).expect(200);
    expect(otro.body).toEqual(lista);

    for (const partido of lista.partidos) {
      expect(partido).toEqual({
        id: expect.any(Number),
        jornada: expect.any(Number),
        inicio: expect.stringMatching(/Z$/),
        fin: expect.stringMatching(/Z$/),
        estado: 'PROGRAMADO',
        cancha: {
          id: expect.any(Number),
          nombre: expect.any(String),
          direccion: expect.any(String),
        },
        arbitro: {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          nombre: expect.any(String),
        },
        rival: { id: expect.any(Number), nombre: expect.any(String) },
        condicion: expect.stringMatching(/^(LOCAL|VISITANTE)$/),
      });
      expect(partido.rival.id).not.toBe(equipoId);
      expect(Date.parse(partido.fin) - Date.parse(partido.inicio)).toBe(
        90 * 60_000,
      );

      const leido = await detalle(partido.id, jugador).expect(200);
      const { local, visitante, ...datos } =
        leido.body as DetallePartidoCalendarioDto;
      const { rival, condicion, ...esperado } = partido;
      expect(datos).toEqual(esperado);
      const [equipo, contrario] =
        condicion === 'LOCAL' ? [local, visitante] : [visitante, local];
      expect(equipo).toEqual({ id: equipoId, nombre: 'Tigres FC' });
      expect(contrario).toEqual(rival);
    }
    await detalle(lista.partidos[0].id, capitan).expect(200);
  });

  it('el organizador ve los borradores y un miembro no puede abrirlos por ID', async () => {
    const respuesta = await listar(equipoId, organizador).expect(200);
    const lista = respuesta.body as CalendarioDelEquipoDto;
    expect(lista.total).toBe(11);
    const borrador = lista.partidos.find((p) => p.jornada === 5)!;
    await detalle(borrador.id, organizador).expect(200);
    for (const miembro of [capitan, jugador]) {
      const oculta = await detalle(borrador.id, miembro).expect(404);
      expect(oculta.body).toMatchObject({ message: 'El partido no existe.' });
    }
  });

  it('devuelve los once partidos a ambos miembros con todas las jornadas publicadas', async () => {
    const { rows } = await db.query<{ id: number }>(
      "UPDATE jornada SET estado = 'PUBLICADA' WHERE temporada_id = $1 AND estado = 'BORRADOR' RETURNING id",
      [temporadaId],
    );
    try {
      expect(rows).toHaveLength(7);
      for (const miembro of [capitan, jugador]) {
        const respuesta = await listar(equipoId, miembro).expect(200);
        const lista = respuesta.body as CalendarioDelEquipoDto;
        expect(lista.total).toBe(11);
        expect(lista.partidos.map((p) => p.jornada)).toEqual(
          Array.from({ length: 11 }, (_, i) => i + 1),
        );
        expect(new Set(lista.partidos.map((p) => p.rival.id)).size).toBe(11);
      }
    } finally {
      await db.query(
        "UPDATE jornada SET estado = 'BORRADOR' WHERE id = ANY($1::int[])",
        [rows.map(({ id }) => id)],
      );
    }
  });

  it('rechaza consultas de equipo o partido ajeno, sin vínculo o con rol árbitro', async () => {
    for (const miembro of [capitan, jugador]) {
      await listar(otroEquipoId, miembro).expect(403);
      await detalle(partidoAjenoId, miembro).expect(403);
    }
    for (const cuenta of [sinEquipo, arbitro]) {
      await listar(equipoId, cuenta).expect(403);
      await detalle(partidoAjenoId, cuenta).expect(403);
    }
    await listar(otroEquipoId, organizador).expect(200);
    await detalle(partidoAjenoId, organizador).expect(200);
  });

  it('distingue un equipo no inscrito de uno inscrito con calendario vacío', async () => {
    const pendiente = await listar(pendienteId, capitanPendiente).expect(403);
    expect(pendiente.body).toMatchObject({
      codigo: 'EQUIPO_NO_INSCRITO',
      message: 'Tu equipo aún no está inscrito en la temporada.',
    });
    await listar(equipoVacioId, capitanSinPartidos).expect(200, {
      equipoId: equipoVacioId,
      total: 0,
      partidos: [],
    });
    await listar(pendienteId, organizador).expect(200, {
      equipoId: pendienteId,
      total: 0,
      partidos: [],
    });
  });

  it('valida la sesión, identificadores y existencia en ambos GET', async () => {
    await client().get(rutaEquipo(equipoId)).expect(401);
    await client().get(rutaPartido(partidoAjenoId)).expect(401);
    for (const invalido of ['0', '-1', '1e0', '2147483648']) {
      await listar(invalido, organizador).expect(400);
      await detalle(invalido, organizador).expect(400);
    }
    await listar(2_147_483_647, capitan).expect(404);
    await detalle(2_147_483_647, capitan).expect(404);
  });

  it('refleja una reprogramación al recargar y retira los cancelados del listado', async () => {
    const lista = (await listar(equipoId, capitan).expect(200))
      .body as CalendarioDelEquipoDto;
    const original = lista.partidos[0];
    const canchas = await db.query<{
      id: number;
      nombre: string;
      direccion: string;
    }>(
      'SELECT id, nombre, direccion FROM cancha WHERE activa AND id <> $1 ORDER BY id LIMIT 1',
      [original.cancha.id],
    );
    const arbitros = await db.query<{ id: string; nombre: string }>(
      "SELECT id, nombre FROM usuario WHERE rol = 'ARBITRO' AND is_active AND id <> $1 ORDER BY id LIMIT 1",
      [original.arbitro.id],
    );
    const cancha = canchas.rows[0];
    const arbitroNuevo = arbitros.rows[0];
    const nuevaFecha = new Date(
      Date.UTC(new Date().getUTCFullYear() + 2, 0, 15, 14),
    ).toISOString();
    const url = rutaPartido(original.id);
    const cambio = {
      canchaId: cancha.id,
      arbitroId: arbitroNuevo.id,
      inicio: nuevaFecha,
    };

    for (const miembro of [capitan, jugador]) {
      await client().patch(url).auth(miembro, bearer).send(cambio).expect(403);
      await client()
        .post(`${api}/partidos`)
        .auth(miembro, bearer)
        .send({})
        .expect(403);
    }

    try {
      await client()
        .patch(url)
        .auth(organizador, bearer)
        .send(cambio)
        .expect(200);
      const actualizada = (await listar(equipoId, capitan).expect(200))
        .body as CalendarioDelEquipoDto;
      expect(actualizada.partidos.at(-1)).toMatchObject({
        id: original.id,
        cancha,
        arbitro: arbitroNuevo,
        inicio: nuevaFecha,
      });
      expect(
        (await detalle(original.id, jugador).expect(200)).body,
      ).toMatchObject({
        id: original.id,
        cancha,
        arbitro: arbitroNuevo,
        inicio: nuevaFecha,
      });

      await client()
        .patch(url)
        .auth(organizador, bearer)
        .send({ estado: 'CANCELADO' })
        .expect(200);
      for (const [token, total] of [
        [capitan, 3],
        [organizador, 10],
      ] as const) {
        const sinCancelado = (await listar(equipoId, token).expect(200))
          .body as CalendarioDelEquipoDto;
        expect(sinCancelado.total).toBe(total);
        expect(sinCancelado.partidos.some(({ id }) => id === original.id)).toBe(
          false,
        );
      }
      await detalle(original.id, capitan).expect(404);
      expect(
        (await detalle(original.id, organizador).expect(200)).body,
      ).toMatchObject({ estado: 'CANCELADO' });
    } finally {
      await db.query(
        'UPDATE partido SET cancha_id = $2, arbitro_id = $3, inicio = $4, fin = $5, estado = $6 WHERE id = $1',
        [
          original.id,
          original.cancha.id,
          original.arbitro.id,
          original.inicio,
          original.fin,
          original.estado,
        ],
      );
    }
  });

  it('documenta los GET, sus respuestas y el UUID del árbitro en Swagger', async () => {
    const { body } = await client().get('/api/docs-json').expect(200);
    const { paths, components } = body as {
      paths: Record<
        string,
        Record<string, { responses: Record<string, unknown> }>
      >;
      components: { schemas: Record<string, unknown> };
    };
    for (const ruta of [rutaEquipo('{equipoId}'), rutaPartido('{id}')]) {
      expect(Object.keys(paths[ruta].get.responses)).toEqual(
        expect.arrayContaining(['200', '400', '401', '403', '404']),
      );
    }
    expect(paths[rutaPartido('{id}')]).toHaveProperty('patch');
    expect(components.schemas.ArbitroRespuestaDto).toMatchObject({
      properties: { id: { format: 'uuid' } },
    });
    expect(components.schemas.DetallePartidoCalendarioDto).toMatchObject({
      properties: { local: expect.any(Object), visitante: expect.any(Object) },
    });
  });
});
