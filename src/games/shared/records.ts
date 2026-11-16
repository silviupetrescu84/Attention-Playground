/** Choices from a fixed list (the difficulties, the paces…), shared by every minigame. */

/** A value for each of `keys`: `valueFor` it. */
export function recordOf<Key extends string, Value>(
  keys: readonly Key[],
  valueFor: (key: Key) => Value,
): Record<Key, Value> {
  const entries = keys.map((key) => [key, valueFor(key)])
  // Object.fromEntries loses the keys' type; these are exactly `keys`.
  return Object.fromEntries(entries) as Record<Key, Value>
}

/** The one after `current` in `choices`, back to the first after the last. */
export function nextChoice<Choice>(choices: readonly Choice[], current: Choice): Choice {
  return choices[(choices.indexOf(current) + 1) % choices.length]
}
