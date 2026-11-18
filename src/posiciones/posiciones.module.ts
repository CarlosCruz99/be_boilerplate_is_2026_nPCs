import { Module } from '@nestjs/common';
import { PosicionesService } from './posiciones.service.js';
import { ConsultaPosicionesService } from './consulta-posiciones.service.js';
import { TablaPosicionesController } from './tabla-posiciones.controller.js';
import { ProximosPartidosController } from './proximos-partidos.controller.js';
import { ProximosPartidosService } from './proximos-partidos.service.js';

@Module({
  controllers: [TablaPosicionesController, ProximosPartidosController],
  providers: [
    PosicionesService,
    ConsultaPosicionesService,
    ProximosPartidosService,
  ],
  exports: [PosicionesService],
})
export class PosicionesModule {}
