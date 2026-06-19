export type ContactDetailsTab =
  | "info"
  | "edit"
  | "lists"
  | "deals"
  | "proposals"
  | "emails"
  | "timeline"
  | "scoring"
  | "journey";

const EDITABLE_TABS: ContactDetailsTab[] = [
  "info",
  "edit",
  "lists",
  "deals",
  "proposals",
  "emails",
  "timeline",
  "scoring",
  "journey",
];

const READ_ONLY_TABS: ContactDetailsTab[] = [
  "info",
  "deals",
  "proposals",
  "emails",
  "timeline",
  "scoring",
  "journey",
];

export function getContactDetailsVisibleTabs(canEdit: boolean): ContactDetailsTab[] {
  return canEdit ? EDITABLE_TABS : READ_ONLY_TABS;
}

export function resolveContactDetailsActiveTab(
  canEdit: boolean,
  activeTab: ContactDetailsTab,
): ContactDetailsTab {
  return canEdit || activeTab !== "edit" ? activeTab : "info";
}

export function canShowContactCreateActions(canEdit: boolean): boolean {
  return canEdit;
}
