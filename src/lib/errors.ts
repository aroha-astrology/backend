export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (details !== undefined) this.details = details;
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown) => new AppError('BAD_REQUEST', message, details),
  unauthorized: (message = 'Unauthorized') => new AppError('UNAUTHORIZED', message),
  forbidden: (message = 'Forbidden') => new AppError('FORBIDDEN', message),
  notFound: (message = 'Not found') => new AppError('NOT_FOUND', message),
  conflict: (message: string) => new AppError('CONFLICT', message),
  unprocessable: (message: string, details?: unknown) =>
    new AppError('UNPROCESSABLE', message, details),
  internal: (message = 'Internal server error') => new AppError('INTERNAL', message),
};
