/**
 * Tipos das Leads.
 *
 * Extraídos de `src/pages/AnewLeads.tsx`, onde viviam a meio de sete mil linhas.
 *
 * ---------------------------------------------------------------------------
 * ESTAS INTERFACES NÃO TÊM ASSINATURA DE ÍNDICE. NÃO ACRESCENTE UMA.
 * ---------------------------------------------------------------------------
 * Até 2026-09-02 ambas terminavam em `[key: string]: any`, o que ANULAVA como
 * rede de segurança todos os campos declarados acima: `lead.statuss` compilava,
 * `lead.campo_inventado` compilava, e `lead.status.toUpperCase()` compilava
 * mesmo com `null` em execução.
 *
 * O que isso escondeu, durante meses: o cartão "Associações" do detalhe da lead
 * lia `lead.contacts` e `lead.clients` — dois campos que nenhuma consulta traz.
 * Eram sempre `undefined`, o cartão dizia sempre "Não convertida" mesmo em leads
 * convertidas, e ninguém deu por isso porque o sintoma parecia uma resposta
 * normal. Sem a assinatura de índice, o compilador teria recusado a linha no
 * momento em que foi escrita.
 *
 * Se um campo é lido, declare-o aqui. Se não é declarado, é porque não existe.
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
  /** Quantas vezes se tentou contactar. Lido na lista, no detalhe, e incrementado
   *  ao registar um contacto. */
  contact_attempts?: number | null;
  /** Etiqueta SQL/MQL do cabeçalho, visível só quando a lead está em "Qualified".
   *  O tipo literal vem da CHECK constraint da base; o gerador de tipos do
   *  Supabase não a conhece e declara `string`, daí o cast no ponto de fronteira. */
  qualification_type?: 'sql' | 'mql' | null;
  /** Escrito ao criar Pedidos, Orçamentos e Propostas a partir da lead.
   *  NOTA: pelo contrato work-orgs (Fase 4, migração 20260926010000) este campo
   *  deixou de ser filtro de visibilidade e devia deixar de ser escrito — mas os
   *  caminhos de escrita do frontend ficaram explicitamente fora desse âmbito
   *  (Fase 3, por fazer). Declarado porque ainda é lido, não porque deva ficar. */
  root_organization_id?: string | null;
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
}
