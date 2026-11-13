import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { LivenessResponse, ReadinessResponse } from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    if (!(await this.database.isReady())) {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Service is not ready',
      });
    }
    return { status: 'ok', database: 'up' };
  }
}
