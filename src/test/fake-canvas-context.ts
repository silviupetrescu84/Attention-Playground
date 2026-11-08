import { vi } from 'vitest'

/**
 * A stand-in for CanvasRenderingContext2D in tests (jsdom cannot draw).
 * Records every drawing call together with the styles in effect at that
 * moment, and measures text as 0.6 × font size per character.
 */

export interface DrawCall {
  readonly name: string
  readonly args: readonly unknown[]
  readonly fillStyle: unknown
  readonly strokeStyle: unknown
  readonly lineWidth: number
  readonly font: string
}

export interface FakeContext {
  readonly calls: DrawCall[]
  font: string
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  textAlign: string
  textBaseline: string
  /** Calls named `name`, in order. */
  callsTo(name: string): DrawCall[]
  asContext(): CanvasRenderingContext2D
}

export function fontSizeOf(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font)
  return match ? Number(match[1]) : 10
}

export function createFakeContext(): FakeContext {
  const calls: DrawCall[] = []

  const context = {
    calls,
    font: '10px sans-serif',
    fillStyle: '#000' as unknown,
    strokeStyle: '#000' as unknown,
    lineWidth: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    callsTo(name: string) {
      return calls.filter((call) => call.name === name)
    },
    asContext() {
      return context as unknown as CanvasRenderingContext2D
    },
  }

  function record(name: string, result?: (...args: unknown[]) => unknown) {
    return (...args: unknown[]) => {
      calls.push({
        name,
        args,
        fillStyle: context.fillStyle,
        strokeStyle: context.strokeStyle,
        lineWidth: context.lineWidth,
        font: context.font,
      })
      return result?.(...args)
    }
  }

  Object.assign(context, {
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
    beginPath: record('beginPath'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    fill: record('fill'),
    stroke: record('stroke'),
    createLinearGradient: record('createLinearGradient', () => ({
      addColorStop() {},
    })),
    measureText: (text: string) => ({
      width: text.length * fontSizeOf(context.font) * 0.6,
    }),
  })

  return context
}

/**
 * Makes every canvas hand out a new FakeContext (jsdom cannot draw). Returns
 * the contexts in the order they were created; call it in `beforeEach`.
 */
export function useFakeCanvasContexts(): FakeContext[] {
  const contexts: FakeContext[] = []

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const context = createFakeContext()
    contexts.push(context)
    return context.asContext() as never
  })

  return contexts
}
