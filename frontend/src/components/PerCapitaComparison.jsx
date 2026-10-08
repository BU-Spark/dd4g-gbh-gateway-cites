import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  fetchForeignBorn,
  fetchForeignBornCharacteristics,
  fetchStateProfile,
} from '../api/cities'

const COLORS = {
  gateway: '#732487',
  other: '#a2a2a2',
}

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

const CITY_METRIC_KEYS = [
  'fb_pct',
  'fb_bachelors_pct',
  'fb_homeownership_pct',
  'fb_median_household_income',
]

const METRIC_ALIASES = {
  bachelors_pct: 'fb_bachelors_pct',
  homeownership_pct: 'fb_homeownership_pct',
  median_household_income: 'fb_median_household_income',
}

export default function PerCapitaComparison({
  selectedCities,
  allCities,
  initialMetric,
  placeTypeFilter = 'all',
}) {
  const [data, setData] = useState([])
  const [stateProfile, setStateProfile] = useState(null)
  const [metric, setMetric] = useState(
    CITY_METRIC_KEYS.includes(METRIC_ALIASES[initialMetric] || initialMetric)
      ? (METRIC_ALIASES[initialMetric] || initialMetric)
      : 'fb_pct',
  )
  const [loading, setLoading] = useState(false)
  const [topN, setTopN] = useState(15)
  const [gatewayOnly, setGatewayOnly] = useState(false)

  const METRICS = [
    { key: 'fb_pct', label: 'Foreign-Born %', foreignBorn: false },
    { key: 'fb_bachelors_pct', label: "Bachelor's degree or higher %", foreignBorn: true },
    { key: 'fb_homeownership_pct', label: 'Homeownership %', foreignBorn: true },
    { key: 'fb_median_household_income', label: 'Median Household Income', foreignBorn: true },
  ]

  useEffect(() => {
    setLoading(true)

    const citiesToFetch =
      selectedCities.length > 0
        ? selectedCities.filter((c) => c !== 'Statewide')
        : allCities
            .filter((c) => c.city !== 'Statewide')
            .filter((c) => (
              placeTypeFilter === 'gateway' || placeTypeFilter === 'other'
                ? c.city_type === placeTypeFilter
                : true
            ))
            .map((c) => c.city)

    Promise.all([
      fetchForeignBorn(),
      fetchForeignBornCharacteristics(),
      fetchStateProfile(),
    ])
      .then(([fb, chars, state]) => {
        const merged = citiesToFetch.map((city) => {
          const cityMeta = allCities.find((c) => c.city === city) || {}
          const fbRow = fb.find((r) => r.city === city) || {}
          const charRow = chars.find((r) => r.city === city) || {}

          return {
            city,
            city_type: cityMeta.city_type || 'other',
            fb_pct: fbRow.fb_pct,
            fb_bachelors_pct: charRow.fb_bachelors_pct,
            fb_homeownership_pct: charRow.fb_homeownership_pct,
            fb_median_household_income: charRow.fb_median_household_income,
          }
        })

        setData(merged)
        setStateProfile(state)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load per capita comparison data:', err)
        setLoading(false)
      })
  }, [selectedCities, allCities, placeTypeFilter])

  const selectedMetric = METRICS.find((m) => m.key === metric)

  const filteredSortedData = useMemo(() => {
    const filtered = data
      .filter((d) => d[metric] != null)
      .filter((d) => (gatewayOnly ? d.city_type === 'gateway' : true))
      .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))

    const pageRows = filtered.slice(0, topN)

    if (!stateProfile || (!selectedCities.includes('Statewide') && selectedCities.length > 0)) {
      return pageRows
    }

    const stateRow = {
      city: 'Statewide',
      city_type: 'state',
      fb_pct: stateProfile.fb_pct,
      fb_bachelors_pct: stateProfile.fb_bachelors_pct,
      fb_homeownership_pct: stateProfile.fb_homeownership_pct,
      fb_median_household_income: stateProfile.fb_median_household_income,
    }

    const existingStateIndex = pageRows.findIndex(
      (row) => row.city === stateRow.city && row.city_type === stateRow.city_type,
    )

    if (existingStateIndex !== -1) {
      return [stateRow, ...pageRows.filter((_, idx) => idx !== existingStateIndex)]
    }

    return [stateRow, ...pageRows]
  }, [data, metric, gatewayOnly, topN, stateProfile])

  useEffect(() => {
    const handleDownload = (event) => {
      if (event.detail?.tab !== 'Per Capita Comparison') return
      if (!filteredSortedData.length) return

      const rows = filteredSortedData.map((d) => ({
        city: d.city,
        city_type: d.city_type,
        metric_key: metric,
        metric_label: selectedMetric?.label,
        metric_value: d[metric],
        fb_pct: d.fb_pct,
        fb_bachelors_pct: d.fb_bachelors_pct,
        fb_homeownership_pct: d.fb_homeownership_pct,
        fb_median_household_income: d.fb_median_household_income,
      }))

      downloadCSV('per_capita_comparison.csv', rows)
    }

    window.addEventListener('download-active-tab', handleDownload)
    return () => window.removeEventListener('download-active-tab', handleDownload)
  }, [filteredSortedData, metric, selectedMetric])

  const chartHeight = Math.max(filteredSortedData.length * 42 + 40, 320)

  const formatIncome = (value) => {
    const amount = Number(value)
    if (amount === 250001) return '$250,000+'
    return `$${amount.toLocaleString()}`
  }

  const formatValue = (value) => {
    if (value == null) return 'N/A'
    return metric === 'fb_median_household_income'
      ? formatIncome(value)
      : `${Number(value).toFixed(1)}%`
  }

  return (
    <div>
      <div className="comparison-controls">
        <h2>
          City Metrics — {selectedMetric.label}
          {selectedMetric.foreignBorn && (
            <span style={{
              marginLeft: '0.5rem',
              color: '#4f1c59',
              fontSize: '0.7rem',
              background: '#edd4f5',
              borderRadius: '4px',
              padding: '2px 6px',
              verticalAlign: 'middle',
              fontWeight: 600,
            }}>
              Foreign-born
            </span>
          )}
        </h2>

        <div className="overview-controls">
          <div className="overview-control-group">
            <label htmlFor="perCapitaTopN">Show</label>
            <select
              id="perCapitaTopN"
              className="overview-select"
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
            >
              <option value={10}>Top 10</option>
              <option value={15}>Top 15</option>
              <option value={20}>Top 20</option>
              <option value={999}>All</option>
            </select>
          </div>

          <button
            className={`overview-toggle-btn ${gatewayOnly ? 'active' : ''}`}
            onClick={() => setGatewayOnly((prev) => !prev)}
          >
            {gatewayOnly ? 'Showing Gateway Only' : 'Show Gateway Only'}
          </button>
        </div>

        <div className="metric-pills">
          {METRICS.map((m) => (
            <button
              key={m.key}
              className={`pill ${metric === m.key ? 'active' : ''}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <p className="hint">
          {selectedCities.length > 0
            ? `Showing ${selectedCities.length} selected ${selectedCities.length === 1 ? 'city' : 'cities'}`
            : placeTypeFilter === 'gateway'
              ? 'Showing Gateway Cities'
              : placeTypeFilter === 'other'
                ? 'Showing other municipalities'
                : 'Showing all cities · Select cities in sidebar to filter'}
        </p>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          <p style={{ color: '#6f6f6f', marginBottom: '10px' }}>
            Showing {filteredSortedData.length} rows
          </p>

          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={filteredSortedData}
              layout="vertical"
              margin={{ top: 10, right: 80, left: 110, bottom: 10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e6e6e6"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: '#6f6f6f', fontSize: 11 }}
                tickFormatter={(v) =>
                  metric === 'fb_median_household_income'
                    ? formatIncome(v)
                    : `${Number(v).toFixed(1)}%`
                }
              />
              <YAxis
                type="category"
                dataKey="city"
                tick={{ fill: '#454545', fontSize: 11 }}
                width={105}
              />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #dadada',
                  borderRadius: 6,
                }}
                labelStyle={{ color: '#373737' }}
                itemStyle={{ color: COLORS.gateway }}
                formatter={(value) => [formatValue(value), selectedMetric.label]}
              />
              <Bar
                dataKey={metric}
                radius={[0, 4, 4, 0]}
                label={{
                  position: 'right',
                  fill: COLORS.gateway,
                  fontSize: 11,
                  formatter: (value) => formatValue(value),
                }}
                shape={(props) => {
                  const { city_type } = props.payload
                  return (
                    <rect
                      {...props}
                      fill={COLORS[city_type] || COLORS.other}
                      rx={3}
                    />
                  )
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}