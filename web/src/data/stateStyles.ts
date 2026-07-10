import type { WellnessStateId } from '../types/domain';

/**
 * Tailwind's content scanner only picks up literal class-name strings, not
 * template-literal-constructed ones like `bg-state-${id}`. Centralizing the
 * full literal strings here (rather than building them dynamically in each
 * component) is what makes the JIT compiler actually generate this CSS.
 */
export const stateBgClass: Record<WellnessStateId, string> = {
  relax: 'bg-state-relax',
  focus: 'bg-state-focus',
  sleep: 'bg-state-sleep',
  energize: 'bg-state-energize',
  recover: 'bg-state-recover',
  meditate: 'bg-state-meditate',
};

export const stateBgSoftClass: Record<WellnessStateId, string> = {
  relax: 'bg-state-relax/15',
  focus: 'bg-state-focus/15',
  sleep: 'bg-state-sleep/15',
  energize: 'bg-state-energize/15',
  recover: 'bg-state-recover/15',
  meditate: 'bg-state-meditate/15',
};

export const stateTextClass: Record<WellnessStateId, string> = {
  relax: 'text-state-relax',
  focus: 'text-state-focus',
  sleep: 'text-state-sleep',
  energize: 'text-state-energize',
  recover: 'text-state-recover',
  meditate: 'text-state-meditate',
};

export const stateBorderClass: Record<WellnessStateId, string> = {
  relax: 'border-state-relax',
  focus: 'border-state-focus',
  sleep: 'border-state-sleep',
  energize: 'border-state-energize',
  recover: 'border-state-recover',
  meditate: 'border-state-meditate',
};

export const stateHexColor: Record<WellnessStateId, string> = {
  relax: '#2DD4A7',
  focus: '#5B8CFF',
  sleep: '#9B87F5',
  energize: '#FFB454',
  recover: '#5CDB8C',
  meditate: '#E68FD0',
};
