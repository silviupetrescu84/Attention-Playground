import { LARGE_OVAL, ovalOfWidth } from '../shared/artwork'
import type { CanvasButton } from '../shared/canvas-button'
import type { BubbleSize } from '../shared/canvas-style'
import { GAME_HEIGHT, GAME_WIDTH, type GamePoint } from '../shared/game-canvas'
import { GAME_BAR_HEIGHT } from '../shared/game-hud'
import type { Box } from '../shared/geometry'
import { gapBetweenOvals, randomLayout } from '../shared/placing'
import type { Random } from '../shared/random'

/**
 * Where things are in Remember Gratitude, and how big.
 *
 * The Done button is in the middle at the bottom of the canvas. The things
 * are in ovals (the one from Emotions Rise) at random places above it, each
 * at least THING_GAP from the others, border to border, and EDGE_GAP from the
 * score bar, the edges and the button. Up to FULL_SIZE_UP_TO things, the ovals
 * are as big as the large oval; with more, each more makes them all
 * SHRINK_BY narrower, so MOST_THINGS keep their gaps with room to spare.
 * When no such places are found, they go in some of the FALLBACK_SPOTS.
 */

/** The most things a turn can have: as many as the places that always fit. */
export const MOST_THINGS = 8

/** The Done button: in the middle, at the bottom of the canvas. */
const DONE_WIDTH = 160
const DONE_HEIGHT = 60
const DONE_MARGIN = 12
export const DONE_BUTTON: CanvasButton = {
  label: 'Done',
  x: (GAME_WIDTH - DONE_WIDTH) / 2,
  y: GAME_HEIGHT - DONE_MARGIN - DONE_HEIGHT,
  width: DONE_WIDTH,
  height: DONE_HEIGHT,
}

/** Space always kept between two things, border to border… */
export const THING_GAP = 12
/** …and between a thing and the score bar, the edges of the canvas and the Done button. */
export const EDGE_GAP = 4

/** Ovals are as big as the large oval up to this many things… */
export const FULL_SIZE_UP_TO = 5
/** …and this much narrower for each thing more. */
export const SHRINK_BY = 8

/** Tries at laying out all the things… */
export const LAYOUT_TRIES = 60
/** …and random places tried for each, in each try. */
export const PLACE_TRIES = 150

/** How big the ovals are when a turn has `count` things. */
export function ovalFor(count: number): BubbleSize {
  return OVALS[Math.min(count, MOST_THINGS)]
}

/** Each size once, so every turn with as many things shares one (and its text style). */
const OVALS: readonly BubbleSize[] = Array.from({ length: MOST_THINGS + 1 }, (_, count) =>
  ovalOfWidth(LARGE_OVAL.width - SHRINK_BY * Math.max(0, count - FULL_SIZE_UP_TO)),
)

/** Where the things are: between the score bar and the Done button. */
export const THINGS_AREA: Box = {
  left: 0,
  right: GAME_WIDTH,
  top: GAME_BAR_HEIGHT,
  bottom: DONE_BUTTON.y,
}

/** Where the centre of an oval of `size` can be, EDGE_GAP inside THINGS_AREA. */
export function centresAreaFor({ width, height }: BubbleSize): Box {
  return {
    left: THINGS_AREA.left + width / 2 + EDGE_GAP,
    right: THINGS_AREA.right - width / 2 - EDGE_GAP,
    top: THINGS_AREA.top + height / 2 + EDGE_GAP,
    bottom: THINGS_AREA.bottom - height / 2 - EDGE_GAP,
  }
}

/** Eight places that always fit, for ovals up to the large one: two columns of four. */
export const FALLBACK_SPOTS: readonly GamePoint[] = [1, 3, 5, 7].flatMap((row) =>
  [GAME_WIDTH / 4, (GAME_WIDTH * 3) / 4].map((x) => ({
    x,
    y: THINGS_AREA.top + ((THINGS_AREA.bottom - THINGS_AREA.top) * row) / 8,
  })),
)

/** Random places for `count` ovals of `size` (see the rules at the top). */
export function placeThings(count: number, size: BubbleSize, random: Random): GamePoint[] {
  return randomLayout(count, random, {
    area: centresAreaFor(size),
    rules: [
      (spot, placed) => placed.every((other) => gapBetweenOvals(spot, other, size) >= THING_GAP),
    ],
    layoutTries: LAYOUT_TRIES,
    placeTries: PLACE_TRIES,
    fallback: FALLBACK_SPOTS,
  })
}
