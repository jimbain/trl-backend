export interface JwtPayload {
  id: string | number;
  email: string;
  isRefreshToken: boolean;
}
