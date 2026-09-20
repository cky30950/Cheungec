export declare function hkdf(salt: BufferSource, ikm: BufferSource): Promise<{
    extract: (info: Uint8Array, len: number) => Promise<Uint8Array<ArrayBuffer>>;
}>;
