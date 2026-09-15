"""Render a faithful App Review screenshot of the TRIAD Prayer paywall.

Uses the real tier names, prices, CTAs and colors from expo/app/paywall.tsx
and expo/constants/darkColors.ts so Apple reviewers see the actual
subscription interface.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1290, 2796
BG = (13, 8, 4)          # #0D0804 background
CARD = (26, 18, 10)      # slightly elevated surface
CARD2 = (32, 22, 13)
TEXT = (250, 245, 238)   # #FAF5EE
MUTED = (196, 178, 155)
AMBER = (212, 149, 80)   # #D49550
AMBER_DEEP = (168, 107, 42)
MOSS = (74, 158, 92)     # #4A9E5C
MOSS_DEEP = (46, 112, 64)
LINE = (58, 44, 28)

F = "/usr/share/fonts/truetype/dejavu/"
def font(name, size):
    return ImageFont.truetype(F + name, size)

f_title = font("DejaVuSerif-Bold.ttf", 96)
f_sub = font("DejaVuSerif.ttf", 46)
f_toggle = font("DejaVuSans-Bold.ttf", 40)
f_tier = font("DejaVuSans-Bold.ttf", 56)
f_price = font("DejaVuSans-Bold.ttf", 72)
f_period = font("DejaVuSans.ttf", 40)
f_body = font("DejaVuSans.ttf", 36)
f_small = font("DejaVuSans.ttf", 32)
f_badge = font("DejaVuSans-Bold.ttf", 30)
f_cta = font("DejaVuSans-Bold.ttf", 42)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# subtle radial glow at top (amber)
glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
cx, cy, r = W // 2, 180, 900
for i in range(r, 0, -8):
    a = int(38 * (1 - i / r))
    gd.ellipse([cx - i, cy - int(i * 0.62), cx + i, cy + int(i * 0.62)], fill=a)
amber_layer = Image.new("RGB", (W, H), AMBER_DEEP)
img = Image.composite(Image.blend(img, amber_layer, 0.5), img, glow)
d = ImageDraw.Draw(img)

def center(text, y, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)

center("TRIAD Prayer", 170, f_title, TEXT)
center("Choose how you'll walk with us.", 300, f_sub, MUTED)

# billing toggle: Monthly | Annual (annual selected, 3 days free badge)
ty = 430
tw, th = 330, 88
box_m = (W // 2 - tw - 16, ty, W // 2 - 16, ty + th)
box_a = (W // 2 + 16, ty, W // 2 + tw + 16, ty + th)
d.rounded_rectangle(box_m, radius=44, outline=LINE, width=3)
wm = d.textlength("Monthly", font=f_toggle)
d.text((box_m[0] + (tw - wm) / 2, ty + 20), "Monthly", font=f_toggle, fill=MUTED)
d.rounded_rectangle(box_a, radius=44, fill=CARD2, outline=AMBER, width=4)
wa = d.textlength("Annual", font=f_toggle)
d.text((box_a[0] + (tw - wa) / 2, ty + 20), "Annual", font=f_toggle, fill=AMBER)
lbl = "3 days free"
wl = d.textlength(lbl, font=f_badge)
d.rounded_rectangle((W // 2 - wl / 2 - 26, ty + th + 18, W // 2 + wl / 2 + 26, ty + th + 76),
                    radius=28, outline=AMBER, width=3)
d.text((W // 2 - wl / 2, ty + th + 26), lbl, font=f_badge, fill=AMBER)

tiers = [
    {
        "name": "Support Development", "badge": "SUPPORT", "price": "$19.99",
        "period": "/year", "callout": "SAVE 16%",
        "desc": "Every dollar keeps this app free for everyone who needs it — no exceptions.",
        "bullets": ["Dark mode", "2 soundscapes", "Full session history"],
        "cta": "Support Development", "style": "outline",
    },
    {
        "name": "Missions", "badge": "MISSIONS", "price": "$39.99",
        "period": "/year", "callout": "SAVE 33%", "featured": True,
        "desc": "Most of what you give goes straight to global missions.",
        "bullets": ["Everything in Support", "Audio narration", "Daily Prayer Mode", "Streak heat map"],
        "cta": "Fund Missions", "style": "amber",
    },
    {
        "name": "Kingdom Partner", "badge": "PARTNER", "price": "$69.99",
        "period": "/year", "callout": "BEST VALUE",
        "desc": "Half builds this app. Half funds the mission field. This is Kingdom math.",
        "bullets": ["Everything in Missions", "Full library access", "Retreat Mode", "4 soundscapes"],
        "cta": "Become a Partner", "style": "moss",
    },
]

y = ty + th + 130
MARGIN = 56
CW = W - MARGIN * 2
CH = 560
for t in tiers:
    featured = t.get("featured", False)
    fill = CARD2 if featured else CARD
    outline = AMBER if featured else LINE
    ow = 4 if featured else 2
    d.rounded_rectangle((MARGIN, y, MARGIN + CW, y + CH), radius=36, fill=fill, outline=outline, width=ow)
    px = MARGIN + 44
    d.text((px, y + 40), t["name"], font=f_tier, fill=TEXT)
    bw = d.textlength(t["badge"], font=f_badge)
    d.rounded_rectangle((MARGIN + CW - bw - 44 - 36, y + 42, MARGIN + CW - 36, y + 106),
                        radius=26, outline=LINE, width=2)
    d.text((MARGIN + CW - bw - 62, y + 52), t["badge"], font=f_badge, fill=MUTED)
    d.text((px, y + 130), t["price"], font=f_price, fill=TEXT)
    pw = d.textlength(t["price"], font=f_price)
    d.text((px + pw + 18, y + 168), t["period"], font=f_period, fill=MUTED)
    cw_ = d.textlength(t["callout"], font=f_badge)
    d.text((MARGIN + CW - cw_ - 44, y + 170), t["callout"], font=f_badge, fill=AMBER)
    # wrap description to 2 lines
    words = t["desc"].split(" ")
    line = ""
    ly = y + 280
    for w_ in words:
        trial = (line + " " + w_).strip()
        if d.textlength(trial, font=f_body) > CW - 88:
            d.text((px, ly), line, font=f_body, fill=MUTED)
            ly += 52
            line = w_
        else:
            line = trial
    d.text((px, ly), line, font=f_body, fill=MUTED)
    by = y + 396
    for b in t["bullets"]:
        d.text((px, by), "·  " + b, font=f_small, fill=TEXT)
        by += 44
    # CTA button
    bh = 92
    bxs = (MARGIN + 44, y + CH - bh - 36, MARGIN + CW - 44, y + CH - 36)
    style = t["style"]
    if style == "amber":
        for i in range(bh):
            f_ = i / bh
            col = tuple(int(AMBER[k] + (AMBER_DEEP[k] - AMBER[k]) * f_) for k in range(3))
            d.line([(bxs[0], bxs[1] + i), (bxs[2], bxs[1] + i)], fill=col)
        cta_fill = None
    elif style == "moss":
        for i in range(bh):
            f_ = i / bh
            col = tuple(int(MOSS[k] + (MOSS_DEEP[k] - MOSS[k]) * f_) for k in range(3))
            d.line([(bxs[0], bxs[1] + i), (bxs[2], bxs[1] + i)], fill=col)
        cta_fill = None
    else:
        d.rounded_rectangle(bxs, radius=30, outline=LINE, width=3)
        cta_fill = TEXT
    d.rounded_rectangle(bxs, radius=30, outline=(0, 0, 0), width=0)
    wt = d.textlength(t["cta"], font=f_cta)
    if style == "outline":
        d.text(((bxs[0] + bxs[2]) / 2 - wt / 2, bxs[1] + 20), t["cta"], font=f_cta, fill=TEXT)
    else:
        d.text(((bxs[0] + bxs[2]) / 2 - wt / 2, bxs[1] + 20), t["cta"], font=f_cta, fill=(13, 8, 4))
    y += CH + 44

center("Cancel anytime. Free trials convert to the yearly plan unless canceled.", y + 10, f_small, MUTED)
center("Restore purchases available in Settings.", y + 66, f_small, MUTED)

img.save("/tmp/paywall-review.png")
print("saved", img.size)
