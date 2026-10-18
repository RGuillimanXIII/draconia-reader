#!/usr/bin/env python3
"""Append new Draconia comic posts to comics.json.

Usage:
    python3 scripts/update.py RESPONSE.json [RESPONSE2.json ...]

Each RESPONSE file is a raw X API v2 response (from get_users_posts,
search_posts_all, get_posts_by_ids, ...) requested with
  expansions=attachments.media_keys
  media.fields=url,type,width,height,media_key
  post.fields=created_at,attachments,referenced_tweets,conversation_id
Text before the first '{' is ignored, so tool output files work as-is.

A post is treated as a comic page set when it is authored by the artist,
has photos, and its text matches
    Chapter <One|1|1.1|2.2|...>, Part <roman numeral> (Page a-b)
Posts already in comics.json are skipped (so re-running is safe).
Chapters are ordered by the story's table of contents ("toc" in
comics.json, which follows the Wattpad chapter list); parts by their
roman numeral. Unknown chapter keys are appended to the end and listed
in the output so a human can add them to "toc".

Posts that need manual handling (no "Chapter/Part" label) can be
added with --manual CHAPTER_KEY PART PAGES POST_ID, e.g.
    python3 scripts/update.py resp.json --manual 3 I 0-3 2112345678901234567
"""
import argparse, json, re, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "comics.json"
WORDS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
         "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11",
         "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15"}
LABEL = re.compile(r"Chapter\s+([A-Za-z]+|\d+(?:\.\d+)?[a-z]?)\s*,?\s*Part\s+([IVXLC]+)\s*\(\s*Pages?\s*([\d]+(?:\s*-\s*\d+)?)\s*\)", re.I)
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman(s):
    s = s.upper(); total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total


def norm_key(k):
    return WORDS.get(k.lower(), k.lower())


def load_responses(paths):
    posts, media = {}, {}
    for p in paths:
        raw = pathlib.Path(p).read_text()
        i = raw.find("{")
        d, _ = json.JSONDecoder().raw_decode(raw[i:])
        data = d.get("data") or []
        if isinstance(data, dict):
            data = [data]
        for post in data:
            posts[post["id"]] = post
        inc = d.get("includes", {})
        for m in inc.get("media", []):
            media[m["media_key"]] = m
    return posts, media


def images_for(post, media):
    out = []
    for mk in (post.get("attachments") or {}).get("media_keys", []):
        m = media.get(mk)
        if not m or m.get("type") != "photo" or not m.get("url"):
            continue
        base = m["url"].rsplit(".", 1)[0]
        ext = m["url"].rsplit(".", 1)[1]
        out.append({"base": base, "format": ext, "orig": f"{base}?format={ext}&name=orig",
                    "width": m.get("width"), "height": m.get("height")})
    return out


def entry(post, media, part, pages, artist):
    return {
        "post_id": post["id"],
        "url": f"https://x.com/{artist}/status/{post['id']}",
        "date": post.get("created_at"),
        "part": part.upper(),
        "pages": pages.replace(" ", ""),
        "text": (post.get("note_tweet") or {}).get("text", post.get("text", "")),
        "images": images_for(post, media),
    }


def sort_all(db):
    order = {c["key"]: i for i, c in enumerate(db["toc"])}
    db["chapters"].sort(key=lambda c: (order.get(c["key"], 10_000), c["key"]))
    for c in db["chapters"]:
        c["parts"].sort(key=lambda p: (roman(p["part"]), p["date"] or ""))


def add(db, key, ent):
    toc = {c["key"]: c for c in db["toc"]}
    ch = next((c for c in db["chapters"] if c["key"] == key), None)
    if ch is None:
        t = toc.get(key, {})
        ch = {"key": key, "label": t.get("label", f"Chapter {key}"), "title": t.get("title", ""),
              "wattpad": t.get("wattpad", ""), "parts": []}
        db["chapters"].append(ch)
    ch["parts"].append(ent)
    return key in toc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("responses", nargs="*")
    ap.add_argument("--manual", nargs=4, action="append", default=[],
                    metavar=("CHAPTER", "PART", "PAGES", "POST_ID"))
    a = ap.parse_args()
    db = json.loads(DATA.read_text())
    artist = db["artist"]["handle"]; artist_id = db["artist"].get("id")
    known = {p["post_id"] for c in db["chapters"] for p in c["parts"]}
    known |= {x["post_id"] for x in db.get("excluded", [])}
    posts, media = load_responses(a.responses)
    added, unknown, skipped = [], [], []
    manual = {pid: (norm_key(ch), part, pages) for ch, part, pages, pid in a.manual}
    for pid, post in sorted(posts.items(), key=lambda kv: kv[1].get("created_at", "")):
        if pid in known:
            continue
        if artist_id and post.get("author_id") and post["author_id"] != artist_id:
            continue
        if pid in manual:
            key, part, pages = manual[pid]
        else:
            text = (post.get("note_tweet") or {}).get("text", post.get("text", ""))
            m = LABEL.search(text)
            if not m:
                if images_for(post, media) and "draconia" in text.lower():
                    skipped.append(pid)
                continue
            key, part, pages = norm_key(m.group(1)), m.group(2), m.group(3)
        ent = entry(post, media, part, pages, artist)
        if not ent["images"]:
            skipped.append(pid); continue
        if not add(db, key, ent):
            unknown.append(key)
        added.append(f"{key} Part {part} ({pid})")
    sort_all(db)
    db["updated"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    newest = max((p["post_id"] for c in db["chapters"] for p in c["parts"]), key=int, default=None)
    db["newest_post_id"] = newest
    DATA.write_text(json.dumps(db, indent=1, ensure_ascii=False) + "\n")
    print(f"added {len(added)}:", *added, sep="\n  ")
    if unknown:
        print("chapter keys not in toc (add them to toc in comics.json):", sorted(set(unknown)))
    if skipped:
        print("posts mentioning Draconia with images but no Chapter/Part label (check by hand, use --manual):", skipped)
    print("newest_post_id:", newest)


if __name__ == "__main__":
    main()
