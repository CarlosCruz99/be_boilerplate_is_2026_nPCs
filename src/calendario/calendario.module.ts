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
import { ArbitroAsignadoGuard } from './autorizacion/arbitro-asignado.guard.js';
import { ArbitroPartidoService } from './autorizacion/arbitro-partido.service.js';
import { MarcadorController } from './controllers/marcador.controller.js';
import { MarcadorService } from './services/marcador.service.js';
import { IniciarPartidoController } from './controllers/iniciar-partido.controller.js';
import { IniciarPartidoService } from './services/iniciar-partido.service.js';
import { FinalizarPartidoController } from './controllers/finalizar-partido.controller.js';
import { FinalizarPartidoService } from './services/finalizar-partido.service.js';
import { ParticipantesController } from './controllers/participantes.controller.js';
import { ParticipantesService } from './services/participantes.service.js';
import { AsignacionArbitroController } from './controllers/asignacion-arbitro.controller.js';
import { AsignacionArbitroService } from './services/asignacion-arbitro.service.js';
import { ListadoPartidosController } from './controllers/listado-partidos.controller.js';
import { ListadoPartidosService } from './services/listado-partidos.service.js';
import { DetalleMarcadorController } from './controllers/detalle-marcador.controller.js';
import { DetalleMarcadorService } from './services/detalle-marcador.service.js';
import { EstadisticasPartidoController } from './controllers/estadisticas-partido.controller.js';
import { EstadisticasPartidoService } from './services/estadisticas-partido.service.js';
import { CorreccionPartidoController } from './controllers/correccion-partido.controller.js';
import { CorreccionPartidoService } from './services/correccion-partido.service.js';

@Module({
  imports: [AvisosModule, PosicionesModule],
  controllers: [
    CorreccionPartidoController,
    DetalleMarcadorController,
    ListadoPartidosController,
    EstadisticasPartidoController,
    AsignacionArbitroController,
    ParticipantesController,
    FinalizarPartidoController,
    IniciarPartidoController,
    MarcadorController,
    CalendarioOrganizadorController,
    PublicacionJornadaController,
    ArbitrosController,
    CanchasController,
    PartidosController,
    GeneracionCalendarioController,
    ConsultaCalendarioController,
  ],
  providers: [
    CorreccionPartidoService,
    DetalleMarcadorService,
    ListadoPartidosService,
    EstadisticasPartidoService,
    AsignacionArbitroService,
    ParticipantesService,
    FinalizarPartidoService,
    IniciarPartidoService,
    MarcadorService,
    ArbitroAsignadoGuard,
    ArbitroPartidoService,
    CalendarioOrganizadorService,
    PublicacionJornadaService,
    PartidosService,
    AvisosCambioPartidoService,
    CorreoCambioPartidoService,
    ResendCorreoService,
    GeneracionCalendarioService,
    ConsultaCalendarioService,
  ],
  exports: [ArbitroAsignadoGuard, ArbitroPartidoService],
})
export class CalendarioModule {}
