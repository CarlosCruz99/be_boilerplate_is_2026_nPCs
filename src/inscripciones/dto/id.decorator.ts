import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export function IsId(): PropertyDecorator {
  return applyDecorators(IsInt(), Min(1), Max(2_147_483_647));
}

export function IsUrlId(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
    ),
    IsId(),
  );
}
