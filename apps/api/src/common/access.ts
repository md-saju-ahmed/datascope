import { SetMetadata } from '@nestjs/common';
import type {
  CurrentUser,
  PageInfo,
  PageQuery,
  Permission,
} from '@datascope/contracts';
import { AuthFailure } from '../modules/auth/auth-http.js';
import type { AuthRequest } from '../modules/auth/auth-http.js';

export const rolesMetadata = 'datascope:roles';
export const datasetActionMetadata = 'datascope:dataset-action';
export const Roles = (...roles: CurrentUser['role'][]) =>
  SetMetadata(rolesMetadata, roles);
export const DatasetAction = (action: Permission) =>
  SetMetadata(datasetActionMetadata, action);
export function principal(request: AuthRequest): CurrentUser {
  if (!request.principal)
    throw new AuthFailure(401, 'UNAUTHENTICATED', 'Authentication required');
  return request.principal;
}
export function notFound(): never {
  throw new AuthFailure(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
}
export function forbidden(): never {
  throw new AuthFailure(403, 'FORBIDDEN', 'Action not permitted');
}
export function pageInfo(query: PageQuery, total: number): PageInfo {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error('Invalid aggregate count');
  return {
    ...query,
    total,
    totalPages: Math.ceil(total / query.pageSize),
    hasNextPage: query.page * query.pageSize < total,
  };
}
export function offset(query: PageQuery): number {
  return (query.page - 1) * query.pageSize;
}

export function databaseConflict(error: unknown): never {
  let current = error;
  for (
    let depth = 0;
    depth < 4 && typeof current === 'object' && current !== null;
    depth++
  ) {
    if ('code' in current && current.code === '23505')
      throw new AuthFailure(
        409,
        'RESOURCE_CONFLICT',
        'A resource with this identifier already exists',
      );
    if ('code' in current && current.code === '57014')
      throw new AuthFailure(
        503,
        'DATABASE_TIMEOUT',
        'Operation timed out; try again later',
      );
    current = 'cause' in current ? current.cause : undefined;
  }
  throw error;
}
