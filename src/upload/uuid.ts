const uuidRandomByteCount = 10;

export function uuidV7(unixMilliseconds: number, random: Uint8Array): string {
  if (random.length < uuidRandomByteCount) {
    throw new RangeError(`uuidV7 needs ${uuidRandomByteCount} random bytes, got ${random.length}`);
  }
  const bytes = new Uint8Array(16);
  let time = unixMilliseconds;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes.set(random.subarray(0, uuidRandomByteCount), 6);
  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
