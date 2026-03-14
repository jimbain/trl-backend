import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

/**
 * Branch Deep Link Service
 * Handles creation and management of deep links via Branch.io API
 */
@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);
  private readonly branchApiKey: string;
  private readonly branchApiUrl = 'https://api2.branch.io/v1/url';
  private readonly requestTimeoutMs = 10000;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 100;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.branchApiKey = this.configService.get<string>('BRANCH_API_KEY') || '';
    if (!this.branchApiKey) {
      this.logger.warn('BRANCH_API_KEY is not configured');
    }
  }

  /**
   * Create a single deep link for an audio and domain
   * Includes retry logic with exponential backoff
   *
   * @param audioId - The audio ID
   * @param domain - The company domain (e.g., 'biz.therentallibrary.com')
   * @returns The short deep link URL (e.g., 'https://trl.app.link/xxx')
   * @throws Error if all retries fail
   */
  async createDeepLink(audioId: string, domain: string): Promise<string> {
    return this.createDeepLinkWithRetry(audioId, domain, 0);
  }

  /**
   * Create deep links for an audio across multiple domains
   * Returns mapping of domain → deep link
   * Failed domains are skipped and logged
   *
   * @param audioId - The audio ID
   * @param domains - Array of company domains
   * @returns Object with domain keys and link values
   */
  async createDeepLinksForAudio(
    audioId: string,
    domains: string[],
  ): Promise<Record<string, string>> {
    const deepLinks: Record<string, string> = {};

    for (const domain of domains) {
      try {
        const link = await this.createDeepLink(audioId, domain);
        deepLinks[domain] = link;
        this.logger.debug(
          `Created deep link for audio ${audioId} on domain ${domain}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create deep link for audio ${audioId} on domain ${domain}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with next domain instead of throwing
      }
    }

    return deepLinks;
  }

  /**
   * Create or update deep links for an audio, skipping existing ones
   * Only generates deep links for domains that don't already have one
   * Merges with existing deep links in the database
   *
   * @param audioId - The audio ID
   * @param domains - Array of company domains
   * @param existingDeepLinks - Existing deep links object from database (optional)
   * @returns Object with domain keys and link values (existing + new)
   */
  async createOrUpdateDeepLinksForAudio(
    audioId: string,
    domains: string[],
    existingDeepLinks?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const merged = existingDeepLinks ? { ...existingDeepLinks } : {};

    // Find domains that need new deep links
    const domainsToGenerate = domains.filter((domain) => !merged[domain]);

    if (domainsToGenerate.length === 0) {
      this.logger.debug(
        `Audio ${audioId}: All deep links already exist, skipping API calls`,
      );
      return merged;
    }

    this.logger.debug(
      `Audio ${audioId}: Generating deep links for ${domainsToGenerate.length}/${domains.length} domains`,
    );

    // Generate only for missing domains
    for (const domain of domainsToGenerate) {
      try {
        const link = await this.createDeepLink(audioId, domain);
        merged[domain] = link;
        this.logger.debug(
          `Created deep link for audio ${audioId} on domain ${domain}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create deep link for audio ${audioId} on domain ${domain}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with next domain instead of throwing
      }
    }

    return merged;
  }

  /**
   * Private method: Create deep link with retry logic
   * Implements exponential backoff (100ms, 200ms, 400ms)
   */
  private async createDeepLinkWithRetry(
    audioId: string,
    domain: string,
    attempt: number,
  ): Promise<string> {
    try {
      return await this.callBranchApi(audioId, domain);
    } catch (error) {
      if (attempt < this.maxRetries - 1) {
        const delayMs = this.retryDelayMs * Math.pow(2, attempt);
        this.logger.debug(
          `Retrying deep link creation for ${audioId} on ${domain} (attempt ${attempt + 1}/${this.maxRetries}) after ${delayMs}ms`,
        );
        await this.delay(delayMs);
        return this.createDeepLinkWithRetry(audioId, domain, attempt + 1);
      } else {
        throw error;
      }
    }
  }

  /**
   * Private method: Call Branch API to create deep link
   */
  private async callBranchApi(
    audioId: string,
    domain: string,
  ): Promise<string> {
    const redirectUrl = `https://${domain}/audio-books/book/${audioId}`;

    const payload = {
      branch_key: this.branchApiKey,
      channel: 'audio_sharing',
      feature: 'audio_book',
      data: {
        $desktop_url: redirectUrl,
        $ios_url: redirectUrl,
        $android_url: redirectUrl,
        $fallback_url: redirectUrl,
        audio_id: audioId,
        domain: domain,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.branchApiUrl, payload, {
          timeout: this.requestTimeoutMs,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );

      const shortUrl = response.data.url;
      if (!shortUrl) {
        throw new Error('Branch API response missing "url" field');
      }

      return shortUrl;
    } catch (error) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      const errorData = axiosError.response?.data;

      this.logger.error(
        `Branch API error for audio ${audioId} on domain ${domain}: Status ${statusCode}, Data: ${JSON.stringify(errorData)}`,
      );

      throw new Error(
        `Failed to create deep link via Branch API: ${axiosError.message}`,
      );
    }
  }

  /**
   * Private helper: Sleep for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
