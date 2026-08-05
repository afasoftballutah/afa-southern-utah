#!/usr/bin/env python3
"""Build the AFA Scorekeeper simple guide PDF.

Layout rules (every content page):
  - Full-width steps first — never side-by-side with a screenshot
  - Screenshot centered or full-width below the steps
  - Tip/callout at the bottom, never overlapping body text
  - Helvetica only; wrap long URLs; no unicode that fails in PDF fonts
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/AFA-Scorekeeper-Simple-Guide.pdf"
SHOTS = ROOT / "docs/guide-shots"
ANN = SHOTS / "annotated"
LOGO = ROOT / "public/afa-logo.png"

URL = "https://afa-southern-utah.vercel.app/"
SK = URL + "scorekeeper"

NAVY = HexColor("#002868")
GROUND = HexColor("#000D24")
RED = HexColor("#E31C25")
SOFT = HexColor("#F5F7FA")
MUTED = HexColor("#6B7280")
INK = HexColor("#111827")
LINE = HexColor("#D1D5DB")
GREEN = HexColor("#059669")
AMBER = HexColor("#D97706")

W, H = letter
M = 0.55 * inch
CONTENT_W = W - 2 * M
TOTAL = 9


# ---------------------------------------------------------------------------
# Image prep — simple circles, no stray badges on wrong keys
# ---------------------------------------------------------------------------

def _font(size):
    try:
        return ImageFont.truetype(
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf", size
        )
    except Exception:
        return ImageFont.load_default()


def _save_rgb(img, name):
    ANN.mkdir(parents=True, exist_ok=True)
    bg = Image.new("RGB", img.size, (255, 255, 255))
    if img.mode == "RGBA":
        bg.paste(img, mask=img.split()[3])
    else:
        bg.paste(img.convert("RGB"))
    path = ANN / name
    bg.save(path, "PNG", optimize=True)
    return path


def _circle(draw, cx, cy, r, width=9):
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        outline=(227, 28, 37, 255),
        width=width,
    )


def prepare_annotations():
    # Home: circle Tournaments button
    img = Image.open(SHOTS / "01-home-phone.png").convert("RGBA")
    w, h = img.size
    d = ImageDraw.Draw(img)
    _circle(d, int(w * 0.30), int(h * 0.455), int(w * 0.13), 9)
    _save_rgb(img, "home-tournaments.png")

    # PIN: circle Go only
    img = Image.open(SHOTS / "03-pin-phone.png").convert("RGBA")
    w, h = img.size
    d = ImageDraw.Draw(img)
    _circle(d, int(w * 0.715), int(h * 0.628), int(w * 0.10), 10)
    _save_rgb(img, "pin-go.png")

    # Control: crop to cards; circle only Tournaments card (top)
    img = Image.open(SHOTS / "05-control-phone.png").convert("RGBA")
    w, h = img.size
    crop = img.crop((0, int(h * 0.10), w, int(h * 0.68)))
    d = ImageDraw.Draw(crop)
    cw, ch = crop.size
    _circle(d, int(cw * 0.50), int(ch * 0.22), int(cw * 0.20), 9)
    _save_rgb(crop, "control-tournaments.png")

    # Heat expanded: setup table only; circle first SCORES pill
    src = Image.open(SHOTS / "06c-heat-expanded.png").convert("RGBA")
    w, h = src.size
    crop = src.crop((int(w * 0.10), int(h * 0.54), int(w * 0.94), int(h * 0.86)))
    d = ImageDraw.Draw(crop)
    cw, ch = crop.size
    _circle(d, int(cw * 0.80), int(ch * 0.58), int(cw * 0.075), 8)
    _save_rgb(crop, "heat-scores.png")

    # Gold scores: circle the SCORE boxes (center column)
    img = Image.open(SHOTS / "08-gold-top.png").convert("RGBA")
    w, h = img.size
    d = ImageDraw.Draw(img)
    _circle(d, int(w * 0.545), int(h * 0.40), int(w * 0.055), 8)
    _save_rgb(img, "gold-scores.png")

    # Division: circle Pool play / Bracket segment
    img = Image.open(SHOTS / "07-division-desk.png").convert("RGBA")
    w, h = img.size
    d = ImageDraw.Draw(img)
    _circle(d, int(w * 0.155), int(h * 0.195), int(w * 0.07), 8)
    _save_rgb(img, "division-tabs.png")


# ---------------------------------------------------------------------------
# PDF helpers
# ---------------------------------------------------------------------------

def footer(c, n):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(M, 0.48 * inch, W - M, 0.48 * inch)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(M, 0.32 * inch, "AFA Southern Utah · Simple Scorekeeper Guide")
    c.drawRightString(W - M, 0.32 * inch, f"{n}  ·  {TOTAL}")


def header(c, part, title):
    c.setFillColor(NAVY)
    c.rect(0, H - 0.72 * inch, W, 0.72 * inch, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(0, H - 0.78 * inch, W, 0.06 * inch, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica", 10)
    c.drawString(M, H - 0.32 * inch, part)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(M, H - 0.55 * inch, title)


def step_circle(c, n, x, y, r=13):
    c.setFillColor(RED)
    c.circle(x + r, y - r, r, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(x + r, y - r - 4, str(n))


def h1(c, text, y):
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(M, y, text)
    return y - 24


def wrap(c, text, font, size, max_w):
    c.setFont(font, size)
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if c.stringWidth(t, font, size) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_text(c, text, x, y, size=12, color=INK, leading=16, width=None, bold=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    width = width or (W - x - M)
    c.setFillColor(color)
    for line in wrap(c, text, font, size, width):
        c.setFont(font, size)
        c.drawString(x, y, line)
        y -= leading
    return y


def tip_box(c, x, y, w, h, title, lines, tone="info"):
    bg = {
        "ok": HexColor("#ECFDF5"),
        "warn": HexColor("#FFF7ED"),
        "info": HexColor("#EFF6FF"),
    }[tone]
    border = {"ok": GREEN, "warn": AMBER, "info": NAVY}[tone]
    c.setFillColor(bg)
    c.setStrokeColor(border)
    c.setLineWidth(1.2)
    c.roundRect(x, y, w, h, 8, fill=1, stroke=1)
    c.setFillColor(border)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x + 12, y + h - 18, title)
    c.setFillColor(INK)
    c.setFont("Helvetica", 10.5)
    ty = y + h - 36
    for line in lines:
        for sub in wrap(c, line, "Helvetica", 10.5, w - 24):
            c.setFont("Helvetica", 10.5)
            c.drawString(x + 12, ty, sub)
            ty -= 14


def draw_img(c, path, x, y_top, max_w, max_h):
    im = Image.open(path)
    iw, ih = im.size
    sc = min(max_w / iw, max_h / ih)
    dw, dh = iw * sc, ih * sc
    y = y_top - dh
    c.setStrokeColor(LINE)
    c.setFillColor(SOFT)
    c.setLineWidth(1)
    c.roundRect(x - 3, y - 3, dw + 6, dh + 6, 6, fill=1, stroke=1)
    c.drawImage(ImageReader(str(path)), x, y, width=dw, height=dh, mask="auto")
    return y


def center_img(c, path, y_top, max_w, max_h):
    im = Image.open(path)
    iw, ih = im.size
    sc = min(max_w / iw, max_h / ih)
    dw, dh = iw * sc, ih * sc
    x = M + (CONTENT_W - dw) / 2
    return draw_img(c, path, x, y_top, max_w, max_h)


def step_block(c, n, title, details, y, text_w=None):
    """One full-width step. details is a list of strings."""
    text_w = text_w or (CONTENT_W - 40)
    step_circle(c, n, M, y, 13)
    y = draw_text(c, title, M + 34, y - 5, size=13, color=INK, bold=True, leading=16, width=text_w)
    for d in details:
        col = RED if d.startswith("http") else MUTED
        y = draw_text(c, d, M + 34, y, size=11, color=col, leading=15, width=text_w)
    return y - 12


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

def page_cover(c):
    c.setFillColor(GROUND)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(0, H - 10, W, 10, fill=1, stroke=0)
    c.rect(0, 0, W, 10, fill=1, stroke=0)
    try:
        c.drawImage(
            ImageReader(str(LOGO)),
            W / 2 - 40,
            H - 2.0 * inch,
            width=80,
            height=80,
            mask="auto",
        )
    except Exception:
        pass
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(W / 2, H - 2.55 * inch, "AFA Southern Utah")
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(W / 2, H - 2.95 * inch, "Simple Scorekeeper Guide")
    c.setFillColor(HexColor("#9CA3AF"))
    c.setFont("Helvetica", 12)
    c.drawCentredString(
        W / 2, H - 3.3 * inch, "Picture steps · Real screens · Nothing to install"
    )

    c.setFillColor(HexColor("#0B1A3A"))
    c.roundRect(M + 10, H - 5.15 * inch, CONTENT_W - 20, 1.45 * inch, 12, fill=1, stroke=0)
    c.setFillColor(HexColor("#C8D5E8"))
    c.setFont("Helvetica", 12)
    y = H - 3.95 * inch
    for line in [
        "This booklet is for the person who runs games:",
        "unlock Scorekeeper, open a tournament, enter scores,",
        "and build brackets when needed.",
        "",
        "Large steps. Real photos of the site. Keep it with your phone.",
    ]:
        c.drawCentredString(W / 2, y, line)
        y -= 16

    c.setFillColor(white)
    c.roundRect(M + 20, 2.15 * inch, CONTENT_W - 40, 1.25 * inch, 12, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(W / 2, 3.1 * inch, "OPEN THE SITE")
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(W / 2, 2.75 * inch, URL)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10)
    c.drawCentredString(W / 2, 2.4 * inch, "Bookmark on your phone · Safari or Chrome")

    c.setFillColor(HexColor("#9CA3AF"))
    c.setFont("Helvetica", 10)
    c.drawCentredString(W / 2, 1.55 * inch, "Scorekeeper (directors):")
    c.setFillColor(HexColor("#FCA5A5"))
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(W / 2, 1.3 * inch, SK)
    c.setFillColor(HexColor("#6B7280"))
    c.setFont("Helvetica", 9)
    c.drawCentredString(
        W / 2, 0.95 * inch, "PIN is sent separately — not printed in this guide"
    )
    c.showPage()


def page_map(c):
    header(c, "START HERE", "The path in 30 seconds")
    y = H - 1.15 * inch
    y = h1(c, "Where you go on game day", y)
    y = draw_text(
        c,
        "You only need five stops. Always the same order.",
        M,
        y,
        size=12,
        color=MUTED,
    )
    y -= 14
    stops = [
        (1, "Home", "Public site — what teams and families see", "main website"),
        (2, "Scorekeeper", "Number pad · enter the PIN · tap Go", "/scorekeeper"),
        (3, "Control Center", "Three doors: Tournaments · Teams · Players", "pick Tournaments"),
        (4, "Your tournament", "Tap the event name to open it", "list of events"),
        (5, "Division then Scores", "Tap Scores on the division (Coed, Gold...)", "enter scores"),
    ]
    for num, title, detail, right in stops:
        c.setFillColor(white)
        c.setStrokeColor(NAVY)
        c.setLineWidth(1.5)
        c.roundRect(M, y - 52, CONTENT_W, 56, 10, fill=1, stroke=1)
        step_circle(c, num, M + 12, y - 8, 15)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(M + 50, y - 22, title)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 11)
        c.drawString(M + 50, y - 40, detail)
        c.setFillColor(RED)
        c.setFont("Helvetica", 9)
        c.drawRightString(W - M - 14, y - 28, right)
        y -= 68
    tip_box(
        c,
        M,
        0.7 * inch,
        CONTENT_W,
        0.85 * inch,
        "Remember",
        [
            "Teams & Players are for rosters and people.",
            "Game day scores and brackets live under Tournaments.",
        ],
        "ok",
    )
    footer(c, 2)
    c.showPage()


def page_open_site(c):
    header(c, "PART A · EVERYONE", "Open the website")
    y = H - 1.08 * inch
    y = h1(c, "See the public AFA site", y)
    y = draw_text(
        c,
        "Nothing to install. Use Safari or Chrome on your phone or computer.",
        M,
        y,
        size=12,
        color=MUTED,
    )
    y -= 14
    y = step_block(c, 1, "Open this link", [URL, "Bookmark it if you can."], y)
    y = step_block(
        c, 2, "Tap the link (or paste it in the browser)", ["Safari or Chrome is fine."], y
    )
    y = step_block(
        c,
        3,
        "You should see the eagle home page",
        ["Big red buttons: Tournaments and Register.", "Scroll for posters and results."],
        y,
    )
    # Phone fills remaining space above footer
    max_h = y - 0.65 * inch
    center_img(c, ANN / "home-tournaments.png", y, 2.85 * inch, max_h)
    footer(c, 3)
    c.showPage()


def page_pin(c):
    header(c, "PART B · DIRECTORS", "Unlock Scorekeeper")
    y = H - 1.05 * inch
    y = h1(c, "Enter the PIN", y)
    y = draw_text(
        c,
        "Scorekeeper is the private control room. Only directors.",
        M,
        y,
        size=12,
        color=MUTED,
    )
    y -= 12
    y = step_block(
        c,
        1,
        "Go to Scorekeeper",
        [SK, "Or type /scorekeeper after the main site address."],
        y,
    )
    y = step_block(
        c,
        2,
        "Tap the digits of the PIN",
        ["Dots appear as you type. Use Del if you miss a digit."],
        y,
    )
    y = step_block(
        c,
        3,
        "Tap Go",
        ["If the PIN is right, you land on Control Center."],
        y,
    )
    # Reserve room for tip (0.72h) + footer gap
    tip_top = 0.58 * inch + 0.72 * inch + 0.12 * inch
    max_h = y - tip_top
    center_img(c, ANN / "pin-go.png", y, 2.9 * inch, max_h)
    tip_box(
        c,
        M,
        0.58 * inch,
        CONTENT_W,
        0.72 * inch,
        "Keep the PIN private",
        [
            "Do not post it on Facebook or paper posters.",
            "Text it only to directors. You can change it later inside the tool.",
        ],
        "warn",
    )
    footer(c, 4)
    c.showPage()


def page_control(c):
    header(c, "PART B · DIRECTORS", "Control Center")
    y = H - 1.05 * inch
    y = h1(c, "Three doors — pick one", y)
    y = draw_text(
        c, "After the PIN, you always start here.", M, y, size=12, color=MUTED
    )
    y -= 12
    y = step_block(
        c,
        1,
        "Tournaments (game day home base)",
        [
            "Dates, fees, divisions, scores, who signed up.",
            "Start here to score games.",
        ],
        y,
    )
    y = step_block(
        c,
        2,
        "Teams",
        ["Every team and which events they entered. Good for lookup, not live scoring."],
        y,
    )
    y = step_block(
        c,
        3,
        "Players",
        ["Players and managers. Signatures and directory."],
        y,
    )
    tip_top = 0.58 * inch + 0.62 * inch + 0.12 * inch
    max_h = y - tip_top
    center_img(c, ANN / "control-tournaments.png", y, 3.0 * inch, max_h)
    tip_box(
        c,
        M,
        0.58 * inch,
        CONTENT_W,
        0.62 * inch,
        "Game day",
        ["Almost always: open Tournaments first."],
        "ok",
    )
    footer(c, 5)
    c.showPage()


def page_tournament(c):
    header(c, "PART B · GAME DAY", "Open a tournament & division")
    y = H - 1.05 * inch
    y = h1(c, "Find the event, then Scores", y)
    y -= 4
    for i, s in enumerate(
        [
            "Tap Tournaments on Control Center.",
            "Find your event in the list (name + date).",
            "Tap the row (the triangle on the left) to open it.",
            "Find the division (example: All - Pool Play, Gold, Coed D).",
            "Tap Scores on that row.",
        ],
        1,
    ):
        step_circle(c, i, M, y, 12)
        y = draw_text(c, s, M + 32, y - 8, size=12, color=INK, leading=16)
        y -= 10

    y -= 4
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(M, y, "What the buttons mean")
    y -= 16
    for label, meaning in [
        ("Teams", "Who is entered in this division"),
        ("Matchups", "Build pools / brackets structure"),
        ("Scores", "Enter results — main game-day button"),
    ]:
        c.setFillColor(RED if label == "Scores" else NAVY)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(M + 4, y, label)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 11)
        c.drawString(M + 78, y, "—  " + meaning)
        y -= 16

    y -= 6
    caption_h = 0.22 * inch
    max_h = y - 0.58 * inch - caption_h
    draw_img(c, ANN / "heat-scores.png", M, y, CONTENT_W, max_h)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawCentredString(
        W / 2,
        0.58 * inch,
        "Example: Coed Heat Stroker — use the Scores buttons on the right",
    )
    footer(c, 6)
    c.showPage()


def page_scores(c):
    header(c, "PART B · SCORING", "Enter a score")
    y = H - 1.05 * inch
    y = h1(c, "Type both sides, then Save", y)
    y = draw_text(
        c,
        "Same idea for pool games and bracket games.",
        M,
        y,
        size=12,
        color=MUTED,
    )
    y -= 10
    for i, (t, d) in enumerate(
        [
            (
                "Open Scores",
                "From the division row, or you may already be on the division page.",
            ),
            (
                "Find the game",
                "Team names on left and right. Field and time help you match the diamond.",
            ),
            (
                "Type the two scores",
                "Boxes sit between the teams — like a scoreboard.",
            ),
            (
                "Tap Save",
                "Only when both numbers are correct. Later games update after you save.",
            ),
        ],
        1,
    ):
        y = step_block(c, i, t, [d], y)

    tip_top = 0.58 * inch + 0.62 * inch + 0.12 * inch
    max_h = y - tip_top
    draw_img(c, ANN / "gold-scores.png", M, y, CONTENT_W, max_h)
    tip_box(
        c,
        M,
        0.58 * inch,
        CONTENT_W,
        0.62 * inch,
        "Mistake?",
        [
            "Use Clear on that game, then enter the correct score. Wrong scores can move later games — fix ASAP."
        ],
        "warn",
    )
    footer(c, 7)
    c.showPage()


def page_brackets(c):
    """Page 8 — slim. Full bracket walkthrough lives on the website guide."""
    header(c, "PART B · BRACKETS", "Make & run a bracket")
    y = H - 1.05 * inch
    y = h1(c, "One step at a time", y)
    y = draw_text(
        c,
        "This is the only part that needs room. Use the website guide — it scrolls.",
        M,
        y,
        size=12,
        color=MUTED,
    )
    y -= 14

    y = draw_text(c, "The order", M, y, size=14, color=NAVY, bold=True)
    y = draw_text(
        c,
        "Seeds  →  Format  →  Generate  →  Drawing  →  Scores",
        M,
        y,
        size=12,
        color=INK,
    )
    y -= 12

    for i, (t, d) in enumerate(
        [
            ("Seeds", "Order teams #1, #2, #3...  #1 is top seed."),
            ("Format", "Pick 3GG, Double elim, or Double elim + consol."),
            ("Generate", "Tap Generate (or Clear & generate to rebuild)."),
            ("Drawing", "Check the bracket picture before scoring."),
            ("Scores", "Enter results; winners advance after Save."),
        ],
        1,
    ):
        y = step_block(c, i, t, [d], y)

    y -= 6
    tip_box(
        c,
        M,
        y - 0.95 * inch,
        CONTENT_W,
        0.95 * inch,
        "Careful",
        [
            "Clear & generate wipes the bracket and rebuilds it.",
            "Only before live games — or when you mean to start over.",
        ],
        "warn",
    )
    y -= 1.15 * inch

    # Big web CTA
    c.setFillColor(NAVY)
    c.roundRect(M, 0.95 * inch, CONTENT_W, 1.55 * inch, 12, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(M + 16, 2.15 * inch, "Best view: website guide")
    c.setFont("Helvetica", 11)
    c.drawString(M + 16, 1.9 * inch, "Full bracket steps with room to scroll:")
    c.setFillColor(HexColor("#FECACA"))
    c.setFont("Helvetica-Bold", 11)
    guide_url = URL + "guide/scorekeeper#brackets"
    c.drawString(M + 16, 1.62 * inch, guide_url)
    c.setFillColor(HexColor("#94A3B8"))
    c.setFont("Helvetica", 10)
    c.drawString(M + 16, 1.3 * inch, "Open on your phone. Jump to section 7: Make a bracket.")
    c.drawString(M + 16, 1.1 * inch, "Also covers PIN, Control Center, and scoring.")

    footer(c, 8)
    c.showPage()


def page_cheat(c):
    header(c, "KEEP THIS PAGE", "Cheat sheet & help")
    y = H - 1.1 * inch
    y = h1(c, "Day-of checklist", y)
    for t in [
        "Open Scorekeeper and enter PIN",
        "Control Center -> Tournaments",
        "Open today's event (tap the triangle)",
        "Open the right division -> Scores",
        "Enter each final score -> Save",
        "If needed: Bracket tab · seeds · Generate",
        "Double-check wrong scores with Clear + re-enter",
    ]:
        c.setStrokeColor(NAVY)
        c.setLineWidth(1.5)
        c.setFillColor(white)
        c.rect(M, y - 14, 14, 14, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont("Helvetica", 12)
        c.drawString(M + 24, y - 11, t)
        y -= 24

    y -= 12
    panel_bottom = 0.65 * inch
    panel_h = y - panel_bottom
    c.setFillColor(NAVY)
    c.roundRect(M, panel_bottom, CONTENT_W, panel_h, 12, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(M + 18, y - 28, "Stuck?")
    c.setFont("Helvetica", 12)
    c.drawString(M + 18, y - 52, "Call or text the person who sent you this guide.")
    c.drawString(
        M + 18, y - 72, "Have ready: tournament name · division · what you tried"
    )
    c.drawString(M + 18, y - 90, "(score, bracket, or teams).")
    c.setStrokeColor(HexColor("#334155"))
    c.setLineWidth(1)
    c.line(M + 18, y - 110, W - M - 18, y - 110)
    c.setFillColor(HexColor("#94A3B8"))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(M + 18, y - 132, "LINKS")
    c.setFillColor(HexColor("#FECACA"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(M + 18, y - 154, "Home:          " + URL)
    c.drawString(M + 18, y - 174, "Scorekeeper:   " + SK)
    c.setFillColor(HexColor("#94A3B8"))
    c.setFont("Helvetica", 10)
    c.drawString(
        M + 18, y - 200, "PIN is not in this PDF. Keep it in a private text or note."
    )
    footer(c, 9)
    c.showPage()


def main():
    prepare_annotations()
    c = canvas.Canvas(str(OUT), pagesize=letter)
    c.setTitle("AFA Southern Utah — Simple Scorekeeper Guide")
    c.setAuthor("AFA Southern Utah")
    c.setSubject("Picture guide for directors who run Scorekeeper")

    page_cover(c)
    page_map(c)
    page_open_site(c)
    page_pin(c)
    page_control(c)
    page_tournament(c)
    page_scores(c)
    page_brackets(c)
    page_cheat(c)
    c.save()
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
