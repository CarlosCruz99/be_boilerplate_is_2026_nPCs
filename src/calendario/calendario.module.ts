import { CalendarioOrganizadorController } from './controllers/calendario-organizador.controller.js';
import { CalendarioOrganizadorService } from './services/calendario-organizador.service.js';
import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module.js';
import { PosicionesModule } from '../posiciones/posiciones.module.js';
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
import { AvisosCambioPartidoService } from './services/avisos-cambio-partido.service.js';
import { CorreoCambioPartidoService } from './services/correo-cambio-partido.service.js';
import { ResendCorreoService } from './services/resend-correo.service.js';

@Module({
  imports: [AvisosModule, PosicionesModule],
  controllers: [
    CalendarioOrganizadorController,
    PublicacionJornadaController,
    ArbitrosController,
    CanchasController,
    PartidosController,
    GeneracionCalendarioController,
    ConsultaCalendarioController,
  ],
  providers: [
    CalendarioOrganizadorService,
    PublicacionJornadaService,
    PartidosService,
    AvisosCambioPartidoService,
    CorreoCambioPartidoService,
    ResendCorreoService,
    GeneracionCalendarioService,
    ConsultaCalendarioService,
  ],
})
export class CalendarioModule {}
