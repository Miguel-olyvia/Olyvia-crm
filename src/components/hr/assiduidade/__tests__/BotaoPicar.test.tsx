/**
 * A picagem passou a exigir localizacao: recusa, sem sinal/timeout e API
 * indisponivel bloqueiam todos da mesma forma (nenhum chama `onPicar`), e so
 * uma leitura "ok" do `navigator.geolocation` deixa a picagem seguir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string) => chave,
    language: "pt-PT",
  }),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: toastMock }));

import { BotaoPicar } from "@/components/hr/assiduidade/BotaoPicar";

// O Select (Radix) precisa destas duas APIs, que o jsdom nao implementa.
beforeEach(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  delete (navigator as unknown as { geolocation?: unknown }).geolocation;
});

function propsBase(onPicar = vi.fn().mockResolvedValue(null)) {
  return {
    picagensDeHoje: [],
    planeadoDeHoje: [],
    locais: [],
    podePicar: true,
    aGravar: false,
    onPicar,
  };
}

/** Simula `navigator.geolocation.getCurrentPosition` com o resultado dado. */
function mockGeolocation(
  resultado:
    | { tipo: "sucesso"; coords: { latitude: number; longitude: number; accuracy: number } }
    | { tipo: "erro"; code: number },
) {
  const getCurrentPosition = vi.fn(
    (
      sucesso: (posicao: { coords: Record<string, number> }) => void,
      erro: (erro: { code: number; PERMISSION_DENIED: number }) => void,
    ) => {
      if (resultado.tipo === "sucesso") {
        sucesso({ coords: resultado.coords });
      } else {
        erro({ code: resultado.code, PERMISSION_DENIED: 1 });
      }
    },
  );
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

describe("BotaoPicar - localizacao exigida", () => {
  it("recusa explicita (PERMISSION_DENIED) nao chama onPicar e anuncia o motivo", async () => {
    mockGeolocation({ tipo: "erro", code: 1 });
    const onPicar = vi.fn().mockResolvedValue(null);
    render(<BotaoPicar {...propsBase(onPicar)} />);

    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "hr.assiduidade.picar.localizacaoRecusada",
      ),
    );
    expect(onPicar).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith("hr.assiduidade.picar.localizacaoRecusada");
  });

  it("sem sinal/timeout (POSITION_UNAVAILABLE) nao chama onPicar", async () => {
    mockGeolocation({ tipo: "erro", code: 2 });
    const onPicar = vi.fn().mockResolvedValue(null);
    render(<BotaoPicar {...propsBase(onPicar)} />);

    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "hr.assiduidade.picar.localizacaoSemSinal",
      ),
    );
    expect(onPicar).not.toHaveBeenCalled();
  });

  it("API de geolocalizacao indisponivel nao chama onPicar", async () => {
    // Sem navigator.geolocation nenhum.
    const onPicar = vi.fn().mockResolvedValue(null);
    render(<BotaoPicar {...propsBase(onPicar)} />);

    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "hr.assiduidade.picar.localizacaoIndisponivel",
      ),
    );
    expect(onPicar).not.toHaveBeenCalled();
  });

  it("sucesso chama onPicar com as coordenadas obtidas", async () => {
    mockGeolocation({
      tipo: "sucesso",
      coords: { latitude: 41.15, longitude: -8.61, accuracy: 12.4 },
    });
    const onPicar = vi.fn().mockResolvedValue(null);
    render(<BotaoPicar {...propsBase(onPicar)} />);

    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() =>
      expect(onPicar).toHaveBeenCalledWith({
        sentido: "entrada",
        localId: null,
        latitude: 41.15,
        longitude: -8.61,
        precisaoMetros: 12,
      }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
