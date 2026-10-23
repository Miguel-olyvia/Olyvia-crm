// As condições (terms) da proposta ligada ao negócio, na ficha real: mostram-se, e quem pode editar edita-as (prazo, início, pagamento, garantia;
// nunca a validade nem as notas). Uma proposta aceite já não se edita. No exemplo (sem ficha real) não aparece nada.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DadosNegocio, PropostaCondicoes } from "@/components/negocio-metas/costuraNegocio";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { CondicoesDaProposta } from "./CondicoesDaProposta";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); sucesso.mockReset(); });

const HOJE = "2026-10-19";
const negocio = negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", proposta: { estado: "enviada" } });
const CONDICOES = { prazo: 20, inicio: "2026-11-02", pagamento: "metade", garantia: 2 } as const;
const proposta = (sobre: Partial<PropostaCondicoes> = {}): PropostaCondicoes => ({ id: "p1", estado: "enviada", condicoes: CONDICOES, legivel: true, ...sobre });

function abrir(p: PropostaCondicoes | null, dados: Partial<DadosNegocio> = {}, mutacoes: MutacoesNegocio | null = mutacoesFalsas({ guardarCondicoes: vi.fn(async () => undefined) })) {
  render(
    <MemoryRouter>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ proposta: () => p, ...dados })}>
        <CondicoesDaProposta negocio={negocio} hoje={HOJE} />
      </ComCostura>
    </MemoryRouter>,
  );
  return mutacoes;
}

describe("o que se vê", () => {
  it("mostra o prazo, o início, o pagamento e a garantia", () => {
    abrir(proposta());
    const s = screen.getByRole("region", { name: "Condições da proposta" });
    expect(within(s).getByText("Prazo de execução").nextElementSibling).toHaveTextContent("20 dias úteis");
    expect(within(s).getByText("Início previsto").nextElementSibling).toHaveTextContent("02/11/2026");
    expect(within(s).getByText("Pagamento").nextElementSibling).toHaveTextContent("50 % + 50 % no fim");
    expect(within(s).getByText("Garantia").nextElementSibling).toHaveTextContent("2 anos");
  });

  it("uma garantia de 1 ano diz «1 ano»", () => {
    abrir(proposta({ condicoes: { ...CONDICOES, garantia: 1 } }));
    expect(screen.getByText("Garantia").nextElementSibling).toHaveTextContent("1 ano");
  });

  it("sem condições diz-o e oferece «Definir condições»", () => {
    abrir(proposta({ condicoes: null }));
    expect(screen.getByText(/ainda não tem condições/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Definir condições" })).toBeInTheDocument();
  });

  it("condições num formato desconhecido dizem-no (e deixam editar)", () => {
    abrir(proposta({ condicoes: null, legivel: false }));
    expect(screen.getByText(/formato que esta página não mostra/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar condições" })).toBeInTheDocument();
  });

  it("uma proposta aceite mostra as condições e diz que já não se mudam, sem botão", () => {
    abrir(proposta({ estado: "aceite" }));
    expect(screen.getByText("20 dias úteis")).toBeInTheDocument();
    expect(screen.getByText("A proposta já foi aceite: as condições já não se mudam.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /condições/ })).toBeNull();
  });

  it("sem pessoas.edit mostra as condições mas não deixa editar", () => {
    abrir(proposta(), { podeEditar: false });
    expect(screen.getByText("20 dias úteis")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /condições/ })).toBeNull();
  });

  it("sem proposals.edit (mesmo com pessoas.edit) mostra as condições mas não deixa editar", () => {
    abrir(proposta(), { podeNoDocumento: (tipo, acao) => !(tipo === "proposta" && acao === "edit") });
    expect(screen.getByText("20 dias úteis")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /condições/ })).toBeNull();
  });

  it("com proposals.edit e pessoas.edit deixa editar", () => {
    abrir(proposta(), { podeNoDocumento: (tipo, acao) => tipo === "proposta" && acao === "edit" });
    expect(screen.getByRole("button", { name: "Editar condições" })).toBeInTheDocument();
  });

  it("sem a mutação de guardar condições não deixa editar", () => {
    abrir(proposta(), {}, mutacoesFalsas());
    expect(screen.queryByRole("button", { name: /condições/ })).toBeNull();
  });

  it("sem proposta, ou no exemplo (sem ficha real), não desenha nada", () => {
    abrir(null);
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    render(<MemoryRouter><ComCostura mutacoes={null} dados={null}><CondicoesDaProposta negocio={negocio} hoje={HOJE} /></ComCostura></MemoryRouter>);
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("editar as condições", () => {
  const dialogo = () => screen.getByRole("dialog", { name: "Condições da proposta" });
  const prazo = () => within(dialogo()).getByRole("textbox", { name: /^Prazo de execução/ });
  const inicio = () => within(dialogo()).getByLabelText(/^Início previsto/);
  const guardar = () => within(dialogo()).getByRole("button", { name: "Guardar condições" });
  const abrirDialogo = () => {
    const botao = screen.getByRole("button", { name: "Editar condições" });
    botao.focus();
    fireEvent.click(botao);
  };

  it("abre com os valores atuais e diz que a validade e as notas não se mudam aqui", () => {
    abrir(proposta());
    abrirDialogo();
    expect(prazo()).toHaveValue("20");
    expect(inicio()).toHaveValue("2026-11-02");
    expect(within(dialogo()).getByRole("radio", { name: "50 % + 50 % no fim" })).toBeChecked();
    expect(within(dialogo()).getByRole("radio", { name: "2 anos" })).toBeChecked();
    expect(within(dialogo()).getByText(/A validade e as notas da proposta não se mudam aqui/)).toBeInTheDocument();
    expect(within(dialogo()).queryByText(/^Validade/)).toBeNull();
    expect(within(dialogo()).queryByLabelText(/^Notas/)).toBeNull();
  });

  it("sem condições abre com o prazo e o início por preencher e as escolhas habituais", () => {
    abrir(proposta({ condicoes: null }));
    fireEvent.click(screen.getByRole("button", { name: "Definir condições" }));
    expect(prazo()).toHaveValue("");
    expect(inicio()).toHaveValue("");
    expect(within(dialogo()).getByRole("radio", { name: "50 % + 50 % no fim" })).toBeChecked();
  });

  it("avisa que o cliente só vê a mudança quando a proposta for republicada no portal", () => {
    abrir(proposta());
    abrirDialogo();
    expect(within(dialogo()).getByText("O cliente só vê esta mudança quando a proposta for republicada no portal.")).toBeInTheDocument();
  });

  it("condições ilegíveis avisam que as novas as substituem", () => {
    abrir(proposta({ condicoes: null, legivel: false }));
    abrirDialogo();
    expect(within(dialogo()).getByText(/as novas substituem-nas/)).toBeInTheDocument();
  });

  it("guarda só prazo, início, pagamento e garantia (sem validade nem notas), fecha e anuncia", async () => {
    const mutacoes = abrir(proposta());
    abrirDialogo();
    fireEvent.change(prazo(), { target: { value: "30" } });
    fireEvent.click(within(dialogo()).getByRole("radio", { name: "Por fases" }));
    fireEvent.click(within(dialogo()).getByRole("radio", { name: "5 anos" }));
    fireEvent.click(guardar());
    expect(mutacoes?.guardarCondicoes).toHaveBeenCalledWith("n1", "p1", { prazo: 30, inicio: "2026-11-02", pagamento: "fases", garantia: 5 });
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: condições da proposta guardadas."));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["", "0", "61", "1.5", "abc"])("um prazo inválido (%j) mostra o erro, leva o foco ao prazo e não grava", (valor) => {
    const mutacoes = abrir(proposta());
    abrirDialogo();
    fireEvent.change(prazo(), { target: { value: valor } });
    fireEvent.click(guardar());
    expect(within(dialogo()).getByText("O prazo tem de ser um número inteiro de dias úteis, de 1 a 60.")).toBeInTheDocument();
    expect(prazo()).toHaveFocus();
    expect(prazo()).toHaveAttribute("aria-invalid", "true");
    expect(mutacoes?.guardarCondicoes).not.toHaveBeenCalled();
  });

  it("um início que já lá estava, mesmo no passado, não bloqueia guardar outra coisa", () => {
    const mutacoes = abrir(proposta({ condicoes: { ...CONDICOES, inicio: "2026-09-01" } }));
    abrirDialogo();
    // O início guardado está no passado e não foi mexido: passa.
    fireEvent.click(guardar());
    expect(mutacoes?.guardarCondicoes).toHaveBeenCalledTimes(1);
  });

  it("um início novo no passado é recusado", () => {
    const mutacoes = abrir(proposta());
    abrirDialogo();
    fireEvent.change(inicio(), { target: { value: "2026-10-01" } });
    fireEvent.click(guardar());
    expect(within(dialogo()).getByText("O início previsto não pode ser anterior a hoje.")).toBeInTheDocument();
    expect(inicio()).toHaveFocus();
    expect(mutacoes?.guardarCondicoes).not.toHaveBeenCalled();
  });

  it("um início por escolher é recusado", () => {
    const mutacoes = abrir(proposta({ condicoes: null }));
    fireEvent.click(screen.getByRole("button", { name: "Definir condições" }));
    fireEvent.change(prazo(), { target: { value: "10" } });
    fireEvent.click(guardar());
    expect(within(dialogo()).getByText("Escolha o início previsto.")).toBeInTheDocument();
    expect(mutacoes?.guardarCondicoes).not.toHaveBeenCalled();
  });

  it("estado ocupado: aria-busy, duplo clique faz uma só chamada, e o erro da base vem traduzido dentro do diálogo", async () => {
    const acao = pendente();
    const guardarCondicoes = vi.fn(() => acao.promessa);
    abrir(proposta(), {}, mutacoesFalsas({ guardarCondicoes }));
    abrirDialogo();
    fireEvent.click(guardar());
    fireEvent.click(guardar());
    expect(guardarCondicoes).toHaveBeenCalledTimes(1);
    expect(guardar()).toHaveAttribute("aria-busy", "true");
    await acao.falhar(erroNegFalso("pessoasPagina.neg.write.error.permission", "42501"));
    expect(await within(dialogo()).findByRole("alert")).toHaveTextContent("Não tem permissão para fazer esta alteração.");
    expect(guardar()).not.toHaveAttribute("aria-busy");
  });

  it("Cancelar fecha sem gravar e devolve o foco ao botão que abriu", async () => {
    const mutacoes = abrir(proposta());
    abrirDialogo();
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    expect(mutacoes?.guardarCondicoes).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar condições" })).toHaveFocus());
  });
});
