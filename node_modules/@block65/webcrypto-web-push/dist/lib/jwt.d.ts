interface JwtPayload {
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    jti?: string;
    [key: string]: unknown;
}
export declare function sign(payload: JwtPayload, key: CryptoKey): Promise<string>;
export {};
