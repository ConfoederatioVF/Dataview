import React from 'react'
import { Icon } from './icon'
import { ALERT_CONFIGS, AlertStyle } from '@config'

export interface MarkdownRendererProps {
  content?: string | string[]
  className?: string
  isNested?: boolean
}

export type { AlertStyle }

/**
 * Parses inline markdown tokens (links, images, bold, underline, italic, inline code, strikethrough).
 *
 * @param {string} arg0_text
 * @returns {Array<React.ReactNode>}
 */
let parseInline = function (arg0_text: string): React.ReactNode[] {
  //Convert from parameters
  let text = (arg0_text) ? String(arg0_text) : ''

  //Declare local instance variables
  let all_matches_array: RegExpExecArray[]
  let last_index: number = 0
  let parts_array: React.ReactNode[] = []
  let token_regex: RegExp

  //Guard clauses
  if (!text)
    return []

  //Function body
  token_regex = /(\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\]\(([^)]+)\)|!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^)]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|___([^_]+)___|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~|<a\b[^>]*>[\s\S]*?<\/a>|<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>|<(?:i|em)\b[^>]*>[\s\S]*?<\/(?:i|em)>|<u\b[^>]*>[\s\S]*?<\/u>|<(?:s|del|strike)\b[^>]*>[\s\S]*?<\/(?:s|del|strike)>|<code\b[^>]*>[\s\S]*?<\/code>|<span\b[^>]*>[\s\S]*?<\/span>|<mark\b[^>]*>[\s\S]*?<\/mark>|<(?:sub|sup)\b[^>]*>[\s\S]*?<\/(?:sub|sup)>|<br\s*\/?>|<img\b[^>]*\/?>)/gi
  all_matches_array = Array.from(text.matchAll(token_regex))

  for (let i = 0; i < all_matches_array.length; i++) {
    let local_match = all_matches_array[i]
    let local_match_index = local_match.index ?? 0

    if (local_match_index > last_index)
      parts_array.push(text.slice(last_index, local_match_index))

    let local_full_match = local_match[0]

    if (local_full_match.startsWith('[![')) {
      let local_img_match = local_full_match.match(/^\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\]\(([^)]+)\)$/)
      if (local_img_match) {
        let local_alt = local_img_match[1] || ''
        let local_img_title = local_img_match[3] || local_alt
        let local_img_url = local_img_match[2]
        let local_link_url = local_img_match[4]

        parts_array.push(
          <a
            key={`clickimg-${local_match_index}`}
            href={local_link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-85 transition-opacity align-middle my-0.5"
          >
            <img
              src={local_img_url}
              alt={local_alt}
              title={local_img_title}
              className="inline-block max-h-8 align-middle border border-border bg-background/50 object-contain rounded-none"
              loading="lazy"
            />
          </a>
        )
      }
    } else if (local_full_match.startsWith('![')) {
      let local_img_match = local_full_match.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/)
      if (local_img_match) {
        let local_alt = local_img_match[1] || ''
        let local_img_title = local_img_match[3] || local_alt
        let local_img_url = local_img_match[2]

        parts_array.push(
          <img
            key={`img-${local_match_index}`}
            src={local_img_url}
            alt={local_alt}
            title={local_img_title}
            className="inline-block max-h-8 align-middle mx-1 border border-border bg-background/50 object-contain rounded-none"
            loading="lazy"
          />
        )
      }
    } else if (local_full_match.startsWith('[')) {
      let local_link_match = local_full_match.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (local_link_match) {
        parts_array.push(
          <a
            key={`link-${local_match_index}`}
            href={local_link_match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium align-[-1px]"
            style={{ verticalAlign: '-1px' }}
          >
            {parseInline(local_link_match[1])}
          </a>
        )
      }
    } else if (local_full_match.startsWith('***') || local_full_match.startsWith('___')) {
      parts_array.push(
        <strong key={`bold-em-${local_match_index}`} className="font-semibold text-foreground">
          <em className="italic">
            {parseInline(local_full_match.slice(3, -3))}
          </em>
        </strong>
      )
    } else if (local_full_match.startsWith('**') || local_full_match.startsWith('__')) {
      parts_array.push(
        <strong key={`bold-${local_match_index}`} className="font-semibold text-foreground">
          {parseInline(local_full_match.slice(2, -2))}
        </strong>
      )
    } else if (local_full_match.startsWith('`')) {
      parts_array.push(
        <code
          key={`code-${local_match_index}`}
          className="px-1 py-0.5 bg-muted text-foreground border border-border text-[0.8em] font-mono leading-none inline-block align-baseline"
        >
          {local_full_match.slice(1, -1)}
        </code>
      )
    } else if (local_full_match.startsWith('*') || local_full_match.startsWith('_')) {
      parts_array.push(
        <em key={`em-${local_match_index}`} className="italic">
          {parseInline(local_full_match.slice(1, -1))}
        </em>
      )
    } else if (local_full_match.startsWith('~~')) {
      parts_array.push(
        <del key={`del-${local_match_index}`} className="line-through text-muted-foreground">
          {parseInline(local_full_match.slice(2, -2))}
        </del>
      )
    } else if (/^<a\b/i.test(local_full_match)) {
      let a_match = local_full_match.match(/^<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>$/i)
      if (a_match) {
        parts_array.push(
          <a
            key={`html-a-${local_match_index}`}
            href={a_match[1]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium align-[-1px]"
            style={{ verticalAlign: '-1px' }}
          >
            {parseInline(a_match[2])}
          </a>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<(?:b|strong)\b/i.test(local_full_match)) {
      let b_match = local_full_match.match(/^<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>$/i)
      if (b_match) {
        parts_array.push(
          <strong key={`html-b-${local_match_index}`} className="font-semibold text-foreground">
            {parseInline(b_match[1])}
          </strong>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<(?:i|em)\b/i.test(local_full_match)) {
      let i_match = local_full_match.match(/^<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)>$/i)
      if (i_match) {
        parts_array.push(
          <em key={`html-i-${local_match_index}`} className="italic">
            {parseInline(i_match[1])}
          </em>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<u\b/i.test(local_full_match)) {
      let u_match = local_full_match.match(/^<u\b[^>]*>([\s\S]*?)<\/u>$/i)
      if (u_match) {
        parts_array.push(
          <u key={`html-u-${local_match_index}`} className="underline underline-offset-2">
            {parseInline(u_match[1])}
          </u>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<(?:s|del|strike)\b/i.test(local_full_match)) {
      let s_match = local_full_match.match(/^<(?:s|del|strike)\b[^>]*>([\s\S]*?)<\/(?:s|del|strike)>$/i)
      if (s_match) {
        parts_array.push(
          <del key={`html-s-${local_match_index}`} className="line-through text-muted-foreground">
            {parseInline(s_match[1])}
          </del>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<code\b/i.test(local_full_match)) {
      let c_match = local_full_match.match(/^<code\b[^>]*>([\s\S]*?)<\/code>$/i)
      if (c_match) {
        parts_array.push(
          <code
            key={`html-code-${local_match_index}`}
            className="px-1 py-0.5 bg-muted text-foreground border border-border text-[0.8em] font-mono leading-none inline-block align-baseline"
          >
            {c_match[1]}
          </code>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<br\s*\/?>/i.test(local_full_match)) {
      parts_array.push(<br key={`html-br-${local_match_index}`} />)
    } else if (/^<span\b/i.test(local_full_match)) {
      let span_match = local_full_match.match(/^<span\b[^>]*>([\s\S]*?)<\/span>$/i)
      if (span_match) {
        parts_array.push(
          <span key={`html-span-${local_match_index}`}>
            {parseInline(span_match[1])}
          </span>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<mark\b/i.test(local_full_match)) {
      let mark_match = local_full_match.match(/^<mark\b[^>]*>([\s\S]*?)<\/mark>$/i)
      if (mark_match) {
        parts_array.push(
          <mark key={`html-mark-${local_match_index}`} className="bg-yellow-500/20 text-foreground px-0.5">
            {parseInline(mark_match[1])}
          </mark>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<(?:sub|sup)\b/i.test(local_full_match)) {
      let sub_sup_match = local_full_match.match(/^<(sub|sup)\b[^>]*>([\s\S]*?)<\/\1>$/i)
      if (sub_sup_match) {
        let TagName = sub_sup_match[1].toLowerCase() as 'sub' | 'sup'
        parts_array.push(
          <TagName key={`html-${TagName}-${local_match_index}`} className="text-[0.75em]">
            {parseInline(sub_sup_match[2])}
          </TagName>
        )
      } else {
        parts_array.push(local_full_match)
      }
    } else if (/^<img\b/i.test(local_full_match)) {
      let img_match = local_full_match.match(/^<img\b[^>]*src=["']([^"']*)["'](?:\s+[^>]*alt=["']([^"']*)["'])?[^>]*\/?>$/i)
      if (img_match) {
        parts_array.push(
          <img
            key={`html-img-${local_match_index}`}
            src={img_match[1]}
            alt={img_match[2] || ''}
            className="inline-block max-h-8 align-middle mx-1 border border-border bg-background/50 object-contain rounded-none"
            loading="lazy"
          />
        )
      } else {
        parts_array.push(local_full_match)
      }
    }

    last_index = local_match_index + local_match[0].length
  }

  if (last_index < text.length)
    parts_array.push(text.slice(last_index))

  //Return statement
  return parts_array
}

interface ListItemNode {
  children: ListItemNode[]
  depth: number
  isOrdered: boolean
  startNumber?: number
  text: string
}

/**
 * Builds a hierarchical tree of list item nodes based on their nesting depths.
 *
 * @param {Array<{ depth: number; isOrdered: boolean; start_number?: number; text: string }>} arg0_items
 *
 * @returns {ListItemNode[]}
 */
let buildListTree = function (
  arg0_items: { depth: number; isOrdered: boolean; start_number?: number; text: string }[]
): ListItemNode[] {
  //Convert from parameters
  let items = arg0_items

  //Declare local instance variables
  let node_stack: ListItemNode[] = []
  let root_items: ListItemNode[] = []

  //Function body
  for (let i = 0; i < items.length; i++) {
    let item = items[i]
    let new_node: ListItemNode = {
      children: [],
      depth: item.depth,
      isOrdered: item.isOrdered,
      startNumber: item.start_number,
      text: item.text,
    }

    while (node_stack.length > 0 && node_stack[node_stack.length - 1].depth >= item.depth)
      node_stack.pop()

    if (node_stack.length === 0) {
      root_items.push(new_node)
    } else {
      let parent_node = node_stack[node_stack.length - 1]
      parent_node.children.push(new_node)
    }

    node_stack.push(new_node)
  }

  //Return statement
  return root_items
}

/**
 * Recursively renders a hierarchical tree of list items with appropriate nesting styles.
 *
 * @param {ListItemNode[]} arg0_items
 * @param {number} arg1_depth
 * @param {string} arg2_key_prefix
 *
 * @returns {React.ReactNode}
 */
let renderListTree = function (
  arg0_items: ListItemNode[],
  arg1_depth: number,
  arg2_key_prefix: string
): React.ReactNode {
  //Convert from parameters
  let depth = arg1_depth
  let items = arg0_items
  let key_prefix = arg2_key_prefix

  //Guard clauses
  if (!items || items.length === 0)
    return null

  //Declare local instance variables
  let is_ordered = items[0].isOrdered
  let list_style: React.CSSProperties
  let list_type_class: string
  let start_num = (is_ordered && items[0]?.startNumber && items[0].startNumber > 1)
    ? items[0].startNumber
    : undefined
  let Tag: 'ol' | 'ul' = is_ordered ? 'ol' : 'ul'

  //Function body
  list_style = is_ordered
    ? { listStyleType: 'decimal' }
    : { listStyleType: depth === 0 ? 'disc' : (depth === 1 ? 'circle' : 'square') }

  list_type_class = is_ordered ? 'list-decimal' : 'list-disc'

  //Return statement
  return (
    <Tag
      key={key_prefix}
      start={start_num}
      style={list_style}
      className={
        depth === 0
          ? `space-y-1 my-2 list-outside pl-5 text-muted-foreground text-[var(--body-font-size)] font-light leading-relaxed ${list_type_class}`
          : `space-y-1 mt-1 list-outside pl-5 ${list_type_class}`
      }
    >
      {items.map((arg0_item, arg1_idx) => {
        let item = arg0_item
        let idx = arg1_idx
        let item_key = `${key_prefix}-${idx}`
        return (
          <li key={item_key} className="leading-snug select-text">
            <span>{parseInline(item.text)}</span>
            {item.children.length > 0 && renderListTree(item.children, depth + 1, `${item_key}-sub`)}
          </li>
        )
      })}
    </Tag>
  )
}

/**
 * High-performance lightweight Markdown and Callout renderer.
 *
 * @param {MarkdownRendererProps} arg0_props
 * @returns {React.ReactElement|null}
 */
export let MarkdownRenderer: React.FC<MarkdownRendererProps> = function (arg0_props: MarkdownRendererProps) {
  //Convert from parameters
  let props = (arg0_props) ? arg0_props : ({} as MarkdownRendererProps)

  //Declare local instance variables
  let block_key: number = 0
  let class_name = props.className || ''
  let code_block_lines_array: string[] = []
  let collected_list_items: { is_ordered: boolean; raw_indent: number; start_number?: number; text: string }[] = []
  let content = props.content
  let elements_array: React.ReactNode[] = []
  let flush_code_block: () => void
  let flush_list: () => void
  let in_code_block: boolean = false
  let is_nested = props.isNested ?? false
  let lines_array: string[]
  let raw_text: string

  //Guard clauses
  if (!content)
    return null

  //Function body
  raw_text = (Array.isArray(content)) ? content.join('\n') : content
  raw_text = raw_text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  raw_text = raw_text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, txt) => `\n${'#'.repeat(Number(lvl))} ${txt.trim()}\n\n`)
  raw_text = raw_text.replace(/<hr\s*\/?>/gi, '\n---\n')
  raw_text = raw_text.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, txt) => `\n- ${txt.trim()}\n`)
  raw_text = raw_text.replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n')
  raw_text = raw_text.replace(/<p\b[^>]*>/gi, '\n\n').replace(/<\/p>/gi, '\n\n')
  raw_text = raw_text.replace(/<div\b[^>]*>/gi, '\n').replace(/<\/div>/gi, '\n')
  raw_text = raw_text.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, txt) => `\n> ${txt.trim().replace(/\n/g, '\n> ')}\n\n`)
  lines_array = raw_text.split('\n')

  flush_list = function () {
    if (collected_list_items.length === 0)
      return

    let base_indent = collected_list_items[0].raw_indent
    let depth_items: { depth: number; isOrdered: boolean; start_number?: number; text: string }[] = []
    let indent_stack: number[] = [base_indent]

    for (let i = 0; i < collected_list_items.length; i++) {
      let item = collected_list_items[i]
      let raw_indent = item.raw_indent

      if (raw_indent > indent_stack[indent_stack.length - 1]) {
        indent_stack.push(raw_indent)
      } else {
        while (indent_stack.length > 1 && raw_indent < indent_stack[indent_stack.length - 1])
          indent_stack.pop()
        if (raw_indent < indent_stack[0])
          indent_stack[0] = raw_indent
      }

      depth_items.push({
        depth: indent_stack.length - 1,
        isOrdered: item.is_ordered,
        start_number: item.start_number,
        text: item.text,
      })
    }

    let tree = buildListTree(depth_items)
    let rendered_list = renderListTree(tree, 0, `list-${block_key++}`)
    if (rendered_list)
      elements_array.push(rendered_list)

    collected_list_items = []
  }

  flush_code_block = function () {
    if (code_block_lines_array.length > 0) {
      elements_array.push(
        <pre
          key={`pre-${block_key++}`}
          className="bg-background/80 border border-border p-2 my-2 overflow-x-auto text-[0.75rem] font-mono text-foreground leading-snug rounded-none"
        >
          <code>{code_block_lines_array.join('\n')}</code>
        </pre>
      )
      code_block_lines_array = []
    }
  }

  for (let i = 0; i < lines_array.length; i++) {
    let local_line = lines_array[i]
    let local_trimmed = local_line.trim()

    //1. Code blocks
    if (local_trimmed.startsWith('```')) {
      flush_list()
      if (in_code_block) {
        in_code_block = false
        flush_code_block()
      } else {
        in_code_block = true
      }
      continue
    }

    if (in_code_block) {
      code_block_lines_array.push(local_line)
      continue
    }

    //2. Blank line
    if (local_trimmed === '') {
      if (collected_list_items.length > 0) {
        let has_next_list_item = false
        for (let x = i + 1; x < lines_array.length; x++) {
          let next_trimmed = lines_array[x].trim()
          if (next_trimmed === '')
            continue
          let is_next_hr = /^(\s*[-*_]\s*){3,}$/.test(lines_array[x])
          if (!is_next_hr && /^(\s*)([-*+]|\d+[\.\)])\s+/.test(lines_array[x]))
            has_next_list_item = true
          break
        }
        if (has_next_list_item)
          continue
      }

      flush_list()
      continue
    }

    //3. Details/Summary collapsible block: <details>...</details>
    if (local_trimmed.toLowerCase().startsWith('<details')) {
      flush_list()
      let local_details_match = local_trimmed.match(/^<details(?:\s+([^>]*))?>/i)
      let is_open_by_default = false
      if (local_details_match && local_details_match[1])
        is_open_by_default = /open\b/i.test(local_details_match[1])

      let summary_text = ''
      let details_body_lines: string[] = []
      let depth = 1

      //Check if <summary> is on the same line
      let same_line_summary_match = local_trimmed.match(/<summary>(.*?)<\/summary>/i)
      if (same_line_summary_match) {
        summary_text = same_line_summary_match[1].trim()
      } else {
        let open_summary_match = local_trimmed.match(/<summary>(.*)/i)
        if (open_summary_match)
          summary_text = open_summary_match[1].replace(/<\/summary>/i, '').trim()
      }

      //Check if details closes on the same line
      let same_line_closes = (local_trimmed.match(/<\/details>/gi) || []).length
      if (same_line_closes > 0) {
        let after_summary = local_trimmed.replace(/^<details(?:\s+[^>]*)?>/i, '')
        if (same_line_summary_match)
          after_summary = after_summary.replace(/<summary>.*?<\/summary>/i, '')
        after_summary = after_summary.replace(/<\/details>.*$/i, '').trim()
        if (after_summary)
          details_body_lines.push(after_summary)
      } else {
        let in_multiline_summary = (!summary_text && /<summary>/i.test(local_trimmed) && !/<\/summary>/i.test(local_trimmed))

        for (let x = i + 1; x < lines_array.length; x++) {
          let local_next_line = lines_array[x]
          let local_next_trimmed = local_next_line.trim()

          //Check for multi-line summary continuation
          if (in_multiline_summary) {
            if (/<\/summary>/i.test(local_next_trimmed)) {
              let end_summary_idx = local_next_trimmed.toLowerCase().indexOf('</summary>')
              summary_text += ' ' + local_next_trimmed.slice(0, end_summary_idx).trim()
              in_multiline_summary = false
              continue
            } else {
              summary_text += ' ' + local_next_trimmed
              continue
            }
          }

          //If summary has not been found yet, check if this line is <summary>
          if (!summary_text && /<summary>/i.test(local_next_trimmed)) {
            let line_summary_match = local_next_trimmed.match(/<summary>(.*?)<\/summary>/i)
            if (line_summary_match) {
              summary_text = line_summary_match[1].trim()
              continue
            } else {
              let open_summary_line = local_next_trimmed.match(/<summary>(.*)/i)
              if (open_summary_line) {
                summary_text = open_summary_line[1].trim()
                in_multiline_summary = true
                continue
              }
            }
          }

          let opens = (local_next_trimmed.match(/<details\b/gi) || []).length
          let closes = (local_next_trimmed.match(/<\/details>/gi) || []).length

          depth += opens
          depth -= closes

          if (depth <= 0) {
            let close_idx = local_next_line.toLowerCase().indexOf('</details>')
            if (close_idx > 0) {
              let before_close = local_next_line.slice(0, close_idx).trim()
              if (before_close)
                details_body_lines.push(before_close)
            }
            i = x
            break
          } else {
            details_body_lines.push(local_next_line)
          }
        }
      }

      if (!summary_text)
        summary_text = 'Details'

      let clean_summary_text = summary_text.replace(/<\/?(b|strong|span|em|i|u)[^>]*>/gi, '').trim()

      elements_array.push(
        <details
          key={`details-${block_key++}`}
          open={is_open_by_default}
          className="group border border-border/70 bg-background/60 rounded-none transition-colors my-2 select-text"
        >
          <summary className="cursor-pointer font-bold text-foreground text-[var(--body-font-size)] p-2 flex items-center justify-between hover:bg-muted/40 transition-colors select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Icon
                name="chevron_right"
                className="transition-transform duration-200 group-open:rotate-90 text-primary shrink-0"
              />
              <span>{parseInline(clean_summary_text)}</span>
            </span>
          </summary>
          <div className="p-2.5 pt-1.5 border-t border-border/40 text-[var(--body-font-size)] space-y-1">
            <MarkdownRenderer content={details_body_lines.join('\n')} isNested />
          </div>
        </details>
      )
      continue
    }

    if (local_trimmed.toLowerCase() === '</details>')
      continue

    //4. Alert callout: > [!NOTE], > [!WARNING], etc.
    let local_alert_match = local_trimmed.match(
      /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|HINT|DANGER|ERROR|SUCCESS|QUESTION|FAQ|EXAMPLE|QUOTE)\](?:\s+(.*))?$/i
    )
    if (local_alert_match) {
      flush_list()
      let local_alert_key = local_alert_match[1].toUpperCase()
      let local_custom_title = local_alert_match[2]?.trim() || undefined
      let local_cfg = ALERT_CONFIGS[local_alert_key] || ALERT_CONFIGS.NOTE
      let local_alert_body_lines: string[] = []

      for (let x = i + 1; x < lines_array.length; x++) {
        let local_next_trimmed = lines_array[x].trim()

        if (local_next_trimmed === '') {
          if (x + 1 < lines_array.length && lines_array[x + 1].trim().startsWith('>')) {
            local_alert_body_lines.push('')
            i = x
            continue
          } else {
            break
          }
        }

        if (local_next_trimmed.match(/^>\s*\[!/i))
          break

        if (local_next_trimmed.startsWith('>')) {
          local_alert_body_lines.push(local_next_trimmed.replace(/^>\s?/, ''))
          i = x
        } else {
          if (
            local_next_trimmed.startsWith('- ') ||
            local_next_trimmed.startsWith('* ') ||
            local_next_trimmed.startsWith('# ') ||
            local_next_trimmed.startsWith('## ') ||
            local_next_trimmed.startsWith('### ') ||
            local_next_trimmed.startsWith('---') ||
            local_next_trimmed.startsWith('***') ||
            local_next_trimmed.startsWith('|')
          ) {
            break
          }
          local_alert_body_lines.push(local_next_trimmed)
          i = x
        }
      }

      elements_array.push(
        <div
          key={`alert-${block_key++}`}
          className={`my-2.5 p-2.5 border-l-4 border ${local_cfg.borderColour} ${local_cfg.bgColour} rounded-none select-text`}
        >
          <div
            className={`flex items-center gap-1.5 font-bold text-[var(--body-font-size)] mb-1 ${local_cfg.titleColour}`}
          >
            <Icon name={local_cfg.icon} size={15} className={local_cfg.iconColour} />
            <span className="uppercase tracking-wider text-xs">
              {local_custom_title || local_cfg.title}
            </span>
          </div>
          {local_alert_body_lines.length > 0 && (
            <div className="text-foreground/90 font-light leading-relaxed pl-0.5">
              <MarkdownRenderer content={local_alert_body_lines.join('\n')} isNested />
            </div>
          )}
        </div>
      )
      continue
    }

    //4. Standard Blockquote
    if (local_trimmed.startsWith('>')) {
      flush_list()
      let local_quote_body_lines: string[] = [local_trimmed.replace(/^>\s?/, '')]

      for (let x = i + 1; x < lines_array.length; x++) {
        let local_next_trimmed = lines_array[x].trim()
        if (local_next_trimmed.startsWith('>') && !local_next_trimmed.match(/^>\s*\[!/i)) {
          local_quote_body_lines.push(local_next_trimmed.replace(/^>\s?/, ''))
          i = x
        } else {
          break
        }
      }

      elements_array.push(
        <blockquote
          key={`quote-${block_key++}`}
          className="border-l-2 border-primary/70 bg-muted/20 pl-3 py-1.5 my-2 text-muted-foreground italic text-[var(--body-font-size)] font-light leading-relaxed select-text"
        >
          <MarkdownRenderer content={local_quote_body_lines.join('\n')} isNested />
        </blockquote>
      )
      continue
    }

    //5. Block Images: ![Alt text](url "title")
    let local_block_img_match = local_trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/)
    if (local_block_img_match) {
      flush_list()
      let local_alt = local_block_img_match[1] || ''
      let local_title = local_block_img_match[3] || local_alt
      let local_url = local_block_img_match[2]

      elements_array.push(
        <figure
          key={`blockimg-${block_key++}`}
          className="my-3 flex flex-col items-center select-none"
        >
          <img
            src={local_url}
            alt={local_alt}
            title={local_title}
            className="max-w-full h-auto max-h-72 border border-border bg-background/50 object-contain shadow-sm rounded-none"
            loading="lazy"
            onError={(e) => {
              let local_target = e.currentTarget
              local_target.style.display = 'none'
              let local_parent = local_target.parentElement
              if (local_parent && !local_parent.querySelector('.img-error-badge')) {
                let local_badge = document.createElement('div')
                local_badge.className =
                  'img-error-badge p-2 text-xs text-muted-foreground border border-dashed border-border flex items-center gap-1.5 bg-muted/20'
                local_badge.innerHTML = `<span class="material-icons text-sm text-destructive">broken_image</span> Image unavailable: ${local_alt || local_url}`
                local_parent.appendChild(local_badge)
              }
            }}
          />
          {local_alt && (
            <figcaption className="text-[11px] text-muted-foreground/80 italic mt-1 text-center">
              {local_alt}
            </figcaption>
          )}
        </figure>
      )
      continue
    }

    //6. GFM Tables
    if (local_trimmed.startsWith('|') && local_trimmed.endsWith('|') && i + 1 < lines_array.length) {
      let local_next_trimmed = lines_array[i + 1].trim()
      let local_is_separator = /^\|(?:\s*:?-+:?\s*\|)+$/.test(local_next_trimmed)

      if (local_is_separator) {
        flush_list()
        let parse_row_func = function (arg0_row_str: string) {
          let row_str = arg0_row_str
          return row_str
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim())
        }

        let local_headers = parse_row_func(local_trimmed)
        i += 2 //Skip header and delimiter

        let local_table_rows_array: string[][] = []
        for (let x = i; x < lines_array.length; x++) {
          let local_r_trimmed = lines_array[x].trim()
          if (local_r_trimmed.startsWith('|') && local_r_trimmed.endsWith('|')) {
            local_table_rows_array.push(parse_row_func(local_r_trimmed))
            i = x
          } else {
            break
          }
        }

        elements_array.push(
          <div key={`table-${block_key++}`} className="my-2.5 overflow-x-auto">
            <table className="w-full border-collapse border border-border text-[var(--body-font-size)] font-sans">
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  {local_headers.map((h, h_idx) => (
                    <th
                      key={h_idx}
                      className="p-1.5 px-2 text-left font-bold text-foreground border-r border-border last:border-0"
                    >
                      {parseInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {local_table_rows_array.map((row, r_idx) => (
                  <tr
                    key={r_idx}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    {row.map((cell, c_idx) => (
                      <td
                        key={c_idx}
                        className="p-1.5 px-2 text-muted-foreground border-r border-border/50 last:border-0"
                      >
                        {parseInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
    }

    //7. List item (unordered -/*/+ or ordered 1./1))
    let is_hr_rule = /^(\s*[-*_]\s*){3,}$/.test(local_line)
    let list_match = (!is_hr_rule) ? local_line.match(/^(\s*)([-*+]|\d+[\.\)])\s+(.*)$/) : null

    if (list_match) {
      let indent_spaces = list_match[1].replace(/\t/g, '  ').length
      let marker = list_match[2]
      let is_ordered = /^\d+[\.\)]$/.test(marker)
      let item_text = list_match[3].trim()
      let start_num = is_ordered ? parseInt(marker, 10) : undefined

      if (
        collected_list_items.length > 0 &&
        indent_spaces === collected_list_items[0].raw_indent &&
        is_ordered !== collected_list_items[collected_list_items.length - 1].is_ordered
      ) {
        flush_list()
      }

      collected_list_items.push({
        is_ordered,
        raw_indent: indent_spaces,
        start_number: !isNaN(start_num as number) ? start_num : 1,
        text: item_text,
      })
      continue
    } else if (
      collected_list_items.length > 0 &&
      /^\s{2,}\S/.test(local_line) &&
      !local_trimmed.startsWith('#') &&
      !local_trimmed.startsWith('>') &&
      !local_trimmed.startsWith('|') &&
      !local_trimmed.startsWith('```')
    ) {
      collected_list_items[collected_list_items.length - 1].text += ' ' + local_trimmed
      continue
    } else {
      flush_list()
    }

    //8. Headings
    if (local_trimmed.startsWith('# ')) {
      elements_array.push(
        <h1
          key={`h1-${block_key++}`}
          className="font-bold text-foreground text-[var(--header-font-size)] mt-3 mb-1.5 first:mt-0"
        >
          {parseInline(local_trimmed.slice(2))}
        </h1>
      )
    } else if (local_trimmed.startsWith('## ')) {
      elements_array.push(
        <h2
          key={`h2-${block_key++}`}
          className="font-bold text-foreground text-[var(--body-font-size)] uppercase tracking-wider mt-3 mb-1 first:mt-0"
        >
          {parseInline(local_trimmed.slice(3))}
        </h2>
      )
    } else if (local_trimmed.startsWith('### ')) {
      elements_array.push(
        <h3
          key={`h3-${block_key++}`}
          className="font-bold text-foreground text-[var(--body-font-size)] mt-2.5 mb-1 first:mt-0"
        >
          {parseInline(local_trimmed.slice(4))}
        </h3>
      )
    } else if (local_trimmed.startsWith('#### ')) {
      elements_array.push(
        <h4
          key={`h4-${block_key++}`}
          className="font-semibold text-foreground text-[var(--body-font-size)] mt-2 mb-1 first:mt-0"
        >
          {parseInline(local_trimmed.slice(5))}
        </h4>
      )
    } else if (local_trimmed === '---' || local_trimmed === '***' || local_trimmed === '___') {
      elements_array.push(<hr key={`hr-${block_key++}`} className="border-border my-2.5" />)
    } else {
      elements_array.push(
        <p
          key={`p-${block_key++}`}
          className="text-muted-foreground font-light leading-relaxed my-1.5 text-[var(--body-font-size)]"
        >
          {parseInline(local_trimmed)}
        </p>
      )
    }
  }

  flush_list()
  flush_code_block()

  //Return statement
  return (
    <div
      className={`space-y-0.5 text-[var(--body-font-size)] ${(is_nested) ? '' : class_name}`}
    >
      {elements_array}
    </div>
  )
}

export default MarkdownRenderer
