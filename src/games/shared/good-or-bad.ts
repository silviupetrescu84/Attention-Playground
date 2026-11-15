import type { SummaryItem } from './game-hud'
import type { Score } from './score'
import type { WordType } from './word-picker'

/**
 * The rules shared by the minigames where good and bad things come and go
 * and the player taps the good ones and lets the bad ones go (Emotions Rise,
 * Pause Before Reacting): what counts as a mistake, what is counted, and how
 * both are told to the player.
 *
 * - a good one tapped: right;
 * - a good one gone without a tap: a mistake (missed);
 * - a bad one tapped: a mistake;
 * - a bad one gone without a tap: right (let go).
 */

export type GoodOrBadMistake = 'badTapped' | 'goodMissed'

/** What happened to the good and bad ones of a round. */
export interface GoodOrBadStats {
  readonly goodTapped: number
  /** Good ones gone without a tap. */
  readonly goodMissed: number
  readonly badTapped: number
  /** Bad ones gone without a tap. */
  readonly badLetGo: number
}

export type GoodOrBadCount = keyof GoodOrBadStats

export const NO_GOOD_OR_BAD_STATS: GoodOrBadStats = {
  goodTapped: 0,
  goodMissed: 0,
  badTapped: 0,
  badLetGo: 0,
}

/** How a good or bad one ended: tapped, or gone without a tap. */
export type GoodOrBadEnd = 'tapped' | 'gone'

export interface GoodOrBadJudgement {
  /** What it counts as. */
  readonly counted: GoodOrBadCount
  /** The mistake it was, if it was one. */
  readonly mistake: GoodOrBadMistake | undefined
}

const JUDGEMENTS: Readonly<Record<WordType, Record<GoodOrBadEnd, GoodOrBadJudgement>>> = {
  good: {
    tapped: { counted: 'goodTapped', mistake: undefined },
    gone: { counted: 'goodMissed', mistake: 'goodMissed' },
  },
  bad: {
    tapped: { counted: 'badTapped', mistake: 'badTapped' },
    gone: { counted: 'badLetGo', mistake: undefined },
  },
}

/** What a `type` one that ended so counts as, and whether it was a mistake. */
export function judge(type: WordType, end: GoodOrBadEnd): GoodOrBadJudgement {
  return JUDGEMENTS[type][end]
}

export interface GoodOrBadTallyOptions<Item> {
  score: Score
  /** Points for each way one can count; none for those not listed. */
  points: Readonly<Partial<Record<GoodOrBadCount, number>>>
  /** Called for every mistake, with what it was about. */
  onMistake?: (mistake: GoodOrBadMistake, item: Item) => void
}

/** What a round's good and bad ones came to. */
export interface GoodOrBadTally<Item> {
  readonly stats: GoodOrBadStats
  /** Counts `item`, a `type` one that ended `how`: scores it, or tells of the mistake. */
  count(item: Item, type: WordType, how: GoodOrBadEnd): void
  /** Back to nothing counted, for a new round. */
  reset(): void
}

export function createGoodOrBadTally<Item>({
  score,
  points,
  onMistake,
}: GoodOrBadTallyOptions<Item>): GoodOrBadTally<Item> {
  let stats = NO_GOOD_OR_BAD_STATS

  return {
    get stats() {
      return stats
    },
    count(item, type, how) {
      const { counted, mistake } = judge(type, how)
      stats = { ...stats, [counted]: stats[counted] + 1 }

      if (mistake) {
        onMistake?.(mistake, item)
      } else {
        score.add(points[counted] ?? 0)
      }
    },
    reset() {
      stats = NO_GOOD_OR_BAD_STATS
    },
  }
}

/** How things are named, to tell the player: "emotion", "emotions", "tapped", "let go". */
export interface GoodOrBadWords {
  readonly one: string
  readonly many: string
  /** What taking one is called: "tapped", "caught"… */
  readonly tapped: string
  /** What letting a bad one go is called. */
  readonly letGo: string
}

/** The status bar message for `mistake` with `text`: "Tapped a bad emotion: Fear". */
export function mistakeMessageFor(
  mistake: GoodOrBadMistake,
  text: string,
  { one, tapped }: GoodOrBadWords,
): string {
  const Tapped = tapped.charAt(0).toUpperCase() + tapped.slice(1)
  return mistake === 'badTapped'
    ? `${Tapped} a bad ${one}: ${text}`
    : `Missed a good ${one}: ${text}`
}

/** The end-of-round summary of `stats`: "Good emotions tapped: 12"… */
export function summaryOf(
  stats: GoodOrBadStats,
  { many, tapped, letGo }: GoodOrBadWords,
): SummaryItem[] {
  return [
    { label: `Good ${many} ${tapped}`, value: stats.goodTapped },
    { label: `Good ${many} missed`, value: stats.goodMissed },
    { label: `Bad ${many} ${tapped}`, value: stats.badTapped },
    { label: `Bad ${many} ${letGo}`, value: stats.badLetGo },
  ]
}
