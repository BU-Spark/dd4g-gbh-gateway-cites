import { useEffect, useMemo, useState } from "react";
import "./App.css";
import PerCapitaComparison from "./components/PerCapitaComparison";
import CityProfile from "./components/CityProfile";
import CountryOrigins from "./components/CountryOrigins";
import MapView from "./components/MapView";
import TrendsView from "./components/TrendsView";
import ChatBot from "./components/ChatBot";
import { fetchCities, fetchForeignBorn, fetchMapStats } from "./api/cities";

const normalizeCityType = (city) => {
  const cityName = String(city || "").trim();
  return GATEWAY_CITIES.has(cityName) ? "gateway" : "other";
};

const normalizeRows = (rows = []) =>
  rows.map((r) => ({
    ...r,
    city_type: normalizeCityType(r.city),
  }));

const GATEWAY_CITIES = new Set([
  "Attleboro",
  "Barnstable",
  "Brockton",
  "Chelsea",
  "Chicopee",
  "Everett",
  "Fall River",
  "Fitchburg",
  "Framingham",
  "Haverhill",
  "Holyoke",
  "Lawrence",
  "Leominster",
  "Lowell",
  "Lynn",
  "Malden",
  "Methuen",
  "New Bedford",
  "Peabody",
  "Pittsfield",
  "Quincy",
  "Revere",
  "Salem",
  "Springfield",
  "Taunton",
  "Worcester",
]);

const downloadCSV = (filename, rows) => {
  if (!rows || !rows.length) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header] ?? "";
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [cities, setCities] = useState([]);
  const [selectedCities, setSelectedCities] = useState([]);
  const [foreignBorn, setForeignBorn] = useState([]);
  const [mapStats, setMapStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityQuery, setCityQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [topN, setTopN] = useState(15);
  const [gatewayOnly, setGatewayOnly] = useState(false);

  useEffect(() => {
    fetchCities()
      .then((data) => {
        const seen = new Set();

        const unique = normalizeRows(data).filter((c) => {
          if (seen.has(c.city)) return false;
          seen.add(c.city);
          return true;
        });

        console.log("raw city types:", [
          ...new Set(data.map((c) => c.city_type)),
        ]);
        console.log("normalized city types:", [
          ...new Set(unique.map((c) => c.city_type)),
        ]);
        console.log(
          "gateway cities after normalize:",
          unique.filter((c) => c.city_type === "gateway").map((c) => c.city),
        );

        setCities(unique);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load cities:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchMapStats()
      .then((data) => setMapStats(normalizeRows(data)))
      .catch((err) => console.error("Failed to load map stats:", err));
  }, []);

  useEffect(() => {
    if (selectedCities.length === 0) {
      fetchForeignBorn()
        .then((data) => setForeignBorn(normalizeRows(data)))
        .catch((err) => console.error("Failed to load foreign born:", err));
    } else {
      Promise.all(selectedCities.map((c) => fetchForeignBorn({ city: c })))
        .then((results) => setForeignBorn(normalizeRows(results.flat())))
        .catch((err) =>
          console.error("Failed to load foreign born for cities:", err),
        );
    }
  }, [selectedCities]);

  const toggleCity = (city) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city],
    );
  };

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const sorted = [...cities].sort((a, b) => {
      if (a.city_type === b.city_type) return a.city.localeCompare(b.city);
      return a.city_type === "gateway" ? -1 : 1;
    });

    if (!q) return sorted;
    return sorted.filter((c) => c.city.toLowerCase().includes(q));
  }, [cities, cityQuery]);

  const gatewayCitySet = useMemo(() => {
    return new Set(
      cities.filter((c) => c.city_type === "gateway").map((c) => c.city),
    );
  }, [cities]);

  const sorted = [...foreignBorn]
    .map((d) => ({
      ...d,
      city_type: gatewayCitySet.has(d.city) ? "gateway" : "other",
    }))
    .sort((a, b) => (b.fb_pct ?? 0) - (a.fb_pct ?? 0));

  const overviewData = (
    gatewayOnly ? sorted.filter((d) => gatewayCitySet.has(d.city)) : sorted
  ).slice(0, topN);

  const handleDownload = () => {
    if (activeTab === "Overview") {
      const rows = overviewData.map((d) => ({
        city: d.city,
        city_type: d.city_type,
        foreign_born_pct: d.fb_pct,
        year: d.year ?? "latest",
      }));

      downloadCSV("overview_foreign_born.csv", rows);
      return;
    }

    if (activeTab === "Map") {
      const rows = mapStats.map((d) => ({
        city: d.city,
        city_type: d.city_type,
        ...d,
      }));

      downloadCSV("map_data.csv", rows);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("download-active-tab", {
        detail: {
          tab: activeTab,
          selectedCities,
          topN,
          gatewayOnly,
        },
      }),
    );
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>Massachusetts Immigration Data</h1>
        <p>ACS 5-Year Estimates · Massachusetts · 2024</p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h3>Filter Cities</h3>

          <div className="city-type-group">
            <p className="type-label gateway">● Gateway Cities</p>
            <p className="type-label other">● Other Municipalities</p>
          </div>

          <div className="city-search-wrap">
            <input
              type="text"
              className="city-search-input"
              placeholder="Search cities..."
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            />

            {searchFocused && (
              <div className="city-search-dropdown">
                {filteredCities.length > 0 ? (
                  <>
                    {!cityQuery.trim() && (
                      <div className="city-search-section-label">
                        All cities
                      </div>
                    )}

                    {filteredCities.map((c) => (
                      <button
                        key={`${c.city}-${c.city_type}-search`}
                        className={`city-search-result ${selectedCities.includes(c.city) ? "active" : ""}`}
                        onClick={() => {
                          toggleCity(c.city);
                          setCityQuery("");
                        }}
                      >
                        <span
                          className={`search-dot ${c.city_type === "gateway" ? "gateway" : "other"}`}
                        >
                          ●
                        </span>
                        {c.city}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="city-search-empty">No matching cities</div>
                )}
              </div>
            )}
          </div>

          {selectedCities.length > 0 && (
            <div className="selected-cities-list">
              {selectedCities.map((city) => {
                const cityData = cities.find((c) => c.city === city);
                return (
                  <div key={city} className="selected-city-tag">
                    <span
                      className={`search-dot ${cityData?.city_type === "gateway" ? "gateway" : "other"}`}
                    >
                      ●
                    </span>
                    <span className="selected-city-name">{city}</span>
                    <button
                      className="selected-city-remove"
                      onClick={() => toggleCity(city)}
                      aria-label={`Remove ${city}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              <button
                className="clear-btn"
                onClick={() => setSelectedCities([])}
              >
                Clear all
              </button>
            </div>
          )}
        </aside>

        <main className="main">
          <div className="tabs-row">
            <div className="tabs">
              {[
                "Overview",
                "Per Capita Comparison",
                "City Profile",
                "Origins",
                "Trends",
                "Map",
              ].map((tab) => (
                <button
                  key={tab}
                  className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            <button
              className="tab-btn download-btn"
              onClick={handleDownload}
              title={`Download ${activeTab} data`}
            >
              Download CSV
            </button>
          </div>

          {activeTab === "Overview" && (
            <>
              <h2>
                Foreign-Born % of Population
                {selectedCities.length > 0
                  ? ` — ${selectedCities.join(", ")}`
                  : " — All Cities"}
              </h2>

              <div className="overview-controls">
                <div className="overview-control-group">
                  <label htmlFor="topNSelect">Show</label>
                  <select
                    id="topNSelect"
                    className="overview-select"
                    value={topN}
                    onChange={(e) => setTopN(Number(e.target.value))}
                  >
                    <option value={10}>Top 10</option>
                    <option value={15}>Top 15</option>
                    <option value={20}>Top 20</option>
                    <option value={999}>All</option>
                  </select>
                </div>

                <button
                  className={`overview-toggle-btn ${gatewayOnly ? "active" : ""}`}
                  onClick={() => setGatewayOnly((prev) => !prev)}
                >
                  {gatewayOnly ? "Showing Gateway Only" : "Show Gateway Only"}
                </button>
              </div>

              <p style={{ color: "#888", marginBottom: "10px" }}>
                Showing {overviewData.length} rows
              </p>

              <div className="bar-chart">
                {overviewData.map((d) => (
                  <div
                    key={`${d.city}-${d.year ?? "latest"}`}
                    className="bar-row"
                  >
                    <span className="bar-label">{d.city}</span>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${d.city_type}`}
                        style={{
                          width: `${(Math.min(d.fb_pct ?? 0, 60) / 60) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="bar-value">
                      {d.fb_pct?.toFixed(1) ?? "N/A"}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "Per Capita Comparison" && (
            <PerCapitaComparison
              selectedCities={selectedCities}
              allCities={cities}
            />
          )}

          {activeTab === "City Profile" && (
            <CityProfile selectedCities={selectedCities} />
          )}

          {activeTab === "Origins" && (
            <CountryOrigins
              selectedCities={selectedCities}
              allCities={cities}
            />
          )}

          {activeTab === "Map" && (
            <>
              <h2>Gateway Cities Map</h2>
              <p
                style={{
                  marginBottom: "12px",
                  color: "#888",
                  fontSize: "0.9rem",
                }}
              >
                Loaded map rows: {mapStats.length}
              </p>
              <MapView
                stats={mapStats}
                selectedCities={selectedCities}
                onCityClick={toggleCity}
              />
            </>
          )}

          {activeTab === "Trends" && (
            <TrendsView selectedCities={selectedCities} />
          )}
        </main>
      </div>

      <ChatBot />

      <footer className="app-footer">
        <div className="app-footer-inner">
          The data presented in this dashboard was sourced from the U.S. Census Bureau's American Community Survey (ACS)
          5-Year Estimates (2012–2024), accessible at data.census.gov. ACS 5-year estimates represent period averages
          rather than point-in-time measurements and are subject to margins of error inherent in survey-based data
          collection. This dashboard was developed by a team of graduate students at Boston University for educational
          and research purposes. The findings, interpretations, and visualizations are those of the authors and do not
          represent official positions of the U.S. Census Bureau or Boston University. All data is publicly available and
          intended for public use.
        </div>
      </footer>
    </div>
  );
}
