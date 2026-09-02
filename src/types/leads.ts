/**
 * Tipos das Leads.
 *
 * Extraídos de `src/pages/AnewLeads.tsx`, onde viviam a meio de sete mil
 * linhas. O objectivo da extracção NÃO foi mudar comportamento — os tipos
 * saem daqui exactamente como estavam — foi deixar de esconder a dívida
 * descrita abaixo.
 *
 * ---------------------------------------------------------------------------
 * A DÍVIDA: `[key: string]: any`
 * ---------------------------------------------------------------------------
 * Tanto `Lead` como `FieldDefinition` terminam numa assinatura de índice
 * `[key: string]: any`. Essa linha ANULA, como rede de segurança, todos os
 * campos declarados acima dela:
 *
 *   lead.seja_o_que_for        compila (campo que não existe)
 *   lead.statuss               compila (gralha em `status`)
 *   lead.status.toUpperCase()  compila mesmo que o valor seja `null` em
 *                              execução — `any` desliga também a verificação
 *                              de nulos
 *
 * É pior do que um `as any`, e por uma razão estrutural. Um `as any` é local
 * e visível: desliga a verificação numa expressão, e vê-se ali. Isto é global
 * e silencioso: desliga a verificação de TODAS as propriedades, em TODOS os
 * `Lead`, em qualquer ficheiro que importe o tipo — e não entra em contagem
 * nenhuma. Uma auditoria que conte `as any` sente-se completa e deixa isto
 * de fora.
 *
 * Que está a tapar coisas hoje, e não em teoria: `contact_attempts` é lido em
 * cinco sítios de `AnewLeads.tsx` e não está declarado em `Lead`. Não é bug —
 * a coluna existe mesmo na base, e vem em `LEADS_LIST_COLUMNS`. Mas se alguém
 * a renomear, ou escrever `contact_attemps`, o compilador cala-se: o código
 * faz `l.contact_attempts || 0` e o ecrã passa a mostrar "0 tentativas de
 * contacto" para toda a gente, com ar de perfeitamente normal.
 *
 * ---------------------------------------------------------------------------
 * PORQUE É QUE A LINHA NÃO É REMOVIDA AQUI
 * ---------------------------------------------------------------------------
 * No momento em que desaparece, o TypeScript deixa de perdoar e revela de uma
 * vez todos os sítios que leem campos não declarados, ou que leem um campo
 * possivelmente `null` sem o verificar. São dezenas, no caminho crítico do
 * negócio. É projecto próprio, com tempo dedicado — não um item de limpeza a
 * apanhar de passagem.
 */

export interface Lead {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  field_values: Record<string, any> | null;
  status: string;
  source: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  created_by: string | null;
  converted_to_contact_id: string | null;
  converted_at: string | null;
  assigned_to: string | null;
  entity_id?: string | null;
  campaigns?: { id: string; name: string } | null;
  last_contact_result?: string;
  last_contact_at?: string | null;
  converted_to_client_id?: string | null;
  callback_scheduled_at?: string | null;
  callback_notes?: string | null;
  profiles?: { name: string | null } | null;
  assigned_user?: { id: string; name: string | null } | null;
  /** Ver "A DÍVIDA" no topo deste ficheiro antes de acrescentar campos aqui. */
  [key: string]: any;
}

export interface FieldDefinition {
  id: string;
  campaign_id: string | null;
  organization_id?: string | null;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  options: any;
  sort_order: number;
  contact_field_mapping: string | null;
  client_field_mapping: string | null;
  placeholder?: string;
  help_text?: string;
  display_style?: string;
  /** Ver "A DÍVIDA" no topo deste ficheiro antes de acrescentar campos aqui. */
  [key: string]: any;
}
