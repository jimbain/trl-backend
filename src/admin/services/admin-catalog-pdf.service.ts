import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { Category } from 'src/categories/entities/category.entity';
import { CatalogService } from 'src/catalog/catalog.service';
import { Media } from 'src/constants';

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
    const content: any[] = [
      this.buildCoverPage(mediaType),
      { text: '', pageBreak: 'after' },
      this.buildTocPage(categories),
      { text: '', pageBreak: 'after' },
      ...categories.map((cat, i) => this.buildCategorySection(cat, i === 0, i)),
    ];

    content.push(this.buildAuthorIndex(categories));

    const docDef: Record<string, any> = {
      pageSize: 'LETTER',
      pageMargins: [40, 60, 40, 54],
      defaultStyle: { font: 'Helvetica', fontSize: 8.5, lineHeight: 1.3 },

      background: (
        currentPage: number,
        pageSize: { width: number; height: number },
      ) => {
        if (currentPage !== 1) return null;
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

      header: (currentPage: number) => {
        if (currentPage === 1) return {};
        return {
          margin: [40, 10, 40, 0],
          columns: [
            { text: '', width: '*' },
            {
              text: 'TRL Audiobooks',
              alignment: 'center',
              fontSize: 7.5,
              color: '#666666',
            },
            { text: '', width: '*' },
          ],
        };
      },

      footer: (currentPage: number) => {
        if (currentPage <= 2) return {};
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
              text: String(currentPage - 2),
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
        { text: '', margin: [0, 90, 0, 0] },
        { text: topLabel, style: 'coverTitle' },
        {
          canvas: [
            {
              type: 'line',
              x1: 40,
              y1: 0,
              x2: 440,
              y2: 0,
              lineWidth: 5,
              lineColor: '#CC0000',
            },
          ],
          margin: [0, 6, 0, 6],
        },
        { text: 'LEARNING', style: 'coverTitle' },
        { text: '', margin: [0, 60, 0, 0] },
        { text: 'T · R · L', style: 'coverLogo' },
        { text: year, style: 'coverYear' },
      ],
      alignment: 'center',
    };
  }

  private buildTocPage(categories: CategoryWithTitles[]): any {
    return {
      stack: [
        this.headerBar('TRL AUDIOBOOK LIBRARY'),
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
                { text: 'Email:', bold: true, fontSize: 8 },
                { text: 'info@TRLonline.com', fontSize: 8 },
              ],
              [
                { text: 'Web:', bold: true, fontSize: 8 },
                { text: 'www.TrainingResourceLibrary.com', fontSize: 8 },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 16],
        },
        this.headerBar('TABLE OF CONTENTS'),
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

  private buildCategorySection(
    cat: CategoryWithTitles,
    isFirst: boolean,
    catIndex: number,
  ): any {
    const leftTitles = cat.titles.filter((_, i) => i % 2 === 0);
    const rightTitles = cat.titles.filter((_, i) => i % 2 === 1);

    return {
      stack: [
        this.headerBarWithId(cat.name.toUpperCase(), `cat_${catIndex}`),
        {
          columns: [
            { width: '48%', stack: leftTitles.map((t) => this.titleEntry(t)) },
            { width: '4%', text: '' },
            { width: '48%', stack: rightTitles.map((t) => this.titleEntry(t)) },
          ],
        },
      ],
      ...(isFirst ? {} : { pageBreak: 'before' }),
    };
  }

  private titleEntry(t: TitleRow): any {
    const stack: any[] = [
      {
        text: (t.title ?? '').toUpperCase(),
        bold: true,
        fontSize: 8,
        margin: [0, 6, 0, 1],
      },
    ];

    if (t.authors.length > 0) {
      stack.push({
        text: `by ${t.authors.join(', ')}`,
        italics: true,
        fontSize: 7.5,
        color: '#555555',
        margin: [0, 0, 0, 2],
      });
    }

    const rawDesc = t.short_description?.trim() || t.description;
    const desc = rawDesc ? this.stripHtml(rawDesc) : null;
    if (desc) {
      const clipped = desc.length > 400 ? desc.slice(0, 400) + '…' : desc;
      const rtStr = this.formatRuntime(t.runtime);
      const fullDesc = rtStr ? `${clipped} ${rtStr}` : clipped;
      stack.push({
        text: fullDesc,
        fontSize: 7,
        color: '#333333',
        margin: [0, 0, 0, 2],
      });
    }

    const copyrightParts = [t.copyright, t.publisher].filter(Boolean);
    if (copyrightParts.length > 0) {
      stack.push({
        text: copyrightParts.join(' — '),
        fontSize: 6.5,
        color: '#888888',
        margin: [0, 0, 0, 4],
      });
    }

    return { stack, unbreakable: true };
  }

  private buildAuthorIndex(categories: CategoryWithTitles[]): any {
    const entries: {
      authorDisplay: string;
      lastName: string;
      title: string;
      catIndex: number;
    }[] = [];

    categories.forEach((cat, ci) => {
      cat.titles.forEach((t) => {
        const author = t.authors[0] ?? 'Unknown';
        const lastName = author.split(' ').pop() ?? author;
        entries.push({
          authorDisplay: author,
          lastName,
          title: t.title,
          catIndex: ci,
        });
      });
    });

    entries.sort((a, b) => a.lastName.localeCompare(b.lastName));

    const leftEntries = entries.filter((_, i) => i % 2 === 0);
    const rightEntries = entries.filter((_, i) => i % 2 === 1);

    return {
      stack: [
        this.headerBar('AUTHOR INDEX'),
        {
          columns: [
            {
              width: '48%',
              stack: leftEntries.map((e) => this.authorEntry(e)),
            },
            { width: '4%', text: '' },
            {
              width: '48%',
              stack: rightEntries.map((e) => this.authorEntry(e)),
            },
          ],
        },
      ],
      pageBreak: 'before',
    };
  }

  private authorEntry(e: {
    authorDisplay: string;
    title: string;
    catIndex: number;
  }): any {
    return {
      columns: [
        {
          text: `${e.authorDisplay} — ${e.title}`,
          fontSize: 7,
          width: '*',
          margin: [0, 1, 0, 1],
        },
        {
          text: [{ pageReference: `cat_${e.catIndex}` }],
          fontSize: 7,
          width: 20,
          alignment: 'right',
          margin: [0, 1, 0, 1],
        },
      ],
    };
  }

  private headerBar(text: string): any {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text,
              color: 'white',
              bold: true,
              alignment: 'center',
              fontSize: 9,
              margin: [0, 3, 0, 3],
              fillColor: DARK_BLUE,
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 6],
    };
  }

  private headerBarWithId(text: string, id: string): any {
    const bar = this.headerBar(text);
    bar.id = id;
    return bar;
  }

  private stripHtml(s: string): string {
    return s
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatRuntime(raw: string | null): string | null {
    if (!raw) return null;
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
      coverTitle: { fontSize: 72, bold: true, color: '#111111' },
      coverLogo: {
        fontSize: 36,
        bold: true,
        color: '#111111',
        margin: [0, 0, 0, 8],
      },
      coverYear: { fontSize: 16, color: '#333333', margin: [0, 10, 0, 0] },
      bodyText: { fontSize: 8.5, color: '#222222' },
    };
  }
}
