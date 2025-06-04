export interface MeiliAudio {
  id: number;
  sku: string;
  title: string;
  authors: string[]; // array of author names
  publisher: string;
  is_excluded: boolean;
  is_featured: boolean;
  is_active: boolean;
  categories: string[]; // array of category names
  first_category_name: string;
  fa_retail_price: number;
  fa_retail_content_cost: number;
  bookshelf_credit_cost: number;
  language: string;
  bisac_codes: string[]; // array of BISAC codes
  runtime: string;
  copyright: string;
  street_date: string; // 'YYYY-MM-DD'
  activated_at: string; // 'YYYY-MM-DD'
  curated_at: string; // 'YYYY-MM-DD'
}
