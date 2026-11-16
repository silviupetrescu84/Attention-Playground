import { beforeAll, describe, expect, it } from 'vitest'
import { expectTextsInside } from '../test/text-fit'
import alignData from './align-the-actions/data/align-the-actions.json'
import { ACTION_TEXT_FIT, GOAL_TEXT_FIT } from './align-the-actions/draw'
import { goalsFrom as alignGoalsFrom } from './align-the-actions/goals'
import breakItDownData from './break-it-down/data/break-it-down.json'
import { GOAL_TEXT } from './break-it-down/draw'
import { distractionsFrom, goalsFrom } from './break-it-down/goals'
import { games } from './catalog'
import emotions from './emotions-rise/data/emotions.json'
import { EMOTION_TEXT_FIT } from './emotions-rise/draw'
import focusData from './focus-attention/data/focus-attention.json'
import { BUTTON_TEXT_FIT, loadProjectorImage, WORD_TEXT_FIT } from './focus-attention/draw'
import { BUTTONS } from './focus-attention/focus-attention'
import innerVoiceData from './improve-inner-voice/data/improve-inner-voice.json'
import { PAD_LABEL, PAD_TEXT_FIT, WORD_TEXT } from './improve-inner-voice/draw'
import { wordsFrom } from './improve-inner-voice/words'
import pauseData from './pause-before-reacting/data/pause-before-reacting.json'
import { situationsFrom } from './pause-before-reacting/situations'
import gratitudeData from './remember-gratitude/data/remember-gratitude.json'
import { DONE_TEXT_FIT } from './remember-gratitude/draw'
import { DONE_BUTTON, MOST_THINGS, ovalFor } from './remember-gratitude/layout'
import { thingsFrom } from './remember-gratitude/things'
import {
  LARGE_OVAL_TEXT,
  loadGreenBubbleImage,
  loadOvalImage,
  ovalTextShape,
} from './shared/artwork'
import { readCssVariables } from './shared/canvas-style'
import {
  CANVAS_FONT,
  chooseTextStyle,
  fitFontSize,
  fontAt,
  largestTextStyle,
  loadCanvasFont,
  READABLE_SIZE,
  textsFit,
  type CanvasFont,
  type TextFit,
  type TextShape,
} from './shared/text'
import data from './shift-perspective/data/shift-perspective.json'
import { CHOICE_TEXT_FIT, loadBubbleImage, THOUGHT_TEXT_FIT } from './shift-perspective/draw'
import { thoughtsFrom } from './shift-perspective/thoughts'
import { BALL_SIZE } from './stay-in-the-zone/ball'
import { BALL_LOOK, loadBallImage } from './stay-in-the-zone/draw'
// The canvas font, as the games set it.
import './shared/game.css'

/**
 * What only a real browser shows: texts measured in the real font (the unit
 * tests measure with a made-up one), and the artwork as it really loads.
 */

let context: CanvasRenderingContext2D
let font: CanvasFont

beforeAll(async () => {
  const canvas = document.createElement('canvas').getContext('2d')
  if (!canvas) throw new Error('Canvas 2D drawing is not supported')
  context = canvas
  font = readCssVariables(document.documentElement, CANVAS_FONT)
  await loadCanvasFont()
})

describe('the canvas font', () => {
  it('is the bundled Roboto Condensed, loaded and ready to draw with', () => {
    expect(font.family).toContain('Roboto Condensed')
    expect(document.fonts.check(fontAt(font, 16))).toBe(true)
  })
})

const breakItDown = goalsFrom(breakItDownData)
const pause = situationsFrom(pauseData)
const thoughts = thoughtsFrom(data)
const alignGoals = alignGoalsFrom(alignData)

describe('texts in the real font', () => {
  // Each kind of text, at the one size chosen for all of it: it must fit
  // without shrinking to the smallest size.
  it.each<[string, readonly string[], TextFit]>([
    ['emotions', [...emotions.positive, ...emotions.negative], EMOTION_TEXT_FIT],
    ['Align the Actions goals', alignGoals.map((goal) => goal.title), GOAL_TEXT_FIT],
    [
      'Align the Actions actions',
      alignGoals.flatMap((goal) => [...goal.aligned, ...goal.against]),
      ACTION_TEXT_FIT,
    ],
    ['thoughts', thoughts.map((thought) => thought.text), THOUGHT_TEXT_FIT],
    [
      'ways to see thoughts',
      thoughts.flatMap((thought) => [...thought.good, ...thought.bad]),
      CHOICE_TEXT_FIT,
    ],
    ['values and anti-values', [...focusData.values, ...focusData.antiValues], WORD_TEXT_FIT],
    ['Focus Attention buttons', BUTTONS.map((button) => button.label), BUTTON_TEXT_FIT],
    ['the Improve Inner Voice pad', [PAD_LABEL], PAD_TEXT_FIT],
    ['the Remember Gratitude Done button', [DONE_BUTTON.label], DONE_TEXT_FIT],
  ])('fit: %s', (_kind, texts, fit) => {
    const size = fitFontSize(context, font, texts, fit)

    expect(size).toBeGreaterThan(fit.minSize)
    expect(textsFit(context, font, texts, size, fit)).toBe(true)
  })

  // Goals, actions and situations, in their bubbles and ovals: on 2 lines, at
  // a readable size, every corner of every line inside.
  it.each<[string, readonly string[], TextShape]>([
    ['Break It Down goals', breakItDown.map((goal) => goal.title), GOAL_TEXT],
    [
      'Break It Down actions',
      [...breakItDown.flatMap((goal) => goal.actions), ...distractionsFrom(breakItDownData)],
      LARGE_OVAL_TEXT,
    ],
    ['situations', [...pause.good, ...pause.bad], LARGE_OVAL_TEXT],
  ])('fit, readable on 2 lines: %s', (_kind, texts, shape) => {
    const { fontSize, fit } = chooseTextStyle(context, font, texts, shape)

    expect(fit.maxLines).toBe(2)
    expect(fontSize).toBeGreaterThanOrEqual(READABLE_SIZE)
    expectTextsInside(context, font, texts, shape)
  })
})

describe('things to remember in the real font', () => {
  const gratitude = thingsFrom(gratitudeData)
  const texts = [...gratitude.good, ...gratitude.bad]

  // From the largest ovals (up to 5 things) to the smallest (8 things).
  it.each(Array.from({ length: MOST_THINGS - 1 }, (_, i) => i + 2))(
    'fit, readable, in the ovals of turns of %i',
    (count) => {
      const shape = ovalTextShape(ovalFor(count))
      const { fontSize } = chooseTextStyle(context, font, texts, shape)

      expect(fontSize).toBeGreaterThanOrEqual(READABLE_SIZE)
      expectTextsInside(context, font, texts, shape)
    },
  )
})

describe('single words in the real font', () => {
  it('fit on one line in the small ovals of Improve Inner Voice', () => {
    const { good, bad } = wordsFrom(innerVoiceData)
    const texts = [...good, ...bad]

    const { fontSize, fit } = largestTextStyle(context, font, texts, WORD_TEXT, 1)

    // As small as needed, but no smaller: 13 px, measured.
    expect(fontSize).toBe(13)
    expect(textsFit(context, font, texts, fontSize, fit)).toBe(true)
  })

  it('fit on the Improve Inner Voice pad at its largest size, 15 px', () => {
    expect(fitFontSize(context, font, [PAD_LABEL], PAD_TEXT_FIT)).toBe(PAD_TEXT_FIT.maxSize)
  })
})

describe('the artwork', () => {
  it.each([
    ['the oval', loadOvalImage, [280, 154]],
    ['the green bubble', loadGreenBubbleImage, [300, 300]],
    ['the purple bubble', loadBubbleImage, [300, 300]],
    ['the projector', loadProjectorImage, [500, 500]],
    ['the ball', loadBallImage, [1024, 1024]],
  ] as const)('loads %s at its real size', async (_name, load, size) => {
    const image = await load()

    expect([image.naturalWidth, image.naturalHeight]).toEqual(size)
  })

  it('draws the ball 60 px across as seen, its glow left out', async () => {
    const image = await loadBallImage()
    const size = 120
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const drawing = canvas.getContext('2d')
    if (!drawing) throw new Error('Canvas 2D drawing is not supported')
    const { width, height } = BALL_LOOK
    drawing.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
    const { data } = drawing.getImageData(0, 0, size, size)
    const seen = (x: number, y: number) => data[(y * size + x) * 4 + 3] > 128

    // Across the middle, and down it: the pixels the ball covers, as seen.
    const middle = size / 2
    const across = Array.from({ length: size }, (_, x) => x).filter((x) => seen(x, middle))
    const down = Array.from({ length: size }, (_, y) => y).filter((y) => seen(middle, y))

    expect(across.length).toBeCloseTo(BALL_SIZE, -0.5)
    expect(down.length).toBeCloseTo(BALL_SIZE, -0.5)
  })

  it.each(games.map((game) => [game.name, game.icon]))(
    'has a home screen icon for %s',
    async (_name, icon) => {
      const image = new Image()
      image.src = icon
      await image.decode()

      expect([image.naturalWidth, image.naturalHeight]).toEqual([600, 600])
    },
  )
})
