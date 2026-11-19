import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module.js';
import { ComprobantesService } from './comprobantes.service.js';
import { PagosService } from './pagos.service.js';
import { PagosController } from './pagos.controller.js';
import { HistorialPagosController } from './historial-pagos.controller.js';
import { HistorialPagosService } from './historial-pagos.service.js';
import { VerificacionPagosController } from './verificacion-pagos.controller.js';
import { VerificacionPagosService } from './verificacion-pagos.service.js';
@Module({
  imports: [AvisosModule],
  providers: [
    ComprobantesService,
    PagosService,
    HistorialPagosService,
    VerificacionPagosService,
  ],
  controllers: [
    PagosController,
    HistorialPagosController,
    VerificacionPagosController,
  ],
})
export class PagosModule {}
