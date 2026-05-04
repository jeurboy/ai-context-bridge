"""Generate media/icon-128.png — Marketplace requires a 128x128 PNG.

The activity-bar SVG uses currentColor (themed by VS Code), but the marketplace
listing icon must look good on both light and dark cards, so we render it on a
solid branded background with a contrasting stroke.
"""
from PIL import Image, ImageDraw

SIZE = 128
BG = (30, 41, 59)       # slate-800 — works on both light + dark marketplace cards
FG = (192, 213, 255)    # soft periwinkle stroke
ACCENT = (250, 204, 21) # pinned-file badge yellow

img = Image.new("RGB", (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

# rounded background (Pillow ≥10 supports rounded_rectangle)
draw.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=24, fill=BG)

# Four nodes representing models on a graph
NODE_R = 12
nodes = {
    "tl": (36, 40),
    "tr": (92, 40),
    "bl": (36, 88),
    "br": (92, 88),
}

# Edges (all-to-all between layers + diagonals)
edges = [
    ("tl", "tr"),
    ("bl", "br"),
    ("tl", "bl"),
    ("tr", "br"),
    ("tl", "br"),
    ("tr", "bl"),
]
for a, b in edges:
    draw.line([nodes[a], nodes[b]], fill=FG, width=4)

for name, (x, y) in nodes.items():
    draw.ellipse(
        (x - NODE_R, y - NODE_R, x + NODE_R, y + NODE_R),
        fill=BG,
        outline=FG,
        width=4,
    )

# Pin/badge accent dot on the top-right node = "pinned context"
px, py = nodes["tr"]
draw.ellipse((px + 4, py - 14, px + 14, py - 4), fill=ACCENT)

img.save("media/icon-128.png", format="PNG", optimize=True)
print("wrote media/icon-128.png", img.size)
