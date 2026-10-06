/**
 * `PessoaAdmissaoPendencias`: as tres posicoes (convite, ficha, rh) aparecem em
 * listas separadas, porque os donos sao diferentes; linhas de uma base antiga,
 * sem `posicao`, caem no sitio certo pela origem; e quem nao pode ver, ou a
 * leitura que falha, nunca ve "tudo preenchido".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const TEXTOS: Record<string, string> = {
  "hr.pendencias.titulo": "Admissão",
  "hr.pendencias.contagem": "({{n}} em falta)",
  "hr.pendencias.noConvite": "Falta a pessoa preencher (no convite)",
  "hr.pendencias.naFicha": "Dados da pessoa a completar na ficha",
  "hr.pendencias.doRh": "Falta os RH preencherem",
  "hr.pendencias.completo": "Tudo preenchido.",
  "hr.pendencias.campo.telefone_pessoal": "Telefone pessoal",
  "hr.pendencias.campo.niss": "NISS",
  "hr.pendencias.campo.cargo": "Cargo",
  "hr.pendencias.campo.data_admissao": "Data de admissão",
  "hr.pendencias.campo.desconhecido": "Campo por identificar",
};

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string, params?: Record<string, string | number>) => {
      let texto = TEXTOS[chave] ?? chave;
      Object.entries(params ?? {}).forEach(([k, v]) => {
        texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      });
      return texto;
    },
  }),
}));

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { PessoaAdmissaoPendencias } from "@/components/hr/PessoaAdmissaoPendencias";
import { pendenciaDaLinha } from "@/hooks/useAdmissaoPendencias";

describe("PessoaAdmissaoPendencias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra as tres posicoes em listas separadas", async () => {
    rpc.mockResolvedValue({
      data: [
        { codigo: "telefone_pessoal", origem: "pessoa", posicao: "convite" },
        { codigo: "niss", origem: "pessoa", posicao: "ficha" },
        { codigo: "cargo", origem: "rh", posicao: "rh" },
        { codigo: "data_admissao", origem: "rh", posicao: "rh" },
      ],
      error: null,
    });
    render(<PessoaAdmissaoPendencias pessoaId="p1" />);

    expect(await screen.findByText("Falta a pessoa preencher (no convite)")).toBeInTheDocument();
    expect(screen.getByText("Dados da pessoa a completar na ficha")).toBeInTheDocument();
    expect(screen.getByText("Falta os RH preencherem")).toBeInTheDocument();

    // Cada lista tem so os seus.
    const noConvite = screen.getByText("Falta a pessoa preencher (no convite)").parentElement!;
    expect(noConvite).toHaveTextContent("Telefone pessoal");
    expect(noConvite).not.toHaveTextContent("NISS");
    const naFicha = screen.getByText("Dados da pessoa a completar na ficha").parentElement!;
    expect(naFicha).toHaveTextContent("NISS");
    const doRh = screen.getByText("Falta os RH preencherem").parentElement!;
    expect(doRh).toHaveTextContent("Cargo");
    expect(doRh).toHaveTextContent("Data de admissão");

    expect(screen.getByText("(4 em falta)")).toBeInTheDocument();
    expect(screen.queryByText("Tudo preenchido.")).not.toBeInTheDocument();
  });

  it("linhas sem posicao caem pela origem: pessoa no convite, rh no rh", async () => {
    rpc.mockResolvedValue({
      data: [
        { codigo: "telefone_pessoal", origem: "pessoa" },
        { codigo: "data_admissao", origem: "rh" },
      ],
      error: null,
    });
    render(<PessoaAdmissaoPendencias pessoaId="p1" />);

    const noConvite = (await screen.findByText("Falta a pessoa preencher (no convite)"))
      .parentElement!;
    expect(noConvite).toHaveTextContent("Telefone pessoal");
    expect(screen.queryByText("Dados da pessoa a completar na ficha")).not.toBeInTheDocument();
    expect(screen.getByText("Falta os RH preencherem").parentElement!).toHaveTextContent(
      "Data de admissão",
    );
  });

  it("uma lista vazia diz que esta tudo preenchido", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<PessoaAdmissaoPendencias pessoaId="p1" />);
    expect(await screen.findByText("Tudo preenchido.")).toBeInTheDocument();
  });

  it("sem permissao (42501) o cartao nao aparece: nunca 'tudo preenchido'", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "insufficient_privilege" } });
    const { container } = render(<PessoaAdmissaoPendencias pessoaId="p1" />);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByText("Tudo preenchido.")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("um codigo que o cliente nao conhece mostra um texto generico, nao a chave de traducao", async () => {
    rpc.mockResolvedValue({
      data: [{ codigo: "campo_novo_do_servidor", origem: "pessoa", posicao: "convite" }],
      error: null,
    });
    render(<PessoaAdmissaoPendencias pessoaId="p1" />);

    expect(await screen.findByText("Campo por identificar")).toBeInTheDocument();
    expect(screen.queryByText(/hr\.pendencias\.campo\./)).not.toBeInTheDocument();
  });

  it("numa recarga (depois de gravar) o cartao mantem-se em vez de piscar", () => {
    render(
      <PessoaAdmissaoPendencias
        pessoaId="p1"
        estado={{
          pendencias: [{ codigo: "niss", origem: "pessoa", posicao: "ficha" }],
          noConvite: [],
          naFicha: [{ codigo: "niss", origem: "pessoa", posicao: "ficha" }],
          daPessoa: [{ codigo: "niss", origem: "pessoa", posicao: "ficha" }],
          doRh: [],
          carregando: false,
          recarregando: true,
          semAcesso: false,
          erro: false,
          recarregar: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("Dados da pessoa a completar na ficha")).toBeInTheDocument();
  });

  it("usa o estado que lhe dao, sem ler a base outra vez", () => {
    render(
      <PessoaAdmissaoPendencias
        pessoaId="p1"
        estado={{
          pendencias: [{ codigo: "niss", origem: "pessoa", posicao: "ficha" }],
          noConvite: [],
          naFicha: [{ codigo: "niss", origem: "pessoa", posicao: "ficha" }],
          daPessoa: [{ codigo: "niss", origem: "pessoa", posicao: "ficha" }],
          doRh: [],
          carregando: false,
          recarregando: false,
          semAcesso: false,
          erro: false,
          recarregar: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("Dados da pessoa a completar na ficha")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("pendenciaDaLinha", () => {
  it("respeita a posicao da base e cai pela origem quando falta", () => {
    expect(pendenciaDaLinha({ codigo: "niss", origem: "pessoa", posicao: "ficha" }).posicao).toBe(
      "ficha",
    );
    expect(pendenciaDaLinha({ codigo: "niss", origem: "pessoa" }).posicao).toBe("convite");
    expect(pendenciaDaLinha({ codigo: "cargo", origem: "rh" }).posicao).toBe("rh");
    // Uma posicao que a base nao conhece nao se aceita.
    expect(pendenciaDaLinha({ codigo: "x", origem: "pessoa", posicao: "outra" }).posicao).toBe(
      "convite",
    );
  });
});
