// PhoneInput: sem a prop `labels` fica como no CRM (textos do t() do CRM); com `labels` o portal dá os textos
// no idioma dele, e o rótulo fica ligado ao campo do telefone.
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
  const gatilho = screen.getByRole("combobox");
  await act(async () => {
    fireEvent.keyDown(gatilho, { key: "Enter" });
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
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-label");
    expect(screen.getByText("CRM:common.fullNumber: +351 912 345 678")).toBeInTheDocument();
    await abrirLista();
    expect(screen.getByPlaceholderText("CRM:common.searchCountry")).toBeInTheDocument();
    expect(screen.getAllByText("CRM:countries.Portugal").length).toBeGreaterThan(0);
  });

  it("o rótulo fica ligado ao campo do telefone", () => {
    render(<PhoneInput {...base} />);
    const campo = screen.getByLabelText("Telefone");
    expect(campo).toHaveAttribute("type", "tel");
  });

  it("duas instâncias na mesma página têm ids diferentes", () => {
    render(
      <>
        <PhoneInput {...base} label="Telefone A" />
        <PhoneInput {...base} label="Telefone B" />
      </>,
    );
    expect(screen.getByLabelText("Telefone A").id).not.toBe(screen.getByLabelText("Telefone B").id);
  });

  it("só aceita números e espaços", () => {
    const onPhoneChange = vi.fn();
    render(<PhoneInput {...base} onPhoneChange={onPhoneChange} />);
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "91a2-3" } });
    expect(onPhoneChange).toHaveBeenCalledWith("9123");
  });
});

describe("PhoneInput com labels (portal)", () => {
  it("o indicativo e a caixa de pesquisa têm nome acessível e a nota usa o texto do portal", async () => {
    render(<PhoneInput {...base} labels={LABELS} />);
    expect(screen.getByRole("combobox", { name: "Country code" })).toBeInTheDocument();
    expect(screen.getByText("Full number: +351 912 345 678")).toBeInTheDocument();
    await abrirLista();
    const pesquisa = screen.getByPlaceholderText("Search country...");
    expect(pesquisa).toHaveAttribute("aria-label", "Search country...");
    expect(screen.getAllByText("EN-Portugal").length).toBeGreaterThan(0);
    expect(screen.queryByText(/CRM:/)).toBeNull();
  });

  it("sem rótulo visível, o campo do telefone usa labels.telefone como nome", () => {
    render(<PhoneInput {...base} label={undefined} labels={LABELS} />);
    expect(screen.getByRole("textbox", { name: "Phone number" })).toHaveAttribute("type", "tel");
  });

  it("sem nomesDosPaises os países ficam com o t() do CRM", async () => {
    const { nomesDosPaises: _ignorado, ...semNomes } = LABELS;
    void _ignorado;
    render(<PhoneInput {...base} labels={semNomes} />);
    await abrirLista();
    expect(screen.getAllByText("CRM:countries.Portugal").length).toBeGreaterThan(0);
  });
});
