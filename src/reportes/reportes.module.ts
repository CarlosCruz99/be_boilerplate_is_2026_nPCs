import { Module } from '@nestjs/common';
import { ReporteDeportivoController } from './reporte-deportivo.controller.js';
import { ReporteDeportivoService } from './reporte-deportivo.service.js';
import { ReportePagosController } from './reporte-pagos.controller.js';
import { ReportePagosService } from './reporte-pagos.service.js';

@Module({
  controllers: [ReportePagosController, ReporteDeportivoController],
  providers: [ReportePagosService, ReporteDeportivoService],
})
export class ReportesModule {}
