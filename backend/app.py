from flask import Flask, jsonify, request
from flask_cors import CORS
from services import data_store

app = Flask(__name__)
CORS(app)

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
    return jsonify(data_store.get_country_of_origin(city=city))

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

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 3000))
    print(f"Running at http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
