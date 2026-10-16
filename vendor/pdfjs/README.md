# Mozilla PDF.js 5.4.624

Source: https://github.com/mozilla/pdf.js/releases/tag/v5.4.624

The unmodified browser builds `pdf.min.mjs` and `pdf.worker.min.mjs`, packed CMaps,
and standard font data are bundled from `pdfjs-dist` 5.4.624. They run locally in
the extension; no CDN or build/install step is required.

- PDF.js: Apache License 2.0, see [LICENSE](LICENSE). Copyright notices remain in the distribution files.
- CMaps: Adobe redistribution terms, see [cmaps/LICENSE](cmaps/LICENSE).
- Foxit font data: see [standard_fonts/LICENSE_FOXIT](standard_fonts/LICENSE_FOXIT).
- Liberation fonts: SIL Open Font License 1.1, see [standard_fonts/LICENSE_LIBERATION](standard_fonts/LICENSE_LIBERATION).

To update, replace these browser builds and data directories together from the
same `pdfjs-dist` release, retain licenses, and run the extension browser check.
