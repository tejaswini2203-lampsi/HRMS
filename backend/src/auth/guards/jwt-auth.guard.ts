import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      query?: { token?: string };
      user?: AuthUser;
    }>();

    let token: string | undefined;
    const header = request.headers.authorization || '';
    const [scheme, bearerToken] = header.split(' ');
    if (scheme === 'Bearer' && bearerToken) {
      token = bearerToken;
    } else if (request.query?.token) {
      token = request.query.token;
    }

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = this.jwtService.verify<{
        sub: number;
        empId: number;
        username: string;
        role: AuthUser['role'];
        name: string;
        email: string | null;
        subsidiaryId?: string | null;
      }>(token);

      request.user = {
        userId: payload.sub,
        empId: payload.empId,
        username: payload.username,
        role: payload.role,
        name: payload.name,
        email: payload.email ?? null,
        subsidiaryId: payload.subsidiaryId ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
