-- ============================================================
-- 20261226220000_nike_negocios_das_cadeias_de_documentos
-- ============================================================
-- Migração de DADOS, só na nike (b6ffce4f-f630-4933-833a-008649757a33). Não cria nem altera tabelas, funções,
-- gatilhos, políticas nem grants. Não toca na Mudelar nem em nenhuma outra organização: todas as leituras e
-- escritas levam o organization_id da nike ou os ids listados abaixo, que são da nike.
--
-- O que faz
--   Cria um negócio (tipo de fecho: contrato) por cada cadeia de documentos JÁ LIGADOS entre si (orçamento ->
--   proposta -> contrato, pelas colunas quotes.proposal_id, client_contracts.proposal_id/quote_id e
--   replaces_contract_id) e liga-lhe os documentos vivos da cadeia, chamando neg_criar_negocio (a mesma função
--   da página Pessoas) com a lista de registos. Não escreve directamente em negocios nem nos documentos.
--   Nenhum negócio é dado como perdido pela migração e nenhuma prova se inventa: os ganhos e os alertas vêm só
--   dos gatilhos de decisão (fn_neg_decidir_negocio), pelas regras que já existem (T11: ao ligar um contrato já
--   assinado, ganha se tiver prova P1/P2/P3; sem prova fica aberto com o alerta sem_prova; ligar um documento
--   recusado ou cancelado não faz nada).
--
-- Contagem lida no remoto a 21/10 (só leitura, como postgres, com o filtro da nike):
--   65 documentos vivos (orçamentos, propostas e contratos), 35 cadeias; 17 cadeias sem pessoa (entity_id nulo);
--   18 com pessoa: 8 só com 1 documento e 10 com 2 ou mais (28 documentos). Dessas 10, 3 não passam a regra de
--   criar negócio (NG003) e 3 esbarram na RLS de proposals (abaixo). ENTRAM HOJE 4 cadeias, 10 documentos,
--   4 negócios: 1 ganho (prova P1) e 1 aberto com alerta sem_prova.
--   O pedido falava de 11 cadeias elegíveis com 25 documentos, 2 ganhas e 1 sem_prova. A diferença: a segunda
--   «ganha» era a cadeia 03ddaa6f (contrato assinado com P3), cuja pessoa 58ee1e3c não está ligada à nike
--   (NG003); e as cadeias 1, 3 e 6 não passam a RLS.
--
--   As 7 cadeias da lista (negócio com id fixo; pessoa; registos por esta ordem). Fecho contrato em todas.
--   1. 66b396f2-583c-41dc-8063-77fb60866ed4  pessoa 71ca861c-5991-448c-a0ef-e9cf3a458138  FICA DE FORA (RLS)
--      proposta 539c0650-000f-44cc-99d0-ea5d5dfed42a (accepted, sem prova); contratos
--      50498f59-131b-4d4a-a525-f825948ee3af (pending_signature), 03dc5730-3f78-4e48-8a00-ed440fc0cbef
--      (cancelled, substituído), 91b0c413-2d67-4d69-bc95-b45f14b5c112 (draft, substituto). Dois contratos activos
--      na mesma proposta: iriam para o mesmo negócio. Dono: fallback (proposta atribuída a ee9d1613).
--   2. c83b45ec-5a39-44a9-8223-c1c061d72ca0  pessoa 14077caf-287c-498d-bf88-aeb351241779  ENTRA
--      proposta bdcb7927-9ec7-4a62-8098-58a0f1c7efa7 (accepted, sem prova); contratos
--      4e8a5a0e-e104-4540-98e0-eaccc4b8e5ed (signed, SEM prova), 077e07a2-4f3e-4f23-835b-69cc8c10b115 (cancelled).
--      Resultado: aberto com alerta sem_prova. Dono: ba0b0ebf (atribuído do contrato assinado).
--   3. d9216335-3f74-4d64-97d5-72d36e8f62b7  pessoa 7a1f669c-dd39-4238-81aa-dbfe3814d402  FICA DE FORA (RLS)
--      proposta 7e6da1fb-c2ad-4235-980f-845a4c9455c0 (draft); contratos 085bd7aa-0fa7-4d05-b95b-1af310cfe81a
--      (draft), 2c76aaa7-90cc-4b19-9ae8-e14dac2b6adb (cancelled), e300a0c1-7d06-40f2-8a92-710b1da005f0 (cancelled,
--      substituído), 331a11d4-74f9-457b-9098-0b4aa791da67 (pending_signature, substituto). Dois contratos activos
--      na mesma proposta: iriam para o mesmo negócio. Dono: fallback (proposta atribuída a 2d01716b).
--   4. 041c6b9e-17b2-4dee-995c-7f4e9b90c68f  pessoa 723e7e27-0a2e-4076-9093-7f6e6459fb51  ENTRA
--      proposta 22f86c13-e87b-44b9-9c22-b2c105d521ae (accepted, P1); contrato b879e587-ec67-432b-837d-d51fef5773e0
--      (signed, P1). Resultado: GANHO pelo contrato (P1, canal portal). Dono: ba0b0ebf (atribuído do contrato).
--   5. afe8f436-9790-4f3f-8bd9-2c7592c15c0f  pessoa e14b3d77-be54-47b9-ae60-a2c971fc8f6f  ENTRA
--      proposta 38dd2b1a-185c-4e08-99b3-733d8155b072 (draft); contratos 516f7729-26b0-48b6-8947-6bae4beac64b
--      (cancelled), 2c09b7d8-20fc-4823-a0de-931b92eaf37a (pending_signature). Resultado: aberto, sem alerta.
--      Dono: ba0b0ebf (atribuído da proposta).
--   6. 6383ae36-d87d-4112-9ecf-5b27db7a8f6d  pessoa 71ca861c-5991-448c-a0ef-e9cf3a458138  FICA DE FORA (RLS)
--      proposta 3f74c3fb-367b-4819-8cb0-8f75f6cc8e06 (accepted, sem prova); contrato
--      e491a4c5-936e-451e-9760-b94eaf417315 (draft). Dono: fallback (proposta atribuída a ee9d1613).
--   7. c41f5845-e6b0-4797-9f38-13adf583929f  pessoa b9265a89-53f3-40b7-8f35-1c5effca909d  ENTRA
--      orçamento d7b43749-f1e7-4acf-aed8-98dc058d74c5 (aceite); proposta abf50bed-9dba-4dd5-ba11-6865228b3d14
--      (sent). Resultado: aberto, sem alerta. Dono: FALLBACK (proposta atribuída a ee9d1613, sem pessoas.edit).
--
--   RLS de proposals (cadeias 1, 3 e 6): a política de UPDATE exige can_write_proposal_row(created_by, org) e o
--   utilizador de fallback tem proposals.edit com âmbito OWNED na nike (sem linha ORG em
--   anew_membership_permission_scopes): só escreve propostas criadas por ele, e estas foram criadas por ee9d1613
--   e 2d01716b. neg_ligar_registo falharia com 42501 e abortaria tudo. A migração verifica isto no plano, com a
--   sessão do dono, e deixa essas cadeias de fora com o motivo; se o âmbito mudar antes do push, entram sozinhas.
--   O mesmo bloqueio existe hoje na acção «Ligar registos» da página Pessoas para este utilizador.
--
--   Cadeias fora da lista, com o motivo:
--   - NG003 (pessoa sem ligação à nike e/ou sem lead nem cliente vivo na nike):
--     03ddaa6f-dffc-4faf-bed1-017fb908279f (pessoa 58ee1e3c-8a64-4e4d-bde7-3c3890411d56; proposta 5b6ec75f,
--       contrato 03ddaa6f signed P3; tem cliente vivo, mas não está ligada à nike);
--     04231a2c-2a6d-46d7-a3f2-332b78b2b7e1 (pessoa 996b9560-f365-4ec5-8465-332d75d94e11; orçamento 04231a2c,
--       proposta c640d576, contrato 878e697c; sem ligação, sem lead nem cliente);
--     77bcb89c-7547-4458-8b9a-7a5f1c6c681e (pessoa 2b158de4-bda4-4474-83e2-b24a205d3a80; orçamento cef1ef4e,
--       proposta 77bcb89c; sem ligação, sem lead nem cliente).
--   - Só 1 documento vivo (8 cadeias com pessoa): 429a1730 (orçamento), 4e1a7176, 6afae2f3, 7e304cc7, f5be62dc,
--     f7fd7dd6 (propostas), 72c21d3a, 9b5f6c99 (contratos).
--   - Sem pessoa (17 cadeias, 24 documentos): 1230c6e8, 1493a942, 1ee5ed5f, 2e1c8b1c, 2e767bb7, 32718045,
--     32a65de2, 3923057f, 48c561bc, 535d7256, 643d4397, 6459bb19, 7d96de52, 825287df, 93382ff8, a1b6272c,
--     ba68bc44 (id do primeiro documento de cada cadeia).
--
-- Dono de cada negócio (created_by, pela sessão, e assigned_to): a pessoa a quem os documentos estão
--   atribuídos (assigned_to do contrato assinado não substituído; senão da proposta; senão do orçamento), como o
--   utilizador pediu («no nome de quem tem esses orçamentos, proposta e contrato assigned to»), desde que seja
--   membro activo da nike com pessoas.edit e pessoas.create (negocios_insert exige pessoas.create) e com âmbito
--   pessoas.edit sobre a pessoa (chave nike:* ou nike:<comercial ou criador de uma lead ou cliente vivo dela),
--   lido com a sessão desse utilizador. Senão, FALLBACK: o super_admin da nike carvalhomiguel319 (anew_users
--   ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2, email carvalhomiguel319@..., papel super_admin activo na nike,
--   pessoas.edit e pessoas.create com chave nike:*; confirmado por select a 21/10). Dos que entram, caiu no
--   fallback a cadeia 7 (e cairiam a 1, a 3 e a 6). Se nem o fallback servir, a cadeia fica de fora.
--   Nenhum outro utilizador ligado a estes documentos (ee9d1613, 2d01716b, a66e470b, 45134576, 19382a2b,
--   9bc95e0c) tem pessoas.edit na nike.
--
-- Como liga (sem DO)
--   1. Como postgres, um quadro temporário (_neg_mig_cadeias, ON COMMIT DROP) com o plano: as 7 cadeias da lista
--      VALUES, os documentos relidos na nike, o dono escolhido e o motivo de exclusão. Uma cadeia só é elegível
--      se TODOS os seus documentos existirem vivos na nike, da mesma pessoa, sem negocio_id, criados antes da
--      activação de Pessoas (NG024), nenhum contrato por assinar sem orçamento nem proposta (NG014), o negócio
--      com o id fixo não existir, a pessoa passar NG003, a lead aberta da pessoa (se houver) não estar
--      encerrada (NG002: não se reabre a abordagem), houver dono válido e o dono puder escrever as propostas
--      (RLS). Numa base reconstruída do zero os documentos não existem: nenhuma cadeia é elegível e nada se faz.
--      IDEMPOTENTE: com os documentos já ligados (ou o negócio já criado) a cadeia é saltada (ensaiado: a
--      migração duas vezes na mesma transacção dá os mesmos 4 negócios).
--   2. SET LOCAL ROLE authenticated e, por cadeia, set_config('request.jwt.claims', ..., true) com o sub
--      (anew_users.auth_user_id do dono) e neg_criar_negocio(..., p_registos, ..., 'contrato') num SELECT sobre o
--      quadro (LATERAL). A RLS e fn_neg_pode_editar correm como para o utilizador real. Qualquer recusa aborta a
--      migração inteira.
--   3. RESET ROLE, limpa a sessão simulada e SET CONSTRAINTS ALL IMMEDIATE: os gatilhos adiados de decisão
--      (trg_negocios_fecho_proposta/_contrato) correm aqui, SEM sessão (canal pela prova: P1 portal, P2
--      assinatura, P3 ou nenhuma: sistema), e não no COMMIT, para o CONFERIR os ver. Nenhum gatilho é desligado.
--   4. CONFERIR (sem DO; falha por conversão de texto para int, com a mensagem): cada cadeia elegível tem o
--      negócio na nike com a pessoa, o marcador, o título, fecho contrato e o dono; todos os seus documentos
--      ligados a ele; nenhum outro documento da nike ligado a estes negócios; ganho com origem num contrato com
--      prova quando a cadeia tem contrato assinado com prova; aberto com alerta sem_prova quando o contrato
--      assinado não tem prova; aberto sem alerta nos restantes; nenhum perdido; nenhum erro dos gatilhos de
--      negócio em workflow_execution_log para estes negócios.
--
-- Marcador (é por ele e pelos ids fixos que a reversão encontra os negócios): notas =
--   'Migração 20261226220000: negócio criado a partir de uma cadeia de documentos já ligados.'
--   Título: 'Negócio ' || número da proposta (senão do orçamento).
--
-- Efeitos que vêm das funções e gatilhos existentes (não desta migração)
--   - Com conversao_ao_ganhar = automatica na nike, o ganho da cadeia 4 chama fn_neg_converter_pessoa: a pessoa
--     723e7e27 já é cliente na nike (a5607a82), por isso não se cria cliente; o cliente passa a active se não
--     estiver, preenche a origem de marketing que estiver vazia, e fica uma linha de sucesso em
--     workflow_execution_log (trigger:negocio_conversao).
--   - Ligar um documento faz correr os gatilhos normais de UPDATE dessas tabelas (updated_at, auditoria,
--     histórico, pipeline dirty), como a acção «Ligar registos» da página Pessoas.
--   - negocio_eventos (ensaio): cadeia 4, acompanhamento «Proposta aceite; o negócio fecha no contrato» (P1) e
--     ganhou (contrato, P1, canal portal); cadeia 2, acompanhamento da proposta aceite sem prova e o alerta
--     sem_prova (canal sistema).
--
-- Pré-condição (só verificada se houver cadeias elegíveis): md5 do corpo (sem CR) lido a 21/10 de
--   neg_criar_negocio (11 argumentos), neg_ligar_registo, fn_neg_decidir_negocio e fn_neg_validar_documento.
--   fn_neg_decidir_negocio aceita DUAS versões: a de 20261226140000 (d9797069...) e a de 20261226210000
--   (d4aedc5c...). A 210000 tem carimbo anterior: num push com as duas pendentes é sempre aplicada antes desta
--   (e pára o push de dia, pela guarda da janela horária). A 210000 só acrescenta o ramo do orçamento
--   recusado; propostas e contratos decidem igual. Ensaiado com a 210000 aplicada na mesma transacção.
--   ORDEM: depois de 20261226210000 (se estiver pendente). Esta migração não tem guarda horária: não bloqueia
--   tabelas inteiras, só as linhas dos documentos da nike que liga.
--
-- Decisão por confirmar com o utilizador ANTES do push: o dono de FALLBACK. O pedido foi «no nome de quem tem
--   esses orçamentos, proposta e contrato (assigned to)». Quando essa pessoa não tem pessoas.edit e
--   pessoas.create na nike (hoje, cadeia 7: proposta atribuída a ee9d1613), a migração põe o negócio em nome do
--   super_admin carvalhomiguel319, que não criou nem tem os documentos: created_by, assigned_to e os eventos
--   passam a atribuir-lhe acções que não fez. As alternativas são deixar a cadeia de fora até essa pessoa ter
--   a permissão, ou dar-lha antes do push.
-- Impacto na Mudelar: nenhum (nenhuma leitura nem escrita fora da nike).
-- Reversão: fora da pasta das migrations (../reversoes/R_20261226220000_nike_negocios_das_cadeias_de_documentos.sql;
--   não aplicar sem decisão). Reabre os ganhos, desliga os documentos e apaga eventos e negócios com o marcador.
--   Não desfaz o efeito da conversão em cliente.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- 1. Plano, como postgres.
CREATE TEMP TABLE _neg_mig_cadeias ON COMMIT DROP AS
WITH
cadeia (ordem, negocio_id, entity_id, registos) AS (
  VALUES
    (1, '66b396f2-583c-41dc-8063-77fb60866ed4'::uuid, '71ca861c-5991-448c-a0ef-e9cf3a458138'::uuid,
     '[{"tipo": "proposta", "id": "539c0650-000f-44cc-99d0-ea5d5dfed42a"},
       {"tipo": "contrato", "id": "50498f59-131b-4d4a-a525-f825948ee3af"},
       {"tipo": "contrato", "id": "03dc5730-3f78-4e48-8a00-ed440fc0cbef"},
       {"tipo": "contrato", "id": "91b0c413-2d67-4d69-bc95-b45f14b5c112"}]'::jsonb),
    (2, 'c83b45ec-5a39-44a9-8223-c1c061d72ca0'::uuid, '14077caf-287c-498d-bf88-aeb351241779'::uuid,
     '[{"tipo": "proposta", "id": "bdcb7927-9ec7-4a62-8098-58a0f1c7efa7"},
       {"tipo": "contrato", "id": "4e8a5a0e-e104-4540-98e0-eaccc4b8e5ed"},
       {"tipo": "contrato", "id": "077e07a2-4f3e-4f23-835b-69cc8c10b115"}]'::jsonb),
    (3, 'd9216335-3f74-4d64-97d5-72d36e8f62b7'::uuid, '7a1f669c-dd39-4238-81aa-dbfe3814d402'::uuid,
     '[{"tipo": "proposta", "id": "7e6da1fb-c2ad-4235-980f-845a4c9455c0"},
       {"tipo": "contrato", "id": "085bd7aa-0fa7-4d05-b95b-1af310cfe81a"},
       {"tipo": "contrato", "id": "2c76aaa7-90cc-4b19-9ae8-e14dac2b6adb"},
       {"tipo": "contrato", "id": "e300a0c1-7d06-40f2-8a92-710b1da005f0"},
       {"tipo": "contrato", "id": "331a11d4-74f9-457b-9098-0b4aa791da67"}]'::jsonb),
    (4, '041c6b9e-17b2-4dee-995c-7f4e9b90c68f'::uuid, '723e7e27-0a2e-4076-9093-7f6e6459fb51'::uuid,
     '[{"tipo": "proposta", "id": "22f86c13-e87b-44b9-9c22-b2c105d521ae"},
       {"tipo": "contrato", "id": "b879e587-ec67-432b-837d-d51fef5773e0"}]'::jsonb),
    (5, 'afe8f436-9790-4f3f-8bd9-2c7592c15c0f'::uuid, 'e14b3d77-be54-47b9-ae60-a2c971fc8f6f'::uuid,
     '[{"tipo": "proposta", "id": "38dd2b1a-185c-4e08-99b3-733d8155b072"},
       {"tipo": "contrato", "id": "516f7729-26b0-48b6-8947-6bae4beac64b"},
       {"tipo": "contrato", "id": "2c09b7d8-20fc-4823-a0de-931b92eaf37a"}]'::jsonb),
    (6, '6383ae36-d87d-4112-9ecf-5b27db7a8f6d'::uuid, '71ca861c-5991-448c-a0ef-e9cf3a458138'::uuid,
     '[{"tipo": "proposta", "id": "3f74c3fb-367b-4819-8cb0-8f75f6cc8e06"},
       {"tipo": "contrato", "id": "e491a4c5-936e-451e-9760-b94eaf417315"}]'::jsonb),
    (7, 'c41f5845-e6b0-4797-9f38-13adf583929f'::uuid, 'b9265a89-53f3-40b7-8f35-1c5effca909d'::uuid,
     '[{"tipo": "orcamento", "id": "d7b43749-f1e7-4acf-aed8-98dc058d74c5"},
       {"tipo": "proposta", "id": "abf50bed-9dba-4dd5-ba11-6865228b3d14"}]'::jsonb)
),
cfg AS (
  SELECT c.created_at AS activado
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
),
doc AS (
  SELECT c.negocio_id, r.ord, r.valor ->> 'tipo' AS tipo, (r.valor ->> 'id')::uuid AS id
  FROM cadeia c
  CROSS JOIN LATERAL jsonb_array_elements(c.registos) WITH ORDINALITY AS r(valor, ord)
),
doc_lido AS (
  SELECT d.negocio_id, d.ord, d.tipo, d.id, x.entity_id, x.negocio_atual, x.assigned_to, x.created_by, x.created_at,
         x.numero, x.sem_base, x.assinado_activo, x.prova
  FROM doc d
  JOIN LATERAL (
    SELECT q.entity_id, q.negocio_id AS negocio_atual, q.assigned_to, q.created_by, q.created_at, q.quote_number AS numero,
           false AS sem_base, false AS assinado_activo, NULL::text AS prova
    FROM public.quotes q
    WHERE d.tipo = 'orcamento' AND q.id = d.id
      AND q.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid AND q.deleted_at IS NULL
    UNION ALL
    SELECT p.entity_id, p.negocio_id, p.assigned_to, p.created_by, p.created_at, p.proposal_number,
           false, false, NULL::text
    FROM public.proposals p
    WHERE d.tipo = 'proposta' AND p.id = d.id
      AND p.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
      AND p.deleted_at IS NULL AND p.is_deleted IS NOT TRUE
    UNION ALL
    SELECT cc.entity_id, cc.negocio_id, cc.assigned_to, cc.created_by, cc.created_at, cc.contract_number,
           COALESCE(cc.status NOT IN ('signed', 'assinado') AND cc.quote_id IS NULL AND cc.proposal_id IS NULL, false),
           COALESCE(cc.status IN ('signed', 'assinado', 'active') AND cc.replaced_by_contract_id IS NULL, false),
           public.fn_neg_prova_contrato(cc.id)
    FROM public.client_contracts cc
    WHERE d.tipo = 'contrato' AND cc.id = d.id
      AND cc.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid AND cc.deleted_at IS NULL
  ) x ON true
),
resumo AS (
  SELECT c.ordem, c.negocio_id, c.entity_id, c.registos,
         jsonb_array_length(c.registos) AS n_registos,
         count(l.id) AS n_vivos,
         count(l.id) FILTER (WHERE l.negocio_atual IS NOT NULL) AS n_com_negocio,
         count(l.id) FILTER (WHERE l.entity_id IS DISTINCT FROM c.entity_id) AS n_outra_pessoa,
         count(l.id) FILTER (WHERE l.created_at >= (SELECT g.activado FROM cfg g)) AS n_depois_activacao,
         count(l.id) FILTER (WHERE l.sem_base) AS n_sem_base,
         COALESCE(bool_or(l.assinado_activo AND l.prova IS NOT NULL), false) AS ganho_esperado,
         COALESCE(bool_or(l.assinado_activo), false) AS tem_assinado,
         (array_agg(l.assigned_to ORDER BY CASE WHEN l.tipo = 'contrato' THEN 1 WHEN l.tipo = 'proposta' THEN 2 ELSE 3 END,
                                          l.created_at, l.id)
            FILTER (WHERE l.assigned_to IS NOT NULL AND (l.tipo <> 'contrato' OR l.assinado_activo)))[1] AS candidato,
         (array_agg(l.numero ORDER BY CASE WHEN l.tipo = 'proposta' THEN 1 WHEN l.tipo = 'orcamento' THEN 2 ELSE 3 END,
                                      l.created_at, l.id)
            FILTER (WHERE NULLIF(btrim(l.numero), '') IS NOT NULL AND l.tipo <> 'contrato'))[1] AS numero
  FROM cadeia c
  LEFT JOIN doc_lido l ON l.negocio_id = c.negocio_id
  GROUP BY c.ordem, c.negocio_id, c.entity_id, c.registos
),
candidato AS (
  SELECT r.negocio_id, r.entity_id, 1 AS pref, r.candidato AS user_id FROM resumo r WHERE r.candidato IS NOT NULL
  UNION ALL
  SELECT r.negocio_id, r.entity_id, 2, 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2'::uuid FROM resumo r
),
avaliado AS (
  SELECT k.negocio_id, k.pref, k.user_id, u.auth_user_id,
         (u.id IS NOT NULL AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.anew_memberships m
                      JOIN public.anew_role_permissions rp ON rp.role_id = m.role_id AND rp.permission_code = 'pessoas.edit'
                      WHERE m.user_id = u.id AND m.status = 'active'
                        AND m.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
          AND EXISTS (SELECT 1 FROM public.anew_memberships m
                      JOIN public.anew_role_permissions rp ON rp.role_id = m.role_id AND rp.permission_code = 'pessoas.create'
                      WHERE m.user_id = u.id AND m.status = 'active'
                        AND m.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
          AND (k.pref = 1 OR (split_part(lower(u.email), '@', 1) = 'carvalhomiguel319'
                              AND EXISTS (SELECT 1 FROM public.anew_memberships m
                                          JOIN public.anew_roles ro ON ro.id = m.role_id AND ro.code = 'super_admin'
                                          WHERE m.user_id = u.id AND m.status = 'active'
                                            AND m.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)))
          AND COALESCE(a.ok, false)) AS valido
  FROM candidato k
  LEFT JOIN public.anew_users u ON u.id = k.user_id
  -- Âmbito pessoas.edit lido com a sessão do candidato (o argumento depende da linha: a função corre por linha).
  LEFT JOIN LATERAL (
    SELECT set_config('request.jwt.claims',
                      json_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true) AS s
  ) sc ON true
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
      FROM unnest(public.crm_scope_keys(CASE WHEN sc.s IS NOT NULL THEN 'pessoas.edit' END)) AS ch(chave)
      WHERE ch.chave = 'b6ffce4f-f630-4933-833a-008649757a33:*'
         OR ch.chave IN (
           SELECT 'b6ffce4f-f630-4933-833a-008649757a33:' || o.dono::text
           FROM (SELECT l.assigned_to AS dono FROM public.anew_leads l
                 WHERE l.entity_id = k.entity_id AND l.deleted_at IS NULL
                   AND l.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
                 UNION ALL
                 SELECT l.created_by FROM public.anew_leads l
                 WHERE l.entity_id = k.entity_id AND l.deleted_at IS NULL
                   AND l.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
                 UNION ALL
                 SELECT c.assigned_to FROM public.anew_clients c
                 WHERE c.entity_id = k.entity_id AND c.deleted_at IS NULL
                   AND c.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
                 UNION ALL
                 SELECT c.created_by FROM public.anew_clients c
                 WHERE c.entity_id = k.entity_id AND c.deleted_at IS NULL
                   AND c.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid) o
           WHERE o.dono IS NOT NULL)
    ) AS ok
  ) a ON true
),
escolhido AS (
  SELECT DISTINCT ON (a.negocio_id) a.negocio_id, a.user_id, a.auth_user_id, a.pref
  FROM avaliado a
  WHERE a.valido
  ORDER BY a.negocio_id, a.pref
)
SELECT r.ordem, r.negocio_id, r.entity_id, r.registos, r.n_registos, r.n_vivos,
       r.ganho_esperado, r.tem_assinado,
       left('Negócio ' || COALESCE(r.numero, 'migrado'), 200) AS titulo,
       e.user_id AS dono, e.auth_user_id AS dono_auth, (e.pref = 2) AS fallback, r.candidato,
       CASE
         WHEN r.n_vivos < r.n_registos THEN 'documentos em falta na nike'
         WHEN r.n_registos < 2 THEN 'menos de 2 documentos'
         WHEN r.n_com_negocio > 0 THEN 'documentos já ligados a um negócio'
         WHEN r.n_outra_pessoa > 0 THEN 'documento de outra pessoa'
         WHEN EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = r.negocio_id) THEN 'negócio já existe'
         WHEN NOT EXISTS (SELECT 1 FROM cfg) THEN 'sem configuração de Pessoas (NG008)'
         WHEN r.n_depois_activacao > 0 THEN 'documento posterior à activação (NG024)'
         WHEN r.n_sem_base > 0 THEN 'contrato por assinar sem orçamento nem proposta (NG014)'
         WHEN NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
                          WHERE lk.entity_id = r.entity_id
                            AND lk.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
           OR NOT (EXISTS (SELECT 1 FROM public.anew_leads l
                           WHERE l.entity_id = r.entity_id AND l.deleted_at IS NULL
                             AND l.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
                   OR EXISTS (SELECT 1 FROM public.anew_clients c
                              WHERE c.entity_id = r.entity_id AND c.deleted_at IS NULL
                                AND c.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid))
           THEN 'pessoa indisponível (NG003)'
         WHEN (SELECT l.closure_result FROM public.fn_neg_escolher_lead(
                 'b6ffce4f-f630-4933-833a-008649757a33'::uuid, r.entity_id, NULL, 'aberta') AS l) IS NOT NULL
           THEN 'abordagem encerrada (NG002)'
         WHEN e.user_id IS NULL THEN 'sem dono válido'
         WHEN w.n > 0 THEN 'o dono não pode escrever numa proposta da cadeia (RLS de proposals: proposals.edit com âmbito OWNED)'
       END AS motivo
FROM resumo r
LEFT JOIN escolhido e ON e.negocio_id = r.negocio_id
-- Escrita nas propostas da cadeia com a sessão do dono: a política de UPDATE de proposals exige
-- can_write_proposal_row(created_by, organização), que com proposals.edit de âmbito OWNED só deixa escrever as
-- propostas criadas pelo próprio. Sem ela, neg_ligar_registo falharia com 42501 e abortaria tudo.
LEFT JOIN LATERAL (
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', e.auth_user_id, 'role', 'authenticated')::text, true) AS s
) sd ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n
  FROM doc_lido l
  JOIN public.proposals p ON p.id = l.id AND p.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
  WHERE l.negocio_id = r.negocio_id AND l.tipo = 'proposta' AND sd.s IS NOT NULL AND e.user_id IS NOT NULL
    AND NOT public.can_write_proposal_row(p.created_by, p.organization_id)
) w ON true;

SELECT set_config('request.jwt.claims', '', true);

GRANT SELECT ON _neg_mig_cadeias TO authenticated;

-- Pré-condição: só se houver cadeias elegíveis (numa base reconstruída não há, e nada se verifica).
SELECT CASE WHEN f.falha IS NULL THEN 'pré-condição: ok'
            ELSE ('PRÉ-CONDIÇÃO falhou, nada feito: ' || f.falha)::int::text END AS pre
FROM (
  SELECT string_agg(e.sig, ', ') AS falha
  -- fn_neg_decidir_negocio: a de 20261226140000 (d9797069) ou a de 20261226210000 (d4aedc5c), que tem
  -- carimbo anterior e por isso é sempre aplicada antes desta no mesmo push. Esta migração só depende do
  -- comportamento de propostas e contratos, que a 210000 não altera.
  FROM (VALUES
         ('public.neg_criar_negocio(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,boolean,text)',
          ARRAY['a768fd58e1294ddd228d22db1fe20e8d']),
         ('public.neg_ligar_registo(uuid,text,uuid)',
          ARRAY['eaad2935625bcaf75f458764e023973e']),
         ('public.fn_neg_decidir_negocio(text,uuid,text,text,uuid,uuid)',
          ARRAY['d9797069dbb62d528db82c82c7cb90a3', 'd4aedc5c55644d350e6e3ffa57ad638b']),
         ('public.fn_neg_validar_documento()',
          ARRAY['fd29bd86c165515859231c08d02f5d14'])
       ) AS e(sig, hs)
  WHERE EXISTS (SELECT 1 FROM _neg_mig_cadeias t WHERE t.motivo IS NULL)
    AND (pg_catalog.to_regprocedure(e.sig) IS NULL
         OR NOT COALESCE((SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_catalog.pg_proc p
                          WHERE p.oid = pg_catalog.to_regprocedure(e.sig)) = ANY (e.hs), false))
) f;

-- 2. Criar e ligar, com a sessão do dono de cada cadeia.
SET LOCAL ROLE authenticated;

SELECT t.ordem, t.negocio_id, r.resultado
FROM _neg_mig_cadeias t
CROSS JOIN LATERAL (
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', t.dono_auth, 'role', 'authenticated')::text, true) AS s
) sc
CROSS JOIN LATERAL (
  SELECT public.neg_criar_negocio(
           t.negocio_id,
           'b6ffce4f-f630-4933-833a-008649757a33'::uuid,
           t.entity_id,
           t.titulo,
           'Migração 20261226220000: negócio criado a partir de uma cadeia de documentos já ligados.',
           t.dono,
           t.registos,
           NULL::uuid,
           NULL::uuid,
           false,
           'contrato') AS resultado
  WHERE sc.s IS NOT NULL
) r
WHERE t.motivo IS NULL
ORDER BY t.ordem;

-- 3. Sem sessão; os gatilhos de decisão adiados correm já.
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SET CONSTRAINTS ALL IMMEDIATE;

-- 4. CONFERIR
SELECT CASE WHEN f.erros IS NULL THEN 'CONFERIR: ok, ' || f.resumo
            ELSE ('CONFERIR falhou: ' || f.erros)::int::text END AS conferir
FROM (
  SELECT
    (SELECT string_agg(e.msg, ' | ' ORDER BY e.msg) FROM (
       -- a) cada cadeia elegível tem o seu negócio, como pedido
       SELECT 'sem negócio ' || t.negocio_id::text AS msg
       FROM _neg_mig_cadeias t
       WHERE t.motivo IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.negocios n
           WHERE n.id = t.negocio_id
             AND n.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
             AND n.entity_id = t.entity_id AND n.deleted_at IS NULL AND n.fecho = 'contrato'
             AND n.created_by = t.dono AND n.assigned_to = t.dono AND n.titulo = t.titulo
             AND n.notas = 'Migração 20261226220000: negócio criado a partir de uma cadeia de documentos já ligados.')
       UNION ALL
       -- b) todos os documentos da cadeia ligados ao negócio
       SELECT 'documento por ligar ' || (r.valor ->> 'id')
       FROM _neg_mig_cadeias t
       CROSS JOIN LATERAL jsonb_array_elements(t.registos) AS r(valor)
       WHERE t.motivo IS NULL
         AND COALESCE(
               (SELECT q.negocio_id FROM public.quotes q
                WHERE r.valor ->> 'tipo' = 'orcamento' AND q.id = (r.valor ->> 'id')::uuid
                  AND q.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid),
               (SELECT p.negocio_id FROM public.proposals p
                WHERE r.valor ->> 'tipo' = 'proposta' AND p.id = (r.valor ->> 'id')::uuid
                  AND p.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid),
               (SELECT cc.negocio_id FROM public.client_contracts cc
                WHERE r.valor ->> 'tipo' = 'contrato' AND cc.id = (r.valor ->> 'id')::uuid
                  AND cc.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid))
             IS DISTINCT FROM t.negocio_id
       UNION ALL
       -- c) nenhum outro documento da nike ligado a estes negócios
       SELECT 'documento fora da cadeia ' || x.id::text
       FROM (SELECT q.id, q.negocio_id FROM public.quotes q
             WHERE q.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid AND q.negocio_id IS NOT NULL
             UNION ALL
             SELECT p.id, p.negocio_id FROM public.proposals p
             WHERE p.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid AND p.negocio_id IS NOT NULL
             UNION ALL
             SELECT cc.id, cc.negocio_id FROM public.client_contracts cc
             WHERE cc.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid AND cc.negocio_id IS NOT NULL) x
       JOIN _neg_mig_cadeias t ON t.negocio_id = x.negocio_id AND t.motivo IS NULL
       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.registos) AS r(valor)
                         WHERE (r.valor ->> 'id')::uuid = x.id)
       UNION ALL
       -- d) estado: ganho só com prova; sem_prova; aberto; nunca perdido
       SELECT 'estado inesperado ' || n.id::text || ': ' || n.estado || '/' || COALESCE(n.alerta_codigo, '-')
       FROM public.negocios n
       JOIN _neg_mig_cadeias t ON t.negocio_id = n.id AND t.motivo IS NULL
       WHERE n.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
         AND NOT (
               (t.ganho_esperado AND n.estado = 'ganho' AND n.decisao_origem_tipo = 'contrato'
                AND public.fn_neg_prova_contrato(n.decisao_origem_id) IS NOT NULL)
            OR (NOT t.ganho_esperado AND t.tem_assinado AND n.estado = 'aberto' AND n.alerta_codigo = 'sem_prova')
            OR (NOT t.tem_assinado AND n.estado = 'aberto' AND n.alerta_codigo IS NULL))
       UNION ALL
       -- e) nenhum erro dos gatilhos de negócio para estes negócios
       SELECT 'erro de gatilho ' || w.action_type || ' ' || w.target_record_id::text
       FROM public.workflow_execution_log w
       JOIN _neg_mig_cadeias t ON t.negocio_id = w.target_record_id AND t.motivo IS NULL
       WHERE w.action_type IN ('trigger:negocio_fecho', 'trigger:negocio_heranca', 'trigger:negocio_conversao')
         AND w.status = 'error'
     ) e) AS erros,
    (SELECT format('%s negócio(s), %s ganho(s), %s alerta(s) sem_prova, %s no dono de fallback, %s cadeia(s) de fora',
                   count(*) FILTER (WHERE t.motivo IS NULL),
                   count(*) FILTER (WHERE t.motivo IS NULL AND t.ganho_esperado),
                   count(*) FILTER (WHERE t.motivo IS NULL AND t.tem_assinado AND NOT t.ganho_esperado),
                   count(*) FILTER (WHERE t.motivo IS NULL AND t.fallback),
                   count(*) FILTER (WHERE t.motivo IS NOT NULL))
     FROM _neg_mig_cadeias t) AS resumo
) f;

COMMIT;
