import { avisosPublicacion } from './avisos-publicacion.js';

describe('contenido de avisos de publicación', () => {
  const partido = {
    inicio: new Date('2028-01-02T02:30:00Z'),
    cancha: { nombre: 'Cancha Norte' },
    local: { nombre: 'Tigres', capitanId: 'capitan-local' },
    visitante: { nombre: 'Leones', capitanId: 'capitan-visitante' },
  };
  it('genera un aviso por capitán, con su rival y horario local', () => {
    const avisos = avisosPublicacion({ id: 8, numero: 3 }, [partido]);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toEqual({
      moduloOrigen: 'CALENDARIO',
      tipo: 'JORNADA_PUBLICADA',
      destinatario: { usuarioId: 'capitan-local' },
      titulo: 'Calendario publicado: jornada 3',
      mensaje:
        'Tu equipo juega contra Leones el 2028-01-01 a las 20:30 en Cancha Norte.',
      referencia: { tipo: 'JORNADA', id: 8 },
      datos: {
        jornada: 3,
        rival: 'Leones',
        fecha: '2028-01-01',
        hora: '20:30',
        cancha: 'Cancha Norte',
      },
      claveIdempotencia: 'jornada-8-capitan-capitan-local',
    });
    expect(avisos[1]).toMatchObject({
      destinatario: { usuarioId: 'capitan-visitante' },
      datos: { rival: 'Tigres' },
    });
  });
  it('deduplica por capitán y no emite avisos si no hay partidos', () => {
    expect(
      avisosPublicacion({ id: 8, numero: 3 }, [partido, partido]),
    ).toHaveLength(2);
    expect(avisosPublicacion({ id: 8, numero: 3 }, [])).toEqual([]);
  });
});
