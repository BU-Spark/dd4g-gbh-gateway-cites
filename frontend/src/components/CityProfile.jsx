import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadialBarChart, RadialBar, Legend
} from 'recharts'
import {
  fetchForeignBorn, fetchEmploymentIncome,
  fetchEducation, fetchHomeownership, fetchCountryOfOrigin
} from '../api/cities'

const DEFAULT_CITY = 'Boston'

export default function CityProfile({ selectedCities }) {
  const city = selectedCities.length === 1 ? selectedCities[0] : DEFAULT_CITY
  const [profile, setProfile] = useState(null)
  const [origins, setOrigins] = useState([])

  useEffect(() => {
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
      setProfile({
        city,
        city_type: fbRow?.city_type,
        fb_pct: fbRow?.fb_pct,
        unemployment_rate: empRow?.unemployment_rate,
        median_household_income: empRow?.median_household_income,
        bachelors_pct: eduRow?.bachelors_pct,
        homeownership_pct: ownRow?.homeownership_pct,
      })
      setOrigins((orig || []).sort((a, b) => b.estimate - a.estimate).slice(0, 10))
    })
  }, [city])

  if (!profile) return <div className="placeholder"><p>Loading...</p></div>

  const stats = [
    { label: 'Foreign-Born %', value: profile.fb_pct, format: '%' },
    { label: 'Unemployment Rate %', value: profile.unemployment_rate, format: '%' },
    { label: "Bachelor's Degree %", value: profile.bachelors_pct, format: '%' },
    { label: 'Homeownership %', value: profile.homeownership_pct, format: '%' },
    { label: 'Median Household Income', value: profile.median_household_income, format: '$' },
  ]

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.25rem' }}>{profile.city}</h2>
      <p style={{ color: '#aaa', marginBottom: '1.5rem', textTransform: 'capitalize' }}>
        {profile.city_type} City
      </p>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: '#1e1e2e', borderRadius: '8px', padding: '1rem',
            minWidth: '160px', flex: '1'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#aaa' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>
              {s.format === '$'
                ? `$${Number(s.value || 0).toLocaleString()}`
                : `${Number(s.value || 0).toFixed(1)}%`}
            </div>
          </div>
        ))}
      </div>

      {/* Country of Origin Bar Chart */}
      {origins.length > 0 && (
        <>
          <h3 style={{ marginBottom: '0.75rem' }}>Top Countries of Origin</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={origins} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis type="number" tick={{ fill: '#aaa' }} />
              <YAxis dataKey="country" type="category" tick={{ fill: '#aaa' }} width={100} />
              <Tooltip />
              <Bar dataKey="estimate" fill="#4e9af1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
