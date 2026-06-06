Original prompt: Entities should be collisionable by default, add also an option on Tamamo's entity tab to disable the collisions for each entity individually if needed.

- Added schema-backed per-entity collision with a default of `true`.
- Added Tamamo's "Blocks player movement" checkbox and defaulted new entities to collision enabled.
- Updated Kuzunoha runtime movement to respect entity collision.
- Kept the bundled trial trigger non-collidable so its walk-on event still works.
- Verified with `npm test`, `npm run build`, and `npm run test:quest-smoke`.
- The standalone gameplay client's headless WebGL screenshot rendered black; its headed retry closed early, but the Playwright smoke gameplay checks passed.
- Follow-up: battle entities now remain collidable by default instead of using a non-collidable sample trigger.
- Added per-battle confirmation messages, a Tamamo Battle-tab editor field, and a confirm/cancel overlay before battle questions start.
- Verified the follow-up with `npm test`, `npm run build`, and `npm run test:quest-smoke`.
- TODO: none.
