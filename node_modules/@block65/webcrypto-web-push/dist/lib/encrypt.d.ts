import type { PushSubscription } from './types.js';
export type EncryptOptions = {
    pad?: boolean;
};
export declare function encryptNotification(subscription: PushSubscription, plaintext: Uint8Array, options?: EncryptOptions): Promise<Uint8Array<ArrayBuffer>>;
