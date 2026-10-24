"""
Builds the watch page's art (run by hand; the PNGs and JSON are committed).

    python3 -I scripts/art/build_art.py <superpowers-asset-packs checkout>

Two atlases come out:

* assets/art/kampung/      OUR OWN art, drawn below in code: attap stilt
                           houses, the kopitiam, provision shop and wet-market
                           stall, the well, notice board, lorry and its stop,
                           coconut palms, banana plants, sampan, sea, shore,
                           jetty, farm beds and kangkong. CC BY-NC-SA 4.0.
* assets/art/ninja-adventure/  pieces cropped from Pixel-boy's CC0 "Ninja
                           Adventure" pack (github.com/sparklinlabs/
                           superpowers-asset-packs): the residents, grass,
                           paths, floor paving, trees, bushes, flowers,
                           crates, barrels and kopitiam stools. Two residents'
                           hair is recoloured.

Needs Pillow. Deterministic: same input, same output.
"""
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_OURS = os.path.join(ROOT, 'assets', 'art', 'kampung')
OUT_PACK = os.path.join(ROOT, 'assets', 'art', 'ninja-adventure')

# Colours chosen to sit with the pack: its outline, grass and sand.
OUTLINE = (2, 2, 2, 255)
C = {
    'thatch': (150, 104, 58), 'thatch_l': (190, 146, 86), 'thatch_d': (108, 72, 40), 'thatch_s': (76, 50, 30),
    'nipah': (128, 112, 62), 'nipah_l': (164, 148, 88), 'nipah_d': (92, 78, 42),
    'wood': (176, 108, 56), 'wood_l': (210, 146, 82), 'wood_d': (126, 74, 38), 'wood_s': (86, 50, 28),
    'teak': (140, 88, 52), 'teak_l': (172, 118, 72), 'teak_d': (98, 60, 36),
    'stilt': (92, 60, 36),
    'zinc': (150, 160, 168), 'zinc_l': (194, 202, 208), 'zinc_d': (104, 114, 124), 'rust': (156, 98, 62),
    'tile': (194, 70, 50), 'tile_l': (230, 110, 76), 'tile_d': (138, 44, 38),
    'plaster': (238, 224, 192), 'plaster_d': (204, 186, 150), 'plaster_s': (170, 150, 116),
    'shutter': (66, 132, 108), 'shutter_d': (40, 92, 74), 'blue': (46, 84, 140), 'blue_l': (70, 116, 176),
    'white': (244, 240, 228), 'yellow': (250, 214, 92), 'red': (210, 60, 52), 'red_d': (150, 40, 40),
    'dark': (36, 28, 30), 'window': (40, 34, 40), 'lamp': (255, 220, 120),
    'sea_d': (36, 104, 164), 'sea': (58, 140, 196), 'sea_l': (104, 182, 222), 'foam': (232, 246, 250),
    'sand': (255, 173, 93), 'sand_l': (255, 196, 128), 'sand_d': (232, 146, 76),
    'soil': (124, 76, 44), 'soil_l': (150, 96, 56), 'soil_d': (92, 54, 32), 'soil_wet': (84, 52, 34),
    'leaf': (60, 150, 58), 'leaf_l': (106, 190, 72), 'leaf_d': (34, 100, 46),
    'trunk': (156, 106, 64), 'trunk_d': (112, 74, 44), 'nut': (96, 66, 38),
    'stone': (156, 154, 150), 'stone_l': (196, 194, 186), 'stone_d': (108, 106, 110),
    'cab': (70, 122, 84), 'cab_l': (104, 160, 104), 'cab_d': (44, 82, 56), 'glass': (168, 210, 230),
    'tyre': (34, 30, 34), 'hub': (156, 156, 156), 'canvas': (224, 214, 180),
    'fish': (150, 176, 196), 'fish_d': (96, 120, 140), 'kangkong': (72, 168, 64),
    'paper': (246, 238, 214), 'ink': (90, 80, 90), 'chalk': (232, 232, 220),
}


def rgba(name):
    c = C[name]
    return (c[0], c[1], c[2], 255)


class Sprite:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.w, self.h = w, h

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), rgba(c) if isinstance(c, str) else c)

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.px(xx, yy, c)

    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.px(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.px(x, y, c)

    def get(self, x, y):
        return self.im.getpixel((x, y))

    def outline(self):
        """The pack's look: a 1px dark line around everything drawn."""
        src = self.im.copy()
        for y in range(self.h):
            for x in range(self.w):
                if src.getpixel((x, y))[3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src.getpixel((nx, ny))[3] and src.getpixel((nx, ny)) != OUTLINE:
                        self.im.putpixel((x, y), OUTLINE)
                        break
        return self


# ---------------------------------------------------------------- our own art

def thatch_roof(s, x0, y0, w, h, base='thatch', rng=None):
    """An attap roof: a steep trapezoid of layered palm thatch."""
    rng = rng or random.Random(1)
    light, dark = base + '_l', base + '_d'
    for row in range(h):
        inset = max(0, (h - 1 - row) * 2 // 3 - 0)
        inset = (h - 1 - row) // 2
        xa, xb = x0 + inset, x0 + w - 1 - inset
        for x in range(xa, xb + 1):
            c = base
            if row % 4 == 3:
                c = dark
            elif row % 4 == 0 and rng.random() < 0.5:
                c = light
            elif rng.random() < 0.12:
                c = light if rng.random() < 0.5 else dark
            s.px(x, y0 + row, c)
    # Ragged eaves.
    for x in range(x0, x0 + w):
        if rng.random() < 0.6:
            s.px(x, y0 + h, dark)
    # Ridge.
    s.hline(x0 + (h - 1) // 2, x0 + w - 1 - (h - 1) // 2, y0, 'thatch_s' if base == 'thatch' else dark)


def plank_wall(s, x0, y0, w, h, base='wood'):
    for x in range(x0, x0 + w):
        c = base + '_l' if (x - x0) % 4 == 0 else base + '_d' if (x - x0) % 4 == 3 else base
        s.vline(x, y0, y0 + h - 1, c)
    s.hline(x0, x0 + w - 1, y0, base + '_d')


def attap_house(variant):
    """A kampung house on stilts: attap roof, plank walls, a ladder up to the door. 48x48."""
    rng = random.Random(10 + variant)
    s = Sprite(48, 48)
    wall = ['wood', 'teak', 'wood'][variant % 3]
    roof = ['thatch', 'nipah', 'thatch'][variant % 3]
    # Stilts and the shade under the house.
    s.rect(6, 36, 36, 6, (0, 0, 0, 0))
    for x in (6, 15, 32, 41):
        s.vline(x, 34, 45, 'stilt')
        s.vline(x + 1, 34, 45, 'wood_s')
    # Floor beam and walls.
    plank_wall(s, 5, 22, 38, 12, wall)
    s.hline(4, 43, 34, 'wood_s')
    s.hline(4, 43, 35, 'stilt')
    # Window with a wooden shutter propped open.
    wx = 9 if variant % 2 == 0 else 31
    s.rect(wx, 25, 7, 5, 'window')
    s.rect(wx, 23, 7, 2, wall + '_d')
    s.px(wx + 3, 27, 'lamp') if variant % 3 == 1 else None
    # Door in the middle, ladder below it down to the path.
    s.rect(20, 24, 8, 10, wall + '_d')
    s.rect(21, 25, 6, 9, 'window')
    s.vline(24, 25, 33, wall + '_d')
    for x in (20, 27):
        s.vline(x, 36, 47, 'wood_d')
    for y in (38, 41, 44, 47):
        s.hline(21, 26, y, 'wood_l')
    # Roof with a little overhang and a gable vent.
    thatch_roof(s, 0, 2, 48, 20, roof, rng)
    s.rect(22, 9, 4, 3, roof + '_d')
    return s.outline()


def shophouse_front(s, x0, w, roof_top, wall_top, bottom, roof='tile'):
    """A 1960s shophouse front: plaster wall, five-foot way pillars, shutters."""
    # Roof: clay tiles in rows (or zinc sheets).
    for y in range(roof_top, wall_top):
        for x in range(x0, x0 + w):
            if roof == 'tile':
                c = 'tile_d' if (y - roof_top) % 3 == 2 else 'tile_l' if (x + (y - roof_top) // 3 * 2) % 5 == 0 else 'tile'
            else:
                c = 'zinc_l' if (x - x0) % 6 == 0 else 'zinc_d' if (x - x0) % 6 == 5 else 'zinc'
                if (x * 7 + y * 3) % 23 == 0:
                    c = 'rust'
            s.px(x, y, c)
    s.hline(x0, x0 + w - 1, wall_top, 'tile_d' if roof == 'tile' else 'zinc_d')
    # Wall.
    s.rect(x0 + 1, wall_top + 1, w - 2, bottom - wall_top - 1, 'plaster')
    s.hline(x0 + 1, x0 + w - 2, wall_top + 1, 'plaster_d')


def kopitiam():
    """The coffee shop: a tiled-roof shophouse with a blue signboard and open folding doors. 128x48."""
    s = Sprite(128, 48)
    shophouse_front(s, 0, 128, 0, 12, 48, 'tile')
    # Signboard.
    s.rect(30, 14, 68, 9, 'blue')
    s.hline(30, 97, 14, 'blue_l')
    # "KOPI" in chunky letters, and a cup.
    letters = {
        'K': ['X..X', 'X.X.', 'XX..', 'X.X.', 'X..X'],
        'O': ['.XX.', 'X..X', 'X..X', 'X..X', '.XX.'],
        'P': ['XXX.', 'X..X', 'XXX.', 'X...', 'X...'],
        'I': ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    }
    x = 48
    for ch in 'KOPI':
        for yy, row in enumerate(letters[ch]):
            for xx, v in enumerate(row):
                if v == 'X':
                    s.px(x + xx, 16 + yy, 'yellow')
        x += len(letters[ch][0]) + 2
    s.rect(36, 17, 5, 4, 'white')
    s.px(41, 18, 'white')
    s.px(37, 15, 'white')
    s.px(39, 15, 'white')
    # Five-foot way: pillars and dark open shopfront with folding doors.
    s.rect(2, 25, 124, 23, 'window')
    for px_ in (2, 42, 84, 122):
        s.rect(px_, 25, 4, 23, 'plaster_d')
        s.vline(px_, 25, 47, 'plaster')
    for x in range(6, 122):
        if x in range(42, 46) or x in range(84, 88):
            continue
        if (x - 6) % 6 in (0, 1):
            s.vline(x, 27, 46, 'shutter')
        elif (x - 6) % 6 == 2:
            s.vline(x, 27, 46, 'shutter_d')
    # Lanterns.
    for lx in (24, 104):
        s.rect(lx, 25, 3, 4, 'red')
        s.px(lx + 1, 29, 'yellow')
    # Counter with jars, through the middle door.
    s.rect(50, 38, 30, 6, 'teak')
    s.hline(50, 79, 38, 'teak_l')
    for jx in (53, 59, 65, 71):
        s.rect(jx, 34, 4, 4, 'glass')
        s.hline(jx, jx + 3, 33, 'red')
    return s.outline()


def provision_shop():
    """The provision shop: zinc roof, plaster front, shelves of tins and sacks of rice. 112x48."""
    s = Sprite(112, 48)
    shophouse_front(s, 0, 112, 0, 12, 48, 'zinc')
    # Painted name board.
    s.rect(18, 14, 76, 8, 'red_d')
    s.hline(18, 93, 14, 'red')
    for i, x in enumerate(range(24, 90, 4)):
        if i % 5 != 4:
            s.rect(x, 16, 2, 4, 'white')
    # Open front.
    s.rect(4, 24, 104, 24, 'window')
    for px_ in (4, 54, 104):
        s.rect(px_, 24, 4, 24, 'plaster_d')
    # Shelves with tins.
    rng = random.Random(7)
    for sy in (27, 33):
        s.hline(9, 52, sy + 4, 'wood')
        s.hline(59, 102, sy + 4, 'wood')
        for x in list(range(10, 52, 3)) + list(range(60, 102, 3)):
            s.rect(x, sy + 1, 2, 3, rng.choice(['red', 'yellow', 'blue_l', 'white', 'cab_l']))
    # Sacks of rice by the door.
    for sx in (12, 22, 66, 80, 92):
        s.rect(sx, 40, 8, 8, 'canvas')
        s.hline(sx + 1, sx + 6, 40, 'plaster_s')
        s.px(sx + 3, 43, 'red')
        s.px(sx + 4, 43, 'red')
    return s.outline()


def market_stall():
    """The wet-market stall: a striped canvas awning on poles over a wooden counter of fish and greens. 96x48."""
    s = Sprite(96, 48)
    # Poles.
    for x in (4, 90):
        s.rect(x, 10, 2, 38, 'wood_d')
    # Awning with stripes and a scalloped edge.
    for y in range(0, 14):
        inset = max(0, 3 - y)
        for x in range(inset, 96 - inset):
            c = 'red' if (x // 8) % 2 == 0 else 'white'
            if y >= 11:
                c = 'red_d' if (x // 8) % 2 == 0 else 'plaster_d'
            s.px(x, y, c)
    for x in range(0, 96):
        if (x % 8) in (2, 3, 4, 5):
            s.px(x, 14, 'red_d' if (x // 8) % 2 == 0 else 'plaster_d')
    # Back shade.
    s.rect(6, 15, 84, 18, 'window')
    # Hanging scale.
    s.vline(48, 15, 21, 'stone_d')
    s.rect(45, 22, 7, 2, 'stone_l')
    # Counter.
    s.rect(2, 32, 92, 16, 'wood')
    for x in range(2, 94, 6):
        s.vline(x, 34, 47, 'wood_d')
    s.rect(2, 30, 92, 3, 'wood_l')
    s.hline(2, 93, 33, 'wood_s')
    # Fish on ice on the left, kangkong bundles on the right.
    for i, fx in enumerate(range(8, 44, 9)):
        s.rect(fx, 27, 7, 3, 'fish')
        s.px(fx, 28, 'fish_d')
        s.px(fx + 6, 27, 'fish_d')
        s.px(fx + 6, 29, 'fish_d')
        s.px(fx + 1, 27, 'dark')
    for kx in range(54, 90, 8):
        s.rect(kx, 25, 6, 5, 'kangkong')
        s.px(kx + 1, 25, 'leaf_l')
        s.px(kx + 4, 26, 'leaf_d')
        s.hline(kx + 1, kx + 4, 29, 'red')
    return s.outline()


def well():
    """The village well: a ring of stones, a wooden frame and a bucket on a rope. 32x32."""
    s = Sprite(32, 32)
    # Frame.
    s.rect(4, 2, 2, 18, 'wood_d')
    s.rect(26, 2, 2, 18, 'wood_d')
    s.rect(3, 2, 26, 3, 'wood')
    s.hline(3, 28, 2, 'wood_l')
    s.vline(16, 5, 12, 'canvas')
    s.rect(14, 12, 5, 4, 'wood')
    s.hline(14, 18, 12, 'wood_l')
    # Stone ring.
    s.rect(3, 18, 26, 12, 'stone')
    for y in (18, 22, 26):
        for x in range(3 + (y // 4) % 2 * 3, 29, 6):
            s.vline(x, y, y + 3, 'stone_d')
        s.hline(3, 28, y, 'stone_d')
    s.hline(3, 28, 18, 'stone_l')
    s.rect(6, 19, 20, 3, 'sea_d')
    s.hline(7, 24, 19, 'sea')
    return s.outline()


def notice_board():
    """The notice board: two posts, a little roof, pinned papers. 32x32."""
    s = Sprite(32, 32)
    s.rect(5, 12, 2, 20, 'wood_d')
    s.rect(25, 12, 2, 20, 'wood_d')
    for y in range(0, 5):
        s.hline(2 + (4 - y), 29 - (4 - y), y, 'thatch_d' if y % 2 else 'thatch')
    s.rect(3, 5, 26, 15, 'teak')
    s.rect(4, 6, 24, 13, 'teak_d')
    for (x, y, w, h) in ((6, 7, 6, 5), (14, 8, 6, 7), (22, 7, 5, 4), (7, 13, 5, 5), (21, 12, 5, 6)):
        s.rect(x, y, w, h, 'paper')
        s.px(x + w // 2, y, 'red')
        for yy in range(y + 2, y + h - 1, 2):
            s.hline(x + 1, x + w - 2, yy, 'ink')
    return s.outline()


def lorry():
    """The morning lorry, a 1960s goods lorry: green cab, slatted wooden tray. 64x40, facing left."""
    s = Sprite(64, 40)
    # Cargo tray.
    s.rect(24, 8, 38, 20, 'wood')
    for y in (8, 13, 18, 23):
        s.hline(24, 61, y, 'wood_d')
    for x in (24, 37, 49, 61):
        s.vline(x, 8, 27, 'wood_s')
    s.hline(24, 61, 8, 'wood_l')
    # Sacks and crates poking over the side.
    s.rect(28, 4, 8, 5, 'canvas')
    s.rect(40, 3, 9, 6, 'wood_l')
    s.vline(44, 3, 8, 'wood_d')
    s.rect(52, 5, 7, 4, 'canvas')
    # Cab: rounded roof, windscreen, door, bonnet and grille.
    s.rect(8, 8, 16, 20, 'cab')
    s.rect(9, 6, 14, 2, 'cab')
    s.hline(10, 21, 5, 'cab_l')
    s.rect(11, 9, 10, 7, 'glass')
    s.hline(11, 20, 9, 'white')
    s.rect(1, 17, 9, 11, 'cab')
    s.hline(1, 9, 17, 'cab_l')
    s.rect(0, 19, 2, 8, 'hub')
    s.px(1, 18, 'lamp')
    s.vline(18, 17, 26, 'cab_d')
    s.px(16, 21, 'hub')
    s.hline(1, 61, 28, 'dark')
    s.rect(0, 28, 6, 3, 'stone_d')
    # Wheels.
    for wx in (8, 46):
        s.rect(wx, 28, 10, 10, 'tyre')
        s.rect(wx + 3, 31, 4, 4, 'hub')
        s.px(wx + 4, 32, 'white')
    return s.outline()


def lorry_sign():
    """A stop sign for the lorry: a post with a round enamel plate. 16x32."""
    s = Sprite(16, 32)
    s.rect(7, 10, 2, 22, 'stone_d')
    s.rect(3, 1, 10, 10, 'yellow')
    s.rect(4, 0, 8, 12, 'yellow')
    s.rect(5, 3, 6, 6, 'dark')
    s.rect(6, 4, 4, 2, 'yellow')
    return s.outline()


def coconut_palm(variant):
    """A coconut palm, leaning a little. 32x48."""
    import math
    s = Sprite(32, 48)
    lean = 1 if variant % 2 == 0 else -1
    # Trunk, curving from the base up to the crown.
    top = 0
    for y in range(13, 48):
        x = 14 + lean * ((48 - y) * (48 - y)) // 300
        s.rect(x, y, 3, 1, 'trunk')
        if y % 3 == 0:
            s.px(x, y, 'trunk_d')
            s.px(x + 2, y, 'trunk_d')
        top = x
    cx, cy = 15 + lean * (35 * 35) // 300, 12
    # Fronds: long drooping arcs fanning out from the crown.
    for k, deg in enumerate((10, 170, 40, 140, 200, 340, 90 + 15 * lean)):
        th = math.radians(deg)
        length = 13 if k < 4 else 9
        for i in range(1, length):
            x = cx + math.cos(th) * i
            y = cy - math.sin(th) * i * 0.55 + (i * i) * 0.045
            xi, yi = int(round(x)), int(round(y))
            s.px(xi, yi, 'leaf_l' if i < length // 2 else 'leaf')
            s.px(xi, yi + 1, 'leaf_d')
            if 2 < i < length - 1:
                s.px(xi, yi - 1, 'leaf')
    # Coconuts.
    for dx in (-2, 1):
        s.rect(cx + dx, cy + 1, 2, 2, 'nut')
    return s.outline()


def banana_plant():
    """A banana plant by a house. 16x24."""
    s = Sprite(16, 24)
    s.rect(7, 12, 2, 12, 'leaf_d')
    for (x0, y0, dx) in ((7, 12, -1), (8, 12, 1), (7, 8, -1), (8, 7, 1)):
        for i in range(7):
            x = x0 + dx * i
            y = y0 - 3 + (i * i) // 8
            s.px(x, y, 'leaf_l' if i < 3 else 'leaf')
            s.px(x, y + 1, 'leaf')
            s.px(x, y + 2, 'leaf_d')
    s.rect(7, 2, 2, 6, 'leaf')
    return s.outline()


def sampan():
    """A small wooden sampan, side on, with its ends turned up. 32x12."""
    s = Sprite(32, 12)
    for x in range(1, 31):
        rise = max(0, 6 - x, x - 25)
        bottom = 10 - max(0, 4 - x, x - 27)
        s.vline(x, 4 - rise // 2, bottom, 'wood')
        s.px(x, 4 - rise // 2, 'wood_l')
        s.px(x, bottom, 'wood_s')
    s.hline(4, 27, 6, 'wood_d')
    s.rect(13, 2, 6, 2, 'canvas')
    s.vline(22, 0, 5, 'wood_d')
    return s.outline()


def tile(fill):
    s = Sprite(16, 16)
    fill(s)
    return s


def sea(variant):
    rng = random.Random(50 + variant)

    def f(s):
        s.rect(0, 0, 16, 16, 'sea')
        for _ in range(3):
            x, y = rng.randrange(0, 12), rng.randrange(0, 15)
            s.hline(x, x + rng.randrange(2, 5), y, 'sea_l')
        for _ in range(2):
            x, y = rng.randrange(0, 14), rng.randrange(0, 15)
            s.hline(x, x + 1, y, 'sea_d')
    return tile(f)


def shore():
    """Sand meeting the sea: the top row of sea tiles, with foam."""
    def f(s):
        s.rect(0, 0, 16, 16, 'sea')
        s.rect(0, 0, 16, 3, 'sand_d')
        for x in range(16):
            y = 3 + (1 if x % 7 in (2, 3) else 0)
            s.vline(x, 3, y, 'foam')
            s.px(x, y + 1, 'sea_l')
        s.hline(2, 4, 9, 'sea_l')
        s.hline(10, 13, 12, 'sea_l')
    return tile(f)


def sand(variant):
    rng = random.Random(70 + variant)

    def f(s):
        s.rect(0, 0, 16, 16, 'sand')
        for _ in range(5):
            s.px(rng.randrange(16), rng.randrange(16), 'sand_l')
        for _ in range(4):
            s.px(rng.randrange(16), rng.randrange(16), 'sand_d')
        if variant == 2:
            s.rect(5, 9, 3, 2, 'white')  # a shell
            s.px(6, 8, 'plaster_d')
    return tile(f)


def jetty():
    """Jetty planks running out to sea, with posts at the sides."""
    def f(s):
        s.rect(0, 0, 16, 16, 'wood')
        for y in range(0, 16, 4):
            s.hline(0, 15, y, 'wood_d')
            s.hline(0, 15, y + 1, 'wood_l')
        s.px(3, 2, 'wood_s')
        s.px(12, 10, 'wood_s')
    return tile(f)


def jetty_end():
    def f(s):
        jetty_px = jetty()
        s.im.paste(jetty_px.im, (0, 0))
        s.rect(0, 12, 16, 4, 'sea')
        s.rect(1, 10, 3, 6, 'stilt')
        s.rect(12, 10, 3, 6, 'stilt')
        s.hline(0, 15, 11, 'wood_s')
    return tile(f)


def road():
    """Packed laterite where the lorry stops."""
    rng = random.Random(90)

    def f(s):
        s.rect(0, 0, 16, 16, (196, 128, 82))
        for _ in range(10):
            s.px(rng.randrange(16), rng.randrange(16), (168, 104, 66))
        for _ in range(6):
            s.px(rng.randrange(16), rng.randrange(16), (220, 156, 104))
    return tile(f)


def bed(part, wet):
    """Tilled soil in a raised bed: four tiles make one 2x2 bed. part = 'tl', 'tr', 'bl', 'br'."""
    def f(s):
        base = 'soil_wet' if wet else 'soil'
        s.rect(0, 0, 16, 16, base)
        for y in range(2, 16, 4):
            s.hline(0, 15, y, 'soil_d')
            s.hline(0, 15, y + 1, 'soil_l' if not wet else 'soil')
        left, top = part[1] == 'l', part[0] == 't'
        edge = 'soil_d'
        if top:
            s.hline(0, 15, 0, edge)
        else:
            s.hline(0, 15, 15, edge)
        if left:
            s.vline(0, 0, 15, edge)
        else:
            s.vline(15, 0, 15, edge)
    return tile(f)


def kangkong(stage):
    """Water spinach: 0 just planted, 1 growing, 2 ready to harvest. 16x16."""
    s = Sprite(16, 16)
    spots = [(3, 4), (10, 3), (6, 10), (12, 11)]
    for (x, y) in spots:
        if stage == 0:
            s.px(x, y + 2, 'leaf_l')
            s.px(x + 1, y + 1, 'leaf')
            s.px(x + 1, y + 2, 'leaf_d')
        else:
            size = 2 if stage == 1 else 3
            for i in range(size + 1):
                s.px(x - i + 1, y + 2 - i // 2, 'leaf_l' if stage == 2 else 'leaf')
                s.px(x + i + 1, y + 2 - i // 2, 'leaf' if stage == 2 else 'leaf_d')
            s.vline(x + 1, y + 1, y + 3, 'leaf_d')
            if stage == 2:
                s.px(x + 1, y, 'leaf_l')
                s.px(x + 1, y - 1, 'kangkong')
    return s.outline() if stage > 0 else s


def lit_window():
    """A warm glow for windows at night. 8x6."""
    s = Sprite(8, 6)
    s.rect(0, 0, 8, 6, 'lamp')
    s.rect(1, 1, 6, 4, (255, 240, 180))
    return s


def zz():
    """A sleeper's 'z'. 7x7."""
    s = Sprite(7, 7)
    for x in range(1, 6):
        s.px(x, 1, 'white')
        s.px(x, 5, 'white')
    for i in range(3):
        s.px(4 - i, 2 + i, 'white')
    return s.outline()


def our_sprites():
    out = {}
    for v in range(3):
        out[f'house-{v}'] = attap_house(v)
    out['kopitiam'] = kopitiam()
    out['provision-shop'] = provision_shop()
    out['market-stall'] = market_stall()
    out['well'] = well()
    out['notice-board'] = notice_board()
    out['lorry'] = lorry()
    out['lorry-sign'] = lorry_sign()
    for v in range(2):
        out[f'palm-{v}'] = coconut_palm(v)
    out['banana'] = banana_plant()
    out['sampan'] = sampan()
    for v in range(3):
        out[f'sea-{v}'] = sea(v)
        out[f'sand-{v}'] = sand(v)
    out['shore'] = shore()
    out['jetty'] = jetty()
    out['jetty-end'] = jetty_end()
    out['road'] = road()
    for wet in (False, True):
        for part in ('tl', 'tr', 'bl', 'br'):
            out[f'bed-{part}{"-wet" if wet else ""}'] = bed(part, wet)
    for st in range(3):
        out[f'kangkong-{st}'] = kangkong(st)
    out['glow'] = lit_window()
    out['zz'] = zz()
    return {k: v.im for k, v in out.items()}


# ---------------------------------------------------------------- the CC0 pack

PACK_TILES = {
    # name: (col, row, w, h) in 16px tiles of ninja-adventure/background-elements/tileset.png
    'grass-0': (22, 11, 1, 1), 'grass-1': (23, 11, 1, 1), 'field': (24, 11, 1, 1),
    'path': (19, 11, 1, 1), 'paving': (26, 11, 1, 1),
    'tree': (0, 10, 2, 2), 'big-tree': (11, 8, 2, 2), 'bush': (3, 9, 2, 1),
    'fern-0': (13, 8, 1, 1), 'fern-1': (13, 9, 1, 1),
    'flower': (1, 8, 1, 1), 'flowers': (2, 8, 1, 1), 'tuft': (0, 5, 1, 1), 'rock': (0, 7, 1, 1),
    'crate': (24, 9, 1, 1), 'barrel': (2, 6, 1, 1), 'pot': (1, 6, 1, 1), 'sack': (1, 9, 1, 1),
    'table': (13, 7, 1, 1), 'stool': (11, 7, 1, 1),
}

# Resident sprites: which pack character each one wears (by the default cast's ids).
PEOPLE = ['10', '4', '3', '17', '22', '12', '25', '6', '5', '16']
# Hair recoloured toward black for a 1960s kampung (sheet: {from: to}).
HAIR = {
    '6': {(192, 58, 36): (44, 34, 36), (151, 44, 38): (26, 20, 24)},
    '17': {(226, 169, 45): (52, 40, 42), (205, 89, 39): (32, 24, 28)},
}


def recolour(im, mapping):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in mapping:
                px[x, y] = (*mapping[(r, g, b)], a)
    return im


def pack_sprites(pack):
    tileset = Image.open(os.path.join(pack, 'ninja-adventure', 'background-elements', 'tileset.png')).convert('RGBA')
    out = {}
    for name, (c, r, w, h) in PACK_TILES.items():
        out[name] = tileset.crop((c * 16, r * 16, (c + w) * 16, (r + h) * 16))
    return out


def people_sheet(pack):
    """The walk cycles (4 frames x 4 directions, 16x16) of each resident side by side: 64 px per resident."""
    sheet = Image.new('RGBA', (64 * len(PEOPLE), 64), (0, 0, 0, 0))
    for i, n in enumerate(PEOPLE):
        im = Image.open(os.path.join(pack, 'ninja-adventure', 'characters', f'{n}.png')).convert('RGBA').crop((0, 0, 64, 64))
        if n in HAIR:
            im = recolour(im, HAIR[n])
        sheet.paste(im, (64 * i, 0))
    return sheet


# ---------------------------------------------------------------- atlas packing

def pack_atlas(images, width=256):
    """Shelf-packs images (1px apart) into one PNG; returns (image, Phaser JSON-hash atlas)."""
    order = sorted(images.items(), key=lambda kv: (-kv[1].height, kv[0]))
    x = y = shelf = 0
    places = {}
    for name, im in order:
        if x + im.width > width:
            x, y, shelf = 0, y + shelf + 1, 0
        places[name] = (x, y)
        x += im.width + 1
        shelf = max(shelf, im.height)
    height = y + shelf
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    frames = {}
    for name, im in images.items():
        px, py = places[name]
        atlas.paste(im, (px, py))
        frames[name] = {
            'frame': {'x': px, 'y': py, 'w': im.width, 'h': im.height},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height},
            'sourceSize': {'w': im.width, 'h': im.height},
        }
    return atlas, {'frames': dict(sorted(frames.items())), 'meta': {'image': '', 'size': {'w': width, 'h': height}, 'scale': '1'}}


def write_atlas(images, out_dir, name):
    os.makedirs(out_dir, exist_ok=True)
    atlas, data = pack_atlas(images)
    data['meta']['image'] = f'{name}.png'
    atlas.save(os.path.join(out_dir, f'{name}.png'), optimize=True)
    with open(os.path.join(out_dir, f'{name}.json'), 'w') as f:
        json.dump(data, f, indent=1, sort_keys=True)
        f.write('\n')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pack = sys.argv[1]
    write_atlas(our_sprites(), OUT_OURS, 'kampung')
    write_atlas(pack_sprites(pack), OUT_PACK, 'tiles')
    people_sheet(pack).save(os.path.join(OUT_PACK, 'people.png'), optimize=True)


if __name__ == '__main__':
    main()
