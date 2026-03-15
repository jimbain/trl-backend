import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { DomainValidationService } from '../services/domain-validation.service';
import { UserService } from 'src/users/user.service';

/**
 * Domain Validation Guard
 * Validates domain restrictions for auth endpoints
 * Can be applied to login, signup, and other auth routes
 *
 * Usage:
 * @UseGuards(DomainValidationGuard)
 * @Post('login')
 * async login(@Body() loginPayload: LoginDto) { ... }
 */
@Injectable()
export class DomainValidationGuard implements CanActivate {
  constructor(
    private readonly domainValidationService: DomainValidationService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Skip if domain validation is disabled
    if (!this.domainValidationService.isEnabled()) {
      return true;
    }

    // Extract email from request body
    const email = request.body?.email;

    // If no email in body, skip validation
    if (!email) {
      return true;
    }

    // Fetch user with company information
    const user = await this.userService.findByEmail(email, ['company']);

    // If user not found, allow the request (login endpoint will handle user validation)
    if (!user) {
      return true;
    }

    // Validate domain (pass entire request for Origin header access)
    this.domainValidationService.validateDomain(request, user);

    return true;
  }
}
