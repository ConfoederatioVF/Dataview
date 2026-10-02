import { Accessor, Color } from '@deck.gl/core'
import { TextLayer, TextLayerProps, _TextBackgroundLayer as TextBackgroundLayer } from '@deck.gl/layers'

export type UnderlinedTextLayerProps<DataT = any> = TextLayerProps<DataT> & {
  getUnderlineColor?: Accessor<DataT, Color>
  isUnderlined?: (arg0_d: DataT) => boolean
}

let default_props = {
  ...TextLayer.defaultProps,
  getUnderlineColor: { type: 'accessor', value: [255, 220, 0, 255] },
  isUnderlined: { type: 'function', value: () => false },
}

/**
 * Deck.gl TextLayer extension that natively renders typography underlines.
 * Uses font atlas bounds and TextBackgroundLayer to render continuous pixel-accurate underlines
 * for variable-width and non-monospace fonts.
 */
export class UnderlinedTextLayer<DataT = any, ExtraPropsT extends {} = {}> extends TextLayer<
  DataT,
  ExtraPropsT & UnderlinedTextLayerProps<DataT>
> {
  static defaultProps = default_props as any
  static layerName = 'UnderlinedTextLayer'

  renderLayers () {
    //Declare local instance variables
    let all_props = this.props as any
    let bg_class = this.getSubLayerClass('underline', TextBackgroundLayer)
    let billboard = all_props.billboard
    let font_size = this.state?.fontAtlasManager?.props?.fontSize || 64
    let get_angle = all_props.getAngle
    let get_color = all_props.getColor
    let get_pixel_offset = all_props.getPixelOffset
    let get_position = all_props.getPosition
    let get_size = all_props.getSize
    let get_underline_color = all_props.getUnderlineColor
    let is_underlined_fn = all_props.isUnderlined
    let size_max_pixels = all_props.sizeMaxPixels
    let size_min_pixels = all_props.sizeMinPixels
    let size_scale = all_props.sizeScale
    let size_units = all_props.sizeUnits
    let sublayers = super.renderLayers()
    let transitions = all_props.transitions
    let underline_layer: any
    let update_triggers = all_props.updateTriggers

    //Guard clauses
    if (!sublayers || sublayers.length === 0)
      return sublayers

    //Function body
    underline_layer = new bg_class(
      {
        id: 'underline',
        billboard,
        borderRadius: 0,
        fontSize: font_size,
        getAngle: get_angle,
        getBoundingRect: (arg0_d: any, arg0_context: any) => {
          let is_active = typeof is_underlined_fn === 'function' ? is_underlined_fn(arg0_d) : Boolean(arg0_d?.isCapital)
          if (!is_active)
            return [0, 0, 0, 0]

          let full_rect = (this as any).getBoundingRect(arg0_d, arg0_context)
          if (!full_rect || full_rect[2] <= 0 || full_rect[3] <= 0)
            return [0, 0, 0, 0]

          let [x, y, width, height] = full_rect
          // A 1px crisp screen underline:
          let line_thickness = Math.max(4.5, (font_size / 64) * 5.0)
          // Baseline of text in vertical center alignment sits at approx y + height * 0.85
          let line_y = y + height * 0.85

          return [x, line_y, width, line_thickness]
        },
        getFillColor: (arg0_d: any) => {
          let is_active = typeof is_underlined_fn === 'function' ? is_underlined_fn(arg0_d) : Boolean(arg0_d?.isCapital)
          if (!is_active)
            return [0, 0, 0, 0]

          if (typeof get_underline_color === 'function')
            return get_underline_color(arg0_d)
          if (Array.isArray(get_underline_color))
            return get_underline_color

          return typeof get_color === 'function' ? get_color(arg0_d) : (get_color || [255, 220, 0, 255])
        },
        getLineColor: (arg0_d: any) => {
          let is_active = typeof is_underlined_fn === 'function' ? is_underlined_fn(arg0_d) : Boolean(arg0_d?.isCapital)
          if (!is_active)
            return [0, 0, 0, 0]

          if (typeof get_underline_color === 'function')
            return get_underline_color(arg0_d)
          if (Array.isArray(get_underline_color))
            return get_underline_color

          return typeof get_color === 'function' ? get_color(arg0_d) : (get_color || [255, 220, 0, 255])
        },
        getLineWidth: 0,
        getPixelOffset: get_pixel_offset,
        getPosition: get_position,
        getSize: get_size,
        padding: [0, 0, 0, 0],
        pickable: false,
        sizeMaxPixels: size_max_pixels,
        sizeMinPixels: size_min_pixels,
        sizeScale: size_scale,
        sizeUnits: size_units,
        transitions: transitions && {
          getAngle: transitions.getAngle,
          getFillColor: transitions.getColor,
          getPosition: transitions.getPosition,
          getSize: transitions.getSize,
        },
      },
      this.getSubLayerProps({
        id: 'underline',
        updateTriggers: {
          getAngle: update_triggers?.getAngle,
          getBoundingRect: update_triggers?.isUnderlined || update_triggers?.getUnderlineColor || update_triggers?.getText,
          getFillColor: update_triggers?.getUnderlineColor || update_triggers?.getColor,
          getLineColor: update_triggers?.getUnderlineColor || update_triggers?.getColor,
          getPosition: update_triggers?.getPosition,
          getSize: update_triggers?.getSize,
        },
      }),
      {
        _dataDiff: all_props._dataDiff,
        autoHighlight: false,
        data: all_props.data,
      }
    )

    //Insert underline layer after character quads so it renders cleanly visible on top of background
    if (sublayers.length >= 2)
      return [sublayers[0], sublayers[1], underline_layer]

    //Return statement
    return [...sublayers, underline_layer]
  }
}
