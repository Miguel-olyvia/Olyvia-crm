// Um negócio que não está aberto (ganho ou perdido) só se edita depois de reaberto (decisão 5): o título, as notas, o comercial, as condições da proposta
// e os passos que criam documentos não se oferecem; o ecrã diz porquê e mostra primeiro «Reabrir negócio» (ganho) ou «Anular perda» (perdido). E, com a
// bandeira da migration B ligada, editar e o lixo seguem as permissões que a ficha devolve para ESTE negócio (decisão 6).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DadosNegocio, PropostaCondicoes } from "@/components/negocio-metas/costuraNegocio";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { PermissoesPorNegocioContext } from "@/hooks/pessoas/bandeirasNegocio";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [{ id: "u1", nome: "Ana Gomes" }], isLoading: false, isError: false, repetir: vi.fn() }),
}));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-19";
const PROPOSTA: PropostaCondicoes = { id: "p1", estado: "enviada", condicoes: { prazo: 20, inicio: "2026-11-02", pagamento: "metade", garantia: 2 }, legivel: true };
const base = { pessoa: "Ana", servico: "Cozinha", orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: { estado: "enviada" as const } };
const aberto = { ...negocioBase("n1", { ...base, estadoReal: "aberto" }), notas: "", comercialId: "u1" };
const ganho = { ...negocioBase("n3", { ...base, estadoReal: "ganho" }), resultado: "ganho" as const, mes: "2026-10", notas: "", comercialId: "u1" };
const perdido = { ...negocioBase("n4", { ...base, estadoReal: "perdido" }), notas: "", comercialId: "u1" };
const PERDA = { motivo: "Preço", mes: "2026-10", data: "2026-10-10", fase: "orcamento" as const };

const escritas = (): Partial<MutacoesNegocio> => ({
  editar: vi.fn(async () => ({ mudou: true })), enviarParaLixo: vi.fn(async () => undefined), restaurar: vi.fn(async () => undefined),
  guardarCondicoes: vi.fn(async () => undefined), reabrirGanho: vi.fn(async () => ({ mudou: true })),
});

function abrir(
  negocio: Parameters<typeof DetalheNegocioFicha>[0]["negocio"], dados: Partial<DadosNegocio> = {}, opcoes: { porNegocio?: boolean } = {},
) {
  render(
    <MemoryRouter>
      <PermissoesPorNegocioContext.Provider value={opcoes.porNegocio ?? null}>
        <ComCostura mutacoes={mutacoesFalsas(escritas())} dados={dadosFalsos({ podeApagar: true, podeReabrir: true, proposta: () => PROPOSTA, ...dados })}>
          <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} />
        </ComCostura>
      </PermissoesPorNegocioContext.Provider>
    </MemoryRouter>,
  );
}

const botao = (nome: string) => screen.queryByRole("button", { name: nome });
const passo = () => screen.queryByText("Próximo passo e prazo");

describe("negócio aberto: tudo como antes", () => {
  it("oferece editar, condições, o passo e perder", () => {
    abrir(aberto);
    expect(botao("Editar negócio")).toBeInTheDocument();
    expect(botao("Editar condições")).toBeInTheDocument();
    expect(passo()).toBeInTheDocument();
    expect(botao("Perder negócio")).toBeInTheDocument();
    expect(screen.queryByText(/reabr/i)).toBeNull();
  });
});

describe("negócio ganho: reabrir primeiro", () => {
  it("não oferece editar nem condições, e mostra «Reabrir negócio» e o porquê", () => {
    abrir(ganho);
    expect(botao("Editar negócio")).toBeNull();
    expect(botao("Editar condições")).toBeNull();
    expect(botao("Reabrir negócio")).toBeInTheDocument();
    expect(screen.getByText(/está ganho.*reabr/i)).toBeInTheDocument();
  });

  it("sem pessoas.reopen o aviso diz que é preciso reabrir mas não há botão de reabrir", () => {
    abrir(ganho, { podeReabrir: false });
    expect(botao("Reabrir negócio")).toBeNull();
    expect(botao("Editar negócio")).toBeNull();
    expect(screen.getByText(/está ganho.*reabr/i)).toBeInTheDocument();
  });

  it("o lixo continua a poder oferecer-se (não é editar)", () => {
    abrir(ganho);
    expect(botao("Enviar para o lixo")).toBeInTheDocument();
  });

  it("a proposta do negócio ganho mostra as condições mas não o botão de as editar", () => {
    abrir(ganho);
    // Num negócio ganho a secção da proposta vem fechada: abre-se para ver as condições.
    fireEvent.click(screen.getByRole("button", { name: /^Proposta/ }));
    expect(screen.getByText("20 dias úteis")).toBeInTheDocument();
    expect(botao("Editar condições")).toBeNull();
  });
});

describe("negócio perdido: anular a perda primeiro", () => {
  const dados = { alteracoes: { editados: {}, perdidos: { n4: PERDA }, detalhes: {}, sequencia: 0 } };

  it("não oferece editar, condições nem o passo; mostra «Anular perda» e o porquê", () => {
    abrir(perdido, dados);
    expect(botao("Editar negócio")).toBeNull();
    expect(botao("Editar condições")).toBeNull();
    expect(passo()).toBeNull();
    expect(botao("Anular perda")).toBeInTheDocument();
    expect(screen.getByText(/está perdido.*anule a perda/i)).toBeInTheDocument();
  });

  it("não se oferece perdê-lo outra vez", () => {
    abrir(perdido, dados);
    expect(botao("Perder negócio")).toBeNull();
  });
});

describe("com a bandeira da migration B ligada: as permissões deste negócio", () => {
  it("pode_editar falso: sem editar, sem condições, sem perder e sem lixo (o lixo é um UPDATE)", () => {
    abrir(aberto, { permissoesNegocio: () => ({ editar: false, apagar: true, restaurar: true }) }, { porNegocio: true });
    expect(botao("Editar negócio")).toBeNull();
    expect(botao("Editar condições")).toBeNull();
    expect(botao("Perder negócio")).toBeNull();
    expect(botao("Enviar para o lixo")).toBeNull();
  });

  it("pode_apagar falso: edita mas não manda para o lixo", () => {
    abrir(aberto, { permissoesNegocio: () => ({ editar: true, apagar: false, restaurar: false }) }, { porNegocio: true });
    expect(botao("Editar negócio")).toBeInTheDocument();
    expect(botao("Enviar para o lixo")).toBeNull();
  });

  it("os dois verdadeiros: oferece tudo", () => {
    abrir(aberto, { permissoesNegocio: () => ({ editar: true, apagar: true, restaurar: true }) }, { porNegocio: true });
    expect(botao("Editar negócio")).toBeInTheDocument();
    expect(botao("Enviar para o lixo")).toBeInTheDocument();
  });

  it("sem os campos (a base ainda não os devolve): como hoje, não restringe", () => {
    abrir(aberto, { permissoesNegocio: () => ({}) }, { porNegocio: true });
    expect(botao("Editar negócio")).toBeInTheDocument();
    expect(botao("Enviar para o lixo")).toBeInTheDocument();
  });

  it("com a bandeira desligada os campos são ignorados", () => {
    abrir(aberto, { permissoesNegocio: () => ({ editar: false, apagar: false, restaurar: false }) }, { porNegocio: false });
    expect(botao("Editar negócio")).toBeInTheDocument();
    expect(botao("Enviar para o lixo")).toBeInTheDocument();
  });
});
