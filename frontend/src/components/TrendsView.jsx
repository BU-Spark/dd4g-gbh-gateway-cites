import { useEffect, useState, useMemo } from 'react'
import { fetchTimeSeries } from '../api/cities'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

const METRICS = [
  { key: 'fb_pct', label: 'Foreign-Born %', format: '%' },
  { key: 'unemployment_rate', label: 'Unemployment Rate', format: '%' },
  { key: 'median_income', label: 'Median Household Income', format: '$' },
  { key: 'poverty_rate', label: 'Poverty Rate', format: '%' },
  { key: 'bachelors_pct', label: "Bachelor's Degree %", format: '%' },
  { key: 'homeownership_pct', label: 'Homeownership %', format: '%' },
  { key: 'fb_income', label: 'Foreign-Born Median Income', format: '$' },
]

const CITY_COLORS = [
  '#4e9af1', '#f1914e', '#a14ef1', '#4ef1a1', '#f14e7a',
  '#f1e44e', '#4ef1e4', '#f17a4e', '#7af14e', '#4e6af1',
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

  const activeCities = useMemo(() => {
    if (cityFilter === 'selected' && selectedCities.length > 0) return selectedCities
    if (cityFilter === 'gateway') return GATEWAY_CITIES
    return null
  }, [cityFilter, selectedCities])

  useEffect(() => {
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
  }, [metric])

  const chartData = useMemo(() => {
    let rows = data
    if (activeCities) {
      rows = data.filter((r) => activeCities.includes(r.city))
    }

    const byYear = {}
    rows.forEach((r) => {
      if (!byYear[r.year]) byYear[r.year] = { year: r.year }
      byYear[r.year][r.city] = r.value
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
        metric_key: metric,
        metric_label: METRICS.find((m) => m.key === metric)?.label || metric,
        city_filter: cityFilter,
        city: r.city,
        year: r.year,
        value: r.value,
      }))
  }, [data, activeCities, metric, cityFilter])

  useEffect(() => {
    const handleDownload = (event) => {
      if (event.detail?.tab !== 'Trends') return
      if (!exportRows.length) return

      const metricSlug = metric.toLowerCase().replace(/\s+/g, '_')
      downloadCSV(`trends_${metricSlug}.csv`, exportRows)
    }

    window.addEventListener('download-active-tab', handleDownload)
    return () => window.removeEventListener('download-active-tab', handleDownload)
  }, [exportRows, metric])

  const metaObj = METRICS.find((m) => m.key === metric) || METRICS[0]

  const formatValue = (v) => {
    if (v == null) return '—'
    return metaObj.format === '$'
      ? `$${Number(v).toLocaleString()}`
      : `${Number(v).toFixed(1)}%`
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Trends (2012–2024)</h2>

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
          <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
            Metric
          </label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            style={{
              background: '#1e1e2e',
              color: '#fff',
              border: '1px solid #444',
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
          <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
            Show cities
          </label>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[
              ['selected', `Selected (${selectedCities.length})`],
              ['gateway', 'All Gateway Cities'],
              ['all', 'All MA Places'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setCityFilter(val)}
                disabled={val === 'selected' && selectedCities.length === 0}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: cityFilter === val ? '#4e9af1' : '#2a2a3d',
                  color: cityFilter === val ? '#fff' : '#aaa',
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

      {loading && <div style={{ color: '#aaa', padding: '2rem' }}>Loading...</div>}

      {!loading && chartData.length > 0 && (
        <>
          {cityFilter === 'all' && (
            <p style={{ color: '#f1914e', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              ⚠️ Showing all ~260 MA places — select specific cities for a cleaner view
            </p>
          )}
          <p style={{ color: '#555', fontSize: '0.75rem', marginBottom: '1rem' }}>
            ⚠️ 2020 data reflects COVID-19 nonresponse bias — interpret with caution
          </p>
          <ResponsiveContainer width="100%" height={480}>
            <LineChart data={chartData} margin={{ top: 8, right: 120, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
              <XAxis
                dataKey="year"
                tick={{ fill: '#aaa', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#aaa', fontSize: 11 }}
                tickFormatter={(v) =>
                  metaObj.format === '$' ? `$${(v / 1000).toFixed(0)}k` : `${v.toFixed(1)}%`
                }
                width={55}
              />
              <Tooltip
                contentStyle={{
                  background: '#1e1e2e',
                  border: '1px solid #444',
                  color: '#fff',
                  fontSize: '0.8rem',
                }}
                itemSorter={(item) => -(Number(item?.value) || 0)}
                formatter={(v, name) => [formatValue(v), name]}
                labelFormatter={(l) => `Year: ${l}`}
              />
              <ReferenceLine
                x={2020}
                stroke="#f1914e"
                strokeDasharray="4 4"
                label={{ value: 'COVID', fill: '#f1914e', fontSize: 10 }}
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
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {cityFilter !== 'all' && (
            <TrendsColorKey cities={cities} cityColorMap={cityColorMap} />
          )}
        </>
      )}

      {!loading && chartData.length === 0 && (
        <div style={{ color: '#555', padding: '2rem', textAlign: 'center' }}>
          No data for selected cities/metric. Try "All Gateway Cities".
        </div>
      )}
    </div>
  )
}