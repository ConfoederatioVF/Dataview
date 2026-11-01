/**
 * Shared utility functions for Deck.gl smooth map, globe, and orbit controllers.
 */

let smooth_pinch_state: {
  gesture_mode: 'undetermined' | 'pitch' | 'zoom_rotate'
  last_event: any
  last_pinch_end_time: number
  last_scale: number
  start_center: [number, number] | null
  start_dist: number
  start_p0: { x: number; y: number } | null
  start_p1: { x: number; y: number } | null
  start_rotation: number | null
} = {
  gesture_mode: 'undetermined',
  last_event: null,
  last_pinch_end_time: 0,
  last_scale: 1,
  start_center: null,
  start_dist: 0,
  start_p0: null,
  start_p1: null,
  start_rotation: null,
}


/**
 * Forcefully clears phantom touch pointers from Hammer/Mjolnir and ends any stuck drag/zoom/rotate state on Deck controllers.
 * Called strictly when all fingers have left the screen (hardware touch count is 0) or on window blur/visibility hidden.
 *
 * @param {any} arg0_deck_instance
 *
 * @returns {void}
 */
export function clearStuckControllerState (arg0_deck_instance: any): void {
  //Convert from parameters
  let deck_instance = arg0_deck_instance

  //Declare local instance variables
  let controllers_array: any[]
  let manager: any
  let new_controller_state: any
  let recognizers: any[]
  let store: any[]

  //Function body
  resetSmoothPinchState()

  controllers_array = getControllersFromDeck(deck_instance)
  for (let i = 0; i < controllers_array.length; i++) {
    let local_ctrl = controllers_array[i]
    if (!local_ctrl)
      continue

    local_ctrl._multiPanMode = null

    manager = local_ctrl.eventManager?.manager
    if (manager) {
      store = manager.input?.store
      if (Array.isArray(store)) {
        for (let x = store.length - 1; x >= 0; x--) {
          if (!store[x]?.pointerType || store[x].pointerType === 'touch')
            store.splice(x, 1)
        }
      }

      if (manager.session) {
        manager.session.curRecognizer = null
        manager.session.pointerEvents = []
      }

      recognizers = manager.recognizers
      if (Array.isArray(recognizers)) {
        for (let x = 0; x < recognizers.length; x++) {
          if (recognizers[x] && (recognizers[x].state & (16 | 32)) !== 0)
            recognizers[x].state = 1
        }
      }
    }

    if (local_ctrl.controllerState && typeof local_ctrl.isDragging === 'function' && local_ctrl.isDragging()) {
      new_controller_state = local_ctrl.controllerState
      if (typeof new_controller_state.panEnd === 'function')
        new_controller_state = new_controller_state.panEnd()
      if (typeof new_controller_state.rotateEnd === 'function')
        new_controller_state = new_controller_state.rotateEnd()
      if (typeof new_controller_state.zoomEnd === 'function')
        new_controller_state = new_controller_state.zoomEnd()

      local_ctrl.updateViewport(new_controller_state, null, {
        isDragging: false,
        isPanning: false,
        isRotating: false,
        isZooming: false,
      })
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

  //Guard clauses
  if (!event)
    return null

  //Function body
  src = event.srcEvent
  if (src && src.touches && src.touches.length >= 2) {
    //Return statement
    return [
      { x: src.touches[0].clientX, y: src.touches[0].clientY },
      { x: src.touches[1].clientX, y: src.touches[1].clientY },
    ]
  }

  if (event.pointers && event.pointers.length >= 2) {
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
 * Forcefully clears phantom pointers and ends any stuck controller interaction.
 *
 * @param {any} arg0_deck_instance
 *
 * @returns {void}
 */
export function forceResetControllerInteraction (arg0_deck_instance: any): void {
  //Convert from parameters
  let deck_instance = arg0_deck_instance

  //Function body
  clearStuckControllerState(deck_instance)
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
  let computed_scale = 1
  let current_dist = 0
  let d00 = 0
  let d01 = 0
  let d10 = 0
  let d11 = 0
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
  let zoom_scale: number

  //Guard clauses
  if (!controller || !event)
    return false
  if (!controller.touchZoom && !controller.touchRotate)
    return false

  //Function body
  if (!controller.isDragging() || !smooth_pinch_state.start_center)
    handleSmoothPinchStart(controller, event)

  new_controller_state = controller.controllerState
  pos = controller.getCenter(event)
  touch_pts = extractTouchPoints(event)

  if (touch_pts && touch_pts.length >= 2)
    current_dist = Math.hypot(touch_pts[1].x - touch_pts[0].x, touch_pts[1].y - touch_pts[0].y)

  if (smooth_pinch_state.start_dist > 0 && current_dist > 0) {
    computed_scale = current_dist/smooth_pinch_state.start_dist
    delta_dist = Math.abs(current_dist - smooth_pinch_state.start_dist)
  } else if (event.scale !== undefined && Number.isFinite(event.scale) && event.scale > 0) {
    computed_scale = event.scale
  }

  delta_scale = Math.abs(computed_scale - 1)
  delta_rot = Math.abs((event.rotation || 0) - (smooth_pinch_state.start_rotation || 0))

  if (smooth_pinch_state.start_center)
    avg_dy = pos[1] - smooth_pinch_state.start_center[1]

  if (touch_pts && touch_pts.length >= 2 && smooth_pinch_state.start_p0 && smooth_pinch_state.start_p1) {
    d00 = Math.hypot(touch_pts[0].x - smooth_pinch_state.start_p0.x, touch_pts[0].y - smooth_pinch_state.start_p0.y)
    d11 = Math.hypot(touch_pts[1].x - smooth_pinch_state.start_p1.x, touch_pts[1].y - smooth_pinch_state.start_p1.y)
    d01 = Math.hypot(touch_pts[0].x - smooth_pinch_state.start_p1.x, touch_pts[0].y - smooth_pinch_state.start_p1.y)
    d10 = Math.hypot(touch_pts[1].x - smooth_pinch_state.start_p0.x, touch_pts[1].y - smooth_pinch_state.start_p0.y)

    if (d00 + d11 <= d01 + d10) {
      dx0 = touch_pts[0].x - smooth_pinch_state.start_p0.x
      dy0 = touch_pts[0].y - smooth_pinch_state.start_p0.y
      dx1 = touch_pts[1].x - smooth_pinch_state.start_p1.x
      dy1 = touch_pts[1].y - smooth_pinch_state.start_p1.y
    } else {
      dx0 = touch_pts[0].x - smooth_pinch_state.start_p1.x
      dy0 = touch_pts[0].y - smooth_pinch_state.start_p1.y
      dx1 = touch_pts[1].x - smooth_pinch_state.start_p0.x
      dy1 = touch_pts[1].y - smooth_pinch_state.start_p0.y
    }

    is_parallel_vertical = (dy0*dy1 > 0) &&
      (Math.abs(dy0) > Math.abs(dx0)*0.5) &&
      (Math.abs(dy1) > Math.abs(dx1)*0.5)
  }

  //1. Determine gesture mode if undetermined (Google Maps/Earth mobile gesture classification)
  if (smooth_pinch_state.gesture_mode === 'undetermined') {
    if (is_parallel_vertical && Math.abs(avg_dy) > 8 && delta_dist < Math.abs(avg_dy)*0.75 && delta_rot < 20) {
      smooth_pinch_state.gesture_mode = 'pitch'
    } else if (delta_scale > 0.03 || delta_dist > 8 || delta_rot > 12) {
      smooth_pinch_state.gesture_mode = 'zoom_rotate'
    }
  }

  //2. Execute gesture based on determined mode
  if (smooth_pinch_state.gesture_mode === 'pitch') {
    //Mode: PITCH IN PLACE (two fingers dragging vertically)
    viewport_props = controller.controllerState.getViewportProps()
    viewport_height = viewport_props?.height || (typeof window !== 'undefined' ? window.innerHeight : 600)
    delta_angle_y = (-avg_dy/(viewport_height*0.4))*60

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
    zoom_scale = Number.isFinite(computed_scale) && computed_scale > 0 ? computed_scale : (event.scale || 1)
    if (controller.touchZoom && Number.isFinite(zoom_scale) && zoom_scale > 0)
      new_controller_state = new_controller_state.zoom(
        { pos: controller.getZoomPosition(pos), scale: zoom_scale },
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
  smooth_pinch_state.last_scale = computed_scale

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
  let end_event_scale: number
  let end_scale: number
  let last_event: any
  let last_event_scale: number
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
  if (!controller.isDragging()) {
    resetSmoothPinchState()
    smooth_pinch_state.last_pinch_end_time = Date.now()
    return false
  }

  last_event = smooth_pinch_state.last_event
  delta_time = (event && last_event) ? (event.deltaTime - last_event.deltaTime) : 0
  end_event_scale = (event && event.scale !== undefined && event.scale > 0)
    ? event.scale
    : smooth_pinch_state.last_scale
  last_event_scale = (last_event && last_event.scale !== undefined && last_event.scale > 0)
    ? last_event.scale
    : smooth_pinch_state.last_scale

  if (
    smooth_pinch_state.gesture_mode === 'zoom_rotate' &&
    controller.touchZoom &&
    controller.inertia &&
    end_event_scale > 0 &&
    last_event_scale > 0 &&
    end_event_scale !== last_event_scale &&
    delta_time > 0
  ) {
    pos = controller.getCenter(event)
    zoom_position = controller.getZoomPosition(pos)
    new_controller_state = controller.controllerState.panEnd().rotateEnd()
    z = Math.log2(end_event_scale)
    velocity_z = (z - Math.log2(last_event_scale))/delta_time
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

  if (typeof controller.blockEvents === 'function')
    controller.blockEvents(150)

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

  pos = controller.getCenter(event)
  if (!controller.isPointInBounds(pos, event))
    return false

  //Function body
  //Cleanly end any in-progress single-finger pan before starting two-finger zoom/rotate
  new_controller_state = controller.controllerState
    .panEnd()
    .zoomStart({ pos: controller.getZoomPosition(pos) }, controller._getConstraintContext('zoom', 'start'))
    .rotateStart({ pos }, controller._getConstraintContext('rotate', 'start'))

  touch_pts = extractTouchPoints(event)
  smooth_pinch_state.gesture_mode = 'undetermined'
  smooth_pinch_state.last_event = event
  smooth_pinch_state.last_scale = 1
  smooth_pinch_state.start_center = pos
  smooth_pinch_state.start_rotation = event.rotation !== undefined ? event.rotation : 0

  if (touch_pts && touch_pts.length >= 2) {
    smooth_pinch_state.start_p0 = touch_pts[0]
    smooth_pinch_state.start_p1 = touch_pts[1]
    smooth_pinch_state.start_dist = Math.hypot(touch_pts[1].x - touch_pts[0].x, touch_pts[1].y - touch_pts[0].y)
  } else {
    smooth_pinch_state.start_p0 = null
    smooth_pinch_state.start_p1 = null
    smooth_pinch_state.start_dist = 0
  }

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
 * Determines whether an input event represents a multi-touch gesture.
 *
 * @param {any} arg0_event
 *
 * @returns {boolean}
 */
export function isMultiTouchEvent (arg0_event: any): boolean {
  //Convert from parameters
  let event = arg0_event

  //Guard clauses
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
 * Clears and resets all smooth pinch and two-finger gesture state.
 */
export function resetSmoothPinchState (): void {
  //Function body
  smooth_pinch_state.gesture_mode = 'undetermined'
  smooth_pinch_state.last_event = null
  smooth_pinch_state.last_scale = 1
  smooth_pinch_state.start_center = null
  smooth_pinch_state.start_dist = 0
  smooth_pinch_state.start_p0 = null
  smooth_pinch_state.start_p1 = null
  smooth_pinch_state.start_rotation = null
}


/**
 * Synchronises hardware touch count with Deck controllers, clearing stuck state when touch count is 0.
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

  //Function body
  if (touch_count === 0)
    clearStuckControllerState(deck_instance)
}
