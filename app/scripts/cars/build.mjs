#!/usr/bin/env node
// Builds app/assets/data/cars.json, the bundled car catalogue.
//
// Sources:
// 1. NHTSA vPIC (public domain, https://vpic.nhtsa.dot.gov/api/): models per make and
//    model year for passenger cars, multipurpose passenger vehicles and trucks.
// 2. curated.mjs: European models that never reached North America, classics from before
//    the vPIC coverage, and body style overrides.
//
// Usage: node app/scripts/cars/build.mjs   (or bun)
// Responses are cached in app/scripts/cars/.cache, delete it to refetch.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_OVERRIDES, CURATED, CURRENT_YEAR } from './curated.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = join(here, '.cache');
const OUT = join(here, '../../assets/data/cars.json');

const FIRST_YEAR = 1990;
const LAST_YEAR = CURRENT_YEAR + 1;
// vPIC vehicle types we keep. Anything else (motorcycles, buses, trailers) is dropped.
const TYPES = ['passenger car', 'mpv', 'truck'];

// vPIC make name -> display name. Passenger car brands sold in North America.
const MAKES = {
  acura: 'Acura', 'alfa romeo': 'Alfa Romeo', 'aston martin': 'Aston Martin', audi: 'Audi',
  bentley: 'Bentley', bmw: 'BMW', bugatti: 'Bugatti', buick: 'Buick', cadillac: 'Cadillac',
  chevrolet: 'Chevrolet', chrysler: 'Chrysler', daewoo: 'Daewoo', dodge: 'Dodge', eagle: 'Eagle',
  ferrari: 'Ferrari', fiat: 'Fiat', fisker: 'Fisker', ford: 'Ford', genesis: 'Genesis', geo: 'Geo',
  gmc: 'GMC', honda: 'Honda', hummer: 'Hummer', hyundai: 'Hyundai', infiniti: 'Infiniti',
  isuzu: 'Isuzu', jaguar: 'Jaguar', jeep: 'Jeep', karma: 'Karma', kia: 'Kia',
  lamborghini: 'Lamborghini', 'land rover': 'Land Rover', lexus: 'Lexus', lincoln: 'Lincoln',
  lotus: 'Lotus', lucid: 'Lucid', maserati: 'Maserati', maybach: 'Maybach', mazda: 'Mazda',
  mclaren: 'McLaren', 'mercedes-benz': 'Mercedes-Benz', mercury: 'Mercury', mini: 'MINI',
  mitsubishi: 'Mitsubishi', nissan: 'Nissan', oldsmobile: 'Oldsmobile', plymouth: 'Plymouth',
  polestar: 'Polestar', pontiac: 'Pontiac', porsche: 'Porsche', ram: 'Ram', rivian: 'Rivian',
  'rolls-royce': 'Rolls-Royce', saab: 'Saab', saturn: 'Saturn', scion: 'Scion', smart: 'Smart',
  subaru: 'Subaru', suzuki: 'Suzuki', tesla: 'Tesla', toyota: 'Toyota', vinfast: 'VinFast',
  volkswagen: 'Volkswagen', volvo: 'Volvo',
};

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'roadclaim-car-catalogue' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    // vPIC answers 403 when it is called too fast: back off and retry.
    if (attempt >= 8) throw new Error(`${url}: ${err.message}`);
    await sleep(15000 * attempt);
    return fetchJson(url, attempt + 1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Model names for a make in one model year (all vehicle types), or for a make and
// vehicle type across all years.
async function models(make, { year, type }) {
  const key = `${make}-${year ?? 'all'}-${type ?? 'all'}`.replace(/[^a-z0-9.-]+/gi, '_');
  const file = join(CACHE, `${key}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {}
  let url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}`;
  if (year) url += `/modelyear/${year}`;
  if (type) url += `/vehicletype/${encodeURIComponent(type)}`;
  const data = await fetchJson(`${url}?format=json`);
  const names = [...new Set((data.Results ?? []).map((r) => r.Model_Name.trim()))];
  await writeFile(file, JSON.stringify(names));
  await sleep(150);
  return names;
}

async function pool(jobs, size) {
  const out = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await jobs[i]();
      if (++done % 250 === 0) process.stderr.write(`  ${done}/${jobs.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: size }, worker));
  return out;
}

async function fetchAll() {
  await mkdir(CACHE, { recursive: true });
  const jobs = [];
  for (const make of Object.keys(MAKES)) {
    for (const type of TYPES) {
      jobs.push(async () => ({ make, type, names: await models(make, { type }) }));
    }
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
      jobs.push(async () => ({ make, year, names: await models(make, { year }) }));
    }
  }
  process.stderr.write(`Fetching ${jobs.length} model lists from vPIC
`);
  return pool(jobs, 2);
}

const rows = await fetchAll();
// ---------------------------------------------------------------------------
// Cleaning

// Commercial and heavy-truck chassis, special vehicles and other non-passenger entries.
const JUNK = /canter|chassis|cutaway|stripped|motor ?home|recreational|\bbus\b|school|hearse|limo|military|police|commercial|incomplete|glider|\bcab\b|cab-?over|low cab|tractor|tilt|conventional|forward control|hi-cube|step van|value van|magna van|brightdrop|origin|\blcf\b|\bw\d|^\d+ ton|heavy|medium duty|ambulance|fire|taxi|\btrailer\b|gmt-\d/i;

// Truck codes without lowercase letters (C7000, LT9000, VNL, 4500) are heavy trucks unless the
// model is also listed as a passenger car, except these pickups and vans.
const TRUCK_CODE = /^[A-Z]{0,5}[- ]?\d{0,5}[A-Z]{0,2}$/;
const TRUCK_CODES_KEEP = new Set(['F-150', 'F-250', 'F-350', 'F-450', 'F-100', '1500', '2500', '3500', 'T100', 'S10', 'S-10', 'H1', 'H2', 'H3', 'H3T', 'R1T', 'R1S', 'SSR', 'NV', 'NV200', 'HHR']);

// Generic names and entries that are not passenger car models.
const GENERIC = /^(?:van|wagon|cargo van|pickup truck)$/i;

// Per make entries to drop (exact match, case-insensitive).
const DROP = {
  Ford: ["'34", 'Classic', 'Malibu', 'Cordova'],
  Chevrolet: ['P - Series', 'U100'],
  Bentley: ['Armoured Arnage', 'Roll Royce Silver Seraph', 'Rolls-Royce Park Ward'],
  Daewoo: ['Laganza V-car', 'Leganza V-200 & variants/derivatives'],
  Geo: ['405', '505'],
  GMC: ['Electric Vehicle', 'Geo Tracker', 'P Truck Forward'],
  MINI: ['FL', 'KW', 'Mack', 'Pete'],
  Lotus: ['MEL', 'Spa', 'Monaco', 'Monza', 'Eagle'],
  Lamborghini: ['147', 'Roadster'],
  BMW: ['B7', 'M3Ci', 'ActiveE'],
  Ferrari: ['Challenge Stradale'],
  Buick: ['Coachbuilder'],
  Hyundai: ['Xcient'],
  Isuzu: ['H-Series'],
  Kia: ['Miami'],
  Rivian: ['EDV', 'RCV'],
  Tesla: ['Semi', 'Cybercab'],
  Toyota: ['FCHV-adv'],
  Smart: ['smart'],
  'Land Rover': ['88” WB', '90" WB', '110" WB'],
  Chrysler: ['SALON'],
  Volvo: ['VN', 'VNL', 'VNR', 'VNX', 'VNM', 'VHD', 'VAH', 'VT'],
};

const SUFFIXES = /\s+(?:hybrid|plug-in hybrid|plug-in|phev|energi|electric|limited|ltd|ld|hd|classic|heritage|4x4|4wd|awd|2wd|fwd|rwd|xdrive|quattro|4matic|sedan|hatchback|coupe sport)$/i;

const EXTRA_RENAME = {
  Ferrari: { '355': 'F355', '430': 'F430', 'La Ferrari': 'LaFerrari', '456M': '456', 'California T': 'California', 'Portofino M': 'Portofino', 'Mondial T': 'Mondial', '458 Italia': '458', '488 GTB': '488' },
  'Alfa Romeo': { '8C Competizione Spider': '8C Competizione' },
  'Aston Martin': { 'V8 Vantage': 'Vantage', 'V12 Vantage': 'Vantage' },
  Bugatti: { 'Chiron Pur Sport': 'Chiron', 'Chiron Supersport': 'Chiron', 'Chiron Sport': 'Chiron' },
  Genesis: { 'GV60 Magma': 'GV60' },
  Jeep: { 'Wrangler JK': 'Wrangler', 'Wrangler Unlimited': 'Wrangler', 'Grand Cherokee L': 'Grand Cherokee', 'Wagoneer L': 'Wagoneer', 'Grand Wagoneer L': 'Grand Wagoneer', 'Grand Cherokee 4xe': 'Grand Cherokee', 'Wrangler 4xe': 'Wrangler' },
  'Land Rover': { 'New Range Rover': 'Range Rover' },
  Lotus: { 'Turbo Esprit': 'Esprit' },
  McLaren: { 'Senna GTR': 'Senna', 'MP4-12C': '12C' },
  Nissan: { 'Ariya MPV': 'Ariya', 'Kicks MPV': 'Kicks', 'Kicks Play': 'Kicks', 'Altra-EV': 'Altra' },
  Pontiac: { 'Montana SV6': 'Montana', 'Grand AM': 'Grand Am', Lemans: 'LeMans' },
  Porsche: { '918': '918 Spyder' },
  Smart: { 'EQ Fortwo': 'ForTwo' },
  Suzuki: { 'Grand Vitara XL-7': 'XL7' },
  Isuzu: { 'i-280': 'i-Series', 'i-290': 'i-Series', 'i-350': 'i-Series', 'i-370': 'i-Series' },
  Ram: { 'ProMaster 1500': 'ProMaster', 'ProMaster 2500': 'ProMaster', 'ProMaster 3500': 'ProMaster' },
};

const MERCEDES_KEEP_CLASS = new Set(['A', 'B', 'C', 'E', 'G', 'M', 'R', 'S', 'CL', 'GL', 'X', 'T', 'V']);

// Per make renames for vPIC model names (exact match, case-insensitive).
const RENAME = {
  'Mercedes-Benz': { 'ML-Class': 'M-Class', eSprinter: 'Sprinter', 'SLS-Class': 'SLS AMG', 'EQE-Class SUV': 'EQE SUV', 'EQS-Class SUV': 'EQS SUV' },
  Volkswagen: { GTI: 'Golf GTI', 'e-Golf': 'Golf', R32: 'Golf R', 'Golf SportWagen': 'Golf Variant', 'Golf Alltrack': 'Golf Variant', 'Jetta SportWagen': 'Jetta', 'Passat CC': 'CC', 'ID.4': 'ID.4', 'Beetle Convertible': 'Beetle', 'Cabrio': 'Golf Cabriolet', 'Cabriolet': 'Golf Cabriolet', 'Golf III': 'Golf', GLI: 'Jetta', 'Jetta GLI': 'Jetta', 'Jetta Wagon': 'Jetta' },
  Mazda: { Mazda2: '2', Mazda3: '3', Mazda5: '5', Mazda6: '6', 'MX-5 Miata': 'MX-5', Miata: 'MX-5', 'Mazdaspeed3': '3', 'Mazdaspeed6': '6', 'Mazdaspeed MX-5 Miata': 'MX-5', 'MX-5 Miata RF': 'MX-5', 'Mazda 3': '3', 'Mazda 6': '6' },
  MINI: { Hardtop: 'Cooper', 'Cooper Countryman': 'Countryman', 'Cooper Clubman': 'Clubman', 'Cooper Paceman': 'Paceman', 'Cooper Coupe': 'Coupe', 'Cooper Roadster': 'Roadster', 'Cooper Convertible': 'Convertible', 'Cooper Hardtop': 'Cooper', 'Cooper S': 'Cooper', 'John Cooper Works': 'Cooper' },
  Smart: { fortwo: 'ForTwo', Fortwo: 'ForTwo' },
  Chevrolet: { 'S-10 Pickup': 'S-10', 'S-10 Blazer': 'Blazer', 'Astro Van': 'Astro', 'Captiva Sport': 'Captiva', 'Bolt': 'Bolt EV', 'Express Van': 'Express', 'C/K Pickup': 'C/K', 'Geo Prizm': 'Prizm', 'Geo Spectrum': 'Spectrum', 'Geo Sprint': 'Sprint' },
  GMC: { 'S15 Pickup': 'S-15', 'S15 Utility': 'Jimmy', 'Jimmy Utility': 'Jimmy', 'C/K Pickup': 'C/K' },
  Ford: { 'Mustang Mach-E': 'Mustang Mach-E', 'F-150 Heritage': 'F-150', 'Expedition EL': 'Expedition', 'Expedition MAX': 'Expedition', 'Explorer Sport': 'Explorer', 'Taurus X': 'Taurus', 'Transit Van': 'Transit', 'Econoline': 'E-Series', 'E-150': 'E-Series', 'E-250': 'E-Series', 'E-350': 'E-Series', 'E-450': 'E-Series', 'E-100': 'E-Series', 'F-Super Duty': 'Super Duty', 'Mustang GTD': 'Mustang', 'GT MKII': 'GT', 'Ecosport': 'EcoSport' },
  Toyota: { 'Prius Plug-in': 'Prius', 'Land Cruiser Prado': 'Land Cruiser', 'Supra': 'Supra', 'GR Corolla': 'Corolla', 'Corolla iM': 'Corolla', 'Yaris iA': 'Yaris', 'Camry Solara': 'Solara', 'bZ4X': 'bZ4X', 'bZ': 'bZ4X', 'Pick-Up': 'Pickup', 'Prius Prime': 'Prius', 'RAV4 Prime': 'RAV4', 'Corolla Matrix': 'Matrix', 'GR Supra': 'Supra' },
  Honda: { 'Civic Del Sol': 'del Sol', 'Accord Crosstour': 'Crosstour', 'Civic Si': 'Civic', 'FCX Clarity': 'Clarity' },
  Hyundai: { 'Ioniq Electric': 'Ioniq', 'Ioniq Plug-in Hybrid': 'Ioniq', 'Kona Electric': 'Kona', 'Elantra Touring': 'Elantra', 'Elantra GT': 'Elantra', 'Elantra Coupe': 'Elantra', 'Genesis Coupe': 'Genesis Coupe', 'XG300': 'XG', 'XG350': 'XG', 'Santa Fe Sport': 'Santa Fe', 'Santa Fe XL': 'Santa Fe' },
  Kia: { 'Forte5': 'Forte', 'Forte Koup': 'Forte', 'Niro EV': 'Niro', 'Soul EV': 'Soul', 'Optima Hybrid': 'Optima', 'Rio5': 'Rio', 'Spectra5': 'Spectra', 'Sorento Hybrid': 'Sorento' },
  Nissan: { '350Z Roadster': '350Z', '370Z Roadster': '370Z', 'Versa Note': 'Versa', 'Rogue Sport': 'Rogue', 'Rogue Select': 'Rogue', 'NV Passenger': 'NV', 'NV Cargo': 'NV', 'Titan XD': 'Titan', 'Frontier Pickup': 'Frontier', 'Pickup': 'Hardbody' },
  Porsche: { '718 Boxster': 'Boxster', '718 Cayman': 'Cayman', '718 Spyder': 'Boxster', 'Cayenne Coupe': 'Cayenne', 'Panamera Sport Turismo': 'Panamera', 'Taycan Cross Turismo': 'Taycan', 'Taycan Sport Turismo': 'Taycan', 'Macan Electric': 'Macan' },
  Dodge: { 'Ram Pickup': 'Ram', 'Omni': 'Omni', 'Ram 1500': 'Ram', 'Ram 2500': 'Ram', 'Ram 3500': 'Ram', 'Ram 1500 Pickup': 'Ram', 'Ram 2500 Pickup': 'Ram', 'Ram 3500 Pickup': 'Ram', 'Ram 50 Pickup': 'Ram 50', 'Ram Van': 'Ram Van', 'Ram Wagon': 'Ram Van', 'Grand Caravan': 'Grand Caravan', 'SRT Viper': 'Viper', 'Viper SRT10': 'Viper', 'Dakota Pickup': 'Dakota', 'Sprinter Van': 'Sprinter' },
  Ram: { 'ProMaster City': 'ProMaster City', 'C/V': 'Caravan C/V', '1500 Classic': '1500' },
  Chrysler: { 'Town and Country': 'Town & Country', 'Pacifica Hybrid': 'Pacifica', 'Sebring Convertible': 'Sebring', '300C': '300', '300M': '300' },
  Jaguar: { 'XKR': 'XK', 'XK8': 'XK', 'XJR': 'XJ', 'XJ8': 'XJ', 'XJ6': 'XJ', 'XJ12': 'XJ', 'XJS': 'XJS', 'XJL': 'XJ', 'Vanden Plas': 'XJ', 'Super V8': 'XJ', 'S-Type R': 'S-Type' },
  Volvo: { 'S60 Cross Country': 'S60', 'V60 Cross Country': 'V60', 'V90 Cross Country': 'V90', 'XC40 Recharge': 'XC40', 'C40 Recharge': 'C40', 'S60 Recharge': 'S60' },
  Tesla: { 'Model S': 'Model S' },
  Subaru: { 'WRX STI': 'WRX', 'Impreza WRX': 'WRX', 'Legacy Outback': 'Outback', 'XV Crosstrek': 'Crosstrek', 'B9 Tribeca': 'Tribeca', 'Impreza Outback Sport': 'Impreza' },
  Mitsubishi: { 'Lancer Evolution': 'Lancer Evolution', 'Mirage G4': 'Mirage', 'Outlander Sport': 'Outlander Sport', 'Outlander PHEV': 'Outlander', 'Raider': 'Raider', 'Montero Sport': 'Montero Sport' },
  Lincoln: { 'Mark LT': 'Mark LT', 'Navigator L': 'Navigator', 'Town Car': 'Town Car', 'MKZ Hybrid': 'MKZ', 'Blackwood': 'Blackwood' },
  Cadillac: { 'Escalade ESV': 'Escalade', 'Escalade EXT': 'Escalade EXT', 'CTS-V': 'CTS', 'ATS-V': 'ATS', 'CT4-V': 'CT4', 'CT5-V': 'CT5', 'XTS-V': 'XTS', 'Escalade IQ': 'Escalade IQ', 'Escalade IQL': 'Escalade IQ' },
  Acura: { 'RSX': 'RSX', '3.2TL': 'TL', '3.2CL': 'CL', '2.5TL': 'TL', '3.5RL': 'RL', '2.2CL': 'CL', '2.3CL': 'CL', '3.0CL': 'CL', '1.6EL': 'EL', '1.7EL': 'EL', 'TL Type S': 'TL' },
  Infiniti: { 'Q70L': 'Q70', 'M35h': 'M35', 'QX60 Hybrid': 'QX60', 'Q50 Hybrid': 'Q50', 'QX30': 'QX30' },
  Lexus: {},
  Audi: { 'A4 allroad': 'A4 allroad', 'A6 allroad': 'A6 allroad', 'allroad': 'A6 allroad', 'Q4 e-tron Sportback': 'Q4 e-tron', 'e-tron Sportback': 'e-tron', 'e-tron S': 'e-tron', 'e-tron S Sportback': 'e-tron', 'Q8 e-tron': 'e-tron', 'Q8 e-tron Sportback': 'e-tron', 'RS e-tron GT': 'e-tron GT', 'S e-tron GT': 'e-tron GT', 'SQ8 e-tron': 'e-tron', 'Cabriolet': 'Cabriolet', 'TT RS': 'TT', 'TTS': 'TT', 'R8 Spyder': 'R8', 'A5 Sportback': 'A5', 'S5 Sportback': 'A5', 'RS 5 Sportback': 'RS 5', 'S5': 'A5', 'S4': 'A4', 'S6': 'A6', 'S7': 'A7', 'S8': 'A8', 'S3': 'A3', 'SQ5': 'Q5', 'SQ7': 'Q7', 'SQ8': 'Q8', 'SQ5 Sportback': 'Q5', 'Q5 Sportback': 'Q5', 'RS3': 'RS 3', 'RS4': 'RS 4', 'RS5': 'RS 5', 'RS6': 'RS 6', 'RS7': 'RS 7', 'RS 6 Avant': 'RS 6 Avant', 'RS Q8': 'Q8', 'Q8 Sportback e-tron': 'e-tron' },
};

for (const [make, map] of Object.entries(EXTRA_RENAME)) RENAME[make] = { ...RENAME[make], ...map };

const titleCaps = (s) => s.replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
const eq = (a, b) => a.toLowerCase() === b.toLowerCase();

function clean(make, raw) {
  let name = raw.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || JUNK.test(name) || GENERIC.test(name) || eq(name, make)) return null;
  if (name.includes('/') && name !== 'C/K Pickup') return null;
  if ((DROP[make] ?? []).some((d) => eq(d, name))) return null;
  if (make === 'Toyota' && /^Scion /.test(name)) return null;
  name = titleCaps(name);
  if (name.toLowerCase().startsWith(`${make.toLowerCase()} `)) name = name.slice(make.length + 1);
  const renames = RENAME[make] ?? {};
  const renamed = Object.entries(renames).find(([from]) => eq(from, name));
  if (renamed) return renamed[1];

  if (make === 'BMW') {
    if (/alpina/i.test(name)) return null;
    const hybrid = name.match(/^ActiveHybrid\s*(\d)/i);
    if (hybrid) return `${hybrid[1]} Series`;
    const numeric = name.match(/^M?(\d)\d\d[a-z]*\b/i);
    if (numeric) return `${numeric[1]} Series`;
    const series = name.match(/^(\d) Series/);
    if (series) return `${series[1]} Series`;
    const first = name.match(/^(X\d|Z\d|i\d|iX\d?|M\d)\b/);
    if (first) return first[1];
  }
  if (make === 'Mercedes-Benz') {
    if (/^\d+/.test(name) || /^L[PS]{0,2}\d{3,4}$/.test(name)) return null;
    const cls = name.match(/^([A-Z]{1,4})-Class(?: (?:Sedan|Coupe|Cabriolet|Wagon))?$/);
    if (cls) return MERCEDES_KEEP_CLASS.has(cls[1]) ? `${cls[1]}-Class` : cls[1];
  }
  if (make === 'Ferrari') {
    name = name.replace(/^(\d{3}|F12|SF90|812|F8|296)\s.*$/, '$1').replace(/^(\d{3}) ?(?:GTB|GTS|Spider|Pista)$/, '$1');
  }
  if (make === 'Lamborghini' || make === 'McLaren' || make === 'Bentley' || make === 'Aston Martin') {
    name = name.replace(/\s+(?:Spyder|Spider|Roadster|Coupe|Convertible|Volante|S|SV|SVJ|LP\S*|EVO|STO|Tecnica|Speed)$/i, '');
  }
  if (make === 'Audi') {
    for (let i = 0; i < 2; i++) name = name.replace(/\s+(?:L|e)$/, '');
    name = name.replace(/^S?Q([46])$/, 'Q$1 e-tron').replace(/^SQ([69])$/, 'Q$1');
  }
  if (make === 'Saturn') {
    if (/^L[SW]?\d*$/.test(name)) return 'L-Series';
    if (/^S[CLW]\d?$/.test(name)) return 'S-Series';
  }
  if (make === 'Volvo') name = name.replace(/^(\d{3}) Series$/, '$1').replace(/\s?CC$/, '');
  if (make === 'Lexus') name = name.replace(/^([A-Z]{2,3})\s?\d{3}[a-zA-Z]*$/, '$1');
  if (make === 'Infiniti') name = name.replace(/^([A-Z]{1,3}\d{2})[hL]$/, '$1');

  for (let i = 0; i < 3; i++) name = name.replace(SUFFIXES, '');
  if (!name || (DROP[make] ?? []).some((d) => eq(d, name))) return null;
  return name;
}

const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/#/g, '')
    .replace(/°/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const lowerSet = (list) => new Set(list.map((s) => s.toLowerCase()));
const OVERRIDES = Object.entries(BODY_OVERRIDES).map(([body, names]) => [body, lowerSet(names)]);
const KEYWORDS = [
  [/\b(?:convertible|cabrio(?:let)?|spider|spyder|volante|roadster)\b/i, 'convertible'],
  [/\bcoupe\b/i, 'coupe'],
  [/\b(?:wagon|estate|avant|touring|sport ?wagen|allroad|variant|combi|sportstourer|sports tourer|tourer|sw)\b/i, 'wagon'],
  [/\bhatch(?:back)?\b/i, 'hatchback'],
  [/\b(?:van|bus)\b/i, 'van'],
  [/\b(?:pickup|truck)\b/i, 'pickup'],
];

function bodyFor(model, types) {
  const lower = model.toLowerCase();
  for (const [body, names] of OVERRIDES) if (names.has(lower)) return body;
  for (const [re, body] of KEYWORDS) if (re.test(model)) return body;
  if (types.has('passenger car')) return 'sedan';
  if (types.has('mpv')) return 'suv';
  if (types.has('truck')) return 'pickup';
  return 'other';
}

// ---------------------------------------------------------------------------
// Build

function build(rows) {
  const typed = new Map();
  for (const { make, type, names } of rows) {
    if (!type) continue;
    for (const n of names) {
      const k = `${make}|${n.toLowerCase()}`;
      typed.set(k, (typed.get(k) ?? new Set()).add(type));
    }
  }

  const cars = new Map();
  const add = (make, model, from, to, types, body) => {
    const key = `${make}|${model.toLowerCase()}`;
    const car = cars.get(key);
    if (!car) {
      cars.set(key, { make, model, from, to, types: new Set(types), body });
      return;
    }
    if (body) car.model = model; // curated spelling wins
    car.from = Math.min(car.from, from);
    car.to = car.to === null || to === null ? null : Math.max(car.to, to);
    for (const t of types) car.types.add(t);
    if (body) car.body = body;
  };

  for (const { make, year, names } of rows) {
    if (!year) continue;
    for (const raw of names) {
      const types = typed.get(`${make}|${raw.toLowerCase()}`);
      if (!types) continue; // motorcycles, buses, trailers and other types
      if (types.has('truck') && !types.has('passenger car') && TRUCK_CODE.test(raw) && !TRUCK_CODES_KEEP.has(raw)) continue;
      const model = clean(MAKES[make], raw);
      if (!model) continue;
      add(MAKES[make], model, year, year >= CURRENT_YEAR ? null : year, types, null);
    }
  }

  for (const [make, list] of Object.entries(CURATED)) {
    for (const line of list) {
      const m = line.match(/^(.+) (\d{4})-(\d{4})? (\w+)$/);
      if (!m) throw new Error(`Bad curated line for ${make}: ${line}`);
      add(make, m[1], Number(m[2]), m[3] ? Number(m[3]) : null, [], m[4]);
    }
  }

  const out = [];
  const ids = new Set();
  const sorted = [...cars.values()].sort(
    (a, b) =>
      a.make.localeCompare(b.make, 'en', { sensitivity: 'base' }) ||
      a.model.localeCompare(b.model, 'en', { numeric: true, sensitivity: 'base' }),
  );
  for (const car of sorted) {
    let id = `${slug(car.make)}-${slug(car.model)}`;
    for (let n = 2; ids.has(id); n++) id = `${slug(car.make)}-${slug(car.model)}-${n}`;
    ids.add(id);
    out.push({
      id,
      make: car.make,
      model: car.model,
      years: [car.from, car.to],
      body: car.body ?? bodyFor(car.model, car.types),
    });
  }
  return out;
}

const cars = build(rows);
const json = `[\n${cars.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`;
await writeFile(OUT, json);
const makes = new Set(cars.map((c) => c.make)).size;
process.stderr.write(`Wrote ${cars.length} models from ${makes} makes to ${OUT} (${(json.length / 1024).toFixed(0)} KB)\n`);
