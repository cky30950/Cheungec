type JsonPrimitive = string | number | boolean | null;
type Jsonifiable = JsonPrimitive | {
    toJSON(): Jsonifiable;
} | readonly Jsonifiable[] | {
    [key: string]: Jsonifiable;
};
type RequireAtLeastOne<T> = {
    [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];
export type PushMessage<T extends Jsonifiable = Jsonifiable> = {
    data: T;
    options?: RequireAtLeastOne<{
        ttl?: number;
        topic?: string;
        urgency?: 'low' | 'normal' | 'high';
    }>;
};
export type PushSubscription = {
    endpoint: string;
    /** DOMHighResTimeStamp */
    expirationTime: number | null;
    keys: {
        auth: string;
        p256dh: string;
    };
};
export {};
