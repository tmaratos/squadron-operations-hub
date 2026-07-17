export const functionalAreas = [
  { key: "command", name: "Command" },
  { key: "administration", name: "Administration" },
  { key: "personnel", name: "Personnel" },
  { key: "finance", name: "Finance" },
  { key: "logistics", name: "Logistics" },
  { key: "safety", name: "Safety" },
  { key: "aerospace-education", name: "Aerospace Education" },
  { key: "cadet-programs", name: "Cadet Programs" },
  { key: "emergency-services", name: "Emergency Services" },
  { key: "communications", name: "Communications" },
  { key: "it-systems", name: "IT and Systems" },
  { key: "public-affairs", name: "Public Affairs" },
  { key: "recruiting-retention", name: "Recruiting and Retention" },
  { key: "professional-development", name: "Professional Development" },
  { key: "transportation", name: "Transportation" },
  { key: "testing", name: "Testing" },
  { key: "historian", name: "Historian" },
  { key: "supply", name: "Supply" }
] as const;

export const functionalAreaKeys = functionalAreas.map((area) => area.key);

export type FunctionalAreaKey = (typeof functionalAreas)[number]["key"];
