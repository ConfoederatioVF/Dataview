import { decodeRawGeoPngBuffer } from './decoder.ts'
import { DataFormat, DecodedRaster } from './types.ts'

export type PngDecoderInMessage = {
  buffer: ArrayBuffer
  format: DataFormat
  minThreshold?: number
  reqId: number
}

export type PngDecoderOutMessage =
  | {
      raster: DecodedRaster
      reqId: number
      type: 'PNG_DECODE_SUCCESS'
    }
  | {
      error: string
      reqId: number
      type: 'PNG_DECODE_ERROR'
    }

self.onmessage = function (arg0_e: MessageEvent<PngDecoderInMessage>) {
  //Convert from parameters
  let e = arg0_e

  //Declare local instance variables
  let { buffer, format, minThreshold: min_threshold, reqId: req_id } = e.data

  //Function body
  try {
    let raster = decodeRawGeoPngBuffer(buffer, format, min_threshold)
    //Transfer output Float32Array buffer back with zero-copy
    ;(self as any).postMessage(
      {
        raster,
        reqId: req_id,
        type: 'PNG_DECODE_SUCCESS',
      } as PngDecoderOutMessage,
      [raster.data.buffer]
    )
  } catch (arg0_err) {
    self.postMessage({
      error: arg0_err instanceof Error ? arg0_err.message : String(arg0_err),
      reqId: req_id,
      type: 'PNG_DECODE_ERROR',
    } as PngDecoderOutMessage)
  }
}
