#!/usr/bin/env python3
"""Build giza/data/terrain.png from real elevation data.

Source: AWS Open Data "Terrain Tiles" (Terrarium encoding, zoom 15), which
for this area is derived from SRTM.  The pyramids themselves show up in that
data as blurred bumps, so their footprints are removed and in-painted; the
app models them explicitly.  The Nile-valley floor (covered by the modern
city) is smoothed to remove building noise.

Output encoding (8-bit RGB PNG, 512 x 512, 10 m per pixel; the source is
SRTM at ~30 m so nothing is lost):
    v = round((elevation_asl_m + 20) * 400)   ->  R = v >> 8, G = v & 255
World frame: x = east, z = south, origin = centre of Khufu's base.
The heightmap covers [CX - 2560, CX + 2560] x [CZ - 2560, CZ + 2560].

Usage:  python3 tools/gen_terrain.py [cache_dir]
"""
import math, os, sys, urllib.request
import numpy as np
from PIL import Image

LAT0, LON0 = 29.979175, 31.134358          # Khufu centre
M_PER_DEG_LAT = 110857.0
M_PER_DEG_LON = 111319.5 * math.cos(math.radians(LAT0))
CX, CZ, SIZE, RES = -100.0, 350.0, 5120.0, 512
Z = 15
TX = range(19215, 19221)
TY = range(13519, 13525)

# (x, z, half side incl. margin) of features to in-paint
FOOTPRINTS = [
    (0.0, 0.0, 115 + 45),          # Khufu
    (-340.0, 340.0, 107.6 + 45),   # Khafre
    (-581.0, 740.0, 52.5 + 35),    # Menkaure
    (172.0, 40.0, 25 + 18), (172.0, 98.0, 25 + 18), (168.0, 156.0, 24 + 18),
    (-615.0, 850.0, 22 + 15), (-680.0, 850.0, 16 + 15), (-735.0, 850.0, 16 + 15),
]


def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    tiles = {}
    for x in TX:
        for y in TY:
            p = os.path.join(cache, f"t_{x}_{y}.png")
            if not os.path.exists(p):
                url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png"
                urllib.request.urlretrieve(url, p)
            a = np.asarray(Image.open(p).convert("RGB")).astype(np.float64)
            tiles[(x, y)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    m = np.zeros((256 * len(TY), 256 * len(TX)))
    for i, y in enumerate(TY):
        for j, x in enumerate(TX):
            m[i * 256:(i + 1) * 256, j * 256:(j + 1) * 256] = tiles[(x, y)]
    return m


def ll_to_mosaic(lat, lon):
    n = 2 ** Z
    X = (lon + 180) / 360 * n
    latr = np.radians(lat)
    Y = (1 - np.log(np.tan(latr) + 1 / np.cos(latr)) / math.pi) / 2 * n
    return (X - TX[0]) * 256 - 0.5, (Y - TY[0]) * 256 - 0.5


def bilinear(img, px, py):
    h, w = img.shape
    px = np.clip(px, 0, w - 1.001); py = np.clip(py, 0, h - 1.001)
    x0 = np.floor(px).astype(int); y0 = np.floor(py).astype(int)
    fx = px - x0; fy = py - y0
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def gblur(img, sigma_px):
    if sigma_px <= 0:
        return img
    r = int(sigma_px * 3) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_px) ** 2); k /= k.sum()
    pad = np.pad(img, r, mode="edge")
    tmp = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, pad)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, tmp)


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), ".dem-cache")
    mosaic = fetch(cache)
    step = SIZE / RES
    coords = CX - SIZE / 2 + step * (np.arange(RES) + 0.5)
    zc = CZ - SIZE / 2 + step * (np.arange(RES) + 0.5)
    X, Zg = np.meshgrid(coords, zc)
    lat = LAT0 - Zg / M_PER_DEG_LAT
    lon = LON0 + X / M_PER_DEG_LON
    px, py = ll_to_mosaic(lat, lon)
    h = bilinear(mosaic, px, py)

    # in-paint pyramid bumps with normalized convolution
    mask = np.ones_like(h)
    for fx, fz, hs in FOOTPRINTS:
        inside = (np.abs(X - fx) < hs) & (np.abs(Zg - fz) < hs)
        mask[inside] = 0.0
    final = None
    for sigma in (160, 70, 30):
        num = gblur(h * mask, sigma / step)
        den = gblur(mask, sigma / step)
        est = num / np.maximum(den, 1e-9)
        if final is None:
            final = est
        else:
            wgt = np.clip((den - 0.15) / 0.35, 0, 1)
            final = final * (1 - wgt) + est * wgt
    h = np.where(mask > 0.5, h, final)

    # smooth: light everywhere, heavy on the valley floor (modern city noise)
    light = gblur(h, 18 / step)
    heavy = gblur(h, 45 / step)
    w = np.clip((34.0 - heavy) / 8.0, 0, 1)        # 1 on valley floor
    h = light * (1 - w) + heavy * w

    v = np.clip(np.round((h + 20.0) * 400.0), 0, 65535).astype(np.uint16)
    rgb = np.zeros((RES, RES, 3), np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    out = os.path.join(os.path.dirname(__file__), "..", "giza", "data", "terrain.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    Image.fromarray(rgb).save(out, optimize=True)
    print("wrote", out, "range", h.min(), h.max())


if __name__ == "__main__":
    main()
