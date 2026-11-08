import { vi } from 'vitest'

/**
 * A stand-in for `Image` in tests (jsdom never loads images). Like a browser,
 * it starts loading when its `src` is set, then fires `load`, or `error` if
 * told to fail.
 */

export interface FakeImage extends EventTarget {
  src: string
}

/**
 * Replaces `Image` with a fake whose images all load, or all fail. Returns
 * every image created from now on, in order. Undo with `vi.unstubAllGlobals()`.
 */
export function stubImages(outcome: 'load' | 'error' = 'load'): FakeImage[] {
  const created: FakeImage[] = []

  class StubImage extends EventTarget implements FakeImage {
    #src = ''

    constructor() {
      super()
      created.push(this)
    }

    get src() {
      return this.#src
    }

    set src(url: string) {
      this.#src = url
      queueMicrotask(() => this.dispatchEvent(new Event(outcome)))
    }
  }

  vi.stubGlobal('Image', StubImage)
  return created
}
