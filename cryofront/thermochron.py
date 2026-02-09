"""
Thermochron Plotter

Computes and plots the thermochron curve for a given ZIP code and winter season(s).

    thermochron(k) = the temperature that was never exceeded for k consecutive days

For each streak length k, finds the coldest k-day window in the season
(using daily highs) and reports that window's peak temperature.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
DEFAULT_TIMEZONE = "America/New_York"
CACHE_MAX_AGE_SECONDS = 3600  # 1 hour for recent data


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Location:
    zip_code: str
    name: str
    latitude: float
    longitude: float


@dataclass
class Season:
    label: str
    start: date
    end: date


@dataclass
class ThermochronResult:
    season: Season
    location: Location
    k_values: list[int]
    thermochron_values: list[float]
    daily_highs: list[float]
    dates: list[date]


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

def _cache_dir() -> Path:
    d = Path.home() / ".thermochron_cache"
    d.mkdir(exist_ok=True)
    return d


def _read_cache(path: Path, max_age: float | None = None) -> dict | None:
    """Read a JSON cache file. Returns None if missing or stale."""
    if not path.exists():
        return None
    if max_age is not None:
        age = time.time() - path.stat().st_mtime
        if age > max_age:
            return None
    with open(path) as f:
        return json.load(f)


def _write_cache(path: Path, data: dict) -> None:
    with open(path, "w") as f:
        json.dump(data, f)


def flush_cache() -> None:
    """Delete all cached files."""
    d = _cache_dir()
    for f in d.iterdir():
        if f.is_file():
            f.unlink()
    print("Cache flushed.")


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def _fetch_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(f"Failed to fetch {url}: {e}") from e


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

def geocode_zip(zip_code: str) -> Location:
    """Convert a US ZIP code to a Location with lat/lon coordinates."""
    cache_path = _cache_dir() / f"geo_{zip_code}.json"
    cached = _read_cache(cache_path)
    if cached is not None:
        return Location(**cached)

    url = f"{OPEN_METEO_GEOCODING_URL}?name={zip_code}&count=10&language=en&format=json"
    data = _fetch_json(url)

    results = data.get("results", [])
    for r in results:
        if r.get("country_code") == "US":
            postcodes = r.get("postcodes", [])
            if zip_code in postcodes:
                loc = Location(
                    zip_code=zip_code,
                    name=f"{r['name']}, {r.get('admin1', '')}",
                    latitude=r["latitude"],
                    longitude=r["longitude"],
                )
                _write_cache(cache_path, asdict(loc))
                return loc

    # Fallback: take first US result even without postcode match
    for r in results:
        if r.get("country_code") == "US":
            loc = Location(
                zip_code=zip_code,
                name=f"{r['name']}, {r.get('admin1', '')}",
                latitude=r["latitude"],
                longitude=r["longitude"],
            )
            _write_cache(cache_path, asdict(loc))
            return loc

    raise ValueError(f"Could not geocode ZIP code: {zip_code}")


# ---------------------------------------------------------------------------
# Weather data fetching
# ---------------------------------------------------------------------------

def fetch_daily_highs(
    location: Location,
    start_date: date,
    end_date: date,
) -> tuple[list[date], list[float]]:
    """Fetch daily maximum temperatures from the Open-Meteo archive API."""
    lat = round(location.latitude, 4)
    lon = round(location.longitude, 4)
    start_str = start_date.isoformat()
    end_str = end_date.isoformat()

    cache_path = _cache_dir() / f"highs_{lat}_{lon}_{start_str}_{end_str}.json"

    # Recent data (end within last 2 days) expires after 1 hour
    today = date.today()
    is_recent = end_date >= today - timedelta(days=1)
    max_age = CACHE_MAX_AGE_SECONDS if is_recent else None

    cached = _read_cache(cache_path, max_age=max_age)
    if cached is not None:
        dates = [date.fromisoformat(d) for d in cached["dates"]]
        temps = cached["temps"]
        print(f"  Using cached data ({len(dates)} days)")
        return dates, temps

    url = (
        f"{OPEN_METEO_ARCHIVE_URL}"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={start_str}&end_date={end_str}"
        f"&daily=temperature_2m_max"
        f"&temperature_unit=fahrenheit"
        f"&timezone={DEFAULT_TIMEZONE}"
    )
    data = _fetch_json(url)

    if "daily" not in data:
        raise RuntimeError(f"Unexpected API response (no 'daily' key): {list(data.keys())}")

    raw_dates = data["daily"]["time"]
    raw_temps = data["daily"]["temperature_2m_max"]

    # Filter out nulls
    dates_out: list[date] = []
    temps_out: list[float] = []
    for d, t in zip(raw_dates, raw_temps):
        if t is not None:
            dates_out.append(date.fromisoformat(d))
            temps_out.append(t)

    if not temps_out:
        raise RuntimeError("No valid temperature data for the requested range")

    _write_cache(cache_path, {
        "dates": [d.isoformat() for d in dates_out],
        "temps": temps_out,
    })
    print(f"  Fetched {len(temps_out)} days from API")
    return dates_out, temps_out


# ---------------------------------------------------------------------------
# Season definition
# ---------------------------------------------------------------------------

def make_winter_season(year: int, reference_date: date | None = None) -> Season:
    """
    Define a winter season as Oct 1 of `year` through Mar 31 of `year+1`.

    If the season is still in progress (reference_date falls within it),
    the end date is capped at reference_date.
    """
    ref = reference_date or date.today()
    start = date(year, 10, 1)
    nominal_end = date(year + 1, 3, 31)

    if start > ref:
        raise ValueError(f"Season {year} hasn't started yet (starts {start})")

    end = min(nominal_end, ref)
    label = f"Winter {year}-{(year + 1) % 100:02d}"
    return Season(label=label, start=start, end=end)


# ---------------------------------------------------------------------------
# Thermochron computation
# ---------------------------------------------------------------------------

def compute_thermochron(daily_highs: list[float]) -> tuple[list[int], list[float]]:
    """
    Compute the thermochron curve.

    thermochron(k) = the lowest temperature T such that there exists a
    contiguous k-day stretch in the season where the daily high never
    exceeded T.

    Equivalently: for each window size k, slide a k-day window across the
    season, compute the max daily high within each window, then take the
    min of those maxima. This finds the coldest sustained streak of length k.

    The curve is monotonically non-decreasing (longer streaks require
    higher thresholds).
    """
    n = len(daily_highs)
    if n == 0:
        return [], []

    arr = np.array(daily_highs, dtype=np.float64)
    k_values = []
    thermo_values = []

    for k in range(1, n + 1):
        # Max of each k-day window, then min across all windows
        # Use a sliding window approach with stride_tricks for efficiency
        if k == 1:
            best = float(arr.min())
        else:
            # Sliding window max using np.lib.stride_tricks
            shape = (n - k + 1, k)
            strides = (arr.strides[0], arr.strides[0])
            windows = np.lib.stride_tricks.as_strided(arr, shape=shape, strides=strides)
            window_maxes = windows.max(axis=1)
            best = float(window_maxes.min())
        k_values.append(k)
        thermo_values.append(best)

    return k_values, thermo_values


# ---------------------------------------------------------------------------
# Plotting
# ---------------------------------------------------------------------------

def plot_thermochron(
    results: list[ThermochronResult],
    title: str | None = None,
    save_path: str | None = None,
) -> None:
    """Plot one or more thermochron curves on the same axes."""
    fig, ax = plt.subplots(figsize=(10, 6))

    max_k = 42  # 6 weeks

    # Find the current (most recent) season to make it visually distinct
    current_label = results[-1].season.label if results else None

    for result in results:
        is_current = result.season.label == current_label
        k = result.k_values[:max_k]
        v = result.thermochron_values[:max_k]
        ax.plot(
            k, v,
            linewidth=3.5 if is_current else 1.2,
            alpha=1.0 if is_current else 0.45,
            color="black" if is_current else None,
            zorder=10 if is_current else 1,
            label=result.season.label,
        )

    # Freezing reference line
    ax.axhline(y=32, color="gray", linestyle="--", linewidth=1, alpha=0.7)
    ax.annotate(
        "32\u00b0F",
        xy=(0.01, 32),
        xycoords=("axes fraction", "data"),
        fontsize=9,
        color="gray",
        va="bottom",
    )

    ax.set_xlabel("k (streak length in days)", fontsize=12)
    ax.set_ylabel("Temperature (\u00b0F)", fontsize=12)

    if title is None:
        loc_name = results[0].location.name
        title = f"Thermochron \u2014 {loc_name}"
    ax.set_title(title, fontsize=14)

    ax.legend(fontsize=8, ncol=2)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(1, max_k)

    ax.annotate(
        "thermochron(k) = coldest k-day streak's highest daily high",
        xy=(0.5, -0.10),
        xycoords="axes fraction",
        ha="center",
        fontsize=9,
        fontstyle="italic",
        color="gray",
    )

    plt.tight_layout()

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight")
        print(f"Saved plot to {save_path}")
    else:
        plt.show()


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def run_thermochron(
    zip_code: str = "06515",
    seasons: list[int] | None = None,
    reference_date: date | None = None,
    save_path: str | None = None,
    do_flush_cache: bool = False,
) -> list[ThermochronResult]:
    """
    Full pipeline: geocode, fetch data, compute thermochron, plot.

    Args:
        zip_code: US ZIP code.
        seasons: List of start-years for winter seasons. Defaults to last 3.
        reference_date: Override for "today".
        save_path: Save plot to file instead of displaying.
        do_flush_cache: Delete all cached data before running.
    """
    if do_flush_cache:
        flush_cache()

    if seasons is None:
        ref = reference_date or date.today()
        # Current season start year: if we're past Oct 1, it's this year;
        # otherwise it's last year.
        current_year = ref.year if ref.month >= 10 else ref.year - 1
        seasons = list(range(current_year - 9, current_year + 1))

    location = geocode_zip(zip_code)
    print(f"Location: {location.name} ({location.latitude:.4f}, {location.longitude:.4f})")

    results: list[ThermochronResult] = []
    for year in seasons:
        season = make_winter_season(year, reference_date=reference_date)
        print(f"Fetching {season.label}: {season.start} to {season.end}")

        dates, daily_highs = fetch_daily_highs(location, season.start, season.end)
        k_values, thermo_values = compute_thermochron(daily_highs)

        results.append(ThermochronResult(
            season=season,
            location=location,
            k_values=k_values,
            thermochron_values=thermo_values,
            daily_highs=daily_highs,
            dates=dates,
        ))

    plot_thermochron(results, save_path=save_path)
    return results


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    do_flush = "--flush-cache" in sys.argv
    run_thermochron(zip_code="06515", do_flush_cache=do_flush)
