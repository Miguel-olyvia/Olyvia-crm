// O separador Submissões da ficha real: só leitura (como o «Formulários» de Leads), com carregar, erro, vazio e um cartão por submissão.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SubmissaoFicha } from "@/hooks/pessoas/adaptarSubmissoes";
import { SubmissoesFichaReal } from "./SubmissoesFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

const HOJE = "2026-10-20";
const cartao = (sobre: Partial<SubmissaoFicha> = {}): SubmissaoFicha => ({
  chave: "submissao:s1", tipo: "submissao", id: "s1", criadoEm: "2026-10-20T09:00:00Z", campanha: "Remodelações", origem: null, etapa: null, revisao: "pending",
  conflito: null, emailNaoGravado: null, telefoneNaoGravado: null, coincidencia: null, campos: [{ chave: "email", rotulo: "O seu email", valor: "ana@exemplo.pt" }], ...sobre,
});
type Props = Parameters<typeof SubmissoesFichaReal>[0];
function desenhar(sobre: Partial<Props> = {}) {
  const aoTentarDeNovo = vi.fn();
  render(<SubmissoesFichaReal submissoes={[cartao()]} estado="ok" hoje={HOJE} aoTentarDeNovo={aoTentarDeNovo} {...sobre} />);
  return { aoTentarDeNovo };
}

describe("SubmissoesFichaReal: estados", () => {
  it("a carregar: diz-o numa região de estado", () => {
    desenhar({ estado: "a-carregar", submissoes: [] });
    expect(screen.getByRole("status")).toHaveTextContent("A carregar as submissões…");
  });

  it("erro: um alerta e «Tentar de novo», que repete a leitura", () => {
    const { aoTentarDeNovo } = desenhar({ estado: "erro", submissoes: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar as submissões.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it("sem submissões diz que não há nenhuma", () => {
    desenhar({ submissoes: [] });
    expect(screen.getByText("Sem submissões de formulário associadas a esta pessoa.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("SubmissoesFichaReal: os cartões", () => {
  it("uma submissão por rever: campanha, selos em texto, data e os campos preenchidos", () => {
    desenhar();
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Remodelações")).toBeInTheDocument();
    expect(within(item).getByText("Submissão")).toBeInTheDocument();
    expect(within(item).getByText("Por rever")).toBeInTheDocument();
    expect(within(item).getByText(/hoje às 10:00/)).toBeInTheDocument();
    expect(within(item).getByText("O seu email:")).toBeInTheDocument();
    expect(within(item).getByText("ana@exemplo.pt")).toBeInTheDocument();
  });

  it("é só leitura: nenhum botão de resolver nem de registar", () => {
    desenhar({ submissoes: [cartao(), cartao({ chave: "lead:l1", tipo: "lead", id: "l1", revisao: null, etapa: "qualificado" })] });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uma lead mostra a fase do funil e a origem, sem selo de submissão nem de revisão", () => {
    desenhar({ submissoes: [cartao({ chave: "lead:l1", tipo: "lead", id: "l1", revisao: null, etapa: "qualificado", origem: "web" })] });
    expect(screen.getByText("Qualificado")).toBeInTheDocument();
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.queryByText("Submissão")).toBeNull();
    expect(screen.queryByText("Por rever")).toBeNull();
  });

  it("uma fase que não se conhece mostra-se tal como veio", () => {
    desenhar({ submissoes: [cartao({ chave: "lead:l1", tipo: "lead", id: "l1", revisao: null, etapa: "estado_novo" })] });
    expect(screen.getByText("estado_novo")).toBeInTheDocument();
  });

  it.each([["merged", "Associada ao registo"], ["new_lead", "Virou lead nova"], ["resolved", "Revista"]] as const)("o estado %s lê-se «%s»", (revisao, texto) => {
    desenhar({ submissoes: [cartao({ revisao })] });
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("sem campanha diz «Sem campanha»", () => {
    desenhar({ submissoes: [cartao({ campanha: null })] });
    expect(screen.getByText("Sem campanha")).toBeInTheDocument();
  });

  it("sem campos preenchidos di-lo", () => {
    desenhar({ submissoes: [cartao({ campos: [] })] });
    expect(screen.getByText("Sem campos preenchidos")).toBeInTheDocument();
  });

  it("sem data não rebenta nem inventa uma", () => {
    desenhar({ submissoes: [cartao({ criadoEm: null })] });
    expect(screen.queryByText(/às/)).toBeNull();
  });

  it("um valor com marcas HTML aparece como texto, não como marcação", () => {
    desenhar({ submissoes: [cartao({ campos: [{ chave: "a", rotulo: "Nota", valor: "<img src=x onerror=alert(1)>" }] })] });
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("SubmissoesFichaReal: porque não criou lead nova", () => {
  it("email e telefone iguais a um cliente", () => {
    desenhar({ submissoes: [cartao({ coincidencia: { por: "ambos", registo: "cliente", email: "a@b.pt", telefone: "912" } })] });
    expect(screen.getByText("Não entrou como lead nova: já existe um cliente em que o email (a@b.pt) e o telefone (912) são os mesmos.")).toBeInTheDocument();
  });

  it("só o email, de uma lead, sem o valor quando não se conhece", () => {
    desenhar({ submissoes: [cartao({ coincidencia: { por: "email", registo: "lead", email: null, telefone: null } })] });
    expect(screen.getByText("Não entrou como lead nova: já existe uma lead em que o email é o mesmo.")).toBeInTheDocument();
  });

  it("só o telefone", () => {
    desenhar({ submissoes: [cartao({ coincidencia: { por: "telefone", registo: "lead", email: null, telefone: "912" } })] });
    expect(screen.getByText("Não entrou como lead nova: já existe uma lead em que o telefone (912) é o mesmo.")).toBeInTheDocument();
  });

  it("um conflito mostra as duas pessoas (a sem nome com um texto) e não repete a frase de coincidência", () => {
    desenhar({ submissoes: [cartao({
      coincidencia: { por: "conflito", registo: "lead", email: null, telefone: null }, conflito: [{ id: "e1", nome: "Ana" }, { id: "e2", nome: null }],
    })] });
    expect(screen.getByText("Conflito: o email e o telefone apontam para pessoas diferentes")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Entidade sem nome")).toBeInTheDocument();
    expect(screen.queryByText(/Não entrou como lead nova/)).toBeNull();
  });

  it("o email e o telefone novos, que nunca foram gravados, ficam assinalados", () => {
    desenhar({ submissoes: [cartao({ emailNaoGravado: "novo@x.pt", telefoneNaoGravado: "999" })] });
    expect(screen.getByText("Email novo, não gravado na ficha")).toBeInTheDocument();
    expect(screen.getByText("novo@x.pt")).toBeInTheDocument();
    expect(screen.getByText("Telefone novo, não gravado na ficha")).toBeInTheDocument();
    expect(screen.getByText("999")).toBeInTheDocument();
  });
});
