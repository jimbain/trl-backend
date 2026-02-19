/**
 * Cache key patterns used across the application
 * Centralizing cache keys here ensures consistency and maintainability
 */
export class CacheKeys {
  /**
   * Cache key for company data
   * @param companyId - The company ID
   * @returns Cache key (company ID itself)
   */
  static company(companyId: string): string {
    return companyId;
  }

  /**
   * Cache key for audio categories by company
   * @param companyId - The company ID
   * @returns Cache key in format: audio_categories:{companyId}
   */
  static audioCategoriesByCompany(companyId: string): string {
    return `audio_categories:${companyId}`;
  }

  /**
   * Invalidate company cache for multiple companies
   * @param cacheService - The cache service instance
   * @param companyIds - Array of company IDs
   */
  static async invalidateCompanyCache(
    cacheService: any,
    companyIds: string[],
  ): Promise<void> {
    await Promise.all(
      companyIds.map((id) => cacheService.delete(CacheKeys.company(id))),
    );
  }

  /**
   * Invalidate audio categories cache for multiple companies
   * @param cacheService - The cache service instance
   * @param companyIds - Array of company IDs
   */
  static async invalidateAudioCategoriesCache(
    cacheService: any,
    companyIds: string[],
  ): Promise<void> {
    await Promise.all(
      companyIds.map((id) =>
        cacheService.delete(CacheKeys.audioCategoriesByCompany(id)),
      ),
    );
  }

  /**
   * Invalidate both company and audio categories cache for multiple companies
   * Convenience method for when both caches need to be cleared
   * @param cacheService - The cache service instance
   * @param companyIds - Array of company IDs
   */
  static async invalidateCompanyRelatedCaches(
    cacheService: any,
    companyIds: string[],
  ): Promise<void> {
    await Promise.all([
      CacheKeys.invalidateCompanyCache(cacheService, companyIds),
      CacheKeys.invalidateAudioCategoriesCache(cacheService, companyIds),
    ]);
  }
}
