import { OrbitController } from '@deck.gl/core'
import { SmoothOrbitState } from './SmoothOrbitState'
import {
  handleSmoothPinch,
  handleSmoothPinchEnd,
  handleSmoothPinchStart,
  isFunctionKeyPressed,
  isSingleFingerPanBlocked,
  isSmoothPinchActive,
} from './smooth_controller_utils'

/**
 * SmoothOrbitController enables normal Left Drag panning and Ctrl + Left Drag pitching on Cartesian projections,
 * and mobile two-finger tilt controls.
 */
export class SmoothOrbitController extends OrbitController {
  // @ts-ignore
  ControllerState = SmoothOrbitState
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
   * Handles pan move event, ignoring multi-touch to prevent pan contention with pinch gestures.
   *
   * @param {any} arg0_event
   *
   * @returns {boolean}
   */
  protected _onPan (arg0_event: any): boolean {
    //Convert from parameters
    let event = arg0_event

    //Guard clauses
    if (event?.pointers && event.pointers.length > 1)
      return false
    if (event?.srcEvent?.touches && event.srcEvent.touches.length > 1)
      return false
    if (isSmoothPinchActive())
      return false

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

    //Guard clauses
    if (event?.pointers && event.pointers.length > 1)
      return false
    if (event?.srcEvent?.touches && event.srcEvent.touches.length > 1)
      return false
    if (isSmoothPinchActive())
      return false

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

export default SmoothOrbitController
