import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import cityCoordinates from "../data/cityCoordinates"

export default function MapView({ stats = [], selectedCities = [], onCityClick }) {
  console.log("MAP DATA:", stats);
  const safeStats = stats
  .map(row => ({
    city: row.city,
    coords: cityCoordinates[row.city],
    fb_pct: Number(row.fb_pct)
  }))
  .filter(row => row.coords)
  

  const getRadius = (pct) => Math.max(8, Math.min(20, pct / 2));

  const getColor = (pct) => {
    if (pct >= 40) return "#0f766e";
    if (pct >= 30) return "#17795b";
    if (pct >= 20) return "#4b5563";
    if (pct >= 10) return "#94a3b8";
    return "#cbd5e1";
  };

  return (
    <div className="map-shell" style={{ width: "100%" }}>
      <div className="map-debug">
        Valid mapped cities: {safeStats.length}
      </div>

      <div className="map-container">
        <MapContainer
          center={[42.3, -71.4]}
          zoom={8}
          scrollWheelZoom={true}
          className="map-leaflet"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {safeStats.map((city) => (
            <CircleMarker
              key={city.city}
              center={city.coords}
              radius={getRadius(city.fb_pct)}
              pathOptions={{
                color: selectedCities.includes(city.city)
                  ? "#ffffff"
                  : getColor(city.fb_pct),
                fillColor: getColor(city.fb_pct),
                fillOpacity: 0.85,
                weight: selectedCities.includes(city.city) ? 3 : 1.5,
              }}
              eventHandlers={{
                click: () => onCityClick(city.city),
              }}
            >
              <Tooltip>
                <div>
                  <strong>{city.city}</strong>
                  <br />
                  Foreign-born %: {city.fb_pct.toFixed(1)}%
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}