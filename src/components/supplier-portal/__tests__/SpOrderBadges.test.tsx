// As etiquetas de estado da encomenda mudam de língua com o idioma do portal; os códigos da base não.
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";
import { SpOrderBadges } from "../SpOrderBadges";

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
});

describe("SpOrderBadges", () => {
  it("em português: Nova e Parcialmente recebida", () => {
    render(<SpOrderBadges orderStatus="partially_received" publicationStatus="sent" />);
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.getByText("Parcialmente recebida")).toBeInTheDocument();
  });

  it("em inglês: New e Partially received, e muda ao vivo", () => {
    render(<SpOrderBadges orderStatus="partially_received" publicationStatus="sent" />);
    act(() => definirIdioma("en"));
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Partially received")).toBeInTheDocument();
  });

  it.each([
    ["confirmed", "cancelled", "Confirmed", "Cancelled"],
    ["viewed", "received", "Viewed", "Received"],
  ] as const)("inglês: %s + %s", (pub, po, rotuloPub, rotuloPo) => {
    definirIdioma("en");
    render(<SpOrderBadges orderStatus={po} publicationStatus={pub} />);
    expect(screen.getByText(rotuloPub)).toBeInTheDocument();
    expect(screen.getByText(rotuloPo)).toBeInTheDocument();
  });

  it("uma encomenda só 'ordered' mostra apenas a resposta do fornecedor", () => {
    definirIdioma("en");
    const { container } = render(<SpOrderBadges orderStatus="ordered" publicationStatus="confirmed" />);
    expect(container.firstElementChild?.children).toHaveLength(1);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });
});
