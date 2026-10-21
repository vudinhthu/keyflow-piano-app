"""Fetch the pinned Tone.js web edition of Salamander, never at runtime."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen
import hashlib, json

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'public/samples/salamander'
TARGET.mkdir(parents=True, exist_ok=True)
BASE = 'https://raw.githubusercontent.com/Tonejs/audio/master/salamander/'
names = [f'{note}{octave}' for octave in range(2,7) for note in ['C','Ds','Fs','A']] + ['C7']

def download(name):
    url = BASE + name + '.mp3'
    with urlopen(url, timeout=60) as response:
        data = response.read()
    assert len(data)>1000, f'Invalid sample: {name}'
    (TARGET/(name+'.mp3')).write_bytes(data)
    print(f'{name}: {len(data)} bytes', flush=True)
    return {'note':name.replace('s','#'), 'file':name+'.mp3', 'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest(), 'source':url}

with ThreadPoolExecutor(max_workers=5) as pool:
    assets=list(pool.map(download,names))
manifest = {'instrument':'Salamander Grand Piano', 'author':'Alexander Holm', 'license':'CC BY 3.0', 'version':'keyflow-core-v1', 'range':'C2-C7', 'layers':1, 'assets':assets, 'totalBytes':sum(a['bytes'] for a in assets)}
manifest_text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
(TARGET/'manifest.json').write_text(manifest_text)
(ROOT/'src/features/audio/sample-manifest.json').write_text(manifest_text)
assert manifest['totalBytes']<12*1024*1024, 'Core sample budget exceeded'
print(f"Verified {len(assets)} files, {manifest['totalBytes']} bytes")
