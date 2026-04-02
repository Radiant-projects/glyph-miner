# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email: info@radiantfoundation.org
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact

### Response Timeline

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Resolution Target:** Within 30 days for critical issues

## Security Considerations

### Wallet Security

Glyph-miner handles private keys for mining rewards. Security considerations:

1. **Key Storage:** Private keys are stored in browser localStorage
2. **Never Share:** Never share your private key or seed phrase
3. **Use Dedicated Wallet:** Consider using a dedicated mining wallet, not your main wallet

### Browser Mining Risks

1. **WebGPU Access:** Mining uses WebGPU which has direct GPU access
2. **Resource Usage:** Mining consumes significant CPU/GPU resources
3. **Browser Extensions:** Malicious extensions could intercept keys

### Best Practices

1. Use a modern, up-to-date browser
2. Disable unnecessary browser extensions while mining
3. Use a dedicated browser profile for mining
4. Regularly transfer mined tokens to a secure wallet
5. Verify you're on the official site (check URL carefully)

### Known Limitations

1. **Browser-Based:** Less secure than native applications
2. **No Hardware Wallet:** Cannot use hardware wallets for mining rewards
3. **LocalStorage:** Keys stored in localStorage can be accessed by JavaScript

## Dependencies

- `@radiantblockchain/radiantjs` - Wallet operations
- WebGPU shaders for mining algorithms

---

*Last updated: January 2026*
