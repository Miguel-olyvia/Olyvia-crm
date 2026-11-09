// 9/11 (Rúben): na visita, tirar fotografias no telemóvel. A câmara (capture) e a galeria; a fotografia fica guardada e apaga-se.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useReducer } from "react";
import { acoes, seed, type EtapaFotos, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

const rpc = vi.fn();
let org: string | null = null;
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("./acessosPortal", () => ({ orgDoModoReal: () => org }));
vi.mock("./real/conversaReal", () => ({ fotoParaEnvio: vi.fn(async () => ({ mime: "image/jpeg", b64: "QUFB" })) }));

const { FotosEtapa } = await import("./FotosEtapa");

function desenhar(etapa: EtapaFotos = "area") {
  const S = seed();
  const d = S.deals.find((x) => x.fase === 2 && !x.visita.fechada)! as Negocio;
  d.visita.fotos = 0; d.visita.fotosPor = { exterior: 0, interior: 0, area: 0 };
  let redesenhar = () => {};
  const run = (fn: () => void) => { fn(); redesenhar(); };
  const A = acoes(S, () => {}, run);
  function Ecra() {
    const [, f] = useReducer((x: number) => x + 1, 0);
    redesenhar = f;
    return <FotosEtapa ctx={{ S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx} d={d} etapa={etapa} />;
  }
  render(<Ecra />);
  return { d };
}
const ficheiro = () => new File([new Uint8Array(200)], "foto.jpg", { type: "image/jpeg" });

describe("fotografias da visita no telemóvel", () => {
  beforeEach(() => { rpc.mockReset(); org = null; });

  it("«Tirar fotografia» usa a câmara de trás; «Da galeria» escolhe sem câmara", () => {
    desenhar();
    const cam = screen.getByLabelText(/^Tirar fotografia:/) as HTMLInputElement;
    const gal = screen.getByLabelText(/^Escolher da galeria:/) as HTMLInputElement;
    expect(cam.getAttribute("capture")).toBe("environment");
    expect(cam.accept).toBe("image/*");
    expect(gal.hasAttribute("capture")).toBe(false);
    expect(screen.getByRole("button", { name: /Tirar fotografia/ })).toBeEnabled();
  });

  it("no protótipo a fotografia aparece, conta, vê-se em grande e apaga-se", async () => {
    const { d } = desenhar("interior");
    fireEvent.change(screen.getByLabelText(/^Tirar fotografia:/), { target: { files: [ficheiro()] } });
    const img = await screen.findByAltText("Fotografia 1");
    expect(img).toHaveAttribute("src", "data:image/jpeg;base64,QUFB");
    expect(d.visita.fotos).toBe(1);
    expect(screen.getByText("1 fotografia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tirar outra" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver a fotografia 1 em grande" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Apagar a fotografia 1" }));
    await waitFor(() => expect(screen.queryByAltText("Fotografia 1")).not.toBeInTheDocument());
    expect(d.visita.fotos).toBe(0);
  });

  it("com a base ligada grava em negocio_visita_fotos e só então conta; apagar apaga na base", async () => {
    org = "org-1";
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "neg_visita_fotos_ler") return { data: [], error: null };
      if (fn === "neg_visita_foto_juntar") return { data: { id: "f-1", etapa: "area", em: "2026-11-09T10:00:00Z" }, error: null };
      if (fn === "neg_visita_foto_apagar") return { data: true, error: null };
      return { data: null, error: { message: "inesperado " + fn } };
    });
    const { d } = desenhar("area");
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("neg_visita_fotos_ler", { p_organization_id: "org-1", p_numero: d.id }));
    fireEvent.change(screen.getByLabelText(/^Tirar fotografia:/), { target: { files: [ficheiro()] } });
    const img = await screen.findByAltText("Fotografia 1");
    expect(img).toHaveAttribute("src", "data:image/jpeg;base64,QUFB");
    expect(rpc).toHaveBeenCalledWith("neg_visita_foto_juntar", { p_organization_id: "org-1", p_numero: d.id, p_etapa: "area", p_foto: { mime: "image/jpeg", b64: "QUFB" } });
    expect(d.visita.fotos).toBe(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Apagar a fotografia 1" })); });
    await waitFor(() => expect(screen.queryByAltText("Fotografia 1")).not.toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith("neg_visita_foto_apagar", { p_organization_id: "org-1", p_foto_id: "f-1" });
    expect(d.visita.fotos).toBe(0);
  });

  it("se a base recusa, não conta e diz porquê", async () => {
    org = "org-2";
    rpc.mockImplementation(async (fn: string) => fn === "neg_visita_fotos_ler" ? { data: [], error: null }
      : { data: null, error: { message: "Could not find the function public.neg_visita_foto_juntar in the schema cache" } });
    const { d } = desenhar("area");
    fireEvent.change(screen.getByLabelText(/^Tirar fotografia:/), { target: { files: [ficheiro()] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("falta aplicar o SQL 20270110400000");
    expect(d.visita.fotos).toBe(0);
  });
});
