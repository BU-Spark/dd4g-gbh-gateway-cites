import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  fetchForeignBorn,
  fetchCountryOfOrigin,
  fetchMedianIncome,
  fetchForeignBornCharacteristics,
  fetchStateProfile,
  fetchStateCountryOfOrigin,
} from '../api/cities'

const STATEWIDE_KEY = '__MA_STATEWIDE__'
const DEFAULT_CITY = STATEWIDE_KEY

const STAT_KEYS = [
  { key: 'fb_pct',                       label: 'Foreign-Born %',                format: '%', fbOnly: false },
  { key: 'fb_bachelors_pct',             label: "Bachelor's degree or higher %", format: '%', fbOnly: true  },
  { key: 'fb_homeownership_pct',         label: 'Homeownership %',               format: '%', fbOnly: true  },
  { key: 'fb_median_household_income',   label: 'Median Household Income',       format: '$', fbOnly: true  },
  { key: 'median_income_foreign_born',   label: 'Median Income',                 format: '$', fbOnly: true  },
]

const REGION_ORDER = ['Europe', 'Asia', 'Africa', 'Oceania', 'Latin America', 'Northern America', 'Other']

const CITY_COLORS = [
  '#732487', '#2652b2', '#ad40d9', '#bf0f0f', '#4f1c59',
  '#2b72f6', '#ea0051', '#ffc21b',
]

const formatVal = (v, fmt) =>
  v == null
    ? 'N/A'
    : fmt === '$'
      ? `$${Number(v).toLocaleString()}`
      : `${Number(v).toFixed(1)}%`

const cleanCountryLabel = (label) => String(label || '').replace(/:$/, '').trim()

const normalizeRegion = (row) => {
  const rawRegion = String(row.region || '').replace(/:$/, '').trim()
  if (['Africa', 'Asia', 'Europe', 'Oceania', 'Latin America', 'Northern America'].includes(rawRegion)) return rawRegion
  return 'Other'
}

const wrapAxisLabel = (value, maxChars = 23, maxLines = 2) => {
  const words = String(value || '').split(/\s+/)
  const lines = []
  let current = ''

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      return
    }
    if (current) lines.push(current)
    current = word
  })
  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\.*$/, '')}...`
  return kept
}

const WrappedCountryTick = ({ x, y, payload }) => {
  const lines = wrapAxisLabel(payload?.value)
  return (
    <text x={x - 6} y={y} textAnchor="end" fill="#6f6f6f" fontSize={11}>
      {lines.map((line, index) => (
        <tspan key={line} x={x - 6} dy={index === 0 ? 0 : 13}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

const downloadCSV = (filename, rows) => {
  if (!rows || !rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','),
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

const FbBadge = () => (
  <span style={{
    marginLeft: '0.4rem', color: '#4f1c59', fontSize: '0.65rem',
    background: '#edd4f5', borderRadius: '4px', padding: '1px 5px',
    verticalAlign: 'middle',
  }}>
    Foreign-born
  </span>
)

const OriginScopeBadge = () => (
  <span style={{
    marginLeft: '0.5rem', color: '#2652b2', fontSize: '0.7rem',
    background: '#e5f1ff', borderRadius: '4px', padding: '2px 6px',
    verticalAlign: 'middle', fontWeight: 600,
  }}>
    Total foreign-born population
  </span>
)

export default function CityProfile({
  selectedCities,
  embed = false,
  placeTypeFilter = 'all',
  allCities = [],
}) {
  const citiesToShow = useMemo(() => {
    if (selectedCities.length > 0) {
      return selectedCities.map((city) => (city === 'Statewide' ? DEFAULT_CITY : city))
    }
    if (placeTypeFilter === 'gateway' || placeTypeFilter === 'other') {
      return allCities
        .filter((city) => city.city_type === placeTypeFilter && city.city && city.city !== 'Statewide')
        .map((city) => city.city)
        .sort((a, b) => a.localeCompare(b))
    }
    return [DEFAULT_CITY]
  }, [selectedCities, placeTypeFilter, allCities])

  const [profiles, setProfiles] = useState([])
  const [groupSize, setGroupSize] = useState(0)
  const [stateBenchmark, setStateBenchmark] = useState(null)
  const [origins, setOrigins] = useState({})
  const [regionOrigins, setRegionOrigins] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    let cancelled = false

    const applyProfiles = (profs, origs, regionOrigs, state) => {
      if (cancelled) return
      setGroupSize(profs.length)
      const shown = profs.length > 30
        ? [...profs].sort((a, b) => (Number(b.fb_pct) || 0) - (Number(a.fb_pct) || 0)).slice(0, 15)
        : profs
      setProfiles(shown)
      setOrigins(origs)
      setRegionOrigins(regionOrigs)
      setStateBenchmark({
        fb_pct: state?.fb_pct,
        fb_bachelors_pct: state?.fb_bachelors_pct,
        fb_homeownership_pct: state?.fb_homeownership_pct,
        fb_median_household_income: state?.fb_median_household_income,
        median_income_foreign_born: state?.median_income_foreign_born,
        year: state?.year,
      })
      setLoading(false)
    }

    if (citiesToShow.length > 30 && !citiesToShow.includes(STATEWIDE_KEY)) {
      const wanted = new Set(citiesToShow)
      Promise.all([
        fetchForeignBorn(),
        fetchForeignBornCharacteristics(),
        fetchMedianIncome(),
        fetchStateProfile(),
      ])
        .then(([fbRows, charRows, medRows, state]) => {
          const fbByCity = new Map((fbRows || []).map((row) => [row.city, row]))
          const charByCity = new Map((charRows || []).map((row) => [row.city, row]))
          const medByCity = new Map((medRows || []).map((row) => [row.city, row]))
          const profs = citiesToShow
            .filter((city) => wanted.has(city))
            .map((city) => {
              const fbRow = fbByCity.get(city) || {}
              const charRow = charByCity.get(city) || {}
              const medRow = medByCity.get(city) || {}
              return {
                city,
                city_type: fbRow.city_type || charRow.city_type || 'other',
                fb_pct: fbRow.fb_pct,
                fb_bachelors_pct: charRow.fb_bachelors_pct,
                fb_homeownership_pct: charRow.fb_homeownership_pct,
                fb_median_household_income: charRow.fb_median_household_income,
                median_income_foreign_born: medRow.median_income_foreign_born,
              }
            })
          applyProfiles(profs, {}, {}, state)
        })
        .catch((err) => {
          if (cancelled) return
          console.error('Failed to load city profile:', err)
          setError(err?.message || 'Failed to load Overview data')
          setLoading(false)
        })
      return () => { cancelled = true }
    }

    const buildOriginBreakdowns = (orig) => {
      const originRows = (orig || [])
        .map((row) => ({ ...row, country: cleanCountryLabel(row.country) }))
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

      const regions = REGION_ORDER
        .map((reg) => ({
          region: reg,
          estimate: regionTotals.get(reg) || 0,
          share: totalOrigins > 0 ? ((regionTotals.get(reg) || 0) / totalOrigins) * 100 : 0,
        }))
        .filter((r) => r.estimate > 0)
        .sort((a, b) => b.estimate - a.estimate)

      const topOrigins = originRows
        .slice()
        .sort((a, b) => b.estimate - a.estimate)
        .slice(0, 10)
        .map((row) => ({
          ...row,
          share: totalOrigins > 0 ? (Number(row.estimate) / totalOrigins) * 100 : 0,
        }))
      return { topOrigins, regions }
    }

    const cityFetches = citiesToShow.map((city) => {
      if (city === STATEWIDE_KEY) {
        return Promise.all([fetchStateProfile(), fetchStateCountryOfOrigin()]).then(
          ([stateProfile, stateOrigins]) => {
            const { topOrigins, regions } = buildOriginBreakdowns(stateOrigins)
            return {
              profile: {
                city: 'Massachusetts',
                city_type: 'state',
                fb_pct: stateProfile?.fb_pct,
                fb_bachelors_pct: stateProfile?.fb_bachelors_pct,
                fb_homeownership_pct: stateProfile?.fb_homeownership_pct,
                fb_median_household_income: stateProfile?.fb_median_household_income,
                median_income_foreign_born: stateProfile?.median_income_foreign_born,
                year: stateProfile?.year,
              },
              origins: topOrigins,
              regions,
            }
          },
        )
      }

      return Promise.all([
        fetchForeignBorn({ city }),
        fetchForeignBornCharacteristics(city),
        fetchCountryOfOrigin(city),
        fetchMedianIncome(city),
      ]).then(([fb, chars, orig, med]) => {
        const fbRow  = Array.isArray(fb)  ? fb[0]  : fb
        const charRow = Array.isArray(chars) ? chars[0] : chars
        const medRow = Array.isArray(med) ? med[0] : med

        const { topOrigins, regions } = buildOriginBreakdowns(orig)

        return {
          profile: {
            city,
            city_type: fbRow?.city_type || charRow?.city_type || 'other',
            fb_pct: fbRow?.fb_pct,
            fb_bachelors_pct: charRow?.fb_bachelors_pct,
            fb_homeownership_pct: charRow?.fb_homeownership_pct,
            fb_median_household_income: charRow?.fb_median_household_income,
            median_income_foreign_born: medRow?.median_income_foreign_born,
          },
          origins: topOrigins,
          regions,
        }
      })
    })

    Promise.all([...cityFetches, fetchStateProfile()])
      .then((results) => {
        const state = results.pop()
        const profs = []
        const origs = {}
        const regionOrigs = {}

        results.forEach((r) => {
          profs.push(r.profile)
          origs[r.profile.city] = r.origins
          regionOrigs[r.profile.city] = r.regions
        })

        applyProfiles(profs, origs, regionOrigs, state)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load city profile:', err)
        setError(err?.message || 'Failed to load Overview data')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [citiesToShow])

  useEffect(() => {
    const handleDownload = (event) => {
      if (event.detail?.tab !== 'Overview') return
      if (!profiles.length) return

      const profileRows = profiles.map((p) => ({
        city: p.city,
        city_type: p.city_type,
        fb_pct: p.fb_pct,
        fb_bachelors_pct: p.fb_bachelors_pct,
        fb_homeownership_pct: p.fb_homeownership_pct,
        fb_median_household_income: p.fb_median_household_income,
        median_income_foreign_born: p.median_income_foreign_born,
        ma_state_fb_pct: stateBenchmark?.fb_pct,
        ma_state_fb_bachelors_pct: stateBenchmark?.fb_bachelors_pct,
        ma_state_fb_homeownership_pct: stateBenchmark?.fb_homeownership_pct,
        ma_state_fb_median_household_income: stateBenchmark?.fb_median_household_income,
        ma_state_median_income_foreign_born: stateBenchmark?.median_income_foreign_born,
      }))

      const originRows = profiles.flatMap((p) =>
        (origins[p.city] || []).map((row) => ({
          city: p.city,
          country: row.country,
          estimate: row.estimate,
          share: row.share,
        })),
      )

      downloadCSV('city_profile_metrics.csv', profileRows)
      if (originRows.length) {
        setTimeout(() => downloadCSV('city_profile_origins.csv', originRows), 150)
      }
    }

    window.addEventListener('download-active-tab', handleDownload)
    return () => window.removeEventListener('download-active-tab', handleDownload)
  }, [profiles, origins, stateBenchmark])

  if (loading) return <div className="placeholder"><p>Loading...</p></div>
  if (error) return <div className="placeholder"><p style={{ color: '#bf0f0f' }}>{error}</p></div>
  if (profiles.length === 0) return <div className="placeholder"><p>No profile data available.</p></div>

  const isSingle = profiles.length === 1
  const profile = profiles[0]

  return (
    <div style={{ padding: '1rem' }}>
      {isSingle ? (
        <>
          <h2 style={{ marginBottom: '0.25rem' }}>{profile.city}</h2>
          <p style={{ color: '#6f6f6f', marginBottom: '1.5rem', textTransform: 'capitalize' }}>
            {profile.city_type === 'state' ? 'Statewide' : `${profile.city_type} City`}
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            {STAT_KEYS.map((s) => {
              const val = profile[s.key]
              const stVal = stateBenchmark?.[s.key]
              const diff = val != null && stVal != null ? val - stVal : null

              return (
                <div
                  key={s.key}
                  style={{
                    background: '#fcf4ff',
                    border: '1px solid #edd4f5',
                    borderRadius: '8px',
                    padding: '1rem',
                    minWidth: '160px',
                    flex: '1',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#6f6f6f' }}>
                    {s.label}
                    {s.fbOnly && <FbBadge />}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#361247' }}>
                    {formatVal(val, s.format)}
                  </div>
                  {stVal != null && (
                    <div style={{
                      fontSize: '0.9rem', color: '#6f6f6f', marginTop: '0.5rem',
                      borderTop: '1px solid #edd4f5', paddingTop: '0.5rem',
                    }}>
                      <span>MA Statewide (foreign-born): {formatVal(stVal, s.format)}</span>
                      {diff != null && (
                        <span style={{
                          marginLeft: '0.5rem',
                          color: diff >= 0 ? '#68ac4d' : '#bf0f0f',
                          fontWeight: 600,
                        }}>
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

          {!embed && origins[profile.city]?.length > 0 && (
            <>
              <h3 style={{ marginBottom: '0.75rem' }}>
                Top Countries of Origin
                <OriginScopeBadge />
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={origins[profile.city]}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 190, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                  <XAxis type="number" tick={{ fill: '#6f6f6f' }} />
                  <YAxis dataKey="country" type="category" tick={<WrappedCountryTick />} width={185} interval={0} />
                  <Tooltip
                    formatter={(val, name, props) => [
                      `${Number(val).toLocaleString()} (${props.payload.share.toFixed(1)}%)`,
                      'Estimate',
                    ]}
                    contentStyle={{ background: '#ffffff', border: '1px solid #dadada', color: '#373737' }}
                  />
                  <Bar dataKey="estimate" fill="#732487" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          {!embed && regionOrigins[profile.city]?.length > 0 && (
            <>
              <h3 style={{ marginBottom: '0.75rem', marginTop: '2rem' }}>
                Regions of Origin
                <OriginScopeBadge />
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(260, (regionOrigins[profile.city].length || 1) * 40 + 40)}>
                <BarChart
                  data={regionOrigins[profile.city]}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 130, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
                  <XAxis type="number" tick={{ fill: '#6f6f6f' }} tickFormatter={(v) => v.toLocaleString()} />
                  <YAxis dataKey="region" type="category" tick={{ fill: '#6f6f6f' }} width={160} interval={0} />
                  <Tooltip
                    formatter={(val, name, props) => [
                      `${Number(val).toLocaleString()} (${props.payload.share.toFixed(1)}%)`,
                      'Estimate',
                    ]}
                    contentStyle={{ background: '#ffffff', border: '1px solid #dadada', color: '#373737' }}
                  />
                  <Bar dataKey="estimate" fill="#4f1c59" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </>
      ) : (
        <>
          <h2 style={{ marginBottom: '0.25rem' }}>
            {groupSize > profiles.length
              ? (placeTypeFilter === 'other' ? 'Other municipalities' : 'Gateway Cities')
              : 'City Comparison'}
          </h2>
          <p style={{ color: '#6f6f6f', marginBottom: '1.5rem' }}>
            {groupSize > profiles.length
              ? `Top ${profiles.length} of ${groupSize} places in this filter, ranked by foreign-born share.`
              : profiles.map((p) => p.city).join(' vs ')}
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {profiles.map((p, i) => (
              <span key={p.city} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#454545', fontSize: '0.85rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: CITY_COLORS[i % CITY_COLORS.length], display: 'inline-block' }} />
                {p.city}
              </span>
            ))}
            {stateBenchmark && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#6f6f6f', fontSize: '0.85rem' }}>
                <span style={{ width: 12, height: 2, background: '#6f6f6f', display: 'inline-block', alignSelf: 'center' }} />
                MA Statewide
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #dadada' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#6f6f6f' }}>Metric</th>
                  {profiles.map((p, i) => (
                    <th key={p.city} style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: CITY_COLORS[i % CITY_COLORS.length] }}>
                      {p.city}
                    </th>
                  ))}
                  {stateBenchmark && (
                    <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: '#6f6f6f' }}>MA Statewide (foreign-born)</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {STAT_KEYS.map((s) => (
                  <tr key={s.key} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#454545' }}>
                      {s.label}
                      {s.fbOnly && <FbBadge />}
                    </td>
                    {profiles.map((p) => (
                      <td key={p.city} style={{ textAlign: 'right', padding: '0.6rem 0.5rem', color: '#373737', fontWeight: 600 }}>
                        {formatVal(p[s.key], s.format)}
                      </td>
                    ))}
                    {stateBenchmark && (
                      <td style={{ textAlign: 'right', padding: '0.6rem 0.5rem', color: '#6f6f6f' }}>
                        {formatVal(stateBenchmark[s.key], s.format)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(() => {
            const allRegions = REGION_ORDER.filter((reg) =>
              profiles.some((p) => (regionOrigins[p.city] || []).some((r) => r.region === reg)),
            )
            if (!allRegions.length) return null
            return (
              <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>
                  Region of Origin Breakdown (Share of Foreign-Born)
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #dadada' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#6f6f6f' }}>Region</th>
                      {profiles.map((p, i) => (
                        <th key={p.city} style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: CITY_COLORS[i % CITY_COLORS.length] }}>
                          {p.city}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allRegions.map((reg) => (
                      <tr key={reg} style={{ borderBottom: '1px solid #f2f2f2' }}>
                        <td style={{ padding: '0.6rem 0.5rem', color: '#454545' }}>{reg}</td>
                        {profiles.map((p) => {
                          const row = (regionOrigins[p.city] || []).find((r) => r.region === reg) || null
                          return (
                            <td key={p.city} style={{ textAlign: 'right', padding: '0.6rem 0.5rem', color: '#373737' }}>
                              {row?.share == null ? 'N/A' : `${row.share.toFixed(1)}%`}
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
              .map((p, i) => ({ city: p.city, value: p[s.key], fill: CITY_COLORS[i % CITY_COLORS.length] }))
              .filter((d) => d.value != null)
            if (chartData.length === 0) return null
            return (
              <div key={s.key} style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
                  {s.label}
                  {s.fbOnly && <FbBadge />}
                </h3>
                <ResponsiveContainer width="100%" height={chartData.length * 40 + 40}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 110, right: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#6f6f6f', fontSize: 11 }}
                      tickFormatter={(v) => s.format === '$' ? `$${v.toLocaleString()}` : `${v.toFixed(1)}%`}
                    />
                    <YAxis dataKey="city" type="category" tick={{ fill: '#454545', fontSize: 12 }} width={105} />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', border: '1px solid #dadada', borderRadius: 6 }}
                      formatter={(v) => [formatVal(v, s.format), s.label]}
                    />
                    {stateBenchmark?.[s.key] != null && (
                      <CartesianGrid horizontalPoints={[]} verticalPoints={[stateBenchmark[s.key]]} stroke="#6f6f6f" strokeDasharray="6 3" />
                    )}
                    <Bar
                      dataKey="value"
                      radius={[0, 4, 4, 0]}
                      label={{ position: 'right', fill: '#6f6f6f', fontSize: 11, formatter: (v) => formatVal(v, s.format) }}
                      shape={(props) => <rect {...props} fill={props.fill || '#732487'} rx={3} />}
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
