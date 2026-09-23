import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { Category } from 'src/categories/entities/category.entity';
import { CatalogService } from 'src/catalog/catalog.service';
import { Media } from 'src/constants';
import { CatalogTextMeasurer, packIntoPages } from './catalog-pdf-layout';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake/js/Printer.js').default;

interface TitleRow {
  title: string;
  authors: string[];
  short_description: string | null;
  description: string | null;
  copyright: string | null;
  publisher: string | null;
  runtime: string | null;
}

interface CategoryWithTitles {
  name: string;
  titles: TitleRow[];
}

/** A row reduced to the literal strings the page renders. */
interface PreparedEntry {
  title: string;
  authorLine: string | null;
  description: string | null;
  copyrightLine: string | null;
}

const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const DARK_BLUE = '#1A3A5C';
const GOLD = '#C9A227';
const PAGE_BG = '#C5CBD8';

// Top margin is tight because there is no running header above the banner.
const PAGE_MARGINS: [number, number, number, number] = [40, 36, 40, 54];
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

/** Two equal columns with a gutter, filling the printable width exactly. */
const COLUMN_WIDTH = 255;
const COLUMN_GUTTER =
  PAGE_WIDTH - PAGE_MARGINS[0] - PAGE_MARGINS[2] - 2 * COLUMN_WIDTH;

const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGINS[1] - PAGE_MARGINS[3];

/** Banner cell padding, above and below the 9pt text, plus the node's margin. */
const BANNER_PADDING = 4;
const BANNER_MARGIN_BOTTOM = 6;

/**
 * The TRL wordmark, inlined so it needs no build-time asset copying and cannot
 * go missing from a container image. Vector rather than the PNG: the raster
 * artwork is only 84x28, which would be visibly soft at cover size and in
 * print, whereas this stays sharp at any scale. viewBox is 120x40, so height
 * follows width at 1:3.
 */
const LOGO_ASPECT = 40 / 120;
const LOGO_SVG = `<svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 9.6L0.673887 0H28.0144L27.2924 9.6H19.3502L17.0878 39.95H5.87244L8.03851 9.6H0Z" fill="#351F25"/>
<path d="M29.1694 28.85L30.0359 17.55L35.5714 22.25L29.1694 28.85Z" fill="#CD3026"/>
<path d="M81.5405 28.9L82.407 17.6L87.9425 22.3L81.5405 28.9Z" fill="#CD3026"/>
<path d="M106.956 0.0499878H95.0662L92.2744 40H119.326L120 30.1H104.886L106.956 0.0499878Z" fill="#351F25"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M43.225 0L40.3369 40H52.2262L53.4296 24.7H56.7509L61.5162 40H74.5607L68.929 22.65C71.4159 21.5833 76.4187 17.9 76.5343 11.7C76.6787 7.8 74.5319 0 64.7894 0H43.225ZM54.3923 8.6L53.9109 16.1H59.9278C61.2114 16.05 63.8363 15.25 64.0674 12.45C64.2278 11.2167 63.8171 8.72 60.8905 8.6H54.3923Z" fill="#351F25"/>
</svg>`;

/**
 * Carried over from TRL's own 50th Anniversary catalogue (2021). Confirm with
 * the client before the next print run in case the postal address or phone
 * number has since changed.
 */
const CONTACT = {
  company: 'Tape Rental Library, Inc.',
  address: ['One Cassette Center', 'P.O. Box 107', 'Covesville, VA 22931'],
  phone: '434-293-3705',
  email: 'info@TRLonline.com',
  web: 'www.TrainingResourceLibrary.com',
};

@Injectable()
export class AdminCatalogPdfService {
  constructor(
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly catalogService: CatalogService,
  ) {}

  async generateDefaultCatalogPdf(mediaType: string): Promise<Buffer> {
    const catalog = await this.catalogService.findDefaultByType(
      mediaType as Media,
    );
    const categories = await this.buildCategoriesWithTitles(
      catalog.categories ?? [],
    );
    return this.renderPdf(categories, mediaType);
  }

  async generateCompanyCatalogPdf(catalogId: number): Promise<Buffer> {
    const catalog = await this.catalogService.findOne(catalogId);
    const categories = await this.buildCategoriesWithTitles(
      catalog.categories ?? [],
    );
    return this.renderPdf(categories, catalog.media_type);
  }

  private async buildCategoriesWithTitles(
    categoryIds: string[],
  ): Promise<CategoryWithTitles[]> {
    if (categoryIds.length === 0) return [];

    const categoryEntities = await this.categoryRepo.find({
      where: { id: In(categoryIds), is_active: true },
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
    if (categoryEntities.length === 0) return [];

    const activeCatIds = categoryEntities.map((c) => c.id);

    const rows = await this.audioRepo.manager.query<any[]>(
      `
      SELECT
        COALESCE(a.display_title, m.title)              AS title,
        COALESCE(a.display_authors, m.authors)           AS authors,
        a.display_short_description,
        COALESCE(a.display_description, m.description)  AS description,
        COALESCE(a.display_copyright, m.copyright)      AS copyright,
        m.publisher,
        m.runtime,
        a.categories
      FROM audios a
      INNER JOIN audio_metadata m ON m.sku = a.sku
      WHERE a.deleted_at IS NULL
        AND a.is_active = true
        AND array(SELECT jsonb_array_elements_text(a.categories)) && $1
      ORDER BY COALESCE(a.display_title, m.title) ASC
      `,
      [activeCatIds],
    );

    const catMap = new Map<string, TitleRow[]>(
      categoryEntities.map((c) => [c.id, []]),
    );

    for (const row of rows) {
      const cats: string[] = Array.isArray(row.categories)
        ? row.categories
        : [];
      const authors: string[] = Array.isArray(row.authors) ? row.authors : [];
      const entry: TitleRow = {
        title: row.title ?? '',
        authors,
        short_description: row.display_short_description ?? null,
        description: row.description ?? null,
        copyright: row.copyright ?? null,
        publisher: row.publisher ?? null,
        runtime: row.runtime ?? null,
      };
      for (const catId of cats) {
        if (catMap.has(catId)) {
          catMap.get(catId)!.push(entry);
        }
      }
    }

    return categoryEntities
      .map((c) => ({ name: c.name, titles: catMap.get(c.id) ?? [] }))
      .filter((c) => c.titles.length > 0);
  }

  private async renderPdf(
    categories: CategoryWithTitles[],
    mediaType: string,
  ): Promise<Buffer> {
    const measurer = new CatalogTextMeasurer();

    const categoryPages = categories.flatMap((cat, i) =>
      this.buildCategoryPages(cat, i === 0, i, measurer),
    );

    // Because we paginate the body ourselves, the last page number is known up
    // front. Cover and back cover share a decorative treatment and carry no
    // running header, footer or page number.
    const backCoverPage = 2 + categoryPages.length + 1;
    const isPlate = (page: number) => page === 1 || page === backCoverPage;

    const content: any[] = [
      this.buildCoverPage(mediaType),
      { text: '', pageBreak: 'after' },
      this.buildTocPage(categories),
      { text: '', pageBreak: 'after' },
      ...categoryPages,
      this.buildBackCoverPage(),
    ];

    const docDef: Record<string, any> = {
      pageSize: 'LETTER',
      // Shared with the column maths above: the packer sizes columns from
      // these margins, so the two must never drift apart.
      pageMargins: PAGE_MARGINS,
      defaultStyle: { font: 'Helvetica', fontSize: 8.5, lineHeight: 1.3 },

      background: (
        currentPage: number,
        pageSize: { width: number; height: number },
      ) => {
        if (!isPlate(currentPage)) return null;
        return {
          canvas: [
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: pageSize.width,
              h: pageSize.height,
              color: PAGE_BG,
            },
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: pageSize.width,
              h: 22,
              color: GOLD,
            },
            {
              type: 'rect',
              x: 0,
              y: pageSize.height - 22,
              w: pageSize.width,
              h: 22,
              color: GOLD,
            },
          ],
        };
      },

      // No running header. The blue category banner already names every page,
      // so the plain-type "TRL Audiobooks" line was redundant; dropping it and
      // tightening the top margin hands its space back to the listings.

      footer: (currentPage: number) => {
        if (isPlate(currentPage)) return {};
        return {
          margin: [40, 6, 40, 0],
          columns: [
            {
              text: 'TRL',
              alignment: 'left',
              fontSize: 7.5,
              color: '#666666',
            },
            {
              text: 'Audiobooks',
              alignment: 'center',
              fontSize: 7.5,
              color: '#666666',
            },
            {
              text: String(currentPage),
              alignment: 'right',
              fontSize: 7.5,
              color: '#666666',
            },
          ],
        };
      },

      content,
      styles: this.buildStyles(),
    };

    // pdfmake 0.3.x requires a urlResolver with both resolve() and resolved().
    // Built-in Helvetica fonts need no actual fetching; the resolver is a no-op.
    const noopResolver = {
      resolve: () => {},
      resolved: () => Promise.resolve(),
    };
    const printer = new PdfPrinter(FONTS, undefined, noopResolver);
    const doc = await printer.createPdfKitDocument(docDef);

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  /** The TRL wordmark at a given width, centred in the content column. */
  private logoNode(
    width: number,
    margin: [number, number, number, number],
  ): any {
    return {
      svg: LOGO_SVG,
      width,
      height: width * LOGO_ASPECT,
      alignment: 'center',
      margin,
    };
  }

  /**
   * A horizontal rule that centres correctly. pdfmake sizes a canvas from its
   * largest x, so a line must start at x=0 for `alignment: 'center'` to place
   * it symmetrically; any left inset shifts the whole rule to the right.
   */
  private centeredRule(
    width: number,
    thickness: number,
    margin: [number, number, number, number] = [0, 10, 0, 16],
  ): any {
    return {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: width,
          y2: 0,
          lineWidth: thickness,
          lineColor: '#CC0000',
        },
      ],
      margin,
    };
  }

  private buildCoverPage(mediaType: string): any {
    const topLabel =
      mediaType === 'audio'
        ? 'AUDIO'
        : mediaType === 'video'
          ? 'VIDEO'
          : 'PHARMA';
    const year = new Date().getFullYear().toString();
    return {
      stack: [
        { text: '', margin: [0, 150, 0, 0] },
        { text: topLabel, style: 'coverTitle' },
        this.centeredRule(400, 5),
        { text: 'LEARNING', style: 'coverTitle' },
        this.logoNode(230, [0, 70, 0, 24]),
        { text: year, style: 'coverYear' },
      ],
      alignment: 'center',
    };
  }

  /**
   * Back cover: the front cover's logo treatment over the contact block, on the
   * same decorative ground, so the catalogue opens and closes on the same note.
   */
  private buildBackCoverPage(): any {
    const line = (text: string, opts: Record<string, any> = {}) => ({
      text,
      alignment: 'center',
      fontSize: 9,
      color: '#222222',
      margin: [0, 1, 0, 1],
      ...opts,
    });

    return {
      pageBreak: 'before',
      alignment: 'center',
      stack: [
        this.logoNode(170, [0, 230, 0, 0]),
        this.centeredRule(240, 4, [0, 16, 0, 26]),
        line(CONTACT.company, { bold: true, fontSize: 11 }),
        ...CONTACT.address.map((l) => line(l)),
        { text: '', margin: [0, 9, 0, 0] },
        line(CONTACT.phone, { bold: true, fontSize: 10 }),
        { text: '', margin: [0, 9, 0, 0] },
        line(CONTACT.email),
        line(CONTACT.web),
      ],
    };
  }

  private buildTocPage(categories: CategoryWithTitles[]): any {
    return {
      stack: [
        this.bannerNode('TRL AUDIOBOOK LIBRARY'),
        {
          text: 'Continue your career self-development with Audiobooks from TRL. This catalog has over 1000 titles to choose from on a wide variety of business topics.',
          style: 'bodyText',
          margin: [0, 8, 0, 12],
        },
        {
          text: 'How do I get started?',
          bold: true,
          fontSize: 8.5,
          margin: [0, 0, 0, 4],
        },
        {
          text: 'Download our app "TRL Audiobooks" to get started right away. Contact us for information on how to login.',
          style: 'bodyText',
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: [36, '*'],
            body: [
              [
                { text: 'Mail:', bold: true, fontSize: 8 },
                {
                  text: [CONTACT.company, ...CONTACT.address].join('\n'),
                  fontSize: 8,
                },
              ],
              [
                { text: 'Phone:', bold: true, fontSize: 8 },
                { text: CONTACT.phone, fontSize: 8 },
              ],
              [
                { text: 'Email:', bold: true, fontSize: 8 },
                { text: CONTACT.email, fontSize: 8 },
              ],
              [
                { text: 'Web:', bold: true, fontSize: 8 },
                { text: CONTACT.web, fontSize: 8 },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 16],
        },
        this.bannerNode('TABLE OF CONTENTS'),
        ...categories.map((c, i) => ({
          columns: [
            { text: c.name, fontSize: 8, width: '*' },
            {
              text: [{ pageReference: `cat_${i}` }],
              fontSize: 8,
              width: 30,
              alignment: 'right',
            },
          ],
          margin: [0, 2, 0, 2],
        })),
      ],
    };
  }

  /**
   * Lays a category out as a sequence of whole pages, each carrying its own
   * banner. We paginate rather than letting pdfmake do it because neither of
   * its native options flows text between columns, and both leave the ragged
   * vertical gaps Mark flagged.
   */
  private buildCategoryPages(
    cat: CategoryWithTitles,
    isFirst: boolean,
    catIndex: number,
    measurer: CatalogTextMeasurer,
  ): any[] {
    const bannerHeight =
      2 * BANNER_PADDING + measurer.lineHeight(9) + BANNER_MARGIN_BOTTOM;
    const columnHeight = CONTENT_HEIGHT - bannerHeight;

    const prepared = cat.titles.map((t) => this.prepareEntry(t));
    const heights = new Map<PreparedEntry, number>(
      prepared.map((p) => [p, measurer.measureEntry(p, COLUMN_WIDTH)]),
    );

    const pages = packIntoPages(prepared, (p) => heights.get(p)!, columnHeight);

    return pages.map((columns, pageIndex) => ({
      stack: [
        // Only the first page carries the TOC anchor, so `pageReference`
        // resolves to where the category starts.
        this.bannerNode(
          cat.name.toUpperCase(),
          pageIndex === 0 ? `cat_${catIndex}` : undefined,
        ),
        {
          columns: [
            {
              width: COLUMN_WIDTH,
              stack: columns[0].map((p) => this.entryNode(p)),
            },
            { width: COLUMN_GUTTER, text: '' },
            {
              width: COLUMN_WIDTH,
              stack: columns[1].map((p) => this.entryNode(p)),
            },
          ],
        },
      ],
      ...(isFirst && pageIndex === 0 ? {} : { pageBreak: 'before' }),
    }));
  }

  /**
   * Flattens a row into the exact strings that get rendered. Measuring and
   * rendering both read from this, so the packer can never disagree with the
   * page about how tall an entry is.
   */
  private prepareEntry(t: TitleRow): PreparedEntry {
    const rawDesc = t.short_description?.trim() || t.description;
    const desc = rawDesc ? this.stripHtml(rawDesc) : null;
    const runtime = this.formatRuntime(t.runtime);
    const copyrightParts = [t.copyright, t.publisher].filter(Boolean);

    return {
      title: (t.title ?? '').toUpperCase(),
      authorLine: t.authors.length > 0 ? `by ${t.authors.join(', ')}` : null,
      description: desc ? (runtime ? `${desc} ${runtime}` : desc) : null,
      copyrightLine:
        copyrightParts.length > 0 ? copyrightParts.join(' — ') : null,
    };
  }

  private entryNode(p: PreparedEntry): any {
    const stack: any[] = [
      { text: p.title, bold: true, fontSize: 8, margin: [0, 6, 0, 1] },
    ];

    if (p.authorLine) {
      stack.push({
        text: p.authorLine,
        italics: true,
        fontSize: 7.5,
        color: '#555555',
        margin: [0, 0, 0, 2],
      });
    }

    if (p.description) {
      stack.push({
        text: p.description,
        fontSize: 7,
        color: '#333333',
        alignment: 'justify',
        margin: [0, 0, 0, 2],
      });
    }

    if (p.copyrightLine) {
      stack.push({
        text: p.copyrightLine,
        fontSize: 6.5,
        color: '#888888',
        margin: [0, 0, 0, 4],
      });
    }

    return { stack };
  }

  private bannerNode(text: string, anchorId?: string): any {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text,
              ...(anchorId ? { id: anchorId } : {}),
              color: 'white',
              bold: true,
              alignment: 'center',
              fontSize: 9,
              margin: [0, BANNER_PADDING, 0, BANNER_PADDING],
              fillColor: DARK_BLUE,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, BANNER_MARGIN_BOTTOM],
    };
  }

  /**
   * Flattens stored HTML to plain text for the page.
   *
   * Entities have to be decoded, not just the four named ones: the short
   * descriptions carry numeric references (`&#160;` alone appears ~880 times),
   * which otherwise print literally. `&amp;` is decoded last so that an
   * escaped entity like `&amp;lt;` survives as text rather than turning into
   * a bracket.
   */
  private stripHtml(s: string): string {
    return (
      s
        .replace(/<br\s*\/?>/gi, ' ')
        // Block boundaries always become a space, so "</p><p>" cannot fuse the
        // words either side of it.
        .replace(
          /<\/?(?:p|div|li|ul|ol|h[1-6]|table|tr|td|th|blockquote|section|article)\b[^>]*>/gi,
          ' ',
        )
        // What is left is inline. Dropping it keeps "<b>Bold</b>ed" and
        // "<i>Positioning</i>—note" whole, but the same rule would turn
        // "end.<i>Next" into "end.Next", so a sentence boundary hiding behind
        // markup becomes a space instead.
        .replace(
          /(?:<[^>]*>)+/g,
          (run: string, offset: number, whole: string) =>
            /[.!?]/.test(whole[offset - 1] ?? '') &&
            /[A-Z0-9"'(]/.test(whole[offset + run.length] ?? '')
              ? ' '
              : '',
        )
        .replace(/&#x([0-9a-f]+);/gi, (m, hex) => this.codePoint(hex, 16, m))
        .replace(/&#(\d+);/g, (m, dec) => this.codePoint(dec, 10, m))
        .replace(/&nbsp;/gi, ' ')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /** Decodes one numeric character reference, leaving malformed ones as-is. */
  private codePoint(value: string, radix: number, original: string): string {
    const n = parseInt(value, radix);
    if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return original;
    try {
      return String.fromCodePoint(n);
    } catch {
      return original;
    }
  }

  private formatRuntime(raw: string | null): string | null {
    if (!raw) return null;
    // HH:MM:SS format stored in DB (e.g. "05:33:36")
    const hms = raw.match(/^(\d+):(\d{2}):\d{2}$/);
    if (hms) {
      const hours = parseInt(hms[1], 10);
      const mins = parseInt(hms[2], 10);
      if (hours && mins) return `(${hours} hours ${mins} min.)`;
      if (hours) return `(${hours} hours)`;
      if (mins) return `(${mins} min.)`;
      return null;
    }
    // Fallback: text format like "7 hrs 32 mins"
    const h = raw.match(/(\d+)\s*hr/i);
    const m = raw.match(/(\d+)\s*min/i);
    if (!h && !m) return null;
    const hours = h ? parseInt(h[1], 10) : 0;
    const mins = m ? parseInt(m[1], 10) : 0;
    if (hours && mins) return `(${hours} hours ${mins} min.)`;
    if (hours) return `(${hours} hours)`;
    return `(${mins} min.)`;
  }

  private buildStyles(): Record<string, any> {
    return {
      // lineHeight 1 keeps the 72pt line box tight to the glyphs, so the rule
      // between AUDIO and LEARNING sits in the gap instead of across the text.
      coverTitle: {
        fontSize: 72,
        bold: true,
        color: '#111111',
        lineHeight: 1,
      },
      coverYear: { fontSize: 16, color: '#333333', margin: [0, 10, 0, 0] },
      bodyText: { fontSize: 8.5, color: '#222222' },
    };
  }
}
