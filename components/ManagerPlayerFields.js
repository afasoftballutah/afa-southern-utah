"use client";

/**
 * Manager-only player entry: first name, last name, gender.
 * Optional knownPlayers list becomes a datalist so they can pick someone
 * already in the directory (manage page) without retyping.
 */
export default function ManagerPlayerFields({
  value,
  onChange,
  knownPlayers = [],
  fieldClass = "form-field",
}) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });

  function pickKnown(raw) {
    const label = String(raw ?? "").trim();
    if (!label) return;
    const hit = knownPlayers.find(
      (p) => p.label === label || p.id === label
    );
    if (!hit) return;
    set({
      firstName: hit.firstName || "",
      lastName: hit.lastName || "",
      gender: hit.gender || v.gender || "",
      playerId: hit.id,
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-afa-ink/75">
        Legal name and address must match a driver&rsquo;s license or other
        official ID. The player confirms that when they sign their waiver.
      </p>
      {knownPlayers.length > 0 && (
        <label className="block">
          <span className="form-label">Pick someone already on file (optional)</span>
          <select
            className={fieldClass}
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              pickKnown(id);
              e.target.value = "";
            }}
          >
            <option value="">— New player —</option>
            {knownPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.gender ? ` (${p.gender})` : ""}
              </option>
            ))}
          </select>
          <span className="t-meta block mt-1">
            Or type a new first and last name below.
          </span>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="form-label">First name</span>
          <input
            className={fieldClass}
            autoComplete="given-name"
            value={v.firstName || ""}
            onChange={(e) =>
              set({ firstName: e.target.value, playerId: null })
            }
            placeholder="First"
          />
        </label>
        <label className="block">
          <span className="form-label">Last name</span>
          <input
            className={fieldClass}
            autoComplete="family-name"
            value={v.lastName || ""}
            onChange={(e) =>
              set({ lastName: e.target.value, playerId: null })
            }
            placeholder="Last"
          />
        </label>
      </div>

      <fieldset>
        <legend className="form-label mb-1">Gender</legend>
        <div className="flex gap-2">
          {[
            { value: "M", label: "M" },
            { value: "F", label: "F" },
          ].map((opt) => {
            const on = v.gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={
                  "flex-1 rounded-lg border-2 px-3 py-2 font-bold text-sm " +
                  (on
                    ? "border-afa-navy bg-afa-navy text-white"
                    : "border-afa-navy/20 bg-white text-afa-navy")
                }
                onClick={() => set({ gender: opt.value })}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function managerPlayerReady(p) {
  return Boolean(
    String(p?.firstName ?? "").trim() &&
      String(p?.lastName ?? "").trim() &&
      (p?.gender === "M" || p?.gender === "F")
  );
}

export function managerPlayerDisplay(p) {
  return [p?.firstName, p?.lastName]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
