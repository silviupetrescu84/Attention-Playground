import type { DifficultyConfig } from '../config/difficulty'

/**
 * The difficulty tests play the games with, in place of
 * src/config/difficulty.json (see vite.config.ts): the numbers the tests were
 * written for, so tuning the games there does not break them. Only change
 * these along with the tests that rely on them.
 */
const PINNED_DIFFICULTY: DifficultyConfig = {
  mistakesToFail: { easy: 10, medium: 6, hard: 3, extreme: 1 },
  emotionsRise: {
    speed: { min: 40, max: 80 },
    spawnDelayMs: { min: 700, max: 1_500 },
    harderByTimeMs: [
      { from: 20_000, percent: 10 },
      { from: 40_000, percent: 25 },
      { from: 60_000, percent: 45 },
      { from: 80_000, percent: 70 },
      { from: 100_000, percent: 110 },
    ],
  },
  alignTheActions: {
    rowSpeedByGoals: {
      start: 60,
      steps: [
        { from: 3, value: 80 },
        { from: 6, value: 105 },
        { from: 9, value: 135 },
        { from: 12, value: 170 },
        { from: 15, value: 210 },
      ],
    },
  },
  shiftPerspective: {
    readingMs: 3_000,
    choicesByThoughts: {
      start: 2,
      steps: [
        { from: 3, value: 3 },
        { from: 7, value: 4 },
        { from: 15, value: 5 },
        { from: 25, value: 6 },
      ],
    },
    timeToChooseMsByThoughts: { start: 10_000, change: -500, every: 10, limit: 5_000 },
  },
  focusAttention: {
    speedByTimeMs: {
      start: 15,
      steps: [
        { from: 10_000, value: 17.5 },
        { from: 20_000, value: 22.5 },
        { from: 30_000, value: 30 },
        { from: 40_000, value: 40 },
        { from: 50_000, value: 52.5 },
        { from: 60_000, value: 65 },
      ],
    },
    spawnDelayMsByTimeMs: {
      start: 3_000,
      steps: [
        { from: 70_000, value: 2_800 },
        { from: 80_000, value: 2_600 },
        { from: 90_000, value: 2_400 },
        { from: 100_000, value: 2_000 },
      ],
    },
  },
  breakItDown: {
    readingMs: 3_000,
    actionsByGoals: { start: 2, change: 1, every: 2, limit: 6 },
    timeToChooseMsByGoals: { start: 10_000, change: -500, every: 2, limit: 5_000 },
  },
  pauseBeforeReacting: {
    mostOnScreen: 5,
    spawnDelayMsBySituations: { start: 3_000, change: -100, every: 10, limit: 2_000 },
  },
  improveInnerVoice: {
    spawnDelayMsByWords: { start: 3_000, change: -100, every: 10, limit: 2_000 },
    fallSpeedByWords: { start: 40, change: 10, every: 10, limit: 140 },
    padSpeed: { start: 60, max: 80, accelerationPerS: 10 },
    goodInARowToEmpower: 3,
  },
}

export default PINNED_DIFFICULTY
