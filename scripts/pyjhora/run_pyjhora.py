"""Runs PyJHora over a list of charts and writes JSON. Used by test/varshik-pyjhora.spec.ts.

Usage: python run_pyjhora.py <input.json> <output.json>
input.json: [{"id","date":"YYYY-MM-DD","time":"HH:MM","lat","lng","tz":hours_east,"targetYear"}]
Setup (memory pyjhora-runnable): uv Python 3.11 + pyswisseph cp311 wheel + pyjhora==4.8.7 + numpy pytz
python-dateutil requests geopy timezonefinder geocoder. The ayanamsa MUST be set to LAHIRI: the
PyJHora default is True Pushya and puts every number off by minutes of arc.
"""
import contextlib
import io
import json
import sys

import swisseph as swe
from jhora.horoscope.dhasa.annual import mudda
from jhora.horoscope.transit import saham, tajaka, tajaka_yoga
from jhora.horoscope.chart import charts
from jhora.panchanga import drik

# PyJHora 4.8.7's tajaka_yoga uses `charts` without importing it; give it the module.
tajaka_yoga.charts = charts

drik.set_ayanamsa_mode("LAHIRI")
NAMES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a, **k)


def lon(pp, i):
    return pp[i][1][0] * 30 + pp[i][1][1]


def run_one(c):
    y, mo, da = map(int, c["date"].split("-"))
    hh, mm = map(int, c["time"].split(":"))
    tz = c["tz"]
    # PyJHora takes the birth Julian day in LOCAL time, as the original harness did.
    jd_birth = swe.julday(y, mo, da, hh + mm / 60)
    place = drik.Place(c["id"], c["lat"], c["lng"], tz)
    age = c["targetYear"] - y
    idx = age + 1
    rec = {"id": c["id"], "targetYear": c["targetYear"]}
    try:
        jd_ret = quiet(drik.next_solar_date, jd_birth, place, years=idx)
        pp, _ = quiet(tajaka.annual_chart, jd_birth, place, years=idx)
        night = bool(quiet(drik.is_night_birth, jd_ret, place))
        rec["returnUtcMs"] = (jd_ret - tz / 24 - 2440587.5) * 86400000
        rec["night"] = night
        rec["lagna"] = lon(pp, 0)
        rec["planets"] = {NAMES[i]: lon(pp, i + 1) for i in range(9)}
        rec["sahams"] = {
            "Punya": saham.punya_saham(pp, night),
            "Vidya": saham.vidya_saham(pp, night),
            "Rajya": saham.rajya_saham(pp, night),
            "Putra": saham.puthra_saham(pp, night),
            "Pardesh": saham.paradesa_saham(pp, night),
            "Karyasiddhi": saham.karyasiddhi_saham(pp, night),
            "Vivaha": saham.vivaha_saham(pp, night),
            "Artha": saham.artha_saham(pp, night),
        }
    except Exception as e:  # noqa: BLE001
        rec["chartError"] = repr(e)
    try:
        rec["yearLord"] = NAMES[quiet(tajaka.lord_of_the_year, jd_birth, place, age)]
    except Exception as e:  # noqa: BLE001
        rec["yearLordError"] = repr(e)
    if "planets" in rec:
        try:
            pair = lambda t: sorted(f"{NAMES[a]}+{NAMES[b]}" for a, b, *_ in t)
            rec["ithasala"] = pair(quiet(tajaka_yoga.get_ithasala_yoga_planet_pairs, pp))
            rec["ishrafa"] = pair(quiet(tajaka_yoga.get_eesarpha_yoga_planet_pairs, pp))
            rec["radda"] = pair(quiet(tajaka_yoga.get_radda_yoga_planet_pairs, pp))
        except Exception as e:  # noqa: BLE001
            rec["yogaError"] = repr(e)
    return rec


if __name__ == "__main__":
    charts = json.load(open(sys.argv[1], encoding="utf8"))
    out = []
    for c in charts:
        try:
            out.append(run_one(c))
        except Exception as e:  # noqa: BLE001
            out.append({"id": c["id"], "fatal": repr(e)})
    json.dump(out, open(sys.argv[2], "w", encoding="utf8"), indent=1, default=str)
