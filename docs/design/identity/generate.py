"""Generates the three identity-direction mockups from one content source, so only the
design differs between them. See docs/design/IDENTITY_DIRECTIONS.md.

    python3 docs/design/identity/generate.py docs/design/identity

Screenshots (Chrome, 1280 wide):
    chrome --headless=new --hide-scrollbars --window-size=1280,2150 \
      --screenshot=cartelera.png file://$PWD/docs/design/identity/cartelera.html

Posters load from the live api's /posters route. The El Norte note is a sample written in
the blurb gate's style (sourced facts, inline citations), not the live blurb."""
import html, os, sys

OUT = sys.argv[1]
API = "https://latino-canon-api.ai-builders-studio-latinx.workers.dev/posters/"

TITLES = [
    ("Coco", 2017, "Lee Unkrich", "About the community", "coco-2017.jpg"),
    ("Selena", 1997, "Gregory Nava", "Latino-directed", "selena-1997.jpg"),
    ("Y Tu Mamá También", 2001, "Alfonso Cuarón", "Latino-directed", "y-tu-mama-tambien-2001.jpg"),
    ("Real Women Have Curves", 2002, "Patricia Cardoso", "Latina-directed", "real-women-have-curves-2002.jpg"),
    ("A Fantastic Woman", 2017, "Sebastián Lelio", "Breakthrough first", "a-fantastic-woman-2017.jpg"),
]
FEATURE = {
    "title": "El Norte", "year": 1983, "director": "Gregory Nava", "country": "US · Guatemala", "runtime": "139 min",
    "poster": "el-norte-1983.jpg",
    "tags": ["Latino-directed", "Latino-created", "About the community", "Breakthrough first"],
    # A sample note in the gate's style (sourced facts, inline citations) - not the live blurb.
    "note": [("El Norte (1983) follows Guatemalan siblings who flee persecution and cross Mexico to reach the United States", "s1"),
             ("Directed by Gregory Nava, it was nominated for the Academy Award for Best Original Screenplay", "a1")],
    "sources": [("s1", "Synopsis (TMDB)"), ("d0", "El Norte (1983) is directed by Gregory Nava."), ("a1", "Awards (OMDb): Nominated for 1 Oscar.")],
}
NAV = ["Explore", "Catalog", "Collections", "Evals", "About"]
QUERY = "the one where the siblings cross into Mexico…"
TRIES = ["películas de Gregory Nava", "Coco", "a documentary about the Chicano movement"]
EVALS = [("Search recall@5", "0.782"), ("Deploy gate", "✓ Passed"), ("Blurb groundedness", "0.685")]

e = html.escape


def page(key, name, fonts, css, labels):
    cards = "".join(
        f'<a class="card" href="#"><img src="{API}{p}" alt=""><div class="meta">'
        f'<div class="t">{e(t)}</div><div class="sub">{y} · {e(d)}</div><span class="tag">{e(tag)}</span></div></a>'
        for t, y, d, tag, p in TITLES)
    note = " ".join(f'{e(s)}<sup>[{c}]</sup>.' for s, c in FEATURE["note"])
    sources = "".join(f"<li><b>{c}</b> {e(t)}</li>" for c, t in FEATURE["sources"])
    tags = "".join(f'<span class="tag">{e(t)}</span>' for t in FEATURE["tags"])
    evals = "".join(f'<div class="stat"><div class="k">{e(k)}</div><div class="v">{e(v)}</div></div>' for k, v in EVALS)
    tries = "".join(f"<span>{e(t)}</span>" for t in TRIES)
    nav = "".join(f"<a href='#'>{n}</a>" for n in NAV)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Latino Canon · {e(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?{fonts}&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0;padding:0}} a{{color:inherit;text-decoration:none}} img{{display:block}}
.wrap{{max-width:1120px;margin:0 auto;padding:0 32px}}
header .wrap{{display:flex;justify-content:space-between;align-items:center;height:68px}} nav{{display:flex;gap:28px}}
.hero{{padding:72px 0 56px}} .try{{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}}
.rail{{display:grid;grid-template-columns:repeat(5,1fr);gap:20px}} .card img{{width:100%;aspect-ratio:2/3;object-fit:cover}}
.feature{{display:grid;grid-template-columns:220px 1fr;gap:40px;align-items:start}} .feature img{{width:100%;aspect-ratio:2/3;object-fit:cover}}
.tags{{display:flex;gap:8px;flex-wrap:wrap}} .stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}}
.search{{gap:16px}} .go{{white-space:nowrap}} section{{padding:44px 0}} sup{{font-size:.7em;margin-left:1px}}
@media (max-width:760px){{.rail{{grid-template-columns:repeat(2,1fr)}} .feature{{grid-template-columns:1fr}} .feature img{{max-width:200px}} nav{{display:none}} .stats{{grid-template-columns:1fr}}}}
{css}
</style></head>
<body class="{key}">
<header><div class="wrap"><div class="logo">{labels['logo']}</div><nav>{nav}</nav></div></header>
<main class="wrap">
  <div class="hero">
    <div class="kicker">{labels['kicker']}</div>
    <h1>{labels['headline']}</h1>
    <div class="search"><span class="q">{e(QUERY)}</span><span class="go">{labels['go']}</span></div>
    <div class="try"><em>Try</em>{tries}</div>
  </div>
  <section><h2>{labels['rail']}</h2><div class="rail">{cards}</div></section>
  <section><h2>{labels['feature']}</h2>
    <div class="feature"><img src="{API}{FEATURE['poster']}" alt="">
      <div><div class="ftitle">{e(FEATURE['title'])}</div>
        <div class="fmeta">{FEATURE['year']} · {e(FEATURE['director'])} · {e(FEATURE['country'])} · {FEATURE['runtime']}</div>
        <div class="tags">{tags}</div>
        <div class="why"><div class="label">Why it's in the canon</div><p>{note}</p><ol class="src">{sources}</ol></div>
      </div></div></section>
  <section><h2>{labels['evals']}</h2><div class="stats">{evals}</div></section>
</main>
<footer><div class="wrap">{labels['footer']}</div></footer>
</body></html>"""


DIRECTIONS = {
    # 1. A film-festival program: light paper, editorial serif, one cinnabar accent.
    "cartelera": ("Cartelera — the festival program",
        "family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Inter:wght@400;500;600",
        """
.cartelera{background:#f4efe6;color:#1b1712;font:16px/1.55 Inter,system-ui,sans-serif}
.cartelera header{border-bottom:1.5px solid #1b1712} .cartelera .logo{font:800 24px Fraunces,serif;letter-spacing:-.02em}
.cartelera .logo i{font-style:normal;color:#b3301b} .cartelera nav a{font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.cartelera .kicker{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#b3301b;font-weight:600;margin-bottom:18px}
.cartelera h1{font:800 64px/1.02 Fraunces,serif;letter-spacing:-.03em;max-width:880px}
.cartelera .search{margin-top:32px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1b1712;padding:14px 0;font:italic 400 22px Fraunces,serif;color:#655c50;max-width:760px}
.cartelera .go{font:600 13px Inter;letter-spacing:.1em;text-transform:uppercase;color:#b3301b;font-style:normal}
.cartelera .try{font-size:14px;color:#655c50} .cartelera .try span{border-bottom:1px solid #b9ad9b}
.cartelera .try em{font-style:normal;font-weight:600;color:#1b1712}
.cartelera h2{display:flex;gap:14px;align-items:baseline;font:600 13px Inter;letter-spacing:.14em;text-transform:uppercase;border-top:1.5px solid #1b1712;padding-top:12px;margin-bottom:24px}
.cartelera h2 b{font:800 30px Fraunces,serif;letter-spacing:-.02em;text-transform:none;color:#b3301b}
.cartelera .card .t{font:600 19px/1.2 Fraunces,serif;margin-top:10px} .cartelera .sub{font-size:13px;color:#655c50;margin:3px 0 8px}
.cartelera .tag{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#b3301b;font-weight:600}
.cartelera .tags .tag{border:1px solid #b3301b;padding:3px 8px}
.cartelera .ftitle{font:800 48px/1 Fraunces,serif;letter-spacing:-.03em} .cartelera .fmeta{color:#655c50;margin:10px 0 16px}
.cartelera .why{margin-top:26px;border-left:3px solid #b3301b;padding-left:18px;max-width:640px}
.cartelera .why .label{font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:#b3301b;margin-bottom:6px}
.cartelera .why p{font:400 20px/1.5 Fraunces,serif} .cartelera sup{color:#b3301b;font-family:Inter;font-weight:600}
.cartelera .src{list-style:none;margin-top:12px;font-size:13px;color:#655c50} .cartelera .src b{color:#b3301b;margin-right:6px}
.cartelera .stat{border-top:1.5px solid #1b1712;padding-top:10px} .cartelera .stat .k{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#655c50}
.cartelera .stat .v{font:800 44px Fraunces,serif;letter-spacing:-.02em}
.cartelera footer{border-top:1.5px solid #1b1712;padding:22px 0 40px;font-size:13px;color:#655c50}
""",
        {"logo": "Latino <i>Canon</i>", "kicker": "Cartelera · 331 films and series, curated",
         "headline": "Every Latino film worth knowing, and why it matters.", "go": "Buscar →",
         "rail": "<b>01</b> From the canon", "feature": "<b>02</b> In focus", "evals": "<b>03</b> Held to a standard",
         "footer": "Latino Canon — an editorially curated catalog. Every note cites its sources."}),

    # 2. A cinemateca archive: dark warm charcoal, tungsten amber, catalog-card metadata.
    "filmoteca": ("Filmoteca — the archive",
        "family=Newsreader:opsz,wght@6..72,400;6..72,600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600",
        """
.filmoteca{background:#121110;color:#efe9df;font:16px/1.55 Inter,system-ui,sans-serif}
.filmoteca header{border-bottom:1px solid #34302a} .filmoteca .logo{font:600 22px Newsreader,serif}
.filmoteca .logo i{font:500 11px 'IBM Plex Mono',monospace;color:#e3a857;font-style:normal;margin-left:10px;letter-spacing:.1em}
.filmoteca nav a{font:500 12px 'IBM Plex Mono',monospace;letter-spacing:.06em;color:#a39a8c;text-transform:uppercase}
.filmoteca .kicker{font:500 12px 'IBM Plex Mono',monospace;color:#e3a857;letter-spacing:.12em;margin-bottom:16px}
.filmoteca h1{font:400 58px/1.08 Newsreader,serif;letter-spacing:-.02em;max-width:860px}
.filmoteca h1 em{color:#e3a857}
.filmoteca .search{margin-top:34px;display:flex;justify-content:space-between;background:#1c1a17;border:1px solid #34302a;padding:18px 20px;max-width:760px;font:400 19px Newsreader,serif;color:#a39a8c;font-style:italic}
.filmoteca .go{font:500 12px 'IBM Plex Mono',monospace;color:#e3a857;font-style:normal;letter-spacing:.08em}
.filmoteca .try{font:13px 'IBM Plex Mono',monospace;color:#a39a8c} .filmoteca .try span{border:1px solid #34302a;padding:3px 8px}
.filmoteca .try em{font-style:normal;color:#e3a857}
.filmoteca h2{font:500 12px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#a39a8c;margin-bottom:22px;display:flex;gap:12px;align-items:center}
.filmoteca h2::after{content:"";flex:1;height:10px;background:repeating-linear-gradient(90deg,#34302a 0 6px,transparent 6px 14px)}
.filmoteca .card{background:#1c1a17;border:1px solid #34302a;padding:10px}
.filmoteca .card .t{font:600 18px/1.2 Newsreader,serif;margin-top:10px} .filmoteca .sub{font:12px 'IBM Plex Mono',monospace;color:#a39a8c;margin:4px 0 8px}
.filmoteca .tag{font:500 11px 'IBM Plex Mono',monospace;color:#e3a857;letter-spacing:.04em}
.filmoteca .tags .tag{background:#2a241c;padding:3px 8px}
.filmoteca .feature{background:#1c1a17;border:1px solid #34302a;padding:24px}
.filmoteca .ftitle{font:600 44px/1 Newsreader,serif} .filmoteca .fmeta{font:13px 'IBM Plex Mono',monospace;color:#a39a8c;margin:12px 0 16px}
.filmoteca .fmeta::before{content:"LC-0412 · 35mm · ";color:#e3a857}
.filmoteca .why{margin-top:24px;border-top:1px dashed #34302a;padding-top:16px;max-width:640px}
.filmoteca .why .label{font:500 12px 'IBM Plex Mono',monospace;color:#e3a857;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.filmoteca .why p{font:400 19px/1.55 Newsreader,serif} .filmoteca sup{color:#e3a857;font-family:'IBM Plex Mono'}
.filmoteca .src{list-style:none;margin-top:12px;font:12px/1.7 'IBM Plex Mono',monospace;color:#a39a8c} .filmoteca .src b{color:#e3a857;margin-right:8px}
.filmoteca .stat{background:#1c1a17;border:1px solid #34302a;padding:16px}
.filmoteca .stat .k{font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:#a39a8c}
.filmoteca .stat .v{font:600 38px Newsreader,serif;color:#efe9df;margin-top:4px}
.filmoteca footer{border-top:1px solid #34302a;padding:22px 0 40px;font:12px 'IBM Plex Mono',monospace;color:#a39a8c}
""",
        {"logo": "Latino Canon<i>ARCHIVO</i>", "kicker": "CATALOG · 331 TITLES · EST. 2026",
         "headline": "An archive of Latino cinema you can <em>ask</em>, in English or Spanish.", "go": "SEARCH ↵",
         "rail": "Recently catalogued", "feature": "Catalog card", "evals": "Quality control",
         "footer": "Latino Canon Archive — every note is checked against its sources before it's shown."}),

    # 3. An evolution of today's site: stays dark, drops purple glass for warm dusk tones.
    "atardecer": ("Atardecer — today's site, warmer",
        "family=Inter+Tight:wght@500;600;700;800&family=Inter:wght@400;500;600",
        """
.atardecer{background:radial-gradient(1100px 460px at 22% 80px,rgba(242,169,59,.13),transparent 70%) no-repeat,#1a1016;color:#f6eee9;font:16px/1.55 Inter,system-ui,sans-serif}
.atardecer header{border-bottom:1px solid #3b2530} .atardecer .logo{font:800 22px 'Inter Tight',sans-serif;letter-spacing:-.02em}
.atardecer .logo i{font-style:normal;color:#f2a93b} .atardecer nav a{font-size:14px;color:#bfaab2}
.atardecer .kicker{display:inline-block;font-size:13px;font-weight:600;color:#f2a93b;background:rgba(242,169,59,.12);padding:4px 12px;border-radius:999px;margin-bottom:18px}
.atardecer h1{font:800 60px/1.04 'Inter Tight',sans-serif;letter-spacing:-.035em;max-width:860px}
.atardecer h1 span{color:#f2a93b}
.atardecer .search{margin-top:30px;display:flex;justify-content:space-between;align-items:center;background:#25171f;border:1px solid #3b2530;border-radius:14px;padding:16px 18px;max-width:760px;color:#bfaab2}
.atardecer .go{background:#f2a93b;color:#1a1016;font-weight:700;font-size:14px;padding:8px 16px;border-radius:10px}
.atardecer .try{font-size:14px;color:#bfaab2} .atardecer .try span{background:#25171f;border:1px solid #3b2530;border-radius:999px;padding:4px 12px}
.atardecer .try em{font-style:normal;align-self:center}
.atardecer h2{font:700 24px 'Inter Tight',sans-serif;letter-spacing:-.02em;margin-bottom:20px}
.atardecer .card img{border-radius:12px} .atardecer .card .t{font:700 16px/1.25 'Inter Tight',sans-serif;margin-top:10px}
.atardecer .sub{font-size:13px;color:#bfaab2;margin:3px 0 8px}
.atardecer .tag{font-size:12px;font-weight:600;color:#f2a93b}
.atardecer .tags .tag{background:rgba(242,169,59,.12);padding:4px 10px;border-radius:999px}
.atardecer .tags .tag:nth-child(3){color:#f08a74;background:rgba(224,99,79,.14)}
.atardecer .feature{background:#25171f;border:1px solid #3b2530;border-radius:18px;padding:24px}
.atardecer .feature img{border-radius:12px}
.atardecer .ftitle{font:800 44px/1 'Inter Tight',sans-serif;letter-spacing:-.03em} .atardecer .fmeta{color:#bfaab2;margin:10px 0 16px}
.atardecer .why{margin-top:22px;background:#1a1016;border-radius:12px;padding:16px 18px;max-width:640px}
.atardecer .why .label{font-size:13px;font-weight:700;color:#f2a93b;margin-bottom:6px}
.atardecer .why p{font-size:17px} .atardecer sup{color:#f2a93b;font-weight:700}
.atardecer .src{list-style:none;margin-top:10px;font-size:13px;color:#bfaab2} .atardecer .src b{color:#f2a93b;margin-right:6px}
.atardecer .stat{background:#25171f;border:1px solid #3b2530;border-radius:14px;padding:16px}
.atardecer .stat .k{font-size:13px;color:#bfaab2} .atardecer .stat .v{font:700 36px 'Inter Tight',sans-serif;margin-top:2px}
.atardecer footer{border-top:1px solid #3b2530;padding:22px 0 40px;font-size:13px;color:#bfaab2}
""",
        {"logo": "Latino<i>Canon</i>", "kicker": "331 Latino films & series, curated",
         "headline": "Find any Latino film or series, <span>even the one you half remember.</span>", "go": "Search",
         "rail": "From the canon", "feature": "Why El Norte is in the canon", "evals": "Every answer is checked",
         "footer": "Latino Canon — search that shows its work."}),
}

os.makedirs(OUT, exist_ok=True)
for key, (name, fonts, css, labels) in DIRECTIONS.items():
    with open(os.path.join(OUT, f"{key}.html"), "w") as f:
        f.write(page(key, name, fonts, css, labels))
print("wrote", ", ".join(DIRECTIONS))
