#!/usr/bin/env python3
"""Build a spot's terrain heightmap (<site>/data/terrain.png) from real
elevation data.

Source: AWS Open Data "Terrain Tiles" (Terrarium encoding, zoom 15), derived
from SRTM.  Monuments the app models itself show up in that data as blurred
bumps, so their footprints are removed and in-painted.  The result is then
smoothed: lightly everywhere, heavily where the ground is low (the modern city
on the valley floor, whose buildings the radar saw as terrain).

Output encoding (8-bit RGB PNG, RES x RES; SRTM is ~30 m so nothing is lost
at 10 m per pixel):
    v = round((elevation_asl_m + 20) * 400)   ->  R = v >> 8, G = v & 255
World frame: x = east, z = south, origin at the site's (lat0, lon0).
The heightmap covers [cx - size/2, cx + size/2] x [cz - size/2, cz + size/2].

Usage:  python3 tools/gen_terrain.py <site> [cache_dir]      (site: giza)
"""
import math, os, sys, urllib.request
import numpy as np
from PIL import Image

Z = 15
M_PER_DEG_LAT = 110857.0

SITES = {
    "giza": dict(
        lat0=29.979175, lon0=31.134358,          # Khufu centre
        cx=-100.0, cz=350.0, size=5120.0, res=512,
        tiles=(range(19215, 19221), range(13519, 13525)),
        # (x, z, half side incl. margin) of features to in-paint
        footprints=[
            (0.0, 0.0, 115 + 45),          # Khufu
            (-340.0, 340.0, 107.6 + 45),   # Khafre
            (-581.0, 740.0, 52.5 + 35),    # Menkaure
            (172.0, 40.0, 25 + 18), (172.0, 98.0, 25 + 18), (168.0, 156.0, 24 + 18),
            (-615.0, 850.0, 22 + 15), (-680.0, 850.0, 16 + 15), (-735.0, 850.0, 16 + 15),
        ],
        # smoothing radii (m), and the height (m ASL) below which the heavy one takes over
        smooth=dict(light=18, heavy=45, low=34.0, blend=8.0),
    ),
}


def tile_range(S):
    """Tiles covering the heightmap square, unless the site lists them."""
    if "tiles" in S:
        return S["tiles"]
    m_lon = 111319.5 * math.cos(math.radians(S["lat0"]))
    h = S["size"] / 2 + 200
    lats = [S["lat0"] - (S["cz"] + d) / M_PER_DEG_LAT for d in (-h, h)]
    lons = [S["lon0"] + (S["cx"] + d) / m_lon for d in (-h, h)]
    n = 2 ** Z
    xs = [int((lo + 180) / 360 * n) for lo in lons]
    ys = [int((1 - math.log(math.tan(math.radians(la)) + 1 / math.cos(math.radians(la))) / math.pi) / 2 * n) for la in lats]
    return range(min(xs), max(xs) + 1), range(min(ys), max(ys) + 1)


def fetch(cache, TX, TY):
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


def ll_to_mosaic(lat, lon, TX, TY):
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
    if len(sys.argv) < 2 or sys.argv[1] not in SITES:
        sys.exit("usage: gen_terrain.py <%s> [cache_dir]" % "|".join(SITES))
    name = sys.argv[1]
    S = SITES[name]
    cache = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), ".dem-cache")
    TX, TY = tile_range(S)
    mosaic = fetch(cache, TX, TY)
    CX, CZ, SIZE, RES = S["cx"], S["cz"], S["size"], S["res"]
    m_per_deg_lon = 111319.5 * math.cos(math.radians(S["lat0"]))
    step = SIZE / RES
    coords = CX - SIZE / 2 + step * (np.arange(RES) + 0.5)
    zc = CZ - SIZE / 2 + step * (np.arange(RES) + 0.5)
    X, Zg = np.meshgrid(coords, zc)
    lat = S["lat0"] - Zg / M_PER_DEG_LAT
    lon = S["lon0"] + X / m_per_deg_lon
    px, py = ll_to_mosaic(lat, lon, TX, TY)
    h = bilinear(mosaic, px, py)

    # in-paint modelled monuments with normalized convolution
    mask = np.ones_like(h)
    for fx, fz, hs in S["footprints"]:
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

    # smooth: light everywhere, heavy on low ground (modern city noise)
    sm = S["smooth"]
    light = gblur(h, sm["light"] / step)
    heavy = gblur(h, sm["heavy"] / step)
    w = np.clip((sm["low"] - heavy) / sm["blend"], 0, 1)        # 1 on low ground
    h = light * (1 - w) + heavy * w

    v = np.clip(np.round((h + 20.0) * 400.0), 0, 65535).astype(np.uint16)
    rgb = np.zeros((RES, RES, 3), np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    out = os.path.join(os.path.dirname(__file__), "..", name, "data", "terrain.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    Image.fromarray(rgb).save(out, optimize=True)
    print("wrote", out, "range", h.min(), h.max())


if __name__ == "__main__":
    main()
