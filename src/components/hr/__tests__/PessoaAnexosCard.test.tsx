/**
 * `PessoaAnexosCard`: os anexos na ficha. O hook de dados e simulado; aqui
 * verifica-se o que se mostra, a quem se oferece Ver/Abrir e o que acontece ao
 * abrir (o cartao e o comprovativo vem para uma janela por cima da ficha, com
 * registo; a fotografia abre num separador novo sem opener), e a ESCRITA por
 * tipo (anexar, substituir, remover) com as permissoes de escrita.
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

vi.mock("@/hooks/usePessoaFotografia", () => ({
  usePessoaFotografia: (id: string | null | undefined) => (id ? "https://x/miniatura.png" : null),
}));

// A janela de visualizacao tem os seus proprios testes: aqui so se prova que o
// cartao a abre com o anexo certo e que NAO abre um separador.
vi.mock("@/components/hr/anexos/VisualizadorAnexoSensivel", () => ({
  VisualizadorAnexoSensivel: ({
    anexoId,
    aoFechar,
  }: {
    anexoId: string | null;
    aoFechar: () => void;
  }) =>
    anexoId ? (
      <div role="dialog" aria-label="visualizador">
        a ver {anexoId}
        <button type="button" onClick={aoFechar}>
          fechar-visualizador
        </button>
      </div>
    ) : null,
}));

const obterUrl = vi.fn();
const anexar = vi.fn();
const substituir = vi.fn();
const remover = vi.fn();
const descartarEnvio = vi.fn();
const limparErroRemocao = vi.fn();

type EstadoHook = {
  anexos: PessoaAnexo[];
  loading: boolean;
  recusado: boolean;
  envios: Record<string, unknown>;
  aRemover: ReadonlySet<string>;
  errosRemocao: Record<string, string>;
  erroLimite: { tipo: string; codigo: string } | null;
};
let estadoHook: EstadoHook;
const argumentosHook: unknown[][] = [];
vi.mock("@/hooks/usePessoaAnexos", () => ({
  usePessoaAnexos: (...args: unknown[]) => {
    argumentosHook.push(args);
    return {
      ...estadoHook,
      obterUrl,
      recarregar: vi.fn(),
      anexar,
      substituir,
      remover,
      descartarEnvio,
      limparErroRemocao,
    };
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
const SEM_ESCRITA = { identificacaoEdit: false, bancariosEdit: false, pessoaisEdit: false };
const TODA_ESCRITA = { identificacaoEdit: true, bancariosEdit: true, pessoaisEdit: true };

function montar(
  permissoes = TODAS,
  souAPessoa = false,
  extra: { permissoesEscrita?: typeof TODA_ESCRITA; onFotografiaAlterada?: () => void } = {},
) {
  return render(
    <PessoaAnexosCard
      pessoaId="p1"
      organizationId="org"
      souAPessoa={souAPessoa}
      permissoes={{ ...permissoes, viewOwn: souAPessoa }}
      {...extra}
    />,
  );
}

function janelaFalsa() {
  return { opener: "original", location: { href: "" }, close: vi.fn() };
}

function ficheiro(nome = "novo.png", tipo = "image/png") {
  return new File(["x"], nome, { type: tipo });
}

describe("PessoaAnexosCard", () => {
  const abrirOriginal = window.open;
  const urlOriginal = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL };
  const criarUrl = vi.fn();
  const revogarUrl = vi.fn();

  beforeEach(() => {
    obterUrl.mockReset();
    anexar.mockReset().mockResolvedValue({ ok: true, codigo: null });
    substituir.mockReset().mockResolvedValue({ ok: true, codigo: null });
    remover.mockReset().mockResolvedValue({ ok: true, codigo: null });
    descartarEnvio.mockReset();
    limparErroRemocao.mockReset();
    criarUrl.mockReset().mockReturnValue("blob:preview-1");
    revogarUrl.mockReset();
    URL.createObjectURL = criarUrl as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revogarUrl as unknown as typeof URL.revokeObjectURL;
    argumentosHook.length = 0;
    estadoHook = {
      anexos: TRES,
      loading: false,
      recusado: false,
      envios: {},
      aRemover: new Set<string>(),
      errosRemocao: {},
      erroLimite: null,
    };
  });

  afterEach(() => {
    window.open = abrirOriginal;
    URL.createObjectURL = urlOriginal.criar;
    URL.revokeObjectURL = urlOriginal.revogar;
  });

  describe("leitura", () => {
    it("pede ao hook os anexos da pessoa e da organizacao da ficha", () => {
      montar();
      expect(argumentosHook[0]).toEqual(["p1", "org"]);
    });

    it("lista tipo, nome, tamanho e data de recepcao de cada anexo", () => {
      montar();
      expect(screen.getByText("Anexos")).toBeInTheDocument();
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

    it("sem nenhuma permissao e sem ser a propria pessoa: nao ha botao para abrir, diz que nao tem permissao", () => {
      montar(SEM_PERMISSOES);
      expect(screen.queryByRole("button", { name: /Abrir|Ver/ })).toBeNull();
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

    it("so se pode abrir o tipo para o qual ha permissao", () => {
      montar({ pessoasView: true, viewOwn: true, identificacaoReveal: false, bancariosEdit: true });
      const cartao = screen.getByText("Cartão de cidadão").closest("li") as HTMLElement;
      const iban = screen.getByText("iban.pdf").closest("li") as HTMLElement;
      const foto = screen.getByText("eu.png").closest("li") as HTMLElement;
      expect(within(cartao).queryByRole("button")).toBeNull();
      expect(within(cartao).queryByText("cartao.pdf")).toBeNull();
      expect(within(cartao).getByText("Não tem permissão para abrir este ficheiro.")).toBeInTheDocument();
      expect(within(iban).getByRole("button", { name: /Ver/ })).toBeInTheDocument();
      expect(within(foto).getByRole("button", { name: /Abrir/ })).toBeInTheDocument();
    });

    it("a propria pessoa pode abrir os tres: Ver nos sensiveis, Abrir na fotografia", () => {
      montar(SEM_PERMISSOES, true);
      expect(screen.getByRole("button", { name: "Ver: cartao.pdf" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ver: iban.pdf" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Abrir: eu.png" })).toBeInTheDocument();
    });

    it("lista vazia, para quem pode ver todos os tipos, mostra o texto proprio", () => {
      estadoHook = { ...estadoHook, anexos: [] };
      montar(TODAS);
      expect(screen.getByText("Ainda não há anexos.")).toBeInTheDocument();
      expect(screen.queryByText("Não há anexos visíveis para o seu perfil.")).toBeNull();
    });

    it("lista vazia, para quem NAO pode ver todos os tipos, nao afirma que nao ha anexos", () => {
      // A base esconde os tipos sem permissao: vazio aqui nao quer dizer "nao ha".
      estadoHook = { ...estadoHook, anexos: [] };
      montar({ pessoasView: true, viewOwn: true, identificacaoReveal: false, bancariosEdit: true });
      expect(screen.queryByText("Ainda não há anexos.")).toBeNull();
      expect(screen.getByText("Não há anexos visíveis para o seu perfil.")).toBeInTheDocument();
    });

    it("a propria pessoa ve todos os tipos: lista vazia diz que ainda nao ha anexos", () => {
      estadoHook = { ...estadoHook, anexos: [] };
      montar(SEM_PERMISSOES, true);
      expect(screen.getByText("Ainda não há anexos.")).toBeInTheDocument();
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
      estadoHook = { ...estadoHook, anexos: [], recusado: true };
      const { container } = montar();
      expect(container).toBeEmptyDOMElement();
    });

    it("a carregar mostra um estado de carga, nao a lista vazia", () => {
      estadoHook = { ...estadoHook, anexos: [], loading: true };
      montar();
      expect(screen.queryByText("Ainda não há anexos.")).toBeNull();
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("ver o cartao de cidadao e o comprovativo (janela por cima da ficha)", () => {
    it("Ver abre a janela com o anexo certo, SEM abrir separador nem pedir o URL aqui", () => {
      window.open = vi.fn() as unknown as typeof window.open;
      montar(SEM_PERMISSOES, true);
      fireEvent.click(screen.getByRole("button", { name: "Ver: cartao.pdf" }));
      expect(screen.getByRole("dialog", { name: "visualizador" })).toHaveTextContent("a ver c1");
      expect(window.open).not.toHaveBeenCalled();
      expect(obterUrl).not.toHaveBeenCalled();
    });

    it("o comprovativo de IBAN tambem se ve na janela", () => {
      montar(SEM_PERMISSOES, true);
      fireEvent.click(screen.getByRole("button", { name: "Ver: iban.pdf" }));
      expect(screen.getByRole("dialog", { name: "visualizador" })).toHaveTextContent("a ver i1");
    });

    it("fechar a janela deixa de ter anexo aberto", () => {
      montar(SEM_PERMISSOES, true);
      fireEvent.click(screen.getByRole("button", { name: "Ver: cartao.pdf" }));
      fireEvent.click(screen.getByRole("button", { name: "fechar-visualizador" }));
      expect(screen.queryByRole("dialog", { name: "visualizador" })).toBeNull();
    });

    it("nao ha janela aberta enquanto ninguem pede para ver", () => {
      montar(SEM_PERMISSOES, true);
      expect(screen.queryByRole("dialog", { name: "visualizador" })).toBeNull();
    });
  });

  describe("fotografia", () => {
    it("mostra a miniatura da fotografia a quem a pode abrir (sem registo, URL assinado como o avatar)", () => {
      montar();
      const foto = screen.getByText("eu.png").closest("li") as HTMLElement;
      const miniatura = within(foto).getByTestId("miniatura-fotografia");
      expect(miniatura).toHaveAttribute("src", "https://x/miniatura.png");
      expect(miniatura).toHaveAttribute("alt", "Fotografia");
    });

    it("sem permissao de abrir a fotografia nao ha miniatura", () => {
      montar(SEM_PERMISSOES);
      expect(screen.queryByTestId("miniatura-fotografia")).toBeNull();
    });

    it("so a fotografia tem miniatura (o cartao e o comprovativo nunca)", () => {
      montar();
      expect(screen.getAllByTestId("miniatura-fotografia")).toHaveLength(1);
    });

    it("Abrir pede um URL novo e abre-o num separador novo, sem opener", async () => {
      const janela = janelaFalsa();
      window.open = vi.fn(() => janela) as unknown as typeof window.open;
      obterUrl.mockResolvedValue({ url: "https://x/assinado?token=1", expiraEmSegundos: 60 });
      montar(SEM_PERMISSOES, true);

      fireEvent.click(screen.getByRole("button", { name: "Abrir: eu.png" }));

      await waitFor(() => expect(janela.location.href).toBe("https://x/assinado?token=1"));
      expect(obterUrl).toHaveBeenCalledWith("f1");
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
      const botao = screen.getByRole("button", { name: "Abrir: eu.png" });

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

      fireEvent.click(screen.getByRole("button", { name: "Abrir: eu.png" }));

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
      const botao = screen.getByRole("button", { name: "Abrir: eu.png" });
      fireEvent.click(botao);
      await waitFor(() => expect(botao).toBeDisabled());
      fireEvent.click(botao);
      expect(obterUrl).toHaveBeenCalledTimes(1);
      resolver({ url: "https://x/1", expiraEmSegundos: 60 });
      await waitFor(() => expect(botao).toBeEnabled());
    });
  });

  describe("escrita por tipo", () => {
    const naoHaEscrita = () => {
      expect(screen.queryByRole("button", { name: /^Anexar/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Substituir/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Remover/ })).toBeNull();
    };

    it("sem permissoes de escrita (ou sem a prop) nao ha Anexar, Substituir nem Remover", () => {
      montar(TODAS, false, { permissoesEscrita: SEM_ESCRITA });
      naoHaEscrita();
    });

    it("sem a prop permissoesEscrita o cartao so le", () => {
      montar(TODAS);
      naoHaEscrita();
    });

    it("com a permissao do cartao ha Substituir e Remover no cartao e em mais nenhum tipo", () => {
      montar(TODAS, false, { permissoesEscrita: { ...SEM_ESCRITA, identificacaoEdit: true } });
      const cartao = screen.getByText("cartao.pdf").closest("li") as HTMLElement;
      expect(within(cartao).getByRole("button", { name: "Substituir: cartao.pdf" })).toBeInTheDocument();
      expect(within(cartao).getByRole("button", { name: "Remover: cartao.pdf" })).toBeInTheDocument();
      const iban = screen.getByText("iban.pdf").closest("li") as HTMLElement;
      const foto = screen.getByText("eu.png").closest("li") as HTMLElement;
      for (const linha of [iban, foto]) {
        expect(within(linha).queryByRole("button", { name: /Substituir/ })).toBeNull();
        expect(within(linha).queryByRole("button", { name: /Remover/ })).toBeNull();
      }
    });

    it("cada tipo tem a sua permissao: IBAN pelos bancarios, fotografia pelos pessoais", () => {
      montar(TODAS, false, { permissoesEscrita: { identificacaoEdit: false, bancariosEdit: true, pessoaisEdit: false } });
      expect(screen.getByRole("button", { name: "Substituir: iban.pdf" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Substituir: eu.png" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Substituir: cartao.pdf" })).toBeNull();
    });

    it("tipo com lugar mostra Anexar; tipo cheio esconde Anexar e mantem Substituir", () => {
      // Fotografia 1/1 (cheia); cartao 1/2 e comprovativo 1/1 (cheio).
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      expect(screen.getByRole("button", { name: "Anexar: Cartão de cidadão" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Anexar: Fotografia" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Anexar: Comprovativo de IBAN" })).toBeNull();
      expect(screen.getByRole("button", { name: "Substituir: eu.png" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Substituir: iban.pdf" })).toBeInTheDocument();
    });

    it("sem anexos e com a permissao ha Anexar nos tres tipos, ao lado do texto de vazio", () => {
      estadoHook = { ...estadoHook, anexos: [] };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      expect(screen.getByText("Ainda não há anexos.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anexar: Cartão de cidadão" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anexar: Comprovativo de IBAN" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anexar: Fotografia" })).toBeInTheDocument();
    });

    it("sem a permissao de um tipo, esse Anexar nao aparece", () => {
      estadoHook = { ...estadoHook, anexos: [] };
      montar(TODAS, false, { permissoesEscrita: { identificacaoEdit: false, bancariosEdit: false, pessoaisEdit: true } });
      expect(screen.getByRole("button", { name: "Anexar: Fotografia" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Anexar: Cartão de cidadão" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Anexar: Comprovativo de IBAN" })).toBeNull();
    });

    it("escolher um ficheiro chama anexar(tipo, ficheiro)", async () => {
      estadoHook = { ...estadoHook, anexos: [] };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      const file = ficheiro("cc.pdf", "application/pdf");
      fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), { target: { files: [file] } });
      await waitFor(() => expect(anexar).toHaveBeenCalledWith("cartao_cidadao", file));
    });

    it("o seletor de fotografia so aceita imagem; os outros aceitam PDF, PNG e JPEG", () => {
      estadoHook = { ...estadoHook, anexos: [] };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      expect(screen.getByTestId("ficheiro-anexar-fotografia")).toHaveAttribute("accept", "image/png,image/jpeg");
      expect(screen.getByTestId("ficheiro-anexar-cartao_cidadao")).toHaveAttribute(
        "accept",
        "application/pdf,image/png,image/jpeg",
      );
    });

    it("escolher um ficheiro em Substituir chama substituir(id, tipo, ficheiro)", async () => {
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      const file = ficheiro("nova.png");
      fireEvent.change(screen.getByTestId("ficheiro-substituir-f1"), { target: { files: [file] } });
      await waitFor(() => expect(substituir).toHaveBeenCalledWith("f1", "fotografia", file));
    });

    it("Remover pede confirmacao e diz que apaga de vez; so remove ao confirmar", async () => {
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      fireEvent.click(screen.getByRole("button", { name: "Remover: iban.pdf" }));
      expect(remover).not.toHaveBeenCalled();
      const confirmacao = await screen.findByRole("alertdialog");
      expect(confirmacao).toHaveTextContent("Remover este ficheiro?");
      expect(confirmacao).toHaveTextContent(/apagado de vez/);
      fireEvent.click(within(confirmacao).getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(remover).toHaveBeenCalledWith("i1"));
      expect(remover).toHaveBeenCalledTimes(1);
    });

    it("Cancelar a confirmacao nao remove nada", async () => {
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      fireEvent.click(screen.getByRole("button", { name: "Remover: iban.pdf" }));
      const confirmacao = await screen.findByRole("alertdialog");
      fireEvent.click(within(confirmacao).getByRole("button", { name: "Cancelar" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(remover).not.toHaveBeenCalled();
    });

    it("um anexo a ser removido tem Substituir e Remover desactivados", () => {
      estadoHook = { ...estadoHook, aRemover: new Set(["i1"]) };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      expect(screen.getByRole("button", { name: "Remover: iban.pdf" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Substituir: iban.pdf" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Remover: cartao.pdf" })).toBeEnabled();
    });

    it("um erro de remocao aparece em role alert, traduzido (nunca o codigo)", () => {
      estadoHook = { ...estadoHook, errosRemocao: { i1: "sem_permissao" } };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent("Não tem permissão para alterar este tipo de anexo.");
      expect(alerta).not.toHaveTextContent("sem_permissao");
    });

    it("um envio falhado aparece em role alert traduzido, e pode ser fechado", () => {
      estadoHook = {
        ...estadoHook,
        envios: {
          e1: { tipo: "fotografia", nome: "gato.png", fase: "erro", progresso: 0, codigoErro: "anexo_limite_pessoa" },
        },
      };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent("gato.png");
      expect(alerta).toHaveTextContent("Foram enviados demasiados ficheiros para esta pessoa");
      expect(alerta).not.toHaveTextContent("anexo_limite_pessoa");
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
      expect(descartarEnvio).toHaveBeenCalledWith("e1");
    });

    it("um codigo desconhecido mostra o texto generico de falha, nunca o codigo", () => {
      estadoHook = {
        ...estadoHook,
        envios: {
          e1: { tipo: "fotografia", nome: "gato.png", fase: "erro", progresso: 0, codigoErro: "erro_esquisito_123" },
        },
      };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      const alerta = screen.getByRole("alert");
      expect(alerta).toHaveTextContent("Não foi possível enviar o ficheiro.");
      expect(alerta).not.toHaveTextContent("erro_esquisito_123");
    });

    it("um envio a decorrer mostra a barra de progresso com valor e nome, e o estado em texto", () => {
      estadoHook = {
        ...estadoHook,
        envios: { e1: { tipo: "fotografia", nome: "gato.png", fase: "a_enviar", progresso: 40, codigoErro: null } },
      };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      const barra = screen.getByRole("progressbar", { name: "Progresso do envio de gato.png" });
      expect(barra).toHaveAttribute("aria-valuenow", "40");
      expect(screen.getByText("A enviar...")).toBeInTheDocument();
    });

    it("a verificar: diz-o em texto e ja nao mostra a barra", () => {
      estadoHook = {
        ...estadoHook,
        envios: { e1: { tipo: "fotografia", nome: "gato.png", fase: "a_verificar", progresso: 100, codigoErro: null } },
      };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      expect(screen.getByText("A verificar o ficheiro...")).toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("uma recusa local por limite aparece em role alert na linha do tipo", () => {
      estadoHook = { ...estadoHook, anexos: [], erroLimite: { tipo: "cartao_cidadao", codigo: "anexo_formato_invalido" } };
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      expect(screen.getByRole("alert")).toHaveTextContent("O ficheiro tem de ser PDF, PNG ou JPEG, até 10 MB.");
    });
  });

  describe("fotografia: pre-visualizacao local antes de enviar", () => {
    it("ao escolher uma imagem mostra a pre-visualizacao local enquanto envia, e revoga o URL no fim", async () => {
      estadoHook = { ...estadoHook, anexos: [] };
      let resolver!: (v: { ok: boolean; codigo: string | null }) => void;
      anexar.mockReturnValue(new Promise((r) => (resolver = r)));
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });

      const file = ficheiro("eu.png");
      fireEvent.change(screen.getByTestId("ficheiro-anexar-fotografia"), { target: { files: [file] } });

      const preview = await screen.findByTestId("preview-local");
      expect(preview).toHaveAttribute("src", "blob:preview-1");
      expect(criarUrl).toHaveBeenCalledWith(file);
      expect(revogarUrl).not.toHaveBeenCalled();

      resolver({ ok: true, codigo: null });
      await waitFor(() => expect(screen.queryByTestId("preview-local")).toBeNull());
      expect(revogarUrl).toHaveBeenCalledWith("blob:preview-1");
    });

    it("um PDF escolhido no cartao nao tem pre-visualizacao", async () => {
      estadoHook = { ...estadoHook, anexos: [] };
      let resolver!: (v: { ok: boolean; codigo: string | null }) => void;
      anexar.mockReturnValue(new Promise((r) => (resolver = r)));
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA });
      fireEvent.change(screen.getByTestId("ficheiro-anexar-cartao_cidadao"), {
        target: { files: [ficheiro("cc.pdf", "application/pdf")] },
      });
      await waitFor(() => expect(anexar).toHaveBeenCalled());
      expect(screen.queryByTestId("preview-local")).toBeNull();
      expect(criarUrl).not.toHaveBeenCalled();
      resolver({ ok: true, codigo: null });
    });
  });

  describe("onFotografiaAlterada", () => {
    it("chama depois de anexar a fotografia com sucesso", async () => {
      estadoHook = { ...estadoHook, anexos: [] };
      const aoAlterar = vi.fn();
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA, onFotografiaAlterada: aoAlterar });
      fireEvent.change(screen.getByTestId("ficheiro-anexar-fotografia"), { target: { files: [ficheiro()] } });
      await waitFor(() => expect(aoAlterar).toHaveBeenCalledTimes(1));
    });

    it("chama depois de substituir a fotografia e depois de a remover", async () => {
      const aoAlterar = vi.fn();
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA, onFotografiaAlterada: aoAlterar });
      fireEvent.change(screen.getByTestId("ficheiro-substituir-f1"), { target: { files: [ficheiro()] } });
      await waitFor(() => expect(aoAlterar).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole("button", { name: "Remover: eu.png" }));
      const confirmacao = await screen.findByRole("alertdialog");
      fireEvent.click(within(confirmacao).getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(aoAlterar).toHaveBeenCalledTimes(2));
    });

    it("nao chama se a operacao falha", async () => {
      estadoHook = { ...estadoHook, anexos: [] };
      anexar.mockResolvedValue({ ok: false, codigo: "sem_permissao" });
      const aoAlterar = vi.fn();
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA, onFotografiaAlterada: aoAlterar });
      fireEvent.change(screen.getByTestId("ficheiro-anexar-fotografia"), { target: { files: [ficheiro()] } });
      await waitFor(() => expect(anexar).toHaveBeenCalled());
      expect(aoAlterar).not.toHaveBeenCalled();
    });

    it("nao chama para o cartao nem para o comprovativo", async () => {
      const aoAlterar = vi.fn();
      montar(TODAS, false, { permissoesEscrita: TODA_ESCRITA, onFotografiaAlterada: aoAlterar });
      fireEvent.change(screen.getByTestId("ficheiro-substituir-c1"), {
        target: { files: [ficheiro("cc.pdf", "application/pdf")] },
      });
      await waitFor(() => expect(substituir).toHaveBeenCalled());
      expect(aoAlterar).not.toHaveBeenCalled();
    });
  });
});
