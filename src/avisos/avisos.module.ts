import { Module } from '@nestjs/common';
import { AvisosController } from './controllers/avisos.controller.js';
import { AvisosService } from './services/avisos.service.js';
import { ConsultaAvisosService } from './services/consulta-avisos.service.js';

@Module({
  controllers: [AvisosController],
  providers: [AvisosService, ConsultaAvisosService],
  exports: [AvisosService],
})
export class AvisosModule {}
