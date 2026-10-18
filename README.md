# Draconia reader

Unofficial fan reading index for **[@wanruochenhun](https://x.com/wanruochenhun)**'s comic adaptation of
*Draconia Malfoy and the Boy Who Said No*, the fanfic by **[@nomoontwo_](https://x.com/nomoontwo_)**
([Wattpad](https://www.wattpad.com/story/416789252-draconia-malfoy-and-the-boy-who-said-no)).

Live site: https://rguillimanxiii.github.io/draconia-reader/

* `index.html`: chapter list in story order (following the Wattpad table of contents)
* `read.html?ch=<key>`: one chapter, with prev/next and keyboard arrows (←/→ page, Shift+←/→ chapter)
* `read.html?all=1`: every chapter in one scroll

Images are **not** stored in this repo. They load straight from the artist's original X posts
(`pbs.twimg.com`), and every page links back to its post. If the artist or author wants this taken down,
it will be removed.

## Data

Everything lives in `comics.json`:

* `toc`: the story's chapter list (key, label, title, Wattpad link). It decides chapter order.
* `chapters[].parts[]`: one entry per X post: `post_id`, `url`, `date`, `part` (roman numeral),
  `pages`, `text`, `images[]` (`base`, `format`, `orig` = full-size `?name=orig` URL).
* `excluded`: artist posts deliberately left out (e.g. a different story), so updates skip them.
* `newest_post_id`: the newest included post. Use it as `since_id` when you fetch new posts.

## Adding new posts

1. Fetch the artist's posts newer than `newest_post_id` (user id `1596581433920745473`) with the X API v2
   (`GET /2/users/1596581433920745473/tweets` or search `from:wanruochenhun Draconia`), using
   `since_id=<newest_post_id>`, `expansions=attachments.media_keys`,
   `media.fields=url,type,width,height,media_key`, `post.fields=created_at,attachments,referenced_tweets,conversation_id`.
   Save each raw JSON response to a file.
2. `python3 scripts/update.py resp1.json [resp2.json ...]`
   * Posts whose text has `Chapter <n>, Part <roman> (Page a-b)` are added and sorted automatically.
   * Read the script output. It lists unknown chapter keys (add them to `toc`) and Draconia posts with images
     but no label. Add those by hand with
     `--manual <chapter> <part> <pages> <post_id>`, or add them to `excluded`.
   * Re-running on the same posts is safe (known ids are skipped).
3. Commit `comics.json` and push it to the branch GitHub Pages serves (see the bottom of this file). Pages redeploys on its own.

## Branches / hosting

GitHub Pages serves the **`gh-pages`** branch (root). `master` is the default branch and holds the same files.
Push every update to **both** `gh-pages` (that's what goes live, usually within a minute) and `master`.
