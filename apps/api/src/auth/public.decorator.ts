import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './clerk.guard';

/**
 * Mark a route handler or controller as publicly accessible (no auth required).
 * Usage: @Public() on a method or class.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
