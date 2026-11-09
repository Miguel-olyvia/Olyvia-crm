// A fila de trabalho do mapa de assiduidade com as justificações de dia por decidir, lidas da base: a pessoa entra na lista e no
// contador do separador, abre-se o painel dela, a decisão (uma chamada à base) tira o item e, sem mais nada, a pessoa sai da
// fila. A base está simulada em memória (src/test/justificacoesDoDiaFalso.ts e src/test/filaDeTrabalhoFalso.ts); nada toca
// em base nenhuma.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());
// As horas extra e as permissoes de assiduidade vem da base: simuladas.
vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", async () => (await import("@/test/horasExtraFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePermissoesAssiduidade", async () => (await import("@/test/horasExtraFalso")).permissoesFalsas());
// A fila junta as tres fontes (horas extra, justificações, desvios) no seu hook: simulado sobre as mesmas bases simuladas.
vi.mock("@/hooks/useFilaDeTrabalho", async () => (await import("@/test/filaDeTrabalhoFalso")).hookFalso());
// O ecrã do mapa lê a organização, o mapa do mês, os centros, as pessoas e a ficha de quem vê: simulados.
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao", async () => (await import("@/test/mapaAssiduidadeFalso")).organizacaoVaziaFalsa());
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => ({ useLocaisTrabalho: () => ({ locais: [] }) }));
// A ficha de quem vê: por omissão nenhuma; um teste põe a da Inês para ver a regra «ninguém decide a sua».
const quemVe = vi.hoisted(() => ({ pessoaId: null as string | null }));
vi.mock("@/components/rh-exemplo/hooks/useMinhaPessoa", () => ({ useMinhaPessoa: () => ({ pessoaId: quemVe.pessoaId }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({
  usePessoas: () => ({ pessoas: [{ id: "p-ines", nome_completo: "Inês Cardoso", estado_registo: "activo" }] }),
}));

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { reporBaseFalsa as reporHorasFalsas, semearHoras } from "@/test/horasExtraFalso";
import { reporDesviosFalsos } from "@/test/filaDeTrabalhoFalso";
import { baseFalsa, reporBaseFalsa, semearJustificacao } from "@/test/justificacoesDoDiaFalso";
import RhAssiduidadeOrganizacao from "./RhAssiduidadeOrganizacao";

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  reporHorasFalsas();
  semearHoras([]);
  reporDesviosFalsos();
  reporBaseFalsa();
  quemVe.pessoaId = null;
});

const abrirSeparador = (nome: RegExp) => {
  const separador = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(separador);
  fireEvent.click(separador);
};

const montar = () => render(<LanguageProvider><MemoryRouter><RhAssiduidadeOrganizacao /></MemoryRouter></LanguageProvider>);

describe("justificações de dia na fila do mapa de assiduidade", () => {
  it("a Inês aparece na fila, aceitar decide-a na base, tira o item e, sem mais nada, a pessoa sai da fila e o contador desaparece", async () => {
    semearJustificacao({ id: "jd-ines", pessoaId: "p-ines", data: "2026-10-07" });
    montar();
    expect((await screen.findByTestId("rhd-contador-fila")).textContent).toBe("1");
    abrirSeparador(/Fila de trabalho|Desvios/i);
    const lista = await screen.findByTestId("rhd-fila-pessoas");
    const linha = within(lista).getByRole("button", { name: /^Inês Cardoso, 1 pendência: 1 justificação/ });
    expect(linha).toHaveTextContent("Inês Cardoso");
    expect(linha).toHaveTextContent("1 justificação");
    fireEvent.click(linha);

    const painel = await screen.findByTestId("painel-fila-pessoa");
    const item = within(painel).getByTestId("item-fila-justificacao-jd-ines");
    expect(within(item).getByText("Justificação")).toBeInTheDocument();
    fireEvent.click(within(item).getByRole("button", { name: /Aceitar a justificação de Inês Cardoso/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · não paga" }));

    await waitFor(() => expect(screen.queryByTestId("item-fila-justificacao-jd-ines")).not.toBeInTheDocument());
    expect(baseFalsa.decisoes).toEqual([{ justificacaoId: "jd-ines", decisao: "aceitar_nao_paga", motivo: null }]);
    expect(within(screen.getByTestId("painel-fila-pessoa")).getByTestId("painel-fila-aviso")).toHaveTextContent("Justificação aceite · não paga.");
    // Sem mais pendências: o painel di-lo, o foco vai para «Fechar» e o contador do separador desaparece.
    expect(within(screen.getByTestId("painel-fila-pessoa")).getByText("Nada por tratar para Inês Cardoso.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus());
    expect(screen.queryByTestId("rhd-contador-fila")).not.toBeInTheDocument();
  });

  it("sem pendências na base a fila diz que ninguém tem nada por tratar, e não há contador", async () => {
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    expect(await screen.findByTestId("rhd-fila-vazia")).toHaveTextContent("Ninguém tem nada por tratar.");
    expect(within(screen.getByTestId("rhd-fila-pessoas")).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByTestId("rhd-contador-fila")).not.toBeInTheDocument();
  });

  it("uma justificação já decidida não aparece na fila nem no contador", async () => {
    semearJustificacao({ id: "jd-ines", pessoaId: "p-ines", data: "2026-10-07", estado: "recusada", motivoRecusa: "Sem comprovativo" });
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    await screen.findByTestId("rhd-fila-vazia");
    expect(screen.queryByTestId("rhd-contador-fila")).not.toBeInTheDocument();
  });

  it("com as RPCs por aplicar a fila di-lo em vez de partir ou de dizer «ninguém tem nada por tratar»", async () => {
    baseFalsa.indisponivel = true;
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    expect(await screen.findByTestId("rhd-fila-aviso-justificacoes")).toHaveTextContent("Ainda não é possível ler as justificações");
    expect(screen.queryByTestId("rhd-fila-vazia")).not.toBeInTheDocument();
  });

  it("o texto de uma consulta médica nunca aparece na fila: diz «Texto reservado»", async () => {
    semearJustificacao({ id: "jd-saude", pessoaId: "p-ines", data: "2026-10-07", tipo: "consulta_medica", motivo: "Tratamento oncológico" });
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    fireEvent.click(within(await screen.findByTestId("rhd-fila-pessoas")).getByRole("button", { name: /^Inês Cardoso/ }));
    const painel = await screen.findByTestId("painel-fila-pessoa");
    expect(within(painel).getByText(/^Texto reservado/)).toBeInTheDocument();
    expect(painel).not.toHaveTextContent("oncológico");
    expect(screen.getByTestId("rhd-fila-pessoas")).not.toHaveTextContent("oncológico");
  });

  it("uma justificação da própria pessoa que vê fica com os botões desactivados e o motivo escrito", async () => {
    quemVe.pessoaId = "p-ines";
    semearJustificacao({ id: "jd-ines", pessoaId: "p-ines", data: "2026-10-07" });
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    fireEvent.click(within(await screen.findByTestId("rhd-fila-pessoas")).getByRole("button", { name: /^Inês Cardoso/ }));
    const item = await screen.findByTestId("item-fila-justificacao-jd-ines");
    const aceitar = within(item).getByRole("button", { name: /Aceitar a justificação de Inês Cardoso/ });
    expect(aceitar).toHaveAttribute("aria-disabled", "true");
    expect(within(item).getByRole("button", { name: /Recusar a justificação de Inês Cardoso/ })).toHaveAttribute("aria-disabled", "true");
    expect(within(item).getByTestId("item-fila-justificacao-jd-ines-porque")).toHaveTextContent("É uma justificação tua");
    expect(aceitar).toHaveAccessibleDescription(/É uma justificação tua/);
  });
});
