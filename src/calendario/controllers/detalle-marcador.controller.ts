import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  DetalleMarcadorParamsDto,
  DetalleMarcadorRespuestaDto,
} from '../dto/detalle-marcador.dto.js';
import { DetalleMarcadorService } from '../services/detalle-marcador.service.js';

@ApiTags('partidos')
@Controller('partidos')
export class DetalleMarcadorController {
  constructor(private readonly marcador: DetalleMarcadorService) {}
  @Get(':partidoId/marcador')
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @ApiOperation({
    summary: 'Consulta pública del marcador completo de un partido',
    security: [{}, { bearer: [] }],
    description:
      'Sin sesión. BORRADOR solo para organizador activo; el resto recibe 404, incluso antes de evaluar estado. Token inválido se trata como anónimo. Participantes H5 ordenados por id; goleadores H9 por goles DESC, nombre e id. Los goles individuales no sustituyen el marcador. Duración en minutos completos, mínimo 0 y sin máximo. Snapshot RepeatableRead para todas las fuentes. Cada consulta en curso calcula la duración de nuevo; el polling corresponde a FE-6.2.',
  })
  @ApiParam({
    name: 'partidoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiOkResponse({ type: DetalleMarcadorRespuestaDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiNotFoundResponse({
    description: 'Partido inexistente o borrador oculto.',
  })
  @ApiConflictResponse({
    description: 'Este partido aún no comienza. / Este partido fue cancelado.',
  })
  consultar(
    @Param() { partidoId }: DetalleMarcadorParamsDto,
    @CurrentUser() usuario: User | undefined,
  ) {
    return this.marcador.consultar(partidoId, usuario);
  }
}
