import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../common/request-context.js';

@Injectable()
export class SecurityAudit {
  private readonly logger = new Logger('SecurityAudit');
  record(
    actorId: string,
    action: string,
    resourceId: string,
    context: Record<string, string | null> = {},
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'security_audit',
        actorId,
        action,
        resourceId,
        ...context,
        requestId: requestContext.getStore()?.requestId ?? randomUUID(),
      }),
    );
  }
}
