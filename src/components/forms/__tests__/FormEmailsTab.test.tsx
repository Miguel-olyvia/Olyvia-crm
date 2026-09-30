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
  "Lembrete de agendamento por concluir",
  "Horas após o preenchimento (várias, separadas por vírgula)",
];
// O lembrete existe nos dois lados, cada um com os seus controlos (ver o teste próprio abaixo).
const REMINDER_LABELS = ["Lembrete antes da visita", "Horas de antecedência"];
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
    // Um lembrete em cada lado, e nenhum na entrega.
    for (const l of REMINDER_LABELS) {
      expect(within(client).getAllByLabelText(l)).toHaveLength(1);
      expect(within(commercial).getAllByLabelText(l)).toHaveLength(1);
      expect(within(delivery).queryByLabelText(l)).not.toBeInTheDocument();
    }

    // Modelos: confirmação + lembrete + reagendar + cancelar do cliente (4) e 1 de nova reunião no comercial.
    expect(client.querySelectorAll("#confirmation-email-template, #reminder-client-template, #reschedule-client-template, #cancel-client-template")).toHaveLength(4);
    expect(commercial.querySelectorAll("#meeting-notify-template, #reminder-technician-template, #reschedule-technician-template, #cancel-technician-template")).toHaveLength(4);
    // Emails adicionais: três, todos no comercial e nenhum no cliente.
    expect(within(commercial).getAllByLabelText("Emails adicionais a notificar")).toHaveLength(3);
    expect(within(client).queryByLabelText("Emails adicionais a notificar")).not.toBeInTheDocument();
  });

  it("o modelo do comercial diz «Modelo padrão do sistema (comercial)» e o do cliente «Modelo padrão do sistema»", () => {
    const { client, commercial } = renderTab();
    expect(within(commercial).getAllByText("Modelo padrão do sistema (comercial)")).toHaveLength(3);
    expect(within(commercial).queryByText("Igual ao do cliente")).not.toBeInTheDocument();
    expect(within(client).queryByText("Modelo padrão do sistema (comercial)")).not.toBeInTheDocument();
    expect(within(client).getAllByText("Modelo padrão do sistema").length).toBeGreaterThanOrEqual(4);
  });

  it("o lembrete do comercial tem interruptor, horas e modelo próprios na secção do comercial", () => {
    const { client, commercial } = renderTab();
    expect(commercial.querySelector("#reminder-technician-enabled")).not.toBeNull();
    expect(commercial.querySelector("#reminder-technician-hours")).not.toBeNull();
    expect(commercial.querySelector("#reminder-technician-template")).not.toBeNull();
    expect(client.querySelector("#reminder-technician-enabled")).toBeNull();
    expect(client.querySelector("#reminder-technician-hours")).toBeNull();
    expect(client.querySelector("#reminder-enabled")).not.toBeNull();
    expect(commercial.querySelector("#reminder-enabled")).toBeNull();
  });

  it("horas do comercial vazias: mostra que segue o cliente e as horas dele", () => {
    const { commercial } = renderTab({ ...allOn, reminder_hours_before: 5 });
    expect(within(commercial).getByText("Se ficar vazio segue o cliente (5 horas)")).toBeInTheDocument();
    expect(commercial.querySelector<HTMLInputElement>("#reminder-technician-hours")!.value).toBe("");
    // Sem valor próprio nem alterações, não há nada a repor.
    expect(within(commercial).queryByRole("button", { name: "Seguir o cliente" })).not.toBeInTheDocument();
  });

  it("o interruptor do comercial mostra o valor efectivo e gravar escreve um valor explícito", () => {
    const { commercial, onChange } = renderTab({ ...allOn, reminder_enabled: false });
    // Sem valor próprio e cliente desligado: o comercial aparece desligado, sem horas nem modelo.
    expect(commercial.querySelector("#reminder-technician-hours")).toBeNull();
    expect(commercial.querySelector("#reminder-technician-template")).toBeNull();
    fireEvent.click(within(commercial).getByRole("switch", { name: /Lembrete antes da visita/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reminder_enabled: false, reminder_technician_enabled: true }));
  });

  it("escrever horas no comercial grava só as horas dele; esvaziar volta a null", () => {
    const { commercial, onChange } = renderTab();
    fireEvent.change(commercial.querySelector<HTMLInputElement>("#reminder-technician-hours")!, { target: { value: "6" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...allOn, reminder_technician_hours_before: 6 });
  });

  it("esvaziar as horas do comercial grava null e não mexe nas do cliente", () => {
    const withHours = { ...allOn, reminder_technician_hours_before: 6 };
    const { commercial, onChange } = renderTab(withHours);
    fireEvent.change(commercial.querySelector<HTMLInputElement>("#reminder-technician-hours")!, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...withHours, reminder_technician_hours_before: null });
  });

  it("«Seguir o cliente» volta a pôr os dois campos do comercial vazios", () => {
    const { commercial, onChange } = renderTab({
      ...allOn,
      reminder_technician_enabled: true,
      reminder_technician_hours_before: 6,
    });
    fireEvent.click(within(commercial).getByRole("button", { name: "Seguir o cliente" }));
    expect(onChange).toHaveBeenCalledWith({
      ...allOn,
      reminder_technician_enabled: null,
      reminder_technician_hours_before: null,
    });
  });

  it("com o comercial desligado explicitamente, o modelo do lembrete desaparece mesmo com o cliente ligado", () => {
    const { commercial, client } = renderTab({ ...allOn, reminder_technician_enabled: false });
    expect(commercial.querySelector("#reminder-technician-template")).toBeNull();
    expect(client.querySelector("#reminder-hours-before")).not.toBeNull();
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

describe("FormEmailsTab: aviso ao cliente ao reagendar e ao cancelar tem interruptor proprio", () => {
  it("os dois interruptores estao no grupo do cliente e nao no do comercial", () => {
    const { client, commercial } = renderTab();
    for (const name of ["Quando a visita é reagendada", "Quando a visita é cancelada"]) {
      expect(within(client).getByRole("switch", { name })).toBeChecked();
      expect(within(commercial).queryByRole("switch", { name })).not.toBeInTheDocument();
    }
    expect(client.querySelector("#reschedule-notify-client")).not.toBeNull();
    expect(client.querySelector("#cancel-notify-client")).not.toBeNull();
  });

  it("desligados escondem os modelos do cliente e ficam so a confirmacao e o lembrete", () => {
    const { client } = renderTab({ ...allOn, reschedule_notify_client: false, cancel_notify_client: false });
    expect(client.querySelector("#reschedule-client-template")).toBeNull();
    expect(client.querySelector("#cancel-client-template")).toBeNull();
    expect(client.querySelectorAll("#confirmation-email-template, #reminder-client-template, #reschedule-client-template, #cancel-client-template")).toHaveLength(2);
  });

  it("cada interruptor e independente do outro", () => {
    const { client } = renderTab({ ...allOn, reschedule_notify_client: false });
    expect(client.querySelector("#reschedule-client-template")).toBeNull();
    expect(client.querySelector("#cancel-client-template")).not.toBeNull();
  });

  it("clicar grava so o campo alterado", () => {
    const { client, onChange } = renderTab();
    fireEvent.click(within(client).getByRole("switch", { name: "Quando a visita é cancelada" }));
    expect(onChange).toHaveBeenCalledWith({ ...allOn, cancel_notify_client: false });
    fireEvent.click(within(client).getByRole("switch", { name: "Quando a visita é reagendada" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...allOn, reschedule_notify_client: false });
  });

  it("ja nao diz que o cliente recebe sempre", () => {
    const { client } = renderTab();
    expect(within(client).queryByText(/recebe sempre/)).not.toBeInTheDocument();
  });
});
