import type { PushSubscription } from './types.js';
export type VapidKeys = {
    subject: string | undefined;
    publicKey: string | undefined;
    privateKey: string | undefined;
};
export declare function vapidHeaders(subscription: PushSubscription, vapid: VapidKeys): Promise<{
    headers: {
        authorization: string;
    };
}>;
