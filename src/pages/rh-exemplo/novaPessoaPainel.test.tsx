import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
import { CAMPOS_OBRIGATORIOS_ADMISSAO } from "@/lib/hr/admissaoObrigatorios";
import { CAMPOS_RH_OBRIGATORIOS, CAMPOS_RH_OPCIONAIS } from "@/components/rh-exemplo/lib/admissaoCamposRh";
import PessoasRh from "./PessoasRh";

// A organizacao activa, as permissoes e o Supabase vem de src/test/rhExemploProviders.tsx (organizacao de teste, base vazia).
vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

const toastes = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toastes }));

// O envio do convite (e-mail, link) tem os seus próprios testes; aqui só interessa que abre a seguir à criação e que fechá-lo segue para a ficha.
vi.mock("@/components/rh-exemplo/EnviarConviteDialog", () => ({
  EnviarConviteDialog: ({ open, onOpenChange, pessoaId, emailSugerido }: {
    open: boolean; onOpenChange: (a: boolean) => void; pessoaId: string; emailSugerido: string | null;
  }) => (open ? (
    <div role="dialog" aria-label="convite">
      <span>{`convite:${pessoaId}:${emailSugerido}`}</span>
      <button type="button" onClick={() => onOpenChange(false)}>fechar-convite</button>
    </div>
  ) : null),
}));

const renderLista = () =>
  renderRh(
    <Routes>
      <Route path="/rh-exemplo/pessoas/:id?" element={<PessoasRh />} />
    </Routes>,
    { rota: "/rh-exemplo/pessoas" },
  );

beforeAll(() => {
  // O Radix Select precisa de APIs que o jsdom não traz.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  // O interruptor do Radix dentro de um formulário mede-se com ResizeObserver, que o jsdom não traz.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  reporRhTeste();
  rhTeste.isSystemAdmin = true; // quem cria pessoas: todas as permissoes de RH
  // O que a base devolve ao painel: a posicao de cada campo da admissao (os da pessoa no convite, os do RH fora dele)
  // e o catalogo de cargos da organizacao.
  rhTeste.rpcs["rpc_hr_admissao_posicoes_campos"] = {
    data: [
      ...CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => ({
        codigo: c.codigo, origem: c.origem, condicional: false, posicao: c.origem === "rh" ? "rh" : "convite", configuravel: c.origem === "pessoa",
      })),
      ...[...CAMPOS_RH_OBRIGATORIOS, ...CAMPOS_RH_OPCIONAIS].map((c) => ({
        codigo: c.codigo, origem: "rh", condicional: false, posicao: "rh", configuravel: false,
      })),
    ],
    error: null,
  };
  rhTeste.respostas["hr_cargos"] = [
    { id: "cargo-vendedor", organization_id: "org-teste", nome: "Vendedor", horas_referencia: 40, activo: true, created_at: "2026-01-01", updated_at: "2026-01-01" },
  ];
  window.localStorage.setItem("language", "pt");
  repor();
});

const painel = () => screen.getByRole("dialog");
const campo = (id: string) => document.getElementById(id) as HTMLInputElement;

function abrirNovaPessoa() {
  renderLista();
  fireEvent.click(screen.getByRole("button", { name: "Nova pessoa" }));
  return painel();
}

const irParaAba = (nome: RegExp | string) => fireEvent.mouseDown(within(painel()).getByRole("tab", { name: nome }), { button: 0 });
const escrever = (id: string, valor: string) => fireEvent.change(campo(id), { target: { value: valor } });

/** Abre o seletor com o teclado e escolhe a opção com esse nome. */
async function escolher(rotulo: RegExp | string, opcao: RegExp | string) {
  const gatilho = within(painel()).getByRole("combobox", { name: rotulo });
  fireEvent.keyDown(gatilho, { key: "Enter" });
  // As opções que vêm da base (cargos) chegam depois de o ecrã abrir.
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
}

/** O mínimo para criar com convite: o nome e o e-mail pessoal. Cargo e contrato são opcionais na admissão. */
function preencherMinimo() {
  escrever("hr-novo-primeiro-nome", "Teresa");
  escrever("hr-novo-apelido", "Nogueira");
  irParaAba(/Contacto e morada/);
  escrever("hr-novo-email-pessoal", "teresa@exemplo.pt");
  escrever("hr-novo-telefone-pessoal", "912345678");
}

/** Se a pessoa passou: o cargo, o contrato (tipo e data de início, juntos) e os duodécimos, que só se pedem com cargo e contrato. */
async function preencherCargoEContrato() {
  irParaAba(/Contrato e local/);
  await escolher(/^Cargo/, /Vendedor/);
  await escolher(/^Tipo de contrato/, /Sem termo/);
  escrever("hr-novo-data-inicio", "2026-10-01");
  irParaAba(/Retribuição e bancário/);
  await escolher(/^Subsidios em duodecimos/, /^50 %/);
}

/** O que a admissão gravou por tabela (só os inserts) e as RPCs chamadas. */
const insercoes = (tabela: string) => rhTeste.escritas.filter((e) => e.tabela === tabela && e.metodo === "insert");
const rpcsChamadas = () => rhTeste.chamadas.flatMap((c) => (c.rpc ? [c.rpc] : []));

describe("Nova pessoa: permissões do botão", () => {
  it("só com hr.pessoas.create (sem hr.pessoas.view) não há «Nova pessoa»: a base não devolve o id da pessoa criada", () => {
    rhTeste.isSystemAdmin = false;
    rhTeste.permissoes = new Set(["hr.pessoas.create", "hr.pessoas.view.own"]);
    renderLista();
    expect(screen.queryByRole("button", { name: "Nova pessoa" })).not.toBeInTheDocument();
  });

  it("com hr.pessoas.create e hr.pessoas.view há «Nova pessoa»", () => {
    rhTeste.isSystemAdmin = false;
    rhTeste.permissoes = new Set(["hr.pessoas.create", "hr.pessoas.view"]);
    renderLista();
    expect(screen.getByRole("button", { name: "Nova pessoa" })).toBeInTheDocument();
  });
});

describe("RH de exemplo: Nova pessoa em painel lateral", () => {
  it("abre o painel com migalhas, selo, seis abas e o rodapé com um só botão primário", () => {
    const nova = abrirNovaPessoa();
    expect(within(nova).getByRole("navigation", { name: "Onde está" })).toHaveTextContent("Recursos Humanos");
    expect(within(nova).getByRole("heading", { name: "Nova pessoa" })).toBeInTheDocument();
    expect(within(nova).getByText("Novo · por gravar")).toBeInTheDocument();
    expect(within(nova).getAllByRole("tab").map((a) => a.textContent)).toEqual([
      "Dados pessoais", "Contacto e morada", "Contrato e local", "Retribuição e bancário", "Outros dados", "Acesso e convite",
    ]);
    expect(within(nova).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(nova).getByRole("button", { name: "Criar e enviar convite" })).toBeInTheDocument();
    expect(within(nova).getByRole("button", { name: "Criar pessoa" })).toBeInTheDocument();
    expect(within(nova).getByText(/O link do convite vale 7 dias/)).toBeInTheDocument();
    // Ligado à base: já não se diz que nada fica gravado.
    expect(within(nova).queryByText(/nada fica gravado/)).not.toBeInTheDocument();
  });

  it("o foco inicial vai para o nome", () => {
    abrirNovaPessoa();
    expect(campo("hr-novo-primeiro-nome")).toHaveFocus();
  });

  it("cada campo diz se é obrigatório e onde se pede (no convite, na ficha, opcional), e as secções têm o interruptor do convite", async () => {
    const nova = abrirNovaPessoa();
    expect(within(nova).getAllByText("obrigatório").length).toBeGreaterThanOrEqual(2);
    // A posição de cada campo vem da configuração da admissão, lida da base: chega depois de o painel abrir.
    await waitFor(() => expect(within(nova).getAllByText("no convite").length).toBeGreaterThan(3));
    expect(within(nova).getAllByRole("switch", { name: "Pedir à pessoa no convite" }).length).toBeGreaterThanOrEqual(3);
    expect(campo("hr-novo-primeiro-nome")).toHaveAttribute("aria-required", "true");
    irParaAba(/Contrato e local/);
    await waitFor(() => expect(within(nova).getAllByText("só do RH").length).toBeGreaterThanOrEqual(3));
  });

  it("todos os campos de cada aba estão no ecrã, sem esconder nenhum", () => {
    const nova = abrirNovaPessoa();
    const abas: Array<[RegExp, string[]]> = [
      [/Dados pessoais/, ["hr-novo-nome-tratamento", "hr-novo-genero", "hr-novo-nacionalidade", "hr-novo-estado-civil", "hr-novo-dependentes", "hr-novo-data-nascimento", "hr-novo-naturalidade-concelho", "hr-novo-tipo-documento", "hr-novo-nif", "hr-novo-niss", "hr-novo-carta-numero", "hr-novo-conta"]],
      [/Contacto e morada/, ["hr-novo-email-pessoal", "hr-novo-telefone-pessoal", "hr-novo-morada-linha2", "hr-novo-morada-distrito", "hr-novo-morada-pais", "hr-novo-emergencia-nome", "hr-novo-emergencia-telefone-alt"]],
      [/Contrato e local/, ["hr-novo-local", "hr-novo-reporta-a", "hr-novo-cargo", "hr-novo-tipo-contrato", "hr-novo-data-inicio", "hr-novo-data-antiguidade", "hr-novo-regime", "hr-novo-tipo-trabalho", "hr-novo-horas-trabalho", "hr-novo-politica-feriados"]],
      [/Retribuição e bancário/, ["hr-novo-duodecimos", "hr-novo-conta-numero", "hr-novo-conta-agencia", "hr-novo-conta-bic"]],
      [/Outros dados/, ["hr-novo-habilitacao", "hr-novo-saude-incapacidade", "hr-novo-sindicalizado", "hr-novo-tamanho-cima", "hr-novo-tamanho-calcado"]],
      [/Acesso e convite/, ["hr-novo-criar-acesso", "hr-novo-papel", "hr-novo-email-acesso"]],
    ];
    for (const [aba, ids] of abas) {
      irParaAba(aba);
      for (const id of ids) expect(campo(id), id).toBeInTheDocument();
    }
    // O link verdadeiro só existe depois de enviar, e mostra-se uma vez no diálogo de envio: aqui só a validade.
    expect(within(nova).queryByText(/exemplo\.olyvia\.pt\/convite\//)).not.toBeInTheDocument();
    // «Tipo de horário» não existe na criação (a base não o recebe): o horário por dia define-se na ficha.
    expect(campo("hr-novo-tipo-horario")).toBeNull();
    // A contratação é uma só data, a de início do contrato: já não há «Data de admissão» à parte.
    expect(campo("hr-novo-data-admissao")).toBeNull();
  });

  it("criar vazio mostra os erros por campo ligados por aria-describedby, conta-os por aba e leva o foco ao primeiro", () => {
    const nova = abrirNovaPessoa();
    fireEvent.click(within(nova).getByRole("button", { name: "Criar pessoa" }));
    const nome = campo("hr-novo-primeiro-nome");
    expect(nome).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(nome.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Obrigatório");
    expect(nome).toHaveFocus();
    expect(within(nova).getByRole("status")).toHaveTextContent(/campos por corrigir/);
    const abas = within(nova).getAllByRole("tab");
    expect(abas[0]).toHaveTextContent("por corrigir");
    // Cargo e contrato são opcionais na admissão: criar vazio só falha nos nomes.
    expect(abas[2]).not.toHaveTextContent("por corrigir");
    expect(abas[3]).not.toHaveTextContent("por corrigir");
    expect(abas[5]).not.toHaveTextContent("por corrigir");
  });

  it("com erro só noutra aba, criar abre essa aba e dá foco ao campo", async () => {
    const nova = abrirNovaPessoa();
    escrever("hr-novo-primeiro-nome", "Teresa");
    escrever("hr-novo-apelido", "Nogueira");
    fireEvent.click(within(nova).getByRole("button", { name: "Criar e enviar convite" }));
    expect(within(nova).getByRole("tab", { name: /Contacto e morada/ })).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(campo("hr-novo-email-pessoal")).toHaveFocus());
    expect(campo("hr-novo-email-pessoal")).toHaveAttribute("aria-invalid", "true");
  });

  it("um NIF com dígito de controlo errado dá erro no campo, e o certo não", () => {
    abrirNovaPessoa();
    escrever("hr-novo-nif", "123456780");
    fireEvent.blur(campo("hr-novo-nif"));
    expect(campo("hr-novo-nif")).toHaveAttribute("aria-invalid", "true");
    escrever("hr-novo-nif", "123456789");
    expect(campo("hr-novo-nif")).not.toHaveAttribute("aria-invalid");
  });

  it("os anexos já não são simulados: a zona é a dos ficheiros reais, sem o contador nem o aviso de simulação", () => {
    const nova = abrirNovaPessoa();
    expect(within(nova).queryByText(/simulad/i)).not.toBeInTheDocument();
    expect(within(nova).queryByLabelText(/Ficheiro de Cartão de cidadão/)).not.toBeInTheDocument();
  });

  it("Cancelar fecha o painel", () => {
    const nova = abrirNovaPessoa();
    fireEvent.click(within(nova).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preenche, cria e envia o convite: a pessoa entra na lista, a ficha abre e mostra o que se escreveu", async () => {
    const nova = abrirNovaPessoa();
    preencherMinimo();
    await preencherCargoEContrato();
    irParaAba(/Dados pessoais/);
    escrever("hr-novo-nome-tratamento", "Teté");
    escrever("hr-novo-nif", "123456789");
    // A base devolve a ficha criada: o insert responde com o id e a lista e a ficha voltam a lê-la.
    rhTeste.respostas["pessoas"] = [{
      id: "pessoa-teresa", organization_id: "org-teste", primeiro_nome: "Teresa", apelido: "Nogueira", nome_completo: "Teresa Nogueira",
      email_pessoal: "teresa@exemplo.pt", cargo: "Vendedor", cargo_id: "cargo-vendedor", nif: "123456789",
      estado_registo: "activo",
    }];
    rhTeste.respostas["pessoas_vinculos"] = [{ id: "vinculo-teresa" }];
    fireEvent.click(within(nova).getByRole("button", { name: "Criar e enviar convite" }));
    // Criada a ficha, abre o envio do convite (o diálogo tem os seus testes); fechá-lo segue para a ficha.
    expect(await screen.findByText("convite:pessoa-teresa:teresa@exemplo.pt")).toBeInTheDocument();
    // O nome de tratamento ainda não tem coluna onde gravar: o ecrã di-lo por escrito em vez de o perder em silêncio.
    expect(toastes.warning).toHaveBeenCalledWith(expect.stringContaining("nome de tratamento"));
    expect(toastes.error).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "fechar-convite", hidden: true }));
    const titulo = await screen.findByRole("heading", { level: 1, name: "Teresa Nogueira" });
    const ficha = titulo.closest<HTMLElement>('[role="dialog"]') as HTMLElement;
    expect(within(ficha).getAllByRole("tab")).toHaveLength(8);
    expect(await within(ficha).findByText(/^Vendedor( · .+)?$/)).toBeInTheDocument();
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Detalhes pessoais/ }), { button: 0 });
    expect(await within(ficha).findByDisplayValue("teresa@exemplo.pt")).toBeInTheDocument();
  });

  it("a data de início do contrato nasce vazia (nada de «hoje» por omissão) e o cargo, o tipo e os duodécimos não são obrigatórios", () => {
    abrirNovaPessoa();
    irParaAba(/Contrato e local/);
    expect(campo("hr-novo-data-inicio")).toHaveValue("");
    for (const id of ["hr-novo-cargo", "hr-novo-tipo-contrato", "hr-novo-data-inicio"]) {
      expect(document.getElementById(id), id).not.toHaveAttribute("aria-required", "true");
    }
    irParaAba(/Retribuição e bancário/);
    expect(document.getElementById("hr-novo-duodecimos")).not.toHaveAttribute("aria-required", "true");
  });

  it("só com o nome e o e-mail, cria a ficha sem cargo, sem contrato, sem retribuição e sem afectação", async () => {
    const nova = abrirNovaPessoa();
    preencherMinimo();
    rhTeste.respostas["pessoas"] = [{
      id: "pessoa-sem-contrato", organization_id: "org-teste", primeiro_nome: "Teresa", apelido: "Nogueira", nome_completo: "Teresa Nogueira",
      email_pessoal: "teresa@exemplo.pt", cargo: null, cargo_id: null, estado_registo: "activo",
    }];
    fireEvent.click(within(nova).getByRole("button", { name: "Criar e enviar convite" }));
    expect(await screen.findByText("convite:pessoa-sem-contrato:teresa@exemplo.pt")).toBeInTheDocument();
    const [pessoa] = insercoes("pessoas");
    expect(pessoa.payload).toMatchObject({ primeiro_nome: "Teresa", apelido: "Nogueira", cargo_id: null, cargo: null, data_admissao: null });
    expect(insercoes("pessoas_vinculos")).toHaveLength(0);
    expect(insercoes("pessoas_vinculos_horas")).toHaveLength(0);
    expect(insercoes("pessoas_afectacoes")).toHaveLength(0);
    expect(rpcsChamadas()).not.toContain("rpc_hr_retribuicao_definir_pessoal");
    expect(toastes.error).not.toHaveBeenCalled();
  });

  it("com um campo do contrato escrito, o tipo e a data de início passam a obrigatórios juntos: nada se cria e o foco vai ao primeiro", async () => {
    const nova = abrirNovaPessoa();
    preencherMinimo();
    irParaAba(/Contrato e local/);
    escrever("hr-novo-horas-trabalho", "40");
    expect(document.getElementById("hr-novo-tipo-contrato")).toHaveAttribute("aria-required", "true");
    expect(campo("hr-novo-data-inicio")).toHaveAttribute("aria-required", "true");
    fireEvent.click(within(nova).getByRole("button", { name: "Criar e enviar convite" }));
    expect(within(nova).getByRole("tab", { name: /Contrato e local/ })).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(document.getElementById("hr-novo-tipo-contrato")).toHaveFocus());
    expect(document.getElementById("hr-novo-tipo-contrato")).toHaveAttribute("aria-invalid", "true");
    expect(campo("hr-novo-data-inicio")).toHaveAttribute("aria-invalid", "true");
    expect(insercoes("pessoas")).toHaveLength(0);
  });

  it("sem cargo, os duodécimos ficam desactivados e a frase diz quando se definem", () => {
    abrirNovaPessoa();
    irParaAba(/Retribuição e bancário/);
    const duodecimos = document.getElementById("hr-novo-duodecimos") as HTMLElement;
    expect(duodecimos).toBeDisabled();
    expect(screen.getByText(/Define-se quando atribuir o cargo/)).toBeInTheDocument();
  });

  it("ao desactivar os duodécimos (tirar o cargo) o select mostra-se vazio, sem parecer «50 %» activo", async () => {
    abrirNovaPessoa();
    irParaAba(/Contrato e local/);
    await escolher(/^Cargo/, /Vendedor/);
    await escolher(/^Tipo de contrato/, /Sem termo/);
    escrever("hr-novo-data-inicio", "2026-10-01");
    irParaAba(/Retribuição e bancário/);
    await escolher(/^Subsidios em duodecimos/, /^50 %/);
    expect(document.getElementById("hr-novo-duodecimos")).toHaveTextContent("50 %");
    irParaAba(/Contrato e local/);
    await escolher(/^Cargo/, /Ainda sem cargo/);
    irParaAba(/Retribuição e bancário/);
    const duodecimos = document.getElementById("hr-novo-duodecimos") as HTMLElement;
    expect(duodecimos).toBeDisabled();
    expect(duodecimos).not.toHaveTextContent("50");
  });

  it("junto às categorias do contrato (no bloco do cargo) repete-se que o contrato é opcional e o que passa a obrigatório", () => {
    abrirNovaPessoa();
    irParaAba(/Contrato e local/);
    expect(screen.getAllByText(/campos do contrato: o contrato é opcional/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/tipo de contrato e a data de início passam a obrigatórios/).length).toBeGreaterThanOrEqual(1);
  });

  it("com cargo e contrato, os duodécimos activam-se e passam a obrigatórios", async () => {
    abrirNovaPessoa();
    irParaAba(/Contrato e local/);
    await escolher(/^Cargo/, /Vendedor/);
    await escolher(/^Tipo de contrato/, /Sem termo/);
    escrever("hr-novo-data-inicio", "2026-10-01");
    irParaAba(/Retribuição e bancário/);
    const duodecimos = document.getElementById("hr-novo-duodecimos") as HTMLElement;
    expect(duodecimos).not.toBeDisabled();
    expect(duodecimos).toHaveAttribute("aria-required", "true");
  });

  it("com cargo e contrato completos, cria o contrato e a retribuição; o cargo segue", async () => {
    const nova = abrirNovaPessoa();
    preencherMinimo();
    await preencherCargoEContrato();
    rhTeste.respostas["pessoas"] = [{
      id: "pessoa-com-contrato", organization_id: "org-teste", primeiro_nome: "Teresa", apelido: "Nogueira", nome_completo: "Teresa Nogueira",
      email_pessoal: "teresa@exemplo.pt", cargo: "Vendedor", cargo_id: "cargo-vendedor", estado_registo: "activo",
    }];
    rhTeste.respostas["pessoas_vinculos"] = [{ id: "vinculo-1" }];
    fireEvent.click(within(nova).getByRole("button", { name: "Criar e enviar convite" }));
    expect(await screen.findByText("convite:pessoa-com-contrato:teresa@exemplo.pt")).toBeInTheDocument();
    expect(insercoes("pessoas")[0].payload).toMatchObject({ cargo_id: "cargo-vendedor", data_admissao: "2026-10-01" });
    expect(insercoes("pessoas_vinculos")).toHaveLength(1);
    expect(rpcsChamadas()).toContain("rpc_hr_retribuicao_definir_pessoal");
  });
});
