import { Injectable } from '@nestjs/common';
import { PopularitySourceBreakdown } from '../entities/audio-popularity-score.entity';

export interface SourceContribution {
  name: string;
  sub_score: number | null; // null = not matched
  raw?: Record<string, unknown>;
}

export interface ComposedScore {
  /**
   * 0-100 integer, or null when no source could measure the title.
   *
   * NULL rather than 0 is deliberate: 0 is a real measurement (a source
   * matched and found nothing notable), and admins read this column to
   * decide what to license. Conflating "unknown" with "unpopular" buries
   * titles that were never looked at.
   */
  popularity_score: number | null;
  confidence: number; // count of sources that matched
  sources: PopularitySourceBreakdown;
}

@Injectable()
export class PopularityComposerService {
  /**
   * Weighted average of matched sources only. A missing source doesn't drag
   * the score to zero — it's excluded from both numerator and denominator.
   * If nothing matched, score = null and confidence = 0.
   */
  compose(
    contributions: SourceContribution[],
    weights: Record<string, number>,
  ): ComposedScore {
    let weightedSum = 0;
    let weightSum = 0;
    let confidence = 0;
    const sources: PopularitySourceBreakdown = {};

    for (const c of contributions) {
      const weight = weights[c.name] ?? 0;
      const matched = c.sub_score !== null && weight > 0;
      sources[c.name] = {
        matched,
        sub_score: c.sub_score,
        weight,
        raw: c.raw,
      };
      if (matched) {
        weightedSum += (c.sub_score as number) * weight;
        weightSum += weight;
        confidence += 1;
      }
    }

    // weightSum === 0 means every source either missed or carries weight 0 —
    // there is nothing to average, so there is no score.
    const popularity_score =
      weightSum > 0
        ? Math.max(0, Math.min(100, Math.round(weightedSum / weightSum)))
        : null;

    return {
      popularity_score,
      confidence,
      sources,
    };
  }

  /**
   * Stable version key for a weight set — stored on each score row so admins
   * can tell which weighting produced which value.
   */
  versionKey(weights: Record<string, number>): string {
    const sorted = Object.entries(weights).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return sorted.map(([k, v]) => `${k}=${v}`).join(';');
  }
}
