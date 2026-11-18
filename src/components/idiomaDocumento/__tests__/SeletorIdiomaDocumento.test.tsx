import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SeletorIdiomaDocumento } from "../SeletorIdiomaDocumento";

function montar(ui: React.ReactElement, lingua: "pt" | "en" = "pt") {
  localStorage.setItem("language", lingua);
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

/** Controlado, como será usado pelos ecrãs de gerar. */
function Controlado({ disponiveis, inicial, onChange }: { disponiveis: string[]; inicial: string[]; onChange?: (v: string[]) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <SeletorIdiomaDocumento
      disponiveis={disponiveis}
      valor={valor}
      onChange={(v) => {
        onChange?.(v);
        setValor(v);
      }}
    />
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("SeletorIdiomaDocumento", () => {
  describe("um só idioma", () => {
    it("não renderiza nada", () => {
      const { container } = montar(<SeletorIdiomaDocumento disponiveis={["pt"]} valor={["pt"]} onChange={() => {}} />);
      expect(container.querySelector("[role]")).toBeNull();
      expect(screen.queryByRole("radiogroup")).toBeNull();
      expect(screen.queryByRole("group")).toBeNull();
      expect(container.textContent).toBe("");
    });

    it("também não renderiza nada com a lista vazia ou só com códigos desconhecidos", () => {
      const a = montar(<SeletorIdiomaDocumento disponiveis={[]} valor={["pt"]} onChange={() => {}} />);
      expect(a.container.textContent).toBe("");
      cleanup();
      const b = montar(<SeletorIdiomaDocumento disponiveis={["xx", "pt"]} valor={["pt"]} onChange={() => {}} />);
      expect(b.container.textContent).toBe("");
    });
  });

  describe("dois idiomas: controlo segmentado", () => {
    it("mostra [Português][English][Português + English] num radiogroup com nome acessível", () => {
      montar(<SeletorIdiomaDocumento disponiveis={["pt", "en"]} valor={["pt"]} onChange={() => {}} />);
      const grupo = screen.getByRole("radiogroup", { name: "Idioma do documento" });
      expect(grupo).toBeInTheDocument();
      const radios = screen.getAllByRole("radio");
      expect(radios.map((r) => r.textContent)).toEqual(["Português", "English", "Português + English"]);
    });

    it("o nome acessível segue a língua do CRM", () => {
      montar(<SeletorIdiomaDocumento disponiveis={["pt", "en"]} valor={["pt"]} onChange={() => {}} />, "en");
      expect(screen.getByRole("radiogroup", { name: "Document language" })).toBeInTheDocument();
    });

    it("ordena pelo registo mesmo que `disponiveis` venha trocado", () => {
      montar(<SeletorIdiomaDocumento disponiveis={["en", "pt"]} valor={["pt"]} onChange={() => {}} />);
      expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Português", "English", "Português + English"]);
    });

    it("marca só a opção que corresponde ao valor (aria-checked) e só ela entra na ordem do Tab", () => {
      montar(<SeletorIdiomaDocumento disponiveis={["pt", "en"]} valor={["pt", "en"]} onChange={() => {}} />);
      const [pt, en, ambos] = screen.getAllByRole("radio");
      expect(pt).toHaveAttribute("aria-checked", "false");
      expect(en).toHaveAttribute("aria-checked", "false");
      expect(ambos).toHaveAttribute("aria-checked", "true");
      expect(ambos).toHaveAttribute("tabindex", "0");
      expect(pt).toHaveAttribute("tabindex", "-1");
      expect(en).toHaveAttribute("tabindex", "-1");
    });

    it("um valor fora do disponível cai na primeira opção, sem chamar onChange", () => {
      const onChange = vi.fn();
      montar(<SeletorIdiomaDocumento disponiveis={["pt", "en"]} valor={["fr"]} onChange={onChange} />);
      expect(screen.getAllByRole("radio")[0]).toHaveAttribute("aria-checked", "true");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("clicar devolve sempre um array ordenado pelo registo", () => {
      const onChange = vi.fn();
      montar(<SeletorIdiomaDocumento disponiveis={["pt", "en"]} valor={["pt"]} onChange={onChange} />);
      fireEvent.click(screen.getByRole("radio", { name: "English" }));
      expect(onChange).toHaveBeenLastCalledWith(["en"]);
      fireEvent.click(screen.getByRole("radio", { name: "Português + English" }));
      expect(onChange).toHaveBeenLastCalledWith(["pt", "en"]);
    });

    it("clicar na opção já escolhida não volta a chamar onChange", () => {
      const onChange = vi.fn();
      montar(<SeletorIdiomaDocumento disponiveis={["pt", "en"]} valor={["pt"]} onChange={onChange} />);
      fireEvent.click(screen.getByRole("radio", { name: "Português" }));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("as setas movem a escolha (com volta ao princípio e ao fim) e Home/End saltam", () => {
      const onChange = vi.fn();
      montar(<Controlado disponiveis={["pt", "en"]} inicial={["pt"]} onChange={onChange} />);
      const radios = () => screen.getAllByRole("radio");

      fireEvent.keyDown(radios()[0], { key: "ArrowRight" });
      expect(onChange).toHaveBeenLastCalledWith(["en"]);
      expect(radios()[1]).toHaveAttribute("aria-checked", "true");
      expect(document.activeElement).toBe(radios()[1]);

      fireEvent.keyDown(radios()[1], { key: "ArrowDown" });
      expect(onChange).toHaveBeenLastCalledWith(["pt", "en"]);

      fireEvent.keyDown(radios()[2], { key: "ArrowRight" });
      expect(onChange).toHaveBeenLastCalledWith(["pt"]);

      fireEvent.keyDown(radios()[0], { key: "ArrowLeft" });
      expect(onChange).toHaveBeenLastCalledWith(["pt", "en"]);

      fireEvent.keyDown(radios()[2], { key: "Home" });
      expect(onChange).toHaveBeenLastCalledWith(["pt"]);
      fireEvent.keyDown(radios()[0], { key: "End" });
      expect(onChange).toHaveBeenLastCalledWith(["pt", "en"]);
    });

    it("cada opção tem um alvo de pelo menos 44px (min-h-11)", () => {
      montar(<SeletorIdiomaDocumento disponiveis={["pt", "en"]} valor={["pt"]} onChange={() => {}} />);
      for (const r of screen.getAllByRole("radio")) expect(r.className).toContain("min-h-11");
    });
  });

  describe("três ou mais idiomas: caixas de seleção", () => {
    const TRES = ["pt", "en", "es"];

    it("mostra um grupo com uma caixa por idioma, ordenadas pelo registo", () => {
      montar(<SeletorIdiomaDocumento disponiveis={["es", "pt", "en"]} valor={["pt"]} onChange={() => {}} />);
      expect(screen.getByRole("group", { name: "Idioma do documento" })).toBeInTheDocument();
      expect(screen.queryByRole("radiogroup")).toBeNull();
      const caixas = screen.getAllByRole("checkbox");
      expect(caixas.map((c) => c.getAttribute("aria-label") ?? c.parentElement?.textContent)).toEqual(["Português", "English", "Español"]);
      expect(caixas[0]).toHaveAttribute("aria-checked", "true");
      expect(caixas[1]).toHaveAttribute("aria-checked", "false");
    });

    it("marcar e desmarcar devolve arrays ordenados pelo registo", () => {
      const onChange = vi.fn();
      montar(<Controlado disponiveis={TRES} inicial={["es"]} onChange={onChange} />);
      fireEvent.click(screen.getByRole("checkbox", { name: "Português" }));
      expect(onChange).toHaveBeenLastCalledWith(["pt", "es"]);
      fireEvent.click(screen.getByRole("checkbox", { name: "English" }));
      expect(onChange).toHaveBeenLastCalledWith(["pt", "en", "es"]);
      fireEvent.click(screen.getByRole("checkbox", { name: "Português" }));
      expect(onChange).toHaveBeenLastCalledWith(["en", "es"]);
    });

    it("nunca deixa desmarcar o último idioma: a caixa fica desativada e onChange não corre", () => {
      const onChange = vi.fn();
      montar(<SeletorIdiomaDocumento disponiveis={TRES} valor={["en"]} onChange={onChange} />);
      const unica = screen.getByRole("checkbox", { name: "English" });
      expect(unica).toBeDisabled();
      fireEvent.click(unica);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("um valor vazio ou desconhecido mostra o primeiro idioma marcado", () => {
      montar(<SeletorIdiomaDocumento disponiveis={TRES} valor={[]} onChange={() => {}} />);
      expect(screen.getByRole("checkbox", { name: "Português" })).toHaveAttribute("aria-checked", "true");
    });
  });
});
