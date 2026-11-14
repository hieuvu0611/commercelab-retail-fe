/** Specs are edited as one "Name: value" per line. */
export function specsToText(specs: Record<string, string>): string {
  return Object.entries(specs)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n')
}

export function specsFromText(text: string): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 1) continue
    const name = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (name && value) specs[name] = value
  }
  return specs
}

/** "color, capacity" -> ["color", "capacity"]: trimmed, lower-cased, empty and duplicate entries dropped. */
export function axesFromText(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((axis) => axis.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
}
