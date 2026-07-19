import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn-style class-name merge helper (clsx + tailwind-merge,
 * already a project dependency for the first, added for the second) —
 * added specifically so components authored against the shadcn/ui
 * convention (which import `cn` from "@/lib/utils") drop in without
 * modification. The rest of this codebase's own components use `clsx`
 * directly instead; this doesn't replace that, it's additive for
 * shadcn-sourced components. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
