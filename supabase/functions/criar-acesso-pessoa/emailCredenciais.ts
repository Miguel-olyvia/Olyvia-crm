/**
 * O destinatario e o corpo do e-mail de credenciais de `criar-acesso-pessoa`,
 * como funcoes puras (sem Deno, sem rede) para serem testaveis no vitest.
 */

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * No REENVIO a password nova vai para o e-mail da CONTA de autenticacao, nunca
 * para `pessoas.email_pessoal`: esse campo edita-se com `hr.pessoas.edit` e a
 * permissao de reenviar e outra, por isso usa-lo deixava quem edita a ficha
 * receber a password de qualquer colega com conta.
 */
export function destinatarioDoReenvio(args: { emailConta: string | null | undefined }): string | null {
  const email = (args.emailConta ?? "").trim().toLowerCase();
  return email !== "" && email.includes("@") ? email : null;
}

/**
 * `password` null = a conta de autenticacao JA existia (de outra ficha ou de
 * outra organizacao): a password dela nao se toca nem se envia, a pessoa usa a
 * que ja tem ou recupera-a.
 */
export function corpoDoEmail(
  nome: string,
  email: string,
  password: string | null,
  baseUrl: string,
): { html: string; text: string } {
  const link = baseUrl ? `${baseUrl}/login` : "";
  const linkHtml = link ? `<p><a href="${escaparHtml(link)}">Entrar na Olyvia</a></p>` : "";
  const linkTexto = link ? `Entrar: ${link}\n\n` : "";

  if (password === null) {
    return {
      html:
        `<p>Ola ${escaparHtml(nome)},</p>` +
        `<p>Foi-lhe dado acesso a Olyvia com a conta que ja tem.</p>` +
        `<p><strong>Utilizador:</strong> ${escaparHtml(email)}</p>` +
        `<p>Entre com a sua password habitual. Se a nao se lembrar, use a opcao de ` +
        `recuperar password no ecra de entrada.</p>` +
        linkHtml,
      text:
        `Ola ${nome},\n\nFoi-lhe dado acesso a Olyvia com a conta que ja tem.\n\n` +
        `Utilizador: ${email}\n\n` +
        `Entre com a sua password habitual. Se a nao se lembrar, use a opcao de recuperar password no ecra de entrada.\n\n` +
        linkTexto,
    };
  }

  const html =
    `<p>Ola ${escaparHtml(nome)},</p>` +
    `<p>Foi-lhe criado acesso a Olyvia. Os seus dados de entrada:</p>` +
    `<p><strong>Utilizador:</strong> ${escaparHtml(email)}<br>` +
    `<strong>Password:</strong> ${escaparHtml(password)}</p>` +
    linkHtml +
    `<p>Altere a password depois da primeira entrada. Esta mensagem e a unica ` +
    `copia da password: ninguem na sua organizacao a consegue ver.</p>`;
  const text =
    `Ola ${nome},\n\nFoi-lhe criado acesso a Olyvia.\n\n` +
    `Utilizador: ${email}\nPassword: ${password}\n\n` +
    linkTexto +
    `Altere a password depois da primeira entrada. Esta mensagem e a unica copia da password.`;
  return { html, text };
}
