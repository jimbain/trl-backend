/**
 * Helper class for extracting item information from stack traces
 * Follows DRY, KISS, YAGNI principles
 */
export class ItemExtractorHelper {
  /**
   * Extract item type and ID from a stack trace string
   * Supports patterns like:
   * - /user-audios/audio_01KFR7VEJYX17NF8KBSB0RPMRK/actions/rent
   * - /user-videos/video_01KFR7VEJYX17NF8KBSB0RPMRK/actions/rent
   * - /user-pharmas/pharma_01KFR7VEJYX17NF8KBSB0RPMRK/actions/rent
   *
   * @param stackTrace The stack trace string to extract from
   * @returns Object with item_type and item_id, or null values if not found
   */
  static extractItemInfo(stackTrace: string | null): {
    item_type: string | null;
    item_id: string | null;
  } {
    if (!stackTrace) {
      return { item_type: null, item_id: null };
    }

    // Define patterns for each item type
    const patterns = [
      { type: 'audio', regex: /audio_([A-Z0-9]{26})/i },
      { type: 'video', regex: /video_([A-Z0-9]{26})/i },
      { type: 'pharma', regex: /pharma_([A-Z0-9]{26})/i },
    ];

    // Try to match each pattern
    for (const pattern of patterns) {
      const match = stackTrace.match(pattern.regex);
      if (match) {
        return {
          item_type: pattern.type,
          item_id: match[0], // Full ID including prefix (e.g., "audio_01KFR...")
        };
      }
    }

    return { item_type: null, item_id: null };
  }
}
