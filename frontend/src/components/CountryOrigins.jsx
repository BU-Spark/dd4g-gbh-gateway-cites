import { useEffect, useState, useMemo } from 'react'
import { fetchCountryOfOrigin, fetchStateCountryOfOrigin } from '../api/cities'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'

const ACCENT = '#4e9af1'
const ACCENT2 = '#f1914e'
const OTHER_COLOR = '#bfc4cf'
const STATEWIDE_LABEL = 'Massachusetts (Statewide)'
const GATEWAY_LABEL = 'Gateway Cities (Combined)'

const NORTH_AMERICA_ORIGINS = new Set([
  'Bahamas',
  'Barbados',
  'Belize',
  'Canada',
  'Costa Rica',
  'Cuba',
  'Dominica',
  'Dominican Republic',
  'El Salvador',
  'Grenada',
  'Guatemala',
  'Haiti',
  'Honduras',
  'Jamaica',
  'Mexico',
  'Nicaragua',
  'Panama',
  'St. Lucia',
  'St. Vincent and the Grenadines',
  'Trinidad and Tobago',
])

const SOUTH_AMERICA_ORIGINS = new Set([
  'Argentina',
  'Bolivia',
  'Brazil',
  'Chile',
  'Colombia',
  'Ecuador',
  'Guyana',
  'Peru',
  'Uruguay',
  'Venezuela',
])

const NON_COUNTRY_LABELS = new Set([
  'Africa',
  'Europe',
  'Americas',
  'Asia',
  'Oceania',
  'Northern America',
  'Latin America',
  'Caribbean',
  'Central America',
  'South America',
  'Eastern Asia',
  'Western Asia',
  'Southern Asia',
  'South Eastern Asia',
  'Middle Africa',
  'Eastern Africa',
  'Western Africa',
  'Northern Africa',
  'Southern Africa',
  'Eastern Europe',
  'Western Europe',
  'Northern Europe',
  'Southern Europe',
  'South Central Asia',
  'USSR',
  'Other areas of birth',
  'Born at sea',
])

const isRealCountry = (name) => {
  if (!name) return false
  return !NON_COUNTRY_LABELS.has(String(name).trim())
}

const REGION_OPTIONS = [
  { value: 'all',       label: 'All regions' },
  { value: 'Africa',    label: 'Africa' },
  { value: 'North America', label: 'North America' },
  { value: 'South America', label: 'South America' },
  { value: 'Asia',      label: 'Asia' },
  { value: 'Europe',    label: 'Europe' },
  { value: 'Oceania',   label: 'Oceania' },
]

export default function CountryOrigins({ allCities = [] }) {
  const [mode, setMode] = useState('by_city')
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(true)
  const [gatewayOnly, setGatewayOnly] = useState(false)

  const cityTypeByName = useMemo(() => {
    const map = new Map()
    allCities.forEach((c) => {
      if (c?.city) map.set(c.city, c.city_type || 'other')
    })
    return map
  }, [allCities])

  const gatewayCitySet = useMemo(() => {
    return new Set(
      allCities
        .filter(c => c?.city && c?.city_type === 'gateway')
        .map(c => c.city)
    )
  }, [allCities])

  const cityNames = useMemo(() => {
    return [
      STATEWIDE_LABEL,
      GATEWAY_LABEL,
      ...new Set(allCities.map(c => c.city).filter(Boolean)).values(),
    ]
  }, [allCities])

  const [selectedCity, setSelectedCity] = useState(STATEWIDE_LABEL)
  const [countrySearch, setCountrySearch] = useState('')
  const [topN, setTopN] = useState(15)
  const [topNCountry, setTopNCountry] = useState(15)
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false)
  const effectiveSelectedCity = cityNames.includes(selectedCity)
    ? selectedCity
    : STATEWIDE_LABEL

const [region, setRegion] = useState('all')

const filteredData = useMemo(() => {
  if (region === 'all') return allData

  if (region === 'North America') {
    return allData.filter(
      r => r.region === 'America' && NORTH_AMERICA_ORIGINS.has(String(r.country).trim())
    )
  }

  if (region === 'South America') {
    return allData.filter(
      r => r.region === 'America' && SOUTH_AMERICA_ORIGINS.has(String(r.country).trim())
    )
  }

  return allData.filter(r => r.region === region)
}, [allData, region])

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
          totals.set(key, {
            country,
            region,
            estimate,
            city: cityLabel,
            city_type: cityType,
          })
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
        const cityRows = results
          .flat()
          .map((row) => ({
            ...row,
            city_type: row.city_type || cityTypeByName.get(row.city) || 'other',
          }))
        const gatewayRows = cityRows.filter(row => gatewayCitySet.has(row.city))

        const rows = [
          ...(statewideRows || []).map(row => ({
            ...row,
            city: STATEWIDE_LABEL,
            city_type: 'state',
          })),
          ...aggregateByCountry(gatewayRows, GATEWAY_LABEL, 'gateway'),
          ...cityRows,
        ]
          .filter(r => r.estimate > 0 && isRealCountry(r.country))

        setAllData(rows)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load country data:', err)
        setLoading(false)
      })
  }, [cityNames, cityTypeByName, gatewayCitySet])

  const byCityData = useMemo(() => {
    const rows = filteredData.filter(r => r.city === effectiveSelectedCity && r.estimate > 0)
    const total = rows.reduce((s, r) => s + r.estimate, 0)
    return rows
      .map(r => ({ ...r, share: total > 0 ? (r.estimate / total) * 100 : 0 }))
      .sort((a, b) => b.estimate - a.estimate)
      .slice(0, topN)
  }, [effectiveSelectedCity, filteredData, topN])

  const byCountryData = useMemo(() => {
    if (!countrySearch.trim()) return []
    const q = countrySearch.toLowerCase()
    const byCountryRows = filteredData.filter(
      (r) => r.city !== STATEWIDE_LABEL && r.city !== GATEWAY_LABEL
    )
    const scopedRows = gatewayOnly
      ? byCountryRows.filter((r) => gatewayCitySet.has(r.city))
      : byCountryRows

    const matched = [...new Set(
      scopedRows.filter(r => r.country?.toLowerCase().includes(q)).map(r => r.country)
    )]
    if (!matched.length) return []
    const country = matched.find(c => c.toLowerCase() === q) || matched[0]
    return scopedRows
      .filter(r => r.country === country && r.estimate > 0)
      .sort((a, b) => b.estimate - a.estimate)
      .slice(0, topNCountry)
  }, [filteredData, countrySearch, gatewayCitySet, gatewayOnly, topNCountry])

  const suggestions = useMemo(() => {
    if (!countrySearch.trim() || countrySearch.length < 2) return []
    const q = countrySearch.toLowerCase()
    const byCountryRows = filteredData.filter(
      (r) => r.city !== STATEWIDE_LABEL && r.city !== GATEWAY_LABEL
    )
    const scopedRows = gatewayOnly
      ? byCountryRows.filter((r) => gatewayCitySet.has(r.city))
      : byCountryRows

    return [...new Set(scopedRows.map(r => r.country))]
      .filter(c => c?.toLowerCase().includes(q))
      .sort()
      .slice(0, 8)
  }, [filteredData, countrySearch, gatewayCitySet, gatewayOnly])


  if (loading) {
    return <div className="placeholder"><p>Loading country data...</p></div>
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Country of Origin</h2>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[['by_city', 'By City'], ['by_country', 'By Country']].map(([val, label]) => (
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
              transition: 'all 0.15s',
            }}
          >
            {gatewayOnly ? 'Showing Gateway Only' : 'Show Gateway Only'}
          </button>
        )}
      </div>

      {mode === 'by_city' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                City
              </label>
              <select
                value={effectiveSelectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
              >
                {cityNames.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                Show top
              </label>
              <select
                value={topN}
                onChange={e => setTopN(Number(e.target.value))}
                style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
              >
                {[10, 15, 20, 30].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* ← NEW: Region dropdown */}
            <div>
              <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                Region
              </label>
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
              >
                {REGION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Top {topN} countries of origin · {effectiveSelectedCity} · 2024 ACS
          </p>

          <ResponsiveContainer width="100%" height={topN * 28 + 40}>
            <BarChart data={byCityData} layout="vertical" margin={{ left: 160, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis type="number" tick={{ fill: '#aaa', fontSize: 11 }} />
              <YAxis dataKey="country" type="category" tick={{ fill: '#ccc', fontSize: 11 }} width={155} />
              <Tooltip
                formatter={(val, name, props) => [
                  `${val.toLocaleString()} (${props.payload.share.toFixed(1)}% of FB pop)`,
                  'Estimate'
                ]}
                contentStyle={{ background: '#1e1e2e', border: '1px solid #444', color: '#fff' }}
                itemStyle={{ color: ACCENT }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="estimate" radius={[0, 4, 4, 0]}>
                {byCityData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? ACCENT2 : ACCENT} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}


      {mode === 'by_country' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', maxWidth: '360px', flex: '1 1 320px', zIndex: 20 }}>
              <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                Search country of origin
              </label>
              <input
                type="text"
                placeholder="e.g. Cambodia, Portugal, Haiti..."
                value={countrySearch}
                onChange={e => {
                  setCountrySearch(e.target.value)
                  setIsSuggestionOpen(true)
                }}
                onFocus={() => setIsSuggestionOpen(true)}
                onBlur={() => {
                  setTimeout(() => setIsSuggestionOpen(false), 100)
                }}
                style={{
                  width: '100%',
                  background: '#1e1e2e',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  fontSize: '0.9rem'
                }}
              />
              {isSuggestionOpen && suggestions.length > 0 && (
                <ul style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#2a2a3d',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  margin: 0,
                  padding: '0.25rem 0',
                  listStyle: 'none',
                  zIndex: 9999
                }}>
                  {suggestions.map(s => (
                    <li
                      key={s}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setCountrySearch(s)
                        setIsSuggestionOpen(false)
                      }}
                      style={{
                        padding: '0.35rem 0.75rem',
                        cursor: 'pointer',
                        color: '#ccc',
                        fontSize: '0.85rem'
                      }}
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
              <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                Show top
              </label>
              <select
                value={topNCountry}
                onChange={e => setTopNCountry(Number(e.target.value))}
                style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
              >
                {[10, 15, 20, 30].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {byCountryData.length > 0 ? (
            <>
              <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <strong style={{ color: '#fff' }}>{byCountryData[0]?.country}</strong>
                {' '}· top {topNCountry} places by estimate{gatewayOnly ? ' (Gateway only)' : ''} · 2024 ACS
              </p>
              <ResponsiveContainer width="100%" height={byCountryData.length * 32 + 40}>
                <BarChart data={byCountryData} layout="vertical" margin={{ left: 110, right: 60 }}>
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
                    {byCountryData.map((row, i) => (
                      <Cell
                        key={i}
                        fill={i === 0 ? ACCENT2 : (gatewayCitySet.has(row.city) ? ACCENT : OTHER_COLOR)}
                      />
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
        </>
      )}
    </div>
  )
}