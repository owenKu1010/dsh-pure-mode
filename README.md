# Pure mode · a skill-free composer switch for DeepSeek Harness

**English** | [简体中文](README.zh-CN.md)

A tiny DSH bundle that puts one switch beside the permission control in the composer. While it is on,
**that session mounts no skill at all**: the `skill` tool is gone and so is the persistent skill catalog
that would otherwise ride along in every request.

Use it for the sessions where skills are pure overhead — plain Q&A, writing, a one-off command — and for
sessions where you do not want the model deciding on its own that some listed skill applies.

```
[ + ]  [ ⛨ Full access ▾ ]  [ A|B ]  [ (leaf) Pure mode ]  [ ✦ Experts ▾ ]  [ ⏻ PUA ]  [ model ▾ ]
                                        ↑ this one
```

| State | What you see | What the model gets |
| --- | --- | --- |
| **Off** (default) | 1px accent-blue border, **no fill**, blue leaf, normal label | everything, exactly as before |
| **On** | same bordered chip flooded with the accent, inverted label, filled leaf + a dot | no `skill` tool, no skill catalog |

Turning it back off restores both, from the next step onward.

## Not related to dsh-purge

The names sound adjacent — "purge", "pure" — so, plainly: this plugin has **nothing to do with
`dsh-purge`** and does not replace, extend or depend on it. They solve different problems:

| | dsh-purge | Pure mode (this plugin) |
| --- | --- | --- |
| What it touches | instruction / prompt authority: patches, shim injection, override files | tool visibility of one live session |
| Where the change lives | files in the profile, applied at composition time | one tool restriction in that Agent's context |
| When it takes effect | after a restart of the composition | on the next step, no restart |
| How you undo it | revert the patches / shim / overrides | release the restriction, tool returns immediately |
| Scope | the whole profile | a single session |

It writes no files outside `$DSH_HOME/pure-mode/`, reads none of dsh-purge's state, and changes no prompt
text. Both can be installed in the same profile and neither notices the other.

## Why

Two things are paid for on **every** request in every session:

- the `skill` tool schema, and
- a durable `<available_skills>` user message listing every model-invocable skill with a capped description.

That catalog is worth its tokens in a session that uses skills. In a session that does not, it is a
recurring tax plus a standing invitation for the model to go load something. Pure mode is the switch that
turns the whole subsystem off for one session without touching a patch, a preset, or another plugin.

## Install

Published on npm as **`dsh-pure-mode`**. It is a normal DSH bundle (`dsh.bundle.patch` in `package.json`),
installed into a profile — pick either route:

**From npm (preferred — no clone, no build step):**

1. In DSH open **Plugins → Add plugin** and give it `dsh-pure-mode`.
2. Confirm the `dsh-pure-mode` row is enabled, then reload the page.

**From a checkout:**

1. `git clone https://github.com/owenKu1010/dsh-pure-mode.git`
2. In DSH open **Plugins → Add plugin** and point it at the cloned folder (local directory install).
3. Confirm the `dsh-pure-mode` row is enabled, then reload the page.

Either way the row resolves as a bundle, inserts one plugin row named `pure-mode`, and needs a page reload
once for the client half to appear in the composer.

Requires the shipped skill tool to be mounted (`@deepseek-ai/dsh-tool-skill`, part of the default base
composition). Nothing else.

## Use

- The switch is **per session**. Each session keeps its own choice.
- A session that has never been toggled follows the value the **last toggle** left behind, so a fresh
  session inherits your most recent decision.
- Choices persist at `$DSH_HOME/pure-mode/state.json`. Delete that file to reset everything to off.
- Turning it **on** is cheap (one small empty-catalog message). Turning it **off** republishes the full
  catalog — that is the direction that costs tokens, so decide before the first message when you can.
- `$DSH_HOME/pure-mode/client.log` records which client bundle each page actually loaded (`build=v4`), so
  a stale browser tab is visible instead of guessed at.

## Configuration

By default only `skill` is hidden. To take the rest of the skill surface with it — for example the
`create_skill` tool registered by the skills manager — restate the row's `config` in the profile patch:

```yaml
- id: pure-mode
  name: 'dsh-pure-mode'
  config:
    denyTools: [skill, create_skill]
```

Names must be global tool names the agent can see. A wrong name does not fail silently: the switch reports
"hiding the tool failed" and the Host log carries the `tools.restrict()` message listing known tools.

## Companion: Skills Manager (recommended)

Pure mode is an **all-or-nothing** switch. For per-skill control — enable/disable individual skills,
turn whole sources on or off, browse and install skills from repositories — pair it with
**DSH Skills Manager** by [MichengAI](https://github.com/MichengAI):

> **[github.com/MichengAI/dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)**
> `@michengai/dsh-skills-manager` · Apache-2.0 · actively maintained

They operate on different layers and compose cleanly:

| | Skills Manager | Pure mode |
| --- | --- | --- |
| Scope | one skill or one source | the whole `skill` tool |
| Mechanism | per-skill invocation policy in the `ctx.skills` registry | `agent.ctx.tools.restrict()` |
| When it is off | each skill keeps its own state | everything is restored |

The manager reports a disabled skill as `{ modelInvocable: false, userInvocable: false }`, so it never
reaches the catalog, the `skill` tool or the `/name` gesture in the first place. Pure mode only hides the
tool, and therefore **never re-enables what the manager disabled**:

- pure mode **on** → nothing is mounted (including skills the manager allows);
- pure mode **off** → exactly what the manager allows; anything you disabled there stays gone;
- toggling skills in the manager while pure mode is on still records normally and applies once pure mode
  is off.

## How it works

One restriction on the Agent's own context, released when the Agent or the plugin goes away:

```js
agent.ctx.effect(
  () => agent.ctx.tools.restrict({ deny: ['skill'] }),
  'pure-mode: hide the skill tool for this session',
)
```

`@deepseek-ai/dsh-tool-skill` compares the `skill` definition it registered with the definition the calling
agent actually resolves. A restricted-away tool therefore removes **both** the model-facing schema and the
durable catalog; a session that never published one never gets one at all.

The client half holds no authority: it reads and writes the stored mode over an authenticated same-origin
route (`/api/pure-mode`) registered through `ctx.connection.fetch`, and the Host decides whether to apply
the restriction. The UI is plain React registered into the `conversation.input.left` slot, styled with
`--dsw-alias-*` theme tokens only.

## Notes and caveats

- **History is append-only.** A catalog that was already published stays in the conversation and keeps
  costing tokens until compaction; the saving is real from the start of a session, not retroactive. Toggling
  on→off→on appends a replacement each time.
- **Tool-level change costs cache.** The tool list sits at the front of the request, so every toggle can
  invalidate prompt-cache reuse from that point.
- **`/skill-name` gestures still work** for skills the manager allows. Typing a skill name is a deliberate
  user act, not a mount, and the Host does not intercept it.
- **Scope is the tool, not the registry.** Other tools, MCP servers and plugins are untouched.
- **Restriction needs a restrictable registration.** If a composition registers the skill tool in the
  Agent's own layer instead of an ancestor layer, `tools.restrict()` refuses; the switch then reports the
  failure instead of pretending it worked.
- Tested against DSH `0.2.2-rc.3` on Windows (Electron 44 / Chromium 152). Nothing version-specific is
  used beyond the public Services (`tools`, `connection`, `agents`), but other releases are unverified.

## Repository layout

```
package.json        bundle manifest: dsh.bundle.patch + dsh.client
cordis.patch.yml    inserts the `pure-mode` row
index.js            Host half: state, reconcile, tools.restrict, /api/pure-mode
client.js           Client half: the composer switch
locale/{en,zh}.json plugin-list title/description + switch strings
icon.svg            plugin icon
docs/DETAIL.md      the in-app detail page
```

## License

MIT. See [LICENSE](LICENSE).
