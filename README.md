# Kitsune Engine

Kitsune Engine is a browser-first MVP for building and playing learning JRPGs.

## Project Layout

- `Tamamo` is the no-code maker app for maps, entities, knowledge, events, and export.
- `Kuzunoha` is the Phaser-based render app that imports Tamamo JSON projects and plays them.
- `Schema` defines the portable `KitsuneProject` content contract.
- `Runtime Core` owns renderer-independent simulation, event execution, diary state, flags, map transfers, and battle rules.

## Requirements

- Node.js 20 or newer
- npm

## Quick Start

```sh
npm install
```

### Launch the test servers

Run the two app servers in separate terminals:

```sh
npm run dev:tamamo
npm run dev:kuzunoha
```

- Tamamo runs at `http://127.0.0.1:5173`
- Kuzunoha runs at `http://127.0.0.1:5174`

These are the same local servers used by the Playwright smoke test.

### Run tests

Unit tests:

```sh
npm test
```

Smoke test:

```sh
npm run test:quest-smoke
```

The smoke test automatically starts both dev servers if they are not already running.

### Build

```sh
npm run build
```

## Development Notes

- `npm run dev:tamamo` serves the editor UI on port `5173`.
- `npm run dev:kuzunoha` serves the game client on port `5174`.
- `npm test` runs the Vitest suite in `packages/**`.
- `npm run test:quest-smoke` runs the end-to-end Playwright flow in `tests/smoke/quest.spec.ts`.

## Typical Workflow

1. Start Tamamo and edit a project.
2. Export the project JSON from Tamamo.
3. Load the exported JSON in Kuzunoha to play it.
4. Run `npm test` for fast unit coverage and `npm run test:quest-smoke` for the full editor-to-runtime path.
