import React, { useState, useMemo } from 'react';
import { CountryFeature, CountryStats } from '@framework/geopng/polygon_binning.ts';
import { Icon } from '@ui/components/icon';
import { formatLocalisedString, useLocalisation } from '@localisation';

export interface CountryModeSettingsProps {
  allCountries: CountryFeature[];
  countriesMode: boolean;
  countryStats?: CountryStats | null;
  isCalculatingStats?: boolean;
  onClearCountries: () => void;
  onToggleCountriesMode?: (enabled: boolean) => void;
  onToggleCountry: (country: CountryFeature) => void;
  selectedCountries: CountryFeature[];
}

/**
 * Settings configuration subpanel for country polygon analysis mode.
 *
 * @param {CountryModeSettingsProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export function CountryModeSettings (arg0_props: CountryModeSettingsProps) {
  //Convert from parameters
  let props = arg0_props;
  let {
    allCountries: all_countries,
    countriesMode: countries_mode,
    countryStats: country_stats,
    isCalculatingStats: is_calculating_stats,
    onClearCountries: on_clear_countries,
    onToggleCountriesMode: on_toggle_countries_mode,
    onToggleCountry: on_toggle_country,
    selectedCountries: selected_countries,
  } = props;

  //Declare local instance variables
  let country_search: string;
  let filtered_countries: CountryFeature[];
  let get_country_code: (arg0_country: CountryFeature) => string;
  let selected_country_code_set: Set<string>;
  let set_country_search: React.Dispatch<React.SetStateAction<string>>;
  let { t } = useLocalisation();

  //Function body
  ;[country_search, set_country_search] = useState('');

  get_country_code = function (arg0_country: CountryFeature) {
    let country = arg0_country;
    let iso = country.properties?.iso_a3;
    if (iso && iso !== '-99')
      return iso;
    if (country.properties?.adm0_a3)
      return country.properties.adm0_a3;
    if (country.properties?.gwcode !== undefined && country.properties?.gwcode !== null)
      return String(country.properties.gwcode);
    if (country.id !== undefined && country.id !== null)
      return String(country.id);
    if (country.properties?.id !== undefined && country.properties?.id !== null)
      return String(country.properties.id);
    return country.properties?.name || '';
  };

  filtered_countries = useMemo(() => {
    let q = country_search.toLowerCase().trim();
    if (!q)
      return all_countries;
    return all_countries.filter((arg0_country) => {
      let code = get_country_code(arg0_country).toLowerCase();
      let gwcode_str = (arg0_country.properties?.gwcode !== undefined && arg0_country.properties?.gwcode !== null) ? String(arg0_country.properties.gwcode) : '';
      let name = (arg0_country.properties?.name || '').toLowerCase();
      return name.includes(q) || code.includes(q) || (gwcode_str && gwcode_str.includes(q));
    });
  }, [all_countries, country_search]);

  selected_country_code_set = useMemo(() => {
    let code_set = new Set<string>();
    for (let i = 0; i < selected_countries.length; i++) {
      let c = selected_countries[i];
      let primary_code = get_country_code(c);
      if (primary_code)
        code_set.add(primary_code);
      if (c.id !== undefined && c.id !== null)
        code_set.add(String(c.id));
      if (c.properties?.id !== undefined && c.properties?.id !== null)
        code_set.add(String(c.properties.id));
      if (c.properties?.gwcode !== undefined && c.properties?.gwcode !== null)
        code_set.add(`gw_${c.properties.gwcode}`);
      if (c.properties?.iso_a3 && c.properties.iso_a3 !== '-99')
        code_set.add(c.properties.iso_a3);
      if (c.properties?.name)
        code_set.add(`name_${c.properties.name.toLowerCase()}`);
    }
    return code_set;
  }, [selected_countries]);

  //Return statement
  return (
    <div className="w-full space-y-1.5 animate-in fade-in-0 duration-100">
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <span className="text-[var(--body-font-size)] font-bold text-foreground flex items-center gap-1.5">
          <Icon name="flag" />
          <span>{t.mapmodes.country.title}</span>
        </span>
        {selected_countries.length > 0 && (
          <div className="flex items-center gap-2">
            {is_calculating_stats && (
              <span className="text-[10px] text-amber-400 font-medium animate-pulse">
                {t.mapmodes.country.calculating}
              </span>
            )}
            <button
              type="button"
              onClick={on_clear_countries}
              className="text-[var(--body-font-size)] text-destructive hover:underline cursor-pointer"
            >
              {formatLocalisedString(t.mapmodes.country.clearAll, selected_countries.length)}
            </button>
          </div>
        )}
      </div>

      {/* Bitmap Isolation Mode Toggle */}
      <div className="flex items-center justify-between p-[var(--cell-padding)] bg-background border border-border">
        <div className="flex flex-col">
          <span className="font-bold text-foreground text-[var(--body-font-size)]">
            {t.mapmodes.country.isolationMode}
          </span>
          <span className="text-[var(--body-font-size)] text-muted-foreground font-light">
            {t.mapmodes.country.isolationDesc}
          </span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={countries_mode}
            onChange={(arg0_e) => {
              if (on_toggle_countries_mode)
                on_toggle_countries_mode(arg0_e.target.checked);
            }}
            className="w-[var(--body-font-size)] h-[var(--body-font-size)] rounded-none accent-emerald-500 cursor-pointer"
          />
          <span
            className={`text-[var(--body-font-size)] font-bold uppercase ${
              countries_mode ? 'text-emerald-400' : 'text-muted-foreground'
            }`}
          >
            {countries_mode ? t.mapmodes.on : t.mapmodes.off}
          </span>
        </label>
      </div>

      {/* Country Search */}
      <div className="relative">
        <input
          type="text"
          placeholder={t.mapmodes.country.searchPlaceholder}
          value={country_search}
          onChange={(arg0_e) => set_country_search(arg0_e.target.value)}
          className="w-full h-7 px-2 text-[var(--body-font-size)] bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        {country_search && (
          <button
            type="button"
            onClick={() => set_country_search('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[var(--body-font-size)] cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Checklist */}
      <div className="h-32 overflow-y-auto border border-border bg-background/50 divide-y divide-border/40 text-[var(--body-font-size)]">
        {filtered_countries.length === 0 ? (
          <div className="p-2 text-center text-muted-foreground text-[var(--body-font-size)]">
            {t.mapmodes.country.noCountriesFound}
          </div>
        ) : (
          filtered_countries.map((arg0_c) => {
            let c = arg0_c;
            let code = get_country_code(c);
            let is_checked = selected_country_code_set.has(code) ||
              (c.id !== undefined && c.id !== null && selected_country_code_set.has(String(c.id))) ||
              (c.properties?.id !== undefined && c.properties?.id !== null && selected_country_code_set.has(String(c.properties.id))) ||
              (c.properties?.gwcode !== undefined && c.properties?.gwcode !== null && selected_country_code_set.has(`gw_${c.properties.gwcode}`)) ||
              Boolean(c.properties?.name && selected_country_code_set.has(`name_${c.properties.name.toLowerCase()}`));
            let item_key = (c.id !== undefined && c.id !== null) ? String(c.id) : (code || c.properties?.name || '');

            return (
              <label
                key={item_key}
                className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={is_checked}
                  onChange={() => on_toggle_country(c)}
                  className="w-[var(--body-font-size)] h-[var(--body-font-size)] rounded-none accent-emerald-500 cursor-pointer shrink-0"
                />
                <span className="truncate flex-1 text-foreground">
                  {c.properties?.name || code}
                </span>
                {c.properties?.iso_a3 && c.properties.iso_a3 !== '-99' ? (
                  <span className="text-[var(--body-font-size)] text-muted-foreground">
                    {c.properties.iso_a3}
                  </span>
                ) : (c.properties?.gwcode !== undefined && c.properties?.gwcode !== null) ? (
                  <span className="text-[var(--body-font-size)] text-muted-foreground">
                    #{c.properties.gwcode}
                  </span>
                ) : null}
              </label>
            );
          })
        )}
      </div>

      {/* Selected Country Pills */}
      {selected_countries.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pt-1">
          {selected_countries.map((arg0_c, arg1_i) => {
            let c = arg0_c;
            let pill_key = (c.id !== undefined && c.id !== null) ? String(c.id) : (get_country_code(c) || c.properties?.name || String(arg1_i));
            return (
              <span
                key={pill_key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[var(--body-font-size)] bg-primary/20 text-primary border border-primary/40 rounded-none font-medium"
              >
                <span className="truncate max-w-[90px]">{c.properties?.name || pill_key}</span>
                <button
                  type="button"
                  onClick={() => on_toggle_country(c)}
                  className="hover:text-foreground opacity-70 hover:opacity-100 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Country Stats Summary */}
      {country_stats && country_stats.validCount > 0 && (
        <div className="p-[var(--cell-padding)] bg-background border border-border text-[var(--body-font-size)] space-y-1">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="truncate font-bold">{country_stats.name}:</span>
            <span className="text-foreground font-semibold">
              {country_stats.validCount.toLocaleString()} cells
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Range:</span>
            <span className="text-foreground font-light">
              {country_stats.min.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} → {country_stats.max.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Mean:</span>
            <span className="text-foreground font-light">
              {country_stats.mean.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Total:</span>
            <span className="text-foreground font-bold">
              {(country_stats.total !== undefined ? country_stats.total : country_stats.mean*country_stats.validCount).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CountryModeSettings;
