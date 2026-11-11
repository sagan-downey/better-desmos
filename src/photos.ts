import { compileExpression, graphRelation } from "./math";

export interface Photo {
  id: number;
  name: string;
  source: string;
  centerX: string;
  centerY: string;
  rotation: string;
  rotationUnit: "radians" | "degrees";
  width: string;
  height: string;
  initialWidth: number;
  initialHeight: number;
  opacity: number;
  hidden: boolean;
  folderId?: number;
}

export const PHOTO_FIELDS = [
  ["centerX", "Center X"], ["centerY", "Center Y"], ["rotation", "Rotation"],
  ["width", "X scale"], ["height", "Y scale"],
] as const;
export const MAX_PHOTO_BYTES = 2_000_000;
export const MAX_PHOTO_PIXELS = 16_000_000;
export const MAX_TOTAL_PHOTO_PIXELS = 32_000_000;
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function isPhotoSource(source: string): boolean {
  const header = /^data:image\/(?:png|jpeg|webp|gif);base64,/.exec(source);
  if (!header) return false;
  const data = source.slice(header[0].length);
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return data.length > 0 && data.length % 4 === 0 &&
    data.length / 4 * 3 - padding <= MAX_PHOTO_BYTES &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(data);
}

export function parsePhotos(value: unknown): Photo[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error("Projects may contain at most 50 photos.");
  }
  let sourceLength = 0;
  const ids = new Set<number>();
  return value.map((item: unknown): Photo => {
    if (typeof item !== "object" || item === null) throw new Error("Project contains an invalid photo.");
    const photo = item as Record<string, unknown>;
    if (typeof photo.id !== "number" || !Number.isSafeInteger(photo.id) || photo.id < 1 ||
        ids.has(photo.id) || typeof photo.name !== "string" || photo.name.length > 100 ||
        typeof photo.source !== "string" ||
        photo.source.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 32 ||
        !isPhotoSource(photo.source) ||
        PHOTO_FIELDS.some(([key]) => typeof photo[key] !== "string" || String(photo[key]).length > 512) ||
        [photo.initialWidth, photo.initialHeight].some((size) =>
          size !== undefined && (typeof size !== "number" || !Number.isFinite(size) || size <= 0)) ||
        (photo.initialWidth === undefined) !== (photo.initialHeight === undefined) ||
        (photo.rotationUnit !== "radians" && photo.rotationUnit !== "degrees") ||
        typeof photo.opacity !== "number" || !Number.isFinite(photo.opacity) ||
        photo.opacity < 0 || photo.opacity > 1 || typeof photo.hidden !== "boolean" ||
        (photo.folderId !== undefined && (typeof photo.folderId !== "number" ||
          !Number.isSafeInteger(photo.folderId) || photo.folderId < 1))) {
      throw new Error("Project contains an invalid photo.");
    }
    ids.add(photo.id);
    sourceLength += photo.source.length;
    if (sourceLength > 4_000_000) throw new Error("Embedded photos must total at most 4 MB of project data.");
    return {
      id: photo.id, name: photo.name, source: photo.source,
      centerX: String(photo.centerX), centerY: String(photo.centerY),
      rotation: String(photo.rotation), rotationUnit: photo.rotationUnit,
      width: String(photo.width), height: String(photo.height),
      // Earlier photo projects stored absolute dimensions; a unit baseline preserves them.
      initialWidth: photo.initialWidth === undefined ? 1 : Number(photo.initialWidth),
      initialHeight: photo.initialHeight === undefined ? 1 : Number(photo.initialHeight),
      opacity: photo.opacity, hidden: photo.hidden,
      folderId: photo.folderId as number | undefined,
    };
  });
}

export interface PhotoTransform {
  centerX: number;
  centerY: number;
  rotation: number;
  width: number;
  height: number;
}

export function photoLocalPoint(transform: PhotoTransform, x: number, y: number): [number,number] {
  const dx=x-transform.centerX,dy=y-transform.centerY;
  return [dx*Math.cos(transform.rotation)+dy*Math.sin(transform.rotation),
    -dx*Math.sin(transform.rotation)+dy*Math.cos(transform.rotation)];
}

export function photoDragTransform(
  transform: PhotoTransform, mode: "move"|"scale"|"rotate",
  start: [number,number], end: [number,number],
): PhotoTransform {
  const result={...transform};
  if(mode==="move"){
    result.centerX+=end[0]-start[0];result.centerY+=end[1]-start[1];
  }else if(mode==="rotate"){
    const a=photoLocalPoint(transform,...start),b=photoLocalPoint(transform,...end);
    if(Math.hypot(...a)<1e-10||Math.hypot(...b)<1e-10)throw new Error("Rotate a photo from a point away from its center.");
    result.rotation+=Math.atan2(b[1],b[0])-Math.atan2(a[1],a[0]);
  }else{
    const a=photoLocalPoint(transform,...start),b=photoLocalPoint(transform,...end);
    if(Math.abs(a[0])<1e-10||Math.abs(a[1])<1e-10)throw new Error("Resize a photo from a point away from its center axes.");
    result.width*=b[0]/a[0];result.height*=b[1]/a[1];
  }
  if(!Object.values(result).every(Number.isFinite))throw new Error("Photo manipulation exceeds the supported numeric range.");
  return result;
}

export function evaluatePhotoTransform(
  photo: Photo,
  variables: Record<string, number>,
  expand: (source: string) => string = (source) => source,
): PhotoTransform {
  const values: PhotoTransform = { centerX: 0, centerY: 0, rotation: 0, width: 0, height: 0 };
  for (const [key, label] of PHOTO_FIELDS) {
    try {
      const source = expand(photo[key]);
      const names = source.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? [];
      if (names.some((name) => ["x", "y", "t"].includes(name.toLowerCase())) || graphRelation(source)) {
        throw new Error("Use a scalar expression without x, y, t, or an equation.");
      }
      const value = compileExpression(source, variables)(0).value.toNumber();
      if (!Number.isFinite(value)) throw new Error("Value must be finite.");
      const dimension = key === "width" ? value * photo.initialWidth
        : key === "height" ? value * photo.initialHeight : value;
      if (!Number.isFinite(dimension)) throw new Error("Scaled size must be finite.");
      values[key] = dimension;
    } catch (reason) {
      throw new Error(`${label}: ${reason instanceof Error ? reason.message : "Could not evaluate value."}`);
    }
  }
  if (photo.rotationUnit === "degrees") values.rotation = values.rotation / 180 * Math.PI;
  return values;
}

// The image's downward Y axis maps to the graph's upward Y axis before rotation.
export function photoMatrix(
  photo: PhotoTransform, centerX: number, centerY: number,
  scaleX: number, scaleY: number, width: number, height: number,
): [number, number, number, number, number, number] {
  const cos = Math.cos(photo.rotation);
  const sin = Math.sin(photo.rotation);
  const matrix: [number, number, number, number, number, number] = [
    cos * photo.width * scaleX, -sin * photo.width * scaleY,
    sin * photo.height * scaleX, cos * photo.height * scaleY,
    width / 2 + (photo.centerX - centerX) * scaleX,
    height / 2 - (photo.centerY - centerY) * scaleY,
  ];
  if (!matrix.every(Number.isFinite)) throw new Error("Photo transform exceeds the supported numeric range.");
  return matrix;
}
