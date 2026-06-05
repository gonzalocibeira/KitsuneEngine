import React from "react";
import { createRoot } from "react-dom/client";
import Phaser from "phaser";
import { sampleProject } from "@kitsune/schema/sampleProject";
import { validateProject, type Entity, type KitsuneProject } from "@kitsune/schema";
import { createSaveKey, GameRuntime, type RuntimeSnapshot, type SaveState } from "@kitsune/runtime-core";
import "./styles.css";

type RuntimeHandle = {
  runtime: GameRuntime;
  project: KitsuneProject;
};

function App() {
  const [handle, setHandle] = React.useState<RuntimeHandle | undefined>();
  const [snapshot, setSnapshot] = React.useState<RuntimeSnapshot | undefined>();
  const [error, setError] = React.useState("");
  const [battleAnswer, setBattleAnswer] = React.useState("");
  const runtimeRef = React.useRef<GameRuntime | undefined>(undefined);

  React.useEffect(() => {
    runtimeRef.current = handle?.runtime;
    if (handle) setSnapshot(handle.runtime.snapshot());
  }, [handle]);

  function loadProject(project: KitsuneProject) {
    const save = loadSave(project);
    const runtime = new GameRuntime(project, save);
    setHandle({ runtime, project });
    setSnapshot(runtime.snapshot());
    setError("");
  }

  function refresh() {
    if (!handle) return;
    const next = handle.runtime.snapshot();
    setSnapshot(next);
    localStorage.setItem(createSaveKey(handle.project), JSON.stringify(handle.runtime.saveState()));
  }

  function closeOverlay() {
    handle?.runtime.closeOverlay();
    refresh();
  }

  function answerBattle(event: React.FormEvent) {
    event.preventDefault();
    if (!battleAnswer.trim()) return;
    handle?.runtime.answerBattle(battleAnswer);
    setBattleAnswer("");
    refresh();
  }

  if (!handle || !snapshot) {
    return <BootScreen error={error} setError={setError} loadProject={loadProject} />;
  }

  const nearby = findNearbyEntity(snapshot);

  return (
    <main className="game-shell">
      <GameCanvas runtimeRef={runtimeRef} onSnapshot={setSnapshot} project={handle.project} />
      <section className="hud top-left">
        <strong>{handle.project.title}</strong>
        <span>{snapshot.currentMap.name}</span>
      </section>
      {nearby && snapshot.overlay.type === "none" && <section className="hud prompt">Press Space to inspect {nearby.name}</section>}
      <Diary snapshot={snapshot} />
      {snapshot.overlay.type === "dialogue" && (
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
      {snapshot.overlay.type === "battle" && (
        <section className="modal battle">
          <p className="eyebrow">Battle</p>
          <h1>{snapshot.overlay.battle.enemyName}</h1>
          <div className="battle-bars">
            <span>Hero HP {snapshot.overlay.battle.playerHp}</span>
            <span>Enemy HP {snapshot.overlay.battle.enemyHp}</span>
          </div>
          <p>{snapshot.overlay.battle.prompt}</p>
          <form onSubmit={answerBattle}>
            <input value={battleAnswer} onChange={(event) => setBattleAnswer(event.target.value)} placeholder="Type the answer" autoFocus />
            <button className="primary">Answer</button>
          </form>
        </section>
      )}
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
    </main>
  );
}

function BootScreen({
  error,
  setError,
  loadProject
}: {
  error: string;
  setError: (error: string) => void;
  loadProject: (project: KitsuneProject) => void;
}) {
  return (
    <main className="boot">
      <section className="boot-panel">
        <p className="eyebrow">Kuzunoha Player</p>
        <h1>Load a learning quest</h1>
        <p>Import a Tamamo JSON project or play the bundled sample quest.</p>
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
  onSnapshot,
  project
}: {
  runtimeRef: React.MutableRefObject<GameRuntime | undefined>;
  onSnapshot: (snapshot: RuntimeSnapshot) => void;
  project: KitsuneProject;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const scene = new WorldScene(runtimeRef, onSnapshot);
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
  }, [project.id, project.version, runtimeRef, onSnapshot]);

  return <div ref={containerRef} className="game-canvas" />;
}

class WorldScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private player?: Phaser.GameObjects.Rectangle;
  private lastMoveAt = 0;
  private renderedMapId = "";
  private entityViews: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly runtimeRef: React.MutableRefObject<GameRuntime | undefined>,
    private readonly onSnapshot: (snapshot: RuntimeSnapshot) => void
  ) {
    super("world");
  }

  create() {
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D,SPACE,ENTER") as Record<string, Phaser.Input.Keyboard.Key>;
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

    if (snapshot.overlay.type !== "none") return;

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
        this.onSnapshot(runtime.snapshot());
      }
    }

    const spacePressed = this.keys?.SPACE ? Phaser.Input.Keyboard.JustDown(this.keys.SPACE) : false;
    const enterPressed = this.keys?.ENTER ? Phaser.Input.Keyboard.JustDown(this.keys.ENTER) : false;
    if (spacePressed || enterPressed) {
      runtime.interact();
      this.onSnapshot(runtime.snapshot());
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
    this.renderedMapId = map.id;

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const tile = map.layers.ground.tiles[y][x];
        const decor = map.layers.decor.tiles[y][x];
        const blocked = map.layers.collision.tiles[y][x] > 0;
        this.add.rectangle(x * map.tileSize, y * map.tileSize, map.tileSize - 1, map.tileSize - 1, tileColor(tile)).setOrigin(0);
        if (decor > 0) {
          this.add.circle(x * map.tileSize + 16, y * map.tileSize + 16, 7, decor === 3 ? 0x69b6d1 : 0xf2c14e);
        }
        if (blocked) {
          this.add.rectangle(x * map.tileSize + 16, y * map.tileSize + 16, 18, 18, 0x1c2421, 0.85).setStrokeStyle(2, 0xfff7ec);
        }
      }
    }

    this.entityViews = map.entities.map((entity) => {
      const view = this.add.rectangle(
        entity.position.x * map.tileSize + 16,
        entity.position.y * map.tileSize + 16,
        22,
        22,
        entityColor(entity.kind)
      ).setStrokeStyle(2, 0x111715);
      this.add.text(entity.position.x * map.tileSize + 9, entity.position.y * map.tileSize + 8, entity.kind[0].toUpperCase(), {
        color: "#111715",
        fontSize: "13px",
        fontFamily: "monospace"
      });
      return view;
    });

    this.player = this.add.rectangle(0, 0, 22, 26, 0xfff7ec).setStrokeStyle(2, 0x111715);
    this.cameras.main.setBounds(0, 0, map.width * map.tileSize, map.height * map.tileSize);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.syncPlayer();
  }

  private syncPlayer() {
    const runtime = this.runtimeRef.current;
    if (!runtime || !this.player) return;
    const snapshot = runtime.snapshot();
    const tileSize = snapshot.currentMap.tileSize;
    this.player.setPosition(snapshot.player.x * tileSize + 16, snapshot.player.y * tileSize + 16);
  }
}

function Diary({ snapshot }: { snapshot: RuntimeSnapshot }) {
  return (
    <details className="hud diary">
      <summary>Diary ({snapshot.diaryEntries.length})</summary>
      {snapshot.diaryEntries.length === 0 ? (
        <p>No knowledge collected yet.</p>
      ) : (
        snapshot.diaryEntries.map((entry) => (
          <article key={entry.id}>
            <strong>{entry.title}</strong>
            <p>{entry.summary}</p>
          </article>
        ))
      )}
    </details>
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

function loadSave(project: KitsuneProject): SaveState | undefined {
  const raw = localStorage.getItem(createSaveKey(project));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as SaveState;
    return parsed.projectId === project.id && parsed.projectVersion === project.version ? parsed : undefined;
  } catch {
    return undefined;
  }
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

createRoot(document.getElementById("root")!).render(<App />);
