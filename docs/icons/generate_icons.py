#!/usr/bin/env python3
"""
Hex Vortex v2 — tight pack, open inner faces, inward recursion.

Six isometric cubes packed into one large hexagon that fills the icon.
The face of each cube that looks at the centre is an open mouth.
Nested frames + spirals + particles stream from those mouths into the
shared dark core.
"""

from __future__ import annotations

import math
import os
import random
import cairo
from PIL import Image, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))
SVG_DIR = os.path.join(OUT, "svg")
PNG_DIR = os.path.join(OUT, "png")
PREV_DIR = os.path.join(OUT, "preview")
for d in (SVG_DIR, PNG_DIR, PREV_DIR):
    os.makedirs(d, exist_ok=True)

SIZE = 1024
CX = SIZE / 2
CY = SIZE / 2
ORIGIN = (CX, CY)

# Tight like the original reference. Outer silhouette nearly fills canvas.
HEX_R = 200
RING = HEX_R * 1.38          # tight like the reference, still a readable star-hole
CORE_R = 22                  # vanishing hex the mouths recurse into

HEX_ANG = [math.radians(-90 + 60 * i) for i in range(6)]
RING_ANG = list(HEX_ANG)

FACE_IDX = {
    "top": (5, 0, 1),
    "right": (1, 2, 3),
    "left": (3, 4, 5),
}


def hex_verts(cx, cy, r):
    return [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in HEX_ANG]


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def scale_pts(pts, origin, t):
    ox, oy = origin
    return [(ox + (p[0] - ox) * t, oy + (p[1] - oy) * t) for p in pts]


def poly_s(pts):
    return " ".join(f"{p[0]:.3f},{p[1]:.3f}" for p in pts)


def near_idx(p, pts):
    return min(range(len(pts)), key=lambda i: dist(p, pts[i]))


CUBE_CENS = [(CX + RING * math.cos(a), CY + RING * math.sin(a)) for a in RING_ANG]
CORE_VERTS = hex_verts(CX, CY, CORE_R)


def cube_geom(cen, ring_i):
    verts = hex_verts(*cen, HEX_R)
    faces = {}
    for name, (i, j, k) in FACE_IDX.items():
        faces[name] = [verts[i], verts[j], verts[k], cen]

    # vertex of this cube closest to the icon centre
    inner_vi = min(range(6), key=lambda i: dist(verts[i], ORIGIN))
    # faces whose centroid is closer to the icon centre than the cube centre
    d_cen = dist(cen, ORIGIN)
    inward = []
    for name, pts in faces.items():
        if dist(centroid(pts), ORIGIN) < d_cen - 1.0:
            inward.append(name)
    if not inward:
        # fallback: face whose centroid is nearest the origin
        inward = [min(faces, key=lambda n: dist(centroid(faces[n]), ORIGIN))]

    # Target quad on the core hex: the core edge that this cube faces
    # Core vertex opposite the cube (same index as ring) plus neighbours
    # Cube i sits at angle i; it faces core vertex i (the core point in that direction)
    # Actually cube i is AT angle i, so it faces the core FROM outside.
    # The core edge closest to this cube is the two core verts nearest the inner vertex.
    inner_pt = verts[inner_vi]
    # two nearest core verts to the inner vertex, in angular order
    order = sorted(range(6), key=lambda i: dist(CORE_VERTS[i], inner_pt))
    c0, c1 = CORE_VERTS[order[0]], CORE_VERTS[order[1]]
    # keep winding consistent with the inner hex edge
    # rebuild as: inner hex-edge + a thin quad toward cube
    return {
        "cen": cen,
        "verts": verts,
        "faces": faces,
        "inward": inward,
        "inner_vi": inner_vi,
        "inner_pt": inner_pt,
        "ring_i": ring_i,
        "core_edge": (c0, c1),
    }


CUBES = [cube_geom(c, i) for i, c in enumerate(CUBE_CENS)]

PALETTES = {
    "mono": ["#F4F7FF"] * 6,
    "spectrum": ["#3EE8FF", "#FF4FD8", "#FF5A3D", "#FFE14A", "#7CFF4A", "#9B7CFF"],
    "aurora": ["#7DF9FF", "#5B8CFF", "#C45CFF", "#FF5CAD", "#FFB347", "#5CFFB0"],
    "plasma": ["#00F0FF", "#7A5CFF", "#FF3D8A", "#FF9F1C", "#C8FF3D", "#3D9FFF"],
}


def svg_filters(fid):
    return f"""
  <filter id="{fid}-bloom" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceGraphic" stdDeviation="3.8" result="b1"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b2"/>
    <feMerge>
      <feMergeNode in="b2"/>
      <feMergeNode in="b1"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
"""


def mouth_quad(cube):
    """Open aperture: union of inward faces as a quad pointing at the core.

    Uses the two hex vertices adjacent to the inner vertex, the cube
    front-corner (Y junction), and the inner vertex itself.
    """
    v = cube["verts"]
    i = cube["inner_vi"]
    a = v[(i - 1) % 6]
    b = v[i]
    c = v[(i + 1) % 6]
    d = cube["cen"]
    # winding: a, b, c, d  — kite with point b toward centre
    return [a, b, c, d]


def lerp_quad(q0, q1, t):
    return [lerp(q0[k], q1[k], t) for k in range(4)]


def core_quad_for(cube):
    """A small quad on the core hex this mouth recurse into."""
    c0, c1 = cube["core_edge"]
    mid = lerp(c0, c1, 0.5)
    # pull slightly toward origin so nested frames stack inward
    c0i = lerp(c0, ORIGIN, 0.15)
    c1i = lerp(c1, ORIGIN, 0.15)
    # outer side of core quad (toward the cube) and inner side
    # Match kite winding: a, b(inner-point), c, d(back)
    # Use c0, a point further in, c1, mid-out
    inward_pt = lerp(mid, ORIGIN, 0.85)
    outward_pt = lerp(mid, cube["inner_pt"], 0.08)
    return [c0i, inward_pt, c1i, outward_pt]


def vortex_on_quad(quad, color, rings=6, turns=1.8, sw_scale=1.0):
    cen = centroid(quad)
    a, b, c, d = quad
    parts = []
    for i in range(rings):
        t = 1.0 - (i / rings) * 0.84
        pts = scale_pts(quad, cen, t)
        op = 0.14 + 0.58 * (1 - i / rings)
        sw = (0.8 + 1.2 * (1 - i / rings)) * sw_scale
        parts.append(
            f'<polygon points="{poly_s(pts)}" fill="none" stroke="{color}" '
            f'stroke-width="{sw:.2f}" stroke-opacity="{op:.3f}" stroke-linejoin="round"/>'
        )

    def bimap(u, vv):
        p0 = lerp(a, b, u)
        p1 = lerp(d, c, u)
        return lerp(p0, p1, vv)

    n = 120
    cmds = []
    for i in range(n + 1):
        tt = i / n
        ang = tt * turns * 2 * math.pi + 0.3
        rad = 0.44 * (1 - tt * 0.9)
        p = bimap(0.5 + rad * math.cos(ang), 0.5 + rad * math.sin(ang))
        cmds.append(("M" if i == 0 else "L") + f"{p[0]:.2f},{p[1]:.2f}")
    parts.append(
        f'<path d="{" ".join(cmds)}" fill="none" stroke="{color}" '
        f'stroke-width="{1.15*sw_scale:.2f}" stroke-opacity="0.5" stroke-linecap="round"/>'
    )
    return "\n      ".join(parts), cen


def inward_face_quad(cube):
    """The single face that looks at the icon centre."""
    return min(cube["faces"].values(), key=lambda pts: dist(centroid(pts), ORIGIN))


def recursion_frames(cube, color, steps=6):
    """Nested mouths sliding from the open inner face into the core.

    Scale about the face centre, then translate toward the icon origin so
    each step is a smaller self-similar aperture, not a morphing mess.
    """
    src = inward_face_quad(cube)
    sc = centroid(src)
    parts = []
    for i in range(steps):
        t = (i + 1) / (steps + 0.65)
        scale = 1.0 - t * 0.62
        slide = t * 0.78
        q = scale_pts(src, sc, scale)
        q = [lerp(p, ORIGIN, slide) for p in q]
        op = 0.62 * (1 - t * 0.68)
        sw = 2.15 * (1 - t * 0.55)
        parts.append(
            f'<polygon points="{poly_s(q)}" fill="none" stroke="{color}" '
            f'stroke-width="{sw:.2f}" stroke-opacity="{op:.3f}" stroke-linejoin="round"/>'
        )
    # spiral riding the same axis
    a0 = sc
    a1 = lerp(sc, ORIGIN, 0.88)
    n = 80
    cmds = []
    vx, vy = a1[0] - a0[0], a1[1] - a0[1]
    L = math.hypot(vx, vy) or 1
    px, py = -vy / L, vx / L
    for i in range(n + 1):
        tt = i / n
        ang = tt * 2.6 * 2 * math.pi
        rad = (1 - tt) * 11
        p = lerp(a0, a1, tt)
        p = (p[0] + px * math.cos(ang) * rad, p[1] + py * math.sin(ang) * rad)
        cmds.append(("M" if i == 0 else "L") + f"{p[0]:.2f},{p[1]:.2f}")
    parts.append(
        f'<path d="{" ".join(cmds)}" fill="none" stroke="{color}" '
        f'stroke-width="1.0" stroke-opacity="0.40" stroke-linecap="round"/>'
    )
    return "\n      ".join(parts)


def cube_svg(cube, color, simple=False):
    v = cube["verts"]
    inward = set(cube["inward"])
    bits = []

    # closed-face tints only
    tints = {"top": 0.09, "right": 0.04, "left": 0.06}
    for name, op in tints.items():
        if name in inward:
            continue
        bits.append(
            f'<polygon points="{poly_s(cube["faces"][name])}" fill="{color}" fill-opacity="{op}"/>'
        )

    # outline — omit the two innermost hex edges so the mouth reads as open
    i = cube["inner_vi"]
    skip_edges = {(i, (i + 1) % 6), ((i - 1) % 6, i)}
    segs = []
    for e in range(6):
        a, b = e, (e + 1) % 6
        if (a, b) in skip_edges:
            continue
        segs.append(f"M{v[a][0]:.2f},{v[a][1]:.2f} L{v[b][0]:.2f},{v[b][1]:.2f}")
    bits.append(
        f'<path d="{" ".join(segs)}" fill="none" stroke="{color}" '
        f'stroke-width="6.6" stroke-linejoin="round" stroke-linecap="round"/>'
    )

    # internal Y — keep spokes that do not run to the inner vertex
    cen = cube["cen"]
    for idx in (1, 3, 5):
        if idx == i:
            continue  # that spoke would close the mouth
        bits.append(
            f'<line x1="{cen[0]:.2f}" y1="{cen[1]:.2f}" x2="{v[idx][0]:.2f}" y2="{v[idx][1]:.2f}" '
            f'stroke="{color}" stroke-width="3.2" stroke-linecap="round" stroke-opacity="0.9"/>'
        )

    # mouth frame (the open aperture)
    mq = inward_face_quad(cube)
    bits.append(
        f'<polygon points="{poly_s(mq)}" fill="{color}" fill-opacity="0.025" '
        f'stroke="{color}" stroke-width="2.4" stroke-opacity="0.42" stroke-linejoin="round"/>'
    )

    if not simple:
        # vortex lives ON the open inner face — you look into the cube from the centre
        vp, _ = vortex_on_quad(mq, color, rings=5, turns=1.7, sw_scale=0.9)
        bits.append(vp)
        bits.append(recursion_frames(cube, color, steps=6))
    else:
        q = [lerp(p, ORIGIN, 0.38) for p in scale_pts(mq, centroid(mq), 0.55)]
        bits.append(
            f'<polygon points="{poly_s(q)}" fill="none" stroke="{color}" '
            f'stroke-width="2.0" stroke-opacity="0.7" stroke-linejoin="round"/>'
        )
    return "\n      ".join(bits)


def particles_svg(colors, seed=7, n=48):
    rng = random.Random(seed)
    parts = []
    for cube, color in zip(CUBES, colors):
        src = centroid(inward_face_quad(cube))
        dst = ORIGIN
        vx, vy = dst[0] - src[0], dst[1] - src[1]
        base = math.atan2(vy, vx)
        span = dist(src, dst)
        for k in range(n):
            # most travel toward the centre along the mouth axis
            if k < int(n * 0.8):
                t = rng.random() ** 0.75
                ang = base + rng.gauss(0, 0.18)
                radial = t * (span * 0.92)
                # slight lateral drift that tightens near the core
                lat = rng.gauss(0, 14 * (1 - t) + 3)
                px = src[0] + math.cos(ang) * radial
                py = src[1] + math.sin(ang) * radial
                # apply lateral in perpendicular
                px += math.cos(base + math.pi / 2) * lat
                py += math.sin(base + math.pi / 2) * lat
            else:
                # a few motes still inside the cube
                ang = rng.uniform(0, 2 * math.pi)
                radial = rng.uniform(4, HEX_R * 0.45)
                px = cube["cen"][0] + math.cos(ang) * radial
                py = cube["cen"][1] + math.sin(ang) * radial
                t = 0.15
            r = rng.choice([0.6, 0.9, 1.2, 1.6, 2.2, 2.9]) * rng.uniform(0.8, 1.15)
            op = (0.25 + 0.7 * (1 - t)) * rng.uniform(0.55, 1.0)
            parts.append(
                f'<circle cx="{px:.2f}" cy="{py:.2f}" r="{r:.2f}" fill="{color}" fill-opacity="{op:.3f}"/>'
            )
            if rng.random() < 0.4:
                L = rng.uniform(5, 16) * (1 - t * 0.4)
                parts.append(
                    f'<line x1="{px:.2f}" y1="{py:.2f}" '
                    f'x2="{px + math.cos(base)*L:.2f}" y2="{py + math.sin(base)*L:.2f}" '
                    f'stroke="{color}" stroke-width="{max(0.45, r*0.35):.2f}" '
                    f'stroke-opacity="{op*0.7:.3f}" stroke-linecap="round"/>'
                )
    return "\n      ".join(parts)


def core_svg():
    # faint inner hex so the six mouths have somewhere to arrive
    return (
        f'<polygon points="{poly_s(CORE_VERTS)}" fill="none" stroke="#ffffff" '
        f'stroke-width="1.2" stroke-opacity="0.18" stroke-linejoin="round"/>'
    )


def build_svg(name, colors, particles=False, simple=False, glow=True, transparent=False, seed=11):
    fid = "".join(ch for ch in name if ch.isalnum())
    order = sorted(range(6), key=lambda i: CUBES[i]["cen"][1])
    body = []
    for i in order:
        body.append(f'<g class="cube c{i}">\n      {cube_svg(CUBES[i], colors[i], simple=simple)}\n    </g>')
    plist = particles_svg(colors, seed=seed) if particles else ""
    bg = "none" if transparent else "#000000"
    bloom = f' filter="url(#{fid}-bloom)"' if glow else ""
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" width="{SIZE}" height="{SIZE}" role="img" aria-label="Generative art hex-cube icon v2">
  <title>Hex Vortex v2 — open mouths, inward recursion</title>
  <defs>
    {svg_filters(fid)}
  </defs>
  <rect width="100%" height="100%" fill="{bg}"/>
  <g{bloom}>
    {core_svg()}
    {chr(10).join(body)}
  </g>
  <g>
      {plist}
  </g>
</svg>
'''
    path = os.path.join(SVG_DIR, f"{name}.svg")
    with open(path, "w") as f:
        f.write(svg)
    print("svg", path)
    return path


# ---------- Cairo raster ----------

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in range(0, 6, 2))


def cairo_poly(ctx, pts, close=True):
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    if close:
        ctx.close_path()


def stroke_quad_vortex(ctx, quad, rgb, rings=6, turns=1.8, sw_scale=1.0):
    r, g, b = rgb
    cen = centroid(quad)
    a, bp, c, d = quad
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    for i in range(rings):
        t = 1.0 - (i / rings) * 0.84
        pts = scale_pts(quad, cen, t)
        op = 0.14 + 0.58 * (1 - i / rings)
        sw = (0.8 + 1.2 * (1 - i / rings)) * sw_scale
        cairo_poly(ctx, pts)
        ctx.set_source_rgba(r, g, b, op)
        ctx.set_line_width(sw)
        ctx.stroke()

    def bimap(u, vv):
        p0 = lerp(a, bp, u)
        p1 = lerp(d, c, u)
        return lerp(p0, p1, vv)

    n = 120
    ctx.set_source_rgba(r, g, b, 0.5)
    ctx.set_line_width(1.15 * sw_scale)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    for i in range(n + 1):
        tt = i / n
        ang = tt * turns * 2 * math.pi + 0.3
        rad = 0.44 * (1 - tt * 0.9)
        p = bimap(0.5 + rad * math.cos(ang), 0.5 + rad * math.sin(ang))
        if i == 0:
            ctx.move_to(*p)
        else:
            ctx.line_to(*p)
    ctx.stroke()


def stroke_recursion(ctx, cube, rgb, steps=6):
    r, g, b = rgb
    src = inward_face_quad(cube)
    sc = centroid(src)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    for i in range(steps):
        t = (i + 1) / (steps + 0.65)
        scale = 1.0 - t * 0.62
        slide = t * 0.78
        q = scale_pts(src, sc, scale)
        q = [lerp(p, ORIGIN, slide) for p in q]
        cairo_poly(ctx, q)
        ctx.set_source_rgba(r, g, b, 0.62 * (1 - t * 0.68))
        ctx.set_line_width(2.15 * (1 - t * 0.55))
        ctx.stroke()

    a0 = sc
    a1 = lerp(sc, ORIGIN, 0.88)
    vx, vy = a1[0] - a0[0], a1[1] - a0[1]
    L = math.hypot(vx, vy) or 1
    px, py = -vy / L, vx / L
    ctx.set_source_rgba(r, g, b, 0.40)
    ctx.set_line_width(1.0)
    n = 80
    for i in range(n + 1):
        tt = i / n
        ang = tt * 2.6 * 2 * math.pi
        rad = (1 - tt) * 11
        p = lerp(a0, a1, tt)
        p = (p[0] + px * math.cos(ang) * rad, p[1] + py * math.sin(ang) * rad)
        if i == 0:
            ctx.move_to(*p)
        else:
            ctx.line_to(*p)
    ctx.stroke()


def draw_cube_cairo(ctx, cube, color, simple=False):
    rgb = hex_to_rgb(color)
    r, g, b = rgb
    v = cube["verts"]
    inward = set(cube["inward"])
    tints = {"top": 0.09, "right": 0.04, "left": 0.06}
    for name, op in tints.items():
        if name in inward:
            continue
        cairo_poly(ctx, cube["faces"][name])
        ctx.set_source_rgba(r, g, b, op)
        ctx.fill()

    i = cube["inner_vi"]
    skip_edges = {(i, (i + 1) % 6), ((i - 1) % 6, i)}
    ctx.set_source_rgba(r, g, b, 1)
    ctx.set_line_width(6.6)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    for e in range(6):
        a, b_ = e, (e + 1) % 6
        if (a, b_) in skip_edges:
            continue
        ctx.move_to(*v[a])
        ctx.line_to(*v[b_])
        ctx.stroke()

    cen = cube["cen"]
    ctx.set_line_width(3.2)
    for idx in (1, 3, 5):
        if idx == i:
            continue
        ctx.move_to(*cen)
        ctx.line_to(*v[idx])
        ctx.stroke()

    mq = inward_face_quad(cube)
    cairo_poly(ctx, mq)
    ctx.set_source_rgba(r, g, b, 0.025)
    ctx.fill_preserve()
    ctx.set_source_rgba(r, g, b, 0.42)
    ctx.set_line_width(2.4)
    ctx.stroke()

    if not simple:
        stroke_quad_vortex(ctx, mq, rgb, rings=5, turns=1.7, sw_scale=0.9)
        stroke_recursion(ctx, cube, rgb, steps=6)
    else:
        q = [lerp(p, ORIGIN, 0.38) for p in scale_pts(mq, centroid(mq), 0.55)]
        cairo_poly(ctx, q)
        ctx.set_source_rgba(r, g, b, 0.7)
        ctx.set_line_width(2.0)
        ctx.stroke()


def draw_particles_cairo(ctx, colors, seed=7, n=48):
    rng = random.Random(seed)
    for cube, color in zip(CUBES, colors):
        r, g, b = hex_to_rgb(color)
        src = centroid(inward_face_quad(cube))
        dst = ORIGIN
        vx, vy = dst[0] - src[0], dst[1] - src[1]
        base = math.atan2(vy, vx)
        span = dist(src, dst)
        for k in range(n):
            if k < int(n * 0.8):
                t = rng.random() ** 0.75
                ang = base + rng.gauss(0, 0.18)
                radial = t * (span * 0.92)
                lat = rng.gauss(0, 14 * (1 - t) + 3)
                px = src[0] + math.cos(ang) * radial
                py = src[1] + math.sin(ang) * radial
                px += math.cos(base + math.pi / 2) * lat
                py += math.sin(base + math.pi / 2) * lat
            else:
                ang = rng.uniform(0, 2 * math.pi)
                radial = rng.uniform(4, HEX_R * 0.45)
                px = cube["cen"][0] + math.cos(ang) * radial
                py = cube["cen"][1] + math.sin(ang) * radial
                t = 0.15
            rad = rng.choice([0.6, 0.9, 1.2, 1.6, 2.2, 2.9]) * rng.uniform(0.8, 1.15)
            op = (0.25 + 0.7 * (1 - t)) * rng.uniform(0.55, 1.0)
            ctx.set_source_rgba(r, g, b, op)
            ctx.arc(px, py, rad, 0, 2 * math.pi)
            ctx.fill()
            if rng.random() < 0.4:
                L = rng.uniform(5, 16) * (1 - t * 0.4)
                ctx.set_line_width(max(0.45, rad * 0.35))
                ctx.set_line_cap(cairo.LINE_CAP_ROUND)
                ctx.set_source_rgba(r, g, b, op * 0.7)
                ctx.move_to(px, py)
                ctx.line_to(px + math.cos(base) * L, py + math.sin(base) * L)
                ctx.stroke()


def add_glow(surface, amount=6.5):
    raw = Image.frombuffer("RGBA", (SIZE, SIZE), surface.get_data(), "raw", "BGRA", 0, 1).copy()
    glow = raw.filter(ImageFilter.GaussianBlur(radius=amount))
    glow2 = raw.filter(ImageFilter.GaussianBlur(radius=amount * 2.2))
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    base = Image.alpha_composite(base, glow2)
    base = Image.alpha_composite(base, glow)
    base = Image.alpha_composite(base, raw)
    return base


def render_png(name, colors, particles=False, simple=False, glow=True, transparent=False, seed=11):
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, SIZE, SIZE)
    ctx = cairo.Context(surface)
    if not transparent:
        ctx.set_source_rgb(0, 0, 0)
        ctx.paint()

    # core hex
    cairo_poly(ctx, CORE_VERTS)
    ctx.set_source_rgba(1, 1, 1, 0.18)
    ctx.set_line_width(1.2)
    ctx.stroke()

    order = sorted(range(6), key=lambda i: CUBES[i]["cen"][1])
    for i in order:
        draw_cube_cairo(ctx, CUBES[i], colors[i], simple=simple)
    if particles:
        draw_particles_cairo(ctx, colors, seed=seed)

    if glow:
        img = add_glow(surface, amount=6.5)
    else:
        img = Image.frombuffer("RGBA", (SIZE, SIZE), surface.get_data(), "raw", "BGRA", 0, 1).copy()
        if not transparent:
            bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
            img = Image.alpha_composite(bg, img)

    path = os.path.join(PNG_DIR, f"{name}-1024.png")
    img.save(path, "PNG")
    img.resize((256, 256), Image.Resampling.LANCZOS).save(
        os.path.join(PREV_DIR, f"{name}-256.png"), "PNG"
    )
    for s in (512, 256, 128, 64):
        img.resize((s, s), Image.Resampling.LANCZOS).save(
            os.path.join(PNG_DIR, f"{name}-{s}.png"), "PNG"
        )
    print("png", path)


VARIANTS = [
    dict(name="icon-mono", palette="mono"),
    dict(name="icon-mono-particles", palette="mono", particles=True, seed=3),
    dict(name="icon-spectrum", palette="spectrum"),
    dict(name="icon-spectrum-particles", palette="spectrum", particles=True, seed=5),
    dict(name="icon-aurora-particles", palette="aurora", particles=True, seed=9),
    dict(name="icon-plasma-particles", palette="plasma", particles=True, seed=13),
    dict(name="icon-simple-mono", palette="mono", simple=True),
    dict(name="icon-simple-spectrum", palette="spectrum", simple=True),
    dict(name="icon-simple-spectrum-particles", palette="spectrum", simple=True, particles=True, seed=2),
    dict(name="icon-mark-bold", palette="spectrum", simple=True, glow=False),
]


if __name__ == "__main__":
    for v in VARIANTS:
        pal = PALETTES[v["palette"]]
        kw = dict(
            particles=v.get("particles", False),
            simple=v.get("simple", False),
            glow=v.get("glow", True),
            seed=v.get("seed", 11),
        )
        build_svg(v["name"], pal, **kw)
        render_png(v["name"], pal, **kw)
    build_svg("icon-spectrum-particles-transparent", PALETTES["spectrum"], particles=True, transparent=True, seed=5)
    render_png("icon-spectrum-particles-transparent", PALETTES["spectrum"], particles=True, transparent=True, seed=5)
    build_svg("icon-mono-transparent", PALETTES["mono"], transparent=True)
    render_png("icon-mono-transparent", PALETTES["mono"], transparent=True)
    print("done v2")
