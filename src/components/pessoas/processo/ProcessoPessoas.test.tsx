// Os passos da PESSOA em abordagem no ProcessoProvider: marcar a visita (o diálogo da página) escreve a visita na pessoa, e o botão «Marcar visita» das
// submissões deixa de aparecer a quem já tem uma visita por ligar. Não há pedidos nem escolha de pedido.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { contactoBase, registosBase } from "../fabricaTestes";
import { useMarcarVisita } from "../marcarVisitaContexto";
import { Gatilho, comVisitas, itemDe, renderizar, visita } from "./arnesProcesso";

vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); reporRegistos(); });

describe("marcar a visita a partir do «A fazer»", () => {
  const contactada = () => itemDe(registosBase({ contactos: [contactoBase()] }));

  it("abre o diálogo da pessoa (sem falar de pedidos) e marca a visita na pessoa, com o dia, a hora e a morada escolhidos", async () => {
    const { r, item } = contactada();
    expect(item).toMatchObject({ id: "pessoa-a", fase: "contactado" });
    const { a } = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
    expect(dialogo).toHaveAccessibleDescription(/^Visita para a\./);
    expect(dialogo).not.toHaveTextContent(/pedido/i);
    fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-30" } });
    fireEvent.change(within(dialogo).getByLabelText("Hora (opcional)"), { target: { value: "10:30" } });
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua B 2" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
    expect(a.marcarVisita).toHaveBeenCalledTimes(1);
    const [pessoaId, dados] = (a.marcarVisita as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pessoaId).toBe("a");
    expect(dados).toMatchObject({ data: "2026-10-30", hora: "10:30", destino: { igualALead: false, outra: { rua: "Rua B 2" } } });
    expect(dados).not.toHaveProperty("pedidoId");
    expect(dados).not.toHaveProperty("servico");
  });

  it("depois de o diálogo fechar, o aviso diz que a visita ficou marcada", async () => {
    const { r, item } = contactada();
    const { aoAnunciar } = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
    fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-30" } });
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua B 2" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(aoAnunciar.mock.calls[0][0]).toMatch(/^Visita marcada: a passa a /);
  });

  it("um dia em falta não marca a visita e o diálogo fica aberto", async () => {
    const { r, item } = contactada();
    const { a } = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
    expect(a.marcarVisita).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Marcar visita" })).toBe(dialogo);
  });
});

describe("o botão «Marcar visita» das submissões", () => {
  function Botao({ pessoaId }: { pessoaId: string }) {
    const marcar = useMarcarVisita();
    return <p data-testid="estado">{marcar?.marcadas.has(pessoaId) ? "já tem visita" : "sem visita"}</p>;
  }

  it("deixa de se mostrar a quem já tem uma visita por ligar nos registos", () => {
    const { r } = itemDe(comVisitas([visita()]));
    renderizar(r, <Botao pessoaId="a" />);
    expect(screen.getByTestId("estado")).toHaveTextContent("já tem visita");
  });

  it("mostra-se a quem só tem visitas canceladas, ou nenhuma", () => {
    const { r } = itemDe(comVisitas([visita({ estado: "cancelada" })]));
    renderizar(r, <Botao pessoaId="a" />);
    expect(screen.getByTestId("estado")).toHaveTextContent("sem visita");
  });
});
