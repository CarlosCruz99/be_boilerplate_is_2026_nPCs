import {
  All,
  Controller,
  Get,
  Header,
  MethodNotAllowedException,
  Param,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExcludeEndpoint,
  ApiMethodNotAllowedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { ConsultaPosicionesService } from './consulta-posiciones.service.js';
import {
  PosicionEquipoDto,
  PosicionEquipoParamsDto,
  TablaPosicionesDto,
} from './tabla-posiciones.dto.js';

@ApiTags('posiciones')
@Public()
@Controller('posiciones')
export class TablaPosicionesController {
  constructor(private readonly posiciones: ConsultaPosicionesService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Tabla oficial de la temporada actual',
    security: [],
    description:
      'Público, sin parámetros obligatorios. Consulta la vista v_tabla_posiciones, ordenada por lugar, sin recalcular ni escribir. Temporada actual sin posiciones: lista vacía. Sin temporada actual: 404. POST, PUT, PATCH y DELETE devuelven 405.',
  })
  @ApiOkResponse({ type: TablaPosicionesDto })
  @ApiNotFoundResponse({ description: 'No hay temporada actual.' })
  @ApiMethodNotAllowedResponse({ description: 'Solo lectura.' })
  listar() {
    return this.posiciones.listar();
  }
  @Get('equipos/:equipoId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Consulta la posición oficial de un equipo en la temporada actual',
    security: [],
    description:
      'Público. Conserva el lugar de la tabla completa. No devuelve próximos rivales (BE-7.2). Métodos de escritura: 405.',
  })
  @ApiParam({
    name: 'equipoId',
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiOkResponse({ type: PosicionEquipoDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiNotFoundResponse({
    description: 'Equipo inexistente o sin posición en la temporada actual.',
  })
  @ApiMethodNotAllowedResponse({ description: 'Solo lectura.' })
  equipo(@Param() { equipoId }: PosicionEquipoParamsDto) {
    return this.posiciones.equipo(equipoId);
  }
  // Se registran después de los GET; son públicas para responder 405 también sin sesión.
  @All()
  @ApiExcludeEndpoint()
  @Header('Allow', 'GET, HEAD')
  escrituraTabla(): never {
    throw new MethodNotAllowedException(
      'La tabla de posiciones es de solo lectura.',
    );
  }
  @All('equipos/:equipoId')
  @ApiExcludeEndpoint()
  @Header('Allow', 'GET, HEAD')
  escrituraEquipo(): never {
    throw new MethodNotAllowedException(
      'La tabla de posiciones es de solo lectura.',
    );
  }
}
