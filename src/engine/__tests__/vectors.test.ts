import { describe, expect, it } from 'vitest'
import { content } from '../../content'
import { runVector, VECTOR_GROUPS } from '../vectors'

describe('golden vectors', () => {
  it('has vectors for every group', () => {
    expect(VECTOR_GROUPS.map((g) => g.group)).toEqual(['absolute', 'aggregate', 'baseline', 'composite', 'trend'])
  })
  for (const { group, vectors } of VECTOR_GROUPS) {
    describe(group, () => {
      for (const v of vectors) {
        it(`${v.id}: ${v.description}`, () => {
          const r = runVector(v, content)
          expect(r.failures).toEqual([])
        })
      }
    })
  }
  it('every rule is exercised by at least one vector', () => {
    const all = VECTOR_GROUPS.flatMap((g) => g.vectors)
    const mentioned = new Set(all.flatMap((v) => [...(v.expect.fired ?? []), ...(v.expect.notFired ?? [])]))
    const missing = content.rules.map((r) => r.id).filter((id) => !mentioned.has(id))
    expect(missing).toEqual([])
  })
})
