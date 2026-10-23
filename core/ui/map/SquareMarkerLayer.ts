import { ScatterplotLayer, ScatterplotLayerProps } from '@deck.gl/layers'

export type SquareMarkerLayerProps<DataT = any> = ScatterplotLayerProps<DataT>

let default_props = {
  ...ScatterplotLayer.defaultProps,
}

/**
 * Deck.gl custom layer rendering sharp square markers for vector and polygon vertex manipulation.
 * Modifies the procedural fragment shader to compute Chebyshev distance (L-infinity norm)
 * instead of Euclidean radius, producing screen-aligned, anti-aliased square anchors with uniform border strokes.
 */
export class SquareMarkerLayer<DataT = any, ExtraPropsT extends {} = {}> extends ScatterplotLayer<
  DataT,
  ExtraPropsT & SquareMarkerLayerProps<DataT>
> {
  static defaultProps = default_props as any
  static layerName = 'SquareMarkerLayer'

  getShaders () {
    //Declare local instance variables
    let parent_shaders = super.getShaders()
    let square_fs = parent_shaders.fs

    //Function body
    if (square_fs && square_fs.includes('float distToCenter = length(unitPosition) * outerRadiusPixels;')) {
      square_fs = square_fs.replace(
        'float distToCenter = length(unitPosition) * outerRadiusPixels;',
        'float distToCenter = max(abs(unitPosition.x), abs(unitPosition.y)) * outerRadiusPixels;'
      )
    }

    //Return statement
    return {
      ...parent_shaders,
      fs: square_fs,
    }
  }
}
