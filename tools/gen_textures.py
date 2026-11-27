#!/usr/bin/env python3
"""Procedurally generate the tileable PBR textures used by the spots.

Everything here is synthesised from noise (numpy only), so the textures are
original and carry no third-party licence.  All outputs tile seamlessly.

    python3 tools/gen_textures.py              # writes giza/textures/*.jpg
    python3 tools/gen_textures.py colosseum    # writes colosseum/textures/*.jpg
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "giza", "textures")
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


def water(n=512):
    """Wind ripples for the Nile flood.  Tile = 24 m."""
    a = spectral(n, 2.6, 6, 80, seed=71)
    b = spectral(n, 1.8, 30, 200, seed=72, aniso=(1.0, 2.5))
    h = a * 0.7 + b * 0.3
    save_rgb("water_normal.jpg", normal_from_height(h, 6.0), 90)


# ------------------------------------------------------------ Colosseum ---
def travertine(n=1024):
    """Roman travertine (façade and arcades).  Tile = 2.0 m.  Cream stone with
    long horizontal vugs, grey weathering crust and dark run-off."""
    mott = spectral(n, 2.4, 1, 48, seed=101)
    bands = spectral(n, 2.0, 1, 120, seed=102, aniso=(18.0, 1.0))     # horizontal layering
    fine = spectral(n, 0.5, 100, n / 2, seed=103)
    # vugs: worley cells stretched horizontally (sample with squashed y)
    f1, f2, cid = worley(n, 90, seed=104)
    stretch = np.clip(1 - f1 / 0.22, 0, 1)
    vmask = (cid > 0.62) * (spectral(n, 2.2, 1, 16, seed=105) > 0.45)
    vug = blur(stretch * vmask, 1)
    vug = np.clip(vug * 1.8, 0, 1)
    hv = spectral(n, 1.6, 30, 300, seed=106, aniso=(10.0, 1.0))
    vug2 = np.clip((hv - 0.78) * 6, 0, 1)                                # long thin horizontal pores
    crust = np.clip(spectral(n, 2.6, 1, 24, seed=107) - 0.55, 0, 1) * 2.2
    h = bands * 0.5 + mott * 0.3 + fine * 0.15 - vug * 1.1 - vug2 * 0.7
    alb = lerp(col("#b9ac93"), col("#e3d8c2"), np.clip(bands * 0.7 + mott * 0.5 - 0.15, 0, 1))
    alb = lerp(alb, col("#9a9389"), crust * 0.75)                        # grey weathering
    alb = lerp(alb, col("#c9a77c"), np.clip(spectral(n, 2.8, 1, 18, seed=108) - 0.66, 0, 1) * 1.5)  # warm stain
    alb = lerp(alb, col("#5b5248"), np.clip(vug * 0.9 + vug2 * 0.8, 0, 1))
    alb *= (0.87 + fine[..., None] * 0.26)
    save_rgb("travertine_albedo.jpg", alb)
    save_rgb("travertine_normal.jpg", normal_from_height(h, 5.0), 92)


def brick(n=1024):
    """Roman brick facing (opus testaceum).  Tile = 1.2 m: 24 courses of long,
    thin bricks (3.5 cm) in thick mortar beds (1.5 cm), weathered."""
    rng = np.random.default_rng(111)
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float64)
    courses, per = 24, 4
    cy = ys / n * courses
    row = np.floor(cy).astype(int)
    fy = cy - row
    mortar_y = fy > 0.7                                     # bed joints
    lengths = rng.uniform(0.7, 1.3, (courses, per))
    starts = np.cumsum(lengths, 1)
    starts = starts / starts[:, -1:]                        # tileable: each row sums to 1
    offs = rng.uniform(0, 1, courses)
    fx = (xs / n + offs[row]) % 1.0
    idx = np.zeros_like(fx, dtype=int)
    for j in range(per - 1):
        idx += (fx > starts[row, j]).astype(int)
    prev = np.where(idx > 0, starts[row, np.maximum(idx - 1, 0)], 0.0)
    nxt = starts[row, np.minimum(idx, per - 1)]
    dist = np.minimum(fx - prev, nxt - fx)
    mortar_x = dist < 0.01
    mortar = mortar_y | mortar_x
    bid = (row * 13 + idx * 7) % 97 / 97.0
    tone = spectral(n, 2.2, 1, 40, seed=112)
    fine = spectral(n, 0.6, 80, n / 2, seed=113)
    red = lerp(col("#6f4331"), col("#a8694a"), np.clip(bid * 0.7 + tone * 0.5 - 0.1, 0, 1))
    red = lerp(red, col("#9a8466"), np.clip((bid - 0.8) * 4, 0, 1))      # yellowish bricks
    mort = lerp(col("#8e8678"), col("#b3aa98"), tone)
    alb = np.where(mortar[..., None], mort, red)
    erosion = np.clip(spectral(n, 2.4, 1, 20, seed=114) - 0.45, 0, 1) * 2
    alb = lerp(alb, col("#77706a"), erosion * 0.4)
    alb *= (0.84 + fine[..., None] * 0.32)
    h = np.where(mortar, 0.0, 0.6 + fine * 0.25) + tone * 0.1
    h = blur(h, 1)
    save_rgb("brick_albedo.jpg", alb)
    save_rgb("brick_normal.jpg", normal_from_height(h, 6.0), 92)


def tuff(n=1024):
    """Volcanic tuff (inner walls).  Tile = 2.0 m.  Porous, greyish-yellow,
    with dark scoria and pumice flecks."""
    mott = spectral(n, 2.2, 1, 40, seed=121)
    fine = spectral(n, 0.5, 120, n / 2, seed=122)
    f1, f2, cid = worley(n, 160, seed=123)
    scoria = np.clip(1 - f1 / 0.35, 0, 1) * (cid > 0.8)
    g1, g2, gid = worley(n, 260, seed=124)
    pores = np.clip(1 - g1 / 0.3, 0, 1) * (gid > 0.55)
    h = mott * 0.4 + fine * 0.3 - pores * 0.6 - scoria * 0.3
    alb = lerp(col("#857a63"), col("#b0a27f"), np.clip(mott * 0.9 + 0.05, 0, 1))
    alb = lerp(alb, col("#3e3a33"), scoria * 0.8)
    alb = lerp(alb, col("#6c6250"), pores * 0.6)
    alb *= (0.85 + fine[..., None] * 0.3)
    save_rgb("tuff_albedo.jpg", alb)
    save_rgb("tuff_normal.jpg", normal_from_height(h, 4.0), 92)


def marble(n=1024):
    """White Luna marble (seats, cladding).  Tile = 2.0 m."""
    a = spectral(n, 2.6, 1, 30, seed=131)
    b = spectral(n, 2.0, 2, 80, seed=132)
    veins = np.abs(np.sin((a * 9 + b * 3) * np.pi))
    v = np.clip(1 - veins / 0.08, 0, 1) * (spectral(n, 2.4, 1, 12, seed=133) > 0.45)
    fine = spectral(n, 0.6, 100, n / 2, seed=134)
    alb = lerp(col("#dedad2"), col("#f4f1ea"), np.clip(b * 0.8, 0, 1))
    alb = lerp(alb, col("#8e8d8b"), v * 0.55)
    alb *= (0.95 + fine[..., None] * 0.08)
    save_rgb("marble_albedo.jpg", alb)
    save_rgb("marble_normal.jpg", normal_from_height(fine * 0.3 + b * 0.2, 1.0), 92)


def cobble(n=1024):
    """Sampietrini: 12 cm basalt setts in straight courses.  Tile = 1.92 m."""
    rng = np.random.default_rng(141)
    k = 16
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float64)
    cy = ys / n * k
    row = np.floor(cy).astype(int)
    off = rng.uniform(0, 1, k)
    cx = (xs / n * k + off[row]) % k
    colx = np.floor(cx).astype(int)
    fx = cx - colx; fy = cy - row
    e = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
    dome = np.clip(e / 0.18, 0, 1) ** 0.6
    sid = (row * 31 + colx * 17) % 101 / 101.0
    fine = spectral(n, 0.6, 100, n / 2, seed=142)
    dirt = spectral(n, 2.2, 1, 24, seed=143)
    alb = lerp(col("#3b3a38"), col("#67635d"), np.clip(sid * 0.8 + fine * 0.3, 0, 1))
    alb = lerp(alb, col("#2a2724"), np.clip(1 - e / 0.07, 0, 1) * 0.8)     # joints
    alb = lerp(alb, col("#8f8574"), np.clip(dirt - 0.6, 0, 1) * 1.2)        # dust
    h = dome * 0.8 + fine * 0.1
    save_rgb("cobble_albedo.jpg", alb)
    save_rgb("cobble_normal.jpg", normal_from_height(h, 5.0), 92)


def grass(n=1024):
    """Mown park grass with dry patches.  Tile = 4 m."""
    a = spectral(n, 2.0, 2, 60, seed=151)
    b = spectral(n, 0.4, 150, n / 2, seed=152)
    dry = np.clip(spectral(n, 2.6, 1, 10, seed=153) - 0.5, 0, 1) * 2
    alb = lerp(col("#4d5e2a"), col("#7b8a3e"), np.clip(a * 0.8 + b * 0.4 - 0.1, 0, 1))
    alb = lerp(alb, col("#9b8f5a"), dry * 0.7)
    alb *= (0.8 + b[..., None] * 0.4)
    save_rgb("grass_albedo.jpg", alb)
    save_rgb("grass_normal.jpg", normal_from_height(b * 0.6 + a * 0.2, 3.0), 92)


def soil(n=1024):
    """Packed archaeological soil and sand (the arena, paths).  Tile = 3 m."""
    a = spectral(n, 2.2, 1, 50, seed=161)
    fine = spectral(n, 0.5, 120, n / 2, seed=162)
    f1, f2, cid = worley(n, 140, seed=163)
    peb = np.clip(1 - f1 / 0.3, 0, 1) * (cid > 0.75)
    alb = lerp(col("#8c7556"), col("#b39b76"), np.clip(a * 0.9, 0, 1))
    alb = lerp(alb, col("#c9bba2"), peb * 0.6)
    alb *= (0.86 + fine[..., None] * 0.28)
    h = a * 0.3 + fine * 0.3 + peb * 0.5
    save_rgb("soil_albedo.jpg", alb)
    save_rgb("soil_normal.jpg", normal_from_height(h, 3.0), 92)


def planks(n=512):
    """Wooden arena floor planks.  Tile = 2.4 m (8 planks of 30 cm)."""
    rng = np.random.default_rng(171)
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float64)
    k = 8
    cy = ys / n * k; row = np.floor(cy).astype(int); fy = cy - row
    off = rng.uniform(0, 1, k)
    fx = (xs / n + off[row]) % 1.0
    seam = (fy < 0.03) | (fy > 0.97) | (np.abs(fx - 0.5) < 0.004)
    grain = spectral(n, 1.4, 4, 200, seed=172, aniso=(1.0, 14.0))
    tone = rng.uniform(0, 1, k)[row]
    alb = lerp(col("#6e5238"), col("#a07b55"), np.clip(grain * 0.6 + tone * 0.5, 0, 1))
    alb = np.where(seam[..., None], col("#2e2117"), alb)
    save_rgb("planks_albedo.jpg", alb)
    save_rgb("planks_normal.jpg", normal_from_height(np.where(seam, 0.0, 0.5) + grain * 0.2, 4.0), 92)


if __name__ == "__main__":
    site = sys.argv[1] if len(sys.argv) > 1 else "giza"
    OUT = os.path.join(ROOT, site, "textures")
    if site == "giza":
        sand(); gravel(); limestone(); casing(); granite(); rock(); asphalt(); water()
    elif site == "colosseum":
        travertine(); brick(); tuff(); marble(); cobble(); grass(); soil(); planks(); asphalt()
    else:
        sys.exit("usage: gen_textures.py [giza|colosseum]")
