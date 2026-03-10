import json, urllib.request, urllib.parse, os

GATEWAY_CITIES = {
    "Attleboro", "Barnstable", "Brockton", "Chelsea", "Chicopee",
    "Everett", "Fall River", "Fitchburg", "Haverhill", "Holyoke",
    "Lawrence", "Leominster", "Lowell", "Lynn", "Malden",
    "Methuen", "New Bedford", "Peabody", "Pittsfield", "Quincy",
    "Revere", "Salem", "Springfield", "Taunton", "Westfield", "Worcester"
}

def matches(props):
    basename = props.get("BASENAME", "")
    normalized = basename.replace(" Town", "").strip()
    return normalized in GATEWAY_CITIES

base = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query"
params = urllib.parse.urlencode({
    "where": "STATE='25'",
    "outFields": "NAME,GEOID,BASENAME",
    "outSR": "4326",
    "f": "geojson",
    "resultRecordCount": "2000",
})

with urllib.request.urlopen(f"{base}?{params}") as r:
    data = json.loads(r.read())

filtered = [f for f in data["features"] if matches(f["properties"])]
print(f"Matched {len(filtered)} Gateway Cities:")
for f in filtered:
    print(" ", f["properties"]["BASENAME"], "->", f["properties"]["GEOID"])

data["features"] = filtered
os.makedirs("public/data", exist_ok=True)
with open("public/data/gateway_cities.geojson", "w") as fh:
    json.dump(data, fh)
print("Saved -> public/data/gateway_cities.geojson")

