import { useEffect, useRef } from 'react'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const GEOJSON_URL = '/data/gateway_cities.geojson'

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      link.setAttribute('data-leaflet', 'true')
      document.head.appendChild(link)
    }
    if (document.querySelector('script[data-leaflet]')) {
      document.querySelector('script[data-leaflet]')
        .addEventListener('load', () => resolve(window.L), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.setAttribute('data-leaflet', 'true')
    script.onload  = () => resolve(window.L)
    script.onerror = () => reject(new Error('Leaflet failed to load'))
    document.body.appendChild(script)
  })
}

// Color scale: light yellow → dark orange-red (low → high fb_pct)
function fbPctColor(pct, max) {
  if (pct == null || max === 0) return '#e5e7eb'
  const t = Math.max(0, Math.min(1, pct / max))
  const r = Math.round(254 + (185 - 254) * t)
  const g = Math.round(240 + (28  - 240) * t)
  const b = Math.round(217 + (28  - 217) * t)
  return `rgb(${r},${g},${b})`
}

export default function MapView({ stats = [], selectedCities = [], onCityClick }) {
  const mapElRef   = useRef(null)
  const mapRef     = useRef(null)
  const layerRef   = useRef(null)

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return
    let active = true

    async function init() {
      const L       = await loadLeaflet()
      const [, geo] = await Promise.all([
        Promise.resolve(),
        fetch(GEOJSON_URL).then(r => r.json()),
      ])
      if (!active || !mapElRef.current) return

      const map = L.map(mapElRef.current, {
        center: [42.15, -71.85],
        zoom: 8,
        zoomControl: true,
        scrollWheelZoom: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 14,
      }).addTo(map)

      mapRef.current  = map
      layerRef.current = L.layerGroup().addTo(map)

      renderLayer(L, map, geo, stats, selectedCities, onCityClick)
    }

    init()
    return () => { active = false }
  }, []) // only on mount

  // Re-render layer when stats, selection, or click handler changes
  useEffect(() => {
    const map = mapRef.current
    const lg  = layerRef.current
    if (!map || !lg || !window.L) return

    fetch(GEOJSON_URL)
      .then(r => r.json())
      .then(geo => renderLayer(window.L, map, geo, stats, selectedCities, onCityClick))
  }, [stats, selectedCities, onCityClick])

  return (
    <div ref={mapElRef} style={{ width: '100%', height: '520px', borderRadius: '8px' }} />
  )
}

function renderLayer(L, map, geo, stats, selectedCities, onCityClick) {
  // Build lookup: normalized city name → stat row
  const lookup = {}
  stats.forEach(s => {
    lookup[s.city?.trim().toLowerCase()] = s
  })

  const maxPct = Math.max(...stats.map(s => s.fb_pct ?? 0), 1)

  // Remove old layers
  map.eachLayer(layer => {
    if (layer._isGatewayCity) map.removeLayer(layer)
  })

  geo.features.forEach(feature => {
    const basename = feature.properties.BASENAME?.replace(' Town', '').trim()
    const stat     = lookup[basename?.toLowerCase()] ?? {}
    const isSelected = selectedCities.includes(basename)
    const pct      = stat.fb_pct ?? null

    const layer = L.geoJSON(feature, {
      style: {
        color:       isSelected ? '#1d4ed8' : '#6b7280',
        weight:      isSelected ? 2.5 : 1,
        fillColor:   fbPctColor(pct, maxPct),
        fillOpacity: 0.75,
      },
    })
    layer._isGatewayCity = true

    const label = pct != null
      ? `<strong>${basename}</strong><br/>Foreign-born: ${pct.toFixed(1)}%`
      : `<strong>${basename}</strong><br/>No data`

    layer.bindTooltip(label, { sticky: true })

    layer.on('click', () => {
      if (onCityClick) onCityClick(basename)
    })

    layer.addTo(map)
  })
}