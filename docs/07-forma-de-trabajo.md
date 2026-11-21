# Forma de trabajo

**Proyecto Jira:** [nPCs — issues](https://uca-team-zec8wzmz.atlassian.net/issues/?jql=project%20%3D%20NPCS).

## Ramas Git Flow

- `main`: código desplegado.
- `develop`: integración.
- `feature/<ID>-<descripcion>`: historia (por ejemplo `feature/H2-validacion-equipos`).
- `bugfix/<ID>-<descripcion>`: corrección de pruebas.
- `release/1.0.0`: estabilización y publicación.
- `hotfix/<descripcion>`: corrección urgente desde `main`.

## Commits y PR

Usar `<tipo>(<ID>): <descripción>`, por ejemplo `feat(H2): validar inscripciones`. En el PR agregar historia/cards Jira, criterios implementados, pruebas y capturas cuando correspondan. Revisión y aprobación por otra persona antes de fusionar en `develop`. Para entrega final, PR de release hacia `main` y sincronización posterior con `develop`.

## Enlaces

- [PR del backend](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pulls)
- [PR del frontend](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs/pulls)
- [Repositorio backend](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs)
- [Repositorio frontend](https://github.com/CarlosCruz99/fe_boilerplate_is_2026_nPCs)

**Release del backend:** [PR #33 — release 1.0.0](https://github.com/CarlosCruz99/be_boilerplate_is_2026_nPCs/pull/33). Los PR por historia están enlazados en [08-historias](08-historias.md).
