import type { WellnessStateId } from '../types/domain';

export interface WellnessStateMeta {
  id: WellnessStateId;
  label: string;
  tagline: string;
  colorVar: string;
  icon: 'Leaf' | 'Target' | 'Moon' | 'Zap' | 'RefreshCw' | 'Wind';
}

export const wellnessStateMeta: Record<WellnessStateId, WellnessStateMeta> = {
  relax: {
    id: 'relax',
    label: 'Relax',
    tagline: 'Signals point to tension you can ease',
    colorVar: 'state-relax',
    icon: 'Leaf',
  },
  focus: {
    id: 'focus',
    label: 'Focus',
    tagline: 'Alert and steady — a good window for deep work',
    colorVar: 'state-focus',
    icon: 'Target',
  },
  sleep: {
    id: 'sleep',
    label: 'Sleep',
    tagline: 'Winding down for rest',
    colorVar: 'state-sleep',
    icon: 'Moon',
  },
  energize: {
    id: 'energize',
    label: 'Energize',
    tagline: 'Low activity signals — a lift could help',
    colorVar: 'state-energize',
    icon: 'Zap',
  },
  recover: {
    id: 'recover',
    label: 'Recover',
    tagline: 'Coming down from exertion',
    colorVar: 'state-recover',
    icon: 'RefreshCw',
  },
  meditate: {
    id: 'meditate',
    label: 'Meditate',
    tagline: 'A mindful moment in progress',
    colorVar: 'state-meditate',
    icon: 'Wind',
  },
};

export const wellnessStateOrder: WellnessStateId[] = [
  'relax',
  'focus',
  'sleep',
  'energize',
  'recover',
  'meditate',
];
