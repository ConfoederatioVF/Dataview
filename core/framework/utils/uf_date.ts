/**
 * Confoederatio UF/Date standard utility library.
 *
 * Direct TypeScript port and adaptation of the SVEA /UF/Date API
 * (D:/Project 1509 - SVEA/UF/js/date/date_basic.js & date_conversion.js).
 * Implements historical calendar calculations, triennial leap years for BC,
 * continuous minute timestamp calculation, string date conversion, and non-Oxford British English date formatting.
 */

export interface UfDateObject {
  day: number
  hour?: number
  minute?: number
  month: number
  year: number
}

let conversion_cache: Map<number, UfDateObject> = new Map()

export let UfDate = {
  all_months: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],

  bc_leap_years: [
    -45, -42, -39, -36, -33, -30, -27, -24, -21, -18, -15, -12, -9,
  ], // (Ideler 1825); Triennial leap years

  months: {
    january: { days: 31, name: 'January' },
    february: { days: 28, leap_year_days: 29, name: 'February' },
    march: { days: 31, name: 'March' },
    april: { days: 30, name: 'April' },
    may: { days: 31, name: 'May' },
    june: { days: 30, name: 'June' },
    july: { days: 31, name: 'July' },
    august: { days: 31, name: 'August' },
    september: { days: 30, name: 'September' },
    october: { days: 31, name: 'October' },
    november: { days: 30, name: 'November' },
    december: { days: 31, name: 'December' },
  } as Record<string, { days: number; leap_year_days?: number; name: string }>,

  /**
   * Converts a given string to a UfDateObject if possible.
   * Matches SVEA Date.convertStringToDate (date_conversion.js).
   *
   * @param {string} arg0_date_string
   * @param {string} [arg1_delimiter='.']
   *
   * @returns {UfDateObject | undefined}
   */
  convertStringToDate: function (
    arg0_date_string: string,
    arg1_delimiter?: string
  ): UfDateObject | undefined {
    //Convert from parameters
    let date_string = arg0_date_string
    let delimiter = arg1_delimiter || '.'

    //Guard clauses
    if (typeof date_string !== 'string')
      return

    //Declare local instance variables
    let clean_string = date_string.trim()
    let date_array: string[]
    let date_obj = UfDate.getBlankDate()
    let date_properties: (keyof UfDateObject)[] = ['year', 'month', 'day', 'hour', 'minute']
    let dmy_match: RegExpMatchArray | null
    let iso_match: RegExpMatchArray | null
    let mdy_match: RegExpMatchArray | null
    let year_era_match: RegExpMatchArray | null

    //Function body
    //1. Natural language dates: e.g. "1 January 1463", "1st Jan 1463", "15 March 44 BC"
    dmy_match = clean_string.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(-?\d+)(?:\s*(AD|BC|BCE))?$/i)
    if (dmy_match) {
      let day = parseInt(dmy_match[1], 10)
      let month = UfDate.getMonth(dmy_match[2])
      let year = parseInt(dmy_match[3], 10)
      let era = dmy_match[4] ? dmy_match[4].toUpperCase() : undefined
      if ((era === 'BC' || era === 'BCE') && year > 0)
        year = -year

      date_obj.day = day
      date_obj.month = month
      date_obj.year = year

      //Return statement
      return date_obj
    }

    //2. Natural language dates: e.g. "January 1, 1463", "Jan 1 1463"
    mdy_match = clean_string.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(-?\d+)(?:\s*(AD|BC|BCE))?$/i)
    if (mdy_match) {
      let month = UfDate.getMonth(mdy_match[1])
      let day = parseInt(mdy_match[2], 10)
      let year = parseInt(mdy_match[3], 10)
      let era = mdy_match[4] ? mdy_match[4].toUpperCase() : undefined
      if ((era === 'BC' || era === 'BCE') && year > 0)
        year = -year

      date_obj.day = day
      date_obj.month = month
      date_obj.year = year

      //Return statement
      return date_obj
    }

    //3. ISO/hyphen or slash date: e.g. "1463-01-01" or "1463/01/01" or "-44-03-15"
    iso_match = clean_string.match(/^(-?\d+)[-/]([0-9]{1,2})[-/]([0-9]{1,2})$/)
    if (iso_match) {
      date_obj.year = parseInt(iso_match[1], 10)
      date_obj.month = parseInt(iso_match[2], 10)
      date_obj.day = parseInt(iso_match[3], 10)

      //Return statement
      return date_obj
    }

    //4. Year with optional era: e.g. "1463AD", "44BC", "44 BC", "1463 AD"
    year_era_match = clean_string.match(/^(-?\d+)\s*(AD|BC|BCE)$/i)
    if (year_era_match) {
      let year = parseInt(year_era_match[1], 10)
      let era = year_era_match[2].toUpperCase()
      if ((era === 'BC' || era === 'BCE') && year > 0)
        year = -year

      date_obj.year = year

      //Return statement
      return date_obj
    }

    //5. Delimited numeric date (e.g. "1463.1.1", "-44.3.15", "1463.1.1.0.0")
    if (clean_string.includes(delimiter)) {
      date_array = clean_string.split(delimiter)
      for (let i = 0; i < date_array.length; i++) {
        if (Number.isNaN(parseFloat(date_array[i])))
          return
      }

      for (let i = 0; i < date_array.length; i++) {
        if (date_properties[i])
          date_obj[date_properties[i]] = parseFloat(date_array[i])
      }

      //Return statement
      return date_obj
    }
  },


  /**
   * Converts a continuous Confoederatio minute timestamp to a UfDateObject.
   * Matches SVEA Date.convertTimestampToDate (date_conversion.js).
   *
   * @param {number|string} arg0_timestamp
   *
   * @returns {UfDateObject}
   */
  convertTimestampToDate: function (arg0_timestamp: number | string): UfDateObject {
    //Convert from parameters
    let raw_ts = arg0_timestamp

    //Guard clauses
    if (typeof raw_ts === 'object' && raw_ts !== null)
      return raw_ts as UfDateObject

    //Declare local instance variables
    let all_months: (keyof typeof UfDate.months)[]
    let date_obj = UfDate.getBlankDate()
    let minutes: number
    let minutes_per_400_years = 210379680 // 146097 days * 24 * 60
    let timestamp: number

    //Function body
    if (typeof raw_ts === 'string') {
      let trimmed = raw_ts.trim()
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        let parsed_date = UfDate.convertStringToDate(trimmed)
        if (parsed_date)
          return parsed_date
      }
      timestamp = parseFloat(trimmed)
    } else {
      timestamp = raw_ts
    }

    if (Number.isNaN(timestamp))
      return date_obj

    if (conversion_cache.has(timestamp)) {
      let cached_val = conversion_cache.get(timestamp)!
      return {
        day: cached_val.day,
        hour: cached_val.hour,
        minute: cached_val.minute,
        month: cached_val.month,
        year: cached_val.year,
      }
    }

    all_months = Object.keys(UfDate.months) as (keyof typeof UfDate.months)[]
    minutes = timestamp

    //Handle BCE (negative timestamps)
    if (minutes < 0) {
      while (true) {
        let prev_year = date_obj.year - 1
        let year_minutes = (UfDate.isLeapYear(prev_year) ? 366 : 365)*24*60

        if (-minutes <= year_minutes)
          break
        minutes += year_minutes
        date_obj.year--

        if (date_obj.year === -46) {
          let four_hundred_years = Math.floor((-minutes)/minutes_per_400_years)
          minutes += four_hundred_years*minutes_per_400_years
          date_obj.year -= four_hundred_years*400
        }
      }

      date_obj.year--

      let total_year_minutes = (UfDate.isLeapYear(date_obj.year) ? 366 : 365)*24*60
      minutes = total_year_minutes + minutes
    } else {
      //Handle CE (positive or zero timestamps)
      while (true) {
        let y_minutes = (UfDate.isLeapYear(date_obj.year) ? 366 : 365)*24*60
        if (minutes < y_minutes)
          break
        minutes -= y_minutes
        date_obj.year++

        if (date_obj.year === 46) {
          let four_hundred_years = Math.floor(minutes/minutes_per_400_years)
          minutes -= four_hundred_years*minutes_per_400_years
          date_obj.year += four_hundred_years*400
        }
      }
    }

    //Decompose remaining minutes into month/day/hour/minute
    for (let i = 0; i < all_months.length; i++) {
      let m = UfDate.months[all_months[i]]
      let dim = UfDate.isLeapYear(date_obj.year) ? (m.leap_year_days || m.days) : m.days
      let m_minutes = dim*24*60
      if (minutes < m_minutes) {
        date_obj.month = i + 1
        break
      }
      minutes -= m_minutes
    }

    date_obj.day = Math.floor(minutes/(24*60)) + 1
    minutes -= (date_obj.day - 1)*24*60

    date_obj.hour = Math.floor(minutes/60)
    date_obj.minute = minutes%60

    if (conversion_cache.size >= 50000)
      conversion_cache.clear()

    conversion_cache.set(timestamp, {
      day: date_obj.day,
      hour: date_obj.hour,
      minute: date_obj.minute,
      month: date_obj.month,
      year: date_obj.year,
    })

    //Return statement
    return date_obj
  },


  /**
   * Converts a timestamp string or representation to an integer.
   * Matches SVEA Date.convertTimestampToInt (date_conversion.js).
   *
   * @param {number|string} arg0_timestamp
   *
   * @returns {number}
   */
  convertTimestampToInt: function (arg0_timestamp: number | string): number {
    //Convert from parameters
    let timestamp = arg0_timestamp

    //Return statement
    return parseFloat(
      String(timestamp).replace(/^t_/, '').replace(/^tz_/, '')
    )
  },


  /**
   * Formats a UfDateObject into non-Oxford British English (e.g. 15 September 351AD).
   *
   * @param {UfDateObject} arg0_date
   *
   * @returns {string}
   */
  formatDate: function (arg0_date: UfDateObject): string {
    //Convert from parameters
    let date = arg0_date

    //Declare local instance variables
    let month_name = UfDate.all_months[Math.max(0, Math.min(11, date.month - 1))]
    let year_str = UfDate.formatYear(date.year)

    //Return statement
    return `${date.day} ${month_name} ${year_str}`
  },


  /**
   * Formats a fractional year into a full British English date string.
   *
   * @param {number} arg0_fractional_year
   *
   * @returns {string}
   */
  formatFractionalYear: function (arg0_fractional_year: number): string {
    //Convert from parameters
    let frac = arg0_fractional_year

    //Declare local instance variables
    let date_obj = UfDate.parseYears(frac)

    //Return statement
    return UfDate.formatDate(date_obj)
  },


  /**
   * Formats a year number into standard UF year notation (e.g. 10000BC, 351AD, 2025AD).
   *
   * @param {number} arg0_year
   *
   * @returns {string}
   */
  formatYear: function (arg0_year: number): string {
    //Convert from parameters
    let year = Math.floor(arg0_year)

    //Return statement
    if (year === 0)
      return '1AD'
    if (year < 0)
      return `${Math.abs(year)}BC`
    return `${year}AD`
  },


  /**
   * Converts a fractional year to UfDateObject.
   *
   * @param {number} arg0_fractional_year
   *
   * @returns {UfDateObject}
   */
  fromFractionalYear: function (arg0_fractional_year: number): UfDateObject {
    //Convert from parameters
    let frac = arg0_fractional_year

    //Return statement
    return UfDate.parseYears(frac)
  },


  /**
   * Returns a blank date template starting at '0AD'.
   * Matches SVEA Date.getBlankDate (date_basic.js).
   *
   * @returns {UfDateObject}
   */
  getBlankDate: function (): UfDateObject {
    //Return statement
    return { day: 1, hour: 0, minute: 0, month: 1, year: 0 }
  },


  /**
   * Returns the number of days in a given month of a given year.
   *
   * @param {number} arg0_year
   * @param {number} arg1_month - 1-indexed (1 to 12)
   *
   * @returns {number}
   */
  getDaysInMonth: function (arg0_year: number, arg1_month: number): number {
    //Convert from parameters
    let month = arg1_month
    let year = arg0_year

    //Declare local instance variables
    let month_keys = Object.keys(UfDate.months) as (keyof typeof UfDate.months)[]

    //Guard clauses
    if (month < 1 || month > 12)
      return 30

    //Return statement
    if (month === 2 && UfDate.isLeapYear(year))
      return 29
    return UfDate.months[month_keys[month - 1]].days
  },


  /**
   * Fetches the 1-based month index from its name or prefix.
   * Matches SVEA Date.getMonth (date_basic.js).
   *
   * @param {string} arg0_month_name
   *
   * @returns {number}
   */
  getMonth: function (arg0_month_name: string): number {
    //Convert from parameters
    let month_name = String(arg0_month_name || '').toLowerCase()

    //Declare local instance variables
    let all_months = Object.keys(UfDate.months)
    let month_found = all_months.indexOf(month_name) + 1

    //Function body
    if (!month_found) {
      for (let i = 0; i < all_months.length; i++) {
        if (all_months[i].includes(month_name)) {
          month_found = i + 1
          break
        }
      }
    }

    if (!month_found)
      month_found = 1

    //Return statement
    return month_found
  },


  /**
   * Returns a numeric timestamp from a specific Date object in minutes from 1 January, 00:00 on 0AD.
   * Matches SVEA Date.getTimestamp (date_basic.js).
   *
   * @param {UfDateObject | number | string} [arg0_date_object]
   *
   * @returns {number}
   */
  getTimestamp: function (arg0_date_object?: UfDateObject | number | string): number {
    //Convert from parameters
    let raw_date = arg0_date_object !== undefined ? arg0_date_object : UfDate.getBlankDate()

    //Guard clauses
    if (typeof raw_date === 'number' && !Number.isNaN(raw_date))
      return raw_date

    //Declare local instance variables
    let all_months = Object.keys(UfDate.months) as (keyof typeof UfDate.months)[]
    let date_obj: UfDateObject
    let minutes = 0

    //Function body
    if (typeof raw_date === 'string') {
      let trimmed = raw_date.trim()
      if (/^-?\d+(\.\d+)?$/.test(trimmed))
        return parseFloat(trimmed)

      let parsed_date = UfDate.convertStringToDate(trimmed)
      if (parsed_date) {
        date_obj = { ...UfDate.getBlankDate(), ...parsed_date }
      } else if (!Number.isNaN(parseFloat(trimmed))) {
        return parseFloat(trimmed)
      } else {
        date_obj = UfDate.getBlankDate()
      }
    } else if (typeof raw_date === 'object' && raw_date !== null) {
      date_obj = { ...UfDate.getBlankDate(), ...raw_date }
    } else {
      date_obj = UfDate.getBlankDate()
    }

    if (date_obj.minute && date_obj.minute >= 60) {
      date_obj.hour = (date_obj.hour || 0) + Math.floor(date_obj.minute/60)
      date_obj.minute %= 60
    }
    if (date_obj.hour && date_obj.hour >= 24) {
      date_obj.day += Math.floor(date_obj.hour/24)
      date_obj.hour %= 24
    }

    while (date_obj.month > 12) {
      date_obj.month -= 12
      date_obj.year++
    }
    while (date_obj.month < 1) {
      date_obj.month += 12
      date_obj.year--
    }

    if (Math.abs(date_obj.year) > 50000)
      return date_obj.year

    //1. Add full years before the current one.
    //   Epoch = start of year 0, so we sum years [0 .. year-1] or subtract [-1 .. year]
    if (date_obj.year > 0) {
      for (let i = 0; i < date_obj.year; i++)
        minutes += (UfDate.isLeapYear(i) ? 366 : 365)*24*60
    } else if (date_obj.year < 0) {
      for (let i = -1; i >= date_obj.year; i--)
        minutes -= (UfDate.isLeapYear(i) ? 366 : 365)*24*60
    }

    //2. Add completed months of current year
    for (let i = 1; i < date_obj.month; i++) {
      let local_month = UfDate.months[all_months[i - 1]]
      let dim = UfDate.isLeapYear(date_obj.year) ? (local_month.leap_year_days || local_month.days) : local_month.days
      minutes += dim*24*60
    }

    //3. Add completed days
    minutes += (date_obj.day - 1)*24*60

    //4. Add partial day
    minutes += (date_obj.hour || 0)*60 + (date_obj.minute || 0)

    //Return statement
    return minutes
  },


  /**
   * Checks whether a given year is a leap year according to Confoederatio UF/Date spec.
   *
   * @param {number} arg0_year
   *
   * @returns {boolean}
   */
  isLeapYear: function (arg0_year: number): boolean {
    //Convert from parameters
    let year = Math.floor(arg0_year)

    //Guard clauses
    if (UfDate.bc_leap_years.indexOf(year) !== -1)
      return true

    //Return statement
    return (year%4 === 0 && year%100 !== 0) || (year%400 === 0 && year !== 4)
  },


  /**
   * Parses a floating point number of years into a specific UfDateObject.
   * Matches SVEA Date.parseYears (date_basic.js).
   *
   * @param {number} arg0_years
   *
   * @returns {UfDateObject}
   */
  parseYears: function (arg0_years: number): UfDateObject {
    //Convert from parameters
    let years = parseFloat(arg0_years as unknown as string)

    //Declare local instance variables
    let all_months = Object.keys(UfDate.months) as (keyof typeof UfDate.months)[]
    let date_obj = UfDate.getBlankDate()
    let days: number
    let days_passed: number
    let remainder: number
    let total_days: number

    //Function body
    //1. Parse whole years
    date_obj.year = Math.floor(years)
    if (date_obj.year === 0)
      date_obj.year = 1
    remainder = years - date_obj.year
    total_days = UfDate.isLeapYear(date_obj.year) ? 366 : 365

    //2. Convert remaining fractional years into days with floating-point epsilon
    days = remainder*total_days + 1e-7
    days_passed = Math.floor(days)

    //3. Parse months (1-based)
    date_obj.month = 1

    for (let i = 0; i < all_months.length; i++) {
      let local_month = UfDate.months[all_months[i]]
      let days_in_month = local_month.days

      if (UfDate.isLeapYear(date_obj.year) && local_month.leap_year_days)
        days_in_month = local_month.leap_year_days

      if (days_passed >= days_in_month) {
        days_passed -= days_in_month
        date_obj.month++

        if (date_obj.month > 12) {
          date_obj.month = 1
          date_obj.year++
        }
      } else {
        break
      }
    }

    //Set 1-based day
    date_obj.day = Math.max(1, days_passed + 1)

    //4. Convert remaining day fraction into hours and minutes
    let remaining_day_fraction = Math.max(0, days - Math.floor(days))
    date_obj.hour = Math.floor(remaining_day_fraction*24)
    date_obj.minute = Math.floor((remaining_day_fraction*24 - date_obj.hour)*60)

    //Return statement
    return date_obj
  },


  /**
   * Maps a normalised timeline position (0.0 to 1.0) back to a historical year
   * across the logarithmic milestone distribution.
   *
   * @param {number} arg0_pos
   *
   * @returns {number}
   */
  timelinePositionToYear: function (arg0_pos: number): number {
    //Convert from parameters
    let pos = Math.max(0, Math.min(1, arg0_pos))

    //Declare local instance variables
    let ms = TIMELINE_MILESTONES

    //Guard clauses
    if (pos <= 0)
      return ms[0].year
    if (pos >= 1)
      return ms[ms.length - 1].year

    //Function body
    for (let i = 0; i < ms.length - 1; i++) {
      let m_curr = ms[i]
      let m_next = ms[i + 1]
      if (pos >= m_curr.pos && pos <= m_next.pos) {
        let pos_span = m_next.pos - m_curr.pos
        let t = pos_span > 0 ? (pos - m_curr.pos)/pos_span : 0
        let calc_year = m_curr.year + t*(m_next.year - m_curr.year)

        //Return statement
        if (Math.abs(calc_year) < 0.001)
          return 1
        return calc_year
      }
    }

    //Return statement
    return ms[ms.length - 1].year
  },


  /**
   * Converts a UfDateObject into a continuous fractional year.
   * Direct reversible inverse of UfDate.fromFractionalYear / UfDate.parseYears.
   *
   * @param {UfDateObject} arg0_date
   *
   * @returns {number}
   */
  toFractionalYear: function (arg0_date: UfDateObject): number {
    //Convert from parameters
    let date = arg0_date

    //Declare local instance variables
    let all_months = Object.keys(UfDate.months) as (keyof typeof UfDate.months)[]
    let day = Math.max(1, date.day || 1)
    let hour = date.hour || 0
    let minute = date.minute || 0
    let month = Math.max(1, Math.min(12, date.month || 1))
    let passed_days = 0
    let total_days = UfDate.isLeapYear(date.year) ? 366 : 365
    let year = date.year === 0 ? 1 : date.year

    //Function body
    for (let i = 1; i < month; i++) {
      let local_month = UfDate.months[all_months[i - 1]]
      let dim = UfDate.isLeapYear(year) ? (local_month.leap_year_days || local_month.days) : local_month.days
      passed_days += dim
    }

    passed_days += (day - 1)
    passed_days += hour/24 + minute/(24*60)

    //Return statement
    return year + passed_days/total_days
  },


  /**
   * Maps a historical year to a normalised timeline position (0.0 to 1.0)
   * across the logarithmic milestone distribution.
   *
   * @param {number} arg0_year
   *
   * @returns {number}
   */
  yearToTimelinePosition: function (arg0_year: number): number {
    //Convert from parameters
    let year = arg0_year === 0 ? 1 : arg0_year

    //Declare local instance variables
    let ms = TIMELINE_MILESTONES

    //Guard clauses
    if (year <= ms[0].year)
      return 0
    if (year >= ms[ms.length - 1].year)
      return 1

    //Function body
    for (let i = 0; i < ms.length - 1; i++) {
      let m_curr = ms[i]
      let m_next = ms[i + 1]
      if (year >= m_curr.year && year <= m_next.year) {
        let span = m_next.year - m_curr.year
        let t = span > 0 ? (year - m_curr.year)/span : 0

        //Return statement
        return m_curr.pos + t*(m_next.pos - m_curr.pos)
      }
    }

    //Return statement
    return 1
  },
}

export interface TimelineMilestone {
  label: string
  pos: number // 0.0 to 1.0
  year: number
}

export let TIMELINE_MILESTONES: TimelineMilestone[] = [
  { label: '10000BC', pos: 0/7, year: -10000 },
  { label: '1000BC', pos: 1/7, year: -1000 },
  { label: '1AD', pos: 2/7, year: 1 },
  { label: '1000AD', pos: 3/7, year: 1000 },
  { label: '1800AD', pos: 4/7, year: 1800 },
  { label: '1900AD', pos: 5/7, year: 1900 },
  { label: '1950AD', pos: 6/7, year: 1950 },
  { label: '2025AD', pos: 7/7, year: 2025 },
]
