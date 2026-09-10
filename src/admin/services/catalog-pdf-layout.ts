/**
 * Column layout engine for the catalog PDF.
 *
 * pdfmake has no newspaper-style column flow: a `columns` node lays out each
 * column independently, and a table row is as tall as its tallest cell. Both
 * strand large vertical gaps when neighbouring entries differ in length.
 *
 * So we paginate ourselves. Every entry is measured with the same font metrics
 * pdfmake renders with, then packed greedily into column 1, column 2, next
 * page. The service emits each page as a fixed two-column node, so pdfmake is
 * never left to make a break decision of its own.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

export interface MeasurableEntry {
  title: string;
  authorLine: string | null;
  description: string | null;
  copyrightLine: string | null;
}

type FontVariant = 'normal' | 'bold' | 'italics';

const PDF_FONT: Record<FontVariant, string> = {
  normal: 'Helvetica',
  bold: 'Helvetica-Bold',
  italics: 'Helvetica-Oblique',
};

/** pdfmake: item.height = font.lineHeight(fontSize) * lineHeight. */
const HELVETICA_LINE_FACTOR = 0.925; // (ascender 718 + |descender| 207) / 1000

/** Font sizes and margins here mirror the nodes the service emits. */
export const ENTRY_STYLE = {
  lineHeightFactor: 1.3,
  title: { fontSize: 8, variant: 'bold', marginTop: 6, marginBottom: 1 },
  author: { fontSize: 7.5, variant: 'italics', marginBottom: 2 },
  description: { fontSize: 7, variant: 'normal', marginBottom: 2 },
  copyright: { fontSize: 6.5, variant: 'normal', marginBottom: 4 },
} as const;

/**
 * Measures wrapped text using the same Helvetica metrics pdfmake renders with.
 *
 * Wrapping is greedy on whitespace only. pdfmake's Unicode line breaker also
 * breaks after hyphens and slashes, so it can only ever fit the same number of
 * lines or fewer than we predict. Erring long is deliberate: an over-estimate
 * costs a few points of slack at the foot of a column, whereas an
 * under-estimate would overflow onto a page carrying no category banner.
 */
export class CatalogTextMeasurer {
  private readonly doc: any;
  private readonly widthCache = new Map<string, number>();

  constructor() {
    this.doc = new PDFDocument({ autoFirstPage: false });
  }

  lineHeight(fontSize: number): number {
    return HELVETICA_LINE_FACTOR * fontSize * ENTRY_STYLE.lineHeightFactor;
  }

  private width(text: string, fontSize: number, variant: FontVariant): number {
    const key = `${variant}|${fontSize}|${text}`;
    const cached = this.widthCache.get(key);
    if (cached !== undefined) return cached;
    this.doc.font(PDF_FONT[variant]).fontSize(fontSize);
    const w: number = this.doc.widthOfString(text);
    this.widthCache.set(key, w);
    return w;
  }

  /** Number of lines `text` occupies when wrapped to `maxWidth`. */
  countLines(
    text: string,
    fontSize: number,
    variant: FontVariant,
    maxWidth: number,
  ): number {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;

    const spaceWidth = this.width(' ', fontSize, variant);
    let lines = 1;
    let used = 0;

    for (const word of words) {
      const wordWidth = this.width(word, fontSize, variant);

      // A token wider than the column is broken mid-word by pdfmake.
      if (wordWidth > maxWidth) {
        if (used > 0) lines++;
        const fragments = Math.ceil(wordWidth / maxWidth);
        lines += fragments - 1;
        used = wordWidth - (fragments - 1) * maxWidth;
        continue;
      }

      const advance = used === 0 ? wordWidth : spaceWidth + wordWidth;
      if (used + advance > maxWidth) {
        lines++;
        used = wordWidth;
      } else {
        used += advance;
      }
    }

    return lines;
  }

  /** Rendered height, in points, of one catalog entry's stack. */
  measureEntry(entry: MeasurableEntry, columnWidth: number): number {
    const s = ENTRY_STYLE;
    const block = (
      text: string | null,
      style: { fontSize: number; variant: string; marginBottom: number },
    ) => {
      if (!text) return 0;
      const lines = this.countLines(
        text,
        style.fontSize,
        style.variant as FontVariant,
        columnWidth,
      );
      return lines * this.lineHeight(style.fontSize) + style.marginBottom;
    };

    return (
      s.title.marginTop +
      block(entry.title, s.title) +
      block(entry.authorLine, s.author) +
      block(entry.description, s.description) +
      block(entry.copyrightLine, s.copyright)
    );
  }
}

/** A page holds two columns of entries, in reading order. */
export type PackedPage<T> = [T[], T[]];

/**
 * Greedily fills column 1, then column 2, then starts a new page.
 *
 * Entries are kept whole. An entry taller than a full column would be left to
 * pdfmake to break, which would spill it onto a page with no banner; no such
 * entry exists in the catalogue today (the tallest is ~70% of a column), so it
 * is simply given a column to itself rather than a line-splitting typesetter.
 */
export function packIntoPages<T>(
  entries: T[],
  heightOf: (entry: T) => number,
  columnHeight: number,
): PackedPage<T>[] {
  const pages: PackedPage<T>[] = [];
  let page: PackedPage<T> = [[], []];
  let columnIndex: 0 | 1 = 0;
  let used = 0;

  const nextColumn = () => {
    if (columnIndex === 0) {
      columnIndex = 1;
    } else {
      pages.push(page);
      page = [[], []];
      columnIndex = 0;
    }
    used = 0;
  };

  for (const entry of entries) {
    const height = heightOf(entry);
    if (used > 0 && used + height > columnHeight) nextColumn();
    page[columnIndex].push(entry);
    used += height;
  }

  if (page[0].length > 0 || page[1].length > 0) pages.push(page);
  return pages;
}
