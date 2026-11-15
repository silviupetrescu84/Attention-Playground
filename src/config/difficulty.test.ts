import { afterEach, describe, expect, it, vi } from 'vitest'
import pinned from '../test/pinned-difficulty'
import { DIFFICULTY, type DifficultyConfig } from './difficulty'
import real from './difficulty.json'

afterEach(() => {
  vi.doUnmock('./difficulty')
  vi.resetModules()
})

/** Loads every game afresh, as the app does, with `config` as the difficulty. */
async function loadGamesWith(config: DifficultyConfig) {
  vi.doMock('./difficulty', () => ({ DIFFICULTY: config }))
  vi.resetModules()
  await import('../games/catalog')
  await import('../games/shared/mistakes')
}

/** The pinned difficulty, with the setting at `path` ("a.b.c") set to `value`. */
function pinnedWith(path: string, value: unknown): DifficultyConfig {
  const config = structuredClone(pinned)
  const keys = path.split('.')
  const last = keys.pop()!
  let parent = config as unknown as Record<string, unknown>
  for (const key of keys) {
    parent = parent[key] as Record<string, unknown>
  }
  expect(parent, path).toHaveProperty(last)
  parent[last] = value
  return config
}

describe('the difficulty', () => {
  it('is pinned in tests, so tuning the games does not break them', () => {
    expect(DIFFICULTY).toBe(pinned)
  })

  it('in difficulty.json works in every game', async () => {
    await expect(loadGamesWith(real)).resolves.toBeUndefined()
  })

  it.each<[string, unknown, string]>([
    ['mistakesToFail.hard', 0, 'mistakesToFail.hard must be a whole number ≥ 1, got 0'],
    ['emotionsRise.speed.min', 0, 'emotionsRise.speed.min must be a finite number > 0, got 0'],
    ['emotionsRise.speed.max', 30, 'emotionsRise.speed.max must be ≥ its min (40), got 30'],
    [
      'emotionsRise.spawnDelayMs.min',
      -1,
      'emotionsRise.spawnDelayMs.min must be a finite number > 0, got -1',
    ],
    [
      'emotionsRise.spawnDelayMs.max',
      600,
      'emotionsRise.spawnDelayMs.max must be ≥ its min (700), got 600',
    ],
    [
      'emotionsRise.harderByTimeMs',
      [{ from: 1_000, percent: -5 }],
      'emotionsRise.harderByTimeMs[0].percent must be a finite number ≥ 0, got -5',
    ],
    [
      'alignTheActions.rowSpeedByGoals.start',
      0,
      'alignTheActions.rowSpeedByGoals.start must be a finite number > 0, got 0',
    ],
    [
      'shiftPerspective.readingMs',
      -1,
      'shiftPerspective.readingMs must be a finite number ≥ 0, got -1',
    ],
    [
      'shiftPerspective.choicesByThoughts.start',
      7,
      'shiftPerspective.choicesByThoughts.start must be a whole number from 2 to 6, got 7',
    ],
    [
      'shiftPerspective.timeToChooseMsByThoughts.limit',
      0,
      'shiftPerspective.timeToChooseMsByThoughts.limit must be a finite number > 0, got 0',
    ],
    [
      'focusAttention.speedByTimeMs.start',
      0,
      'focusAttention.speedByTimeMs.start must be a finite number > 0, got 0',
    ],
    [
      'focusAttention.spawnDelayMsByTimeMs.start',
      0,
      'focusAttention.spawnDelayMsByTimeMs.start must be a finite number > 0, got 0',
    ],
    ['breakItDown.readingMs', -1, 'breakItDown.readingMs must be a finite number ≥ 0, got -1'],
    [
      'breakItDown.actionsByGoals.limit',
      7,
      'breakItDown.actionsByGoals.limit must be a whole number from 2 to 6, got 7',
    ],
    [
      'breakItDown.actionsByGoals.change',
      0.5,
      'breakItDown.actionsByGoals.change must be a whole number, got 0.5',
    ],
    [
      'breakItDown.timeToChooseMsByGoals.every',
      0,
      'breakItDown.timeToChooseMsByGoals.every must be a whole number ≥ 1, got 0',
    ],
    [
      'pauseBeforeReacting.mostOnScreen',
      0,
      'pauseBeforeReacting.mostOnScreen must be a whole number ≥ 1, got 0',
    ],
    [
      'pauseBeforeReacting.spawnDelayMsBySituations.limit',
      4_000,
      'pauseBeforeReacting.spawnDelayMsBySituations goes down (change -100), so its limit ' +
        'must be ≤ its start (3000), got 4000',
    ],
    [
      'improveInnerVoice.spawnDelayMsByWords.start',
      0,
      'improveInnerVoice.spawnDelayMsByWords.start must be a finite number > 0, got 0',
    ],
    [
      'improveInnerVoice.fallSpeedByWords.limit',
      0,
      'improveInnerVoice.fallSpeedByWords.limit must be a finite number > 0, got 0',
    ],
    [
      'improveInnerVoice.padSpeed.start',
      0,
      'improveInnerVoice.padSpeed.start must be a finite number > 0, got 0',
    ],
    [
      'improveInnerVoice.padSpeed.max',
      50,
      'improveInnerVoice.padSpeed.max must be ≥ its start (60), got 50',
    ],
    [
      'improveInnerVoice.padSpeed.accelerationPerS',
      -1,
      'improveInnerVoice.padSpeed.accelerationPerS must be a finite number ≥ 0, got -1',
    ],
    [
      'improveInnerVoice.goodInARowToEmpower',
      0,
      'improveInnerVoice.goodInARowToEmpower must be a whole number ≥ 1, got 0',
    ],
  ])('stops the app loading if %s is %j, naming it', async (path, value, message) => {
    await expect(loadGamesWith(pinnedWith(path, value))).rejects.toThrow(new RangeError(message))
  })

  it('stops the app loading if a setting is missing', async () => {
    await expect(
      loadGamesWith(pinnedWith('improveInnerVoice.padSpeed.max', undefined)),
    ).rejects.toThrow(
      new RangeError('improveInnerVoice.padSpeed.max must be ≥ its start (60), got undefined'),
    )
  })
})
