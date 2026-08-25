import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useSentinelInView } from "../useSentinelInView";

/**
 * Regressao: em producao a sentinela do scroll infinito de /proposals disparava
 * em cadeia no primeiro paint -- 21 chamadas seguidas a get_proposals_list_page,
 * 522 linhas na tabela em vez de 25, payload de 1,57 MB a subir para 3,45 MB.
 * A causa era decidir pela geometria de um antepassado que nunca rolava. Estes
 * testes fixam o contrato do substituto: so pede mais quando o browser diz que
 * a sentinela esta MESMO visivel, e para assim que deixa de estar.
 */

type Cb = (entries: Array<{ isIntersecting: boolean }>) => void;

let observers: Array<{ cb: Cb; disconnected: boolean }> = [];

class FakeIntersectionObserver {
  private entry: { cb: Cb; disconnected: boolean };
  constructor(cb: Cb) {
    this.entry = { cb, disconnected: false };
    observers.push(this.entry);
  }
  observe() { /* a visibilidade e simulada por emit() */ }
  disconnect() { this.entry.disconnected = true; }
  unobserve() { /* noop */ }
}

const live = () => observers.filter(o => !o.disconnected);
const emit = (isIntersecting: boolean) => {
  act(() => { live().forEach(o => o.cb([{ isIntersecting }])); });
};

function Harness(props: { onVisible: () => void; enabled: boolean; isLoading: boolean }) {
  const { sentinelRef } = useSentinelInView(props);
  return <div ref={sentinelRef} data-testid="sentinela" />;
}

describe("useSentinelInView", () => {
  beforeEach(() => {
    observers = [];
    (globalThis as any).IntersectionObserver = FakeIntersectionObserver;
  });

  it("nao pede nada enquanto a sentinela nao estiver visivel", () => {
    const onVisible = vi.fn();
    render(<Harness onVisible={onVisible} enabled isLoading={false} />);
    emit(false);
    expect(onVisible).not.toHaveBeenCalled();
  });

  it("pede uma pagina quando a sentinela fica visivel", () => {
    const onVisible = vi.fn();
    render(<Harness onVisible={onVisible} enabled isLoading={false} />);
    emit(true);
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it("nao volta a pedir enquanto o carregamento anterior nao terminar", () => {
    const onVisible = vi.fn();
    const { rerender } = render(<Harness onVisible={onVisible} enabled isLoading={false} />);
    emit(true);
    expect(onVisible).toHaveBeenCalledTimes(1);

    // Carregamento em curso: o observador e desligado.
    rerender(<Harness onVisible={onVisible} enabled isLoading />);
    expect(live()).toHaveLength(0);
    emit(true);
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it("para de pedir assim que a sentinela deixa de estar visivel — sem cadeia", () => {
    const onVisible = vi.fn();
    const { rerender } = render(<Harness onVisible={onVisible} enabled isLoading={false} />);

    // Simula 5 vagas: cada uma carrega e, a seguir, a sentinela fica tapada
    // pelas linhas novas. E este o caso real da primeira pagina de 25 linhas.
    for (let i = 0; i < 5; i++) {
      rerender(<Harness onVisible={onVisible} enabled isLoading />);
      rerender(<Harness onVisible={onVisible} enabled isLoading={false} />);
      emit(false);
    }
    expect(onVisible).not.toHaveBeenCalled();
  });

  it("nao observa nada quando ja nao ha mais paginas", () => {
    const onVisible = vi.fn();
    render(<Harness onVisible={onVisible} enabled={false} isLoading={false} />);
    expect(live()).toHaveLength(0);
    emit(true);
    expect(onVisible).not.toHaveBeenCalled();
  });
});
