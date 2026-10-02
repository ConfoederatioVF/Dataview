import JSON5 from 'json5'
import rawEnGb from './en_gb.json5?raw'
import rawFr from './fr.json5?raw'
import rawDe from './de.json5?raw'

export type SupportedLocale = 'en-GB' | 'fr' | 'de'

export interface LocalisationConfig {
  app: {
    badge: string
    subtitle: string
    title: string
  }
  settings: {
    basemapLayer: string
    basemaps?: {
      dark: string
      light: string
      none: string
      satellite: string
      topo: string
    }
    close: string
    colourbarPosition: string
    disabled: string
    enabled: string
    graticules?: string
    graticulesDesc?: string
    language: string
    performantDesc: string
    performantMode: string
    positions: {
      bottomCenter: string
      bottomLeft: string
      bottomRight: string
      topCenter: string
      topLeft: string
      topRight: string
    }
    projectionMode: string
    projections: {
      equalEarth: string
      equirectangular: string
      globe: string
      mercator: string
    }
    title: string
    tooltips?: string
    tooltipsDesc?: string
  }
  sidebar: {
    binning: {
      downsampleGrid: string
      downsampleMethod: string
      height: string
      methodAverage: string
      methodMaximum: string
      methodMinimum: string
      methodNear: string
      off: string
      on: string
      presets: string
      width: string
    }
    folders: {
      binning: string
      customVector: string
      dataLayers: string
      description: string
      manualUpload: string
      visualisation: string
    }
    layers: {
      active: string
      all: string
      allCategories: string
      layerConfig: string
      loadingLayers: string
      noLayersFound: string
      overlayOff: string
      overlayOn: string
      reset: string
      resetAll: string
      restricted: string
      searchPlaceholder: string
      selectAll: string
      subIndicators: string
      variableSelectors: string
    }
    toolbar: {
      collapseSidebar: string
      expandSidebar: string
      info: string
      infoTooltip: string
      roles: {
        default: string
        developer: string
        lockedTooltip: string
        privileged: string
      }
      video: string
      videoTooltip: string
    }
    upload: {
      chooseImageA: string
      chooseImageB: string
      difference: string
      encodingFormat: string
      firstImage: string
      firstPlaceholder: string
      mode: string
      rasterTab?: string
      secondImage: string
      secondPlaceholder: string
      selectSingle: string
      single: string
      singlePlaceholder: string
      vectorTab?: string
    }
    vectorUpload: {
      description: string
      entitiesCount: string
      placeholder: string
      removeVector: string
      selectFile: string
      showLayer: string
      staticGeoJson: string
      temporalDynamicNote: string
      temporalNaissance: string
      title: string
    }
    visualisation: {
      absoluteBreaks: string
      absoluteBreaksDesc: string
      auto: string
      colorPalette: string
      invert: string
      legendSubtitle: string
      legendTitle: string
      linear: string
      logSigma: string
      manualMinMax: string
      manualRange: string
      max: string
      min: string
      opacity: string
      optional: string
      percentileBreaks: string
      pseudoLog: string
      resetDefaults: string
      scaleTransformation: string
      searchPalettes: string
      subtitlePlaceholder: string
      supportsEnter: string
    }
  }
  datePicker: {
    add10Years: string
    add100Years: string
    bookmarks: string
    close: string
    day: string
    daysInMonth: string
    jump: string
    jumpTo: string
    landmarks: string
    month: string
    monthsShort: string[]
    subtract10Years: string
    subtract100Years: string
    title: string
    yearAndEra: string
    yearPlaceholder: string
  }
  hud: {
    cancel: string
    cancelDraw: string
    clearDrawnPolygon: string
    clickToSetBreak: string
    coordinate: string
    deleteLastPoint: string
    drawClosingPrompt: string
    drawPointsPrompt: string
    drawPolygon: string
    drawStartPrompt: string
    enterAbsoluteBreak: string
    finishDraw: string
    graticule: string
    hideTooltips: string
    hideUi: string
    inspect: string
    resetView: string
    resizeColourbar: string
    settings: string
    showTooltips: string
    showUi: string
    tooltips: string
    undo: string
    value: string
  }
  infoPanel: {
    activeCount: string
    activeRenderingModes: string
    navigationShortcuts: string
    noActiveMapmodes: string
    projection: string
    tilt: string
  }
  mapmodes: {
    activeCount: string
    all: string
    analyticalTools: string
    borders: {
      appearance: string
      colourPicker: string
      colours: {
        black: string
        cyan: string
        green: string
        mauve: string
        orange: string
        red: string
        white: string
        yellow: string
      }
      fillOpacity: string
      strokeColour: string
      strokeWidth: string
    }
    circles: {
      areaScale: string
      outlineStroke: string
      percentileCutoff: string
      title: string
    }
    collapse: string
    continuous: string
    country: {
      allCountries: string
      calculating: string
      clearAll: string
      isolationDesc: string
      isolationMode: string
      noCountriesFound: string
      searchPlaceholder: string
      selectedCount: string
      title: string
    }
    discrete: string
    expand: string
    haloDescription: string
    haloThicknessLabel: string
    haloThicknessUnit: string
    layerCount: string
    layersCount: string
    loadingRaster: string
    noResults: string
    off: string
    on: string
    overlayOff: string
    overlayOn: string
    reset: string
    searchPlaceholder: string
    selectLayer: string
    spikes: {
      blend: string
      degradedPerformance: string
      granularity: string
      halfBlend: string
      heightScale: string
      interpolated: string
      linearScale: string
      percentileBased: string
      performanceDesc: string
      performanceWarning: string
      pureLinear: string
      purePercentile: string
      resolutionCoarse: string
      resolutionFine: string
      resolutionMax: string
      resolutionMedium: string
      resolutionStandard: string
      resolutionVeryFine: string
      scalingMode: string
      title: string
    }
    stadester: {
      bubbleSize: string
      capitalConstantColor: string
      capitalContrast: string
      capitalMarkers: string
      capitalUnderlines: string
      circleStyle: string
      cityLabels: string
      colorMode: string
      constant: string
      datasetVersion: string
      fill: string
      growth: string
      growthPalette: string
      halo: string
      labelCollision: string
      maxCities: string
      minPop: string
      outline: string
      renderedCount: string
      selectDataset: string
      stadester10: string
      stadester11: string
      stateCapital: string
      title: string
    }
    title: string
    varsCount: string
  }
  timeline: {
    ad: string
    bc: string
    closeTimeline: string
    collapseScrubber: string
    currentYear?: string
    expandScrubber: string
    jumpToMilestone: string
    loadingRaster: string
    loop: string
    loopDescription: string
    pause: string
    play: string
    rasterReady: string
    selectExactDate: string
    settings: string
    snap: string
    snapDescription: string
    speed: string
    stepBackward: string
    stepForward: string
    year: string
  }
  analytics: {
    activeLabel: string
    agglomerationIncludes: string
    area: string
    breakdown: string
    categorySplitSelected: string
    clearFilter: string
    clickToInspectCity: string
    customSteepnessTooltip: string
    decreaseSteepness: string
    density: string
    dependencyRatio: string
    distributionCountry: string
    exact: string
    femaleCohorts: string
    filter: string
    frequencyCells: string
    global: string
    globalCategorySplit: string
    globalDistribution: string
    histogram: string
    increaseSteepness: string
    inhabitants: string
    jumpToKeyframe: string
    keyframes: string
    keyframesCount: string
    largestCities: string
    largestCitiesTitle: string
    leadingRegion: string
    linear: string
    logarithmic: string
    maleCohorts: string
    maxValue: string
    mean: string
    median: string
    minValue: string
    mostRepresented: string
    noRasterDesc: string
    noRasterLoaded: string
    noSettlementsRecorded: string
    oldAgeDependencyRatio: string
    oldAgeDependencyTooltip: string
    polygonCells: string
    population: string
    processingWorker: string
    pyramid: string
    pyramidTitle: string
    rankingUrbanSettlements: string
    refiningCalculations: string
    refresh: string
    resolution: string
    scope: string
    sexRatio: string
    stdDev: string
    steepness: string
    steepnessLabel: string
    summary: string
    syntheticProxy: string
    title: string
    top1City: string
    topN: string
    topNTotal: string
    totalCells: string
    totalLabel: string
    totalSum: string
    usePlaceholder: string
    validCells: string
    valueRange: string
    viewPyramid: string
  }
  mobile: {
    analytics: string
    map: string
    settings: string
    sidebar: string
    timeline: string
  }
  videoExport: {
    activeIndicators: string
    advanced: string
    allCohorts: string
    clearSelection: string
    close: string
    concurrency: string
    cyclingDesc: string
    developerBadge: string
    developerTitle: string
    executionSequence: string
    export: string
    exportMode: string
    exportModes: {
      cycling: string
      sequential: string
      stationary: string
    }
    exportSubtitle: string
    exporting: string
    format: string
    framing: string
    reorderHelp: string
    selectAll: string
    selectCohort: string
    sequentialDesc: string
    startExport: string
    targetDestination: string
    timeRange: string
    title: string
  }
  mapPanels: {
    cityDetails: {
      alsoRecordedAs: string
      area: string
      areaKm2: string
      back: string
      capitalBadge: string
      capitalOf: string
      closeCityDetails: string
      currentYear: string
      density: string
      densityPeopleKm2: string
      estimated: string
      historicalNames: string
      historicalPeak: string
      historicalPeakIn: string
      historicalTrajectory: string
      noHistoricalRecords: string
      peoplePerKm2: string
      population: string
      settlement: string
      urbanSettlement: string
      year: string
    }
    historicalBorders: {
      activeAt: string
      alsoRecordedAs: string
      analyticsDrawer: string
      areaKm2: string
      back: string
      boundaryUpdated: string
      calculateArea: string
      calculated: string
      calculatingArea: string
      capital: string
      cells: string
      closeHistoricalDetails: string
      computing: string
      computingStats: string
      estimated: string
      fullCalculator: string
      historicalEntity: string
      historicalRecords: string
      historicalTrajectory: string
      jump: string
      jumpTimelineTo: string
      keyframes: string
      mean: string
      median: string
      minMax: string
      noData: string
      noKeyframeEvents: string
      noRasterData: string
      rasterSum: string
      statisticsAt: string
      stdDev: string
      sum: string
      territorial: string
      unrecorded: string
      validCells: string
    }
    clickInfo: {
      agriculture: string
      cohort: string
      country: string
      historicalEntity: string
      latLng: string
      perYear: string
      pop: string
      sector: string
      value: string
    }
    stadesterLegend: {
      annualCompoundGrowth: string
      citiesCount: string
      displaying: string
      fill: string
      labelsActive: string
      logarithmicScale: string
      loss: string
      megacity: string
      metricGrowth: string
      metricPopulation: string
      metricRegion: string
      noLabels: string
      outline: string
      radiusPropPop: string
      regionalCategoricalPalette: string
      regionalDistribution: string
      settlements: string
      small: string
      stable: string
      surge: string
      urbanPopulationTotals: string
    }
  }
}

export let LOCALISATION_DICTIONARIES: Record<SupportedLocale, LocalisationConfig> = {
  'de': JSON5.parse(rawDe),
  'en-GB': JSON5.parse(rawEnGb),
  'fr': JSON5.parse(rawFr),
}

export let LOCALISATION_CONFIG: LocalisationConfig = LOCALISATION_DICTIONARIES['en-GB']

/**
 * Updates a localisation dictionary in-place for live hot reloading.
 *
 * @param {SupportedLocale} arg0_locale
 * @param {LocalisationConfig} arg1_dict
 */
export function updateLocalisationDictionary (
  arg0_locale: SupportedLocale,
  arg1_dict: LocalisationConfig
): void {
  //Convert from parameters
  let dict = arg1_dict
  let locale = arg0_locale

  //Guard clauses
  if (!locale || !dict)
    return

  //Function body
  LOCALISATION_DICTIONARIES[locale] = dict
  if (locale === 'en-GB')
    LOCALISATION_CONFIG = dict
}

/**
 * Formats a localized template string by replacing £1£, £2£ or £var_name£ delimiters.
 *
 * @param {string} arg0_template
 * @param {Record<string, string | number> | Array<string | number> | string | number} [arg1_params]
 * @param {Array<string | number>} [arg2_rest]
 *
 * @returns {string}
 */
export function formatLocalisedString (
  arg0_template: string,
  arg1_params?: Record<string, string | number> | Array<string | number> | string | number,
  ...arg2_rest: Array<string | number>
): string {
  //Convert from parameters
  let params = arg1_params
  let rest = arg2_rest
  let template = arg0_template

  //Declare local instance variables
  let result = template

  //Guard clauses
  if (!template)
    return ''
  if (params === undefined || params === null)
    return template

  //Function body
  if (Array.isArray(params)) {
    for (let i = 0; i < params.length; i++) {
      let placeholder = `£${i + 1}£`
      let val = String(params[i])
      result = result.split(placeholder).join(val)
    }
  } else if (typeof params === 'object') {
    let all_keys = Object.keys(params)
    for (let i = 0; i < all_keys.length; i++) {
      let key = all_keys[i]
      let placeholder = `£${key}£`
      let val = String((params as any)[key])
      result = result.split(placeholder).join(val)
    }
  } else {
    let all_values = [params, ...rest]
    for (let i = 0; i < all_values.length; i++) {
      let placeholder = `£${i + 1}£`
      let val = String(all_values[i])
      result = result.split(placeholder).join(val)
    }
  }

  //Return statement
  return result
}
