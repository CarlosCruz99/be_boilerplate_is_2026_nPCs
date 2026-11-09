import { Module } from '@nestjs/common';
import { ConsultaCalendarioController } from './controllers/consulta-calendario.controller.js';
import { GeneracionCalendarioController } from './controllers/generacion-calendario.controller.js';
import { ConsultaCalendarioService } from './services/consulta-calendario.service.js';
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
    ConsultaCalendarioController,
  ],
  providers: [
    PartidosService,
    GeneracionCalendarioService,
    ConsultaCalendarioService,
  ],
})
export class CalendarioModule {}
