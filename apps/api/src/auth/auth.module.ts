import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkAuthGuard } from './clerk.guard';

@Module({
  providers: [
    ClerkAuthGuard,
    {
      // Apply ClerkAuthGuard globally to all routes
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
  exports: [ClerkAuthGuard],
})
export class AuthModule {}
