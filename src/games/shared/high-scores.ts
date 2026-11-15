import { isNewRound, type GameLifecycle } from './game-lifecycle'
import { createListeners } from './listeners'
import { byLevel, type DifficultyLevel, type Mistakes } from './mistakes'
import type { Score } from './score'

/**
 * Each game's high scores, kept for each difficulty in the browser
 * (localStorage), shared by every minigame.
 *
 * Each difficulty keeps its HIGH_SCORES_KEPT best scores, best first, each
 * with the name of the player who made it. When a round is over (game over)
 * with a score that makes its difficulty's high scores, the player may save
 * it under their name; it counts once they do. A score must be at least
 * MIN_HIGH_SCORE. Rounds left unfinished (restarted from the pause menu, or
 * left for another screen) never count.
 *
 * A score equal to one already kept goes after it: the earlier one keeps its
 * place, so equalling the best score is not a new best, and equalling the
 * last of a full list does not make it.
 *
 * The last name saved is remembered (for every game), to suggest next time.
 *
 * The browser may refuse to store anything (private browsing, storage turned
 * off or full): the scores are then kept until the player leaves the game,
 * and the game goes on as normal. What is read back is checked, so anything
 * unexpected in storage is left out rather than shown.
 */

export const HIGH_SCORES_KEPT = 10

/** The lowest score that can be a high score. */
export const MIN_HIGH_SCORE = 1

/** The longest a name can be, in characters. */
export const MAX_NAME_LENGTH = 16

export interface HighScore {
  readonly name: string
  readonly score: number
}

/** The high scores of each difficulty, best first. */
export type HighScoreTable = Readonly<Record<DifficultyLevel, readonly HighScore[]>>

/** The parts of `localStorage` the scores need (lets tests pass fakes). */
export type ScoreStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Where a game's high scores are stored. */
export function highScoresKey(gameId: string): string {
  return `attention-playground:high-scores:v2:${gameId}`
}

/** Where the last name saved is stored (the same for every game). */
export const PLAYER_NAME_KEY = 'attention-playground:player-name'

export function emptyHighScores(): HighScoreTable {
  return byLevel(() => [])
}

/** Whether `value` is an object whose fields can be read (not null, nor a list). */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `name` as it is kept: spaces trimmed and runs of them made one, at most
 * MAX_NAME_LENGTH characters. '' when there is nothing left.
 */
export function cleanName(name: string): string {
  const oneLine = name.trim().replace(/\s+/g, ' ')
  // By characters as seen, so an emoji (even one of several) is never cut in half.
  const characters = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(oneLine),
  ]
  return characters
    .slice(0, MAX_NAME_LENGTH)
    .map(({ segment }) => segment)
    .join('')
    .trim()
}

/** A saved high score, cleaned; `undefined` if it is not one. */
function readHighScore(value: unknown): HighScore | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { name, score } = value
  const cleaned = typeof name === 'string' ? cleanName(name) : ''
  const isScore = typeof score === 'number' && Number.isFinite(score) && score >= MIN_HIGH_SCORE

  return cleaned && isScore ? { name: cleaned, score } : undefined
}

/** The high scores that can be shown, best first, at most HIGH_SCORES_KEPT. */
function readHighScores(value: unknown): HighScore[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(readHighScore)
    .filter((entry) => entry !== undefined)
    .sort((a, b) => b.score - a.score)
    .slice(0, HIGH_SCORES_KEPT)
}

/**
 * Reads the table saved as `text`. Anything that is not a high score is left
 * out, and a difficulty missing (or unreadable) has none.
 */
export function parseHighScores(text: string | null): HighScoreTable {
  const saved = text === null ? undefined : parseJson(text)
  const levels = isRecord(saved) ? saved : {}
  return byLevel((level) => readHighScores(levels[level]))
}

/** What `text` holds as JSON, or `undefined` if it is not JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Where `score` would go among `highScores` (0 = best), or `undefined` if it
 * would not make them: below MIN_HIGH_SCORE, or not above the last of a full
 * list.
 */
export function highScoreRank(highScores: readonly HighScore[], score: number): number | undefined {
  if (score < MIN_HIGH_SCORE) {
    return undefined
  }

  // After any equal scores: the earlier score keeps its place.
  const index = highScores.findIndex((other) => other.score < score)
  const rank = index === -1 ? highScores.length : index
  return rank < HIGH_SCORES_KEPT ? rank : undefined
}

export interface AddedHighScore {
  readonly table: HighScoreTable
  /** Where it went (0 = best), or `undefined` if it did not make it. */
  readonly rank: number | undefined
}

/** `table` with `entry` added to `level`'s high scores (if it makes them), and where it went. */
export function addHighScore(
  table: HighScoreTable,
  level: DifficultyLevel,
  entry: HighScore,
): AddedHighScore {
  const kept = table[level]
  const rank = highScoreRank(kept, entry.score)

  if (rank === undefined) {
    return { table, rank }
  }

  const scores = [...kept.slice(0, rank), entry, ...kept.slice(rank)].slice(0, HIGH_SCORES_KEPT)
  return { table: { ...table, [level]: scores }, rank }
}

/** The round just over. */
export interface RoundResult {
  readonly level: DifficultyLevel
  readonly score: number
  /**
   * Where it goes among the high scores (0 = best), or where it went once
   * saved; `undefined` if it does not make them.
   */
  readonly rank: number | undefined
  /** Whether it beats every high score before it at this difficulty. */
  readonly newBest: boolean
  /** The name it was saved under; `undefined` until it is saved. */
  readonly savedAs: string | undefined
}

/** A round over with a score that makes the high scores, not saved yet. */
export type UnsavedHighScore = RoundResult & { readonly rank: number; readonly savedAs: undefined }

/** Whether `round` is a high score the player has not saved yet. */
export function canSave(round: RoundResult | undefined): round is UnsavedHighScore {
  return round?.rank !== undefined && round.savedAs === undefined
}

export interface HighScores {
  /** The high scores of each difficulty, best first. */
  readonly table: HighScoreTable
  /** The best high score at `level`, or `undefined` if there is none yet. */
  best(level: DifficultyLevel): HighScore | undefined
  /** The round just over; `undefined` once the player moves on (restart or start). */
  readonly lastRound: RoundResult | undefined
  /** The last name a score was saved under, to suggest ('' before the first). */
  readonly playerName: string
  /**
   * Saves the round just over under `name` (cleaned, see `cleanName`). Throws
   * unless it is a high score not saved yet (see `canSave`) and the name is
   * not blank.
   */
  save(name: string): void
  /** Calls `listener` after every change (a round over or saved, or forgotten). */
  subscribe(listener: () => void): () => void
}

export interface HighScoresOptions {
  /** The game's id: each game keeps its own high scores. */
  gameId: string
  lifecycle: GameLifecycle
  score: Score
  mistakes: Mistakes
  /** Defaults to the browser's `localStorage`. */
  storage?: ScoreStorage
}

/** The browser's storage, or `undefined` if it may not be used. */
function browserStorage(): ScoreStorage | undefined {
  try {
    // Reading `localStorage` throws when the browser blocks it.
    return window.localStorage
  } catch {
    return undefined
  }
}

export function createHighScores({
  gameId,
  lifecycle,
  score,
  mistakes,
  storage = browserStorage(),
}: HighScoresOptions): HighScores {
  const key = highScoresKey(gameId)
  const listeners = createListeners<[]>()
  let table = read() ?? emptyHighScores()
  let playerName = readPlayerName()
  let lastRound: RoundResult | undefined

  /** The saved table, or `undefined` if the storage cannot be read. */
  function read() {
    try {
      return storage ? parseHighScores(storage.getItem(key)) : undefined
    } catch (error) {
      console.warn('Could not read the saved high scores', error)
      return undefined
    }
  }

  function readPlayerName() {
    try {
      return cleanName(storage?.getItem(PLAYER_NAME_KEY) ?? '')
    } catch {
      // Already reported when the high scores could not be read.
      return ''
    }
  }

  function write(itemKey: string, value: string) {
    try {
      storage?.setItem(itemKey, value)
    } catch (error) {
      console.warn('Could not save the high scores; they are kept until you leave the game', error)
    }
  }

  function roundOver(level: DifficultyLevel, value: number) {
    // Read again first, so rounds saved in another tab count.
    table = read() ?? table
    const best = table[level].at(0)
    lastRound = {
      level,
      score: value,
      rank: highScoreRank(table[level], value),
      newBest: value >= MIN_HIGH_SCORE && (best === undefined || value > best.score),
      savedAs: undefined,
    }
    listeners.notify()
  }

  function save(name: string) {
    const round = lastRound

    if (!canSave(round)) {
      throw new Error('There is no high score to save')
    }

    const cleaned = cleanName(name)

    if (!cleaned) {
      throw new RangeError('A high score needs a name')
    }

    // Read again first, so high scores saved in another tab are not lost.
    const added = addHighScore(read() ?? table, round.level, { name: cleaned, score: round.score })
    table = added.table
    lastRound = { ...round, rank: added.rank, savedAs: cleaned }
    playerName = cleaned

    if (added.rank !== undefined) {
      write(key, JSON.stringify(table))
    }
    write(PLAYER_NAME_KEY, cleaned)
    listeners.notify()
  }

  lifecycle.subscribe((change) => {
    if (change.state === 'finished') {
      roundOver(mistakes.level, score.value)
    } else if (isNewRound(change) && lastRound) {
      lastRound = undefined
      listeners.notify()
    }
  })

  return {
    get table() {
      return table
    },
    best: (level) => table[level][0],
    get lastRound() {
      return lastRound
    },
    get playerName() {
      return playerName
    },
    save,
    subscribe: listeners.add,
  }
}
