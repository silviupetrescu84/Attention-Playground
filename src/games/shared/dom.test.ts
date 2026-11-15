// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { findElement } from './dom'

describe('findElement', () => {
  const parent = document.createElement('div')
  parent.innerHTML = '<p class="text">Hi</p><button class="go" type="button">Go</button>'

  it('finds the element of the kind asked for', () => {
    const button = findElement(parent, '.go', HTMLButtonElement)

    expect(button.textContent).toBe('Go')
    expect(findElement(parent, '.text', HTMLElement).tagName).toBe('P')
  })

  it('throws when there is none, or it is another kind', () => {
    expect(() => findElement(parent, '.missing', HTMLElement)).toThrow('Missing .missing element')
    expect(() => findElement(parent, '.text', HTMLButtonElement)).toThrow('Missing .text element')
  })
})
