import { useEffect, useState } from 'react'
import { fetchCities, fetchForeignBorn, fetchMapStats } from './api/cities'
import './App.css'
import PerCapitaComparison from './components/PerCapitaComparison'
import CityProfile from './components/CityProfile'
import MapView from './components/MapView'

export default function App() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [cities, setCities] = useState([])
  const [selectedCities, setSelectedCities] = useState([])
  const [foreignBorn, setForeignBorn] = useState([])
  const [mapStats, setMapStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCities().then(data => {
      setCities(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    fetchMapStats().then(setMapStats)
  }, [])

  useEffect(() => {
    if (selectedCities.length === 0) {
      fetchForeignBorn().then(setForeignBorn)
    } else {
      Promise.all(selectedCities.map(c => fetchForeignBorn({ city: c })))
        .then(results => setForeignBorn(results.flat()))
    }
  }, [selectedCities])

  const toggleCity = (city) => {
    setSelectedCities(prev =>
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    )
  }

  const sorted = [...foreignBorn].sort((a, b) => b.fb_pct - a.fb_pct)

  if (loading) return <div className="loading">Loading...</div>

  return (
    <div className="app">
      <header className="header">
        <h1>Gateway Cities: Foreign-Born Population</h1>
        <p>ACS 5-Year Estimates · Massachusetts · 2024</p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h3>Filter Cities</h3>
          <div className="city-type-group">
            <p className="type-label gateway">● Gateway Cities</p>
            <p className="type-label comparison">● Comparison Cities</p>
            <p className="type-label benchmark">● Benchmark</p>
          </div>
          <div className="city-list">
            {cities.map(c => (
              <button
                key={c.city}
                className={`city-btn ${c.city_type} ${selectedCities.includes(c.city) ? 'active' : ''}`}
                onClick={() => toggleCity(c.city)}
              >
                {c.city}
              </button>
            ))}
          </div>
          {selectedCities.length > 0 && (
            <button className="clear-btn" onClick={() => setSelectedCities([])}>
              Clear selection
            </button>
          )}
        </aside>

        <main className="main">
          <div className="tabs">
            {['Overview', 'Per Capita Comparison', 'City Profile', 'Map'].map(tab => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Overview' && (
            <>
              <h2>
                Foreign-Born % of Population
                {selectedCities.length > 0 ? ` — ${selectedCities.join(', ')}` : ' — All Cities'}
              </h2>
              <div className="bar-chart">
                {sorted.map(d => (
                  <div key={d.city} className="bar-row">
                    <span className="bar-label">{d.city}</span>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${d.city_type}`}
                        style={{ width: `${Math.min(d.fb_pct, 60) / 60 * 100}%` }}
                      />
                    </div>
                    <span className="bar-value">{d.fb_pct?.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'Per Capita Comparison' && (
            <PerCapitaComparison
              selectedCities={selectedCities}
              allCities={cities}
            />
          )}

          {activeTab === 'City Profile' && (
            <CityProfile
              selectedCities={selectedCities}
            />
          )}

          {activeTab === 'Map' && (
            <MapView
              stats={mapStats}
              selectedCities={selectedCities}
              onCityClick={toggleCity}
            />
          )}
        </main>

      </div>
    </div>
  )
}

