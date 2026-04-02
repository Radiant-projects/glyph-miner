// KangarooTwelve (K12) mining shader — correct 64-bit Keccak-p[1600,12]
// State: 25 lanes x 64 bits = 50 u32s. Lane i = (state[2i], state[2i+1]) = (lo, hi)
// Mining canonical preimage: K12(prefix64 || nonce64), where nonce64 is
// nonce LE u32 in low word and zero high word.

@group(0) @binding(0) var<storage, read> midstate: array<u32>;
@group(0) @binding(1) var<storage, read> mining_target: array<u32>;
@group(0) @binding(2) var<storage, read_write> results: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read> nonce_offset: array<u32>;

// 64-bit left rotation via u32 pair
fn rotl64(lo: u32, hi: u32, n: u32) -> vec2<u32> {
    if (n == 0u) { return vec2<u32>(lo, hi); }
    if (n < 32u) {
        return vec2<u32>((lo << n) | (hi >> (32u - n)), (hi << n) | (lo >> (32u - n)));
    }
    if (n == 32u) { return vec2<u32>(hi, lo); }
    let m = n - 32u;
    return vec2<u32>((hi << m) | (lo >> (32u - m)), (lo << m) | (hi >> (32u - m)));
}

// Round constants for Keccak-p[1600,12] (rounds 12-23), each as (lo, hi)
fn get_rc(round: u32) -> vec2<u32> {
    switch(round) {
        case 0u:  { return vec2<u32>(0x8000808Bu, 0x00000000u); }
        case 1u:  { return vec2<u32>(0x0000008Bu, 0x80000000u); }
        case 2u:  { return vec2<u32>(0x00008089u, 0x80000000u); }
        case 3u:  { return vec2<u32>(0x00008003u, 0x80000000u); }
        case 4u:  { return vec2<u32>(0x00008002u, 0x80000000u); }
        case 5u:  { return vec2<u32>(0x00000080u, 0x80000000u); }
        case 6u:  { return vec2<u32>(0x0000800Au, 0x00000000u); }
        case 7u:  { return vec2<u32>(0x8000000Au, 0x80000000u); }
        case 8u:  { return vec2<u32>(0x80008081u, 0x80000000u); }
        case 9u:  { return vec2<u32>(0x00008080u, 0x80000000u); }
        case 10u: { return vec2<u32>(0x80000001u, 0x00000000u); }
        case 11u: { return vec2<u32>(0x80008008u, 0x80000000u); }
        default:  { return vec2<u32>(0u, 0u); }
    }
}

fn keccak_p12(state: ptr<function, array<u32, 50>>) {
    for (var round = 0u; round < 12u; round = round + 1u) {
        // Theta: column parity
        var c: array<vec2<u32>, 5>;
        for (var x = 0u; x < 5u; x = x + 1u) {
            let i0 = x * 2u; let i1 = (x + 5u) * 2u; let i2 = (x + 10u) * 2u;
            let i3 = (x + 15u) * 2u; let i4 = (x + 20u) * 2u;
            c[x] = vec2<u32>(
                (*state)[i0] ^ (*state)[i1] ^ (*state)[i2] ^ (*state)[i3] ^ (*state)[i4],
                (*state)[i0+1u] ^ (*state)[i1+1u] ^ (*state)[i2+1u] ^ (*state)[i3+1u] ^ (*state)[i4+1u]);
        }
        for (var x = 0u; x < 5u; x = x + 1u) {
            let r = rotl64(c[(x + 1u) % 5u].x, c[(x + 1u) % 5u].y, 1u);
            let d_lo = c[(x + 4u) % 5u].x ^ r.x;
            let d_hi = c[(x + 4u) % 5u].y ^ r.y;
            for (var y = 0u; y < 5u; y = y + 1u) {
                let idx = (x + y * 5u) * 2u;
                (*state)[idx] ^= d_lo; (*state)[idx + 1u] ^= d_hi;
            }
        }
        // Rho + Pi combined (hardcoded permutation table)
        var t: array<u32, 50>;
        for (var i = 0u; i < 50u; i = i + 1u) { t[i] = (*state)[i]; }
        var r: vec2<u32>;
        (*state)[0u] = t[0u]; (*state)[1u] = t[1u]; // B[0]=ROT(A[0],0)
        r = rotl64(t[12u], t[13u], 44u); (*state)[2u] = r.x; (*state)[3u] = r.y;
        r = rotl64(t[24u], t[25u], 43u); (*state)[4u] = r.x; (*state)[5u] = r.y;
        r = rotl64(t[36u], t[37u], 21u); (*state)[6u] = r.x; (*state)[7u] = r.y;
        r = rotl64(t[48u], t[49u], 14u); (*state)[8u] = r.x; (*state)[9u] = r.y;
        r = rotl64(t[6u], t[7u], 28u); (*state)[10u] = r.x; (*state)[11u] = r.y;
        r = rotl64(t[18u], t[19u], 20u); (*state)[12u] = r.x; (*state)[13u] = r.y;
        r = rotl64(t[20u], t[21u], 3u); (*state)[14u] = r.x; (*state)[15u] = r.y;
        r = rotl64(t[32u], t[33u], 45u); (*state)[16u] = r.x; (*state)[17u] = r.y;
        r = rotl64(t[44u], t[45u], 61u); (*state)[18u] = r.x; (*state)[19u] = r.y;
        r = rotl64(t[2u], t[3u], 1u); (*state)[20u] = r.x; (*state)[21u] = r.y;
        r = rotl64(t[14u], t[15u], 6u); (*state)[22u] = r.x; (*state)[23u] = r.y;
        r = rotl64(t[26u], t[27u], 25u); (*state)[24u] = r.x; (*state)[25u] = r.y;
        r = rotl64(t[38u], t[39u], 8u); (*state)[26u] = r.x; (*state)[27u] = r.y;
        r = rotl64(t[40u], t[41u], 18u); (*state)[28u] = r.x; (*state)[29u] = r.y;
        r = rotl64(t[8u], t[9u], 27u); (*state)[30u] = r.x; (*state)[31u] = r.y;
        r = rotl64(t[10u], t[11u], 36u); (*state)[32u] = r.x; (*state)[33u] = r.y;
        r = rotl64(t[22u], t[23u], 10u); (*state)[34u] = r.x; (*state)[35u] = r.y;
        r = rotl64(t[34u], t[35u], 15u); (*state)[36u] = r.x; (*state)[37u] = r.y;
        r = rotl64(t[46u], t[47u], 56u); (*state)[38u] = r.x; (*state)[39u] = r.y;
        r = rotl64(t[4u], t[5u], 62u); (*state)[40u] = r.x; (*state)[41u] = r.y;
        r = rotl64(t[16u], t[17u], 55u); (*state)[42u] = r.x; (*state)[43u] = r.y;
        r = rotl64(t[28u], t[29u], 39u); (*state)[44u] = r.x; (*state)[45u] = r.y;
        r = rotl64(t[30u], t[31u], 41u); (*state)[46u] = r.x; (*state)[47u] = r.y;
        r = rotl64(t[42u], t[43u], 2u); (*state)[48u] = r.x; (*state)[49u] = r.y;
        // Chi
        for (var y = 0u; y < 5u; y = y + 1u) {
            var row: array<vec2<u32>, 5>;
            for (var x = 0u; x < 5u; x = x + 1u) {
                let idx = (x + y * 5u) * 2u;
                row[x] = vec2<u32>((*state)[idx], (*state)[idx + 1u]);
            }
            for (var x = 0u; x < 5u; x = x + 1u) {
                let idx = (x + y * 5u) * 2u;
                (*state)[idx] = row[x].x ^ (~row[(x+1u) % 5u].x & row[(x+2u) % 5u].x);
                (*state)[idx + 1u] = row[x].y ^ (~row[(x+1u) % 5u].y & row[(x+2u) % 5u].y);
            }
        }
        // Iota
        let rc = get_rc(round);
        (*state)[0u] ^= rc.x; (*state)[1u] ^= rc.y;
    }
}

fn bswap32(x: u32) -> u32 {
    return ((x & 0xFFu) << 24u) | ((x & 0xFF00u) << 8u) |
           ((x >> 8u) & 0xFF00u) | (x >> 24u);
}

fn check_mining_target(hash: array<u32, 8>) -> bool {
    if (hash[0u] != 0u) { return false; }
    let h1_be = bswap32(hash[1u]);
    let h2_be = bswap32(hash[2u]);
    if (h1_be < mining_target[1u]) { return true; }
    if (h1_be > mining_target[1u]) { return false; }
    if (h2_be < mining_target[2u]) { return true; }
    return false;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let nonce = nonce_offset[0u] + global_id.x;

    // Initialize 1600-bit state to zero
    var state: array<u32, 50>;
    for (var i = 0u; i < 50u; i = i + 1u) { state[i] = 0u; }

    // Absorb preimage (64 bytes = lanes 0-7, state[0..15])
    for (var i = 0u; i < 16u; i = i + 1u) { state[i] = midstate[i]; }

    // Absorb nonce64 (bytes 64-71)
    // bytes 64-67: nonce LE u32
    state[16u] = nonce;
    // bytes 68-71: zero high u32
    state[17u] = 0u;

    // K12 framing: length_encode(0) = {0x00} (1 byte, NOT {0x00,0x01})
    // K12 spec: K12(M,"") = TurboSHAKE128(M || 0x00 || 0x07, 0x07)
    // Message is now 72 bytes, so framing starts at byte72 (lane 9 low word)
    // byte72=0x00 (length_encode(0)), byte73=0x07 (K12 domain separator)
    state[18u] = 0x00000700u;

    // Final padding bit: 0x80 at byte 167 (last byte of rate=168)
    // byte 167 = lane 20 hi word, bits 24-31
    state[41u] = 0x80000000u;

    keccak_p12(&state);

    // Extract 32-byte hash (first 4 lanes)
    var hash: array<u32, 8>;
    for (var i = 0u; i < 8u; i = i + 1u) { hash[i] = state[i]; }

    // Debug mode for CPU/GPU parity checks.
    // Host sets mining_target[0] = 1 to request raw hash output from invocation 0.
    if (mining_target[0u] == 1u) {
        if (global_id.x == 0u) {
            atomicStore(&results[0], 1u);
            atomicStore(&results[4u], nonce);
            for (var i = 0u; i < 8u; i = i + 1u) {
                atomicStore(&results[5u + i], hash[i]);
            }
        }
        return;
    }

    if (check_mining_target(hash)) {
        let idx = atomicAdd(&results[0], 1u);
        if (idx < 255u) {
            let base = (idx + 1u) * 4u;
            atomicStore(&results[base], nonce);
            atomicStore(&results[base + 1u], hash[0u]);
            atomicStore(&results[base + 2u], hash[1u]);
            atomicStore(&results[base + 3u], 1u);
        }
    }
}
