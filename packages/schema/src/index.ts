import { z } from "zod";

export const SCHEMA_VERSION = 0;

export const positionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative()
});

export const tileValueSchema = z.union([
  z.number().int().nonnegative(),
  z.object({
    tilesetKey: z.string().min(1),
    tile: z.number().int().nonnegative()
  })
]);

export const tileLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tiles: z.array(z.array(tileValueSchema))
});

export const lockRequirementSchema = z.object({
  keyId: z.string().min(1),
  missingKeyMessage: z.string().min(1)
});

export type EventCommand =
  | { type: "dialogue"; speaker?: string; text: string }
  | { type: "grantKnowledge"; knowledgeId: string }
  | { type: "setFlag"; flag: string; value: boolean }
  | { type: "transferMap"; mapId: string; spawnId: string }
  | { type: "startBattle"; battleId: string }
  | { type: "branch"; flag: string; expected: boolean; then: EventCommand[]; else?: EventCommand[] };

export const eventCommandSchema: z.ZodType<EventCommand> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("dialogue"),
      speaker: z.string().min(1).optional(),
      text: z.string().min(1)
    }),
    z.object({
      type: z.literal("grantKnowledge"),
      knowledgeId: z.string().min(1)
    }),
    z.object({
      type: z.literal("setFlag"),
      flag: z.string().min(1),
      value: z.boolean()
    }),
    z.object({
      type: z.literal("transferMap"),
      mapId: z.string().min(1),
      spawnId: z.string().min(1)
    }),
    z.object({
      type: z.literal("startBattle"),
      battleId: z.string().min(1)
    }),
    z.object({
      type: z.literal("branch"),
      flag: z.string().min(1),
      expected: z.boolean(),
      then: z.array(eventCommandSchema),
      else: z.array(eventCommandSchema).default([])
    })
  ])
);

export const entitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["npc", "object", "door", "trigger"]),
  position: positionSchema,
  collidable: z.boolean().default(true),
  spriteKey: z.string().min(1).optional(),
  event: z.array(eventCommandSchema).default([]),
  rewardKeyIds: z.array(z.string().min(1)).default([]),
  lock: lockRequirementSchema.optional()
});

export const mapSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tileSize: z.number().int().positive(),
  tilesetKey: z.string().min(1).optional(),
  layers: z.object({
    ground: tileLayerSchema,
    decor: tileLayerSchema,
    collision: tileLayerSchema
  }),
  spawns: z.record(positionSchema),
  entities: z.array(entitySchema)
});

export const knowledgeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  body: z.string().min(1),
  imageUrl: z.string().min(1).optional(),
  imageAlt: z.string().optional(),
  tags: z.array(z.string().min(1)).default([])
});

export const battleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enemyName: z.string().min(1),
  confirmationMessage: z.string().min(1).default("Start this battle?"),
  victoryFlag: z.string().min(1),
  requiredKnowledgeIds: z.array(z.string().min(1)).min(1),
  rewardKeyIds: z.array(z.string().min(1)).default([]),
  lock: lockRequirementSchema.optional()
});

export const tilesetAssetSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  image: z.string().min(1).optional(),
  tileSize: z.number().int().positive().optional(),
  columns: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional()
});

export const spriteAssetSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  image: z.string().min(1).optional(),
  frameWidth: z.number().int().positive().optional(),
  frameHeight: z.number().int().positive().optional(),
  frame: z.number().int().nonnegative().optional(),
  columns: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional()
});

export const assetManifestSchema = z.object({
  tilesets: z.record(tilesetAssetSchema),
  sprites: z.record(spriteAssetSchema)
});

export const playerSchema = z.object({
  name: z.string().min(1).default("Hero"),
  spriteKey: z.string().min(1).optional(),
  maxHp: z.number().int().positive().default(3)
});

export const keyDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  spriteKey: z.string().min(1).optional()
});

export const kitsuneProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  version: z.string().min(1),
  assets: assetManifestSchema,
  player: playerSchema.default({ name: "Hero", maxHp: 3 }),
  start: z.object({
    mapId: z.string(),
    spawnId: z.string()
  }),
  maps: z.array(mapSchema),
  knowledge: z.array(knowledgeSchema),
  battles: z.array(battleSchema).default([]),
  keys: z.array(keyDefinitionSchema).default([])
});

export type Position = z.infer<typeof positionSchema>;
export type TileValue = z.infer<typeof tileValueSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type KitsuneMap = z.infer<typeof mapSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeSchema>;
export type BattleDefinition = z.infer<typeof battleSchema>;
export type KeyDefinition = z.infer<typeof keyDefinitionSchema>;
export type LockRequirement = z.infer<typeof lockRequirementSchema>;
export type TilesetAsset = z.infer<typeof tilesetAssetSchema>;
export type SpriteAsset = z.infer<typeof spriteAssetSchema>;
export type PlayerDefinition = z.infer<typeof playerSchema>;
export type KitsuneProject = z.infer<typeof kitsuneProjectSchema>;

export type ValidationResult =
  | { ok: true; project: KitsuneProject; issues: [] }
  | { ok: false; issues: string[] };

export function validateProject(input: unknown): ValidationResult {
  const parsed = kitsuneProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`)
    };
  }

  const issues = validateReferences(parsed.data);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, project: parsed.data, issues: [] };
}

export function validateReferences(project: KitsuneProject): string[] {
  const issues: string[] = [];
  const mapIds = new Set(project.maps.map((map) => map.id));
  const knowledgeIds = new Set(project.knowledge.map((entry) => entry.id));
  const battleIds = new Set(project.battles.map((battle) => battle.id));
  const keyIds = new Set(project.keys.map((key) => key.id));
  const tilesetKeys = new Set(Object.keys(project.assets.tilesets));
  const spriteKeys = new Set(Object.keys(project.assets.sprites));

  if (mapIds.size !== project.maps.length) {
    issues.push("maps contain duplicate ids");
  }
  const mapNames = new Set(project.maps.map((map) => map.name.trim().toLocaleLowerCase()));
  if (mapNames.size !== project.maps.length) {
    issues.push("maps contain duplicate names");
  }

  if (project.player.spriteKey && !spriteKeys.has(project.player.spriteKey)) {
    issues.push(`player.spriteKey references missing sprite "${project.player.spriteKey}"`);
  }

  if (keyIds.size !== project.keys.length) {
    issues.push("keys contain duplicate ids");
  }
  for (const key of project.keys) {
    if (key.spriteKey && !spriteKeys.has(key.spriteKey)) {
      issues.push(`${key.id} references missing sprite "${key.spriteKey}"`);
    }
  }

  if (mapIds.size > 0 && !mapIds.has(project.start.mapId)) {
    issues.push(`start.mapId references missing map "${project.start.mapId}"`);
  }

  const startMap = project.maps.find((map) => map.id === project.start.mapId);
  if (startMap && !startMap.spawns[project.start.spawnId]) {
    issues.push(`start.spawnId references missing spawn "${project.start.spawnId}" on "${startMap.id}"`);
  }

  for (const map of project.maps) {
    if (map.tilesetKey && !tilesetKeys.has(map.tilesetKey)) {
      issues.push(`${map.id}.tilesetKey references missing tileset "${map.tilesetKey}"`);
    }

    for (const [layerKey, layer] of Object.entries(map.layers)) {
      if (layer.tiles.length !== map.height) {
        issues.push(`${map.id}.${layerKey} height is ${layer.tiles.length}, expected ${map.height}`);
      }
      for (const [rowIndex, row] of layer.tiles.entries()) {
        if (row.length !== map.width) {
          issues.push(`${map.id}.${layerKey}[${rowIndex}] width is ${row.length}, expected ${map.width}`);
        }
        for (const [columnIndex, tile] of row.entries()) {
          if (typeof tile === "object" && !tilesetKeys.has(tile.tilesetKey)) {
            issues.push(`${map.id}.${layerKey}[${rowIndex}][${columnIndex}] references missing tileset "${tile.tilesetKey}"`);
          }
        }
      }
    }

    for (const entity of map.entities) {
      if (entity.position.x >= map.width || entity.position.y >= map.height) {
        issues.push(`${map.id}.${entity.id} is outside map bounds`);
      }
      if (entity.spriteKey && !spriteKeys.has(entity.spriteKey)) {
        issues.push(`${map.id}.${entity.id} references missing sprite "${entity.spriteKey}"`);
      }
      validateKeyReferences(entity.rewardKeyIds, entity.lock?.keyId, keyIds, issues, `${map.id}.${entity.id}`);
      validateCommands(entity.event, { issues, mapIds, knowledgeIds, battleIds, context: `${map.id}.${entity.id}` });
    }
  }

  for (const battle of project.battles) {
    for (const knowledgeId of battle.requiredKnowledgeIds) {
      if (!knowledgeIds.has(knowledgeId)) {
        issues.push(`${battle.id} references missing knowledge "${knowledgeId}"`);
      }
    }
    validateKeyReferences(battle.rewardKeyIds, battle.lock?.keyId, keyIds, issues, battle.id);
  }

  return issues;
}

function validateKeyReferences(
  rewardKeyIds: string[],
  requiredKeyId: string | undefined,
  keyIds: Set<string>,
  issues: string[],
  context: string
) {
  for (const keyId of rewardKeyIds) {
    if (!keyIds.has(keyId)) {
      issues.push(`${context} rewards missing key "${keyId}"`);
    }
  }
  if (requiredKeyId && !keyIds.has(requiredKeyId)) {
    issues.push(`${context} requires missing key "${requiredKeyId}"`);
  }
}

function validateCommands(
  commands: EventCommand[],
  refs: {
    issues: string[];
    mapIds: Set<string>;
    knowledgeIds: Set<string>;
    battleIds: Set<string>;
    context: string;
  }
) {
  for (const command of commands) {
    if (command.type === "grantKnowledge" && !refs.knowledgeIds.has(command.knowledgeId)) {
      refs.issues.push(`${refs.context} grants missing knowledge "${command.knowledgeId}"`);
    }
    if (command.type === "startBattle" && !refs.battleIds.has(command.battleId)) {
      refs.issues.push(`${refs.context} starts missing battle "${command.battleId}"`);
    }
    if (command.type === "transferMap" && !refs.mapIds.has(command.mapId)) {
      refs.issues.push(`${refs.context} transfers to missing map "${command.mapId}"`);
    }
    if (command.type === "branch") {
      validateCommands(command.then, refs);
      validateCommands(command.else ?? [], refs);
    }
  }
}

export function createEmptyLayer(id: string, name: string, width: number, height: number, fill: TileValue = 0) {
  return {
    id,
    name,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => fill))
  };
}

export function serializeProject(project: KitsuneProject): string {
  return JSON.stringify(project, null, 2);
}
