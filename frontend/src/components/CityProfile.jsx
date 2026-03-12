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

export default function CityProfile({ selectedCities }) {
  const citiesToShow = selectedCities.length > 0 ? selectedCities : [DEFAULT_CITY]
  const [profiles, setProfiles] = useState([])
  const [stateAvg, setStateAvg] = useState(null)
  const [origins, setOrigins] = useState({})
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
          origins: (orig || [])
            .map((row) => ({
              ...row,
              country: cleanCountryLabel(row.country),
            }))
            .filter((row) => row.country && row.estimate != null)
            .sort((a, b) => b.estimate - a.estimate)
            .slice(0, 10),
        }
      })
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

        results.forEach((r) => {
          profs.push(r.profile)
          origs[r.profile.city] = r.origins
        })

        setProfiles(profs)
        setOrigins(origs)
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
              <ResponsiveContainer width="100%" height={340}>
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
                    tick={{ fill: '#aaa', fontSize: 13 }}
                    width={125}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1e1f2e',
                      border: '1px solid #2a2a3a',
                      borderRadius: 6,
                    }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(value) => [Number(value).toLocaleString(), 'Estimate']}
                  />
                  <Bar dataKey="estimate" fill="#4e9af1" radius={[0, 4, 4, 0]} />
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
                  <BarChart data={chartData} layout="vertical" margin={{ left: 150, right: 80 }}>
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
                      width={140}
                      interval={0}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1e1f2e',
                        border: '1px solid #2a2a3a',
                        borderRadius: 6,
                      }}
                      formatter={(v) => [formatVal(v, s.format), s.label]}
                    />
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