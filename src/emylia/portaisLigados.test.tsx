// Os portais ligados à equipa (2.0, 23/10/2026): a conta real nasce no próprio envio (uma vez) e o estado fica no negócio ou no
// fornecedor; sem email válido o envio espera pelo email; o cliente com vários negócios escolhe; "Ver como o cliente" só vê;
// o fornecedor não define a password duas vezes; a PO do link abre logo.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import {
  definirCriadorContas, definirModoReal, emailCliente, fecharAcesso, lerPedidoEmail, linkLogin, pedirEmailPortal, type EnvioAcesso,
} from "./acessosPortal";
import { marcarContaPortal, podeTentarDeNovo, PRESA_MS } from "./estadoContaPortal";
import { esquecerInventario, executar, lerInventario } from "./inventario/loja";
import { acessoPortal } from "./inventario/regrasForn";
import { PortalCliente } from "./PortalCliente";
import { PortalClienteConta, lerPoDoLink, negociosDoPortal } from "./PortalClienteConta";
import { BotaoAcessoPortal, EstadoAcessoPortal } from "./AcessoPortalNegocio";
import PortalFornecedor from "./portalFornecedor/PortalFornecedor";

/** Uma proposta aceite, com os campos do contrato (como acessosPortal.test.ts): pronta para "Enviar o contrato". */
function pronto(S: Estado): Negocio {
  const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc") && !x.orc.aceite) as Negocio;
  Object.assign(d.orc!, { enviada: "hoje", aceite: "hoje", contrato: null, vendaDireta: false });
  Object.assign(d.f, { modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não" });
  return d;
}

function Montar({ S, A, filho }: { S: Estado; A: ReturnType<typeof acoes>; filho: (ctx: Ctx) => JSX.Element }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return filho(ctx);
}

beforeEach(() => { localStorage.clear(); esquecerInventario(); });
afterEach(() => { cleanup(); definirModoReal(null); pedirEmailPortal(null); fecharAcesso(); window.history.replaceState(null, "", "/"); });

describe("a conta real nasce no envio", () => {
  it("enviar o contrato pede a conta uma só vez, e o resultado fica no negócio", () => {
    definirModoReal("org-1", "Olyvia Demo");
    const S = seed(), d = pronto(S);
    d.f.email = "Ana.Cliente@Exemplo.pt";
    const pedidos: EnvioAcesso[] = [];
    const desligar = definirCriadorContas((e) => { pedidos.push(e); marcarContaPortal(S, e, { fase: "a criar" }); });
    const A = acoes(S, vi.fn(), (fn) => fn());
    A.enviarContrato(d.id);
    desligar();
    expect(d.orc!.contrato).toBe("enviado");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].conta).toMatchObject({ tipo: "cliente", email: "ana.cliente@exemplo.pt", ref: String(d.id) });
    expect(d.acesso).toMatchObject({ estado: "a criar", email: "ana.cliente@exemplo.pt" });
    // a resposta do servidor: pronta (a password temporária sai do Estado partilhado) ou com erro (e "Tentar de novo")
    S.acessos![emailCliente(d)].password = "temporaria";
    marcarContaPortal(S, pedidos[0], { fase: "pronta", nova: true, password: "x" });
    expect(d.acesso?.estado).toBe("ok");
    expect(S.acessos![emailCliente(d)].password).toBe("");
    marcarContaPortal(S, pedidos[0], { fase: "erro", msg: "Demasiados pedidos" });
    expect(d.acesso).toMatchObject({ estado: "erro", msg: "Demasiados pedidos" });
    expect(podeTentarDeNovo(d.acesso)).toBe(true);
  });

  it("sem quem crie a conta (o protótipo sem base), o envio só mostra o popup, como sempre", () => {
    const S = seed(), d = pronto(S);
    const A = acoes(S, vi.fn(), (fn) => fn());
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBe("enviado");
    expect(d.acesso).toBeUndefined();
  });

  it("'a criar' há mais de 2 minutos (o separador fechou a meio) também se tenta de novo", () => {
    const agora = Date.now();
    expect(podeTentarDeNovo({ estado: "a criar", email: "a@b.pt", em: new Date(agora - 1000).toISOString() }, agora)).toBe(false);
    expect(podeTentarDeNovo({ estado: "a criar", email: "a@b.pt", em: new Date(agora - PRESA_MS - 1).toISOString() }, agora)).toBe(true);
    expect(podeTentarDeNovo({ estado: "ok", email: "a@b.pt", em: new Date(0).toISOString() }, agora)).toBe(false);
  });

  it("fornecedor: o estado da conta fica na ficha do Inventário", () => {
    const sid = lerInventario().suppliers[0].id;
    const e = { conta: { email: "x@forn.pt", password: "", tipo: "fornecedor", ref: sid, nome: "X", mudouPassword: false, criadoEm: "" }, comPassword: true, empresa: "E", n: 1 } as EnvioAcesso;
    marcarContaPortal(seed(), e, { fase: "erro", msg: "Email inválido" });
    expect(lerInventario().suppliers[0].contaPortal).toMatchObject({ estado: "erro", email: "x@forn.pt", msg: "Email inválido" });
  });
});

describe("sem email válido não se envia ao portal (2.0)", () => {
  it("o envio espera pelo email, pedido no negócio; gravado, o contrato segue", () => {
    definirModoReal("org-1", "Olyvia Demo");
    const S = seed(), d = pronto(S);
    d.f.email = "";
    const pedidos: EnvioAcesso[] = [];
    const desligar = definirCriadorContas((e) => { pedidos.push(e); });
    const avisar = vi.fn();
    const A = acoes(S, avisar, (fn) => fn());
    A.enviarContrato(d.id);
    expect(d.orc!.contrato).toBeNull();
    expect(pedidos).toHaveLength(0);
    expect(lerPedidoEmail()).toEqual({ deal: d.id, acao: "contrato", n: undefined });
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ msg: "Falta o email do cliente" }));

    render(<Montar S={S} A={A} filho={(ctx) => <EstadoAcessoPortal ctx={ctx} d={d} />} />);
    const f = screen.getByRole("group", { name: "Email do cliente para o portal" });
    fireEvent.change(within(f).getByLabelText("Email do cliente"), { target: { value: "sem-dominio" } });
    fireEvent.click(within(f).getByRole("button", { name: "Guardar e enviar" }));
    expect(d.orc!.contrato).toBeNull();
    fireEvent.change(within(f).getByLabelText("Email do cliente"), { target: { value: "carla@exemplo.pt" } });
    fireEvent.click(within(f).getByRole("button", { name: "Guardar e enviar" }));
    desligar();
    expect(d.f.email).toBe("carla@exemplo.pt");
    expect(d.orc!.contrato).toBe("enviado");
    expect(pedidos.map((e) => e.conta.email)).toEqual(["carla@exemplo.pt"]);
    expect(lerPedidoEmail()).toBeNull();
    // nunca uma conta real com um email inventado
    expect(pedidos.some((e) => /teste\.olyvia\.pt$/.test(e.conta.email))).toBe(false);
  });

  it("no protótipo sem base fica a conta de teste (nada é real)", () => {
    const S = seed(), d = pronto(S);
    d.f.email = "";
    acoes(S, vi.fn(), (fn) => fn()).enviarContrato(d.id);
    expect(d.orc!.contrato).toBe("enviado");
    expect(S.acessos![`cliente-${d.id}@teste.olyvia.pt`]).toBeTruthy();
  });

  it("'Acesso ao portal' (e 'Tentar de novo') volta a pedir a conta, sem documento novo", () => {
    definirModoReal("org-1", "Olyvia Demo");
    const S = seed(), d = pronto(S);
    d.f.email = "carla@exemplo.pt";
    const pedidos: EnvioAcesso[] = [];
    const desligar = definirCriadorContas((e) => { pedidos.push(e); });
    acoes(S, vi.fn(), (fn) => fn()).acessoPortal(d.id);
    expect(pedidos).toHaveLength(1);
    expect(d.orc!.contrato).toBeNull();
    // o botão do cabeçalho (o mesmo na proposta simples e no aspeto atual) e o "Tentar de novo" do estado com erro
    d.acesso = { estado: "erro", email: "carla@exemplo.pt", msg: "Falhou", em: new Date().toISOString() };
    const A = acoes(S, vi.fn(), (fn) => fn());
    render(<Montar S={S} A={A} filho={(ctx) => <><BotaoAcessoPortal ctx={ctx} d={d} /><EstadoAcessoPortal ctx={ctx} d={d} /></>} />);
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível criar a conta do portal (carla@exemplo.pt): Falhou");
    fireEvent.click(screen.getByRole("button", { name: "Acesso ao portal" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    desligar();
    expect(pedidos).toHaveLength(3);
  });

  it("o botão 'Acesso ao portal' não aparece sem base (contas de teste)", () => {
    const S = seed(), d = pronto(S);
    render(<Montar S={S} A={acoes(S, vi.fn(), (fn) => fn())} filho={(ctx) => <BotaoAcessoPortal ctx={ctx} d={d} />} />);
    expect(screen.queryByRole("button", { name: "Acesso ao portal" })).toBeNull();
  });
});

describe("o cliente com vários negócios escolhe qual abrir", () => {
  it("lista os pedidos com documentos; abre o escolhido e volta à lista", () => {
    const S = seed();
    const [a, b] = S.deals.filter((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc")).slice(0, 2);
    a.orc!.enviada = "hoje"; b.orc!.enviada = "hoje";
    const semDocs = S.deals.find((x) => !x.orc?.enviada && !x.adendas?.length)!;
    expect(negociosDoPortal(S.deals, [b.id, a.id, b.id, semDocs.id, NaN]).map((x) => x.id)).toEqual([b.id, a.id]);
    const A = acoes(S, vi.fn(), (fn) => fn());
    render(<Montar S={S} A={A} filho={(ctx) => <PortalClienteConta ctx={ctx} ids={[b.id, a.id]} sair={() => {}} />} />);
    const lista = screen.getByRole("list", { name: "Os seus pedidos" });
    expect(within(lista).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(lista).getAllByRole("button")[1]);
    expect(screen.getByRole("dialog", { name: `Portal do cliente: ${a.nome}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Os meus pedidos" }));
    expect(screen.getByRole("list", { name: "Os seus pedidos" })).toBeInTheDocument();
  });

  it("com um só negócio abre-o direto, sem lista", () => {
    const S = seed();
    const a = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc"))!;
    a.orc!.enviada = "hoje";
    render(<Montar S={S} A={acoes(S, vi.fn(), (fn) => fn())} filho={(ctx) => <PortalClienteConta ctx={ctx} ids={[a.id]} sair={() => {}} />} />);
    expect(screen.getByRole("dialog", { name: `Portal do cliente: ${a.nome}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Os meus pedidos" })).toBeNull();
  });
});

describe("'Ver como o cliente' só vê", () => {
  it("aceitar na pré-visualização não grava nada em nome do cliente", () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc") && !x.orc.aceite) as Negocio;
    Object.assign(d.orc!, { enviada: "hoje", aceite: null, contrato: null, vendaDireta: false });
    const histAntes = d.hist.length;
    render(<Montar S={S} A={acoes(S, vi.fn(), (fn) => fn())} filho={(ctx) => <PortalCliente ctx={ctx} d={d} fechar={() => {}} previa />} />);
    expect(screen.getByText(/Pré-visualização, só de leitura/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar a proposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(d.orc!.aceite).toBeNull();
    expect(d.hist.length).toBe(histAntes);
    expect(screen.getByRole("alert")).toHaveTextContent("Nada foi gravado");
  });
});

describe("portal do fornecedor na 2.0", () => {
  it("a password já trocada na entrada da app não se volta a pedir no 1.º acesso", () => {
    expect(executar((db) => acessoPortal(db, "gama", "invite", "portal@gama.exemplo")).erro).toBe("");
    render(<PortalFornecedor sup="gama" aoVoltar={() => {}} passwordDefinida />);
    const passos = screen.getByRole("list", { name: "Primeiro acesso" });
    expect(within(passos).queryByText(/Password/)).toBeNull();
    expect(within(passos).getAllByRole("listitem").map((x) => x.textContent)).toEqual(["1. Convite", "2. Dados da empresa", "3. Concluído"]);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar convite" }));
    expect(screen.queryByLabelText("Nova password")).toBeNull();
    fireEvent.change(screen.getByLabelText("Morada"), { target: { value: "Rua da Gama 5" } });
    fireEvent.change(screen.getByLabelText("Código postal"), { target: { value: "4700-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar dados" }));
    expect(screen.getByText("Acesso ativo")).toBeInTheDocument();
    expect(lerInventario().suppliers.find((s) => s.id === "gama")!.portal).toBe("active");
  });

  it("o link da PO (?po=) abre essa encomenda; um código estranho é ignorado", () => {
    definirModoReal("org-1", "Olyvia Demo");
    expect(linkLogin("PO-2026-0148")).toBe(`${window.location.origin}/?po=PO-2026-0148`);
    window.history.replaceState(null, "", "/?po=PO-2026-0148");
    expect(lerPoDoLink()).toBe("PO-2026-0148");
    window.history.replaceState(null, "", "/?po=" + encodeURIComponent("<script>"));
    expect(lerPoDoLink()).toBeNull();
  });
});
