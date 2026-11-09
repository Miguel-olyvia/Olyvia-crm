// «Contagem das horas extra»: o interruptor «só contam depois de confirmadas, a partir de [data]». Ligar, alterar e desligar com
// confirmação e o aviso das folhas fechadas; só leitura sem `hr.assiduidade.gerir`; «ainda não disponível» sem a RPC. Base simulada.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissoes: {} as Record<string, boolean>, aCarregarPermissoes: false, toastSucesso: vi.fn() }));
vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", async () => (await import("@/test/horasExtraFalso")).wrapperFalso());
// As permissões lêem-se a cada render (cada teste muda `m.permissoes`): view e gerir ligadas, salvo o que o teste desliga.
vi.mock("@/components/rh-exemplo/hooks/usePermissoesAssiduidade", () => ({
  usePermissoesAssiduidade: () => ({ permissoes: { view: true, gerir: true, ...m.permissoes }, loading: m.aCarregarPermissoes }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => m.toastSucesso(...a), error: vi.fn() } }));

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { baseFalsa, reporBaseFalsa } from "@/test/horasExtraFalso";
import { rhExemploHorasExtraRealTranslations } from "@/translations/rhExemploHorasExtraReal";
import { ContagemHorasExtraAprovadas } from "./ContagemHorasExtraAprovadas";

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
  reporBaseFalsa();
  m.permissoes = {};
  m.aCarregarPermissoes = false;
  m.toastSucesso.mockClear();
});
afterEach(cleanup);

const abrir = () => render(<LanguageProvider><ContagemHorasExtraAprovadas /></LanguageProvider>);
const data = () => screen.getByLabelText("A partir de") as HTMLInputElement;
const confirmacao = () => screen.getByRole("alertdialog");

describe("traduções da contagem", () => {
  it("en e pt têm as mesmas chaves, e as da contagem existem nas duas", () => {
    const { en, pt } = rhExemploHorasExtraRealTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    expect(Object.keys(pt).filter((k) => k.startsWith("rhHeReal.contagem.")).length).toBeGreaterThan(20);
  });
});

describe("contagem das horas extra aprovadas", () => {
  it("desligada: mostra o estado, explica o que muda e oferece só «Ligar»", () => {
    abrir();
    expect(screen.getByTestId("he-contagem-estado")).toHaveTextContent("Desligada: as horas extra contam como até agora.");
    expect(screen.getByText(/excesso por aprovar aparece como pendente e não é pago/)).toBeInTheDocument();
    expect(screen.getByText(/fecho da folha só avança quando as horas extra pendentes estiverem todas decididas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ligar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Desligar" })).toBeNull();
  });

  it("ligar pede confirmação (com o aviso das folhas fechadas) e só grava ao confirmar", async () => {
    abrir();
    fireEvent.change(data(), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    expect(baseFalsa.contagemGuardada).toEqual([]);
    const c = within(confirmacao());
    expect(c.getByText(/A partir de 01\/12\/2026/)).toBeInTheDocument();
    expect(c.getByTestId("he-contagem-aviso-folhas")).toHaveTextContent(/já não se pode desligar, adiar nem antecipar/);
    fireEvent.click(c.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(baseFalsa.contagemGuardada).toEqual(["2026-12-01"]));
    await waitFor(() => expect(screen.getByTestId("he-contagem-estado")).toHaveTextContent("Ligada: a partir de 01/12/2026"));
    expect(m.toastSucesso).toHaveBeenCalledTimes(1);
    // o foco vai para o estado novo (o botão que abriu o diálogo já não existe)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("he-contagem-estado")));
  });

  it("cancelar não grava nada", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    fireEvent.click(within(confirmacao()).getByRole("button", { name: "Cancelar" }));
    expect(baseFalsa.contagemGuardada).toEqual([]);
  });

  it("ligada: «Alterar» só se activa com uma data diferente e «Desligar» grava null", async () => {
    baseFalsa.contagem = { aprovacaoDesde: "2026-11-01", folhasFechadasDesde: null, temConfig: true };
    abrir();
    expect(screen.getByRole("button", { name: "Alterar" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(data(), { target: { value: "2026-12-15" } });
    expect(screen.getByRole("button", { name: "Alterar" })).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getByRole("button", { name: "Desligar" }));
    expect(within(confirmacao()).getByText(/Todas as horas extra voltam a contar logo/)).toBeInTheDocument();
    // desligar não leva o aviso das folhas (não se aplica)
    expect(within(confirmacao()).queryByTestId("he-contagem-aviso-folhas")).toBeNull();
    fireEvent.click(within(confirmacao()).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(baseFalsa.contagemGuardada).toEqual([null]));
    await waitFor(() => expect(screen.getByTestId("he-contagem-estado")).toHaveTextContent("Desligada"));
  });

  it("com folhas fechadas e a contagem ligada: diz desde quando, e Alterar e Desligar ficam aria-disabled com a razão em texto", () => {
    baseFalsa.contagem = { aprovacaoDesde: "2026-09-01", folhasFechadasDesde: "2026-09-01", ultimaFolhaFechadaAte: "2026-09-30", temConfig: true };
    abrir();
    expect(screen.getByTestId("he-contagem-folhas")).toHaveTextContent("Há folhas fechadas desde 01/09/2026");
    const desligar = screen.getByRole("button", { name: "Desligar" });
    expect(desligar).toHaveAttribute("aria-disabled", "true");
    expect(desligar).not.toBeDisabled();
    expect(desligar).toHaveAccessibleDescription(/não se pode desligar, adiar nem antecipar/);
    fireEvent.change(data(), { target: { value: "2026-12-15" } });
    expect(screen.getByRole("button", { name: "Alterar" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(desligar);
    fireEvent.click(screen.getByRole("button", { name: "Alterar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(baseFalsa.contagemGuardada).toEqual([]);
  });

  it("desligada com uma folha já fechada: avisa, e ligar exige uma data posterior ao fim dela", () => {
    baseFalsa.contagem = { aprovacaoDesde: null, folhasFechadasDesde: "2026-09-01", ultimaFolhaFechadaAte: "2026-11-30", temConfig: true };
    abrir();
    expect(screen.getByTestId("he-contagem-ultima-folha")).toHaveTextContent("A última folha fechada termina em 30/11/2026");
    fireEvent.change(data(), { target: { value: "2026-11-30" } });
    expect(screen.getByRole("button", { name: "Ligar" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha uma data posterior a 30/11/2026");
    fireEvent.change(data(), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    expect(within(confirmacao()).getByTestId("he-contagem-aviso-ultima")).toHaveTextContent("30/11/2026");
  });

  it("a base ainda sem ultima_folha_fechada_ate (chave ausente): o ecrã tolera-o", () => {
    baseFalsa.contagem = { aprovacaoDesde: null, folhasFechadasDesde: null, temConfig: true };
    abrir();
    expect(screen.queryByTestId("he-contagem-ultima-folha")).toBeNull();
    expect(screen.getByRole("button", { name: "Ligar" })).not.toHaveAttribute("aria-disabled");
  });

  it("a base recusa (por exemplo uma folha fechada entretanto): mostra o motivo traduzido e o estado não muda", async () => {
    baseFalsa.contagem = { aprovacaoDesde: "2026-09-01", folhasFechadasDesde: null, temConfig: true };
    baseFalsa.erroDeEscrita = "Há uma folha fechada.";
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desligar" }));
    fireEvent.click(within(confirmacao()).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByTestId("he-contagem-erro")).toHaveTextContent("Há uma folha fechada."));
    expect(screen.getByTestId("he-contagem-estado")).toHaveTextContent("Ligada");
    expect(m.toastSucesso).not.toHaveBeenCalled();
  });

  it("enquanto as permissões carregam diz «a carregar», não «sem permissão»", () => {
    m.aCarregarPermissoes = true;
    m.permissoes = { view: false, gerir: false };
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent("A carregar");
    expect(screen.queryByTestId("he-contagem-sem-ver")).toBeNull();
  });
  it("data fora do que a base aceita: avisa, liga o campo ao erro e não deixa ligar", () => {
    abrir();
    fireEvent.change(data(), { target: { value: "1999-01-01" } });
    expect(screen.getByRole("button", { name: "Ligar" })).toHaveAttribute("aria-disabled", "true");
    expect(data()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/Escolha uma data entre/);
  });

  it("sem hr.assiduidade.gerir vê o estado mas não altera", () => {
    m.permissoes = { gerir: false };
    baseFalsa.contagem = { aprovacaoDesde: "2026-11-01", folhasFechadasDesde: null, temConfig: true };
    abrir();
    expect(screen.getByTestId("he-contagem-estado")).toHaveTextContent("Ligada: a partir de 01/11/2026");
    expect(screen.getByText(/Só quem pode gerir a assiduidade altera esta definição/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alterar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desligar" })).toBeNull();
    expect(screen.queryByLabelText("A partir de")).toBeNull();
  });

  it("sem hr.assiduidade.view não mostra o estado", () => {
    m.permissoes = { view: false, gerir: false };
    abrir();
    expect(screen.getByTestId("he-contagem-sem-ver")).toBeInTheDocument();
    expect(screen.queryByTestId("he-contagem-estado")).toBeNull();
  });

  it("RPC ainda não existe: «ainda não disponível», sem controlos", () => {
    baseFalsa.contagemIndisponivel = true;
    abrir();
    expect(screen.getByTestId("he-contagem-indisponivel")).toHaveTextContent("Esta definição ainda não está disponível.");
    expect(screen.queryByRole("button", { name: "Ligar" })).toBeNull();
  });

  it("em inglês", () => {
    window.localStorage.setItem("language", "en");
    abrir();
    expect(screen.getByTestId("he-contagem-estado")).toHaveTextContent("Off: overtime counts as it does today.");
    expect(screen.getByRole("button", { name: "Turn on" })).toBeInTheDocument();
  });
});