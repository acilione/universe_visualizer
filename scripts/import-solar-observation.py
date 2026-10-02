#!/usr/bin/env python3
"""Reproduce a bounded, dated HMI hemisphere, never a fictitious global map.
Requires Pillow and NumPy. Keeps the original image, verifies its SHA256, removes
its radial display-brightness profile, and records valid coverage in alpha.
"""
import argparse, hashlib, json, urllib.request
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
META = ROOT / 'src/solar-observation.json'

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    data = json.loads(META.read_text())
    source = ROOT / 'public/textures' / data['referenceMap']
    target = ROOT / 'public/textures' / data['map']
    if args.verify:
        assert digest(source) == data['sourceSha256'], 'HMI observation checksum changed'
        assert digest(target) == data['mapSha256'], 'HMI contrast checksum changed'
        with Image.open(target) as image: image.verify()
        print('Verified dated HMI observation and hemisphere contrast map'); return
    if not source.exists():
        with urllib.request.urlopen(data['assetUrl'], timeout=30) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024: raise ValueError('HMI source exceeds 4 MiB bound')
        if hashlib.sha256(raw).hexdigest() != data['sourceSha256']: raise ValueError('Unexpected HMI observation bytes')
        source.parent.mkdir(parents=True, exist_ok=True); source.write_bytes(raw)
    if digest(source) != data['sourceSha256']: raise ValueError('Unexpected HMI observation bytes')
    image = np.asarray(Image.open(source).convert('L'), dtype=float) / 255
    height, width = image.shape
    y, x = np.indices(image.shape)
    cx, cy = data['diskCenterPx']; radius = data['diskRadiusPx']
    r = np.hypot(x-cx, y-cy)
    bins = np.floor(r).astype(int)
    profile = np.array([np.median(image[bins == i]) for i in range(int(radius)+1)])
    # Median annuli preserve spots and real texture while removing the baked
    # observing-angle brightness; the renderer supplies view-dependent limb shading.
    baseline = np.interp(r.ravel(), np.arange(len(profile))+.5, profile).reshape(image.shape)
    contrast = np.clip(image / np.maximum(baseline, .02), 0, 255/128)
    valid = r <= radius * .96
    rgba = np.full((height, width, 4), 128, dtype=np.uint8)
    rgba[:, :, :3] = np.where(valid, np.rint(contrast * 128), 128).astype(np.uint8)[:, :, None]
    rgba[:, :, 3] = np.where(valid, 255, 0)
    # Unknown pixels are transparent neutral contrast, not synthesized terrain.
    Image.fromarray(rgba).save(target, optimize=True)
    data.update(mapSha256=digest(target), width=width, height=height,
                bytes=target.stat().st_size, validPixels=int(valid.sum()),
                processing='Radial-median normalization of archived grayscale browse image; observed disk only; no inpainting, generative detail or geographic filling.')
    META.write_text(json.dumps(data, indent=2)+'\n')
    print('Imported HMI hemisphere', data['observationDateUtc'], data['validPixels'], 'observed pixels')
if __name__ == '__main__': main()
