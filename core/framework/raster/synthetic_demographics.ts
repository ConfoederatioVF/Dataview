/**
 * Fast synthetic demographic and sector models for instantaneous responsive rendering.
 * Provides immediate feedback before authentic raster calculations complete.
 */

export interface SyntheticDemographicResult {
  country: string
  dependencyRatio: number
  female: Record<string, number>
  male: Record<string, number>
  oldAgeDependencyRatio?: number
  sexRatio: number
  totalFemale: number
  totalMale: number
}

export interface SyntheticSectorResult {
  byCountry: Record<string, Record<string, number>>
  global: Record<string, number>
}

let AGE_IDS = [
  '00', '01', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80'
]
let COHORT_WIDTHS = [1, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 7]
let COHORT_MID_AGES = [0.5, 3.0, 7.5, 12.5, 17.5, 22.5, 27.5, 32.5, 37.5, 42.5, 47.5, 52.5, 57.5, 62.5, 67.5, 72.5, 77.5, 84.0]

let SUPER_AGED_COUNTRIES = new Set([
  'japan', 'germany', 'italy', 'spain', 'portugal', 'greece', 'south korea', 'korea', 'croatia', 'slovenia'
])

let MATURE_WESTERN_COUNTRIES = new Set([
  'united states', 'united states of america', 'usa', 'united kingdom', 'uk', 'france', 'canada', 'australia',
  'netherlands', 'sweden', 'norway', 'denmark', 'finland', 'switzerland', 'austria', 'belgium', 'new zealand', 'ireland'
])

let TRANSITION_EMERGING_COUNTRIES = new Set([
  'china', 'russia', 'russian federation', 'brazil', 'mexico', 'turkey', 'iran', 'thailand', 'vietnam', 'poland',
  'argentina', 'chile', 'colombia', 'romania', 'ukraine', 'czechia', 'czech republic', 'hungary'
])

let DEVELOPING_DIVIDEND_COUNTRIES = new Set([
  'india', 'indonesia', 'pakistan', 'bangladesh', 'philippines', 'egypt', 'south africa', 'peru', 'morocco',
  'algeria', 'saudi arabia', 'iraq', 'uzbekistan', 'malaysia', 'venezuela'
])

let HIGH_FERTILITY_COUNTRIES = new Set([
  'nigeria', 'ethiopia', 'dr congo', 'democratic republic of the congo', 'tanzania', 'kenya', 'uganda', 'sudan',
  'afghanistan', 'niger', 'mali', 'chad', 'angola', 'somalia', 'mozambique', 'madagascar', 'cameroon', 'yemen'
])

let COUNTRY_POP_2025_THOUSANDS: Record<string, number> = {
  algeria: 45000,
  angola: 36000,
  argentina: 46000,
  australia: 27000,
  austria: 9100,
  azerbaijan: 10000,
  bangladesh: 173000,
  belgium: 12000,
  benin: 13000,
  bolivia: 12000,
  brazil: 215000,
  burundi: 13000,
  cameroon: 29000,
  canada: 40000,
  chad: 18000,
  chile: 20000,
  china: 1410000,
  colombia: 52000,
  croatia: 4000,
  cuba: 11000,
  czechia: 11000,
  'czech republic': 11000,
  'democratic republic of the congo': 102000,
  denmark: 5900,
  'dominican republic': 11000,
  'dr congo': 102000,
  ecuador: 18000,
  egypt: 112000,
  ethiopia: 126000,
  finland: 5600,
  france: 68000,
  germany: 84000,
  ghana: 34000,
  global: 8050000,
  greece: 10000,
  guatemala: 18000,
  guinea: 14000,
  haiti: 12000,
  honduras: 10500,
  hungary: 9600,
  india: 1430000,
  indonesia: 280000,
  iran: 89000,
  iraq: 45000,
  ireland: 5100,
  israel: 9800,
  italy: 59000,
  'ivory coast': 29000,
  japan: 124000,
  jordan: 11000,
  kazakhstan: 20000,
  kenya: 55000,
  korea: 52000,
  madagascar: 30000,
  malaysia: 34000,
  mali: 23000,
  mexico: 130000,
  morocco: 37000,
  mozambique: 33000,
  myanmar: 54000,
  nepal: 31000,
  netherlands: 18000,
  'new zealand': 5200,
  niger: 27000,
  nigeria: 225000,
  norway: 5500,
  pakistan: 240000,
  peru: 34000,
  philippines: 115000,
  poland: 38000,
  portugal: 10300,
  romania: 19000,
  russia: 144000,
  'russian federation': 144000,
  'saudi arabia': 36000,
  senegal: 18000,
  serbia: 7000,
  singapore: 6000,
  slovakia: 5400,
  somalia: 18000,
  'south africa': 60000,
  'south korea': 52000,
  spain: 48000,
  sudan: 48000,
  sweden: 10500,
  switzerland: 8900,
  syria: 23000,
  taiwan: 23500,
  tanzania: 67000,
  thailand: 71000,
  tunisia: 12400,
  turkey: 85000,
  uganda: 48000,
  uk: 67000,
  ukraine: 38000,
  'united arab emirates': 10000,
  'united kingdom': 67000,
  'united states': 340000,
  'united states of america': 340000,
  usa: 340000,
  uzbekistan: 36000,
  venezuela: 29000,
  vietnam: 100000,
  yemen: 34000,
  zambia: 20000,
  zimbabwe: 16000,
}

/**
 * Computes estimated historical population in thousands for a country.
 *
 * @param {string} arg0_country
 * @param {number} arg1_year
 *
 * @returns {number}
 */
export function getHistoricalPopulationThousands (arg0_country: string, arg1_year: number): number {
  //Convert from parameters
  let country = arg0_country.toLowerCase().trim()
  let year = arg1_year

  //Declare local instance variables
  let base_2025 = COUNTRY_POP_2025_THOUSANDS[country]
  let growth_ratio = 1.0
  let hash = 0

  //Function body
  if (!base_2025) {
    if (country.includes('prussia') || country.includes('weimar') || country.includes('german') || country.includes('holy roman')) {
      base_2025 = 84000
    } else if (country.includes('franc') || country.includes('gaul')) {
      base_2025 = 68000
    } else if (country.includes('brit') || country.includes('engl') || country.includes('scot') || country.includes('uk')) {
      base_2025 = 67000
    } else if (country.includes('russ') || country.includes('sovi') || country.includes('moscow')) {
      base_2025 = 144000
    } else if (country.includes('austr') || country.includes('habsburg') || country.includes('hungar')) {
      base_2025 = 35000
    } else if (country.includes('otto') || country.includes('turk') || country.includes('byzant')) {
      base_2025 = 75000
    } else if (country.includes('chin') || country.includes('ming') || country.includes('qing') || country.includes('han') || country.includes('song')) {
      base_2025 = 900000
    } else if (country.includes('roma') || country.includes('ital') || country.includes('veni') || country.includes('floren') || country.includes('papal')) {
      base_2025 = 59000
    } else if (country.includes('spain') || country.includes('castil') || country.includes('aragon')) {
      base_2025 = 48000
    } else if (country.includes('portug')) {
      base_2025 = 10000
    } else if (country.includes('poland') || country.includes('lithuan')) {
      base_2025 = 38000
    } else if (country.includes('japan') || country.includes('tokugawa') || country.includes('meiji')) {
      base_2025 = 124000
    } else if (country.includes('india') || country.includes('mughal') || country.includes('maratha') || country.includes('delhi')) {
      base_2025 = 1100000
    } else if (country.includes('persia') || country.includes('safavid') || country.includes('iran')) {
      base_2025 = 70000
    } else if (country.includes('egypt') || country.includes('mamluk')) {
      base_2025 = 60000
    } else {
      for (let i = 0; i < country.length; i++) {
        hash = ((hash << 5) - hash) + country.charCodeAt(i)
        hash |= 0
      }
      base_2025 = 8000 + (Math.abs(hash) % 55000)
    }
  }

  if (country === 'global') {
    if (year <= 1800) {
      growth_ratio = 0.124
    } else if (year <= 1850) {
      growth_ratio = 0.124 + ((year - 1800)/50)*(0.156 - 0.124)
    } else if (year <= 1900) {
      growth_ratio = 0.156 + ((year - 1850)/50)*(0.205 - 0.156)
    } else if (year <= 1950) {
      growth_ratio = 0.205 + ((year - 1900)/50)*(0.314 - 0.205)
    } else if (year <= 1970) {
      growth_ratio = 0.314 + ((year - 1950)/20)*(0.460 - 0.314)
    } else if (year <= 1990) {
      growth_ratio = 0.460 + ((year - 1970)/20)*(0.658 - 0.460)
    } else if (year <= 2010) {
      growth_ratio = 0.658 + ((year - 1990)/20)*(0.863 - 0.658)
    } else {
      growth_ratio = 0.863 + ((year - 2010)/15)*(1.0 - 0.863)
    }
  } else if (MATURE_WESTERN_COUNTRIES.has(country)) {
    if (year <= 1800) {
      growth_ratio = 0.35
    } else if (year <= 1900) {
      growth_ratio = 0.35 + ((year - 1800)/100)*(0.65 - 0.35)
    } else if (year <= 1950) {
      growth_ratio = 0.65 + ((year - 1900)/50)*(0.80 - 0.65)
    } else {
      growth_ratio = 0.80 + ((year - 1950)/75)*(1.0 - 0.80)
    }
  } else {
    if (year <= 1850) {
      growth_ratio = 0.15
    } else if (year <= 1950) {
      growth_ratio = 0.15 + ((year - 1850)/100)*(0.35 - 0.15)
    } else {
      growth_ratio = 0.35 + ((year - 1950)/75)*(1.0 - 0.35)
    }
  }

  //Return statement
  return Math.round(base_2025*growth_ratio)
}

/**
 * Computes instantaneous synthetic demographic population pyramid.
 *
 * @param {string} arg0_country
 * @param {number} arg1_year
 *
 * @returns {SyntheticDemographicResult}
 */
export function computeSyntheticDemographicPyramid (
  arg0_country: string,
  arg1_year: number
): SyntheticDemographicResult {
  //Convert from parameters
  let country = arg0_country
  let year = arg1_year

  //Declare local instance variables
  let bulge_shift: number
  let clean_name = country.toLowerCase().trim()
  let cohort_densities: number[] = []
  let female_map: Record<string, number> = {}
  let get_country_hash: (arg0_str: string) => number
  let h: number
  let is_developing: boolean
  let is_high_fertility: boolean
  let is_mature: boolean
  let is_super_aged: boolean
  let is_transition: boolean
  let life_exp_mod: number
  let male_map: Record<string, number> = {}
  let old_age_dependency_ratio: number
  let old_dep_count = 0
  let sex_bias_mod: number
  let sex_ratio: number
  let sum_unnormalised = 0
  let total_female = 0
  let total_male = 0
  let total_pop_thousands: number
  let working_count = 0
  let youth_dep_count = 0
  let youth_shift: number

  get_country_hash = function (arg0_str: string): number {
    let hash = 0
    for (let x = 0; x < arg0_str.length; x++) {
      hash = ((hash << 5) - hash) + arg0_str.charCodeAt(x)
      hash |= 0
    }
    return Math.abs(hash)
  }

  //Function body
  h = get_country_hash(clean_name)
  total_pop_thousands = getHistoricalPopulationThousands(clean_name, year)

  //Determine country archetype with historical entity recognition
  is_super_aged =
    SUPER_AGED_COUNTRIES.has(clean_name) ||
    clean_name.includes('japan') ||
    clean_name.includes('germany') ||
    clean_name.includes('italy') ||
    clean_name.includes('spain') ||
    clean_name.includes('korea')

  is_mature =
    MATURE_WESTERN_COUNTRIES.has(clean_name) ||
    clean_name.includes('france') ||
    clean_name.includes('britain') ||
    clean_name.includes('united kingdom') ||
    clean_name.includes('england') ||
    clean_name.includes('america') ||
    clean_name.includes('united states') ||
    clean_name.includes('prussia') ||
    clean_name.includes('austria') ||
    clean_name.includes('holland') ||
    clean_name.includes('netherlands') ||
    clean_name.includes('sweden') ||
    clean_name.includes('norway') ||
    clean_name.includes('denmark') ||
    clean_name.includes('canada') ||
    clean_name.includes('australia') ||
    clean_name.includes('rome') ||
    clean_name.includes('roman')

  is_transition =
    TRANSITION_EMERGING_COUNTRIES.has(clean_name) ||
    clean_name.includes('russia') ||
    clean_name.includes('soviet') ||
    clean_name.includes('china') ||
    clean_name.includes('ming') ||
    clean_name.includes('qing') ||
    clean_name.includes('han') ||
    clean_name.includes('brazil') ||
    clean_name.includes('mexico') ||
    clean_name.includes('turk') ||
    clean_name.includes('ottoman') ||
    clean_name.includes('iran') ||
    clean_name.includes('persia') ||
    clean_name.includes('poland')

  is_developing =
    DEVELOPING_DIVIDEND_COUNTRIES.has(clean_name) ||
    clean_name.includes('india') ||
    clean_name.includes('indonesia') ||
    clean_name.includes('pakistan') ||
    clean_name.includes('bangladesh') ||
    clean_name.includes('philippines') ||
    clean_name.includes('egypt') ||
    clean_name.includes('morocco') ||
    clean_name.includes('mughal') ||
    clean_name.includes('persia')

  is_high_fertility =
    HIGH_FERTILITY_COUNTRIES.has(clean_name) ||
    clean_name.includes('nigeria') ||
    clean_name.includes('ethiop') ||
    clean_name.includes('congo') ||
    clean_name.includes('kenya') ||
    clean_name.includes('uganda') ||
    clean_name.includes('sudan') ||
    clean_name.includes('somali') ||
    clean_name.includes('afghan') ||
    clean_name.includes('mali') ||
    clean_name.includes('chad')

  sex_bias_mod = clean_name !== 'global' ? (((h >> 4) % 31)/30 - 0.5)*0.06 : 0
  life_exp_mod = clean_name !== 'global' ? (((h >> 8) % 31)/30 - 0.5)*4.5 : 0
  bulge_shift = clean_name !== 'global' ? (((h >> 12) % 15) - 7)*0.6 : 0
  youth_shift = clean_name !== 'global' ? (((h >> 16) % 21)/20 - 0.5)*0.15 : 0

  for (let i = 0; i < AGE_IDS.length; i++) {
    let age = COHORT_MID_AGES[i]
    let annual_density = 1.0
    let cohort_w = COHORT_WIDTHS[i]

    if (year <= 1850) {
      let life_exp = Math.max(26, 32 + life_exp_mod*0.6)
      annual_density = Math.exp(-age/life_exp)
    } else if (is_super_aged && year >= 1990) {
      let birth_decline = Math.min(0.68, Math.max(0.30, 0.45 + (year - 1990)*0.007 + youth_shift))
      let youth_curve = 1 - birth_decline*Math.exp(-Math.pow(age/24, 2))
      let bulge = 1 + 0.35*Math.exp(-Math.pow((age - (52 + bulge_shift))/14, 2))
      let survival = Math.exp(-Math.pow(age/(84 + life_exp_mod*0.5), 5.5))
      annual_density = youth_curve*bulge*survival
    } else if (is_mature && year >= 1970) {
      let birth_factor = 0.85 - (0.15 + youth_shift*0.5)*Math.exp(-Math.pow(age/22, 2))
      let bulge = 1 + 0.25*Math.exp(-Math.pow((age - (48 + bulge_shift))/16, 2))
      let survival = Math.exp(-Math.pow(age/(82 + life_exp_mod*0.5), 5.0))
      annual_density = birth_factor*bulge*survival
    } else if (is_transition && year >= 1990) {
      let birth_factor = 0.70 - (0.30 + youth_shift*0.5)*Math.exp(-Math.pow(age/20, 2))
      let bulge = 1 + 0.30*Math.exp(-Math.pow((age - (38 + bulge_shift))/15, 2))
      let survival = Math.exp(-Math.pow(age/(78 + life_exp_mod*0.5), 4.5))
      annual_density = birth_factor*bulge*survival
    } else if (is_high_fertility) {
      let life_exp = (year >= 1980 ? 46 : 38) + life_exp_mod*0.4
      annual_density = Math.exp(-age/life_exp)
    } else if (is_developing) {
      let t_progress = Math.min(1, Math.max(0, (year - 1950)/75))
      let life_exp = 40 + t_progress*30 + life_exp_mod
      let youth_factor = 1.0 - t_progress*(0.22 + youth_shift*0.3)*Math.exp(-Math.pow(age/22, 2))
      let dividend_bulge = 1.0 + t_progress*0.18*Math.exp(-Math.pow((age - (28 + bulge_shift))/14, 2))
      let survival = Math.exp(-Math.pow(age/life_exp, 3.8))
      annual_density = youth_factor*dividend_bulge*survival
    } else {
      let t_progress = Math.min(1, Math.max(0, (year - 1950)/75))
      let life_exp = 38 + t_progress*34 + life_exp_mod
      let youth_factor = 1.0 - t_progress*0.25*Math.exp(-Math.pow(age/22, 2))
      let survival = Math.exp(-Math.pow(age/life_exp, 3.8))
      annual_density = youth_factor*survival
    }

    let cohort_mod = clean_name !== 'global' ? ((((h >> (i % 16)) & 0x1f)/31 - 0.5)*0.06) : 0
    let density_val = cohort_w*annual_density*(1 + cohort_mod)
    cohort_densities.push(density_val)
    sum_unnormalised += density_val
  }

  for (let i = 0; i < AGE_IDS.length; i++) {
    let age = COHORT_MID_AGES[i]
    let cid = AGE_IDS[i]
    let cohort_inhabitants = sum_unnormalised > 0
      ? (cohort_densities[i]/sum_unnormalised)*total_pop_thousands
      : (total_pop_thousands/AGE_IDS.length)
    let f_val: number
    let m_val: number
    let sex_bias = 1.05 - (age/90)*0.25 + sex_bias_mod

    m_val = Math.max(0.1, cohort_inhabitants*(sex_bias/(1 + sex_bias)))
    f_val = Math.max(0.1, cohort_inhabitants*(1/(1 + sex_bias)))

    male_map[cid] = Math.round(m_val*10)/10
    female_map[cid] = Math.round(f_val*10)/10

    total_male += male_map[cid]
    total_female += female_map[cid]

    if (i <= 3) {
      youth_dep_count += male_map[cid] + female_map[cid]
    } else if (i >= 14) {
      old_dep_count += male_map[cid] + female_map[cid]
    } else {
      working_count += male_map[cid] + female_map[cid]
    }
  }

  sex_ratio = total_female > 0 ? Math.round((total_male/total_female)*1000)/1000 : 1.0
  old_age_dependency_ratio = working_count > 0 ? Math.round((old_dep_count/working_count)*1000)/10 : 15.0

  //Return statement
  return {
    country,
    dependencyRatio: old_age_dependency_ratio,
    female: female_map,
    male: male_map,
    oldAgeDependencyRatio: old_age_dependency_ratio,
    sexRatio: sex_ratio,
    totalFemale: Math.round(total_female*10)/10,
    totalMale: Math.round(total_male*10)/10,
  }
}

/**
 * Computes instantaneous synthetic sectoral employment shares.
 *
 * @param {string[]} arg0_countries
 * @param {number} arg1_year
 *
 * @returns {SyntheticSectorResult}
 */
export function computeSyntheticSectorBreakdown (
  arg0_countries: string[],
  arg1_year: number
): SyntheticSectorResult {
  //Convert from parameters
  let countries = arg0_countries
  let year = arg1_year

  //Declare local instance variables
  let by_country: Record<string, Record<string, number>> = {}
  let compute_single: (arg0_name: string) => Record<string, number>
  let get_country_hash: (arg0_str: string) => number
  let global_map: Record<string, number>

  get_country_hash = function (arg0_str: string): number {
    let hash = 0
    for (let x = 0; x < arg0_str.length; x++) {
      hash = ((hash << 5) - hash) + arg0_str.charCodeAt(x)
      hash |= 0
    }
    return Math.abs(hash)
  }

  //Function body
  compute_single = function (arg0_name: string): Record<string, number> {
    let clean = arg0_name.toLowerCase().trim()
    let h = get_country_hash(clean)
    let map: Record<string, number> = {}

    //Determine country economic structure
    let is_agrarian = HIGH_FERTILITY_COUNTRIES.has(clean)
    let is_developing = DEVELOPING_DIVIDEND_COUNTRIES.has(clean)
    let is_factory = TRANSITION_EMERGING_COUNTRIES.has(clean)
    let is_industrial = clean === 'germany' || clean === 'south korea' || clean === 'korea' || clean === 'czechia' || clean === 'poland' || clean === 'japan'
    let is_western = MATURE_WESTERN_COUNTRIES.has(clean) || SUPER_AGED_COUNTRIES.has(clean) || clean === 'singapore'

    if (year <= 1800) {
      map.agriculture = is_western ? 68.0 : 80.0
      map.informal_labour = is_western ? 8.0 : 12.0
      map.manufacturing = is_western ? 14.0 : 5.0
      map.services = is_western ? 10.0 : 3.0
    } else if (year <= 1950) {
      let t = (year - 1800)/150
      if (is_western || is_industrial) {
        map.agriculture = 68.0*(1 - t) + 14.0*t
        map.informal_labour = 8.0*(1 - t) + 6.0*t
        map.manufacturing = 14.0*(1 - t) + 40.0*t
        map.services = 10.0*(1 - t) + 40.0*t
      } else {
        map.agriculture = 80.0*(1 - t) + 62.0*t
        map.informal_labour = 12.0*(1 - t) + 18.0*t
        map.manufacturing = 5.0*(1 - t) + 11.0*t
        map.services = 3.0*(1 - t) + 9.0*t
      }
    } else {
      let t = Math.min(1, (year - 1950)/75)
      if (is_industrial) {
        map.agriculture = 14.0*(1 - t) + 1.6*t
        map.informal_labour = 6.0*(1 - t) + 3.8*t
        map.manufacturing = 40.0*(1 - t) + 26.5*t
        map.services = 40.0*(1 - t) + 68.1*t
      } else if (is_western) {
        map.agriculture = 14.0*(1 - t) + 2.0*t
        map.informal_labour = 6.0*(1 - t) + 4.8*t
        map.manufacturing = 40.0*(1 - t) + 14.2*t
        map.services = 40.0*(1 - t) + 79.0*t
      } else if (is_factory) {
        map.agriculture = 58.0*(1 - t) + 20.0*t
        map.informal_labour = 16.0*(1 - t) + 10.5*t
        map.manufacturing = 15.0*(1 - t) + 30.5*t
        map.services = 11.0*(1 - t) + 39.0*t
      } else if (is_developing) {
        map.agriculture = 65.0*(1 - t) + 38.0*t
        map.informal_labour = 19.0*(1 - t) + 26.0*t
        map.manufacturing = 10.0*(1 - t) + 15.0*t
        map.services = 6.0*(1 - t) + 21.0*t
      } else if (is_agrarian) {
        map.agriculture = 72.0*(1 - t) + 48.0*t
        map.informal_labour = 19.0*(1 - t) + 34.0*t
        map.manufacturing = 6.0*(1 - t) + 7.5*t
        map.services = 3.0*(1 - t) + 10.5*t
      } else {
        map.agriculture = 24.0*(1 - t) + 9.5*t
        map.informal_labour = 13.0*(1 - t) + 10.5*t
        map.manufacturing = 34.0*(1 - t) + 19.0*t
        map.services = 29.0*(1 - t) + 61.0*t
      }
    }

    //Apply deterministic country-specific profile variation so each country is unique
    if (clean !== 'global') {
      let v_agri = ((h % 41)/40 - 0.5)*3.2
      let v_inf = (((h >> 3) % 41)/40 - 0.5)*2.8
      let v_mfg = (((h >> 6) % 41)/40 - 0.5)*4.5
      let v_srv = (((h >> 9) % 41)/40 - 0.5)*4.5

      map.agriculture = Math.max(0.5, map.agriculture + v_agri)
      map.informal_labour = Math.max(0.5, map.informal_labour + v_inf)
      map.manufacturing = Math.max(0.5, map.manufacturing + v_mfg)
      map.services = Math.max(0.5, map.services + v_srv)
    }

    let sum = (map.agriculture || 0) + (map.informal_labour || 0) + (map.manufacturing || 0) + (map.services || 0)
    if (sum > 0) {
      map.agriculture = Math.round((map.agriculture/sum)*1000)/10
      map.informal_labour = Math.round((map.informal_labour/sum)*1000)/10
      map.manufacturing = Math.round((map.manufacturing/sum)*1000)/10
      map.services = Math.round((100 - (map.agriculture + map.informal_labour + map.manufacturing))*10)/10
    }
    return map
  }

  global_map = compute_single('global')
  for (let i = 0; i < countries.length; i++) {
    let name = countries[i].trim()
    if (name)
      by_country[name] = compute_single(name)
  }

  //Return statement
  return {
    byCountry: by_country,
    global: global_map,
  }
}

export default {
  computeSyntheticDemographicPyramid,
  computeSyntheticSectorBreakdown,
  getHistoricalPopulationThousands,
}
