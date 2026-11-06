# Varshik 2027 benchmark fixtures

`births.ts` holds 12 made-up births (the 10 from the owner's table plus a leap day and a New York
birth). They are inputs only.

## Two kinds of expected values

1. `engine-snapshot.json` is what OUR engine produced. It is **not JHora** and proves nothing about
   correctness. It only stops the numbers changing without anyone noticing. Rebuild it after a
   deliberate change with `UPDATE_VARSHIK_SNAPSHOT=1 npx vitest run test/varshik-benchmark.spec.ts`
   and read the diff.
2. `jhora.json` is where real JHora output goes. It is empty until the owner records it, and the
   JHora tests are skipped while it is empty. **Until it is filled the sprint's "done when" JHora
   check is OPEN.**

## `jhora.json` format

```json
{
  "settings": { "jhoraVersion": "...", "ayanamsa": "Lahiri", "node": "true|mean", "houseSystem": "..." },
  "charts": [
    {
      "id": "b01",
      "targetYear": 2027,
      "solarReturnUtc": "2027-01-12T01:23:45Z",
      "varshaLagnaDeg": 123.456,
      "sahams": { "Vivaha": 12.34, "Punya": 56.78 },
      "yearLord": "Mars",
      "panchavargi": { "Sun": 12.5, "Moon": 9.25 },
      "mudda": [{ "lord": "Ketu", "startUtc": "2027-01-12T01:23:45Z" }],
      "yogas": [{ "kind": "ithasala", "planets": ["Moon", "Mercury"] }]
    }
  ]
}
```

`varshaLagnaDeg` and Saham values are sidereal longitudes 0-360. Tolerances (from the plan): solar
return within 2 s; Varsha Lagna and Sahams within 0.05 degrees; Year Lord, Panchavargi, Mudda dasa
and Tajika yogas exact.
