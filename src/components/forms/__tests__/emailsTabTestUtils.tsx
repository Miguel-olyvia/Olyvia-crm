// Apoio dos testes do separador «Emails» por idioma (não é um teste: sem sufixo .test).
import { vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FormEmailsTab, type EmailsTabFields } from "../FormEmailsTab";

// Radix Select precisa disto no jsdom
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

export const base: EmailsTabFields = {
  confirmation_email_enabled: true,
  confirmation_email_template_id: null,
  confirmation_sms_enabled: false,
  confirmation_sms_message: "",
  confirmation_sms_include_link: false,
  meeting_notify_commercial: true,
  meeting_notify_emails: "",
  meeting_notify_template_id: null,
  reschedule_notify_client: true,
  reschedule_notify_commercial: true,
  reschedule_notify_emails: "",
  reschedule_client_template_id: null,
  reschedule_technician_template_id: null,
  cancel_notify_client: true,
  cancel_notify_commercial: true,
  cancel_notify_emails: "",
  cancel_client_template_id: null,
  cancel_technician_template_id: null,
  reminder_enabled: true,
  reminder_hours_before: 2,
  reminder_template_id: null,
  reminder_technician_enabled: null,
  reminder_technician_hours_before: null,
  reminder_technician_template_id: null,
  scheduling_invite_enabled: false,
  scheduling_invite_delays_hours: "24",
  email_smtp_id: null,
  booking_manage_url_template: "",
  public_form_url_template: "",
};

export const OPTIONS = [
  { id: "t1", name: "Modelo A" },
  { id: "t2", name: "Modelo B" },
];

export function renderTab(branding: EmailsTabFields = base, activeLocales?: string[]) {
  const onChange = vi.fn();
  render(
    <FormEmailsTab
      branding={branding}
      onChange={onChange}
      emailTemplateOptions={OPTIONS}
      smtpOptions={[]}
      activeLocales={activeLocales}
    />,
  );
  return { onChange };
}

export const confirmationGroup = (name = "Email de confirmação: modelos por idioma") =>
  screen.getByRole("group", { name });

export const box = (language: string) =>
  within(confirmationGroup()).getByRole("combobox", { name: `Modelo de email — ${language}` });

export function openAndPick(trigger: HTMLElement, optionName: string | RegExp) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.findByRole("option", { name: optionName }).then((opt) => fireEvent.click(opt));
}
