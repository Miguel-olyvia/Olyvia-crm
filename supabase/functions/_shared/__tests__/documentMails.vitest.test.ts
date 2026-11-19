// Emails e SMS ao cliente sobre propostas e contratos NO IDIOMA DO DOCUMENTO.
//  - Um idioma: tudo nesse idioma (so en tem versao inglesa).
//  - Dois (pt+en): os emails levam a versao portuguesa e a seguir a inglesa no mesmo corpo, com assunto bilingue;
//    o SMS do codigo sai so no primeiro idioma.
//  - Datas so mudam de palavras; dinheiro e numeros ficam como estao; nomes e dados do utilizador ficam como estao.
import { describe, expect, it } from 'vitest';
import inputs from './fixtures/documentMailsInputs.json';
import { MAIL_TEXTS } from '../emailDefaults';
import {
  buildPortalAccessMail,
  buildProposalEmail,
  buildVerificationMail,
  fillText,
  invalidCodeMessage,
  otpSmsText,
  portalMessage,
} from '../documentMails';
import type { PortalMessageKey } from '../documentMails';

const completo = inputs.proposalEmail.cases.find((c) => c.name === 'completo')!;
const basico = inputs.proposalEmail.cases.find((c) => c.name === 'basico')!;

const proposta = (c: typeof completo, over: Record<string, unknown> = {}) => ({
  proposal: c.proposal,
  publicUrl: c.publicUrl,
  customMessage: c.customMessage || undefined,
  senderName: c.senderName || undefined,
  ...over,
});

const PORTUGUES_DE_PROPOSTA = ['Valor da Proposta', 'Válida até', 'Ver Proposta Completa', 'Enviado automaticamente', 'enviou-lhe', 'Foi-lhe enviada'];

describe('fillText', () => {
  it('substitui {chaves} sem interpretar $ nos valores', () => {
    expect(fillText('Ola {name}, {name}! {x}', { name: 'A$&B', x: '1' })).toBe('Ola A$&B, A$&B! 1');
    expect(fillText('sem chaves', { name: 'x' })).toBe('sem chaves');
    expect(fillText('{desconhecida}', {})).toBe('{desconhecida}');
  });
});

describe('dicionario: pt e en tem as mesmas chaves nos textos novos', () => {
  const chaves = (o: unknown, prefixo = ''): string[] =>
    o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => chaves(v, `${prefixo}${k}.`))
      : [prefixo];
  it('mesma forma, nenhum texto em branco', () => {
    expect(chaves(MAIL_TEXTS.en.documents).sort()).toEqual(chaves(MAIL_TEXTS.pt.documents).sort());
    const textos = (o: unknown): string[] =>
      o && typeof o === 'object' ? Object.values(o as Record<string, unknown>).flatMap(textos) : [String(o)];
    for (const lang of ['pt', 'en'] as const) for (const t of textos(MAIL_TEXTS[lang].documents)) expect(t.trim()).not.toBe('');
  });
});

describe('email da proposta (send-proposal-email)', () => {
  it('en: tudo em ingles; dinheiro, data e nomes como estao', () => {
    const mail = buildProposalEmail(proposta(completo, { langs: ['en'], customMessage: undefined }));
    for (const pt of PORTUGUES_DE_PROPOSTA) expect(mail.html).not.toContain(pt);
    expect(mail.html).toContain('Ana Silva sent you a proposal for review.');
    expect(mail.html).toContain('Proposal value');
    expect(mail.html).toContain('Valid until:');
    expect(mail.html).toContain('View full proposal');
    expect(mail.html).toContain('Sent automatically');
    // dinheiro e data: o mesmo formato de hoje
    expect(mail.html).toContain(new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD' }).format(1999.5));
    expect(mail.html).toContain(new Date('2026-12-31T00:00:00Z').toLocaleDateString('pt-PT'));
    // dados do utilizador e da proposta como estao
    expect(mail.html).toContain('Remodelacao da cozinha');
    expect(mail.html).toContain('Acme Lda - NIF 500000000');
    expect(mail.subject).toBe('Proposal: Remodelacao da cozinha');
  });

  it('en: sem remetente a frase passa para a forma impessoal', () => {
    const mail = buildProposalEmail(proposta(basico, { langs: ['en'] }));
    expect(mail.html).toContain('A proposal has been sent to you for review.');
    expect(mail.subject).toBe('Proposal: Casa de banho completa');
  });

  it('o assunto escrito pelo utilizador e a mensagem dele ficam como estao', () => {
    const mail = buildProposalEmail(proposta(completo, { langs: ['en'], subject: 'Proposta personalizada' }));
    expect(mail.subject).toBe('Proposta personalizada');
    expect(mail.html).toContain('Ola Rita,\nsegue a proposta &lt;b&gt;combinada&lt;/b&gt;.');
  });

  it('o rodape da versao inglesa (design_settings.versions.en.footer_text) manda; sem ela, o base', () => {
    const comVersao = {
      ...completo.proposal,
      template_snapshot: {
        ...completo.proposal.template_snapshot,
        design_settings: { versions: { en: { footer_text: 'Acme Ltd - VAT 500000000' } } },
      },
    };
    const en = buildProposalEmail({ ...proposta(completo, { langs: ['en'] }), proposal: comVersao });
    expect(en.html).toContain('Acme Ltd - VAT 500000000');
    expect(en.html).not.toContain('Acme Lda - NIF 500000000');
    // o portugues continua a usar o rodape base
    const pt = buildProposalEmail({ ...proposta(completo, { langs: ['pt'] }), proposal: comVersao });
    expect(pt.html).toContain('Acme Lda - NIF 500000000');
    expect(pt.html).not.toContain('Acme Ltd');
    // versao vazia: cai no base
    const vazia = {
      ...completo.proposal,
      template_snapshot: { ...completo.proposal.template_snapshot, design_settings: { versions: { en: { footer_text: '  ' } } } },
    };
    expect(buildProposalEmail({ ...proposta(completo, { langs: ['en'] }), proposal: vazia }).html).toContain('Acme Lda - NIF 500000000');
  });

  it('pt+en: versao portuguesa e a seguir a inglesa no mesmo corpo; assunto bilingue', () => {
    const mail = buildProposalEmail(proposta(completo, { langs: ['pt', 'en'], customMessage: undefined }));
    const iPt = mail.html.indexOf('Ver Proposta Completa');
    const iEn = mail.html.indexOf('View full proposal');
    expect(iPt).toBeGreaterThan(-1);
    expect(iEn).toBeGreaterThan(iPt);
    expect(mail.html).toContain('Valor da Proposta');
    expect(mail.html).toContain('Proposal value');
    expect(mail.html).toContain('Enviado automaticamente');
    expect(mail.html).toContain('Sent automatically');
    // um so documento HTML
    expect(mail.html.match(/<html>/g)).toHaveLength(1);
    expect(mail.html.match(/<\/html>/g)).toHaveLength(1);
    expect(mail.subject).toBe('Proposta: Remodelacao da cozinha / Proposal: Remodelacao da cozinha');
  });

  it('pt+en: a mensagem e a descricao do utilizador aparecem uma so vez', () => {
    const mail = buildProposalEmail(proposta(completo, { langs: ['pt', 'en'] }));
    expect(mail.html.split('segue a proposta').length - 1).toBe(1);
    expect(mail.html.split('Descricao da proposta para o cliente ver').length - 1).toBe(1);
    // o rodape base (igual nos dois idiomas) tambem aparece uma so vez
    expect(mail.html.split('Acme Lda - NIF 500000000').length - 1).toBe(1);
  });

  it('en+pt: a ordem e a da escolha', () => {
    const mail = buildProposalEmail(proposta(basico, { langs: ['en', 'pt'] }));
    expect(mail.html.indexOf('View full proposal')).toBeLessThan(mail.html.indexOf('Ver Proposta Completa'));
    expect(mail.subject).toBe('Proposal: Casa de banho completa / Proposta: Casa de banho completa');
  });
});

const modelo = {
  verification_email_subject: 'Assunto base {{titulo_proposta}}',
  verification_email_body: '<p>Base {{codigo}} para {{acao}}</p>',
  design_settings: {
    versions: {
      en: {
        verification_email_subject: 'English subject {{titulo_proposta}}',
        verification_email_body: '<p>English {{codigo}} to {{acao}} for {{nome_cliente}}</p>',
      },
      pt: { verification_email_subject: 'NAO USAR', verification_email_body: '<p>NAO USAR</p>' },
    },
  },
};

const verif = (over: Record<string, unknown> = {}) =>
  buildVerificationMail({ code: '123456', proposalTitle: 'Pintura', action: 'accept', template: modelo, ...over } as never);

describe('email do codigo de verificacao (send-verification-code)', () => {
  it('en sem modelo: texto por omissao em ingles, «Client» em vez de «Cliente»', () => {
    const mail = verif({ template: null, langs: ['en'] });
    expect(mail.subject).toBe('Verification Code - Accept Proposal');
    expect(mail.html).toContain('Verification Code');
    expect(mail.html).toContain('Hello <strong>Client</strong>, to accept the proposal "<strong>Pintura</strong>", please enter the following code:');
    expect(mail.html).toContain('123456');
    expect(mail.html).toContain('This code expires in 15 minutes.');
    expect(mail.html).toContain('If you did not request this code, you can ignore this email.');
    for (const pt of ['Código de Verificação', 'Olá', 'expira em', 'ignorar este email']) expect(mail.html).not.toContain(pt);
  });

  it('en sem modelo, recusar', () => {
    const mail = verif({ template: null, langs: ['en'], action: 'reject' });
    expect(mail.subject).toBe('Verification Code - Reject Proposal');
    expect(mail.html).toContain('to reject the proposal');
  });

  it('en com versao inglesa no modelo: assunto e corpo da versao (c)', () => {
    const mail = verif({ langs: ['en'] });
    expect(mail.subject).toBe('English subject Pintura');
    expect(mail.html).toContain('<p>English 123456 to accept for Client</p>');
    expect(mail.html).not.toContain('Base 123456');
  });

  it('en sem versao inglesa: cai no texto base e so depois no por omissao', () => {
    const semVersao = { verification_email_subject: 'Assunto base {{titulo_proposta}}', verification_email_body: '<p>Base {{codigo}} para {{acao}}</p>' };
    const mail = verif({ template: semVersao, langs: ['en'] });
    expect(mail.subject).toBe('Assunto base Pintura');
    expect(mail.html).toContain('<p>Base 123456 para accept</p>');
    // so o assunto no modelo: o corpo cai no por omissao
    const soAssunto = verif({ template: { verification_email_subject: 'So assunto {{titulo_proposta}}' }, langs: ['en'] });
    expect(soAssunto.subject).toBe('So assunto Pintura');
    expect(soAssunto.html).toContain('please enter the following code:');
    // versao com textos em branco = como se nao existisse
    const emBranco = verif({
      template: { ...semVersao, design_settings: { versions: { en: { verification_email_subject: '', verification_email_body: '   ' } } } },
      langs: ['en'],
    });
    expect(emBranco.subject).toBe('Assunto base Pintura');
    expect(emBranco.html).toContain('<p>Base 123456 para accept</p>');
  });

  it('pt le sempre o texto base, mesmo que o modelo tenha uma versao pt', () => {
    const mail = verif({ langs: ['pt'] });
    expect(mail.subject).toBe('Assunto base Pintura');
    expect(mail.html).toContain('<p>Base 123456 para aceitar</p>');
    expect(mail.html).not.toContain('NAO USAR');
  });

  it('pt+en com modelo: os dois textos no mesmo corpo, assunto bilingue', () => {
    const mail = verif({ langs: ['pt', 'en'] });
    expect(mail.subject).toBe('Assunto base Pintura / English subject Pintura');
    const iPt = mail.html.indexOf('Base 123456 para aceitar');
    const iEn = mail.html.indexOf('English 123456 to accept for Client');
    expect(iPt).toBeGreaterThan(-1);
    expect(iEn).toBeGreaterThan(iPt);
    expect(mail.html.match(/<html>/g)).toHaveLength(1);
  });

  it('pt+en cujo modelo so tem texto base: aparece uma so vez (nao se repete o mesmo texto)', () => {
    const semVersao = { verification_email_subject: 'Assunto base {{titulo_proposta}}', verification_email_body: '<p>Base {{codigo}}</p>' };
    const mail = verif({ template: semVersao, langs: ['pt', 'en'] });
    expect(mail.subject).toBe('Assunto base Pintura');
    expect(mail.html.split('Base 123456').length - 1).toBe(1);
  });

  it('pt+en sem modelo: omissao em portugues e a seguir em ingles; assunto bilingue', () => {
    const mail = verif({ template: null, langs: ['pt', 'en'] });
    expect(mail.subject).toBe('Código de Verificação - Aceitar Proposta / Verification Code - Accept Proposal');
    expect(mail.html.indexOf('Olá <strong>Cliente</strong>')).toBeLessThan(mail.html.indexOf('Hello <strong>Client</strong>'));
    expect(mail.html.match(/<html>/g)).toHaveLength(1);
  });
});

const acesso = (over: Record<string, unknown> = {}) => {
  const c = inputs.portalAccess.cases[0];
  return buildPortalAccessMail({
    hasCredentials: c.hasCredentials,
    docType: 'proposal',
    contactName: 'Rita',
    orgName: 'Acme & Filhos',
    documentTitle: 'Casa de banho',
    callerName: 'Ana Silva',
    email: c.email,
    tempPassword: c.tempPassword,
    finalLoginUrl: c.finalLoginUrl,
    linkedExistingAccount: false,
    ...over,
  } as never);
};

describe('email de acesso ao portal (create-client-portal-access)', () => {
  it('en com credenciais: tudo em ingles, a password e o link como estao', () => {
    const mail = acesso({ langs: ['en'] });
    expect(mail.subject).toBe('Portal access — Acme & Filhos');
    expect(mail.html).toContain('Hello, Rita!');
    expect(mail.html).toContain('<strong>proposal</strong>');
    expect(mail.html).toContain('Temporary password:');
    expect(mail.html).toContain('Tmp-Pass_123');
    expect(mail.html).toContain('href="https://app.test/auth"');
    expect(mail.html).toContain('Acme &amp; Filhos');
    for (const pt of ['Ol&aacute;', 'Foi-lhe criado', 'Password tempor', 'Enviado por', 'Aceda']) expect(mail.html).not.toContain(pt);
  });

  it.each([
    ['proposal', 'proposal'],
    ['quote', 'quote'],
    ['contract', 'contract'],
  ] as const)('en: o tipo de documento %s chama-se «%s»', (docType, label) => {
    const mail = acesso({ langs: ['en'], hasCredentials: false, docType, tempPassword: '' });
    expect(mail.subject).toBe(`New ${label} available — Acme & Filhos`);
    expect(mail.html).toContain(`<strong>${label}</strong>`);
  });

  it('en sem credenciais e conta ja existente: avisa para escolher a empresa', () => {
    const mail = acesso({ langs: ['en'], hasCredentials: false, linkedExistingAccount: true, tempPassword: '' });
    expect(mail.html).toContain('choose <strong>Acme &amp; Filhos</strong> in the company selector');
    expect(mail.html).not.toContain('Temporary password');
  });

  it('en: os nomes que faltam caem nas palavras inglesas', () => {
    const mail = acesso({ langs: ['en'], contactName: null, orgName: null, callerName: null });
    expect(mail.html).toContain('Hello, Client!');
    expect(mail.html).toContain('Sent by The team');
    expect(mail.subject).toBe('Portal access — the company');
  });

  it('pt+en: as duas versoes no mesmo corpo, a portuguesa primeiro; assunto bilingue', () => {
    const mail = acesso({ langs: ['pt', 'en'] });
    expect(mail.subject).toBe('Acesso ao Portal — Acme &amp; Filhos / Portal access — Acme & Filhos');
    expect(mail.html.indexOf('Ol&aacute;, Rita!')).toBeLessThan(mail.html.indexOf('Hello, Rita!'));
    expect(mail.html).toContain('Password tempor&aacute;ria:');
    expect(mail.html).toContain('Temporary password:');
  });
});

describe('SMS do codigo (sms-otp): so no primeiro idioma', () => {
  it('en', () => {
    expect(otpSmsText('123456', 'en')).toBe('Your verification code is: 123456. Valid for 5 minutes.');
  });
  it('pt+en: o SMS usa so o primeiro idioma da escolha', async () => {
    const { firstMailLang } = await import('../documentLanguage');
    expect(otpSmsText('123456', firstMailLang(['pt', 'en']))).toBe('O seu código de verificação é: 123456. Válido por 5 minutos.');
    expect(otpSmsText('123456', firstMailLang(['en', 'pt']))).toBe('Your verification code is: 123456. Valid for 5 minutes.');
  });
});

const CHAVES: PortalMessageKey[] = [
  'no_phone', 'rate_limit', 'sms_failed', 'expired', 'max_attempts', 'contract_not_signable', 'otp_required',
  'contract_check_unavailable', 'sign_unavailable', 'reason_length', 'invalid_message', 'question_limit',
];

describe('mensagens de erro mostradas ao cliente', () => {
  it.each(CHAVES)('%s: em ingles, sem portugues', (key) => {
    const en = portalMessage(key, 'en');
    expect(en).not.toBe(portalMessage(key, 'pt'));
    expect(en.trim()).not.toBe('');
    expect(en).not.toMatch(/[áàâãçéêíóôõú]/i);
  });

  it('codigo incorreto em ingles', () => {
    expect(invalidCodeMessage(2, 'en')).toBe('Incorrect code. 2 attempts left.');
    expect(invalidCodeMessage(1, 'en')).toBe('Incorrect code. 1 attempt left.');
    expect(invalidCodeMessage(0, 'en')).toBe('Incorrect code. Please request a new code.');
  });
});
