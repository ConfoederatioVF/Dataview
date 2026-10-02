import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icon'

//Global z-index counter for window focus management (ensures active window is always on top)
let global_top_z_index = 1000

/**
 * Returns the next top z-index value for window stacking.
 *
 * @returns {number}
 */
export function getNextTopZIndex (): number {
  global_top_z_index += 1
  return global_top_z_index
}

/**
 * Clean pushpin icon component for docking/floating state.
 *
 * @param {{ isPinned: boolean; className?: string }} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let PushpinIcon: React.FC<{ isPinned: boolean; className?: string }> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    className = 'w-3.5 h-3.5',
    isPinned: is_pinned,
  } = props

  //Guard clauses
  if (is_pinned) {
    //Return statement
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <line x1="12" y1="17" x2="12" y2="22" strokeWidth="2" />
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
      </svg>
    )
  }

  //Return statement
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} -rotate-45 opacity-80 hover:opacity-100 transition-transform`}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  )
}

export interface WindowProps {
  id?: string
  title: string
  icon?: string
  isOpen: boolean
  onClose: () => void
  isPinned?: boolean
  defaultPinned?: boolean
  onTogglePin?: (pinned: boolean) => void
  defaultWidth?: number
  defaultHeight?: number | string
  minWidth?: number
  minHeight?: number
  className?: string
  children: React.ReactNode
}

/**
 * Window component providing draggable, resizable, dockable floating window behaviour.
 *
 * @param {WindowProps} arg0_props
 *
 * @returns {React.ReactElement | null}
 */
export let Window: React.FC<WindowProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    children,
    className = '',
    defaultHeight = 'auto',
    defaultPinned = true,
    defaultWidth = 336,
    icon = 'info',
    isPinned: controlled_pinned,
    isOpen: is_open,
    minHeight = 200,
    minWidth = 280,
    onClose: on_close,
    onTogglePin: on_toggle_pin,
    title,
  } = props

  //Declare local instance variables
  let bring_to_front: () => void
  let drag_ref = useRef<{
    active: boolean
    currH: number
    currW: number
    currX: number
    currY: number
    initH: number
    initW: number
    initX: number
    initY: number
    startX: number
    startY: number
    type: 'move' | 'resize-e' | 'resize-s' | 'resize-se' | null
  }>({
    active: false,
    currH: 0,
    currW: 0,
    currX: 0,
    currY: 0,
    initH: 0,
    initW: 0,
    initX: 0,
    initY: 0,
    startX: 0,
    startY: 0,
    type: null,
  })
  let handle_header_mouse_down: (arg0_e: React.MouseEvent) => void
  let handle_resize_start: (arg0_e: React.MouseEvent, arg1_type: 'resize-e' | 'resize-s' | 'resize-se') => void
  let internal_pinned: boolean
  let is_interacting: boolean
  let is_pinned: boolean
  let panel_ref = useRef<HTMLDivElement>(null)
  let pos: { x: number; y: number }
  let set_internal_pinned: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_interacting: React.Dispatch<React.SetStateAction<boolean>>
  let set_pinned: (arg0_next_pinned: boolean) => void
  let set_pos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  let set_size: React.Dispatch<React.SetStateAction<{ height?: number; width: number }>>
  let set_z_index: React.Dispatch<React.SetStateAction<number>>
  let size: { height?: number; width: number }
  let unpin_at_current_rect: (arg0_client_x?: number, arg1_client_y?: number) => void
  let window_element: React.ReactElement
  let z_index: number

  //Function body
  ;[internal_pinned, set_internal_pinned] = useState(defaultPinned)
  is_pinned = (controlled_pinned !== undefined) ? controlled_pinned : internal_pinned

  set_pinned = useCallback(
    (arg0_next_pinned: boolean) => {
      let next_pinned = arg0_next_pinned
      set_internal_pinned(next_pinned)
      if (on_toggle_pin)
        on_toggle_pin(next_pinned)
    },
    [on_toggle_pin]
  )

  ;[z_index, set_z_index] = useState<number>(() => getNextTopZIndex())

  bring_to_front = useCallback(() => {
    let next_z = getNextTopZIndex()
    set_z_index(next_z)
    if (panel_ref.current)
      panel_ref.current.style.zIndex = `${next_z}`
  }, [])

  ;[pos, set_pos] = useState<{ x: number; y: number }>({ x: 360, y: 12 })
  ;[size, set_size] = useState<{ height?: number; width: number }>({
    width: defaultWidth,
  })
  ;[is_interacting, set_is_interacting] = useState(false)

  //Transition to unpinned mode
  unpin_at_current_rect = useCallback(
    (arg0_client_x?: number, arg1_client_y?: number) => {
      let client_x = arg0_client_x
      let client_y = arg1_client_y
      let el = panel_ref.current
      if (!el) {
        set_pinned(false)
        return
      }

      let rect = el.getBoundingClientRect()
      let current_h = Math.max(minHeight, Math.round(rect.height))
      let current_w = Math.max(minWidth, Math.round(rect.width))

      el.style.width = `${current_w}px`
      el.style.left = `${rect.left}px`
      el.style.top = `${rect.top}px`

      let next_z = getNextTopZIndex()
      set_z_index(next_z)
      el.style.zIndex = `${next_z}`

      set_pos({ x: rect.left, y: rect.top })
      set_size({ height: current_h, width: current_w })
      set_pinned(false)

      if (client_x !== undefined && client_y !== undefined) {
        drag_ref.current = {
          active: true,
          currH: current_h,
          currW: current_w,
          currX: rect.left,
          currY: rect.top,
          initH: current_h,
          initW: current_w,
          initX: rect.left,
          initY: rect.top,
          startX: client_x,
          startY: client_y,
          type: 'move',
        }
        set_is_interacting(true)
      }
    },
    [minWidth, minHeight, set_pinned]
  )

  //Header MouseDown drag handler
  handle_header_mouse_down = function (arg0_e: React.MouseEvent) {
    let e = arg0_e
    if (e.button !== 0)
      return
    let target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('a'))
      return

    e.preventDefault()
    e.stopPropagation()

    bring_to_front()

    if (is_pinned) {
      unpin_at_current_rect(e.clientX, e.clientY)
      return
    }

    let el = panel_ref.current
    if (!el)
      return
    let rect = el.getBoundingClientRect()

    drag_ref.current = {
      active: true,
      currH: rect.height,
      currW: rect.width,
      currX: rect.left,
      currY: rect.top,
      initH: rect.height,
      initW: rect.width,
      initX: rect.left,
      initY: rect.top,
      startX: e.clientX,
      startY: e.clientY,
      type: 'move',
    }
    set_is_interacting(true)
  }

  //Resize Handlers
  handle_resize_start = function (
    arg0_e: React.MouseEvent,
    arg1_type: 'resize-e' | 'resize-s' | 'resize-se'
  ) {
    let e = arg0_e
    let type = arg1_type
    if (is_pinned || e.button !== 0)
      return
    e.preventDefault()
    e.stopPropagation()

    bring_to_front()

    let el = panel_ref.current
    if (!el)
      return
    let rect = el.getBoundingClientRect()

    drag_ref.current = {
      active: true,
      currH: rect.height,
      currW: rect.width,
      currX: rect.left,
      currY: rect.top,
      initH: rect.height,
      initW: rect.width,
      initX: rect.left,
      initY: rect.top,
      startX: e.clientX,
      startY: e.clientY,
      type,
    }
    set_is_interacting(true)
  }

  //Global mousemove and mouseup listeners
  useEffect(() => {
    if (!is_interacting)
      return

    let raf_id: number | null = null

    let handle_mouse_move = function (arg0_e: MouseEvent) {
      let drag = drag_ref.current
      let e = arg0_e
      if (!drag.active)
        return

      let dx = e.clientX - drag.startX
      let dy = e.clientY - drag.startY

      if (drag.type === 'move') {
        let max_x = Math.max(0, window.innerWidth - 80)
        let max_y = Math.max(0, window.innerHeight - 60)
        drag.currX = Math.max(0, Math.min(max_x, drag.initX + dx))
        drag.currY = Math.max(0, Math.min(max_y, drag.initY + dy))
      } else if (drag.type === 'resize-e') {
        let max_w = Math.max(minWidth, window.innerWidth - drag.initX - 12)
        drag.currW = Math.max(minWidth, Math.min(max_w, drag.initW + dx))
      } else if (drag.type === 'resize-s') {
        let max_h = Math.max(minHeight, window.innerHeight - drag.initY - 12)
        drag.currH = Math.max(minHeight, Math.min(max_h, drag.initH + dy))
      } else if (drag.type === 'resize-se') {
        let max_h = Math.max(minHeight, window.innerHeight - drag.initY - 12)
        let max_w = Math.max(minWidth, window.innerWidth - drag.initX - 12)
        drag.currW = Math.max(minWidth, Math.min(max_w, drag.initW + dx))
        drag.currH = Math.max(minHeight, Math.min(max_h, drag.initH + dy))
      }

      if (raf_id === null) {
        raf_id = requestAnimationFrame(() => {
          let el = panel_ref.current
          if (el) {
            if (drag.type === 'move') {
              el.style.left = `${drag.currX}px`
              el.style.top = `${drag.currY}px`
            } else if (drag.type === 'resize-e') {
              el.style.width = `${drag.currW}px`
            } else if (drag.type === 'resize-s') {
              el.style.height = `${drag.currH}px`
            } else if (drag.type === 'resize-se') {
              el.style.width = `${drag.currW}px`
              el.style.height = `${drag.currH}px`
            }
          }
          raf_id = null
        })
      }
    }

    let handle_mouse_up = function () {
      let drag = drag_ref.current
      drag.active = false
      if (raf_id !== null) {
        cancelAnimationFrame(raf_id)
        raf_id = null
      }

      if (drag.type === 'move') {
        set_pos({ x: drag.currX, y: drag.currY })
      } else if (drag.type === 'resize-e') {
        set_size((arg0_prev) => ({ ...arg0_prev, width: drag.currW }))
      } else if (drag.type === 'resize-s') {
        set_size((arg0_prev) => ({ ...arg0_prev, height: drag.currH }))
      } else if (drag.type === 'resize-se') {
        set_size({ height: drag.currH, width: drag.currW })
      }

      set_is_interacting(false)
    }

    window.addEventListener('mousemove', handle_mouse_move, { passive: true })
    window.addEventListener('mouseup', handle_mouse_up)

    return () => {
      if (raf_id !== null)
        cancelAnimationFrame(raf_id)
      window.removeEventListener('mousemove', handle_mouse_move)
      window.removeEventListener('mouseup', handle_mouse_up)
    }
  }, [is_interacting, minWidth, minHeight])

  //Guard clauses
  if (!is_open)
    return null

  window_element = (
    <>
      {/* Invisible Full-Screen Capture Backdrop during drag/resize */}
      {is_interacting && (
        <div
          className="fixed inset-0 z-[99999] select-none"
          style={{
            cursor:
              drag_ref.current.type === 'move'
                ? 'move'
                : drag_ref.current.type === 'resize-e'
                ? 'ew-resize'
                : drag_ref.current.type === 'resize-s'
                ? 'ns-resize'
                : 'nwse-resize',
          }}
        />
      )}

      <div
        ref={panel_ref}
        onMouseDownCapture={bring_to_front}
        style={
          is_pinned
            ? { maxHeight: '100%', width: '100%' }
            : {
                height: size.height ? `${size.height}px` : undefined,
                left: `${pos.x}px`,
                position: 'fixed',
                top: `${pos.y}px`,
                width: `${size.width}px`,
                zIndex: z_index,
              }
        }
        className={
          is_pinned
            ? `relative z-30 flex flex-col bg-card/98 backdrop-blur-md border border-border shadow-2xl p-[var(--padding)] text-[var(--body-font-size)] font-sans select-none pointer-events-auto max-h-full flex-1 min-h-0 ${className}`
            : `flex flex-col bg-card/98 backdrop-blur-md border border-border shadow-2xl p-[var(--padding)] text-[var(--body-font-size)] font-sans select-none pointer-events-auto max-h-[calc(100vh-32px)] ${className}`
        }
      >
        {/* Window Header (Draggable) */}
        <div
          onMouseDown={handle_header_mouse_down}
          className="flex items-center justify-between pb-2 border-b border-border shrink-0 cursor-move select-none"
          title={is_pinned ? 'Click and drag to float window' : 'Drag to move window'}
        >
          {/* Left: Drag Handle, Icon, Title */}
          <div className="flex items-center gap-1.5 leading-none min-w-0">
            <Icon name="drag_indicator" className="text-white/40 text-sm shrink-0" />
            <Icon name={icon} className="text-white text-base shrink-0" />
            <span className="font-bold text-white text-[var(--header-font-size)] tracking-tight truncate">
              {title}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 leading-none shrink-0">
            <button
              type="button"
              onClick={() => {
                if (is_pinned) {
                  unpin_at_current_rect()
                } else {
                  set_pinned(true)
                }
              }}
              className="text-white/80 hover:text-white cursor-pointer p-1 rounded-none hover:bg-muted/50 transition-colors flex items-center justify-center"
              title={is_pinned ? 'Unpin into floating window' : 'Dock under Value colourbar'}
              aria-label={is_pinned ? 'Unpin window' : 'Dock window'}
            >
              <PushpinIcon isPinned={is_pinned} className="text-white w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={on_close}
              className="text-white/80 hover:text-white cursor-pointer p-1 rounded-none hover:bg-muted/50 transition-colors flex items-center justify-center"
              aria-label="Close window"
              title="Close window"
            >
              <Icon name="close" className="text-white text-sm" />
            </button>
          </div>
        </div>

        {/* Window Body Container */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-[var(--cell-padding)]">
          {children}
        </div>

        {/* Resize Handles (Enabled when unpinned) */}
        {!is_pinned && (
          <>
            {/* Right border resize handle */}
            <div
              onMouseDown={(arg0_e) => handle_resize_start(arg0_e, 'resize-e')}
              className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/40 active:bg-primary transition-colors z-20"
              title="Resize width"
            />
            {/* Bottom border resize handle */}
            <div
              onMouseDown={(arg0_e) => handle_resize_start(arg0_e, 'resize-s')}
              className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-primary/40 active:bg-primary transition-colors z-20"
              title="Resize height"
            />
            {/* Bottom-right corner resize handle */}
            <div
              onMouseDown={(arg0_e) => handle_resize_start(arg0_e, 'resize-se')}
              className="absolute right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize hover:bg-primary/60 active:bg-primary transition-colors z-30 flex items-end justify-end p-0.5"
              title="Resize window"
            >
              <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-white/60" />
            </div>
          </>
        )}
      </div>
    </>
  )

  //When unpinned, portal directly to document.body
  if (!is_pinned && typeof document !== 'undefined')
    return createPortal(window_element, document.body)

  //Return statement
  return window_element
}

export default Window
