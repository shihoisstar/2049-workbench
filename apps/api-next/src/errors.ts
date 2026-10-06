import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ErrorBody, ErrorCode } from '@wb/contracts';
import { DomainError } from '@wb/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function sendErrorResponse(status: number, request: FastifyRequest, reply: FastifyReply, domainError?: DomainError): void {
  const clientError = status >= 400 && status < 500;
  const code = domainError?.code ?? (status === 404 ? ErrorCode.NOT_FOUND : status === 401 ? ErrorCode.UNAUTHORIZED :
    clientError ? ErrorCode.VALIDATION : ErrorCode.INTERNAL);
  const message = domainError && clientError ? domainError.message : status === 404 ? 'Not found' : clientError ? 'Invalid request' :
    status === 503 ? 'Service unavailable' : 'Internal server error';
  const body = ErrorBody.parse({ code, message, requestId: request.id });
  reply.header('x-request-id', request.id).status(status).send(body);
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status = error instanceof DomainError ? error.statusCode : error instanceof HttpException ? error.getStatus() : 500;
    sendErrorResponse(status, request, reply, error instanceof DomainError ? error : undefined);
  }
}
