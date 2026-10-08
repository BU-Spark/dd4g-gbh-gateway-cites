import CityProfile from './CityProfile'
import PerCapitaComparison from './PerCapitaComparison'
import CountryOrigins from './CountryOrigins'
import TrendsView from './TrendsView'

const SOURCE_LINE = 'ACS 5-year estimates, 2012–2024.'

const METRIC_LABELS = {
  fb_pct: 'Foreign-born share',
  fb_bachelors_pct: "Foreign-born bachelor's degree or higher",
  bachelors_pct: "Foreign-born bachelor's degree or higher",
  fb_homeownership_pct: 'Foreign-born homeownership',
  homeownership_pct: 'Foreign-born homeownership',
  fb_median_household_income: 'Foreign-born median household income',
  median_household_income: 'Foreign-born median household income',
}

export function readEmbedSearch(search = window.location.search) {
  const params = new URLSearchParams(search)
  const embed = params.get('embed')
  if (!embed) return null
  return {
    embed,
    city: (params.get('city') || '').trim(),
    cities: (params.get('cities') || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
    metric: (params.get('metric') || '').trim(),
    country: (params.get('country') || '').trim(),
  }
}

function embedTitle(query) {
  const place = query.city || 'Massachusetts'
  switch (query.embed) {
    case 'place':
      return query.city ? `${query.city} snapshot` : 'Massachusetts snapshot'
    case 'metric':
      return METRIC_LABELS[query.metric] || 'City metric'
    case 'countries':
      return `Top countries of origin · ${place}`
    case 'regions':
      return `Regions of origin · ${place}`
    case 'country-cities':
      return query.country ? `${query.country} across Massachusetts` : 'Country across cities'
    case 'trends':
      return `${METRIC_LABELS[query.metric] || query.metric || 'Foreign-born population'}, 2012–2024`
    case 'country-trend':
      return query.country ? `Born in ${query.country}, 2012–2024` : 'Country of origin over time'
    default:
      return 'Chart'
  }
}

export default function EmbedFrame({ query, cities }) {
  const selectedCities = query.cities.length
    ? query.cities
    : (query.city ? [query.city] : [])

  let chart = null
  if (query.embed === 'place') {
    chart = <CityProfile selectedCities={query.city ? [query.city] : []} embed />
  } else if (query.embed === 'metric') {
    chart = (
      <PerCapitaComparison
        selectedCities={selectedCities}
        allCities={cities}
        initialMetric={query.metric}
      />
    )
  } else if (query.embed === 'countries') {
    chart = (
      <CountryOrigins
        selectedCities={selectedCities}
        allCities={cities}
        embedMode="countries"
      />
    )
  } else if (query.embed === 'regions') {
    chart = (
      <CountryOrigins
        selectedCities={selectedCities}
        allCities={cities}
        embedMode="regions"
      />
    )
  } else if (query.embed === 'country-cities') {
    chart = (
      <CountryOrigins
        selectedCities={selectedCities}
        allCities={cities}
        embedMode="country-cities"
        initialCountry={query.country}
      />
    )
  } else if (query.embed === 'trends') {
    chart = (
      <TrendsView
        selectedCities={selectedCities}
        embedMode="metric"
        initialMetric={query.metric}
      />
    )
  } else if (query.embed === 'country-trend') {
    chart = (
      <TrendsView
        selectedCities={selectedCities}
        embedMode="country"
        initialCountry={query.country}
      />
    )
  }

  return (
    <div className="embed-frame">
      <h1>{embedTitle(query)}</h1>
      {chart || (
        <p className="embed-missing">
          This embed type is not available. Use place, metric, countries, regions, country-cities, trends, or country-trend.
        </p>
      )}
      <p className="embed-source">{SOURCE_LINE}</p>
    </div>
  )
}
