import { describe, expect, it } from 'vitest';
import {
  buildCaffeineLogReply,
  classifyInbound,
  deterministicReply,
  buildStatusReply,
  shapeReply,
  CRISIS_REPLY,
  STOP_REPLY,
  MAX_REPLY_CHARS,
} from './messagingAgent.js';

describe('classifyInbound — commands', () => {
  it('recognises the carrier-standard opt-out words', () => {
    for (const word of ['STOP', 'stop', 'Unsubscribe', 'CANCEL', 'quit']) {
      expect(classifyInbound(word).intent).toBe('stop');
    }
  });

  it('recognises opt-in and help', () => {
    expect(classifyInbound('START').intent).toBe('start');
    expect(classifyInbound('yes').intent).toBe('start');
    expect(classifyInbound('HELP').intent).toBe('help');
  });

  it('tolerates trailing punctuation and whitespace', () => {
    expect(classifyInbound('  stop.  ').intent).toBe('stop');
    expect(classifyInbound('help!').intent).toBe('help');
  });

  it('treats a bare 6-digit number as a verification code', () => {
    const result = classifyInbound('482913');
    expect(result.intent).toBe('verify');
    expect(result.code).toBe('482913');
  });

  it('does not treat other numbers as codes', () => {
    expect(classifyInbound('12345').intent).toBe('question');
    expect(classifyInbound('1234567').intent).toBe('question');
    expect(classifyInbound('I slept 8 hours').intent).toBe('question');
  });

  it('routes short status phrasings to the deterministic status reply', () => {
    for (const phrase of ['status', 'how am I doing', 'how am i doing?', 'my numbers', 'check in']) {
      expect(classifyInbound(phrase).intent).toBe('status');
    }
  });

  it('falls through to a question for anything else', () => {
    expect(classifyInbound('why am I so tired today?').intent).toBe('question');
    expect(classifyInbound('should I train this evening').intent).toBe('question');
  });

  it('does not treat a word inside a sentence as a command', () => {
    expect(classifyInbound('I need to stop drinking coffee so late').intent).toBe('question');
    expect(classifyInbound('can you help me understand my hrv').intent).toBe('question');
  });
});

describe('classifyInbound — crisis detection', () => {
  it('catches direct disclosures', () => {
    const phrases = [
      'I want to kill myself',
      'thinking about suicide',
      "I've been hurting myself",
      'I want to die',
      'I want to end things',
      "I don't want to be here anymore",
      'there is no reason to live',
      'been thinking about self harm',
    ];
    for (const phrase of phrases) {
      expect(classifyInbound(phrase).intent, phrase).toBe('crisis');
    }
  });

  it('does not fire on common figurative language', () => {
    const phrases = [
      'this workout is killing me',
      "I'm dying to go to sleep",
      "I'd kill for a coffee right now",
      'my legs are dead after that run',
      'that hill nearly ended me',
      'I killed it at the gym today',
    ];
    for (const phrase of phrases) {
      expect(classifyInbound(phrase).intent, phrase).not.toBe('crisis');
    }
  });

  it('takes precedence over a command word in the same message', () => {
    expect(classifyInbound('stop, I want to kill myself').intent).toBe('crisis');
  });
});

describe('deterministicReply', () => {
  it('answers crisis with resources and never a wellness tip', () => {
    const reply = deterministicReply({ intent: 'crisis' })!;
    expect(reply).toBe(CRISIS_REPLY);
    expect(reply).toContain('988');
    expect(reply).toContain('findahelpline.com');
    expect(reply.toLowerCase()).not.toContain('breathing');
  });

  it('answers stop, start and help without a model', () => {
    expect(deterministicReply({ intent: 'stop' })).toBe(STOP_REPLY);
    expect(deterministicReply({ intent: 'start' })).toContain('back on');
    expect(deterministicReply({ intent: 'help' })).toContain('STOP to unsubscribe');
  });

  it('defers questions and status to the grounded chat path', () => {
    expect(deterministicReply({ intent: 'question' })).toBeNull();
    expect(deterministicReply({ intent: 'status' })).toBeNull();
    expect(deterministicReply({ intent: 'verify', code: '111111' })).toBeNull();
  });
});

describe('buildStatusReply', () => {
  it('reports every metric it has', () => {
    const reply = buildStatusReply({ readiness: 74, energy: 52, sleep: 81, focusToday: null });
    expect(reply).toContain('Readiness 74/100');
    expect(reply).toContain('Energy 52/100');
    expect(reply).toContain('Sleep 81/100');
  });

  it('states a missing metric as missing rather than dropping it', () => {
    const reply = buildStatusReply({ readiness: null, energy: 52, sleep: null, focusToday: null });
    expect(reply).toContain('Readiness: no data yet');
    expect(reply).toContain('Sleep: no data yet');
    expect(reply).toContain('Energy 52/100');
  });

  it('explains the empty case instead of showing three dashes', () => {
    const reply = buildStatusReply({ readiness: null, energy: null, sleep: null, focusToday: null });
    expect(reply).toContain('Nothing has synced');
  });

  it('appends the daily focus line when there is one', () => {
    const reply = buildStatusReply({ readiness: 74, energy: 52, sleep: 81, focusToday: 'Your hardest work.' });
    expect(reply).toContain('Your hardest work.');
  });
});

describe('shapeReply', () => {
  it('leaves a short reply untouched', () => {
    expect(shapeReply('Short and done.')).toBe('Short and done.');
  });

  it('never appends an ellipsis to a reply that fits', () => {
    expect(shapeReply('Fits fine.')).not.toContain('…');
  });

  it('trims at a sentence boundary when there is a usable one', () => {
    const long = `${'A'.repeat(40)}. ${'B'.repeat(400)}. ${'C'.repeat(400)}.`;
    const shaped = shapeReply(long, 500);
    expect(shaped.length).toBeLessThanOrEqual(500);
    expect(shaped.endsWith('.')).toBe(true);
  });

  it('falls back to an ellipsis when no late sentence boundary exists', () => {
    const shaped = shapeReply('X'.repeat(900), 100);
    expect(shaped.length).toBeLessThanOrEqual(101);
    expect(shaped.endsWith('…')).toBe(true);
  });

  it('enforces the default ceiling', () => {
    expect(shapeReply('Y'.repeat(2000)).length).toBeLessThanOrEqual(MAX_REPLY_CHARS + 1);
  });
});

describe('classifyInbound — health logging', () => {
  it('logs a drink when the message reports one', () => {
    const result = classifyInbound('just had a coffee');
    expect(result.intent).toBe('log_caffeine');
    expect(result.mg).toBe(95);
  });

  it('recognises the drinks the app already knows', () => {
    expect(classifyInbound('drank an espresso').mg).toBe(63);
    expect(classifyInbound('had a green tea').mg).toBe(47);
    expect(classifyInbound('had a red bull').mg).toBe(80);
    expect(classifyInbound('had a double espresso').mg).toBe(126);
  });

  it('does NOT log when the user is asking rather than reporting', () => {
    expect(classifyInbound('should I have a coffee?').intent).toBe('question');
    expect(classifyInbound('is coffee bad for my sleep').intent).toBe('question');
    expect(classifyInbound('how much caffeine have I had').intent).toBe('question');
  });

  it('does NOT log an intention to change a habit', () => {
    expect(classifyInbound('I need to stop drinking coffee so late').intent).toBe('question');
    expect(classifyInbound('I should cut down on coffee').intent).toBe('question');
    expect(classifyInbound('going to have a coffee later').intent).toBe('question');
  });

  it('does not log a drink mentioned with no reporting verb', () => {
    expect(classifyInbound('coffee').intent).toBe('question');
  });

  it('never lets logging shadow a crisis message', () => {
    expect(classifyInbound('had a coffee and I want to kill myself').intent).toBe('crisis');
  });
});

describe('buildCaffeineLogReply', () => {
  it('states the amount as an estimate', () => {
    expect(buildCaffeineLogReply(95, 61)).toContain('~95mg');
  });

  it('reports the resulting energy when there is one', () => {
    expect(buildCaffeineLogReply(95, 61)).toContain('61/100');
  });

  it('explains the gap rather than showing a blank when there is no wearable', () => {
    expect(buildCaffeineLogReply(95, null)).toContain('Connect a wearable');
  });
});
