// O portal do cliente como percurso guiado (15/10/2026): rever a proposta inteira → aceitar → o comercial gera o contrato →
// assinar no mesmo link → o plano da obra, sem custos.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, proximo, seed, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { PortalCliente, passoPortal } from "./PortalCliente";

afterEach(cleanup);

function Portal({ S, d, A }: { S: Estado; d: Negocio; A: ReturnType<typeof acoes> }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return <PortalCliente ctx={ctx} d={d} fechar={() => {}} />;
}
function montar() {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc") && !x.orc.aceite) as Negocio;
  d.orc!.enviada = "hoje"; d.orc!.aceite = null; d.orc!.contrato = null; d.orc!.vendaDireta = false;
  // o que o comercial preenche no passo do contrato (para o gerar)
  Object.assign(d.f, { modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não" });
  const A = acoes(S, vi.fn(), (fn) => fn());
  const r = render(<Portal S={S} d={d} A={A} />);
  return { S, d, A, r };
}

describe("portal do cliente: o percurso guiado", () => {
  it("mostra a proposta inteira e o próximo passo à vista (Aceitar)", () => {
    const { d } = montar();
    expect(passoPortal(d).estado).toBe("rever");
    expect(screen.getByRole("heading", { name: "Reveja a sua proposta" })).toBeTruthy();
    const prop = screen.getByRole("region", { name: "A proposta" });
    expect(within(prop).getByText("O que vamos fazer")).toBeTruthy();
    expect(within(prop).getByText("Materiais e escolhas")).toBeTruthy();
    expect(prop.textContent).not.toMatch(/Materiais do modelo/);
    expect(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Aceitar a proposta" })).toBeTruthy();
  });

  it("aceitar → o contrato está a ser preparado (sem botão) → o comercial gera → assina no mesmo link → vê a obra", () => {
    const { S, d, A, r } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar a proposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(d.orc!.aceite).toBeTruthy();
    expect(d.orc!.contrato).toBeFalsy(); // é o comercial que gera o contrato
    expect(screen.getByRole("heading", { name: "O contrato está a ser preparado" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Próximo passo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Assinar/ })).toBeNull();

    // o comercial vê o passo claro no negócio, e gera o contrato
    expect(proximo(d, S).t).toBe("O cliente aceitou. Gerar o contrato");
    expect(proximo(d, S).btn).toBe("Gerar o contrato");
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBe("enviado");
    r.rerender(<Portal S={S} d={d} A={A} />);

    // no mesmo link: o contrato, por assinar
    expect(screen.getByRole("heading", { name: "Assinar o contrato" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "O contrato" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: /Assinar o contrato/ }));
    // assina com a Chave Móvel Digital (o desenho tem o seu teste em AssinaturaContrato.test.tsx)
    fireEvent.click(screen.getByRole("button", { name: /Chave Móvel Digital/ }));
    fireEvent.change(screen.getByLabelText("Telemóvel"), { target: { value: "912 345 678" } });
    fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Pedir o código" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Li e aceito/ }));
    fireEvent.change(screen.getByLabelText(/[Cc]ódigo/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Assinar o contrato/ }));
    expect(d.orc!.contrato).toBe("assinado");
    expect(d.orc!.assinatura).toMatchObject({ tipo: "digital" });
    expect(d.fase).toBe(4);

    // depois de assinado: o plano da obra, sem custos nem margens
    expect(screen.getByRole("heading", { name: "A sua obra" })).toBeTruthy();
    const plano = screen.getByRole("region", { name: "O plano da obra" });
    expect(plano.textContent).not.toMatch(/€|margem|custo/i);
    expect(within(plano).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("pedir alterações: escolhe os motivos e diz o que mudaria; o comercial vê-o como próximo passo e a nova versão consome-o", () => {
    const { S, d, A } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Pedir alterações ou recusar" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pedir alterações(?! ou)/ }));
    const enviar = screen.getByRole("button", { name: "Enviar o pedido" });
    expect((enviar as HTMLButtonElement).disabled).toBe(true); // sem motivo nem texto, não envia
    fireEvent.click(within(screen.getByRole("group", { name: "O que gostava de mudar" })).getByRole("button", { name: /Materiais ou acabamentos/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Conte-nos o que mudaria/ }), { target: { value: "Azulejo mais claro" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar o pedido" }));
    expect(d.orc!.aceite).toBeFalsy();
    expect(d.orc!.pedidoCliente).toMatchObject({ motivos: ["Outros materiais"], nota: "Azulejo mais claro" });
    expect(passoPortal(d).estado).toBe("pedido");
    expect(screen.getByText("Estamos a preparar uma nova proposta")).toBeTruthy();
    // o comercial: o próximo passo é a nova versão, e mexe-se na visita (materiais)
    const p = proximo(d, S);
    expect(p).toMatchObject({ t: "O cliente pediu alterações", act: "pedidoCliente", who: "comercial" });
    A.novaVersao(d.id, d.orc!.pedidoCliente!.motivos, d.orc!.pedidoCliente!.nota ?? "", "visita");
    expect(d.orc!.pedidoCliente).toBeNull();
    expect(d.orc!.versoes!.at(-1)).toMatchObject({ motivos: ["Outros materiais"], nota: "Azulejo mais claro", onde: "visita" });
    expect(d.visita.fechada).toBe(false); // de volta à visita: necessidades e produtos
  });

  it("recusar por completo: pede os motivos e o negócio fica perdido, com o porquê", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Pedir alterações ou recusar" }));
    fireEvent.click(screen.getByRole("button", { name: /^Recusar a propostaNão/ }));
    const recusar = screen.getByRole("button", { name: "Recusar a proposta" });
    expect((recusar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: "Porque não quer avançar" })).getByRole("button", { name: /O preço/ }));
    fireEvent.click(screen.getByRole("button", { name: "Recusar a proposta" }));
    expect(d.perdido).toBe(true);
    expect(d.motivoPerda).toBe("O preço");
    expect(passoPortal(d).estado).toBe("recusada");
    expect(screen.getByText("Obrigado por nos dizer")).toBeTruthy();
  });

  it("a fatura por pagar: o valor, ver a fatura e a referência Multibanco para copiar", () => {
    const { S, d, r } = montar();
    d.orc!.aceite = "hoje"; d.orc!.contrato = "assinado";
    d.fin.fatura = { n: "FT 2026/418", q: "15/10" };
    r.unmount();
    render(<Portal S={S} d={d} A={acoes(S, vi.fn(), (fn) => fn())} />);
    expect(screen.getByText("Pagar a fatura FT 2026/418")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver a fatura/ })).toBeTruthy();
    // 21/10: sem escolha é transferência; o cliente pode mudar para a referência MB
    expect(screen.getByRole("radio", { name: "Transferência" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Copiar iban" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copiar referência" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Referência MB" }));
    expect(d.f.metodo).toBe("Referência MB");
    expect(screen.getByRole("button", { name: "Copiar referência" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copiar iban" })).toBeNull();
  });

  it("a fatura por débito direto: o IBAN do cliente e a autorização, e fica só com os últimos 4 dígitos", () => {
    const { S, d, r } = montar();
    d.orc!.aceite = "hoje"; d.orc!.contrato = "assinado";
    d.fin.fatura = { n: "FT 2026/418", q: "15/10" };
    r.unmount();
    render(<Portal S={S} d={d} A={acoes(S, vi.fn(), (fn) => fn())} />);
    fireEvent.click(screen.getByRole("radio", { name: "Débito direto" }));
    expect(d.f.metodo).toBe("Débito direto");
    const autorizar = () => screen.getByRole("button", { name: "Autorizar o débito" }) as HTMLButtonElement;
    expect(autorizar().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("IBAN da sua conta"), { target: { value: "PT50 0002" } });
    expect(screen.getByText(/PT50 e 21 dígitos/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("IBAN da sua conta"), { target: { value: "PT50 0002 0123 1234 5678 9015 4" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(autorizar().disabled).toBe(false);
    fireEvent.click(autorizar());
    expect(d.f.debito_iban).toBe("PT50 ···· 0154");
    expect(d.f.comprovativo).toMatch(/Débito direto autorizado/);
    expect(screen.getByText(/Débito direto autorizado na conta PT50 ···· 0154/)).toBeTruthy();
  });
});
