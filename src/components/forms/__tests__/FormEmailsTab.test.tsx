import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FormEmailsTab, type EmailsTabFields } from "../FormEmailsTab";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

const allOn: EmailsTabFields = {
  confirmation_email_enabled: true,
  confirmation_email_template_id: null,
  confirmation_sms_enabled: true,
  confirmation_sms_message: "",
  confirmation_sms_include_link: false,
  meeting_notify_commercial: true,
  meeting_notify_emails: "",
  meeting_notify_template_id: null,
  reschedule_notify_commercial: true,
  reschedule_notify_emails: "",
  reschedule_client_template_id: null,
  reschedule_technician_template_id: null,
  cancel_notify_commercial: true,
  cancel_notify_emails: "",
  cancel_client_template_id: null,
  cancel_technician_template_id: null,
  reminder_enabled: true,
  reminder_hours_before: 2,
  reminder_template_id: null,
  reminder_technician_template_id: null,
  scheduling_invite_enabled: true,
  scheduling_invite_delays_hours: "24",
  email_smtp_id: null,
  booking_manage_url_template: "",
  public_form_url_template: "",
};

function renderTab(branding: EmailsTabFields = allOn, onChange = vi.fn()) {
  render(
    <FormEmailsTab
      branding={branding}
      onChange={onChange}
      emailTemplateOptions={[{ id: "t1", name: "Modelo A" }]}
      smtpOptions={[{ id: "s1", name: "SMTP 1", is_default: true }]}
    />,
  );
  return {
    client: screen.getByRole("group", { name: "Emails para o cliente" }),
    commercial: screen.getByRole("group", { name: "Emails para o comercial" }),
    delivery: screen.getByRole("group", { name: "Envio e links" }),
    onChange,
  };
}

const CLIENT_LABELS = [
  "Email de confirmação",
  "Também por SMS",
  "Mensagem do SMS",
  "Incluir link de gerir/cancelar no SMS",
  "Lembrete antes da visita (cliente e comercial)",
  "Horas de antecedência",
  "Lembrete de agendamento por concluir",
  "Horas após o preenchimento (várias, separadas por vírgula)",
];
const COMMERCIAL_LABELS = [
  "Aviso de reunião ao comercial",
  "Aviso ao comercial ao reagendar",
  "Aviso ao comercial ao cancelar",
];
const DELIVERY_LABELS = ["SMTP a usar", "URL de gestão do agendamento", "URL pública deste formulário"];

describe("FormEmailsTab: cliente e comercial separados", () => {
  it("cada controlo do inventário está no grupo certo", () => {
    const { client, commercial, delivery } = renderTab();

    for (const l of CLIENT_LABELS) {
      expect(within(client).getByLabelText(l)).toBeInTheDocument();
      expect(within(commercial).queryByLabelText(l)).not.toBeInTheDocument();
    }
    for (const l of COMMERCIAL_LABELS) {
      expect(within(commercial).getByLabelText(l)).toBeInTheDocument();
      expect(within(client).queryByLabelText(l)).not.toBeInTheDocument();
    }
    for (const l of DELIVERY_LABELS) {
      expect(within(delivery).getByLabelText(l)).toBeInTheDocument();
    }

    // Modelos: confirmação + lembrete + reagendar + cancelar do cliente (4) e 1 de nova reunião no comercial.
    expect(client.querySelectorAll("#confirmation-email-template, #reminder-client-template, #reschedule-client-template, #cancel-client-template")).toHaveLength(4);
    expect(commercial.querySelectorAll("#meeting-notify-template, #reminder-technician-template, #reschedule-technician-template, #cancel-technician-template")).toHaveLength(4);
    // Emails adicionais: três, todos no comercial e nenhum no cliente.
    expect(within(commercial).getAllByLabelText("Emails adicionais a notificar")).toHaveLength(3);
    expect(within(client).queryByLabelText("Emails adicionais a notificar")).not.toBeInTheDocument();
  });

  it("o modelo do comercial diz «Igual ao do cliente» e o do cliente «Modelo padrão do sistema»", () => {
    const { client, commercial } = renderTab();
    expect(within(commercial).getAllByText("Igual ao do cliente")).toHaveLength(3);
    expect(within(client).queryByText("Igual ao do cliente")).not.toBeInTheDocument();
    expect(within(client).getAllByText("Modelo padrão do sistema").length).toBeGreaterThanOrEqual(4);
  });

  it("com o lembrete desligado, o comercial vê só a nota e o modelo desaparece", () => {
    const { commercial, client } = renderTab({ ...allOn, reminder_enabled: false });
    expect(commercial.querySelector("#reminder-technician-template")).toBeNull();
    expect(within(commercial).getByText("Ligue o lembrete na secção do cliente.")).toBeInTheDocument();
    expect(client.querySelector("#reminder-hours-before")).toBeNull();
  });

  it("mantém as condições: sem avisos ligados não há emails adicionais nem modelo de reunião", () => {
    const { commercial } = renderTab({
      ...allOn,
      meeting_notify_commercial: false,
      reschedule_notify_commercial: false,
      cancel_notify_commercial: false,
    });
    expect(within(commercial).queryByLabelText("Emails adicionais a notificar")).not.toBeInTheDocument();
    expect(commercial.querySelector("#meeting-notify-template")).toBeNull();
    // Reagendar e cancelar mostram sempre o modelo do comercial.
    expect(commercial.querySelector("#reschedule-technician-template")).not.toBeNull();
    expect(commercial.querySelector("#cancel-technician-template")).not.toBeNull();
  });

  it("gravar devolve o objecto completo com só o campo alterado", () => {
    const { commercial, onChange } = renderTab();
    fireEvent.click(within(commercial).getByLabelText("Aviso ao comercial ao cancelar"));
    expect(onChange).toHaveBeenCalledWith({ ...allOn, cancel_notify_commercial: false });
  });
});
