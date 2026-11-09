// iCalendar times. Always UTC ("…Z"): an absolute instant every calendar
// app places correctly, whatever zone the tournament or the reader is in.
export function icsTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
