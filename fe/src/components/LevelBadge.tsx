export function LevelBadge({ name, icon, color }: { name: string; icon?: string; color?: string }) {
  if (!name) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: (color || "#64748b") + "22", color: color || "#64748b" }}
    >
      {icon ? <span>{icon}</span> : null}
      {name}
    </span>
  );
}
