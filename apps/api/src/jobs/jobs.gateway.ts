import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { AppConfig } from '../config/configuration';
import type {
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
} from './dto/submit-job.dto';

interface AuthenticatedSocket extends Socket {
  userId: string;
  orgId: string | null;
}

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: true, // Configured per-request by main.ts CORS settings
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class JobsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(JobsGateway.name);

  // Map userId -> Set of socket IDs for targeted broadcasting
  private readonly userSockets = new Map<string, Set<string>>();

  private readonly secretKey: string;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.secretKey = this.configService.get('CLERK_SECRET_KEY', { infer: true });
  }

  afterInit(_server: Server): void {
    this.logger.log('WebSocket gateway initialized on namespace /ws');
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.debug(`Client attempting connection: ${client.id}`);

    try {
      // Extract token from auth handshake
      const token =
        (client.handshake.auth as { token?: string }).token ??
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(
          `Connection rejected — no token: ${client.id}`,
        );
        client.emit('error', { message: 'Authentication required' });
        client.disconnect(true);
        return;
      }

      // Verify with Clerk — verifyToken works directly with JWT string
      const payload = await verifyToken(token, { secretKey: this.secretKey });

      if (!payload?.sub) {
        this.logger.warn(
          `Connection rejected — invalid token: ${client.id}`,
        );
        client.emit('error', { message: 'Invalid token' });
        client.disconnect(true);
        return;
      }

      // Attach user info to socket
      const authSocket = client as AuthenticatedSocket;
      authSocket.userId = payload.sub;
      authSocket.orgId = (payload.org_id as string | undefined) ?? null;

      // Track socket by user ID
      if (!this.userSockets.has(authSocket.userId)) {
        this.userSockets.set(authSocket.userId, new Set());
      }
      this.userSockets.get(authSocket.userId)!.add(client.id);

      // Join user-specific room for targeted events
      await client.join(`user:${authSocket.userId}`);
      if (authSocket.orgId) {
        await client.join(`org:${authSocket.orgId}`);
      }

      this.logger.log(
        `Client connected: ${client.id} (user: ${authSocket.userId})`,
      );
      client.emit('connected', { message: 'Connected to FountainFlow' });
    } catch (error) {
      this.logger.warn(
        `Connection rejected — auth error: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const authSocket = client as unknown as Partial<AuthenticatedSocket>;

    if (authSocket.userId) {
      const userSocketSet = this.userSockets.get(authSocket.userId);
      if (userSocketSet) {
        userSocketSet.delete(client.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(authSocket.userId);
        }
      }
    }

    this.logger.log(
      `Client disconnected: ${client.id} (user: ${authSocket.userId ?? 'unknown'})`,
    );
  }

  /**
   * Subscribe to a specific job's updates.
   * Client sends: { job_id: string }
   */
  @SubscribeMessage('subscribe:job')
  handleSubscribeJob(
    @MessageBody() data: { job_id: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data.job_id) return;
    void client.join(`job:${data.job_id}`);
    this.logger.debug(
      `Client ${client.id} subscribed to job ${data.job_id}`,
    );
  }

  /**
   * Unsubscribe from a specific job's updates.
   */
  @SubscribeMessage('unsubscribe:job')
  handleUnsubscribeJob(
    @MessageBody() data: { job_id: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data.job_id) return;
    void client.leave(`job:${data.job_id}`);
    this.logger.debug(
      `Client ${client.id} unsubscribed from job ${data.job_id}`,
    );
  }

  // ─── Public emit methods (called by JobsService) ───────────────────────────

  /**
   * Emit job progress update to all clients subscribed to this job AND the user.
   */
  emitJobProgress(userId: string, event: JobProgressEvent): void {
    this.logger.debug(
      `Emitting job:progress for job ${event.job_id} (${event.progress_pct}%)`,
    );
    this.server
      .to(`job:${event.job_id}`)
      .to(`user:${userId}`)
      .emit('job:progress', event);
  }

  /**
   * Emit job completion to all clients subscribed to this job AND the user.
   */
  emitJobCompleted(userId: string, event: JobCompletedEvent): void {
    this.logger.log(
      `Emitting job:completed for job ${event.job_id}`,
    );
    this.server
      .to(`job:${event.job_id}`)
      .to(`user:${userId}`)
      .emit('job:completed', event);
  }

  /**
   * Emit job failure to all clients subscribed to this job AND the user.
   */
  emitJobFailed(userId: string, event: JobFailedEvent): void {
    this.logger.warn(
      `Emitting job:failed for job ${event.job_id}: ${event.error}`,
    );
    this.server
      .to(`job:${event.job_id}`)
      .to(`user:${userId}`)
      .emit('job:failed', event);
  }

  /**
   * Get count of connected users (for monitoring).
   */
  getConnectedUserCount(): number {
    return this.userSockets.size;
  }
}
