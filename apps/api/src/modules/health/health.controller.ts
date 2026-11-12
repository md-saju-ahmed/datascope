import { Controller, Get } from '@nestjs/common';
import type { LivenessResponse } from '@datascope/contracts';

@Controller('health')
export class HealthController {
  @Get('live')
  live(): LivenessResponse {
    return { status: 'ok' };
  }
}
