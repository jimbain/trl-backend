import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class TokenService {
  generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  generateRandomOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  }
}