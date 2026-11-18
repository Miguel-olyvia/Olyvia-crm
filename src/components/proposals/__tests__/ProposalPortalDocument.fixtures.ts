// Cenários partilhados pelos testes de idioma do ProposalPortalDocument (pt de sempre e inglês).
// As datas usam o meio do dia para não mudarem de dia com o fuso da máquina.
const line = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  descricao_snapshot: `Artigo ${id}`,
  qt: 2,
  retail_price_unit: 50,
  total_sem_iva: 100,
  iva_percent: 23,
  ...over,
});

const baseProposal = {
  id: "p1",
  title: "Remodelação da cozinha",
  proposal_number: "P-2026-001",
  created_at: "2026-03-05T12:00:00",
  valid_until: "2026-04-15T12:00:00",
  status: "sent",
  value: 246,
};

const commercial = { name: "Rita Costa", phone: "912345678", email: "rita@exemplo.pt" };
const company = { name: "Mudelar Lda" };

export const singleQuote = {
  proposal: baseProposal,
  template: null,
  quotes: [{ id: "q1", quote_number: "Q-1", estado: "enviado", total: 1246.5, desconto_global_percent: 10 }],
  quoteLines: { q1: [line("a", { total_sem_iva: 1000, retail_price_unit: 500 }), line("b", { total_sem_iva: 50, qt: 1, retail_price_unit: 50 })] },
  quoteFees: { q1: [{ id: "f1", calculated_value: 20, vat_rate: 0, service_fee_types: null }] },
  commercial,
  company,
  mode: "portal" as const,
  canActOnProposal: true,
  onSendOtp: () => {},
  onDownloadPdf: () => {},
};

export const multiQuotes = {
  ...singleQuote,
  quotes: [
    { id: "q1", quote_number: "Q-1", estado: "enviado", total: 123 },
    { id: "q2", quote_number: "Q-2", estado: "aceite", total: 246 },
    { id: "q3", quote_number: "Q-3", estado: "rejeitado", total: 90 },
  ],
  quoteLines: {
    q1: [line("a1"), line("a2", { section_name: "Cozinha" })],
    q2: [line("b1")],
    q3: [line("c1")],
  },
  quoteFees: {},
};

export const multiSectionsOneQuote = {
  ...singleQuote,
  quotes: [{ id: "q1", quote_number: "Q-1", estado: "enviado", total: 246 }],
  quoteLines: { q1: [line("a"), line("b", { section_name: "Casa de banho", total_sem_iva: 40, retail_price_unit: 40, qt: 1 })] },
  quoteFees: {
    q1: [{ id: "f1", calculated_value: 20, vat_rate: 23, service_fee_types: { name: "Deslocação" } }],
  },
};

export const acceptedProposal = {
  ...singleQuote,
  proposal: {
    ...baseProposal,
    status: "accepted",
    accepted_at: "2026-03-10T14:30:00",
    acceptance_ip: "10.0.0.7",
  },
  canActOnProposal: false,
};

export const rejectedProposal = {
  ...singleQuote,
  proposal: { ...baseProposal, status: "rejected", rejected_at: "2026-03-11T09:15:00" },
  canActOnProposal: false,
};

export const configuredTemplate = {
  ...singleQuote,
  canActOnProposal: false,
  proposal: { ...baseProposal, description: "<p>Obra completa</p>", notes: "<p>Nota interna</p>", client: { name: "Ana Silva", email: "ana@exemplo.pt", phone: "910000000" } },
  template: {
    header_text: "<p>Cabeçalho da organização</p>",
    terms_conditions: "<p>Pagamento a 30 dias</p>",
    footer_text: "<p>Obrigado pela preferência</p>",
    sections: [
      { id: "h", type: "header", label: "Cabeçalho", visible: true, settings: {} },
      { id: "c", type: "client_info", label: "Cliente", visible: true, settings: {} },
      { id: "d", type: "description", label: "Descrição do trabalho", visible: true, settings: {} },
      { id: "n", type: "notes", label: "Notas", visible: true, settings: { sectionLabel: "OBSERVAÇÕES DA ORGANIZAÇÃO" } },
      { id: "v", type: "validity", label: "Validade", visible: true, settings: {} },
      { id: "t", type: "terms", label: "Condições Gerais", visible: true, settings: {} },
      { id: "f", type: "footer", label: "Rodapé", visible: true, settings: { showTitle: true, sectionLabel: "Rodapé" } },
    ],
  },
};

export const fallbackTemplateWithTexts = {
  ...singleQuote,
  canActOnProposal: false,
  template: { terms_conditions: "<p>Pagamento a 30 dias</p>", footer_text: "<p>Obrigado pela preferência</p>" },
};

export const otpProps = { otpStep: "input" as const, otpCode: "12", maskedPhone: "9*****123", otpCooldown: 30 };

/** Todos os cenários, para correr o mesmo conjunto em pt e em en. */
export const cenarios: Record<string, Record<string, unknown>> = {
  single: { ...singleQuote },
  singleIdle: { ...singleQuote, otpStep: "idle" },
  singleInput: { ...singleQuote, ...otpProps },
  singleSending: { ...singleQuote, otpStep: "sending" },
  singleVerifying: { ...singleQuote, otpStep: "verifying" },
  singleVerified: { ...singleQuote, otpStep: "verified" },
  singleError: { ...singleQuote, otpStep: "idle", otpError: "Erro X" },
  singlePreview: { ...singleQuote, mode: "preview", statusLabel: "Rascunho" },
  multi: { ...multiQuotes },
  multiSections: { ...multiSectionsOneQuote },
  accepted: { ...acceptedProposal },
  rejected: { ...rejectedProposal },
  configured: { ...configuredTemplate },
  fallback: { ...fallbackTemplateWithTexts },
};
