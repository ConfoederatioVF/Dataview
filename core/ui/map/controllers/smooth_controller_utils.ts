/**
 * Shared utility functions for Deck.gl smooth map, globe, and orbit controllers.
 */

let active_hardware_touch_count: number | null = null

let smooth_pinch_state: {
  gesture_mode: 'undetermined' | 'pitch' | 'zoom_rotate'
  last_event: any
  last_pinch_end_time: number
  start_center: [number, number] | null
  start_dist: number
  start_p0: { x: number; y: number } | null
  start_p1: { x: number; y: number } | null
  start_rotation: number | null
} = {
  gesture_mode: 'undetermined',
  last_event: null,
  last_pinch_end_time: 0,
  start_center: null,
  start_dist: 0,
  start_p0: null,
  start_p1: null,
  start_rotation: null,
}


/**
 * Ensures `pancancel`, `pinchcancel`, and `multipancancel` events are subscribed on the Deck.gl controller's eventManager,
 * and relaxes `pinch` vs `multipan` contention so two-finger vertical tilt never deadlocks.
 *
 * @param {any} arg0_controller
 *
 * @returns {void}
 */
function ensureCancelEventsRegistered (arg0_controller: any): void {
  //Convert from parameters
  let controller = arg0_controller

  //Declare local instance variables
  let event_manager: any
  let manager: any
  let multipan_rec: any
  let pinch_rec: any

  //Guard clauses
  if (!controller || !controller.eventManager)
    return

  //Function body
  event_manager = controller.eventManager
  if (controller._registeredCancelEvents !== event_manager) {
    controller._registeredCancelEvents = event_manager
    try {
      event_manager.on(
        {
          multipancancel: controller.handleEvent,
          pancancel: controller.handleEvent,
          pinchcancel: controller.handleEvent,
        },
        controller._eventOptions
      )
    } catch {
      //Ignore registration errors if eventManager does not support cancel events
    }

    //Remove requireFailure contention between pinch and multipan so vertical 2-finger tilt never forces pinch into Failed/Cancelled deadlock
    manager = event_manager.manager
    if (manager && typeof manager.get === 'function') {
      try {
        pinch_rec = manager.get('pinch')
        multipan_rec = manager.get('multipan')
        if (pinch_rec && multipan_rec && typeof pinch_rec.dropRequireFailure === 'function')
          pinch_rec.dropRequireFailure(multipan_rec)
      } catch {
        //Ignore recognizer adjustment errors
      }
    }
  }
}


/**
 * Extracts the first two touch pointer client coordinates from a gesture event.
 *
 * @param {any} arg0_event
 *
 * @returns {Array<{ x: number; y: number }> | null}
 */
function extractTouchPoints (arg0_event: any): Array<{ x: number; y: number }> | null {
  //Convert from parameters
  let event = arg0_event

  //Declare local instance variables
  let src: any
  let touch_pointers: any[] = []

  //Guard clauses
  if (!event)
    return null

  //Function body
  src = event.srcEvent

  //Prefer native TouchEvent.touches when available as it reflects live hardware touches
  if (src && src.touches && src.touches.length >= 2) {
    //Return statement
    return [
      { x: src.touches[0].clientX, y: src.touches[0].clientY },
      { x: src.touches[1].clientX, y: src.touches[1].clientY },
    ]
  }

  if (event.pointers && event.pointers.length >= 2) {
    for (let i = 0; i < event.pointers.length; i++) {
      let local_p = event.pointers[i]
      if (!local_p.pointerType || local_p.pointerType === 'touch')
        touch_pointers.push(local_p)
    }

    if (touch_pointers.length >= 2) {
      //Return statement
      return [
        { x: touch_pointers[0].clientX, y: touch_pointers[0].clientY },
        { x: touch_pointers[1].clientX, y: touch_pointers[1].clientY },
      ]
    }

    //Return statement
    return [
      { x: event.pointers[0].clientX, y: event.pointers[0].clientY },
      { x: event.pointers[1].clientX, y: event.pointers[1].clientY },
    ]
  }

  //Return statement
  return null
}


/**
 * Forcefully clears phantom pointers, resets Mjolnir recognizer session state,
 * and ends any stuck drag/rotate/zoom state on a Deck.gl controller.
 *
 * @param {any} arg0_controller
 * @param {boolean} [arg1_clear_all_pointers]
 *
 * @returns {void}
 */
export function forceResetControllerInteraction (arg0_controller: any, arg1_clear_all_pointers?: boolean): void {
  //Convert from parameters
  let controller = arg0_controller
  let clear_all_pointers = Boolean(arg1_clear_all_pointers)

  //Declare local instance variables
  let manager: any
  let new_controller_state: any
  let recognizers: any[]
  let store: any[]

  //Guard clauses
  if (!controller)
    return

  //Function body
  resetSmoothPinchState()
  controller._multiPanMode = null
  controller._eventStartBlocked = null

  manager = controller.eventManager?.manager
  if (manager) {
    store = manager.input?.store
    if (Array.isArray(store)) {
      if (clear_all_pointers) {
        store.length = 0
      } else {
        for (let i = store.length - 1; i >= 0; i--) {
          if (!store[i]?.pointerType || store[i].pointerType === 'touch')
            store.splice(i, 1)
        }
      }
    }

    if (manager.session) {
      manager.session.curRecognizer = null
      manager.session.pointerEvents = store || []
    }

    recognizers = manager.recognizers
    if (Array.isArray(recognizers)) {
      for (let i = 0; i < recognizers.length; i++) {
        if (recognizers[i])
          recognizers[i].state = 1
      }
    }
  }

  if (controller.controllerState && typeof controller.isDragging === 'function' && controller.isDragging()) {
    new_controller_state = controller.controllerState
    if (typeof new_controller_state.panEnd === 'function')
      new_controller_state = new_controller_state.panEnd()
    if (typeof new_controller_state.rotateEnd === 'function')
      new_controller_state = new_controller_state.rotateEnd()
    if (typeof new_controller_state.zoomEnd === 'function')
      new_controller_state = new_controller_state.zoomEnd()

    controller.updateViewport(new_controller_state, null, {
      isDragging: false,
      isPanning: false,
      isRotating: false,
      isZooming: false,
    })
  }
}


/**
 * Extracts active Deck.gl controller instances from a DeckGL React ref or Deck instance.
 *
 * @param {any} arg0_deck_instance
 *
 * @returns {any[]}
 */
function getControllersFromDeck (arg0_deck_instance: any): any[] {
  //Convert from parameters
  let deck_instance = arg0_deck_instance

  //Declare local instance variables
  let controllers_array: any[] = []
  let deck: any
  let view_manager: any

  //Guard clauses
  if (!deck_instance)
    return controllers_array

  //Function body
  deck = deck_instance.deck || deck_instance
  view_manager = deck?.viewManager
  if (view_manager && view_manager.controllers) {
    let all_controller_keys = Object.keys(view_manager.controllers)
    for (let i = 0; i < all_controller_keys.length; i++) {
      let local_ctrl = view_manager.controllers[all_controller_keys[i]]
      if (local_ctrl)
        controllers_array.push(local_ctrl)
    }
  }

  //Return statement
  return controllers_array
}


/**
 * Unified event router for smooth controllers that reconciles phantom pointers,
 * handles `*cancel` events, and routes `multipan*` through the smooth pinch/tilt pipeline.
 *
 * @param {any} arg0_controller
 * @param {any} arg1_event
 * @param {(arg0_e: any) => any} arg2_super_handle_event
 *
 * @returns {any}
 */
export function handleControllerEvent (
  arg0_controller: any,
  arg1_event: any,
  arg2_super_handle_event: (arg0_e: any) => any
): any {
  //Convert from parameters
  let controller = arg0_controller
  let event = arg1_event
  let super_handle_event = arg2_super_handle_event

  //Declare local instance variables
  let event_type: string

  //Guard clauses
  if (!controller || !event)
    return false

  //Function body
  ensureCancelEventsRegistered(controller)
  reconcileControllerPointers(controller, event)

  event_type = event.type
  if (event_type === 'pancancel') {
    //Return statement
    return controller._onPanEnd ? controller._onPanEnd(event) : false
  } else if (event_type === 'pinchcancel' || event_type === 'multipancancel' || event_type === 'multipanend') {
    //Return statement
    return handleSmoothPinchEnd(controller, event)
  } else if (event_type === 'multipanstart') {
    //Return statement
    return handleSmoothPinchStart(controller, event)
  } else if (event_type === 'multipanmove') {
    //Return statement
    return handleSmoothPinch(controller, event)
  }

  //Return statement
  return super_handle_event.call(controller, event)
}


/**
 * Handles pinch move event allowing two-finger vertical dragging to control camera tilt in place,
 * while preserving standard natural pinch-to-zoom and twist-to-rotate sensitivity.
 *
 * @param {any} arg0_controller
 * @param {any} arg1_event
 *
 * @returns {boolean}
 */
export function handleSmoothPinch (arg0_controller: any, arg1_event: any): boolean {
  //Convert from parameters
  let controller = arg0_controller
  let event = arg1_event

  //Declare local instance variables
  let avg_dy = 0
  let current_dist = 0
  let delta_angle_x = 0
  let delta_angle_y = 0
  let delta_dist = 0
  let delta_rot = 0
  let delta_scale = 0
  let dx0 = 0
  let dx1 = 0
  let dy0 = 0
  let dy1 = 0
  let is_parallel_vertical = false
  let new_controller_state: any
  let pos: [number, number]
  let touch_pts: Array<{ x: number; y: number }> | null
  let viewport_height: number
  let viewport_props: any

  //Guard clauses
  if (!controller || !event)
    return false
  if (!controller.touchZoom && !controller.touchRotate)
    return false

  //Function body
  reconcileControllerPointers(controller, event)
  touch_pts = extractTouchPoints(event)

  //If fewer than 2 physical touch points remain, immediately end the pinch rather than actuating with a phantom finger
  if (!touch_pts || touch_pts.length < 2 || (active_hardware_touch_count !== null && active_hardware_touch_count < 2)) {
    handleSmoothPinchEnd(controller, event)
    return false
  }

  //If pinchstart was skipped (e.g. recognizer transition or rapid re-touch), initialise start state on the fly
  if (!controller.isDragging() || !smooth_pinch_state.start_center || !smooth_pinch_state.start_p0 || !smooth_pinch_state.start_p1) {
    handleSmoothPinchStart(controller, event)
  }

  new_controller_state = controller.controllerState
  pos = controller.getCenter(event)

  //1. Determine gesture mode if undetermined (Google Maps/Earth mobile gesture classification)
  if (smooth_pinch_state.gesture_mode === 'undetermined') {
    delta_scale = Math.abs((event.scale || 1) - 1)
    delta_rot = Math.abs((event.rotation || 0) - (smooth_pinch_state.start_rotation || 0))

    if (touch_pts && touch_pts.length >= 2 && smooth_pinch_state.start_p0 && smooth_pinch_state.start_p1) {
      dx0 = touch_pts[0].x - smooth_pinch_state.start_p0.x
      dy0 = touch_pts[0].y - smooth_pinch_state.start_p0.y
      dx1 = touch_pts[1].x - smooth_pinch_state.start_p1.x
      dy1 = touch_pts[1].y - smooth_pinch_state.start_p1.y
      current_dist = Math.hypot(touch_pts[1].x - touch_pts[0].x, touch_pts[1].y - touch_pts[0].y)
      delta_dist = Math.abs(current_dist - smooth_pinch_state.start_dist)
      avg_dy = (dy0 + dy1)/2

      //Check if both touches are moving in parallel in the same vertical direction
      is_parallel_vertical = (dy0*dy1 > 0) &&
        (Math.abs(dy0) > Math.abs(dx0)*0.6) &&
        (Math.abs(dy1) > Math.abs(dx1)*0.6)

      if (is_parallel_vertical && Math.abs(avg_dy) > 10 && delta_dist < Math.abs(avg_dy)*0.7 && delta_rot < 20) {
        smooth_pinch_state.gesture_mode = 'pitch'
      } else if (delta_scale > 0.05 || delta_dist > 14 || delta_rot > 15) {
        smooth_pinch_state.gesture_mode = 'zoom_rotate'
      }
    } else if (smooth_pinch_state.start_center) {
      avg_dy = pos[1] - smooth_pinch_state.start_center[1]
      if (Math.abs(avg_dy) > 12 && delta_scale < 0.06 && delta_rot < 15) {
        smooth_pinch_state.gesture_mode = 'pitch'
      } else if (delta_scale > 0.05 || delta_rot > 15) {
        smooth_pinch_state.gesture_mode = 'zoom_rotate'
      }
    }
  }

  //2. Execute gesture based on determined mode
  if (smooth_pinch_state.gesture_mode === 'pitch') {
    //Mode: PITCH IN PLACE (two fingers dragging vertically)
    if (touch_pts && touch_pts.length >= 2 && smooth_pinch_state.start_p0 && smooth_pinch_state.start_p1) {
      dy0 = touch_pts[0].y - smooth_pinch_state.start_p0.y
      dy1 = touch_pts[1].y - smooth_pinch_state.start_p1.y
      avg_dy = (dy0 + dy1)/2
    } else if (smooth_pinch_state.start_center) {
      avg_dy = pos[1] - smooth_pinch_state.start_center[1]
    }

    viewport_props = controller.controllerState.getViewportProps()
    viewport_height = viewport_props?.height || (typeof window !== 'undefined' ? window.innerHeight : 600)
    delta_angle_y = (-avg_dy/(viewport_height*0.4))*60

    //Ensure startRotateLngLat is null so rotation/pitch is strictly in place without panning or zooming
    new_controller_state = new_controller_state
      ._getUpdatedState({ startRotateLngLat: null })
      .rotate(
        { deltaAngleX: 0, deltaAngleY: delta_angle_y },
        controller._getConstraintContext('rotate', 'update')
      )

    controller.updateViewport(new_controller_state, { transitionDuration: 0 }, {
      isDragging: true,
      isPanning: false,
      isRotating: true,
      isZooming: false,
    })
  } else if (smooth_pinch_state.gesture_mode === 'zoom_rotate') {
    //Mode: STANDARD ZOOM & ROTATE (natural Deck.gl/Google Maps pinch zoom sensitivity)
    if (controller.touchZoom && event.scale !== undefined && Number.isFinite(event.scale) && event.scale > 0)
      new_controller_state = new_controller_state.zoom(
        { pos: controller.getZoomPosition(pos), scale: event.scale },
        controller._getConstraintContext('zoom', 'update')
      )

    if (controller.touchRotate && event.rotation !== undefined && smooth_pinch_state.start_rotation !== null) {
      delta_angle_x = smooth_pinch_state.start_rotation - event.rotation
      new_controller_state = new_controller_state.rotate(
        { deltaAngleX: delta_angle_x, deltaAngleY: 0 },
        controller._getConstraintContext('rotate', 'update')
      )
    }

    controller.updateViewport(new_controller_state, { transitionDuration: 0 }, {
      isDragging: true,
      isPanning: Boolean(controller.touchZoom),
      isRotating: Boolean(controller.touchRotate),
      isZooming: Boolean(controller.touchZoom),
    })
  }

  smooth_pinch_state.last_event = event

  //Return statement
  return true
}


/**
 * Handles pinch end event, finalising zoom and rotate transitions.
 *
 * @param {any} arg0_controller
 * @param {any} arg1_event
 *
 * @returns {boolean}
 */
export function handleSmoothPinchEnd (arg0_controller: any, arg1_event: any): boolean {
  //Convert from parameters
  let controller = arg0_controller
  let event = arg1_event

  //Declare local instance variables
  let delta_time: number
  let end_scale: number
  let last_event: any
  let new_controller_state: any
  let pos: [number, number]
  let velocity_z: number
  let z: number
  let zoom_position: [number, number]

  //Guard clauses
  if (!controller) {
    resetSmoothPinchState()
    return false
  }

  //Function body
  controller._multiPanMode = null
  reconcileControllerPointers(controller, event)

  if (!controller.isDragging()) {
    resetSmoothPinchState()
    smooth_pinch_state.last_pinch_end_time = Date.now()
    return false
  }

  last_event = smooth_pinch_state.last_event
  delta_time = (event && last_event) ? (event.deltaTime - last_event.deltaTime) : 0
  if (
    smooth_pinch_state.gesture_mode === 'zoom_rotate' &&
    controller.touchZoom &&
    controller.inertia &&
    last_event &&
    event &&
    event.scale !== undefined &&
    last_event.scale !== undefined &&
    event.scale > 0 &&
    last_event.scale > 0 &&
    event.scale !== last_event.scale &&
    delta_time > 0
  ) {
    pos = controller.getCenter(event)
    zoom_position = controller.getZoomPosition(pos)
    new_controller_state = controller.controllerState.panEnd().rotateEnd()
    z = Math.log2(event.scale)
    velocity_z = (z - Math.log2(last_event.scale))/delta_time
    end_scale = Math.pow(2, z + (velocity_z*controller.inertia)/2)
    new_controller_state = new_controller_state.zoom({ pos: zoom_position, scale: end_scale }).zoomEnd()

    controller.updateViewport(
      new_controller_state,
      {
        ...controller._getTransitionProps({ around: zoom_position }),
        transitionDuration: controller.inertia,
      },
      {
        isDragging: false,
        isPanning: controller.touchZoom,
        isRotating: false,
        isZooming: controller.touchZoom,
      }
    )
  } else {
    new_controller_state = controller.controllerState.panEnd().zoomEnd().rotateEnd()
    controller.updateViewport(new_controller_state, null, {
      isDragging: false,
      isPanning: false,
      isRotating: false,
      isZooming: false,
    })
  }

  resetSmoothPinchState()
  smooth_pinch_state.last_pinch_end_time = Date.now()

  //Return statement
  return true
}


/**
 * Handles pinch start event for smooth two-finger gestures including tilt and rotation in place.
 *
 * @param {any} arg0_controller
 * @param {any} arg1_event
 *
 * @returns {boolean}
 */
export function handleSmoothPinchStart (arg0_controller: any, arg1_event: any): boolean {
  //Convert from parameters
  let controller = arg0_controller
  let event = arg1_event

  //Declare local instance variables
  let new_controller_state: any
  let pos: [number, number]
  let touch_pts: Array<{ x: number; y: number }> | null

  //Guard clauses
  if (!controller || !event)
    return false

  //Function body
  reconcileControllerPointers(controller, event)
  touch_pts = extractTouchPoints(event)
  if (!touch_pts || touch_pts.length < 2)
    return false

  pos = controller.getCenter(event)
  if (!controller.isPointInBounds(pos, event))
    return false

  controller._multiPanMode = null
  controller._eventStartBlocked = null

  //Cleanly end any in-progress single-finger pan before starting two-finger zoom/rotate
  new_controller_state = controller.controllerState
    .panEnd()
    .zoomStart({ pos: controller.getZoomPosition(pos) }, controller._getConstraintContext('zoom', 'start'))
    .rotateStart({ pos }, controller._getConstraintContext('rotate', 'start'))

  smooth_pinch_state.gesture_mode = 'undetermined'
  smooth_pinch_state.last_event = event
  smooth_pinch_state.start_center = pos
  smooth_pinch_state.start_rotation = event.rotation !== undefined ? event.rotation : 0
  smooth_pinch_state.start_p0 = touch_pts[0]
  smooth_pinch_state.start_p1 = touch_pts[1]
  smooth_pinch_state.start_dist = Math.hypot(touch_pts[1].x - touch_pts[0].x, touch_pts[1].y - touch_pts[0].y)

  controller.updateViewport(new_controller_state, { transitionDuration: 0 }, { isDragging: true })

  //Return statement
  return true
}


/**
 * Checks whether the modifier function key (Ctrl or Meta) is pressed on an input event.
 *
 * @param {any} arg0_event
 *
 * @returns {boolean}
 */
export function isFunctionKeyPressed (arg0_event: any): boolean {
  //Convert from parameters
  let event = arg0_event

  //Declare local instance variables
  let src = event?.srcEvent

  //Return statement
  return Boolean(src?.ctrlKey || src?.metaKey)
}


/**
 * Determines whether an input event or the current hardware state represents a multi-touch gesture.
 *
 * @param {any} arg0_event
 *
 * @returns {boolean}
 */
export function isMultiTouchEvent (arg0_event: any): boolean {
  //Convert from parameters
  let event = arg0_event

  //Guard clauses
  if (active_hardware_touch_count !== null && active_hardware_touch_count > 1)
    return true
  if (active_hardware_touch_count === 1)
    return false
  if (event?.srcEvent?.touches && event.srcEvent.touches.length > 1)
    return true
  if (event?.pointers && event.pointers.length > 1)
    return true

  //Return statement
  return false
}


/**
 * Returns whether single-finger pan start should be suppressed briefly after a two-finger pinch/tilt ends.
 *
 * @returns {boolean}
 */
export function isSingleFingerPanBlocked (): boolean {
  //Return statement
  return (Date.now() - smooth_pinch_state.last_pinch_end_time) < 150
}


/**
 * Returns whether a two-finger smooth pinch/tilt gesture is currently active.
 *
 * @returns {boolean}
 */
export function isSmoothPinchActive (): boolean {
  //Return statement
  return smooth_pinch_state.start_center !== null
}


/**
 * Reconciles Mjolnir.js's `PointerEventInput.store` and `Manager.session` against hardware touch state
 * and W3C PointerEvent invariants to eliminate phantom fingers and stuck recognizers.
 *
 * @param {any} arg0_controller
 * @param {any} [arg1_event]
 *
 * @returns {void}
 */
export function reconcileControllerPointers (arg0_controller: any, arg1_event?: any): void {
  //Convert from parameters
  let controller = arg0_controller
  let event = arg1_event

  //Declare local instance variables
  let cur_recognizer: any
  let latest_primary_idx = -1
  let latest_primary_ts = -1
  let latest_ts = -1
  let manager: any
  let primary_count = 0
  let src_event: any
  let store: any[]
  let touch_indices: number[] = []

  //Guard clauses
  if (!controller)
    return

  //Function body
  manager = controller.eventManager?.manager
  if (!manager)
    return

  store = manager.input?.store
  src_event = event?.srcEvent

  if (Array.isArray(store) && store.length > 0) {
    //1. If a new primary touch pointerdown arrives, the browser guarantees no other touch pointer is active
    if (
      src_event &&
      src_event.pointerType === 'touch' &&
      src_event.isPrimary === true &&
      src_event.type === 'pointerdown'
    ) {
      for (let i = store.length - 1; i >= 0; i--) {
        if (store[i]?.pointerType === 'touch' && store[i].pointerId !== src_event.pointerId)
          store.splice(i, 1)
      }
    }

    //2. Collect touch pointers in store and inspect timestamps & isPrimary invariants
    for (let i = 0; i < store.length; i++) {
      let local_p = store[i]
      if (!local_p?.pointerType || local_p.pointerType === 'touch') {
        touch_indices.push(i)
        let local_ts = Number(local_p?.timeStamp) || 0
        if (local_ts > latest_ts)
          latest_ts = local_ts
        if (local_p?.isPrimary) {
          primary_count++
          if (local_ts >= latest_primary_ts) {
            latest_primary_ts = local_ts
            latest_primary_idx = i
          }
        }
      }
    }

    //3. W3C PointerEvent invariant: at most ONE touch pointer can have isPrimary === true
    if (primary_count > 1 && latest_primary_idx >= 0) {
      for (let i = store.length - 1; i >= 0; i--) {
        if (i !== latest_primary_idx && store[i]?.pointerType === 'touch' && store[i]?.isPrimary)
          store.splice(i, 1)
      }
    }

    //4. Reconcile against known hardware TouchEvent.touches count
    if (active_hardware_touch_count !== null) {
      if (active_hardware_touch_count === 0) {
        for (let i = store.length - 1; i >= 0; i--) {
          if (!store[i]?.pointerType || store[i].pointerType === 'touch')
            store.splice(i, 1)
        }
      } else if (store.length > active_hardware_touch_count) {
        //Keep only the most recently updated pointers matching the active hardware touch count
        let sorted_pointers = [...store].sort((arg0_a, arg1_b) => (Number(arg1_b?.timeStamp) || 0) - (Number(arg0_a?.timeStamp) || 0))
        let keep_ids = new Set<any>()
        for (let i = 0; i < active_hardware_touch_count && i < sorted_pointers.length; i++)
          keep_ids.add(sorted_pointers[i]?.pointerId)

        for (let i = store.length - 1; i >= 0; i--) {
          if ((!store[i]?.pointerType || store[i].pointerType === 'touch') && !keep_ids.has(store[i]?.pointerId))
            store.splice(i, 1)
        }
      }
    } else if (touch_indices.length > 1 && latest_ts > 0) {
      //5. Fallback staleness pruning: if a touch pointer hasn't updated in > 2500ms while another touch pointer is moving
      for (let i = store.length - 1; i >= 0; i--) {
        let local_p = store[i]
        if (!local_p?.pointerType || local_p.pointerType === 'touch') {
          let local_ts = Number(local_p?.timeStamp) || 0
          if (latest_ts - local_ts > 2500)
            store.splice(i, 1)
        }
      }
    }

    //Sync event.pointers with pruned store so downstream handlers see the accurate pointer count
    if (event && Array.isArray(event.pointers) && event.pointers.length !== store.length)
      event.pointers = [...store]
  }

  //6. Clear stuck curRecognizer if it entered Cancelled (16) or Failed (32) state, or lacks required pointers
  if (manager.session) {
    cur_recognizer = manager.session.curRecognizer
    if (cur_recognizer) {
      let is_cancelled_or_failed = (cur_recognizer.state & (16 | 32)) !== 0
      let recognizer_event = cur_recognizer.options?.event
      let needs_two_pointers = (recognizer_event === 'pinch' || recognizer_event === 'multipan')
      let current_pointer_count = Array.isArray(store) ? store.length : 0

      if (is_cancelled_or_failed || (needs_two_pointers && current_pointer_count < 2)) {
        cur_recognizer.state = 1
        manager.session.curRecognizer = null
      }
    }
  }
}


/**
 * Clears and resets all smooth pinch and two-finger gesture state.
 */
export function resetSmoothPinchState (): void {
  //Function body
  smooth_pinch_state.gesture_mode = 'undetermined'
  smooth_pinch_state.last_event = null
  smooth_pinch_state.start_center = null
  smooth_pinch_state.start_dist = 0
  smooth_pinch_state.start_p0 = null
  smooth_pinch_state.start_p1 = null
  smooth_pinch_state.start_rotation = null
}


/**
 * Synchronises the live hardware touch count from native TouchEvents with Deck.gl's controllers,
 * immediately purging phantom pointers and resetting stuck gestures when touches end.
 *
 * @param {any} arg0_deck_instance
 * @param {number | null} arg1_touch_count
 *
 * @returns {void}
 */
export function syncDeckTouchState (arg0_deck_instance: any, arg1_touch_count: number | null): void {
  //Convert from parameters
  let deck_instance = arg0_deck_instance
  let touch_count = arg1_touch_count

  //Declare local instance variables
  let controllers_array: any[]

  //Function body
  active_hardware_touch_count = touch_count
  controllers_array = getControllersFromDeck(deck_instance)

  for (let i = 0; i < controllers_array.length; i++) {
    let local_ctrl = controllers_array[i]
    if (touch_count === 0) {
      forceResetControllerInteraction(local_ctrl, false)
    } else {
      reconcileControllerPointers(local_ctrl)
      if (touch_count === 1 && smooth_pinch_state.start_center !== null)
        handleSmoothPinchEnd(local_ctrl, smooth_pinch_state.last_event)
    }
  }

  if (touch_count === 0)
    active_hardware_touch_count = null
}


