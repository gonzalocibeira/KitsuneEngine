import { createEmptyLayer, type KitsuneProject } from "./index";

const width = 14;
const height = 10;
const tinyDungeonSheet = "/assets/kenney/tiny-dungeon/Tilemap/tilemap_packed.png";
const tinyTownSheet = "/assets/kenney/tiny-town/Tilemap/tilemap_packed.png";
const rpgUrbanSheet = "/assets/kenney/rpg-urban-pack/Tilemap/tilemap_packed.png";

function sprite(key: string, label: string, image: string, frame: number) {
  return { key, label, image, frameWidth: 16, frameHeight: 16, frame, columns: 12, rows: 11 };
}

const ground = createEmptyLayer("ground", "Ground", width, height, 1);
const decor = createEmptyLayer("decor", "Decor", width, height, 0);
const collision = createEmptyLayer("collision", "Collision", width, height, 0);

for (let x = 0; x < width; x += 1) {
  collision.tiles[0][x] = 1;
  collision.tiles[height - 1][x] = 1;
}

for (let y = 0; y < height; y += 1) {
  collision.tiles[y][0] = 1;
  collision.tiles[y][width - 1] = 1;
}

decor.tiles[2][3] = 2;
decor.tiles[4][6] = 3;
decor.tiles[6][9] = 2;

export const sampleProject: KitsuneProject = {
  schemaVersion: 0,
  id: "sample-learning-quest",
  title: "The Archivist's Trial",
  version: "0.1.0",
  assets: {
    tilesets: {
      "kenney-tiny-town": {
        key: "kenney-tiny-town",
        label: "Kenney Tiny Town",
        image: tinyTownSheet,
        tileSize: 16,
        columns: 12,
        rows: 11
      },
      "kenney-tiny-dungeon": {
        key: "kenney-tiny-dungeon",
        label: "Kenney Tiny Dungeon",
        image: tinyDungeonSheet,
        tileSize: 16,
        columns: 12,
        rows: 11
      },
      "kenney-rpg-urban-pack": {
        key: "kenney-rpg-urban-pack",
        label: "Kenney RPG Urban Pack",
        image: rpgUrbanSheet,
        tileSize: 16,
        columns: 27,
        rows: 18
      }
    },
    sprites: {
      hero: sprite("hero", "Tiny Dungeon frame 73", tinyDungeonSheet, 72),
      npc: sprite("npc", "Tiny Dungeon frame 74", tinyDungeonSheet, 73),
      "npc-frame-75": sprite("npc-frame-75", "Tiny Dungeon frame 75", tinyDungeonSheet, 74),
      "npc-frame-76": sprite("npc-frame-76", "Tiny Dungeon frame 76", tinyDungeonSheet, 75),
      "npc-frame-85": sprite("npc-frame-85", "Tiny Dungeon frame 85", tinyDungeonSheet, 84),
      "npc-frame-86": sprite("npc-frame-86", "Tiny Dungeon frame 86", tinyDungeonSheet, 85),
      "npc-frame-87": sprite("npc-frame-87", "Tiny Dungeon frame 87", tinyDungeonSheet, 86),
      "npc-frame-88": sprite("npc-frame-88", "Tiny Dungeon frame 88", tinyDungeonSheet, 87),
      object: sprite("object", "Tiny Town frame 62", tinyTownSheet, 61),
      door: sprite("door", "Tiny Town frame 43", tinyTownSheet, 42),
      trigger: sprite("trigger", "Tiny Dungeon frame 67", tinyDungeonSheet, 66)
    }
  },
  player: {
    name: "Hero",
    spriteKey: "hero",
    maxHp: 3
  },
  start: {
    mapId: "library-yard",
    spawnId: "start"
  },
  maps: [
    {
      id: "library-yard",
      name: "Library Yard",
      width,
      height,
      tileSize: 32,
      tilesetKey: "kenney-tiny-town",
      layers: { ground, decor, collision },
      spawns: {
        start: { x: 2, y: 7 },
        "from-annex": { x: 12, y: 4 }
      },
      entities: [
        {
          id: "guide",
          name: "Archivist",
          kind: "npc",
          position: { x: 4, y: 6 },
          spriteKey: "npc",
          event: [
            { type: "dialogue", speaker: "Archivist", text: "Gather three ideas from the yard, then face the trial stone." },
            { type: "grantKnowledge", knowledgeId: "observe" }
          ]
        },
        {
          id: "lantern",
          name: "Signal Lantern",
          kind: "object",
          position: { x: 3, y: 2 },
          spriteKey: "object",
          event: [
            { type: "dialogue", text: "The lantern marks attention: notice first, name second." },
            { type: "grantKnowledge", knowledgeId: "attention" }
          ]
        },
        {
          id: "fountain",
          name: "Quiet Fountain",
          kind: "object",
          position: { x: 6, y: 4 },
          spriteKey: "object",
          event: [
            { type: "dialogue", text: "Repeating an idea after a pause makes it easier to keep." },
            { type: "grantKnowledge", knowledgeId: "spacing" }
          ]
        },
        {
          id: "annex-door",
          name: "Annex Door",
          kind: "door",
          position: { x: 12, y: 4 },
          spriteKey: "door",
          event: [
            { type: "dialogue", text: "The annex door opens into a quieter study room." },
            { type: "transferMap", mapId: "study-annex", spawnId: "entry" }
          ]
        },
        {
          id: "trial-stone",
          name: "Trial Stone",
          kind: "trigger",
          position: { x: 10, y: 7 },
          spriteKey: "trigger",
          event: [
            {
              type: "branch",
              flag: "trial_complete",
              expected: true,
              then: [{ type: "dialogue", text: "The trial stone is quiet. You already passed." }],
              else: [
                { type: "dialogue", text: "The stone tests whether knowledge has become memory." },
                { type: "startBattle", battleId: "memory-trial" }
              ]
            }
          ]
        }
      ]
    },
    {
      id: "study-annex",
      name: "Study Annex",
      width: 10,
      height: 8,
      tileSize: 32,
      tilesetKey: "kenney-tiny-dungeon",
      layers: {
        ground: createEmptyLayer("ground", "Ground", 10, 8, 1),
        decor: createEmptyLayer("decor", "Decor", 10, 8, 0),
        collision: createEmptyLayer("collision", "Collision", 10, 8, 0)
      },
      spawns: {
        entry: { x: 2, y: 4 }
      },
      entities: [
        {
          id: "annex-note",
          name: "Margin Note",
          kind: "object",
          position: { x: 5, y: 3 },
          spriteKey: "object",
          event: [
            { type: "dialogue", text: "A useful note connects a fact to a context where it matters." },
            { type: "grantKnowledge", knowledgeId: "context" }
          ]
        },
        {
          id: "return-door",
          name: "Return Door",
          kind: "door",
          position: { x: 1, y: 4 },
          spriteKey: "door",
          event: [{ type: "transferMap", mapId: "library-yard", spawnId: "from-annex" }]
        }
      ]
    }
  ],
  knowledge: [
    {
      id: "observe",
      title: "Observe",
      summary: "Notice the thing before trying to memorize it.",
      prompt: "What should happen before naming an idea?",
      answer: "Observe it",
      body: "Observation anchors a new idea in a concrete moment.",
      tags: ["learning", "attention"]
    },
    {
      id: "attention",
      title: "Attention",
      summary: "Focused attention makes an idea available for memory.",
      prompt: "What makes an idea available for memory?",
      answer: "Attention",
      body: "A learner remembers more when attention is deliberate.",
      tags: ["learning"]
    },
    {
      id: "spacing",
      title: "Spacing",
      summary: "Reviewing after a pause strengthens recall.",
      prompt: "What strengthens recall after a pause?",
      answer: "Spacing",
      body: "Spacing turns repeated exposure into stronger recall.",
      tags: ["learning", "memory"]
    },
    {
      id: "context",
      title: "Context",
      summary: "Knowledge is easier to use when tied to a situation.",
      prompt: "What helps knowledge become usable?",
      answer: "Context",
      body: "Context connects facts to real decisions and examples.",
      tags: ["learning", "transfer"]
    }
  ],
  battles: [
    {
      id: "memory-trial",
      name: "Memory Trial",
      enemyName: "Restless Page",
      victoryFlag: "trial_complete",
      requiredKnowledgeIds: ["observe", "attention", "spacing", "context"]
    }
  ]
};
