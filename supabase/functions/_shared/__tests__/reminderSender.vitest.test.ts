import { describe, expect, it } from 'vitest';
import { pickReminderSender } from '../reminderSender';

const CREATED_BY = 'created-by-anew-id';
const TECH = 'technician-anew-id';
const FORM_SMTP = 'form-smtp-id';
const ORG_SMTP = 'org-default-smtp-id';

describe('pickReminderSender - linha do tecnico', () => {
  it('tecnico com utilizador ligado: userId e o tecnico, smtpId e o do formulario', () => {
    const result = pickReminderSender({
      kind: 'technician',
      technicianUserId: TECH,
      createdBy: CREATED_BY,
      formSmtpId: FORM_SMTP,
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result).toEqual({ userId: TECH, smtpId: FORM_SMTP });
  });

  it('tecnico sem utilizador (null): userId cai para createdBy', () => {
    const result = pickReminderSender({
      kind: 'technician',
      technicianUserId: null,
      createdBy: CREATED_BY,
      formSmtpId: FORM_SMTP,
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result.userId).toBe(CREATED_BY);
  });

  it('tecnico sem utilizador (undefined): userId cai para createdBy', () => {
    const result = pickReminderSender({
      kind: 'technician',
      technicianUserId: undefined,
      createdBy: CREATED_BY,
      formSmtpId: FORM_SMTP,
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result.userId).toBe(CREATED_BY);
  });

  it('tecnico com o formulario sem SMTP: smtpId e null, nunca herda a SMTP da organizacao', () => {
    const result = pickReminderSender({
      kind: 'technician',
      technicianUserId: TECH,
      createdBy: CREATED_BY,
      formSmtpId: null,
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result).toEqual({ userId: TECH, smtpId: null });
  });
});

describe('pickReminderSender - linha do cliente', () => {
  it('cliente com SMTP no formulario: smtpId e o do formulario, userId e sempre createdBy', () => {
    const result = pickReminderSender({
      kind: 'client',
      technicianUserId: TECH,
      createdBy: CREATED_BY,
      formSmtpId: FORM_SMTP,
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result).toEqual({ userId: CREATED_BY, smtpId: FORM_SMTP });
  });

  it('cliente sem SMTP no formulario: smtpId cai para a SMTP por omissao da organizacao', () => {
    const result = pickReminderSender({
      kind: 'client',
      technicianUserId: TECH,
      createdBy: CREATED_BY,
      formSmtpId: null,
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result).toEqual({ userId: CREATED_BY, smtpId: ORG_SMTP });
  });

  it('cliente sem formulario nem organizacao: smtpId e null', () => {
    const result = pickReminderSender({
      kind: 'client',
      technicianUserId: TECH,
      createdBy: CREATED_BY,
      formSmtpId: null,
      orgDefaultSmtpId: null,
    });
    expect(result).toEqual({ userId: CREATED_BY, smtpId: null });
  });
});

describe('pickReminderSender - strings vazias contam como ausentes', () => {
  it('technicianUserId vazio equivale a ausente (cai para createdBy)', () => {
    const result = pickReminderSender({
      kind: 'technician',
      technicianUserId: '',
      createdBy: CREATED_BY,
      formSmtpId: FORM_SMTP,
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result.userId).toBe(CREATED_BY);
  });

  it('formSmtpId vazio equivale a ausente (linha do cliente cai para a organizacao)', () => {
    const result = pickReminderSender({
      kind: 'client',
      technicianUserId: TECH,
      createdBy: CREATED_BY,
      formSmtpId: '',
      orgDefaultSmtpId: ORG_SMTP,
    });
    expect(result.smtpId).toBe(ORG_SMTP);
  });
});
