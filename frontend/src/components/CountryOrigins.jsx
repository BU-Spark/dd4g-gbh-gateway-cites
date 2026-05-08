import { useEffect, useState, useMemo } from 'react'
import { fetchCountryOfOrigin, fetchStateCountryOfOrigin, fetchContinentTrend } from '../api/cities'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line,
} from 'recharts'

const ACCENT = '#4e9af1'
const ACCENT2 = '#f1914e'
const OTHER_COLOR = '#bfc4cf'
const STATEWIDE_LABEL = 'Massachusetts Statewide Total'
const GATEWAY_LABEL = 'Gateway Cities (Combined)'

const CONTINENT_ORDER = [
  'North America',
  'South America',
  'Africa',
  'Asia',
  'Europe',
  'Oceania',
  'Other',
]

const CONTINENT_COLORS = {
  'Asia':          '#4e9af1',
  'North America': '#f1914e',
  'Europe':        '#a78bfa',
  'South America': '#34d399',
  'Africa':        '#fbbf24',
  'Oceania':       '#f472b6',
  'Other':         '#bfc4cf',
}

const NORTH_AMERICA_ORIGINS = new Set([
  'Bahamas', 'Barbados', 'Belize', 'Canada', 'Costa Rica', 'Cuba', 'Dominica',
  'Dominican Republic', 'El Salvador', 'Grenada', 'Guatemala', 'Haiti', 'Honduras',
  'Jamaica', 'Mexico', 'Nicaragua', 'Panama', 'St. Lucia',
  'St. Vincent and the Grenadines', 'Trinidad and Tobago',
])

const SOUTH_AMERICA_ORIGINS = new Set([
  'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador',
  'Guyana', 'Peru', 'Uruguay', 'Venezuela',
])

const NON_COUNTRY_LABELS = new Set([
  'Africa', 'Europe', 'Americas', 'Asia', 'Oceania', 'Northern America',
  'Latin America', 'Caribbean', 'Central America', 'South America',
  'Eastern Asia', 'Western Asia', 'Southern Asia', 'South Eastern Asia',
  'Middle Africa', 'Eastern Africa', 'Western Africa', 'Northern Africa',
  'Southern Africa', 'Eastern Europe', 'Western Europe', 'Northern Europe',
  'Southern Europe', 'South Central Asia', 'USSR', 'Other areas of birth', 'Born at sea',
])

const isRealCountry = (name) => {
  if (!name) return false
  return !NON_COUNTRY_LABELS.has(String(name).trim())
}

const normalizeContinent = (row) => {
  const rawRegion = String(row.region || '').trim()
  const country = String(row.country || '').trim()
  if (rawRegion === 'America') {
    if (NORTH_AMERICA_ORIGINS.has(country)) return 'North America'
    if (SOUTH_AMERICA_ORIGINS.has(country)) return 'South America'
    return 'Other'
  }
  if (['Africa', 'Asia', 'Europe', 'Oceania'].includes(rawRegion)) return rawRegion
  return 'Other'
}

export default function CountryOrigins({ selectedCities = [], allCities = [] }) {
  const [mode, setMode] = useState('by_country')
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(true)
  const [gatewayOnly, setGatewayOnly] = useState(false)
  const [continentTrendData, setContinentTrendData] = useState([])
  const [continentTrendLoading, setContinentTrendLoading] = useState(false)
  const [selectedCity, setSelectedCity] = useState('')
  const [chartCity, setChartCity] = useState('') // city shown in the top-N chart
  const [topN, setTopN] = useState(15)
  const [topNCountry, setTopNCountry] = useState(15)
  const [countrySearch, setCountrySearch] = useState('')
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false)

  const cityTypeByName = useMemo(() => {
    const map = new Map()
    allCities.forEach((c) => { if (c?.city) map.set(c.city, c.city_type || 'other') })
    return map
  }, [allCities])

  const gatewayCitySet = useMemo(() => {
    return new Set(allCities.filter(c => c?.city && c?.city_type === 'gateway').map(c => c.city))
  }, [allCities])

  const cityNames = useMemo(() => {
    return [
      STATEWIDE_LABEL,
      GATEWAY_LABEL,
      ...new Set(allCities.map(c => c.city).filter(Boolean)).values(),
    ]
  }, [allCities])

  const effectiveSelectedCity = selectedCity || STATEWIDE_LABEL
  const effectiveChartCity = chartCity || effectiveSelectedCity

  useEffect(() => {
    if (selectedCities.length > 0) {
      const first = selectedCities.find(c => c !== 'Statewide') || ''
      setSelectedCity(first)
      setChartCity(first)
    } else {
      setSelectedCity('')
      setChartCity('')
    }
  }, [selectedCities])

  useEffect(() => {
    if (cityNames.length === 0) return

    const aggregateByCountry = (rows, cityLabel, cityType) => {
      const totals = new Map()
      rows.forEach((row) => {
        const country = String(row.country || '').trim()
        const region = String(row.region || '').trim()
        const key = `${country}||${region}`
        const estimate = Number(row.estimate) || 0
        if (!country || estimate <= 0) return
        const current = totals.get(key)
        if (current) {
          current.estimate += estimate
        } else {
          totals.set(key, { country, region, estimate, city: cityLabel, city_type: cityType })
        }
      })
      return Array.from(totals.values())
    }

    setLoading(true)
    Promise.all([
      fetchStateCountryOfOrigin(),
      ...cityNames
        .filter(city => city !== STATEWIDE_LABEL && city !== GATEWAY_LABEL)
        .map(city => fetchCountryOfOrigin(city)),
    ])
      .then(([statewideRows, ...results]) => {
        const cityRows = results.flat().map((row) => ({
          ...row,
          city_type: row.city_type || cityTypeByName.get(row.city) || 'other',
        }))
        const gatewayRows = cityRows.filter(row => gatewayCitySet.has(row.city))

        const rows = [
          ...(statewideRows || []).map(row => ({ ...row, city: STATEWIDE_LABEL, city_type: 'state' })),
          ...aggregateByCountry(gatewayRows, GATEWAY_LABEL, 'gateway'),
          ...cityRows,
        ].filter(r => r.estimate > 0 && isRealCountry(r.country))

        setAllData(rows)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load country data:', err)
        setLoading(false)
      })
  }, [cityNames, cityTypeByName, gatewayCitySet])

  // By Country tab — top N countries for the chart city
  const byCountryChartData = useMemo(() => {
    const rows = allData.filter(r => r.city === effectiveChartCity && r.estimate > 0)
    const total = rows.reduce((s, r) => s + r.estimate, 0)
    return rows
      .map(r => ({ ...r, share: total > 0 ? (r.estimate / total) * 100 : 0 }))
      .sort((a, b) => b.estimate - a.estimate)
      .slice(0, topN)
  }, [effectiveChartCity, allData, topN])

  // By Country tab — search a specific country, scoped to selected cities (or gateway/all)
  const searchScopeCities = useMemo(() => {
    const realSelected = selectedCities.filter(c => c !== 'Statewide')
    if (realSelected.length > 0) return new Set(realSelected)
    return null // null = no restriction (show all)
  }, [selectedCities])

  const byCountrySearchData = useMemo(() => {
    if (!countrySearch.trim()) return []
    const q = countrySearch.toLowerCase()
    let scopedRows = allData.filter(r => r.city !== STATEWIDE_LABEL && r.city !== GATEWAY_LABEL)
    if (searchScopeCities) {
      scopedRows = scopedRows.filter(r => searchScopeCities.has(r.city))
    } else if (gatewayOnly) {
      scopedRows = scopedRows.filter(r => gatewayCitySet.has(r.city))
    }
    const matched = [...new Set(scopedRows.filter(r => r.country?.toLowerCase().includes(q)).map(r => r.country))]
    if (!matched.length) return []
    const country = matched.find(c => c.toLowerCase() === q) || matched[0]
    return scopedRows
      .filter(r => r.country === country && r.estimate > 0)
      .sort((a, b) => b.estimate - a.estimate)
      .slice(0, topNCountry)
  }, [allData, countrySearch, searchScopeCities, gatewayCitySet, gatewayOnly, topNCountry])

  const suggestions = useMemo(() => {
    if (!countrySearch.trim() || countrySearch.length < 2) return []
    const q = countrySearch.toLowerCase()
    let scopedRows = allData.filter(r => r.city !== STATEWIDE_LABEL && r.city !== GATEWAY_LABEL)
    if (searchScopeCities) {
      scopedRows = scopedRows.filter(r => searchScopeCities.has(r.city))
    } else if (gatewayOnly) {
      scopedRows = scopedRows.filter(r => gatewayCitySet.has(r.city))
    }
    return [...new Set(scopedRows.map(r => r.country))]
      .filter(c => c?.toLowerCase().includes(q))
      .sort()
      .slice(0, 8)
  }, [allData, countrySearch, searchScopeCities, gatewayCitySet, gatewayOnly])

  const byContinentData = useMemo(() => {
    const cityRows = allData.filter(r => r.city === effectiveChartCity && Number(r.estimate) > 0)
    const totals = new Map()
    cityRows.forEach((row) => {
      const continent = normalizeContinent(row)
      const estimate = Number(row.estimate) || 0
      totals.set(continent, (totals.get(continent) || 0) + estimate)
    })
    return CONTINENT_ORDER
      .map(continent => ({ continent, estimate: totals.get(continent) || 0 }))
      .filter(r => r.estimate > 0)
      .sort((a, b) => b.estimate - a.estimate)
  }, [allData, effectiveChartCity])

  useEffect(() => {
    if (mode !== 'by_continent') return
    setContinentTrendLoading(true)
    let fetchPromise
    if (effectiveChartCity === STATEWIDE_LABEL) {
      fetchPromise = fetchContinentTrend('state')
    } else if (effectiveChartCity === GATEWAY_LABEL) {
      fetchPromise = fetchContinentTrend('gateway')
    } else {
      fetchPromise = fetchCountryOfOrigin(effectiveChartCity, { allYears: true })
    }
    fetchPromise
      .then((rows) => {
        const byYear = new Map()
        ;(rows || []).forEach((row) => {
          const year = Number(row.year)
          if (!Number.isFinite(year)) return
          const continent = normalizeContinent(row)
          const estimate = Number(row.estimate) || 0
          if (!byYear.has(year)) byYear.set(year, {})
          const entry = byYear.get(year)
          entry[continent] = (entry[continent] || 0) + estimate
        })
        const trend = Array.from(byYear.entries())
          .map(([year, continents]) => ({ year, ...continents }))
          .sort((a, b) => a.year - b.year)
        setContinentTrendData(trend)
        setContinentTrendLoading(false)
      })
      .catch(() => {
        setContinentTrendData([])
        setContinentTrendLoading(false)
      })
  }, [effectiveChartCity, mode])

  if (loading) return <div className="placeholder"><p>Loading country data...</p></div>

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Origins</h2>

      {/* Tabs — By Country and By Continent only */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[['by_country', 'By Country'], ['by_continent', 'By Continent']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setMode(val)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: mode === val ? ACCENT : '#2a2a3d',
              color: '#fff',
              fontWeight: mode === val ? 'bold' : 'normal',
            }}
          >
            {label}
          </button>
        ))}

        {mode === 'by_country' && (
          <button
            onClick={() => setGatewayOnly(prev => !prev)}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: gatewayOnly ? '1px solid #4e9af1' : '1px solid #2a2a3a',
              background: gatewayOnly ? '#1a2540' : 'transparent',
              color: gatewayOnly ? '#fff' : '#888',
              cursor: 'pointer',
              fontSize: '0.82rem',
            }}
          >
            {gatewayOnly ? 'Showing Gateway Only' : 'Show Gateway Only'}
          </button>
        )}
      </div>

      {/* ── By Country ── */}
      {mode === 'by_country' && (
        <>
          {/* Top N chart for selected city */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Show top</label>
                <select
                  value={topN}
                  onChange={e => setTopN(Number(e.target.value))}
                  style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
                >
                  {[10, 15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              {/* City picker — only shows when multiple cities are selected */}
              {selectedCities.filter(c => c !== 'Statewide').length > 1 && (
                <div>
                  <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>City</label>
                  <select
                    value={chartCity || effectiveSelectedCity}
                    onChange={e => setChartCity(e.target.value)}
                    style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
                  >
                    {[STATEWIDE_LABEL, ...selectedCities.filter(c => c !== 'Statewide')].map(c => (
                      <option key={c} value={c}>{c === STATEWIDE_LABEL ? 'MA Statewide' : c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Top {topN} countries of origin · <strong style={{ color: '#fff' }}>{effectiveChartCity === STATEWIDE_LABEL ? 'MA Statewide' : effectiveChartCity}</strong> · 2024 ACS
            </p>

            <ResponsiveContainer width="100%" height={topN * 28 + 40}>
              <BarChart data={byCountryChartData} layout="vertical" margin={{ left: 160, right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" tick={{ fill: '#aaa', fontSize: 11 }} />
                <YAxis dataKey="country" type="category" tick={{ fill: '#ccc', fontSize: 11 }} width={155} />
                <Tooltip
                  formatter={(val, name, props) => [
                    `${val.toLocaleString()} (${props.payload.share.toFixed(1)}% of FB pop)`,
                    'Estimate',
                  ]}
                  contentStyle={{ background: '#1e1e2e', border: '1px solid #444', color: '#fff' }}
                  itemStyle={{ color: ACCENT }}
                  labelStyle={{ color: '#fff' }}
                />
                <Bar dataKey="estimate" radius={[0, 4, 4, 0]}>
                  {byCountryChartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? ACCENT2 : ACCENT} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Search a country across cities */}
          <div style={{ borderTop: '1px solid #2a2a3a', paddingTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#ccc' }}>
              Search a country across cities
              {searchScopeCities && (
                <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                  · filtered to {[...searchScopeCities].join(', ')}
                </span>
              )}
            </h3>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', maxWidth: '360px', flex: '1 1 320px', zIndex: 20 }}>
                <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                  Country of origin
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cambodia, Portugal, Haiti..."
                  value={countrySearch}
                  onChange={e => { setCountrySearch(e.target.value); setIsSuggestionOpen(true) }}
                  onFocus={() => setIsSuggestionOpen(true)}
                  onBlur={() => setTimeout(() => setIsSuggestionOpen(false), 100)}
                  style={{
                    width: '100%', background: '#1e1e2e', color: '#fff',
                    border: '1px solid #444', borderRadius: '6px',
                    padding: '0.4rem 0.6rem', fontSize: '0.9rem',
                  }}
                />
                {isSuggestionOpen && suggestions.length > 0 && (
                  <ul style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: '#2a2a3d', border: '1px solid #444', borderRadius: '6px',
                    margin: 0, padding: '0.25rem 0', listStyle: 'none', zIndex: 9999,
                  }}>
                    {suggestions.map(s => (
                      <li
                        key={s}
                        onMouseDown={e => { e.preventDefault(); setCountrySearch(s); setIsSuggestionOpen(false) }}
                        style={{ padding: '0.35rem 0.75rem', cursor: 'pointer', color: '#ccc', fontSize: '0.85rem' }}
                        onMouseEnter={e => e.target.style.background = '#3a3a5c'}
                        onMouseLeave={e => e.target.style.background = 'transparent'}
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Show top</label>
                <select
                  value={topNCountry}
                  onChange={e => setTopNCountry(Number(e.target.value))}
                  style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
                >
                  {[10, 15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {byCountrySearchData.length > 0 ? (
              <>
                <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  <strong style={{ color: '#fff' }}>{byCountrySearchData[0]?.country}</strong>
                  {' '}· top {topNCountry} cities{gatewayOnly ? ' (Gateway only)' : ''} · 2024 ACS
                </p>
                <ResponsiveContainer width="100%" height={byCountrySearchData.length * 32 + 40}>
                  <BarChart data={byCountrySearchData} layout="vertical" margin={{ left: 110, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" tick={{ fill: '#aaa', fontSize: 11 }} />
                    <YAxis dataKey="city" type="category" tick={{ fill: '#ccc', fontSize: 11 }} width={105} />
                    <Tooltip
                      formatter={val => [`${val.toLocaleString()}`, 'Estimate']}
                      contentStyle={{ background: '#1e1e2e', border: '1px solid #444', color: '#fff' }}
                      itemStyle={{ color: ACCENT }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="estimate" radius={[0, 4, 4, 0]}>
                      {byCountrySearchData.map((row, i) => (
                        <Cell key={i} fill={i === 0 ? ACCENT2 : (gatewayCitySet.has(row.city) ? ACCENT : OTHER_COLOR)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : countrySearch.length >= 2 ? (
              <p style={{ color: '#aaa' }}>No matching country found. Try "Cambodia", "Haiti", or "Portugal".</p>
            ) : (
              <p style={{ color: '#555' }}>Start typing a country name above.</p>
            )}
          </div>
        </>
      )}

      {/* ── By Continent ── */}
      {mode === 'by_continent' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {selectedCities.filter(c => c !== 'Statewide').length > 1 && (
              <div>
                <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>City</label>
                <select
                  value={chartCity || effectiveSelectedCity}
                  onChange={e => setChartCity(e.target.value)}
                  style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
                >
                  {[STATEWIDE_LABEL, ...selectedCities.filter(c => c !== 'Statewide')].map(c => (
                    <option key={c} value={c}>{c === STATEWIDE_LABEL ? 'MA Statewide' : c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Continent breakdown · <strong style={{ color: '#fff' }}>{effectiveChartCity === STATEWIDE_LABEL ? 'MA Statewide' : effectiveChartCity}</strong> · 2024 ACS
          </p>

          <ResponsiveContainer width="100%" height={Math.max(300, byContinentData.length * 42 + 40)}>
            <BarChart data={byContinentData} layout="vertical" margin={{ left: 140, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis type="number" tick={{ fill: '#aaa', fontSize: 11 }} />
              <YAxis dataKey="continent" type="category" tick={{ fill: '#ccc', fontSize: 11 }} width={130} />
              <Tooltip
                formatter={(val) => [`${Number(val).toLocaleString()}`, 'Estimate']}
                contentStyle={{ background: '#1e1e2e', border: '1px solid #444', color: '#fff' }}
                itemStyle={{ color: ACCENT }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="estimate" radius={[0, 4, 4, 0]}>
                {byContinentData.map((row, i) => (
                  <Cell key={i} fill={CONTINENT_COLORS[row.continent] || OTHER_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '0.6rem', fontSize: '1rem' }}>
              Historical Trend · {effectiveChartCity === STATEWIDE_LABEL ? 'MA Statewide' : effectiveChartCity}
            </h3>

            {continentTrendLoading ? (
              <p style={{ color: '#888', fontSize: '0.85rem' }}>Loading trend...</p>
            ) : continentTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={continentTrendData} margin={{ top: 8, right: 120, left: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="year" tick={{ fill: '#aaa', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#aaa', fontSize: 11 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  />
                  <Tooltip
                    itemSorter={(item) => -(Number(item?.value) || 0)}
                    formatter={(val, name) => [Number(val).toLocaleString(), name]}
                    contentStyle={{ background: '#1e1e2e', border: '1px solid #444', color: '#fff' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  {CONTINENT_ORDER.map((continent) => (
                    <Line
                      key={continent}
                      type="monotone"
                      dataKey={continent}
                      stroke={CONTINENT_COLORS[continent]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      label={(props) => {
                        const { x, y, index, value } = props
                        if (index !== continentTrendData.length - 1) return null
                        if (value == null || value === 0) return null
                        return (
                          <text x={x + 6} y={y} fill={CONTINENT_COLORS[continent]} fontSize={11} dominantBaseline="middle">
                            {continent}
                          </text>
                        )
                      }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#888', fontSize: '0.85rem' }}>No historical trend data available.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}