import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ColorPalette } from '@framework/geopng/types.ts'
import { D3_COLOR_SCHEMES, getPaletteCssGradient } from '@framework/geopng/palettes.ts'
import { Icon } from '@ui/components/icon'
import { Label } from '@ui/components/label'
import { useLocalisation } from '@localisation'

export interface D3ColorPaletteSelectorProps {
  className?: string
  compact?: boolean
  disabled?: boolean
  invert?: boolean
  label?: string
  onChange: (arg0_palette: ColorPalette) => void
  onInvertChange?: (arg0_invert: boolean) => void
  showInvert?: boolean
  value: string
}

/**
 * Reusable D3 Colour Palette selector with search filtering, categorisation, and gradient swatches.
 *
 * @param {D3ColorPaletteSelectorProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let D3ColorPaletteSelector: React.FC<D3ColorPaletteSelectorProps> = function (
  arg0_props: D3ColorPaletteSelectorProps
): React.ReactElement {
  //Convert from parameters
  let props = arg0_props
  let { t } = useLocalisation()
  let class_name = props.className || ''
  let compact = Boolean(props.compact)
  let disabled = Boolean(props.disabled)
  let invert = Boolean(props.invert)
  let label = props.label ?? t.sidebar.visualisation.colorPalette
  let on_change = props.onChange
  let on_invert_change = props.onInvertChange
  let show_invert = Boolean(props.showInvert)
  let value = (props.value as ColorPalette) || 'Plasma'

  //Declare local instance variables
  let filtered_palettes: typeof D3_COLOR_SCHEMES
  let is_open: boolean
  let picker_ref = useRef<HTMLDivElement>(null)
  let search_query: string
  let set_is_open: React.Dispatch<React.SetStateAction<boolean>>
  let set_search_query: React.Dispatch<React.SetStateAction<string>>

  //Function body
  ;[is_open, set_is_open] = useState<boolean>(false)
  ;[search_query, set_search_query] = useState<string>('')

  //Close dropdown when clicking outside
  useEffect(() => {
    let handleClickOutside = function (arg0_e: MouseEvent): void {
      if (picker_ref.current && !picker_ref.current.contains(arg0_e.target as Node))
        set_is_open(false)
    }

    if (is_open)
      document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [is_open])

  //Filter palettes by search query
  filtered_palettes = useMemo(() => {
    let q = search_query.toLowerCase().trim()
    if (!q)
      return D3_COLOR_SCHEMES
    return D3_COLOR_SCHEMES.filter((arg0_p) =>
      arg0_p.name.toLowerCase().includes(q) || arg0_p.category.toLowerCase().includes(q)
    )
  }, [search_query])

  //Return statement
  return (
    <div className={`space-y-1.5 relative ${class_name}`} ref={picker_ref}>
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{label}</Label>
          {show_invert && on_invert_change && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={invert}
                onChange={(arg0_e) => on_invert_change(arg0_e.target.checked)}
                className="w-3.5 h-3.5 rounded-none border-input text-primary focus:ring-1 focus:ring-ring"
              />
              {t.sidebar.visualisation.invert}
            </label>
          )}
        </div>
      )}

      {/* Selected Palette Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => set_is_open(!is_open)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-none border border-input bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-16 h-3.5 rounded-none shrink-0 border border-border/50 shadow-2xs"
            style={{ background: getPaletteCssGradient(value, invert) }}
          />
          <span className="truncate font-medium text-foreground">{value}</span>
        </div>
        <Icon name={is_open ? 'expand_less' : 'expand_more'} className="ml-1 text-muted-foreground text-sm" />
      </button>

      {/* Dropdown Menu */}
      {is_open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover text-popover-foreground border border-border shadow-md rounded-none overflow-hidden text-xs">
          {/* Search Bar */}
          <div className="p-1.5 border-b border-border">
            <input
              type="text"
              placeholder={t.sidebar.visualisation.searchPalettes}
              value={search_query}
              onChange={(arg0_e) => set_search_query(arg0_e.target.value)}
              className="w-full px-2 py-1 text-xs rounded-none border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Palette List */}
          <div className="max-h-56 overflow-y-auto p-1 space-y-0.5 custom-scrollbar">
            {filtered_palettes.map((arg0_scheme) => {
              let is_active = value === arg0_scheme.id
              return (
                <button
                  key={arg0_scheme.id}
                  type="button"
                  onClick={() => {
                    on_change(arg0_scheme.id)
                    set_is_open(false)
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-none text-left transition-colors cursor-pointer ${
                    is_active
                      ? 'bg-primary/20 text-primary font-bold shadow-xs'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-14 h-3 rounded-none shrink-0 border border-border/50 shadow-2xs"
                      style={{ background: getPaletteCssGradient(arg0_scheme.id, invert) }}
                    />
                    <span className="truncate">{arg0_scheme.name}</span>
                  </div>
                  {is_active && <Icon name="check" className="text-primary text-xs shrink-0 ml-1" />}
                </button>
              )
            })}
            {filtered_palettes.length === 0 && (
              <div className="p-2 text-center text-muted-foreground text-[11px]">
                {t.mapmodes.noResults}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
