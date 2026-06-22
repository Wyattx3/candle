---
name: maps-and-places
description: Find places, geocode addresses, and get directions via public mapping APIs, then present structured location results.
tags: maps, geocoding, places, directions
---

# Maps and Places

When a user wants to find places (restaurants, businesses, landmarks), geocode an address, or get directions/distance between points.

## Steps
1. **Geocoding (address ↔ coordinates).** Use the free OpenStreetMap Nominatim API via `http_request` (no key):
   - Forward: `https://nominatim.openstreetmap.org/search?q=<query>&format=json&limit=5` (set a `User-Agent` header — Nominatim requires one).
   - Reverse: `https://nominatim.openstreetmap.org/reverse?lat=<lat>&lon=<lon>&format=json`.
   - Parse JSON in `run_python`; each result has `lat`, `lon`, `display_name`, `type`, `boundingbox`.

2. **Find nearby places / POIs.** Use the Overpass API (OpenStreetMap data) via `http_request` with a POST query, e.g. amenities within a radius:
   ```
   [out:json];node["amenity"="cafe"](around:1000,<lat>,<lon>);out;
   ```
   POST to `https://overpass-api.de/api/interpreter`. Parse the `elements` array for names, coords, tags.
   - If the user has a Google/Mapbox key, prefer `http_request` to Places/Geocoding endpoints for richer data (ratings, hours).

3. **Directions / distance.** Use the OSRM public API via `http_request`:
   - `https://router.project-osrm.org/route/v1/driving/<lon1>,<lat1>;<lon2>,<lat2>?overview=false` → JSON with `distance` (m) and `duration` (s). Switch profile (`driving`/`walking`/`cycling`).

4. **Compute & enrich.** In `run_python` convert units (km/mi, min/hr), sort POIs by distance (haversine), and build a clean table.

5. **Optional static map.** Plot points with `matplotlib`/`folium` (install via `install_packages`) and save `/home/user/map.html` or `.png`.

6. **Deliver.** Present a structured table (name, address, coords, distance) inline; `get_sandbox_file_url` for any map file. Include the source (OSM/Google) and a coordinates list.

## Gotchas
- Nominatim and Overpass have strict rate limits (≈1 req/s) and require a descriptive `User-Agent` — throttle and don't bulk-hammer; for heavy use, self-host or use a keyed provider.
- Lng/lat order: OSRM/GeoJSON use `lon,lat`; many other APIs use `lat,lon`. Don't swap them.
- Geocoding is ambiguous — return multiple candidates when confidence is low and let the user pick.
- OSM data completeness varies by region; note gaps.
