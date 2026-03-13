/**
 * Sanitize a patch name for PreenFM3 display.
 * - Strips any character outside printable ASCII (0x20–0x7E).
 * - Truncates to 12 characters (PreenFM3 hardware limit).
 */
export function sanitizePatchName(name: string): string {
  return name
    .replace(/[^\x20-\x7E]/g, '')  // keep only printable ASCII
    .slice(0, 12);
}
