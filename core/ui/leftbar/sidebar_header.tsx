import React from 'react'
import { Icon } from '@ui/components/icon'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select'
import { MarkdownRenderer } from '@ui/components/markdown_renderer'
import { isPublicBuild, isRoleAllowed, UserRole } from '@common'

export interface SidebarHeaderProps {
  infoConfig: { title?: string }
  infoPanelOpen?: boolean
  isMobile?: boolean
  isSidebarCollapsed: boolean
  onClose?: () => void
  onOpenVideoExport?: () => void
  onToggleInfoPanel?: () => void
  onChangeUserRole?: (role: UserRole) => void
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  t: any
  userRole?: UserRole
}

/**
 * Renders the top brand header, toolbar controls, role selector, and flyout toggles for the sidebar.
 *
 * @param {SidebarHeaderProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let SidebarHeader: React.FC<SidebarHeaderProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props

  //Declare local instance variables
  let info_config = props.infoConfig
  let info_panel_open = props.infoPanelOpen
  let is_mobile = props.isMobile
  let is_sidebar_collapsed = props.isSidebarCollapsed
  let on_change_user_role = props.onChangeUserRole
  let on_close = props.onClose
  let on_open_video_export = props.onOpenVideoExport
  let on_toggle_info_panel = props.onToggleInfoPanel
  let set_is_sidebar_collapsed = props.setIsSidebarCollapsed
  let t = props.t
  let user_role = props.userRole

  //Function body
  if (is_mobile && info_panel_open) {
    return (
      <div className="p-[var(--padding)] border-b border-border bg-card/80 shrink-0 flex items-center justify-between">
        <button
          type="button"
          onClick={on_toggle_info_panel}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer px-1 py-0.5"
        >
          <Icon name="arrow_back" className="text-sm" />
          <span>Back</span>
        </button>
        <span
          className="font-bold text-foreground text-xs uppercase tracking-wider truncate max-w-[200px]"
          title={info_config.title || 'Information & Controls'}
        >
          {info_config.title || 'Information & Controls'}
        </span>
        <button
          type="button"
          onClick={on_close || on_toggle_info_panel}
          className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Close"
        >
          <Icon name="close" className="text-sm" />
        </button>
      </div>
    )
  }

  //Return statement
  return (
    <div className={`p-[var(--padding)] ${is_sidebar_collapsed ? '' : 'border-b border-border'} bg-card/60 shrink-0`}>
      <div className="flex items-center justify-between">
        <h1 className="text-[var(--header-font-size)] font-bold tracking-tight text-foreground flex items-center gap-2">
          <img
            src="/gfx/interface/logos/confoederatio_icon_256x256.png"
            alt="Confoederatio Icon"
            className="w-8 h-8 object-contain"
          />
          <span className="text-xl tracking-[1px]">{t.app.title}</span>
        </h1>
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--body-font-size)] px-2 py-0.5 rounded-none bg-muted text-muted-foreground border border-border font-medium tracking-wider">
            {t.app.badge}
          </span>
          <button
            type="button"
            onClick={() => set_is_sidebar_collapsed((arg0_prev) => !arg0_prev)}
            className="p-1 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title={is_sidebar_collapsed ? t.sidebar.toolbar.expandSidebar : t.sidebar.toolbar.collapseSidebar}
            aria-label={is_sidebar_collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={is_sidebar_collapsed ? 'expand_less' : 'expand_more'} className="text-base" />
          </button>
          {is_mobile && on_close && (
            <button
              type="button"
              onClick={on_close}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
              title="Close sidebar"
              aria-label="Close sidebar"
            >
              <Icon name="close" size="1.25rem" />
            </button>
          )}
        </div>
      </div>
      <MarkdownRenderer
        content={t.app.subtitle}
        className="text-[var(--body-font-size)] text-muted-foreground font-light mt-1 [&_p]:my-0 [&_p]:text-inherit [&_p]:font-light [&_p]:leading-snug"
      />

      {/* Toolbar: Information toggle, Role switcher, Video export */}
      <div className="mt-2.5 flex items-center justify-between gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={on_toggle_info_panel}
          className={`px-2 py-1 text-xs font-medium rounded-none border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${info_panel_open
            ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
            : 'bg-background hover:bg-muted text-foreground border-border'
            }`}
          title={t.sidebar.toolbar.infoTooltip}
        >
          <Icon name="info" className={info_panel_open ? 'text-primary-foreground' : 'text-foreground'} />
          <span>{t.sidebar.toolbar.info}</span>
        </button>

        <div className="flex items-center gap-1">
          {/* Role Switcher or Public Locked Badge */}
          {isPublicBuild() ? (
            <div
              className="h-6 text-[11px] bg-muted/40 border border-border px-2 flex items-center gap-1 text-muted-foreground select-none"
              title={t.sidebar.toolbar.roles.lockedTooltip}
            >
              <Icon name="lock" className="text-[10px] text-muted-foreground" />
              <span>{t.sidebar.toolbar.roles.default}</span>
            </div>
          ) : (
            <Select
              value={user_role}
              onValueChange={(arg0_v) => on_change_user_role && on_change_user_role(arg0_v as UserRole)}
            >
              <SelectTrigger className="h-6 text-[11px] rounded-none bg-muted/40 border-border px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                {isRoleAllowed('default') && (
                  <SelectItem value="default" className="rounded-none text-xs">{t.sidebar.toolbar.roles.default}</SelectItem>
                )}
                {isRoleAllowed('privileged') && (
                  <SelectItem value="privileged" className="rounded-none text-xs">{t.sidebar.toolbar.roles.privileged}</SelectItem>
                )}
                {isRoleAllowed('developer') && (
                  <SelectItem value="developer" className="rounded-none text-xs">{t.sidebar.toolbar.roles.developer}</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}

          {/* Developer Video Export Button */}
          {!isPublicBuild() && user_role === 'developer' && on_open_video_export && (
            <button
              type="button"
              onClick={on_open_video_export}
              className="h-6 px-1.5 bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/40 text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
              title={t.sidebar.toolbar.videoTooltip}
            >
              <Icon name="videocam" className="text-xs" />
              <span>{t.sidebar.toolbar.video}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
