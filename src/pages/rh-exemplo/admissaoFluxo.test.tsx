// Arranque do fluxo de admissão de RH de exemplo: o pipeline por estados, rever e aprovar, devolver com comentário (que a pessoa
// vê no portal), gerar o contrato, a pessoa assinar em Documentos do portal, enviar credenciais com role e o botão de
// credenciais desligado sem contrato assinado. Tudo em memória, sem base e sem e-mail.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { aprovarFicha, gerarContrato, submeterPeloLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { lerAdmissoes } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { paraNovaPessoa } from "@/components/rh-exemplo/novaPessoa/paraStore";
import { valoresIniciais } from "@/components/rh-exemplo/novaPessoa/tiposNova";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";
import RhPortalColaborador from "./RhPortalColaborador";

const renderEm = (endereco: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
          <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
          <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
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
  repor();
});

describe("pipeline de admissões", () => {
  it("mostra as pessoas agrupadas por estado, com contadores e «Por aprovar» destacado", () => {
    pipeline();
    for (const grupo of [
      "Por aprovar (1)", "Contrato por assinar (1)", "A aguardar credenciais (1)", "Devolvidas (1)", "A preencher (1)",
      "Convite enviado (1)", "Expirados (1)",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: grupo }), grupo).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: /Contrato por gerar/ })).not.toBeInTheDocument();
    const contadores = screen.getByRole("list", { name: "Admissões por estado" });
    expect(within(contadores).getByText("Por aprovar: 1")).toHaveClass("font-semibold");
    expect(screen.getByRole("tab", { name: /Admissões/ })).toBeInTheDocument();
    expect(adm("p-marco").estado).toBe("submetida");
  });

  it("cada linha mostra o estado em texto, o prazo do login e a ação certa", () => {
    pipeline();
    const linha = (id: string) => document.querySelector<HTMLElement>(`[data-admissao-pessoa="${id}"]`) as HTMLElement;
    expect(within(linha("p-marco")).getByText("Por aprovar")).toBeInTheDocument();
    expect(within(linha("p-marco")).getByRole("button", { name: "Rever: Marco Ventura" })).toBeInTheDocument();
    expect(within(linha("p-ruben")).getByText("Expirado", { selector: "span.text-xs.tabular-nums" })).toBeInTheDocument();
    expect(within(linha("p-ruben")).getByRole("button", { name: "Renovar: Rúben Faria" })).toBeInTheDocument();
    expect(within(linha("p-lara")).getByText(/Expira em \d+ dias/)).toBeInTheDocument();
    expect(within(linha("p-lara")).getByRole("button", { name: "Reenviar: Lara Mendes" })).toBeInTheDocument();
    expect(within(linha("p-vasco")).getByRole("button", { name: "Reenviar: Vasco Duarte" })).toBeInTheDocument();
    expect(within(linha("p-eva")).getByRole("button", { name: "Enviar credenciais: Eva Tavares" })).toBeInTheDocument();
    expect(within(linha("p-eva")).getByText("Chefia de loja")).toBeInTheDocument();
  });

  it("rever e aprovar: a ficha passa a «Contrato por gerar» e a linha pede «Gerar contrato»", () => {
    pipeline();
    fireEvent.click(screen.getByRole("button", { name: "Rever: Marco Ventura" }));
    const dialogo = screen.getByRole("dialog", { name: "Rever a ficha de Marco Ventura" });
    expect(within(dialogo).getByText("237845120")).toBeInTheDocument();
    expect(within(dialogo).getByText("•••• 8901")).toBeInTheDocument(); // o NISS só pelos últimos quatro
    expect(within(dialogo).getByText("•••• 8914")).toBeInTheDocument(); // e o IBAN também
    expect(within(dialogo).queryByText("12345678901")).not.toBeInTheDocument();
    expect(dialogo.textContent).not.toContain("PT50003500000012345678914");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aprovar" }));
    expect(adm("p-marco").estado).toBe("aprovada");
    expect(screen.getByRole("heading", { level: 2, name: "Contrato por gerar (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar contrato: Marco Ventura" })).toBeInTheDocument();
    expect(screen.getByText(/Ficha de Marco Ventura aprovada/)).toBeInTheDocument();
  });

  it("devolver com comentário por campo: volta à pessoa com o mesmo login e ela vê o comentário no link", () => {
    const antes = adm("p-marco").login;
    pipeline();
    fireEvent.click(screen.getByRole("button", { name: "Rever: Marco Ventura" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("button", { name: /^Devolver \(0\)$/ })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Comentar o campo NIF" }));
    fireEvent.change(within(dialogo).getByRole("textbox", { name: "Comentário sobre NIF" }), { target: { value: "O NIF não bate com o cartão" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolver (1)" }));
    expect(adm("p-marco").estado).toBe("devolvida");
    expect(adm("p-marco").login.token).toBe(antes.token);
    expect(Date.parse(adm("p-marco").login.expiraEm)).toBeGreaterThan(Date.parse(antes.expiraEm));
    expect(screen.getByRole("heading", { level: 2, name: "Devolvidas (2)" })).toBeInTheDocument();

    cleanup();
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
    pipeline();
    fireEvent.click(screen.getByRole("button", { name: "Rever: Marco Ventura" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rejeitar" }));
    const motivo = screen.getByRole("dialog", { name: "Rejeitar a ficha de Marco Ventura" });
    fireEvent.change(within(motivo).getByRole("textbox"), { target: { value: "ab" } });
    fireEvent.click(within(motivo).getByRole("button", { name: "Rejeitar" }));
    expect(within(motivo).getByRole("alert")).toHaveTextContent("pelo menos 3 caracteres");
    expect(adm("p-marco").estado).toBe("submetida");
    fireEvent.change(within(motivo).getByRole("textbox"), { target: { value: "Sem vaga neste momento" } });
    fireEvent.click(within(motivo).getByRole("button", { name: "Rejeitar" }));
    expect(adm("p-marco")).toMatchObject({ estado: "rejeitada", motivoRejeicao: "Sem vaga neste momento" });
    expect(adm("p-marco").login.revogadoEm).not.toBeNull();
    cleanup();
    link("submetida");
    expect(screen.getByRole("heading", { level: 1, name: "Este link já não é válido" })).toBeInTheDocument();
  });

  it("renovar um login expirado dá um link novo por 7 dias e o antigo deixa de servir", () => {
    pipeline();
    fireEvent.click(screen.getByRole("button", { name: "Renovar: Rúben Faria" }));
    expect(adm("p-ruben").login.token).not.toBe("expirada");
    expect(adm("p-ruben").login.anteriores).toContain("expirada");
    expect(screen.queryByRole("heading", { name: /Expirados/ })).not.toBeInTheDocument();
    cleanup();
    link("expirada");
    expect(screen.getByRole("heading", { level: 1, name: "Este link já não é válido" })).toBeInTheDocument();
  });
});

describe("gerar contrato e assinatura", () => {
  const aprovarMarco = () => act(() => void aprovarFicha("p-marco"));

  it("gerar contrato: escolhe o modelo, mostra a pré-visualização e o contrato entra em Documentos", () => {
    aprovarMarco();
    pipeline();
    fireEvent.click(screen.getByRole("button", { name: "Gerar contrato: Marco Ventura" }));
    const dialogo = screen.getByRole("dialog", { name: "Gerar contrato de Marco Ventura" });
    expect(within(dialogo).getByLabelText("Modelo de documento")).toHaveValue("mod-contrato");
    expect(within(dialogo).getByText(/Entre a empresa e Marco Ventura/)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Retribuição base (EUR)"), { target: { value: "1234.5" } });
    expect(within(dialogo).getByText(/1234,50 EUR/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Gerar contrato" }));
    expect(adm("p-marco").estado).toBe("contrato_por_assinar");
    const ficha = lerEstado().fichas["p-marco"];
    expect(ficha.documentos[0]).toMatchObject({ estado: "a_aguardar_assinatura", modelo_id: "mod-contrato" });
    expect(ficha.documentos[0].titulo).toContain("Marco Ventura");
    expect(ficha.retribuicoes[0].valor_base).toBe(1234.5);
    expect(screen.getByRole("heading", { level: 2, name: "Contrato por assinar (2)" })).toBeInTheDocument();
  });

  it("a pessoa lê o contrato no mesmo login e assina com o nome completo", () => {
    aprovarMarco();
    act(() => void gerarContrato("p-marco", { modeloId: "mod-contrato", titulo: "Contrato de trabalho sem termo", linhas: ["Cláusula única."], campos: {
      dataAdmissao: "2026-11-10", cargoId: "cg-vendedor", tipoContrato: "sem_termo", retribuicao: 1000, subsidio: 7.63, duodecimos: 50,
    } }));
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

  it("recusar assinar pede motivo; o RH vê a recusa e pode reenviar (link novo) ou anular", () => {
    link("contrato");
    fireEvent.click(screen.getByRole("button", { name: "Recusar assinar" }));
    fireEvent.change(screen.getByLabelText("Porque não queres assinar?"), { target: { value: "O horário está errado" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar recusa" }));
    expect(adm("p-vasco").contrato?.recusa?.motivo).toBe("O horário está errado");
    expect(screen.getByText(/Recusaste assinar: O horário está errado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    cleanup();
    renderEm("/rh-exemplo/pessoas/p-vasco");
    expect(screen.getByText(/A pessoa recusou assinar: O horário está errado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar contrato" }));
    expect(adm("p-vasco").contrato?.recusa).toBeNull();
    expect(adm("p-vasco").login.anteriores).toContain("contrato");
  });
});

describe("enviar credenciais", () => {
  it("só com o contrato assinado: o diálogo mostra o e-mail, o role (que o RH confirma ou muda) e a pré-visualização", () => {
    pipeline();
    fireEvent.click(screen.getByRole("button", { name: "Enviar credenciais: Eva Tavares" }));
    const dialogo = screen.getByRole("dialog", { name: "Enviar credenciais a Eva Tavares" });
    expect(within(dialogo).getByLabelText("E-mail de acesso")).toHaveValue("eva.tavares@olyvia-exemplo.pt");
    expect(within(dialogo).getByText("Role previsto na admissão: Chefia de loja.")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Grupo de permissões")).toHaveValue("papel-chefia");
    expect(within(dialogo).getByText(/Tmp-eva-7Kq2/)).toBeInTheDocument();
    expect(within(dialogo).getByText("Terá de mudar a palavra-passe no primeiro acesso.")).toBeInTheDocument();
    expect(within(dialogo).getByText(/nenhum e-mail é enviado de verdade/)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Grupo de permissões"), { target: { value: "papel-rh" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar credenciais" }));
    expect(adm("p-eva")).toMatchObject({ estado: "acesso_enviado", roleId: "papel-rh" });
    expect(adm("p-eva").credenciais).toMatchObject({ roleId: "papel-rh", email: "eva.tavares@olyvia-exemplo.pt" });
    expect(screen.getByRole("heading", { level: 2, name: "Acesso enviado (1)" })).toBeInTheDocument();
  });

  it("na ficha o botão está desligado, com a razão em texto, enquanto o contrato não estiver assinado", () => {
    renderEm("/rh-exemplo/pessoas/p-marco");
    const botao = screen.getByRole("button", { name: "Enviar credenciais" });
    expect(botao).toBeDisabled();
    const razao = "Só se podem enviar as credenciais depois de o contrato estar assinado.";
    expect(screen.getByText(razao)).toBeInTheDocument();
    expect(botao).toHaveAccessibleDescription(razao);
    const faixa = screen.getByRole("navigation", { name: "Progresso da admissão" });
    expect(within(faixa).getByText("Aprovação do RH").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(faixa).getByText("Convite").closest("li")).not.toHaveAttribute("aria-current");
  });

  it("na ficha de quem assinou o botão fica ativo e, depois de enviar, «Simular primeiro acesso» liga a conta", () => {
    renderEm("/rh-exemplo/pessoas/p-eva");
    fireEvent.click(screen.getByRole("button", { name: "Enviar credenciais" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Enviar credenciais a Eva Tavares" })).getByRole("button", { name: "Enviar credenciais" }));
    expect(lerEstado().fichas["p-eva"].conta).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Simular primeiro acesso" }));
    expect(adm("p-eva").estado).toBe("acesso_ativo");
    expect(lerEstado().fichas["p-eva"].conta).not.toBeNull();
    expect(adm("p-eva").login.revogadoEm).not.toBeNull();
    expect(screen.getByText(/O login temporário já não funciona/)).toBeInTheDocument();
    expect(adm("p-eva").historico).toHaveLength(7);
    expect(screen.getByText("Histórico da admissão (7)")).toBeInTheDocument();
    cleanup();
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

  it("um token desconhecido continua a mostrar o cartão de ligação inválida", () => {
    link("qualquer");
    expect(screen.getByRole("heading", { level: 1, name: "Este link ja nao e valido" })).toBeInTheDocument();
  });
});

describe("Pessoas e Nova pessoa", () => {
  it("a lista de Pessoas mostra o chip de admissão de quem está a entrar, e as 13 de antes continuam lá", () => {
    renderEm("/rh-exemplo/pessoas");
    const tabela = screen.getByRole("table");
    const marco = within(tabela).getByText("Marco Ventura").closest("tr") as HTMLElement;
    expect(within(marco).getByText("Por aprovar")).toBeInTheDocument();
    expect(within(within(tabela).getByText("Rúben Faria").closest("tr") as HTMLElement).getByText("Expirado")).toBeInTheDocument();
    expect(within(within(tabela).getByText("Marta Figueiredo").closest("tr") as HTMLElement).queryByText("Por aprovar")).not.toBeInTheDocument();
    expect(lerEstado().ordem.slice(0, 13)).toHaveLength(13);
    expect(lerEstado().ordem).toHaveLength(18);
  });

  it("as pessoas novas ainda não têm registos de assiduidade", () => {
    for (const id of ["p-marco", "p-nadia", "p-vasco", "p-eva", "p-ruben"]) {
      expect(lerEstado().fichas[id].horarioRealizado.filter((h) => h.data < "2026-10-01"), id).toHaveLength(0);
    }
  });

  it("«Criar e enviar convite» cria a admissão com o role previsto que o RH escolheu (e só com convite)", async () => {
    const base = valoresIniciais("2026-10-14");
    const valores = {
      ...base,
      geral: { ...base.geral, primeiro_nome: "Tânia", apelido: "Rocha" },
      pessoais: { ...base.pessoais, email_pessoal: "tania@exemplo.pt" },
      laborais: { ...base.laborais, cargo_id: "cg-vendedor" },
      acesso: { ...base.acesso, role_id: "papel-chefia" },
    };
    const comConvite = paraNovaPessoa(valores, { comConvite: true });
    expect(comConvite.extras?.convite).toEqual({ email: "tania@exemplo.pt", roleId: "papel-chefia" });
    expect(paraNovaPessoa(valores, { comConvite: false }).extras?.convite).toBeNull();

    const { result } = renderHook(() => usePessoas());
    let criada = "";
    await act(async () => {
      criada = (await result.current.criarPessoa(comConvite)).id;
    });
    expect(adm(criada)).toMatchObject({ estado: "convite_enviado", roleId: "papel-chefia", emailConvite: "tania@exemplo.pt" });
    let semConvite = "";
    await act(async () => {
      semConvite = (await result.current.criarPessoa(paraNovaPessoa(valores, { comConvite: false }))).id;
    });
    expect(adm(semConvite)).toBeUndefined();
  });
});
