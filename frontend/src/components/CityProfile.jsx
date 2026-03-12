import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  fetchForeignBorn,
  fetchEmploymentIncome,
  fetchEducation,
  fetchHomeownership,
  fetchCountryOfOrigin,
} from '../api/cities'

const DEFAULT_CITY = 'Boston'

const STAT_KEYS = [
  { key: 'fb_pct', label: 'Foreign-Born %', format: '%' },
  { key: 'unemployment_rate', label: 'Unemployment Rate %', format: '%' },
  { key: 'bachelors_pct', label: "Bachelor's Degree %", format: '%' },
  { key: 'homeownership_pct', label: 'Homeownership %', format: '%' },
  { key: 'median_household_income', label: 'Median Household Income', format: '$' },
]

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

const REGION_ORDER = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Other',
]

const CITY_COLORS = [
  '#4e9af1', '#f0a64a', '#a78bfa', '#34d399', '#f87171',
  '#facc15', '#38bdf8', '#fb923c',
]

const formatVal = (v, fmt) =>
  v == null
    ? 'N/A'
    : fmt === '$'
      ? `$${Number(v).toLocaleString()}`
      : `${Number(v).toFixed(1)}%`

const averageOf = (rows, key) => {
  const vals = (rows || [])
    .map((row) => Number(row?.[key]))
    .filter((v) => Number.isFinite(v))

  if (!vals.length) return null
  return vals.reduce((sum, v) => sum + v, 0) / vals.length
}

const cleanCountryLabel = (label) =>
  String(label || '').replace(/:$/, '').trim()

const normalizeRegion = (row) => {
  const rawRegion = String(row.region || '').replace(/:$/, '').trim()
  const country = cleanCountryLabel(row.country)

  if (rawRegion === 'America') {
    if (NORTH_AMERICA_ORIGINS.has(country)) return 'North America'
    if (SOUTH_AMERICA_ORIGINS.has(country)) return 'South America'
  }

  if (['Africa', 'Asia', 'Europe', 'Oceania'].includes(rawRegion)) {
    return rawRegion
  }

  return 'Other'
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

export default function CityProfile({ selectedCities }) {
  const citiesToShow = selectedCities.length > 0 ? selectedCities : [DEFAULT_CITY]
  const [profiles, setProfiles] = useState([])
  const [stateAvg, setStateAvg] = useState(null)
  const [origins, setOrigins] = useState({})
  const [regionOrigins, setRegionOrigins] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)

    const cityFetches = citiesToShow.map((city) =>
      Promise.all([
        fetchForeignBorn({ city }),
        fetchEmploymentIncome(city),
        fetchEducation(city),
        fetchHomeownership(city),
        fetchCountryOfOrigin(city),
      ]).then(([fb, emp, edu, own, orig]) => {
        const fbRow = Array.isArray(fb) ? fb[0] : fb
        const empRow = Array.isArray(emp) ? emp[0] : emp
        const eduRow = Array.isArray(edu) ? edu[0] : edu
        const ownRow = Array.isArray(own) ? own[0] : own

        const originRows = (orig || [])
          .map((row) => ({
            ...row,
            country: cleanCountryLabel(row.country),
          }))
          .filter((row) => row.country && row.estimate != null)

        const regionTotals = new Map()
        let totalOrigins = 0

        originRows.forEach((row) => {
          const est = Number(row.estimate) || 0
          if (!est) return
          const reg = normalizeRegion(row)
          totalOrigins += est
          regionTotals.set(reg, (regionTotals.get(reg) || 0) + est)
        })

        const regions = REGION_ORDER.map((reg) => {
          const est = regionTotals.get(reg) || 0
          return {
            region: reg,
            estimate: est,
            share: totalOrigins > 0 ? (est / totalOrigins) * 100 : 0,
          }
        }).filter((r) => r.estimate > 0)

        const topOrigins = originRows
          .slice()
          .sort((a, b) => b.estimate - a.estimate)
          .slice(0, 10)

        return {
          profile: {
            city,
            city_type: fbRow?.city_type || 'other',
            fb_pct: fbRow?.fb_pct,
            unemployment_rate: empRow?.unemployment_rate,
            median_household_income: empRow?.median_household_income,
            bachelors_pct: eduRow?.bachelors_pct,
            homeownership_pct: ownRow?.homeownership_pct,
          },
          origins: topOrigins,
          regions,
        }
      }),
    )

    Promise.all([
      ...cityFetches,
      fetchForeignBorn(),
      fetchEmploymentIncome(),
      fetchEducation(),
      fetchHomeownership(),
    ])
      .then((results) => {
        const allOwn = results.pop()
        const allEdu = results.pop()
        const allEmp = results.pop()
        const allFb = results.pop()

        const profs = []
        const origs = {}
        const regionOrigs = {}

        results.forEach((r) => {
          profs.push(r.profile)
          origs[r.profile.city] = r.origins
          regionOrigs[r.profile.city] = r.regions
        })

        setProfiles(profs)
        setOrigins(origs)
        setRegionOrigins(regionOrigs)
        setStateAvg({
          fb_pct: averageOf(allFb, 'fb_pct'),
          unemployment_rate: averageOf(allEmp, 'unemployment_rate'),
          bachelors_pct: averageOf(allEdu, 'bachelors_pct'),
          homeownership_pct: averageOf(allOwn, 'homeownership_pct'),
          median_household_income: averageOf(allEmp, 'median_household_income'),
        })
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load city profile:', err)
        setLoading(false)
      })
  }, [citiesToShow.join(',')])

  useEffect(() => {
    const handleDownload = (event) => {
      if (event.detail?.tab !== 'City Profile') return
      if (!profiles.length) return

      const profileRows = profiles.map((p) => ({
        city: p.city,
        city_type: p.city_type,
        fb_pct: p.fb_pct,
        unemployment_rate: p.unemployment_rate,
        bachelors_pct: p.bachelors_pct,
        homeownership_pct: p.homeownership_pct,
        median_household_income: p.median_household_income,
        ma_avg_fb_pct: stateAvg?.fb_pct,
        ma_avg_unemployment_rate: stateAvg?.unemployment_rate,
        ma_avg_bachelors_pct: stateAvg?.bachelors_pct,
        ma_avg_homeownership_pct: stateAvg?.homeownership_pct,
        ma_avg_median_household_income: stateAvg?.median_household_income,
      }))

      const originRows = profiles.flatMap((p) =>
        (origins[p.city] || []).map((row) => ({
          city: p.city,
          country: row.country,
          estimate: row.estimate,
        })),
      )

      downloadCSV('city_profile_metrics.csv', profileRows)

      if (originRows.length) {
        setTimeout(() => {
          downloadCSV('city_profile_origins.csv', originRows)
        }, 150)
      }
    }

    window.addEventListener('download-active-tab', handleDownload)
    return () => window.removeEventListener('download-active-tab', handleDownload)
  }, [profiles, origins, stateAvg])

  if (loading || profiles.length === 0) {
    return (
      <div className="placeholder">
        <p>Loading...</p>
      </div>
    )
  }

  const isSingle = profiles.length === 1
  const profile = profiles[0]

  return (
    <div style={{ padding: '1rem' }}>
      {isSingle ? (
        <>
          <h2 style={{ marginBottom: '0.25rem' }}>{profile.city}</h2>
          <p style={{ color: '#aaa', marginBottom: '1.5rem', textTransform: 'capitalize' }}>
            {profile.city_type} City
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {STAT_KEYS.map((s) => {
              const val = profile[s.key]
              const stVal = stateAvg?.[s.key]
              const diff = val != null && stVal != null ? val - stVal : null

              return (
                <div
                  key={s.key}
                  style={{
                    background: '#1e1e2e',
                    borderRadius: '8px',
                    padding: '1rem',
                    minWidth: '160px',
                    flex: '1',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#aaa' }}>{s.label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>
                    {formatVal(val, s.format)}
                  </div>
                  {stVal != null && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#888',
                        marginTop: '0.5rem',
                        borderTop: '1px solid #2a2a3a',
                        paddingTop: '0.5rem',
                      }}
                    >
                      <span>MA Avg: {formatVal(stVal, s.format)}</span>
                      {diff != null && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            color: diff >= 0 ? '#4ade80' : '#f87171',
                            fontWeight: 600,
                          }}
                        >
                          {s.format === '$'
                            ? `${diff >= 0 ? '+' : '-'}$${Math.abs(Math.round(diff)).toLocaleString()}`
                            : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pp`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {origins[profile.city]?.length > 0 && (
            <>
              <h3 style={{ marginBottom: '0.75rem' }}>Top Countries of Origin</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={origins[profile.city]}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 115, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" tick={{ fill: '#aaa' }} />
                  <YAxis
                    dataKey="country"
                    type="category"
                    tick={{ fill: '#aaa' }}
                    width={150}
                    interval={0}
                  />
                  <Tooltip />
                  <Bar dataKey="estimate" fill="#4e9af1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
          {regionOrigins[profile.city]?.length > 0 && (
            <>
              <h3 style={{ marginBottom: '0.75rem', marginTop: '2rem' }}>Regions of Origin</h3>
              <ResponsiveContainer
                width="100%"
                height={Math.max(260, (regionOrigins[profile.city].length || 1) * 40 + 40)}
              >
                <BarChart
                  data={regionOrigins[profile.city]}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 130, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis
                    type="number"
                    tick={{ fill: '#aaa' }}
                    tickFormatter={(v) => v.toLocaleString()}
                  />
                  <YAxis
                    dataKey="region"
                    type="category"
                    tick={{ fill: '#aaa' }}
                    width={160}
                    interval={0}
                  />
                  <Tooltip
                    formatter={(val, name, props) => [
                      `${Number(val).toLocaleString()} (${props.payload.share.toFixed(1)}%)`,
                      'Estimate',
                    ]}
                    contentStyle={{
                      background: '#1e1e2e',
                      border: '1px solid #444',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="estimate" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </>
      ) : (
        <>
          <h2 style={{ marginBottom: '0.25rem' }}>City Comparison</h2>
          <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>
            {profiles.map((p) => p.city).join(' vs ')}
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {profiles.map((p, i) => (
              <span
                key={p.city}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: '#ccc',
                  fontSize: '0.85rem',
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: CITY_COLORS[i % CITY_COLORS.length],
                    display: 'inline-block',
                  }}
                />
                {p.city}
              </span>
            ))}
            {stateAvg && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: '#888',
                  fontSize: '0.85rem',
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 2,
                    background: '#888',
                    display: 'inline-block',
                    alignSelf: 'center',
                  }}
                />
                MA State Avg
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #2a2a3a' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#aaa' }}>Metric</th>
                  {profiles.map((p, i) => (
                    <th
                      key={p.city}
                      style={{
                        textAlign: 'right',
                        padding: '0.75rem 0.5rem',
                        color: CITY_COLORS[i % CITY_COLORS.length],
                      }}
                    >
                      {p.city}
                    </th>
                  ))}
                  {stateAvg && (
                    <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: '#888' }}>
                      MA Avg
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {STAT_KEYS.map((s) => (
                  <tr key={s.key} style={{ borderBottom: '1px solid #1e1e2e' }}>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#ccc' }}>{s.label}</td>
                    {profiles.map((p) => (
                      <td
                        key={p.city}
                        style={{
                          textAlign: 'right',
                          padding: '0.6rem 0.5rem',
                          color: '#fff',
                          fontWeight: 600,
                        }}
                      >
                        {formatVal(p[s.key], s.format)}
                      </td>
                    ))}
                    {stateAvg && (
                      <td style={{ textAlign: 'right', padding: '0.6rem 0.5rem', color: '#888' }}>
                        {formatVal(stateAvg[s.key], s.format)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(() => {
            const allRegions = REGION_ORDER.filter((reg) =>
              profiles.some((p) =>
                (regionOrigins[p.city] || []).some((r) => r.region === reg),
              ),
            )

            if (!allRegions.length) return null

            return (
              <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>
                  Region of Origin Breakdown (Share of Foreign-Born)
                </h3>
                <table
                  style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}
                >
                  <thead>
                    <tr style={{ borderBottom: '2px solid #2a2a3a' }}>
                      <th
                        style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#aaa' }}
                      >
                        Region
                      </th>
                      {profiles.map((p, i) => (
                        <th
                          key={p.city}
                          style={{
                            textAlign: 'right',
                            padding: '0.75rem 0.5rem',
                            color: CITY_COLORS[i % CITY_COLORS.length],
                          }}
                        >
                          {p.city}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allRegions.map((reg) => (
                      <tr key={reg} style={{ borderBottom: '1px solid #1e1e2e' }}>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#ccc' }}>{reg}</td>
                        {profiles.map((p) => {
                          const row =
                            (regionOrigins[p.city] || []).find((r) => r.region === reg) || null
                          const share = row?.share
                          return (
                            <td
                              key={p.city}
                              style={{
                                textAlign: 'right',
                                padding: '0.6rem 0.5rem',
                                color: '#fff',
                              }}
                            >
                              {share == null ? 'N/A' : `${share.toFixed(1)}%`}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}

          {STAT_KEYS.map((s) => {
            const chartData = profiles
              .map((p, i) => ({
                city: p.city,
                value: p[s.key],
                fill: CITY_COLORS[i % CITY_COLORS.length],
              }))
              .filter((d) => d.value != null)

            if (chartData.length === 0) return null

            return (
              <div key={s.key} style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>{s.label}</h3>
                <ResponsiveContainer width="100%" height={chartData.length * 40 + 40}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 110, right: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#888', fontSize: 11 }}
                      tickFormatter={(v) =>
                        s.format === '$' ? `$${v.toLocaleString()}` : `${v.toFixed(1)}%`
                      }
                    />
                    <YAxis
                      dataKey="city"
                      type="category"
                      tick={{ fill: '#ccc', fontSize: 12 }}
                      width={105}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1e1f2e',
                        border: '1px solid #2a2a3a',
                        borderRadius: 6,
                      }}
                      formatter={(v) => [formatVal(v, s.format), s.label]}
                    />
                    {stateAvg?.[s.key] != null && (
                      <CartesianGrid
                        horizontalPoints={[]}
                        verticalPoints={[stateAvg[s.key]]}
                        stroke="#888"
                        strokeDasharray="6 3"
                      />
                    )}
                    <Bar
                      dataKey="value"
                      radius={[0, 4, 4, 0]}
                      label={{
                        position: 'right',
                        fill: '#aaa',
                        fontSize: 11,
                        formatter: (v) => formatVal(v, s.format),
                      }}
                      shape={(props) => (
                        <rect {...props} fill={props.fill || '#4e9af1'} rx={3} />
                      )}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}