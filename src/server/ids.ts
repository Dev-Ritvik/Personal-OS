/**
 * UUIDv7 generator (RFC 9562): time-sortable ids, no dependencies.
 * Layout: unix_ms(48) | ver(4)=0111 | rand_a(12) | var(2)=10 | rand_b(62)
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const tsHi = Math.floor(now / 2 ** 24);
  const tsLo = now % 2 ** 24;

  bytes[0] = Number((tsHi / 2 ** 16) & 0xff);
  bytes[1] = Number((tsHi / 2 ** 8) & 0xff);
  bytes[2] = Number(tsHi & 0xff);
  bytes[3] = Number((tsLo / 2 ** 32) & 0xff);
  bytes[4] = Number((tsLo / 2 ** 24) & 0xff);
  bytes[5] = Number((tsLo / 2 ** 16) & 0xff);
  bytes[6] = Number(((tsLo / 2 ** 8) & 0x0f) | 0x70); // version 7
  bytes[7] = Number(tsLo & 0xff);
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
