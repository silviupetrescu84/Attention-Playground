/**
 * `compute`, remembering what it gives for each key for as long as the key
 * exists: it runs once per key, however often it is asked. Used to lay out
 * texts once per turn, row or goal, not on every frame.
 */
export function remember<Key extends object, Value>(
  compute: (key: Key) => Value,
): (key: Key) => Value {
  // Each value in a box of its own, so `undefined` can be remembered too.
  const remembered = new WeakMap<Key, { readonly value: Value }>()

  return (key) => {
    let box = remembered.get(key)

    if (!box) {
      box = { value: compute(key) }
      remembered.set(key, box)
    }

    return box.value
  }
}
