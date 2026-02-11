# Snowscope

Simple, dependency-free web dashboard for season-to-date snow history at a point (`lat,lon`) using public Open-Meteo data.

## What it shows

- Hourly temperature (`F`) from Nov 1 to today, split by freezing threshold:
  - blue when `<= 32F`
  - red when `> 32F`
  - dotted horizontal reference at `32F`
- Top event timeline aligned to the same date range as the charts
- Daily rain/snow panel:
  - snow depth histogram (`in/day`)
  - rain depth histogram (`in/day`)
- Daily powder quality score (`0-100`) combining snow amount/newness with rain, thaw, sun, and wind penalties
- Estimated daily snowpack depth chart (`in`)
- Daily average and max wind speed (`mph`)
- Daily shortwave radiation sum (`MJ/m^2/day`) with a derived sun-bake index (`0-100`)
- Forward-looking 7d outlook panel:
  - hourly rain/snow bars (`in/hr`)
  - hourly temperature vs freezing line (`F`)
  - hourly wind speed (`mph`)
- Station cross-check + confidence panel:
  - nearest available NWS station latest observation
  - model-vs-station deltas (temp, wind, precip)
  - confidence score (`0-100`, low/medium/high)
  - one-click switch to pin the full dashboard to the station's exact coordinates
  - one-click switch to `Station data` mode (use station observations where available, model fallback otherwise)
- Summary diagnostics:
  - current and peak snowpack estimate
  - 7-day snowpack change
  - next-7d snow/rain totals and max wind
  - last qualifying day for freeze-thaw, rain-on-snow, wind slab, and strong sun-bake rules
  - clickable `?` help on each rule card showing exact qualification logic
- Event feed with heuristic pattern flags for:
  - freeze-thaw cycles
  - rain-on-snow
  - wind + recent snow loading windows
  - strong sun-bake windows

## Run

From this folder:

```bash
python3 -m http.server 8000
```

Then open:

- [http://localhost:8000](http://localhost:8000)

## Data window

- Season start is auto-set to `Nov 1` of the active snow season.
- End date is local "today".

## Data sources

- Archive history:
  - [https://archive-api.open-meteo.com/v1/archive](https://archive-api.open-meteo.com/v1/archive)
- Current-day merge:
  - [https://api.open-meteo.com/v1/forecast](https://api.open-meteo.com/v1/forecast)
- NWS station lookup + latest observations:
  - [https://api.weather.gov/points/{lat},{lon}](https://www.weather.gov/documentation/services-web-api#/default/point)
  - [https://api.weather.gov/stations/{stationId}/observations/latest](https://www.weather.gov/documentation/services-web-api#/default/station_observation_latest)
  - [https://api.weather.gov/stations/{stationId}/observations](https://www.weather.gov/documentation/services-web-api#/default/station_observation_list)

## Notes

- Rain vs snow-water-equivalent is phase-estimated hourly from total precipitation + snowfall depth (with temperature guards), then summed by day.
- Station confidence is heuristic (distance, elevation mismatch, observation recency, and model/observation agreement), not a guarantee.
- Depending on grid/model latency, very recent hours can be incomplete.
- Pattern flags are heuristic and not avalanche forecasts; use local observations and forecast center products.
