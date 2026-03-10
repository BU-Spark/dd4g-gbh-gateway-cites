import { useEffect, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid
} from 'recharts'
import { fetchForeignBorn, fetchEmploymentIncome, fetchEducation, fetchHomeownership } from '../api/cities'

const COLORS = {
  gateway: '#4e9af1',
  comparison: '#f1a14e',
  benchmark: '#a14ef1',
}

export default function PerCapitaComparison({ selectedCities, allCities }) {
  const [data, setData] = useState([])
  const [metric, setMetric] = useState('fb_pct')
  const [loading, setLoading] = useState(false)

  const METRICS = [
    { key: 'fb_pct',             label: 'Foreign-Born %' },
    { key: 'unemployment_rate',  label: 'Unemployment Rate %' },
    { key: 'bachelors_pct',      label: "Bachelor's Degree %" },
    { key: 'homeownership_pct',  label: 'Homeownership %' },
    { key: 'median_household_income', label: 'Median Household Income' },
  ]

  useEffect(() => {
    setLoading(true)
    const citiesToFetch = selectedCities.length > 0 ? selectedCities : allCities.map(c => c.city)

    Promise.all([
      fetchForeignBorn(),
      fetchEmploymentIncome(),
      fetchEducation(),
      fetchHomeownership(),
    ]).then(([fb, emp, edu, own]) => {
      const merged = citiesToFetch.map(city => {
        const fbRow  = fb.find(r => r.city === city) || {}
        const empRow = emp.find(r => r.city === city) || {}
        const eduRow = edu.find(r => r.city === city) || {}
        const ownRow = own.find(r => r.city === city) || {}
        return {
          city,
          city_type: fbRow.city_type || 'gateway',
          fb_pct:               fbRow.fb_pct,
          unemployment_rate:    empRow.unemployment_rate,
          bachelors_pct:        eduRow.bachelors_pct,
          homeownership_pct:    ownRow.homeownership_pct,
          median_household_income: empRow.median_household_income,
        }
      })
      setData(merged.filter(d => d[metric] != null))
      setLoading(false)
    })
  }, [selectedCities, allCities])

  const sorted = [...data]
    .filter(d => d[metric] != null)
    .sort((a, b) => b[metric] - a[metric])

  const selectedMetric = METRICS.find(m => m.key === metric)

  return (
    <div>
      <div className="comparison-controls">
        <h2>Per Capita Comparison — {selectedMetric.label}</h2>
        <div className="metric-pills">
          {METRICS.map(m => (
            <button
              key={m.key}
              className={`pill ${metric === m.key ? 'active' : ''}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {selectedCities.length === 0 && (
          <p className="hint">Showing all cities · Select cities in sidebar to filter</p>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <ResponsiveContainer width="100%" height={sorted.length * 32 + 60}>
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 10, right: 80, left: 110, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: '#888', fontSize: 11 }}
              tickFormatter={v => metric === 'median_household_income' ? `$${v.toLocaleString()}` : `${v.toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="city"
              tick={{ fill: '#ccc', fontSize: 11 }}
              width={105}
            />
            <Tooltip
              contentStyle={{ background: '#1e1f2e', border: '1px solid #2a2a3a', borderRadius: 6 }}
              labelStyle={{ color: '#fff' }}
              formatter={(v) => metric === 'median_household_income'
                ? [`$${v.toLocaleString()}`, selectedMetric.label]
                : [`${v.toFixed(1)}%`, selectedMetric.label]
              }
            />
            <Bar dataKey={metric} radius={[0, 4, 4, 0]}
              fill="#4e9af1"
              label={{ position: 'right', fill: '#aaa', fontSize: 11,
                formatter: v => metric === 'median_household_income'
                  ? `$${v.toLocaleString()}`
                  : `${v?.toFixed(1)}%`
              }}
              shape={(props) => {
                const { city_type } = props
                return <rect {...props} fill={COLORS[city_type] || '#4e9af1'} rx={3} />
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
