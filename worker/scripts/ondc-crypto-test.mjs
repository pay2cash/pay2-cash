// Validate the ONDC crypto end-to-end BEFORE porting to the worker:
//  1. pure-JS AES-256-ECB decrypt vs NIST FIPS-197 vector
//  2. pure-JS AES-256-ECB decrypt vs Node's aes-256-ecb (round-trip)
//  3. X25519 shared secret (our enc priv + ONDC pre-prod pub) → AES key → decrypt
//  4. Ed25519 sign request_id with the supplied signing_private_key, verify with pub
import crypto from "node:crypto";

// ---------- pure-JS AES (decrypt, ECB) — same code we'll ship in the worker ----------
function gmul(a, b) {
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
(function () {
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
function keyExpansion(key) {
  const Nk = 8,
    Nr = 14;
  const w = new Array(4 * (Nr + 1));
  for (let i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
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
function decryptBlock(inb, w) {
  const Nr = 14;
  const s = inb.slice(0, 16);
  const addRoundKey = (round) => {
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
function aes256EcbDecrypt(cipher, key, stripPad = true) {
  const w = keyExpansion(key);
  const out = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i += 16) out.set(decryptBlock(cipher.slice(i, i + 16), w), i);
  if (!stripPad) return out;
  const pad = out[out.length - 1];
  return pad >= 1 && pad <= 16 ? out.slice(0, out.length - pad) : out;
}

// ---------- tests ----------
const hex = (h) => Uint8Array.from(Buffer.from(h, "hex"));
let pass = 0,
  fail = 0;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  cond ? pass++ : fail++;
};

// 1. NIST FIPS-197 AES-256 vector (no padding)
{
  const key = hex("603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4");
  const ct = hex("f3eed1bdb5d2a03c064b5a7e3db181f8");
  const pt = aes256EcbDecrypt(ct, key, false);
  check("AES-256-ECB NIST vector", Buffer.from(pt).toString("hex") === "6bc1bee22e409f96e93d7e117393172a");
}

// 2. round-trip vs Node aes-256-ecb (with PKCS7 padding)
{
  const key = crypto.randomBytes(32);
  const msg = "ondc-challenge-" + crypto.randomUUID();
  const c = crypto.createCipheriv("aes-256-ecb", key, null);
  const ct = Buffer.concat([c.update(msg, "utf8"), c.final()]);
  const pt = aes256EcbDecrypt(new Uint8Array(ct), new Uint8Array(key));
  check("AES-256-ECB round-trip vs Node", Buffer.from(pt).toString("utf8") === msg);
}

// 3. X25519 shared secret (our enc priv + ONDC pre-prod pub) → decrypt a simulated challenge
const ONDC_PREPROD_PUB = "MCowBQYDK2VuAyEAa9Wbpvd9SsrpOZFcynyt/TO3x0Yrqyys4NUGIvyxX2Q=";
const ourEncPriv = "MC4CAQAwBQYDK2VuBCIEIHiXYjVg5BnIpfS1nfZTLadz7UvpUUslDrPT4kzFfiNq";
{
  const priv = crypto.createPrivateKey({ key: Buffer.from(ourEncPriv, "base64"), format: "der", type: "pkcs8" });
  const pub = crypto.createPublicKey({ key: Buffer.from(ONDC_PREPROD_PUB, "base64"), format: "der", type: "spki" });
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: pub }); // 32 bytes
  console.log("  X25519 shared secret (hex):", shared.toString("hex"));
  // ONDC encrypts the challenge with this same shared secret (ECDH symmetry).
  const challenge = "the-quick-brown-fox-" + crypto.randomUUID();
  const c = crypto.createCipheriv("aes-256-ecb", shared, null);
  const enc = Buffer.concat([c.update(challenge, "utf8"), c.final()]).toString("base64");
  const dec = Buffer.from(aes256EcbDecrypt(Uint8Array.from(Buffer.from(enc, "base64")), new Uint8Array(shared))).toString("utf8");
  check("X25519 + AES-ECB decrypt of simulated challenge", dec === challenge);
}

// 4. Ed25519 sign request_id with supplied signing_private_key (libsodium 64B) + verify
const SIGNING_PRIV_64 = "o3e7u8rqAxuF7xN0D2S5Zd5GgWChPQ0S611jLpfZiSJQuc4SUa5cdFmaYbfQY8xlnkfn3JqN7lfBMU8DzhmJBg==";
const SIGNING_PUB = "ULnOElGuXHRZmmG30GPMZZ5H59yaje5XwTFPA84ZiQY=";
{
  const seed = Buffer.from(SIGNING_PRIV_64, "base64").subarray(0, 32); // libsodium secret = seed||pub
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const sk = crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const request_id = crypto.randomUUID();
  const sig = crypto.sign(null, Buffer.from(request_id, "utf8"), sk);
  const pkRaw = Buffer.from(SIGNING_PUB, "base64");
  const pkDer = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pkRaw]);
  const pk = crypto.createPublicKey({ key: pkDer, format: "der", type: "spki" });
  const ok = crypto.verify(null, Buffer.from(request_id, "utf8"), pk, sig);
  check("Ed25519 sign+verify with supplied keys", ok);
  // derived pub from priv must match supplied pub (sanity)
  const derivedPub = crypto.createPublicKey(sk).export({ type: "spki", format: "der" }).subarray(12).toString("base64");
  check("supplied signing pub matches private", derivedPub === SIGNING_PUB);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
