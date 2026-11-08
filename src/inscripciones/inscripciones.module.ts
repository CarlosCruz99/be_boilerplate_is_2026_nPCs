import { Module } from '@nestjs/common';
import {
  EquipoJugadoresController,
  FotosJugadorController,
} from './controllers/equipo-jugadores.controller.js';
import { EquiposController } from './controllers/equipos.controller.js';
import { TemporadasController } from './controllers/temporadas.controller.js';
import { VinculacionController } from './controllers/vinculacion.controller.js';
import { ValidacionEquiposService } from './services/validacion-equipos.service.js';
import { EquiposService } from './services/equipos.service.js';
import { FotosJugadorService } from './services/fotos-jugador.service.js';
import { PlantillasService } from './services/plantillas.service.js';
import { TemporadasService } from './services/temporadas.service.js';
import { VinculacionService } from './services/vinculacion.service.js';

@Module({
  controllers: [
    EquiposController,
    TemporadasController,
    EquipoJugadoresController,
    FotosJugadorController,
    VinculacionController,
  ],
  providers: [
    ValidacionEquiposService,
    EquiposService,
    TemporadasService,
    PlantillasService,
    FotosJugadorService,
    VinculacionService,
  ],
})
export class InscripcionesModule {}
