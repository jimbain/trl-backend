import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class TokenService {
  generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  generateRandomOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
}
