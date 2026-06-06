import React from "react";
import { createRoot } from "react-dom/client";
import Phaser from "phaser";
import { sampleProject } from "@kitsune/schema/sampleProject";
import { validateProject, type Entity, type KitsuneMap, type KitsuneProject, type SpriteAsset, type TilesetAsset, type TileValue } from "@kitsune/schema";
import { createSaveKey, GameRuntime, type LegacySaveState, type RuntimeSnapshot, type SaveState, type Version1SaveState } from "@kitsune/runtime-core";
import "./styles.css";

type RuntimeHandle = {
  runtime: GameRuntime;
  project: KitsuneProject;
};

type StoredGame = {
  storageVersion: 1;
  project: KitsuneProject;
  save: SaveState;
};

const LATEST_SAVE_KEY = "kitsune-save:latest";

function App() {
  const [handle, setHandle] = React.useState<RuntimeHandle | undefined>();
  const [snapshot, setSnapshot] = React.useState<RuntimeSnapshot | undefined>();
  const [error, setError] = React.useState("");
  const [battleAnswer, setBattleAnswer] = React.useState("");
  const [paused, setPaused] = React.useState(false);
  const [confirmTitle, setConfirmTitle] = React.useState(false);
  const [saveNotice, setSaveNotice] = React.useState("");
  const [latestSave, setLatestSave] = React.useState<StoredGame | undefined>(() => loadLatestSave());
  const runtimeRef = React.useRef<GameRuntime | undefined>(undefined);
  const handleRef = React.useRef<RuntimeHandle | undefined>(undefined);
  const inputEnabledRef = React.useRef(true);

  React.useEffect(() => {
    handleRef.current = handle;
    runtimeRef.current = handle?.runtime;
    if (handle) setSnapshot(handle.runtime.snapshot());
  }, [handle]);

  React.useEffect(() => {
    inputEnabledRef.current = !paused;
  }, [paused]);

  const refresh = React.useCallback((save = true) => {
    const active = handleRef.current;
    if (!active) return;
    setSnapshot(active.runtime.snapshot());
    if (save) {
      const result = persistGame(active);
      if (result.ok) setLatestSave(result.stored);
      else setSaveNotice(result.message);
    }
  }, []);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const active = handleRef.current;
      if (!active || event.repeat || isTextInput(event.target)) return;
      const current = active.runtime.snapshot();

      if (event.key === "Escape" && current.overlay.type === "none") {
        event.preventDefault();
        setConfirmTitle(false);
        setPaused((value) => !value);
        return;
      }

      if (paused || (event.code !== "Space" && event.key !== "Enter")) return;

      if (current.overlay.type === "dialogue" || current.overlay.type === "keyAcquisition") {
        event.preventDefault();
        active.runtime.closeOverlay();
        refresh();
        return;
      }

      if (current.overlay.type === "none") {
        event.preventDefault();
        active.runtime.interact();
        refresh();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paused, refresh]);

  function loadProject(project: KitsuneProject, save?: SaveState | Version1SaveState | LegacySaveState) {
    const runtime = new GameRuntime(project, save);
    setHandle({ runtime, project });
    setSnapshot(runtime.snapshot());
    setPaused(false);
    setConfirmTitle(false);
    setSaveNotice("");
    setError("");
  }

  function closeOverlay() {
    handle?.runtime.closeOverlay();
    refresh();
  }

  function confirmBattle() {
    handle?.runtime.confirmBattle();
    refresh();
  }

  function answerBattle(event: React.FormEvent) {
    event.preventDefault();
    if (!battleAnswer.trim()) return;
    handle?.runtime.answerBattle(battleAnswer);
    setBattleAnswer("");
    refresh();
  }

  function saveNow() {
    const active = handleRef.current;
    if (!active) return;
    const result = persistGame(active);
    setSaveNotice(result.ok ? `${formatSaveTime(result.stored.save.updatedAt)}.` : result.message);
    if (result.ok) setLatestSave(result.stored);
  }

  function returnToTitle() {
    handleRef.current = undefined;
    runtimeRef.current = undefined;
    setHandle(undefined);
    setSnapshot(undefined);
    setPaused(false);
    setConfirmTitle(false);
    setSaveNotice("");
    setLatestSave(loadLatestSave());
  }

  if (!handle || !snapshot) {
    return (
      <BootScreen
        error={error}
        latestSave={latestSave}
        setError={setError}
        loadProject={loadProject}
      />
    );
  }

  const nearby = findNearbyEntity(snapshot);
  const canPause = snapshot.overlay.type === "none";

  return (
    <main className="game-shell">
      <GameCanvas runtimeRef={runtimeRef} inputEnabledRef={inputEnabledRef} onRuntimeChange={refresh} project={handle.project} />
      {canPause && !paused && <WorldHud snapshot={snapshot} />}
      {nearby && canPause && !paused && <section className="hud prompt">Press Space to inspect {nearby.name}</section>}
      {snapshot.overlay.type === "dialogue" && !paused && (
        <section className="modal dialogue">
          {snapshot.overlay.messages.map((message, index) => (
            <p key={`${message.text}-${index}`}>
              {message.speaker && <strong>{message.speaker}: </strong>}
              {message.text}
            </p>
          ))}
          <button autoFocus onClick={closeOverlay}>Continue</button>
        </section>
      )}
      {snapshot.overlay.type === "keyAcquisition" && !paused && (
        <section className="key-acquisition" role="dialog" aria-label="Key acquired">
          <p className="eyebrow">Key Acquired</p>
          <div className="key-acquisition-list">
            {snapshot.overlay.keyIds.map((keyId) => {
              const key = handle.project.keys.find((candidate) => candidate.id === keyId);
              const sprite = key?.spriteKey ? handle.project.assets.sprites[key.spriteKey] : undefined;
              return (
                <article key={keyId}>
                  <span className="key-acquisition-icon" style={runtimeSpritePreviewStyle(sprite)} />
                  <h1>{key?.name ?? keyId}</h1>
                </article>
              );
            })}
          </div>
          <button autoFocus className="primary" onClick={closeOverlay}>Continue</button>
        </section>
      )}
      {snapshot.overlay.type === "battleConfirmation" && !paused && (
        <section className="modal dialogue" role="dialog" aria-label="Confirm battle">
          <p>{snapshot.overlay.message}</p>
          <div className="button-row">
            <button autoFocus className="primary" onClick={confirmBattle}>Start Battle</button>
            <button onClick={closeOverlay}>Cancel</button>
          </div>
        </section>
      )}
      {snapshot.overlay.type === "battle" && !paused && (
        <section className="modal battle">
          <p className="eyebrow">Battle</p>
          <h1>{snapshot.overlay.battle.enemyName}</h1>
          <div className="battle-bars">
            <span>{handle.project.player.name} HP {snapshot.overlay.battle.playerHp}</span>
            <span>Questions Left {snapshot.overlay.battle.questionsRemaining}</span>
          </div>
          <p>{snapshot.overlay.battle.prompt}</p>
          <form onSubmit={answerBattle}>
            <input value={battleAnswer} onChange={(event) => setBattleAnswer(event.target.value)} placeholder="Type the answer" autoFocus />
            <button className="primary">Answer</button>
          </form>
        </section>
      )}
      {canPause && !paused && (
        <>
          <button className="mobile-pause" onClick={() => setPaused(true)}>Pause</button>
          <TouchControls
            move={(dx, dy) => {
              handle.runtime.move(dx, dy);
              refresh();
            }}
            interact={() => {
              handle.runtime.interact();
              refresh();
            }}
          />
        </>
      )}
      {paused && (
        <PauseMenu
          confirmTitle={confirmTitle}
          project={handle.project}
          saveNotice={saveNotice}
          snapshot={snapshot}
          onCancelTitle={() => setConfirmTitle(false)}
          onConfirmTitle={returnToTitle}
          onRequestTitle={() => setConfirmTitle(true)}
          onResume={() => {
            setConfirmTitle(false);
            setPaused(false);
          }}
          onSave={saveNow}
        />
      )}
    </main>
  );
}

function WorldHud({ snapshot }: { snapshot: RuntimeSnapshot }) {
  return (
    <section className="world-hud" aria-label="World status">
      <strong>{snapshot.currentMap.name}</strong>
      <dl>
        <dt>Diary</dt>
        <dd>{snapshot.diaryEntries.length}</dd>
        <dt>Inventory</dt>
        <dd>{snapshot.inventoryKeys.length}</dd>
      </dl>
    </section>
  );
}

function BootScreen({
  error,
  latestSave,
  setError,
  loadProject
}: {
  error: string;
  latestSave?: StoredGame;
  setError: (error: string) => void;
  loadProject: (project: KitsuneProject, save?: SaveState | Version1SaveState | LegacySaveState) => void;
}) {
  return (
    <main className="boot">
      <section className="boot-panel">
        <p className="eyebrow">Kuzunoha Player</p>
        <h1>Load a learning quest</h1>
        <p>Import a Tamamo JSON project or play the bundled sample quest.</p>
        {latestSave && (
          <button className="continue-card" onClick={() => loadProject(latestSave.project, latestSave.save)}>
            <strong>Continue {latestSave.project.title}</strong>
            <span>{formatSaveTime(latestSave.save.updatedAt)}</span>
          </button>
        )}
        <div className="boot-actions">
          <button className="primary" onClick={() => loadProject(sampleProject)}>Play Sample Quest</button>
          <label className="file-button">
            Import JSON
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                file.text()
                  .then((text) => {
                    const result = validateProject(JSON.parse(text));
                    if (result.ok) loadProject(result.project);
                    else setError(result.issues.join("\n"));
                  })
                  .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load file."));
              }}
            />
          </label>
        </div>
        {error && <pre className="error">{error}</pre>}
      </section>
    </main>
  );
}

function GameCanvas({
  runtimeRef,
  inputEnabledRef,
  onRuntimeChange,
  project
}: {
  runtimeRef: React.MutableRefObject<GameRuntime | undefined>;
  inputEnabledRef: React.MutableRefObject<boolean>;
  onRuntimeChange: () => void;
  project: KitsuneProject;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const scene = new WorldScene(runtimeRef, inputEnabledRef, onRuntimeChange, project);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: "#111715",
      width: 960,
      height: 640,
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene
    });

    return () => {
      game.destroy(true);
    };
  }, [project.id, project.version, runtimeRef, inputEnabledRef, onRuntimeChange]);

  return <div ref={containerRef} className="game-canvas" />;
}

class WorldScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private player?: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite;
  private lastMoveAt = 0;
  private renderedMapId = "";
  private entityViews: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly runtimeRef: React.MutableRefObject<GameRuntime | undefined>,
    private readonly inputEnabledRef: React.MutableRefObject<boolean>,
    private readonly onRuntimeChange: () => void,
    private readonly project: KitsuneProject
  ) {
    super("world");
  }

  preload() {
    for (const tileset of Object.values(this.project.assets.tilesets)) {
      if (isRenderableTileset(tileset)) {
        this.load.spritesheet(tilesetTextureKey(tileset.key), tileset.image, {
          frameWidth: tileset.tileSize,
          frameHeight: tileset.tileSize
        });
      }
    }

    for (const sprite of Object.values(this.project.assets.sprites)) {
      if (isRenderableSprite(sprite)) {
        this.load.spritesheet(spriteTextureKey(sprite.key), sprite.image, {
          frameWidth: sprite.frameWidth,
          frameHeight: sprite.frameHeight
        });
      }
    }
  }

  create() {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.removeCapture(["W", "A", "S", "D"]);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.configureCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.configureCamera, this);
    });
    this.renderWorld();
  }

  update(time: number) {
    const runtime = this.runtimeRef.current;
    if (!runtime) return;
    const snapshot = runtime.snapshot();
    if (snapshot.mapId !== this.renderedMapId) {
      this.renderWorld();
    }
    this.syncPlayer();

    if (!this.inputEnabledRef.current || isTextInput(document.activeElement) || snapshot.overlay.type !== "none") return;

    const moveCooldown = time - this.lastMoveAt > 145;
    if (moveCooldown) {
      const moved =
        this.isDown("left", "A") ? runtime.move(-1, 0) :
        this.isDown("right", "D") ? runtime.move(1, 0) :
        this.isDown("up", "W") ? runtime.move(0, -1) :
        this.isDown("down", "S") ? runtime.move(0, 1) :
        false;
      if (moved) {
        this.lastMoveAt = time;
        this.onRuntimeChange();
      }
    }
  }

  private isDown(cursor: keyof Phaser.Types.Input.Keyboard.CursorKeys, key: string): boolean {
    return Boolean(this.cursors?.[cursor]?.isDown || this.keys?.[key]?.isDown);
  }

  private renderWorld() {
    const runtime = this.runtimeRef.current;
    if (!runtime) return;
    this.children.removeAll(true);
    const snapshot = runtime.snapshot();
    const map = snapshot.currentMap;
    const fallbackTileset = tilesetForMap(this.project, map);
    this.renderedMapId = map.id;

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const tile = map.layers.ground.tiles[y][x];
        const decor = map.layers.decor.tiles[y][x];
        this.add.rectangle(x * map.tileSize, y * map.tileSize, map.tileSize, map.tileSize, 0x111715).setOrigin(0);
        this.renderTile(resolveTile(this.project, fallbackTileset, tile), x, y, map.tileSize);
        if (tileNumber(decor) > 0) {
          this.renderTile(resolveTile(this.project, fallbackTileset, decor), x, y, map.tileSize, 0.92);
        }
      }
    }

    this.entityViews = map.entities.map((entity) => {
      const view = this.renderEntity(entity, map.tileSize);
      return view;
    });

    this.player = this.renderPlayer(map.tileSize);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.syncPlayer();
    this.configureCamera();
  }

  private configureCamera() {
    const runtime = this.runtimeRef.current;
    if (!runtime) return;
    const map = runtime.currentMap();
    const camera = this.cameras.main;
    const mapWidth = map.width * map.tileSize;
    const mapHeight = map.height * map.tileSize;
    const offsetX = Math.min(0, (mapWidth - camera.width) / 2);
    const offsetY = Math.min(0, (mapHeight - camera.height) / 2);
    camera.setBounds(offsetX, offsetY, Math.max(mapWidth, camera.width), Math.max(mapHeight, camera.height));
  }

  private renderTile(tile: ResolvedTile, x: number, y: number, tileSize: number, alpha = 1) {
    if (tile.value <= 0) return;
    const { tileset } = tile;
    if (!isRenderableTileset(tileset)) {
      this.add.rectangle(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1, tileColor(tile.value)).setOrigin(0);
      return;
    }

    const sprite = this.add.image(x * tileSize, y * tileSize, tilesetTextureKey(tileset.key), tile.value - 1).setOrigin(0).setAlpha(alpha);
    sprite.setScale(tileSize / tileset.tileSize);
  }

  private renderEntity(entity: Entity, tileSize: number): Phaser.GameObjects.GameObject {
    const sprite = entity.spriteKey ? this.project.assets.sprites[entity.spriteKey] : undefined;
    const x = entity.position.x * tileSize + tileSize / 2;
    const y = entity.position.y * tileSize + tileSize / 2;

    if (isRenderableSprite(sprite)) {
      const view = this.add.sprite(x, y, spriteTextureKey(sprite.key), sprite.frame);
      view.setScale(tileSize / Math.max(sprite.frameWidth, sprite.frameHeight));
      return view;
    }

    const view = this.add.rectangle(x, y, 22, 22, entityColor(entity.kind)).setStrokeStyle(2, 0x111715);
    this.add.text(x - 7, y - 8, entity.kind[0].toUpperCase(), {
      color: "#111715",
      fontSize: "13px",
      fontFamily: "monospace"
    });
    return view;
  }

  private renderPlayer(tileSize: number): Phaser.GameObjects.Rectangle | Phaser.GameObjects.Sprite {
    const hero = this.project.player.spriteKey ? this.project.assets.sprites[this.project.player.spriteKey] : undefined;
    if (isRenderableSprite(hero)) {
      const view = this.add.sprite(0, 0, spriteTextureKey(hero.key), hero.frame);
      view.setScale(tileSize / Math.max(hero.frameWidth, hero.frameHeight));
      return view;
    }
    return this.add.rectangle(0, 0, 22, 26, 0xfff7ec).setStrokeStyle(2, 0x111715);
  }

  private syncPlayer() {
    const runtime = this.runtimeRef.current;
    if (!runtime || !this.player) return;
    const snapshot = runtime.snapshot();
    const tileSize = snapshot.currentMap.tileSize;
    this.player.setPosition(snapshot.player.x * tileSize + tileSize / 2, snapshot.player.y * tileSize + tileSize / 2);
  }
}

function PauseMenu({
  confirmTitle,
  project,
  saveNotice,
  snapshot,
  onCancelTitle,
  onConfirmTitle,
  onRequestTitle,
  onResume,
  onSave
}: {
  confirmTitle: boolean;
  project: KitsuneProject;
  saveNotice: string;
  snapshot: RuntimeSnapshot;
  onCancelTitle: () => void;
  onConfirmTitle: () => void;
  onRequestTitle: () => void;
  onResume: () => void;
  onSave: () => void;
}) {
  return (
    <section className="pause-backdrop" role="dialog" aria-modal="true" aria-label="Pause menu">
      <div className="pause-menu">
        <p className="eyebrow">Paused</p>
        <h1>{project.title}</h1>
        <p className="map-name">{snapshot.currentMap.name}</p>
        <div className="pause-actions">
          <button className="primary" autoFocus onClick={onResume}>Resume</button>
          <button onClick={onSave}>Save Game</button>
        </div>
        {saveNotice && <p className="save-notice" role="status">{saveNotice}</p>}
        <details>
          <summary>Diary ({snapshot.diaryEntries.length})</summary>
          <Diary snapshot={snapshot} />
        </details>
        <details>
          <summary>Inventory ({snapshot.inventoryKeys.length})</summary>
          <Inventory project={project} snapshot={snapshot} />
        </details>
        <details>
          <summary>Controls</summary>
          <dl className="controls-list">
            <dt>Move</dt><dd>Arrow keys or WASD</dd>
            <dt>Interact</dt><dd>Space or Enter</dd>
            <dt>Pause</dt><dd>Escape</dd>
          </dl>
        </details>
        {!confirmTitle ? (
          <button className="danger" onClick={onRequestTitle}>Return to Title</button>
        ) : (
          <div className="confirm-title">
            <p>Return to title? Unsaved progress will be lost.</p>
            <button className="danger" onClick={onConfirmTitle}>Return to Title</button>
            <button onClick={onCancelTitle}>Cancel</button>
          </div>
        )}
      </div>
    </section>
  );
}

function Inventory({ project, snapshot }: { project: KitsuneProject; snapshot: RuntimeSnapshot }) {
  return (
    <div className="inventory">
      {snapshot.inventoryKeys.length === 0 ? (
        <p>No keys collected yet.</p>
      ) : (
        snapshot.inventoryKeys.map((key) => (
          <article key={key.id}>
            <span className="inventory-icon" style={runtimeSpritePreviewStyle(key.spriteKey ? project.assets.sprites[key.spriteKey] : undefined)} />
            <strong>{key.name}</strong>
          </article>
        ))
      )}
    </div>
  );
}

function Diary({ snapshot }: { snapshot: RuntimeSnapshot }) {
  return (
    <div className="diary">
      {snapshot.diaryEntries.length === 0 ? (
        <p>No knowledge collected yet.</p>
      ) : (
        snapshot.diaryEntries.map((entry) => (
          <article key={entry.id}>
            <strong>{entry.title}</strong>
            {entry.imageUrl && <img className="knowledge-image" src={entry.imageUrl} alt={entry.imageAlt || entry.title} />}
            <p>{entry.summary}</p>
          </article>
        ))
      )}
    </div>
  );
}

function TouchControls({ move, interact }: { move: (dx: number, dy: number) => void; interact: () => void }) {
  return (
    <nav className="touch-controls" aria-label="Touch controls">
      <button onClick={() => move(0, -1)}>Up</button>
      <div>
        <button onClick={() => move(-1, 0)}>Left</button>
        <button onClick={interact}>Act</button>
        <button onClick={() => move(1, 0)}>Right</button>
      </div>
      <button onClick={() => move(0, 1)}>Down</button>
    </nav>
  );
}

function persistGame(handle: RuntimeHandle): { ok: true; stored: StoredGame } | { ok: false; message: string } {
  const stored: StoredGame = {
    storageVersion: 1,
    project: handle.project,
    save: handle.runtime.saveState()
  };
  try {
    localStorage.setItem(createSaveKey(handle.project), JSON.stringify(stored.save));
    localStorage.setItem(LATEST_SAVE_KEY, JSON.stringify(stored));
    return { ok: true, stored };
  } catch (caught) {
    return {
      ok: false,
      message: caught instanceof Error ? `Could not save: ${caught.message}` : "Could not save in this browser."
    };
  }
}

function loadLatestSave(): StoredGame | undefined {
  try {
    const raw = localStorage.getItem(LATEST_SAVE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredGame>;
    if (parsed.storageVersion !== 1 || !parsed.project || !parsed.save) return undefined;
    const result = validateProject(parsed.project);
    if (!result.ok || !isSaveForProject(parsed.save, result.project)) return undefined;
    return { storageVersion: 1, project: result.project, save: parsed.save };
  } catch {
    return undefined;
  }
}

function isSaveForProject(save: SaveState | Version1SaveState | LegacySaveState, project: KitsuneProject): boolean {
  if (
    save.projectId !== project.id ||
    save.projectVersion !== project.version ||
    !project.maps.some((map) => map.id === save.mapId) ||
    !Number.isInteger(save.player?.x) ||
    !Number.isInteger(save.player?.y) ||
    typeof save.flags !== "object" ||
    save.flags === null ||
    !Array.isArray(save.diary) ||
    !save.diary.every((id) => project.knowledge.some((entry) => entry.id === id)) ||
    typeof save.updatedAt !== "string"
  ) {
    return false;
  }

  if (!("saveVersion" in save)) return true;
  if (!Array.isArray(save.battleQuestionQueue) || !isRuntimeOverlay(save.overlay)) return false;
  if (!save.battleQuestionQueue.every((id) => project.knowledge.some((entry) => entry.id === id))) return false;
  if (save.saveVersion === 1) return true;
  return save.saveVersion === 2 &&
    Array.isArray(save.inventoryKeyIds) &&
    save.inventoryKeyIds.every((id) => project.keys.some((key) => key.id === id));
}

function isRuntimeOverlay(overlay: SaveState["overlay"]): boolean {
  if (!overlay || typeof overlay !== "object") return false;
  if (overlay.type === "none") return true;
  if (overlay.type === "dialogue") {
    return Array.isArray(overlay.messages) &&
      overlay.messages.every((message) => typeof message?.text === "string") &&
      (!overlay.nextOverlay || isRuntimeOverlay(overlay.nextOverlay));
  }
  if (overlay.type === "keyAcquisition") {
    return Array.isArray(overlay.keyIds) &&
      overlay.keyIds.every((id) => typeof id === "string") &&
      isRuntimeOverlay(overlay.nextOverlay);
  }
  if (overlay.type === "battleConfirmation") {
    return typeof overlay.battleId === "string" && typeof overlay.message === "string";
  }
  return overlay.type === "battle" &&
    typeof overlay.battle?.battleId === "string" &&
    typeof overlay.battle?.prompt === "string" &&
    typeof overlay.battle?.answer === "string" &&
    typeof overlay.battle?.knowledgeId === "string";
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

function formatSaveTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Saved game" : `Saved ${date.toLocaleString()}`;
}

function findNearbyEntity(snapshot: RuntimeSnapshot): Entity | undefined {
  const positions = [
    snapshot.player,
    { x: snapshot.player.x, y: snapshot.player.y - 1 },
    { x: snapshot.player.x + 1, y: snapshot.player.y },
    { x: snapshot.player.x, y: snapshot.player.y + 1 },
    { x: snapshot.player.x - 1, y: snapshot.player.y }
  ];
  return snapshot.currentMap.entities.find((entity) => positions.some((position) => position.x === entity.position.x && position.y === entity.position.y));
}

function tileColor(tile: number): number {
  if (tile === 2) return 0xd2aa51;
  if (tile === 3) return 0x3e7b91;
  if (tile === 4) return 0x777b72;
  return 0x4f7b52;
}

function entityColor(kind: Entity["kind"]): number {
  if (kind === "npc") return 0xf2c14e;
  if (kind === "door") return 0xb66d35;
  if (kind === "trigger") return 0xd45757;
  return 0xd7ede4;
}

function tilesetForMap(project: KitsuneProject, map: KitsuneMap): TilesetAsset | undefined {
  if (map.tilesetKey) return project.assets.tilesets[map.tilesetKey];
  return Object.values(project.assets.tilesets)[0];
}

type ResolvedTile = {
  tileset?: TilesetAsset;
  value: number;
};

function resolveTile(project: KitsuneProject, fallbackTileset: TilesetAsset | undefined, tile: TileValue): ResolvedTile {
  if (typeof tile === "number") return { tileset: fallbackTileset, value: tile };
  return { tileset: project.assets.tilesets[tile.tilesetKey] ?? fallbackTileset, value: tile.tile };
}

function tileNumber(tile: TileValue): number {
  return typeof tile === "number" ? tile : tile.tile;
}

function isRenderableTileset(tileset: TilesetAsset | undefined): tileset is TilesetAsset & { image: string; tileSize: number; columns: number } {
  return Boolean(tileset?.image && tileset.tileSize && tileset.columns);
}

function isRenderableSprite(sprite: SpriteAsset | undefined): sprite is SpriteAsset & { image: string; frameWidth: number; frameHeight: number; frame: number } {
  return Boolean(sprite?.image && sprite.frameWidth && sprite.frameHeight && sprite.frame !== undefined);
}

function tilesetTextureKey(key: string): string {
  return `tileset:${key}`;
}

function spriteTextureKey(key: string): string {
  return `sprite:${key}`;
}

function runtimeSpritePreviewStyle(sprite: SpriteAsset | undefined): React.CSSProperties | undefined {
  if (!sprite?.image || sprite.frame === undefined || !sprite.columns || !sprite.rows) return undefined;
  const column = sprite.frame % sprite.columns;
  const row = Math.floor(sprite.frame / sprite.columns);
  return {
    backgroundImage: `url("${sprite.image}")`,
    backgroundSize: `${sprite.columns * 100}% ${sprite.rows * 100}%`,
    backgroundPosition: `${sprite.columns > 1 ? column / (sprite.columns - 1) * 100 : 0}% ${sprite.rows > 1 ? row / (sprite.rows - 1) * 100 : 0}%`
  };
}

createRoot(document.getElementById("root")!).render(<App />);
