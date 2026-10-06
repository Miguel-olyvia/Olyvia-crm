/**
 * `PessoaAnexosCard`: os anexos da admissao na ficha. O hook de dados e
 * simulado; aqui verifica-se o que se mostra, a quem se oferece "Abrir" e o
 * que acontece ao abrir (URL novo de cada vez, separador novo sem opener).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PessoaAnexo } from "@/types/hr";

vi.mock("@/hooks/useTranslation", async () => {
  const { translations } = await import("@/translations/index");
  const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (chave: string, params?: Record<string, string | number>) => {
        let texto = pt[chave] ?? chave;
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        });
        return texto;
      },
    }),
  };
});

const obterUrl = vi.fn();
let estadoHook: { anexos: PessoaAnexo[]; loading: boolean; recusado: boolean };
const argumentosHook: unknown[][] = [];
vi.mock("@/hooks/usePessoaAnexos", () => ({
  usePessoaAnexos: (...args: unknown[]) => {
    argumentosHook.push(args);
    return { ...estadoHook, obterUrl };
  },
}));

import { PessoaAnexosCard } from "../PessoaAnexosCard";

function anexo(id: string, tipo: PessoaAnexo["tipo"], nome: string, tamanho = 2 * 1024 * 1024): PessoaAnexo {
  return {
    id,
    organization_id: "org",
    pessoa_id: "p1",
    tipo,
    estado: "promovido",
    nome_original: nome,
    mime_type: "application/pdf",
    tamanho_bytes: tamanho,
    promovido_em: "2026-10-05T10:00:00Z",
    criado_em: "2026-10-04T10:00:00Z",
  };
}

const TRES = [
  anexo("c1", "cartao_cidadao", "cartao.pdf"),
  anexo("i1", "comprovativo_iban", "iban.pdf"),
  anexo("f1", "fotografia", "eu.png", 500 * 1024),
];

const SEM_PERMISSOES = { pessoasView: false, viewOwn: false, identificacaoReveal: false, bancariosEdit: false };
const TODAS = { pessoasView: true, viewOwn: true, identificacaoReveal: true, bancariosEdit: true };

function montar(
  permissoes = TODAS,
  souAPessoa = false,
) {
  return render(
    <PessoaAnexosCard pessoaId="p1" organizationId="org" souAPessoa={souAPessoa} permissoes={{ ...permissoes, viewOwn: souAPessoa }} />,
  );
}

function janelaFalsa() {
  return { opener: "original", location: { href: "" }, close: vi.fn() };
}

describe("PessoaAnexosCard", () => {
  const abrirOriginal = window.open;

  beforeEach(() => {
    obterUrl.mockReset();
    argumentosHook.length = 0;
    estadoHook = { anexos: TRES, loading: false, recusado: false };
  });

  afterEach(() => {
    window.open = abrirOriginal;
  });

  it("pede ao hook os anexos da pessoa e da organizacao da ficha", () => {
    montar();
    expect(argumentosHook[0]).toEqual(["p1", "org"]);
  });

  it("lista tipo, nome, tamanho e data de recepcao de cada anexo", () => {
    montar();
    expect(screen.getByText("Anexos da admissão")).toBeInTheDocument();
    const item = screen.getByText("cartao.pdf").closest("li") as HTMLElement;
    expect(within(item).getByText("Cartão de cidadão")).toBeInTheDocument();
    expect(within(item).getByText("2 MB")).toBeInTheDocument();
    expect(within(item).getByText(/^Recebido em \d/)).toBeInTheDocument();
    const foto = screen.getByText("eu.png").closest("li") as HTMLElement;
    expect(within(foto).getByText("Fotografia")).toBeInTheDocument();
    expect(within(foto).getByText("500 KB")).toBeInTheDocument();
  });

  it("nunca mostra caminho nem hash (o hook so traz as colunas concedidas)", () => {
    montar();
    expect(document.body.textContent).not.toMatch(/admissao\/|sha256/i);
  });

  it("sem nenhuma permissao e sem ser a propria pessoa: nao ha botao Abrir, diz que nao tem permissao", () => {
    montar(SEM_PERMISSOES);
    expect(screen.queryByRole("button", { name: /Abrir/ })).toBeNull();
    expect(screen.getAllByText("Não tem permissão para abrir este ficheiro.")).toHaveLength(3);
  });

  it("defesa em profundidade: uma linha de um tipo sem permissao nunca mostra o nome do ficheiro", () => {
    // O nome e texto livre da pessoa ("CC 12345678.pdf"): a base ja nao o entrega
    // a quem nao tem a permissao do tipo, e o ecra tambem nao o mostra.
    montar(SEM_PERMISSOES);
    expect(screen.queryByText("cartao.pdf")).toBeNull();
    expect(screen.queryByText("iban.pdf")).toBeNull();
    expect(screen.queryByText("eu.png")).toBeNull();
    expect(screen.getByText("Cartão de cidadão")).toBeInTheDocument();
  });

  it("Abrir so no tipo para o qual ha permissao", () => {
    montar({ pessoasView: true, viewOwn: true, identificacaoReveal: false, bancariosEdit: true });
    const cartao = screen.getByText("Cartão de cidadão").closest("li") as HTMLElement;
    const iban = screen.getByText("iban.pdf").closest("li") as HTMLElement;
    const foto = screen.getByText("eu.png").closest("li") as HTMLElement;
    expect(within(cartao).queryByRole("button")).toBeNull();
    expect(within(cartao).queryByText("cartao.pdf")).toBeNull();
    expect(within(cartao).getByText("Não tem permissão para abrir este ficheiro.")).toBeInTheDocument();
    expect(within(iban).getByRole("button", { name: /Abrir/ })).toBeInTheDocument();
    expect(within(foto).getByRole("button", { name: /Abrir/ })).toBeInTheDocument();
  });

  it("a propria pessoa pode abrir os tres", () => {
    montar(SEM_PERMISSOES, true);
    expect(screen.getAllByRole("button", { name: /Abrir/ })).toHaveLength(3);
  });

  it("o botao Abrir diz de que ficheiro se trata", () => {
    montar(SEM_PERMISSOES, true);
    expect(screen.getByRole("button", { name: "Abrir: cartao.pdf" })).toBeInTheDocument();
  });

  it("lista vazia, para quem pode ver todos os tipos, mostra o texto proprio", () => {
    estadoHook = { anexos: [], loading: false, recusado: false };
    montar(TODAS);
    expect(screen.getByText("Não foram recebidos anexos na admissão.")).toBeInTheDocument();
    expect(screen.queryByText("Não há anexos visíveis para o seu perfil.")).toBeNull();
  });

  it("lista vazia, para quem NAO pode ver todos os tipos, nao afirma que nao ha anexos", () => {
    // A base esconde os tipos sem permissao: vazio aqui nao quer dizer "nao ha".
    estadoHook = { anexos: [], loading: false, recusado: false };
    montar({ pessoasView: true, viewOwn: true, identificacaoReveal: false, bancariosEdit: true });
    expect(screen.queryByText("Não foram recebidos anexos na admissão.")).toBeNull();
    expect(screen.getByText("Não há anexos visíveis para o seu perfil.")).toBeInTheDocument();
  });

  it("a propria pessoa ve todos os tipos: lista vazia diz que nao foram recebidos anexos", () => {
    estadoHook = { anexos: [], loading: false, recusado: false };
    montar(SEM_PERMISSOES, true);
    expect(screen.getByText("Não foram recebidos anexos na admissão.")).toBeInTheDocument();
  });

  it("quem nao ve todos os tipos recebe a nota de que alguns anexos nao aparecem", () => {
    montar({ pessoasView: true, viewOwn: true, identificacaoReveal: false, bancariosEdit: true });
    expect(
      screen.getByText("Os anexos de tipos que o seu perfil não pode ver não aparecem nesta lista."),
    ).toBeInTheDocument();
  });

  it("quem ve todos os tipos nao recebe a nota", () => {
    montar(TODAS);
    expect(screen.queryByText(/não aparecem nesta lista/)).toBeNull();
  });

  it("sem permissao de ler a lista (recusado) nao mostra o cartao", () => {
    estadoHook = { anexos: [], loading: false, recusado: true };
    const { container } = montar();
    expect(container).toBeEmptyDOMElement();
  });

  it("a carregar mostra um estado de carga, nao a lista vazia", () => {
    estadoHook = { anexos: [], loading: true, recusado: false };
    montar();
    expect(screen.queryByText("Não foram recebidos anexos na admissão.")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("Abrir pede um URL novo e abre-o num separador novo, sem opener", async () => {
    const janela = janelaFalsa();
    window.open = vi.fn(() => janela) as unknown as typeof window.open;
    obterUrl.mockResolvedValue({ url: "https://x/assinado?token=1", expiraEmSegundos: 60 });
    montar(SEM_PERMISSOES, true);

    fireEvent.click(screen.getByRole("button", { name: "Abrir: cartao.pdf" }));

    await waitFor(() => expect(janela.location.href).toBe("https://x/assinado?token=1"));
    expect(obterUrl).toHaveBeenCalledWith("c1");
    expect(window.open).toHaveBeenCalledTimes(1);
    expect((window.open as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("_blank");
    // Sem opener: o separador aberto nao controla a ficha.
    expect(janela.opener).toBeNull();
  });

  it("cada abertura pede um URL novo", async () => {
    window.open = vi.fn(() => janelaFalsa()) as unknown as typeof window.open;
    obterUrl
      .mockResolvedValueOnce({ url: "https://x/1", expiraEmSegundos: 60 })
      .mockResolvedValueOnce({ url: "https://x/2", expiraEmSegundos: 60 });
    montar(SEM_PERMISSOES, true);
    const botao = screen.getByRole("button", { name: "Abrir: cartao.pdf" });

    fireEvent.click(botao);
    await waitFor(() => expect(obterUrl).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    await waitFor(() => expect(obterUrl).toHaveBeenCalledTimes(2));
  });

  it("se o pedido falha, fecha o separador em branco e diz que nao foi possivel abrir", async () => {
    const janela = janelaFalsa();
    window.open = vi.fn(() => janela) as unknown as typeof window.open;
    obterUrl.mockRejectedValue(new Error("falhou"));
    montar(SEM_PERMISSOES, true);

    fireEvent.click(screen.getByRole("button", { name: "Abrir: cartao.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível abrir o ficheiro. Tente de novo.",
    );
    expect(janela.close).toHaveBeenCalled();
    expect(janela.location.href).toBe("");
  });

  it("enquanto abre, o botao fica desactivado (sem pedidos duplicados)", async () => {
    window.open = vi.fn(() => janelaFalsa()) as unknown as typeof window.open;
    let resolver!: (v: unknown) => void;
    obterUrl.mockReturnValue(new Promise((r) => (resolver = r)));
    montar(SEM_PERMISSOES, true);
    const botao = screen.getByRole("button", { name: "Abrir: cartao.pdf" });
    fireEvent.click(botao);
    await waitFor(() => expect(botao).toBeDisabled());
    fireEvent.click(botao);
    expect(obterUrl).toHaveBeenCalledTimes(1);
    resolver({ url: "https://x/1", expiraEmSegundos: 60 });
    await waitFor(() => expect(botao).toBeEnabled());
  });
});
