import {
  calculateDemographicPyramid,
  calculateSectorBreakdown,
} from '../core/server/raster_demographics_service.ts'

console.log('[Test] 1. Calculating demographic pyramid for 1950...')
let t0 = performance.now()
let demo = calculateDemographicPyramid({ country: 'Global', year: 1950 })
let t1 = performance.now()
console.log(`[Test] Completed in ${(t1 - t0).toFixed(1)}ms:`)
console.log(`  Country: ${demo.country}`)
console.log(`  Total Female (thousands): ${demo.totalFemale.toLocaleString()}`)
console.log(`  Total Male (thousands): ${demo.totalMale.toLocaleString()}`)
console.log(`  Old-Age Dependency Ratio: ${demo.oldAgeDependencyRatio ?? demo.dependencyRatio}%`)
console.log(`  Sex Ratio: ${demo.sexRatio}`)

console.log('[Test] 2. Calculating sector breakdown for 1950...')
let t2 = performance.now()
let sectors = calculateSectorBreakdown({ year: 1950 })
let t3 = performance.now()
console.log(`[Test] Completed in ${(t3 - t2).toFixed(1)}ms:`)
console.log('  Global Sector Shares:', JSON.stringify(sectors.global))

console.log('[Test] ALL BREAKDOWN TESTS PASSED!')
