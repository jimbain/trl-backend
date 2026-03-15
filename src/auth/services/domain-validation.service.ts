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
   * Checks the Origin header (where request comes FROM) against company domain
   * @param req - Express request object with headers
   * @param user - User object with company information
   * @throws UnauthorizedException if validation fails with RESTRICT action
   */
  public validateDomain(req: any, user?: any): void {
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

    // Get origin from request (where the request comes FROM)
    // Priority: Origin header > Referer header
    // Note: Do NOT use Host header as fallback (it's always the API domain)
    let requestOrigin = req.get('origin') || req.get('referer');

    // If no Origin or Referer header (e.g., Postman, curl, mobile apps without CORS)
    // Allow the request - these tools don't support Origin header
    if (!requestOrigin) {
      return;
    }

    // If we got referer, extract just the origin part (remove path)
    if (requestOrigin.includes('/')) {
      requestOrigin = requestOrigin.split('/').slice(0, 3).join('/'); // Get scheme://host:port
    }

    // Allow localhost and 127.0.0.1 for development
    if (
      requestOrigin.startsWith('localhost') ||
      requestOrigin.startsWith('127.0.0.1') ||
      requestOrigin.includes('localhost') ||
      requestOrigin.includes('127.0.0.1')
    ) {
      return;
    }

    // Normalize both domains for comparison (remove protocol, trailing slash, port)
    const normalizedCompanyDomain = this.normalizeDomain(user.company.domain);
    const normalizedRequestOrigin = this.normalizeDomain(requestOrigin);

    // Check if domain matches
    const isDomainMatch = normalizedRequestOrigin === normalizedCompanyDomain;

    if (!isDomainMatch) {
      const errorMessage = `Access denied. This account is registered for domain: ${user.company.domain}`;

      if (domainValidationAction === 'LOG') {
        // Log the mismatch but allow access
        this.logger.warn(
          `[Domain Validation] ${errorMessage} | Request from: ${requestOrigin} | User: ${user.email}`,
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

  /**
   * Normalizes domain by removing protocol and trailing slashes
   * @param domain - Domain with or without protocol
   * @returns Normalized domain without protocol and trailing slash
   * @example
   * normalizeDomain('https://example.com') → 'example.com'
   * normalizeDomain('https://example.com:3000') → 'example.com:3000'
   * normalizeDomain('example.com/') → 'example.com'
   */
  private normalizeDomain(domain: string): string {
    if (!domain) {
      return domain;
    }

    // Remove protocol if present (http:// or https://)
    let normalized = domain.replace(/^https?:\/\//, '');

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');

    return normalized.toLowerCase();
  }
}
