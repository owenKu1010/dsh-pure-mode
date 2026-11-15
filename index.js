/**
 * Pure mode: a per-session switch that unmounts every skill from one session.
 *
 * The switch is `ctx.tools.restrict({ deny: ['skill'] })` on the Agent's own
 * context. That single restriction is what the shipped skill consumer already
 * honours: `@deepseek-ai/dsh-tool-skill` compares the `skill` definition its own
 * registration produced with the definition the viewing agent resolves, so a
 * restricted-away tool removes both the model-facing schema and the durable
 * skill catalog that would otherwise be published into the session.
 *
 * @module @local/dsh-pure-mode
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'pure-mode'
export const inject = ['connection']

/** Authenticated browser route; the page calls it with a plain same-origin fetch. */
const ROUTE_PATH = '/api/pure-mode'
/** The one tool that carries a skill catalog beside it. */
const SKILL_TOOL = 'skill'
/** Tools a session stops seeing while pure mode is on; the row's `denyTools` replaces this. */
const DEFAULT_DENY_TOOLS = [SKILL_TOOL]

function resolveHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return join(homedir(), '.dsh')
}

const stateDirectory = join(resolveHome(), 'pure-mode')
const stateFile = join(stateDirectory, 'state.json')
/** Diagnostic trail: which client bundle each page actually loaded, and when. */
const clientLogFile = join(stateDirectory, 'client.log')

/**
 * Record the build tag a page reports. A silently stale client bundle is otherwise
 * indistinguishable from a rendering bug, so this one line makes it inspectable.
 * @param build - the `build` the Client sent, when it sent one.
 * @param via - which request carried it.
 */
function noteClientBuild(build, via) {
  if (typeof build !== 'string' || build === '' || build.length > 32) return
  try {
    mkdirSync(stateDirectory, { recursive: true })
    appendFileSync(clientLogFile, `${new Date().toISOString()} ${via} build=${build}\n`, 'utf8')
  } catch {
    /* diagnostics never fail the request */
  }
}

function emptyState() {
  return { version: 1, fallback: false, sessions: {} }
}

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8'))
    const state = emptyState()
    if (parsed !== null && typeof parsed === 'object') {
      if (typeof parsed.fallback === 'boolean') state.fallback = parsed.fallback
      const sessions = parsed.sessions
      if (sessions !== null && typeof sessions === 'object' && !Array.isArray(sessions)) {
        for (const [key, value] of Object.entries(sessions)) {
          if (typeof value === 'boolean') state.sessions[key] = value
        }
      }
    }
    return state
  } catch {
    return emptyState()
  }
}

function writeState(state) {
  mkdirSync(stateDirectory, { recursive: true })
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/** The mode one session runs in: its own choice, else the value the last toggle left behind. */
function desiredFor(state, sessionId) {
  const own = sessionId === undefined ? undefined : state.sessions[sessionId]
  return typeof own === 'boolean' ? own : state.fallback
}

function sessionIdOf(session) {
  const id = session?.id ?? session?.header?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export function apply(ctx, config = {}) {
  const denyTools = Array.isArray(config?.denyTools)
    ? config.denyTools.filter(name => typeof name === 'string' && name !== '')
    : []
  const deny = denyTools.length > 0 ? denyTools : DEFAULT_DENY_TOOLS

  const warn = (message) => {
    try {
      const logger = typeof ctx.logger === 'function' ? ctx.logger('pure-mode') : undefined
      logger?.warn?.(message)
    } catch {
      /* logging is diagnostic only */
    }
  }

  /** sessionId -> disposer of that Agent's own tool restriction. */
  const applied = new Map()

  const release = (sessionId) => {
    const dispose = applied.get(sessionId)
    applied.delete(sessionId)
    if (typeof dispose !== 'function') return
    try {
      dispose()
    } catch (error) {
      warn(`releasing pure mode for ${sessionId} failed: ${String(error)}`)
    }
  }

  const restrict = (agent, sessionId) => {
    if (applied.has(sessionId)) return true
    const agentCtx = agent?.ctx
    const tools = agentCtx?.tools ?? (typeof agentCtx?.get === 'function' ? agentCtx.get('tools') : undefined)
    if (agentCtx === undefined || tools === undefined || typeof tools.restrict !== 'function') {
      warn(`pure mode cannot reach the tool registry of ${sessionId}`)
      return false
    }
    try {
      // An effect on the Agent's own context: disposing it restores the tool, and
      // Agent disposal removes it even when this plugin already unloaded.
      const dispose = agentCtx.effect(
        () => tools.restrict({ deny: [...deny] }),
        `pure-mode: hide ${deny.join(', ')} for this session`,
      )
      applied.set(sessionId, dispose)
      return true
    } catch (error) {
      warn(`pure mode could not hide ${deny.join(', ')} from ${sessionId}: ${String(error)}`)
      return false
    }
  }

  // The restriction lives on the Agent's context so Agent disposal removes it, but this
  // plugin is its other owner: unloading or reloading the plugin releases every
  // restriction it installed, so a later generation never inherits a tool it can no
  // longer see (a restriction nothing could lift until the Agent itself goes away).
  ctx.effect(() => () => {
    for (const sessionId of [...applied.keys()]) release(sessionId)
  }, 'pure-mode: release every restriction on unload')

  const agents = () => {
    try {
      return ctx.get('agents')
    } catch {
      return undefined
    }
  }

  const liveAgent = (sessionId) => {
    try {
      const service = agents()
      return typeof service?.get === 'function' ? service.get(sessionId) : undefined
    } catch {
      return undefined
    }
  }

  /** Bring one live Agent in line with the stored mode. */
  const reconcile = (agent) => {
    const sessionId = sessionIdOf(agent?.session)
    if (sessionId === undefined) return { sessionId: undefined, on: false, applied: false }
    const on = desiredFor(readState(), sessionId)
    if (!on) {
      release(sessionId)
      return { sessionId, on: false, applied: false }
    }
    return { sessionId, on: true, applied: restrict(agent, sessionId) }
  }

  const applyForSession = (sessionId) => {
    const agent = liveAgent(sessionId)
    if (agent === undefined) return { live: false, applied: false }
    const result = reconcile(agent)
    return { live: true, applied: result.applied }
  }

  ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
    reconcile(agent)
  }), 'pure-mode: apply on agent creation')

  ctx.effect(() => ctx.on('agent/disposed', ({ agent }) => {
    const sessionId = sessionIdOf(agent?.session)
    if (sessionId !== undefined) release(sessionId)
  }), 'pure-mode: release on agent disposal')

  // A plugin mounted into a running Harness must honour sessions that already exist.
  try {
    const service = agents()
    if (typeof service?.list === 'function') {
      for (const agent of service.list()) reconcile(agent)
    }
  } catch (error) {
    warn(`pure mode could not inspect live sessions: ${String(error)}`)
  }

  const handle = async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const url = new URL(request.url)
      const sessionId = url.searchParams.get('sessionId') ?? undefined
      noteClientBuild(url.searchParams.get('build'), 'state')
      const state = readState()
      return jsonResponse({
        ok: true,
        sessionId,
        on: sessionId === undefined ? state.fallback : desiredFor(state, sessionId),
        fallback: state.fallback,
        applied: sessionId === undefined ? undefined : applied.has(sessionId),
        denyTools: deny,
      })
    }

    let payload
    try {
      payload = await request.json()
    } catch {
      return jsonResponse({ ok: false, error: 'the request body must be JSON' }, 400)
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse({ ok: false, error: 'the request body must be a JSON object' }, 400)
    }

    const requested = payload.sessionId
    const sessionId = typeof requested === 'string' && requested !== '' ? requested : undefined
    noteClientBuild(payload.build, 'toggle')
    const state = readState()
    const next = typeof payload.on === 'boolean' ? payload.on : !desiredFor(state, sessionId)
    if (sessionId === undefined) {
      state.fallback = next
    } else {
      state.sessions[sessionId] = next
      state.fallback = next
    }
    try {
      writeState(state)
    } catch (error) {
      return jsonResponse({ ok: false, error: `pure mode state could not be saved: ${String(error)}` }, 500)
    }

    const outcome = sessionId === undefined ? { live: false, applied: false } : applyForSession(sessionId)
    return jsonResponse({ ok: true, sessionId, on: next, fallback: state.fallback, denyTools: deny, ...outcome })
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: handle,
  }), 'pure-mode: authenticated route')
}
