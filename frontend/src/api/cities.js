const API_BASE_URL = import.meta.env.VITE_API_URL || "";

async function fetchJson(path, options = {}) {
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

export async function fetchCountryOfOrigin(city) {
  return fetchJson(`/api/country-of-origin?city=${encodeURIComponent(city)}`);
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

export async function fetchChat(message) {
  return fetchJson("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
}
