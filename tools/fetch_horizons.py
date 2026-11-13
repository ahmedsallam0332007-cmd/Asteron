"""Fetch daily Earth->Mars and Earth->Moon geometry from NASA JPL Horizons (real ephemeris).

We do not compute orbits ourselves: Horizons is the ephemeris service NASA/JPL use for mission design.
Run: python3 -I tools/fetch_horizons.py src/content/nasa/ephemeris.json
Stores, unchanged: delta (AU, observer-target distance) and S-O-T (Sun-Observer-Target angle, degrees),
plus the exact query URLs, fetch time and SHA-256 of each raw response.
"""
import hashlib, json, sys, urllib.parse, urllib.request, datetime

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
START, STOP = '2021-01-01', '2041-01-01'

def query(body):
    params = {
        'format': 'json', 'COMMAND': f"'{body}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'",
        'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'500@399'", 'START_TIME': f"'{START}'",
        'STOP_TIME': f"'{STOP}'", 'STEP_SIZE': "'1 d'", 'QUANTITIES': "'20,23'", 'CSV_FORMAT': "'YES'",
    }
    url = API + '?' + urllib.parse.urlencode(params)
    raw = urllib.request.urlopen(url, timeout=120).read()
    result = json.loads(raw)['result']
    rows = []
    body_lines = result.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
    for line in body_lines:
        c = [x.strip() for x in line.split(',')]
        # CSV columns: date, (solar presence), (lunar presence), delta, deldot, S-O-T, /r
        date = datetime.datetime.strptime(c[0], '%Y-%b-%d %H:%M').date().isoformat()
        rows.append([date, float(c[3]), float(c[5])])
    return {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': rows}

out = {
    'source': {
        'service': 'NASA JPL Horizons API',
        'docs': 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
        'observer': 'Earth geocenter (500@399)',
        'columns': ['date (00:00 UT)', 'delta: Earth-target distance in AU', 'S-O-T: Sun-Earth-target angle in degrees'],
        'au_km': 149597870.7,
        'fetchedAt': datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
    },
}
for name, body in [('mars', '499'), ('moon', '301')]:
    out[name] = query(body)
    print(name, len(out[name]['rows']), 'rows')
json.dump(out, open(sys.argv[1], 'w'), separators=(',', ':'))
