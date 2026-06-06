import React from "react";
import { createRoot } from "react-dom/client";
import { sampleProject } from "@kitsune/schema/sampleProject";
import {
  serializeProject,
  validateProject,
  type BattleDefinition,
  type Entity,
  type EventCommand,
  type KeyDefinition,
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
type ToolMode = "paint" | "spawn";
type RightPanelTab = "entities" | "knowledge" | "battles" | "keys" | "player";
const mapLayerKeys: EditorLayer[] = ["ground", "decor", "collision"];
const rightPanelTabs: Array<{ id: RightPanelTab; label: string }> = [
  { id: "entities", label: "Entity" },
  { id: "knowledge", label: "Notes" },
  { id: "battles", label: "Battle" },
  { id: "keys", label: "Keys" },
  { id: "player", label: "Player" }
];

function App() {
  const [project, setProject] = React.useState<KitsuneProject>(sampleProject);
  const [selectedMapId, setSelectedMapId] = React.useState(sampleProject.start.mapId);
  const [layer, setLayer] = React.useState<EditorLayer>("ground");
  const [tileValue, setTileValue] = React.useState(1);
  const [brushTilesetKey, setBrushTilesetKey] = React.useState(sampleProject.maps[0].tilesetKey ?? Object.keys(sampleProject.assets.tilesets)[0] ?? "");
  const [mode, setMode] = React.useState<ToolMode>("paint");
  const [entityKind, setEntityKind] = React.useState<Entity["kind"]>("object");
  const [entityPlacementArmed, setEntityPlacementArmed] = React.useState(false);
  const [selectedEntityId, setSelectedEntityId] = React.useState(sampleProject.maps[0].entities[0]?.id ?? "");
  const [selectedSpawnId, setSelectedSpawnId] = React.useState(sampleProject.start.spawnId);
  const [rightTab, setRightTab] = React.useState<RightPanelTab>("entities");
  const [notice, setNotice] = React.useState("Sample quest loaded.");
  const [sampleConfirmationOpen, setSampleConfirmationOpen] = React.useState(false);
  const paintingRef = React.useRef(false);
  const lastPaintedCellRef = React.useRef("");

  const selectedMap = project.maps.find((map) => map.id === selectedMapId) ?? project.maps[0];
  const spawnIds = Object.keys(selectedMap.spawns);
  const tilesetOptions = Object.values(project.assets.tilesets);
  const fallbackTileset = tilesetForMap(project, selectedMap);
  const brushTileset = project.assets.tilesets[brushTilesetKey] ?? fallbackTileset;
  const tilePalette = tilePaletteValues(brushTileset);
  const selectedEntity = selectedMap.entities.find((entity) => entity.id === selectedEntityId);
  const selectedSpawn = selectedMap.spawns[selectedSpawnId];
  const validation = validateProject(project);

  React.useEffect(() => {
    if (selectedSpawnId && selectedMap.spawns[selectedSpawnId]) return;
    setSelectedSpawnId(spawnIds[0] ?? "");
  }, [selectedMap.id, spawnIds.join("\0"), selectedSpawnId]);

  React.useEffect(() => {
    function stopPainting() {
      paintingRef.current = false;
      lastPaintedCellRef.current = "";
    }

    window.addEventListener("pointerup", stopPainting);
    window.addEventListener("pointercancel", stopPainting);
    window.addEventListener("blur", stopPainting);
    return () => {
      window.removeEventListener("pointerup", stopPainting);
      window.removeEventListener("pointercancel", stopPainting);
      window.removeEventListener("blur", stopPainting);
    };
  }, []);

  function updateProject(updater: (project: KitsuneProject) => KitsuneProject) {
    setProject((current) => updater(structuredClone(current)));
  }

  function updateSelectedMap(updater: (map: KitsuneMap) => void) {
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

  function resizeSelectedMap(nextWidth: number, nextHeight: number) {
    const width = clampMapDimension(nextWidth);
    const height = clampMapDimension(nextHeight);
    const selectedEntityWillRemain = !selectedEntity || isInBounds(selectedEntity.position, width, height);

    updateProject((draft) => {
      const map = draft.maps.find((candidate) => candidate.id === selectedMap.id);
      if (!map) return draft;

      map.width = width;
      map.height = height;

      for (const layerKey of mapLayerKeys) {
        map.layers[layerKey].tiles = resizeTiles(
          map.layers[layerKey].tiles,
          width,
          height,
          layerKey === "ground" ? 1 : 0
        );
      }

      map.entities = map.entities.filter((entity) => isInBounds(entity.position, width, height));
      map.spawns = Object.fromEntries(Object.entries(map.spawns).filter(([, spawn]) => isInBounds(spawn, width, height)));

      if (draft.start.mapId === map.id && !map.spawns[draft.start.spawnId]) {
        map.spawns[draft.start.spawnId] = { x: 0, y: 0 };
      }
      if (Object.keys(map.spawns).length === 0) {
        map.spawns.start = { x: 0, y: 0 };
      }

      return draft;
    });

    if (!selectedEntityWillRemain) {
      setSelectedEntityId("");
    }
  }

  function paintCell(x: number, y: number) {
    if (!isInBounds({ x, y }, selectedMap.width, selectedMap.height)) return;
    updateSelectedMap((map) => {
      map.layers[layer].tiles[y][x] = paintedTileValue(layer, brushTileset, tileValue);
    });
  }

  function paintEnteredCell(x: number, y: number) {
    const coordinate = `${x},${y}`;
    if (lastPaintedCellRef.current === coordinate) return;
    paintCell(x, y);
    lastPaintedCellRef.current = coordinate;
  }

  function canPaintCell(entity: Entity | undefined) {
    return mode === "paint" && !entityPlacementArmed && !(entity && rightTab === "entities");
  }

  function onCellClick(x: number, y: number) {
    if (entityPlacementArmed) {
      const id = `${entityKind}-${Date.now().toString(36)}`;
      const entity: Entity = {
        id,
        name: `New ${entityKind}`,
        kind: entityKind,
        position: { x, y },
        collidable: true,
        spriteKey: entityKind,
        event: defaultEvent(entityKind, project),
        rewardKeyIds: []
      };
      updateSelectedMap((map) => {
        map.entities.push(entity);
      });
      setSelectedEntityId(id);
      setEntityPlacementArmed(false);
      return;
    }

    if (mode === "paint") {
      paintCell(x, y);
      return;
    }

    if (mode === "spawn") {
      const existingSpawnId = spawnAt(selectedMap, x, y)?.[0];
      if (existingSpawnId) {
        setSelectedSpawnId(existingSpawnId);
        return;
      }

      const nextSpawnId = selectedMap.spawns[selectedSpawnId] ? selectedSpawnId : uniqueId("spawn", spawnIds);
      updateSelectedMap((map) => {
        map.spawns[nextSpawnId] = { x, y };
      });
      setSelectedSpawnId(nextSpawnId);
      return;
    }

  }

  function selectMap(mapId: string) {
    const nextMap = project.maps.find((map) => map.id === mapId);
    setSelectedMapId(mapId);
    setSelectedSpawnId(Object.keys(nextMap?.spawns ?? {})[0] ?? "");
    setBrushTilesetKey(nextMap?.tilesetKey ?? Object.keys(project.assets.tilesets)[0] ?? "");
  }

  function loadSample() {
    setProject(sampleProject);
    setSelectedMapId(sampleProject.start.mapId);
    setSelectedSpawnId(sampleProject.start.spawnId);
    setSelectedEntityId(sampleProject.maps[0].entities[0]?.id ?? "");
    setNotice("Sample quest loaded.");
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
      setSelectedSpawnId(result.project.start.spawnId);
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
          <button onClick={() => setSampleConfirmationOpen(true)}>Sample</button>
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
            <select value={selectedMap.id} onChange={(event) => selectMap(event.target.value)}>
              {project.maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Map Name
            <input value={selectedMap.name} onChange={(event) => updateSelectedMap((map) => { map.name = event.target.value; })} />
          </label>
          <div className="map-size-row">
            <label>
              Width
              <input
                type="number"
                min="1"
                step="1"
                value={selectedMap.width}
                onChange={(event) => resizeSelectedMap(Number(event.target.value), selectedMap.height)}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                min="1"
                step="1"
                value={selectedMap.height}
                onChange={(event) => resizeSelectedMap(selectedMap.width, Number(event.target.value))}
              />
            </label>
          </div>

          <div className="segmented tool-tabs">
            <button className={mode === "paint" && !entityPlacementArmed ? "active" : ""} onClick={() => { setMode("paint"); setEntityPlacementArmed(false); }}>
              Paint
            </button>
            <button className={mode === "spawn" && !entityPlacementArmed ? "active" : ""} onClick={() => { setMode("spawn"); setEntityPlacementArmed(false); }}>
              Spawn
            </button>
          </div>

          {mode === "paint" && (
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
          )}

          {mode === "spawn" && (
            <SpawnPanel
              map={selectedMap}
              project={project}
              selectedSpawnId={selectedSpawnId}
              selectedSpawn={selectedSpawn}
              setSelectedSpawnId={setSelectedSpawnId}
              updateProject={updateProject}
            />
          )}

          <ValidationPanel validation={validation} notice={notice} />
        </aside>

        <section className="map-stage" aria-label="Tile map editor">
          <div className="tile-grid" style={{ gridTemplateColumns: `repeat(${selectedMap.width}, 34px)` }}>
            {selectedMap.layers.ground.tiles.map((row, y) =>
              row.map((groundTile, x) => {
                const decorTile = selectedMap.layers.decor.tiles[y][x];
                const blocked = tileNumber(selectedMap.layers.collision.tiles[y][x]) > 0;
                const entity = selectedMap.entities.find((candidate) => candidate.position.x === x && candidate.position.y === y);
                const sprite = entity?.spriteKey ? project.assets.sprites[entity.spriteKey] : undefined;
                const spawnEntry = spawnAt(selectedMap, x, y);
                const selected = selectedEntityId === entity?.id || (mode === "spawn" && selectedSpawnId === spawnEntry?.[0]);
                return (
                  <button
                    key={`${x}-${y}`}
                    className={`cell ${blocked ? "blocked" : ""} ${selected ? "selected" : ""}`}
                    style={tileCellPreviewStyle(project, selectedMap, groundTile)}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || !canPaintCell(entity)) return;
                      event.preventDefault();
                      paintingRef.current = true;
                      lastPaintedCellRef.current = "";
                      paintEnteredCell(x, y);
                    }}
                    onPointerEnter={(event) => {
                      if (!paintingRef.current) return;
                      if ((event.buttons & 1) === 0) {
                        paintingRef.current = false;
                        lastPaintedCellRef.current = "";
                        return;
                      }
                      if (canPaintCell(entity)) paintEnteredCell(x, y);
                    }}
                    onClick={(event) => {
                      if (entity && rightTab === "entities" && !entityPlacementArmed) {
                        setSelectedEntityId(entity.id);
                        return;
                      }
                      if (mode === "paint" && !entityPlacementArmed) {
                        if (event.detail === 0) paintCell(x, y);
                        return;
                      }
                      onCellClick(x, y);
                    }}
                    title={`${x}, ${y}`}
                  >
                    {tileNumber(decorTile) > 0 && <span className="decor" style={tileCellPreviewStyle(project, selectedMap, decorTile)} />}
                    {spawnEntry && <span className="spawn-dot" title={`Spawn ${spawnEntry[0]}`}>S</span>}
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
          <nav className="tab-strip" aria-label="Editor sections">
            {rightPanelTabs.map((tab) => (
              <button
                key={tab.id}
                className={rightTab === tab.id ? "active" : ""}
                onClick={() => {
                  setRightTab(tab.id);
                  if (tab.id !== "entities") setEntityPlacementArmed(false);
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {rightTab === "entities" && (
            <EntityPanel
              entity={selectedEntity}
              project={project}
              updateProject={updateProject}
              onSelect={setSelectedEntityId}
              entities={selectedMap.entities}
              entityKind={entityKind}
              setEntityKind={setEntityKind}
              placementArmed={entityPlacementArmed}
              setPlacementArmed={setEntityPlacementArmed}
              updateEntity={updateSelectedEntity}
              deleteEntity={() => {
                updateSelectedMap((map) => {
                  map.entities = map.entities.filter((entity) => entity.id !== selectedEntityId);
                });
                setSelectedEntityId("");
              }}
            />
          )}
          {rightTab === "knowledge" && <KnowledgePanel project={project} updateProject={updateProject} />}
          {rightTab === "battles" && <BattlesPanel project={project} updateProject={updateProject} />}
          {rightTab === "keys" && <KeysPanel project={project} updateProject={updateProject} />}
          {rightTab === "player" && <PlayerPanel project={project} updateProject={updateProject} />}
        </aside>
      </section>

      {sampleConfirmationOpen && (
        <ConfirmationDialog
          title="Load sample content?"
          confirmLabel="Load Sample"
          onCancel={() => setSampleConfirmationOpen(false)}
          onConfirm={() => {
            setSampleConfirmationOpen(false);
            loadSample();
          }}
        >
          <p>This action may replace your current project data. Any unsaved changes will be lost.</p>
          <p>Do you want to continue?</p>
        </ConfirmationDialog>
      )}
    </main>
  );
}

function ConfirmationDialog({
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    cancelButtonRef.current?.focus();

    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    }

    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmation-dialog-title">
        <header>
          <h2 id="confirmation-dialog-title">{title}</h2>
        </header>
        <div className="confirmation-dialog-body">{children}</div>
        <footer>
          <button ref={cancelButtonRef} onClick={onCancel}>{cancelLabel}</button>
          <button className="danger-action" onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </section>
    </div>
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

function SpawnPanel({
  map,
  project,
  selectedSpawnId,
  selectedSpawn,
  setSelectedSpawnId,
  updateProject
}: {
  map: KitsuneMap;
  project: KitsuneProject;
  selectedSpawnId: string;
  selectedSpawn: KitsuneMap["spawns"][string] | undefined;
  setSelectedSpawnId: (id: string) => void;
  updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void;
}) {
  const spawnIds = Object.keys(map.spawns);

  function updateSpawn(updater: (map: KitsuneMap) => void) {
    updateProject((draft) => {
      const target = draft.maps.find((candidate) => candidate.id === map.id);
      if (target) updater(target);
      return draft;
    });
  }

  function addSpawn() {
    const id = uniqueId("spawn", spawnIds);
    updateSpawn((draft) => {
      draft.spawns[id] = { x: 0, y: 0 };
    });
    setSelectedSpawnId(id);
  }

  function renameSpawn(nextId: string) {
    const cleanId = slug(nextId);
    if (!cleanId || cleanId === selectedSpawnId || map.spawns[cleanId]) return;

    updateProject((draft) => {
      const target = draft.maps.find((candidate) => candidate.id === map.id);
      const spawn = target?.spawns[selectedSpawnId];
      if (!target || !spawn) return draft;

      delete target.spawns[selectedSpawnId];
      target.spawns[cleanId] = spawn;
      if (draft.start.mapId === target.id && draft.start.spawnId === selectedSpawnId) {
        draft.start.spawnId = cleanId;
      }
      retargetSpawnReferences(draft, target.id, selectedSpawnId, cleanId);
      return draft;
    });
    setSelectedSpawnId(cleanId);
  }

  function deleteSpawn() {
    if (!selectedSpawnId) return;
    let nextSelected = "";

    updateProject((draft) => {
      const target = draft.maps.find((candidate) => candidate.id === map.id);
      if (!target) return draft;

      delete target.spawns[selectedSpawnId];
      nextSelected = Object.keys(target.spawns)[0] ?? "start";
      if (Object.keys(target.spawns).length === 0) {
        target.spawns[nextSelected] = { x: 0, y: 0 };
      }

      if (draft.start.mapId === target.id && draft.start.spawnId === selectedSpawnId) {
        draft.start.spawnId = nextSelected;
      }
      retargetSpawnReferences(draft, target.id, selectedSpawnId, nextSelected);
      return draft;
    });
    setSelectedSpawnId(nextSelected);
  }

  return (
    <section className="stack">
      <h2>Spawns</h2>
      <select value={selectedSpawnId} onChange={(event) => setSelectedSpawnId(event.target.value)}>
        {spawnIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {selectedSpawn ? (
        <>
          <label>
            Spawn ID
            <input value={selectedSpawnId} onChange={(event) => renameSpawn(event.target.value)} />
          </label>
          <div className="coord-row">
            <label>
              X
              <input
                type="number"
                min="0"
                value={selectedSpawn.x}
                onChange={(event) => updateSpawn((draft) => { draft.spawns[selectedSpawnId].x = clampCoordinate(Number(event.target.value), draft.width); })}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                min="0"
                value={selectedSpawn.y}
                onChange={(event) => updateSpawn((draft) => { draft.spawns[selectedSpawnId].y = clampCoordinate(Number(event.target.value), draft.height); })}
              />
            </label>
          </div>
        </>
      ) : (
        <p className="muted">Add a spawn point for this map.</p>
      )}
      <div className="button-row">
        <button onClick={addSpawn}>Add Spawn</button>
        <button className="danger" onClick={deleteSpawn} disabled={!selectedSpawnId}>Delete Spawn</button>
      </div>
      <p className="muted">Click a map cell in Spawn mode to select or move a spawn.</p>
      {project.start.mapId === map.id && <p className="muted">Project start: {project.start.spawnId}</p>}
    </section>
  );
}

function EntityPanel({
  entity,
  entities,
  project,
  updateProject,
  onSelect,
  entityKind,
  setEntityKind,
  placementArmed,
  setPlacementArmed,
  updateEntity,
  deleteEntity
}: {
  entity?: Entity;
  entities: Entity[];
  project: KitsuneProject;
  updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void;
  onSelect: (id: string) => void;
  entityKind: Entity["kind"];
  setEntityKind: (kind: Entity["kind"]) => void;
  placementArmed: boolean;
  setPlacementArmed: (armed: boolean) => void;
  updateEntity: (updater: (entity: Entity) => void) => void;
  deleteEntity: () => void;
}) {
  const currentSprite = entity?.spriteKey ? project.assets.sprites[entity.spriteKey] : undefined;

  function setSpriteKey(spriteKey: string | undefined) {
    updateEntity((draft) => {
      if (spriteKey) draft.spriteKey = spriteKey;
      else delete draft.spriteKey;
    });
  }

  return (
    <section>
      <h2>Entities</h2>
      <div className="placement-controls">
        <label>
          New Entity Kind
          <select value={entityKind} onChange={(event) => setEntityKind(event.target.value as Entity["kind"])}>
            {entityKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <button className={placementArmed ? "active" : "primary"} onClick={() => setPlacementArmed(!placementArmed)}>
          {placementArmed ? "Cancel Placement" : "Place on Map"}
        </button>
      </div>
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
          <SpriteField
            label="Sprite"
            project={project}
            currentSprite={currentSprite}
            updateProject={updateProject}
            setSpriteKey={setSpriteKey}
          />
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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={entity.collidable !== false}
              onChange={(event) => updateEntity((draft) => { draft.collidable = event.target.checked; })}
            />
            Blocks player movement
          </label>
          <EventEditor project={project} commands={entity.event} updateCommands={(commands) => updateEntity((draft) => { draft.event = commands; })} />
          <KeyProgressionFields
            project={project}
            rewardKeyIds={entity.rewardKeyIds ?? []}
            lock={entity.lock}
            update={(rewardKeyIds, lock) => updateEntity((draft) => {
              draft.rewardKeyIds = rewardKeyIds;
              if (lock) draft.lock = lock;
              else delete draft.lock;
            })}
          />
          <button className="danger" onClick={deleteEntity}>Delete Entity</button>
        </div>
      ) : (
        <p className="muted">Place or select an entity on the map.</p>
      )}
    </section>
  );
}

function SpriteField({
  label,
  project,
  currentSprite,
  updateProject,
  setSpriteKey
}: {
  label: string;
  project: KitsuneProject;
  currentSprite: SpriteAsset | undefined;
  updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void;
  setSpriteKey: (spriteKey: string | undefined) => void;
}) {
  const [spritePickerOpen, setSpritePickerOpen] = React.useState(false);
  const [spriteTilesetKey, setSpriteTilesetKey] = React.useState(Object.keys(project.assets.tilesets)[0] ?? "");
  const tilesets = Object.values(project.assets.tilesets);
  const spriteTileset = project.assets.tilesets[spriteTilesetKey] ?? tilesets[0];

  function openSpritePicker() {
    setSpriteTilesetKey(tilesetKeyForSprite(project, currentSprite) ?? tilesets[0]?.key ?? "");
    setSpritePickerOpen(true);
  }

  function setSpriteFromTileset(tileset: TilesetAsset, frame: number) {
    if (!isPreviewableTileset(tileset)) return;
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
      return draft;
    });
    setSpriteKey(key);
    setSpritePickerOpen(false);
  }

  return (
    <div className="sprite-field-control">
      <span className="field-label">{label}</span>
      <div className="sprite-field">
        <span className="sprite-preview" style={spritePreviewStyle(currentSprite)} />
        <button type="button" onClick={openSpritePicker}>Choose Sprite</button>
        <button type="button" onClick={() => setSpriteKey(undefined)}>Clear</button>
      </div>
      {spritePickerOpen && (
        <div className="sprite-modal-backdrop" role="presentation">
          <section className="sprite-modal" role="dialog" aria-modal="true" aria-label={`Choose ${label.toLowerCase()}`}>
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
    </div>
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
              <select
                value={command.mapId}
                onChange={(event) => updateAt(index, (draft) => {
                  if (draft.type !== "transferMap") return draft;
                  const targetMap = project.maps.find((map) => map.id === event.target.value);
                  return { ...draft, mapId: event.target.value, spawnId: Object.keys(targetMap?.spawns ?? {})[0] ?? "" };
                })}
              >
                {project.maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
              </select>
              <select value={command.spawnId} onChange={(event) => updateAt(index, (draft) => draft.type === "transferMap" ? { ...draft, spawnId: event.target.value } : draft)}>
                {Object.keys(project.maps.find((map) => map.id === command.mapId)?.spawns ?? {}).map((spawnId) => (
                  <option key={spawnId} value={spawnId}>{spawnId}</option>
                ))}
              </select>
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

function KnowledgePanel({ project, updateProject }: { project: KitsuneProject; updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void }) {
  const [selectedKnowledgeId, setSelectedKnowledgeId] = React.useState(project.knowledge[0]?.id ?? "");
  const [battleToAdd, setBattleToAdd] = React.useState("");
  const entry = project.knowledge.find((candidate) => candidate.id === selectedKnowledgeId) ?? project.knowledge[0];
  const containingBattles = project.battles.filter((battle) => entry && battle.requiredKnowledgeIds.includes(entry.id));
  const availableBattles = project.battles.filter((battle) => entry && !battle.requiredKnowledgeIds.includes(entry.id));
  const deleteBlockedReason = noteDeleteBlockedReason(project, entry?.id);

  React.useEffect(() => {
    if (!entry && project.knowledge[0]) setSelectedKnowledgeId(project.knowledge[0].id);
  }, [entry, project.knowledge]);

  React.useEffect(() => {
    if (!availableBattles.some((battle) => battle.id === battleToAdd)) {
      setBattleToAdd(availableBattles[0]?.id ?? "");
    }
  }, [availableBattles, battleToAdd]);

  function updateKnowledge(updater: (entry: KnowledgeEntry) => void) {
    updateProject((draft) => {
      const target = draft.knowledge.find((candidate) => candidate.id === entry?.id);
      if (target) updater(target);
      return draft;
    });
  }

  function addKnowledge() {
    const id = uniqueId("knowledge", project.knowledge.map((candidate) => candidate.id));
    updateProject((draft) => {
      draft.knowledge.push({
        id,
        title: "New Knowledge",
        summary: "Short summary",
        prompt: "What is the answer?",
        answer: "Answer",
        body: "Detailed note.",
        tags: []
      });
      return draft;
    });
    setSelectedKnowledgeId(id);
  }

  function addToBattle() {
    if (!entry || !battleToAdd) return;
    updateProject((draft) => {
      const battle = draft.battles.find((candidate) => candidate.id === battleToAdd);
      if (battle && !battle.requiredKnowledgeIds.includes(entry.id)) battle.requiredKnowledgeIds.push(entry.id);
      return draft;
    });
  }

  function removeFromBattle(battleId: string) {
    if (!entry) return;
    updateProject((draft) => {
      const battle = draft.battles.find((candidate) => candidate.id === battleId);
      if (battle && battle.requiredKnowledgeIds.length > 1) {
        battle.requiredKnowledgeIds = battle.requiredKnowledgeIds.filter((id) => id !== entry.id);
      }
      return draft;
    });
  }

  function deleteKnowledge() {
    if (!entry || deleteBlockedReason) return;
    let nextId = "";
    updateProject((draft) => {
      const index = draft.knowledge.findIndex((candidate) => candidate.id === entry.id);
      removeKnowledgeReferences(draft, entry.id);
      draft.knowledge = draft.knowledge.filter((candidate) => candidate.id !== entry.id);
      nextId = draft.knowledge[Math.min(index, draft.knowledge.length - 1)]?.id ?? "";
      return draft;
    });
    setSelectedKnowledgeId(nextId);
  }

  return (
    <section className="content-panel">
      <div className="panel-heading">
        <h2>Notes</h2>
        <button onClick={addKnowledge}>Add Note</button>
      </div>
      <label>
        Note
        <select value={entry?.id ?? ""} onChange={(event) => setSelectedKnowledgeId(event.target.value)}>
          {project.knowledge.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>
      {entry && (
        <div className="focused-editor">
          <label>Title<input value={entry.title} onChange={(event) => updateKnowledge((draft) => { draft.title = event.target.value; })} /></label>
          <label>Summary<input value={entry.summary} onChange={(event) => updateKnowledge((draft) => { draft.summary = event.target.value; })} /></label>
          <label>Question<input value={entry.prompt} onChange={(event) => updateKnowledge((draft) => { draft.prompt = event.target.value; })} /></label>
          <label>Answer<input value={entry.answer} onChange={(event) => updateKnowledge((draft) => { draft.answer = event.target.value; })} /></label>
          <label>Details<textarea value={entry.body} onChange={(event) => updateKnowledge((draft) => { draft.body = event.target.value; })} /></label>
          <label>Image URL<input value={entry.imageUrl ?? ""} onChange={(event) => updateKnowledge((draft) => { setOptionalString(draft, "imageUrl", event.target.value); })} /></label>
          <label>
            Upload Image
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.addEventListener("load", () => {
                  if (typeof reader.result !== "string") return;
                  updateKnowledge((draft) => {
                    draft.imageUrl = reader.result as string;
                    draft.imageAlt = draft.imageAlt || file.name;
                  });
                });
                reader.readAsDataURL(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {entry.imageUrl && (
            <div className="knowledge-image-preview">
              <img src={entry.imageUrl} alt={entry.imageAlt || entry.title} />
              <button type="button" onClick={() => updateKnowledge((draft) => { delete draft.imageUrl; delete draft.imageAlt; })}>Remove Image</button>
            </div>
          )}
          <section className="membership-list">
            <h3>Battles</h3>
            {containingBattles.length > 0 ? containingBattles.map((battle) => (
              <div className="membership-row" key={battle.id}>
                <span>{battle.name}</span>
                <button
                  disabled={battle.requiredKnowledgeIds.length === 1}
                  title={battle.requiredKnowledgeIds.length === 1 ? "A battle must keep at least one note." : undefined}
                  onClick={() => removeFromBattle(battle.id)}
                >
                  Remove
                </button>
              </div>
            )) : <p className="muted">This note is not used by any battle.</p>}
            {availableBattles.length > 0 && (
              <div className="add-question-row">
                <select value={battleToAdd} onChange={(event) => setBattleToAdd(event.target.value)}>
                  {availableBattles.map((battle) => <option key={battle.id} value={battle.id}>{battle.name}</option>)}
                </select>
                <button onClick={addToBattle}>Add to Battle</button>
              </div>
            )}
          </section>
          <button className="danger" disabled={Boolean(deleteBlockedReason)} title={deleteBlockedReason} onClick={deleteKnowledge}>Delete Note</button>
          {deleteBlockedReason && <p className="muted">{deleteBlockedReason}</p>}
        </div>
      )}
    </section>
  );
}

function BattlesPanel({ project, updateProject }: { project: KitsuneProject; updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void }) {
  const [selectedBattleId, setSelectedBattleId] = React.useState(project.battles[0]?.id ?? "");
  const [knowledgeToAdd, setKnowledgeToAdd] = React.useState("");
  const battle = project.battles.find((candidate) => candidate.id === selectedBattleId) ?? project.battles[0];
  const availableKnowledge = project.knowledge.filter((entry) => !battle?.requiredKnowledgeIds.includes(entry.id));

  React.useEffect(() => {
    if (!battle && project.battles[0]) setSelectedBattleId(project.battles[0].id);
  }, [battle, project.battles]);

  React.useEffect(() => {
    if (!availableKnowledge.some((entry) => entry.id === knowledgeToAdd)) {
      setKnowledgeToAdd(availableKnowledge[0]?.id ?? "");
    }
  }, [availableKnowledge, knowledgeToAdd]);

  function updateBattle(updater: (battle: BattleDefinition) => void) {
    updateProject((draft) => {
      const target = draft.battles.find((candidate) => candidate.id === battle?.id);
      if (target) updater(target);
      return draft;
    });
  }

  function addBattle() {
    const id = uniqueId("battle", project.battles.map((candidate) => candidate.id));
    updateProject((draft) => {
      draft.battles.push({
        id,
        name: "New Battle",
        enemyName: "Enemy",
        confirmationMessage: "Start this battle?",
        victoryFlag: `${id}_victory`,
        requiredKnowledgeIds: [draft.knowledge[0]?.id ?? ""].filter(Boolean),
        rewardKeyIds: []
      });
      return draft;
    });
    setSelectedBattleId(id);
  }

  function deleteBattle() {
    if (!battle) return;
    let nextBattleId = "";
    updateProject((draft) => {
      draft.battles = draft.battles.filter((candidate) => candidate.id !== battle.id);
      removeBattleReferences(draft, battle.id);
      nextBattleId = draft.battles[0]?.id ?? "";
      return draft;
    });
    setSelectedBattleId(nextBattleId);
  }

  return (
    <section className="content-panel">
      <div className="panel-heading">
        <h2>Battle</h2>
        <button onClick={addBattle}>Add Battle</button>
      </div>
      {project.battles.length > 0 ? (
        <>
          <label>
            Battle
            <select value={battle?.id ?? ""} onChange={(event) => setSelectedBattleId(event.target.value)}>
              {project.battles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
          {battle && (
            <div className="focused-editor">
              <label>Name<input value={battle.name} onChange={(event) => updateBattle((draft) => { draft.name = event.target.value; })} /></label>
              <label>Enemy Name<input value={battle.enemyName} onChange={(event) => updateBattle((draft) => { draft.enemyName = event.target.value; })} /></label>
              <label>Confirmation Message<textarea value={battle.confirmationMessage} onChange={(event) => updateBattle((draft) => { draft.confirmationMessage = event.target.value; })} /></label>
              <section className="question-list">
                <h3>Notes</h3>
                {battle.requiredKnowledgeIds.map((knowledgeId) => {
                  const entry = project.knowledge.find((candidate) => candidate.id === knowledgeId);
                  return (
                    <div className="membership-row" key={knowledgeId}>
                      <span>{entry?.title ?? knowledgeId}</span>
                      <button disabled={battle.requiredKnowledgeIds.length === 1} onClick={() => updateBattle((draft) => { draft.requiredKnowledgeIds = draft.requiredKnowledgeIds.filter((id) => id !== knowledgeId); })}>Remove</button>
                    </div>
                  );
                })}
                {availableKnowledge.length > 0 && (
                  <div className="add-question-row">
                    <select value={knowledgeToAdd} onChange={(event) => setKnowledgeToAdd(event.target.value)}>
                      {availableKnowledge.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                    </select>
                    <button onClick={() => updateBattle((draft) => { draft.requiredKnowledgeIds.push(knowledgeToAdd); })}>Add Question</button>
                  </div>
                )}
              </section>
              <KeyProgressionFields
                project={project}
                rewardKeyIds={battle.rewardKeyIds ?? []}
                lock={battle.lock}
                update={(rewardKeyIds, lock) => updateBattle((draft) => {
                  draft.rewardKeyIds = rewardKeyIds;
                  if (lock) draft.lock = lock;
                  else delete draft.lock;
                })}
              />
              <button className="danger" onClick={deleteBattle}>Delete Battle</button>
            </div>
          )}
        </>
      ) : (
        <p className="muted">Add a battle to configure its questions.</p>
      )}
    </section>
  );
}

function KeysPanel({ project, updateProject }: { project: KitsuneProject; updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void }) {
  const [selectedKeyId, setSelectedKeyId] = React.useState(project.keys[0]?.id ?? "");
  const key = project.keys.find((candidate) => candidate.id === selectedKeyId) ?? project.keys[0];
  const currentSprite = key?.spriteKey ? project.assets.sprites[key.spriteKey] : undefined;

  React.useEffect(() => {
    if (!key && project.keys[0]) setSelectedKeyId(project.keys[0].id);
  }, [key, project.keys]);

  function updateKey(updater: (key: KeyDefinition) => void) {
    updateProject((draft) => {
      const target = draft.keys.find((candidate) => candidate.id === key?.id);
      if (target) updater(target);
      return draft;
    });
  }

  function addKey() {
    const id = uniqueId("key", project.keys.map((candidate) => candidate.id));
    updateProject((draft) => {
      draft.keys.push({ id, name: "New Key" });
      return draft;
    });
    setSelectedKeyId(id);
  }

  function renameKey(value: string) {
    if (!key) return;
    const nextId = slug(value);
    if (nextId !== key.id && project.keys.some((candidate) => candidate.id === nextId)) return;
    updateProject((draft) => {
      const target = draft.keys.find((candidate) => candidate.id === key.id);
      if (!target) return draft;
      retargetKeyReferences(draft, key.id, nextId);
      target.id = nextId;
      return draft;
    });
    setSelectedKeyId(nextId);
  }

  function deleteKey() {
    if (!key) return;
    let nextId = "";
    updateProject((draft) => {
      const index = draft.keys.findIndex((candidate) => candidate.id === key.id);
      removeKeyReferences(draft, key.id);
      draft.keys = draft.keys.filter((candidate) => candidate.id !== key.id);
      nextId = draft.keys[Math.min(index, draft.keys.length - 1)]?.id ?? "";
      return draft;
    });
    setSelectedKeyId(nextId);
  }

  return (
    <section className="content-panel">
      <div className="panel-heading">
        <h2>Keys</h2>
        <button onClick={addKey}>Add Key</button>
      </div>
      {project.keys.length > 0 ? (
        <>
          <label>
            Key
            <select value={key?.id ?? ""} onChange={(event) => setSelectedKeyId(event.target.value)}>
              {project.keys.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
          {key && (
            <div className="focused-editor">
              <label>Key ID<input value={key.id} onChange={(event) => renameKey(event.target.value)} /></label>
              <label>Name<input value={key.name} onChange={(event) => updateKey((draft) => { draft.name = event.target.value; })} /></label>
              <SpriteField
                label="Key Sprite"
                project={project}
                currentSprite={currentSprite}
                updateProject={updateProject}
                setSpriteKey={(spriteKey) => updateKey((draft) => {
                  if (spriteKey) draft.spriteKey = spriteKey;
                  else delete draft.spriteKey;
                })}
              />
              <button className="danger" onClick={deleteKey}>Delete Key</button>
            </div>
          )}
        </>
      ) : (
        <p className="muted">Add a key to configure progression locks and rewards.</p>
      )}
    </section>
  );
}

function KeyProgressionFields({
  project,
  rewardKeyIds,
  lock,
  update
}: {
  project: KitsuneProject;
  rewardKeyIds: string[];
  lock?: { keyId: string; missingKeyMessage: string };
  update: (rewardKeyIds: string[], lock: { keyId: string; missingKeyMessage: string } | undefined) => void;
}) {
  const availableRewards = project.keys.filter((key) => !rewardKeyIds.includes(key.id));
  const [rewardToAdd, setRewardToAdd] = React.useState(availableRewards[0]?.id ?? "");

  React.useEffect(() => {
    if (!availableRewards.some((key) => key.id === rewardToAdd)) {
      setRewardToAdd(availableRewards[0]?.id ?? "");
    }
  }, [availableRewards, rewardToAdd]);

  return (
    <section className="key-progression">
      <h3>Key Progression</h3>
      <label>
        Required Key
        <select
          value={lock?.keyId ?? ""}
          onChange={(event) => update(rewardKeyIds, event.target.value ? {
            keyId: event.target.value,
            missingKeyMessage: lock?.missingKeyMessage ?? "This is locked."
          } : undefined)}
        >
          <option value="">None</option>
          {project.keys.map((key) => <option key={key.id} value={key.id}>{key.name}</option>)}
        </select>
      </label>
      {lock && (
        <label>
          Missing-key Message
          <textarea value={lock.missingKeyMessage} onChange={(event) => update(rewardKeyIds, { ...lock, missingKeyMessage: event.target.value })} />
        </label>
      )}
      <section className="membership-list">
        <h3>Reward Keys</h3>
        {rewardKeyIds.length > 0 ? rewardKeyIds.map((keyId) => (
          <div className="membership-row" key={keyId}>
            <span>{project.keys.find((key) => key.id === keyId)?.name ?? keyId}</span>
            <button onClick={() => update(rewardKeyIds.filter((candidate) => candidate !== keyId), lock)}>Remove</button>
          </div>
        )) : <p className="muted">No keys awarded.</p>}
        {availableRewards.length > 0 && (
          <div className="add-question-row">
            <select value={rewardToAdd} onChange={(event) => setRewardToAdd(event.target.value)}>
              {availableRewards.map((key) => <option key={key.id} value={key.id}>{key.name}</option>)}
            </select>
            <button onClick={() => update([...rewardKeyIds, rewardToAdd], lock)}>Add Reward</button>
          </div>
        )}
      </section>
    </section>
  );
}

function PlayerPanel({ project, updateProject }: { project: KitsuneProject; updateProject: (updater: (project: KitsuneProject) => KitsuneProject) => void }) {
  const currentSprite = project.player.spriteKey ? project.assets.sprites[project.player.spriteKey] : undefined;

  return (
    <section className="content-panel">
      <h2>Player</h2>
      <label>
        Name
        <input
          value={project.player.name}
          onChange={(event) =>
            updateProject((draft) => {
              draft.player.name = event.target.value;
              return draft;
            })
          }
        />
      </label>
      <label>
        Max HP
        <input
          type="number"
          min="1"
          value={project.player.maxHp}
          onChange={(event) =>
            updateProject((draft) => {
              draft.player.maxHp = positiveInt(event.target.value);
              return draft;
            })
          }
        />
      </label>
      <SpriteField
        label="Player Sprite"
        project={project}
        currentSprite={currentSprite}
        updateProject={updateProject}
        setSpriteKey={(spriteKey) =>
          updateProject((draft) => {
            if (spriteKey) draft.player.spriteKey = spriteKey;
            else delete draft.player.spriteKey;
            return draft;
          })
        }
      />
    </section>
  );
}

function defaultEvent(kind: Entity["kind"], project: KitsuneProject): EventCommand[] {
  if (kind === "door") return [{ type: "transferMap", mapId: project.start.mapId, spawnId: project.start.spawnId }];
  if (kind === "trigger") return [{ type: "startBattle", battleId: project.battles[0]?.id ?? "" }];
  if (kind === "object") return [{ type: "grantKnowledge", knowledgeId: project.knowledge[0]?.id ?? "" }];
  return [{ type: "dialogue", speaker: "NPC", text: "New dialogue." }];
}

function setOptionalString<T extends object, K extends keyof T>(target: T, key: K, value: string) {
  if (value.trim()) target[key] = value as T[K];
  else delete target[key];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "project";
}

function uniqueId(prefix: string, existing: string[]): string {
  let index = existing.length + 1;
  let id = `${prefix}-${index}`;
  while (existing.includes(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function positiveInt(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Math.max(1, Math.floor(Number.isFinite(parsed) ? parsed : 1));
}

function clampMapDimension(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

function clampCoordinate(value: number, size: number): number {
  return Math.min(size - 1, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
}

function resizeTiles(tiles: TileValue[][], width: number, height: number, fill: TileValue): TileValue[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => tiles[y]?.[x] ?? fill)
  );
}

function isInBounds(position: { x: number; y: number }, width: number, height: number): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < width && position.y < height;
}

function spawnAt(map: KitsuneMap, x: number, y: number): [string, KitsuneMap["spawns"][string]] | undefined {
  return Object.entries(map.spawns).find(([, spawn]) => spawn.x === x && spawn.y === y);
}

function retargetSpawnReferences(project: KitsuneProject, mapId: string, oldSpawnId: string, nextSpawnId: string) {
  for (const map of project.maps) {
    for (const entity of map.entities) {
      entity.event = retargetSpawnCommands(entity.event, mapId, oldSpawnId, nextSpawnId);
    }
  }
}

function retargetSpawnCommands(commands: EventCommand[], mapId: string, oldSpawnId: string, nextSpawnId: string): EventCommand[] {
  return commands.map((command) => {
    if (command.type === "transferMap" && command.mapId === mapId && command.spawnId === oldSpawnId) {
      return { ...command, spawnId: nextSpawnId };
    }
    if (command.type === "branch") {
      return {
        ...command,
        then: retargetSpawnCommands(command.then, mapId, oldSpawnId, nextSpawnId),
        else: retargetSpawnCommands(command.else ?? [], mapId, oldSpawnId, nextSpawnId)
      };
    }
    return command;
  });
}

function removeBattleReferences(project: KitsuneProject, battleId: string) {
  for (const map of project.maps) {
    for (const entity of map.entities) {
      entity.event = removeBattleCommands(entity.event, battleId);
    }
  }
}

function retargetKeyReferences(project: KitsuneProject, oldKeyId: string, nextKeyId: string) {
  for (const map of project.maps) {
    for (const entity of map.entities) {
      entity.rewardKeyIds = (entity.rewardKeyIds ?? []).map((keyId) => keyId === oldKeyId ? nextKeyId : keyId);
      if (entity.lock?.keyId === oldKeyId) entity.lock.keyId = nextKeyId;
    }
  }
  for (const battle of project.battles) {
    battle.rewardKeyIds = (battle.rewardKeyIds ?? []).map((keyId) => keyId === oldKeyId ? nextKeyId : keyId);
    if (battle.lock?.keyId === oldKeyId) battle.lock.keyId = nextKeyId;
  }
}

function removeKeyReferences(project: KitsuneProject, keyId: string) {
  for (const map of project.maps) {
    for (const entity of map.entities) {
      entity.rewardKeyIds = (entity.rewardKeyIds ?? []).filter((candidate) => candidate !== keyId);
      if (entity.lock?.keyId === keyId) delete entity.lock;
    }
  }
  for (const battle of project.battles) {
    battle.rewardKeyIds = (battle.rewardKeyIds ?? []).filter((candidate) => candidate !== keyId);
    if (battle.lock?.keyId === keyId) delete battle.lock;
  }
}

function noteDeleteBlockedReason(project: KitsuneProject, knowledgeId: string | undefined): string | undefined {
  if (!knowledgeId) return "Select a note to delete.";
  if (project.knowledge.length <= 1) return "A project must keep at least one note.";
  const blockingBattle = project.battles.find((battle) => battle.requiredKnowledgeIds.length === 1 && battle.requiredKnowledgeIds[0] === knowledgeId);
  if (blockingBattle) return `"${blockingBattle.name}" must keep at least one note.`;
  return undefined;
}

function removeKnowledgeReferences(project: KitsuneProject, knowledgeId: string) {
  for (const battle of project.battles) {
    battle.requiredKnowledgeIds = battle.requiredKnowledgeIds.filter((id) => id !== knowledgeId);
  }
  for (const map of project.maps) {
    for (const entity of map.entities) {
      entity.event = removeKnowledgeCommands(entity.event, knowledgeId);
    }
  }
}

function removeKnowledgeCommands(commands: EventCommand[], knowledgeId: string): EventCommand[] {
  return commands.flatMap((command) => {
    if (command.type === "grantKnowledge" && command.knowledgeId === knowledgeId) return [] as EventCommand[];
    if (command.type === "branch") {
      const nextCommand: EventCommand = {
        ...command,
        then: removeKnowledgeCommands(command.then, knowledgeId),
        else: removeKnowledgeCommands(command.else ?? [], knowledgeId)
      };
      return [nextCommand];
    }
    return [command];
  });
}

function removeBattleCommands(commands: EventCommand[], battleId: string): EventCommand[] {
  return commands.flatMap((command) => {
    if (command.type === "startBattle" && command.battleId === battleId) return [] as EventCommand[];
    if (command.type === "branch") {
      const nextCommand: EventCommand = {
        ...command,
        then: removeBattleCommands(command.then, battleId),
        else: removeBattleCommands(command.else ?? [], battleId)
      };
      return [nextCommand];
    }
    return [command];
  });
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
