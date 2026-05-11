const API_BASE_URL = import.meta.env.VITE_API_URL || "";
const responseCache = new Map();

async function fetchJson(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const useCache = method === "GET" && options.cache !== "no-store";
  const cacheKey = `${method}:${path}`;

  if (useCache && responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey);
  }

  const request = fetch(`${API_BASE_URL}${path}`, options)
    .then(async (res) => {
      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        throw new Error(data?.error || `Request failed: ${res.status}`);
      }

      return data;
    })
    .catch((error) => {
      if (useCache) responseCache.delete(cacheKey);
      throw error;
    });

  if (useCache) responseCache.set(cacheKey, request);
  return request;
}

export function clearApiCache() {
  responseCache.clear();
}

export function prefetchDashboardData() {
  const commonMetrics = [
    "fb_pct",
    "unemployment_rate",
    "median_income",
    "poverty_rate",
    "bachelors_pct",
    "homeownership_pct",
    "fb_income",
  ];

  const requests = [
    fetchCities(),
    fetchForeignBorn(),
    fetchMapStats(),
    fetchEducation(),
    fetchEmploymentIncome(),
    fetchHomeownership(),
    fetchMedianIncome(),
    fetchStateProfile(),
    fetchStateAverages(),
    fetchStatewideForeignBorn(),
    fetchStateCountryOfOrigin(),
    fetchContinentTrend("state"),
    fetchContinentTrend("gateway"),
    ...commonMetrics.map((metric) => fetchTimeSeries({ metric })),
  ];

  return Promise.allSettled(requests);
}

async function fetchUncachedJson(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }

  return data;
}

export async function fetchCities() {
  return fetchJson("/api/cities");
}

export async function fetchForeignBorn(params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchJson(`/api/foreign-born${query ? `?${query}` : ""}`);
}

export async function fetchStatewideForeignBorn() {
  return fetchJson("/api/statewide/foreign-born");
}

export async function fetchCountryOfOrigin(city, options = {}) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (options.allYears) params.set("all_years", "1");
  const query = params.toString();
  return fetchJson(`/api/country-of-origin${query ? `?${query}` : ""}`);
}

export async function fetchEducation(city) {
  const url = city
    ? `/api/education?city=${encodeURIComponent(city)}`
    : "/api/education";
  return fetchJson(url);
}

export async function fetchEmploymentIncome(city) {
  const url = city
    ? `/api/employment-income?city=${encodeURIComponent(city)}`
    : "/api/employment-income";
  return fetchJson(url);
}

export async function fetchHomeownership(city) {
  const url = city
    ? `/api/homeownership?city=${encodeURIComponent(city)}`
    : "/api/homeownership";
  return fetchJson(url);
}

export async function fetchMapStats() {
  return fetchJson("/api/map-stats");
}

export async function fetchTimeSeries({ city, metric } = {}) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (metric) params.set("metric", metric);

  const query = params.toString();
  return fetchJson(`/api/time-series${query ? `?${query}` : ""}`);
}

export async function fetchStateAverages() {
  return fetchJson("/api/state-averages");
}

export async function fetchStateProfile() {
  return fetchJson("/api/state-profile");
}

export async function fetchStateCountryOfOrigin() {
  return fetchJson("/api/state-country-of-origin");
}

export async function fetchContinentTrend(scope = "state") {
  return fetchJson(`/api/continent-trend?scope=${encodeURIComponent(scope)}`);
}

export async function fetchMedianIncome(city) {
  const url = city
    ? `/api/median-income?city=${encodeURIComponent(city)}`
    : "/api/median-income";
  return fetchJson(url);
}

export async function fetchChat(message) {
  return fetchUncachedJson("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
}
