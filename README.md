# Roland SP-404MKII Interactive Cheat Sheet

A fast, visual shortcut finder and hardware companion for the **Roland SP-404MKII** (Firmware v5.50), built with SvelteKit and TypeScript.

🔗 **Live Tool:** [SP-404MKII Cheat Sheet](https://gustavares.github.io/sp404mk2cheatsheet/) &nbsp;|&nbsp; <a href="https://0rwx.com/"><img src="./static/AI-W-light.svg" alt="AI Usage Disclosed via 0rwx" height="18" align="center" /></a>

---

## Features

- **Bidirectional Hardware Highlighting:** Click knobs, pads, or buttons on the virtual faceplate to filter matching shortcuts. Click any card to preview the button combo and OLED screen state.
- **Physical Muscle-Memory Layout:** Preserves 1:1 hardware geometry across mobile and desktop, with a thumb-zoom toggle for touch targets.
- **Cross-Gear DAW / Slang Search:** Search using MPC, Ableton, FL Studio, or community terms (_"choke group"_, _"one shot"_, _"16 levels"_, _"lazy chop"_, _"resample bounce"_) via [`src/lib/data/aliases.json`](./src/lib/data/aliases.json).
- **Curated Studio Sheet & PDF:** Pin go-to shortcuts into a custom sheet and export a high-density, ink-friendly 1–2 page reference table.
- **Lessons:** A guided, hands-on path for a first DJ-mode set. Each step lights the matching controls on the faceplate, says what to press, and says what to listen for. Progress is saved in the browser. There is no streak and no score.
- **Strict Verification:** 101 shortcuts with verbatim citations checked against the official Roland Reference Manual on every build. Lesson steps cite the same v5.50 manual (and the committed Ver.5.52 firmware notes) and are checked by `npm run validate:lessons`.

---

## Verification Pipeline

To eliminate hearsay and firmware drift, all data is verified against the manual:

- **Reference Corpus ([`docs/reference/roland-v550/`](./docs/reference/roland-v550/)):** Roland v5.50 manual chapters extracted with page anchors (`<!-- [Page N] -->`).
- **Closed-Loop CI Validator ([`scripts/validate-tips.mjs`](./scripts/validate-tips.mjs)):** Runs during `npm run check` to ensure:
  1. Tip `buttons` exactly match the hardware IDs in `combo`.
  2. Each tip's `citation.quote` exists verbatim on the referenced manual page.
  3. Search aliases in `aliases.json` maintain 1:1 coverage without keyword bloat.
- **PDF Ingestion ([`scripts/ingest-pdf.mjs`](./scripts/ingest-pdf.mjs)):** Parses new manuals into chapter markdown files with auto-extracted shortcuts:
  ```sh
  npm run docs:ingest -- --pdf /path/to/manual.pdf --slug roland-v600 --title "Roland SP-404MKII Manual v6.00"
  ```

---

## Porting to Other Samplers (SP-303, SP-404SX, etc.)

The engine is modular and can be adapted for any hardware device:

1. **Ingest Manual:** Run `npm run docs:ingest -- --pdf <file.pdf> --slug <id> --title "<title>"` to generate anchored chapter markdown.
2. **Define Hardware Types ([`src/lib/types.ts`](./src/lib/types.ts)):** Update `Category`, `CATEGORIES`, and button IDs (e.g. 8 pads for SP-303, 12 for SP-404SX).
3. **Update Validator ([`scripts/validate-tips.mjs`](./scripts/validate-tips.mjs)):** Align `VALID_CATEGORIES` and `comboTokenToButtons()` with your machine's conventions.
4. **Author Tips & Slang:** Populate [`src/lib/data/tips.json`](./src/lib/data/tips.json) with verbatim quotes and map colloquial terms in [`src/lib/data/aliases.json`](./src/lib/data/aliases.json).
5. **Adapt Faceplate ([`src/lib/components/Faceplate.svelte`](./src/lib/components/Faceplate.svelte)):** Adjust the SVG layout and control arrays (`topKnobs`, `fxButtons`, `pads`) to match the hardware's front panel.

---

## Lessons

Lessons live in [`src/lib/data/lessons.json`](./src/lib/data/lessons.json). Add another one by appending an object with a kebab-case `id`, a short `blurb`, what to `bring`, and at least three `steps`. Each step needs:

- `action` and `listen` — what to press, and what the ears should notice
- `highlight` — faceplate control ids (`REC`, `PAD 13`, `CTRL 1`, `PAD` for any pad, …)
- `screen` — the short line shown on the round display
- `citations` — a verbatim quote from a file in [`docs/reference/`](./docs/reference/). Manual quotes also need the `page` number that matches a `<!-- [Page N] -->` anchor

Optional fields: `note`, `offPanel` (a jack or switch the top-panel drawing does not include), `showShiftLabels`, `showDjLabels`, and `unverified` (say so when a claim is not in the manual). `npm run validate:lessons` rejects unknown button ids and quotes that are not on the cited page.

The current set is nine sessions, in beginner order: banks and buses, sampling, trimming, gate/loop/reverse, a pattern, bus effects, resampling, DJ mode, then a short set with an external input.

Each step has a `sense`:

- `midi` — an opt-in **Connect SP-404** button (Web MIDI, Chrome or Edge) can hear a documented message and move the step on. The port whose name looks like the SP-404 is selected on its own. Pads light on the drawing as they are hit. Done / Next still works.
- `audio` — an opt-in **Listen to the SP** button opens the input with echo cancellation, noise suppression, and auto gain off, into an analyser that is not connected to the speakers. A step completes when the level stays up, and only if it rose after the step opened. A steady onset pattern can show a rough BPM; a wobbly one stays quiet.
- `manual` — the control does not transmit (menus, REC, most buttons, DJ mode entry). The highlight is hatched. Done / Next is the way through.

What the SP transmits is taken from the v5.50 MIDI implementation chart in [`docs/reference/roland-v550/12-appendix-specs-midi.md`](./docs/reference/roland-v550/12-appendix-specs-midi.md). Program change is not transmitted, so it is ignored. Note-off is not transmitted. MIDI clock counts only as a hint, and only when Sync Out is on.

## GitHub Pages

This fork is published by [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml), which builds with `BASE_PATH` set to the repository name (`/sp404mk2cheatsheet`) and deploys to `https://gustavares.github.io/sp404mk2cheatsheet/`.

On a fresh fork, GitHub will not run that workflow until both of these are turned on:

1. **Actions** — open the Actions tab and, if GitHub shows that workflows are disabled on the fork, choose **I understand my workflows, go ahead and enable them**.
2. **Pages** — **Settings → Pages → Build and deployment → Source: GitHub Actions**. Do not use “Deploy from a branch”; the workflow uploads the built site itself.

The workflow runs on every push to `main`, and it can also be started by hand from the Actions tab.

## Development

```sh
# Install dependencies
npm install

# Start development server
npm run dev

# Run tip citation validator and Svelte type-checking
npm run check

# Check code formatting and ESLint rules
npm run lint

# Build static production site (./build)
npm run build
```

---

## AI Usage Disclosure

<p align="left">
  <a href="https://0rwx.com/">
    <img src="./static/AI-W-light.svg" alt="0rwx AI Disclosure Badge" width="40" height="40" />
  </a>
</p>

This project complies with the **[0rwx](https://0rwx.com/)** open AI disclosure specification. AI coding assistants were utilized for interactive architecture, citation validation tooling, documentation formatting, and the lesson copy, paired with checks against the official Roland SP-404MKII v5.50 Reference Manual and Roland’s Ver.5.52 system-program notes. Lesson steps that could not be confirmed are marked in the lesson data.

---

## License & Attribution

- Built with ❤️ by **[frstudios](https://frstudios.co.ke)**
- Original repository: **[github.com/cntrvsy/sp404mk2cheatsheet](https://github.com/cntrvsy/sp404mk2cheatsheet)**
- This fork: **[github.com/gustavares/sp404mk2cheatsheet](https://github.com/gustavares/sp404mk2cheatsheet)**
- Licensed under the **[MIT License](./LICENSE)** (copyright remains with frstudios)
- _Disclaimer:_ Roland and SP-404MKII are registered trademarks of Roland Corporation. This project is an independent educational tool.
