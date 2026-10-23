import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCommunityTrends, fetchCountryNames } from '../api/cities'
import SearchableCitySelect from './SearchableCitySelect'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const REGIONS = [
  'Europe',
  'Asia',
  'Africa',
  'Latin America',
  'Northern America',
  'Oceania',
]
const MAX_COMMUNITIES = 8
const SERIES_COLORS = [
  '#732487', '#2652b2', '#bf0f0f', '#ad40d9', '#0051e7',
  '#ea0051', '#4f1c59', '#ffc21b',
]

const downloadCSV = (filename, rows) => {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => {
      const escaped = String(row[header] ?? '').replace(/"/g, '""')
      return `"${escaped}"`
    }).join(',')),
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

export default function CommunityTrends({
  selectedCities = [],
  allCities = [],
  initialGeography = '',
  initialCommunities = [],
  embedMode = false,
}) {
  const startingGeography = initialGeography
    || selectedCities.find((city) => city && city !== 'Statewide')
    || 'Statewide'
  const [geography, setGeography] = useState(startingGeography)
  const [selection, setSelection] = useState(initialCommunities)
  const [customized, setCustomized] = useState(initialCommunities.length > 0)
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countryNames, setCountryNames] = useState([])
  const [countryQuery, setCountryQuery] = useState('')
  const [countryMenuOpen, setCountryMenuOpen] = useState(false)

  const cityOptions = useMemo(() => {
    const names = (allCities || [])
      .map((city) => city?.city)
      .filter((city) => city && city !== 'Statewide')
    return ['Statewide', ...new Set(names)].sort((a, b) => {
      if (a === 'Statewide') return -1
      if (b === 'Statewide') return 1
      return a.localeCompare(b)
    })
  }, [allCities])

  const sidebarKey = selectedCities.join('\0')
  const followedSidebar = useRef(sidebarKey)
  useEffect(() => {
    if (initialCommunities.length > 0 || followedSidebar.current === sidebarKey) return undefined
    followedSidebar.current = sidebarKey
    const chosen = selectedCities.filter((city) => city && city !== 'Statewide')
    if (chosen.length !== 1) return undefined
    setGeography(chosen[0])
    setSelection([])
    setCustomized(false)
    return undefined
  }, [sidebarKey, selectedCities, initialCommunities.length])

  useEffect(() => {
    fetchCountryNames()
      .then((names) => setCountryNames(Array.isArray(names) ? names : []))
      .catch((err) => console.error('Failed to load country names:', err))
  }, [])

  const selectionKey = selection.join('\0')
  useEffect(() => {
    if (customized && selection.length === 0) {
      setPayload({ geography, defaults: false, series: [] })
      setLoading(false)
      setError('')
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')
    fetchCommunityTrends({
      city: geography,
      communities: customized ? selection : [],
    })
      .then((result) => {
        if (cancelled) return
        setPayload(result)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load community trends:', err)
        setError(err.message || 'Community trends could not be loaded.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [geography, selectionKey, customized, selection])

  const series = payload?.series || []
  const activeLabels = customized ? selection : series.map((item) => item.label)
  const placeLabel = payload?.geography || geography

  const chartData = useMemo(() => {
    const byYear = {}
    series.forEach((item) => {
      item.points.forEach((point) => {
        if (!byYear[point.year]) byYear[point.year] = { year: point.year }
        byYear[point.year][item.label] = point.value
        if (point.moe != null) byYear[point.year][`${item.label}__moe`] = point.moe
      })
    })
    return Object.values(byYear).sort((a, b) => a.year - b.year)
  }, [series])

  const colorMap = useMemo(
    () => Object.fromEntries(series.map((item, index) => [
      item.label,
      SERIES_COLORS[index % SERIES_COLORS.length],
    ])),
    [series],
  )

  const countrySuggestions = useMemo(() => {
    const query = countryQuery.trim().toLowerCase()
    if (query.length < 2) return []
    const chosen = new Set(activeLabels.map((label) => label.toLowerCase()))
    return countryNames
      .filter((name) => name.toLowerCase().includes(query) && !chosen.has(name.toLowerCase()))
      .slice(0, 8)
  }, [countryQuery, countryNames, activeLabels])

  const exportRows = useMemo(() => series.flatMap((item) => (
    item.points.map((point) => ({
      geography: placeLabel,
      community: item.label,
      community_type: item.type,
      year: point.year,
      value: point.value,
      margin_of_error: point.moe ?? '',
    }))
  )), [series, placeLabel])

  useEffect(() => {
    const handleDownload = (event) => {
      if (event.detail?.tab !== 'Trends' || !exportRows.length) return
      const slug = placeLabel.toLowerCase().replace(/\s+/g, '_')
      downloadCSV(`community_trends_${slug}.csv`, exportRows)
    }
    window.addEventListener('download-active-tab', handleDownload)
    return () => window.removeEventListener('download-active-tab', handleDownload)
  }, [exportRows, placeLabel])

  const updateSelection = (next) => {
    setCustomized(true)
    setSelection(next.slice(0, MAX_COMMUNITIES))
  }

  const addCommunity = (label) => {
    const current = activeLabels
    if (current.some((item) => item.toLowerCase() === label.toLowerCase())) return
    if (current.length >= MAX_COMMUNITIES) return
    updateSelection([...current, label])
    setCountryQuery('')
    setCountryMenuOpen(false)
  }

  const formatValue = (value) => (
    value == null || value === '' ? '—' : Number(value).toLocaleString()
  )

  return (
    <div>
      {!embedMode && (
        <h2 style={{ marginBottom: '1rem' }}>Communities in {placeLabel}, 2012–2024</h2>
      )}

      <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ maxWidth: '420px' }}>
          <div style={{ color: '#361247', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
            Place
          </div>
          <SearchableCitySelect
            options={cityOptions}
            value={geography}
            onChange={(option) => {
              const next = typeof option === 'string' ? option : option?.city
              if (!next || next === geography) return
              setGeography(next)
              setSelection([])
              setCustomized(false)
            }}
            placeholder="Search a city or town"
          />
        </div>

        <div>
          <div style={{ color: '#361247', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
            Regions
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {REGIONS.map((region) => {
              const active = activeLabels.some((label) => label.toLowerCase() === region.toLowerCase())
              return (
                <button
                  key={region}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (active) {
                      updateSelection(activeLabels.filter((label) => label.toLowerCase() !== region.toLowerCase()))
                      return
                    }
                    addCommunity(region)
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    background: active ? '#732487' : '#ffffff',
                    color: active ? '#ffffff' : '#373737',
                    border: active ? '1px solid #732487' : '1px solid #c2c2c2',
                    fontSize: '0.8rem',
                  }}
                >
                  {region}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: '520px', zIndex: 20 }}>
          <label htmlFor="community-country-search" style={{ color: '#361247', fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Add a country
          </label>
          <input
            id="community-country-search"
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
                      addCommunity(name)
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
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        {activeLabels.map((label) => (
          <span className="selected-city-tag" key={label} style={{ width: 'auto' }}>
            <span className="selected-city-name">{label}</span>
            <button
              type="button"
              className="selected-city-remove"
              aria-label={`Remove ${label}`}
              onClick={() => updateSelection(activeLabels.filter((item) => item !== label))}
            >
              ×
            </button>
          </span>
        ))}
        {customized && (
          <button
            type="button"
            onClick={() => {
              setSelection([])
              setCustomized(false)
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#732487',
              cursor: 'pointer',
              fontSize: '0.82rem',
            }}
          >
            Reset to top 5
          </button>
        )}
      </div>

      {!loading && (
        <p style={{ color: '#6f6f6f', fontSize: '0.82rem', margin: '0 0 1rem' }}>
          {activeLabels.length
            ? `Showing how ${activeLabels.join(', ')} changed in ${placeLabel} from 2012 to 2024.`
            : `Add a country or region to see how immigrant communities changed in ${placeLabel}.`}
          {activeLabels.length >= MAX_COMMUNITIES ? ` Up to ${MAX_COMMUNITIES} communities can be compared.` : ''}
        </p>
      )}

      {loading && <div style={{ color: '#6f6f6f', padding: '2rem' }}>Loading...</div>}
      {error && <div style={{ color: '#bf0f0f', padding: '1rem 0' }}>{error}</div>}

      {!loading && !error && chartData.length > 0 && (
        <>
          <p style={{ color: '#676767', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
            ⚠️ 2020 data reflects COVID-19 nonresponse bias — interpret with caution
          </p>
          <ResponsiveContainer width="100%" height={480}>
            <LineChart data={chartData} margin={{ top: 8, right: 120, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
              <XAxis dataKey="year" tick={{ fill: '#6f6f6f', fontSize: 11 }} tickLine={false} />
              <YAxis
                tick={{ fill: '#6f6f6f', fontSize: 11 }}
                tickFormatter={(value) => Number(value).toLocaleString()}
                width={72}
              />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #dadada', color: '#373737', fontSize: '0.8rem' }}
                itemSorter={(item) => -(Number(item?.value) || 0)}
                formatter={(value, name, item) => {
                  const margin = item?.payload?.[`${name}__moe`]
                  const text = formatValue(value)
                  return [margin == null ? text : `${text} ± ${formatValue(margin)}`, name]
                }}
                labelFormatter={(label) => `Year: ${label}`}
              />
              <ReferenceLine
                x={2020}
                stroke="#bf0f0f"
                strokeDasharray="4 4"
                label={{ value: 'COVID', fill: '#bf0f0f', fontSize: 10 }}
              />
              {series.map((item) => (
                <Line
                  key={item.label}
                  type="monotone"
                  dataKey={item.label}
                  stroke={colorMap[item.label]}
                  strokeWidth={2.25}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', justifyContent: 'center', fontSize: '0.78rem', paddingTop: '0.75rem' }}>
            {series.map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: colorMap[item.label] }}>
                <span aria-hidden="true" style={{ width: '0.9rem', height: '0.18rem', borderRadius: '999px', background: colorMap[item.label], display: 'inline-block' }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div style={{ color: '#676767', padding: '2rem', textAlign: 'center' }}>
          {activeLabels.length
            ? `No origin data for ${placeLabel}.`
            : 'Choose at least one country or region.'}
        </div>
      )}
    </div>
  )
}
