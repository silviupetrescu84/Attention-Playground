import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeStorage } from '../../test/fake-storage'
import { createGameLifecycle } from './game-lifecycle'
import {
  addHighScore,
  canSave,
  cleanName,
  createHighScores,
  emptyHighScores,
  HIGH_SCORES_KEPT,
  highScoreRank,
  highScoresKey,
  MAX_NAME_LENGTH,
  MIN_HIGH_SCORE,
  parseHighScores,
  PLAYER_NAME_KEY,
  type HighScore,
  type HighScoreTable,
  type ScoreStorage,
} from './high-scores'
import { createMistakes, type DifficultyLevel } from './mistakes'
import { createScore } from './score'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** High scores with made-up names: [12, 5] → Player 1 with 12, Player 2 with 5. */
function entries(scores: number[]): HighScore[] {
  return scores.map((score, i) => ({ name: `Player ${i + 1}`, score }))
}

function table(scores: Partial<Record<DifficultyLevel, HighScore[]>>): HighScoreTable {
  return { ...emptyHighScores(), ...scores }
}

function saveTable(storage: ScoreStorage, saved: unknown, gameId = 'emotions-rise') {
  storage.setItem(highScoresKey(gameId), JSON.stringify(saved))
}

interface SetupOptions {
  gameId?: string
  storage?: ScoreStorage
  /** Leave the storage out, for the game's own (the browser's localStorage). */
  useDefaultStorage?: boolean
}

function setup({
  gameId = 'emotions-rise',
  storage = new FakeStorage(),
  useDefaultStorage = false,
}: SetupOptions = {}) {
  const screen = new AbortController()
  const lifecycle = createGameLifecycle({ signal: screen.signal })
  const score = createScore({ lifecycle })
  const mistakes = createMistakes({ lifecycle })
  const highScores = createHighScores({
    gameId,
    lifecycle,
    score,
    mistakes,
    ...(useDefaultStorage ? {} : { storage }),
  })
  const listener = vi.fn()
  highScores.subscribe(listener)

  /** Back to the Start button, as the Restart button does after a round. */
  function backToStart() {
    if (lifecycle.state === 'finished') {
      lifecycle.restart()
    }
  }

  /** Plays a round at the difficulty chosen, ending on `points`. */
  function playRound(points: number) {
    backToStart()
    lifecycle.start()
    score.add(points)
    lifecycle.finish()
  }

  /** Plays a round ending on `points`, and saves it under `name`. */
  function playAndSave(points: number, name = 'Sam') {
    playRound(points)
    highScores.save(name)
  }

  function chooseLevel(level: DifficultyLevel) {
    backToStart()
    while (mistakes.level !== level) mistakes.nextLevel()
  }

  return {
    screen,
    lifecycle,
    score,
    mistakes,
    highScores,
    listener,
    playRound,
    playAndSave,
    chooseLevel,
  }
}

describe('high scores key', () => {
  it('is different for each game', () => {
    expect(highScoresKey('emotions-rise')).toBe('attention-playground:high-scores:v2:emotions-rise')
    expect(highScoresKey('focus-attention')).not.toBe(highScoresKey('emotions-rise'))
  })
})

describe('names', () => {
  it.each([
    ['Sam', 'Sam'],
    ['  Sam  ', 'Sam'],
    ['Sam   the \t Great', 'Sam the Great'],
    ['   ', ''],
    ['', ''],
    ['A name far too long to show', 'A name far too l'],
    // Cut at 16, then trimmed.
    ['Fifteen letters x', 'Fifteen letters'],
    ['😀'.repeat(20), '😀'.repeat(16)],
  ])('%j is kept as %j', (name, kept) => {
    expect(cleanName(name)).toBe(kept)
  })

  it('are at most 16 characters', () => {
    expect(MAX_NAME_LENGTH).toBe(16)
  })
})

describe('reading saved high scores', () => {
  it('has none at any difficulty when nothing is saved', () => {
    expect(parseHighScores(null)).toEqual({ easy: [], medium: [], hard: [], extreme: [] })
  })

  it('reads the high scores of each difficulty, best first, keeping the best 10', () => {
    const easy = entries([3, 9, 1, 7, 5, 8, 2, 12, 4, 6, 10, 11])
    const saved = JSON.stringify({ easy, hard: [{ name: 'Ana', score: 4 }] })

    const read = parseHighScores(saved)

    expect(HIGH_SCORES_KEPT).toBe(10)
    expect(read.easy.map((entry) => entry.score)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
    expect(read.easy[0]).toEqual({ name: 'Player 8', score: 12 })
    expect(read).toMatchObject({ medium: [], hard: [{ name: 'Ana', score: 4 }], extreme: [] })
  })

  it('keeps equal scores in the order they were saved', () => {
    const saved = JSON.stringify({ easy: entries([5, 7, 5, 5]) })

    expect(parseHighScores(saved).easy.map((entry) => entry.name)).toEqual([
      'Player 2',
      'Player 1',
      'Player 3',
      'Player 4',
    ])
  })

  it.each(['not json', '{"easy": [1,', '', '42', '"text"', 'null', '[1, 2]'])(
    'has none when what is saved is not a table: %j',
    (saved) => {
      expect(parseHighScores(saved)).toEqual(emptyHighScores())
    },
  )

  it('leaves out anything that is not a high score, and keeps the rest', () => {
    const saved = JSON.stringify({
      easy: [
        { name: 'Ana', score: 4 },
        { name: 'Bo', score: 0 },
        { name: 'Cy', score: 0.5 },
        { name: 'Di', score: -3 },
        { name: 'Ed', score: '7' },
        { name: '   ', score: 8 },
        { name: 42, score: 9 },
        { score: 10 },
        { name: 'Fay' },
        7,
        null,
        'Gus',
        { name: '  Hal   Lee ', score: 1.5 },
      ],
      medium: 'lots',
      hard: { 0: { name: 'Ivy', score: 10 } },
      extreme: [
        { name: 'Jo', score: null },
        { name: 'Kim', score: 6 },
      ],
      unknownLevel: [{ name: 'Lu', score: 100 }],
    })

    expect(parseHighScores(saved)).toEqual({
      easy: [
        { name: 'Ana', score: 4 },
        { name: 'Hal Lee', score: 1.5 },
      ],
      medium: [],
      hard: [],
      extreme: [{ name: 'Kim', score: 6 }],
    })
  })

  it('leaves out a score too big to be a number (read as Infinity)', () => {
    const saved = '{"easy": [{"name": "Jo", "score": 1e400}, {"name": "Kim", "score": 6}]}'

    expect(parseHighScores(saved).easy).toEqual([{ name: 'Kim', score: 6 }])
  })

  it('reads scores saved as names and scores only, cutting names that are too long', () => {
    const saved = JSON.stringify({ easy: [{ name: 'x'.repeat(40), score: 3, extra: true }] })

    expect(parseHighScores(saved).easy).toEqual([{ name: 'x'.repeat(16), score: 3 }])
  })
})

describe('where a score goes among the high scores', () => {
  it('must be at least 1', () => {
    expect(MIN_HIGH_SCORE).toBe(1)
    expect(highScoreRank([], 0)).toBeUndefined()
    expect(highScoreRank([], 0.5)).toBeUndefined()
    expect(highScoreRank([], 1)).toBe(0)
  })

  it('is in order, best first, after the scores it equals', () => {
    const kept = entries([9, 5, 5, 2])

    expect(highScoreRank(kept, 10)).toBe(0)
    expect(highScoreRank(kept, 9)).toBe(1)
    expect(highScoreRank(kept, 5)).toBe(3)
    expect(highScoreRank(kept, 1)).toBe(4)
  })

  it('is nowhere when not above the last of 10', () => {
    const kept = entries([20, 18, 16, 14, 12, 10, 8, 6, 4, 2])

    expect(highScoreRank(kept, 2)).toBeUndefined()
    expect(highScoreRank(kept, 1)).toBeUndefined()
    expect(highScoreRank(kept, 3)).toBe(9)
  })
})

describe('adding a high score', () => {
  it('puts it where it goes, and tells where', () => {
    const added = addHighScore(table({ medium: entries([9, 5, 2]) }), 'medium', {
      name: 'Sam',
      score: 6,
    })

    expect(added.rank).toBe(1)
    expect(added.table.medium.map((entry) => entry.name)).toEqual([
      'Player 1',
      'Sam',
      'Player 2',
      'Player 3',
    ])
  })

  it('pushes the lowest out when 10 are kept', () => {
    const full = entries([20, 18, 16, 14, 12, 10, 8, 6, 4, 2])

    const added = addHighScore(table({ easy: full }), 'easy', { name: 'Sam', score: 7 })

    expect(added.rank).toBe(7)
    expect(added.table.easy.map((entry) => entry.score)).toEqual([
      20, 18, 16, 14, 12, 10, 8, 7, 6, 4,
    ])
  })

  it.each([0, 2])('leaves the table as it was when the score does not make it: %i', (score) => {
    const before = table({ easy: entries([20, 18, 16, 14, 12, 10, 8, 6, 4, 2]) })

    const added = addHighScore(before, 'easy', { name: 'Sam', score })

    expect(added.rank).toBeUndefined()
    expect(added.table).toBe(before)
  })

  it('only changes its own difficulty, and leaves the table given as it was', () => {
    const before = table({ easy: entries([3]), hard: entries([7]) })

    const added = addHighScore(before, 'hard', { name: 'Sam', score: 9 })

    expect(added.table).toEqual(
      table({ easy: entries([3]), hard: [{ name: 'Sam', score: 9 }, ...entries([7])] }),
    )
    expect(before).toEqual(table({ easy: entries([3]), hard: entries([7]) }))
  })
})

describe('high scores of a game', () => {
  it('starts with the high scores saved for this game only', () => {
    const storage = new FakeStorage()
    saveTable(storage, { easy: entries([4, 9]) })
    saveTable(storage, { easy: entries([50]) }, 'focus-attention')

    const { highScores } = setup({ storage })

    expect(highScores.table).toEqual(
      table({
        easy: [
          { name: 'Player 2', score: 9 },
          { name: 'Player 1', score: 4 },
        ],
      }),
    )
    expect(highScores.best('easy')).toEqual({ name: 'Player 2', score: 9 })
    expect(highScores.best('medium')).toBeUndefined()
    expect(highScores.lastRound).toBeUndefined()
  })

  it('tells how the round just over did, without counting it yet', () => {
    const storage = new FakeStorage()
    const { highScores, playRound, listener } = setup({ storage })

    playRound(5)

    expect(highScores.lastRound).toEqual({
      level: 'easy',
      score: 5,
      rank: 0,
      newBest: true,
      savedAs: undefined,
    })
    expect(canSave(highScores.lastRound)).toBe(true)
    expect(highScores.table).toEqual(emptyHighScores())
    expect(storage.items.size).toBe(0)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('counts a round once it is saved under a name, at the difficulty it was played at', () => {
    const storage = new FakeStorage()
    const { highScores, playAndSave, chooseLevel, listener } = setup({ storage })

    playAndSave(5, 'Ana')
    playAndSave(12, '  Bo  ')
    chooseLevel('hard')
    playAndSave(3, 'Cy')

    const expected = table({
      easy: [
        { name: 'Bo', score: 12 },
        { name: 'Ana', score: 5 },
      ],
      hard: [{ name: 'Cy', score: 3 }],
    })
    expect(highScores.table).toEqual(expected)
    expect(parseHighScores(storage.getItem(highScoresKey('emotions-rise')))).toEqual(expected)
    expect(highScores.lastRound).toEqual({
      level: 'hard',
      score: 3,
      rank: 0,
      newBest: true,
      savedAs: 'Cy',
    })
    expect(canSave(highScores.lastRound)).toBe(false)
    // Each round over, and each one saved.
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(6)
  })

  it('tells when a round beats every high score before it, and not when it only equals one', () => {
    const { highScores, playRound, playAndSave } = setup()
    const results = []

    for (const points of [5, 3, 5, 8]) {
      playAndSave(points)
      results.push(highScores.lastRound)
    }
    playRound(8)
    results.push(highScores.lastRound)

    expect(results.map((round) => [round?.rank, round?.newBest])).toEqual([
      [0, true],
      [1, false],
      [1, false],
      [0, true],
      [1, false],
    ])
  })

  it.each([0, 0.5])('never counts a round that ends below 1 point: %s', (points) => {
    const { highScores, playRound } = setup()

    playRound(points)

    expect(highScores.lastRound).toEqual({
      level: 'easy',
      score: points,
      rank: undefined,
      newBest: false,
      savedAs: undefined,
    })
    expect(canSave(highScores.lastRound)).toBe(false)
    expect(() => highScores.save('Sam')).toThrow('There is no high score to save')
    expect(highScores.table).toEqual(emptyHighScores())
  })

  it('does not let a round too low for the 10 kept be saved', () => {
    const storage = new FakeStorage()
    saveTable(storage, { easy: entries([20, 18, 16, 14, 12, 10, 8, 6, 4, 2]) })
    const { highScores, playRound } = setup({ storage })

    playRound(2)

    expect(highScores.lastRound?.rank).toBeUndefined()
    expect(() => highScores.save('Sam')).toThrow('There is no high score to save')
  })

  it('saves a round only once', () => {
    const { highScores, playAndSave } = setup()
    playAndSave(4)

    expect(() => highScores.save('Sam')).toThrow('There is no high score to save')
    expect(highScores.table.easy).toHaveLength(1)
  })

  it('does not save before any round is over', () => {
    const { highScores } = setup()

    expect(() => highScores.save('Sam')).toThrow('There is no high score to save')
  })

  it.each(['', '   '])('needs a name to save: %j', (name) => {
    const { highScores, playRound } = setup()
    playRound(4)

    expect(() => highScores.save(name)).toThrow('A high score needs a name')
    expect(canSave(highScores.lastRound)).toBe(true)
  })

  it('keeps the high scores for the next time the game is opened', () => {
    const storage = new FakeStorage()
    setup({ storage }).playAndSave(6, 'Ana')

    const { highScores } = setup({ storage })

    expect(highScores.best('easy')).toEqual({ name: 'Ana', score: 6 })
  })

  it('keeps each game’s high scores apart', () => {
    const storage = new FakeStorage()
    setup({ gameId: 'emotions-rise', storage }).playAndSave(6)

    const other = setup({ gameId: 'shift-perspective', storage })
    other.playAndSave(2)

    expect(other.highScores.table.easy.map((entry) => entry.score)).toEqual([2])
    expect(setup({ storage }).highScores.table.easy.map((entry) => entry.score)).toEqual([6])
  })

  it('counts the score the round ended on, not points added after', () => {
    const { highScores, score, playRound } = setup()

    playRound(4)
    score.add(10)
    highScores.save('Sam')

    expect(highScores.table.easy).toEqual([{ name: 'Sam', score: 4 }])
  })

  it('forgets a round not saved once the player moves on', () => {
    const { highScores, lifecycle, listener, playRound } = setup()
    playRound(3)
    expect(listener).toHaveBeenCalledOnce()

    lifecycle.restart()

    expect(highScores.lastRound).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(() => highScores.save('Sam')).toThrow('There is no high score to save')
    expect(highScores.table).toEqual(emptyHighScores())

    // Nothing more to forget when the next round starts.
    lifecycle.start()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not count rounds restarted from the pause menu', () => {
    const { highScores, lifecycle, score, listener } = setup()

    lifecycle.start()
    score.add(20)
    lifecycle.pause()
    lifecycle.restart()

    expect(highScores.lastRound).toBeUndefined()
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not count a round left unfinished for another screen', () => {
    const { highScores, lifecycle, score, screen } = setup()

    lifecycle.start()
    score.add(20)
    screen.abort()

    expect(highScores.lastRound).toBeUndefined()
  })

  it('keeps high scores saved in another tab', () => {
    const storage = new FakeStorage()
    const thisTab = setup({ storage })
    const otherTab = setup({ storage })

    otherTab.playAndSave(7, 'Other')
    thisTab.playRound(3)
    // Another tab's round counts when telling how this one did.
    expect(thisTab.highScores.lastRound).toMatchObject({ rank: 1, newBest: false })
    otherTab.playAndSave(5, 'Other again')
    thisTab.highScores.save('This')

    const saved = ['Other', 'Other again', 'This']
    expect(thisTab.highScores.table.easy.map((entry) => entry.name)).toEqual(saved)
    expect(thisTab.highScores.lastRound?.rank).toBe(2)
    expect(setup({ storage }).highScores.table.easy.map((entry) => entry.name)).toEqual(saved)
  })

  it('tells when another tab pushed the round out of the 10 before it was saved', () => {
    const storage = new FakeStorage()
    saveTable(storage, { easy: entries([20, 18, 16, 14, 12, 10, 8, 6, 4]) })
    const { highScores, playRound } = setup({ storage })
    playRound(3)
    expect(highScores.lastRound?.rank).toBe(9)
    saveTable(storage, { easy: entries([20, 18, 16, 14, 12, 10, 8, 6, 4, 5]) })
    const setItem = vi.spyOn(storage, 'setItem')

    highScores.save('Sam')

    expect(highScores.lastRound).toMatchObject({ rank: undefined, savedAs: 'Sam' })
    expect(setItem).not.toHaveBeenCalledWith(highScoresKey('emotions-rise'), expect.anything())
  })

  it('overwrites high scores saved in a form it cannot read', () => {
    const storage = new FakeStorage()
    storage.setItem(highScoresKey('emotions-rise'), '{broken')
    const { highScores, playAndSave } = setup({ storage })
    expect(highScores.table).toEqual(emptyHighScores())

    playAndSave(2)

    expect(parseHighScores(storage.getItem(highScoresKey('emotions-rise')))).toEqual(
      table({ easy: [{ name: 'Sam', score: 2 }] }),
    )
  })
})

describe('the name to suggest', () => {
  it('is none before any high score is saved', () => {
    expect(setup().highScores.playerName).toBe('')
  })

  it('is the last name saved, in any game', () => {
    const storage = new FakeStorage()
    const first = setup({ storage })
    first.playAndSave(3, '  Ana  ')
    expect(first.highScores.playerName).toBe('Ana')
    expect(storage.getItem(PLAYER_NAME_KEY)).toBe('Ana')

    setup({ gameId: 'focus-attention', storage }).playAndSave(3, 'Bo')

    expect(setup({ storage }).highScores.playerName).toBe('Bo')
  })

  it('is read as any other name, cut short and trimmed', () => {
    const storage = new FakeStorage()
    storage.setItem(PLAYER_NAME_KEY, `  ${'y'.repeat(30)}`)

    expect(setup({ storage }).highScores.playerName).toBe('y'.repeat(16))
  })
})

describe('high scores when the browser will not store them', () => {
  it('keeps them until the game is left when nothing can be read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage: ScoreStorage = {
      getItem: () => {
        throw new Error('Storage is off')
      },
      setItem: vi.fn(),
    }
    const { highScores, playAndSave } = setup({ storage })

    playAndSave(4, 'Ana')
    playAndSave(6, 'Bo')

    expect(highScores.table.easy).toEqual([
      { name: 'Bo', score: 6 },
      { name: 'Ana', score: 4 },
    ])
    expect(highScores.lastRound?.newBest).toBe(true)
    expect(highScores.playerName).toBe('Bo')
    expect(warn).toHaveBeenCalledWith('Could not read the saved high scores', expect.any(Error))
  })

  it('keeps them until the game is left when nothing can be saved', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = new FakeStorage()
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    const { highScores, playAndSave } = setup({ storage })

    expect(() => playAndSave(4)).not.toThrow()

    expect(highScores.table.easy).toEqual([{ name: 'Sam', score: 4 }])
    expect(highScores.lastRound).toMatchObject({ rank: 0, savedAs: 'Sam' })
    expect(warn).toHaveBeenCalledWith(
      'Could not save the high scores; they are kept until you leave the game',
      expect.any(DOMException),
    )
  })

  it('keeps them until the game is left when there is no storage', () => {
    // A page without localStorage.
    vi.stubGlobal('window', {})
    const { highScores, playAndSave } = setup({ useDefaultStorage: true })

    playAndSave(4)
    playAndSave(1)

    expect(highScores.table.easy.map((entry) => entry.score)).toEqual([4, 1])
    expect(highScores.playerName).toBe('Sam')
  })
})

describe('where high scores are kept', () => {
  it("is the browser's localStorage by default", () => {
    const localStorage = new FakeStorage()
    vi.stubGlobal('window', { localStorage })
    const { playAndSave } = setup({ useDefaultStorage: true })

    playAndSave(5)

    expect(parseHighScores(localStorage.getItem(highScoresKey('emotions-rise'))).easy).toEqual([
      { name: 'Sam', score: 5 },
    ])
  })

  it('is nowhere (but the game goes on) when the browser blocks localStorage', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new DOMException('Blocked', 'SecurityError')
      },
    })
    const { highScores, playAndSave } = setup({ useDefaultStorage: true })

    playAndSave(5)

    expect(highScores.table.easy).toEqual([{ name: 'Sam', score: 5 }])
  })
})
