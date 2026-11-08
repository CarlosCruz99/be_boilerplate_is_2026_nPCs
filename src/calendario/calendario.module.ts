import { Module } from '@nestjs/common';
import {
  ArbitrosController,
  CanchasController,
  PartidosController,
} from './controllers/calendario.controller.js';
import { PartidosService } from './services/partidos.service.js';

@Module({
  controllers: [ArbitrosController, CanchasController, PartidosController],
  providers: [PartidosService],
})
export class CalendarioModule {}
