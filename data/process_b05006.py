import pandas as pd

df = pd.read_csv('raw/ACSDT5Y2024.B05006-Data.csv', header=0)
labels = df.iloc[0]
data = df.iloc[1:].copy().reset_index(drop=True)

# Build code -> country name mapping
code_to_country = {}
for col in df.columns:
    if not col.endswith('E') or col in ['GEO_ID', 'NAME']:
        continue
    label = labels[col]
    if not isinstance(label, str):
        continue
    parts = label.split('!!')
    country = parts[-1].strip()
    if country.endswith(':') or country.startswith('Estimate') or country.startswith('Margin'):
        continue
    code_to_country[col] = country

# Extract city name from NAME column e.g. "Boston city, Massachusetts"
data['city'] = data['NAME'].str.replace(r'\s+(city|town),.*', '', regex=True).str.strip()
data['year'] = 2024

# Load city types from normalized places
try:
    places = pd.read_csv('processed/ACSDT5Y2024.B05010-Data.csv')[['city', 'city_type']].drop_duplicates()
    data = data.merge(places, on='city', how='left')
    data['city_type'] = data['city_type'].fillna('gateway')
except Exception:
    data['city_type'] = 'gateway'

# Melt
est_cols = [c for c in code_to_country.keys() if c in data.columns]
melted = data[['city', 'city_type', 'year'] + est_cols].melt(
    id_vars=['city', 'city_type', 'year'],
    var_name='variable',
    value_name='estimate'
)
melted['country'] = melted['variable'].map(code_to_country)
melted['estimate'] = pd.to_numeric(melted['estimate'], errors='coerce').fillna(0).astype(int)
melted = melted[melted['estimate'] > 0][['city', 'city_type', 'year', 'country', 'estimate']]
melted.to_csv('processed/country_of_origin.csv', index=False)
print(f"Done: {len(melted)} rows")
print(melted[melted['city'] == 'Boston'].nlargest(10, 'estimate'))
