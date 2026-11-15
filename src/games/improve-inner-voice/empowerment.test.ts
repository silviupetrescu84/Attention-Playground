import { describe, expect, it } from 'vitest'
import { createEmpowerment, GOOD_IN_A_ROW_TO_EMPOWER } from './empowerment'

function empoweredOne() {
  const empowerment = createEmpowerment()
  for (let i = 0; i < GOOD_IN_A_ROW_TO_EMPOWER; i++) empowerment.caughtGood()
  return empowerment
}

describe('being empowered', () => {
  it('takes 3 good words caught in a row', () => {
    const empowerment = createEmpowerment()
    expect(GOOD_IN_A_ROW_TO_EMPOWER).toBe(3)

    empowerment.caughtGood()
    empowerment.caughtGood()
    expect([empowerment.goodInARow, empowerment.empowered]).toEqual([2, false])

    empowerment.caughtGood()
    expect([empowerment.goodInARow, empowerment.empowered]).toEqual([3, true])
  })

  it('stays on as more good words are caught', () => {
    const empowerment = empoweredOne()

    empowerment.caughtGood()

    expect([empowerment.goodInARow, empowerment.empowered]).toEqual([4, true])
  })

  it('does not forgive a mistake before then, and starts the run again', () => {
    const empowerment = createEmpowerment()
    empowerment.caughtGood()
    empowerment.caughtGood()

    expect(empowerment.forgive()).toBe(false)
    expect(empowerment.goodInARow).toBe(0)

    empowerment.caughtGood()
    empowerment.caughtGood()
    expect(empowerment.empowered).toBe(false)
  })

  it('forgives the next mistake, which ends it: 3 more in a row are needed', () => {
    const empowerment = empoweredOne()

    expect(empowerment.forgive()).toBe(true)
    expect([empowerment.goodInARow, empowerment.empowered]).toEqual([0, false])
    expect(empowerment.forgive()).toBe(false)

    empowerment.caughtGood()
    empowerment.caughtGood()
    expect(empowerment.empowered).toBe(false)
    empowerment.caughtGood()
    expect(empowerment.empowered).toBe(true)
  })

  it('starts afresh for a new round', () => {
    const empowerment = empoweredOne()

    empowerment.reset()

    expect([empowerment.goodInARow, empowerment.empowered]).toEqual([0, false])
  })
})
