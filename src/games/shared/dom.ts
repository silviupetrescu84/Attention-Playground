/** Finding elements on the page, shared by the app and every minigame. */

/**
 * The element matching `selector` in `parent`, which must be a `type` (e.g.
 * `HTMLButtonElement`). Throws if there is none, or it is another kind: the
 * page is not as the code expects.
 */
export function findElement<Type extends Element>(
  parent: ParentNode,
  selector: string,
  type: new () => Type,
): Type {
  const found = parent.querySelector(selector)

  if (!(found instanceof type)) {
    throw new Error(`Missing ${selector} element`)
  }

  return found
}
