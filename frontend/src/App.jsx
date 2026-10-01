import { useEffect, useMemo, useState } from "react";
import "./App.css";
import gbhMark from "./assets/gbh-mark.svg";
import PerCapitaComparison from "./components/PerCapitaComparison";
import CityProfile from "./components/CityProfile";
import CountryOrigins from "./components/CountryOrigins";
import TrendsView from "./components/TrendsView";
import ChatBot from "./components/ChatBot";
import InstructionsModal from "./components/InstructionsModal";
import {
  fetchCities,
  prefetchDashboardData,
} from "./api/cities";

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
  "Barnstable Town",
  "Brockton",
  "Chelsea",
  "Chicopee",
  "Everett",
  "Fall River",
  "Fitchburg",
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
  "Westfield",
  "Worcester",
]);

export default function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [cities, setCities] = useState([]);
  const [selectedCities, setSelectedCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityQuery, setCityQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [placeTypeFilter, setPlaceTypeFilter] = useState("all");

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

        setCities([...unique, { city: "Statewide", city_type: "state" }]);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load cities:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    prefetchDashboardData().catch((err) => {
      console.error("Failed to preload dashboard data:", err);
    });
  }, []);

  const toggleCity = (city) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city],
    );
  };

  const gatewayCityNames = useMemo(
    () =>
      cities
        .filter((c) => c.city_type === "gateway")
        .map((c) => c.city)
        .sort((a, b) => a.localeCompare(b)),
    [cities],
  );

  const gatewaySelectionActive =
    placeTypeFilter === "gateway" &&
    gatewayCityNames.length > 0 &&
    selectedCities.length === gatewayCityNames.length &&
    gatewayCityNames.every((city) => selectedCities.includes(city));

  const togglePlaceType = (type) => {
    if (type === "gateway") {
      if (gatewaySelectionActive) {
        setPlaceTypeFilter("all");
        setSelectedCities([]);
        return;
      }
      setPlaceTypeFilter("gateway");
      setSelectedCities(gatewayCityNames);
      return;
    }

    setPlaceTypeFilter((current) => (current === type ? "all" : type));
  };

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const sorted = [...cities].sort((a, b) => {
      // Put 'Statewide' first
      if (a.city === 'Statewide') return -1;
      if (b.city === 'Statewide') return 1;
      if (a.city_type === b.city_type) return a.city.localeCompare(b.city);
      return a.city_type === "gateway" ? -1 : 1;
    });

    const typed = placeTypeFilter === "all"
      ? sorted
      : sorted.filter((c) => c.city_type === placeTypeFilter);

    if (!q) return typed;
    return typed.filter((c) => c.city.toLowerCase().includes(q));
  }, [cities, cityQuery, placeTypeFilter]);

  const handleDownload = () => {
    window.dispatchEvent(
      new CustomEvent("download-active-tab", {
        detail: {
          tab: activeTab,
          selectedCities,
        },
      }),
    );
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="app">
      <header className="header">
        <img className="header-mark" src={gbhMark} alt="GBH" />
        <div>
          <h1>Massachusetts Immigration Data</h1>
          <p>ACS 5-Year Estimates · Massachusetts · 2020-2024</p>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h3>Filter Cities</h3>
          <p className="type-legend">
            These colors match the dots in the search list.
          </p>

          <div className="city-type-group">
            <button
              type="button"
              className={`type-filter-btn gateway ${gatewaySelectionActive ? "active" : ""}`}
              aria-pressed={gatewaySelectionActive}
              onClick={() => togglePlaceType("gateway")}
            >
              <span className="search-dot gateway">●</span>
              Gateway Cities
            </button>
            <button
              type="button"
              className={`type-filter-btn other ${placeTypeFilter === "other" ? "active" : ""}`}
              aria-pressed={placeTypeFilter === "other"}
              onClick={() => togglePlaceType("other")}
            >
              <span className="search-dot other">●</span>
              Other Municipalities
            </button>
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
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
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
              <button
                type="button"
                className="tab-btn"
                onClick={() => setShowInstructions(true)}
              >
                Instructions
              </button>
              {[
                "Overview",
                "City Metrics",
                "Origins",
                "Trends",
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

          {activeTab === "City Metrics" && (
            <PerCapitaComparison
              selectedCities={selectedCities}
              allCities={cities}
            />
          )}

          {activeTab === "Overview" && (
            <CityProfile selectedCities={selectedCities} />
          )}

          {activeTab === "Origins" && (
            <CountryOrigins
              selectedCities={selectedCities}
              allCities={cities}
            />
          )}

          {activeTab === "Trends" && (
            <TrendsView selectedCities={selectedCities} />
          )}
        </main>
      </div>

      {showInstructions && (
        <InstructionsModal onClose={() => setShowInstructions(false)} />
      )}

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
