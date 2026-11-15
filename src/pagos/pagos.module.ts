import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module.js';
import { ComprobantesService } from './comprobantes.service.js';
import { PagosService } from './pagos.service.js';
import { PagosController } from './pagos.controller.js';
@Module({
  imports: [AvisosModule],
  providers: [ComprobantesService, PagosService],
  controllers: [PagosController],
})
export class PagosModule {}
