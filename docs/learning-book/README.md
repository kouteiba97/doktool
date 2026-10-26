# DokTool learning book (English and Arabic)

Two books, with the same structure in each language, that explain the whole code base so it can be read as if you had written it:

- `DokTool-Learning-Book-EN.pdf`
- `DokTool-Learning-Book-AR.pdf` (Arabic, right to left)

Their HTML versions sit next to them.

## What each book contains

The 14 chapters cover:
- the repository and how the apps are separated;
- the architecture;
- every API module;
- Admin Web, screen by screen;
- the mobile app, screen by screen;
- eight end-to-end journeys;
- working on the code.

Appendix A follows, generated from the code: every file, documented function and commented button, with line numbers.

## Rebuilding

Rebuild after changing the code or a chapter. It needs Python 3 and Chrome.

```bash
python3 docs/learning-book/build.py
```

To produce the HTML only:

```bash
python3 docs/learning-book/build.py --html
```

## Where the content comes from

- **Chapters:** `content/en/*.html` and `content/ar/*.html`, written by hand. Keep the two languages in step.
- **Code excerpts:** placeholders in the chapters, filled from the sources at build time:
  - `[[code PATH | ANCHOR | N]]` takes N lines from the first line containing ANCHOR, or the whole block when N is `block`;
  - `[[file PATH]]` takes the whole file.

  A placeholder whose anchor no longer exists stops the build with its name.
- **Folder introductions in Appendix A:** `folders.json`.
- **Layout:** `book.css`.
