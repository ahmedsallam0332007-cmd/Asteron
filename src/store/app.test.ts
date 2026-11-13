import { describe, expect, it } from 'vitest'
import { useApp } from './app'

describe('app clock', () => {
  it('never moves backwards', () => {
    useApp.getState().setNow('2099-01-01T00:00:00.000Z')
    useApp.getState().setNow('2000-01-01T00:00:00.000Z')
    useApp.getState().tick()
    expect(useApp.getState().now).toBe('2099-01-01T00:00:00.000Z')
  })
})
