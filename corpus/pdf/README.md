# corpus/pdf

Drop your `.pdf` files here, then run:

```sh
npm install            # one-time, installs pdf-parse (devDep)
node tools/prechunk.js
```

Page numbers are recorded so citations show `file.pdf p.42`.

Override the location:

```sh
KB_SRC_DIR=/path/to/your/pdfs node tools/prechunk.js
```

Empty? The app still runs — RAG just falls back to the model's general knowledge. You can also ingest files at runtime via the **Library** tab (PDF / PPTX / MD / TXT, with OCR fallback).
