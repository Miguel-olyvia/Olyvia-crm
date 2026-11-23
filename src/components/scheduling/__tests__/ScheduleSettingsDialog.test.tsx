import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

const settings = {
  id: "s1",
  organization_id: "org",
  country_code: "PT",
  timezone: "Europe/Lisbon",
  week_starts_on: 1,
  weekend_color: "#f3f4f6",
  holiday_color: "#fef3c7",
  show_weekends: true,
  show_holidays: true,
  working_hours_start: "09:00",
  working_hours_end: "18:00",
  working_days: [1, 2, 3, 4, 5],
  notify_client_on_reschedule: false,
  notify_client_on_reassign: false,
  reschedule_notify_email: true,
  reschedule_notify_sms: false,
  reschedule_email_template_id: null,
  reschedule_sms_message: null,
  reassign_notify_email: true,
  reassign_notify_sms: false,
  reassign_email_template_id: null,
  reassign_sms_message: null,
  notify_client_smtp_id: null,
  notify_client_sms_include_link: false,
  lunch_window_start: null,
  lunch_window_end: null,
  lunch_duration_minutes: null,
};

vi.mock("@/hooks/useScheduleSettings", () => ({
  useScheduleSettings: () => ({
    settings,
    holidays: [],
    loading: false,
    saveSettings: vi.fn(),
    addHoliday: vi.fn(),
    deleteHoliday: vi.fn(),
  }),
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key, language: "pt" }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => {
  const empty = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => Promise.resolve({ data: [], error: null });
    return chain;
  };
  return { supabase: { from: empty } };
});

import { ScheduleSettingsDialog } from "../ScheduleSettingsDialog";

describe("ScheduleSettingsDialog: separador de notificacoes", () => {
  it("nao tem o interruptor 'confirmar visitas criadas no CRM' (a confirmacao configura-se no formulario)", async () => {
    const { container } = render(<ScheduleSettingsDialog open onOpenChange={vi.fn()} companyId="org" />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "scheduling.settings.notifications" }), { button: 0 });

    // o separador abriu: os avisos de reagendamento estao la
    await waitFor(() => expect(document.getElementById("notify-reschedule")).not.toBeNull());

    expect(document.getElementById("send-confirmation-on-confirm")).toBeNull();
    expect(screen.queryByText("visitConfirmation.settings.label")).toBeNull();
    expect(screen.queryByText("visitConfirmation.settings.help")).toBeNull();
    expect(container.innerHTML).not.toContain("send-confirmation-on-confirm");
  });
});
