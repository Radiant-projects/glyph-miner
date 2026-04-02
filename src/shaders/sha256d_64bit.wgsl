@group(0) @binding(0) var<storage, read> m: array<u32>;
@group(0) @binding(1) var<storage, read> nonce: array<u32>; // 2 u32s: [low32, high32]
@group(0) @binding(2) var<storage, read_write> results: array<atomic<u32>>;

const k = array<u32, 64> (
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
);

const h = array<u32, 8> (
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
);

fn rotr(a: u32, b: u32) -> u32{ return (a >> b) | (a << (32 - b)); }
fn ch(a: u32, b: u32, c: u32) -> u32{ return (a & b) ^ (~a & c); }
fn maj(c: u32, a: u32, b: u32) -> u32{ return (a & b) ^ (a & c) ^ (b & c); }
fn S0(x: u32) -> u32{ return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22); }
fn S1(x: u32) -> u32{ return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25); }
fn s0(x: u32) -> u32{ return rotr(x, 7) ^ rotr(x, 18) ^ (x >> 3); }
fn s1(x: u32) -> u32{ return rotr(x, 17) ^ rotr(x, 19) ^ (x >> 10); }

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  var v = array<u32, 8>();
  var w = array<u32, 64>();

  v[2] = m[0];
  v[3] = m[1];
  v[4] = m[2];
  v[1] = m[3];
  v[0] = m[4];
  v[6] = m[5];
  v[7] = m[6];
  v[5] = m[7];

  // 64-bit nonce: combine low part with invocation ID, preserve high part
  let nonceLow = nonce[0] + id.x;
  let nonceHigh = nonce[1];
  
  w[0] = nonceLow;
  v[2] += w[0];
  v[2] += S1(v[1]);
  v[2] += ch(v[1], v[4], v[3]);
  v[2] += k[0];
  v[0] += v[2];
  v[2] += S0(v[5]);
  v[2] += maj(v[6], v[5], v[7]);

  w[1] = 0x80000000;
  v[3] += w[1];
  v[3] += S1(v[0]);
  v[3] += ch(v[0], v[1], v[4]);
  v[3] += k[1];
  v[6] += v[3];
  v[3] += S0(v[2]);
  v[3] += maj(v[7], v[2], v[5]);

  w[2] = 0;
  v[4] += w[2];
  v[4] += S1(v[6]);
  v[4] += ch(v[6], v[0], v[1]);
  v[4] += k[2];
  v[7] += v[4];
  v[4] += S0(v[3]);
  v[4] += maj(v[5], v[3], v[2]);

  w[3] = 0;
  v[1] += w[3];
  v[1] += S1(v[7]);
  v[1] += ch(v[7], v[6], v[0]);
  v[1] += k[3];
  v[5] += v[1];
  v[1] += S0(v[4]);
  v[1] += maj(v[2], v[4], v[3]);

  w[4] = 0;
  v[0] += w[4];
  v[0] += S1(v[5]);
  v[0] += ch(v[5], v[7], v[6]);
  v[0] += k[4];
  v[2] += v[0];
  v[0] += S0(v[1]);
  v[0] += maj(v[3], v[1], v[4]);

  w[5] = 0;
  v[6] += w[5];
  v[6] += S1(v[2]);
  v[6] += ch(v[2], v[5], v[7]);
  v[6] += k[5];
  v[3] += v[6];
  v[6] += S0(v[0]);
  v[6] += maj(v[4], v[0], v[1]);

  w[6] = 0;
  v[7] += w[6];
  v[7] += S1(v[3]);
  v[7] += ch(v[3], v[2], v[5]);
  v[7] += k[6];
  v[4] += v[7];
  v[7] += S0(v[6]);
  v[7] += maj(v[1], v[6], v[0]);

  w[7] = 0;
  v[5] += w[7];
  v[5] += S1(v[4]);
  v[5] += ch(v[4], v[3], v[2]);
  v[5] += k[7];
  v[0] += v[5];
  v[5] += S0(v[7]);
  v[5] += maj(v[1], v[7], v[6]);

  w[8] = 0;
  v[1] += w[8];
  v[1] += S1(v[0]);
  v[1] += ch(v[0], v[4], v[3]);
  v[1] += k[8];
  v[6] += v[1];
  v[1] += S0(v[5]);
  v[1] += maj(v[2], v[5], v[7]);

  w[9] = 0;
  v[2] += w[9];
  v[2] += S1(v[6]);
  v[2] += ch(v[6], v[0], v[4]);
  v[2] += k[9];
  v[3] += v[2];
  v[2] += S0(v[1]);
  v[2] += maj(v[7], v[1], v[5]);

  w[10] = 0;
  v[3] += w[10];
  v[3] += S1(v[2]);
  v[3] += ch(v[2], v[6], v[0]);
  v[3] += k[10];
  v[4] += v[3];
  v[3] += S0(v[2]);
  v[3] += maj(v[5], v[2], v[6]);

  w[11] = 0;
  v[4] += w[11];
  v[4] += S1(v[3]);
  v[4] += ch(v[3], v[2], v[6]);
  v[4] += k[11];
  v[5] += v[4];
  v[4] += S0(v[3]);
  v[4] += maj(v[6], v[3], v[2]);

  w[12] = 0;
  v[5] += w[12];
  v[5] += S1(v[4]);
  v[5] += ch(v[4], v[3], v[2]);
  v[5] += k[12];
  v[6] += v[5];
  v[5] += S0(v[4]);
  v[5] += maj(v[7], v[4], v[3]);

  w[13] = 0;
  v[6] += w[13];
  v[6] += S1(v[5]);
  v[6] += ch(v[5], v[4], v[3]);
  v[6] += k[13];
  v[7] += v[6];
  v[6] += S0(v[5]);
  v[6] += maj(v[1], v[6], v[4]);

  w[14] = 0;
  v[7] += w[14];
  v[7] += S1(v[6]);
  v[7] += ch(v[6], v[5], v[4]);
  v[7] += k[14];
  v[0] += v[7];
  v[7] += S0(v[6]);
  v[7] += maj(v[2], v[7], v[5]);

  w[15] = 640; // 64 bytes * 8 bits
  v[1] += w[15];
  v[1] += S1(v[7]);
  v[1] += ch(v[7], v[6], v[5]);
  v[1] += k[15];
  v[2] += v[1];
  v[1] += S0(v[7]);
  v[1] += maj(v[3], v[7], v[6]);

  // Extend message schedule
  for (var i: u32 = 16; i < 64; i = i + 1) {
    w[i] = s1(w[i - 2]) + w[i - 7] + s0(w[i - 15]) + w[i - 16];
  }

  // Second round
  v[3] += w[16];
  v[3] += S1(v[2]);
  v[3] += ch(v[2], v[0], v[1]);
  v[3] += k[16];
  v[6] += v[3];
  v[3] += S0(v[1]);
  v[3] += maj(v[5], v[1], v[7]);

  v[4] += w[17];
  v[4] += S1(v[3]);
  v[4] += ch(v[3], v[2], v[0]);
  v[4] += k[17];
  v[7] += v[4];
  v[4] += S0(v[2]);
  v[4] += maj(v[6], v[2], v[1]);

  v[5] += w[18];
  v[5] += S1(v[4]);
  v[5] += ch(v[4], v[3], v[2]);
  v[5] += k[18];
  v[0] += v[5];
  v[5] += S0(v[3]);
  v[5] += maj(v[7], v[3], v[2]);

  v[6] += w[19];
  v[6] += S1(v[5]);
  v[6] += ch(v[5], v[4], v[3]);
  v[6] += k[19];
  v[1] += v[6];
  v[6] += S0(v[4]);
  v[6] += maj(v[1], v[4], v[3]);

  v[7] += w[20];
  v[7] += S1(v[6]);
  v[7] += ch(v[6], v[5], v[4]);
  v[7] += k[20];
  v[2] += v[7];
  v[7] += S0(v[5]);
  v[7] += maj(v[2], v[5], v[4]);

  v[0] += w[21];
  v[0] += S1(v[7]);
  v[0] += ch(v[7], v[6], v[5]);
  v[0] += k[21];
  v[3] += v[0];
  v[0] += S0(v[6]);
  v[0] += maj(v[3], v[6], v[5]);

  v[1] += w[22];
  v[1] += S1(v[0]);
  v[1] += ch(v[0], v[7], v[6]);
  v[1] += k[22];
  v[4] += v[1];
  v[1] += S0(v[7]);
  v[1] += maj(v[4], v[7], v[6]);

  v[2] += w[23];
  v[2] += S1(v[1]);
  v[2] += ch(v[1], v[0], v[7]);
  v[2] += k[23];
  v[5] += v[2];
  v[2] += S0(v[0]);
  v[2] += maj(v[5], v[0], v[7]);

  v[3] += w[24];
  v[3] += S1(v[2]);
  v[3] += ch(v[2], v[1], v[0]);
  v[3] += k[24];
  v[6] += v[3];
  v[3] += S0(v[1]);
  v[3] += maj(v[6], v[1], v[0]);

  v[4] += w[25];
  v[4] += S1(v[3]);
  v[4] += ch(v[3], v[2], v[1]);
  v[4] += k[25];
  v[7] += v[4];
  v[4] += S0(v[2]);
  v[4] += maj(v[7], v[2], v[1]);

  v[5] += w[26];
  v[5] += S1(v[4]);
  v[5] += ch(v[4], v[3], v[2]);
  v[5] += k[26];
  v[0] += v[5];
  v[5] += S0(v[3]);
  v[5] += maj(v[1], v[3], v[2]);

  v[6] += w[27];
  v[6] += S1(v[5]);
  v[6] += ch(v[5], v[4], v[3]);
  v[6] += k[27];
  v[1] += v[6];
  v[6] += S0(v[4]);
  v[6] += maj(v[2], v[4], v[3]);

  v[7] += w[28];
  v[7] += S1(v[6]);
  v[7] += ch(v[6], v[5], v[4]);
  v[7] += k[28];
  v[2] += v[7];
  v[7] += S0(v[5]);
  v[7] += maj(v[3], v[5], v[4]);

  v[0] += w[29];
  v[0] += S1(v[7]);
  v[0] += ch(v[7], v[6], v[5]);
  v[0] += k[29];
  v[3] += v[0];
  v[0] += S0(v[6]);
  v[0] += maj(v[4], v[6], v[5]);

  v[1] += w[30];
  v[1] += S1(v[0]);
  v[1] += ch(v[0], v[7], v[6]);
  v[1] += k[30];
  v[4] += v[1];
  v[1] += S0(v[7]);
  v[1] += maj(v[5], v[7], v[6]);

  v[2] += w[31];
  v[2] += S1(v[1]);
  v[2] += ch(v[1], v[0], v[7]);
  v[2] += k[31];
  v[5] += v[2];
  v[2] += S0(v[0]);
  v[2] += maj(v[6], v[0], v[7]);

  // Check if hash meets target (simplified target check)
  // This would need proper target comparison in practice
  if (v[0] == 0 && v[1] == 0 && v[2] == 0 && v[3] == 0) {
    // Store result: [nonceLow, nonceHigh, hash_parts...]
    let index = atomicAdd(&results[0], 1u);
    if (index < 255u) {
      atomicStore(&results[index * 4 + 1], nonceLow);
      atomicStore(&results[index * 4 + 2], nonceHigh);
      atomicStore(&results[index * 4 + 3], v[4]); // Additional hash data for verification
    }
  }
}
