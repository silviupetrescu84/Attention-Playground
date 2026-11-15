import type { ScoreStorage } from '../games/shared/high-scores'

/**
 * An in-memory stand-in for `localStorage`, so tests start with nothing
 * saved and never share what they save.
 */
export class FakeStorage implements ScoreStorage {
  readonly items = new Map<string, string>()

  getItem(key: string) {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
}
