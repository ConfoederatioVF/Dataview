import * as fs from 'fs'
import * as path from 'path'
import type { CorrelatedStateCapital, CorrelatedCapitalTimelineItem } from './d_correlate_capitals_with_stadester.ts'

export interface ChunkTimelineItem {
  city: string
  key?: string
  start: string
  start_frac?: number
  stop: string
  stop_frac?: number
}

export interface ChunkStateEntry {
  chunk_file: string
  fill?: string
  name: string
  raw_block: string
  reason?: string
  start_date: string
  start_year: number
  state_id: number
  status: 'CAPITAL' | 'ACAPITAL'
  stop_date: string
  stop_year: number
  timeline?: ChunkTimelineItem[]
}

/**
 * Parses fractional year from a date string (YYYY.M.D).
 *
 * @param {string} arg0_date_str
 * @returns {number}
 */
function parseFractionalYear (arg0_date_str: string): number {
  //Convert from parameters
  let date_str = arg0_date_str

  //Function body
  let parts = date_str.split('.')
  let year = parseInt(parts[0], 10)
  if (isNaN(year))
    return 0

  if (parts.length >= 2) {
    let month = parseInt(parts[1], 10) || 1
    let day = parseInt(parts[2], 10) || 1
    let day_of_year = (month - 1) * 30 + day
    return year + day_of_year / 365
  }

  //Return statement
  return year
}

/**
 * Parses all capital chunk files into structured state entries.
 *
 * @param {string} [arg0_chunks_dir]
 * @returns {Map<number, ChunkStateEntry>}
 */
export function loadCapitalChunks (arg0_chunks_dir?: string): Map<number, ChunkStateEntry> {
  //Convert from parameters
  let chunks_dir = arg0_chunks_dir || path.resolve(process.cwd(), 'tests/capitals/chunks')

  //Declare local instance variables
  let chunks_map = new Map<number, ChunkStateEntry>()
  let files: string[]

  //Guard clauses
  if (!fs.existsSync(chunks_dir)) {
    console.warn(`[loadCapitalChunks] Chunks directory not found: ${chunks_dir}`)
    return chunks_map
  }

  //Function body
  files = fs.readdirSync(chunks_dir)
    .filter((arg0_f) => arg0_f.startsWith('chunk_') && arg0_f.endsWith('.txt'))
    .sort()

  for (let i = 0; i < files.length; i++) {
    let filename = files[i]
    let filepath = path.join(chunks_dir, filename)
    let content = fs.readFileSync(filepath, 'utf-8')
    let blocks = content.split('---')

    for (let x = 0; x < blocks.length; x++) {
      let block = blocks[x].trim()
      if (!block)
        continue

      let header_match = block.match(/STATE:\s*\[(\d+)\]\s*(.+?)\s+\(([-0-9.]+)\s*->\s*([-0-9.]+)\)(?:\s*\[fill:\s*([^\]]+)\])?(?:\r?\n|$)/)
      if (!header_match)
        continue

      let state_id = parseInt(header_match[1], 10)
      let name = header_match[2].trim()
      let start_date = header_match[3].trim()
      let stop_date = header_match[4].trim()
      let fill = header_match[5]?.trim()

      let status_match = block.match(/STATUS:\s*(CAPITAL|ACAPITAL)/)
      let status: 'CAPITAL' | 'ACAPITAL' = status_match ? (status_match[1] as 'CAPITAL' | 'ACAPITAL') : 'CAPITAL'

      let reason_match = block.match(/REASON:\s*([^\n]+)/)
      let reason = reason_match ? reason_match[1].trim() : undefined

      let timeline: ChunkTimelineItem[] = []
      if (status === 'CAPITAL') {
        let lines = block.split('\n')
        for (let y = 0; y < lines.length; y++) {
          let line = lines[y].trim()
          let tl_match = line.match(/^([-0-9.]+)\s*->\s*([-0-9.]+):\s*([^[\n]+?)(?:\s*\[([^\]]+)\])?$/)
          if (tl_match) {
            let s_date = tl_match[1].trim()
            let e_date = tl_match[2].trim()
            let c_name = tl_match[3].trim()
            let c_key = tl_match[4]?.trim()
            timeline.push({
              city: c_name,
              key: c_key,
              start: s_date,
              start_frac: parseFractionalYear(s_date),
              stop: e_date,
              stop_frac: parseFractionalYear(e_date),
            })
          }
        }
      }

      chunks_map.set(state_id, {
        chunk_file: filename,
        fill: fill,
        name: name,
        raw_block: block,
        reason: reason,
        start_date: start_date,
        start_year: parseInt(start_date.split('.')[0], 10) || 0,
        state_id: state_id,
        status: status,
        stop_date: stop_date,
        stop_year: parseInt(stop_date.split('.')[0], 10) || 0,
        timeline: timeline,
      })
    }
  }

  console.log(`[loadCapitalChunks] Successfully parsed ${chunks_map.size} states across ${files.length} chunk files.`)

  //Return statement
  return chunks_map
}

/**
 * Compares an existing chunk entry against Wikipedia-correlated data.
 * Returns true if Wikipedia provides a course of events that disagrees with the chunk.
 *
 * @param {ChunkStateEntry} arg0_chunk
 * @param {CorrelatedStateCapital} arg1_wiki
 *
 * @returns {{ disagrees: boolean; reason?: string }}
 */
export function evaluateWikipediaDisagreement (
  arg0_chunk: ChunkStateEntry,
  arg1_wiki: CorrelatedStateCapital
): { disagrees: boolean; reason?: string } {
  //Convert from parameters
  let chunk = arg0_chunk
  let wiki = arg1_wiki

  //Guard clauses
  if (!wiki)
    return { disagrees: false }

  //Function body
  //Case 1: Chunk is ACAPITAL, but Wikipedia provides a verified capital timeline
  if (chunk.status === 'ACAPITAL' && !wiki.acapital && wiki.timeline && wiki.timeline.length > 0) {
    let cities_str = wiki.timeline.map((arg0_t) => arg0_t.city).join(', ')
    return {
      disagrees: true,
      reason: `Chunk designated ACAPITAL, but Wikipedia establishes capital timeline: ${cities_str}`,
    }
  }

  //Case 2: Chunk has a capital timeline, but Wikipedia has explicit capital timeline with different cities
  if (chunk.status === 'CAPITAL' && !wiki.acapital && wiki.timeline && wiki.timeline.length > 0) {
    let chunk_cities = (chunk.timeline || []).map((arg0_t) => arg0_t.city.toLowerCase().trim())
    let wiki_cities = wiki.timeline.map((arg0_t) => arg0_t.city.toLowerCase().trim())

    let has_overlap = false
    for (let c of wiki_cities) {
      if (chunk_cities.includes(c)) {
        has_overlap = true
        break
      }
    }

    if (!has_overlap && wiki_cities.length > 0 && chunk_cities.length > 0) {
      return {
        disagrees: true,
        reason: `Chunk lists [${chunk_cities.join(', ')}], whereas Wikipedia establishes [${wiki_cities.join(', ')}]`,
      }
    }
  }

  //Case 3: Chunk has capital, but Wikipedia explicitly designates acapital/nomadic
  if (chunk.status === 'CAPITAL' && wiki.acapital) {
    return {
      disagrees: true,
      reason: `Chunk lists capital, but Wikipedia designates polity as acapital / nomadic confederacy`,
    }
  }

  //Return statement
  return { disagrees: false }
}

/**
 * Updates a chunk file in place when Wikipedia's course of events overrides it.
 *
 * @param {string} arg0_chunks_dir
 * @param {ChunkStateEntry} arg0_chunk
 * @param {CorrelatedStateCapital} arg1_new_capital
 *
 * @returns {boolean}
 */
export function updateChunkFile (
  arg0_chunks_dir: string,
  arg0_chunk: ChunkStateEntry,
  arg1_new_capital: CorrelatedStateCapital
): boolean {
  //Convert from parameters
  let chunk = arg0_chunk
  let chunks_dir = arg0_chunks_dir
  let new_capital = arg1_new_capital

  //Declare local instance variables
  let filepath = path.join(chunks_dir, chunk.chunk_file)
  let new_block = ''

  //Guard clauses
  if (!fs.existsSync(filepath))
    return false

  //Function body
  let fill_str = chunk.fill ? ` [fill: ${chunk.fill}]` : ''
  new_block = `STATE: [${chunk.state_id}] ${chunk.name} (${chunk.start_date} -> ${chunk.stop_date})${fill_str}\n`

  if (new_capital.acapital || !new_capital.timeline || new_capital.timeline.length === 0) {
    new_block += `STATUS: ACAPITAL\n`
    new_block += `REASON: ${chunk.reason || 'Verified as acapital from Wikipedia historical record'}\n`
  } else {
    new_block += `STATUS: CAPITAL\nTIMELINE:\n`
    for (let i = 0; i < new_capital.timeline.length; i++) {
      let item = new_capital.timeline[i]
      let key_str = item.key ? ` [${item.key}]` : ''
      new_block += `  ${item.start} -> ${item.stop}: ${item.city}${key_str}\n`
    }
  }

  let file_content = fs.readFileSync(filepath, 'utf-8')
  let blocks = file_content.split('---')
  let found = false

  for (let b = 0; b < blocks.length; b++) {
    let block = blocks[b].trim()
    let m = block.match(/STATE:\s*\[(\d+)\]/)
    if (m && parseInt(m[1], 10) === chunk.state_id) {
      blocks[b] = `\n\n${new_block}\n`
      found = true
      break
    }
  }

  if (found) {
    fs.writeFileSync(filepath, blocks.join('---'), 'utf-8')
    console.log(`[updateChunkFile] Updated state [${chunk.state_id}] in ${chunk.chunk_file}`)
    return true
  }

  //Return statement
  return false
}
