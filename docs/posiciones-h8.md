# Recálculo de posiciones de H8

`PosicionesModule` exporta `PosicionesService`. BE-5.2 y BE-23.1 pueden
invocar `recalcular(temporadaId, tx)` en la transacción que escribe el
resultado oficial. Usa aislamiento `ReadCommitted`, bloquea primero la
temporada y luego el partido, escribe el resultado y llama al recálculo
antes de confirmar. Si el recálculo falla, propaga el error para revertir
toda la transacción.

El cálculo toma los partidos finalizados de la temporada indicada y
reemplaza los acumulados de cada equipo. Un equipo sin partidos
finalizados queda con valores en cero. La vista `v_tabla_posiciones` de
DB-7.1 calcula los lugares de la temporada actual. Para devolver las filas
en ese orden, consulta la vista con `ORDER BY lugar`.

## Datos de prueba

`test/posiciones.e2e-spec.ts` crea dos temporadas, ocho equipos por
temporada y los partidos de cada caso. Cada prueba revierte sus datos
al terminar. Aplica las migraciones a la base de pruebas con
`npm run prisma:deploy` y ejecuta
`npm run test:e2e -- test/posiciones.e2e-spec.ts`.
