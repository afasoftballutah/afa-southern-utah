import { formatSignRecord } from "@/lib/sign-audit";

function formatDob(iso) {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, m, d] = s.split("-");
  return `${m}/${d}/${y}`;
}

/**
 * Hidden table Print PDF reads. One row per player with the waiver fields
 * plus the signature image.
 */
export default function RosterPrintSheet({ members = [] }) {
  const rows = (members ?? []).filter((m) => !m.removed);
  if (rows.length === 0) return null;

  return (
    <table data-print-roster className="hidden">
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>M/F</th>
          <th>DOB</th>
          <th>Address</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Signed</th>
          <th>Signature</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => {
          const stamp = m.signed
            ? formatSignRecord({
                signedAt: m.signedAt,
                signedPlace: m.signedPlace,
              }) || "Signed"
            : "—";
          return (
            <tr key={m.id}>
              <td>{m.name || "—"}</td>
              <td>{m.role || "player"}</td>
              <td>{m.gender || "—"}</td>
              <td>{formatDob(m.birthDate)}</td>
              <td>{m.address || "—"}</td>
              <td>{m.email || "—"}</td>
              <td>{m.phone || "—"}</td>
              <td>{stamp}</td>
              <td>
                {m.signaturePng ? (
                  <img src={m.signaturePng} alt="" />
                ) : (
                  "—"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
