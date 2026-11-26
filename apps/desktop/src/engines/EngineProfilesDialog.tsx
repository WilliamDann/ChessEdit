import { useEffect, useState } from 'react'
import { ChevronDown, Plus, RotateCw, Trash2 } from 'lucide-react'
import type {
  EngineColorId,
  EngineProfile,
  EngineSetting,
  GoMode,
  UciOptionConfig,
} from './types'
import { ENGINE_COLORS, GO_DEFAULTS } from './types'
import { useEngineActions, useEngineStoreSync } from './EngineContext'
import './engines.css'

/** Settings the panel drives with dedicated controls; always kept in the profile */
const REQUIRED_SETTINGS = ['MultiPV', 'Threads', 'Hash']

/** Seed MultiPV/Threads/Hash defaults, mirroring en-croissant's add-engine flow */
function requiredSettings(options: UciOptionConfig[]) {
  const settings: EngineSetting[] = []
  for (const name of REQUIRED_SETTINGS) {
    const option = options.find((o) => o.name === name)
    if (option) {
      settings.push({
        name,
        value: (option.default as string | number | boolean | null | undefined) ?? null,
      })
    }
  }
  return settings
}

export default function EngineProfilesDialog({ onClose }: { onClose: () => void }) {
  const store = useEngineStoreSync()
  const actions = useEngineActions()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const addEngine = async () => {
    setAdding(true)
    setError(null)
    try {
      const path = await window.engineHost?.openFile()
      if (!path) return
      const config = await window.engineHost?.getConfig(path)
      if (!config) return
      actions.addProfile({
        id: crypto.randomUUID(),
        name: config.name || path.split('/').pop() || path,
        path,
        color: actions.nextColor(),
        go: { kind: 'infinite' },
        settings: requiredSettings(config.options),
        optionConfigs: config.options,
        visible: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog engines-dialog" role="dialog" aria-modal="true" aria-label="Engine profiles">
        <div className="dialog-titlebar">
          <span>Engines</span>
          <button className="dialog-close" onClick={onClose} aria-label="Close" title="Close">
            ✕
          </button>
        </div>

        <div className="dialog-body engines-dialog-body">
          {store.profiles.length === 0 && <p className="engines-empty-hint">No engine profiles yet.</p>}

          {store.profiles.map((profile) => (
            <ProfileEditor key={profile.id} profile={profile} />
          ))}

          <button className="dialog-btn engines-add-btn" onClick={() => void addEngine()} disabled={adding}>
            <Plus size={14} aria-hidden /> {adding ? 'Reading engine…' : 'Add engine…'}
          </button>
          {error && <p className="engine-error">{error}</p>}
        </div>

        <div className="dialog-footer">
          <span className="dialog-spacer" />
          <button className="dialog-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function colorHex(color: EngineColorId): string {
  return ENGINE_COLORS.find((c) => c.id === color)?.hex ?? '#888'
}

function ProfileEditor({ profile }: { profile: EngineProfile }) {
  const store = useEngineStoreSync()
  const actions = useEngineActions()
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const session = store.session(profile.id)

  const setGo = (go: GoMode) => actions.updateProfile(profile.id, { go })

  /**
   * En-croissant's setSetting semantics: upsert the value, but drop the
   * entry again once it returns to the engine default (required settings
   * always stay — the panel controls read them).
   */
  const setOption = (option: UciOptionConfig, value: EngineSetting['value']) => {
    const settings = profile.settings.map((s) => ({ ...s }))
    const existing = settings.find((s) => s.name === option.name)
    if (existing) existing.value = value
    else settings.push({ name: option.name, value })
    const isDefault = value === option.default
    if (!isDefault || REQUIRED_SETTINGS.includes(option.name)) {
      actions.updateProfile(profile.id, { settings })
    } else {
      actions.updateProfile(profile.id, { settings: settings.filter((s) => s.name !== option.name) })
    }
  }

  /** Re-read the option list from the binary (picks up engine updates and
   *  fills in optionConfigs for profiles created before this existed) */
  const rereadOptions = async () => {
    setReading(true)
    setReadError(null)
    try {
      const config = await window.engineHost?.getConfig(profile.path)
      if (!config) return
      const settings = profile.settings.map((s) => ({ ...s }))
      for (const name of REQUIRED_SETTINGS) {
        if (settings.some((s) => s.name === name)) continue
        const option = config.options.find((o) => o.name === name && o.type !== 'button')
        if (option) settings.push({ name, value: (option.default as EngineSetting['value']) ?? null })
      }
      actions.updateProfile(profile.id, { optionConfigs: config.options, settings })
    } catch (err) {
      setReadError(err instanceof Error ? err.message : String(err))
    } finally {
      setReading(false)
    }
  }

  const options = (profile.optionConfigs ?? []).filter((o) => o.type !== 'button')
  const extraSettings = profile.settings.filter(
    (s) => !REQUIRED_SETTINGS.includes(s.name) && !options.some((o) => o.name === s.name),
  )

  return (
    <div className="profile-editor">
      <div className="profile-editor-head">
        <button className="profile-editor-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown size={14} className={'chevron' + (open ? '' : ' collapsed')} aria-hidden />
          <span className="engine-dot" style={{ background: colorHex(profile.color) }} aria-hidden />
          <span className="profile-name">{profile.name}</span>
        </button>
        <button
          className="engines-footer-btn"
          onClick={() => actions.removeProfile(profile.id)}
          title="Remove engine profile"
          aria-label={`Remove ${profile.name}`}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="engine-settings">
          <div className="engine-row">
            <span className="engine-label">Name</span>
            <input
              className="engine-input grow"
              value={profile.name}
              onChange={(e) => actions.updateProfile(profile.id, { name: e.target.value })}
            />
          </div>

          <div className="engine-row">
            <span className="engine-label">Color</span>
            <div className="engine-colors" role="radiogroup" aria-label="Engine color">
              {ENGINE_COLORS.map((c) => (
                <button
                  key={c.id}
                  className={'engine-color' + (profile.color === c.id ? ' active' : '')}
                  style={{ background: c.hex }}
                  onClick={() => actions.updateProfile(profile.id, { color: c.id })}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>

          <div className="engine-row">
            <span className="engine-label">Binary</span>
            <input className="engine-input grow mono" value={profile.path} readOnly disabled />
          </div>

          <div className="engine-row">
            <span className="engine-label">Go</span>
            <select
              className="engine-select"
              value={profile.go.kind}
              onChange={(e) => {
                const kind = e.target.value as GoMode['kind']
                setGo(kind === 'infinite' ? { kind: 'infinite' } : { kind, value: GO_DEFAULTS[kind] })
              }}
            >
              <option value="infinite">Infinite</option>
              <option value="depth">Depth</option>
              <option value="time">Time</option>
              <option value="nodes">Nodes</option>
            </select>
            {profile.go.kind !== 'infinite' && (
              <input
                className="engine-input"
                type="number"
                min={1}
                value={profile.go.value}
                onChange={(e) => setGo({ kind: profile.go.kind, value: Math.max(1, Number(e.target.value) || 1) })}
              />
            )}
          </div>

          {options.length > 0 && (
            <div className="engine-row">
              <span className="engine-label">Options</span>
              <span className="engine-hint">{options.length} UCI options — values equal to the default are not sent</span>
            </div>
          )}

          {options.map((option) => {
            const entry = profile.settings.find((s) => s.name === option.name)
            const value = entry ? entry.value : (option.default ?? null)
            return (
              <div className="engine-row" key={option.name}>
                <span className="engine-label" title={option.name}>
                  {option.name}
                </span>
                <OptionEditor option={option} value={value} onChange={(v) => setOption(option, v)} />
              </div>
            )
          })}

          {/* Settings entries the binary didn't declare (e.g. after re-paths):
              still editable as free-form values */}
          {extraSettings.map((setting) => (
            <div className="engine-row" key={setting.name}>
              <span className="engine-label">{setting.name}</span>
              <input
                className="engine-input grow"
                value={String(setting.value ?? '')}
                onChange={(e) =>
                  actions.updateProfile(profile.id, {
                    settings: profile.settings.map((s) =>
                      s.name === setting.name ? { ...s, value: e.target.value } : s,
                    ),
                  })
                }
              />
              <button
                className="engines-footer-btn"
                title="Remove this setting"
                aria-label={`Remove ${setting.name}`}
                onClick={() =>
                  actions.updateProfile(profile.id, {
                    settings: profile.settings.filter((s) => s.name !== setting.name),
                  })
                }
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
          ))}

          <div className="engine-row">
            <button className="engines-footer-btn" onClick={() => void rereadOptions()} disabled={reading}>
              <RotateCw size={12} aria-hidden /> {reading ? 'Reading…' : 'Re-read options'}
            </button>
            {readError && <span className="engine-error">{readError}</span>}
          </div>

          <div className="engine-row">
            <label className="engine-check">
              <input
                type="checkbox"
                checked={profile.visible}
                onChange={(e) => actions.updateProfile(profile.id, { visible: e.target.checked })}
              />
              Show in Engines panel
            </label>
            {session && <span className="engine-hint">{session.running ? 'running' : 'paused'}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Typed editor for one UCI option, following en-croissant's engines page */
function OptionEditor({
  option,
  value,
  onChange,
}: {
  option: UciOptionConfig
  value: EngineSetting['value']
  onChange: (value: EngineSetting['value']) => void
}) {
  if (option.type === 'check') {
    return (
      <label className="engine-check">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      </label>
    )
  }

  if (option.type === 'spin') {
    const num = Number(value ?? 0)
    return (
      <input
        className="engine-input"
        type="number"
        min={option.min}
        max={option.max}
        step={1}
        value={Number.isFinite(num) ? num : 0}
        onChange={(e) => {
          const raw = Number(e.target.value)
          if (!Number.isFinite(raw)) return
          const clamped = Math.min(option.max ?? Infinity, Math.max(option.min ?? -Infinity, Math.round(raw)))
          onChange(clamped)
        }}
      />
    )
  }

  if (option.type === 'combo' && option.vars && option.vars.length > 0) {
    const current = String(value ?? '')
    const vars = option.vars.includes(current) ? option.vars : [...option.vars, current]
    return (
      <select className="engine-select grow" value={current} onChange={(e) => onChange(e.target.value)}>
        {vars.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    )
  }

  // string (and combo without vars)
  return (
    <input
      className="engine-input grow"
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
