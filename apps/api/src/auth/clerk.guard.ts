import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';

export const IS_PUBLIC_KEY = 'isPublic';

export interface AuthenticatedUser {
  userId: string;
  orgId: string | null;
  sessionId: string;
  email: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);
  private readonly secretKey: string;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly reflector: Reflector,
  ) {
    this.secretKey = this.configService.get('CLERK_SECRET_KEY', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authorization token is missing or malformed');
    }

    try {
      // verifyToken works directly with a JWT string — no native Request needed
      const payload = await verifyToken(token, { secretKey: this.secretKey });

      if (!payload?.sub) {
        throw new UnauthorizedException('Token does not contain user ID');
      }

      request.user = {
        userId: payload.sub,
        orgId: (payload['org_id'] as string | undefined) ?? null,
        sessionId: (payload['sid'] as string | undefined) ?? '',
        email: null,
      };

      this.logger.debug(
        `Authenticated user: ${payload.sub}, org: ${(payload['org_id'] as string | undefined) ?? 'none'}`,
      );

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Token verification failed');
    }
  }

  private extractTokenFromHeader(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
