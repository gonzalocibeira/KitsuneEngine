import React from "react";
import { createRoot } from "react-dom/client";
import { sampleProject } from "@kitsune/schema/sampleProject";
import {
  serializeProject,
  validateProject,
  type Entity,
  type EventCommand,
  type KitsuneMap,
  type KitsuneProject,
  type KnowledgeEntry,
  type SpriteAsset,
  type TilesetAsset,
  type TileValue
} from "@kitsune/schema";
import "./styles.css";

const draftKey = "tamamo:draft";
const entityKinds: Entity["kind"][] = ["npc", "object", "door", "trigger"];

type EditorLayer = "ground" | "decor" | "collision";
type ToolMode = "paint" | "entity";

function App() {
  const [project, setProject] = React.useState<KitsuneProject>(sampleProject);
  const [selectedMapId, setSelectedMapId] = React.useState(sampleProject.start.mapId);
  const [layer, setLayer] = React.useState<EditorLayer>("ground");
  const [tileValue, setTileValue] = React.useState(1);
  const [brushTilesetKey, setBrushTilesetKey] = React.useState(sampleProject.maps[0].tilesetKey ?? Object.keys(sampleProject.assets.tilesets)[0] ?? "");
  const [mode, setMode] = React.useState<ToolMode>("paint");
  const [entityKind, setEntityKind] = React.useState<Entity["kind"]>("object");
  const [selectedEntityId, setSelectedEntityId] = React.useState(sampleProject.maps[0].entities[0]?.id ?? "");
  const [notice, setNotice] = React.useState("Sample quest loaded.");

  const selectedMap = project.maps.find((map) => map.id === selectedMapId) ?? project.maps[0];
  const tilesetOptions = Object.values(project.assets.tilesets);
  const fallbackTileset = tilesetForMap(project, selectedMap);
  const brushTileset = project.assets.tilesets[brushTilesetKey] ?? fallbackTileset;
  const tilePalette = tilePaletteValues(brushTileset);
  const selectedEntity = selectedMap.entities.find((entity) => entity.id === selectedEntityId);
  const validation = validateProject(project);

  function updateProject(updater: (project: KitsuneProject) => KitsuneProject) {
    setProject((current) => updater(structuredClone(current)));
  }

  function updateSelectedMap(updater: (map: typeof selectedMap) => void) {
    updateProject((draft) => {
      const map = draft.maps.find((candidate) => candidate.id === selectedMap.id);
      if (map) updater(map);
      return draft;
    });
  }

  function updateSelectedEntity(updater: (entity: Entity) => void) {
    updateSelectedMap((map) => {
      const entity = map.entities.find((candidate) => candidate.id === selectedEntityId);
      if (entity) updater(entity);
    });
  }

  function onCellClick(x: number, y: number) {
    if (mode === "paint") {
      updateSelectedMap((map) => {
        map.layers[layer].tiles[y][x] = paintedTileValue(layer, brushTileset, tileValue);
      });
      return;
    }

    const id = `${entityKind}-${Date.now().toString(36)}`;
    const entity: Entity = {
      id,
      name: `New ${entityKind}`,
      kind: entityKind,
      position: { x, y },
      spriteKey: entityKind,
      event: defaultEvent(entityKind, project)
    };
    updateSelectedMap((map) => {
      map.entities.push(entity);
    });
    setSelectedEntityId(id);
  }

  function saveDraft() {
    localStorage.setItem(draftKey, serializeProject(project));
    setNotice("Draft saved in this browser.");
  }

  function loadDraft() {
    const raw = localStorage.getItem(draftKey);
    if (!raw) {
      setNotice("No Tamamo draft found.");
      return;
    }
    loadJson(raw, "Draft loaded.");
  }

  function loadJson(raw: string, successMessage: string) {
    try {
      const parsed = JSON.parse(raw);
      const result = validateProject(parsed);
      if (!result.ok) {
        setNotice(`Import rejected: ${result.issues[0]}`);
        return;
      }
      setProject(result.project);
      setSelectedMapId(result.project.start.mapId);
      setSelectedEntityId(result.project.maps[0].entities[0]?.id ?? "");
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not parse JSON.");
    }
  }

  function exportJson() {
    const blob = new Blob([serializeProject(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.id}.kitsune.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Project exported as JSON.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tamamo Maker</p>
          <input
            className="title-input"
            value={project.title}
            onChange={(event) =>
              updateProject((draft) => {
                draft.title = event.target.value;
                return draft;
              })
            }
          />
        </div>
        <div className="actions">
          <button onClick={() => setProject(sampleProject)}>Sample</button>
          <button onClick={saveDraft}>Save Draft</button>
          <button onClick={loadDraft}>Load Draft</button>
          <label className="file-button">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) file.text().then((text) => loadJson(text, "Project imported."));
              }}
            />
          </label>
          <button className="primary" onClick={exportJson} disabled={!validation.ok}>
            Export JSON
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel left-panel">
          <h2>Project</h2>
          <label>
            Project ID
            <input
              value={project.id}
              onChange={(event) =>
                updateProject((draft) => {
                  draft.id = slug(event.target.value);
                  return draft;
                })
              }
            />
          </label>
          <label>
            Version
            <input
              value={project.version}
              onChange={(event) =>
                updateProject((draft) => {
                  draft.version = event.target.value;
                  return draft;
                })
              }
            />
          </label>
          <label>
            Map
            <select
              value={selectedMap.id}
              onChange={(event) => {
                const nextMap = project.maps.find((map) => map.id === event.target.value);
                setSelectedMapId(event.target.value);
                setBrushTilesetKey(nextMap?.tilesetKey ?? Object.keys(project.assets.tilesets)[0] ?? "");
              }}
            >
              {project.maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </label>

          <div className="segmented">
            <button className={mode === "paint" ? "active" : ""} onClick={() => setMode("paint")}>
              Paint
            </button>
            <button className={mode === "entity" ? "active" : ""} onClick={() => setMode("entity")}>
              Entity
            </button>
          </div>

          {mode === "paint" ? (
            <>
              <label>
                Layer
                <select value={layer} onChange={(event) => setLayer(event.target.value as EditorLayer)}>
                  <option value="ground">Ground</option>
                  <option value="decor">Decor</option>
                  <option value="collision">Collision</option>
                </select>
              </label>
              <label>
                Paint Tileset
                <select
                  value={brushTileset?.key ?? ""}
                  onChange={(event) => {
                    const nextTileset = project.assets.tilesets[event.target.value];
                    setBrushTilesetKey(event.target.value);
                    setTileValue(tilePaletteValues(nextTileset)[1] ?? 0);
                  }}
                >
                  {tilesetOptions.map((tileset) => (
                    <option key={tileset.key} value={tileset.key}>
                      {tileset.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="swatches">
                {tilePalette.map((value) => (
                  <button
                    key={value}
                    className={tileValue === value ? "active" : ""}
                    onClick={() => setTileValue(value)}
                    title={tileLabel(brushTileset, value)}
                    aria-label={tileLabel(brushTileset, value)}
                  >
                    <span className={`tile-swatch tile-${value}`} style={tilePreviewStyle(brushTileset, value)} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <label>
              Entity Kind
              <select value={entityKind} onChange={(event) => setEntityKind(event.target.value as Entity["kind"])}>
                {entityKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
          )}

          <ValidationPanel validation={validation} notice={notice} />
        </aside>

        <section className="map-stage" aria-label="Tile map editor">
          <div
            className="tile-grid"
            style={{ gridTemplateColumns: `repeat(${selectedMap.width}, 34px)` }}
          >
            {selectedMap.layers.ground.tiles.map((row, y) =>
              row.map((groundTile, x) => {
                const decorTile = selectedMap.layers.decor.tiles[y][x];
                const blocked = tileNumber(selectedMap.layers.collision.tiles[y][x]) > 0;
                const entity = selectedMap.entities.find((candidate) => candidate.position.x === x && candidate.position.y === y);
                const sprite = entity?.spriteKey ? project.assets.sprites[entity.spriteKey] : undefined;
                return (
                  <button
                    key={`${x}-${y}`}
                    className={`cell ${blocked ? "blocked" : ""} ${selectedEntityId === entity?.id ? "selected" : ""}`}
                    style={tileCellPreviewStyle(project, selectedMap, groundTile)}
                    onClick={() => (entity && mode === "entity" ? setSelectedEntityId(entity.id) : onCellClick(x, y))}
                    title={`${x}, ${y}`}
                  >
                    {tileNumber(decorTile) > 0 && <span className="decor" style={tileCellPreviewStyle(project, selectedMap, decorTile)} />}
                    {entity && (
                      <span className={`entity-dot ${entity.kind} ${isPreviewableSprite(sprite) ? "sprite" : ""}`} style={spritePreviewStyle(sprite)}>
                        {!isPreviewableSprite(sprite) && entity.kind[0].toUpperCase()}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="panel right-panel">
          <EntityPanel
            entity={selectedEntity}
            project={project}
            updateProject={updateProject}
            onSelect={setSelectedEntityId}
            entities={selectedMap.entities}
            updateEntity={updateSelectedEntity}
            deleteEntity={() => {
              updateSelectedMap((map) => {
                map.entities = map.entities.filter((entity) => entity.id !== selectedEntityId);
              });
              setSelectedEntityId("");
            }}
          />
          <ContentPanel project={project} updateProject={updateProject} />
        </aside>
      </section>
    </main>
  );
}

function ValidationPanel({ validation, notice }: { validation: ReturnType<typeof validateProject>; notice: string }) {
  return (
    <section className="validation">
      <h2>Validation</h2>
      <p className={validation.ok ? "valid" : "invalid"}>{validation.ok ? "Project is export-ready." : `${validation.issues.length} issue(s)`}</p>
      {!validation.ok && validation.issues.slice(0, 5).map((issue) => <p key={issue} className="issue">{issue}</p>)}
      <p className="notice">{notice}</p>
    </section>
  );
}

function EntityPanel({
  entity,
  entities,
  project,
  updateProject,
  onSelect,
  updateEntity,
  deleteEntity
}: {
  entity?: Entity;
  entities: Entity[];
  project: KitsuneProject;
  updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void;
  onSelect: (id: string) => void;
  updateEntity: (updater: (entity: Entity) => void) => void;
  deleteEntity: () => void;
}) {
  const [spritePickerOpen, setSpritePickerOpen] = React.useState(false);
  const [spriteTilesetKey, setSpriteTilesetKey] = React.useState(Object.keys(project.assets.tilesets)[0] ?? "");
  const currentSprite = entity?.spriteKey ? project.assets.sprites[entity.spriteKey] : undefined;
  const tilesets = Object.values(project.assets.tilesets);
  const spriteTileset = project.assets.tilesets[spriteTilesetKey] ?? tilesets[0];

  function openSpritePicker() {
    setSpriteTilesetKey(tilesetKeyForSprite(project, currentSprite) ?? tilesets[0]?.key ?? "");
    setSpritePickerOpen(true);
  }

  function setSpriteFromTileset(tileset: TilesetAsset, frame: number) {
    if (!entity || !isPreviewableTileset(tileset)) return;
    const key = `sprite-${tileset.key}-${frame + 1}`;
    updateProject((draft) => {
      if (!draft.assets.sprites[key]) {
        draft.assets.sprites[key] = {
          key,
          label: `${tileset.label} frame ${frame + 1}`,
          image: tileset.image,
          frameWidth: tileset.tileSize ?? 16,
          frameHeight: tileset.tileSize ?? 16,
          frame,
          columns: tileset.columns,
          rows: tileset.rows
        };
      }

      for (const map of draft.maps) {
        const target = map.entities.find((candidate) => candidate.id === entity.id);
        if (target) target.spriteKey = key;
      }

      return draft;
    });
    setSpritePickerOpen(false);
  }

  function clearSprite() {
    updateEntity((draft) => {
      delete draft.spriteKey;
    });
  }

  return (
    <section>
      <h2>Entities</h2>
      <select value={entity?.id ?? ""} onChange={(event) => onSelect(event.target.value)}>
        <option value="">Select entity</option>
        {entities.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name} ({candidate.kind})
          </option>
        ))}
      </select>
      {entity ? (
        <div className="stack">
          <label>
            Name
            <input value={entity.name} onChange={(event) => updateEntity((draft) => { draft.name = event.target.value; })} />
          </label>
          <label>
            Kind
            <select value={entity.kind} onChange={(event) => updateEntity((draft) => { draft.kind = event.target.value as Entity["kind"]; })}>
              {entityKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
          <label>
            Sprite
            <div className="sprite-field">
              <span className="sprite-preview" style={spritePreviewStyle(currentSprite)} />
              <button type="button" onClick={openSpritePicker}>Choose Sprite</button>
              <button type="button" onClick={clearSprite}>Clear</button>
            </div>
          </label>
          {spritePickerOpen && (
            <div className="sprite-modal-backdrop" role="presentation">
              <section className="sprite-modal" role="dialog" aria-modal="true" aria-label="Choose entity sprite">
                <header>
                  <h2>Choose Sprite</h2>
                  <button type="button" onClick={() => setSpritePickerOpen(false)} aria-label="Close sprite picker">Close</button>
                </header>
                <div className="sprite-modal-body">
                  <label className="tileset-switcher">
                    Tileset
                    <select value={spriteTileset?.key ?? ""} onChange={(event) => setSpriteTilesetKey(event.target.value)}>
                      {tilesets.map((tileset) => (
                        <option key={tileset.key} value={tileset.key}>
                          {tileset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {spriteTileset && (
                    <section>
                      <h3>{spriteTileset.label}</h3>
                      <div className="sprite-frame-grid">
                        {tilePaletteValues(spriteTileset).filter((value) => value > 0).map((value) => {
                          const frame = value - 1;
                          const active = Boolean(currentSprite && currentSprite.image === spriteTileset.image && currentSprite.frame === frame);
                          return (
                            <button
                              key={`${spriteTileset.key}-${frame}`}
                              type="button"
                              className={active ? "active" : ""}
                              onClick={() => setSpriteFromTileset(spriteTileset, frame)}
                              title={`${spriteTileset.label} frame ${value}`}
                              aria-label={`${spriteTileset.label} frame ${value}`}
                            >
                              <span className="sprite-choice-preview" style={tilePreviewStyle(spriteTileset, value)} />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              </section>
            </div>
          )}
          <div className="coord-row">
            <label>
              X
              <input type="number" value={entity.position.x} onChange={(event) => updateEntity((draft) => { draft.position.x = Number(event.target.value); })} />
            </label>
            <label>
              Y
              <input type="number" value={entity.position.y} onChange={(event) => updateEntity((draft) => { draft.position.y = Number(event.target.value); })} />
            </label>
          </div>
          <EventEditor project={project} commands={entity.event} updateCommands={(commands) => updateEntity((draft) => { draft.event = commands; })} />
          <button className="danger" onClick={deleteEntity}>Delete Entity</button>
        </div>
      ) : (
        <p className="muted">Place or select an entity on the map.</p>
      )}
    </section>
  );
}

function EventEditor({
  commands,
  project,
  updateCommands
}: {
  commands: EventCommand[];
  project: KitsuneProject;
  updateCommands: (commands: EventCommand[]) => void;
}) {
  function updateAt(index: number, updater: (command: EventCommand) => EventCommand) {
    updateCommands(commands.map((command, current) => (current === index ? updater(command) : command)));
  }

  return (
    <section className="event-editor">
      <h3>Event Blocks</h3>
      {commands.map((command, index) => (
        <div className="event-block" key={`${command.type}-${index}`}>
          <strong>{command.type}</strong>
          {command.type === "dialogue" && (
            <>
              <input placeholder="Speaker" value={command.speaker ?? ""} onChange={(event) => updateAt(index, (draft) => draft.type === "dialogue" ? { ...draft, speaker: event.target.value } : draft)} />
              <textarea value={command.text} onChange={(event) => updateAt(index, (draft) => draft.type === "dialogue" ? { ...draft, text: event.target.value } : draft)} />
            </>
          )}
          {command.type === "grantKnowledge" && (
            <select value={command.knowledgeId} onChange={(event) => updateAt(index, () => ({ type: "grantKnowledge", knowledgeId: event.target.value }))}>
              {project.knowledge.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select>
          )}
          {command.type === "startBattle" && (
            <select value={command.battleId} onChange={(event) => updateAt(index, () => ({ type: "startBattle", battleId: event.target.value }))}>
              {project.battles.map((battle) => <option key={battle.id} value={battle.id}>{battle.name}</option>)}
            </select>
          )}
          {command.type === "transferMap" && (
            <div className="coord-row">
              <select value={command.mapId} onChange={(event) => updateAt(index, (draft) => draft.type === "transferMap" ? { ...draft, mapId: event.target.value } : draft)}>
                {project.maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
              </select>
              <input value={command.spawnId} onChange={(event) => updateAt(index, (draft) => draft.type === "transferMap" ? { ...draft, spawnId: event.target.value } : draft)} />
            </div>
          )}
          <button onClick={() => updateCommands(commands.filter((_, current) => current !== index))}>Remove</button>
        </div>
      ))}
      <div className="button-row">
        <button onClick={() => updateCommands([...commands, { type: "dialogue", text: "New dialogue." }])}>Dialogue</button>
        <button onClick={() => updateCommands([...commands, { type: "grantKnowledge", knowledgeId: project.knowledge[0]?.id ?? "" }])}>Knowledge</button>
        <button onClick={() => updateCommands([...commands, { type: "startBattle", battleId: project.battles[0]?.id ?? "" }])}>Battle</button>
      </div>
    </section>
  );
}

function ContentPanel({ project, updateProject }: { project: KitsuneProject; updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void }) {
  function updateKnowledge(index: number, updater: (entry: KnowledgeEntry) => void) {
    updateProject((draft) => {
      updater(draft.knowledge[index]);
      return draft;
    });
  }

  return (
    <section className="content-panel">
      <h2>Knowledge</h2>
      {project.knowledge.map((entry, index) => (
        <details key={entry.id}>
          <summary>{entry.title}</summary>
          <label>Title<input value={entry.title} onChange={(event) => updateKnowledge(index, (draft) => { draft.title = event.target.value; })} /></label>
          <label>Prompt<input value={entry.prompt} onChange={(event) => updateKnowledge(index, (draft) => { draft.prompt = event.target.value; })} /></label>
          <label>Answer<input value={entry.answer} onChange={(event) => updateKnowledge(index, (draft) => { draft.answer = event.target.value; })} /></label>
          <label>Body<textarea value={entry.body} onChange={(event) => updateKnowledge(index, (draft) => { draft.body = event.target.value; })} /></label>
        </details>
      ))}
      <button
        onClick={() =>
          updateProject((draft) => {
            draft.knowledge.push({
              id: `knowledge-${Date.now().toString(36)}`,
              title: "New Knowledge",
              summary: "Short summary",
              prompt: "What is the answer?",
              answer: "Answer",
              body: "Detailed note.",
              tags: []
            });
            return draft;
          })
        }
      >
        Add Knowledge
      </button>

      <h2>Battles</h2>
      {project.battles.map((battle) => (
        <details key={battle.id}>
          <summary>{battle.name}</summary>
          <p className="muted">Enemy: {battle.enemyName}</p>
          <p className="muted">Knowledge: {battle.requiredKnowledgeIds.join(", ")}</p>
          <p className="muted">Victory flag: {battle.victoryFlag}</p>
        </details>
      ))}
    </section>
  );
}

function defaultEvent(kind: Entity["kind"], project: KitsuneProject): EventCommand[] {
  if (kind === "door") return [{ type: "transferMap", mapId: project.start.mapId, spawnId: project.start.spawnId }];
  if (kind === "trigger") return [{ type: "startBattle", battleId: project.battles[0]?.id ?? "" }];
  if (kind === "object") return [{ type: "grantKnowledge", knowledgeId: project.knowledge[0]?.id ?? "" }];
  return [{ type: "dialogue", speaker: "NPC", text: "New dialogue." }];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "project";
}

function tilesetForMap(project: KitsuneProject, map: KitsuneMap): TilesetAsset | undefined {
  if (map.tilesetKey) return project.assets.tilesets[map.tilesetKey];
  return Object.values(project.assets.tilesets)[0];
}

function tilesetKeyForSprite(project: KitsuneProject, sprite: SpriteAsset | undefined): string | undefined {
  if (!sprite?.image) return undefined;
  return Object.values(project.assets.tilesets).find((tileset) => tileset.image === sprite.image)?.key;
}

function tilePreviewStyle(tileset: TilesetAsset | undefined, tileValue: number): React.CSSProperties | undefined {
  if (tileValue <= 0 || !isPreviewableTileset(tileset)) return undefined;
  return framePreviewStyle({
    image: tileset.image,
    frame: tileValue - 1,
    columns: tileset.columns,
    rows: tileset.rows
  });
}

function tileCellPreviewStyle(project: KitsuneProject, map: KitsuneMap, tile: TileValue): React.CSSProperties | undefined {
  const resolved = resolveTile(project, map, tile);
  return tilePreviewStyle(resolved.tileset, resolved.value);
}

function paintedTileValue(layer: EditorLayer, tileset: TilesetAsset | undefined, value: number): TileValue {
  if (layer === "collision" || value === 0 || !tileset) return value;
  return { tilesetKey: tileset.key, tile: value };
}

function resolveTile(project: KitsuneProject, map: KitsuneMap, tile: TileValue): { tileset?: TilesetAsset; value: number } {
  if (typeof tile === "number") return { tileset: tilesetForMap(project, map), value: tile };
  return { tileset: project.assets.tilesets[tile.tilesetKey] ?? tilesetForMap(project, map), value: tile.tile };
}

function tileNumber(tile: TileValue): number {
  return typeof tile === "number" ? tile : tile.tile;
}

function tilePaletteValues(tileset: TilesetAsset | undefined): number[] {
  if (!tileset?.columns || !tileset.rows) return [0, 1, 2, 3, 4];
  return Array.from({ length: tileset.columns * tileset.rows + 1 }, (_, value) => value);
}

function tileLabel(tileset: TilesetAsset | undefined, value: number): string {
  if (value === 0) return "Empty";
  return `${tileset?.label ?? "Tile"} ${value}`;
}

function spritePreviewStyle(sprite: SpriteAsset | undefined): React.CSSProperties | undefined {
  if (!isPreviewableSprite(sprite)) return undefined;
  return framePreviewStyle(sprite);
}

function framePreviewStyle(asset: { image: string; frame: number; columns: number; rows: number }): React.CSSProperties {
  const column = asset.frame % asset.columns;
  const row = Math.floor(asset.frame / asset.columns);
  const x = asset.columns > 1 ? (column / (asset.columns - 1)) * 100 : 0;
  const y = asset.rows > 1 ? (row / (asset.rows - 1)) * 100 : 0;

  return {
    backgroundImage: `url(${asset.image})`,
    backgroundSize: `${asset.columns * 100}% ${asset.rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: "no-repeat"
  };
}

function isPreviewableTileset(tileset: TilesetAsset | undefined): tileset is TilesetAsset & { image: string; columns: number; rows: number } {
  return Boolean(tileset?.image && tileset.columns && tileset.rows);
}

function isPreviewableSprite(sprite: SpriteAsset | undefined): sprite is SpriteAsset & { image: string; frame: number; columns: number; rows: number } {
  return Boolean(sprite?.image && sprite.frame !== undefined && sprite.columns && sprite.rows);
}

createRoot(document.getElementById("root")!).render(<App />);
