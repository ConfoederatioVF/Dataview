/**
 * Confoederatio UF/Date standard utility library.
 *
 * Direct TypeScript port and adaptation of the SVEA /UF/Date API
 * (D:/Project 1509 - SVEA/UF/js/date/date_basic.js & date_conversion.js).
 * Implements historical calendar calculations, triennial leap years for BC,
 * continuous minute timestamp calculation, and non-Oxford British English date formatting.
 */

export interface UfDateObject {
  day: number
  hour?: number
  minute?: number
  month: number
  year: number
}

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
   * Returns a blank date template starting at '0AD'.
   *
   * @returns {UfDateObject}
   */
  getBlankDate: function (): UfDateObject {
    //Return statement
    return { day: 1, hour: 0, minute: 0, month: 1, year: 0 }
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
    let year = date.year

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
   * Returns a numeric timestamp from a specific Date object in minutes from 1 January, 00:00 on 1AD.
   * Matches SVEA Date.getTimestamp (date_basic.js).
   *
   * @param {UfDateObject} arg0_date_object
   *
   * @returns {number}
   */
  getTimestamp: function (arg0_date_object: UfDateObject): number {
    //Convert from parameters
    let date = arg0_date_object || UfDate.getBlankDate()

    //Declare local instance variables
    let all_months = Object.keys(UfDate.months) as (keyof typeof UfDate.months)[]
    let date_obj = { ...UfDate.getBlankDate(), ...date }
    let minutes = 0

    //Function body
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

    if (date_obj.year > 0) {
      for (let i = 0; i < date_obj.year; i++)
        minutes += (UfDate.isLeapYear(i) ? 366 : 365)*24*60
    } else if (date_obj.year < 0) {
      for (let i = -1; i >= date_obj.year; i--)
        minutes -= (UfDate.isLeapYear(i) ? 366 : 365)*24*60
    }

    for (let i = 1; i < date_obj.month; i++) {
      let local_month = UfDate.months[all_months[i - 1]]
      let dim = UfDate.isLeapYear(date_obj.year) ? (local_month.leap_year_days || local_month.days) : local_month.days
      minutes += dim*24*60
    }

    minutes += (date_obj.day - 1)*24*60
    minutes += (date_obj.hour || 0)*60 + (date_obj.minute || 0)

    //Return statement
    return minutes
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

    //Declare local instance variables
    let all_months: (keyof typeof UfDate.months)[]
    let date_obj = UfDate.getBlankDate()
    let minutes: number
    let minutes_per_400_years = 210379680 // 146097 days * 24 * 60
    let timestamp = typeof raw_ts === 'number' ? raw_ts : parseFloat(raw_ts)

    //Guard clauses
    if (Number.isNaN(timestamp))
      return date_obj

    //Function body
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

    //Return statement
    return date_obj
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
    if (year < 0)
      return `${Math.abs(year)}BC`
    return `${year}AD`
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
   * Maps a historical year to a normalised timeline position (0.0 to 1.0)
   * across the logarithmic milestone distribution.
   *
   * @param {number} arg0_year
   *
   * @returns {number}
   */
  yearToTimelinePosition: function (arg0_year: number): number {
    //Convert from parameters
    let year = arg0_year

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

        //Return statement
        return m_curr.year + t*(m_next.year - m_curr.year)
      }
    }

    //Return statement
    return ms[ms.length - 1].year
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

