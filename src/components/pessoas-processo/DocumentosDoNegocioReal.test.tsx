// Os passos de documento do guia dentro da ficha: o provider diz quando um passo se pode fazer (documento no negócio, permissão, a base à mão), abre o
// diálogo certo por cima do guia e larga-o ao trocar de pessoa. Os diálogos em si estão simulados (têm o seu teste).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MutacoesNegocioContext, type MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { fichaDb, negocioDb, seccaoDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb, NegocioFichaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { DocumentosDoNegocioProvider, useDocumentosDoNegocio } from "./DocumentosDoNegocioReal";
import type { PassoDocumento } from "./documentosGuia";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("./DialogosDocumentoGuia", () => {
  const Falso = (nome: string) => ({ plano, aoFechar, negocioId }: { plano: { passo: string }; aoFechar: () => void; negocioId?: string }) => (
    <div role="dialog" aria-label={nome} data-passo={plano.passo} data-negocio={negocioId ?? ""}><button type="button" onClick={aoFechar}>fechar {nome}</button></div>
  );
  return {
    EnviarPropostaNoGuia: Falso("enviar"), RespostaPropostaNoGuia: Falso("resposta"), CriarContratoNoGuia: Falso("contrato"), AssinarContratoNoGuia: Falso("assinatura"),
  };
});

afterEach(cleanup);

const PERMS = ["proposals.edit", "client_contracts.create", "client_contracts.edit"];
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: PERMS };
const proposta = (status: string) => ({ id: "p1", numero: "P-1", titulo: "WC", status, valor: 100, valid_until: null, terms: null, enviada_em: null, aceite_em: null, criado_em: "2026-10-01T10:00:00Z" });
const contratoDb = { id: "c1", numero: "C-1", status: "pending_signature", valor: 100, assinado_em: null, criado_em: "2026-10-02T10:00:00Z", tem_base: true };

const fichaCom = (negocio: Partial<NegocioFichaDb>, extra: Partial<FichaDb> = {}): FichaDb => fichaDb({ negocios: seccaoDb([negocioDb({ id: "n1", ...negocio })]), ...extra });

function Consumidor({ passo }: { passo: PassoDocumento }) {
  const documentos = useDocumentosDoNegocio();
  return (
    <>
      <span data-testid="pode">{String(documentos?.pode(passo, "n1"))}</span>
      <button type="button" onClick={() => documentos?.abrir(passo, "n1")}>abrir</button>
    </>
  );
}

function montar(ficha: FichaDb | null, passo: PassoDocumento, opcoes: { fonte?: FontePessoas; mutacoes?: MutacoesNegocio | null } = {}) {
  const mutacoes = opcoes.mutacoes === undefined ? mutacoesFalsas() : opcoes.mutacoes;
  const arvore = (f: FichaDb | null) => (
    <FontePessoasContext.Provider value={opcoes.fonte ?? REAL}>
      <MutacoesNegocioContext.Provider value={mutacoes}>
        <DocumentosDoNegocioProvider ficha={f}><Consumidor passo={passo} /></DocumentosDoNegocioProvider>
      </MutacoesNegocioContext.Provider>
    </FontePessoasContext.Provider>
  );
  const r = render(arvore(ficha));
  return { trocar: (f: FichaDb | null) => r.rerender(arvore(f)) };
}

const CASOS: Array<[PassoDocumento, Partial<NegocioFichaDb>, string]> = [
  ["enviarProposta", { propostas: [proposta("draft")] }, "enviar"],
  ["registarRespostaCliente", { propostas: [proposta("sent")] }, "resposta"],
  ["criarContrato", { propostas: [proposta("accepted")] }, "contrato"],
  ["registarAssinatura", { contratos: [contratoDb] }, "assinatura"],
];

describe("os passos de documento na ficha real", () => {
  it.each(CASOS)("«%s» tem o documento, diz que pode e abre o diálogo no próprio ecrã", async (passo, negocio, nome) => {
    montar(fichaCom(negocio), passo);
    expect(screen.getByTestId("pode")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    const dialogo = await screen.findByRole("dialog", { name: nome });
    expect(dialogo).toHaveAttribute("data-passo", passo);
  });

  it("o diálogo do contrato leva o negócio do guia", async () => {
    montar(fichaCom({ propostas: [proposta("accepted")] }), "criarContrato");
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    expect(await screen.findByRole("dialog", { name: "contrato" })).toHaveAttribute("data-negocio", "n1");
  });

  it("fechar o diálogo larga-o", async () => {
    montar(fichaCom({ propostas: [proposta("draft")] }), "enviarProposta");
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    fireEvent.click(await screen.findByRole("button", { name: "fechar enviar" }));
    expect(screen.queryByRole("dialog", { name: "enviar" })).toBeNull();
  });

  it("sem o documento no negócio diz que não pode e não abre nada", () => {
    montar(fichaCom({}), "enviarProposta");
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem permissão para editar a ficha, ou num negócio que o âmbito não deixa editar, não pode", () => {
    montar(fichaCom({ propostas: [proposta("draft")] }, { permissoes: { editar: false, criar: true } }), "enviarProposta");
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
    cleanup();
    montar(fichaCom({ propostas: [proposta("draft")], pode_editar: false }), "enviarProposta");
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
  });

  it("um negócio já ganho ou perdido não oferece estes passos", () => {
    for (const estado of ["ganho", "perdido"]) {
      montar(fichaCom({ propostas: [proposta("draft")], estado }), "enviarProposta");
      expect(screen.getByTestId("pode")).toHaveTextContent("false");
      cleanup();
    }
  });

  it("criar o contrato exige client_contracts.create quando a lista de permissões é conhecida", () => {
    montar(fichaCom({ propostas: [proposta("accepted")] }), "criarContrato", { fonte: { ...REAL, permissoesFecho: ["quotes.create"] } });
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
    cleanup();
    montar(fichaCom({ propostas: [proposta("accepted")] }), "criarContrato", { fonte: { ...REAL, permissoesFecho: ["client_contracts.create"] } });
    expect(screen.getByTestId("pode")).toHaveTextContent("true");
  });

  it("sem lista de permissões conhecida (a carregar, ou a leitura falhou) não pode nem abre nada", () => {
    const { permissoesFecho: _fora, ...semLista } = REAL as Extract<FontePessoas, { modo: "real" }>;
    for (const [passo, negocio] of CASOS.map(([p, n]) => [p, n] as const)) {
      montar(fichaCom(negocio), passo, { fonte: semLista });
      expect(screen.getByTestId("pode")).toHaveTextContent("false");
      fireEvent.click(screen.getByRole("button", { name: "abrir" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      cleanup();
    }
  });

  it("fora da base (o exemplo), sem as mutações da ficha ou sem ficha não há nada a fazer", () => {
    montar(fichaCom({ propostas: [proposta("draft")] }), "enviarProposta", { fonte: { modo: "exemplo" } });
    expect(screen.getByTestId("pode")).toHaveTextContent("undefined");
    cleanup();
    montar(fichaCom({ propostas: [proposta("draft")] }), "enviarProposta", { mutacoes: null });
    expect(screen.getByTestId("pode")).toHaveTextContent("undefined");
    cleanup();
    montar(null, "enviarProposta");
    expect(screen.getByTestId("pode")).toHaveTextContent("undefined");
  });

  it("trocar de pessoa larga o diálogo aberto", async () => {
    const primeira = fichaCom({ propostas: [proposta("draft")] });
    const { trocar } = montar(primeira, "enviarProposta");
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    expect(await screen.findByRole("dialog", { name: "enviar" })).toBeInTheDocument();
    trocar(fichaDb({ pessoa: { ...primeira.pessoa, id: "outra-pessoa" } }));
    expect(screen.queryByRole("dialog")).toBeNull();
    trocar(primeira);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
