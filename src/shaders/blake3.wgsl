// Blake3 mining shader for Glyph mining
// Self-contained implementation without includes

@group(0) @binding(0) var<storage, read> midstate: array<u32>;
@group(0) @binding(1) var<storage, read> mining_target: array<u32>;
@group(0) @binding(2) var<storage, read_write> results: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read> nonce_offset: array<u32>;

// Blake3 IV constants
const IV0: u32 = 0x6A09E667u;
const IV1: u32 = 0xBB67AE85u;
const IV2: u32 = 0x3C6EF372u;
const IV3: u32 = 0xA54FF53Au;
const IV4: u32 = 0x510E527Fu;
const IV5: u32 = 0x9B05688Cu;
const IV6: u32 = 0x1F83D9ABu;
const IV7: u32 = 0x5BE0CD19u;

// Rotation helper
fn rotr(x: u32, n: u32) -> u32 {
    return (x >> n) | (x << (32u - n));
}

// Byte swap for endianness conversion (LE <-> BE)
fn bswap32(x: u32) -> u32 {
    return ((x & 0xFFu) << 24u) |
           ((x & 0xFF00u) << 8u) |
           ((x >> 8u) & 0xFF00u) |
           (x >> 24u);
}

// Blake3 G mixing function (inline version)
fn blake3_g(
    state: ptr<function, array<u32, 16>>,
    a: u32, b: u32, c: u32, d: u32,
    mx: u32, my: u32
) {
    (*state)[a] = (*state)[a] + (*state)[b] + mx;
    (*state)[d] = rotr((*state)[d] ^ (*state)[a], 16u);
    (*state)[c] = (*state)[c] + (*state)[d];
    (*state)[b] = rotr((*state)[b] ^ (*state)[c], 12u);
    (*state)[a] = (*state)[a] + (*state)[b] + my;
    (*state)[d] = rotr((*state)[d] ^ (*state)[a], 8u);
    (*state)[c] = (*state)[c] + (*state)[d];
    (*state)[b] = rotr((*state)[b] ^ (*state)[c], 7u);
}

// Blake3 round function
fn blake3_round(state: ptr<function, array<u32, 16>>, m: ptr<function, array<u32, 16>>) {
    // Column step
    blake3_g(state, 0u, 4u, 8u, 12u, (*m)[0u], (*m)[1u]);
    blake3_g(state, 1u, 5u, 9u, 13u, (*m)[2u], (*m)[3u]);
    blake3_g(state, 2u, 6u, 10u, 14u, (*m)[4u], (*m)[5u]);
    blake3_g(state, 3u, 7u, 11u, 15u, (*m)[6u], (*m)[7u]);
    
    // Diagonal step
    blake3_g(state, 0u, 5u, 10u, 15u, (*m)[8u], (*m)[9u]);
    blake3_g(state, 1u, 6u, 11u, 12u, (*m)[10u], (*m)[11u]);
    blake3_g(state, 2u, 7u, 8u, 13u, (*m)[12u], (*m)[13u]);
    blake3_g(state, 3u, 4u, 9u, 14u, (*m)[14u], (*m)[15u]);
}

// Permute message schedule
fn permute_msg(m: ptr<function, array<u32, 16>>) {
    let t0 = (*m)[0u]; let t1 = (*m)[1u]; let t2 = (*m)[2u]; let t3 = (*m)[3u];
    let t4 = (*m)[4u]; let t5 = (*m)[5u]; let t6 = (*m)[6u]; let t7 = (*m)[7u];
    let t8 = (*m)[8u]; let t9 = (*m)[9u]; let t10 = (*m)[10u]; let t11 = (*m)[11u];
    let t12 = (*m)[12u]; let t13 = (*m)[13u]; let t14 = (*m)[14u]; let t15 = (*m)[15u];
    
    (*m)[0u] = t2; (*m)[1u] = t6; (*m)[2u] = t3; (*m)[3u] = t10;
    (*m)[4u] = t7; (*m)[5u] = t0; (*m)[6u] = t4; (*m)[7u] = t13;
    (*m)[8u] = t1; (*m)[9u] = t11; (*m)[10u] = t12; (*m)[11u] = t5;
    (*m)[12u] = t9; (*m)[13u] = t14; (*m)[14u] = t15; (*m)[15u] = t8;
}

// Check if hash meets mining_target difficulty
// CPU verification expects:
// 1. First 4 bytes (hash[0] as LE u32) must be 0
// 2. Bytes 4-11 read as big-endian u64 < mining_target
fn check_mining_target(hash: array<u32, 8>) -> bool {
    // Check 1: First 32 bits must be zero
    if (hash[0u] != 0u) {
        return false;
    }
    
    // Check 2: Compare bytes 4-11 as big-endian against mining_target
    // hash[1] contains bytes 4-7 in little-endian, need to swap to big-endian
    // hash[2] contains bytes 8-11 in little-endian, need to swap to big-endian
    let h1_be = bswap32(hash[1u]);
    let h2_be = bswap32(hash[2u]);
    
    // mining_target[1] = high 32 bits of mining_target (already in correct format)
    // mining_target[2] = low 32 bits of mining_target
    // Compare as 64-bit big-endian: (h1_be, h2_be) < (mining_target[1], mining_target[2])
    if (h1_be < mining_target[1u]) {
        return true;
    }
    if (h1_be > mining_target[1u]) {
        return false;
    }
    // h1_be == mining_target[1], check h2_be
    if (h2_be < mining_target[2u]) {
        return true;
    }
    return false;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Calculate actual nonce = base offset + thread id
    let nonce = nonce_offset[0u] + id.x;
    
    // First block: compress first 64 bytes of preimage with IV
    // midstate[0-15] contains the first 64 bytes of preimage
    var m1: array<u32, 16>;
    for (var i = 0u; i < 16u; i = i + 1u) {
        m1[i] = midstate[i];
    }
    
    // Initialize state with IV for first block
    var state: array<u32, 16>;
    state[0u] = IV0; state[1u] = IV1; state[2u] = IV2; state[3u] = IV3;
    state[4u] = IV4; state[5u] = IV5; state[6u] = IV6; state[7u] = IV7;
    state[8u] = IV0; state[9u] = IV1; state[10u] = IV2; state[11u] = IV3;
    state[12u] = 0u; // counter low
    state[13u] = 0u; // counter high  
    state[14u] = 64u; // block length
    state[15u] = 0x01u; // flags: CHUNK_START
    
    // 7 rounds of Blake3 compression for first block
    for (var r = 0u; r < 7u; r = r + 1u) {
        blake3_round(&state, &m1);
        permute_msg(&m1);
    }
    
    // Get chaining value from first block
    var cv: array<u32, 8>;
    for (var i = 0u; i < 8u; i = i + 1u) {
        cv[i] = state[i] ^ state[i + 8u];
    }
    
    // Second block: nonce (8 bytes: low u32 + zero high u32) + padding
    var m2: array<u32, 16>;
    m2[0u] = nonce;
    m2[1u] = 0u;
    for (var i = 1u; i < 16u; i = i + 1u) {
        if (i == 1u) {
            continue;
        }
        m2[i] = 0u;
    }
    
    // Initialize state with chaining value for second (final) block
    state[0u] = cv[0u]; state[1u] = cv[1u]; state[2u] = cv[2u]; state[3u] = cv[3u];
    state[4u] = cv[4u]; state[5u] = cv[5u]; state[6u] = cv[6u]; state[7u] = cv[7u];
    state[8u] = IV0; state[9u] = IV1; state[10u] = IV2; state[11u] = IV3;
    state[12u] = 0u; // counter low (chunk counter stays 0 for single chunk)
    state[13u] = 0u; // counter high
    state[14u] = 8u; // block length (8 bytes of nonce)
    state[15u] = 0x0Au; // flags: CHUNK_END | ROOT = 0x02 | 0x08 = 0x0A
    
    // 7 rounds of Blake3 compression for second block
    for (var r = 0u; r < 7u; r = r + 1u) {
        blake3_round(&state, &m2);
        permute_msg(&m2);
    }
    
    // Finalize: XOR upper and lower halves with CV
    var hash: array<u32, 8>;
    for (var i = 0u; i < 8u; i = i + 1u) {
        hash[i] = state[i] ^ state[i + 8u];
    }

    // Debug mode for CPU/GPU parity checks.
    // Host sets mining_target[0] = 1 to request raw hash output from invocation 0.
    if (mining_target[0u] == 1u) {
        if (id.x == 0u) {
            atomicStore(&results[0], 1u);
            atomicStore(&results[4u], nonce);
            for (var i = 0u; i < 8u; i = i + 1u) {
                atomicStore(&results[5u + i], hash[i]);
            }
        }
        return;
    }

    // Check if hash meets mining_target
    if (check_mining_target(hash)) {
        // results[0] is the atomic result counter
        // results[4..7], results[8..11], ... store per-result data
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
