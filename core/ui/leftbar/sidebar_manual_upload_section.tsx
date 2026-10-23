import React, { useState } from 'react'
import { AppMode, DataFormat } from '@framework/geopng/types.ts'
import { CustomVectorDataset } from '@framework/geopng/custom_vector_service.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select'
import { Label } from '@ui/components/label'
import { Icon } from '@ui/components/icon'
import { formatString } from '@localisation'

export interface SidebarManualUploadSectionProps {
  activeFileName?: string
  appMode: AppMode
  customVectorDataset?: CustomVectorDataset | null
  customVectorVisible?: boolean
  dataFormat: DataFormat
  diffNameA?: string
  diffNameB?: string
  isOpen: boolean
  onFileUpload: (file: File, target: 'single' | 'diff_a' | 'diff_b') => void
  onRemoveCustomVector?: () => void
  onToggle: () => void
  onToggleCustomVectorVisible?: (arg0_visible: boolean) => void
  onUploadCustomVector?: (arg0_file: File) => void
  setAppMode: (mode: AppMode) => void
  setDataFormat: (fmt: DataFormat) => void
  t: any
}

/**
 * Manual file upload section supporting single raster, raster diffing, and GeoJSON/Naissance vector upload.
 *
 * @param {SidebarManualUploadSectionProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let SidebarManualUploadSection: React.FC<SidebarManualUploadSectionProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props

  //Declare local instance variables
  let active_file_name = props.activeFileName
  let app_mode = props.appMode
  let custom_vector_dataset = props.customVectorDataset
  let custom_vector_visible = props.customVectorVisible
  let data_format = props.dataFormat
  let diff_name_a = props.diffNameA
  let diff_name_b = props.diffNameB
  let is_open = props.isOpen
  let [manual_upload_tab, set_manual_upload_tab] = useState<'raster' | 'vector'>('raster')
  let on_file_upload = props.onFileUpload
  let on_remove_custom_vector = props.onRemoveCustomVector
  let on_toggle = props.onToggle
  let on_toggle_custom_vector_visible = props.onToggleCustomVectorVisible
  let on_upload_custom_vector = props.onUploadCustomVector
  let set_app_mode = props.setAppMode
  let set_data_format = props.setDataFormat
  let t = props.t

  //Function body

  //Return statement
  return (
    <div className="border border-border bg-card/50">
      <button
        type="button"
        onClick={on_toggle}
        className="w-full h-8 px-[var(--padding)] flex items-center justify-between text-[var(--body-font-size)] font-bold text-foreground bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Icon name="upload_file" />
          <span>{t.sidebar.folders.manualUpload}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {custom_vector_dataset && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/40 font-medium uppercase">
              {custom_vector_dataset.fileType}
            </span>
          )}
          <Icon name={is_open ? 'expand_less' : 'expand_more'} />
        </div>
      </button>

      {is_open && (
        <div className="p-[var(--padding)] space-y-[var(--padding)] text-[var(--body-font-size)] border-t border-border">
          {/* Raster / Vector Tab Switcher */}
          <div className="grid grid-cols-2 gap-1 bg-muted/50 p-0.5 border border-border">
            <button
              type="button"
              onClick={() => set_manual_upload_tab('raster')}
              className={`h-7 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${manual_upload_tab === 'raster'
                ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon name="image" className="text-xs" />
              <span>{t.sidebar.upload.rasterTab || 'Raster Upload'}</span>
            </button>
            <button
              type="button"
              onClick={() => set_manual_upload_tab('vector')}
              className={`h-7 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${manual_upload_tab === 'vector'
                ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon name="layers" className="text-xs" />
              <span>{t.sidebar.upload.vectorTab || 'Vector Upload'}</span>
            </button>
          </div>

          {manual_upload_tab === 'raster' ? (
            <>
              {/* Mode Selector */}
              <div className="space-y-1">
                <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.mode}</Label>
                <div className="grid grid-cols-2 gap-1 bg-muted/50 p-0.5 border border-border">
                  <button
                    type="button"
                    onClick={() => set_app_mode('Single Image')}
                    className={`h-7 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${app_mode === 'Single Image'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <Icon name="image" className="text-xs" />
                    <span>{t.sidebar.upload.single}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => set_app_mode('Image Difference')}
                    className={`h-7 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${app_mode === 'Image Difference'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <Icon name="compare_arrows" className="text-xs" />
                    <span>{t.sidebar.upload.difference}</span>
                  </button>
                </div>
              </div>

              {/* File Inputs */}
              {app_mode === 'Single Image' ? (
                <div className="space-y-1">
                  <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.selectSingle}</Label>
                  <input
                    type="file"
                    accept=".png"
                    id="single-file-upload"
                    className="hidden"
                    onClick={(arg0_e) => {
                      ;(arg0_e.target as HTMLInputElement).value = ''
                    }}
                    onChange={(arg0_e) => {
                      let file = arg0_e.target.files?.[0]
                      if (file)
                        on_file_upload(file, 'single')
                      arg0_e.target.value = ''
                    }}
                  />
                  <label
                    htmlFor="single-file-upload"
                    className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <span className="truncate text-[var(--body-font-size)]">
                      {active_file_name || t.sidebar.upload.singlePlaceholder}
                    </span>
                    <Icon name="folder_open" className="text-muted-foreground shrink-0 ml-1" />
                  </label>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.firstImage}</Label>
                    <input
                      type="file"
                      accept=".png"
                      id="diff-file-a"
                      className="hidden"
                      onClick={(arg0_e) => {
                        ;(arg0_e.target as HTMLInputElement).value = ''
                      }}
                      onChange={(arg0_e) => {
                        let file = arg0_e.target.files?.[0]
                        if (file)
                          on_file_upload(file, 'diff_a')
                        arg0_e.target.value = ''
                      }}
                    />
                    <label
                      htmlFor="diff-file-a"
                      className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <span className="truncate text-[var(--body-font-size)]">{diff_name_a || t.sidebar.upload.firstPlaceholder}</span>
                      <Icon name="file_upload" className="text-muted-foreground shrink-0 ml-1" />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.secondImage}</Label>
                    <input
                      type="file"
                      accept=".png"
                      id="diff-file-b"
                      className="hidden"
                      onClick={(arg0_e) => {
                        ;(arg0_e.target as HTMLInputElement).value = ''
                      }}
                      onChange={(arg0_e) => {
                        let file = arg0_e.target.files?.[0]
                        if (file)
                          on_file_upload(file, 'diff_b')
                        arg0_e.target.value = ''
                      }}
                    />
                    <label
                      htmlFor="diff-file-b"
                      className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <span className="truncate text-[var(--body-font-size)]">{diff_name_b || t.sidebar.upload.secondPlaceholder}</span>
                      <Icon name="file_upload" className="text-muted-foreground shrink-0 ml-1" />
                    </label>
                  </div>
                </div>
              )}

              {/* Encoding Format */}
              <div className="space-y-1">
                <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.encodingFormat}</Label>
                <Select value={data_format} onValueChange={(arg0_v) => set_data_format(arg0_v as DataFormat)}>
                  <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="float32" className="rounded-none text-[var(--body-font-size)]">float32 (IEEE 754)</SelectItem>
                    <SelectItem value="int32" className="rounded-none text-[var(--body-font-size)]">int32 (Signed Integer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground leading-normal">
                {t.sidebar.vectorUpload.description}
              </p>

              {/* Upload Input */}
              <div className="space-y-1">
                <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">
                  {t.sidebar.vectorUpload.selectFile}
                </Label>
                <input
                  type="file"
                  accept=".geojson,.naissance,.json"
                  id="custom-vector-file-upload"
                  className="hidden"
                  onClick={(arg0_e) => {
                    ;(arg0_e.target as HTMLInputElement).value = ''
                  }}
                  onChange={(arg0_e) => {
                    let file = arg0_e.target.files?.[0]
                    if (file && on_upload_custom_vector)
                      on_upload_custom_vector(file)
                    arg0_e.target.value = ''
                  }}
                />
                <label
                  htmlFor="custom-vector-file-upload"
                  className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <span className="truncate text-[var(--body-font-size)]">
                    {custom_vector_dataset?.fileName || t.sidebar.vectorUpload.placeholder}
                  </span>
                  <Icon name="upload_file" className="text-muted-foreground shrink-0 ml-1" />
                </label>
              </div>

              {/* Dataset Details & Toggles */}
              {custom_vector_dataset && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {custom_vector_dataset.fileType === 'naissance'
                        ? t.sidebar.vectorUpload.temporalNaissance
                        : t.sidebar.vectorUpload.staticGeoJson}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatString(t.sidebar.vectorUpload.entitiesCount, custom_vector_dataset.totalCount)}
                    </span>
                  </div>

                  {custom_vector_dataset.fileType === 'naissance' && (
                    <p className="text-[10px] text-muted-foreground/90 italic leading-snug">
                      {t.sidebar.vectorUpload.temporalDynamicNote}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[var(--body-font-size)] text-muted-foreground">
                      {t.sidebar.vectorUpload.showLayer}
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={custom_vector_visible}
                        onChange={(arg0_e) => {
                          if (on_toggle_custom_vector_visible)
                            on_toggle_custom_vector_visible(arg0_e.target.checked)
                        }}
                        className="w-3.5 h-3.5 rounded-none accent-emerald-500 cursor-pointer"
                      />
                      <span
                        className={`text-xs font-bold uppercase ${
                          custom_vector_visible ? 'text-emerald-400 font-bold' : 'text-muted-foreground'
                        }`}
                      >
                        {custom_vector_visible ? t.sidebar.binning.on : t.sidebar.binning.off}
                      </span>
                    </label>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (on_remove_custom_vector)
                          on_remove_custom_vector()
                      }}
                      className="w-full h-7 px-2 text-xs font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Icon name="delete" className="text-xs" />
                      <span>{t.sidebar.vectorUpload.removeVector}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
