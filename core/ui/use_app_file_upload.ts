import { useCallback, useEffect } from 'react'
import {
  AppMode,
  BoundsMode,
  DataFormat,
  DecodedRaster,
} from '@framework/geopng/types.ts'
import { decodeRawGeoPngBufferAsync } from '@framework/geopng/decoder.ts'

export interface UseAppFileUploadOptions {
  active_file_name: string
  app_mode: AppMode
  data_format: DataFormat
  diff_name_a: string
  diff_name_b: string
  raw_bytes_a: Uint8Array | null
  raw_bytes_b: Uint8Array | null
  set_active_file_name: (arg0_name: string) => void
  set_active_layer_id: (arg0_id: string | null) => void
  set_bounds_mode: (arg0_mode: BoundsMode) => void
  set_diff_name_a: (arg0_name: string) => void
  set_diff_name_b: (arg0_name: string) => void
  set_legend_subtitle: (arg0_sub: string) => void
  set_legend_title: (arg0_title: string) => void
  set_max_val_override: (arg0_val: string) => void
  set_min_val_override: (arg0_val: string) => void
  set_raster_a: (arg0_raster: DecodedRaster | null) => void
  set_raster_b: (arg0_raster: DecodedRaster | null) => void
  set_raster_version: React.Dispatch<React.SetStateAction<number>>
  set_raw_bytes_a: (arg0_bytes: Uint8Array | null) => void
  set_raw_bytes_b: (arg0_bytes: Uint8Array | null) => void
  t: any
}

/**
 * Hook to manage custom GeoPNG raster file upload, redecoding upon encoding changes, and legend sync.
 *
 * @param {UseAppFileUploadOptions} arg0_options
 *
 * @returns {object}
 */
export function useAppFileUpload (arg0_options: UseAppFileUploadOptions) {
  //Convert from parameters
  let active_file_name = arg0_options.active_file_name
  let app_mode = arg0_options.app_mode
  let data_format = arg0_options.data_format
  let diff_name_a = arg0_options.diff_name_a
  let diff_name_b = arg0_options.diff_name_b
  let raw_bytes_a = arg0_options.raw_bytes_a
  let raw_bytes_b = arg0_options.raw_bytes_b
  let set_active_file_name = arg0_options.set_active_file_name
  let set_active_layer_id = arg0_options.set_active_layer_id
  let set_bounds_mode = arg0_options.set_bounds_mode
  let set_diff_name_a = arg0_options.set_diff_name_a
  let set_diff_name_b = arg0_options.set_diff_name_b
  let set_legend_subtitle = arg0_options.set_legend_subtitle
  let set_legend_title = arg0_options.set_legend_title
  let set_max_val_override = arg0_options.set_max_val_override
  let set_min_val_override = arg0_options.set_min_val_override
  let set_raster_a = arg0_options.set_raster_a
  let set_raster_b = arg0_options.set_raster_b
  let set_raster_version = arg0_options.set_raster_version
  let set_raw_bytes_a = arg0_options.set_raw_bytes_a
  let set_raw_bytes_b = arg0_options.set_raw_bytes_b
  let t = arg0_options.t

  //Function body
  useEffect(() => {
    let cancelled = false
    let redecode = async function () {
      if (raw_bytes_a) {
        let decoded_a = await decodeRawGeoPngBufferAsync(raw_bytes_a, data_format)
        if (!cancelled)
          set_raster_a(decoded_a)
      }
      if (raw_bytes_b) {
        let decoded_b = await decodeRawGeoPngBufferAsync(raw_bytes_b, data_format)
        if (!cancelled)
          set_raster_b(decoded_b)
      }
      if (!cancelled)
        set_raster_version((arg0_v: number) => arg0_v + 1)
    }
    redecode()
    return () => {
      cancelled = true
    }
  }, [data_format, raw_bytes_a, raw_bytes_b, set_raster_a, set_raster_b, set_raster_version])

  useEffect(() => {
    if (app_mode === 'Single Image') {
      if (active_file_name) {
        set_legend_title(active_file_name.replace(/\.[^/.]+$/, ''))
        set_legend_subtitle(t.sidebar.upload.uploadedGeoPng || 'Uploaded GeoPNG')
      }
    } else if (app_mode === 'Image Difference') {
      if (diff_name_a && diff_name_b) {
        let clean_a = diff_name_a.replace(/\.[^/.]+$/, '')
        let clean_b = diff_name_b.replace(/\.[^/.]+$/, '')
        set_legend_title(`${clean_a} vs ${clean_b}`)
        set_legend_subtitle(t.sidebar.upload.differenceTitle || 'Difference')
      } else if (diff_name_a) {
        set_legend_title(diff_name_a.replace(/\.[^/.]+$/, ''))
        set_legend_subtitle(t.sidebar.upload.differenceA || 'Difference (A)')
      } else if (diff_name_b) {
        set_legend_title(diff_name_b.replace(/\.[^/.]+$/, ''))
        set_legend_subtitle(t.sidebar.upload.differenceB || 'Difference (B)')
      }
    }
  }, [app_mode, active_file_name, diff_name_a, diff_name_b, set_legend_subtitle, set_legend_title, t])

  let handle_file_upload = useCallback(
    async function (arg0_file: File, arg1_target: 'single' | 'diff_a' | 'diff_b') {
      let file = arg0_file
      let target = arg1_target

      let buffer: ArrayBuffer
      let clean_a: string
      let clean_b: string
      let clean_name: string
      let decoded: DecodedRaster
      let uint8: Uint8Array

      try {
        buffer = await file.arrayBuffer()
        uint8 = new Uint8Array(buffer)
        decoded = await decodeRawGeoPngBufferAsync(uint8, data_format)
        clean_name = file.name.replace(/\.[^/.]+$/, '')

        if (target === 'single') {
          set_active_file_name(file.name)
          set_raw_bytes_a(uint8)
          set_raster_a(decoded)
          set_legend_title(clean_name)
          set_legend_subtitle(t.sidebar.upload.uploadedGeoPng || 'Uploaded GeoPNG')
        } else if (target === 'diff_a') {
          set_diff_name_a(file.name)
          set_raw_bytes_a(uint8)
          set_raster_a(decoded)
          if (diff_name_b) {
            clean_b = diff_name_b.replace(/\.[^/.]+$/, '')
            set_legend_title(`${clean_name} vs ${clean_b}`)
            set_legend_subtitle(t.sidebar.upload.differenceTitle || 'Difference')
          } else {
            set_legend_title(clean_name)
            set_legend_subtitle(t.sidebar.upload.differenceA || 'Difference (A)')
          }
        } else if (target === 'diff_b') {
          set_diff_name_b(file.name)
          set_raw_bytes_b(uint8)
          set_raster_b(decoded)
          if (diff_name_a) {
            clean_a = diff_name_a.replace(/\.[^/.]+$/, '')
            set_legend_title(`${clean_a} vs ${clean_name}`)
            set_legend_subtitle(t.sidebar.upload.differenceTitle || 'Difference')
          } else {
            set_legend_title(clean_name)
            set_legend_subtitle(t.sidebar.upload.differenceB || 'Difference (B)')
          }
        }

        set_active_layer_id('default_basemap')
        set_bounds_mode('Manual')
        set_min_val_override('')
        set_max_val_override('')
        set_raster_version((arg0_v: number) => arg0_v + 1)
      } catch (arg0_err) {
        console.error('Failed to load GeoPNG file:', arg0_err)
      }
    },
    [
      data_format,
      diff_name_a,
      diff_name_b,
      set_active_file_name,
      set_active_layer_id,
      set_bounds_mode,
      set_diff_name_a,
      set_diff_name_b,
      set_legend_subtitle,
      set_legend_title,
      set_max_val_override,
      set_min_val_override,
      set_raster_a,
      set_raster_b,
      set_raster_version,
      set_raw_bytes_a,
      set_raw_bytes_b,
      t,
    ]
  )

  //Return statement
  return {
    handle_file_upload,
  }
}
