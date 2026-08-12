/** Women's / Men's / Coed seat chip — same colors as the division columns. */
export default function DivisionSeatMark({
  genderKey,
  seatLabel,
  genderLabel,
  levelLabel,
  className = "",
}) {
  const key =
    genderKey === "womens" || genderKey === "mens" || genderKey === "coed"
      ? genderKey
      : "";
  const label =
    seatLabel ||
    [genderLabel, levelLabel].filter(Boolean).join(" ") ||
    "";
  if (!label) return null;
  return (
    <span
      className={
        "div-seat-mark " +
        (key ? "div-seat-mark--" + key : "") +
        (className ? " " + className : "")
      }
    >
      {label}
    </span>
  );
}
