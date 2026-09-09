/**
 * O campo do NISS: mascara, revelacao e esquecimento.
 *
 * Estes tres testes fecham as tres promessas do campo:
 *
 *  1. sem `hr.pessoas.identificacao.reveal` nao ha botao de mostrar -- e o
 *     valor completo nunca e pedido, por isso a RPC nem e chamada;
 *  2. com a permissao, o clique chama a RPC uma vez e mostra o valor;
 *  3. passados 30 segundos o valor desaparece do ecra. Este e o teste que
 *     importa: um NISS que fica visivel indefinidamente num ecra aberto e
 *     exactamente o que a revelacao temporaria existe para evitar.
 *
 * Usa `fireEvent` e nao `user-event`: `@testing-library/user-event` nao e
 * dependencia deste projecto e um teste novo nao e razao para acrescentar uma.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// As traducoes devolvem a propria chave: o teste fica sobre o comportamento e
// nao sobre o texto de uma lingua.
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { PessoaNissField, SEGUNDOS_VISIVEL } from "@/components/hr/PessoaNissField";

const NISS_COMPLETO = "12345678901";

describe("PessoaNissField", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sem permissao de revelar nao mostra o botao nem chama a RPC", () => {
    const onRevelar = vi.fn();
    render(<PessoaNissField ultimos4="8901" podeRevelar={false} onRevelar={onRevelar} />);

    expect(screen.getByText(/8901/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(onRevelar).not.toHaveBeenCalled();
  });

  it("revela o valor completo uma vez, ao clicar", async () => {
    const onRevelar = vi.fn().mockResolvedValue(NISS_COMPLETO);
    render(<PessoaNissField ultimos4="8901" podeRevelar onRevelar={onRevelar} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByText(NISS_COMPLETO)).toBeInTheDocument());
    expect(onRevelar).toHaveBeenCalledTimes(1);
  });

  it("volta a mascarar passados 30 segundos, sem guardar o valor", async () => {
    const onRevelar = vi.fn().mockResolvedValue(NISS_COMPLETO);
    render(<PessoaNissField ultimos4="8901" podeRevelar onRevelar={onRevelar} />);

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(NISS_COMPLETO)).toBeInTheDocument());

    await act(async () => {
      vi.advanceTimersByTime(SEGUNDOS_VISIVEL * 1000 + 100);
    });

    expect(screen.queryByText(NISS_COMPLETO)).not.toBeInTheDocument();
    expect(screen.getByText(/8901/)).toBeInTheDocument();
    // E nada ficou guardado no browser para o proximo ecra apanhar.
    expect(JSON.stringify(window.localStorage)).not.toContain(NISS_COMPLETO);
  });
});
