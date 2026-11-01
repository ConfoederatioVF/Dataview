import { _GlobeController } from '@deck.gl/core'
import { SmoothGlobeState } from './SmoothGlobeState'
import {
  handleSmoothPinch,
  handleSmoothPinchEnd,
  handleSmoothPinchStart,
  isFunctionKeyPressed,
  isSingleFingerPanBlocked,
  isSmoothPinchActive,
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
    if (event?.pointers && event.pointers.length > 1)
      return false
    if (event?.srcEvent?.touches && event.srcEvent.touches.length > 1)
      return false
    if (isSmoothPinchActive())
      return false

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

    //Guard clauses
    if (event?.pointers && event.pointers.length > 1)
      return false
    if (event?.srcEvent?.touches && event.srcEvent.touches.length > 1)
      return false
    if (isSmoothPinchActive())
      return false

    //Function body
    new_controller_state = this.controllerState.panEnd()
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

    //Guard clauses
    if (isSingleFingerPanBlocked())
      return false
    if (event?.pointers && event.pointers.length > 1)
      return false
    if (event?.srcEvent?.touches && event.srcEvent.touches.length > 1)
      return false
    if (isSmoothPinchActive())
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
