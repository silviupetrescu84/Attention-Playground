/**
 * A list of listeners to notify, shared by everything games can subscribe to
 * (the lifecycle, the score).
 *
 * - Listeners removed while a notification is going on are not called.
 * - Listeners added while a notification is going on hear only later ones.
 * - Notifications made from inside a listener are queued, so every listener
 *   hears them in the order they happened.
 * - One failing listener does not stop the others; errors are thrown once
 *   everyone has been notified (an AggregateError if several failed).
 */

export type Listener<Args extends unknown[]> = (...args: Args) => void

export interface Listeners<Args extends unknown[]> {
  /** Adds `listener`; returns a function that removes it. */
  add(listener: Listener<Args>): () => void
  notify(...args: Args): void
}

export function createListeners<Args extends unknown[]>(): Listeners<Args> {
  const listeners = new Set<Listener<Args>>()
  const pending: Args[] = []
  let notifying = false

  return {
    add(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    notify(...args) {
      pending.push(args)

      if (notifying) {
        return
      }

      notifying = true
      const errors: unknown[] = []

      try {
        for (let next = pending.shift(); next; next = pending.shift()) {
          for (const listener of [...listeners]) {
            if (!listeners.has(listener)) {
              continue
            }

            try {
              listener(...next)
            } catch (error) {
              errors.push(error)
            }
          }
        }
      } finally {
        notifying = false
      }

      if (errors.length === 1) {
        throw errors[0]
      }

      if (errors.length > 1) {
        throw new AggregateError(errors, 'Listeners failed')
      }
    },
  }
}
