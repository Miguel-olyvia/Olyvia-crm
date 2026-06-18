import type { NodeCategory, CustomNodeType, FlowTemplate } from "./types";
import { MarkerType } from "@xyflow/react";

/* ═══════════════ Default Categories ═══════════════ */

export const DEFAULT_CATEGORIES: NodeCategory[] = [
  { id: "cat_triggers", name: "⚡ Triggers", order: 0 },
  { id: "cat_logic", name: "🔀 Lógica", order: 1 },
  { id: "cat_actions", name: "▶️ Acções", order: 2 },
  { id: "cat_end", name: "🏁 Fim", order: 3 },
];

/* ═══════════════ Default Node Types ═══════════════ */

export const DEFAULT_NODE_TYPES: CustomNodeType[] = [
  // ── Triggers ──
  {
    id: "nt_trigger_phase",
    name: "Trigger Mudança de Fase",
    emoji: "⚡",
    color: "#7c3aed",
    categoryId: "cat_triggers",
    behaviorType: "trigger",
    isDefault: true,
    fields: [
      { id: "f1", name: "Módulo", type: "dropdown", options: ["Leads", "Contactos", "Propostas", "Deals", "Orçamentos", "Contratos", "Clientes"], required: true, order: 0 },
      { id: "f2", name: "Evento", type: "dropdown", options: ["Mudança de Fase", "Entidade Criada", "Campo Alterado", "Sem Atividade", "Data Atingida", "Email Evento"], required: true, order: 1 },
      { id: "f3", name: "Fase", type: "dropdown", options: ["Novo", "Qualificado", "Proposta", "Negociação", "Ganho", "Perdido"], required: false, order: 2 },
    ],
  },
  // ── Lógica ──
  {
    id: "nt_condition",
    name: "Condição",
    emoji: "🔀",
    color: "#d97706",
    categoryId: "cat_logic",
    behaviorType: "condition",
    isDefault: true,
    fields: [
      { id: "f4", name: "Campo", type: "dropdown", options: ["Valor", "Estado", "Comercial", "Health Score", "Dias sem contacto"], required: true, order: 0 },
      { id: "f5", name: "Operador", type: "dropdown", options: ["Maior que", "Menor que", "Igual", "Diferente", "Contém", "Está vazio"], required: true, order: 1 },
      { id: "f6", name: "Valor", type: "text", required: true, order: 2 },
    ],
  },
  {
    id: "nt_delay",
    name: "Delay",
    emoji: "⏱️",
    color: "#64748b",
    categoryId: "cat_logic",
    behaviorType: "delay",
    isDefault: true,
    fields: [
      { id: "f7", name: "Duração", type: "number", required: true, defaultValue: "24", order: 0 },
      { id: "f8", name: "Unidade", type: "dropdown", options: ["Minutos", "Horas", "Dias", "Semanas"], required: true, defaultValue: "Horas", order: 1 },
      { id: "f9", name: "Parar se", type: "dropdown", options: ["Nenhuma", "Estado mudou", "Email respondido", "Deal fechado"], required: false, defaultValue: "Nenhuma", order: 2 },
    ],
  },
  // ── Acções ──
  {
    id: "nt_send_email",
    name: "Enviar Email",
    emoji: "📧",
    color: "#2563eb",
    categoryId: "cat_actions",
    behaviorType: "action",
    isDefault: true,
    fields: [
      { id: "f10", name: "Template", type: "dropdown", options: ["Boas-vindas", "Follow-up", "Proposta", "Agradecimento", "Personalizado"], required: true, order: 0 },
      { id: "f11", name: "Assunto", type: "text", required: false, order: 1 },
      { id: "f12", name: "Conteúdo", type: "textarea", required: false, order: 2 },
    ],
  },
  {
    id: "nt_notification",
    name: "Notificação",
    emoji: "🔔",
    color: "#2563eb",
    categoryId: "cat_actions",
    behaviorType: "action",
    isDefault: true,
    fields: [
      { id: "f13", name: "Destinatário", type: "dropdown", options: ["Comercial atribuído", "Gestor", "Admin", "Todos"], required: true, order: 0 },
      { id: "f14", name: "Mensagem", type: "textarea", required: true, order: 1 },
    ],
  },
  {
    id: "nt_create_entity",
    name: "Criar Entidade",
    emoji: "📄",
    color: "#2563eb",
    categoryId: "cat_actions",
    behaviorType: "action",
    isDefault: true,
    fields: [
      { id: "f15", name: "Tipo", type: "dropdown", options: ["Deal", "Orçamento", "Tarefa", "Nota", "Actividade"], required: true, order: 0 },
      { id: "f16", name: "Nome", type: "text", required: false, order: 1 },
      { id: "f17", name: "Detalhes", type: "textarea", required: false, order: 2 },
    ],
  },
  {
    id: "nt_change_phase",
    name: "Mudar Fase",
    emoji: "📊",
    color: "#2563eb",
    categoryId: "cat_actions",
    behaviorType: "action",
    isDefault: true,
    fields: [
      { id: "f18", name: "Módulo", type: "dropdown", options: ["Leads", "Deals", "Propostas", "Contratos"], required: true, order: 0 },
      { id: "f19", name: "Nova Fase", type: "text", required: true, order: 1 },
    ],
  },
  // ── Fim ──
  {
    id: "nt_end_success",
    name: "Fim Sucesso",
    emoji: "✅",
    color: "#059669",
    categoryId: "cat_end",
    behaviorType: "end",
    isDefault: true,
    fields: [
      { id: "f20", name: "Nota", type: "text", required: false, order: 0 },
    ],
  },
  {
    id: "nt_end_stop",
    name: "Fim Parar",
    emoji: "🛑",
    color: "#dc2626",
    categoryId: "cat_end",
    behaviorType: "end",
    isDefault: true,
    fields: [
      { id: "f21", name: "Motivo", type: "text", required: false, order: 0 },
    ],
  },
];

/* ═══════════════ Default Flow Templates ═══════════════ */

const edgeStyle = { stroke: "#94a3b8", strokeWidth: 2 };
const edgeMark = { type: MarkerType.ArrowClosed, color: "#94a3b8" };
const e = (id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string, label?: string) => ({
  id, source, target,
  ...(sourceHandle ? { sourceHandle } : {}),
  ...(targetHandle ? { targetHandle } : {}),
  type: "smoothstep" as const,
  style: edgeStyle,
  markerEnd: edgeMark,
  ...(label ? { label, labelStyle: { fill: "#e2e8f0", fontSize: 9, fontWeight: 700 }, labelBgStyle: { fill: "#1a1a2e", fillOpacity: 0.9 } } : {}),
});

const p = (id: string, label: string, x: number, y: number, w = 140, h = 50) => ({
  id, type: "bpmnProcess" as const, position: { x, y },
  style: { width: w, height: h },
  data: { label, bgColor: "#f97316", textColor: "#ffffff", fontSize: 11 },
});

const d = (id: string, label: string, x: number, y: number, w = 100, h = 100) => ({
  id, type: "bpmnDecision" as const, position: { x, y },
  style: { width: w, height: h },
  data: { label, bgColor: "#1e293b", textColor: "#ffffff", fontSize: 10 },
});

const sl = (id: string, label: string, x: number, y: number, w: number, h: number) => ({
  id, type: "swimLane" as const, position: { x, y },
  style: { width: w, height: h },
  zIndex: -10,
  data: { label, bgColor: "#64748b", textColor: "#94a3b8", fontSize: 14 },
});

export const DEFAULT_TEMPLATES: FlowTemplate[] = [
  {
    id: "tpl_pipeline",
    name: "Pipeline Comercial",
    description: "Flow básico de qualificação de leads com condição e email",
    isDefault: true,
    createdAt: new Date().toISOString(),
    nodes: [
      { id: "t1", type: "dynamicNode", position: { x: 400, y: 40 }, data: { nodeTypeId: "nt_trigger_phase", title: "Quando Lead Qualifica", fieldValues: { f1: "Leads", f2: "Mudança de Fase", f3: "Qualificado" } } },
      { id: "t2", type: "dynamicNode", position: { x: 370, y: 200 }, data: { nodeTypeId: "nt_condition", title: "Valor > 5000?", fieldValues: { f4: "Valor", f5: "Maior que", f6: "5000" } } },
      { id: "t3", type: "dynamicNode", position: { x: 200, y: 380 }, data: { nodeTypeId: "nt_send_email", title: "Email Boas-vindas", fieldValues: { f10: "Boas-vindas" } } },
      { id: "t4", type: "dynamicNode", position: { x: 530, y: 380 }, data: { nodeTypeId: "nt_notification", title: "Notificar Gestor", fieldValues: { f13: "Gestor", f14: "Lead qualificado com valor alto" } } },
      { id: "t5", type: "dynamicNode", position: { x: 370, y: 540 }, data: { nodeTypeId: "nt_end_success", title: "Sucesso", fieldValues: {} } },
    ],
    edges: [
      { id: "te1", source: "t1", target: "t2", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" } },
      { id: "te2", source: "t2", sourceHandle: "yes", target: "t3", animated: true, style: { stroke: "#22c55e", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#22c55e" }, label: "SIM", labelStyle: { fill: "#22c55e", fontSize: 10, fontWeight: 700 }, labelBgStyle: { fill: "#1a1a2e", fillOpacity: 0.9 } },
      { id: "te3", source: "t2", sourceHandle: "no", target: "t4", animated: true, style: { stroke: "#ef4444", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#ef4444" }, label: "NÃO", labelStyle: { fill: "#ef4444", fontSize: 10, fontWeight: 700 }, labelBgStyle: { fill: "#1a1a2e", fillOpacity: 0.9 } },
      { id: "te4", source: "t3", target: "t5", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" } },
      { id: "te5", source: "t4", target: "t5", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" } },
    ],
  },
  {
    id: "tpl_followup",
    name: "Follow-up Proposta",
    description: "Enviar follow-up automático após proposta sem resposta",
    isDefault: true,
    createdAt: new Date().toISOString(),
    nodes: [
      { id: "f1", type: "dynamicNode", position: { x: 400, y: 40 }, data: { nodeTypeId: "nt_trigger_phase", title: "Proposta Enviada", fieldValues: { f1: "Propostas", f2: "Mudança de Fase" } } },
      { id: "f2", type: "dynamicNode", position: { x: 400, y: 200 }, data: { nodeTypeId: "nt_delay", title: "Esperar 3 dias", fieldValues: { f7: "3", f8: "Dias", f9: "Email respondido" } } },
      { id: "f3", type: "dynamicNode", position: { x: 400, y: 380 }, data: { nodeTypeId: "nt_send_email", title: "Follow-up Email", fieldValues: { f10: "Follow-up" } } },
      { id: "f4", type: "dynamicNode", position: { x: 400, y: 540 }, data: { nodeTypeId: "nt_end_success", title: "Fim", fieldValues: {} } },
    ],
    edges: [
      { id: "fe1", source: "f1", target: "f2", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" } },
      { id: "fe2", source: "f2", target: "f3", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" } },
      { id: "fe3", source: "f3", target: "f4", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" } },
    ],
  },
  /* ═══════════════ Fluxo Organizacional Completo ═══════════════ */
  {
    id: "tpl_org_flow",
    name: "Fluxo Organizacional Completo",
    description: "Fluxo BPMN completo com todos os departamentos: Planeamento, Financeiro, Marketing, Comercial, Legal, RH, Logística, Qualidade, Compras e Operações",
    isDefault: true,
    createdAt: new Date().toISOString(),
    nodes: [
      // ── Início ──
      { id: "inicio", type: "bpmnStartEnd", position: { x: 100, y: 20 }, style: { width: 120, height: 50 }, data: { label: "Início", subType: "start", bgColor: "#3b82f6", textColor: "#ffffff" } },

      // ═══ SWIM LANES ═══
      sl("sl_plan", "Planeamento Estratégico e Liderança", 30, 100, 560, 180),
      sl("sl_fin", "Financeiro", 610, 100, 900, 180),
      sl("sl_mkt", "Marketing", 30, 300, 560, 120),
      sl("sl_com", "Comercial", 30, 440, 560, 120),
      sl("sl_legal", "Legal", 610, 300, 900, 260),
      sl("sl_rh", "RH", 30, 580, 780, 160),
      sl("sl_log", "Logística", 30, 760, 330, 140),
      sl("sl_qual", "Qualidade", 380, 760, 280, 140),
      sl("sl_compras", "Compras", 30, 920, 660, 100),
      sl("sl_ops", "Operações", 30, 1040, 660, 100),

      // ═══ PLANEAMENTO ESTRATÉGICO ═══
      p("pe_analise", "Análise de Contexto", 60, 150, 140, 45),
      p("pe_swot", "SWOT", 220, 150, 80, 45),
      p("pe_benchmarking", "Benchmarking e\nObjectivos de Redes\nSociais/Mkt", 60, 210, 150, 55),
      p("pe_riscos", "Riscos e Oportunidades", 260, 210, 140, 45),
      p("pe_plano_acoes", "Plano de Ações para\nRisket NIO", 420, 210, 140, 45),
      p("pe_plano_est", "Plano Estratégico", 440, 150, 120, 45),
      p("pe_budget", "Budget Anual", 580, 150, 100, 45),

      // ═══ FINANCEIRO ═══
      p("fin_faturacao", "Faturação", 640, 150, 110, 45),
      d("fin_sucesso", "Sucesso de\nCobrança?", 770, 135, 90, 90),
      p("fin_pagamentos", "Pagamentos", 940, 140, 120, 45),
      p("fin_recebimentos", "Recebimentos", 940, 200, 120, 45),
      p("fin_mov_finan", "Movimentos Financ. e\nRelações Públicas", 1080, 150, 150, 45),
      p("fin_reconciliacao", "Reconciliação de Bancos", 1250, 150, 140, 45),
      p("fin_provisao", "Provisão & Incentivos\nde Gestão e\nBudget e Igov", 1250, 210, 150, 55),
      p("fin_contabilidade", "Contabilidade", 1420, 150, 110, 45),

      // ═══ MARKETING ═══
      p("mkt_inbound", "Inbound", 160, 350, 100, 40),
      p("mkt_plano_mkt", "Plano de Mkt", 50, 380, 110, 40),
      p("mkt_outbound", "Outbound/Estruturado", 160, 400, 140, 40),

      // ═══ COMERCIAL ═══
      p("com_outbound", "Outbound Direto", 60, 490, 120, 40),
      p("com_gestao", "Gestão de Contratos", 200, 490, 120, 40),
      p("com_orcamento", "Orçamentação", 340, 490, 110, 40),
      p("com_negociacao", "Negociação", 470, 490, 100, 40),
      d("com_adjudicado", "Adjudicado?", 530, 460, 80, 80),

      // ═══ LEGAL ═══
      p("leg_contencioso", "Contencioso", 700, 370, 110, 40),
      d("leg_sucesso", "Sucesso?", 830, 355, 80, 80),
      p("leg_laboral", "Laboral", 950, 390, 100, 40),
      p("leg_gestao_contratos", "Gestão de Contratos", 1020, 440, 140, 40),
      p("leg_dpo", "Gestão de\nProcuradoria/RGPD", 1050, 350, 150, 45),
      p("leg_societario", "Societário ou\nAcionistas", 1180, 370, 120, 45),
      p("leg_societario_main", "Societário", 1180, 430, 100, 40),
      p("leg_compliance", "Compliance", 1330, 350, 110, 40),
      p("leg_gestao_reestrutura", "Gestão de\nRestruturações/Insolvência", 1330, 390, 160, 45),
      p("leg_rep_legais", "Requisitos Legais e RC", 1330, 450, 140, 40),
      p("leg_canal_denuncia", "Canal de Denúncia", 1400, 470, 110, 40),
      p("leg_autorizacoes", "Gestão de Autorizações", 1400, 500, 120, 40),

      // ═══ RH ═══
      d("rh_necessidade", "Há colaboradores\nsuficientes?", 60, 630, 100, 100),
      p("rh_recrutamento", "Recrutamento &\nSeleção", 180, 650, 130, 45),
      p("rh_criar_portal", "Criar Portal de Candidato/Colaborador", 220, 610, 180, 35),
      p("rh_onboarding", "Onboarding", 330, 650, 100, 40),
      p("rh_formacao", "Formação e\nDesenvolvimento", 450, 650, 120, 45),
      p("rh_avaliacao", "Avaliação de\nDesempenho", 590, 650, 120, 45),
      d("rh_bom_desemp", "Bom desempenho?", 660, 600, 90, 90),
      p("rh_offboarding", "Offboarding", 730, 650, 100, 40),

      // ═══ LOGÍSTICA ═══
      d("log_equipamento", "Há equipamento,\nmaterial, carro\nambulário, viatura?", 60, 810, 110, 110),

      // ═══ COMPRAS ═══
      p("comp_aquisicao", "Aquisição de\nOrçamentos,\nMateriais e Prodatos", 60, 960, 140, 55),
      p("comp_q1", "QS", 220, 970, 60, 35),
      p("comp_q2", "QS", 300, 970, 60, 35),
      p("comp_q3", "RFp", 380, 970, 60, 35),
      p("comp_comparacao", "Comparação Termos X\nComercial", 460, 965, 140, 45),
      p("comp_adjudicacao", "Adjudicação", 620, 970, 100, 35),

      // ═══ OPERAÇÕES ═══
      p("ops_planeamento", "Planeamento", 60, 1080, 110, 40),
      p("ops_execucao", "Execução", 190, 1080, 100, 40),
      p("ops_controlo", "Controlo Qualidade", 310, 1080, 120, 40),
      p("ops_entrega", "Entrega", 450, 1080, 100, 40),
      p("ops_fecho", "Fecho de Projeto", 570, 1080, 110, 40),
    ],
    edges: [
      // Início → Planeamento
      e("e_ini_pe", "inicio", "pe_analise", "s-bottom", "t-top"),

      // Planeamento chain
      e("e_pe1", "pe_analise", "pe_swot", "s-right", "t-left"),
      e("e_pe2", "pe_analise", "pe_benchmarking", "s-bottom", "t-top"),
      e("e_pe3", "pe_swot", "pe_riscos", "s-bottom", "t-top"),
      e("e_pe4", "pe_riscos", "pe_plano_acoes", "s-right", "t-left"),
      e("e_pe5", "pe_plano_acoes", "pe_plano_est", "s-top", "t-bottom"),
      e("e_pe5b", "pe_plano_est", "pe_budget", "s-right", "t-left"),

      // Financeiro chain
      e("e_fin1", "pe_budget", "fin_faturacao", "s-right", "t-left"),
      e("e_fin2", "fin_faturacao", "fin_sucesso", "s-right", "t-left"),
      e("e_fin3", "fin_sucesso", "fin_pagamentos", "s-right", "t-left"),
      e("e_fin4", "fin_sucesso", "fin_recebimentos", "yes", "t-left"),
      e("e_fin5", "fin_pagamentos", "fin_mov_finan", "s-right", "t-left"),
      e("e_fin6", "fin_mov_finan", "fin_reconciliacao", "s-right", "t-left"),
      e("e_fin7", "fin_reconciliacao", "fin_provisao", "s-bottom", "t-top"),
      e("e_fin8", "fin_reconciliacao", "fin_contabilidade", "s-right", "t-left"),

      // Marketing chain
      e("e_mkt1", "pe_benchmarking", "mkt_plano_mkt", "s-bottom", "t-top"),
      e("e_mkt2", "mkt_plano_mkt", "mkt_inbound", "s-right", "t-left"),
      e("e_mkt3", "mkt_plano_mkt", "mkt_outbound", "s-right", "t-left"),

      // Marketing → Comercial
      e("e_mkt_com1", "mkt_inbound", "com_outbound", "s-bottom", "t-top"),
      e("e_mkt_com2", "mkt_outbound", "com_outbound", "s-bottom", "t-top"),

      // Comercial chain
      e("e_com1", "com_outbound", "com_gestao", "s-right", "t-left"),
      e("e_com2", "com_gestao", "com_orcamento", "s-right", "t-left"),
      e("e_com3", "com_orcamento", "com_negociacao", "s-right", "t-left"),
      e("e_com4", "com_negociacao", "com_adjudicado", "s-right", "t-left"),

      // Comercial → Legal
      e("e_com_leg", "com_adjudicado", "leg_contencioso", "s-right", "t-left"),

      // Legal chain
      e("e_leg1", "leg_contencioso", "leg_sucesso", "s-right", "t-left"),
      e("e_leg2", "leg_sucesso", "leg_laboral", "yes", "t-left"),
      e("e_leg3", "leg_laboral", "leg_gestao_contratos", "s-bottom", "t-top"),
      e("e_leg4", "leg_gestao_contratos", "leg_dpo", "s-right", "t-left"),
      e("e_leg5", "leg_dpo", "leg_societario", "s-right", "t-left"),
      e("e_leg6", "leg_societario", "leg_societario_main", "s-bottom", "t-top"),
      e("e_leg7", "leg_societario", "leg_compliance", "s-right", "t-left"),
      e("e_leg8", "leg_compliance", "leg_gestao_reestrutura", "s-bottom", "t-top"),
      e("e_leg9", "leg_gestao_reestrutura", "leg_rep_legais", "s-bottom", "t-top"),
      e("e_leg10", "leg_rep_legais", "leg_canal_denuncia", "s-right", "t-left"),
      e("e_leg11", "leg_canal_denuncia", "leg_autorizacoes", "s-bottom", "t-top"),

      // RH chain
      e("e_rh1", "rh_necessidade", "rh_recrutamento", "s-right", "t-left"),
      e("e_rh2", "rh_recrutamento", "rh_onboarding", "s-right", "t-left"),
      e("e_rh3", "rh_onboarding", "rh_formacao", "s-right", "t-left"),
      e("e_rh4", "rh_formacao", "rh_avaliacao", "s-right", "t-left"),
      e("e_rh5", "rh_avaliacao", "rh_bom_desemp", "s-right", "t-left"),
      e("e_rh6", "rh_bom_desemp", "rh_offboarding", "s-right", "t-left"),

      // Compras chain
      e("e_comp1", "comp_aquisicao", "comp_q1", "s-right", "t-left"),
      e("e_comp2", "comp_q1", "comp_q2", "s-right", "t-left"),
      e("e_comp3", "comp_q2", "comp_q3", "s-right", "t-left"),
      e("e_comp4", "comp_q3", "comp_comparacao", "s-right", "t-left"),
      e("e_comp5", "comp_comparacao", "comp_adjudicacao", "s-right", "t-left"),

      // Operações chain
      e("e_ops1", "ops_planeamento", "ops_execucao", "s-right", "t-left"),
      e("e_ops2", "ops_execucao", "ops_controlo", "s-right", "t-left"),
      e("e_ops3", "ops_controlo", "ops_entrega", "s-right", "t-left"),
      e("e_ops4", "ops_entrega", "ops_fecho", "s-right", "t-left"),

      // Cross-department connections
      e("e_com_rh", "com_adjudicado", "rh_necessidade", "yes", "t-top"),
      e("e_rh_log", "rh_offboarding", "log_equipamento", "s-bottom", "t-top"),
      e("e_log_comp", "log_equipamento", "comp_aquisicao", "s-bottom", "t-top"),
      e("e_comp_ops", "comp_adjudicacao", "ops_planeamento", "s-bottom", "t-top"),
    ],
  },
];
