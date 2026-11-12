// 12/11 (Rúben: «falta ver aqui o contrato»): no passo Contrato do Negócio vê-se o contrato montado (dados do cliente e da obra, a minuta
// preenchida, as cláusulas do negócio) antes de o enviar ao portal; sem minuta, diz-se o que falta, e a minuta por omissão escolhe-se sozinha.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import type { Passo } from "@/emylia/CamposFase";
import { FileSignature } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { ContratoDoc } from "@/emylia/DocsCliente";
import type { MinutaDeContrato } from "@/hooks/pessoas/useTemplatesDeDocumento";
import { ContratoNoPasso } from "./ContratoNoPasso";

const guardar = vi.fn(async () => true);
const estadoMinutas: { data: MinutaDeContrato[] } = { data: [] };
const escolhido: { minuta_id: string | null } = { minuta_id: null };

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1", name: "Mudelar Teste", logo_url: null } }) }));
vi.mock("@/hooks/pessoas/useTemplatesDeDocumento", () => ({
  useMinutasDeContrato: () => ({ data: estadoMinutas.data, isLoading: false, error: null, refetch: vi.fn() }),
  usePerguntasDeContrato: () => ({ data: [], error: null }),
  useDadosDaProposta: () => ({ data: { numero: "PR-0042", data: "10/11/2026" } }),
  useNomeDoSignatario: () => ({ data: "Rúben", isLoading: false, isError: false, error: null }),
  useTemplatesDeAspeto: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/hooks/pessoas/useTemplatesDoNegocio", () => ({
  useTemplatesDoNegocio: () => ({
    estado: "pronto", erro: null, aGuardar: false, erroAoGuardar: null, reler: vi.fn(), guardar,
    dados: { template_orcamento_id: null, template_proposta_id: null, minuta_id: escolhido.minuta_id, minuta_respostas: {}, contrato_corpo_html: null, template_proposta_snapshot: null },
  }),
}));
vi.mock("@/hooks/pessoas/useEnviarParaPortalNegocio", () => ({
  useEnviarParaPortalNegocio: () => ({ aLer: false, erro: null, estado: "pronto", podePermissao: true, aLerPermissao: false, aEnviar: false, enviar: vi.fn(), reler: vi.fn() }),
}));

afterEach(cleanup);
beforeEach(() => { guardar.mockClear(); estadoMinutas.data = []; escolhido.minuta_id = null; });

/** Um negócio pronto a gerar o contrato: proposta aceite, medidas aceites, plano aprovado e as condições respondidas. */
function negocioPronto() {
  const S = seed(), A = acoes(S, vi.fn(), (fn) => fn());
  const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc") && !x.orc.aceite) as Negocio;
  Object.assign(d.orc!, { enviada: "hoje", aceite: "hoje", contrato: null, vendaDireta: false });
  d.f.retif_aceite = "2026-11-10"; d.obra.plano = { tasks: [], estado: "aprovado", dia: 0 };
  Object.assign(d.f, { modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não",
    nome_fiscal: "Maria Teste", nif: "123456789", morada: "Rua das Flores 10", localidade: "Lisboa" });
  const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  return { S, d, ctx };
}

const MINUTA: MinutaDeContrato = {
  id: "m1", name: "Contrato de Empreitada", description: null, language: "pt", is_default: true, signatory_user_id: "u1",
  body_html: "<h1>Contrato de empreitada</h1><p>Entre {{empresa_nome}} e {{cliente_nome}}, NIF {{cliente_nif}}, é celebrado este contrato.</p>",
};

describe("o contrato montado (ContratoNoPasso)", () => {
  it("mostra o cliente, a obra, a minuta preenchida e, no fim, as cláusulas do negócio com as prestações", () => {
    const { S, d } = negocioPronto();
    render(<ContratoNoPasso S={S} d={d} minutaHtml="<p>Entre Mudelar Teste e Maria Teste é celebrado este contrato.</p>" nomeMinuta="Contrato de Empreitada" falta={[]} />);
    const doc = screen.getByRole("region", { name: "Minuta «Contrato de Empreitada»" });
    expect(doc.textContent).toContain("Entre Mudelar Teste e Maria Teste");
    expect(screen.getByText("Rua das Flores 10")).toBeTruthy();
    expect(screen.getAllByText("Maria Teste").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Cláusulas do negócio" })).toBeTruthy();
    expect(screen.getByText(/Cláusula 3\.ª · Pagamento/)).toBeTruthy();
    expect(screen.getByText(/Cláusula 2\.ª · Preço/)).toBeTruthy();
    expect(screen.getByText(/CT 2026\//)).toBeTruthy();
    // com o corpo da minuta, a frase de abertura da Emylia não se repete; e nada em falta
    expect(screen.queryByText(/que segue a proposta PR 2026/)).toBeNull();
    expect(screen.queryByText(/Para haver contrato, falta/)).toBeNull();
  });

  it("assinaturas uma vez só: a minuta com as suas linhas de assinatura dispensa as da folha; sem elas, a folha põe-nas", () => {
    const { S, d } = negocioPronto();
    const { unmount } = render(<ContratoNoPasso S={S} d={d} minutaHtml="<p>Texto.</p><p>A PRIMEIRA CONTRATANTE ____ O SEGUNDO CONTRATANTE</p>" nomeMinuta="Com assinaturas" falta={[]} />);
    expect(screen.queryByRole("region", { name: "Assinaturas" })).toBeNull();
    unmount();
    render(<ContratoNoPasso S={S} d={d} minutaHtml="<p>Texto sem linhas de assinatura.</p>" nomeMinuta="Sem assinaturas" falta={[]} />);
    expect(screen.getByRole("region", { name: "Assinaturas" })).toBeTruthy();
  });

  it("sem minuta: o documento continua à vista e diz o que falta, em cima e no lugar do corpo", () => {
    const { S, d } = negocioPronto();
    render(<ContratoNoPasso S={S} d={d} minutaHtml={null} nomeMinuta={null} falta={["Escolher a minuta do contrato, na lista em cima."]} />);
    const aviso = screen.getByText(/Para haver contrato, falta/).parentElement!;
    expect(within(aviso).getByText("Escolher a minuta do contrato, na lista em cima.")).toBeTruthy();
    expect(screen.getByText(/Ainda não há minuta escolhida, por isso ainda não há contrato para enviar/)).toBeTruthy();
    expect(screen.getByText(/Cláusula 1\.ª · Objeto/)).toBeTruthy();
  });

  it("sem orçamento não inventa contrato", () => {
    const { S, d } = negocioPronto();
    render(<ContratoNoPasso S={S} d={{ ...d, orc: null } as unknown as Negocio} minutaHtml={null} nomeMinuta={null} falta={[]} />);
    expect(screen.getByText(/Ainda não há orçamento neste negócio/)).toBeTruthy();
  });

  it("o contrato do portal (sem corpo) fica como estava", () => {
    const { S, d } = negocioPronto();
    render(<ContratoDoc S={S} d={d} />);
    expect(screen.getByText(/que segue a proposta PR 2026/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Cláusulas do negócio" })).toBeNull();
  });
});

describe("no passo Contrato do Negócio", () => {
  async function passoContrato() {
    const { comTemplatesNosPassos } = await import("./templatesDosPassos");
    const { d, ctx } = negocioPronto();
    const p: Passo = { id: "Contrato", titulo: "Contrato", icone: FileSignature, corpo: <p>corpo da Emylia</p> };
    const [embrulhado] = comTemplatesNosPassos([p], { negocioId: "neg-1", ctx, d, podeEditar: true });
    return render(<MemoryRouter>{embrulhado.corpo}</MemoryRouter>);
  }

  it("com a minuta escolhida, mostra o contrato montado com os dados reais antes do envio ao portal", async () => {
    estadoMinutas.data = [MINUTA]; escolhido.minuta_id = "m1";
    await passoContrato();
    const minuta = screen.getByRole("region", { name: "Minuta «Contrato de Empreitada»" });
    expect(minuta.textContent).toContain("Entre Mudelar Teste e Maria Teste, NIF 123456789");
    expect(screen.getByRole("heading", { name: "O contrato" })).toBeTruthy();
    expect(screen.queryByText(/Para haver contrato, falta/)).toBeNull();
    // a ordem: minuta, condições, o contrato, o portal
    const ordem = ["Minuta do contrato", "Condições do contrato", "O contrato", "Portal do cliente: contrato"].map((n) =>
      n === "O contrato" ? screen.getByRole("heading", { name: n }) : screen.getByRole("region", { name: n }));
    for (let i = 1; i < ordem.length; i++) expect(ordem[i - 1].compareDocumentPosition(ordem[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(guardar).not.toHaveBeenCalled();
  });

  it("em «Nenhum», a minuta por omissão escolhe-se sozinha (e grava-se já com o corpo preenchido)", async () => {
    estadoMinutas.data = [MINUTA, { ...MINUTA, id: "m2", name: "Prestação de Serviços", is_default: false }];
    await passoContrato();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ minuta_id: "m1", minuta_respostas: {}, contrato_corpo_html: expect.stringContaining("Maria Teste") }));
  });

  it("em «Nenhum» e sem minuta por omissão, diz que falta escolher a minuta", async () => {
    estadoMinutas.data = [{ ...MINUTA, is_default: false }, { ...MINUTA, id: "m2", name: "Prestação de Serviços", is_default: false }];
    await passoContrato();
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText("Escolher a minuta do contrato, na lista em cima.")).toBeTruthy();
    expect(screen.getByText(/Ainda não há minuta escolhida/)).toBeTruthy();
  });

  it("sem minutas na organização, diz que é preciso criar uma", async () => {
    await passoContrato();
    expect(screen.getByText("Criar uma minuta de contrato, em «Minutas de contrato».")).toBeTruthy();
  });
});
