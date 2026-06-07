import type { BattleDefinition, Entity, EventCommand, KeyDefinition, KitsuneMap, KitsuneProject, KnowledgeEntry, Position, TileValue } from "@kitsune/schema";

export type DialogueMessage = {
  speaker?: string;
  text: string;
};

export type RuntimeOverlay =
  | { type: "dialogue"; messages: DialogueMessage[]; nextOverlay?: RuntimeOverlay }
  | { type: "keyAcquisition"; keyIds: string[]; nextOverlay: RuntimeOverlay }
  | { type: "battleConfirmation"; battleId: string; message: string }
  | { type: "battle"; battle: ActiveBattle }
  | { type: "none" };

export type ActiveBattle = {
  battleId: string;
  enemyName: string;
  playerHp: number;
  questionsRemaining: number;
  prompt: string;
  answer: string;
  knowledgeId: string;
  round: number;
  result?: "correct" | "incorrect" | "victory" | "defeat";
};

export type SaveState = {
  saveVersion: 2;
  projectId: string;
  projectVersion: string;
  mapId: string;
  player: Position;
  flags: Record<string, boolean>;
  diary: string[];
  inventoryKeyIds: string[];
  overlay: RuntimeOverlay;
  battleQuestionQueue: string[];
  updatedAt: string;
};

export type Version1SaveState = Omit<SaveState, "saveVersion" | "inventoryKeyIds"> & { saveVersion: 1 };
export type LegacySaveState = Omit<SaveState, "saveVersion" | "overlay" | "battleQuestionQueue" | "inventoryKeyIds">;

export type RuntimeSnapshot = Omit<SaveState, "battleQuestionQueue"> & {
  currentMap: KitsuneMap;
  diaryEntries: KnowledgeEntry[];
  inventoryKeys: KeyDefinition[];
};

export class GameRuntime {
  private state: SaveState;
  private overlay: RuntimeOverlay = { type: "none" };
  private battleQuestionQueue: string[] = [];

  constructor(private readonly project: KitsuneProject, save?: SaveState | Version1SaveState | LegacySaveState) {
    const startMap = this.requireMap(project.start.mapId);
    const start = startMap.spawns[project.start.spawnId] ?? { x: 1, y: 1 };
    const restored = save ? restoreSave(save) : undefined;
    this.state = restored ?? {
      saveVersion: 2,
      projectId: project.id,
      projectVersion: project.version,
      mapId: startMap.id,
      player: { ...start },
      flags: {},
      diary: [],
      inventoryKeyIds: [],
      overlay: { type: "none" },
      battleQuestionQueue: [],
      updatedAt: new Date().toISOString()
    };
    this.overlay = structuredClone(this.state.overlay);
    this.battleQuestionQueue = [...this.state.battleQuestionQueue];
  }

  snapshot(): RuntimeSnapshot {
    const { battleQuestionQueue: _battleQuestionQueue, ...state } = this.state;
    return {
      ...structuredClone(state),
      overlay: structuredClone(this.overlay),
      currentMap: this.currentMap(),
      diaryEntries: this.state.diary.map((id) => this.requireKnowledge(id)),
      inventoryKeys: (this.project.keys ?? []).filter((key) => this.state.inventoryKeyIds.includes(key.id))
    };
  }

  currentMap(): KitsuneMap {
    return this.requireMap(this.state.mapId);
  }

  move(dx: number, dy: number): boolean {
    if (this.overlay.type !== "none") return false;
    const map = this.currentMap();
    const next = { x: this.state.player.x + dx, y: this.state.player.y + dy };
    if (!isWalkable(map, next)) return false;
    if (this.entityAt(next)?.kind !== "trigger") {
      this.state.player = next;
      this.touch();
      return true;
    }
    this.state.player = next;
    this.interactAt(next);
    this.touch();
    return true;
  }

  interact(): Entity | undefined {
    const adjacent = [
      this.state.player,
      { x: this.state.player.x, y: this.state.player.y - 1 },
      { x: this.state.player.x + 1, y: this.state.player.y },
      { x: this.state.player.x, y: this.state.player.y + 1 },
      { x: this.state.player.x - 1, y: this.state.player.y }
    ];

    for (const position of adjacent) {
      const entity = this.entityAt(position);
      if (entity) {
        this.runEntityInteraction(entity);
        return entity;
      }
    }

    return undefined;
  }

  interactAt(position: Position): Entity | undefined {
    const entity = this.entityAt(position);
    if (entity) {
      this.runEntityInteraction(entity);
    }
    return entity;
  }

  closeOverlay() {
    if (this.overlay.type === "keyAcquisition") {
      this.overlay = this.overlay.nextOverlay;
      this.touch();
      return;
    }
    if (this.overlay.type === "dialogue") {
      this.overlay = this.overlay.nextOverlay ?? { type: "none" };
      this.touch();
      return;
    }
    if (this.overlay.type === "battleConfirmation") {
      this.overlay = { type: "none" };
      this.touch();
    }
  }

  confirmBattle(): ActiveBattle | undefined {
    if (this.overlay.type !== "battleConfirmation") return undefined;
    return this.startBattle(this.overlay.battleId);
  }

  answerBattle(rawAnswer: string): ActiveBattle | undefined {
    if (this.overlay.type !== "battle") return undefined;

    const battle = this.overlay.battle;
    const correct = normalizeAnswer(rawAnswer) === normalizeAnswer(battle.answer);
    const nextBattle: ActiveBattle = {
      ...battle,
      round: battle.round + 1,
      questionsRemaining: Math.max(0, battle.questionsRemaining - 1),
      playerHp: correct ? battle.playerHp : Math.max(0, battle.playerHp - 1),
      result: correct ? "correct" : "incorrect"
    };

    const definition = this.requireBattle(battle.battleId);
    if (nextBattle.playerHp <= 0) {
      nextBattle.result = "defeat";
      this.overlay = { type: "dialogue", messages: [{ text: "Defeat. Review the diary and try again." }] };
      this.touch();
      return nextBattle;
    }

    if (nextBattle.questionsRemaining <= 0) {
      this.state.flags[definition.victoryFlag] = true;
      const acquiredKeyIds = this.grantKeys(definition.rewardKeyIds ?? []);
      nextBattle.result = "victory";
      this.overlay = { type: "dialogue", messages: [{ text: `Victory over ${definition.enemyName}.` }] };
      this.showKeyAcquisition(acquiredKeyIds);
      this.touch();
      return nextBattle;
    }

    const nextQuestion = this.nextBattleQuestion();
    this.overlay = {
      type: "battle",
      battle: {
        ...nextBattle,
        prompt: nextQuestion.prompt,
        answer: nextQuestion.answer,
        knowledgeId: nextQuestion.id
      }
    };
    this.touch();
    return this.overlay.battle;
  }

  saveState(): SaveState {
    return structuredClone({
      ...this.state,
      overlay: this.overlay,
      battleQuestionQueue: this.battleQuestionQueue
    });
  }

  private runEvent(commands: EventCommand[]): boolean {
    const messages: DialogueMessage[] = [];

    for (const command of commands) {
      if (command.type === "dialogue") {
        messages.push({ speaker: command.speaker, text: command.text });
      }

      if (command.type === "grantKnowledge") {
        this.grantKnowledge(command.knowledgeId);
      }

      if (command.type === "setFlag") {
        this.state.flags[command.flag] = command.value;
      }

      if (command.type === "transferMap") {
        this.transfer(command.mapId, command.spawnId);
      }

      if (command.type === "startBattle") {
        const battle = this.requireBattle(command.battleId);
        if (!this.hasRequiredKey(battle.lock?.keyId)) {
          this.overlay = { type: "dialogue", messages: [{ text: battle.lock!.missingKeyMessage }] };
          this.touch();
          return false;
        }
        this.overlay = { type: "battleConfirmation", battleId: battle.id, message: battle.confirmationMessage };
        this.touch();
        return true;
      }

      if (command.type === "branch") {
        const conditionMet = command.condition.type === "battlePassed"
          ? this.state.flags[this.requireBattle(command.condition.battleId).victoryFlag] === true
          : this.state.inventoryKeyIds.includes(command.condition.keyId);
        const branchCommands = conditionMet ? command.then : command.else ?? [];
        return this.runEvent(branchCommands);
      }
    }

    this.overlay = messages.length > 0 ? { type: "dialogue", messages } : { type: "none" };
    this.touch();
    return true;
  }

  private runEntityInteraction(entity: Entity) {
    if (!this.hasRequiredKey(entity.lock?.keyId)) {
      this.overlay = { type: "dialogue", messages: [{ text: entity.lock!.missingKeyMessage }] };
      this.touch();
      return;
    }
    if (this.runEvent(entity.event)) {
      this.showKeyAcquisition(this.grantKeys(entity.rewardKeyIds ?? []));
      this.touch();
    }
  }

  private startBattle(battleId: string): ActiveBattle {
    const battle = this.requireBattle(battleId);
    this.battleQuestionQueue = shuffle(battle.requiredKnowledgeIds);
    const firstQuestion = this.nextBattleQuestion();
    this.overlay = {
      type: "battle",
      battle: {
        battleId: battle.id,
        enemyName: battle.enemyName,
        playerHp: this.project.player.maxHp,
        questionsRemaining: battle.requiredKnowledgeIds.length,
        prompt: firstQuestion.prompt,
        answer: firstQuestion.answer,
        knowledgeId: firstQuestion.id,
        round: 0
      }
    };
    this.touch();
    return this.overlay.battle;
  }

  private nextBattleQuestion(): KnowledgeEntry {
    const knowledgeId = this.battleQuestionQueue.shift();
    if (!knowledgeId) throw new Error("Battle has no remaining questions");
    return this.requireKnowledge(knowledgeId);
  }

  private grantKnowledge(knowledgeId: string) {
    this.requireKnowledge(knowledgeId);
    if (!this.state.diary.includes(knowledgeId)) {
      this.state.diary.push(knowledgeId);
    }
  }

  private grantKeys(keyIds: string[]): string[] {
    const acquiredKeyIds: string[] = [];
    for (const keyId of keyIds) {
      this.requireKey(keyId);
      if (!this.state.inventoryKeyIds.includes(keyId)) {
        this.state.inventoryKeyIds.push(keyId);
        acquiredKeyIds.push(keyId);
      }
    }
    return acquiredKeyIds;
  }

  private showKeyAcquisition(keyIds: string[]) {
    if (keyIds.length === 0) return;
    if (this.overlay.type === "dialogue") {
      this.overlay.nextOverlay = { type: "keyAcquisition", keyIds, nextOverlay: { type: "none" } };
      return;
    }
    this.overlay = { type: "keyAcquisition", keyIds, nextOverlay: this.overlay };
  }

  private hasRequiredKey(keyId: string | undefined): boolean {
    return !keyId || this.state.inventoryKeyIds.includes(keyId);
  }

  private transfer(mapId: string, spawnId: string) {
    const map = this.requireMap(mapId);
    const spawn = map.spawns[spawnId];
    if (!spawn) {
      throw new Error(`Missing spawn "${spawnId}" on map "${mapId}"`);
    }
    this.state.mapId = mapId;
    this.state.player = { ...spawn };
  }

  private entityAt(position: Position): Entity | undefined {
    return this.currentMap().entities.find((entity) => entity.position.x === position.x && entity.position.y === position.y);
  }

  private requireMap(mapId: string): KitsuneMap {
    const map = this.project.maps.find((candidate) => candidate.id === mapId);
    if (!map) throw new Error(`Missing map "${mapId}"`);
    return map;
  }

  private requireKnowledge(knowledgeId: string): KnowledgeEntry {
    const entry = this.project.knowledge.find((candidate) => candidate.id === knowledgeId);
    if (!entry) throw new Error(`Missing knowledge "${knowledgeId}"`);
    return entry;
  }

  private requireBattle(battleId: string): BattleDefinition {
    const battle = this.project.battles.find((candidate) => candidate.id === battleId);
    if (!battle) throw new Error(`Missing battle "${battleId}"`);
    return battle;
  }

  private requireKey(keyId: string): KeyDefinition {
    const key = (this.project.keys ?? []).find((candidate) => candidate.id === keyId);
    if (!key) throw new Error(`Missing key "${keyId}"`);
    return key;
  }

  private touch() {
    this.state.overlay = structuredClone(this.overlay);
    this.state.battleQuestionQueue = [...this.battleQuestionQueue];
    this.state.updatedAt = new Date().toISOString();
  }
}

export function createSaveKey(project: Pick<KitsuneProject, "id" | "version">): string {
  return `kitsune-save:${project.id}:${project.version}`;
}

export function isWalkable(map: KitsuneMap, position: Position): boolean {
  if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) {
    return false;
  }
  if (tileNumber(map.layers.collision.tiles[position.y]?.[position.x] ?? 0) > 0) {
    return false;
  }
  return !map.entities.some(
    (entity) => entity.collidable !== false && entity.position.x === position.x && entity.position.y === position.y
  );
}

export function normalizeAnswer(answer: string): string {
  return answer.trim().toLocaleLowerCase();
}

function tileNumber(tile: TileValue): number {
  return typeof tile === "number" ? tile : tile.tile;
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function restoreSave(save: SaveState | Version1SaveState | LegacySaveState): SaveState {
  if ("saveVersion" in save && save.saveVersion === 2) {
    return structuredClone(save);
  }
  if ("saveVersion" in save && save.saveVersion === 1) {
    return {
      ...structuredClone(save),
      saveVersion: 2,
      inventoryKeyIds: []
    };
  }
  return {
    ...structuredClone(save),
    saveVersion: 2,
    overlay: { type: "none" },
    battleQuestionQueue: [],
    inventoryKeyIds: []
  };
}
