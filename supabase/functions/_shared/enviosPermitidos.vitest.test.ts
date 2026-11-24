// 24/11: num ambiente de teste com dados reais, ENVIOS_SO_PARA impede emails e SMS às pessoas (enviosPermitidos.ts).
import { describe, expect, it } from "vitest";
import { emailPermitido, lerListaEnvios, separarDestinatarios, telefonePermitido } from "./enviosPermitidos.ts";

describe("ENVIOS_SO_PARA", () => {
  const lista = lerListaEnvios(" Ruben+*@Gmail.com, eu@exemplo.pt, @mudelar.pt, +351 929 220 322 ");

  it("sem a variável (produção) envia-se para todos", () => {
    expect(lerListaEnvios(undefined)).toBeNull();
    expect(lerListaEnvios("  , ")).toBeNull();
    expect(emailPermitido("cliente@gmail.com", null)).toBe(true);
    expect(telefonePermitido("+351912345678", null)).toBe(true);
  });

  it("com a variável, só os emails da lista: exato, com *, ou do domínio", () => {
    expect(emailPermitido("eu@exemplo.pt", lista)).toBe(true);
    expect(emailPermitido("EU@exemplo.pt ", lista)).toBe(true);
    expect(emailPermitido("ruben+manuelcosta@gmail.com", lista)).toBe(true);
    expect(emailPermitido("ruben@gmail.com", lista)).toBe(false); // o * pede o «+»
    expect(emailPermitido("tiago.cacoete@mudelar.pt", lista)).toBe(true);
    expect(emailPermitido("cliente.real@gmail.com", lista)).toBe(false);
    expect(emailPermitido("x@mudelar.pt.evil.com", lista)).toBe(false);
    expect(emailPermitido("ruben+a@b@gmail.com", lista)).toBe(false);
  });

  it("com a variável, só os telefones da lista (pelos 9 últimos algarismos)", () => {
    expect(telefonePermitido("+351929220322", lista)).toBe(true);
    expect(telefonePermitido("929220322", lista)).toBe(true);
    expect(telefonePermitido("+351965161157", lista)).toBe(false);
    expect(telefonePermitido("123", lista)).toBe(false);
  });

  it("separa os destinatários de um email", () => {
    expect(separarDestinatarios(["eu@exemplo.pt", "cliente@gmail.com"], lista)).toEqual({ permitidos: ["eu@exemplo.pt"], bloqueados: ["cliente@gmail.com"] });
    expect(separarDestinatarios("cliente@gmail.com, outro@x.pt", lista)).toEqual({ permitidos: [], bloqueados: ["cliente@gmail.com", "outro@x.pt"] });
    expect(separarDestinatarios(undefined, lista)).toEqual({ permitidos: [], bloqueados: [] });
  });
});

// O SMS do convite de admissão (convite-admissao/smsapi.ts) também respeita a lista: o número de fora nem chega à SMSAPI.
import { criarEnviadorSms } from "../convite-admissao/smsapi.ts";
describe("ENVIOS_SO_PARA no SMS do convite", () => {
  it("bloqueia o telefone de fora da lista sem chamar a rede; o da lista segue", async () => {
    const chamadas: string[] = [];
    const fetch = async (_url: string, init: { body: string }) => { chamadas.push(init.body); return { ok: true, json: async () => ({}) }; };
    const enviar = criarEnviadorSms({ token: "t", fetch, soPara: lerListaEnvios("+351929220322") });
    expect(await enviar({ telefone: "+351965161157", texto: "código 1" })).toEqual({ enviado: false, erroCodigo: "sms_bloqueado_teste" });
    expect(chamadas).toHaveLength(0);
    expect(await enviar({ telefone: "+351929220322", texto: "código 2" })).toEqual({ enviado: true });
    expect(chamadas).toHaveLength(1);
    // sem lista (produção), segue
    expect(await criarEnviadorSms({ token: "t", fetch })({ telefone: "+351965161157", texto: "código 3" })).toEqual({ enviado: true });
  });
});
