import {
  getBuggedCitiesSet,
  getPrimaryCityNormKey,
  isCityInsideStateBBox,
  type CapitalRecord,
  type CityIndexEntry,
  type CityMetadataEntry,
  type CityRenderPoint,
  type CompactCitiesPayload,
  type HistoricalNameRecord,
  type StadesterQueryOptions,
} from './stadester_types.ts'
import {
  applyCityMetadata,
  applyStateCapitals,
  getStateById,
  getStateCapitals,
  isStateAcapital,
  loadCityMetadata,
  loadStateCapitals,
  matchMetadataToCity,
  resolveCityNameAtYear,
} from './stadester_metadata.ts'
import {
  ensureLiteCache,
  getDatasetFilePath,
  getNearbyCityKeys,
  getSpatialGrid,
  loadDataset,
} from './stadester_loader.ts'
import {
  _cache_authoritative_capitals_by_year,
  _cache_cities_at_year,
  _cache_compact_cities,
  getAuthoritativeCapitalsAtYear,
  getCitiesAtYear,
  getCompactCitiesAtYear,
  getLargestCitiesAtYear,
} from './stadester_queries.ts'
import { getCityByKey } from './stadester_search.ts'

export {
  getBuggedCitiesSet,
  getPrimaryCityNormKey,
  isCityInsideStateBBox,
  type CapitalRecord,
  type CityIndexEntry,
  type CityMetadataEntry,
  type CityRenderPoint,
  type CompactCitiesPayload,
  type HistoricalNameRecord,
  type StadesterQueryOptions,
}

export let StadesterService = {
  _cache_authoritative_capitals_by_year,
  _cache_cities_at_year,
  _cache_compact_cities,
  applyCityMetadata,
  applyStateCapitals,
  ensureLiteCache,
  getAuthoritativeCapitalsAtYear,
  getCitiesAtYear,
  getCityByKey,
  getCompactCitiesAtYear,
  getDatasetFilePath,
  getLargestCitiesAtYear,
  getNearbyCityKeys,
  getSpatialGrid,
  getStateById,
  getStateCapitals,
  isStateAcapital,
  loadCityMetadata,
  loadDataset,
  loadStateCapitals,
  matchMetadataToCity,
  resolveCityNameAtYear,
}
