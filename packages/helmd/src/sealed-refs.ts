// Runtime reader for the sealed references bundle (references.dat).
// Installed packages ship references sealed (npm supply-chain scan sees no
// plaintext); the repo dev layout keeps the plaintext references/ directory,
// which read_reference prefers when present.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { unseal } from './crypt.js'

let cache: Map<string, string> | undefined

function bundlePath(): string {
  // dist/router.js → package root is two levels up.
  return fileURLToPath(new URL('../../references.dat', import.meta.url))
}

function manifest(): Map<string, string> | undefined {
  if (cache !== undefined) return cache
  const p = bundlePath()
  if (!existsSync(p)) return undefined
  try {
    const parsed = JSON.parse(unseal(readFileSync(p, 'utf8'))) as { files: Record<string, string> }
    cache = new Map(Object.entries(parsed.files))
    return cache
  } catch {
    return undefined
  }
}

/** Sealed reference content by repo-relative path, or undefined when the
 *  bundle is absent (repo dev mode) or the path is not in the bundle. */
export function readSealedReference(relPath: string): string | undefined {
  const m = manifest()
  if (m === undefined) return undefined
  const key = relPath.replace(/\\/g, '/').replace(/^\//, '')
  return m.get(key)
}
