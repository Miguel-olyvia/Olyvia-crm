// As Edge Functions (Deno) nao correm no vitest: este teste le o codigo-fonte e garante que cada uma usa os
// construtores partilhados (que estao testados) em vez de textos em portugues escritos a mao.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FUNCTIONS = resolve(__dirname, '../..');
const ler = (nome: string): string => readFileSync(resolve(FUNCTIONS, nome, 'index.ts'), 'utf8').split('\r\n').join('\n');

describe('send-proposal-email', () => {
  const src = ler('send-proposal-email');
  it('usa o construtor partilhado e o idioma da proposta', () => {
    expect(src).toContain('buildProposalEmail');
    expect(src).toContain('proposalLanguages');
    expect(src).toContain('../_shared/documentMails.ts');
    expect(src).toContain('../_shared/documentLanguage.ts');
  });
  it('ja nao tem o HTML nem os textos fixos em portugues', () => {
    for (const t of ['Ver Proposta Completa', 'Valor da Proposta', 'Enviado automaticamente', 'enviou-lhe', 'function generateProposalEmailHtml']) {
      expect(src).not.toContain(t);
    }
  });
});

describe('create-client-portal-access', () => {
  const src = ler('create-client-portal-access');
  it('usa o construtor partilhado e le o idioma do documento com a organizacao', () => {
    expect(src).toContain('buildPortalAccessMail');
    expect(src).toContain('fetchDocumentLanguages(');
    expect(src).toContain('mailLangsOf');
  });
  it('ja nao tem o corpo do email em portugues', () => {
    for (const t of ['Foi-lhe criado um acesso', 'Recomendamos que altere', 'Aceda ao portal', 'Password tempor']) expect(src).not.toContain(t);
  });
});

describe('send-verification-code', () => {
  const src = ler('send-verification-code');
  it('usa o construtor partilhado e o idioma da proposta', () => {
    expect(src).toContain('buildVerificationMail');
    expect(src).toContain('proposalLanguages');
  });
  it('ja nao tem «Cliente» fixo nem o HTML em portugues', () => {
    expect(src).not.toContain('const clientName = "Cliente"');
    expect(src).not.toContain('Este código expira em 15 minutos');
    expect(src).not.toContain('function generateVerificationEmailHtml');
  });
});

describe('sms-otp', () => {
  const src = ler('sms-otp');
  it('usa os textos partilhados e o primeiro idioma do documento', () => {
    expect(src).toContain('otpSmsText(');
    expect(src).toContain('portalMessage(');
    expect(src).toContain('firstMailLang');
    expect(src).toContain('fetchDocumentLanguages(');
  });
  it('ja nao tem as mensagens ao cliente em portugues', () => {
    for (const t of ['O seu código de verificação é', 'Demasiados pedidos', 'Falha ao enviar SMS', 'Código expirado ou inválido', 'Número máximo de tentativas', 'Código incorreto']) {
      expect(src).not.toContain(t);
    }
  });
  it('o telefone e a mensagem para o comercial (signatario) nao seguem o idioma do documento', () => {
    expect(src).toContain('Utilizador signatário não encontrado.');
    expect(src).toContain('Não tem permissão para solicitar verificação para este utilizador.');
  });
});

describe('client-portal-action', () => {
  const src = ler('client-portal-action');
  it('usa os textos partilhados para o que o portal mostra ao cliente', () => {
    expect(src).toContain('portalMessage(');
    expect(src).toContain('fetchDocumentLanguages(');
  });
  it('ja nao tem essas mensagens em portugues', () => {
    for (const t of [
      'Este contrato já não está disponível para assinatura.',
      'OTP inválido, expirado ou já utilizado',
      'Não foi possível validar o contrato.',
      'Não foi possível registar a assinatura.',
      'Motivo deve ter entre 10 e 500 caracteres',
      'Limite de perguntas atingido',
      'Mensagem inválida',
    ]) {
      expect(src).not.toContain(t);
    }
  });
  it('as notificacoes para o comercial ficam em portugues', () => {
    expect(src).toContain('aceitou o orçamento');
    expect(src).toContain('assinou o contrato');
    expect(src).toContain('tem uma dúvida sobre a');
  });
});
