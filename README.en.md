# KeyFlow Piano

[Tiếng Việt](README.md) | **English**

**[Play piano in your browser →](https://key-flow-piano.vercel.app)**

KeyFlow Piano is a personal **vibe-coded project**, developed with AI assistance when writing and revising code. It is shared free of charge for learning, experimentation and the enjoyment of making music, **with no commercial or profit-making purpose**.

## Features

- 61 piano keys from C2 to C7, played with a mouse, touch or 24 QWERTY positions.
- Grand piano sound from 21 Salamander samples shipped with the application.
- Volume, octave, sustain and velocity controls, with device-local preferences.
- A PWA with integrity-verified offline data and updates initiated by the user.
- Draggable controls and a landscape reminder on small screens.

## Start playing

1. Open the [live demo](https://key-flow-piano.vercel.app) and let the piano data finish loading; use the download/retry control if needed.
2. Click **Start Piano** to enable audio. The browser requires this interaction in each new playing session.
3. Press keys or touch the piano. Try **Z + C + B** for a C3–E3–G3 chord.

| Row | Physical QWERTY positions | Default note range |
| --- | --- | --- |
| Lower | Z S X D C V G B H N J M | C3–B3 |
| Upper | Q 2 W 3 E R 5 T 6 Y 7 U | C4–B4 |

Use **↑/↓** to shift octave; hold **Space** for sustain in the playing area. Labels follow the current octave. Mapping uses physical key positions, so printed characters can differ on non-QWERTY layouts. Simultaneous key detection also depends on keyboard hardware.

The PWA needs a network connection for the first complete download. Offline playing is available only after the current build's required data is cached. Installation and browser support depend on the platform; audible latency and compatibility with every browser have not been qualified.

## Run locally

Use **Node.js 22.23.1** and **pnpm 10.6.3**, as specified by `.nvmrc` and `packageManager`.

```sh
git clone https://github.com/vudinhthu/keyflow-piano-app.git
cd keyflow-piano-app
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open the localhost URL printed by Vite. No API key or external audio service is needed at runtime.

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm samples:verify
corepack pnpm notices:verify
corepack pnpm build
corepack pnpm preview
```

The build stops when notices do not match installed dependencies. After changing dependencies, run `corepack pnpm notices:generate` and review the result before committing.

The browser suite uses Chrome installed on the machine:

```sh
corepack pnpm test:mvp
```

It builds and starts its own preview, then checks controls, audio, preferences, offline behavior, cache integrity, safe updates and the PWA interface. Reports are generated under `output/` and are not committed.

## Credits & thanks

Thank you to the authors, maintainers and open-source communities who built the libraries, tools and sound recordings that make KeyFlow Piano possible.

| Source | Role | License |
| --- | --- | --- |
| [React / React DOM](https://github.com/react/react) | Interface and rendering | MIT |
| [Tone.js](https://github.com/Tonejs/Tone.js) | Sampling and audio processing | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | Interface state | MIT |
| [Vite](https://github.com/vitejs/vite), [React plugin](https://github.com/vitejs/vite-plugin-react) | Development server and build | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Type checking | Apache-2.0 |
| [Tailwind CSS / Vite plugin](https://github.com/tailwindlabs/tailwindcss) | Styles and build integration | MIT |
| [Vite PWA](https://github.com/vite-pwa/vite-plugin-pwa) | PWA integration | MIT |
| [Workbox](https://github.com/GoogleChrome/workbox) | Service worker and precaching | MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | Behavior tests | MIT |
| [Playwright CLI](https://github.com/microsoft/playwright-cli) | Browser checks | Apache-2.0 |
| [ESLint / @eslint/js](https://github.com/eslint/eslint), [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint) | Code checks | MIT |
| [React Hooks plugin](https://github.com/react/react/tree/main/packages/eslint-plugin-react-hooks), [React Refresh plugin](https://github.com/ArnaudBarre/eslint-plugin-react-refresh) | React lint rules | MIT |
| [globals](https://github.com/sindresorhus/globals) | Environment globals for lint | MIT |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | Node.js, React and React DOM types | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) / [Feather](https://github.com/feathericons/feather) | Control arrow SVG geometry, adapted for the application | ISC / MIT |

Transitive audio/worker dependencies and original notices for distributed components are recorded in [THIRD_PARTY_NOTICES](public/THIRD_PARTY_NOTICES.md). Exact dependency versions are recorded in `pnpm-lock.yaml`.

**Audio:** [Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano) by **Alexander Holm**, under **CC BY 3.0**; web MP3 edition from [Tone.js audio](https://github.com/Tonejs/audio/tree/master/salamander). The project uses 21 MP3 files unchanged from that web edition, with one dynamic layer; other pitches use pitch shifting. Thank you to Alexander Holm and the Tone.js community. See the [detailed attribution and sources](public/samples/salamander/ATTRIBUTION.md).

The nonprofit purpose describes how the author runs this project; each third-party component retains its own license and rights. Credits do not imply endorsement by the library or recording authors.
