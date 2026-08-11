// Shared constants only — safe for client components (no Supabase).

export const DOC_KINDS = [
  { value: "rules", label: "Rules" },
  { value: "umpire_agreement", label: "Umpire agreement" },
  { value: "waiver", label: "Waiver" },
  { value: "other", label: "Other" },
];

export function kindLabel(kind) {
  return DOC_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function slugifyTitle(title) {
  const base = String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `doc-${Date.now().toString(36)}`;
}
