export declare function generateLocalKeys(): Promise<{
    privateKey: CryptoKey;
    publicKeyBytes: Uint8Array<ArrayBuffer>;
}>;
