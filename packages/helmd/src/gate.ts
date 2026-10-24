// Star gate for helm-d.
//
// The persona is never gated: the active profile body always loads. The only
// surface is the web panel popup (GET /api/helmd/gate) plus the CLI code file;
// no model-facing tool is registered, so nothing about the ask enters a session.
//
// The device-flow session is a module singleton: one user_code at a time, polled
// in the background, re-issued on expiry. The token is discarded inside
// star-gate.ts (verifyStar) — nothing credential-shaped crosses this module.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, normalize } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { boostBody, profileBody } from './catalog.js'
import { startDeviceFlow, verifyStar, type DeviceSession } from './star-gate.js'

const REPO = 'ADWMC/helm-d'
// Own namespace: the preset's dsh-persona row registers the empty
// 'deployment:persona-prefix' section, and same-name re-registration is
// rejected ("already registered in this scope"). A distinct name coexists.
const PERSONA_SECTION_NAME = 'helm-d:persona'
const PERSONA_SECTION_ORDER = 0
// Tail override block. Position is the whole point: head-position policy gets
// diluted by everything after it, tail-position carries to the last step.
// Measured on the isolated instance (2026-10-23): persona-at-head refused a
// live-target work order 4/4; the same order with this block at the tail
// produced real recon and then a single authorization question.
const BOOST_SECTION_NAME = 'helm-d:boost'
const BOOST_SECTION_ORDER = 1e6

interface GateState {
  starred: boolean
  checkedAt: string
  login?: string
}

let cachedState: GateState | undefined
let activeSession: DeviceSession | undefined
let pollAbort: AbortController | undefined
let pollGeneration = 0
let launchSkipped = false
let lastFlowError: string | undefined

/** Operator chose to dismiss the popup for THIS instance launch
 *  (memory-only). The persona is untouched; the background device-flow
 *  poll is aborted immediately — zero GitHub traffic after skip. */
export function skipThisLaunch(): void {
  launchSkipped = true
  pollAbort?.abort()
  activeSession = undefined
  lastFlowError = undefined
  clearAnnouncement()
}

/** Whether the gate is actively gating assemblies (locked AND not skipped). */
export function isGating(): boolean {
  return !isUnlocked() && !launchSkipped
}

/** Status snapshot for the web gate panel (GET /api/helmd/gate). */
export function gateStatus(): Record<string, unknown> {
  const state = readState()
  // Re-issue the device session when it expired — the panel poll is the
  // heartbeat; without this the panel sticks at "生成中…" after expiry.
  if (!isUnlocked() && !launchSkipped &&
      (activeSession === undefined || Date.now() >= activeSession.expiresAt)) {
    ensureFlow()
  }
  return {
    gating: isGating(),
    unlocked: isUnlocked(),
    skipped: launchSkipped,
    starred: state?.starred ?? false,
    login: state?.login,
    userCode: activeSession?.userCode,
    verificationUri: activeSession?.verificationUri ?? 'https://github.com/login/device',
    repo: REPO,
    error: lastFlowError,
  }
}

/** $DSH_HOME (or ~/.dsh) + storages/helmd/gate-state.json. */
function statePath(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return normalize(join(home, 'storages', 'helmd', 'gate-state.json'))
}

/** CLI channel: $DSH_HOME (or ~/.dsh) + storages/helmd/gate-code.txt.
 *  Deliberately NOT a model-facing tool — a registered tool's name and
 *  description land in every session's tool list, and a name carrying the
 *  plugin's activation keyword got read as a status request. A terminal-only
 *  launch reads this file (or the stderr line) instead. */
function codePath(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return normalize(join(home, 'storages', 'helmd', 'gate-code.txt'))
}

/** Publish the current one-time code to the file + stderr. */
function announceSession(session: DeviceSession): void {
  const minutes = Math.max(1, Math.round((session.expiresAt - Date.now()) / 60_000))
  const line = `${session.verificationUri}  code ${session.userCode}  (expires in ${minutes}m)`
  try {
    mkdirSync(dirname(codePath()), { recursive: true })
    writeFileSync(codePath(), line + '\n', 'utf8')
  } catch { /* announcement is best-effort; the panel still works */ }
  console.warn(`[helmd] verification: ${line}`)
}

/** Drop the published code once it no longer applies. */
function clearAnnouncement(): void {
  try { rmSync(codePath(), { force: true }) } catch { /* nothing to clear */ }
}

function readState(): GateState | undefined {
  if (cachedState !== undefined) return cachedState
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8')) as GateState
    if (typeof parsed.starred === 'boolean') {
      cachedState = parsed
      return cachedState
    }
  } catch { /* first run or unreadable — treat as locked */ }
  return undefined
}

function writeState(state: GateState): void {
  cachedState = state
  try {
    mkdirSync(dirname(statePath()), { recursive: true })
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch { /* persistence is best-effort; in-memory state still gates */ }
}

/** Whether the star gate has been passed. Checked per assembly, cheap. */
export function isUnlocked(): boolean {
  return readState()?.starred === true
}


/** Replace the persona block inside a prompt string with the gate notice. */


/** Background device-flow runner: one session at a time, bounded poll loop. */
function ensureFlow(): void {
  if (activeSession !== undefined && Date.now() < activeSession.expiresAt) return
  pollAbort?.abort()
  const generation = ++pollGeneration
  const controller = new AbortController()
  pollAbort = controller
  void (async () => {
    try {
      const session = await startDeviceFlow()
      activeSession = session
      lastFlowError = undefined
      if (generation === pollGeneration) announceSession(session)
      // Star watch: the moment the star lands, persist state — the web panel
      // picks it up on its next poll and disappears. No prompt swap involved.
      const state = await verifyStar(session, controller.signal, (unlockedState) => {
        if (generation !== pollGeneration) return
        writeState(unlockedState)
        clearAnnouncement()
      })
      if (generation !== pollGeneration) return
      writeState(state)
      activeSession = undefined
      if (state.starred) clearAnnouncement()
    } catch (error) {
      // Expired/cancelled/skipped: clear so the next ensureFlow() re-issues.
      if (generation === pollGeneration) {
        activeSession = undefined
        clearAnnouncement()
      }
      const msg = error instanceof Error ? error.message : String(error)
      if (msg !== 'aborted') {
        lastFlowError = msg
        console.warn('[helmd] gate: device flow ended:', msg)
      }
    }
  })()
}

/** Register the gate on the prompt-assembly waterfall.
 *  The persona section always carries the active profile body (v0.5.0 ruling:
 *  never gated). The device flow runs in the background for the web panel. */
export function registerGate(ctx: Context): void {
  // The persona is NEVER gated: the active profile body loads unconditionally.
  try { applyPersonaSection(ctx, profileBody() ?? '') } catch (error) {
    console.warn('[helmd] gate: persona section registration failed:', error instanceof Error ? error.message : error)
  }
  // Tail override block (sealed boost.txt) — registered at the highest order
  // so it survives long contexts and multi-turn drift.
  try { applyBoostSection(ctx) } catch (error) {
    console.warn('[helmd] gate: boost section registration failed:', error instanceof Error ? error.message : error)
  }
  // Star ask: run the device flow at apply so the web panel has a live code.
  // No model-facing tool: the ask is a web-panel popup only. A tool named
  // after the plugin ('helmd_unlock') collided with the 'helmd' activation
  // keyword — the model read activation as a gate-status request — and kept
  // star wording in every session even after unlock.
  ensureFlow()
}

/** Register the persona system-prompt section (shadows the preset persona row). */
export function applyPersonaSection(ctx: Context, text: string): void {
  const host = ctx as unknown as {
    systemPrompt?: {
      section(def: { name: string; order: number; text: string }): unknown
      getSectionOrder(name: string): number
    }
  }
  if (!host.systemPrompt || typeof host.systemPrompt.section !== 'function') {
    throw new Error('systemPrompt service unavailable')
  }
  const order = typeof host.systemPrompt.getSectionOrder === 'function'
    ? host.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')
    : PERSONA_SECTION_ORDER
  host.systemPrompt.section({ name: PERSONA_SECTION_NAME, order, text })
}

/** Register the sealed tail override block at the highest order. */
export function applyBoostSection(ctx: Context): void {
  const text = boostBody()
  if (text === undefined || text.trim() === '') return
  const host = ctx as unknown as {
    systemPrompt?: { section(def: { name: string; order: number; text: string }): unknown }
  }
  if (!host.systemPrompt || typeof host.systemPrompt.section !== 'function') {
    throw new Error('systemPrompt service unavailable')
  }
  host.systemPrompt.section({ name: BOOST_SECTION_NAME, order: BOOST_SECTION_ORDER, text })
}
