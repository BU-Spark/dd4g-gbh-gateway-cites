import { useEffect, useState, useMemo } from 'react'
import { fetchCountryNames, fetchCountryTrend, fetchTimeSeries } from '../api/cities'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ErrorBar,
} from 'recharts'

const METRICS = [
  { key: 'fb_pct', label: 'Foreign-Born %', format: '%' },
  { key: 'unemployment_rate', label: 'Unemployment Rate', format: '%' },
  { key: 'median_income', label: 'Median Household Income', format: '$' },
  { key: 'poverty_rate', label: 'Poverty Rate', format: '%' },
  { key: 'bachelors_pct', label: "Bachelor's degree or higher %", format: '%' },
  { key: 'homeownership_pct', label: 'Homeownership %', format: '%' },
  { key: 'fb_income', label: 'Foreign-Born Median Income', format: '$' },
]

const CITY_COLORS = [
  '#732487', '#2652b2', '#ad40d9', '#bf0f0f', '#4f1c59',
  '#2b72f6', '#ea0051', '#b870d6', '#0051e7', '#ffc21b',
]

const getCityColor = (city) => {
  const name = String(city || '')
  let hash = 0

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }

  return CITY_COLORS[hash % CITY_COLORS.length]
}

function TrendsColorKey({ cities = [], cityColorMap = {} }) {
  if (!cities.length) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem 1rem',
        justifyContent: 'center',
        fontSize: '0.78rem',
        paddingTop: '0.75rem',
      }}
    >
      {cities.map((city) => (
        <div
          key={city}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: cityColorMap[city],
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '0.9rem',
              height: '0.18rem',
              borderRadius: '999px',
              background: cityColorMap[city],
              display: 'inline-block',
            }}
          />
          <span>{city}</span>
        </div>
      ))}
    </div>
  )
}

const GATEWAY_CITIES = [
  'Attleboro', 'Barnstable', 'Brockton', 'Chelsea', 'Chicopee',
  'Everett', 'Fall River', 'Fitchburg', 'Haverhill', 'Holyoke',
  'Lawrence', 'Leominster', 'Lowell', 'Lynn', 'Malden',
  'Methuen', 'New Bedford', 'Peabody', 'Pittsfield', 'Quincy',
  'Revere', 'Salem', 'Springfield', 'Taunton', 'Westfield', 'Worcester',
]

const downloadCSV = (filename, rows) => {
  if (!rows || !rows.length) return

  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] ?? ''
          const escaped = String(value).replace(/"/g, '""')
          return `"${escaped}"`
        })
        .join(','),
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function TrendsView({ selectedCities }) {
  const [metric, setMetric] = useState('fb_pct')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [cityFilter, setCityFilter] = useState('selected') // 'selected' | 'gateway' | 'all'
  const [countryNames, setCountryNames] = useState([])
  const [countryQuery, setCountryQuery] = useState('')
  const [countryMenuOpen, setCountryMenuOpen] = useState(false)

  const matchedCountry = useMemo(() => {
    const query = countryQuery.trim().toLowerCase()
    if (!query) return ''
    return countryNames.find((name) => name.toLowerCase() === query) || ''
  }, [countryQuery, countryNames])

  const activeCities = useMemo(() => {
    if (cityFilter === 'selected' && selectedCities.length > 0) return selectedCities
    if (cityFilter === 'gateway') return GATEWAY_CITIES
    if (matchedCountry && cityFilter === 'selected') return []
    return null
  }, [cityFilter, selectedCities, matchedCountry])

  const countrySuggestions = useMemo(() => {
    const query = countryQuery.trim().toLowerCase()
    if (query.length < 2) return []
    return countryNames
      .filter((name) => name.toLowerCase().includes(query) && name.toLowerCase() !== query)
      .slice(0, 8)
  }, [countryQuery, countryNames])

  useEffect(() => {
    fetchCountryNames()
      .then((names) => setCountryNames(Array.isArray(names) ? names : []))
      .catch((err) => console.error('Failed to load country names:', err))
  }, [])

  useEffect(() => {
    if (matchedCountry) return undefined
    setLoading(true)
    fetchTimeSeries({ metric })
      .then((rows) => {
        setData(rows)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load trends data:', err)
        setLoading(false)
      })
    return undefined
  }, [metric, matchedCountry])

  useEffect(() => {
    if (!matchedCountry) return undefined
    setLoading(true)
    fetchCountryTrend(matchedCountry)
      .then((rows) => {
        setData(Array.isArray(rows) ? rows : [])
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load country trend:', err)
        setLoading(false)
      })
    return undefined
  }, [matchedCountry])

  const chartData = useMemo(() => {
    let rows = data
    if (activeCities) {
      rows = data.filter((r) => activeCities.includes(r.city))
    }

    const byYear = {}
    rows.forEach((r) => {
      if (!byYear[r.year]) byYear[r.year] = { year: r.year }
      byYear[r.year][r.city] = r.value
      if (r.moe != null) byYear[r.year][`${r.city}__moe`] = r.moe
    })

    return Object.values(byYear).sort((a, b) => a.year - b.year)
  }, [data, activeCities])

  const cities = useMemo(() => {
    const set = new Set(data.map((r) => r.city))
    if (activeCities) return activeCities.filter((c) => set.has(c))
    return [...set].sort()
  }, [data, activeCities])

  const cityColorMap = useMemo(
    () => Object.fromEntries(cities.map((city) => [city, getCityColor(city)])),
    [cities],
  )

  const exportRows = useMemo(() => {
    let rows = data
    if (activeCities) {
      rows = data.filter((r) => activeCities.includes(r.city))
    }

    return rows
      .slice()
      .sort((a, b) => {
        if (a.city === b.city) return Number(a.year) - Number(b.year)
        return String(a.city).localeCompare(String(b.city))
      })
      .map((r) => ({
        metric_key: matchedCountry ? 'country_of_origin' : metric,
        metric_label: matchedCountry
          ? `Born in ${matchedCountry}`
          : (METRICS.find((m) => m.key === metric)?.label || metric),
        country: matchedCountry,
        city_filter: cityFilter,
        city: r.city,
        year: r.year,
        value: r.value,
        margin_of_error: r.moe ?? '',
      }))
  }, [data, activeCities, metric, cityFilter, matchedCountry])

  useEffect(() => {
    const handleDownload = (event) => {
      if (event.detail?.tab !== 'Trends') return
      if (!exportRows.length) return

      const metricSlug = (matchedCountry || metric).toLowerCase().replace(/\s+/g, '_')
      downloadCSV(`trends_${metricSlug}.csv`, exportRows)
    }

    window.addEventListener('download-active-tab', handleDownload)
    return () => window.removeEventListener('download-active-tab', handleDownload)
  }, [exportRows, metric, matchedCountry])

  const metaObj = METRICS.find((m) => m.key === metric) || METRICS[0]
  const valueFormat = matchedCountry ? 'count' : metaObj.format
  const hasMargins = chartData.some((row) => Object.keys(row).some((key) => key.endsWith('__moe')))

  const formatValue = (v) => {
    if (v == null || v === '') return '—'
    if (valueFormat === 'count') return Number(v).toLocaleString()
    if (valueFormat === '$') {
      if (Number(v) === 250001) return '$250,000+'
      return `$${Math.round(Number(v)).toLocaleString()}`
    }
    return `${Number(v).toFixed(1)}%`
  }

  const formatWithMargin = (value, city, row) => {
    const text = formatValue(value)
    const moe = row?.[`${city}__moe`]
    if (moe == null) return text
    return `${text} ± ${formatValue(moe)}`
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Trends (2012–2024)</h2>

      <div style={{ position: 'relative', maxWidth: '520px', marginBottom: '1rem', zIndex: 20 }}>
        <label htmlFor="trend-country-search" style={{ color: '#361247', fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          Country of origin
        </label>
        <input
          id="trend-country-search"
          type="text"
          placeholder="Search a country, such as Cambodia"
          value={countryQuery}
          onChange={(event) => {
            setCountryQuery(event.target.value)
            setCountryMenuOpen(true)
          }}
          onFocus={() => setCountryMenuOpen(true)}
          onBlur={() => setTimeout(() => setCountryMenuOpen(false), 120)}
          style={{
            width: '100%',
            background: '#ffffff',
            color: '#373737',
            border: '1px solid #732487',
            borderRadius: '8px',
            padding: '0.65rem 0.8rem',
            fontSize: '1rem',
          }}
        />
        {countryMenuOpen && countrySuggestions.length > 0 && (
          <ul style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#ffffff',
            border: '1px solid #c2c2c2',
            borderRadius: '8px',
            margin: '4px 0 0',
            padding: '0.25rem 0',
            listStyle: 'none',
            zIndex: 30,
            boxShadow: '0 10px 30px rgba(54,18,71,0.12)',
          }}>
            {countrySuggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setCountryQuery(name)
                    setCountryMenuOpen(false)
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: '0.5rem 0.8rem',
                    cursor: 'pointer',
                    color: '#373737',
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p style={{ color: '#6f6f6f', fontSize: '0.82rem', margin: '0.45rem 0 0' }}>
          {matchedCountry
            ? `Showing how many residents were born in ${matchedCountry}, from 2012 to 2024.`
            : 'Search a country to see how that population has changed. Leave this blank to use the metric below.'}
          {matchedCountry && cityFilter === 'selected' && selectedCities.length > 0
            ? ` Limited to ${selectedCities.filter((city) => city !== 'Statewide').join(', ')} from Filter Cities.`
            : ''}
          {matchedCountry && cityFilter === 'selected' && selectedCities.length === 0
            ? ' Choose All Gateway Cities, or select places in Filter Cities, to draw the lines.'
            : ''}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <label style={{ color: '#6f6f6f', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
            Metric
          </label>
          <select
            value={metric}
            onChange={(e) => {
              setMetric(e.target.value)
              setCountryQuery('')
            }}
            style={{
              background: '#ffffff',
              color: '#373737',
              border: '1px solid #c2c2c2',
              borderRadius: '6px',
              padding: '0.4rem 0.6rem',
            }}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ color: '#6f6f6f', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
            Show geographies
          </label>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[
              ['selected', `Selected (${selectedCities.length})`],
              ['gateway', 'All Gateway Cities'],
              ['all', 'All MA County Subdivisions'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setCityFilter(val)}
                disabled={val === 'selected' && selectedCities.length === 0}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: cityFilter === val ? '#732487' : '#ffffff',
                  color: cityFilter === val ? '#fff' : '#6f6f6f',
                  border: cityFilter === val ? '1px solid #732487' : '1px solid #c2c2c2',
                  fontSize: '0.8rem',
                  opacity: val === 'selected' && selectedCities.length === 0 ? 0.4 : 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div style={{ color: '#6f6f6f', padding: '2rem' }}>Loading...</div>}

      {!loading && chartData.length > 0 && (
        <>
          {cityFilter === 'all' && (
            <p style={{ color: '#bf0f0f', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              ⚠️ Showing all MA county subdivisions — select specific cities for a cleaner view
            </p>
          )}
          <p style={{ color: '#676767', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
            ⚠️ 2020 data reflects COVID-19 nonresponse bias — interpret with caution
          </p>
          {hasMargins && (
            <p style={{ color: '#6f6f6f', fontSize: '0.8rem', marginBottom: '1rem' }}>
              {cities.length <= 40
                ? 'Vertical bars show the margin of error around each point.'
                : 'Margins of error are listed in the tooltip. Choose fewer places to draw them on the chart.'}
            </p>
          )}
          <ResponsiveContainer width="100%" height={480}>
            <LineChart data={chartData} margin={{ top: 8, right: 120, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
              <XAxis
                dataKey="year"
                tick={{ fill: '#6f6f6f', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#6f6f6f', fontSize: 11 }}
                tickFormatter={(v) => {
                  if (valueFormat === 'count') return Number(v).toLocaleString()
                  if (valueFormat === '$') return `$${(v / 1000).toFixed(0)}k`
                  return `${Number(v).toFixed(1)}%`
                }}
                width={valueFormat === 'count' ? 72 : 55}
              />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #dadada',
                  color: '#373737',
                  fontSize: '0.8rem',
                }}
                itemSorter={(item) => -(Number(item?.value) || 0)}
                formatter={(v, name, item) => [formatWithMargin(v, name, item?.payload), name]}
                labelFormatter={(l) => `Year: ${l}`}
              />
              <ReferenceLine
                x={2020}
                stroke="#bf0f0f"
                strokeDasharray="4 4"
                label={{ value: 'COVID', fill: '#bf0f0f', fontSize: 10 }}
              />
              {cities.map((city) => (
                <Line
                  key={city}
                  type="monotone"
                  dataKey={city}
                  stroke={cityColorMap[city]}
                  strokeWidth={selectedCities.includes(city) ? 2.5 : 1.5}
                  dot={false}
                  connectNulls
                  label={(props) => {
                    const { x, y, index, value } = props
                    if (index !== chartData.length - 1) return null
                    if (value == null) return null

                    return (
                      <text
                        x={x + 6}
                        y={y}
                        fill={cityColorMap[city]}
                        fontSize={11}
                        dominantBaseline="middle"
                      >
                        {city}
                      </text>
                    )
                  }}
                >
                  {cities.length <= 40 && (
                    <ErrorBar
                      dataKey={`${city}__moe`}
                      width={5}
                      stroke={cityColorMap[city]}
                      strokeWidth={1.25}
                      direction="y"
                    />
                  )}
                </Line>
              ))}
            </LineChart>
          </ResponsiveContainer>
          {cityFilter !== 'all' && (
            <TrendsColorKey cities={cities} cityColorMap={cityColorMap} />
          )}
        </>
      )}

      {!loading && chartData.length === 0 && (
        <div style={{ color: '#676767', padding: '2rem', textAlign: 'center' }}>
          {matchedCountry
            ? `No residents born in ${matchedCountry} for this geography. Try All Gateway Cities.`
            : 'No data for selected cities/metric. Try "All Gateway Cities".'}
        </div>
      )}
    </div>
  )
}
