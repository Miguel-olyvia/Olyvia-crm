// PhoneInput: sem a prop `labels` os textos são os do t() do CRM; com `labels` quem usa (o portal) dá os textos no
// idioma dele. O rótulo fica ligado ao campo do telefone nos dois casos.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => `CRM:${chave}` }),
}));

import { PhoneInput } from "./PhoneInput";

const base = {
  label: "Telefone",
  phoneValue: "912 345 678",
  countryCodeValue: "+351",
  onPhoneChange: vi.fn(),
  onCountryCodeChange: vi.fn(),
};

const LABELS = {
  pesquisar: "Search country...",
  numeroCompleto: "Full number",
  indicativo: "Country code",
  telefone: "Phone number",
  nomesDosPaises: (nome: string) => `EN-${nome}`,
};

async function abrirLista() {
  await act(async () => {
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  });
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  document.elementFromPoint = () => null;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

describe("PhoneInput sem labels (CRM)", () => {
  it("usa o t() do CRM e não acrescenta nomes acessíveis ao indicativo", async () => {
    render(<PhoneInput {...base} />);
    expect(screen.getByRole("combobox").getAttribute("aria-label")).toBeNull();
    expect(screen.getByText("CRM:common.fullNumber: +351 912 345 678")).toBeTruthy();
    await abrirLista();
    expect(screen.getByPlaceholderText("CRM:common.searchCountry")).toBeTruthy();
    expect(screen.getByPlaceholderText("CRM:common.searchCountry").getAttribute("aria-label")).toBeNull();
  });

  it("o campo do telefone não leva aria-label quando há rótulo visível", () => {
    render(<PhoneInput {...base} />);
    expect(screen.getByRole("textbox").getAttribute("aria-label")).toBeNull();
  });

  it("o rótulo fica ligado ao campo do telefone (clicar no rótulo dá o foco ao campo)", () => {
    render(<PhoneInput {...base} />);
    expect(screen.getByLabelText("Telefone")).toBe(screen.getByRole("textbox"));
  });

  it("duas instâncias têm ids diferentes", () => {
    render(
      <>
        <PhoneInput {...base} label="Telefone A" />
        <PhoneInput {...base} label="Telefone B" />
      </>,
    );
    expect(screen.getByLabelText("Telefone A").id).not.toBe(screen.getByLabelText("Telefone B").id);
  });

  it("só deixa escrever números e espaços, como sempre", () => {
    const onPhoneChange = vi.fn();
    render(<PhoneInput {...base} onPhoneChange={onPhoneChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "9a1 2-3" } });
    expect(onPhoneChange).toHaveBeenCalledWith("91 23");
  });
});

describe("PhoneInput com labels (portal)", () => {
  it("a nota, a pesquisa e o nome do indicativo vêm dos textos dados", async () => {
    render(<PhoneInput {...base} labels={LABELS} />);
    expect(screen.getByText("Full number: +351 912 345 678")).toBeTruthy();
    expect(screen.getByRole("combobox").getAttribute("aria-label")).toBe("Country code");
    await abrirLista();
    const pesquisa = screen.getByPlaceholderText("Search country...");
    expect(pesquisa.getAttribute("aria-label")).toBe("Search country...");
  });

  it("os nomes dos países vêm de nomesDosPaises e a pesquisa também os encontra", async () => {
    render(<PhoneInput {...base} labels={LABELS} />);
    await abrirLista();
    expect(screen.getAllByText(/^EN-/).length).toBeGreaterThan(1);
    fireEvent.change(screen.getByPlaceholderText("Search country..."), { target: { value: "EN-Portugal" } });
    expect(screen.getAllByText(/^EN-/).map((e) => e.textContent)).toContain("EN-Portugal");
  });

  it("sem rótulo visível, o campo do telefone leva o nome acessível dado", () => {
    render(<PhoneInput {...base} label={undefined} labels={LABELS} />);
    expect(screen.getByRole("textbox").getAttribute("aria-label")).toBe("Phone number");
  });

  it("com rótulo visível, o campo não leva aria-label (o rótulo serve)", () => {
    render(<PhoneInput {...base} labels={LABELS} />);
    expect(screen.getByRole("textbox").getAttribute("aria-label")).toBeNull();
    expect(screen.getByLabelText("Telefone")).toBe(screen.getByRole("textbox"));
  });

  it("sem nomesDosPaises, os países ficam com o t() do CRM", async () => {
    render(<PhoneInput {...base} labels={{ ...LABELS, nomesDosPaises: undefined }} />);
    await abrirLista();
    expect(screen.getAllByText(/^CRM:countries\./).length).toBeGreaterThan(1);
  });
});
