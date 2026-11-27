#!/usr/bin/env python3
"""Procedurally generate the tileable PBR textures used by the Giza scene.

Everything here is synthesised from noise (numpy only), so the textures are
original and carry no third-party licence.  All outputs tile seamlessly.

    python3 tools/gen_textures.py            # writes giza/textures/*.jpg
"""
import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "giza", "textures")
RNG = np.random.default_rng(20251126)


# ----------------------------------------------------------------- noise ---
def spectral(n, beta=2.0, lo=1.0, hi=None, seed=None, aniso=(1.0, 1.0)):
    """Tileable fractal noise via inverse FFT, normalised to [0,1]."""
    rng = np.random.default_rng(seed) if seed is not None else RNG
    hi = hi or n / 2
    fx = np.fft.fftfreq(n) * n
    fy = np.fft.fftfreq(n) * n
    FX, FY = np.meshgrid(fx, fy)
    f = np.sqrt((FX * aniso[0]) ** 2 + (FY * aniso[1]) ** 2)
    amp = np.where((f >= lo) & (f <= hi), 1.0 / np.maximum(f, 1e-6) ** (beta / 2), 0)
    phase = rng.uniform(0, 2 * np.pi, (n, n))
    spec = amp * np.exp(1j * phase)
    img = np.real(np.fft.ifft2(spec))
    img -= img.min(); img /= img.max() + 1e-12
    return img


def worley(n, cells, seed=None, jitter=1.0):
    """Tileable Worley noise.  Returns F1, F2 (in cell units) and cell id."""
    rng = np.random.default_rng(seed) if seed is not None else RNG
    pts = rng.uniform(0.5 - jitter / 2, 0.5 + jitter / 2, (cells, cells, 2))
    ids = rng.uniform(0, 1, (cells, cells))
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float64)
    u = xs / n * cells; v = ys / n * cells
    cx = np.floor(u).astype(int); cy = np.floor(v).astype(int)
    f1 = np.full((n, n), 9.0); f2 = np.full((n, n), 9.0); idv = np.zeros((n, n))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            gx = cx + dx; gy = cy + dy
            px = pts[gy % cells, gx % cells, 0] + gx
            py = pts[gy % cells, gx % cells, 1] + gy
            d = np.sqrt((px - u) ** 2 + (py - v) ** 2)
            cid = ids[gy % cells, gx % cells]
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            idv = np.where(closer, cid, idv)
            f1 = np.where(closer, d, f1)
    return f1, f2, idv


def normal_from_height(h, strength):
    """Tileable normal map (OpenGL convention, +Y up) from a height field."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength; ny = dy * strength; nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5
    return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)


def blur(img, r):
    """Cheap tileable box blur (3 passes ~ gaussian)."""
    out = img
    for _ in range(3):
        acc = np.zeros_like(out)
        for k in range(-r, r + 1):
            acc += np.roll(out, k, 0)
        out = acc / (2 * r + 1)
        acc = np.zeros_like(out)
        for k in range(-r, r + 1):
            acc += np.roll(out, k, 1)
        out = acc / (2 * r + 1)
    return out


def save_rgb(name, rgb, q=90):
    os.makedirs(OUT, exist_ok=True)
    arr = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(arr).save(os.path.join(OUT, name), quality=q, optimize=True)
    print("wrote", name)


def col(hexs):
    h = hexs.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float64)


def lerp(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


# ------------------------------------------------------------- textures ---
def sand(n=1024):
    """Wind-rippled desert sand with scattered grit.  Tile = 4 m."""
    base = spectral(n, 2.2, 2, 200)
    fine = spectral(n, 0.6, 60, n / 2)
    warp = spectral(n, 3.0, 1, 8)
    ys, xs = np.mgrid[0:n, 0:n] / n
    # ripples ~9 cm wavelength, gently curving
    phase = (ys * 44 + xs * 7 + warp * 3.2) * 2 * np.pi
    rip = (np.sin(phase) * 0.5 + 0.5) ** 1.6
    ripmask = np.clip(spectral(n, 2.5, 1, 6) * 1.8 - 0.35, 0, 1)
    f1, f2, cid = worley(n, 180, seed=3)
    grit = ((f1 < 0.16) & (cid > 0.82)).astype(float)
    grit = blur(grit, 1)
    h = base * 0.6 + rip * ripmask * 0.55 + fine * 0.18 + grit * 0.6
    c1, c2, c3 = col("#d6b88c"), col("#c39d6c"), col("#e3caa0")
    alb = lerp(c1, c2, base)
    alb = lerp(alb, c3, np.clip(rip * ripmask * 0.6, 0, 1))
    alb = alb * (0.9 + fine[..., None] * 0.2)
    dark = lerp(col("#8a6f52"), col("#5d5047"), cid)
    alb = lerp(alb, dark, np.clip(grit * 0.9, 0, 1))
    save_rgb("sand_albedo.jpg", alb)
    save_rgb("sand_normal.jpg", normal_from_height(h, 2.2), 92)


def gravel(n=1024):
    """Desert pavement: limestone chips and flint over compacted sand.  Tile = 3 m."""
    base = spectral(n, 2.0, 2, 120, seed=11)
    fine = spectral(n, 0.5, 80, n / 2, seed=12)
    f1, f2, cid = worley(n, 70, seed=13)
    edge = f2 - f1
    present = cid > 0.35
    stone = np.clip((edge - 0.08) * 6, 0, 1) * present
    stone_h = np.sqrt(np.clip(edge, 0, 1)) * present
    g1, g2, gid = worley(n, 200, seed=14)
    small = np.clip(((g2 - g1) - 0.12) * 8, 0, 1) * (gid > 0.55)
    h = base * 0.35 + stone_h * 0.9 + small * 0.35 + fine * 0.1
    sandc = lerp(col("#d9bb8f"), col("#c4a173"), base)
    tint = np.where(cid[..., None] > 0.93, col("#8a7462"),
            np.where(cid[..., None] > 0.78, col("#bba184"),
            np.where(cid[..., None] > 0.55, col("#e6d6b8"), col("#cfb48c"))))
    shade = (0.75 + 0.35 * np.clip(edge * 2, 0, 1))[..., None]
    alb = lerp(sandc, tint * shade, stone)
    stint = np.where(gid[..., None] > 0.88, col("#7a6656"), col("#dccaa8"))
    alb = lerp(alb, stint, small * 0.6)
    alb *= (0.92 + fine[..., None] * 0.16)
    save_rgb("gravel_albedo.jpg", alb)
    save_rgb("gravel_normal.jpg", normal_from_height(h, 3.5), 92)


def limestone(n=1024):
    """Weathered nummulitic limestone (core blocks).  Tile = 2.2 m."""
    mott = spectral(n, 2.6, 1, 64, seed=21)
    mid = spectral(n, 1.8, 8, 200, seed=22)
    fine = spectral(n, 0.4, 100, n / 2, seed=23)
    bed = spectral(n, 2.0, 1, 90, seed=24, aniso=(14.0, 1.0))   # horizontal bedding
    f1, f2, cid = worley(n, 70, seed=25)
    tmask = spectral(n, 2.4, 1, 12, seed=27)
    pits = np.clip(1 - f1 / 0.32, 0, 1) ** 1.5 * (cid > 0.55) * np.clip((tmask - 0.35) * 3, 0, 1)
    g1, g2, gid = worley(n, 200, seed=26)
    small = np.clip(1 - g1 / 0.3, 0, 1) ** 2 * (gid > 0.6)        # small solution pits
    h1, h2, hid = worley(n, 300, seed=28)
    numm = np.clip(1 - h1 / 0.25, 0, 1) * (hid > 0.72)            # fossil discs
    crack = np.clip(1 - (f2 - f1) / 0.035, 0, 1) * (spectral(n, 2.2, 1, 10, seed=29) > 0.55)
    h = mid * 0.5 + bed * 0.5 + fine * 0.22 - pits * 1.3 - small * 0.45 + numm * 0.08 - crack * 0.5
    c_lo, c_hi = col("#a88b63"), col("#dcc49c")
    alb = lerp(c_lo, c_hi, np.clip(mott * 0.75 + bed * 0.45 + mid * 0.2 - 0.18, 0, 1))
    alb = lerp(alb, col("#978876"), np.clip((1 - mott) - 0.5, 0, 1) * 1.1)   # greyish patches
    alb = lerp(alb, col("#c79a6a"), np.clip(spectral(n, 2.8, 1, 20, seed=30) - 0.62, 0, 1) * 1.6)  # iron stain
    alb = lerp(alb, col("#ece0c8"), numm * 0.45)
    alb = lerp(alb, col("#4f3e2f"), np.clip(pits * 1.2 + small * 0.6 + crack * 0.7, 0, 1))
    alb *= (0.84 + fine[..., None] * 0.3)
    save_rgb("limestone_albedo.jpg", alb)
    save_rgb("limestone_normal.jpg", normal_from_height(h, 7.0), 92)


def casing(n=1024):
    """Fine white Tura limestone (original casing).  Tile = 4 m."""
    mott = spectral(n, 2.8, 1, 50, seed=31)
    fine = spectral(n, 0.8, 60, n / 2, seed=32)
    alb = lerp(col("#e8dfcc"), col("#f6f0e2"), mott)
    alb *= (0.96 + fine[..., None] * 0.08)
    save_rgb("casing_albedo.jpg", alb)
    h = mott * 0.2 + fine * 0.2
    save_rgb("casing_normal.jpg", normal_from_height(h, 1.0), 92)


def granite(n=1024):
    """Red Aswan granite: pink feldspar, grey quartz, black biotite.  Tile = 1.5 m."""
    f1, f2, cid = worley(n, 110, seed=41, jitter=0.9)
    g1, g2, gid = worley(n, 240, seed=42)
    mott = spectral(n, 2.2, 2, 80, seed=43)
    fine = spectral(n, 0.3, 120, n / 2, seed=44)
    feld = lerp(col("#9c6a5c"), col("#bf8f7f"), cid)
    quartz = lerp(col("#8f8a85"), col("#b8b1aa"), cid)
    alb = np.where(cid[..., None] > 0.72, quartz, feld)
    crack = np.clip(1 - (f2 - f1) / 0.05, 0, 1)
    alb = lerp(alb, col("#5a3d36"), crack * 0.5)
    bio = np.clip(1 - g1 / 0.35, 0, 1) * (gid > 0.62)
    alb = lerp(alb, col("#1d1714"), np.clip(bio * 1.6, 0, 1))
    alb *= (0.9 + mott[..., None] * 0.15 + fine[..., None] * 0.08)
    save_rgb("granite_albedo.jpg", alb)
    h = mott * 0.2 + fine * 0.3 + (1 - crack) * 0.1
    save_rgb("granite_normal.jpg", normal_from_height(h, 1.2), 92)


def rock(n=1024):
    """Layered bedrock with erosion grooves (quarry faces, Sphinx).  Tile = 8 m."""
    warp = spectral(n, 2.6, 1, 10, seed=52)
    ys, xs = np.mgrid[0:n, 0:n] / n
    # irregular bed thicknesses: sample a 1-D random profile along y, warped
    prof = spectral(n, 1.6, 2, 60, seed=51, aniso=(0.0001, 1.0))[:, 0]
    yy = (ys + (warp - 0.5) * 0.05) % 1.0
    strata = np.interp(yy.ravel(), np.linspace(0, 1, n), prof).reshape(n, n)
    beds = np.floor(strata * 7) / 7
    mid = spectral(n, 1.6, 6, 220, seed=53)
    fine = spectral(n, 0.5, 120, n / 2, seed=54)
    f1, f2, cid = worley(n, 14, seed=55)
    cracks = np.clip(1 - (f2 - f1) / 0.025, 0, 1) * (spectral(n, 2, 1, 6, seed=56) > 0.7) * 0.7
    hollow = np.clip(spectral(n, 2.2, 3, 40, seed=57) - 0.55, 0, 1) * 2.5
    h = strata * 0.6 + mid * 0.4 + fine * 0.15 - cracks * 0.6 - hollow * 0.5
    alb = lerp(col("#ad8f68"), col("#d6bd96"), np.clip(beds * 0.9 + mid * 0.3 - 0.1, 0, 1))
    alb = lerp(alb, col("#8e7c69"), np.clip(mid - 0.62, 0, 1) * 1.5)
    alb = lerp(alb, col("#5a4636"), np.clip(cracks * 0.7 + hollow * 0.4, 0, 1))
    alb *= (0.86 + fine[..., None] * 0.24)
    save_rgb("rock_albedo.jpg", alb)
    save_rgb("rock_normal.jpg", normal_from_height(h, 4.0), 92)


def asphalt(n=512):
    base = spectral(n, 1.5, 4, 200, seed=61)
    f1, f2, cid = worley(n, 160, seed=62)
    agg = np.clip(1 - f1 / 0.3, 0, 1) * (cid > 0.6)
    alb = lerp(col("#4a4643"), col("#5d5853"), base)
    alb = lerp(alb, col("#8a847c"), agg * 0.6)
    save_rgb("asphalt_albedo.jpg", alb)


if __name__ == "__main__":
    sand(); gravel(); limestone(); casing(); granite(); rock(); asphalt()
