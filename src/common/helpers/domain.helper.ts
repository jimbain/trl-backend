/**
 * Domain normalization utility
 * Handles extraction and normalization of base domains from various formats
 */
export class DomainHelper {
  /**
   * Extract and normalize base domain from a URL or domain string
   * Removes protocol, www prefix, trailing slashes, paths, and normalizes to lowercase
   *
   * @param url - Domain or URL string to normalize
   * @returns Normalized base domain (e.g., 'biz.therentallibrary.com')
   *
   * @example
   * extractBaseDomain('https://biz.therentallibrary.com/')
   * // → 'biz.therentallibrary.com'
   *
   * @example
   * extractBaseDomain('http://www.example.com/path?query=1')
   * // → 'example.com'
   *
   * @example
   * extractBaseDomain('  BIZ.TheRentalLibrary.com  ')
   * // → 'biz.therentallibrary.com'
   */
  static extractBaseDomain(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    let domain = url.trim();

    // Remove protocol (http://, https://)
    domain = domain.replace(/^https?:\/\//i, '');

    // Remove www prefix (with optional hyphen or dot variations)
    domain = domain.replace(/^www\.?/i, '');

    // Remove paths, query strings, and fragments
    domain = domain.split(/[/?#]/)[0];

    // Remove trailing slashes and colons (for ports)
    domain = domain.replace(/[:/]+$/, '');

    // Normalize to lowercase
    domain = domain.toLowerCase();

    // Trim any remaining whitespace
    domain = domain.trim();

    return domain;
  }

  /**
   * Validate if a string is a valid domain format
   *
   * @param domain - Domain string to validate
   * @returns true if domain is valid, false otherwise
   *
   * @example
   * isValidDomain('example.com') // → true
   * isValidDomain('sub.example.co.uk') // → true
   * isValidDomain('invalid domain') // → false
   */
  static isValidDomain(domain: string): boolean {
    if (!domain || typeof domain !== 'string') {
      return false;
    }

    // Basic domain validation
    // Must have at least one dot and valid characters
    const domainRegex =
      /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
    return domainRegex.test(domain);
  }

  /**
   * Extract all unique base domains from an array of domain strings
   * Automatically normalizes and validates each domain
   *
   * @param domains - Array of domain strings
   * @returns Set of unique normalized base domains
   *
   * @example
   * extractUniqueDomains(['https://example.com/', 'example.com', 'EXAMPLE.COM'])
   * // → Set { 'example.com' }
   */
  static extractUniqueDomains(
    domains: (string | null | undefined)[],
  ): Set<string> {
    const uniqueDomains = new Set<string>();

    for (const domain of domains) {
      if (!domain) continue;

      const normalized = this.extractBaseDomain(domain);
      if (normalized && this.isValidDomain(normalized)) {
        uniqueDomains.add(normalized);
      }
    }

    return uniqueDomains;
  }
}
