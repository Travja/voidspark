import { GAME } from "../engine/data";

const images = import.meta.glob<string>("../assets/img/*.png", { eager: true, import: "default" });
const byId = new Map(Object.entries(images).map(([path, url]) => [path.split("/").pop()!.replace(".png", ""), url]));

export function iconUrl(id: string): string | undefined {
  return byId.get(id);
}

export function displayName(id: string): string {
  return GAME.materials.get(id)?.name ?? GAME.workstations.get(id)?.name ?? id;
}

export function Icon({ id, size = 28, title }: { id: string; size?: number; title?: string }) {
  const url = iconUrl(id);
  const label = title ?? displayName(id);
  if (!url) return <span className="icon icon-missing" style={{ width: size, height: size }} title={label} />;
  return <img className="icon" src={url} width={size} height={size} alt={label} title={label} />;
}
