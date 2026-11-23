// Textos POR OMISSAO dos emails e SMS ao cliente, por idioma. Puro: sem rede, sem Deno.
//
// Regras (decididas com o utilizador):
//  - O portugues (pt) sao EXATAMENTE os textos que o codigo tinha escritos antes (provado por
//    fixtures/emailDefaultsPt.golden.json, capturado do codigo antes de o alterar).
//  - Idioma desconhecido, vazio ou em falta = pt. So `en` (e variantes: en-GB, en_US) tem versao inglesa.
//  - Os avisos INTERNOS (ao comercial) ficam sempre em portugues; so os emails e SMS AO CLIENTE
//    seguem o idioma dele (ver mailLangFor).
//  - Nas datas so as PALAVRAS seguem o idioma (dia da semana, mes, «as»/«at»); o numero do dia, o ano,
//    a hora (24h) e o fuso (Lisboa) ficam como hoje. Dinheiro e numeros nao mudam de formato.
//  - Um modelo de email escolhido para o idioma (form_branding.email_locale_templates) manda sempre;
//    isto so entra quando nao ha modelo.

export type MailLang = "pt" | "en";
export type MailAudience = "client" | "technician";

/** Idioma curto em minusculas («en-GB» -> «en»); null se nao for texto utilizavel. */
function shortCode(lang: unknown): string | null {
  if (typeof lang !== "string") return null;
  return lang.toLowerCase().trim().split(/[-_]/)[0] || null;
}

/** Idioma dos textos por omissao: `en` so para ingles; tudo o resto (incl. desconhecido) e `pt`. */
export function normalizeMailLang(lang: unknown): MailLang {
  return shortCode(lang) === "en" ? "en" : "pt";
}

/** O comercial (aviso interno) fica em portugues; o cliente segue o idioma; sem destinatario, o idioma pedido. */
export function mailLangFor(audience: MailAudience | undefined, lang: unknown): MailLang {
  return audience === "technician" ? "pt" : normalizeMailLang(lang);
}

/**
 * Idioma da pessoa: o do pedido (lang do formulario ou da pagina) tem prioridade; sem ele, o guardado
 * na lead (anew_leads.locale); sem nenhum, null. Sempre em minusculas, como o servidor o compara.
 */
export function resolveLeadLocale(requestLang: unknown, storedLocale: unknown): string | null {
  for (const v of [requestLang, storedLocale]) {
    if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
  }
  return null;
}

export interface MailTexts {
  /** Rotulos das linhas e botoes de defaultMeetingHtml. */
  labels: {
    lead: string;
    phone: string;
    email: string;
    client: string;
    dateTime: string;
    address: string;
    place: string;
    technician: string;
    confirmVisit: string;
    manageOrCancel: string;
    openAgenda: string;
  };
  bookingConfirmation: { subject: string; heading: string; intro: string };
  meetingNotify: { subject: string; heading: string; intro: string };
  cancel: { clientSubject: string; technicianSubject: string; heading: string; clientIntro: string; technicianIntro: string };
  reschedule: { clientSubject: string; technicianSubject: string; heading: string; clientIntro: string; technicianIntro: string };
  reminder: { clientSubject: string; technicianSubject: string; clientHeading: string; technicianHeading: string; clientIntro: string; technicianIntro: string };
  /** Assunto quando o modelo escolhido para a confirmacao nao traz assunto proprio. */
  confirmationFallbackSubject: string;
  invite: {
    subject: string;
    greeting: string;
    greetingWithName: string;
    heading: string;
    bodyBefore: string;
    bodyStrong: string;
    bodyAfter: string;
    cta: string;
    ignore: string;
    unsubscribe: string;
  };
  sms: {
    companyFallback: string;
    confirmationBody: string;
    manageCancel: string;
    reminderHead: string;
    reminderHeadRescheduled: string;
    reminderTail: string;
    confirm: string;
    manage: string;
  };
  /** Emails e SMS ao CLIENTE sobre propostas e contratos (no idioma do documento). */
  documents: DocumentTexts;
}

/** Textos dos emails e SMS que o cliente recebe ao ter uma proposta ou um contrato. {chaves} sao substituidas por quem os usa. */
export interface DocumentTexts {
  /** Nomes que faltam (ficha sem nome, empresa sem nome, quem envia sem nome). */
  genericClient: string;
  genericCompany: string;
  genericTeam: string;
  docLabels: { proposal: string; quote: string; contract: string };
  proposalMail: {
    subject: string;
    introWithSender: string;
    introNoSender: string;
    valueLabel: string;
    validUntil: string;
    cta: string;
    sentAutomatically: string;
  };
  verification: {
    title: string;
    subjectAccept: string;
    subjectReject: string;
    actionAccept: string;
    actionReject: string;
    intro: string;
    expires: string;
    ignore: string;
  };
  portalAccess: {
    subjectWithCredentials: string;
    subjectNewDocument: string;
    greeting: string;
    credentialsIntro: string;
    credentialsDocument: string;
    accessLabel: string;
    emailLabel: string;
    passwordLabel: string;
    changePassword: string;
    newDocument: string;
    accessAt: string;
    linkedAccount: string;
    sentBy: string;
  };
  otpSms: string;
  messages: {
    noPhone: string;
    rateLimit: string;
    smsFailed: string;
    expired: string;
    maxAttempts: string;
    invalidCodeWrong: string;
    invalidCodeRemaining: string;
    invalidCodeRemainingOne: string;
    invalidCodeRequestNew: string;
    contractNotSignable: string;
    otpRequired: string;
    contractCheckUnavailable: string;
    signUnavailable: string;
    reasonLength: string;
    invalidMessage: string;
    questionLimit: string;
  };
}

export const MAIL_TEXTS: Record<MailLang, MailTexts> = {
  pt: {
    labels: {
      lead: "Lead",
      phone: "Telefone",
      email: "Email",
      client: "Cliente",
      dateTime: "Data / hora",
      address: "Morada",
      place: "Local",
      technician: "Técnico",
      confirmVisit: "Confirmo a visita",
      manageOrCancel: "Gerir ou cancelar agendamento",
      openAgenda: "Abrir na agenda",
    },
    bookingConfirmation: {
      subject: "Confirmação da sua visita — {{meeting_date}}",
      heading: "Visita confirmada",
      intro: "A sua visita foi agendada com sucesso.",
    },
    meetingNotify: {
      subject: "Nova reunião agendada — {{lead_name}}",
      heading: "Nova reunião agendada",
      intro: "Foi marcada uma nova visita através do formulário.",
    },
    cancel: {
      clientSubject: "A sua visita foi cancelada",
      technicianSubject: "Visita cancelada — {{lead_name}}",
      heading: "Visita cancelada",
      clientIntro: "A sua visita agendada foi cancelada.",
      technicianIntro: "Uma visita agendada foi cancelada.",
    },
    reschedule: {
      clientSubject: "A sua visita foi reagendada",
      technicianSubject: "Reunião reagendada — {{lead_name}}",
      heading: "Reunião reagendada",
      clientIntro: "A sua visita foi reagendada para a data abaixo.",
      technicianIntro: "Uma visita foi reagendada para a data abaixo.",
    },
    reminder: {
      clientSubject: "Lembrete da sua visita — {{meeting_date}}",
      technicianSubject: "Lembrete: visita a {{lead_name}} — {{meeting_date}}",
      clientHeading: "Lembrete da sua visita",
      technicianHeading: "Lembrete de visita",
      clientIntro: "Este é um lembrete da sua visita agendada.",
      technicianIntro: "Lembrete: tem uma visita agendada com a lead abaixo.",
    },
    confirmationFallbackSubject: "Confirmação",
    invite: {
      subject: "Falta agendar a sua visita técnica gratuita",
      greeting: "Olá,",
      greetingWithName: "Olá {name},",
      heading: "Falta só agendar a sua visita",
      bodyBefore: "Recebemos o seu pedido de orçamento, mas ainda falta escolher a data da sua",
      bodyStrong: "visita técnica gratuita",
      bodyAfter: ". É rápido — escolha o horário que lhe der mais jeito:",
      cta: "Agendar a minha visita",
      ignore: "Se já agendou ou não pretende avançar, pode ignorar este email.",
      unsubscribe: "Já não quero receber estes lembretes",
    },
    sms: {
      companyFallback: "A empresa",
      confirmationBody: "a sua visita está confirmada para {{meeting_date}}.",
      manageCancel: "Gerir/cancelar: {{cancel_url}}",
      reminderHead: "lembrete da sua visita",
      reminderHeadRescheduled: "lembrete da sua visita reagendada",
      reminderTail: "para {{meeting_date}}.",
      confirm: "Confirme: {{confirm_url}}",
      manage: "Gerir: {{cancel_url}}",
    },
    documents: {
      genericClient: "Cliente",
      genericCompany: "a empresa",
      genericTeam: "A equipa",
      docLabels: { proposal: "proposta", quote: "orçamento", contract: "contrato" },
      proposalMail: {
        subject: "Proposta: {title}",
        introWithSender: "{name} enviou-lhe uma proposta para análise.",
        introNoSender: "Foi-lhe enviada uma proposta para análise.",
        valueLabel: "Valor da Proposta",
        validUntil: "Válida até:",
        cta: "Ver Proposta Completa",
        sentAutomatically: "Enviado automaticamente",
      },
      verification: {
        title: "Código de Verificação",
        subjectAccept: "Código de Verificação - Aceitar Proposta",
        subjectReject: "Código de Verificação - Recusar Proposta",
        actionAccept: "aceitar",
        actionReject: "recusar",
        intro: "Olá <strong>{name}</strong>, para {action} a proposta \"<strong>{title}</strong>\", introduza o seguinte código:",
        expires: "Este código expira em 15 minutos.",
        ignore: "Se não solicitou este código, pode ignorar este email.",
      },
      portalAccess: {
        subjectWithCredentials: "Acesso ao Portal — {org}",
        // O «&iacute;» no ASSUNTO e o que o codigo sempre enviou (o assunto e texto simples): mantido de proposito.
        subjectNewDocument: "Nova {doc} dispon&iacute;vel — {org}",
        greeting: "Ol&aacute;, {name}!",
        credentialsIntro: "Foi-lhe criado um acesso ao portal de <strong>{org}</strong>.",
        credentialsDocument: "Tem uma <strong>{doc}</strong> dispon&iacute;vel para consulta: <em>{title}</em>",
        accessLabel: "Aceda ao portal:",
        emailLabel: "Email:",
        passwordLabel: "Password tempor&aacute;ria:",
        changePassword: "Recomendamos que altere a password no primeiro acesso.",
        newDocument: "Tem uma nova <strong>{doc}</strong> dispon&iacute;vel no seu portal: <em>{title}</em>",
        accessAt: "Aceda em:",
        linkedAccount: "Entre com o email e a password que j&aacute; usa no portal. Depois de entrar, escolha <strong>{org}</strong> no seletor de empresa.",
        sentBy: "Enviado por {caller} &mdash; {org}",
      },
      otpSms: "O seu código de verificação é: {code}. Válido por 5 minutos.",
      messages: {
        noPhone: "Não foi encontrado um número de telefone associado à sua conta. Atualize o seu perfil e adicione um telemóvel principal.",
        rateLimit: "Demasiados pedidos. Aguarde alguns minutos antes de tentar novamente.",
        smsFailed: "Falha ao enviar SMS. Tente novamente.",
        expired: "Código expirado ou inválido. Solicite um novo código.",
        maxAttempts: "Número máximo de tentativas excedido. Solicite um novo código.",
        invalidCodeWrong: "Código incorreto.",
        invalidCodeRemaining: "Restam {n} tentativas.",
        invalidCodeRemainingOne: "Restam {n} tentativas.",
        invalidCodeRequestNew: "Solicite um novo código.",
        contractNotSignable: "Este contrato já não está disponível para assinatura.",
        otpRequired: "OTP inválido, expirado ou já utilizado. Peça um novo código.",
        contractCheckUnavailable: "Não foi possível validar o contrato. Tente novamente.",
        signUnavailable: "Não foi possível registar a assinatura. Tente novamente dentro de instantes.",
        reasonLength: "Motivo deve ter entre 10 e 500 caracteres",
        invalidMessage: "Mensagem inválida",
        questionLimit: "Limite de perguntas atingido. Tente novamente mais tarde.",
      },
    },
  },
  en: {
    labels: {
      lead: "Lead",
      phone: "Phone",
      email: "Email",
      client: "Client",
      dateTime: "Date / time",
      address: "Address",
      place: "Location",
      technician: "Technician",
      confirmVisit: "I confirm the visit",
      manageOrCancel: "Manage or cancel booking",
      openAgenda: "Open in calendar",
    },
    bookingConfirmation: {
      subject: "Your visit is confirmed — {{meeting_date}}",
      heading: "Visit confirmed",
      intro: "Your visit has been scheduled successfully.",
    },
    meetingNotify: {
      subject: "New meeting scheduled — {{lead_name}}",
      heading: "New meeting scheduled",
      intro: "A new visit was booked through the form.",
    },
    cancel: {
      clientSubject: "Your visit has been cancelled",
      technicianSubject: "Visit cancelled — {{lead_name}}",
      heading: "Visit cancelled",
      clientIntro: "Your scheduled visit has been cancelled.",
      technicianIntro: "A scheduled visit has been cancelled.",
    },
    reschedule: {
      clientSubject: "Your visit has been rescheduled",
      technicianSubject: "Meeting rescheduled — {{lead_name}}",
      heading: "Meeting rescheduled",
      clientIntro: "Your visit has been rescheduled to the date below.",
      technicianIntro: "A visit has been rescheduled to the date below.",
    },
    reminder: {
      clientSubject: "Reminder of your visit — {{meeting_date}}",
      technicianSubject: "Reminder: visit with {{lead_name}} — {{meeting_date}}",
      clientHeading: "Reminder of your visit",
      technicianHeading: "Visit reminder",
      clientIntro: "This is a reminder of your scheduled visit.",
      technicianIntro: "Reminder: you have a visit scheduled with the lead below.",
    },
    confirmationFallbackSubject: "Confirmation",
    invite: {
      subject: "Your free technical visit is still waiting to be booked",
      greeting: "Hello,",
      greetingWithName: "Hello {name},",
      heading: "Just one step left: book your visit",
      bodyBefore: "We received your quote request, but you still need to choose the date of your",
      bodyStrong: "free technical visit",
      bodyAfter: ". It only takes a minute — pick the time that suits you best:",
      cta: "Book my visit",
      ignore: "If you have already booked or do not wish to proceed, you can ignore this email.",
      unsubscribe: "I no longer want to receive these reminders",
    },
    sms: {
      companyFallback: "The company",
      confirmationBody: "your visit is confirmed for {{meeting_date}}.",
      manageCancel: "Manage/cancel: {{cancel_url}}",
      reminderHead: "reminder of your visit",
      reminderHeadRescheduled: "reminder of your rescheduled visit",
      reminderTail: "on {{meeting_date}}.",
      confirm: "Confirm: {{confirm_url}}",
      manage: "Manage: {{cancel_url}}",
    },
    documents: {
      genericClient: "Client",
      genericCompany: "the company",
      genericTeam: "The team",
      docLabels: { proposal: "proposal", quote: "quote", contract: "contract" },
      proposalMail: {
        subject: "Proposal: {title}",
        introWithSender: "{name} sent you a proposal for review.",
        introNoSender: "A proposal has been sent to you for review.",
        valueLabel: "Proposal value",
        validUntil: "Valid until:",
        cta: "View full proposal",
        sentAutomatically: "Sent automatically",
      },
      verification: {
        title: "Verification Code",
        subjectAccept: "Verification Code - Accept Proposal",
        subjectReject: "Verification Code - Reject Proposal",
        actionAccept: "accept",
        actionReject: "reject",
        intro: "Hello <strong>{name}</strong>, to {action} the proposal \"<strong>{title}</strong>\", please enter the following code:",
        expires: "This code expires in 15 minutes.",
        ignore: "If you did not request this code, you can ignore this email.",
      },
      portalAccess: {
        subjectWithCredentials: "Portal access — {org}",
        subjectNewDocument: "New {doc} available — {org}",
        greeting: "Hello, {name}!",
        credentialsIntro: "An access to the portal of <strong>{org}</strong> has been created for you.",
        credentialsDocument: "You have a <strong>{doc}</strong> available to view: <em>{title}</em>",
        accessLabel: "Access the portal:",
        emailLabel: "Email:",
        passwordLabel: "Temporary password:",
        changePassword: "We recommend that you change your password the first time you log in.",
        newDocument: "You have a new <strong>{doc}</strong> available in your portal: <em>{title}</em>",
        accessAt: "Log in at:",
        linkedAccount: "Log in with the email and password you already use in the portal. Once logged in, choose <strong>{org}</strong> in the company selector.",
        sentBy: "Sent by {caller} &mdash; {org}",
      },
      otpSms: "Your verification code is: {code}. Valid for 5 minutes.",
      messages: {
        noPhone: "No phone number was found for your account. Please update your profile and add a main mobile number.",
        rateLimit: "Too many requests. Please wait a few minutes before trying again.",
        smsFailed: "Failed to send the SMS. Please try again.",
        expired: "The code has expired or is invalid. Please request a new code.",
        maxAttempts: "Maximum number of attempts exceeded. Please request a new code.",
        invalidCodeWrong: "Incorrect code.",
        invalidCodeRemaining: "{n} attempts left.",
        invalidCodeRemainingOne: "{n} attempt left.",
        invalidCodeRequestNew: "Please request a new code.",
        contractNotSignable: "This contract is no longer available for signing.",
        otpRequired: "The code is invalid, expired or has already been used. Please request a new code.",
        contractCheckUnavailable: "The contract could not be validated. Please try again.",
        signUnavailable: "The signature could not be recorded. Please try again in a moment.",
        reasonLength: "The reason must be between 10 and 500 characters",
        invalidMessage: "Invalid message",
        questionLimit: "Question limit reached. Please try again later.",
      },
    },
  },
};

const TIME_ZONE = "Europe/Lisbon";

/**
 * Data/hora de uma visita nos emails e SMS (fuso de Lisboa). Em pt e a chamada de sempre, byte a byte.
 * Em en so as palavras mudam: «Monday, 5 October 2026 at 11:00» (dia, ano e hora como em pt).
 */
export function formatVisitDate(iso: string, lang: unknown, includeYear: boolean): string {
  const date = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  };
  if (normalizeMailLang(lang) === "pt") return date.toLocaleString("pt-PT", opts);

  const part = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const numeric = new Intl.DateTimeFormat("pt-PT", opts).formatToParts(date);
  const words = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "long", month: "long" }).formatToParts(date);
  const year = includeYear ? ` ${part(numeric, "year")}` : "";
  return `${part(words, "weekday")}, ${part(numeric, "day")} ${part(words, "month")}${year} at ${part(numeric, "hour")}:${part(numeric, "minute")}`;
}

/**
 * SMS de confirmacao por omissao (quando o formulario nao tem mensagem para o idioma). Diz sempre que a
 * visita esta CONFIRMADA, tanto no modo «ao marcar» (book-slot) como em «ao confirmar na Agenda»: o que muda
 * entre os modos e QUANDO a mensagem sai, nunca o que diz.
 * `withCancelLink`: a mensagem leva o link de gerir/cancelar ({{cancel_url}}).
 */
export function defaultConfirmationSms(
  lang: MailLang,
  opts: { companyName: string; withCancelLink: boolean },
): string {
  const t = MAIL_TEXTS[lang].sms;
  return `${opts.companyName || t.companyFallback}: ${t.confirmationBody}${opts.withCancelLink ? ` ${t.manageCancel}` : ""}`;
}

/** SMS de lembrete por omissao, com {{variaveis}} para o envio preencher. */
export function reminderSmsText(
  lang: MailLang,
  opts: { companyName: string; rescheduled: boolean; withConfirmLink: boolean; withManageLink: boolean },
): string {
  const t = MAIL_TEXTS[lang].sms;
  const head = opts.rescheduled ? t.reminderHeadRescheduled : t.reminderHead;
  let text = `${opts.companyName || t.companyFallback}: ${head} ${t.reminderTail}`;
  if (opts.withConfirmLink) text += ` ${t.confirm}`;
  if (opts.withManageLink) text += ` ${t.manage}`;
  return text;
}

/** De onde veio o modelo de um email: do idioma da pessoa, da coluna unica (idioma por omissao) ou de lado nenhum. */
export type TemplateSource = "locale" | "column" | "none";

/**
 * Idioma do TEXTO REALMENTE USADO num email ou SMS. As palavras da data seguem este idioma, nao o da pessoa:
 *  - modelo escolhido para o idioma da pessoa      -> o da pessoa;
 *  - modelo da coluna unica (idioma por omissao)   -> o idioma por omissao do formulario (nunca ingles so
 *    porque a pessoa preencheu em ingles);
 *  - sem modelo (texto por omissao do sistema)     -> o da pessoa (en tem versao; os outros caem em pt).
 * `templateUsed` e false quando nao houve modelo utilizavel (nenhum, apagado ou sem corpo): usa-se o texto
 * por omissao, no idioma da pessoa.
 */
export function contentLang(p: {
  source: TemplateSource;
  templateUsed: boolean;
  personLocale: unknown;
  formDefaultLocale: unknown;
}): MailLang {
  if (p.templateUsed && p.source === "column") return normalizeMailLang(p.formDefaultLocale);
  return normalizeMailLang(p.personLocale);
}

/** Idioma por omissao do formulario (forms.settings.i18n.default_locale); sem ele, pt. Em minusculas. */
export function defaultLocaleFromSettings(settings: unknown): string {
  const i18n = settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>).i18n
    : null;
  const value = i18n && typeof i18n === "object" ? (i18n as Record<string, unknown>).default_locale : null;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "pt";
}
