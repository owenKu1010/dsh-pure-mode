# Pure mode

One switch to the right of the permission control in the composer. While it is on, **the current session
mounts no skill**: the model sees no skill catalog and cannot call the `skill` tool. Turning it off
restores both immediately.

> Not related to `dsh-purge`: this plugin touches no prompt text, patches no files and injects no shim —
> it only hides one tool for one session, at runtime.

## What it solves

The skill catalog is a durable user message, and the `skill` tool carries a fixed schema; both are sent
again on every request. A session that will not use skills — plain Q&A, writing, a one-off command — keeps
paying for them, and the catalog also invites the model to load something on its own.

## Usage

1. In any session, find the leaf-marked **Pure mode** switch at the left of the composer (between the
   permission control and the experts control).
2. Click once: the switch goes from an outlined chip to a filled one (filled leaf + dot) and the session
   enters pure mode. Before the next message, the harness appends a replacement catalog declaring every
   earlier skill name dead.
3. Click again: back to the outlined idle look and the catalog is republished as a new replacement.

The outlined look is the idle state — **1px accent-blue border (`#4176e6`), transparent fill, blue leaf,
normal label** — so the control is findable without being switched on. "On" is a different body: the same
bordered chip flooded with the accent, inverted label, a filled leaf and a dot. The two states differ by
outline versus fill, not by two tints of one colour.

> Token trap worth knowing: `--dsw-alias-brand-primary` is the **ink** colour (light theme
> rgb(15,17,21)), so tinting with it produces a grey slab. The real accent is
> `--dsw-alias-brand-primary-new-colorprimary-new-color` (light theme #4176e6); this plugin exposes it as
> `--dsppm-accent`, falling back to `--dsw-static-blue-500`.

The choice is stored per session:

| Situation | Result |
| --- | --- |
| Toggled inside this session | the session keeps that choice |
| New session never toggled | inherits the value the last toggle left behind |
| Close and reopen the session | keeps that session's own choice |

State lives at `$DSH_HOME/pure-mode/state.json`; delete the file to reset everything to off.

## Configuration

By default only `skill` is hidden. To take the rest of the skill surface with it — for example the
`create_skill` tool registered by the skills manager — restate the row's `config`:

```yaml
- id: pure-mode
  name: 'dsh-pure-mode'
  config:
    denyTools: [skill, create_skill]
```

Each name must be a global tool name the agent can see. A wrong name does not fail silently: the switch
reports "hiding the tool failed" and the Host log carries the `tools.restrict()` message with the known
tool list.

## How it works

The Host does exactly one thing, on **the Agent's own context**:

```js
agent.ctx.effect(() => agent.ctx.tools.restrict({ deny: ['skill'] }), 'pure-mode: hide the skill tool for this session')
```

`dsh-tool-skill` compares, at every step preparation, the exact `skill` definition it registered with the
one the Agent actually resolves. A restricted-away tool therefore takes away both:

- the model-facing `skill` tool schema, and
- the durable skill catalog in the session (if one was published, an empty replacement declares the old
  names dead).

No patch is edited, no other plugin's registration is touched; unloading this plugin or disposing the
effect returns everything to normal.

The client switch holds no authority: it reads and writes the stored mode over the authenticated
same-origin route `/api/pure-mode`, and the Host decides whether to apply the restriction.

## Relationship with the skills manager (`@michengai/dsh-skills-manager`)

They do not compete for the same ground and compose naturally:

| | Skills manager | Pure mode |
| --- | --- | --- |
| Surface | per-skill invocation policy (`modelInvocable` / `userInvocable`) and source switches | visibility of the whole `skill` tool |
| Where | provider layer of the `ctx.skills` registry | `agent.ctx.tools.restrict()` |
| After it is off | each skill restores individually | the whole thing restores |

The manager folds its state into invocation policy through `effectiveSkillPolicy()`: a disabled skill (or a
disabled source) reports `{ modelInvocable: false, userInvocable: false }`, so it never reaches the catalog,
the `skill` tool refuses it, and the `/name` gesture does not recognise it. Pure mode only hides the tool,
so it **never re-enables** what the manager disabled, and **never rewrites** the manager's state:

- pure mode on: nothing is mounted (including skills the manager allows);
- pure mode off: back to "whatever the manager allows" — what you disabled there stays absent and unloadable;
- toggling skills in the manager while pure mode is on still records normally and applies once pure mode is off.

In other words "pure mode off = back to normal", and that normal already has your manager-side disables
subtracted.

## Verified, and what is not

Verified (this machine's Desktop profile, 2026-11-15):

- plugin install, row activation, `state.json` round trip, route round trip, the switch rendering in the
  composer and toggling;
- with it on, that session's `skill` tool left the tool list and an empty catalog declaration was appended;
  with it off, tool and catalog both returned.

Known limits:

- **History is not retracted.** A catalog published before you flipped the switch stays in the session and
  keeps costing tokens until compaction. The real saving comes from a session that started in pure mode.
- **Explicit `/skill-name` still injects.** Typing a skill name is a user act, not a mount, and the Host
  does not intercept it.
- **Skill-only.** Other tools, MCP servers and plugins are untouched.
- If a composition registers the skill tool outside the Agent's ancestor layers (for example re-registered
  into the Agent's own layer by another scoped plugin), `tools.restrict()` refuses; the switch then reports
  "hiding the tool failed" instead of pretending it worked.
