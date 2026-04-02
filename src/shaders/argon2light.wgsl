// Argon2id-Light mining shader for Glyph mining
// Self-contained implementation with proper WGSL syntax
// Simplified memory-hard algorithm for GPU mining

@group(0) @binding(0) var<storage, read> midstate: array<u32>;
@group(0) @binding(1) var<storage, read> target: array<u32>;
@group(0) @binding(2) var<storage, read_write> results: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> nonce_offset: array<u32>;

// Argon2id-Light parameters (reduced for GPU)
const MEMORY_BLOCKS: u32 = 64u;  // 64 blocks for light version
const TIME_COST: u32 = 3u;       // 3 iterations
const BLOCK_SIZE: u32 = 64u;     // 64 u32s per block (256 bytes)

// Rotation helper
fn rotr32(x: u32, n: u32) -> u32 {
    return (x >> n) | (x << (32u - n));
}

// Blake2b G function for compression
fn blake2b_g(
    v: ptr<function, array<u32, 16>>,
    a: u32, b: u32, c: u32, d: u32,
    x: u32, y: u32
) {
    (*v)[a] = (*v)[a] + (*v)[b] + x;
    (*v)[d] = rotr32((*v)[d] ^ (*v)[a], 16u);
    (*v)[c] = (*v)[c] + (*v)[d];
    (*v)[b] = rotr32((*v)[b] ^ (*v)[c], 12u);
    (*v)[a] = (*v)[a] + (*v)[b] + y;
    (*v)[d] = rotr32((*v)[d] ^ (*v)[a], 8u);
    (*v)[c] = (*v)[c] + (*v)[d];
    (*v)[b] = rotr32((*v)[b] ^ (*v)[c], 7u);
}

// Simplified Blake2b compression for Argon2
fn blake2b_compress(state: ptr<function, array<u32, 16>>, msg: ptr<function, array<u32, 16>>) {
    // Column rounds
    blake2b_g(state, 0u, 4u, 8u, 12u, (*msg)[0u], (*msg)[1u]);
    blake2b_g(state, 1u, 5u, 9u, 13u, (*msg)[2u], (*msg)[3u]);
    blake2b_g(state, 2u, 6u, 10u, 14u, (*msg)[4u], (*msg)[5u]);
    blake2b_g(state, 3u, 7u, 11u, 15u, (*msg)[6u], (*msg)[7u]);
    
    // Diagonal rounds
    blake2b_g(state, 0u, 5u, 10u, 15u, (*msg)[8u], (*msg)[9u]);
    blake2b_g(state, 1u, 6u, 11u, 12u, (*msg)[10u], (*msg)[11u]);
    blake2b_g(state, 2u, 7u, 8u, 13u, (*msg)[12u], (*msg)[13u]);
    blake2b_g(state, 3u, 4u, 9u, 14u, (*msg)[14u], (*msg)[15u]);
}

// Simple reference index calculation
fn get_ref_index(pass: u32, slice: u32, index: u32, nonce: u32) -> u32 {
    // Pseudo-random index based on current position and nonce
    let seed = pass * 1000u + slice * 100u + index + nonce;
    return (seed * 2654435761u) % MEMORY_BLOCKS;
}

// Argon2id-Light hash function (simplified)
fn argon2_hash(input: array<u32, 16>, nonce: u32) -> array<u32, 8> {
    // Initialize state with input
    var state: array<u32, 16>;
    for (var i = 0u; i < 16u; i = i + 1u) {
        state[i] = input[i];
    }
    state[0u] ^= nonce;
    
    // Memory-hard iterations (simplified)
    var mem: array<u32, 16>;
    for (var i = 0u; i < 16u; i = i + 1u) {
        mem[i] = state[i];
    }
    
    // Time cost iterations
    for (var t = 0u; t < TIME_COST; t = t + 1u) {
        // Mix state with memory
        for (var i = 0u; i < 16u; i = i + 1u) {
            let ref_idx = get_ref_index(t, i / 4u, i % 4u, nonce);
            state[i] ^= mem[(ref_idx + i) % 16u];
        }
        
        // Compress
        blake2b_compress(&state, &mem);
        
        // Update memory
        for (var i = 0u; i < 16u; i = i + 1u) {
            mem[i] ^= state[i];
        }
    }
    
    // Final compression
    blake2b_compress(&state, &mem);
    
    // Extract hash
    var hash: array<u32, 8>;
    for (var i = 0u; i < 8u; i = i + 1u) {
        hash[i] = state[i] ^ state[i + 8u];
    }
    
    return hash;
}

// Byte swap for endianness conversion (LE <-> BE)
fn bswap32(x: u32) -> u32 {
    return ((x & 0xFFu) << 24u) |
           ((x & 0xFF00u) << 8u) |
           ((x >> 8u) & 0xFF00u) |
           (x >> 24u);
}

// Check if hash meets target difficulty
// CPU verification expects:
// 1. First 4 bytes (hash[0] as LE u32) must be 0
// 2. Bytes 4-11 read as big-endian u64 < target
fn check_target(hash: array<u32, 8>) -> bool {
    // Check 1: First 32 bits must be zero
    if (hash[0u] != 0u) {
        return false;
    }
    
    // Check 2: Compare bytes 4-11 as big-endian against target
    let h1_be = bswap32(hash[1u]);
    let h2_be = bswap32(hash[2u]);
    
    if (h1_be < target[1u]) { return true; }
    if (h1_be > target[1u]) { return false; }
    if (h2_be < target[2u]) { return true; }
    return false;
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Calculate actual nonce = base offset + thread id
    let nonce = nonce_offset[0u] + global_id.x;
    
    // Load midstate into input array
    var input: array<u32, 16>;
    for (var i = 0u; i < 16u; i = i + 1u) {
        input[i] = midstate[i];
    }
    
    // Add global IDs for additional entropy
    input[1u] ^= global_id.y;
    input[2u] ^= global_id.z;
    
    // Compute Argon2id-Light hash
    let hash = argon2_hash(input, nonce);
    
    // Check if hash meets target
    if (check_target(hash)) {
        let idx = atomicAdd(&results[0u].x, 1u);
        if (idx < 127u) {
            // Store nonce, hash words, and flag=1 at w component (offset 12)
            // CPU expects: offset 0=nonce, offset 12=flag(1)
            results[idx + 1u] = vec4<u32>(nonce, hash[0u], hash[1u], 1u);
        }
    }
}
