"""Independent reference for the 2027 sky events, straight from pyswisseph (the native Swiss
Ephemeris build, not the wasm build the engine uses) with its own event finder.

Usage: python events_2027.py <output.json> [start_iso end_iso]
Convention (same as the engine and Drik Panchang): sidereal longitude = TRUE tropical
longitude minus the MEAN Lahiri ayanamsa (no nutation in the ayanamsa). Rahu is the mean node,
Ketu is Rahu + 180. So this checks the engine's event finding and its wasm build, not the choice
of convention itself (the convention was checked against drikpanchang separately).
"""
import json
import sys
from datetime import datetime, timedelta, timezone

import swisseph as swe

# Mode 44 = Lahiri VP285, the engine's choice. It is 23 arcsec AHEAD of standard Lahiri (mode 1), which
# is what JHora's Traditional Lahiri and PyJHora use. Drik Panchang agrees with 44: on 14 Jan 2027 it
# prints the Sun leaving Dhanu at 09:14 PM IST (mode 44: 21:15, mode 1: 21:06).
swe.set_sid_mode(44, 0, 0)
FLG = swe.FLG_SWIEPH | swe.FLG_SPEED
PLANETS = {"Sun": swe.SUN, "Mercury": swe.MERCURY, "Venus": swe.VENUS, "Mars": swe.MARS,
           "Jupiter": swe.JUPITER, "Saturn": swe.SATURN, "Rahu": swe.MEAN_NODE}
SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
NAK = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha",
       "PurvaPhalguni", "UttaraPhalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Moola",
       "PurvaAshadha", "UttaraAshadha", "Shravana", "Dhanishta", "Shatabhisha", "PurvaBhadrapada", "UttaraBhadrapada", "Revati"]


def lon_speed(name, jd):
    """Sidereal longitude and sidereal speed (degrees/day).

    Planets: true tropical longitude minus the MEAN ayanamsa, and the ayanamsa's own daily motion is
    taken off the speed (so a station is where the SIDEREAL speed is zero). The mean node goes
    through Swiss Ephemeris' own sidereal path, as the engine does.
    """
    if name in ("Rahu", "Ketu"):
        xx = swe.calc_ut(jd, swe.MEAN_NODE, FLG | swe.FLG_SIDEREAL)[0]
        lon = xx[0] % 360
        if name == "Ketu":
            lon = (lon + 180) % 360
        return lon, xx[3]
    ay = swe.get_ayanamsa_ex_ut(jd, swe.FLG_SWIEPH | swe.FLG_NONUT)[1]
    ay1 = swe.get_ayanamsa_ex_ut(jd + 1, swe.FLG_SWIEPH | swe.FLG_NONUT)[1]
    xx = swe.calc_ut(jd, PLANETS[name], FLG)[0]
    return (xx[0] - ay) % 360, xx[3] - (ay1 - ay)


def to_jd(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return swe.julday(d.year, d.month, d.day, d.hour + d.minute / 60 + d.second / 3600)


def iso(jd):
    y, m, d, h = swe.revjul(jd)
    t = datetime(y, m, d, tzinfo=timezone.utc) + timedelta(seconds=round(h * 3600))
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def bisect(f, a, b):
    """f(a) is True, f(b) is False; returns the boundary to ~1 s."""
    for _ in range(40):
        m = (a + b) / 2
        if f(m):
            a = m
        else:
            b = m
    return b


def main():
    out_path = sys.argv[1]
    start = to_jd(sys.argv[2] if len(sys.argv) > 2 else "2026-12-31T18:30:00Z")
    end = to_jd(sys.argv[3] if len(sys.argv) > 3 else "2027-12-31T18:30:00Z")
    step = 0.25
    events = []
    for name in ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"]:
        jd = start
        l0, s0 = lon_speed(name, jd)
        while jd < end:
            nj = min(jd + step, end)
            l1, s1 = lon_speed(name, nj)
            for kind, idx in (("sign", lambda x: int(x // 30)), ("nakshatra", lambda x: int(x // (360 / 27)))):
                if idx(l0) != idx(l1):
                    a = idx(l0)
                    t = bisect(lambda j, a=a, idx=idx: idx(lon_speed(name, j)[0]) == a, jd, nj)
                    to = idx(lon_speed(name, t + 1e-4)[0])
                    events.append({"planet": name, "kind": kind, "to": (SIGNS if kind == "sign" else NAK)[to], "at": iso(t)})
            if name in ("Mercury", "Venus", "Mars", "Jupiter", "Saturn") and (s0 < 0) != (s1 < 0):
                was_retro = s0 < 0
                t = bisect(lambda j, w=was_retro: (lon_speed(name, j)[1] < 0) == w, jd, nj)
                events.append({"planet": name, "kind": "direct" if was_retro else "retrograde", "to": None, "at": iso(t)})
            jd, l0, s0 = nj, l1, s1

    eclipses = []
    for kind, fn in (("solar", lambda j: swe.sol_eclipse_when_glob(j, swe.FLG_SWIEPH)), ("lunar", lambda j: swe.lun_eclipse_when(j, swe.FLG_SWIEPH))):
        j = start
        for _ in range(8):
            ret = fn(j)
            tmax = ret[1][0]
            if tmax >= end:
                break
            eclipses.append({"kind": kind, "atUt": iso(tmax), "deltaTSec": swe.deltat(tmax) * 86400})
            j = tmax + 1
    json.dump({"events": sorted(events, key=lambda e: e["at"]), "eclipses": eclipses}, open(out_path, "w"), indent=1)


if __name__ == "__main__":
    main()
