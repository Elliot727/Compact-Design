/**
 * Visual theme for the design system sheet. Every colour, type size and
 * spacing the sheet's own chrome uses lives here, so system-sheet.ts holds no
 * hex literal except the inventory values it displays.
 */
export const SHEET_THEME = {
  colour: {
    background: "#F6F6F7",
    card: "#FFFFFF",
    text: "#101828",
    muted: "#667085",
    divider: "#E4E7EC",
    accent: "#444CE7",
    /** Pill fills and the unresolved note (supporting tints of the six above). */
    accentTint: "#EEF4FF",
    rawTint: "#F2F4F7",
    warning: "#B54708",
    warningTint: "#FFFAEB"
  },
  font: {
    family: "Inter",
    mono: "Roboto Mono"
  },
  type: {
    eyebrow: { style: "Semi Bold", size: 12 },
    title: { style: "Bold", size: 40 },
    sectionHeading: { style: "Semi Bold", size: 22 },
    subheading: { style: "Semi Bold", size: 13 },
    body: { style: "Regular", size: 14 },
    label: { style: "Medium", size: 12 },
    caption: { style: "Regular", size: 12 },
    stat: { style: "Semi Bold", size: 28 },
    monoValue: { style: "Medium", size: 13 }
  },
  space: {
    pageMargin: 64,
    sectionGutter: 64,
    gridGutter: 24,
    cardPadding: 16
  },
  grid: { columns: 12, column: 70 },
  cardRadius: 12,
  pillRadius: 999
} as const;

export type SheetTheme = typeof SHEET_THEME;
