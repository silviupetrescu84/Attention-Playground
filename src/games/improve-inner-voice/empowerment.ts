import { DIFFICULTY } from '../../config/difficulty'
import { checkWholeNumber } from '../shared/checks'

/**
 * Being empowered, in Improve Inner Voice: catching GOOD_IN_A_ROW_TO_EMPOWER
 * good words in a row empowers the player, and the next mistake (a bad word
 * caught, or a good one missed) is forgiven instead of counted, which ends
 * it: they then need as many in a row again. A mistake counted starts the
 * run again from none. Letting a bad word fall changes nothing.
 */

/** See config/difficulty.json. */
export const GOOD_IN_A_ROW_TO_EMPOWER = DIFFICULTY.improveInnerVoice.goodInARowToEmpower
checkWholeNumber(GOOD_IN_A_ROW_TO_EMPOWER, 'improveInnerVoice.goodInARowToEmpower', 1)

export interface Empowerment {
  readonly empowered: boolean
  /** Good words caught in a row since the last mistake (forgiven or not). */
  readonly goodInARow: number
  /** A good word was caught. */
  caughtGood(): void
  /**
   * A mistake was made: whether it is forgiven (when empowered, which it
   * ends). Either way, the run of good words starts again.
   */
  forgive(): boolean
  /** Back to not empowered, with no good words in a row, for a new round. */
  reset(): void
}

export function createEmpowerment(): Empowerment {
  let goodInARow = 0
  let empowered = false

  return {
    get empowered() {
      return empowered
    },
    get goodInARow() {
      return goodInARow
    },
    caughtGood() {
      goodInARow++
      empowered ||= goodInARow >= GOOD_IN_A_ROW_TO_EMPOWER
    },
    forgive() {
      const forgiven = empowered
      goodInARow = 0
      empowered = false
      return forgiven
    },
    reset() {
      goodInARow = 0
      empowered = false
    },
  }
}
