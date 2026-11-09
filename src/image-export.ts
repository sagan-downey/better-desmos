export const MAX_EXPORT_PIXELS = 16_000_000;

export function imageExportSize(width: number, height: number, resolution: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      !Number.isInteger(resolution) || resolution < 1 || resolution > 4) {
    throw new Error("Choose a resolution from 1x to 4x for a nonempty graph.");
  }
  const result = { width: Math.max(1, Math.round(width * resolution)), height: Math.max(1, Math.round(height * resolution)) };
  if (result.width > 16_384 || result.height > 16_384 || result.width * result.height > MAX_EXPORT_PIXELS) {
    throw new Error("PNG exports are limited to 16 million pixels and 16384 pixels per side. Choose a lower resolution.");
  }
  return result;
}
