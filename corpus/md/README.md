# corpus/md

Drop your `.md` files here, then run:

```sh
node tools/prechunk.js
```

This rebuilds `public/kb-prebuilt.json` so the app's RAG retrieval can ground answers in your notes.

Override the location with env vars:

```sh
KB_MD_DIR=/path/to/markdown KB_SRC_DIR=/path/to/pdfs node tools/prechunk.js
```
