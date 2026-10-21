// A assinatura do contrato no portal (15/10; 21/10: Chave Móvel Digital ou código por SMS, sem caneta): a ação do motor, as duas formas e o contrato.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Assinatura, type Negocio } from "./motor";
import { AssinaturaContrato, agoraAssinatura, mascararTelemovel, telemovelValido } from "./AssinaturaContrato";
import { ContratoDoc } from "./DocsCliente";

afterEach(cleanup);

const preparar = () => {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.orc && x.fase === 3) as Negocio;
  Object.assign(d.orc!, { verif: true, enviada: "13/10", aceite: "hoje", contrato: "enviado" });
  return { S, A, d };
};
const DIGITAL: Assinatura = { tipo: "digital", nome: "Carla Nunes", q: "15/10/2026 14:35", id: "CMD-7K3QX9", telemovel: "9•• ••• 678" };

describe("assinatura do contrato", () => {
  it("assinarCom guarda a assinatura e passa de fase como assinar", () => {
    const { A, d } = preparar();
    A.assinarCom(d.id, DIGITAL);
    expect(d.orc!.assinatura).toEqual(DIGITAL);
    expect(d.orc!.contrato).toBe("assinado");
    expect(d.fase).toBe(4);
    expect(d.hist.some((h) => /Chave Móvel Digital \(CMD-7K3QX9\)/.test(h.t))).toBe(true);
  });

  it("assinarCom só assina um contrato enviado", () => {
    const { A, d } = preparar();
    d.orc!.contrato = null;
    A.assinarCom(d.id, DIGITAL);
    expect(d.orc!.assinatura).toBeUndefined();
    expect(d.fase).toBe(3);
  });

  it("as ajudas: data, telemóvel válido e mascarado", () => {
    expect(agoraAssinatura(new Date(2026, 9, 5, 9, 7))).toBe("05/10/2026 09:07");
    expect(telemovelValido("912 345 678")).toBe(true);
    expect(telemovelValido("212345678")).toBe(false);
    expect(mascararTelemovel("912345678")).toBe("9•• ••• 678");
  });

  it("não há caneta: só Chave Móvel Digital ou código por SMS", () => {
    render(<AssinaturaContrato nome="Carla Nunes" contrato="CT 2026/1031" onAssinar={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Desenhar/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Chave Móvel Digital/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Código por SMS/ })).toBeTruthy();
  });

  it("código por SMS (regras da sms-otp): para o telemóvel do negócio, 5 tentativas, depois pede-se outro", () => {
    const onAssinar = vi.fn();
    render(<AssinaturaContrato nome="Carla Nunes" telemovel="916 004 552" contrato="CT 2026/1031" onAssinar={onAssinar} onCancelar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Código por SMS/ }));
    expect(screen.getByText(/telemóvel 9•• ••• 552/)).toBeTruthy();
    expect(screen.queryByLabelText("Telemóvel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enviar o código por SMS" }));
    expect(screen.getByText(/O seu código de verificação é: \d{6}\. Válido por 5 minutos\./)).toBeTruthy();
    const certo = screen.getByTestId("codigo-sms").textContent!;
    const errado = certo === "111111" ? "222222" : "111111";
    const codigo = () => screen.getByLabelText("Código de 6 dígitos");
    fireEvent.click(screen.getByRole("checkbox", { name: /Li e aceito o contrato CT 2026\/1031/ }));
    const assinar = () => screen.getByRole("button", { name: /Assinar o contrato/ }) as HTMLButtonElement;
    fireEvent.change(codigo(), { target: { value: errado } });
    expect(screen.getByText("Código incorreto. Restam 4 tentativas.")).toBeTruthy();
    expect(assinar().disabled).toBe(true);
    // reenviar só ao fim de 60 s
    expect((screen.getByRole("button", { name: /Pedir outro código daqui a 60 s/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(codigo(), { target: { value: certo } });
    expect(screen.getByText("Código confirmado.")).toBeTruthy();
    expect(assinar().disabled).toBe(false);
    fireEvent.click(assinar());
    const a = onAssinar.mock.calls[0][0] as Assinatura;
    expect(a).toMatchObject({ tipo: "sms", nome: "Carla Nunes", telemovel: "9•• ••• 552" });
    expect(a.id).toMatch(/^SMS-[A-Z0-9]{6}$/);
  });

  it("código por SMS: à 5.ª falha o código deixa de valer", () => {
    render(<AssinaturaContrato nome="Carla Nunes" telemovel="916004552" contrato="CT 2026/1031" onAssinar={vi.fn()} onCancelar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Código por SMS/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar o código por SMS" }));
    const certo = screen.getByTestId("codigo-sms").textContent!;
    const errado = certo === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) fireEvent.change(screen.getByLabelText("Código de 6 dígitos"), { target: { value: errado } });
    expect(screen.getByText(/Número máximo de tentativas excedido/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar o código por SMS" })).toBeTruthy();
  });

  it("Chave Móvel Digital: telemóvel e PIN, depois um código de 6 dígitos", () => {
    const onAssinar = vi.fn();
    render(<AssinaturaContrato nome="Carla Nunes" contrato="CT 2026/1031" onAssinar={onAssinar} onCancelar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Chave Móvel Digital/ }));
    const pedir = screen.getByRole("button", { name: "Pedir o código" }) as HTMLButtonElement;
    expect(pedir.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Telemóvel"), { target: { value: "912 345 678" } });
    fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
    expect(pedir.disabled).toBe(false);
    fireEvent.click(pedir);
    expect(screen.getByText(/Enviámos um código por SMS para o 9•• ••• 678/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Li e aceito/ }));
    const codigo = screen.getByLabelText("Código de 6 dígitos");
    fireEvent.change(codigo, { target: { value: "12345" } });
    const assinar = () => screen.getByRole("button", { name: /Assinar o contrato/ }) as HTMLButtonElement;
    expect(assinar().disabled).toBe(true);
    fireEvent.change(codigo, { target: { value: "123456" } });
    expect(assinar().disabled).toBe(false);
    fireEvent.click(assinar());
    const a = onAssinar.mock.calls[0][0] as Assinatura;
    expect(a).toMatchObject({ tipo: "digital", nome: "Carla Nunes", telemovel: "9•• ••• 678" });
    expect(a.id).toMatch(/^CMD-[A-Z0-9]{6}$/);
  });

  it("o contrato mostra a assinatura antiga do cliente (o desenho) e o selo da empresa", () => {
    const { S, A, d } = preparar();
    A.assinarCom(d.id, { tipo: "desenho", imagem: "data:image/png;base64,AAAA", nome: d.nome, q: "15/10/2026 14:35" });
    render(<ContratoDoc S={S} d={d} />);
    const img = screen.getByAltText(`Assinatura de ${d.nome}`) as HTMLImageElement;
    expect(img.src).toContain("data:image/png");
    expect(screen.getByText(/Assinado no ecrã, no portal · 15\/10\/2026 14:35/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Assinado digitalmente por .*Mudelar.*Certificado qualificado/ })).toBeTruthy();
  });

  it("o contrato com a Chave Móvel Digital mostra o selo do cliente", () => {
    const { S, A, d } = preparar();
    A.assinarCom(d.id, { ...DIGITAL, nome: d.nome });
    render(<ContratoDoc S={S} d={d} />);
    expect(screen.getByRole("img", { name: new RegExp(`Assinado digitalmente por ${d.nome}.*CMD-7K3QX9`) })).toBeTruthy();
    expect(screen.getByText(/Assinado com Chave Móvel Digital/)).toBeTruthy();
  });
});
