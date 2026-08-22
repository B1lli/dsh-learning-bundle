/**
 * Replace machine-specific paths in checked-in benchmark evidence.
 *
 * The evidence keeps commands and session identities inspectable while
 * avoiding publication of a contributor's home directory or toolchain path.
 */
export function sanitizePublicEvidence(value, options = {}) {
  const replacements = [
    ...((options.dshHomes ?? []).map(path => [path, '$DSH_HOME'])),
    [options.dshSourceRoot, '$DSH_SOURCE_ROOT'],
    [options.bundleRoot, '$BUNDLE_ROOT'],
    [options.nodePath, '$NODE'],
  ]
    .filter(([path]) => typeof path === 'string' && path.length > 0)
    .sort(([left], [right]) => right.length - left.length)

  return visit(value)

  function visit(current) {
    if (typeof current === 'string') return sanitizeString(current)
    if (Array.isArray(current)) return current.map(visit)
    if (current && typeof current === 'object') {
      return Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, visit(entry)]))
    }
    return current
  }

  function sanitizeString(input) {
    let output = input
    for (const [path, token] of replacements) output = output.replaceAll(path, token)
    return output.replace(
      /\$DSH_HOME\/sessions\/[^/]+\/(session-[^/]+\/session\.jsonl\.zstd)/g,
      '$DSH_HOME/sessions/$1',
    )
  }
}
