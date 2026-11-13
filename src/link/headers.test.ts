/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('deployment security headers (public/_headers)', () => {
  const h = readFileSync('public/_headers', 'utf8')
  it('blocks all third-party network access and framing', () => {
    expect(h).toMatch(/connect-src 'self'/)
    expect(h).toMatch(/default-src 'self'/)
    expect(h).toMatch(/frame-ancestors 'none'/)
    expect(h).toMatch(/object-src 'none'/)
    expect(h).not.toMatch(/unsafe-eval/)
  })
  it('turns off device APIs the app does not use', () => {
    expect(h).toMatch(/camera=\(\), microphone=\(\)/)
  })
})
