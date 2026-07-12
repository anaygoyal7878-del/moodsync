import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALEXA_INTENTS, NAMED_RULE_INTENT_KEYWORDS } from './intents.js';

/** Guards against exactly the kind of drift the doc comment in
 * intents.ts warns about: interactionModel.json is uploaded to the Alexa
 * Developer Console by hand (see docs/ALEXA_DEVELOPER_GUIDE.md), so
 * nothing at compile time keeps it in sync with ALEXA_INTENTS unless a
 * test does. */
describe('ALEXA_INTENTS matches interactionModel.json', () => {
  const modelPath = fileURLToPath(new URL('./interactionModel.json', import.meta.url));
  const model = JSON.parse(readFileSync(modelPath, 'utf8'));
  const modelIntentNames: string[] = model.interactionModel.languageModel.intents.map((i: { name: string }) => i.name);

  it('every custom intent constant exists in the interaction model', () => {
    for (const name of Object.values(ALEXA_INTENTS)) {
      expect(modelIntentNames).toContain(name);
    }
  });

  it('every named-rule keyword maps to a real intent constant', () => {
    for (const intentName of Object.keys(NAMED_RULE_INTENT_KEYWORDS)) {
      expect(Object.values(ALEXA_INTENTS)).toContain(intentName);
    }
  });
});
