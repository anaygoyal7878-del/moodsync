import type { ComponentType, ReactNode } from "react";

export interface DockItemData {
  icon: ReactNode;
  label: ReactNode;
  onClick?: () => void;
  className?: string;
}

export interface DockSpringOptions {
  mass?: number;
  stiffness?: number;
  damping?: number;
}

export interface DockProps {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: DockSpringOptions;
}

declare const Dock: ComponentType<DockProps>;
export default Dock;
