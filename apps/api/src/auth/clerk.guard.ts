import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createClerkClient } from '@clerk/backend';
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
  private readonly clerkClient: ReturnType<typeof createClerkClient>;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly reflector: Reflector,
  ) {
    const secretKey = this.configService.get('CLERK_SECRET_KEY', {
      infer: true,
    });
    this.clerkClient = createClerkClient({ secretKey });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked public
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
      throw new UnauthorizedException(
        'Authorization token is missing or malformed',
      );
    }

    try {
      // Verify the JWT token with Clerk
      const requestState = await this.clerkClient.authenticateRequest(request, {
        jwtKey: undefined, // Use Clerk's network verification
        authorizedParties: [],
      });

      if (!requestState.isSignedIn) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      const claims = requestState.toAuth();

      if (!claims?.userId) {
        throw new UnauthorizedException('Token does not contain user ID');
      }

      // Attach authenticated user to request
      request.user = {
        userId: claims.userId,
        orgId: claims.orgId ?? null,
        sessionId: claims.sessionId,
        email: null, // Email is not in JWT claims by default
      };

      this.logger.debug(
        `Authenticated user: ${claims.userId}, org: ${claims.orgId ?? 'none'}`,
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

    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');

    if (type?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }
}
