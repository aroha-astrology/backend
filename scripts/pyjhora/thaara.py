"""C1: PyJHora's thaaraabalam for sample instants in 2027, for all 27 birth stars.
Usage: python thaara.py <output.json>. Lahiri (mode 1), Delhi, UT = local - 5.5h.
Output: [{"jdUt": float, "star": 1..27 (Moon star at that instant), "buckets": {birthStar: remainder 0-8}}]
PyJHora's remainder 0 = Parama Mitra (9), 1 = Janma, 2 = Sampat, ... 8 = Mitra.
"""
import contextlib, io, json, sys
import swisseph as swe
from jhora.panchanga import drik

drik.set_ayanamsa_mode("LAHIRI")
place = drik.Place("Delhi", 28.61, 77.21, 5.5)
out = []
base = swe.julday(2027, 1, 1, 6.5)  # 12:00 IST on 1 Jan 2027, UT jd
for k in range(0, 360, 6):
    jd_ut = base + k + (k % 5) * 0.173  # spread over the day so stars change phase
    jd_local = jd_ut + 5.5 / 24.0
    with contextlib.redirect_stdout(io.StringIO()):
        star = drik.nakshatra(jd_local, place)[0]
        tb = drik.thaaraabalam(jd_local, place, return_only_good_stars=False)
    buckets = {}
    for r, stars in enumerate(tb):
        for s in stars:
            buckets[str(s)] = r
    out.append({"jdUt": jd_ut, "star": star, "buckets": buckets})
json.dump(out, open(sys.argv[1], "w"))
