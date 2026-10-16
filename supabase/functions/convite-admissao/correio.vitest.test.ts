/**
 * @vitest-environment node
 *
 * O correio da admissao: SMTP da ORGANIZACAO do processo, envio directo
 * (nunca pela send-email, que grava o corpo em email_logs) e erros so por codigo.
 */
import { describe, expect, it, vi } from "vitest";
import { conteudoOtp, criarEnviadorCorreio, mascararEmail } from "./correio.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PEDIDO = { organizationId: ORG, para: "ana@exemplo.pt", assunto: "Assunto", html: "<p>Ola</p>", texto: "Ola" };

describe("criarEnviadorCorreio", () => {
  it("resolve o SMTP pela organizacao do processo e envia directamente", async () => {
    const resolverSmtp = vi.fn(async () => ({ smtp: { host: "smtp.exemplo.pt" } }));
    const enviarSmtp = vi.fn(async () => ({ messageId: "m1" }));
    const r = await criarEnviadorCorreio({ resolverSmtp, enviarSmtp })(PEDIDO);
    expect(r).toEqual({ enviado: true });
    expect(resolverSmtp).toHaveBeenCalledWith(ORG);
    expect(enviarSmtp).toHaveBeenCalledWith(
      { host: "smtp.exemplo.pt" },
      { to: "ana@exemplo.pt", subject: "Assunto", html: "<p>Ola</p>", text: "Ola" },
    );
  });

  it("sem SMTP activo na organizacao: smtp_nao_configurado e nada se envia", async () => {
    const enviarSmtp = vi.fn();
    const r = await criarEnviadorCorreio({ resolverSmtp: async () => null, enviarSmtp })(PEDIDO);
    expect(r).toEqual({ enviado: false, erroCodigo: "smtp_nao_configurado" });
    expect(enviarSmtp).not.toHaveBeenCalled();
  });

  it("uma falha do SMTP sai so como codigo: nunca a mensagem, que pode trazer o destinatario ou credenciais", async () => {
    const r = await criarEnviadorCorreio({
      resolverSmtp: async () => ({ smtp: {} }),
      enviarSmtp: async () => {
        throw new Error("535 auth falhou para ana@exemplo.pt password=segredo123");
      },
    })(PEDIDO);
    expect(r).toEqual({ enviado: false, erroCodigo: "smtp_falhou" });
    expect(JSON.stringify(r)).not.toContain("segredo123");
    expect(JSON.stringify(r)).not.toContain("ana@exemplo.pt");
  });

  it("uma falha a resolver o SMTP tambem e so um codigo", async () => {
    const r = await criarEnviadorCorreio({
      resolverSmtp: async () => {
        throw new Error("connection string postgres://u:p@h/db");
      },
      enviarSmtp: vi.fn(),
    })(PEDIDO);
    expect(r).toEqual({ enviado: false, erroCodigo: "smtp_falhou" });
  });

  it("recusa organizacao ou destinatario invalidos sem tocar no SMTP", async () => {
    const resolverSmtp = vi.fn();
    const envia = criarEnviadorCorreio({ resolverSmtp, enviarSmtp: vi.fn() });
    for (const mau of [
      { ...PEDIDO, organizationId: "nao-uuid" },
      { ...PEDIDO, para: "a@b.pt, c@d.pt" },
      { ...PEDIDO, para: "" },
      { ...PEDIDO, para: "sem-arroba" },
    ]) {
      expect(await envia(mau)).toEqual({ enviado: false, erroCodigo: "pedido_invalido" });
    }
    expect(resolverSmtp).not.toHaveBeenCalled();
  });
});

describe("conteudoOtp", () => {
  it("curto, com o codigo e a validade, e sem dados pessoais", () => {
    const c = conteudoOtp("482913", 10);
    expect(c.assunto.length).toBeLessThan(80);
    for (const t of [c.html, c.texto]) {
      expect(t).toContain("482913");
      expect(t).toContain("10 minutos");
      expect(t.length).toBeLessThan(1200);
    }
    // sem links, sem nomes, sem nada que identifique a pessoa ou o processo
    expect(c.html).not.toMatch(/https?:\/\//);
    expect(c.assunto).not.toContain("482913");
  });

  it("no singular quando a validade e de 1 minuto, e recusa codigos que nao sejam 6 digitos", () => {
    expect(conteudoOtp("000001", 1).texto).toContain("1 minuto");
    expect(conteudoOtp("000001", 1).texto).not.toContain("1 minutos");
    expect(() => conteudoOtp("12345", 10)).toThrow("otp_pedido_invalido");
  });
});

describe("mascararEmail", () => {
  it("primeira letra do local e do dominio, e o sufixo do dominio", () => {
    expect(mascararEmail("joana@dominio.pt")).toBe("j***@d***.pt");
    expect(mascararEmail("ana.fixada@exemplo.pt")).toBe("a***@e***.pt");
    expect(mascararEmail("a@b.com")).toBe("a***@b***.com");
    expect(mascararEmail("rh@mail.empresa.co.uk")).toBe("r***@m***.uk");
  });

  it("nunca devolve o e-mail completo nem partes alem das primeiras letras e do sufixo", () => {
    const m = mascararEmail("joana.silva@dominio-grande.pt");
    expect(m).not.toContain("oana");
    expect(m).not.toContain("silva");
    expect(m).not.toContain("ominio");
  });

  it("um valor que nao e um e-mail da so asteriscos (nunca o proprio valor)", () => {
    for (const mau of ["", "sem-arroba", "a@b", "@x.pt", "a@.pt", null, undefined, 5]) {
      expect(mascararEmail(mau as unknown as string)).toBe("***");
    }
  });
});
