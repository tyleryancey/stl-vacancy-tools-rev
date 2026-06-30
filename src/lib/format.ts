// Display helpers ported from the original (REVERSE-ENGINEERING.md §10.5).

export function toTitleCase(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Owner-name abbreviation fix-ups the original applies after title-casing.
export function fixOwnerName(name: string): string {
  let s = toTitleCase(name);
  s = s.replace(/\bLra\b/g, "LRA");
  s = s.replace(/\bLcra\b/g, "LCRA");
  s = s.replace(/\bLlc\b/g, "LLC");
  s = s.replace(/\bL L C\b/g, "LLC");
  s = s.replace(/\bInc\b/g, "Inc");
  s = s.replace(/\bBoe\b/g, "Board of Education");
  s = s.replace(/\bUsa\b/g, "USA");
  return s;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function numberWithCommas(x: number): string {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
