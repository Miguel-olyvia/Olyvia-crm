/**
 * O painel «Nova pessoa» ligado aos hooks REAIS (simulados aqui): o que o assistente antigo já sabia fazer e o painel
 * novo tem de continuar a fazer.
 *
 *  - duplicados: um NIF ou NISS de outra ficha TRAVA a criação; um sinal (e-mail, nome e nascimento...) pede confirmação;
 *  - ligar a uma conta de CRM: escolher preenche os campos e, só com `hr.pessoas.conta.link`, liga;
 *  - anexos REAIS: os ficheiros escolhidos seguem depois de a ficha existir, e uma falha não desfaz a ficha;
 *  - os campos obrigatórios seguem a POSIÇÃO da configuração da admissão (convite, ficha, opcional), e o que quem cria
 *    não pode escrever (banco, fardamento) não se exige;
 *  - o que o painel grava passa pelo payload real de `criarPessoa`: falhas por secção ditas por escrito;
 *  - «Criar e enviar convite» cria e abre o envio do convite, e só depois segue para a ficha;
 *  - saúde e sindicalização (art. 9.º do RGPD) só se pedem a quem tem a permissão de as escrever.
 */
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string, p?: Record<string, unknown>) => (p ? `${chave}|${JSON.stringify(p)}` : chave) }),
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-teste", name: "Org de teste" } }),
}));

let permissoes = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.has(p), loading: false }),
}));

let configuracao: { campos: unknown[] | null; carregando: boolean; erro: boolean; semAcesso: boolean };
vi.mock("@/hooks/useAdmissaoPosicoesCampos", () => ({ useAdmissaoPosicoesCampos: () => configuracao }));

const verificarDuplicados = vi.fn();
const limparDuplicados = vi.fn();
let duplicados: { travoes: unknown[]; sinais: unknown[]; aVerificar?: boolean };
vi.mock("@/hooks/usePessoaDuplicados", () => ({
  usePessoaDuplicados: () => ({
    travoes: duplicados.travoes, sinais: duplicados.sinais, aVerificar: duplicados.aVerificar ?? false, semAcesso: false, demasiadasTentativas: false,
    verificar: verificarDuplicados, limpar: limparDuplicados,
  }),
}));

let contas: unknown[];
vi.mock("@/hooks/useContasLigaveis", () => ({ useContasLigaveis: () => ({ contas, loading: false }) }));
vi.mock("@/hooks/useCargos", () => ({
  useCargos: () => ({
    cargos: [{ id: "c1", nome: "Vendedor", activo: true }, { id: "c2", nome: "Antigo", activo: false }],
    periodos: [], isLoading: false, periodosLoading: false, periodosError: null,
  }),
}));
vi.mock("@/hooks/useLocaisTrabalho", () => ({
  useLocaisTrabalho: () => ({ locais: [{ id: "l1", nome: "Loja do Chiado", organograma_node_id: "n1" }], loading: false, semPermissao: false, criarLocal: vi.fn() }),
}));
vi.mock("@/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: () => ({ filiais: [{ id: "n1", name: "Filial Lisboa" }] }) }));
vi.mock("@/hooks/usePapeisDaOrganizacao", () => ({ usePapeisDaOrganizacao: () => ({ papeis: [{ id: "papel-1", name: "Gestor" }], loading: false }) }));
vi.mock("@/hooks/useCountries", () => ({ useCountries: () => ({ countries: [{ id: "1", name: "Portugal", code: "PT", phone_code: "+351", is_active: true, sort_order: 1 }], loading: false, error: null }) }));

const enviarAnexo = vi.fn();
vi.mock("@/hooks/useAnexarAnexoRh", () => ({ useAnexarAnexoRh: () => ({ envios: {}, enviar: enviarAnexo }) }));

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/hr/EnviarConviteDialog", () => ({
  EnviarConviteDialog: ({ open, onOpenChange, pessoaId, emailSugerido }: { open: boolean; onOpenChange: (a: boolean) => void; pessoaId: string; emailSugerido: string | null }) =>
    open ? (
      <div data-testid="convite" data-pessoa={pessoaId} data-email={emailSugerido ?? ""}>
        <button type="button" onClick={() => onOpenChange(false)}>fechar-convite</button>
      </div>
    ) : null,
}));

import type { ResultadoCriacao } from "@/hooks/usePessoas";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";
import { toast } from "@/lib/toast";
import { NovaPessoaDialogo } from "@/components/hr/NovaPessoaDialogo";

const campo = (id: string) => document.getElementById(id) as HTMLInputElement;
const painel = () => screen.getByRole("dialog");
const irParaAba = (nome: RegExp | string) => fireEvent.mouseDown(within(painel()).getByRole("tab", { name: nome }), { button: 0 });
const escrever = (id: string, valor: string) => fireEvent.change(campo(id), { target: { value: valor } });

/** Abre o seletor com o teclado e escolhe a opção com esse nome. */
function escolher(rotulo: RegExp | string, opcao: RegExp | string) {
  const gatilho = within(painel()).getByRole("combobox", { name: rotulo });
  fireEvent.keyDown(gatilho, { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

type Criar = (payload: NovaPessoaPayload) => Promise<ResultadoCriacao>;

function montar(sobre: Partial<{ onCriar: ReturnType<typeof vi.fn> }> = {}) {
  const onCriar = (sobre.onCriar ?? vi.fn().mockResolvedValue({ id: "p-nova", falhas: [] })) as unknown as Mock<Criar>;
  const onCriada = vi.fn();
  const onOpenChange = vi.fn();
  render(<NovaPessoaDialogo open onOpenChange={onOpenChange} colegas={[{ id: "p-chefe", nome_completo: "Marta" }]} onCriar={onCriar} onCriada={onCriada} />);
  return { onCriar, onCriada, onOpenChange };
}

/** O mínimo para criar: nome, cargo, tipo de contrato, subsídio e duodécimos (e o e-mail pessoal, para o convite). */
function preencherMinimo() {
  escrever("hr-novo-primeiro-nome", "Teresa");
  escrever("hr-novo-apelido", "Nogueira");
  irParaAba(/rhNova\.tabs\.contacto/);
  escrever("hr-novo-email-pessoal", "teresa@exemplo.pt");
  irParaAba(/rhNova\.tabs\.contrato/);
  escolher(/^hr\.laborais\.cargoCatalogo/, "Vendedor");
  // Com a tradução simulada a devolver a chave, `opcoes()` mostra o próprio valor como rótulo.
  escolher(/^hr\.contrato\.tipoContrato/, "sem_termo");
  irParaAba(/rhNova\.tabs\.retribuicao/);
  escrever("hr-novo-subsidio", "7,63");
  escolher(/^hr\.contrato\.duodecimos/, "50");
}

const botao = (nome: RegExp | string) => within(painel()).getByRole("button", { name: nome });
const botaoCriar = () => botao("rhForm.nova.create");
const botaoConvite = () => botao("rhNova.criarEConvidar");

function posicao(codigo: string, posicao: "convite" | "ficha" | "opcional") {
  return { codigo, origem: "pessoa", condicional: false, posicao, configuravel: true };
}

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  vi.clearAllMocks();
  permissoes = new Set(["hr.pessoas.convite.enviar"]);
  configuracao = { campos: [], carregando: false, erro: false, semAcesso: false };
  duplicados = { travoes: [], sinais: [] };
  verificarDuplicados.mockResolvedValue(null);
  contas = [];
  enviarAnexo.mockResolvedValue({ ok: true });
});

describe("NovaPessoaDialogo: a estrutura", () => {
  it("abre com seis abas, o foco no nome e o rodapé com um só botão primário", () => {
    montar();
    expect(within(painel()).getAllByRole("tab").map((a) => a.textContent)).toEqual([
      "rhNova.tabs.dados", "rhNova.tabs.contacto", "rhNova.tabs.contrato", "rhNova.tabs.retribuicao", "rhNova.tabs.outros", "rhNova.tabs.acesso",
    ]);
    expect(campo("hr-novo-primeiro-nome")).toHaveFocus();
    expect(botao("rhForm.nova.cancel")).toBeInTheDocument();
    expect(botaoConvite()).not.toHaveAttribute("aria-disabled");
    expect(botaoCriar()).not.toHaveAttribute("aria-disabled");
  });

  it("já não é uma maquete: sem avisos de «exemplo», sem link de convite de exemplo e sem anexos simulados", () => {
    montar();
    irParaAba(/rhNova\.tabs\.acesso/);
    const texto = painel().textContent ?? "";
    expect(texto).not.toContain("rhForm.nova.example");
    expect(texto).not.toContain("rhNova.convite.exemplo");
    expect(texto).not.toContain("rhNova.anexos.simulado");
    expect(texto).not.toContain("exemplo.olyvia.pt");
  });

  it("o nome de tratamento não existe (ainda não há coluna), e o tipo de horário também não (não grava nada)", () => {
    montar();
    expect(document.getElementById("hr-novo-nome-tratamento")).toBeNull();
    irParaAba(/rhNova\.tabs\.contrato/);
    expect(document.getElementById("hr-novo-tipo-horario")).toBeNull();
  });

  it("só oferece cargos ativos", () => {
    montar();
    irParaAba(/rhNova\.tabs\.contrato/);
    fireEvent.keyDown(within(painel()).getByRole("combobox", { name: /^hr\.laborais\.cargoCatalogo/ }), { key: "Enter" });
    expect(screen.getByRole("option", { name: "Vendedor" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Antigo" })).not.toBeInTheDocument();
  });

  it("Cancelar fecha o painel", () => {
    const { onOpenChange } = montar();
    fireEvent.click(botao("rhForm.nova.cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("NovaPessoaDialogo: obrigatórios pela posição da configuração da admissão", () => {
  it("sem convite, o campo na posição «convite» é obrigatório (asterisco e aria-required); «ficha» e «opcional» não", () => {
    configuracao = { campos: [posicao("telefone_pessoal", "convite"), posicao("genero", "ficha"), posicao("nacionalidade", "opcional")], carregando: false, erro: false, semAcesso: false };
    montar();
    expect(campo("hr-novo-genero")).not.toHaveAttribute("aria-required");
    irParaAba(/rhNova\.tabs\.contacto/);
    expect(campo("hr-novo-telefone-pessoal")).toHaveAttribute("aria-required", "true");
    expect(screen.getAllByText("rhNova.pos.convite").length).toBeGreaterThan(0);
    irParaAba(/rhNova\.tabs\.dados/);
    expect(screen.getByText("rhNova.pos.ficha")).toBeInTheDocument();
    expect(screen.getByText("rhNova.pos.opcional")).toBeInTheDocument();
  });

  it("criar sem preencher o obrigatório da configuração é recusado e leva o foco ao campo, na aba certa", async () => {
    configuracao = { campos: [posicao("telefone_pessoal", "convite")], carregando: false, erro: false, semAcesso: false };
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    expect(onCriar).not.toHaveBeenCalled();
    expect(within(painel()).getByRole("tab", { name: /rhNova\.tabs\.contacto/ })).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(campo("hr-novo-telefone-pessoal")).toHaveFocus());
    expect(campo("hr-novo-telefone-pessoal")).toHaveAttribute("aria-invalid", "true");
  });

  it("a «ficha» e o «opcional» nunca bloqueiam", async () => {
    configuracao = { campos: [posicao("telefone_pessoal", "ficha"), posicao("genero", "opcional")], carregando: false, erro: false, semAcesso: false };
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
  });

  it("a criar com convite só exige o e-mail pessoal: o obrigatório da configuração fica para a pessoa", async () => {
    configuracao = { campos: [posicao("telefone_pessoal", "convite")], carregando: false, erro: false, semAcesso: false };
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoConvite());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
  });

  it("sem permissão para o banco e para o fardamento, esses campos não se exigem", async () => {
    configuracao = { campos: [posicao("conta_numero", "convite"), posicao("tamanho_cima", "convite")], carregando: false, erro: false, semAcesso: false };
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
  });

  it("com a permissão do banco, o número da conta volta a ser exigido", () => {
    permissoes = new Set(["hr.pessoas.bancarios.edit"]);
    configuracao = { campos: [posicao("conta_numero", "convite")], carregando: false, erro: false, semAcesso: false };
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    expect(onCriar).not.toHaveBeenCalled();
    expect(campo("hr-novo-conta-numero")).toHaveAttribute("aria-invalid", "true");
  });

  it("a configuração a carregar faz o botão esperar e di-lo; o convite não depende dela", () => {
    configuracao = { campos: null, carregando: true, erro: false, semAcesso: false };
    montar();
    expect(botaoCriar()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("hr.form.criarMotivo.configuracao")).toBeVisible();
    expect(botaoConvite()).not.toHaveAttribute("aria-disabled");
  });

  it("se a leitura da configuração falhou, avisa (não a trata como «sem configuração»); sem acesso, só nota", () => {
    configuracao = { campos: null, carregando: false, erro: true, semAcesso: false };
    montar();
    expect(screen.getByRole("alert")).toHaveTextContent("hr.form.configuracaoNaoCarregada");
  });

  it("recusada por permissão: nota visível e sem alerta de falha", () => {
    configuracao = { campos: null, carregando: false, erro: false, semAcesso: true };
    montar();
    expect(screen.getByText("hr.form.configuracaoSemAcesso")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("NovaPessoaDialogo: duplicados", () => {
  it("ao sair do campo do NIF verifica duplicados na organização ativa, com os valores escritos", () => {
    montar();
    escrever("hr-novo-primeiro-nome", "Teresa");
    escrever("hr-novo-nif", "123456789");
    fireEvent.blur(campo("hr-novo-nif"));
    expect(verificarDuplicados).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-teste", nif: "123456789", primeiroNome: "Teresa", excluirPessoaId: null }),
    );
  });

  it("um campo que não conta para duplicados (ex.: o telefone de trabalho) não dispara a verificação", () => {
    montar();
    irParaAba(/rhNova\.tabs\.contacto/);
    escrever("hr-novo-telefone-trabalho", "912345678");
    fireEvent.blur(campo("hr-novo-telefone-trabalho"));
    expect(verificarDuplicados).not.toHaveBeenCalled();
  });

  it("um NIF de outra ficha TRAVA: os dois botões ficam desativados, com o motivo escrito, e há como abrir a ficha existente", () => {
    duplicados = { travoes: [{ pessoaId: "p-existente", nomeCompleto: "Ana", campoCoincidente: "nif", forca: "travao", estado: "activa" }], sinais: [] };
    const { onCriada } = montar();
    expect(botaoCriar()).toHaveAttribute("aria-disabled", "true");
    expect(botaoConvite()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("hr.form.criarMotivo.duplicado")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "hr.duplicados.abrirFicha" }));
    expect(onCriada).toHaveBeenCalledWith("p-existente");
  });

  it("um sinal pede confirmação: sem ela não se cria; com ela, sim", async () => {
    duplicados = { travoes: [], sinais: [{ pessoaId: "p1", nomeCompleto: "Ana", campoCoincidente: "email_pessoal", forca: "sinal", estado: "activa" }] };
    const { onCriar } = montar();
    expect(botaoCriar()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("hr.form.criarMotivo.sinal")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: /hr\.duplicados\.sinal\.confirmar/ }));
    expect(botaoCriar()).not.toHaveAttribute("aria-disabled");
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
  });
});

describe("NovaPessoaDialogo: ligar a uma conta existente", () => {
  const CONTA = { id: "conta-1", name: "Rui Amaral", email: "rui@x.pt", phone: "912345678", position: "Vendedor", location: null };

  async function escolherConta() {
    contas = [CONTA];
    const r = montar();
    fireEvent.click(within(painel()).getByRole("combobox", { name: "hr.conta.label" }));
    fireEvent.click(await screen.findByText("Rui Amaral", { selector: "p" }));
    return r;
  }

  it("escolher a conta preenche o nome, o apelido, o e-mail e o telefone de trabalho", async () => {
    await escolherConta();
    expect(campo("hr-novo-primeiro-nome").value).toBe("Rui");
    expect(campo("hr-novo-apelido").value).toBe("Amaral");
    irParaAba(/rhNova\.tabs\.contacto/);
    expect(campo("hr-novo-email-trabalho").value).toBe("rui@x.pt");
    expect(campo("hr-novo-telefone-trabalho").value).toBe("912345678");
  });

  it("com hr.pessoas.conta.link a conta segue para ser ligada; sem ela só preencheu", async () => {
    permissoes = new Set(["hr.pessoas.conta.link"]);
    const { onCriar } = await escolherConta();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    expect(onCriar.mock.calls[0][0].contaALigar).toBe("conta-1");
  });

  it("sem hr.pessoas.conta.link, contaALigar é null (o ecrã já disse que não liga)", async () => {
    const { onCriar } = await escolherConta();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    expect(onCriar.mock.calls[0][0].contaALigar).toBeNull();
  });
});

describe("NovaPessoaDialogo: anexos reais", () => {
  const pdf = (nome: string) => new File(["x"], nome, { type: "application/pdf" });

  // Cada tipo só se oferece a quem o pode escrever: cartão = editar identificação; comprovativo = dados bancários;
  // fotografia = dados pessoais.
  beforeEach(() => {
    permissoes = new Set(["hr.pessoas.identificacao.edit", "hr.pessoas.bancarios.edit", "hr.pessoas.pessoais.edit"]);
  });

  it("o ficheiro escolhido aparece com o nome e pode retirar-se (o máximo e os formatos são os do convite)", () => {
    montar();
    fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), { target: { files: [pdf("cc-frente.pdf")] } });
    expect(within(painel()).getByText("cc-frente.pdf")).toBeInTheDocument();
    fireEvent.click(within(painel()).getByRole("button", { name: /cc-frente\.pdf/ }));
    expect(within(painel()).queryByText("cc-frente.pdf")).not.toBeInTheDocument();
  });

  it("um ficheiro de formato recusado diz porquê e não entra", () => {
    montar();
    const exe = new File(["x"], "virus.exe", { type: "application/x-msdownload" });
    fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), { target: { files: [exe] } });
    expect(within(painel()).getByRole("alert")).toBeInTheDocument();
    expect(within(painel()).queryByText("virus.exe")).not.toBeInTheDocument();
  });

  it("os ficheiros só seguem DEPOIS de a ficha existir, com o id da pessoa criada", async () => {
    const ordem: string[] = [];
    const onCriar = vi.fn().mockImplementation(async () => { ordem.push("criar"); return { id: "p-nova", falhas: [] }; });
    enviarAnexo.mockImplementation(async () => { ordem.push("anexo"); return { ok: true }; });
    montar({ onCriar });
    const ficheiro = pdf("cc-frente.pdf");
    fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), { target: { files: [ficheiro] } });
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(enviarAnexo).toHaveBeenCalledTimes(1));
    expect(enviarAnexo).toHaveBeenCalledWith("p-nova", "cartao_cidadao", ficheiro);
    expect(ordem).toEqual(["criar", "anexo"]);
  });

  it("se um anexo falhar, a ficha fica criada, diz-se por escrito e a ficha abre na mesma", async () => {
    enviarAnexo.mockResolvedValue({ ok: false, codigo: "anexo_falha_envio" });
    const { onCriada } = montar();
    fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), { target: { files: [pdf("cc.pdf")] } });
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p-nova"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("hr.form.seccoes.anexos"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("sem a permissão de escrever esse tipo (cartão de cidadão), a linha não aparece", () => {
    permissoes = new Set(["hr.pessoas.pessoais.edit"]);
    montar();
    expect(screen.queryByTestId("ficheiro-anexar-cartao_cidadao")).not.toBeInTheDocument();
    expect(screen.getByTestId("ficheiro-anexar-fotografia")).toBeInTheDocument();
  });
});

describe("NovaPessoaDialogo: criar", () => {
  it("criar vazio mostra os erros por campo, conta-os por aba e leva o foco ao primeiro", () => {
    const { onCriar } = montar();
    fireEvent.click(botaoCriar());
    expect(onCriar).not.toHaveBeenCalled();
    const nome = campo("hr-novo-primeiro-nome");
    expect(nome).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(nome.getAttribute("aria-describedby") ?? "")).toHaveTextContent("hr.form.erroObrigatorio");
    expect(nome).toHaveFocus();
    expect(within(painel()).getByRole("status")).toHaveTextContent("rhNova.erros.varios");
  });

  it("um NIF com dígito de controlo errado dá erro ao sair do campo, e o certo não", () => {
    montar();
    escrever("hr-novo-nif", "123456780");
    fireEvent.blur(campo("hr-novo-nif"));
    expect(campo("hr-novo-nif")).toHaveAttribute("aria-invalid", "true");
    escrever("hr-novo-nif", "123456789");
    expect(campo("hr-novo-nif")).not.toHaveAttribute("aria-invalid");
  });

  it("preenchido, cria com o payload REAL: cargo_id e o nome do cargo, nome aparado e a organização fica a cargo do hook", async () => {
    const { onCriar, onCriada, onOpenChange } = montar();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    const payload = onCriar.mock.calls[0][0];
    expect(payload.nucleo).toMatchObject({ primeiro_nome: "Teresa", apelido: "Nogueira", cargo_id: "c1", cargo: "Vendedor" });
    expect(payload.retribuicao).toMatchObject({ duodecimosPct: 50 });
    expect(JSON.stringify(payload)).not.toContain("organization_id");
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p-nova"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith("hr.sucesso.criada");
  });

  it("uma falha por secção diz-se por escrito, com o nome da secção; a ficha abre na mesma", async () => {
    const onCriar = vi.fn().mockResolvedValue({ id: "p-nova", falhas: [{ seccao: "saude", mensagem: "x" }, { seccao: "bancarios", mensagem: "y" }] });
    const { onCriada } = montar({ onCriar });
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p-nova"));
    const aviso = (toast.error as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(aviso).toContain("hr.form.criadaComFalhas");
    expect(aviso).toContain("hr.form.seccoes.saude");
    expect(aviso).toContain("hr.form.seccoes.bancarios");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("o acesso pedido fica como pendência (a RPC devolve a secção «acesso»), dito à parte e sem contar como falha", async () => {
    const onCriar = vi.fn().mockResolvedValue({ id: "p-nova", falhas: [{ seccao: "acesso", mensagem: "" }] });
    const { onCriada } = montar({ onCriar });
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p-nova"));
    expect(toast.warning).toHaveBeenCalledWith("hr.acesso.convitePendente");
    expect(toast.success).toHaveBeenCalledWith("hr.sucesso.criada");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("se criarPessoa lançar (por exemplo, o cargo recusado), diz o erro, não fecha e não abre ficha nenhuma", async () => {
    const onCriar = vi.fn().mockRejectedValue(new Error("Cargo desativado"));
    const { onCriada, onOpenChange } = montar({ onCriar });
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Cargo desativado"));
    expect(onCriada).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(botaoCriar()).not.toHaveAttribute("aria-disabled");
  });
});

describe("NovaPessoaDialogo: criar e enviar convite", () => {
  it("cria, abre o envio do convite com o e-mail pessoal e só segue para a ficha quando ele fecha", async () => {
    const { onCriar, onCriada } = montar();
    preencherMinimo();
    fireEvent.click(botaoConvite());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    const convite = await screen.findByTestId("convite", {}, { timeout: 3000 });
    expect(convite).toHaveAttribute("data-pessoa", "p-nova");
    expect(convite).toHaveAttribute("data-email", "teresa@exemplo.pt");
    expect(onCriada).not.toHaveBeenCalled();
    // `hidden`: o teste mantém o painel aberto (`open` fixo), por isso o Radix marca o resto como aria-hidden.
    fireEvent.click(screen.getByRole("button", { name: "fechar-convite", hidden: true }));
    expect(onCriada).toHaveBeenCalledWith("p-nova");
  });

  it("sem hr.pessoas.convite.enviar o botão fica desativado, com a explicação", () => {
    permissoes = new Set();
    montar();
    expect(botaoConvite()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("hr.form.conviteSemPermissao")).toBeVisible();
  });

  it("sem e-mail pessoal não há para onde enviar: recusa-se e leva o foco ao e-mail", async () => {
    const { onCriar } = montar();
    escrever("hr-novo-primeiro-nome", "Teresa");
    escrever("hr-novo-apelido", "Nogueira");
    fireEvent.click(botaoConvite());
    expect(onCriar).not.toHaveBeenCalled();
    expect(within(painel()).getByRole("tab", { name: /rhNova\.tabs\.contacto/ })).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(campo("hr-novo-email-pessoal")).toHaveFocus());
  });
});

describe("NovaPessoaDialogo: saúde e sindicalização", () => {
  it("sem as permissões de as escrever, os campos nem aparecem (art. 9.º do RGPD)", () => {
    montar();
    irParaAba(/rhNova\.tabs\.outros/);
    expect(document.getElementById("hr-novo-saude-incapacidade")).toBeNull();
    expect(document.getElementById("hr-novo-sindicalizado")).toBeNull();
    expect(document.getElementById("hr-novo-habilitacao")).not.toBeNull();
  });

  it("com as permissões, aparecem e seguem no payload", async () => {
    permissoes = new Set(["hr.pessoas.saude.edit", "hr.pessoas.sindicalizacao.edit"]);
    const { onCriar } = montar();
    preencherMinimo();
    irParaAba(/rhNova\.tabs\.outros/);
    escrever("hr-novo-saude-incapacidade", "60");
    escolher(/^hr\.pendencias\.campo\.sindicalizado/, "sim");
    escrever("hr-novo-sindicato", "SINTAP");
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    const payload = onCriar.mock.calls[0][0];
    expect(payload.saude).toMatchObject({ incapacidade_percentagem: 60 });
    expect(payload.sindicalizacao).toMatchObject({ sindicalizado: true, sindicato: "SINTAP" });
  });
});

describe("NovaPessoaDialogo: cada aba tem os seus campos reais", () => {
  it("todos os campos de cada aba estão no ecrã", () => {
    permissoes = new Set(["hr.pessoas.saude.edit", "hr.pessoas.sindicalizacao.edit", "hr.pessoas.conta.link", "roles.view"]);
    contas = [];
    montar();
    const abas: Array<[RegExp, string[]]> = [
      [/rhNova\.tabs\.dados/, ["hr-novo-primeiro-nome", "hr-novo-genero", "hr-novo-nacionalidade", "hr-novo-estado-civil", "hr-novo-dependentes", "hr-novo-data-nascimento", "hr-novo-naturalidade-concelho", "hr-novo-tipo-documento", "hr-novo-nif", "hr-novo-niss", "hr-novo-carta-numero"]],
      [/rhNova\.tabs\.contacto/, ["hr-novo-email-pessoal", "hr-novo-email-trabalho", "hr-novo-morada-linha2", "hr-novo-morada-distrito", "hr-novo-morada-pais", "hr-novo-emergencia-nome", "hr-novo-emergencia-telefone-alt"]],
      [/rhNova\.tabs\.contrato/, ["hr-novo-local", "hr-novo-reporta-a", "hr-novo-cargo", "hr-novo-data-admissao", "hr-novo-tipo-contrato", "hr-novo-regime", "hr-novo-tipo-trabalho", "hr-novo-horas-trabalho", "hr-novo-politica-feriados", "hr-novo-categoria-funcao"]],
      [/rhNova\.tabs\.retribuicao/, ["hr-novo-subsidio", "hr-novo-subsidio-modo", "hr-novo-duodecimos", "hr-novo-conta-numero", "hr-novo-conta-agencia", "hr-novo-conta-bic"]],
      [/rhNova\.tabs\.outros/, ["hr-novo-habilitacao", "hr-novo-saude-incapacidade", "hr-novo-sindicalizado", "hr-novo-tamanho-cima", "hr-novo-tamanho-calcado"]],
      [/rhNova\.tabs\.acesso/, ["hr-novo-criar-acesso", "hr-novo-papel", "hr-novo-email-acesso"]],
    ];
    for (const [aba, ids] of abas) {
      irParaAba(aba);
      for (const id of ids) expect(campo(id), id).toBeInTheDocument();
    }
  });
});

const TRAVAO = { pessoaId: "p-existente", nomeCompleto: "Ana", campoCoincidente: "nif", forca: "travao", estado: "activa" };
const SINAL = { pessoaId: "p1", nomeCompleto: "Ana", campoCoincidente: "email_pessoal", forca: "sinal", estado: "activa" };
const formulario = () => painel().querySelector("form") as HTMLFormElement;
const estado = () => within(painel()).getByRole("status");

/**
 * Com o hook simulado, o travão que ele devolve só vale para os valores de que se verificou: depois de escrever (o que muda os
 * valores) tem de se voltar a verificar, como o ecrã faz ao sair do campo. Deixa o resultado simulado como o de agora.
 */
async function verificarDeNovo(candidatos: unknown[]) {
  verificarDuplicados.mockResolvedValue(candidatos);
  irParaAba(/rhNova.tabs.dados/);
  fireEvent.blur(campo("hr-novo-primeiro-nome"));
  await act(async () => {});
}

describe("NovaPessoaDialogo: não se fecha a meio de criar", () => {
  const pdf = (nome: string) => new File(["x"], nome, { type: "application/pdf" });

  it("a criar, Cancelar fica aria-disabled e é ignorado, o Esc também, e os ficheiros escolhidos não se limpam a meio do envio", async () => {
    permissoes = new Set(["hr.pessoas.identificacao.edit"]);
    let terminarEnvio!: (r: { ok: boolean }) => void;
    enviarAnexo.mockImplementation(() => new Promise((resolver) => { terminarEnvio = resolver; }));
    const { onOpenChange, onCriada } = montar();
    fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), { target: { files: [pdf("cc.pdf")] } });
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(enviarAnexo).toHaveBeenCalledTimes(1));

    expect(botao("rhForm.nova.cancel")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao("rhForm.nova.cancel"));
    fireEvent.keyDown(painel(), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    irParaAba(/rhNova\.tabs\.dados/);
    expect(within(painel()).getByText("cc.pdf")).toBeInTheDocument();

    terminarEnvio({ ok: true });
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p-nova"));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("um duplo clique (dois envios antes de o ecrã se atualizar) cria uma só vez", async () => {
    const { onCriar } = montar();
    preencherMinimo();
    act(() => {
      fireEvent.submit(formulario());
      fireEvent.submit(formulario());
    });
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(onCriar).toHaveBeenCalledTimes(1);
  });
});

describe("NovaPessoaDialogo: descartar o que está por gravar", () => {
  it("com alterações, Cancelar pede confirmação: continuar a editar não fecha, descartar fecha", () => {
    const { onOpenChange } = montar();
    escrever("hr-novo-primeiro-nome", "Teresa");
    fireEvent.click(botao("rhForm.nova.cancel"));
    const alerta = screen.getByRole("alertdialog");
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(within(alerta).getByRole("button", { name: "rhNova.descartar.continuar" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(campo("hr-novo-primeiro-nome").value).toBe("Teresa");

    fireEvent.click(botao("rhForm.nova.cancel"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "rhNova.descartar.confirmar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("com alterações, o Esc também pede confirmação em vez de fechar", () => {
    const { onOpenChange } = montar();
    escrever("hr-novo-primeiro-nome", "Teresa");
    fireEvent.keyDown(painel(), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("com alterações, um clique fora também pede confirmação (e não é um bloqueio mudo)", async () => {
    const { onOpenChange } = montar();
    escrever("hr-novo-primeiro-nome", "Teresa");
    // O Radix só começa a ouvir cliques fora um tique depois de o painel abrir.
    await new Promise((resolver) => setTimeout(resolver, 10));
    // Um clique inteiro: o Radix adia o «clique fora» até o clique acabar.
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Esc no aviso de descartar devolve o foco a quem o tinha (o campo onde se carregou Esc), não ao BODY", async () => {
    const { onOpenChange } = montar();
    escrever("hr-novo-primeiro-nome", "Teresa");
    expect(campo("hr-novo-primeiro-nome")).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalled();
    await waitFor(() => expect(campo("hr-novo-primeiro-nome")).toHaveFocus());
  });

  it("«Continuar a editar» devolve o foco ao botão Cancelar que abriu o aviso", async () => {
    montar();
    escrever("hr-novo-primeiro-nome", "Teresa");
    const cancelar = botao("rhForm.nova.cancel");
    cancelar.focus();
    fireEvent.click(cancelar);
    const alerta = await screen.findByRole("alertdialog");
    fireEvent.click(within(alerta).getByRole("button", { name: "rhNova.descartar.continuar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(cancelar).toHaveFocus());
  });

  it("sem alterações, o Esc e Cancelar fecham logo, sem perguntar", () => {
    const { onOpenChange } = montar();
    fireEvent.keyDown(painel(), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("NovaPessoaDialogo: duplicados travam a criação, mesmo sem sair do campo", () => {
  it("enquanto verifica, «Criar pessoa» fica travado e di-lo", () => {
    duplicados = { travoes: [], sinais: [], aVerificar: true };
    montar();
    expect(botaoCriar()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("hr.form.criarMotivo.aVerificar")).toBeVisible();
  });

  it("criar espera pela verificação em curso: só cria quando ela chega sem travão", async () => {
    let chegou!: (candidatos: unknown[]) => void;
    verificarDuplicados.mockImplementation(() => new Promise((resolver) => { chegou = resolver; }));
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    expect(verificarDuplicados).toHaveBeenCalled();
    expect(onCriar).not.toHaveBeenCalled();
    await act(async () => { chegou([]); });
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
  });

  it("verifica os valores escritos ao criar (sem ter saído do campo do NIF) e um travão novo impede a criação", async () => {
    verificarDuplicados.mockResolvedValue([TRAVAO]);
    const { onCriar } = montar();
    preencherMinimo();
    irParaAba(/rhNova.tabs.dados/);
    escrever("hr-novo-nif", "123456789");
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(estado()).toHaveTextContent("hr.form.criarMotivo.duplicado"));
    expect(verificarDuplicados).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-teste", nif: "123456789" }));
    expect(onCriar).not.toHaveBeenCalled();
  });

  it("um sinal novo, por confirmar, também impede a criação e pede a confirmação", async () => {
    verificarDuplicados.mockResolvedValue([SINAL]);
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(estado()).toHaveTextContent("hr.form.criarMotivo.sinal"));
    expect(onCriar).not.toHaveBeenCalled();
  });

  it("um travão antigo deixa de se mostrar quando o NIF muda (o resultado já não é deste NIF)", () => {
    duplicados = { travoes: [TRAVAO], sinais: [] };
    montar();
    expect(screen.getByText(/hr\.duplicados\.travao\.titulo/)).toBeVisible();
    expect(botaoCriar()).toHaveAttribute("aria-disabled", "true");
    escrever("hr-novo-nif", "123456789");
    expect(screen.queryByText(/hr\.duplicados\.travao\.titulo/)).not.toBeInTheDocument();
    expect(botaoCriar()).not.toHaveAttribute("aria-disabled");
  });

  it("uma ficha apagada com o mesmo NIF: não se abre (não há ficha para abrir); diz que está apagada", () => {
    duplicados = { travoes: [{ ...TRAVAO, estado: "apagada" }], sinais: [] };
    const { onCriada } = montar();
    expect(screen.queryByRole("button", { name: "hr.duplicados.abrirFicha" })).not.toBeInTheDocument();
    expect(screen.getByText(/hr\.duplicados\.apagada\.titulo/)).toBeVisible();
    expect(onCriada).not.toHaveBeenCalled();
  });
});

describe("NovaPessoaDialogo: botões travados falam (aria-disabled, não disabled)", () => {
  it("com um travão, os botões continuam focáveis, e o clique ignorado diz o motivo em role=status", async () => {
    duplicados = { travoes: [TRAVAO], sinais: [] };
    const { onCriar } = montar();
    preencherMinimo();
    await verificarDeNovo([TRAVAO]);
    expect(botaoCriar()).not.toBeDisabled();
    expect(botaoConvite()).not.toBeDisabled();
    botaoCriar().focus();
    expect(botaoCriar()).toHaveFocus();
    fireEvent.click(botaoConvite());
    expect(onCriar).not.toHaveBeenCalled();
    expect(estado()).toHaveTextContent("hr.form.criarMotivo.duplicado");
  });

  it("Enter num campo (envio do formulário) com o botão travado diz porquê, e não cria", async () => {
    duplicados = { travoes: [TRAVAO], sinais: [] };
    const { onCriar } = montar();
    preencherMinimo();
    await verificarDeNovo([TRAVAO]);
    fireEvent.submit(formulario());
    expect(onCriar).not.toHaveBeenCalled();
    expect(estado()).toHaveTextContent("hr.form.criarMotivo.duplicado");
  });

  it("à espera da configuração, Enter diz que se espera por ela", () => {
    configuracao = { campos: null, carregando: true, erro: false, semAcesso: false };
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.submit(formulario());
    expect(onCriar).not.toHaveBeenCalled();
    expect(estado()).toHaveTextContent("hr.form.criarMotivo.configuracao");
  });

  it("sem permissão para convites, clicar em «Criar e enviar convite» diz porquê", () => {
    permissoes = new Set();
    const { onCriar } = montar();
    preencherMinimo();
    fireEvent.click(botaoConvite());
    expect(onCriar).not.toHaveBeenCalled();
    expect(estado()).toHaveTextContent("hr.form.conviteSemPermissao");
  });
});

describe("NovaPessoaDialogo: a posição do campo lê-se", () => {
  it("«no convite» está ligada ao campo por aria-describedby e não escondida dos leitores de ecrã", () => {
    configuracao = { campos: [posicao("telefone_pessoal", "convite")], carregando: false, erro: false, semAcesso: false };
    montar();
    irParaAba(/rhNova\.tabs\.contacto/);
    const ligados = (campo("hr-novo-telefone-pessoal").getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    const alvo = ligados.map((id) => document.getElementById(id)).find((el) => el?.textContent === "rhNova.pos.convite");
    expect(alvo).toBeDefined();
    expect(alvo?.closest('[aria-hidden="true"]')).toBeNull();
  });
});

describe("NovaPessoaDialogo: a lista de erros leva às abas", () => {
  it("depois de tentar criar, há uma ligação por aba com erros; carregar leva à aba e ao primeiro campo com erro", async () => {
    montar();
    expect(within(painel()).queryByRole("group", { name: "rhNova.erros.titulo" })).not.toBeInTheDocument();
    fireEvent.click(botaoCriar());
    const grupo = within(painel()).getByRole("group", { name: "rhNova.erros.titulo" });
    fireEvent.click(within(grupo).getByRole("button", { name: /rhNova\.tabs\.retribuicao/ }));
    expect(within(painel()).getByRole("tab", { name: /rhNova\.tabs\.retribuicao/ })).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(campo("hr-novo-subsidio")).toHaveFocus());
  });
});

describe("NovaPessoaDialogo: o grupo de permissões depende de roles.view", () => {
  it("sem roles.view não há seletor vazio: diz o motivo, e pedir acesso não fica bloqueado por um campo que não se vê", async () => {
    const { onCriar } = montar();
    preencherMinimo();
    irParaAba(/rhNova\.tabs\.acesso/);
    expect(document.getElementById("hr-novo-papel")).toBeNull();
    expect(screen.getByText("rhNova.h.papelSemPermissao")).toBeVisible();
    fireEvent.click(campo("hr-novo-criar-acesso"));
    escrever("hr-novo-email-acesso", "acesso@x.pt");
    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
  });

  it("com roles.view o seletor existe e o grupo volta a ser exigido", () => {
    permissoes = new Set(["roles.view"]);
    montar();
    irParaAba(/rhNova\.tabs\.acesso/);
    expect(document.getElementById("hr-novo-papel")).not.toBeNull();
    expect(screen.queryByText("rhNova.h.papelSemPermissao")).not.toBeInTheDocument();
  });
});
