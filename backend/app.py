from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import os
try:
    from backend.services import data_store, chat_service
except ModuleNotFoundError:
    # Supports running as: python backend/app.py
    from services import data_store, chat_service

load_dotenv()

app = Flask(__name__)

CORS(
    app,
    resources={r"/api/*": {"origins": "*"}}
)

@app.get("/api/health")
def health():
    return jsonify({"ok": True})

@app.get("/api/cities")
def cities():
    return jsonify(data_store.get_cities_master())

@app.get("/api/foreign-born")
def foreign_born():
    city      = request.args.get("city")
    city_type = request.args.get("city_type")
    return jsonify(data_store.get_foreign_born(city=city, city_type=city_type))

@app.get("/api/country-of-origin")
def country_of_origin():
    city = request.args.get("city")
    all_years = request.args.get("all_years") == "1"
    return jsonify(data_store.get_country_of_origin(city=city, latest_only=not all_years))


@app.get("/api/continent-trend")
def continent_trend():
    scope = request.args.get("scope", "state")
    return jsonify(data_store.get_country_of_origin_trend(scope=scope))

@app.get("/api/education")
def education():
    city = request.args.get("city")
    return jsonify(data_store.get_education(city=city))

@app.get("/api/homeownership")
def homeownership():
    city = request.args.get("city")
    return jsonify(data_store.get_homeownership(city=city))

@app.get("/api/employment-income")
def employment_income():
    city = request.args.get("city")
    return jsonify(data_store.get_employment_income(city=city))

@app.get("/api/poverty")
def poverty():
    city = request.args.get("city")
    return jsonify(data_store.get_poverty(city=city))

@app.get("/api/median-income")
def median_income():
    city = request.args.get("city")
    return jsonify(data_store.get_median_income(city=city))

@app.get("/api/map-stats")
def map_stats():
    return jsonify(data_store.get_map_stats())

@app.get("/api/time-series")
def time_series():
    city   = request.args.get("city")
    metric = request.args.get("metric", "fb_pct")
    return jsonify(data_store.get_time_series(city=city, metric=metric))


@app.get("/api/state-profile")
def state_profile():
    return jsonify(data_store.get_state_profile())


@app.get("/api/state-country-of-origin")
def state_country_of_origin():
    return jsonify(data_store.get_state_country_of_origin())


@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Missing message"}), 400
    try:
        return jsonify(chat_service.chat(message))
    except Exception as e:
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
            return jsonify(
                {
                    "answer": (
                        "The Gemini API key is configured, but the project has no available "
                        "Gemini quota (RESOURCE_EXHAUSTED). Please enable billing or switch "
                        "to a project / key with active Gemini quota, then try again."
                    )
                }
            ), 200
        if "NOT_FOUND" in msg and "gemini" in msg.lower():
            return jsonify(
                {
                    "answer": (
                        "The configured Gemini model name is not available for this project. "
                        "Please confirm that the model 'gemini-1.5-flash' is enabled for your "
                        "API key, or switch to another supported Gemini model."
                    )
                }
            ), 200
        return jsonify(
            {
                "answer": (
                    "The chatbot backend hit an internal error. "
                    f"Details: {msg}"
                )
            }
        ), 200

print("RUNNING FILE:", os.path.abspath(__file__))
print("URL MAP:", app.url_map)

if __name__ == "__main__":

    port = int(os.environ.get("PORT", 3000))
    print(f"Running at http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
    
