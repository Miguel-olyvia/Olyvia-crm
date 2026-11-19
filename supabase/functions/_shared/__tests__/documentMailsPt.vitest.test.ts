// BASELINE EM PORTUGUES dos emails e SMS ao cliente sobre propostas e contratos.
// O golden (fixtures/documentMailsPt.golden.json) foi capturado, byte a byte, do codigo ORIGINAL das Edge Functions
// (send-proposal-email, send-verification-code, create-client-portal-access, sms-otp, client-portal-action)
// ANTES de ser alterado. Tudo o que aqui passa tem de sair identico com: sem idioma, pt, ou idioma desconhecido.
import { describe, expect, it } from 'vitest';
import golden from './fixtures/documentMailsPt.golden.json';
import inputs from './fixtures/documentMailsInputs.json';
import { mailLangsOf } from '../documentLanguage';
import {
  buildPortalAccessMail,
  buildProposalEmail,
  buildVerificationMail,
  invalidCodeMessage,
  otpSmsText,
  portalMessage,
} from '../documentMails';

const G = golden as Record<string, string>;

/** Todas as formas de "sem idioma / portugues / idioma desconhecido" que tem de dar o texto de sempre. */
const COMO_PT: Array<{ nome: string; langs: ReturnType<typeof mailLangsOf> | undefined }> = [
  { nome: 'sem idioma', langs: undefined },
  { nome: 'pt', langs: mailLangsOf(['pt']) },
  { nome: 'nulo', langs: mailLangsOf(null) },
  { nome: 'fr (desconhecido)', langs: mailLangsOf(['fr']) },
  { nome: 'es+fr', langs: mailLangsOf(['es', 'fr']) },
  { nome: 'xx', langs: mailLangsOf('xx') },
];

describe('send-proposal-email: o portugues sai identico ao de hoje', () => {
  for (const c of inputs.proposalEmail.cases) {
    for (const v of COMO_PT) {
      it(`${c.name} / ${v.nome}`, () => {
        const mail = buildProposalEmail({
          proposal: c.proposal,
          publicUrl: c.publicUrl,
          customMessage: c.customMessage || undefined,
          senderName: c.senderName || undefined,
          subject: c.subject || undefined,
          langs: v.langs,
        });
        expect(mail.html).toBe(G[`proposal.html.${c.name}`]);
        expect(mail.subject).toBe(G[`proposal.subject.${c.name}`]);
      });
    }
  }
});

describe('send-verification-code: o portugues sai identico ao de hoje', () => {
  for (const c of inputs.verification.cases) {
    for (const v of COMO_PT) {
      it(`${c.name} / ${v.nome}`, () => {
        const mail = buildVerificationMail({
          code: c.code,
          proposalTitle: c.proposalTitle,
          action: c.action as 'accept' | 'reject',
          template: {
            verification_email_body: c.templateBody ?? undefined,
            verification_email_subject: c.templateSubject ?? undefined,
          },
          langs: v.langs,
        });
        expect(mail.html).toBe(G[`verification.html.${c.name}`]);
        expect(mail.subject).toBe(G[`verification.subject.${c.name}`]);
      });
    }
  }

  it('sem «action» no pedido: o corpo diz aceitar mas o assunto por omissao diz Recusar (como o codigo original sempre fez)', () => {
    const c = inputs.verification.cases[0];
    const sem = buildVerificationMail({ code: c.code, proposalTitle: c.proposalTitle, action: undefined, template: null });
    expect(sem.subject).toBe('Código de Verificação - Recusar Proposta');
    expect(sem.html).toBe(G['verification.html.omissaoAceitar']);
  });

  it('sem modelo nenhum (null) e igual ao modelo vazio', () => {
    const c = inputs.verification.cases[0];
    const mail = buildVerificationMail({ code: c.code, proposalTitle: c.proposalTitle, action: 'accept', template: null });
    expect(mail.html).toBe(G['verification.html.omissaoAceitar']);
    expect(mail.subject).toBe(G['verification.subject.omissaoAceitar']);
  });
});

describe('create-client-portal-access: o portugues sai identico ao de hoje', () => {
  for (const c of inputs.portalAccess.cases) {
    for (const v of COMO_PT) {
      it(`${c.name} / ${v.nome}`, () => {
        const mail = buildPortalAccessMail({
          hasCredentials: c.hasCredentials,
          docType: c.docType as 'proposal' | 'quote' | 'contract',
          contactName: c.contactName,
          orgName: c.orgName,
          documentTitle: c.documentTitle,
          callerName: c.callerName,
          email: c.email,
          tempPassword: c.tempPassword,
          finalLoginUrl: c.finalLoginUrl,
          linkedExistingAccount: c.linkedExistingAccount,
          langs: v.langs,
        });
        expect(mail.html).toBe(G[`portal.html.${c.name}`]);
        expect(mail.subject).toBe(G[`portal.subject.${c.name}`]);
      });
    }
  }

  it('os nomes que faltam (ficha sem nome, sem organizacao, sem quem enviou) caem nos textos de sempre', () => {
    const base = {
      hasCredentials: false,
      docType: 'quote' as const,
      documentTitle: 'Orcamento',
      email: 'rita@x.pt',
      tempPassword: '',
      finalLoginUrl: 'https://app.test/auth',
      linkedExistingAccount: false,
    };
    const mail = buildPortalAccessMail({ ...base, contactName: null, orgName: null, callerName: null });
    expect(mail.html).toBe(G['portal.html.novoDocOrcamento']);
    expect(mail.subject).toBe(G['portal.subject.novoDocOrcamento']);
  });
});

describe('sms-otp e mensagens ao cliente: o portugues sai identico ao de hoje', () => {
  it('SMS do codigo', () => {
    for (const code of inputs.otpSms.codes) {
      expect(otpSmsText(code, 'pt')).toBe(G[`otp.sms.${code}`]);
      expect(otpSmsText(code)).toBe(G[`otp.sms.${code}`]);
      expect(otpSmsText(code, mailLangsOf(['fr'])[0])).toBe(G[`otp.sms.${code}`]);
    }
  });

  it.each([
    ['no_phone', 'msg.no_phone'],
    ['rate_limit', 'msg.rate_limit'],
    ['sms_failed', 'msg.sms_failed'],
    ['expired', 'msg.expired'],
    ['max_attempts', 'msg.max_attempts'],
    ['contract_not_signable', 'portal.contract_not_signable'],
    ['otp_required', 'portal.otp_required'],
    ['contract_check_unavailable', 'portal.contract_check_unavailable'],
    ['sign_unavailable', 'portal.sign_unavailable'],
    ['reason_length', 'portal.reason_length'],
    ['invalid_message', 'portal.invalid_message'],
    ['question_limit', 'portal.question_limit'],
  ] as const)('mensagem %s', (key, goldenKey) => {
    expect(portalMessage(key, 'pt')).toBe(G[goldenKey]);
    expect(portalMessage(key)).toBe(G[goldenKey]);
    expect(portalMessage(key, mailLangsOf(['xx'])[0])).toBe(G[goldenKey]);
  });

  it.each([0, 1, 2])('codigo incorreto com %i tentativas restantes', (remaining) => {
    expect(invalidCodeMessage(remaining, 'pt')).toBe(G[`msg.invalid_code.${remaining}`]);
    expect(invalidCodeMessage(remaining)).toBe(G[`msg.invalid_code.${remaining}`]);
  });
});
