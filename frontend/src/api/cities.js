export async function fetchCities() {
  const res = await fetch('/api/cities')
  return res.json()
}

export async function fetchForeignBorn(params = {}) {
  const query = new URLSearchParams(params).toString()
  const res = await fetch(`/api/foreign-born${query ? '?' + query : ''}`)
  return res.json()
}

export async function fetchCountryOfOrigin(city) {
  const res = await fetch(`/api/country-of-origin?city=${encodeURIComponent(city)}`)
  return res.json()
}

export async function fetchEducation(city) {
  const url = city ? `/api/education?city=${encodeURIComponent(city)}` : '/api/education'
  const res = await fetch(url)
  return res.json()
}

export async function fetchEmploymentIncome(city) {
  const url = city ? `/api/employment-income?city=${encodeURIComponent(city)}` : '/api/employment-income'
  const res = await fetch(url)
  return res.json()
}

export async function fetchHomeownership(city) {
  const url = city ? `/api/homeownership?city=${encodeURIComponent(city)}` : '/api/homeownership'
  const res = await fetch(url)
  return res.json()
}

export async function fetchMapStats() {
  const res = await fetch('/api/map-stats')
  return res.json()
}

export async function fetchTimeSeries({ city, metric } = {}) {
  const params = new URLSearchParams()
  if (city)   params.set("city", city)
  if (metric) params.set("metric", metric)
  const res = await fetch(`/api/time-series?${params}`)
  return res.json()
}
