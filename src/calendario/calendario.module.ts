import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module.js';
import { PublicacionJornadaController } from './controllers/publicacion-jornada.controller.js';
import { PublicacionJornadaService } from './services/publicacion-jornada.service.js';
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
  imports: [AvisosModule],
  controllers: [
    PublicacionJornadaController,
    ArbitrosController,
    CanchasController,
    PartidosController,
    GeneracionCalendarioController,
    ConsultaCalendarioController,
  ],
  providers: [
    PublicacionJornadaService,
    PartidosService,
    GeneracionCalendarioService,
    ConsultaCalendarioService,
  ],
})
export class CalendarioModule {}
