import { z } from "zod";

export const SCHEMA_VERSION = 1;
export const MAX_BRANCH_NESTING_DEPTH = 3;
export const ENTITY_KINDS = ["npc", "object", "door", "trigger"] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

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

export type BranchCondition =
  | { type: "battlePassed"; battleId: string }
  | { type: "hasKey"; keyId: string };

export type EventCommand =
  | { type: "dialogue"; speaker?: string; text: string }
  | { type: "grantKnowledge"; knowledgeId: string }
  | { type: "setFlag"; flag: string; value: boolean }
  | { type: "transferMap"; mapId: string; spawnId: string }
  | { type: "startBattle"; battleId: string }
  | { type: "branch"; condition: BranchCondition; then: EventCommand[]; else?: EventCommand[] };

export type EventCommandType = EventCommand["type"];

export const ENTITY_ROLE_POLICIES = {
  npc: {
    activation: "interact",
    collision: "configurable",
    defaultCollidable: true,
    allowedCommands: ["dialogue", "grantKnowledge", "setFlag", "startBattle", "branch"]
  },
  object: {
    activation: "interact",
    collision: "configurable",
    defaultCollidable: true,
    allowedCommands: ["dialogue", "grantKnowledge", "setFlag", "startBattle", "branch"]
  },
  door: {
    activation: "interact",
    collision: "configurable",
    defaultCollidable: true,
    allowedCommands: ["dialogue", "setFlag", "transferMap", "branch"]
  },
  trigger: {
    activation: "enter",
    collision: "fixed",
    defaultCollidable: false,
    allowedCommands: ["dialogue", "grantKnowledge", "setFlag", "transferMap", "startBattle", "branch"]
  }
} as const satisfies Record<EntityKind, {
  activation: "interact" | "enter";
  collision: "configurable" | "fixed";
  defaultCollidable: boolean;
  allowedCommands: readonly EventCommandType[];
}>;

export function isEventCommandAllowed(kind: EntityKind, commandType: EventCommandType): boolean {
  return (ENTITY_ROLE_POLICIES[kind].allowedCommands as readonly EventCommandType[]).includes(commandType);
}

export const branchConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("battlePassed"),
    battleId: z.string().min(1)
  }),
  z.object({
    type: z.literal("hasKey"),
    keyId: z.string().min(1)
  })
]);

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
      condition: branchConditionSchema,
      then: z.array(eventCommandSchema),
      else: z.array(eventCommandSchema).default([])
    })
  ])
);

export const entitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(ENTITY_KINDS),
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
  const parsed = kitsuneProjectSchema.safeParse(migrateProjectInput(input));
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
      if (ENTITY_ROLE_POLICIES[entity.kind].collision === "fixed" && entity.collidable !== ENTITY_ROLE_POLICIES[entity.kind].defaultCollidable) {
        issues.push(`${map.id}.${entity.id} ${entity.kind} entities must not block player movement`);
      }
      validateKeyReferences(entity.rewardKeyIds, entity.lock?.keyId, keyIds, issues, `${map.id}.${entity.id}`);
      validateCommands(entity.event, { issues, mapIds, knowledgeIds, battleIds, keyIds, context: `${map.id}.${entity.id}`, entityKind: entity.kind });
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
    keyIds: Set<string>;
    context: string;
    entityKind?: EntityKind;
  },
  branchDepth = 0
) {
  for (const [commandIndex, command] of commands.entries()) {
    if (refs.entityKind && !isEventCommandAllowed(refs.entityKind, command.type)) {
      refs.issues.push(`${refs.context}.event[${commandIndex}] ${refs.entityKind} entities cannot use "${command.type}" commands`);
    }
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
      if (branchDepth >= MAX_BRANCH_NESTING_DEPTH) {
        refs.issues.push(`${refs.context} exceeds maximum branch nesting depth of ${MAX_BRANCH_NESTING_DEPTH}`);
      }
      if (command.condition.type === "battlePassed" && !refs.battleIds.has(command.condition.battleId)) {
        refs.issues.push(`${refs.context} checks missing battle "${command.condition.battleId}"`);
      }
      if (command.condition.type === "hasKey" && !refs.keyIds.has(command.condition.keyId)) {
        refs.issues.push(`${refs.context} checks missing key "${command.condition.keyId}"`);
      }
      validateCommands(command.then, refs, branchDepth + 1);
      validateCommands(command.else ?? [], refs, branchDepth + 1);
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

function migrateProjectInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const project = structuredClone(input) as Record<string, unknown>;
  if (project.schemaVersion !== 0) return project;

  project.schemaVersion = SCHEMA_VERSION;
  if (!Array.isArray(project.maps)) return project;
  for (const mapValue of project.maps) {
    if (!mapValue || typeof mapValue !== "object" || Array.isArray(mapValue)) continue;
    const map = mapValue as Record<string, unknown>;
    if (!Array.isArray(map.entities)) continue;
    for (const entityValue of map.entities) {
      if (!entityValue || typeof entityValue !== "object" || Array.isArray(entityValue)) continue;
      const entity = entityValue as Record<string, unknown>;
      if (!Object.hasOwn(entity, "collidable") && entity.kind === "trigger") {
        entity.collidable = ENTITY_ROLE_POLICIES.trigger.defaultCollidable;
      }
    }
  }
  return project;
}
