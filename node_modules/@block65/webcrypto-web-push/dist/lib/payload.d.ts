import type { PushMessage, PushSubscription } from './types.js';
import { type VapidKeys } from './vapid.js';
export declare function buildPushPayload(message: PushMessage, subscription: PushSubscription, vapid: VapidKeys): Promise<{
    headers: {
        authorization: string;
        ttl: string;
        urgency?: "high" | "low" | "normal";
        topic?: string;
        'content-encoding': string;
        'content-length': string;
        'content-type': string;
    };
    method: string;
    body: Uint8Array<ArrayBuffer>;
}>;
