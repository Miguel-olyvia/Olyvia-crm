-- ==============================================================================
-- 20261210390000_hr_branch_v0_apagar_convites_teste.sql
--
-- V0 DA ADMISSAO (etapa E2): APAGA OS 24 CONVITES DE TESTE DA NIKE.
--
-- SO NO BRANCH DE RH (ref uetjghdkwbywbftedtth). FICHEIRO FORA DO REPOSITORIO:
-- vive em vault/ficheiros/recursos-humanos/so-na-base-de-dev, como a semente
-- 20261210090000. Sao dados de teste de um ambiente, nao schema: nunca se copia
-- para supabase/migrations nem se aplica a base partilhada ou a producao.
--
-- POR APLICAR. Tem de correr ANTES de 20261210420000 (V2): a V2 recusa-se a
-- correr enquanto houver um rascunho com NISS ou IBAN, e hoje ha um.
--
--
-- -- O QUE FAZ ------------------------------------------------------------------
--
-- Os convites de admissao desta base sao todos de teste (decisao 9 e
-- especificacao de 16/10: "sem migracao nem compatibilidade"). Lidos na dev a
-- 16/10 (19 ao escrever este ficheiro, 24 depois de nova corrida dos testes): 24 convites, todos da
-- nike.
--   - 17 confirmados pelo Miguel como de teste (06 e 07/10): 5 expirados,
--     10 revogados, 2 usados;
--   - 7 criados a 16/10 pelos testes de integracao da E2, na pessoa de teste
--     'ZZ Teste Fluxo1 B X' (9a1c64e4-...), e-mail zz-teste-e2@example.invalid:
--     6 revogados e 1 VIVO.
--
-- Por esta ordem, numa so transaccao:
--   1. os anexos PENDENTES e LIGADOS destes convites passam a apagado
--      (motivo convite_revogado). Hoje: 1 ligado;
--   2. o convite_id de TODOS os anexos destes convites passa a NULL (a FK
--      pessoas_anexos_convite_fkey nao tem CASCADE e travaria o DELETE). Hoje:
--      8 anexos (4 ja apagados, 1 ligado, 3 promovidos);
--   3. apagam-se os 24 convites, por id explicito E organization_id da nike.
--
-- Os anexos PROMOVIDOS (3) ficam promovidos: ja fazem parte da ficha da pessoa
-- de teste, e o desenho manda manter as fichas de teste (seccao 5). So perdem a
-- ligacao ao convite apagado.
--
-- O convite VIVO apaga-se sem nada de especial: o indice
-- idx_pessoas_convites_admissao_um_vivo so restringe INSERT/UPDATE, e a FK dos
-- anexos fica resolvida no passo 2. Depois disto a pessoa de teste pode receber
-- um processo novo.
--
--
-- -- O QUE NAO FAZ ---------------------------------------------------------------
--
-- - Nao toca nas fichas, nos dados bancarios nem em pessoas_identificacao.
-- - VAULT: nao ha segredos do Vault que pertencam aos convites (o staging B2 com
--   niss_segredo_id/iban_segredo_id ainda nao existe). O unico segredo com
--   "convite" na descricao (hr_conta:95370a10-...) e a conta bancaria da FICHA,
--   gravada pela submissao do convite usado 16fe41ae-...; pertence a
--   pessoas_dados_bancarios e fica.
-- - STORAGE: nao se apaga em SQL (nunca DELETE em storage.objects; so a API do
--   Storage apaga). Ver o passo obrigatorio abaixo.
--
--
-- -- PASSO OBRIGATORIO DEPOIS DE APLICAR: STORAGE -------------------------------
--
-- O anexo ligado que passa a apagado tem o ficheiro em hr-documentos (lido na
-- dev: existe). Os 4 anexos ja apagados e o ligado tem ainda copias de quarentena
-- por remover. Quem os remove e a Edge Function convite-admissao-limpeza, que
-- pede hr_convite_anexos_limpar() e apaga pela API do Storage TODAS as linhas
-- apagado com objecto_removido_em nulo, com ou sem convite_id.
-- MAS nesta dev o job hr-convite-anexos-limpar NAO esta agendado (faltam os
-- segredos project_functions_url e cron_service_role_key no Vault, como a
-- 20261210080000 previa). Por isso, depois do push, alguem com o segredo do cron
-- tem de chamar UMA VEZ a Edge (POST convite-admissao-limpeza) e confirmar que
-- os 5 anexos ficam com objecto_removido_em preenchido. Sem isso, o ficheiro do
-- cartao de cidadao/IBAN de teste fica no bucket sem linha que o use.
--
--
-- -- CODIGO QUE ENTRA JUNTO -------------------------------------------------------
--
-- Nenhum. O que o utilizador ve: a etiqueta do convite desaparece das fichas de
-- teste (o resumo passa a dizer que nao ha convite) e o "Convidar" volta a estar
-- disponivel para essas pessoas.
--
--
-- -- IMPACTO NUMA PUBLICACAO FUTURA (PRODUCAO / MUDELAR) -----------------------
--
-- Nenhum: este ficheiro nao vai para producao. A guarda aborta numa base com
-- mais de uma organizacao. Os convites da producao, se os houver, tratam-se a
-- parte e com autorizacao.
--
--
-- -- COMO SE REVERTE ---------------------------------------------------------------
--
-- Nao se reverte: sao dados de teste apagados de proposito.
--
--
-- -- ANTES DE APLICAR ----------------------------------------------------------
--
-- 1. Confirmar que o link do supabase aponta ao BRANCH de RH (ref
--    uetjghdkwbywbftedtth). A guarda recusa qualquer base com mais de uma
--    organizacao, ou cuja unica organizacao nao seja a nike.
-- 2. Reler a lista de convites. Se os testes criarem mais convites antes do
--    push, a guarda FALHA de proposito (convites fora da lista): confirmar que
--    sao de teste e acrescentar os ids a c_ids, nunca apagar sem lista.
--
--
-- Prerequisitos:
--   20261124120000  pessoas_convites_admissao
--   20261210050000  pessoas_anexos (convite_id, estados, motivos)
--   20261210090000  semente de teste do branch (papeis teste_rh_*)
-- ==============================================================================

-- ---- Guardas e apagamento, num so bloco ----------------------------------------
DO $v0$
DECLARE
  c_org_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_ids constant uuid[] := ARRAY[
    -- 17 confirmados pelo Miguel (06 e 07/10)
    '95a02774-7fd2-42c5-ba2c-0d4fa402d542', '25ba4cb1-a014-40b8-85cf-ba82be9e2444',
    '0acb92b5-6796-4bbd-ba03-011e4daf2bd3', '16fe41ae-9995-45f1-a45c-619b95c53a24',
    '87959712-ffaf-4522-ba2b-17fd4e3fb934', 'd2f24bd4-12d8-43e4-ab14-f9033e18edb3',
    '00edcd9e-b22d-44c0-8fca-2beb223164fb', 'e1a87d29-2a9f-4384-8d90-4b6128b779e0',
    'e41f2c95-2c0e-4142-bdf1-d69b01a65a33', 'b507b866-637e-429f-85d9-ced4148cc124',
    '96ab15d9-21b3-474a-9a29-cf561f9b287a', '2ff99cc5-239c-416b-b320-415efc90f438',
    '8549be4c-ee60-41af-9c3c-3d61fc0d1178', '8eecf3c3-d500-4bef-b4f7-51607560e55b',
    '9a8bb8c0-455d-49da-8612-69b364bf1702', 'c0d9cf33-f44a-4412-96cb-d61d744595a5',
    '07debdbb-7ff1-4a74-b164-56239ff9f0b3',
    -- 7 dos testes de integracao da E2 (16/10: 2 as 03:56 e 5 as 09:07, pessoa 9a1c64e4-...)
    '0eb68798-a211-4fca-ad89-3b5e003a9c39', 'bc8bc085-300f-4da6-8e7e-61fde363f930', 'f90c5278-d951-4654-a0b7-0a39a12efb16', '85868f66-2248-4cdb-a22a-2eb8115ccbfe', '3848b019-81e7-4c05-9683-d9a1b000041e', '6238ca55-842a-4294-82e1-9db6fafcba9f', '5044e5ea-ad19-4736-98a1-d3a4775cd9bc'
  ]::uuid[];
  v_orgs      integer;
  v_unica     uuid;
  v_fora      integer;
  v_outra     integer;
  v_apagados  integer;
  v_soltos    integer;
  v_convites  integer;
BEGIN
  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_convites_admissao nao existe.';
  END IF;
  IF to_regclass('public.pessoas_anexos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_anexos nao existe.';
  END IF;

  -- Ninguem cria nem altera convites entre as guardas e o DELETE (as leituras
  -- seguem). Tomado ANTES de contar o que esta fora da lista.
  LOCK TABLE public.pessoas_convites_admissao IN EXCLUSIVE MODE;

  -- So o branch: UMA organizacao, e e a nike.
  SELECT count(*), min(id::text)::uuid INTO v_orgs, v_unica FROM public.anew_organizations;
  IF v_orgs <> 1 THEN
    RAISE EXCEPTION 'ABORTAR: esta base tem % organizacoes. Este ficheiro so se aplica ao branch de RH (uma so organizacao, a nike).', v_orgs;
  END IF;
  IF v_unica IS DISTINCT FROM c_org_nike THEN
    RAISE EXCEPTION 'ABORTAR: a unica organizacao desta base (%) nao e a nike.', v_unica;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_roles WHERE code LIKE 'teste\_rh\_%') THEN
    RAISE EXCEPTION 'ABORTAR: a semente de teste do branch (papeis teste_rh_*) nao esta presente.';
  END IF;

  -- Nenhum id da lista pertence a outra organizacao.
  SELECT count(*) INTO v_outra
    FROM public.pessoas_convites_admissao c
   WHERE c.id = ANY (c_ids)
     AND c.organization_id IS DISTINCT FROM c_org_nike;
  IF v_outra > 0 THEN
    RAISE EXCEPTION 'ABORTAR: % convite(s) da lista nao sao da nike.', v_outra;
  END IF;

  -- Nada fora da lista: um convite que nao esta aqui nao foi confirmado como de
  -- teste, e nao se apaga sem lista.
  SELECT count(*) INTO v_fora
    FROM public.pessoas_convites_admissao c
   WHERE NOT (c.id = ANY (c_ids));
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'ABORTAR: ha % convite(s) que nao estao na lista confirmada. Confirmar que sao de teste e acrescenta-los a c_ids antes de aplicar.', v_fora;
  END IF;

  -- ---- Apagar (no MESMO bloco: a lista c_ids define-se uma so vez) ---------

  -- 1. Pendentes e ligados passam a apagado (a limpeza do Storage apanha-os).
  UPDATE public.pessoas_anexos a
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = 'convite_revogado'
   WHERE a.convite_id = ANY (c_ids)
     AND a.organization_id = c_org_nike
     AND a.estado IN ('pendente', 'ligado');
  GET DIAGNOSTICS v_apagados = ROW_COUNT;

  -- 2. Todos os anexos destes convites perdem a ligacao (a FK nao tem CASCADE).
  UPDATE public.pessoas_anexos a
     SET convite_id = NULL
   WHERE a.convite_id = ANY (c_ids)
     AND a.organization_id = c_org_nike;
  GET DIAGNOSTICS v_soltos = ROW_COUNT;

  -- 3. Os convites, por id e organizacao.
  DELETE FROM public.pessoas_convites_admissao c
   WHERE c.id = ANY (c_ids)
     AND c.organization_id = c_org_nike;
  GET DIAGNOSTICS v_convites = ROW_COUNT;

  RAISE NOTICE 'V0: % anexo(s) passaram a apagado, % anexo(s) perderam o convite_id, % convite(s) apagados (esperados ate 24).',
    v_apagados, v_soltos, v_convites;
END;
$v0$;
-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_restam      integer;
  v_orfaos      integer;
  v_por_remover integer;
BEGIN
  SELECT count(*) INTO v_restam FROM public.pessoas_convites_admissao;
  IF v_restam <> 0 THEN
    RAISE EXCEPTION 'Ficaram % convite(s) na tabela; esperava-se zero.', v_restam;
  END IF;

  -- Nenhum anexo activo ficou sem convite (o CHECK pessoas_anexos_activo_tem_convite
  -- ja o impede; confere-se na mesma).
  SELECT count(*) INTO v_orfaos
    FROM public.pessoas_anexos a
   WHERE a.origem = 'convite' AND a.estado IN ('pendente', 'ligado');
  IF v_orfaos <> 0 THEN
    RAISE EXCEPTION 'Ha % anexo(s) de convite ainda activos.', v_orfaos;
  END IF;

  SELECT count(*) INTO v_por_remover
    FROM public.pessoas_anexos a
   WHERE a.origem = 'convite'
     AND ((a.estado = 'apagado' AND a.objecto_removido_em IS NULL)
          OR (a.caminho_quarentena IS NOT NULL AND a.quarentena_removida_em IS NULL AND a.estado <> 'pendente'));

  RAISE NOTICE 'OK: nenhum convite na tabela, nenhum anexo de convite activo. PENDENCIA: % anexo(s) com ficheiro ou copia de quarentena por remover do Storage -- chamar a Edge convite-admissao-limpeza (o job nao esta agendado nesta base).', v_por_remover;
END;
$conferir$;
