// Lote A: a Lista real passa a usar a linha do protótipo, com os campos que a função já devolve.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { pessoaLista } from "./fabricaLista";
import { LinhaListaReal } from "./LinhaListaReal";
import { COLUNAS_POR_OMISSAO } from "./colunasPessoas";
import type { ContactoDaLista, PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

interface Opcoes {
  colunas?: readonly IdColuna[];
  aoAbrir?: (id: string, origem?: HTMLElement) => void;
  comercial?: string;
  contacto?: ContactoDaLista;
}
function desenhar(sobre: Partial<PessoaDaLista> = {}, { colunas, aoAbrir, comercial, contacto }: Opcoes = {}) {
  render(
    <MemoryRouter>
      <table><tbody>
        <LinhaListaReal
          pessoa={pessoaLista("p1", { nome: "Ana Lopes", ...sobre })} colunas={colunas} aoAbrir={aoAbrir} comercial={comercial} contacto={contacto}
        />
      </tbody></table>
    </MemoryRouter>,
  );
  return screen.getByRole("row");
}
const celulas = (linha: HTMLElement): HTMLElement[] => Array.from(linha.children) as HTMLElement[];

describe("LinhaListaReal: as colunas por omissão", () => {
  it("sem escolha desenha as colunas por omissão, e o nome é o cabeçalho da linha", () => {
    const linha = desenhar();
    expect(celulas(linha)).toHaveLength(COLUNAS_POR_OMISSAO.length);
    expect(within(linha).getByRole("rowheader")).toHaveAttribute("scope", "row");
  });
  it("nunca escreve «exemplo»", () => {
    desenhar({ papel: "cliente", etapa: "cliente", encerrada: "semInteresse" });
    expect(screen.queryByText(/exemplo/i)).toBeNull();
  });
});

describe("LinhaListaReal: papel, etapa e selos", () => {
  it("uma lead leva «Lead» por baixo do nome", () => {
    const linha = desenhar({ papel: "lead" }, { colunas: ["person"] });
    expect(within(celulas(linha)[0]).getByText("Lead")).toBeInTheDocument();
  });
  it("uma cliente leva «Cliente» como selo junto ao nome e a coluna Etapa mostra «—»", () => {
    const linha = desenhar({ papel: "cliente", etapa: "cliente" }, { colunas: ["person", "stage"] });
    expect(within(celulas(linha)[0]).getByText("Cliente")).toBeInTheDocument();
    expect(within(celulas(linha)[1]).getByText("—")).toBeInTheDocument();
    expect(within(celulas(linha)[1]).queryByText("Cliente")).toBeNull();
  });
  it("a etapa é a atual do protótipo", () => {
    desenhar({ etapa: "emContacto" }, { colunas: ["person", "stage"] });
    expect(screen.getByText("Contactada")).toBeInTheDocument();
  });
});

describe("LinhaListaReal: Próximo passo", () => {
  it.each([
    ["marcarVisita", "Marcar a visita"],
    ["registarChamada", "Registar a chamada"],
    ["fecharLevantamento", "Marcar a visita como feita"],
    ["criarNegocio", "Criar o negócio"],
    ["ganharNegocio", "Dar o negócio como ganho"],
  ] as const)("o passo %s diz «%s»", (passo, texto) => {
    desenhar({ passo }, { colunas: ["person", "next"] });
    expect(screen.getByText(texto)).toBeInTheDocument();
  });
  it("passo que a lista não sabe: travessão e «Ver na ficha» só para leitores de ecrã", () => {
    const linha = desenhar({ passo: null }, { colunas: ["person", "next"] });
    expect(within(celulas(linha)[1]).getByText("Ver na ficha")).toHaveClass("sr-only");
  });
  it("encerrada: sem próximo passo", () => {
    const linha = desenhar({ passo: "nenhum", encerrada: "semInteresse" }, { colunas: ["person", "next"] });
    expect(within(celulas(linha)[1]).getByText("Sem próximo passo")).toHaveClass("sr-only");
  });
});

describe("LinhaListaReal: último contacto sem inventar", () => {
  it("com contacto e sem resultado conhecido não há selo de resultado", () => {
    desenhar({ ultimoContactoEm: "2026-10-01T10:00:00Z", diasSemContacto: 3 }, { colunas: ["person", "lastContact"] });
    expect(screen.getByText("há 3 dias")).toBeInTheDocument();
    expect(screen.queryByText("Sem contacto")).toBeNull();
  });
  it("sem nenhum contacto aparece «Sem contacto»", () => {
    desenhar({ ultimoContactoEm: null, diasSemContacto: null }, { colunas: ["person", "lastContact"] });
    expect(screen.getAllByText("Sem contacto").length).toBeGreaterThan(0);
  });
});

describe("LinhaListaReal: clicar abre a ficha", () => {
  it("clicar na célula do valor abre a ficha com o botão do nome como origem do foco", () => {
    const aoAbrir = vi.fn();
    const linha = desenhar({ valorEmJogo: 5000 }, { colunas: ["person", "value"], aoAbrir });
    fireEvent.click(celulas(linha)[1]);
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("p1", screen.getByRole("button", { name: "Ana Lopes" }));
  });
  it("clicar no botão do nome abre uma só vez", () => {
    const aoAbrir = vi.fn();
    desenhar({}, { colunas: ["person"], aoAbrir });
    fireEvent.click(screen.getByRole("button", { name: "Ana Lopes" }));
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });
  it("o botão do nome tem 44 px de altura", () => {
    desenhar({}, { colunas: ["person"], aoAbrir: vi.fn() });
    expect(screen.getByRole("button", { name: "Ana Lopes" }).className).toContain("min-h-11");
  });
});

describe("LinhaListaReal: comercial, telefone, email e WhatsApp", () => {
  it("mostra o nome do comercial resolvido", () => {
    desenhar({ responsavelId: "u1" }, { colunas: ["person", "assigned"], comercial: "Rui Dias" });
    expect(screen.getByText("Rui Dias")).toBeInTheDocument();
  });
  it("sem responsável: «Sem comercial»", () => {
    desenhar({ responsavelId: null }, { colunas: ["person", "assigned"] });
    expect(screen.getByText("Sem comercial")).toBeInTheDocument();
  });
  it("com responsável e o nome ainda por resolver: «Sem dado», nunca «Sem comercial»", () => {
    desenhar({ responsavelId: "u1" }, { colunas: ["person", "assigned"] });
    expect(screen.queryByText("Sem comercial")).toBeNull();
    expect(screen.getByText("Sem dado")).toBeInTheDocument();
  });
  it("telefone, email e WhatsApp vêm da leitura em lote", () => {
    desenhar({}, { colunas: ["person", "phone", "email", "whatsapp"], contacto: { telefone: "912345678", email: "ana@exemplo.pt" } });
    expect(screen.getByText("912345678")).toBeInTheDocument();
    expect(screen.getByText("ana@exemplo.pt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp.*Ana Lopes/ })).toHaveAttribute("href", "https://wa.me/351912345678");
  });
  it("sem leitura ainda: «Sem dado» nos três", () => {
    desenhar({}, { colunas: ["person", "phone", "email", "whatsapp"] });
    expect(screen.getAllByText("Sem dado")).toHaveLength(3);
  });
});

describe("LinhaListaReal: textos longos que não se podem perder", () => {
  const EMAIL_LONGO = "maria.fernanda.albuquerque.de.sousa.e.castro@empresa-de-remodelacoes-e-obras.exemplo.pt";

  it("um email comprido quebra por inteiro (sem line-clamp que o corte sem forma de ler) e leva o valor completo em title", () => {
    desenhar({}, { colunas: ["person", "email"], contacto: { telefone: null, email: EMAIL_LONGO } });
    const email = screen.getByText(EMAIL_LONGO);
    expect(email.className).toContain("break-all");
    expect(email.className).not.toContain("line-clamp");
    expect(email).toHaveAttribute("title", EMAIL_LONGO);
  });
  it("o comercial comprido continua cortado em duas linhas, mas com o nome completo em title", () => {
    const nome = "Maria Fernanda Albuquerque de Sousa e Castro Pinto Coelho";
    desenhar({ responsavelId: "u1" }, { colunas: ["person", "assigned"], comercial: nome });
    expect(screen.getByText(nome)).toHaveAttribute("title", nome);
  });
});

describe("LinhaListaReal: formulário, criado em, origem e campanha", () => {
  it("pessoa sem lead: nada se sabe do formulário, origem e campanha («Sem dado», nunca «Registada à mão»)", () => {
    const linha = desenhar({}, { colunas: ["person", "form", "created", "origin", "campaign"] });
    expect(celulas(linha)).toHaveLength(5);
    expect(screen.queryByText("Registada à mão")).toBeNull();
    expect(screen.getAllByText("Sem dado")).toHaveLength(3);
    expect(screen.getByText("Sem data")).toBeInTheDocument();
  });

  it("lead sem campanha: «Registada à mão» no formulário; a data aparece no dia de Lisboa", () => {
    desenhar(
      { leadId: "l1", campanhaId: null, origem: "web", criadoEm: "2026-06-01T10:00:00Z" },
      { colunas: ["person", "form", "created", "origin"] },
    );
    expect(screen.getByText("Registada à mão")).toBeInTheDocument();
    expect(screen.getByText("01/06/2026")).toBeInTheDocument();
    expect(screen.getByText("Web")).toBeInTheDocument();
  });

  it("origem desconhecida aparece tal como a base a deu", () => {
    desenhar({ leadId: "l1", origem: "whatsapp_bot" }, { colunas: ["person", "origin"] });
    expect(screen.getByText("whatsapp_bot")).toBeInTheDocument();
  });

  it("lead com campanha e formulário: os nomes", () => {
    desenhar(
      { leadId: "l1", campanhaId: "c1", campanha: "Cozinhas", formulario: "Pedido de orçamento" },
      { colunas: ["person", "form", "campaign"] },
    );
    expect(screen.getByText("Pedido de orçamento")).toBeInTheDocument();
    expect(screen.getByText("Cozinhas")).toBeInTheDocument();
  });
});

describe("LinhaListaReal: sublinha e selos dos campos novos", () => {
  it("MQL/SQL, «Atrasada» e «Voltou a contactar» aparecem por baixo do nome", () => {
    desenhar({ qualificacao: "SQL", atrasada: true, voltou: true });
    expect(screen.getByText(/SQL/)).toBeInTheDocument();
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
    expect(screen.getByText("Voltou a contactar")).toBeInTheDocument();
  });

  it("sem os sinais (false ou sem dado) não se escreve nada", () => {
    desenhar({ qualificacao: null, atrasada: false, voltou: null });
    expect(screen.queryByText("Atrasada")).toBeNull();
    expect(screen.queryByText("Voltou a contactar")).toBeNull();
  });

  it("o selo do resultado do último contacto, e «Outro» para um resultado das Leads", () => {
    desenhar({ ultimoContactoEm: "2026-10-01T10:00:00Z", diasSemContacto: 3, ultimoResultado: "naoAtendeu" });
    expect(screen.getByText("Não atendeu")).toBeInTheDocument();
  });

  it("«Outro» quando o resultado vem das Leads", () => {
    desenhar({ ultimoContactoEm: "2026-10-01T10:00:00Z", diasSemContacto: 3, ultimoResultado: "outro" });
    expect(screen.getByText("Outro")).toBeInTheDocument();
  });
});
