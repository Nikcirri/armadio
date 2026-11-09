/** Byte -> base64, a blocchi da 32 KB per non superare il limite di argomenti di String.fromCharCode. */
export function u8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
