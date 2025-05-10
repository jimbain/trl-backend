import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class MobileAppApiKeyAuthGuard implements CanActivate {
  private readonly apiKey = process.env.MOBILE_APP_API_KEY;

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey) {
      throw new UnauthorizedException('API key configuration is missing');
    }

    const request: Request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || authHeader !== `Bearer ${this.apiKey}`) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
