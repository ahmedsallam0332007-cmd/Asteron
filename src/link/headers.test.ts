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
  it('Vercel serves the same headers as public/_headers, and deep links fall back to the app', () => {
    const v = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[]; rewrites: { destination: string }[] }
    const served = Object.fromEntries(v.headers[0].headers.map((x) => [x.key, x.value]))
    for (const line of h.split('\n').slice(1).filter((l) => l.trim())) {
      const [k, ...rest] = line.split(':')
      expect(served[k.trim()], k).toBe(rest.join(':').trim())
    }
    expect(v.rewrites[0].destination).toBe('/index.html')
  })
})
