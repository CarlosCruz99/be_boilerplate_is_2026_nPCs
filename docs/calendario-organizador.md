# Consulta de calendario para FE-3.1

El endpoint de solo lectura `GET /api/v1/temporadas/{id}/calendario` requiere el rol ORGANIZADOR y responde `Cache-Control: private, no-store`.

Devuelve los ID reales y los estados de las jornadas que necesita el organizador para publicar. Incluye borradores, jornadas vacías y partidos cancelados.

```ts
{
  temporadaId: number,
  jornadas: [{
    id: number,
    numero: number,
    estado: "BORRADOR" | "PUBLICADA",
    publicadaEn: string | null,
    partidos: [{
      id: number, jornada: number,
      equipoLocalId: number, equipoVisitanteId: number,
      canchaId: number, arbitroId: string,
      inicio: string, fin: string,
      estado: "PROGRAMADO" | "EN_CURSO" | "FINALIZADO" | "CANCELADO",
      local: { id: number, nombre: string },
      visitante: { id: number, nombre: string },
      cancha: { id: number, nombre: string, direccion: string },
      arbitro: { id: string, nombre: string }
    }]
  }]
}
```

Las jornadas se ordenan por número e ID y los partidos por inicio e ID. La API devuelve las fechas en ISO 8601 y el frontend las presenta en hora de El Salvador. Una temporada existente sin jornadas devuelve un arreglo vacío. Una temporada inexistente devuelve 404, un ID inválido devuelve 400, una solicitud sin sesión recibe 401 y una cuenta con otro rol recibe 403.

El controlador y el servicio se registran en `CalendarioModule` y el contrato se documenta en Swagger. La consulta reutiliza el esquema de H3 y H16. La publicación se realiza mediante BE-16.1 y el servicio central de avisos de H20.
