export const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance",
  "Retail",
  "Manufacturing",
  "Real Estate",
  "Consulting",
  "Education",
  "Transportation",
  "Hospitality",
  "Media & Entertainment",
  "Energy",
  "Construction",
  "Telecommunications",
  "Agriculture",
  "Automotive",
  "Pharmaceuticals",
  "Food & Beverage",
  "Legal Services",
  "Marketing & Advertising",
  "Insurance",
  "Other"
] as const;

export type Industry = typeof INDUSTRIES[number];
