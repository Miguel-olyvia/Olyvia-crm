// Os componentes partilhados da ficha, em modo real (dados da base): esconde o que não tem fonte e não mostra a marca «exemplo».
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { AtividadeFicha } from "./AtividadeFicha";
import { avisosPessoa } from "./avisosPessoa";
import { camposDeContacto, ContactoFicha } from "./ContactoFicha";
import { pessoaBase, resumoBase } from "./fabricaTestes";
import { FichaNegocios } from "./FichaNegocios";
import { textoUltimoContacto } from "./formatoPessoas";
import type { ItemAtividade } from "./pessoasTipos";
import { SeccaoOrigem } from "./SeccaoOrigem";
import { SeccaoSobre } from "./SeccoesResumo";
import { MarcaExemplo } from "./SelosPessoa";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  const t = (key: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key);
  return { useTranslation: () => ({ language: "pt", t }) };
});

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const noReal = (ui: React.ReactElement) => render(<FontePessoasContext.Provider value={REAL}>{ui}</FontePessoasContext.Provider>);
const HOJE = "2026-10-13";
const traduzir = (k: string, p?: Record<string, string | number>) => (p?.count !== undefined ? `${k}:${p.count}` : k);

describe("MarcaExemplo", () => {
  it("no exemplo (sem provider) mostra a marca", () => {
    render(<MarcaExemplo />);
    expect(screen.getByText("exemplo")).toBeInTheDocument();
  });

  it("em modo real não desenha nada", () => {
    const { container } = noReal(<MarcaExemplo />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a ficha de contacto real não leva a marca", () => {
    noReal(<ContactoFicha pessoa={pessoaBase("a", { contacto: { telefone: "912345678", email: null } })} />);
    expect(screen.queryByText("exemplo")).toBeNull();
    expect(camposDeContacto(pessoaBase("a", { contacto: { telefone: "912345678", email: null } }))).toHaveLength(1);
  });
});

describe("SeccaoSobre sem as linhas que a base não tem", () => {
  const real = (extra = {}) => resumoBase(pessoaBase("a", { saude: undefined, comercial: "", ultimoContactoDias: null, ...extra }), [], HOJE);

  it("sem saúde, sem comercial e sem contacto: não há linha da saúde da pessoa nem do comercial", () => {
    noReal(<SeccaoSobre resumo={real()} hoje={HOJE} />);
    expect(screen.queryByText("Saúde da pessoa")).toBeNull();
    expect(screen.queryByText("Comercial")).toBeNull();
    expect(screen.queryByText("exemplo")).toBeNull();
  });

  it("nunca contactada: diz «Sem contacto» uma só vez (no selo), sem texto de dias", () => {
    noReal(<SeccaoSobre resumo={real()} hoje={HOJE} />);
    expect(screen.getAllByText("Sem contacto")).toHaveLength(1);
    expect(screen.queryByText(/há \d+ dias/)).toBeNull();
  });

  it("com comercial, mostra a linha; com saúde (exemplo) também", () => {
    noReal(<SeccaoSobre resumo={real({ comercial: "Rita Gomes" })} hoje={HOJE} />);
    expect(screen.getByText("Rita Gomes")).toBeInTheDocument();
  });

  it("a qualificação só aparece se existir (MQL ou SQL)", () => {
    const { unmount } = noReal(<SeccaoSobre resumo={real({ qualificacao: "SQL" })} hoje={HOJE} />);
    expect(screen.getByText(/SQL/)).toBeInTheDocument();
    unmount();
    noReal(<SeccaoSobre resumo={real()} hoje={HOJE} />);
    expect(screen.queryByText(/SQL|MQL/)).toBeNull();
  });
});

describe("SeccaoOrigem sem fonte", () => {
  it("sem origem, canal, campanha, formulário nem via de entrada, a secção não aparece", () => {
    const { container } = noReal(<SeccaoOrigem pessoa={pessoaBase("a", { origem: undefined, viaEntrada: undefined })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("com a origem e a via de exemplo mostra as linhas que existem", () => {
    noReal(<SeccaoOrigem pessoa={pessoaBase("a", { origem: "site", viaEntrada: "telefone" })} />);
    expect(screen.getByText("Site")).toBeInTheDocument();
  });
});

describe("AtividadeFicha: a hora", () => {
  const item = (extra: Partial<ItemAtividade>): ItemAtividade => ({
    id: "i", pessoaId: "a", tipo: "chamada", titulo: "x", detalhe: "", quando: HOJE, exemplo: false, ...extra,
  });

  it("um registo com hora mostra a hora, mesmo sem ser de exemplo, e não diz «agora»", () => {
    render(<AtividadeFicha itens={[item({ hora: "14:30" })]} hoje={HOJE} />);
    expect(screen.getByText("14:30")).toBeInTheDocument();
    expect(screen.queryByText("registado agora")).toBeNull();
    expect(screen.queryByText("exemplo")).toBeNull();
  });

  it("sem hora e sem ser de exemplo diz «agora» (feito nesta sessão)", () => {
    render(<AtividadeFicha itens={[item({})]} hoje={HOJE} />);
    expect(screen.getByText("registado agora")).toBeInTheDocument();
  });

  it("de exemplo continua a mostrar a hora e a marca", () => {
    render(<AtividadeFicha itens={[item({ exemplo: true, hora: "09:00" })]} hoje={HOJE} />);
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("exemplo")).toBeInTheDocument();
  });

  it("de exemplo e sem hora não mostra nem «agora» nem hora", () => {
    render(<AtividadeFicha itens={[item({ exemplo: true })]} hoje={HOJE} />);
    expect(screen.queryByText("registado agora")).toBeNull();
  });
});

describe("«nunca contactada» (ultimoContactoDias nulo)", () => {
  it("textoUltimoContacto aceita null e diz «Sem contacto»", () => {
    expect(textoUltimoContacto(traduzir, null)).toBe("pessoasPagina.real.noContact");
    expect(textoUltimoContacto(traduzir, 0)).toBe("pessoasPagina.last.today");
    expect(textoUltimoContacto(traduzir, 3)).toBe("pessoasPagina.last.many:3");
  });

  it("não avisa «sem contacto há N dias» a quem nunca foi contactada", () => {
    const avisos = avisosPessoa({ pessoa: { ultimoContactoDias: null, perdida: undefined }, voltou: false, podeVerSubmissoes: false, negociosAbertos: 0 });
    expect(avisos).toEqual([]);
  });

  it("continua a avisar quando passou o limite", () => {
    const avisos = avisosPessoa({ pessoa: { ultimoContactoDias: 30, perdida: undefined }, voltou: false, podeVerSubmissoes: false, negociosAbertos: 0 });
    expect(avisos.map((a) => a.tipo)).toEqual(["semContacto"]);
  });
});

describe("FichaNegocios sem aoAbrir (o detalhe do negócio é do P3)", () => {
  const negocios = [negocioBase("n1", { servico: "Casa de banho" })];

  it("com aoAbrir cada negócio é um botão", () => {
    render(<FichaNegocios negocios={negocios} hoje={HOJE} aoAbrir={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Casa de banho/ })).toBeInTheDocument();
  });

  it("sem aoAbrir lê-se a lista, sem botões que abririam o detalhe", () => {
    render(<FichaNegocios negocios={negocios} hoje={HOJE} />);
    expect(screen.getByText("Casa de banho")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
