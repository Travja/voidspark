import { GAME } from "../engine/data";

const images = import.meta.glob<string>("../assets/img/*.png", { eager: true, import: "default" });
const byId = new Map(Object.entries(images).map(([path, url]) => [path.split("/").pop()!.replace(".png", ""), url]));

export function iconUrl(id: string): string | undefined {
  return byId.get(id);
}

export function displayName(id: string): string {
  return GAME.materials.get(id)?.name ?? GAME.workstations.get(id)?.name ?? id;
}
