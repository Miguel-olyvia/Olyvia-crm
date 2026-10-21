-- ============================================================
-- 20261226200000_neg_classificar_lead
-- ============================================================
-- Decisão do utilizador (21/10, ponto 12): classificar MQL ou SQL grava SÓ a
--   classificação, e não a lead inteira.
--
-- O problema: a ficha de Pessoas classifica pela partilhada rpc_update_lead
--   (useQualificarLeadPessoa.ts), que regrava a linha toda (campos, estado,
--   origem, notas, responsável): o ecrã lê a lead e devolve-a tal como está,
--   e uma alteração feita por outra pessoa entre a leitura e a escrita perde-se.
--
-- O que faz: cria public.neg_classificar_lead(p_organization_id uuid,
--   p_lead_id uuid, p_tipo text) -> jsonb, nossa, que muda só
--   qualification_type (p_tipo 'mql', 'sql' ou nulo para limpar), com os
--   efeitos legítimos de rpc_update_lead (lida no remoto a 21/10, md5
--   f6606607b667bc43cf9956fbfa49d87e) e só esses:
--     qualified_at          a primeira classificação (now() se estava nula e
--                           p_tipo não é nulo; senão fica)
--     qualification_set_by  quem mudou (current_business_user_id)
--     updated_at            now() (o gatilho set_anew_leads_updated_at também)
--     auditoria             uma linha por fn_manual_audit_log, com o diff de
--                           qualification_type, e o gatilho genérico calado
--                           (app.audit_bypass), como rpc_update_lead; o valor
--                           anterior de app.audit_bypass repõe-se logo a seguir.
--                           Lido no remoto a 21/10 (só leitura): o gatilho
--                           genérico (trg_audit_anew_leads, AFTER UPDATE por
--                           linha) só se cala com app.audit_bypass = 'on', por
--                           isso repor '' o liga outra vez (como em
--                           rpc_update_lead); dispara no fim do UPDATE, antes
--                           de se repor. anew_entity_history não tem gatilhos,
--                           por isso repor antes do INSERT não escreve nada a
--                           mais. A auditoria feita por fn_manual_audit_log é
--                           SECURITY DEFINER e engole erros por dentro (como em
--                           rpc_update_lead): pode faltar a linha de auditoria
--                           em silêncio; o histórico, não.
--     histórico             uma linha em anew_entity_history
--                           (qualification_changed), só quando a lead tem
--                           entidade
--   Não há coluna de versão em anew_leads. Não toca em notas, estado, origem,
--   campos, responsável nem nome, e não cria interacções.
--   Classificar com o valor que já tem não escreve nada ('mudou' false).
--   Devolve {mudou, qualificacao_tipo, qualificado_em}.
--   Permissão e âmbito: INVOKER. Ler a lead pede a política anew_leads_select
--   (leads.view com âmbito); trancá-la (FOR UPDATE) e gravá-la pedem a
--   política anew_leads_update: leads.edit, organização CRM de quem chama e a
--   chave de âmbito (organização inteira, comercial ou quem criou).
--   NOTA: é MAIS estrito do que rpc_update_lead, que é SECURITY DEFINER e só
--   verifica que quem chama é membro da organização (fn_lead_org_in_scope),
--   sem leads.edit nem âmbito. Passam a ficar de fora, para esta função:
--     (1) quem hoje classifica sem leads.edit;
--     (2) quem pertence só à organização-raiz e hoje classifica leads de
--         filiais: rpc_update_lead aceita-o (fn_lead_org_in_scope com
--         root_organization_id), esta função exige organization_id = a
--         organização pedida e dentro de get_user_crm_org_ids de quem chama, e
--         ele recebe NG003 ou 42501;
--     (3) quem tem leads.edit mas não tem a pessoa da lead no seu âmbito (o
--         histórico exige is_entity_in_user_scope): recebe NG027.
--   Os três pontos vão ao utilizador antes de ligar a bandeira
--   CLASSIFICAR_LEAD_ATIVO. Provar na nike, com contas de âmbito organização,
--   equipa e «só os meus».
--   Erros: NG009 (valores), 42501 (sem sessão ou sem perfil de utilizador, ou
--   sem leads.edit sobre esta lead), NG003 (lead que não existe, apagada, de
--   outra organização ou fora do âmbito de leitura), NG027 (o histórico da
--   pessoa da lead foi recusado pela RLS: leads.edit passou mas a pessoa está
--   fora do âmbito; sem este código seria um 42501 igual ao de «sem leads.edit»
--   e o ecrã diria a coisa errada). NG027 e não NG026: NG026 é da migration
--   20261226210000. O ecrã traduz o NG027 em errosNeg.ts e pessoasErros.ts.
--   rpc_update_lead NÃO é tocada (a página de Leads continua a usá-la).
--   EXECUTE só para authenticated; search_path fixo.
--
-- Desempenho: duas leituras da lead pela chave primária, um UPDATE de uma
--   linha e dois INSERT de uma linha; nenhuma leitura de catálogo na função.
--   Medido na nike a 21/10 (só leitura): ver o relatório.
--
-- MUDELAR: nada. Função nova; nenhuma tabela, política nem função existente
--   muda. Só a usa quem a chamar (a ficha de Pessoas).
-- PRECISA DE CÓDIGO? Não parte nada. Para servir, useQualificarLeadPessoa.ts
--   passa a chamar neg_classificar_lead(organização, lead, tipo) em vez de
--   ler a lead e chamar rpc_update_lead (deixa de precisar da leitura e de
--   withAuditContext). Regenerar os tipos do Supabase.
-- ORDEM: independente das outras.
-- Pré-condição: a função ainda não existe; rpc_update_lead é a lida a 21/10.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226200000_neg_classificar_lead.sql).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_classificar_lead') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_classificar_lead já existe; nada feito.';
  END IF;
  -- As regras replicadas são as de rpc_update_lead lida no remoto a 21/10.
  IF pg_catalog.to_regprocedure('public.rpc_update_lead(uuid,jsonb,text,text,text,uuid,boolean,uuid,text,text,text,text,boolean,text)') IS NULL
     OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.rpc_update_lead(uuid,jsonb,text,text,text,uuid,boolean,uuid,text,text,text,text,boolean,text)')))
        IS DISTINCT FROM 'f6606607b667bc43cf9956fbfa49d87e' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: rpc_update_lead mudou desde 21/10; rever as regras antes de aplicar; nada feito.';
  END IF;
  IF pg_catalog.to_regprocedure('public.fn_manual_audit_log(text,uuid,uuid,text,jsonb,text,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.current_business_user_id()') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam funções de auditoria; nada feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%NG027%') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: o código NG027 já está em uso; nada feito.';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.anew_leads'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attname::text IN ('qualification_type', 'qualified_at', 'qualification_set_by',
                                'updated_at', 'deleted_at', 'entity_id', 'organization_id')) <> 7
     OR (SELECT count(*) FROM pg_catalog.pg_attribute a
         WHERE a.attrelid = 'public.anew_entity_history'::regclass AND a.attnum > 0 AND NOT a.attisdropped
           AND a.attname::text IN ('entity_id', 'change_type', 'field_name', 'old_value', 'new_value',
                                   'changed_by', 'metadata')) <> 7 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam colunas em anew_leads ou anew_entity_history; nada feito.';
  END IF;
END
$pre$;

-- ============================================================
-- neg_classificar_lead
-- ============================================================

CREATE FUNCTION public.neg_classificar_lead(p_organization_id uuid, p_lead_id uuid, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_antes  public.anew_leads;
  v_lead   public.anew_leads;
  v_bypass text;
BEGIN
  IF p_organization_id IS NULL OR p_lead_id IS NULL
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('mql', 'sql')) THEN
    RAISE EXCEPTION 'Valor inválido: organização, lead ou classificação (mql, sql ou nula).'
      USING ERRCODE = 'NG009';
  END IF;

  v_actor := public.current_business_user_id();
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Sem sessão ou sem perfil de utilizador: não é possível classificar a lead.' USING ERRCODE = '42501';
  END IF;

  -- 1. A lead, como quem chama a vê (política anew_leads_select: leads.view
  --    com âmbito), presa à organização pedida.
  PERFORM 1 FROM public.anew_leads l
  WHERE l.id = p_lead_id AND l.organization_id = p_organization_id AND l.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 2. Tranca a linha. Com RLS, FOR UPDATE só devolve a linha se a política
  --    anew_leads_update (leads.edit com âmbito: organização inteira, comercial
  --    ou quem criou) também a deixar: vista mas não editável dá 42501.
  SELECT l.* INTO v_antes
  FROM public.anew_leads l
  WHERE l.id = p_lead_id AND l.organization_id = p_organization_id AND l.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão para classificar esta lead (leads.edit).' USING ERRCODE = '42501';
  END IF;

  -- 3. Já está assim: não se escreve nada.
  IF v_antes.qualification_type IS NOT DISTINCT FROM p_tipo THEN
    RETURN jsonb_build_object('mudou', false,
                              'qualificacao_tipo', v_antes.qualification_type,
                              'qualificado_em', v_antes.qualified_at);
  END IF;

  -- 4. Só as colunas da classificação, com as regras de rpc_update_lead
  --    (p_qualification_changed = true): qualified_at fica a primeira vez que
  --    a lead foi classificada (não muda ao trocar nem ao limpar);
  --    qualification_set_by é quem mudou. O gatilho de auditoria genérico fica
  --    calado (app.audit_bypass), como em rpc_update_lead, porque a linha de
  --    auditoria é escrita à mão a seguir; o valor anterior repõe-se logo.
  v_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);
  UPDATE public.anew_leads l
     SET qualification_type   = p_tipo,
         qualified_at         = CASE WHEN p_tipo IS NOT NULL AND l.qualified_at IS NULL
                                     THEN now() ELSE l.qualified_at END,
         qualification_set_by = v_actor,
         updated_at           = now()
   WHERE l.id = v_antes.id
  RETURNING l.* INTO v_lead;
  PERFORM set_config('app.audit_bypass', COALESCE(v_bypass, ''), true);
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para classificar esta lead (leads.edit).' USING ERRCODE = '42501';
  END IF;

  -- 5. Uma linha de auditoria, no formato de rpc_update_lead (só a
  --    qualificação, a única coluna com significado que mudou).
  PERFORM public.fn_manual_audit_log(
    'anew_leads',
    COALESCE(v_lead.entity_id, v_lead.id),
    v_lead.organization_id,
    'UPDATE',
    jsonb_build_object('anew_leads', jsonb_build_object('qualification_type',
      jsonb_build_object('old', to_jsonb(v_antes.qualification_type),
                         'new', to_jsonb(v_lead.qualification_type)))),
    'web_app');

  -- 6. O histórico de qualificação (anew_entity_history), como em
  --    rpc_update_lead, mas só com entidade e sem engolir erros: a função é
  --    INVOKER e a política de inserção pede a entidade no âmbito de quem
  --    chama; se falhar, nada fica gravado (a classificação inteira volta
  --    atrás) em vez de ficar sem histórico em silêncio. A recusa da RLS aqui
  --    é uma regra diferente da de leads.edit (a pessoa fora do âmbito), por
  --    isso sai com código próprio, NG027, e não como o 42501 do passo 2.
  IF v_lead.entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history
        (entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES
        (v_lead.entity_id, 'qualification_changed', 'qualification_type',
         v_antes.qualification_type, v_lead.qualification_type, v_actor,
         jsonb_build_object('organization_id', v_lead.organization_id, 'lead_id', v_lead.id));
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Sem permissão sobre a pessoa desta lead: não é possível classificá-la.'
        USING ERRCODE = 'NG027';
    END;
  END IF;

  RETURN jsonb_build_object('mudou', true,
                            'qualificacao_tipo', v_lead.qualification_type,
                            'qualificado_em', v_lead.qualified_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_classificar_lead(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_classificar_lead(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.neg_classificar_lead(uuid, uuid, text) IS
  'Pessoas: classifica a lead (MQL, SQL ou limpar) gravando só a classificação: qualification_type, qualified_at (a primeira), qualification_set_by e updated_at, uma linha de auditoria e o histórico (anew_entity_history), com as regras de rpc_update_lead, que não é tocada. INVOKER: exige leads.edit com âmbito (política anew_leads_update). NG003, NG009, NG027, 42501. 20261226200000.';

-- ============================================================
-- CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  v_txt text;
BEGIN
  -- Atributos (INVOKER, VOLATILE, dono postgres, search_path), privilégios
  -- (EXECUTE só para o dono e authenticated: sem anon, PUBLIC nem
  -- service_role), a versão desta migration, uma só assinatura, e
  -- rpc_update_lead intacta.
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES ('public.neg_classificar_lead(uuid,uuid,text)')) AS e(sig)
            LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR p.provolatile::text <> 'v'
               OR pg_catalog.pg_get_userbyid(p.proowner)::text <> 'postgres'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
               OR md5(pg_catalog.pg_get_functiondef(p.oid)) IS DISTINCT FROM '6dfb660dc775801fb51dd79a47c8c1f2');
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_classificar_lead') <> 1 THEN
    v_txt := COALESCE(v_txt || ', ', '') || 'mais do que uma neg_classificar_lead';
  END IF;
  IF md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.rpc_update_lead(uuid,jsonb,text,text,text,uuid,boolean,uuid,text,text,text,text,boolean,text)')))
       IS DISTINCT FROM 'f6606607b667bc43cf9956fbfa49d87e' THEN
    v_txt := COALESCE(v_txt || ', ', '') || 'rpc_update_lead mudou';
  END IF;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (neg_classificar_lead): %', v_txt;
  END IF;
END
$conferir$;

COMMIT;
