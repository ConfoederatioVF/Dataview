import { MapController } from '@deck.gl/core'
import { SmoothMapState } from './SmoothMapState'
import {
  handleControllerEvent,
  handleSmoothPinch,
  handleSmoothPinchEnd,
  handleSmoothPinchStart,
  isFunctionKeyPressed,
  isMultiTouchEvent,
  isSingleFingerPanBlocked,
  isSmoothPinchActive,
  reconcileControllerPointers,
} from './smooth_controller_utils'

/**
 * SmoothMapController ensures Ctrl + Left Drag rotates/pitches while Left Drag pans,
 * and enables two-finger mobile tilt controls.
 */
export class SmoothMapController extends MapController {
  // @ts-ignore
  ControllerState = SmoothMapState
  dragMode = 'pan' as const

  /**
   * Routes controller events through pointer reconciliation, cancel handlers, and unified two-finger tilt/pinch.
   *
   * @param {any} arg0_event
   *
   * @returns {any}
   */
  handleEvent (arg0_event: any): any {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return handleControllerEvent(this, event, super.handleEvent)
  }


  /**
   * Checks whether the function key (Ctrl or Meta) is pressed.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  isFunctionKeyPressed (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return isFunctionKeyPressed(event)
  }


  /**
   * Handles two-finger multi-pan move via the unified smooth pinch/tilt handler.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onMultiPan (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return handleSmoothPinch(this, event)
  }


  /**
   * Handles two-finger multi-pan end via the unified smooth pinch/tilt handler.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onMultiPanEnd (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return handleSmoothPinchEnd(this, event)
  }


  /**
   * Handles two-finger multi-pan start via the unified smooth pinch/tilt handler.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onMultiPanStart (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return handleSmoothPinchStart(this, event)
  }


  /**
   * Handles pan move event, ignoring multi-touch to prevent pan contention with pinch gestures.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPan (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Declare local instance variables
    let new_controller_state: any

    //Function body
    reconcileControllerPointers(this, event)
    if (isMultiTouchEvent(event)) {
      new_controller_state = this.controllerState.panEnd().rotateEnd()
      if (isSmoothPinchActive()) {
        ;(this as any).controllerState = new_controller_state
      } else {
        this.updateViewport(new_controller_state, null, {
          isDragging: false,
          isPanning: false,
          isRotating: false,
        })
      }
      return false
    }

    //Return statement
    return super._onPan(event)
  }


  /**
   * Handles pan end event.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPanEnd (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Declare local instance variables
    let new_controller_state: any

    //Function body
    reconcileControllerPointers(this, event)
    if (isMultiTouchEvent(event)) {
      new_controller_state = this.controllerState.panEnd().rotateEnd()
      if (isSmoothPinchActive()) {
        ;(this as any).controllerState = new_controller_state
      } else {
        this.updateViewport(new_controller_state, null, {
          isDragging: false,
          isPanning: false,
          isRotating: false,
        })
      }
      return false
    }

    //Return statement
    return super._onPanEnd(event)
  }


  /**
   * Handles pan start event, ignoring multi-touch gestures and post-pinch trailing touches.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPanStart (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Function body
    reconcileControllerPointers(this, event)
    if (isSingleFingerPanBlocked() || isMultiTouchEvent(event))
      return false

    //Return statement
    return super._onPanStart(event)
  }


  /**
   * Handles pinch move event.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPinch (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return handleSmoothPinch(this, event)
  }


  /**
   * Handles pinch end event.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPinchEnd (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return handleSmoothPinchEnd(this, event)
  }


  /**
   * Handles pinch start event.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPinchStart (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Return statement
    return handleSmoothPinchStart(this, event)
  }
}

export default SmoothMapController
