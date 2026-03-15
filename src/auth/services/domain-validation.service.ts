import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/user.entity';

/**
 * Domain Validation Service
 * Centralized service for validating domain restrictions
 * Used by both auth routes and protected routes
 */
@Injectable()
export class DomainValidationService {
  private readonly logger = new Logger(DomainValidationService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Validates if a request is allowed based on domain configuration
   * @param requestHost - Request host from req.get('host')
   * @param user - User object with company information
   * @throws UnauthorizedException if validation fails with RESTRICT action
   */
  public validateDomain(requestHost: string, user?: any): void {
    // Get domain validation action from environment
    const domainValidationAction = (
      this.configService.get<string>('DOMAIN_VALIDATION_ACTION') || 'DISABLE'
    ).toUpperCase();

    // Skip validation if action is DISABLE
    if (domainValidationAction === 'DISABLE') {
      return;
    }

    // Need user with company for validation
    if (!user || !user.company) {
      return;
    }

    // Skip validation if company domain is not set
    if (!user.company.domain) {
      return;
    }

    // Allow localhost and 127.0.0.1 for development
    if (
      requestHost.startsWith('localhost') ||
      requestHost.startsWith('127.0.0.1')
    ) {
      return;
    }

    // Check if domain matches
    const isDomainMatch = requestHost === user.company.domain;

    if (!isDomainMatch) {
      const errorMessage = `Access denied. This account is registered for domain: ${user.company.domain}`;

      if (domainValidationAction === 'LOG') {
        // Log the mismatch but allow access
        this.logger.warn(
          `[Domain Validation] ${errorMessage} | Request from: ${requestHost} | User: ${user.email}`,
        );
        return;
      } else if (domainValidationAction === 'RESTRICT') {
        // Block the request
        throw new UnauthorizedException(errorMessage);
      }
    }
  }

  /**
   * Get the domain validation action
   * @returns 'DISABLE' | 'LOG' | 'RESTRICT'
   */
  public getAction(): string {
    return (
      this.configService.get<string>('DOMAIN_VALIDATION_ACTION') || 'DISABLE'
    ).toUpperCase();
  }

  /**
   * Check if domain validation is enabled in any mode
   * @returns true if LOG or RESTRICT
   */
  public isEnabled(): boolean {
    const action = this.getAction();
    return action === 'LOG' || action === 'RESTRICT';
  }

  /**
   * Check if validation is strict (RESTRICT mode)
   * @returns true if RESTRICT
   */
  public isStrict(): boolean {
    return this.getAction() === 'RESTRICT';
  }
}
