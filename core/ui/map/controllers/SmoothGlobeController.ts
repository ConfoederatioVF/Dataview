import { _GlobeController } from '@deck.gl/core'
import { SmoothGlobeState } from './SmoothGlobeState'
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
 * SmoothGlobeController for Globe projection with Google Earth style navigation
 * and mobile two-finger tilt controls.
 */
export class SmoothGlobeController extends _GlobeController {
  // @ts-ignore
  ControllerState = SmoothGlobeState
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
   * Handles pan move event.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPanMove (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Declare local instance variables
    let new_controller_state: any
    let pos: [number, number]

    //Guard clauses
    if (!this.dragPan)
      return false

    reconcileControllerPointers(this, event)
    if (isMultiTouchEvent(event)) {
      new_controller_state = this.controllerState.panEnd().rotateEnd()
      if (isSmoothPinchActive()) {
        ;(this as any).controllerState = new_controller_state
      } else {
        this.updateViewport(new_controller_state, null, {
          isDragging: false,
          isPanning: false,
        })
      }
      return false
    }

    //Function body
    pos = this.getCenter(event)
    new_controller_state = this.controllerState.pan({ pos })
    this.updateViewport(
      new_controller_state,
      { transitionDuration: 0 },
      {
        isDragging: true,
        isPanning: true,
      }
    )

    //Return statement
    return true
  }


  /**
   * Handles pan move end event.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPanMoveEnd (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Declare local instance variables
    let new_controller_state: any

    //Function body
    reconcileControllerPointers(this, event)
    new_controller_state = this.controllerState.panEnd()

    if (isMultiTouchEvent(event) && isSmoothPinchActive()) {
      ;(this as any).controllerState = new_controller_state
      return false
    }

    this.updateViewport(new_controller_state, null, {
      isDragging: false,
      isPanning: false,
    })

    //Return statement
    return true
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

export default SmoothGlobeController
