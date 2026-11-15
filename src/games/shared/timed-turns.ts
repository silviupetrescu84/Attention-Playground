import { clamp } from './numbers'

/**
 * Turns with a time to choose, shared by the minigames that show something
 * to choose from until the player does or the time is up (Shift
 * Perspective, Break It Down): how visible things are as they fade in and
 * out, how much of the time is left, and running out of time on time.
 */

/** Something that fades in, and out once it ends. */
export interface Fade {
  /** When it starts to fade in. */
  readonly fromMs: number
  /** When it ends and starts to fade out; undefined until then. */
  readonly endedAtMs: number | undefined
  readonly inMs: number
  readonly outMs: number
}

/**
 * How visible `fade` is at `timeMs`, 0 (hidden) to 1: it fades in over
 * `inMs`, stops fading in when it ends, and fades out over `outMs` from then,
 * starting from as far as it got.
 */
export function fadeAt({ fromMs, endedAtMs, inMs, outMs }: Fade, timeMs: number): number {
  const fadedIn = (Math.min(timeMs, endedAtMs ?? timeMs) - fromMs) / inMs
  const fadedOut = endedAtMs === undefined ? 1 : 1 - (timeMs - endedAtMs) / outMs
  return clamp(Math.min(fadedIn, fadedOut), 0, 1)
}

/** Something due at a moment: a time to choose running out, the next thing to show… */
export interface Due {
  readonly deadlineMs: number
}

/** A turn with a time to choose. */
export interface TimedTurn extends Due {
  readonly timeLimitMs: number
  /** When the time to choose is up. */
  readonly deadlineMs: number
  /** When the player chose, or the time was up; undefined until then. */
  readonly endedAtMs: number | undefined
}

/**
 * How much of `turn`'s time to choose is left at `timeMs`: 1 (all) to 0
 * (none). All of it until the time starts; it stops running out when the
 * turn ends.
 */
export function timeLeftAt(turn: TimedTurn, timeMs: number): number {
  const now = Math.min(timeMs, turn.endedAtMs ?? timeMs)
  return clamp((turn.deadlineMs - now) / turn.timeLimitMs, 0, 1)
}

export interface Deadlines<Item extends Due> {
  /** What is due next (a turn whose time runs out, the next thing to show), if anything. */
  readonly current: () => Item | undefined
  /** Does what is due at `item`'s deadline (ends it, shows the next…), and sets what is next. */
  readonly expire: (item: Item) => void
  /** Whether the round has stopped (what happened was one mistake too many). */
  readonly stopped: () => boolean
}

/**
 * Moves a round on to `elapsedMs`: everything due by then happens at its
 * exact moment, and what comes next follows from then, even if one frame
 * took long enough for several things to be due. Returns the round's time
 * afterwards: `elapsedMs`, or the moment at which the round stopped.
 */
export function passDeadlines<Item extends Due>(
  elapsedMs: number,
  { current, expire, stopped }: Deadlines<Item>,
): number {
  for (let item = current(); item && item.deadlineMs <= elapsedMs; item = current()) {
    expire(item)

    if (stopped()) {
      return item.deadlineMs
    }
  }

  return elapsedMs
}
