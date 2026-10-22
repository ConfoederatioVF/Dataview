import assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { AtlasBordersService } from '../../core/server/AtlasBordersService.ts'
import { loadCapitalChunks, evaluateWikipediaDisagreement } from './capital_chunks_manager.ts'
import { runCapitalPipeline } from './run_capital_pipeline.ts'

console.log('Testing Wikipedia-Correlated Capital City Methodology in tests/capitals...\n')

// 1. Run pipeline for test states including British East India Company (2086)
console.log('--- 1. Testing Non-Destructive Pipeline Execution ---')
let chunks = loadCapitalChunks()
assert(chunks.size > 7800, `Must load all 7800+ states from chunks, got: ${chunks.size}`)

// Check initial chunk entry for 2086
let beic_chunk = chunks.get(2086)
assert(beic_chunk, 'State 2086 must exist in capital_chunks')

// Execute pipeline on target states
let report = await runCapitalPipeline({
  only_state_ids: [2086, 5, 10, 3545]
})
console.log('Pipeline execution report:', report)
assert(report.chunks_preserved_count > 7800, 'Must preserve 7800+ chunk entries as-is')
assert(report.wikipedia_overrides_count >= 1, 'Must register at least 1 Wikipedia override where chunk disagreed (BEIC)')

// 2. Verify British East India Company (State 2086) in AtlasBordersService
console.log('\n--- 2. Testing State 2086 (British East India Company) Capital Timelines ---')

// 1650: Prior to Regulating Act 1773, EIC operated decentralized factories (Surat, Fort St George, Bombay Castle)
let beic_1650 = AtlasBordersService.getStateCapitalInfo(2086, 1650, 'British East India Company')
console.log('BEIC at 1650:', beic_1650)
assert.strictEqual(beic_1650.is_acapital, true, 'BEIC at 1650 must be acapital (corporate trading company with decentralized presidency factories)')

// 1750: Pre-diwani, commercial factory phase
let beic_1750 = AtlasBordersService.getStateCapitalInfo(2086, 1750, 'British East India Company')
console.log('BEIC at 1750:', beic_1750)
assert.strictEqual(beic_1750.is_acapital, true, 'BEIC at 1750 must be acapital')

// 1800: Company rule in India with central administrative capital in Calcutta
let beic_1800 = AtlasBordersService.getStateCapitalInfo(2086, 1800, 'British East India Company')
console.log('BEIC at 1800:', beic_1800)
assert.strictEqual(beic_1800.is_acapital, false, 'BEIC at 1800 must not be acapital')
assert.strictEqual(beic_1800.capname, 'Calcutta', `BEIC at 1800 must have Calcutta as capital, got: ${beic_1800.capname}`)
assert.strictEqual(beic_1800.capkey, 'stadester-Calcutta-India', `BEIC at 1800 must resolve key stadester-Calcutta-India, got: ${beic_1800.capkey}`)
assert(beic_1800.cap_coords && beic_1800.cap_coords.length === 2, 'BEIC at 1800 must provide valid coordinates')

// 1850: Late Company rule prior to Government of India Act 1858
let beic_1850 = AtlasBordersService.getStateCapitalInfo(2086, 1850, 'British East India Company')
console.log('BEIC at 1850:', beic_1850)
assert.strictEqual(beic_1850.is_acapital, false, 'BEIC at 1850 must not be acapital')
assert.strictEqual(beic_1850.capname, 'Calcutta', `BEIC at 1850 must have Calcutta as capital, got: ${beic_1850.capname}`)

console.log('[PASS] State 2086 correctly resolves to acapital (1612-1773) and Calcutta (1773-1858).')

// 3. Verify chunk_04.txt was updated to reflect Wikipedia's course of events
console.log('\n--- 3. Verifying chunk_04.txt Synchronisation ---')
let c4_path = path.resolve(process.cwd(), 'tests/capitals/chunks/chunk_04.txt')
let c4_content = fs.readFileSync(c4_path, 'utf-8')
assert(c4_content.includes('Calcutta [stadester-Calcutta-India]'), 'chunk_04.txt must now record Calcutta as capital for State 2086')
console.log('[PASS] chunk_04.txt successfully synchronised with Wikipedia override.')

// 4. Verify Srinagar decoupling and integrity
console.log('\n--- 4. Verifying Srinagar Decoupling and Authentic Affiliations ---')

let sc_path = path.resolve(process.cwd(), 'data/stadester/state_capitals.json')
let sc_data = JSON.parse(fs.readFileSync(sc_path, 'utf-8'))

let beic_sc_entry = sc_data['2086']
assert(beic_sc_entry, 'State 2086 must exist in state_capitals.json')
if (beic_sc_entry.timeline) {
  for (let t of beic_sc_entry.timeline) {
    assert(!t.city.toLowerCase().includes('srinagar'), `State 2086 timeline must NOT contain Srinagar! Found: ${t.city}`)
    assert(!t.key?.toLowerCase().includes('srinagar'), `State 2086 timeline key must NOT reference Srinagar! Found: ${t.key}`)
  }
}
console.log('[PASS] State 2086 in state_capitals.json has zero association with Srinagar.')

let cm_path = path.resolve(process.cwd(), 'data/stadester/city_metadata.json')
let cm_data = JSON.parse(fs.readFileSync(cm_path, 'utf-8'))

let srinagar_entry = cm_data.find((c: any) => c.name === 'Srînagar' && c.coords && Math.abs(c.coords[0] - 74.797) < 0.1)
assert(srinagar_entry, 'Srinagar entry in city_metadata.json must exist')
if (srinagar_entry.capital) {
  for (let [date, sid] of Object.entries(srinagar_entry.capital)) {
    assert(sid !== 2086, `Srinagar capital record at ${date} must NOT be 2086!`)
  }
}
console.log('[PASS] city_metadata.json Srinagar records decoupled from 2086.')

let calcutta_entry = cm_data.find((c: any) => c.name === 'Calcutta' && c.coords && Math.abs(c.coords[0] - 88.36) < 0.1)
assert(calcutta_entry, 'Calcutta entry in city_metadata.json must exist')
assert(calcutta_entry.capital && calcutta_entry.capital['1773.1.1'] === 2086, 'Calcutta must have 2086 (BEIC) in its capital timeline from 1773.1.1')
console.log('[PASS] city_metadata.json Calcutta correctly anchors State 2086 from 1773.1.1 to 1858.8.2.')

// 5. Verify Other Sample Polities
console.log('\n--- 5. Verifying Other Sample Polities ---')
let aosta_1010 = AtlasBordersService.getStateCapitalInfo(5, 1010, 'Aosta Prince-Bishopric')
console.log('Aosta Prince-Bishopric at 1010:', aosta_1010)
assert.strictEqual(aosta_1010.capname, 'Aosta', `Aosta at 1010 must be Aosta, got: ${aosta_1010.capname}`)

let belluno_1100 = AtlasBordersService.getStateCapitalInfo(10, 1100, 'Belluno Prince-Bishopric')
console.log('Belluno Prince-Bishopric at 1100:', belluno_1100)
assert.strictEqual(belluno_1100.capname, 'Belluno', `Belluno at 1100 must be Belluno, got: ${belluno_1100.capname}`)

console.log('\n>>> ALL CAPITAL PIPELINE TESTS PASSED SUCCESSFULLY! <<<')
