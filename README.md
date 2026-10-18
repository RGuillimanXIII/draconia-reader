# @wanruochenhun comics reader

Unofficial fan reading index for **[@wanruochenhun](https://x.com/wanruochenhun)**'s Malfoid comic adaptations. It has two separate series:

1. **Draconia Malfoy and the Boy Who Said No**: the fanfic by **[@nomoontwo_](https://x.com/nomoontwo_)**
   ([Wattpad](https://www.wattpad.com/story/416789252-draconia-malfoy-and-the-boy-who-said-no))
2. **Year 4: Lyra Malfoy**: the Malfoid one-shot by **[@DodgerWing](https://x.com/DodgerWing)**
   ([original post](https://x.com/DodgerWing/status/2108657501407433152))

Live site: https://rguillimanxiii.github.io/draconia-reader/

* `index.html`: one section per series, chapters in story order
* `read.html?s=<series>&ch=<key>`: one chapter, with prev/next and keyboard arrows (←/→ page, Shift+←/→ chapter).
  Leaving out `s` defaults to `draconia`, so older links still work.
* `read.html?s=<series>&all=1`: a whole series in one scroll

Images are **not** stored in this repo. They load straight from the artist's original X posts
(`pbs.twimg.com`), and every page links back to its post. If the artist or an author wants this taken down,
it will be removed.

## Data

`comics.json` is the source of truth. `scripts/update.py` regenerates **`comics.js`**
(`window.COMICS = {...}`) from it, and that file is what the site actually loads, through a plain
`<script>` tag rather than `fetch()`. Some in-app browsers, such as the X/Twitter iOS app, fail on the
`fetch()` path. If `comics.js` fails to load, the page falls back to `comics.json` via XHR. If that
fails too, it shows an error with a retry button and an "Open in Safari" hint.
`index.html` and `read.html` load `comics.js`, `assets/app.js` and `assets/style.css` with a
`?v=<hash>` cache-busting query that `update.py` bumps on every run.
`assets/app.js` is plain ES5 (no arrow functions, template literals, fetch, Promises or storage). Keep it that way;
`npx acorn --ecma5 --silent assets/app.js comics.js` checks it.

Never edit `comics.js` by hand. After editing `comics.json`, `app.js` or `style.css` by hand, run
`python3 scripts/update.py --build`.

`comics.json` contains:

* `artist`: handle and numeric X id (`1596581433920745473`)
* `series[]`: `id` (`draconia`, `lyra`), `title`, `short`, `story` credit, `parser`, `keywords`, `notes`, `toc`, `chapters`
  * `toc`: chapter order (Draconia follows the Wattpad chapter list; Lyra is ordered by year number)
  * `chapters[].parts[]`: one entry per X post: `post_id`, `url`, `date`, `part` (roman numeral), `pages`,
    `conversation_id`, `text`, `images[]` (`base`, `format`, `orig` = full-size `?name=orig` URL)
* `excluded`: artist posts deliberately left out, so updates skip them
* `newest_post_id`: the newest post id seen. Use it as `since_id` when you fetch new posts.

## How new posts are sorted (scripts/update.py)

1. A post whose text contains one of a series' `keywords` goes to that series
   (Draconia: the fic title; Lyra: `@DodgerWing`, `DodgerWing`, `Lyra Malfoy`).
2. A post that replies to, quotes, or is in the same conversation as a post already on the site goes to that post's series.
   This catches threaded continuation pages.
3. A post with a `Chapter <n>, Part <roman> (Page a-b)` label goes to Draconia.

Parsers:
* `chapter_part` (Draconia) needs the label above.
* `sequential` (Lyra)
  * Chapter: `Year <n>` in the text, otherwise the chapter of the post it continues, otherwise the latest chapter.
  * Parts are numbered I, II, III… in posting order.
  * Pages come from `Page05-08`, `Page 9` or `first 4 pages`, otherwise they continue from the previous part.
  * New years are added to `toc` automatically.

Posts without photos are never added.

## Adding new posts

1. Fetch the artist's posts newer than `newest_post_id` with the X API v2, for example
   `GET /2/users/1596581433920745473/tweets` with `since_id=<newest_post_id>`, `max_results=25`,
   `expansions=attachments.media_keys`, `media.fields=url,type,width,height,media_key`,
   `post.fields=created_at,author_id,attachments,referenced_tweets,conversation_id,note_tweet`.
   Save each raw JSON response to a file.
2. `python3 scripts/update.py resp1.json [resp2.json ...]`
   * It prints what it added, chapter keys missing from `toc`, and posts to check by hand.
     Add those with `--manual [SERIES:]CHAPTER PART PAGES POST_ID` (SERIES defaults to `draconia`),
     e.g. `--manual 3 I 0-3 <id>` or `--manual lyra:year5 I 1-4 <id>`, or list them in `excluded`.
   * Re-running on the same posts is safe (known ids are skipped).
   * Pass only files that hold @wanruochenhun's posts, or include `author_id` in `post.fields` so other authors are filtered out.
3. Push **`comics.json`, `comics.js`, `index.html` and `read.html`** (the last two carry the new `?v=` hash)
   to both branches (below), one branch at a time. With the GitHub connector's `push_files`, that's exactly
   4 `$file:` arguments, so one call per branch.

## Branches / hosting

GitHub Pages serves the **`gh-pages`** branch (root). `master` is the default branch and holds the same files.
Push every update to **both** `gh-pages` (that's what goes live, usually within a minute) and `master`.
