-- Limpar as tabelas de cópia de segurança que ficaram no schema public.
--
-- NÃO HÁ VOLTA ATRÁS. Um DROP TABLE apaga a tabela e as linhas; se depois se
-- quiser reverter uma das correcções abaixo, a cópia já não existe. Por isso,
-- ANTES de aplicar: correr a contagem e exportar o que tiver linhas (ver
-- "ANTES DE APLICAR", mais abaixo).
--
-- DE ONDE VIERAM
--
-- Cada uma foi criada como rede de segurança de uma correcção de dados, para a
-- poder desfazer. Todas as correcções estão validadas em produção e nenhuma
-- destas tabelas é lida pelo frontend (src/) nem pelas Edge Functions
-- (supabase/functions/) — só aparecem nos tipos gerados
-- (src/integrations/supabase/types.ts) e nas migrações que as criaram.
--
--   Contas de portal / fichas duplicadas da Mudelar (17/11):
--     anew_users_ligacao_ficha_backup      -- 20261117040000_copia_de_seguranca_ligacao_conta_ficha.sql
--                                             (usada por 20261117050000 e 20261117080000)
--     anew_entities_apagadas_backup        -- 20261117080000_apagar_as_fichas_duplicadas_do_portal.sql
--     anew_entity_emails_apagados_backup   -- 20261117080000_apagar_as_fichas_duplicadas_do_portal.sql
--     ATENÇÃO: anew_users_ligacao_ficha_backup guarda também as 10 contas com
--     a_corrigir = false (cinco fichas com DUAS contas), que ficaram à espera de
--     decisão da Mudelar. Se essa decisão ainda não foi tomada, exportar esta
--     tabela é obrigatório antes de a apagar. POR ISSO NÃO É APAGADA AQUI (ver o fim).
--
--   Regras e estados das leads (04/12):
--     lead_workflow_stages_rules_backup_20261204           -- 20261204040000_lead_rules_normaliza_e_valida.sql
--     lead_workflow_stages_rules_backup_20261204_etapas56  -- 20261204050000_lead_regras_mudelar_corrige_etapas_5_6.sql
--     lead_pipeline_settings_backup_20261204_etapas56      -- 20261204050000_lead_regras_mudelar_corrige_etapas_5_6.sql
--     lead_contact_results_backup_20261204                 -- 20261204110000_resultado_de_contacto_deixa_de_forcar_no_answer.sql
--     (essas migrações já diziam, no fim: "Depois de validada a correcção:
--      DROP TABLE ..." — o DROP ficou só em comentário e nunca foi aplicado.)
--
--     anew_leads_status_backup_20261204_conversao
--     anew_leads_status_backup_20261204_no_answer
--     anew_leads_status_backup_20261204_rejeicao
--     anew_leads_workflow_stage_backup_20261204
--     anew_leads_workflow_stage_backup_20261204_bmgest
--     (estas cinco não estão em nenhuma migração do repositório: foram criadas à
--      mão no SQL Editor, nas correcções de estado/etapa das leads de 04/12.
--      Só se sabe delas pelos tipos gerados.)
--
-- Fica DE FORA, de propósito: lead_contact_history_deprecated e qualquer outra
-- tabela que não esteja nesta lista.
--
-- ANTES DE APLICAR
--
-- 1. Contar as linhas de cada uma (funciona mesmo que alguma já não exista):
--
--   SELECT t.nome,
--          CASE WHEN to_regclass('public.' || t.nome) IS NULL THEN NULL
--               ELSE (xpath('/row/c/text()',
--                       query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.nome),
--                                    false, true, '')))[1]::text::bigint
--          END AS linhas
--     FROM unnest(ARRAY[
--       'anew_leads_status_backup_20261204_conversao',
--       'anew_leads_status_backup_20261204_no_answer',
--       'anew_leads_status_backup_20261204_rejeicao',
--       'anew_leads_workflow_stage_backup_20261204',
--       'anew_leads_workflow_stage_backup_20261204_bmgest',
--       'lead_contact_results_backup_20261204',
--       'lead_workflow_stages_rules_backup_20261204',
--       'lead_workflow_stages_rules_backup_20261204_etapas56',
--       'lead_pipeline_settings_backup_20261204_etapas56',
--       'anew_entities_apagadas_backup',
--       'anew_entity_emails_apagados_backup',
--       'anew_users_ligacao_ficha_backup'
--     ]) AS t(nome)
--    ORDER BY t.nome;
--
--    (linhas = NULL quer dizer que a tabela já não existe.)
--
-- 2. Exportar as que tiverem linhas. No SQL Editor do Supabase:
--      SELECT * FROM public.<nome>;   -> "Download CSV"
--    ou, com psql:
--      \copy public.<nome> TO '<nome>.csv' CSV HEADER
--
-- COMO RECUPERAR, SE FOR PRECISO
--
-- Recriar a tabela a partir do CREATE TABLE da migração de origem (indicada
-- acima; para as cinco anew_leads_*, a partir das colunas em types.ts),
-- importar o CSV exportado (\copy public.<nome> FROM '<nome>.csv' CSV HEADER)
-- e correr o SQL de reversão que está no fim da migração de origem.
--
-- SEGURANÇA
--
-- Sem CASCADE: se alguma vista ou objecto depender de uma destas tabelas, o
-- DROP falha e a transacção inteira é desfeita, em vez de levar coisas à frente
-- sem se ver.

BEGIN;

-- Leads: estado e etapa (criadas à mão, 04/12)
DROP TABLE IF EXISTS public.anew_leads_status_backup_20261204_conversao;
DROP TABLE IF EXISTS public.anew_leads_status_backup_20261204_no_answer;
DROP TABLE IF EXISTS public.anew_leads_status_backup_20261204_rejeicao;
DROP TABLE IF EXISTS public.anew_leads_workflow_stage_backup_20261204;
DROP TABLE IF EXISTS public.anew_leads_workflow_stage_backup_20261204_bmgest;

-- Leads: regras, funil e resultados de contacto (migrações de 04/12)
DROP TABLE IF EXISTS public.lead_contact_results_backup_20261204;
DROP TABLE IF EXISTS public.lead_workflow_stages_rules_backup_20261204;
DROP TABLE IF EXISTS public.lead_workflow_stages_rules_backup_20261204_etapas56;
DROP TABLE IF EXISTS public.lead_pipeline_settings_backup_20261204_etapas56;

-- Portal da Mudelar: fichas duplicadas e ligação conta-ficha (17/11)
DROP TABLE IF EXISTS public.anew_entity_emails_apagados_backup;
DROP TABLE IF EXISTS public.anew_entities_apagadas_backup;
-- anew_users_ligacao_ficha_backup FICA de fora: tem as 10 contas à espera de decisão da
-- Mudelar. Apagar só numa migração própria, depois dessa decisão e de exportar.

COMMIT;
