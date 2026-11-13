"""Convert NASA OSDR OSD-569 (Inspiration4) Complete Blood Count CSV into app JSON.

Source file: data/nasa/LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv
Downloaded from: https://osdr.nasa.gov/geode-py/ws/studies/OSD-569/download?source=datamanager&file=LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv
Run: python3 -I tools/import_osd569.py data/nasa/LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv src/content/nasa/osd569-cbc.json
Values are copied unchanged. Only analyte names are normalised ("HEMOGLOBIN (FEMALE)" -> "HEMOGLOBIN").
"""
import csv, hashlib, json, sys, datetime, os

src, out = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
rows = list(csv.DictReader(open(src, encoding='utf-8-sig')))

def day(t):  # L-92 -> -92 (days before launch); R+1 -> +1 (days after return)
    return {'phase': 'pre' if t[0] == 'L' else 'post', 'days': int(t[1:])}

recs = []
for i, r in enumerate(rows):
    recs.append({
        'row': i + 2,  # line number in the CSV, header is line 1
        'subject': r['SUBJECT_ID'], 'sex': r['SEX'], 'timepoint': r['TEST_DATE'], **day(r['TEST_DATE']),
        'analyte': r['ANALYTE'].replace(' (FEMALE)', ''), 'value': float(r['VALUE']),
        'min': float(r['RANGE_MIN']), 'max': float(r['RANGE_MAX']), 'units': r['UNITS'],
    })

os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({
    'source': {
        'study': 'OSD-569',
        'mission': 'Inspiration4 (SpaceX, Sept 2021, 3-day free-flying orbital mission, 4 civilian crew)',
        'file': os.path.basename(src),
        'url': 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
        'downloadUrl': 'https://osdr.nasa.gov/geode-py/ws/studies/OSD-569/download?source=datamanager&file=' + os.path.basename(src),
        'sha256': hashlib.sha256(raw).hexdigest(),
        'importedAt': datetime.date.today().isoformat(),
        'consent': 'All crew members consented for data and sample sharing (OSD-569 study protocol, Weill Cornell IRB 21-05023569).',
        'timepointKey': 'L-n = n days before launch; R+n = n days after return to Earth.',
    },
    'rows': recs,
}, open(out, 'w'), indent=0)
print(len(recs), 'rows ->', out)
