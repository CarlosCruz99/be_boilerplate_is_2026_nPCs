import { Module } from '@nestjs/common';
import { GeneracionCalendarioController } from './controllers/generacion-calendario.controller.js';
import { GeneracionCalendarioService } from './services/generacion-calendario.service.js';
import {
  ArbitrosController,
  CanchasController,
  PartidosController,
} from './controllers/calendario.controller.js';
import { PartidosService } from './services/partidos.service.js';

@Module({
  controllers: [
    ArbitrosController,
    CanchasController,
    PartidosController,
    GeneracionCalendarioController,
  ],
  providers: [PartidosService, GeneracionCalendarioService],
})
export class CalendarioModule {}
