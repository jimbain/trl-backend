export interface ElasticAudio {
  id: number;
  sku: string;
  title: string;
  description: string;
  authors: string[]; // array of author names
  author: string; // primary author name
  publisher: string;
  is_excluded: boolean;
  is_featured: boolean;
  is_active: boolean;
  is_for_sale: boolean;
  category: string; // primary category name
  category_ids: string[]; // array of category IDs
  ai_categories: string[];
  fa_retail_price: number;
  fa_retail_content_cost: number;
  bookshelf_credit_cost: number;
  purchased_rental_license_limit: number;
  total_rented: number;
  language: string;
  bisac_codes: string[]; // array of BISAC codes
  bisac_code: string;
  runtime: string;
  copyright: string;
  street_date: number; // Unix timestamp
  activated_at: number; // Unix timestamp
  curated_at: number; // Unix timestamp
}
