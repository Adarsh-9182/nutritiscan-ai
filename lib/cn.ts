import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting later Tailwind utilities win over
 * earlier conflicting ones.
 *
 * The `twMerge` half is what makes component variants
 * composable: `<Button className="px-6">` has to be able to
 * override the variant's own `px-4` rather than depending on
 * source order in the stylesheet.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
