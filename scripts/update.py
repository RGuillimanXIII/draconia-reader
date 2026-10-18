#!/usr/bin/env python3
"""Append new @wanruochenhun comic posts to comics.json.

Usage:
    python3 scripts/update.py RESPONSE.json [RESPONSE2.json ...] [--manual ...]

Each RESPONSE file is a raw X API v2 response (get_users_posts,
search_posts_all, get_posts_by_ids, ...) requested with
  expansions=attachments.media_keys
  media.fields=url,type,width,height,media_key
  post.fields=created_at,attachments,referenced_tweets,conversation_id
Text before the first '{' is ignored, so tool output files work as-is.

comics.json holds several series ("series": [...]). Each new post is sorted
into a series in this order:
  1. its text contains one of the series' "keywords"
     (Draconia: the fic title; Lyra: "@DodgerWing", "Lyra Malfoy");
  2. it replies to / quotes / shares a conversation with a post already in
     a series (threaded continuation pages);
  3. its text matches the Draconia label "Chapter <n>, Part <roman> (Page a-b)".
Posts that match nothing are ignored. Posts without photos are reported, not added.

Parsing per series ("parser"):
  chapter_part  (Draconia) needs "Chapter <One|1|1.1|...>, Part <roman> (Page a-b)".
                Chapter order comes from "toc" (the Wattpad chapter list).
  sequential    (Lyra) chapter = "Year <n>" in the text, else the chapter of the
                post it continues, else the series' latest chapter. Parts are
                numbered I, II, III... in posting order. Pages come from
                "Page05-08" / "Page 9" / "first 4 pages", else continue from the
                previous part. Unknown "Year <n>" chapters are added to toc.
Every run rewrites comics.json, regenerates comics.js (window.COMICS, the
file the site loads) and bumps the ?v= cache-busting strings in index.html
and read.html. After editing comics.json or the site code by hand, run
    python3 scripts/update.py --build
Re-running is safe: post ids already in comics.json (or in "excluded") are skipped.

Manual additions (unlabelled posts):
    --manual [SERIES:]CHAPTER PART PAGES POST_ID     (SERIES defaults to draconia)
    e.g. --manual 3 I 0-3 2112345678901234567
         --manual lyra:year5 I 1-4 2112345678901234567
"""
import argparse, json, re, datetime, pathlib, hashlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "comics.json"
DATA_JS = ROOT / "comics.js"
HTML = [ROOT / "index.html", ROOT / "read.html"]
ASSETS = ["comics.js", "assets/app.js", "assets/style.css"]
WORDS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
         "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11",
         "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15"}
LABEL = re.compile(r"Chapter\s+([A-Za-z]+|\d+(?:\.\d+)?[a-z]?)\s*,?\s*Part\s+([IVXLC]+)\s*\(\s*Pages?\s*(\d+(?:\s*-\s*\d+)?)\s*\)", re.I)
YEAR = re.compile(r"\bYear\s*(\d+)\b", re.I)
PAGES = re.compile(r"\bPages?\s*0*(\d+)(?:\s*[-–]\s*0*(\d+))?", re.I)
FIRST_N = re.compile(r"\bfirst\s+(\d+)\s+pages?\b", re.I)
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman(s):
    s = s.upper(); total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total


def to_roman(n):
    out = ""
    for v, r in ((100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= v:
            out += r; n -= v
    return out


def norm_key(k):
    return WORDS.get(k.lower(), k.lower())


def load_responses(paths):
    posts, media = {}, {}
    for p in paths:
        raw = pathlib.Path(p).read_text()
        i = raw.find('{"data"')
        try:
            d, _ = json.JSONDecoder().raw_decode(raw[i if i >= 0 else raw.find("{"):])
        except ValueError:
            print(f"warning: {p} is not an X API JSON response, skipped")
            continue
        data = d.get("data") or []
        for post in ([data] if isinstance(data, dict) else data):
            posts[post["id"]] = post
        for m in d.get("includes", {}).get("media", []):
            media[m["media_key"]] = m
    return posts, media


def text_of(post):
    return (post.get("note_tweet") or {}).get("text", post.get("text", ""))


def images_for(post, media):
    out = []
    for mk in (post.get("attachments") or {}).get("media_keys", []):
        m = media.get(mk)
        if not m or m.get("type") != "photo" or not m.get("url"):
            continue
        base, ext = m["url"].rsplit(".", 1)
        out.append({"base": base, "format": ext, "orig": f"{base}?format={ext}&name=orig",
                    "width": m.get("width"), "height": m.get("height")})
    return out


def entry(post, imgs, part, pages, artist):
    return {"post_id": post["id"], "url": f"https://x.com/{artist}/status/{post['id']}",
            "date": post.get("created_at"), "part": part.upper(), "pages": pages.replace(" ", ""),
            "conversation_id": post.get("conversation_id"), "text": text_of(post), "images": imgs}


def year_sort(key):
    m = re.search(r"(\d+)", key)
    return (int(m.group(1)) if m else 10_000, key)


def sort_series(s):
    if s["parser"] == "sequential":
        s["toc"].sort(key=lambda t: year_sort(t["key"]))
    order = {c["key"]: i for i, c in enumerate(s["toc"])}
    s["chapters"].sort(key=lambda c: (order.get(c["key"], 10_000), c["key"]))
    for c in s["chapters"]:
        c["parts"].sort(key=lambda p: (roman(p["part"]), p["date"] or ""))


def chapter(s, key):
    ch = next((c for c in s["chapters"] if c["key"] == key), None)
    if ch is None:
        t = next((t for t in s["toc"] if t["key"] == key), None)
        if t is None and s["parser"] == "sequential":
            n = re.search(r"\d+", key)
            t = {"key": key, "label": f"Year {n.group(0)}" if n else key, "title": "", "wattpad": ""}
            s["toc"].append(t)
        t = t or {}
        ch = {"key": key, "label": t.get("label", f"Chapter {key}"), "title": t.get("title", ""),
              "wattpad": t.get("wattpad", ""), "parts": []}
        s["chapters"].append(ch)
    return ch, any(t["key"] == key for t in s["toc"])


def write_outputs(db):
    """Write comics.json (source of truth), regenerate comics.js (what the site
    actually loads, via a plain <script> tag) and bump the ?v= cache-busting
    query strings in index.html / read.html."""
    DATA.write_text(json.dumps(db, indent=1, ensure_ascii=False) + "\n")
    # ensure_ascii keeps U+2028/U+2029 (illegal in pre-ES2019 JS strings) escaped
    payload = json.dumps(db, ensure_ascii=True, separators=(",", ":"))
    payload = payload.replace("</", "<\\/")
    h = hashlib.sha1()
    h.update(payload.encode())
    for a in ASSETS[1:]:
        h.update((ROOT / a).read_bytes())
    ver = h.hexdigest()[:10]
    DATA_JS.write_text("/* Generated by scripts/update.py from comics.json. Do not edit by hand. */\n"
                       f"window.COMICS_VERSION = {json.dumps(ver)};\nwindow.COMICS = {payload};\n")
    for f in HTML:
        t = f.read_text()
        for a in ASSETS:
            t = re.sub(re.escape(a) + r'\?v=[^"\']*', f"{a}?v={ver}", t)
        f.write_text(t)
    return ver


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("responses", nargs="*")
    ap.add_argument("--build", action="store_true",
                    help="only regenerate comics.js and cache-busting versions from comics.json")
    ap.add_argument("--manual", nargs=4, action="append", default=[],
                    metavar=("[SERIES:]CHAPTER", "PART", "PAGES", "POST_ID"))
    a = ap.parse_args()
    db = json.loads(DATA.read_text())
    if a.build:
        print("built comics.js, version", write_outputs(db))
        return
    artist = db["artist"]["handle"]; artist_id = db["artist"].get("id")
    series = {s["id"]: s for s in db["series"]}
    owner, chap_of = {}, {}  # post id / conversation id -> series id, chapter key
    for s in db["series"]:
        for c in s["chapters"]:
            for p in c["parts"]:
                for k in (p["post_id"], p.get("conversation_id")):
                    if k:
                        owner[k] = s["id"]; chap_of[k] = c["key"]
    for x in db.get("excluded", []):
        if x.get("series"):
            owner.setdefault(x["post_id"], x["series"])
    known = {p["post_id"] for s in db["series"] for c in s["chapters"] for p in c["parts"]}
    known |= {x["post_id"] for x in db.get("excluded", [])}
    manual = {}
    for ch, part, pages, pid in a.manual:
        sid, _, key = ch.rpartition(":")
        manual[pid] = (sid or "draconia", norm_key(key), part, pages)
    posts, media = load_responses(a.responses)
    added, unknown, report = [], [], []
    for pid, post in sorted(posts.items(), key=lambda kv: (kv[1].get("created_at", ""), int(kv[0]))):
        if pid in known or (artist_id and post.get("author_id") and post["author_id"] != artist_id):
            continue
        text = text_of(post); low = text.lower()
        refs = [r["id"] for r in post.get("referenced_tweets") or [] if r["type"] in ("replied_to", "quoted")]
        imgs = images_for(post, media)
        if pid in manual:
            sid, key, part, pages = manual[pid]
        else:
            sid = next((s["id"] for s in db["series"] if any(k.lower() in low for k in s.get("keywords", []))), None)
            via_thread = False
            if sid is None:
                via_thread = True
                sid = next((owner[r] for r in refs + [post.get("conversation_id")] if r in owner), None)
            lab = LABEL.search(text)
            if sid is None and lab:
                sid = "draconia"; via_thread = False
            if sid is None:
                continue
            s = series[sid]
            if not imgs:
                if not via_thread:  # ordinary text replies in a comic thread are not interesting
                    report.append(f"{pid}: in series {sid} but has no photos, not added")
                continue
            if s["parser"] == "chapter_part":
                if not lab:
                    report.append(f"{pid}: looks like {sid} (thread/keyword) but has no 'Chapter n, Part X (Page a-b)' label; add with --manual")
                    continue
                key, part, pages = norm_key(lab.group(1)), lab.group(2), lab.group(3)
            else:  # sequential
                y = YEAR.search(text)
                if y:
                    key = f"year{y.group(1)}"
                else:
                    key = next((chap_of[r] for r in refs + [post.get("conversation_id")] if r in chap_of), None)
                    if key is None:
                        key = s["toc"][-1]["key"] if s["toc"] else "year1"
                ch, _ = chapter(s, key)
                prev_end = 0
                for p0 in ch["parts"]:
                    m0 = re.findall(r"\d+", p0["pages"])
                    if m0:
                        prev_end = max(prev_end, int(m0[-1]))
                pm, fm = PAGES.search(text), FIRST_N.search(text)
                if pm:
                    pages = pm.group(1) + (f"-{pm.group(2)}" if pm.group(2) else "")
                elif fm:
                    pages = f"1-{fm.group(1)}"
                else:
                    a0, b0 = prev_end + 1, prev_end + len(imgs)
                    pages = f"{a0}-{b0}" if b0 > a0 else str(a0)
                part = to_roman(len(ch["parts"]) + 1)
        s = series[sid]
        if not imgs:
            report.append(f"{pid}: no photos, skipped"); continue
        ch, in_toc = chapter(s, key)
        ch["parts"].append(entry(post, imgs, part, pages, artist))
        if not in_toc:
            unknown.append(f"{sid}:{key}")
        known.add(pid); owner[pid] = sid; chap_of[pid] = key
        if post.get("conversation_id"):
            owner.setdefault(post["conversation_id"], sid); chap_of.setdefault(post["conversation_id"], key)
        added.append(f"{sid} / {key} Part {part.upper()} pages {pages} ({pid})")
    for s in db["series"]:
        sort_series(s)
    db["updated"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ids = [p["post_id"] for s in db["series"] for c in s["chapters"] for p in c["parts"]]
    ids += [x["post_id"] for x in db.get("excluded", [])]
    db["newest_post_id"] = max(ids, key=int, default=None)
    ver = write_outputs(db)
    print(f"added {len(added)}:", *added, sep="\n  ")
    if unknown:
        print("chapter keys not in toc (add label/title to that series' toc):", sorted(set(unknown)))
    if report:
        print("check by hand:", *report, sep="\n  ")
    print("newest_post_id:", db["newest_post_id"], "| site version:", ver)


if __name__ == "__main__":
    main()
