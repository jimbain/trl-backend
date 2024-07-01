export interface JwtPayload {
    id: string;
    email: string;
    isRefreshToken: boolean;
}
