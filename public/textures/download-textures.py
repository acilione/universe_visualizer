"""Fetch the project's CC BY 4.0 Solar System Scope maps. See TEXTURE_SOURCES.md."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

DESTINATION = Path(__file__).resolve().parent
BASE_URL = 'https://www.solarsystemscope.com/textures/download/'
FILES = [
    '2k_mercury.jpg', '2k_venus_atmosphere.jpg', '2k_earth_daymap.jpg',
    '2k_earth_clouds.jpg', '2k_mars.jpg', '2k_jupiter.jpg', '2k_saturn.jpg',
    '2k_saturn_ring_alpha.png', '2k_uranus.jpg', '2k_neptune.jpg', '2k_sun.jpg',
]

def download(name):
    with urlopen(BASE_URL + name, timeout=90) as response:
        data = response.read()
    (DESTINATION / name).write_bytes(data)
    return f'{name}: {len(data):,} bytes'

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=5) as pool:
        for result in pool.map(download, FILES):
            print(result, flush=True)
