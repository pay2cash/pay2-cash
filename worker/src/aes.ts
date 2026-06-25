// AES-256-ECB decryption (pure TS) — WebCrypto has no ECB mode, and ONDC encrypts
// the /on_subscribe challenge with aes-256-ecb. Validated against the FIPS-197
// AES-256 test vector and Node's aes-256-ecb (see scripts/ondc-crypto-test.mjs).

function gmul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

const SBOX = new Uint8Array(256);
const INV = new Uint8Array(256);
(function buildTables() {
  const invtab = new Uint8Array(256);
  for (let i = 1; i < 256; i++)
    for (let j = 1; j < 256; j++)
      if (gmul(i, j) === 1) {
        invtab[i] = j;
        break;
      }
  for (let i = 0; i < 256; i++) {
    let x = invtab[i];
    let s = x;
    for (let k = 0; k < 4; k++) {
      x = ((x << 1) | (x >> 7)) & 0xff;
      s ^= x;
    }
    s ^= 0x63;
    SBOX[i] = s;
    INV[s] = i;
  }
})();

function keyExpansion(key: Uint8Array): number[][] {
  const Nk = 8,
    Nr = 14;
  const w: number[][] = new Array(4 * (Nr + 1));
  for (let i = 0; i < Nk; i++)
    w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
  let rcon = 1;
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let t = w[i - 1].slice();
    if (i % Nk === 0) {
      t = [t[1], t[2], t[3], t[0]].map((b) => SBOX[b]);
      t[0] ^= rcon;
      rcon = gmul(rcon, 2);
    } else if (i % Nk === 4) {
      t = t.map((b) => SBOX[b]);
    }
    w[i] = w[i - Nk].map((b, j) => b ^ t[j]);
  }
  return w;
}

function decryptBlock(inb: Uint8Array, w: number[][]): Uint8Array {
  const Nr = 14;
  const s = inb.slice(0, 16);
  const addRoundKey = (round: number) => {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[r + 4 * c] ^= w[4 * round + c][r];
  };
  const invShiftRows = () => {
    const o = s.slice();
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) s[r + 4 * c] = o[r + 4 * ((c - r + 4) % 4)];
  };
  const invSubBytes = () => {
    for (let i = 0; i < 16; i++) s[i] = INV[s[i]];
  };
  const invMixColumns = () => {
    for (let c = 0; c < 4; c++) {
      const a0 = s[4 * c],
        a1 = s[4 * c + 1],
        a2 = s[4 * c + 2],
        a3 = s[4 * c + 3];
      s[4 * c] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
      s[4 * c + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
      s[4 * c + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
      s[4 * c + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
    }
  };
  addRoundKey(Nr);
  for (let round = Nr - 1; round >= 1; round--) {
    invShiftRows();
    invSubBytes();
    addRoundKey(round);
    invMixColumns();
  }
  invShiftRows();
  invSubBytes();
  addRoundKey(0);
  return s;
}

// Decrypt an AES-256-ECB ciphertext and strip PKCS7 padding.
export function aes256EcbDecrypt(cipher: Uint8Array, key: Uint8Array): Uint8Array {
  const w = keyExpansion(key);
  const out = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i += 16) out.set(decryptBlock(cipher.slice(i, i + 16), w), i);
  const pad = out[out.length - 1];
  return pad >= 1 && pad <= 16 ? out.slice(0, out.length - pad) : out;
}
