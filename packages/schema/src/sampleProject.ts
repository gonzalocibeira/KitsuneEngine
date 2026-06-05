import { createEmptyLayer, type KitsuneProject } from "./index";

const width = 14;
const height = 10;

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
      placeholder: { key: "placeholder", label: "Bundled Placeholder Tiles" }
    },
    sprites: {
      hero: { key: "hero", label: "Hero" },
      npc: { key: "npc", label: "Guide NPC" },
      object: { key: "object", label: "Knowledge Object" },
      door: { key: "door", label: "Door" },
      trigger: { key: "trigger", label: "Battle Trigger" }
    }
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
      requiredKnowledgeIds: ["observe", "attention", "spacing", "context"],
      playerHp: 3,
      enemyHp: 3
    }
  ]
};
