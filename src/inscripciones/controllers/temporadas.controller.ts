import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TemporadaDto, TemporadasQueryDto } from '../dto/temporada.dto.js';
import { TemporadasService } from '../services/temporadas.service.js';

@ApiTags('temporadas')
@ApiBearerAuth()
@Controller('temporadas')
export class TemporadasController {
  constructor(private readonly temporadas: TemporadasService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las temporadas, con filtro opcional de inscripción',
  })
  @ApiOkResponse({ type: TemporadaDto, isArray: true })
  @ApiBadRequestResponse({ description: 'El filtro debe ser true o false.' })
  @ApiUnauthorizedResponse({ description: 'Sesión no válida. Inicia sesión.' })
  listar(
    @Query() { inscripcionAbierta }: TemporadasQueryDto,
  ): Promise<TemporadaDto[]> {
    return this.temporadas.listar(
      inscripcionAbierta === undefined
        ? undefined
        : inscripcionAbierta === 'true',
    );
  }
}
