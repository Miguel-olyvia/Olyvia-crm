// Fluxo de admissão de RH. O pipeline do ecrã de Pessoas lê da base (`rpc_hr_admissao_listar`, Supabase simulado). O portal de
// demonstração (tokens de exemplo) e as ações do RH que o alimentam (devolver, rejeitar, gerar contrato, credenciais) continuam
// numa loja em memória, sem base e sem e-mail.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
import {
  aprovarFicha, devolverFicha, enviarCredenciais, gerarContrato, rejeitarFicha, renovarLogin, reenviarContrato, simularPrimeiroAcesso,
  submeterPeloLink,
} from "@/components/rh-exemplo/dados/accoesAdmissao";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { lerAdmissoes } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { paraNovaPessoa } from "@/components/rh-exemplo/novaPessoa/paraStore";
import { valoresIniciais } from "@/components/rh-exemplo/novaPessoa/tiposNova";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";
import RhPortalColaborador from "./RhPortalColaborador";

const renderEm = (endereco: string) =>
  renderRh(
    <Routes>
      <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
      <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
      <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
    </Routes>,
    { rota: endereco },
  );

const pipeline = () => renderEm("/rh-exemplo/pessoas?tab=admissoes");
const link = (token: string) => renderEm(`/rh-exemplo/portal-colaborador/${token}`);
const adm = (id: string) => lerAdmissoes().porPessoa[id];

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  reporRhTeste();
  rhTeste.permissoes = new Set(["hr.pessoas.convite.enviar", "hr.onboarding.approve"]);
  repor();
});

// O pipeline do RH lê da base (`rpc_hr_admissao_listar`); o Supabase é simulado e a RPC devolve estas admissões.
const itemRpc = (id: string, nome: string, estado: string, sobre: Record<string, unknown> = {}) => ({
  convite_id: `c-${id}`, pessoa_id: `p-${id}`, nome, cargo: "Vendedor", estado, estado_portal: "ativo",
  valid_until: "2099-01-01T10:00:00Z", submetido_em: null, devolvida_em: null, atualizado_em: null, ...sobre,
});

const servirPipeline = () => {
  rhTeste.rpcs["rpc_hr_admissao_listar"] = {
    data: {
      itens: [
        itemRpc("marco", "Marco Ventura", "submetida", { submetido_em: "2026-10-20T09:00:00Z" }),
        itemRpc("nadia", "Nádia Reis", "devolvida", { devolvida_em: "2026-10-21T09:00:00Z" }),
        itemRpc("lara", "Lara Mendes", "convidada"),
        itemRpc("ruben", "Rúben Faria", "terminado", { cargo: null, valid_until: null }),
      ],
      contadores: { submetida: 1, devolvida: 1, convidada: 1, terminado: 1 },
      seguinte: null,
    },
    error: null,
  };
};

describe("pipeline de admissões (lido da base)", () => {
  beforeEach(() => servirPipeline());

  it("mostra as admissões que a base devolve, com os filtros por grupo e os contadores", async () => {
    pipeline();
    const lista = await screen.findByRole("list", { name: "Admissões" });
    expect(within(lista).getAllByRole("button", { name: /^Abrir ficha de / })).toHaveLength(4);
    expect(screen.getByText("4 admissões")).toBeInTheDocument();
    const filtros = screen.getByRole("group", { name: "Filtrar por estado" });
    expect(within(filtros).getByRole("button", { name: /^Todas\s*4$/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(filtros).getByRole("button", { name: /^Por rever\s*1$/ })).toBeInTheDocument();
    expect(within(filtros).getByRole("button", { name: /^Com a pessoa\s*2$/ })).toBeInTheDocument();
    expect(within(filtros).getByRole("button", { name: /^Terminadas\s*1$/ })).toBeInTheDocument();
    expect(rhTeste.chamadas.find((c) => c.rpc === "rpc_hr_admissao_listar")?.args).toMatchObject({ p_organization_id: "org-teste" });
  });

  it("cada linha mostra a pessoa, o cargo e a ação certa; o que terminou fica sem pormenores nem «Rever»", async () => {
    pipeline();
    const lista = await screen.findByRole("list", { name: "Admissões" });
    const linha = (nome: string) => within(lista).getByText(nome).closest("li") as HTMLElement;
    expect(within(linha("Marco Ventura")).getByRole("button", { name: "Rever a admissão de Marco Ventura" })).toBeInTheDocument();
    expect(within(linha("Marco Ventura")).getByText("À espera da revisão do RH")).toBeInTheDocument();
    expect(within(linha("Marco Ventura")).getByText("Vendedor")).toBeInTheDocument();
    expect(within(linha("Nádia Reis")).getByRole("button", { name: "Rever a admissão de Nádia Reis" })).toBeInTheDocument();
    expect(within(linha("Rúben Faria")).queryByRole("button", { name: /Rever a admissão/ })).not.toBeInTheDocument();
    expect(within(linha("Rúben Faria")).getByText(/Processo terminado/)).toBeInTheDocument();
  });

  it("sem a permissão de aprovar não há «Rever», mas as linhas continuam visíveis", async () => {
    rhTeste.permissoes = new Set(["hr.pessoas.convite.enviar"]);
    pipeline();
    const lista = await screen.findByRole("list", { name: "Admissões" });
    expect(within(lista).getByText("Marco Ventura")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rever a admissão/ })).not.toBeInTheDocument();
  });

  it("«Rever» abre a revisão de consulta (o RH aprova fora deste ecrã) e fecha-se sem alterar a admissão", async () => {
    pipeline();
    await screen.findByRole("list", { name: "Admissões" });
    fireEvent.click(screen.getByRole("button", { name: "Rever a admissão de Marco Ventura" }));
    const dialogo = await screen.findByRole("dialog", { name: "Rever a admissão de Marco Ventura" });
    expect(within(dialogo).getByText(/Nada passa para a ficha até o RH aprovar/)).toBeInTheDocument();
    expect(rhTeste.chamadas.some((c) => c.rpc === "rpc_hr_admissao_rever_ler")).toBe(true);
    // A revisão é só de consulta nesta fase: aprovar, devolver e rejeitar aparecem desativados e não fazem nada.
    for (const nome of ["Aprovar", "Devolver com comentários", "Rejeitar"]) {
      fireEvent.click(within(dialogo).getByRole("button", { name: nome }));
      expect(within(dialogo).getByRole("button", { name: nome })).toHaveAttribute("aria-disabled", "true");
    }
    expect(rhTeste.chamadas.filter((c) => c.rpc && !["rpc_hr_admissao_listar", "rpc_hr_admissao_rever_ler"].includes(c.rpc))).toHaveLength(0);
  });

  it("escolher um grupo volta a pedir só os estados desse grupo à base", async () => {
    pipeline();
    await screen.findByRole("list", { name: "Admissões" });
    fireEvent.click(screen.getByRole("button", { name: /^Por rever\s*1$/ }));
    await screen.findByRole("button", { name: /^Por rever\s*1$/ });
    const pedidos = rhTeste.chamadas.filter((c) => c.rpc === "rpc_hr_admissao_listar").map((c) => (c.args as { p_estados: string[] | null }).p_estados);
    expect(pedidos[0]).toBeNull();
    expect(pedidos.at(-1)).toEqual(["submetida"]);
  });

  it("sem admissões mostra o estado vazio, e uma falha da base mostra o erro com «Tentar de novo»", async () => {
    rhTeste.rpcs["rpc_hr_admissao_listar"] = { data: { itens: [], contadores: {}, seguinte: null }, error: null };
    pipeline();
    expect(await screen.findByText("Não há admissões nesta organização.")).toBeInTheDocument();
    cleanup();
    rhTeste.rpcs["rpc_hr_admissao_listar"] = { data: null, error: { message: "falhou" } };
    pipeline();
    expect(await screen.findByText("Não foi possível carregar as admissões. Tente de novo.")).toBeInTheDocument();
  });
});

// As ações de admissão que o RH ainda faz sobre a loja em memória (a pré-visualização do portal de demonstração):
// o que a pessoa vê no link muda com elas. Nada vem da base.
describe("a pessoa vê no link de demonstração o que o RH decidiu", () => {
  it("devolver com comentário por campo: volta à pessoa com o mesmo login e ela vê o comentário no link", () => {
    const antes = adm("p-marco").login;
    act(() => void devolverFicha("p-marco", { nif: "O NIF não bate com o cartão" }));
    expect(adm("p-marco").estado).toBe("devolvida");
    expect(adm("p-marco").login.token).toBe(antes.token);
    expect(Date.parse(adm("p-marco").login.expiraEm)).toBeGreaterThan(Date.parse(antes.expiraEm));

    link("submetida");
    expect(screen.getByRole("heading", { level: 2, name: "O RH devolveu a tua ficha" })).toBeInTheDocument();
    expect(screen.getByText("O NIF não bate com o cartão")).toBeInTheDocument();
    // Só se editam os campos devolvidos.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "NIF" })).toHaveValue("237845120");
  });

  it("a pessoa corrige o campo devolvido e volta a submeter: a ficha volta ao RH, bloqueada para ela", () => {
    link("devolvida");
    fireEvent.change(screen.getByRole("textbox", { name: "NIF" }), { target: { value: "245781960" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    expect(adm("p-nadia").estado).toBe("a_preencher");
    fireEvent.click(screen.getByRole("button", { name: "Submeter de novo" }));
    expect(adm("p-nadia").estado).toBe("submetida");
    expect(adm("p-nadia").dadosSubmetidos.nif).toBe("245781960");
    expect(screen.getByRole("heading", { level: 2, name: "À espera da decisão do RH" })).toBeInTheDocument();
    expect(screen.getByText(/Recebemos a tua ficha, o RH vai rever/)).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("rejeitar pede motivo de pelo menos 3 caracteres, arquiva e revoga o login", () => {
    expect(rejeitarFicha("p-marco", "ab")).toMatchObject({ ok: false, erro: "motivo_curto" });
    expect(adm("p-marco").estado).toBe("submetida");
    expect(rejeitarFicha("p-marco", "Sem vaga neste momento").ok).toBe(true);
    expect(adm("p-marco")).toMatchObject({ estado: "rejeitada", motivoRejeicao: "Sem vaga neste momento" });
    expect(adm("p-marco").login.revogadoEm).not.toBeNull();
    link("submetida");
    expect(screen.getByRole("heading", { level: 1, name: "Este link já não é válido" })).toBeInTheDocument();
  });

  it("renovar um login expirado dá um link novo e o antigo deixa de servir", () => {
    expect(renovarLogin("p-ruben").ok).toBe(true);
    expect(adm("p-ruben").login.token).not.toBe("expirada");
    expect(adm("p-ruben").login.anteriores).toContain("expirada");
    link("expirada");
    expect(screen.getByRole("heading", { level: 1, name: "Este link já não é válido" })).toBeInTheDocument();
  });
});

describe("gerar contrato e assinatura", () => {
  const aprovarMarco = () => act(() => void aprovarFicha("p-marco"));
  const contratoMarco = () => gerarContrato("p-marco", {
    modeloId: "mod-contrato", titulo: "Contrato de trabalho sem termo", linhas: ["Cláusula única."], campos: {
      dataAdmissao: "2026-11-10", cargoId: "cg-vendedor", tipoContrato: "sem_termo", retribuicao: 1234.5, subsidio: 7.63, duodecimos: 50,
    },
  });

  it("gerar contrato: o documento entra em Documentos da ficha e a admissão passa a «contrato por assinar»", () => {
    aprovarMarco();
    expect(adm("p-marco").estado).toBe("aprovada");
    expect(contratoMarco().ok).toBe(true);
    expect(adm("p-marco").estado).toBe("contrato_por_assinar");
    const ficha = lerEstado().fichas["p-marco"];
    expect(ficha.documentos[0]).toMatchObject({ estado: "a_aguardar_assinatura", modelo_id: "mod-contrato" });
    expect(ficha.documentos[0].titulo).toContain("Marco Ventura");
    expect(ficha.retribuicoes[0].valor_base).toBe(1234.5);
  });

  it("a pessoa lê o contrato no mesmo login e assina com o nome completo", () => {
    aprovarMarco();
    act(() => void contratoMarco());
    link("submetida");
    // Com o contrato por assinar o portal abre direto em Documentos, com o contrato à cabeça de «Recebidos».
    expect(screen.getByRole("heading", { level: 1, name: "Documentos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Contrato de trabalho sem termo" })).toBeInTheDocument();
    expect(screen.getByText("Cláusula única.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assinar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Aceite o contrato");
    fireEvent.click(screen.getByRole("checkbox", { name: "Li o contrato e aceito." }));
    fireEvent.change(screen.getByLabelText("Escreve o teu nome completo para assinar"), { target: { value: "Marco Silva" } });
    fireEvent.click(screen.getByRole("button", { name: "Assinar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("não confere");
    expect(adm("p-marco").estado).toBe("contrato_por_assinar");
    fireEvent.change(screen.getByLabelText("Escreve o teu nome completo para assinar"), { target: { value: "Marco Ventura" } });
    fireEvent.click(screen.getByRole("button", { name: "Assinar" }));
    expect(adm("p-marco").estado).toBe("contrato_assinado");
    expect(screen.getByText(/Assinado por Marco Ventura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("portal-nav-ficha"));
    expect(screen.getByText("Contrato assinado. Vais receber as credenciais por email quando o RH as enviar.")).toBeInTheDocument();
    expect(lerEstado().fichas["p-marco"].documentos[0].estado).toBe("assinado");
  });

  it("recusar assinar pede motivo; a recusa fica na admissão e o RH pode reenviar o contrato (link novo)", () => {
    link("contrato");
    fireEvent.click(screen.getByRole("button", { name: "Recusar assinar" }));
    fireEvent.change(screen.getByLabelText("Porque não queres assinar?"), { target: { value: "O horário está errado" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar recusa" }));
    expect(adm("p-vasco").contrato?.recusa?.motivo).toBe("O horário está errado");
    expect(screen.getByText(/Recusaste assinar: O horário está errado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    act(() => void reenviarContrato("p-vasco"));
    expect(adm("p-vasco").contrato?.recusa).toBeNull();
    expect(adm("p-vasco").login.anteriores).toContain("contrato");
  });
});

describe("enviar credenciais (loja em memória)", () => {
  it("só com o contrato assinado: antes disso a ação é recusada e a admissão não muda", () => {
    expect(adm("p-marco").estado).toBe("submetida");
    expect(enviarCredenciais("p-marco", { email: "marco@exemplo.pt", roleId: "papel-rh" })).toMatchObject({ ok: false, erro: "contrato_nao_assinado" });
    expect(adm("p-marco").estado).toBe("submetida");
    expect(adm("p-marco").credenciais).toBeFalsy();
  });

  it("com o contrato assinado o RH confirma ou muda o role e a admissão passa a «acesso enviado»", () => {
    expect(adm("p-eva").roleId).toBe("papel-chefia");
    expect(enviarCredenciais("p-eva", { email: "eva.tavares@olyvia-exemplo.pt", roleId: "papel-rh" }).ok).toBe(true);
    expect(adm("p-eva")).toMatchObject({ estado: "acesso_enviado", roleId: "papel-rh" });
    expect(adm("p-eva").credenciais).toMatchObject({ roleId: "papel-rh", email: "eva.tavares@olyvia-exemplo.pt" });
  });

  it("depois de enviar, o primeiro acesso liga a conta e o link temporário deixa de funcionar", () => {
    act(() => void enviarCredenciais("p-eva", { email: "eva.tavares@olyvia-exemplo.pt", roleId: "papel-chefia" }));
    expect(lerEstado().fichas["p-eva"].conta).toBeNull();
    act(() => void simularPrimeiroAcesso("p-eva"));
    expect(adm("p-eva").estado).toBe("acesso_ativo");
    expect(lerEstado().fichas["p-eva"].conta).not.toBeNull();
    expect(adm("p-eva").login.revogadoEm).not.toBeNull();
    expect(adm("p-eva").historico).toHaveLength(7);
    link("assinado");
    expect(screen.getByRole("heading", { level: 1, name: "O acesso temporário terminou" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Secções do portal" })).not.toBeInTheDocument();
  });
});

describe("portal do colaborador (página pública do link)", () => {
  it("o link de exemplo mostra o prazo e o estado, e guarda o rascunho", () => {
    link("exemplo");
    expect(screen.getByText(/O teu acesso temporário termina a \d\d\/\d\d às \d\d:\d\d/)).toBeInTheDocument();
    expect(screen.getByText(/Expira em \d+ dias?|Expira em \d+ h/)).toBeInTheDocument();
    expect(screen.getByText(/Rascunho guardado às \d\d:\d\d/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seguinte" })).toBeInTheDocument();
  });

  it("abrir o link pela primeira vez passa «convite enviado» a «a preencher»", () => {
    expect(adm("p-lara").estado).toBe("convite_enviado");
    link("lara");
    expect(adm("p-lara").estado).toBe("a_preencher");
    expect(adm("p-lara").historico.at(-1)).toMatchObject({ acao: "abrir", por: "Lara Mendes" });
  });

  it("depois de submeter mostra «À espera da decisão do RH» e a ficha fica bloqueada", () => {
    link("exemplo");
    act(() => void submeterPeloLink("exemplo", { nif: "123456789" }));
    expect(screen.getByRole("heading", { level: 2, name: "À espera da decisão do RH" })).toBeInTheDocument();
    expect(screen.getByText(/Recebemos a tua ficha, o RH vai rever/)).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(adm("p-beatriz").estado).toBe("submetida");
  });

  it.each([
    ["submetida", 2, "À espera da decisão do RH"],
    ["expirada", 1, "O teu acesso temporário terminou"],
    ["revogada", 1, "Este link já não é válido"],
    ["assinado", 2, "Contrato assinado"],
    ["contrato", 1, "Documentos"],
    ["devolvida", 2, "O RH devolveu a tua ficha"],
  ])("o token «%s» mostra o seu ecrã", (token, nivel, titulo) => {
    link(token);
    expect(screen.getByRole("heading", { level: nivel, name: titulo })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\brh(?:Adm|Portal)\./);
  });

  it("um token desconhecido vai para o portal real, que (sem resposta da função do convite) mostra a ligação inválida", async () => {
    link("qualquer");
    // O portal real usa a língua do navegador (quem abre o link não tem sessão nem preferência): no jsdom é o inglês.
    expect(await screen.findByRole("heading", { level: 1, name: "This link is no longer valid" })).toBeInTheDocument();
    expect(screen.getByText("This link is not valid. Ask HR for a new link.")).toBeInTheDocument();
  });
});

describe("Pessoas e Nova pessoa", () => {
  it("a loja de demonstração mantém as 13 pessoas de antes e as 5 que estão a entrar", () => {
    expect(lerEstado().ordem.slice(0, 13)).toHaveLength(13);
    expect(lerEstado().ordem).toHaveLength(18);
    expect(Object.keys(lerAdmissoes().porPessoa)).toEqual(expect.arrayContaining(["p-marco", "p-nadia", "p-vasco", "p-eva", "p-ruben"]));
  });

  it("as pessoas novas ainda não têm registos de assiduidade", () => {
    for (const id of ["p-marco", "p-nadia", "p-vasco", "p-eva", "p-ruben"]) {
      expect(lerEstado().fichas[id].horarioRealizado.filter((h) => h.data < "2026-10-01"), id).toHaveLength(0);
    }
  });

  it("«Criar e enviar convite» leva o e-mail e o role previsto que o RH escolheu, e sem convite não leva nada", () => {
    const base = valoresIniciais("2026-10-14");
    const valores = {
      ...base,
      geral: { ...base.geral, primeiro_nome: "Tânia", apelido: "Rocha" },
      pessoais: { ...base.pessoais, email_pessoal: "tania@exemplo.pt" },
      laborais: { ...base.laborais, cargo_id: "cg-vendedor" },
      acesso: { ...base.acesso, role_id: "papel-chefia" },
    };
    expect(paraNovaPessoa(valores, { comConvite: true, cargoNome: "Vendedor" }).extras?.convite).toEqual({ email: "tania@exemplo.pt", roleId: "papel-chefia" });
    expect(paraNovaPessoa(valores, { comConvite: false, cargoNome: "Vendedor" }).extras?.convite).toBeNull();
  });

  it("com cargo escolhido mas sem o nome do cargo, a criação recusa-se em vez de gravar a ficha sem legenda", () => {
    const base = valoresIniciais("2026-10-14");
    const valores = { ...base, laborais: { ...base.laborais, cargo_id: "cg-vendedor" } };
    expect(() => paraNovaPessoa(valores, { comConvite: false })).toThrow(/Escolha o cargo/);
  });
});
