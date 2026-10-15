// A assinatura do contrato no portal (15/10): a ação do motor, as duas formas de assinar e o contrato com a assinatura.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Assinatura, type Negocio } from "./motor";
import { AssinaturaContrato, agoraAssinatura, mascararTelemovel, telemovelValido } from "./AssinaturaContrato";
import { ContratoDoc } from "./DocsCliente";

afterEach(cleanup);
// o jsdom não desenha: sem contexto 2D, o componente conta só o comprimento do traço
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); });

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

  it("desenhar: o botão só fica ativo com traço suficiente e o 'Li e aceito'", () => {
    const onAssinar = vi.fn();
    render(<AssinaturaContrato nome="Carla Nunes" contrato="CT 2026/1031" onAssinar={onAssinar} onCancelar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Desenhar no ecrã/ }));
    const assinar = () => screen.getByRole("button", { name: /Assinar o contrato/ }) as HTMLButtonElement;
    const tela = screen.getByTestId("tela-assinatura");
    fireEvent.click(screen.getByRole("checkbox", { name: /Li e aceito o contrato CT 2026\/1031/ }));
    // um risco curto não chega
    fireEvent.pointerDown(tela, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(tela, { clientX: 30, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(tela, { pointerId: 1 });
    expect(assinar().disabled).toBe(true);
    expect(screen.getByText(/a assinatura está curta/)).toBeTruthy();
    // uma assinatura a sério
    fireEvent.pointerDown(tela, { clientX: 10, clientY: 40, pointerId: 1 });
    for (const [x, y] of [[40, 20], [80, 50], [120, 25], [170, 45]]) fireEvent.pointerMove(tela, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(tela, { pointerId: 1 });
    expect(screen.getByText("Assinatura pronta")).toBeTruthy();
    expect(assinar().disabled).toBe(false);
    fireEvent.click(assinar());
    expect(onAssinar).toHaveBeenCalledTimes(1);
    const a = onAssinar.mock.calls[0][0] as Assinatura;
    expect(a.tipo).toBe("desenho");
    expect(a.nome).toBe("Carla Nunes");
    expect(a.imagem).toMatch(/^data:image\/png/);
    expect(a.q).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
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

  it("o contrato mostra a assinatura do cliente (o desenho) e o selo da empresa", () => {
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
