import { Wind, Brain, Sunrise, Moon, Dumbbell, HeartPulse, Zap } from "lucide-react";

/** Purely decorative — matches a rule's real name against the same kind
 * of keywords the Alexa skill uses to find a rule for a named voice
 * command (see integrations/alexa/src/intents.ts's
 * NAMED_RULE_INTENT_KEYWORDS), not a claim about the rule's actual
 * content. A rule named anything else just gets the generic icon. */
const KEYWORD_ICONS: Array<{ keywords: string[]; icon: typeof Wind }> = [
  { keywords: ["relax", "calm", "stress"], icon: Wind },
  { keywords: ["focus"], icon: Brain },
  { keywords: ["sleep", "bed", "night"], icon: Moon },
  { keywords: ["morning", "wake", "sunrise"], icon: Sunrise },
  { keywords: ["workout", "exercise"], icon: Dumbbell },
  { keywords: ["recovery"], icon: HeartPulse },
];

export function iconForRuleName(name: string): typeof Wind {
  const lower = name.toLowerCase();
  return KEYWORD_ICONS.find((entry) => entry.keywords.some((k) => lower.includes(k)))?.icon ?? Zap;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
