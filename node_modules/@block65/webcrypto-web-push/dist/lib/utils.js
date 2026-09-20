export function encodeRecordSize(size) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, size);
    return bytes;
}
export function invariant(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
