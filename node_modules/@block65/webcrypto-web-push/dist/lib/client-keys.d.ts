import type { PushSubscription } from './types.js';
export declare function deriveClientKeys(sub: PushSubscription): Promise<{
    publicKeyBytes: Uint8Array<ArrayBuffer>;
    publicKey: CryptoKey;
    authSecretBytes: Uint8Array<ArrayBuffer>;
}>;
