/**
 * Client half of pure mode: the composer switch in `conversation.input.left`.
 *
 * The switch itself holds no authority. It reads and writes the Host's stored
 * per-session mode over the authenticated `/api/pure-mode` route; the Host is
 * what hides the `skill` tool, and therefore the skill catalog.
 *
 * Visual contract: idle is an accented chip with no frame at all — no border, no
 * grey box — so it belongs to the composer row while still reading as highlighted.
 * Switched on is a different body: solid accent fill, inverted label, filled leaf
 * and an armed dot. The two states never look like one picture at two tints.
 *
 * BUILD travels with the state request so the Host can record which client bundle
 * this page actually loaded (`$DSH_HOME/pure-mode/client.log`); bump it whenever
 * the rendering changes, and a stale page becomes visible instead of guessed at.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-pure-mode',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const BUILD = 'v4'
    const NS = 'pure-mode'
    const FALLBACK = {
      zh: {
        label: '纯净模式',
        on: '纯净模式已开启：本会话不挂载任何 skill（目录与 skill 工具都已移除）',
        off: '纯净模式已关闭：本会话恢复 skill 挂载',
        busy: '正在切换纯净模式…',
        failed: '纯净模式切换失败',
        unapplied: '已记录，但当前会话的工具隐藏失败，详见宿主日志',
      },
      en: {
        label: 'Pure mode',
        on: 'Pure mode is on: no skill is mounted in this session (catalog and skill tool both removed)',
        off: 'Pure mode is off: skills are mounted again in this session',
        busy: 'Switching pure mode…',
        failed: 'Pure mode could not be switched',
        unapplied: 'Saved, but hiding the tool failed for this session; see the Host log',
      },
    }

    const CSS = `
.dsh-pure-mode-cell {
  display: inline-flex; align-items: center;
  /* The accent, not the ink: --dsw-alias-brand-primary is the near-black label colour
     (rgb(15,17,21)), so tinting with it is what produced a grey slab. */
  --dsppm-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-static-blue-500, #4176e6));
}
.dsh-pure-mode-button {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 9px 0 7px;
  border: 1px solid var(--dsppm-accent);
  border-color: color-mix(in srgb, var(--dsppm-accent) 50%, transparent);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit; font-size: 12px; line-height: 1;
  white-space: nowrap; cursor: pointer; user-select: none;
  transition: background-color .14s ease, color .14s ease, border-color .14s ease;
}
.dsh-pure-mode-button:hover {
  border-color: var(--dsppm-accent);
  background: color-mix(in srgb, var(--dsppm-accent) 8%, transparent);
}
.dsh-pure-mode-button:focus-visible {
  outline: 2px solid var(--dsppm-accent);
  outline-offset: 2px;
}
.dsh-pure-mode-glyph { display: block; flex: none; color: var(--dsppm-accent); }
.dsh-pure-mode-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: currentColor; flex: none;
}
/* Switched on: the same bordered chip, flooded with the accent. */
.dsh-pure-mode-button[aria-checked="true"] {
  border-color: var(--dsppm-accent);
  background: var(--dsppm-accent);
  color: var(--dsw-alias-label-primary-inverted, #ffffff);
}
.dsh-pure-mode-button[aria-checked="true"] .dsh-pure-mode-glyph { color: currentColor; }
.dsh-pure-mode-button[aria-checked="true"]:hover {
  background: color-mix(in srgb, var(--dsppm-accent) 86%, #000000);
}
.dsh-pure-mode-button[disabled] { opacity: .62; cursor: default; }
`.trim()

    function Glyph(props) {
      return h('svg', {
        className: 'dsh-pure-mode-glyph',
        viewBox: '0 0 12 12',
        width: 12,
        height: 12,
        fill: props.on ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: props.on ? 0 : 1.15,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M3.1 8.9c0-3.2 2.6-5.8 5.8-5.8 0 3.2-2.6 5.8-5.8 5.8Z' }),
        props.on
          ? null
          : h('path', { d: 'M3.1 8.9c1.95-.05 3.6-.85 4.75-2.05' }),
      )
    }

    function PureModeSwitch(props) {
      const sessionId = props.sessionId
      const text = props.text
      const [on, setOn] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(undefined)

      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId === '') return undefined
        let cancelled = false
        const url = `/api/pure-mode?sessionId=${encodeURIComponent(sessionId)}&build=${BUILD}`
        fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
          .then(response => response.json())
          .then((value) => {
            if (cancelled || value === null || typeof value !== 'object') return
            if (typeof value.on === 'boolean') setOn(value.on)
            if (value.on === true && value.applied === false) setNote(text('unapplied'))
          })
          .catch(() => { /* the switch stays at its last known state */ })
        return () => { cancelled = true }
      }, [sessionId])

      const toggle = React.useCallback(() => {
        if (busy) return
        const next = !on
        setBusy(true)
        setNote(undefined)
        setOn(next)
        fetch('/api/pure-mode', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ sessionId, on: next, build: BUILD }),
        })
          .then(response => response.json())
          .then((value) => {
            if (value === null || typeof value !== 'object' || value.ok !== true) {
              throw new Error(typeof value?.error === 'string' ? value.error : text('failed'))
            }
            setOn(value.on === true)
            setNote(value.on === true && value.applied === false ? text('unapplied') : undefined)
          })
          .catch((error) => {
            setOn(!next)
            setNote(`${text('failed')}: ${String(error?.message ?? error)}`)
          })
          .finally(() => { setBusy(false) })
      }, [busy, on, sessionId])

      const title = note ?? (busy ? text('busy') : (on ? text('on') : text('off')))
      return h('div', { className: 'dsh-pure-mode-cell' },
        h('style', { 'data-dsh-pure-mode': BUILD }, CSS),
        h('button', {
          type: 'button',
          role: 'switch',
          className: 'dsh-pure-mode-button',
          'data-build': BUILD,
          'aria-checked': on,
          'aria-label': text('label'),
          title,
          disabled: busy,
          onClick: toggle,
        },
          h(Glyph, { on }),
          on ? h('span', { className: 'dsh-pure-mode-dot', 'aria-hidden': true }) : null,
          h('span', undefined, text('label')),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        let translate
        try {
          ctx.locale?.register?.(NS, { en: FALLBACK.en, zh: FALLBACK.zh })
          translate = ctx.locale?.bind?.(NS)
        } catch {
          translate = undefined
        }

        const activeLanguage = () => {
          try {
            const active = ctx.locale?.getLocale?.().active
            if (typeof active === 'string' && active.toLowerCase().startsWith('zh')) return 'zh'
          } catch { /* fall through to the browser language */ }
          const browser = typeof navigator === 'object' && typeof navigator.language === 'string'
            ? navigator.language.toLowerCase()
            : 'en'
          return browser.startsWith('zh') ? 'zh' : 'en'
        }

        const text = (key) => {
          const translated = typeof translate === 'function' ? translate(key) : undefined
          if (typeof translated === 'string' && translated !== '' && translated !== key) return translated
          return (FALLBACK[activeLanguage()] ?? FALLBACK.en)[key] ?? key
        }

        const Switch = (props) => h(PureModeSwitch, { ...props, text })

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'pure-mode',
          order: 60,
          label: () => text('label'),
        }, Switch))
      },
    }
  },
})
