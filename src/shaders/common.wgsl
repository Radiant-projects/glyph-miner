// Common utilities for all mining shaders
// Shared across all algorithms for consistency

// Common utility functions
fn rotl(x: u32, n: u32) -> u32 {
    return (x << n) | (x >> (32u - n));
}

fn rotr(x: u32, n: u32) -> u32 {
    return (x >> n) | (x << (32u - n));
}

fn rotate32(x: u32, n: u32) -> u32 {
    return (x >> n) | (x << (32u - n));
}

// Endianness conversion
fn bswap32(x: u32) -> u32 {
    return ((x & 0xFFu) << 24u) |
           ((x & 0xFF00u) << 8u) |
           ((x >> 8u) & 0xFF00u) |
           (x >> 24u);
}

// Check if hash array is less than target array
fn is_less_than_target_arr(hash: array<u32, 8>, tgt: ptr<storage, array<u32>, read>) -> bool {
    for (var i = 0u; i < 8u; i = i + 1u) {
        if (hash[i] < (*tgt)[i]) {
            return true;
        }
        if (hash[i] > (*tgt)[i]) {
            return false;
        }
    }
    return false;
}

// Check if vec4 hash is less than vec4 target
fn is_less_than_target_vec4(hash: vec4<u32>, tgt: vec4<u32>) -> bool {
    if (hash.x < tgt.x) { return true; }
    if (hash.x > tgt.x) { return false; }
    if (hash.y < tgt.y) { return true; }
    if (hash.y > tgt.y) { return false; }
    if (hash.z < tgt.z) { return true; }
    if (hash.z > tgt.z) { return false; }
    if (hash.w < tgt.w) { return true; }
    return false;
}
