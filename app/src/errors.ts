import type { ValidationIssue } from './domain/campaign.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function fromValidationIssue(issue: ValidationIssue): AppError {
  return new AppError(422, issue.code, issue.message, issue.field);
}

export function notFound(entity: string): AppError {
  return new AppError(404, 'NOT_FOUND', `${entity} not found`);
}

export function conflict(code: string, message: string, field = 'status'): AppError {
  return new AppError(409, code, message, field);
}
