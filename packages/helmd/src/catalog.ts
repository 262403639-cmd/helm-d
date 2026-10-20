// Persona-profile catalog: sealed profiles.dat → enumerable profiles with an
// active pointer. M1 scope: the "core" profile is the current v9 persona text;
// additional profiles are plain catalog entries (content TBD by operator).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { unseal } from './crypt.js'

export interface Profile {
  id: string
  name: string
  /** Sealed body — unseal() at load; plaintext lives only in memory. */
  sealed: string
  body?: string
}

export interface Catalog {
  version: number
  activeId: string
  profiles: Profile[]
}

const catalogPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'presets',
  'profiles.dat',
)

let cached: Catalog | undefined

/** Load + unseal the catalog. Bodies are decrypted in memory only. */
export function loadCatalog(): Catalog {
  if (cached !== undefined) return cached
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
    version: number
    activeId: string
    profiles: Array<{ id: string; name: string; sealed: string }>
  }
  cached = {
    version: raw.version,
    activeId: raw.activeId,
    profiles: raw.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      sealed: p.sealed,
      body: unseal(p.sealed),
    })),
  }
  return cached
}

/** Profile body by id; falls back to the active profile. */
export function profileBody(id?: string): string | undefined {
  const catalog = loadCatalog()
  const wanted = id ?? catalog.activeId
  return catalog.profiles.find((p) => p.id === wanted)?.body
}

export function profileName(id?: string): string | undefined {
  const catalog = loadCatalog()
  const wanted = id ?? catalog.activeId
  return catalog.profiles.find((p) => p.id === wanted)?.name
}
