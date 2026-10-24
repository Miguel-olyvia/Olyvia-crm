-- ============================================================================
-- "Não atendeu" é o resultado de UMA CHAMADA, não a posição da lead no negócio
--
-- Depende de:
--   20261204040000_lead_rules_normaliza_e_valida.sql   (as regras passaram a ser
--       mesmo avaliadas; até aí o motor ignorava-as e o `status` literal era a
--       única coisa que decidia a etapa)
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- `lead_contact_results.workflow_next_status` faz o resultado de um contacto
-- ESCREVER POR CIMA de `anew_leads.status`. Uma lead que estava em "Qualified"
-- e não atende o telefone passa a `no_answer`: o campo deixa de dizer em que pé
-- está o negócio e passa a dizer como correu a última chamada. São duas coisas
-- diferentes a partilhar o mesmo campo, e a segunda apaga a primeira.
--
-- Não há nenhuma escrita literal de 'no_answer' em todo o código — nem em src/,
-- nem nas edge functions, nem nas migrações. O valor chega à coluna só por esta
-- configuração, aplicada em AnewLeadContactDialog.tsx (statusToSet).
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO ANTES DE ESCREVER ESTE FICHEIRO
-- ---------------------------------------------------------------------------
--
--   F1. LINHAS AFECTADAS — as três são GLOBAIS (organization_id IS NULL),
--       partilhadas por todas as empresas:
--
--         2e3e06cf-6593-4eb1-88a7-c6ab09b076f4  Não Atendeu  -> no_answer
--         6e3f3a9d-8868-40dc-95db-c2c52f523491  Ocupado      -> no_answer
--         473bfaec-c084-4310-b725-23be0672a955  Voicemail    -> no_answer
--
--       Nenhuma organização tem linha própria com `no_answer`. Esta migração
--       actua por VALOR (workflow_next_status = 'no_answer') e não por id, para
--       apanhar também linhas criadas entretanto.
--
--   F2. VOLUME — na Mudelar, "Não Atendeu" foi registado 8648 vezes (1006 nos
--       últimos 30 dias) e "Ocupado" 8. É de longe o resultado mais usado, e
--       por isso a maior fonte de estados destruídos. 1425 leads da Mudelar e 5
--       da BMGest estão neste momento paradas em `no_answer`.
--
--   F3. O QUE ACONTECE COM O CAMPO VAZIO — em AnewLeadContactDialog.tsx:899:
--
--         const statusToSet =
--           selectedResult?.workflow_next_status && !isAutoLossTransition
--             ? selectedResult.workflow_next_status
--             : (newStatus || lead.status);
--
--       Com `workflow_next_status` NULL cai no ramo da direita. `newStatus` é
--       inicializado com `lead.status` e o diálogo já não tem seletor manual de
--       estado, logo `statusToSet === lead.status` e `statusChanged` fica false.
--       Desde 2d769e8 o `status` nem sequer entra no payload do UPDATE quando
--       não muda. Resultado: o estado da lead fica exactamente como estava.
--
--   F4. O CONTACTO CONTINUA REGISTADO, em três sítios que nada têm a ver com o
--       funil e que esta migração não toca:
--         - `entity_interactions` — a chamada e o resultado, na cronologia
--         - `anew_leads.last_contact_result` — o último resultado (há filtro na
--           lista por este campo)
--         - `anew_leads.contact_attempts` — incrementa; aparece como "N tentativas"
--       A escrita em `status` era a única das quatro que APAGAVA informação.
--
--   F5. O MOTOR JÁ TEM A PEÇA CERTA — `evaluate_condition` suporta
--       `last_contact_result_is` e `last_contact_is_negative`, e os sinais são
--       calculados a partir de `entity_interactions`, não do `status`. Quem
--       quiser que "não atendeu" mova a lead escreve-o como REGRA no editor do
--       funil, por organização, em vez de o impor globalmente a toda a gente.
--       A BMGest já tem exactamente isso na etapa "Lost / Rejected".
--
--   F6. QUEM CONSOME A COLUNA — só `AnewLeadContactDialog.tsx` (a aplicação do
--       mapeamento) e `LeadContactResults.tsx` (o CRUD onde se configura).
--       Nenhuma função, trigger, view ou edge function da base de dados lê
--       `workflow_next_status`. Esta migração não pode partir nada do lado do
--       servidor.
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--   D1. Só os três de `no_answer`. "Pediu Callback"
--       (7404dd90-…, -> callback_scheduled) NÃO é tocado: escreve também
--       `callback_scheduled_at` e há um painel de callbacks do dia que depende
--       desse estado. Mexer-lhe é uma decisão separada.
--
--   D2. "Número Errado" e "Não Interessado" (-> rejected) também NÃO são
--       tocados, por duas razões. O código já os ignora de propósito
--       (isAutoLossTransition, em AnewLeadContactDialog.tsx:896: uma lead só vai
--       para perdida pelo modal "Editar Lead", que pede motivo). E o efeito
--       desejado já acontece pelo caminho certo: o motor move a lead quando a
--       regra da etapa de rejeição bate — confirmado em produção na BMGest.
--
--   D3. Actua por VALOR e não por id (F1), e é idempotente: correr duas vezes
--       não faz nada da segunda.
--
--   D4. Guarda-se o estado anterior em
--       public.lead_contact_results_backup_20261204 antes do UPDATE, com RLS
--       ligada e sem políticas (invisível via PostgREST). O SQL de reversão
--       está no fim do ficheiro.
--
--   D5. NÃO se toca em nenhuma lead. As 1430 que já estão em `no_answer` ficam
--       onde estão — repor-lhes o estado é uma operação de dados separada, com
--       as suas próprias decisões (uma lead cujo motor diz "Lost/Rejected" não
--       pode ser posta em `rejected` por script sem motivo de perda). Esta
--       migração só fecha a torneira.
-- ============================================================================

-- ── GUARDA: as linhas têm de estar onde as deixámos.
DO $guarda$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.lead_contact_results
   WHERE workflow_next_status = 'no_answer';

  IF v_n = 0 THEN
    RAISE NOTICE 'Nada a fazer: nenhum resultado de contacto com workflow_next_status = no_answer.';
  ELSE
    RAISE NOTICE 'GUARDA: % resultado(s) de contacto a corrigir.', v_n;
  END IF;
END;
$guarda$;

-- ── RELATÓRIO antes de mexer.
DO $relatorio$
DECLARE
  r record;
BEGIN
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'RESULTADOS DE CONTACTO QUE FORÇAM no_answer — estado ANTES';
  RAISE NOTICE '===========================================================';
  FOR r IN
    SELECT name, workflow_next_status, is_active,
           CASE WHEN organization_id IS NULL THEN 'GLOBAL' ELSE 'da organização' END AS ambito
      FROM public.lead_contact_results
     WHERE workflow_next_status = 'no_answer'
     ORDER BY name
  LOOP
    RAISE NOTICE '  "%" (%) % -> %', r.name, r.ambito,
      CASE WHEN r.is_active THEN 'activo' ELSE 'inactivo' END, r.workflow_next_status;
  END LOOP;
  RAISE NOTICE '===========================================================';
END;
$relatorio$;

-- ── Cópia de segurança (D4).
CREATE TABLE IF NOT EXISTS public.lead_contact_results_backup_20261204 (
  result_id                  uuid PRIMARY KEY,
  workflow_next_status_antes text,
  alterado_em                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_contact_results_backup_20261204 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_contact_results_backup_20261204 FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.lead_contact_results_backup_20261204 TO service_role;

COMMENT ON TABLE public.lead_contact_results_backup_20261204 IS
  'Cópia de lead_contact_results.workflow_next_status ANTES da migração '
  '20261204110000, que deixou "Não Atendeu"/"Ocupado"/"Voicemail" de escrever '
  'por cima do estado da lead. Existe só para permitir voltar atrás; o SQL de '
  'reversão está no fim dessa migração. PODE SER REMOVIDA (DROP TABLE) assim '
  'que a correcção estiver validada.';

INSERT INTO public.lead_contact_results_backup_20261204 (result_id, workflow_next_status_antes)
SELECT id, workflow_next_status
  FROM public.lead_contact_results
 WHERE workflow_next_status = 'no_answer'
ON CONFLICT (result_id) DO NOTHING;

-- ── A alteração.
UPDATE public.lead_contact_results
   SET workflow_next_status = NULL,
       updated_at = now()
 WHERE workflow_next_status = 'no_answer';

-- ── Verificação pós-UPDATE.
DO $verifica$
DECLARE
  v_resta  integer;
  v_backup integer;
  v_outros integer;
BEGIN
  SELECT count(*) INTO v_resta
    FROM public.lead_contact_results WHERE workflow_next_status = 'no_answer';

  IF v_resta > 0 THEN
    RAISE EXCEPTION 'Restaram % resultado(s) a forçar no_answer.', v_resta;
  END IF;

  -- Os outros mapeamentos TÊM de continuar intactos (D1, D2).
  SELECT count(*) INTO v_outros
    FROM public.lead_contact_results
   WHERE workflow_next_status IN ('contacted', 'visit_scheduled', 'callback_scheduled', 'rejected');

  IF v_outros < 6 THEN
    RAISE EXCEPTION
      'Esperava pelo menos 6 resultados com outros mapeamentos intactos, encontrei %. '
      'A migração tocou em mais do que devia.', v_outros;
  END IF;

  SELECT count(*) INTO v_backup FROM public.lead_contact_results_backup_20261204;

  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'PÓS-UPDATE: 0 resultados a forçar no_answer; % guardado(s) no backup.', v_backup;
  RAISE NOTICE '% resultado(s) com outros mapeamentos, intactos (Pediu Callback, '
               'Número Errado, Não Interessado, Atendeu, Interessado, Visita Agendada).', v_outros;
  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'NENHUMA LEAD FOI ALTERADA (D5). As que já estão em no_answer ficam '
               'onde estão; esta migração só impede que se criem mais. O contacto '
               'continua a ser registado na cronologia, em last_contact_result e em '
               'contact_attempts — só deixa de apagar a posição da lead no funil.';
  RAISE NOTICE '===========================================================';
END;
$verifica$;

-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
--   UPDATE public.lead_contact_results r
--      SET workflow_next_status = b.workflow_next_status_antes
--     FROM public.lead_contact_results_backup_20261204 b
--    WHERE b.result_id = r.id;
--
-- Depois de validada a correcção:
--   DROP TABLE public.lead_contact_results_backup_20261204;
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. O mapeamento como ficou:
--      SELECT name, COALESCE(workflow_next_status, '(nenhum)'), is_negative
--        FROM public.lead_contact_results ORDER BY sort_order;
--
-- 2. No ecrã: registar um contacto "Não Atendeu" numa lead que esteja em
--    "Qualified" e confirmar que ela CONTINUA em Qualified, com a tentativa
--    registada na cronologia e o contador de tentativas a subir.
--
-- 3. Quem quiser que "não atendeu" mova a lead: Leads -> Workflow -> Estágios
--    -> a etapa -> Regras -> "Último resultado de contacto é ...". Por
--    organização, como deve ser.
