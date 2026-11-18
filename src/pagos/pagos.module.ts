import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module.js';
import { ComprobantesService } from './comprobantes.service.js';
import { PagosService } from './pagos.service.js';
import { PagosController } from './pagos.controller.js';
import { HistorialPagosController } from './historial-pagos.controller.js';
import { HistorialPagosService } from './historial-pagos.service.js';
@Module({
  imports: [AvisosModule],
  providers: [ComprobantesService, PagosService, HistorialPagosService],
  controllers: [PagosController, HistorialPagosController],
})
export class PagosModule {}
