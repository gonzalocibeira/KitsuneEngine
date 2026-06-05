# Kitsune Engine

Kitsune Engine is a browser-first MVP for building and playing learning JRPGs.

- **Tamamo** is the no-code maker app for maps, entities, knowledge, events, and export.
- **Kuzunoha** is the Phaser-based render app that imports Tamamo JSON projects and plays them.
- **Schema** defines the portable `KitsuneProject` content contract.
- **Runtime Core** owns renderer-independent simulation, event execution, diary state, flags, map transfers, and battle rules.

## Commands

```sh
npm install
npm run dev:tamamo
npm run dev:kuzunoha
npm test
npm run build
```

Tamamo runs on `http://127.0.0.1:5173`. Kuzunoha runs on `http://127.0.0.1:5174`.

The Playwright smoke test uses current browser tooling and should be run with Node 20+:

```sh
npm run test:quest-smoke
```
