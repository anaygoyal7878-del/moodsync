import { Leaf, Target, Moon, Zap, RefreshCw, Wind, type LucideIcon } from 'lucide-react';
import type { WellnessStateMeta } from '../../data/wellnessStates';

const iconMap: Record<WellnessStateMeta['icon'], LucideIcon> = {
  Leaf,
  Target,
  Moon,
  Zap,
  RefreshCw,
  Wind,
};

export function StateIcon({ icon, className }: { icon: WellnessStateMeta['icon']; className?: string }) {
  const Icon = iconMap[icon];
  return <Icon className={className} aria-hidden="true" />;
}
