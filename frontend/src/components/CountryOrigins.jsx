import { useEffect, useState, useMemo } from 'react'
import { fetchCountryOfOrigin } from '../api/cities'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'

const GATEWAY_CITIES = [
  'Attleboro','Barnstable','Brockton','Chelsea','Chicopee',
  'Everett','Fall River','Fitchburg','Haverhill','Holyoke',
  'Lawrence','Leominster','Lowell','Lynn','Malden',
  'Methuen','New Bedford','Peabody','Pittsfield','Quincy',
  'Revere','Salem','Springfield','Taunton','Westfield','Worcester'
]

const ACCENT = '#4e9af1'
const ACCENT2 = '#f1914e'

export default function CountryOrigins({ selectedCities }) {
  const [mode, setMode] = useState('by_city')          // 'by_city' | 'by_country'
  const [allData, setAllData] = useState([])            // all rows for selected/all cities
  const [loading, setLoading] = useState(true)

  const [selectedCity, setSelectedCity] = useState(
    selectedCities.length === 1 ? selectedCities[0] : 'Lowell'
  )
  const [countrySearch, setCountrySearch] = useState('')
  const [topN, setTopN] = useState(15)

  // Sync city picker when sidebar selection changes to exactly 1
  useEffect(() => {
    if (selectedCities.length === 1) setSelectedCity(selectedCities[0])
  }, [selectedCities])

  // Fetch all gateway city data once
  useEffect(() => {
    setLoading(true)
    Promise.all(GATEWAY_CITIES.map(c => fetchCountryOfOrigin(c)))
      .then(results => {
        setAllData(results.flat())
        setLoading(false)
      })
  }, [])

  // --- By City: top N countries for selected city ---
  const byCityData = useMemo(() => {
    const rows = allData.filter(r => r.city === selectedCity && r.estimate > 0)
    const total = rows.reduce((s, r) => s + r.estimate, 0)
    return rows
      .map(r => ({ ...r, share: total > 0 ? (r.estimate / total * 100) : 0 }))
      .sort((a, b) => b.estimate - a.estimate)
      .slice(0, topN)
  }, [allData, selectedCity, topN])

  // --- By Country: all cities for searched country ---
  const byCountryData = useMemo(() => {
    if (!countrySearch.trim()) return []
    const q = countrySearch.toLowerCase()
    const matched = [...new Set(
      allData
        .filter(r => r.country?.toLowerCase().includes(q))
        .map(r => r.country)
    )]
    if (!matched.length) return []
    // Use the first exact or closest match
    const country = matched.find(c => c.toLowerCase() === q) || matched[0]
    return allData
      .filter(r => r.country === country && r.estimate > 0)
      .sort((a, b) => b.estimate - a.estimate)
  }, [allData, countrySearch])

  // Country autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!countrySearch.trim() || countrySearch.length < 2) return []
    const q = countrySearch.toLowerCase()
    return [...new Set(allData.map(r => r.country))]
      .filter(c => c?.toLowerCase().includes(q))
      .sort()
      .slice(0, 8)
  }, [allData, countrySearch])

  if (loading) return <div className="placeholder"><p>Loading country data...</p></div>

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Country of Origin</h2>

      {/* Mode toggle */}
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
      </div>

      {/* ── BY CITY MODE ── */}
      {mode === 'by_city' && (
        <>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>City</label>
              <select
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: '6px', padding: '0.35rem 0.6rem' }}
              >
                {GATEWAY_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
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
          </div>

          <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Top {topN} countries of origin · {selectedCity} · 2024 ACS
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

      {/* ── BY COUNTRY MODE ── */}
      {mode === 'by_country' && (
        <>
          <div style={{ position: 'relative', maxWidth: '360px', marginBottom: '1.5rem' }}>
            <label style={{ color: '#aaa', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
              Search country of origin
            </label>
            <input
              type="text"
              placeholder="e.g. Cambodia, Portugal, Haiti..."
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
              style={{
                width: '100%', background: '#1e1e2e', color: '#fff',
                border: '1px solid #444', borderRadius: '6px',
                padding: '0.4rem 0.6rem', fontSize: '0.9rem'
              }}
            />
            {suggestions.length > 0 && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#2a2a3d', border: '1px solid #444', borderRadius: '6px',
                margin: 0, padding: '0.25rem 0', listStyle: 'none', zIndex: 10
              }}>
                {suggestions.map(s => (
                  <li
                    key={s}
                    onClick={() => setCountrySearch(s)}
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

          {byCountryData.length > 0 ? (
            <>
              <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <strong style={{ color: '#fff' }}>{byCountryData[0]?.country}</strong>
                {' '}· foreign-born residents across Gateway Cities · 2024 ACS
              </p>
              <ResponsiveContainer width="100%" height={byCountryData.length * 32 + 40}>
                <BarChart data={byCountryData} layout="vertical" margin={{ left: 110, right: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" tick={{ fill: '#aaa', fontSize: 11 }} />
                  <YAxis dataKey="city" type="category" tick={{ fill: '#ccc', fontSize: 11 }} width={105} />
                  <Tooltip
                    formatter={val => [`${val.toLocaleString()}`, 'Estimate']}
                    contentStyle={{ background: '#1e1e2e', border: '1px solid #444', color: '#fff' }}
                  />
                  <Bar dataKey="estimate" radius={[0, 4, 4, 0]}>
                    {byCountryData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? ACCENT2 : ACCENT} />
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
