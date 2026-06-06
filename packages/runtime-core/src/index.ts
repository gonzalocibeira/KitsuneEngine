import type { BattleDefinition, Entity, EventCommand, KitsuneMap, KitsuneProject, KnowledgeEntry, Position, TileValue } from "@kitsune/schema";

export type DialogueMessage = {
  speaker?: string;
  text: string;
};

export type RuntimeOverlay =
  | { type: "dialogue"; messages: DialogueMessage[] }
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
  projectId: string;
  projectVersion: string;
  mapId: string;
  player: Position;
  flags: Record<string, boolean>;
  diary: string[];
  updatedAt: string;
};

export type RuntimeSnapshot = SaveState & {
  overlay: RuntimeOverlay;
  currentMap: KitsuneMap;
  diaryEntries: KnowledgeEntry[];
};

export class GameRuntime {
  private state: SaveState;
  private overlay: RuntimeOverlay = { type: "none" };
  private battleQuestionQueue: string[] = [];

  constructor(private readonly project: KitsuneProject, save?: SaveState) {
    const startMap = this.requireMap(project.start.mapId);
    const start = startMap.spawns[project.start.spawnId] ?? { x: 1, y: 1 };
    this.state = save ?? {
      projectId: project.id,
      projectVersion: project.version,
      mapId: startMap.id,
      player: { ...start },
      flags: {},
      diary: [],
      updatedAt: new Date().toISOString()
    };
  }

  snapshot(): RuntimeSnapshot {
    return {
      ...structuredClone(this.state),
      overlay: structuredClone(this.overlay),
      currentMap: this.currentMap(),
      diaryEntries: this.state.diary.map((id) => this.requireKnowledge(id))
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
        this.runEvent(entity.event);
        return entity;
      }
    }

    return undefined;
  }

  interactAt(position: Position): Entity | undefined {
    const entity = this.entityAt(position);
    if (entity) {
      this.runEvent(entity.event);
    }
    return entity;
  }

  closeOverlay() {
    if (this.overlay.type === "dialogue") {
      this.overlay = { type: "none" };
      this.touch();
    }
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
      nextBattle.result = "victory";
      this.overlay = { type: "dialogue", messages: [{ text: `Victory over ${definition.enemyName}.` }] };
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
    return structuredClone(this.state);
  }

  private runEvent(commands: EventCommand[]) {
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
        if (messages.length > 0) {
          this.overlay = { type: "dialogue", messages };
        }
        this.startBattle(command.battleId);
        return;
      }

      if (command.type === "branch") {
        const branchCommands = this.state.flags[command.flag] === command.expected ? command.then : command.else ?? [];
        this.runEvent(branchCommands);
        return;
      }
    }

    this.overlay = messages.length > 0 ? { type: "dialogue", messages } : { type: "none" };
    this.touch();
  }

  private startBattle(battleId: string) {
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

  private touch() {
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
  return tileNumber(map.layers.collision.tiles[position.y]?.[position.x] ?? 0) === 0;
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
