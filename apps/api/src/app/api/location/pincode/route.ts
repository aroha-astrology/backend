import { NextResponse } from 'next/server';
import { Agent } from 'undici';

// India Post's upstream cert (CN=biswajeetsamal.com) expired 2026-05-21.
// Scoped TLS bypass for ONLY api.postalpincode.in until upstream renews.
// Server-side only; payload is public postal data (no auth, no PII upstream).
const indiaPostAgent = new Agent({ connect: { rejectUnauthorized: false } });

interface IndiaPostOffice {
  Name: string;
  District: string;
  Division: string;
  Region: string;
  State: string;
  Country: string;
  Pincode: string;
}

interface IndiaPostPincodeResponse {
  Message: string;
  Status: string;
  PostOffice: IndiaPostOffice[] | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    state_district?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

interface LocationResult {
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  timezone: string;
  pincode: string;
}

async function geocodeDistrict(district: string, state: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const query = encodeURIComponent(`${district}, ${state}, India`);
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=in&addressdetails=1`,
      { headers: { 'User-Agent': 'ArohaAstrology/1.0 contact@arohaastrology.in' } },
    );
    if (!geoRes.ok) return null;
    const geoData: NominatimResult[] = await geoRes.json();
    if (!geoData?.[0]) return null;
    return { lat: parseFloat(geoData[0].lat), lon: parseFloat(geoData[0].lon) };
  } catch {
    return null;
  }
}

async function lookupByPincode(pincode: string): Promise<LocationResult[]> {
  const postRes = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
    headers: { 'User-Agent': 'ArohaAstrology/1.0' },
    next: { revalidate: 86400 },
    // @ts-expect-error undici dispatcher is Node-fetch-only, not in lib.dom.
    dispatcher: indiaPostAgent,
  });
  if (!postRes.ok) return [];

  const postData: IndiaPostPincodeResponse[] = await postRes.json();
  if (!postData?.[0] || postData[0].Status !== 'Success' || !postData[0].PostOffice?.length) return [];

  const postOffices = postData[0].PostOffice;
  const seen = new Set<string>();
  const unique = postOffices.filter((po) => {
    const key = `${po.District}|${po.State}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results = await Promise.all(
    unique.slice(0, 3).map(async (po) => {
      const geo = await geocodeDistrict(po.District, po.State);
      if (!geo) return null;
      return {
        name: po.Name,
        state: `${po.District}, ${po.State}`,
        latitude: geo.lat,
        longitude: geo.lon,
        timezone: 'Asia/Kolkata',
        pincode,
      } satisfies LocationResult;
    }),
  );

  return results.filter((r): r is LocationResult => r !== null);
}

async function lookupByName(name: string): Promise<LocationResult[]> {
  const postRes = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(name)}`, {
    headers: { 'User-Agent': 'ArohaAstrology/1.0' },
    next: { revalidate: 86400 },
    // @ts-expect-error undici dispatcher is Node-fetch-only, not in lib.dom.
    dispatcher: indiaPostAgent,
  });
  if (!postRes.ok) return [];

  const postData: IndiaPostPincodeResponse[] = await postRes.json();
  if (!postData?.[0] || postData[0].Status !== 'Success' || !postData[0].PostOffice?.length) return [];

  const postOffices = postData[0].PostOffice;

  // One representative post office per District|State (name search returns many branches per district).
  const seen = new Set<string>();
  const unique: IndiaPostOffice[] = [];
  for (const po of postOffices) {
    const key = `${po.District}|${po.State}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(po);
  }

  const results = await Promise.all(
    unique.slice(0, 5).map(async (po) => {
      const geo = await geocodeDistrict(po.District, po.State);
      if (!geo) return null;
      return {
        name: po.Name,
        state: `${po.District}, ${po.State}`,
        latitude: geo.lat,
        longitude: geo.lon,
        timezone: 'Asia/Kolkata',
        pincode: po.Pincode,
      } satisfies LocationResult;
    }),
  );

  return results.filter((r): r is LocationResult => r !== null);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pincode = searchParams.get('pincode')?.trim();
  const name = searchParams.get('name')?.trim();

  if (pincode) {
    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json({ error: 'Invalid pincode' }, { status: 400 });
    }
    try {
      return NextResponse.json({ results: await lookupByPincode(pincode) });
    } catch {
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
  }

  if (name) {
    if (name.length < 3) {
      return NextResponse.json({ error: 'Name must be at least 3 characters' }, { status: 400 });
    }
    try {
      return NextResponse.json({ results: await lookupByName(name) });
    } catch {
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Provide ?pincode= or ?name=' }, { status: 400 });
}
