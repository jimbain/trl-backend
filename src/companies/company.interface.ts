import { CompanyLoginEnumType, Media } from 'src/constants';

export interface CompanyContact {
  name: string;
  phone: string;
  email: string;
  responsibility: string[];
}

export interface CachedCompany {
  id: string;
  name: string;
  logo_url: string | null;
  domain: string | null;
  description: string | null;
  login_type: CompanyLoginEnumType;
  available_medias: Media[];
  sso_config: Record<string, any> | null;
  available_credits: number;
  category_ids: {
    audio: string[];
    video: string[];
    pharma: string[];
  };
  app_configs: Record<string, string> | null;
}
