-- ==============================================================================
-- 20270129100000_ativos_a1.sql
--
-- ATIVOS, fase A1.1: o equipamento do RH passa a ser um ativo (uma só fonte de verdade),
-- cada ativo é «comprado» ou «alugado», código automático por EMPRESA, ligação a um
-- armazém do Stock, e a correção do equipamento pede ativos.edit (ATV-1).
-- Desenho fechado: vault/ficheiros/ativos/desenho-ativos-v4-a1.md (secção 8), com as
-- correções M1..M8 e LOW da revisão final ao v4 (escritas abaixo, onde ficaram).
--
-- SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). NUNCA a principal (tzbfgw...).
-- A migration 20270126900000_ativos_registo.sql NÃO se reescreve (está aplicada no remoto);
-- tudo o que muda dela muda aqui, com DROP e ADD / DROP e CREATE explícitos.
--
-- !!! ESTA MIGRATION PRECISA DO ECRÃ NOVO (RH Custos e Ativos) PUBLICADO NA MESMA SESSÃO !!!
--  O ecrã de hoje continua a funcionar no instante a seguir ao push (assinaturas que só
--  crescem, a lista do RH com as mesmas chaves preenchidas), mas mostra o custo à maneira
--  antiga até o ecrã novo ser publicado. O QUE O ECRÃ TEM DE MUDAR NO MESMO ENVIO:
--   RH (src/components/rh-exemplo e src/lib/hr):
--    * lib/equipamentos.ts:51-58 (situacaoDoEquipamento, valorDoEquipamentoNoMes,
--      equipamentosDoMes): numa linha com `ativo`, o valor do mês é
--      donoDoMes(linha, M) ? valorDoAtivoNoMes(ativo, M) : 0 (quota do comprado; renda do
--      alugado), com `conta_desde` e o dia de referência D(M) da secção 2.1 do desenho.
--      NUNCA comoConta.ts numa linha com ativo (o «todos os meses» duplica a renda numa
--      troca no mesmo mês, comoConta.ts:79-84). Só a farda continua em comoConta.ts.
--    * custo/CustoEquipamentos.tsx (situacaoDoEquipamento), lib/custoItens.ts:26,
--      custo/modulo/ItensDoMes.tsx, custo/rotuloConta.ts e custo/escolhaConta.ts: com
--      `ativo` preenchido ignoram conta_*; o rótulo diz «comprado, N meses» ou «alugado,
--      X €/mês» a partir do ativo.
--    * lib/hr/custoBase.ts equipamentoDaLinha: guarda `ativo`, `ativo_id` e `conta_desde`.
--    * EquipamentoSheet: Comprado / Alugado / «já existe e está livre»
--      (rpc_hr_equipamentos_livres); EditarContaDialog só na farda (HRA91);
--      «Corrigir equipamento» e «Corrigir datas» só com ativos.edit
--      (rpc_hr_equipamento_corrigir); aviso fixo da viatura alugada (Frota).
--    * lib/hr/errosCusto.ts e components/ativos/lib/errosAtivo.ts: traduzir HRA91 e
--      ATV19..ATV33 (o RH também recebe ATV14, ATV15, ATV23, ATV26 e ATV10..ATV21 ao atribuir).
--   Ativos (src/components/ativos): comprado/alugado no formulário (p_campos_novos = true),
--    totais só dos comprados + linha «Rendas», ocupações e parte da estrutura na ficha, sem a
--    lista «sem ativo» nem Ligar/Desligar (passam a recusar, ATV25), aviso «alugado sem fim,
--    devolvido e nunca desativado» na ficha (só ecrã), aviso de reativar (ATV30 e o campo
--    `aviso`), armazém e valor do stock (A1.2, só ecrã).
--
-- ORDEM DE APLICAÇÃO
--  1. Testes de texto (src/components/ativos/ativosA1Migration.test.ts) e leituras só de
--     leitura ao remoto RH ANTES do push (as guardas abaixo repetem-nas dentro da transação).
--  2. Confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth e correr
--     `supabase migration list --linked` IMEDIATAMENTE antes: o `db push` aplica TUDO o que
--     estiver pendente. ATENÇÃO (lido a 26/11): o ramo feature/rh-pessoas tem
--     20270127000000, 20270128000000 e 20270128100000 que NÃO estão no remoto RH; resolver
--     isso antes (não se empurram por arrasto).
--  3. Dizer ao dono o impacto na Mudelar DESTA base (3 armazéns): só o índice único novo
--     warehouses_id_org_key e um trinco de milissegundos em warehouses; nenhum dado dela é
--     lido nem escrito. Quando chegar à base principal, volta a dizer-se e espera-se.
--  4. `supabase db push --linked` a partir do worktree ligado à RH.
--  5. Publicar o ecrã novo na mesma sessão; depois medir os caminhos quentes (Ativos, custo
--     do mês de uma pessoa, valor do armazém) e fazer as provas de recusa combinadas.
--
-- O QUE FAZ (pela ordem do ficheiro)
--  0. Guardas: estado esperado (CHECKs por md5 do texto, corpos das funções por md5,
--     assinaturas exatas, uma só sobrecarga, linhas do RH convertíveis, códigos livres).
--  1. ativo: colunas forma_aquisicao ('comprado' por omissão), renda_mensal,
--     inicio_aluguer, fim_aluguer, vida_origem, warehouse_id; valor_compra e data_compra
--     deixam de ser NOT NULL; codigo passa a NOT NULL.
--  2. ativo: CHECKs novas (forma, renda, datas do aluguer, origem da vida, armazém) e
--     DROP+ADD de ativo_vida_meses, ativo_desativacao_coerente (M1: coalesce(data_compra,
--     inicio_aluguer)) e ativo_equipamento_coerente (pessoa: catálogo opcional).
--  3. warehouses: UNIQUE (id, organization_id) novo; ativo.warehouse_id com FK composta
--     (mesma empresa) e um só ativo vivo por armazém.
--  4. ativo_eventos: tipo novo ocupacao_corrigida e campos novos.
--  5. pessoas_equipamentos: tipo, descricao, valor e conta_modo passam a aceitar nulos
--     (a linha com ativo não guarda cópia nenhuma); conta_modo perde o valor por omissão.
--  6. Tabela ativo_codigo_contador (código PREFIXO-0001 por empresa e prefixo).
--  7. Funções (secção 8 do desenho; todas SECURITY DEFINER as rpc, search_path vazio).
--  8. Carga inicial das linhas do RH sem ativo (hoje 0) ANTES da regra da fonte única (M3).
--  9. pessoas_equipamentos_fonte_unica (com ativo: sem valor nem conta; sem ativo: só farda).
-- 10. Direitos: internas para ninguém; rpc só para authenticated.
-- 11. Conferir o estado final (catálogo lido com ::text).
--  Não faz: seguros (v3 §13, nada se constrói), farda como ativo, manutenção no custo,
--  limite mínimo de valor, Frota, gatilho em pessoas, sugestão de vida por tipo,
--  proxima_manutencao, rateio da renda por dias (tudo ADIADO pelo dono).
--
-- ERROS NOVOS: RAISE ... USING ERRCODE = 'P0001', MESSAGE = 'ATVnn', DETAIL = texto pt-PT;
--  no RH, ERRCODE = 'HRAnn' (como as funções do RH de hoje).
--   ATV19 forma de aquisição inválida, campo de outra forma, ou mudar a forma
--   ATV20 renda mensal inválida        ATV21 datas do aluguer inválidas (inclui fim antes
--   ATV22 armazém inválido / sem             da última entrega)
--         inventory.view / já ligado   ATV23 fardamento ainda não é ativo (M7, adiado)
--   ATV24 origem da vida inválida      ATV25 ligar/desligar já não se usam
--   ATV26 entrega inválida (ativo com alguém, desativado, outro grupo, antes da compra ou
--         do início, depois do fim, contrato terminado, cruza outra ocupação)
--   ATV27 pedido de correção inválido  ATV28 compra/início depois da primeira entrega
--   ATV29 desativação antes da última devolução
--   ATV30 reativar um ativo de armazém com outro ativo vivo no mesmo armazém (M2)
--   ATV31 datas de ocupação inválidas na correção (ordem ou cruzamento)
--   ATV32 código automático esgotado (50 tentativas)
--   ATV33 limite de correções por hora (120 por utilizador)
--   HRA91 «Alterar conta» numa linha que é um ativo (só a farda tem conta própria)
--
-- ONDE FICARAM AS CORREÇÕES DA REVISÃO FINAL (procurar a etiqueta no ficheiro)
--  [M1] rpc_ativo_desativar compara com coalesce(data_compra, inicio_aluguer) antes da CHECK.
--  [M2] rpc_ativo_reativar recusa (ATV30) quando o armazém já tem outro ativo vivo e devolve
--       `aviso`: reativar apaga desativado_em e volta a pôr renda/quota nos meses passados.
--  [M3] carga inicial ANTES de pessoas_equipamentos_fonte_unica; a guarda G6 falha com
--       mensagem clara se houver linhas que a carga não converte sozinha.
--  [M4] projeção do alugado para o ecrã antigo: conta_inicio = o MAIOR entre o mês do início
--       do aluguer e o mês da entrega. Caminho de compatibilidade (ecrã antigo, «todos os
--       meses»): inicio_aluguer = conta_inicio (dia 1 do mês escolhido); fim_aluguer = último
--       dia do mês de conta_fim. Uma entrega antes desse início é RECUSADA (ATV26), nunca
--       gera um alugado com entrega antes do início; na carga, a guarda G6 falha.
--  [M5] inicio_aluguer <= primeira entrega (ATV28); fim_aluguer >= última entrega (ATV21);
--       ao entregar, o contrato não pode estar terminado (fim < hoje: ATV26). REGRA
--       EXPLÍCITA para fim vs desativação: desativado_em PODE ser depois de fim_aluguer (uma
--       devolução registada depois do fim obriga a isso, e é aceite); a renda pára no mais
--       cedo dos dois (D(M) do desenho), por isso não há meses a mais.
--  [M6] o código do RH a mudar está na lista acima (lib/equipamentos.ts:51-58 e os outros);
--       a lista do RH deixa o rótulo coerente (conta_modo/conta_meses/conta_inicio do ativo).
--  [M7] tipo fardamento recusado ao criar ativos (ativos_validar, logo rpc_ativo_criar,
--       alterar e a atribuição), ao entregar com p_ativo_id, e fora da lista de livres.
--  [M8] ativos_de_linha_rh recebe p_data_compra (pessoas_equipamentos NÃO tem essa coluna);
--       a carga passa a entrega.
--  [LOW] «hoje» = ativos_hoje() = data em Europe/Lisbon (a base corre em UTC); atribuição
--       com p_ativo_id escreve `ligado`, criar escreve `criado`; nome = btrim(left(btrim(
--       descricao),120)); guarda final: anon/authenticated sem direitos de tabela em ativo
--       (as políticas ativo_criar/ativo_editar ficam DORMENTES: só valem se alguém conceder
--       direitos de tabela); rpc_hr_equipamento_corrigir NÃO passa pelo limite do RH
--       (hr_custo_exigir_escrita exige as permissões do RH, o que a ATV-1 proíbe) e tem
--       limite próprio (ATV33, 120 por hora, contado em ativo_eventos);
--       rpc_hr_equipamentos_livres mostra valores de compra/renda a quem tem as permissões
--       do RH mesmo sem ativos.view (de propósito: é o mesmo valor que o custo da pessoa já
--       lhe mostra).
--
-- DESVIOS AO DESENHO (decididos aqui, a validar pelo revisor)
--  a) ativos_json NÃO leva as ocupações: o nome da pessoa depende da permissão do RH, que
--     ativos_json não conhece. As ocupações vão em rpc_ativo_ler e rpc_ativos_listar
--     (pessoa_id/nome só com hr.pessoas.retribuicao.view). warehouse_id e o nome do armazém
--     só com inventory.view; ativos_json leva só armazem_ligado.
--  b) Guarda do ativo: em vez de «exatamente 2 linhas», «nenhum ativo de pessoa/estrutura»
--     (as que existirem passam a «comprado»; o número fica em NOTICE).
--  c) ativo_aluguer_datas não compara a desativação com o fim (regra explícita do M5).
--  d) A atribuição com p_ativo_id exige p_tipo, p_descricao, p_valor e os novos parâmetros
--     nulos (HRA10); p_conta_modo é ignorado (tem valor por omissão).
--  e) Comprado criado no RH com a data de entrega no futuro (> hoje + 7) e sem
--     p_data_compra é recusado (ATV07), porque a data de compra seria a da entrega.
--  f) ATV28/ATV21/ATV31 separados de ATV26 para o ecrã distinguir a correção da entrega.
--
-- COMO SE REVERTE: sem ficheiro de reversão nesta pasta, de propósito.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---- 0. Guardas (estado esperado; tudo do catálogo com ::text) --------------------
DO $guardas$
DECLARE
  v_n    integer;
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_f    record;
BEGIN
  -- G1 Esta é a base de RH (a nike existe aqui) e quem aplica passa a RLS.
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33') THEN
    RAISE EXCEPTION 'G1: a organização nike não existe nesta base. É a base certa?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G1: o papel que aplica (%) não tem BYPASSRLS.', current_user::text;
  END IF;

  -- G2 Nada desta migration existe já.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.ativo') AND NOT a.attisdropped
     AND a.attname::text IN ('forma_aquisicao', 'renda_mensal', 'inicio_aluguer', 'fim_aluguer', 'vida_origem', 'warehouse_id', 'proxima_manutencao');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G2: % coluna(s) novas de ativo já existem. Investigar.', v_n;
  END IF;
  IF to_regclass('public.ativo_codigo_contador') IS NOT NULL
     OR to_regclass('public.ativo_warehouse_ativo_key') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname::text IN ('warehouses_id_org_key', 'ativo_warehouse_fkey',
                  'pessoas_equipamentos_fonte_unica', 'ativo_forma_coerente', 'ativo_forma_aquisicao_valida',
                  'ativo_renda_mensal', 'ativo_aluguer_datas', 'ativo_vida_origem', 'ativo_armazem_coerente')) THEN
    RAISE EXCEPTION 'G2: a tabela do contador, o índice do armazém ou uma das regras novas já existe. Investigar.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND p.proname::text IN ('ativos_hoje', 'ativos_prefixo', 'ativos_proximo_codigo', 'ativos_criar_interno',
                             'ativos_de_linha_rh', 'ativos_verificar_entrega', 'rpc_hr_equipamentos_livres',
                             'rpc_hr_equipamento_corrigir', 'rpc_hr_equipamento_corrigir_datas', 'ativos_vida_sugerida');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G2: já existem % função(ões) com nomes desta migration. Investigar.', v_n;
  END IF;

  -- G3 As CHECKs a substituir e as que NÃO mudam estão como foram lidas a 26/11 (md5 do texto).
  FOR v_f IN SELECT * FROM (VALUES
      ('public.ativo', 'ativo_vida_meses', 'ebb6f8423fea4ea35a6353ebef27db1c'),
      ('public.ativo', 'ativo_desativacao_coerente', '4c57e94bf74b65675d3ba06d760834da'),
      ('public.ativo', 'ativo_equipamento_coerente', '4b6514549478177a6db85b9b2adbdda9'),
      ('public.ativo', 'ativo_valor_compra', 'e585e3b200f56b4b473e851bea5f6648'),
      ('public.ativo', 'ativo_data_compra', '9dda99fd07f848d75d39778462c0447c'),
      ('public.ativo', 'ativo_valor_residual', '6e2429d91717405ef6a3afe27865cd35'),
      ('public.ativo', 'ativo_tipo_coerente', '3657275d9be5ed869f63e74aec0c9116'),
      ('public.ativo', 'ativo_codigo', 'c11431c65060bba32953a5c3ddb4a77b'),
      ('public.ativo', 'ativo_nome', '3151a188dcbc64afd0d0bacd90203b7f'),
      ('public.ativo_eventos', 'ativo_eventos_tipo_valido', 'fa4321418e1f9c02203c96ee6e78f039'),
      ('public.ativo_eventos', 'ativo_eventos_ligacao_coerente', 'bea8d56ff54eaf2c24b0607b7464f48e'),
      ('public.ativo_eventos', 'ativo_eventos_campos', '0fbf4a28d7e4a4b2acde8cc5a5c4c5ca'),
      ('public.pessoas_equipamentos', 'pessoas_equipamentos_conta_coerente', 'd6bb31db40041d7cbb80f3f14efb04a5'),
      ('public.pessoas_equipamentos', 'pessoas_equipamentos_tipo_valido', '241d572cb092a38ad9beed415046df6c'),
      ('public.pessoas_equipamentos', 'pessoas_equipamentos_descricao', '3cbaf9b7021e6f5cb5855cc721e21580'),
      ('public.pessoas_equipamentos', 'pessoas_equipamentos_valor', '00ec4582769e37dea0cf5cdf71d0aece'),
      ('public.pessoas_equipamentos', 'pessoas_equipamentos_conta_modo_valido', 'e9ff134838b6d560adbcbe19d4f75c59'),
      ('public.hr_custo_eventos', 'hr_custo_eventos_entidade_valida', '55c9778e4ef41b9ee4a5a163dc4b5ed2')
    ) AS x(tabela, nome, h) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                    WHERE c.conrelid = to_regclass(v_f.tabela) AND c.conname::text = v_f.nome AND c.contype::text = 'c'
                      AND md5(pg_get_constraintdef(c.oid)::text) = v_f.h) THEN
      RAISE EXCEPTION 'G3: a regra % de % não está como foi lida a 26/11. Reler antes de aplicar.', v_f.nome, v_f.tabela;
    END IF;
  END LOOP;

  -- G4 Cada função que se reescreve: uma só sobrecarga, a assinatura e o corpo lidos a 26/11.
  FOR v_f IN SELECT * FROM (VALUES
      ('ativos_validar', 'p_org uuid, p_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid, p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer, p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid, p_localizacao text, p_notas text', '9d8971d32c6f2d1dc76a691bba905031'),
      ('ativos_json', 'r ativo', '79a71c2e002b7bb0fd3ef2c392723162'),
      ('rpc_ativo_criar', 'p_organization_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid, p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer, p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid, p_localizacao text, p_notas text', '4e02478fe21a169a8fcf42fc74e4f8be'),
      ('rpc_ativo_alterar', 'p_id uuid, p_organization_id uuid, p_nome text, p_tipo text, p_cat_equipamento_id uuid, p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer, p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid, p_localizacao text, p_notas text', '9129b29b89d947c1882d8f1c7c208e51'),
      ('rpc_ativo_desativar', 'p_id uuid, p_organization_id uuid, p_data date, p_motivo text, p_nota text', '7b11f0263b573f97f3e49b2f4dcafaac'),
      ('rpc_ativo_reativar', 'p_id uuid, p_organization_id uuid', '176d0a395d4a91dff359d45b6886be7c'),
      ('rpc_ativos_listar', 'p_organization_id uuid, p_incluir_desativados boolean', '9e5caa27890077ad14054c1ed1852d3c'),
      ('rpc_ativo_ler', 'p_id uuid, p_organization_id uuid', '5edabaeaef4cd185f411b3b304652a1a'),
      ('rpc_ativos_opcoes', 'p_organization_id uuid', '8cd5aa5a0497571d2d14665203b4bb75'),
      ('rpc_ativo_ligar_pessoa', 'p_ativo_id uuid, p_pessoa_equipamento_id uuid, p_organization_id uuid', '4996885b4f136e16c56414d49f67acb2'),
      ('rpc_ativo_desligar_pessoa', 'p_pessoa_equipamento_id uuid, p_organization_id uuid', 'f7bf332546a862c654ee887e1bc7d365'),
      ('rpc_hr_equipamento_atribuir', 'p_pessoa_id uuid, p_organization_id uuid, p_tipo text, p_descricao text, p_valor numeric, p_entrega date, p_conta_modo text, p_conta_meses integer, p_conta_inicio date, p_conta_fim date, p_id uuid', '39b00f636bb67f58aebafe9967aa2f3f'),
      ('rpc_hr_equipamento_devolver', 'p_id uuid, p_organization_id uuid, p_data date, p_estado text', 'ae95cd8fd0d815c9fb080c702242d09e'),
      ('rpc_hr_equipamento_alterar_conta', 'p_id uuid, p_organization_id uuid, p_modo text, p_meses integer, p_inicio date, p_fim date', '40a1d9ba60b194dcd935c65162fdbc83'),
      ('rpc_hr_equipamentos_listar', 'p_organization_id uuid, p_pessoa_id uuid, p_limite integer, p_offset integer', '6d230741d1f596b09473fe023cd1bcb1')
    ) AS x(nome, args, h) LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname::text = 'public' AND p.proname::text = v_f.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'G4: % tem % sobrecarga(s) (esperada 1).', v_f.nome, v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text = 'public' AND p.proname::text = v_f.nome
                      AND pg_get_function_identity_arguments(p.oid)::text = v_f.args
                      AND md5(p.prosrc::text) = v_f.h) THEN
      RAISE EXCEPTION 'G4: % não tem a assinatura ou o corpo lidos a 26/11. Ler a versão mais recente antes de aplicar.', v_f.nome;
    END IF;
  END LOOP;
  -- Dependências que as funções novas chamam.
  IF to_regprocedure('public.hr_custo_exigir_escrita(uuid)') IS NULL
     OR to_regprocedure('public.hr_custo_exigir_leitura(uuid)') IS NULL
     OR to_regprocedure('public.hr_custo_evento(uuid, uuid, text, uuid, text, uuid, jsonb)') IS NULL
     OR to_regprocedure('public.hr_custo_conta_normalizar(text, integer, date, date)') IS NULL
     OR to_regprocedure('public.hr_custo_data_valida(date)') IS NULL
     OR to_regprocedure('public.ativos_exigir(uuid, text)') IS NULL
     OR to_regprocedure('public.ativos_evento(uuid, uuid, text, uuid, uuid, text[])') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta uma função de que esta migration depende (hr_custo_*, ativos_exigir, ativos_evento, has_anew_permission_in_org).';
  END IF;
  SELECT count(DISTINCT p.code) INTO v_n FROM public.anew_permissions p
   WHERE p.code IN ('ativos.view', 'ativos.edit', 'inventory.view', 'hr.pessoas.retribuicao.view', 'hr.pessoas.retribuicao.edit');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'G4: faltam permissões no catálogo (encontradas % de 5). Esta migration não cria permissões.', v_n;
  END IF;

  -- G5 Códigos de erro novos ainda livres.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND (p.prosrc ~ 'ATV(19|2[0-9]|3[0-3])' OR p.prosrc ~ 'HRA91');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: há % função(ões) que já usam ATV19..ATV33 ou HRA91. Escolher outros.', v_n;
  END IF;

  -- G6 [M3] Os dados: ativos só de serviço (passam a «comprado»), todos com código; e as linhas
  --    do RH que a carga converte têm de se converter sozinhas. Senão PARA, com a contagem.
  SELECT count(*) INTO v_n FROM public.ativo a WHERE a.grupo <> 'servico';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G6: há % ativo(s) de pessoa ou estrutura (esperado 0 a 26/11). Rever o desenho antes de aplicar.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.ativo a WHERE a.codigo IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G6: % ativo(s) sem código (o código passa a obrigatório). Dar-lhes código antes.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.pessoas_equipamentos e WHERE e.ativo_id IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G6: % linha(s) do RH já ligadas a um ativo pela fase 1 (esperado 0). A carga não as trata: tratar à mão antes.', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.pessoas_equipamentos e
    LEFT JOIN public.anew_users au ON au.id = e.created_by
   WHERE e.ativo_id IS NULL AND e.tipo <> 'fardamento'
     AND (au.auth_user_id IS NULL
          OR (e.conta_modo IN ('repartido', 'umaVez') AND e.entrega > v_hoje + 7)
          OR (e.conta_modo = 'todosMeses'
              AND (e.conta_inicio > e.entrega
                   OR e.conta_inicio > v_hoje + 366
                   OR (e.conta_fim IS NOT NULL
                       AND e.entrega > (date_trunc('month', e.conta_fim::timestamp) + interval '1 month')::date - 1))));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G6: % linha(s) do RH não se convertem sozinhas em ativo (sem autor, compra no futuro, ou entrega fora do «todos os meses»). Tratar à mão antes de aplicar.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.pessoas_equipamentos e WHERE e.ativo_id IS NULL AND e.tipo <> 'fardamento';
  RAISE NOTICE 'G6: % linha(s) do RH a converter em ativo na carga inicial.', v_n;
END;
$guardas$;

-- ==============================================================================
-- 1. ativo: colunas
-- ==============================================================================
ALTER TABLE public.ativo ADD COLUMN forma_aquisicao text NOT NULL DEFAULT 'comprado';
ALTER TABLE public.ativo ADD COLUMN renda_mensal numeric(12,2);
ALTER TABLE public.ativo ADD COLUMN inicio_aluguer date;
ALTER TABLE public.ativo ADD COLUMN fim_aluguer date;
ALTER TABLE public.ativo ADD COLUMN vida_origem text;
ALTER TABLE public.ativo ADD COLUMN warehouse_id uuid;
ALTER TABLE public.ativo ALTER COLUMN valor_compra DROP NOT NULL;
ALTER TABLE public.ativo ALTER COLUMN data_compra DROP NOT NULL;
ALTER TABLE public.ativo ALTER COLUMN codigo SET NOT NULL;

COMMENT ON COLUMN public.ativo.forma_aquisicao IS
'comprado (valor e data de compra, amortiza) ou alugado (renda mensal, início e fim opcional; sem compra nem amortização; grupo pessoa ou estrutura). Não muda depois de criado. Desde 20270129100000.';
COMMENT ON COLUMN public.ativo.renda_mensal IS 'Só no alugado: a renda de cada mês do contrato, inteira (sem rateio por dias na A1). Desde 20270129100000.';
COMMENT ON COLUMN public.ativo.inicio_aluguer IS 'Só no alugado: início do contrato; <= primeira entrega. Desde 20270129100000.';
COMMENT ON COLUMN public.ativo.fim_aluguer IS 'Só no alugado: fim do contrato (NULL = sem fim); >= última entrega. A desativação pode ser depois do fim; a renda pára no mais cedo dos dois. Desde 20270129100000.';
COMMENT ON COLUMN public.ativo.vida_origem IS 'Só no comprado: de onde veio a vida útil (pagamento, catalogo copiada no momento, manual). Desde 20270129100000.';
COMMENT ON COLUMN public.ativo.warehouse_id IS 'Armazém do Stock que este ativo de instalações representa (mesma empresa; um só ativo vivo por armazém). O nome só se mostra a quem tem inventory.view. Desde 20270129100000.';

-- ==============================================================================
-- 2. ativo: CHECKs (novas e DROP+ADD das três que mudam)
-- ==============================================================================
ALTER TABLE public.ativo ADD CONSTRAINT ativo_forma_aquisicao_valida CHECK (forma_aquisicao IN ('comprado', 'alugado'));
ALTER TABLE public.ativo ADD CONSTRAINT ativo_forma_coerente CHECK (
  (forma_aquisicao = 'comprado'
     AND valor_compra IS NOT NULL AND data_compra IS NOT NULL
     AND renda_mensal IS NULL AND inicio_aluguer IS NULL AND fim_aluguer IS NULL)
  OR (forma_aquisicao = 'alugado' AND grupo IN ('pessoa', 'estrutura')
     AND valor_compra IS NULL AND data_compra IS NULL AND vida_meses IS NULL AND vida_origem IS NULL
     AND valor_residual = 0 AND renda_mensal IS NOT NULL AND inicio_aluguer IS NOT NULL));
ALTER TABLE public.ativo ADD CONSTRAINT ativo_renda_mensal CHECK (
  renda_mensal IS NULL OR (renda_mensal > 0 AND renda_mensal <= 9999999999.99));
ALTER TABLE public.ativo ADD CONSTRAINT ativo_aluguer_datas CHECK (
  (inicio_aluguer IS NULL OR inicio_aluguer BETWEEN DATE '2000-01-01' AND DATE '2100-01-01')
  AND (fim_aluguer IS NULL OR fim_aluguer BETWEEN DATE '2000-01-01' AND DATE '2100-01-01')
  AND (fim_aluguer IS NULL OR inicio_aluguer IS NULL OR fim_aluguer >= inicio_aluguer));
ALTER TABLE public.ativo ADD CONSTRAINT ativo_vida_origem CHECK (
  vida_origem IS NULL
  OR (vida_origem IN ('pagamento', 'catalogo', 'manual') AND (vida_origem <> 'catalogo' OR cat_equipamento_id IS NOT NULL)));
ALTER TABLE public.ativo ADD CONSTRAINT ativo_armazem_coerente CHECK (
  warehouse_id IS NULL OR (grupo = 'estrutura' AND tipo = 'instalacoes'));

ALTER TABLE public.ativo DROP CONSTRAINT ativo_vida_meses;
ALTER TABLE public.ativo ADD CONSTRAINT ativo_vida_meses CHECK (
  (vida_meses IS NULL OR vida_meses BETWEEN 1 AND 600)
  AND (grupo = 'servico' OR forma_aquisicao = 'alugado' OR vida_meses IS NOT NULL));

-- [M1] coalesce: no alugado data_compra é nula e a comparação com nulo deixava passar tudo.
ALTER TABLE public.ativo DROP CONSTRAINT ativo_desativacao_coerente;
ALTER TABLE public.ativo ADD CONSTRAINT ativo_desativacao_coerente CHECK (
  (estado = 'ativo' AND desativado_em IS NULL AND desativado_motivo IS NULL AND desativado_nota IS NULL)
  OR (estado = 'desativado' AND desativado_em IS NOT NULL AND desativado_motivo IS NOT NULL
      AND desativado_em >= coalesce(data_compra, inicio_aluguer) AND desativado_em <= DATE '2100-01-01'));

-- Serviço: catálogo obrigatório; pessoa: opcional; estrutura: sem catálogo.
ALTER TABLE public.ativo DROP CONSTRAINT ativo_equipamento_coerente;
ALTER TABLE public.ativo ADD CONSTRAINT ativo_equipamento_coerente CHECK (
  (grupo = 'servico' AND cat_equipamento_id IS NOT NULL)
  OR grupo = 'pessoa'
  OR (grupo = 'estrutura' AND cat_equipamento_id IS NULL));

-- ==============================================================================
-- 3. Armazém: mesma empresa e um só ativo vivo por armazém
-- ==============================================================================
-- Redundante com a chave primária (não pode falhar); serve só a FK composta.
ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_id_org_key UNIQUE (id, organization_id);
ALTER TABLE public.ativo
  ADD CONSTRAINT ativo_warehouse_fkey
  FOREIGN KEY (warehouse_id, organization_id) REFERENCES public.warehouses (id, organization_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX ativo_warehouse_ativo_key ON public.ativo (warehouse_id) WHERE warehouse_id IS NOT NULL AND estado = 'ativo';

-- ==============================================================================
-- 4. ativo_eventos: ocupacao_corrigida e campos novos (DROP+ADD)
-- ==============================================================================
ALTER TABLE public.ativo_eventos DROP CONSTRAINT ativo_eventos_tipo_valido;
ALTER TABLE public.ativo_eventos ADD CONSTRAINT ativo_eventos_tipo_valido CHECK (
  tipo IN ('criado', 'alterado', 'desativado', 'reativado', 'ligado', 'desligado', 'ocupacao_corrigida'));
ALTER TABLE public.ativo_eventos DROP CONSTRAINT ativo_eventos_ligacao_coerente;
ALTER TABLE public.ativo_eventos ADD CONSTRAINT ativo_eventos_ligacao_coerente CHECK (
  (tipo IN ('ligado', 'desligado', 'ocupacao_corrigida')) = (pessoa_equipamento_id IS NOT NULL));
ALTER TABLE public.ativo_eventos DROP CONSTRAINT ativo_eventos_campos;
ALTER TABLE public.ativo_eventos ADD CONSTRAINT ativo_eventos_campos CHECK (
  cardinality(campos) <= 25
  AND campos <@ ARRAY['nome', 'tipo', 'codigo', 'num_serie', 'cat_equipamento_id', 'data_compra', 'valor_compra',
                      'valor_residual', 'vida_meses', 'manutencao_ano', 'centro_custo_id', 'localizacao', 'notas',
                      'estado', 'desativado_em', 'desativado_motivo', 'desativado_nota',
                      'forma_aquisicao', 'renda_mensal', 'inicio_aluguer', 'fim_aluguer', 'vida_origem',
                      'warehouse_id', 'entrega', 'devolucao']::text[]
  AND (tipo <> 'ocupacao_corrigida' OR (cardinality(campos) >= 1 AND campos <@ ARRAY['entrega', 'devolucao']::text[])));

-- ==============================================================================
-- 5. pessoas_equipamentos: a linha com ativo não guarda cópia nenhuma
-- ==============================================================================
-- As CHECKs de hoje destas colunas dão NULL com nulos (deixam passar); quem obriga
-- passa a ser pessoas_equipamentos_fonte_unica (ponto 9, DEPOIS da carga).
ALTER TABLE public.pessoas_equipamentos ALTER COLUMN tipo DROP NOT NULL;
ALTER TABLE public.pessoas_equipamentos ALTER COLUMN descricao DROP NOT NULL;
ALTER TABLE public.pessoas_equipamentos ALTER COLUMN valor DROP NOT NULL;
ALTER TABLE public.pessoas_equipamentos ALTER COLUMN conta_modo DROP NOT NULL;
ALTER TABLE public.pessoas_equipamentos ALTER COLUMN conta_modo DROP DEFAULT;

-- ==============================================================================
-- 6. Contador do código por empresa e prefixo
-- ==============================================================================
CREATE TABLE public.ativo_codigo_contador (
  organization_id uuid    NOT NULL,
  prefixo         text    NOT NULL,
  ultimo          integer NOT NULL,
  CONSTRAINT ativo_codigo_contador_pkey PRIMARY KEY (organization_id, prefixo),
  CONSTRAINT ativo_codigo_contador_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT ativo_codigo_contador_prefixo CHECK (prefixo ~ '^[A-Z]{2,4}$'),
  CONSTRAINT ativo_codigo_contador_ultimo CHECK (ultimo >= 1)
);
COMMENT ON TABLE public.ativo_codigo_contador IS
'Último número gerado por empresa e prefixo (PC-0001, TLM-0001...). Só ativos_proximo_codigo escreve; sem acesso direto. Desde 20270129100000.';
REVOKE ALL ON TABLE public.ativo_codigo_contador FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.ativo_codigo_contador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ativo_codigo_contador FORCE ROW LEVEL SECURITY;

-- ==============================================================================
-- 7. Funções
--    Ordem dos trincos (para não haver impasse), igual em todas:
--    0. pg_advisory_xact_lock('hr_custo:' || uid), dentro de hr_custo_exigir_escrita (só RH);
--    1. a linha de ativo (FOR UPDATE); 2. o trinco por pessoa ('hr_equipamentos:' || pessoa);
--    3. ativo_codigo_contador (só ao gerar código); 4. as linhas de pessoas_equipamentos.
-- ==============================================================================

-- 7.1 «Hoje» em Lisboa (a base corre em UTC). Sem pesquisa a catálogos.
CREATE FUNCTION public.ativos_hoje()
RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date
$$;

-- 7.2 Prefixo do código por grupo e tipo.
CREATE FUNCTION public.ativos_prefixo(p_grupo text, p_tipo text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_grupo = 'servico' THEN 'EQP'
    WHEN p_grupo = 'pessoa' THEN CASE p_tipo
      WHEN 'telemovel' THEN 'TLM' WHEN 'portatil' THEN 'PC' WHEN 'viatura' THEN 'VIA'
      WHEN 'fardamento' THEN 'FAR' WHEN 'ferramentas' THEN 'FER' ELSE 'PES' END
    WHEN p_grupo = 'estrutura' THEN CASE p_tipo
      WHEN 'instalacoes' THEN 'INS' WHEN 'mobiliario' THEN 'MOB' WHEN 'eletronica' THEN 'ELE' ELSE 'EST' END
    ELSE 'ATV' END
$$;

-- 7.3 Próximo código livre (trinco 3: a linha do contador fica trancada até ao fim).
--     Salta códigos já escritos à mão; até 50 tentativas.
CREATE FUNCTION public.ativos_proximo_codigo(p_org uuid, p_grupo text, p_tipo text)
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_pref text := public.ativos_prefixo(p_grupo, p_tipo);
  v_n    integer;
  v_cod  text;
BEGIN
  FOR i IN 1..50 LOOP
    INSERT INTO public.ativo_codigo_contador AS c (organization_id, prefixo, ultimo)
    VALUES (p_org, v_pref, 1)
    ON CONFLICT (organization_id, prefixo) DO UPDATE SET ultimo = c.ultimo + 1
    RETURNING c.ultimo INTO v_n;
    -- lpad cortaria números com mais de 4 algarismos: só se preenche abaixo de 10000.
    v_cod := v_pref || '-' || CASE WHEN v_n < 10000 THEN lpad(v_n::text, 4, '0') ELSE v_n::text END;
    IF NOT EXISTS (SELECT 1 FROM public.ativo a
                    WHERE a.organization_id = p_org AND a.codigo IS NOT NULL AND lower(a.codigo) = lower(v_cod)) THEN
      RETURN v_cod;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'ATV32' USING ERRCODE = 'P0001', DETAIL = 'Não foi possível gerar um código livre. Escreva o código à mão.';
END;
$$;

-- 7.4 Validar (DROP da assinatura antiga e CREATE da nova; interna). Devolve a linha pronta.
DROP FUNCTION public.ativos_validar(uuid, uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text);
CREATE FUNCTION public.ativos_validar(
  p_org uuid, p_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid,
  p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer,
  p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid,
  p_localizacao text, p_notas text,
  p_vida_origem text, p_warehouse_id uuid, p_forma_aquisicao text, p_renda_mensal numeric,
  p_inicio_aluguer date, p_fim_aluguer date)
RETURNS public.ativo
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  c_max      constant numeric := 9999999999.99;
  v          public.ativo;
  v_atual    public.ativo;
  v_compra   numeric;
  v_residual numeric;
  v_manut    numeric;
  v_renda    numeric;
  v_hoje     date := public.ativos_hoje();
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_org;
  END IF;
  v.organization_id := p_org;

  v.grupo := nullif(btrim(p_grupo), '');
  IF v.grupo IS NULL OR v.grupo NOT IN ('pessoa', 'servico', 'estrutura') THEN
    RAISE EXCEPTION 'ATV02' USING ERRCODE = 'P0001', DETAIL = 'Grupo inválido: escolha Serviço, Estrutura ou Pessoas.';
  END IF;

  v.nome := nullif(btrim(p_nome), '');
  IF v.nome IS NULL OR length(v.nome) > 120 OR v.nome ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'O nome é obrigatório e tem no máximo 120 caracteres.';
  END IF;

  v.tipo := nullif(btrim(p_tipo), '');
  IF (v.grupo = 'pessoa' AND (v.tipo IS NULL OR v.tipo NOT IN ('telemovel', 'portatil', 'viatura', 'fardamento', 'ferramentas', 'outro')))
     OR (v.grupo = 'estrutura' AND (v.tipo IS NULL OR v.tipo NOT IN ('instalacoes', 'mobiliario', 'eletronica', 'outro')))
     OR (v.grupo = 'servico' AND v.tipo IS NOT NULL) THEN
    RAISE EXCEPTION 'ATV04' USING ERRCODE = 'P0001', DETAIL = 'O tipo não serve para este grupo.';
  END IF;
  -- [M7] A farda ainda não é ativo (decisão adiada pelo dono): fica só no RH.
  IF v.grupo = 'pessoa' AND v.tipo = 'fardamento' THEN
    RAISE EXCEPTION 'ATV23' USING ERRCODE = 'P0001', DETAIL = 'O fardamento ainda não é registado como ativo: atribua-o no RH.';
  END IF;

  v.forma_aquisicao := coalesce(nullif(btrim(p_forma_aquisicao), ''), 'comprado');
  IF v.forma_aquisicao NOT IN ('comprado', 'alugado') THEN
    RAISE EXCEPTION 'ATV19' USING ERRCODE = 'P0001', DETAIL = 'Escolha se o ativo é comprado ou alugado.';
  END IF;
  IF v.forma_aquisicao = 'alugado' AND v.grupo = 'servico' THEN
    RAISE EXCEPTION 'ATV19' USING ERRCODE = 'P0001', DETAIL = 'Os ativos de serviço não podem ser alugados nesta fase.';
  END IF;

  -- Catálogo: serviço obrigatório; pessoa opcional; estrutura nunca.
  IF v.grupo = 'servico' AND p_cat_equipamento_id IS NULL THEN
    RAISE EXCEPTION 'ATV05' USING ERRCODE = 'P0001', DETAIL = 'Escolha o equipamento do catálogo a que esta máquina corresponde.';
  END IF;
  IF v.grupo = 'estrutura' AND p_cat_equipamento_id IS NOT NULL THEN
    RAISE EXCEPTION 'ATV06' USING ERRCODE = 'P0001', DETAIL = 'Os ativos de estrutura não se ligam a um equipamento do catálogo.';
  END IF;
  IF p_cat_equipamento_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.cat_equipamentos e
        WHERE e.id = p_cat_equipamento_id AND e.organization_id = p_org
          AND (e.apagado_em IS NULL OR e.id IS NOT DISTINCT FROM v_atual.cat_equipamento_id)) THEN
    RAISE EXCEPTION 'ATV05' USING ERRCODE = 'P0001', DETAIL = 'O equipamento do catálogo não existe nesta organização.';
  END IF;
  v.cat_equipamento_id := p_cat_equipamento_id;

  IF v.forma_aquisicao = 'comprado' THEN
    IF p_renda_mensal IS NOT NULL OR p_inicio_aluguer IS NOT NULL OR p_fim_aluguer IS NOT NULL THEN
      RAISE EXCEPTION 'ATV19' USING ERRCODE = 'P0001', DETAIL = 'Um ativo comprado não tem renda nem datas de aluguer.';
    END IF;
    IF p_data_compra IS NULL OR NOT isfinite(p_data_compra) OR p_data_compra < DATE '2000-01-01'
       OR p_data_compra > v_hoje + 7 THEN
      RAISE EXCEPTION 'ATV07' USING ERRCODE = 'P0001', DETAIL = 'A data de compra é inválida.';
    END IF;
    v.data_compra := p_data_compra;
    -- Arredonda ao cêntimo ANTES de validar; o teto apanha NaN e infinito.
    v_compra := round(p_valor_compra, 2);
    IF v_compra IS NULL OR NOT (v_compra > 0 AND v_compra <= c_max) THEN
      RAISE EXCEPTION 'ATV08' USING ERRCODE = 'P0001', DETAIL = 'O valor de compra tem de ser maior do que zero.';
    END IF;
    v_residual := round(coalesce(p_valor_residual, 0), 2);
    IF NOT (v_residual >= 0 AND v_residual <= v_compra) THEN
      RAISE EXCEPTION 'ATV09' USING ERRCODE = 'P0001', DETAIL = 'O valor residual não pode ser negativo nem maior do que o valor de compra.';
    END IF;
    v.valor_compra := v_compra;
    v.valor_residual := v_residual;
    IF (p_vida_meses IS NULL AND v.grupo <> 'servico')
       OR (p_vida_meses IS NOT NULL AND (p_vida_meses < 1 OR p_vida_meses > 600)) THEN
      RAISE EXCEPTION 'ATV10' USING ERRCODE = 'P0001', DETAIL = 'A vida útil tem de estar entre 1 e 600 meses.';
    END IF;
    v.vida_meses := p_vida_meses;
    v.vida_origem := nullif(btrim(p_vida_origem), '');
    IF v.vida_origem IS NOT NULL
       AND (v.vida_origem NOT IN ('pagamento', 'catalogo', 'manual')
            OR (v.vida_origem = 'catalogo' AND v.cat_equipamento_id IS NULL)) THEN
      RAISE EXCEPTION 'ATV24' USING ERRCODE = 'P0001', DETAIL = 'A origem da vida útil é inválida (a do catálogo exige um equipamento do catálogo).';
    END IF;
  ELSE
    IF p_data_compra IS NOT NULL OR p_valor_compra IS NOT NULL OR p_vida_meses IS NOT NULL
       OR nullif(btrim(p_vida_origem), '') IS NOT NULL OR round(coalesce(p_valor_residual, 0), 2) <> 0 THEN
      RAISE EXCEPTION 'ATV19' USING ERRCODE = 'P0001', DETAIL = 'Um ativo alugado não tem compra, residual nem vida útil.';
    END IF;
    v.valor_residual := 0;
    v_renda := round(p_renda_mensal, 2);
    IF v_renda IS NULL OR NOT (v_renda > 0 AND v_renda <= c_max) THEN
      RAISE EXCEPTION 'ATV20' USING ERRCODE = 'P0001', DETAIL = 'A renda mensal tem de ser maior do que zero.';
    END IF;
    v.renda_mensal := v_renda;
    IF p_inicio_aluguer IS NULL OR NOT isfinite(p_inicio_aluguer) OR p_inicio_aluguer < DATE '2000-01-01'
       OR p_inicio_aluguer > v_hoje + 366
       OR (p_fim_aluguer IS NOT NULL AND (NOT isfinite(p_fim_aluguer) OR p_fim_aluguer < p_inicio_aluguer
                                          OR p_fim_aluguer > DATE '2100-01-01')) THEN
      RAISE EXCEPTION 'ATV21' USING ERRCODE = 'P0001', DETAIL = 'Indique o início do aluguer; o fim, se houver, não pode ser antes do início.';
    END IF;
    v.inicio_aluguer := p_inicio_aluguer;
    v.fim_aluguer := p_fim_aluguer;
  END IF;

  v_manut := round(coalesce(p_manutencao_ano, 0), 2);
  IF NOT (v_manut >= 0 AND v_manut <= c_max) THEN
    RAISE EXCEPTION 'ATV11' USING ERRCODE = 'P0001', DETAIL = 'A manutenção por ano não pode ser negativa.';
  END IF;
  v.manutencao_ano := v_manut;

  v.codigo := nullif(btrim(p_codigo), '');
  IF v.codigo IS NOT NULL AND (length(v.codigo) > 40 OR v.codigo ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'O código tem no máximo 40 caracteres.';
  END IF;
  IF v.codigo IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.ativo a
        WHERE a.organization_id = p_org AND a.codigo IS NOT NULL
          AND lower(a.codigo) = lower(v.codigo) AND a.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'ATV12' USING ERRCODE = 'P0001', DETAIL = 'Já existe um ativo com este código.';
  END IF;

  v.num_serie := nullif(btrim(p_num_serie), '');
  IF v.num_serie IS NOT NULL AND (length(v.num_serie) > 80 OR v.num_serie ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'O número de série tem no máximo 80 caracteres.';
  END IF;
  v.localizacao := nullif(btrim(p_localizacao), '');
  IF v.localizacao IS NOT NULL AND (length(v.localizacao) > 120 OR v.localizacao ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'A localização tem no máximo 120 caracteres.';
  END IF;
  v.notas := nullif(btrim(p_notas), '');
  IF v.notas IS NOT NULL AND length(v.notas) > 1000 THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'As notas têm no máximo 1000 caracteres.';
  END IF;

  IF p_centro_custo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_centro_custo c
        WHERE c.id = p_centro_custo_id AND c.organization_id = p_org
          AND (c.ativo OR c.id IS NOT DISTINCT FROM v_atual.centro_custo_id)) THEN
    RAISE EXCEPTION 'ATV13' USING ERRCODE = 'P0001', DETAIL = 'O centro de custo não existe nesta organização ou está inativo.';
  END IF;
  v.centro_custo_id := p_centro_custo_id;

  -- Armazém: só instalações de estrutura; ligar ou mudar exige inventory.view; mesma empresa;
  -- um só ativo vivo por armazém.
  IF p_warehouse_id IS NOT NULL THEN
    IF NOT (v.grupo = 'estrutura' AND v.tipo = 'instalacoes') THEN
      RAISE EXCEPTION 'ATV22' USING ERRCODE = 'P0001', DETAIL = 'Só um ativo de estrutura do tipo instalações se liga a um armazém.';
    END IF;
    IF p_warehouse_id IS DISTINCT FROM v_atual.warehouse_id
       AND NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'inventory.view', p_org), false) THEN
      RAISE EXCEPTION 'ATV22' USING ERRCODE = 'P0001', DETAIL = 'Para ligar um armazém precisa de ver o Stock.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.warehouses w
                    WHERE w.id = p_warehouse_id AND w.organization_id = p_org
                      AND (w.deleted_at IS NULL OR w.id IS NOT DISTINCT FROM v_atual.warehouse_id)) THEN
      RAISE EXCEPTION 'ATV22' USING ERRCODE = 'P0001', DETAIL = 'O armazém não existe nesta organização.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ativo a
                WHERE a.warehouse_id = p_warehouse_id AND a.estado = 'ativo' AND a.id IS DISTINCT FROM p_id) THEN
      RAISE EXCEPTION 'ATV22' USING ERRCODE = 'P0001', DETAIL = 'Este armazém já está ligado a outro ativo.';
    END IF;
  END IF;
  v.warehouse_id := p_warehouse_id;

  RETURN v;
END;
$$;

-- 7.5 O ativo em JSON (colunas explícitas; nunca to_jsonb da linha). O armazém só como
--     armazem_ligado: o id e o nome saem em ler/listar a quem tem inventory.view.
CREATE OR REPLACE FUNCTION public.ativos_json(r public.ativo)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'grupo', r.grupo, 'tipo', r.tipo, 'nome', r.nome, 'codigo', r.codigo, 'num_serie', r.num_serie,
    'cat_equipamento_id', r.cat_equipamento_id, 'data_compra', r.data_compra, 'valor_compra', r.valor_compra,
    'valor_residual', r.valor_residual, 'vida_meses', r.vida_meses, 'manutencao_ano', r.manutencao_ano,
    'centro_custo_id', r.centro_custo_id, 'localizacao', r.localizacao, 'notas', r.notas, 'estado', r.estado,
    'desativado_em', r.desativado_em, 'desativado_motivo', r.desativado_motivo, 'desativado_nota', r.desativado_nota,
    'created_at', r.created_at, 'updated_at', r.updated_at,
    'forma_aquisicao', r.forma_aquisicao, 'renda_mensal', r.renda_mensal, 'inicio_aluguer', r.inicio_aluguer,
    'fim_aluguer', r.fim_aluguer, 'vida_origem', r.vida_origem, 'armazem_ligado', r.warehouse_id IS NOT NULL)
$$;

-- 7.6 Criar (interna): valida, gera o código se vier vazio, insere e escreve `criado`.
--     Quem chama já conferiu as permissões.
CREATE FUNCTION public.ativos_criar_interno(
  p_org uuid, p_actor uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid,
  p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer,
  p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid,
  p_localizacao text, p_notas text,
  p_vida_origem text, p_warehouse_id uuid, p_forma_aquisicao text, p_renda_mensal numeric,
  p_inicio_aluguer date, p_fim_aluguer date)
RETURNS public.ativo
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v     public.ativo;
  v_con text;
BEGIN
  v := public.ativos_validar(p_org, NULL, p_grupo, p_nome, p_tipo, p_cat_equipamento_id,
                             p_data_compra, p_valor_compra, p_valor_residual, p_vida_meses, p_manutencao_ano,
                             p_codigo, p_num_serie, p_centro_custo_id, p_localizacao, p_notas,
                             p_vida_origem, p_warehouse_id, p_forma_aquisicao, p_renda_mensal,
                             p_inicio_aluguer, p_fim_aluguer);
  IF v.codigo IS NULL THEN
    v.codigo := public.ativos_proximo_codigo(p_org, v.grupo, v.tipo);
  END IF;
  v.id := gen_random_uuid();
  BEGIN
    INSERT INTO public.ativo
      (id, organization_id, grupo, tipo, nome, codigo, num_serie, cat_equipamento_id, data_compra, valor_compra,
       valor_residual, vida_meses, manutencao_ano, centro_custo_id, localizacao, notas, estado,
       forma_aquisicao, renda_mensal, inicio_aluguer, fim_aluguer, vida_origem, warehouse_id, created_by, updated_by)
    VALUES
      (v.id, p_org, v.grupo, v.tipo, v.nome, v.codigo, v.num_serie, v.cat_equipamento_id, v.data_compra,
       v.valor_compra, v.valor_residual, v.vida_meses, v.manutencao_ano, v.centro_custo_id, v.localizacao, v.notas,
       'ativo', v.forma_aquisicao, v.renda_mensal, v.inicio_aluguer, v.fim_aluguer, v.vida_origem, v.warehouse_id,
       p_actor, p_actor);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    IF v_con = 'ativo_warehouse_ativo_key' THEN
      RAISE EXCEPTION 'ATV22' USING ERRCODE = 'P0001', DETAIL = 'Este armazém já está ligado a outro ativo.';
    END IF;
    RAISE EXCEPTION 'ATV12' USING ERRCODE = 'P0001', DETAIL = 'Já existe um ativo com este código.';
  END;
  PERFORM public.ativos_evento(p_org, v.id, 'criado', p_actor, NULL, '{}'::text[]);
  SELECT * INTO v FROM public.ativo a WHERE a.id = v.id;
  RETURN v;
END;
$$;

-- 7.7 [M8] A regra única «linha do RH → ativo» (atribuição sem p_ativo_id e carga inicial).
--     pessoas_equipamentos NÃO tem data_compra: vem de p_data_compra (a carga passa a entrega).
--     repartido/umaVez => comprado (vida = meses ou 1, origem pagamento); todosMeses => alugado
--     [M4] (renda = valor, início = conta_inicio, fim = último dia do mês de conta_fim).
--     Nome = btrim(left(btrim(descricao), 120)): o btrim DEPOIS de cortar (CHECK ativo_nome).
CREATE FUNCTION public.ativos_de_linha_rh(
  p_org uuid, p_actor uuid, p_tipo text, p_descricao text, p_valor numeric, p_entrega date,
  p_conta_modo text, p_conta_meses integer, p_conta_inicio date, p_conta_fim date,
  p_data_compra date, p_vida_origem text, p_vida_meses integer, p_cat_equipamento_id uuid,
  p_forma_aquisicao text, p_renda_mensal numeric, p_inicio_aluguer date, p_fim_aluguer date)
RETURNS public.ativo
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_forma  text := coalesce(nullif(btrim(p_forma_aquisicao), ''),
                            CASE WHEN p_conta_modo = 'todosMeses' THEN 'alugado' ELSE 'comprado' END);
  v_nome   text := btrim(left(btrim(p_descricao), 120));
  v_vida   integer := p_vida_meses;
  v_origem text := nullif(btrim(p_vida_origem), '');
  v_fim    date;
BEGIN
  IF v_forma = 'alugado' THEN
    v_fim := coalesce(p_fim_aluguer,
                      CASE WHEN p_conta_fim IS NOT NULL
                           THEN (date_trunc('month', p_conta_fim::timestamp) + interval '1 month')::date - 1 END);
    RETURN public.ativos_criar_interno(
      p_org, p_actor, 'pessoa', v_nome, p_tipo, p_cat_equipamento_id,
      NULL, NULL, 0, NULL, 0, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, 'alugado', coalesce(p_renda_mensal, p_valor), coalesce(p_inicio_aluguer, p_conta_inicio), v_fim);
  END IF;

  IF v_vida IS NULL AND v_origem = 'catalogo' AND p_cat_equipamento_id IS NOT NULL THEN
    SELECT least(600, greatest(1, round(e.vida_anos * 12)))::integer INTO v_vida
      FROM public.cat_equipamentos e
     WHERE e.id = p_cat_equipamento_id AND e.organization_id = p_org;
  END IF;
  IF v_vida IS NULL THEN
    v_vida := CASE p_conta_modo WHEN 'repartido' THEN p_conta_meses WHEN 'umaVez' THEN 1 END;
    IF v_vida IS NOT NULL THEN
      v_origem := coalesce(v_origem, 'pagamento');
    END IF;
  ELSE
    v_origem := coalesce(v_origem, 'manual');
  END IF;
  RETURN public.ativos_criar_interno(
    p_org, p_actor, 'pessoa', v_nome, p_tipo, p_cat_equipamento_id,
    coalesce(p_data_compra, p_entrega), p_valor, 0, v_vida, 0, NULL, NULL, NULL, NULL, NULL,
    v_origem, NULL, 'comprado', NULL, NULL, NULL);
END;
$$;

-- 7.8 Pode este ativo ser entregue a uma pessoa nesta data? (interna; o ativo já trancado.)
--     [M5] [M7] Tocar num dia é permitido: a entrega pode ser no dia da devolução anterior.
CREATE FUNCTION public.ativos_verificar_entrega(p_a public.ativo, p_pessoa_equipamento_id uuid, p_entrega date)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_a.grupo <> 'pessoa' THEN
    RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'Só os ativos do grupo Pessoas se entregam a uma pessoa.';
  END IF;
  IF p_a.estado <> 'ativo' THEN
    RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'Este ativo está desativado. Reative-o em Ativos antes de o entregar.';
  END IF;
  IF p_a.tipo = 'fardamento' THEN
    RAISE EXCEPTION 'ATV23' USING ERRCODE = 'P0001', DETAIL = 'O fardamento ainda não é registado como ativo: atribua-o no RH.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_equipamentos o
              WHERE o.ativo_id = p_a.id AND o.organization_id = p_a.organization_id AND o.estado = 'atribuido'
                AND o.id IS DISTINCT FROM p_pessoa_equipamento_id) THEN
    RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'Este ativo já está entregue a outra pessoa.';
  END IF;
  IF p_entrega < coalesce(p_a.data_compra, p_a.inicio_aluguer) THEN
    RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'A data de entrega é anterior à compra ou ao início do aluguer.';
  END IF;
  IF p_a.forma_aquisicao = 'alugado' AND p_a.fim_aluguer IS NOT NULL THEN
    IF p_entrega > p_a.fim_aluguer THEN
      RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'A data de entrega é depois do fim do aluguer.';
    END IF;
    IF p_a.fim_aluguer < public.ativos_hoje() THEN
      RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'O contrato de aluguer já terminou: não se entrega.';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_equipamentos o
              WHERE o.ativo_id = p_a.id AND o.organization_id = p_a.organization_id
                AND o.id IS DISTINCT FROM p_pessoa_equipamento_id
                AND coalesce(o.devolucao, 'infinity'::date) > p_entrega) THEN
    RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'Esta entrega cruza outra ocupação do mesmo ativo. Corrija as datas.';
  END IF;
END;
$$;

-- 7.9 Criar (ativos.edit). Os 15 parâmetros de hoje iguais; os novos no FIM com DEFAULT NULL.
--     DROP e CREATE na mesma transação (um CREATE OR REPLACE com outra lista criaria uma
--     segunda sobrecarga e o PostgREST recusaria a chamada antiga, PGRST203).
DROP FUNCTION public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text);
CREATE FUNCTION public.rpc_ativo_criar(
  p_organization_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid,
  p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer,
  p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid,
  p_localizacao text, p_notas text,
  p_vida_origem text DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_forma_aquisicao text DEFAULT NULL,
  p_renda_mensal numeric DEFAULT NULL, p_inicio_aluguer date DEFAULT NULL, p_fim_aluguer date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v       public.ativo;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  v := public.ativos_criar_interno(p_organization_id, v_actor, p_grupo, p_nome, p_tipo, p_cat_equipamento_id,
                                   p_data_compra, p_valor_compra, p_valor_residual, p_vida_meses, p_manutencao_ano,
                                   p_codigo, p_num_serie, p_centro_custo_id, p_localizacao, p_notas,
                                   p_vida_origem, p_warehouse_id, p_forma_aquisicao, p_renda_mensal,
                                   p_inicio_aluguer, p_fim_aluguer);
  RETURN jsonb_build_object('id', v.id, 'codigo', v.codigo);
END;
$$;

-- 7.10 Alterar (ativos.edit). Os 15 de hoje iguais + os 6 novos + p_campos_novos no FIM.
--      Com p_campos_novos = false (o ecrã de hoje) as colunas novas ficam como estão.
--      Recusa mudar a forma, compra/início depois da primeira entrega, fim antes da última.
DROP FUNCTION public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text);
CREATE FUNCTION public.rpc_ativo_alterar(
  p_id uuid, p_organization_id uuid, p_nome text, p_tipo text, p_cat_equipamento_id uuid,
  p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer,
  p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid,
  p_localizacao text, p_notas text,
  p_vida_origem text DEFAULT NULL, p_warehouse_id uuid DEFAULT NULL, p_forma_aquisicao text DEFAULT NULL,
  p_renda_mensal numeric DEFAULT NULL, p_inicio_aluguer date DEFAULT NULL, p_fim_aluguer date DEFAULT NULL,
  p_campos_novos boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor  uuid;
  v_atual  public.ativo;
  v        public.ativo;
  v_novos  boolean := coalesce(p_campos_novos, false);
  v_campos text[];
  v_min    date;
  v_max    date;
  v_con    text;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_atual.estado <> 'ativo' THEN
    RAISE EXCEPTION 'ATV15' USING ERRCODE = 'P0001', DETAIL = 'Este ativo está desativado. Reative-o antes de o alterar.';
  END IF;
  IF v_novos AND nullif(btrim(p_forma_aquisicao), '') IS NOT NULL
     AND btrim(p_forma_aquisicao) <> v_atual.forma_aquisicao THEN
    RAISE EXCEPTION 'ATV19' USING ERRCODE = 'P0001', DETAIL = 'Um ativo não muda de comprado para alugado nem ao contrário: crie outro ativo.';
  END IF;

  v := public.ativos_validar(p_organization_id, p_id, v_atual.grupo, p_nome, p_tipo, p_cat_equipamento_id,
                             p_data_compra, p_valor_compra, p_valor_residual, p_vida_meses, p_manutencao_ano,
                             p_codigo, p_num_serie, p_centro_custo_id, p_localizacao, p_notas,
                             CASE WHEN v_novos THEN p_vida_origem ELSE v_atual.vida_origem END,
                             CASE WHEN v_novos THEN p_warehouse_id ELSE v_atual.warehouse_id END,
                             v_atual.forma_aquisicao,
                             CASE WHEN v_novos THEN p_renda_mensal ELSE v_atual.renda_mensal END,
                             CASE WHEN v_novos THEN p_inicio_aluguer ELSE v_atual.inicio_aluguer END,
                             CASE WHEN v_novos THEN p_fim_aluguer ELSE v_atual.fim_aluguer END);
  -- O código não se apaga (NOT NULL): vazio no pedido mantém o de hoje.
  v.codigo := coalesce(v.codigo, v_atual.codigo);

  -- [M5] As ocupações (lidas sem trinco: todas as escritas nelas passam pelo trinco do ativo).
  SELECT min(pe.entrega), max(pe.entrega) INTO v_min, v_max
    FROM public.pessoas_equipamentos pe
   WHERE pe.ativo_id = p_id AND pe.organization_id = p_organization_id;
  IF v_min IS NOT NULL AND coalesce(v.data_compra, v.inicio_aluguer) > v_min THEN
    RAISE EXCEPTION 'ATV28' USING ERRCODE = 'P0001', DETAIL = 'A data de compra ou de início do aluguer não pode ser depois da primeira entrega a uma pessoa.';
  END IF;
  IF v.forma_aquisicao = 'alugado' AND v.fim_aluguer IS NOT NULL AND v_max IS NOT NULL AND v.fim_aluguer < v_max THEN
    RAISE EXCEPTION 'ATV21' USING ERRCODE = 'P0001', DETAIL = 'O fim do aluguer não pode ser antes da última entrega a uma pessoa.';
  END IF;

  v_campos := array_remove(ARRAY[
    CASE WHEN v.nome               IS DISTINCT FROM v_atual.nome               THEN 'nome' END,
    CASE WHEN v.tipo               IS DISTINCT FROM v_atual.tipo               THEN 'tipo' END,
    CASE WHEN v.codigo             IS DISTINCT FROM v_atual.codigo             THEN 'codigo' END,
    CASE WHEN v.num_serie          IS DISTINCT FROM v_atual.num_serie          THEN 'num_serie' END,
    CASE WHEN v.cat_equipamento_id IS DISTINCT FROM v_atual.cat_equipamento_id THEN 'cat_equipamento_id' END,
    CASE WHEN v.data_compra        IS DISTINCT FROM v_atual.data_compra        THEN 'data_compra' END,
    CASE WHEN v.valor_compra       IS DISTINCT FROM v_atual.valor_compra       THEN 'valor_compra' END,
    CASE WHEN v.valor_residual     IS DISTINCT FROM v_atual.valor_residual     THEN 'valor_residual' END,
    CASE WHEN v.vida_meses         IS DISTINCT FROM v_atual.vida_meses         THEN 'vida_meses' END,
    CASE WHEN v.manutencao_ano     IS DISTINCT FROM v_atual.manutencao_ano     THEN 'manutencao_ano' END,
    CASE WHEN v.centro_custo_id    IS DISTINCT FROM v_atual.centro_custo_id    THEN 'centro_custo_id' END,
    CASE WHEN v.localizacao        IS DISTINCT FROM v_atual.localizacao        THEN 'localizacao' END,
    CASE WHEN v.notas              IS DISTINCT FROM v_atual.notas              THEN 'notas' END,
    CASE WHEN v.vida_origem        IS DISTINCT FROM v_atual.vida_origem        THEN 'vida_origem' END,
    CASE WHEN v.warehouse_id       IS DISTINCT FROM v_atual.warehouse_id       THEN 'warehouse_id' END,
    CASE WHEN v.renda_mensal       IS DISTINCT FROM v_atual.renda_mensal       THEN 'renda_mensal' END,
    CASE WHEN v.inicio_aluguer     IS DISTINCT FROM v_atual.inicio_aluguer     THEN 'inicio_aluguer' END,
    CASE WHEN v.fim_aluguer        IS DISTINCT FROM v_atual.fim_aluguer        THEN 'fim_aluguer' END
  ]::text[], NULL);

  IF cardinality(v_campos) = 0 THEN
    RETURN jsonb_build_object('id', p_id, 'alterado', false, 'campos', '[]'::jsonb);
  END IF;

  BEGIN
    UPDATE public.ativo a
       SET nome = v.nome, tipo = v.tipo, codigo = v.codigo, num_serie = v.num_serie,
           cat_equipamento_id = v.cat_equipamento_id, data_compra = v.data_compra, valor_compra = v.valor_compra,
           valor_residual = v.valor_residual, vida_meses = v.vida_meses, manutencao_ano = v.manutencao_ano,
           centro_custo_id = v.centro_custo_id, localizacao = v.localizacao, notas = v.notas,
           vida_origem = v.vida_origem, warehouse_id = v.warehouse_id, renda_mensal = v.renda_mensal,
           inicio_aluguer = v.inicio_aluguer, fim_aluguer = v.fim_aluguer, updated_by = v_actor
     WHERE a.id = p_id AND a.organization_id = p_organization_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    IF v_con = 'ativo_warehouse_ativo_key' THEN
      RAISE EXCEPTION 'ATV22' USING ERRCODE = 'P0001', DETAIL = 'Este armazém já está ligado a outro ativo.';
    END IF;
    RAISE EXCEPTION 'ATV12' USING ERRCODE = 'P0001', DETAIL = 'Já existe um ativo com este código.';
  END;
  PERFORM public.ativos_evento(p_organization_id, p_id, 'alterado', v_actor, NULL, v_campos);
  RETURN jsonb_build_object('id', p_id, 'alterado', true, 'campos', to_jsonb(v_campos));
END;
$$;

-- 7.11 Desativar (ativos.edit), mesma assinatura.
--      [M1] compara com coalesce(data_compra, inicio_aluguer) ANTES da CHECK (nunca 23514 em bruto).
--      Nova: a data não pode ser antes da devolução mais recente (ATV29).
--      [M5] Regra explícita: a data PODE ser depois de fim_aluguer (a renda pára no mais cedo).
CREATE OR REPLACE FUNCTION public.rpc_ativo_desativar(p_id uuid, p_organization_id uuid, p_data date, p_motivo text, p_nota text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor  uuid;
  v_atual  public.ativo;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_nota   text := nullif(btrim(p_nota), '');
  v_ultima date;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_atual.estado <> 'ativo' THEN
    RAISE EXCEPTION 'ATV15' USING ERRCODE = 'P0001', DETAIL = 'Este ativo já está desativado.';
  END IF;
  IF p_data IS NULL OR NOT isfinite(p_data) OR p_data < coalesce(v_atual.data_compra, v_atual.inicio_aluguer)
     OR p_data > public.ativos_hoje() + 7
     OR v_motivo IS NULL OR v_motivo NOT IN ('abatido', 'vendido', 'perdido', 'outro')
     OR (v_nota IS NOT NULL AND length(v_nota) > 500) THEN
    RAISE EXCEPTION 'ATV16' USING ERRCODE = 'P0001',
      DETAIL = 'Indique a data e o motivo da desativação. A data não pode ser anterior à compra ou ao início do aluguer e a nota tem no máximo 500 caracteres.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_equipamentos pe
              WHERE pe.ativo_id = p_id AND pe.organization_id = p_organization_id AND pe.estado = 'atribuido') THEN
    RAISE EXCEPTION 'ATV17' USING ERRCODE = 'P0001', DETAIL = 'Este ativo está atribuído a uma pessoa. Devolva-o primeiro no RH.';
  END IF;
  SELECT max(pe.devolucao) INTO v_ultima
    FROM public.pessoas_equipamentos pe
   WHERE pe.ativo_id = p_id AND pe.organization_id = p_organization_id;
  IF v_ultima IS NOT NULL AND p_data < v_ultima THEN
    RAISE EXCEPTION 'ATV29' USING ERRCODE = 'P0001', DETAIL = 'A data de desativação não pode ser antes da última devolução deste ativo.';
  END IF;

  UPDATE public.ativo a
     SET estado = 'desativado', desativado_em = p_data, desativado_motivo = v_motivo, desativado_nota = v_nota,
         updated_by = v_actor
   WHERE a.id = p_id AND a.organization_id = p_organization_id;
  PERFORM public.ativos_evento(p_organization_id, p_id, 'desativado', v_actor, NULL,
    CASE WHEN v_nota IS NULL THEN ARRAY['estado', 'desativado_em', 'desativado_motivo']
         ELSE ARRAY['estado', 'desativado_em', 'desativado_motivo', 'desativado_nota'] END);
  RETURN jsonb_build_object('id', p_id, 'estado', 'desativado');
END;
$$;

-- 7.12 Reativar (ativos.edit), mesma assinatura.
--      [M2] Recusa (ATV30) quando o armazém já tem outro ativo vivo (o índice único daria
--      23505 em bruto). AVISO: reativar apaga desativado_em e volta a pôr a renda ou a quota
--      nos meses desde a desativação, também nos meses passados; a resposta leva `aviso`.
CREATE OR REPLACE FUNCTION public.rpc_ativo_reativar(p_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_atual public.ativo;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_atual.estado = 'ativo' THEN
    RETURN jsonb_build_object('id', p_id, 'estado', 'ativo', 'alterado', false);
  END IF;
  IF v_atual.warehouse_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.ativo o
        WHERE o.warehouse_id = v_atual.warehouse_id AND o.estado = 'ativo' AND o.id <> p_id) THEN
    RAISE EXCEPTION 'ATV30' USING ERRCODE = 'P0001', DETAIL = 'Este armazém já tem outro ativo ativo. Desative esse primeiro ou desligue o armazém.';
  END IF;
  BEGIN
    UPDATE public.ativo a
       SET estado = 'ativo', desativado_em = NULL, desativado_motivo = NULL, desativado_nota = NULL, updated_by = v_actor
     WHERE a.id = p_id AND a.organization_id = p_organization_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ATV30' USING ERRCODE = 'P0001', DETAIL = 'Este armazém já tem outro ativo ativo. Desative esse primeiro ou desligue o armazém.';
  END;
  PERFORM public.ativos_evento(p_organization_id, p_id, 'reativado', v_actor, NULL,
                               ARRAY['estado', 'desativado_em', 'desativado_motivo', 'desativado_nota']);
  RETURN jsonb_build_object('id', p_id, 'estado', 'ativo', 'alterado', true,
    'aviso', 'Reativar apagou a data de desativação: a renda ou a quota voltam a contar nos meses desde então, também nos meses passados.');
END;
$$;

-- 7.13 Lista por grupos (ativos.view), mesma assinatura. Desvio a): ocupações aqui, sem
--      pessoa sem a permissão do RH; armazém (id e nome) só com inventory.view.
--      «Atribuídos no RH sem ativo» deixa de existir (a fonte única só deixa a farda sem ativo).
CREATE OR REPLACE FUNCTION public.rpc_ativos_listar(p_organization_id uuid, p_incluir_desativados boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_limite constant integer := 2000;
  v_rh       boolean;
  v_inv      boolean;
  v_trunc    boolean;
  v_todos    boolean := coalesce(p_incluir_desativados, false);
  v_servico  jsonb;
  v_estrut   jsonb;
  v_pessoa   jsonb;
  v_cc       jsonb;
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.view');
  v_rh  := coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_organization_id), false);
  v_inv := coalesce(public.has_anew_permission_in_org(auth.uid(), 'inventory.view', p_organization_id), false);

  SELECT count(*) > c_limite INTO v_trunc
    FROM (SELECT 1 FROM public.ativo a
           WHERE a.organization_id = p_organization_id AND (v_todos OR a.estado = 'ativo')
           LIMIT c_limite + 1) x;

  WITH sel AS (
    SELECT a AS r
      FROM public.ativo a
     WHERE a.organization_id = p_organization_id AND (v_todos OR a.estado = 'ativo')
     ORDER BY lower(a.nome), a.id
     LIMIT c_limite
  ), oc AS (
    SELECT x.ativo_id,
           jsonb_agg(jsonb_build_object(
             'pessoa_equipamento_id', x.id,
             'pessoa_id', CASE WHEN v_rh THEN x.pessoa_id END,
             'entrega', x.entrega, 'devolucao', x.devolucao,
             'conta_desde', CASE WHEN EXISTS (SELECT 1 FROM public.pessoas_equipamentos y
                                               WHERE y.ativo_id = x.ativo_id AND y.id <> x.id AND y.devolucao = x.entrega)
                                 THEN x.entrega + 1 ELSE x.entrega END)
             ORDER BY x.entrega, x.id) AS ocupacoes
      FROM public.pessoas_equipamentos x
     WHERE x.organization_id = p_organization_id
       AND x.ativo_id IN (SELECT (s.r).id FROM sel s WHERE (s.r).grupo = 'pessoa')
     GROUP BY x.ativo_id
  ), j AS (
    SELECT (s.r).grupo AS grupo, lower((s.r).nome) AS ordem, (s.r).id AS id,
           public.ativos_json(s.r)
           || jsonb_build_object(
                'ligado', pe.id IS NOT NULL,
                'cat_equipamento', CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'id', e.id, 'nome', e.nome, 'vida_anos', e.vida_anos, 'vida_horas', e.vida_horas,
                    'uso_ano_horas', e.uso_ano_horas, 'apagado', e.apagado_em IS NOT NULL) END,
                'atribuicao', CASE WHEN v_rh AND pe.id IS NOT NULL AND p.id IS NOT NULL THEN jsonb_build_object(
                    'pessoa_equipamento_id', pe.id,
                    'pessoa_nome', coalesce(nullif(btrim(p.nome_completo), ''), nullif(btrim(concat_ws(' ', p.primeiro_nome, p.apelido)), '')),
                    'entrega', pe.entrega) END,
                'ocupacoes', CASE WHEN (s.r).grupo = 'pessoa' THEN coalesce(oc.ocupacoes, '[]'::jsonb) END,
                'warehouse_id', CASE WHEN v_inv THEN w.id END,
                'warehouse_nome', CASE WHEN v_inv THEN w.name END,
                'warehouse_apagado', CASE WHEN v_inv AND w.id IS NOT NULL THEN w.deleted_at IS NOT NULL END) AS o
      FROM sel s
      LEFT JOIN public.cat_equipamentos e
        ON e.id = (s.r).cat_equipamento_id AND e.organization_id = (s.r).organization_id
      LEFT JOIN LATERAL (
        SELECT x.id, x.entrega, x.pessoa_id FROM public.pessoas_equipamentos x
         WHERE x.ativo_id = (s.r).id AND x.organization_id = (s.r).organization_id AND x.estado = 'atribuido'
         LIMIT 1) pe ON true
      LEFT JOIN public.pessoas p
        ON p.id = pe.pessoa_id AND p.organization_id = (s.r).organization_id AND p.deleted_at IS NULL
      LEFT JOIN oc ON oc.ativo_id = (s.r).id
      LEFT JOIN public.warehouses w
        ON w.id = (s.r).warehouse_id AND w.organization_id = (s.r).organization_id
  )
  SELECT coalesce(jsonb_agg(j.o ORDER BY j.ordem, j.id) FILTER (WHERE j.grupo = 'servico'), '[]'::jsonb),
         coalesce(jsonb_agg(j.o ORDER BY j.ordem, j.id) FILTER (WHERE j.grupo = 'estrutura'), '[]'::jsonb),
         coalesce(jsonb_agg(j.o ORDER BY j.ordem, j.id) FILTER (WHERE j.grupo = 'pessoa'), '[]'::jsonb)
    INTO v_servico, v_estrut, v_pessoa
    FROM j;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome, 'ativo', c.ativo)
           ORDER BY lower(c.nome), c.id), '[]'::jsonb)
    INTO v_cc
    FROM public.ops_centro_custo c
   WHERE c.organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'servico', v_servico,
    'estrutura', v_estrut,
    'pessoa', jsonb_build_object(
      'ativos', v_pessoa,
      'atribuicoes_sem_ativo', CASE WHEN v_rh THEN '[]'::jsonb END,
      'rh_oculto', NOT v_rh),
    'centros_custo', v_cc,
    'pode_ver_armazens', v_inv,
    'truncado', v_trunc);
END;
$$;

-- 7.14 Um ativo, as ocupações e os últimos 50 eventos (ativos.view), mesma assinatura.
CREATE OR REPLACE FUNCTION public.rpc_ativo_ler(p_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a       public.ativo;
  v_rh      boolean;
  v_edit    boolean;
  v_inv     boolean;
  v_cat     jsonb;
  v_atr     jsonb;
  v_ligado  boolean;
  v_oc      jsonb;
  v_arm     jsonb;
  v_eventos jsonb;
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.view');
  SELECT * INTO v_a FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  v_rh   := coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_organization_id), false);
  v_edit := coalesce(public.has_anew_permission_in_org(auth.uid(), 'ativos.edit', p_organization_id), false);
  v_inv  := coalesce(public.has_anew_permission_in_org(auth.uid(), 'inventory.view', p_organization_id), false);

  SELECT jsonb_build_object('id', e.id, 'nome', e.nome, 'vida_anos', e.vida_anos, 'vida_horas', e.vida_horas,
                            'uso_ano_horas', e.uso_ano_horas, 'apagado', e.apagado_em IS NOT NULL)
    INTO v_cat
    FROM public.cat_equipamentos e
   WHERE e.id = v_a.cat_equipamento_id AND e.organization_id = v_a.organization_id;

  SELECT true,
         CASE WHEN v_rh AND p.id IS NOT NULL THEN jsonb_build_object(
           'pessoa_equipamento_id', pe.id,
           'pessoa_nome', coalesce(nullif(btrim(p.nome_completo), ''), nullif(btrim(concat_ws(' ', p.primeiro_nome, p.apelido)), '')),
           'entrega', pe.entrega) END
    INTO v_ligado, v_atr
    FROM public.pessoas_equipamentos pe
    LEFT JOIN public.pessoas p ON p.id = pe.pessoa_id AND p.organization_id = pe.organization_id AND p.deleted_at IS NULL
   WHERE pe.ativo_id = v_a.id AND pe.organization_id = v_a.organization_id AND pe.estado = 'atribuido'
   LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'pessoa_equipamento_id', x.id,
           'pessoa_id', CASE WHEN v_rh THEN x.pessoa_id END,
           'pessoa_nome', CASE WHEN v_rh THEN coalesce(nullif(btrim(p.nome_completo), ''), nullif(btrim(concat_ws(' ', p.primeiro_nome, p.apelido)), '')) END,
           'entrega', x.entrega, 'devolucao', x.devolucao, 'estado', x.estado,
           'conta_desde', CASE WHEN EXISTS (SELECT 1 FROM public.pessoas_equipamentos y
                                             WHERE y.ativo_id = x.ativo_id AND y.id <> x.id AND y.devolucao = x.entrega)
                               THEN x.entrega + 1 ELSE x.entrega END)
           ORDER BY x.entrega, x.id), '[]'::jsonb)
    INTO v_oc
    FROM public.pessoas_equipamentos x
    LEFT JOIN public.pessoas p ON p.id = x.pessoa_id AND p.organization_id = x.organization_id
   WHERE x.ativo_id = v_a.id AND x.organization_id = v_a.organization_id;

  IF v_inv AND v_a.warehouse_id IS NOT NULL THEN
    SELECT jsonb_build_object('warehouse_id', w.id, 'warehouse_nome', w.name, 'warehouse_apagado', w.deleted_at IS NOT NULL)
      INTO v_arm
      FROM public.warehouses w
     WHERE w.id = v_a.warehouse_id AND w.organization_id = v_a.organization_id;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'tipo', z.tipo, 'em', z.em, 'campos', to_jsonb(z.campos),
           'actor_nome', CASE WHEN v_edit THEN z.actor_nome END) ORDER BY z.em DESC, z.id DESC), '[]'::jsonb)
    INTO v_eventos
    FROM (SELECT ev.id, ev.tipo, ev.em, ev.campos, u.name AS actor_nome
            FROM public.ativo_eventos ev
            LEFT JOIN public.anew_users u ON u.id = ev.actor
           WHERE ev.ativo_id = v_a.id AND ev.organization_id = v_a.organization_id
           ORDER BY ev.em DESC, ev.id DESC
           LIMIT 50) z;

  RETURN public.ativos_json(v_a) || jsonb_build_object(
    'cat_equipamento', v_cat,
    'ligado', coalesce(v_ligado, false),
    'atribuicao', v_atr,
    'rh_oculto', NOT v_rh,
    'ocupacoes', v_oc,
    'pode_ver_armazens', v_inv,
    'warehouse_id', v_arm -> 'warehouse_id',
    'warehouse_nome', v_arm -> 'warehouse_nome',
    'warehouse_apagado', v_arm -> 'warehouse_apagado',
    'eventos', v_eventos);
END;
$$;

-- 7.15 Opções dos seletores (ativos.edit), mesma assinatura: + armazéns só com inventory.view.
CREATE OR REPLACE FUNCTION public.rpc_ativos_opcoes(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eq  jsonb;
  v_cc  jsonb;
  v_arm jsonb := '[]'::jsonb;
  v_inv boolean;
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.edit');
  v_inv := coalesce(public.has_anew_permission_in_org(auth.uid(), 'inventory.view', p_organization_id), false);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', y.id, 'nome', y.nome, 'vida_anos', y.vida_anos, 'vida_horas', y.vida_horas,
           'uso_ano_horas', y.uso_ano_horas, 'ativo', y.ativo) ORDER BY lower(y.nome), y.id), '[]'::jsonb)
    INTO v_eq
    FROM (SELECT e.id, e.nome, e.vida_anos, e.vida_horas, e.uso_ano_horas, e.ativo
            FROM public.cat_equipamentos e
           WHERE e.organization_id = p_organization_id AND e.apagado_em IS NULL
           ORDER BY lower(e.nome), e.id
           LIMIT 2000) y;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome)
           ORDER BY lower(c.nome), c.id), '[]'::jsonb)
    INTO v_cc
    FROM public.ops_centro_custo c
   WHERE c.organization_id = p_organization_id AND c.ativo;
  IF v_inv THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'codigo', w.code, 'nome', w.name)
             ORDER BY lower(w.name), w.id), '[]'::jsonb)
      INTO v_arm
      FROM public.warehouses w
     WHERE w.organization_id = p_organization_id AND w.deleted_at IS NULL AND NOT coalesce(w.is_vehicle, false);
  END IF;
  RETURN jsonb_build_object('equipamentos', v_eq, 'centros_custo', v_cc, 'armazens', v_arm, 'pode_ver_armazens', v_inv);
END;
$$;

-- 7.16 Ligar e desligar: mesma assinatura, recusam sempre (o equipamento do RH cria o ativo
--      sozinho). O DROP fica para a A1.3, depois de o ecrã novo estar publicado.
CREATE OR REPLACE FUNCTION public.rpc_ativo_ligar_pessoa(p_ativo_id uuid, p_pessoa_equipamento_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.edit');
  RAISE EXCEPTION 'ATV25' USING ERRCODE = 'P0001', DETAIL = 'Já não é preciso ligar: o equipamento atribuído no RH cria o ativo sozinho.';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_ativo_desligar_pessoa(p_pessoa_equipamento_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.edit');
  RAISE EXCEPTION 'ATV25' USING ERRCODE = 'P0001', DETAIL = 'Já não é preciso desligar: devolva o equipamento no RH.';
END;
$$;

-- 7.17 Atribuir no RH. Os 11 parâmetros de hoje iguais (até p_id); os novos no FIM com
--      DEFAULT NULL; DROP e CREATE na mesma transação. Permissões do RH como hoje.
--      Três caminhos: (1) p_ativo_id: entrega um ativo livre; (2) farda: como hoje, sem
--      ativo; (3) o resto cria o ativo (comprado ou alugado) e liga-lhe a linha.
--      Trincos: 0 hr_custo (exigir_escrita) -> 1 ativo -> 2 pessoa -> 3 contador -> 4 linha.
DROP FUNCTION public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid);
CREATE FUNCTION public.rpc_hr_equipamento_atribuir(
  p_pessoa_id uuid, p_organization_id uuid, p_tipo text, p_descricao text, p_valor numeric, p_entrega date,
  p_conta_modo text DEFAULT 'repartido'::text, p_conta_meses integer DEFAULT NULL::integer,
  p_conta_inicio date DEFAULT NULL::date, p_conta_fim date DEFAULT NULL::date, p_id uuid DEFAULT gen_random_uuid(),
  p_ativo_id uuid DEFAULT NULL, p_data_compra date DEFAULT NULL, p_vida_origem text DEFAULT NULL,
  p_vida_meses integer DEFAULT NULL, p_cat_equipamento_id uuid DEFAULT NULL, p_forma_aquisicao text DEFAULT NULL,
  p_renda_mensal numeric DEFAULT NULL, p_inicio_aluguer date DEFAULT NULL, p_fim_aluguer date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_por_pessoa constant integer := 200;
  v_anew  uuid;
  v_desc  text := btrim(p_descricao);
  v_valor numeric;
  v_c     record;
  v_id    uuid := coalesce(p_id, gen_random_uuid());
  v_exist record;
  v_n     integer;
  v_a     public.ativo;
  v_con   text;
  v_novos boolean := (p_data_compra IS NOT NULL OR p_vida_origem IS NOT NULL OR p_vida_meses IS NOT NULL
                      OR p_cat_equipamento_id IS NOT NULL OR p_forma_aquisicao IS NOT NULL OR p_renda_mensal IS NOT NULL
                      OR p_inicio_aluguer IS NOT NULL OR p_fim_aluguer IS NOT NULL);
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);   -- trinco 0

  IF NOT public.hr_custo_data_valida(p_entrega) THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA67';
  END IF;

  -- (1) Entregar um ativo que já existe e está livre.
  IF p_ativo_id IS NOT NULL THEN
    IF p_tipo IS NOT NULL OR p_descricao IS NOT NULL OR p_valor IS NOT NULL OR p_conta_meses IS NOT NULL
       OR p_conta_inicio IS NOT NULL OR p_conta_fim IS NOT NULL OR v_novos THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
    END IF;
    PERFORM 1 FROM public.pessoas p
     WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
    END IF;
    SELECT * INTO v_a FROM public.ativo a
     WHERE a.id = p_ativo_id AND a.organization_id = p_organization_id FOR UPDATE;   -- trinco 1
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('hr_equipamentos:' || p_pessoa_id::text, 0));   -- trinco 2
    SELECT e.id, e.pessoa_id, e.organization_id, e.ativo_id INTO v_exist
      FROM public.pessoas_equipamentos e
     WHERE e.id = v_id;
    IF FOUND THEN
      IF v_exist.organization_id = p_organization_id AND v_exist.pessoa_id = p_pessoa_id
         AND v_exist.ativo_id IS NOT DISTINCT FROM p_ativo_id THEN
        RETURN jsonb_build_object('id', v_exist.id, 'existente', true, 'ativo_id', v_a.id, 'codigo', v_a.codigo);
      END IF;
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
    END IF;
    SELECT count(*) INTO v_n
      FROM public.pessoas_equipamentos e
     WHERE e.organization_id = p_organization_id AND e.pessoa_id = p_pessoa_id;
    IF v_n >= c_max_por_pessoa THEN
      RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
    END IF;
    PERFORM public.ativos_verificar_entrega(v_a, NULL, p_entrega);
    BEGIN
      INSERT INTO public.pessoas_equipamentos
        (id, organization_id, pessoa_id, entrega, ativo_id, created_by, updated_by)
      VALUES
        (v_id, p_organization_id, p_pessoa_id, p_entrega, v_a.id, v_anew, v_anew);   -- trinco 4
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con = 'pessoas_equipamentos_ativo_atribuido_key' THEN
        RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'Este ativo já está entregue a outra pessoa.';
      END IF;
      -- Só por corrida com outra pessoa a usar o mesmo id (a fila é por pessoa).
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
    END;
    PERFORM public.hr_custo_evento(p_organization_id, p_pessoa_id, 'equipamento', v_id, 'equipamento_atribuido', v_anew,
      jsonb_build_object('tipo', v_a.tipo, 'ativo_id', v_a.id, 'codigo', v_a.codigo, 'forma_aquisicao', v_a.forma_aquisicao));
    PERFORM public.ativos_evento(p_organization_id, v_a.id, 'ligado', v_anew, v_id, '{}'::text[]);
    RETURN jsonb_build_object('id', v_id, 'existente', false, 'ativo_id', v_a.id, 'codigo', v_a.codigo);
  END IF;

  -- Validações de hoje, pela mesma ordem (validarEquipamento, equipamentos.ts).
  IF p_tipo IS NULL OR p_tipo NOT IN ('telemovel', 'portatil', 'viatura', 'fardamento', 'ferramentas', 'outro') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF v_desc IS NULL OR length(v_desc) < 1 OR length(v_desc) > 200 OR v_desc ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'descricao_invalida' USING ERRCODE = 'HRA65';
  END IF;
  v_valor := round(coalesce(p_valor, CASE WHEN p_forma_aquisicao = 'alugado' THEN p_renda_mensal END), 2);
  IF v_valor IS NULL OR v_valor <= 0 OR v_valor >= 10000000000 THEN
    RAISE EXCEPTION 'valor_invalido' USING ERRCODE = 'HRA66';
  END IF;
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar(p_conta_modo, p_conta_meses, p_conta_inicio, p_conta_fim);
  IF p_tipo = 'fardamento' AND v_novos THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Em fila por pessoa: o teto e a idempotência não passam a dois pedidos simultâneos.
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_equipamentos:' || p_pessoa_id::text, 0));   -- trinco 2

  -- Reenvio com um id que já existe: ANTES de criar o ativo (um reenvio não cria um segundo).
  SELECT e.id, e.pessoa_id, e.organization_id, e.ativo_id INTO v_exist
    FROM public.pessoas_equipamentos e
   WHERE e.id = v_id;
  IF FOUND THEN
    IF v_exist.organization_id = p_organization_id AND v_exist.pessoa_id = p_pessoa_id THEN
      RETURN jsonb_build_object('id', v_exist.id, 'existente', true, 'ativo_id', v_exist.ativo_id);
    END IF;
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_equipamentos e
   WHERE e.organization_id = p_organization_id AND e.pessoa_id = p_pessoa_id;
  IF v_n >= c_max_por_pessoa THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- (2) Farda: só no RH, como hoje (decisão adiada).
  IF p_tipo = 'fardamento' THEN
    INSERT INTO public.pessoas_equipamentos
      (id, organization_id, pessoa_id, tipo, descricao, valor, entrega,
       conta_modo, conta_meses, conta_inicio, conta_fim, created_by, updated_by)
    VALUES
      (v_id, p_organization_id, p_pessoa_id, p_tipo, v_desc, v_valor, p_entrega,
       v_c.modo, v_c.meses, v_c.inicio, v_c.fim, v_anew, v_anew)
    ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
    END IF;
    PERFORM public.hr_custo_evento(p_organization_id, p_pessoa_id, 'equipamento', v_id, 'equipamento_atribuido', v_anew,
      jsonb_build_object('tipo', p_tipo, 'valor', v_valor, 'conta_modo', v_c.modo, 'conta_meses', v_c.meses));
    RETURN jsonb_build_object('id', v_id, 'existente', false, 'ativo_id', NULL);
  END IF;

  -- (3) Cria o ativo (trinco 3 dentro, ao gerar o código) e liga-lhe a linha. [M4] [M8]
  v_a := public.ativos_de_linha_rh(p_organization_id, v_anew, p_tipo, v_desc, v_valor, p_entrega,
                                   v_c.modo, v_c.meses, v_c.inicio, v_c.fim,
                                   p_data_compra, p_vida_origem, p_vida_meses, p_cat_equipamento_id,
                                   p_forma_aquisicao, p_renda_mensal, p_inicio_aluguer, p_fim_aluguer);
  PERFORM public.ativos_verificar_entrega(v_a, NULL, p_entrega);
  INSERT INTO public.pessoas_equipamentos
    (id, organization_id, pessoa_id, entrega, ativo_id, created_by, updated_by)
  VALUES
    (v_id, p_organization_id, p_pessoa_id, p_entrega, v_a.id, v_anew, v_anew)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  PERFORM public.hr_custo_evento(p_organization_id, p_pessoa_id, 'equipamento', v_id, 'equipamento_atribuido', v_anew,
    jsonb_build_object('tipo', v_a.tipo, 'ativo_id', v_a.id, 'codigo', v_a.codigo, 'forma_aquisicao', v_a.forma_aquisicao));
  PERFORM public.ativos_evento(p_organization_id, v_a.id, 'ligado', v_anew, v_id, '{}'::text[]);
  RETURN jsonb_build_object('id', v_id, 'existente', false, 'ativo_id', v_a.id, 'codigo', v_a.codigo);
END;
$$;

-- 7.18 Devolver no RH, mesma assinatura. Lê o ativo_id SEM trancar -> tranca o ativo (1) ->
--      tranca a linha (4) -> confere que o ativo_id não mudou. Escreve também `desligado`.
CREATE OR REPLACE FUNCTION public.rpc_hr_equipamento_devolver(p_id uuid, p_organization_id uuid, p_data date, p_estado text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew  uuid;
  v_ativo uuid;
  v_e     record;
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);   -- trinco 0

  IF NOT public.hr_custo_data_valida(p_data) THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA67';
  END IF;

  SELECT e.ativo_id INTO v_ativo
    FROM public.pessoas_equipamentos e
   WHERE e.id = p_id AND e.organization_id = p_organization_id;
  IF v_ativo IS NOT NULL THEN
    PERFORM 1 FROM public.ativo a WHERE a.id = v_ativo AND a.organization_id = p_organization_id FOR UPDATE;   -- trinco 1
  END IF;

  SELECT e.id, e.pessoa_id, e.entrega, e.estado, e.ativo_id INTO v_e
    FROM public.pessoas_equipamentos e
    JOIN public.pessoas p ON p.id = e.pessoa_id AND p.organization_id = e.organization_id
   WHERE e.id = p_id AND e.organization_id = p_organization_id AND p.deleted_at IS NULL
   FOR UPDATE OF e;   -- trinco 4
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_e.ativo_id IS DISTINCT FROM v_ativo THEN
    RAISE EXCEPTION 'ATV26' USING ERRCODE = 'P0001', DETAIL = 'O equipamento mudou entretanto. Volte a abrir a lista.';
  END IF;
  -- Já devolvido (incluindo um segundo clique): não se devolve duas vezes.
  IF v_e.estado <> 'atribuido' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  IF p_data < v_e.entrega THEN
    RAISE EXCEPTION 'devolucao_antes_entrega' USING ERRCODE = 'HRA71';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('bom', 'desgaste', 'danificado') THEN
    RAISE EXCEPTION 'estado_devolucao_invalido' USING ERRCODE = 'HRA72';
  END IF;

  UPDATE public.pessoas_equipamentos
     SET estado = 'devolvido', devolucao = p_data, estado_devolucao = p_estado, updated_by = v_anew
   WHERE id = v_e.id;

  PERFORM public.hr_custo_evento(p_organization_id, v_e.pessoa_id, 'equipamento', v_e.id, 'equipamento_devolvido', v_anew,
                                 jsonb_build_object('devolucao', p_data, 'estado_devolucao', p_estado));
  IF v_e.ativo_id IS NOT NULL THEN
    PERFORM public.ativos_evento(p_organization_id, v_e.ativo_id, 'desligado', v_anew, v_e.id, '{}'::text[]);
  END IF;
  RETURN jsonb_build_object('id', v_e.id, 'estado', 'devolvido', 'devolucao', p_data, 'estado_devolucao', p_estado);
END;
$$;

-- 7.19 Alterar a conta no RH, mesma assinatura: só a farda. Numa linha com ativo recusa
--      ANTES de escrever (HRA91), em vez de bater na regra da fonte única.
CREATE OR REPLACE FUNCTION public.rpc_hr_equipamento_alterar_conta(p_id uuid, p_organization_id uuid, p_modo text, p_meses integer DEFAULT NULL::integer, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew uuid;
  v_c    record;
  v_e    record;
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar(p_modo, p_meses, p_inicio, p_fim);

  SELECT e.id, e.pessoa_id, e.ativo_id, e.conta_modo, e.conta_meses, e.conta_inicio, e.conta_fim INTO v_e
    FROM public.pessoas_equipamentos e
    JOIN public.pessoas p ON p.id = e.pessoa_id AND p.organization_id = e.organization_id
   WHERE e.id = p_id AND e.organization_id = p_organization_id AND p.deleted_at IS NULL
   FOR UPDATE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_e.ativo_id IS NOT NULL THEN
    RAISE EXCEPTION 'equipamento_e_ativo' USING ERRCODE = 'HRA91';
  END IF;

  UPDATE public.pessoas_equipamentos
     SET conta_modo = v_c.modo, conta_meses = v_c.meses, conta_inicio = v_c.inicio, conta_fim = v_c.fim,
         updated_by = v_anew
   WHERE id = v_e.id;

  PERFORM public.hr_custo_evento(p_organization_id, v_e.pessoa_id, 'equipamento', v_e.id, 'equipamento_conta_alterada', v_anew,
    jsonb_build_object(
      'antes',  jsonb_build_object('conta_modo', v_e.conta_modo, 'conta_meses', v_e.conta_meses,
                                   'conta_inicio', v_e.conta_inicio, 'conta_fim', v_e.conta_fim),
      'depois', jsonb_build_object('conta_modo', v_c.modo, 'conta_meses', v_c.meses,
                                   'conta_inicio', v_c.inicio, 'conta_fim', v_c.fim)));
  RETURN jsonb_build_object('id', v_e.id, 'conta_modo', v_c.modo, 'conta_meses', v_c.meses,
                            'conta_inicio', v_c.inicio, 'conta_fim', v_c.fim);
END;
$$;

-- 7.20 Lista do RH, mesma assinatura. As 15 chaves de hoje SEMPRE preenchidas, projetadas do
--      ativo sem as guardar (compatibilidade com o ecrã de hoje), mais ativo_id, ativo e
--      conta_desde. [M4] alugado: conta_inicio = o MAIOR entre o mês do início do aluguer e o
--      mês da entrega (o «todos os meses» de comoConta.ts começa em conta.inicio, comoConta.ts:71).
--      [M6] o rótulo do ecrã antigo fica coerente: comprado = «repartido por vida_meses»,
--      alugado = «todos os meses desde conta_inicio».
CREATE OR REPLACE FUNCTION public.rpc_hr_equipamentos_listar(p_organization_id uuid, p_pessoa_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 500, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_limite_max constant integer := 1000;
  v_limite integer := least(greatest(coalesce(p_limite, 500), 1), c_limite_max);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_r      jsonb;
BEGIN
  PERFORM public.hr_custo_exigir_leitura(p_organization_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'pessoa_id', q.pessoa_id,
           'tipo', CASE WHEN a.id IS NULL THEN q.tipo ELSE a.tipo END,
           'descricao', CASE WHEN a.id IS NULL THEN q.descricao ELSE a.nome END,
           'valor', CASE WHEN a.id IS NULL THEN q.valor
                         WHEN a.forma_aquisicao = 'alugado' THEN a.renda_mensal ELSE a.valor_compra END,
           'entrega', q.entrega,
           'conta_modo', CASE WHEN a.id IS NULL THEN q.conta_modo
                              WHEN a.forma_aquisicao = 'alugado' THEN 'todosMeses' ELSE 'repartido' END,
           'conta_meses', CASE WHEN a.id IS NULL THEN q.conta_meses
                               WHEN a.forma_aquisicao = 'alugado' THEN NULL ELSE a.vida_meses END,
           'conta_inicio', CASE WHEN a.id IS NULL THEN q.conta_inicio
                                WHEN a.forma_aquisicao = 'alugado'
                                  THEN greatest(date_trunc('month', a.inicio_aluguer::timestamp)::date,
                                                date_trunc('month', q.entrega::timestamp)::date) END,
           'conta_fim', CASE WHEN a.id IS NULL THEN q.conta_fim
                             WHEN a.forma_aquisicao = 'alugado' AND a.fim_aluguer IS NOT NULL
                               THEN date_trunc('month', a.fim_aluguer::timestamp)::date END,
           'estado', q.estado, 'devolucao', q.devolucao, 'estado_devolucao', q.estado_devolucao,
           'created_at', q.created_at, 'updated_at', q.updated_at,
           'ativo_id', q.ativo_id,
           'ativo', CASE WHEN a.id IS NULL THEN NULL
                         WHEN a.forma_aquisicao = 'alugado' THEN jsonb_build_object(
                           'codigo', a.codigo, 'nome', a.nome, 'tipo', a.tipo, 'forma_aquisicao', a.forma_aquisicao,
                           'renda_mensal', a.renda_mensal, 'inicio_aluguer', a.inicio_aluguer, 'fim_aluguer', a.fim_aluguer,
                           'estado', a.estado, 'desativado_em', a.desativado_em)
                         ELSE jsonb_build_object(
                           'codigo', a.codigo, 'nome', a.nome, 'tipo', a.tipo, 'forma_aquisicao', a.forma_aquisicao,
                           'valor_compra', a.valor_compra, 'valor_residual', a.valor_residual, 'data_compra', a.data_compra,
                           'vida_meses', a.vida_meses, 'vida_origem', a.vida_origem,
                           'estado', a.estado, 'desativado_em', a.desativado_em) END,
           'conta_desde', CASE WHEN q.ativo_id IS NOT NULL AND EXISTS (
                                  SELECT 1 FROM public.pessoas_equipamentos y
                                   WHERE y.ativo_id = q.ativo_id AND y.id <> q.id AND y.devolucao = q.entrega)
                               THEN q.entrega + 1 ELSE q.entrega END)
         ORDER BY q.entrega DESC, q.created_at DESC, q.id DESC), '[]'::jsonb)
    INTO v_r
    FROM (
      SELECT e.id, e.organization_id, e.pessoa_id, e.tipo, e.descricao, e.valor, e.entrega, e.conta_modo, e.conta_meses,
             e.conta_inicio, e.conta_fim, e.estado, e.devolucao, e.estado_devolucao, e.created_at, e.updated_at, e.ativo_id
        FROM public.pessoas_equipamentos e
        JOIN public.pessoas p ON p.id = e.pessoa_id AND p.organization_id = e.organization_id
       WHERE e.organization_id = p_organization_id
         AND (p_pessoa_id IS NULL OR e.pessoa_id = p_pessoa_id)
         AND p.deleted_at IS NULL
       ORDER BY e.entrega DESC, e.created_at DESC, e.id DESC
       LIMIT v_limite OFFSET v_offset
    ) q
    LEFT JOIN public.ativo a ON a.id = q.ativo_id AND a.organization_id = q.organization_id;
  RETURN v_r;
END;
$$;

-- 7.21 Equipamentos livres para entregar (permissões do RH: ver E editar a retribuição).
--      [LOW] Mostra valores de compra/renda a quem tem o RH sem ativos.view, de propósito:
--      é o mesmo valor que o custo da pessoa já lhe mostra. [M7] Sem fardamento.
CREATE FUNCTION public.rpc_hr_equipamentos_livres(p_organization_id uuid, p_tipo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoje date := public.ativos_hoje();
  v_tipo text := nullif(btrim(p_tipo), '');
  v_r    jsonb;
BEGIN
  PERFORM public.hr_custo_exigir_leitura(p_organization_id);
  IF NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.edit', p_organization_id), false) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', y.id, 'codigo', y.codigo, 'nome', y.nome, 'tipo', y.tipo, 'forma_aquisicao', y.forma_aquisicao,
           'valor_compra', y.valor_compra, 'valor_residual', y.valor_residual, 'data_compra', y.data_compra,
           'vida_meses', y.vida_meses, 'vida_origem', y.vida_origem, 'renda_mensal', y.renda_mensal,
           'inicio_aluguer', y.inicio_aluguer, 'fim_aluguer', y.fim_aluguer, 'cat_equipamento_id', y.cat_equipamento_id,
           'ultima_devolucao', y.ultima_devolucao) ORDER BY y.ordem, y.id), '[]'::jsonb)
    INTO v_r
    FROM (SELECT a.id, a.codigo, a.nome, a.tipo, a.forma_aquisicao, a.valor_compra, a.valor_residual, a.data_compra,
                 a.vida_meses, a.vida_origem, a.renda_mensal, a.inicio_aluguer, a.fim_aluguer, a.cat_equipamento_id,
                 lower(a.nome) AS ordem,
                 (SELECT max(x.devolucao) FROM public.pessoas_equipamentos x WHERE x.ativo_id = a.id) AS ultima_devolucao
            FROM public.ativo a
           WHERE a.organization_id = p_organization_id AND a.grupo = 'pessoa' AND a.estado = 'ativo'
             AND a.tipo <> 'fardamento'
             AND (v_tipo IS NULL OR a.tipo = v_tipo)
             AND (a.forma_aquisicao <> 'alugado' OR a.fim_aluguer IS NULL OR a.fim_aluguer >= v_hoje)
             AND NOT EXISTS (SELECT 1 FROM public.pessoas_equipamentos x
                              WHERE x.ativo_id = a.id AND x.estado = 'atribuido')
           ORDER BY lower(a.nome), a.id
           LIMIT 500) y;
  RETURN v_r;
END;
$$;

-- 7.22 Corrigir um equipamento que veio do RH (ATV-1): pede ativos.edit, NUNCA as permissões
--      do RH (não chama a escrita do RH, não escreve eventos do RH). A empresa é a do ativo.
--      Limite próprio (ATV33): 120 correções por hora por utilizador.
--      Trincos: o da correção por utilizador (só esta função o usa) -> 1 ativo -> 4 linha.
CREATE FUNCTION public.rpc_hr_equipamento_corrigir(
  p_ativo_id uuid, p_organization_id uuid, p_campos text[],
  p_nome text DEFAULT NULL, p_valor_compra numeric DEFAULT NULL, p_valor_residual numeric DEFAULT NULL,
  p_data_compra date DEFAULT NULL, p_vida_meses integer DEFAULT NULL, p_vida_origem text DEFAULT NULL,
  p_renda_mensal numeric DEFAULT NULL, p_inicio_aluguer date DEFAULT NULL, p_fim_aluguer date DEFAULT NULL,
  p_pessoa_equipamento_id uuid DEFAULT NULL, p_entrega date DEFAULT NULL, p_devolucao date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_limite   constant integer := 120;
  c_comprado constant text[] := ARRAY['nome', 'valor_compra', 'valor_residual', 'data_compra', 'vida_meses', 'vida_origem', 'entrega', 'devolucao'];
  c_alugado  constant text[] := ARRAY['nome', 'renda_mensal', 'inicio_aluguer', 'fim_aluguer', 'entrega', 'devolucao'];
  v_actor     uuid;
  v_n         integer;
  v_campos    text[];
  v_atual     public.ativo;
  v           public.ativo;
  v_pe        public.pessoas_equipamentos;
  v_entrega   date;
  v_devolucao date;
  v_min       date;
  v_max       date;
  v_mudou     text[] := '{}'::text[];
  v_oc        text[] := '{}'::text[];
  v_pessoas   integer;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  PERFORM pg_advisory_xact_lock(hashtextextended('ativos_corrigir:' || auth.uid()::text, 0));
  SELECT count(*) INTO v_n FROM public.ativo_eventos ev
   WHERE ev.actor_auth_uid = auth.uid() AND ev.em > now() - interval '1 hour';
  IF v_n >= c_limite THEN
    RAISE EXCEPTION 'ATV33' USING ERRCODE = 'P0001', DETAIL = 'Demasiadas correções na última hora. Tente mais tarde.';
  END IF;

  SELECT coalesce(array_agg(DISTINCT btrim(u.c)), '{}'::text[]) INTO v_campos
    FROM unnest(coalesce(p_campos, '{}'::text[])) AS u(c)
   WHERE nullif(btrim(u.c), '') IS NOT NULL;
  IF cardinality(v_campos) = 0 THEN
    RAISE EXCEPTION 'ATV27' USING ERRCODE = 'P0001', DETAIL = 'Diga o que quer corrigir.';
  END IF;

  SELECT * INTO v_atual FROM public.ativo a
   WHERE a.id = p_ativo_id AND a.organization_id = p_organization_id FOR UPDATE;   -- trinco 1
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_atual.grupo <> 'pessoa' THEN
    RAISE EXCEPTION 'ATV27' USING ERRCODE = 'P0001', DETAIL = 'Só os equipamentos do grupo Pessoas se corrigem aqui; os outros em Ativos.';
  END IF;
  IF v_atual.estado <> 'ativo' THEN
    RAISE EXCEPTION 'ATV15' USING ERRCODE = 'P0001', DETAIL = 'Este ativo está desativado. Reative-o antes de o corrigir.';
  END IF;
  IF NOT (v_campos <@ CASE WHEN v_atual.forma_aquisicao = 'alugado' THEN c_alugado ELSE c_comprado END) THEN
    RAISE EXCEPTION 'ATV27' USING ERRCODE = 'P0001', DETAIL = 'Pediu para corrigir um campo que não existe neste equipamento.';
  END IF;

  v := public.ativos_validar(p_organization_id, p_ativo_id, v_atual.grupo,
         CASE WHEN 'nome' = ANY (v_campos) THEN p_nome ELSE v_atual.nome END,
         v_atual.tipo, v_atual.cat_equipamento_id,
         CASE WHEN 'data_compra' = ANY (v_campos) THEN p_data_compra ELSE v_atual.data_compra END,
         CASE WHEN 'valor_compra' = ANY (v_campos) THEN p_valor_compra ELSE v_atual.valor_compra END,
         CASE WHEN 'valor_residual' = ANY (v_campos) THEN p_valor_residual ELSE v_atual.valor_residual END,
         CASE WHEN 'vida_meses' = ANY (v_campos) THEN p_vida_meses ELSE v_atual.vida_meses END,
         v_atual.manutencao_ano, v_atual.codigo, v_atual.num_serie, v_atual.centro_custo_id,
         v_atual.localizacao, v_atual.notas,
         CASE WHEN 'vida_origem' = ANY (v_campos) THEN p_vida_origem ELSE v_atual.vida_origem END,
         v_atual.warehouse_id, v_atual.forma_aquisicao,
         CASE WHEN 'renda_mensal' = ANY (v_campos) THEN p_renda_mensal ELSE v_atual.renda_mensal END,
         CASE WHEN 'inicio_aluguer' = ANY (v_campos) THEN p_inicio_aluguer ELSE v_atual.inicio_aluguer END,
         CASE WHEN 'fim_aluguer' = ANY (v_campos) THEN p_fim_aluguer ELSE v_atual.fim_aluguer END);

  IF 'entrega' = ANY (v_campos) OR 'devolucao' = ANY (v_campos) THEN
    IF p_pessoa_equipamento_id IS NULL THEN
      RAISE EXCEPTION 'ATV27' USING ERRCODE = 'P0001', DETAIL = 'Diga qual a entrega a corrigir.';
    END IF;
    SELECT * INTO v_pe FROM public.pessoas_equipamentos pe
     WHERE pe.id = p_pessoa_equipamento_id AND pe.ativo_id = p_ativo_id AND pe.organization_id = p_organization_id
     FOR UPDATE;   -- trinco 4
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ATV27' USING ERRCODE = 'P0001', DETAIL = 'Esta entrega não é deste equipamento.';
    END IF;
    v_entrega   := CASE WHEN 'entrega' = ANY (v_campos) THEN p_entrega ELSE v_pe.entrega END;
    v_devolucao := CASE WHEN 'devolucao' = ANY (v_campos) THEN p_devolucao ELSE v_pe.devolucao END;
    IF 'devolucao' = ANY (v_campos) AND (v_pe.estado <> 'devolvido' OR p_devolucao IS NULL) THEN
      RAISE EXCEPTION 'ATV31' USING ERRCODE = 'P0001', DETAIL = 'Só se corrige a data de devolução de um equipamento já devolvido.';
    END IF;
    IF NOT public.hr_custo_data_valida(v_entrega)
       OR (v_devolucao IS NOT NULL AND (NOT public.hr_custo_data_valida(v_devolucao) OR v_devolucao < v_entrega)) THEN
      RAISE EXCEPTION 'ATV31' USING ERRCODE = 'P0001', DETAIL = 'As datas da entrega são inválidas: a devolução não pode ser antes da entrega.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pessoas_equipamentos o
                WHERE o.ativo_id = p_ativo_id AND o.organization_id = p_organization_id AND o.id <> v_pe.id
                  AND o.entrega < coalesce(v_devolucao, 'infinity'::date)
                  AND coalesce(o.devolucao, 'infinity'::date) > v_entrega) THEN
      RAISE EXCEPTION 'ATV31' USING ERRCODE = 'P0001', DETAIL = 'Estas datas cruzam outra entrega do mesmo equipamento.';
    END IF;
  ELSIF p_pessoa_equipamento_id IS NOT NULL OR p_entrega IS NOT NULL OR p_devolucao IS NOT NULL THEN
    RAISE EXCEPTION 'ATV27' USING ERRCODE = 'P0001', DETAIL = 'Para corrigir datas da entrega, inclua entrega ou devolucao nos campos.';
  END IF;

  -- [M5] Compra/início <= primeira entrega; fim >= última entrega (com as datas novas).
  SELECT min(CASE WHEN o.id = v_pe.id THEN v_entrega ELSE o.entrega END),
         max(CASE WHEN o.id = v_pe.id THEN v_entrega ELSE o.entrega END)
    INTO v_min, v_max
    FROM public.pessoas_equipamentos o
   WHERE o.ativo_id = p_ativo_id AND o.organization_id = p_organization_id;
  IF v_min IS NOT NULL AND coalesce(v.data_compra, v.inicio_aluguer) > v_min THEN
    RAISE EXCEPTION 'ATV28' USING ERRCODE = 'P0001', DETAIL = 'A data de compra ou de início do aluguer não pode ser depois da primeira entrega a uma pessoa.';
  END IF;
  IF v.forma_aquisicao = 'alugado' AND v.fim_aluguer IS NOT NULL AND v_max IS NOT NULL AND v.fim_aluguer < v_max THEN
    RAISE EXCEPTION 'ATV21' USING ERRCODE = 'P0001', DETAIL = 'O fim do aluguer não pode ser antes da última entrega a uma pessoa.';
  END IF;

  v_mudou := array_remove(ARRAY[
    CASE WHEN v.nome           IS DISTINCT FROM v_atual.nome           THEN 'nome' END,
    CASE WHEN v.data_compra    IS DISTINCT FROM v_atual.data_compra    THEN 'data_compra' END,
    CASE WHEN v.valor_compra   IS DISTINCT FROM v_atual.valor_compra   THEN 'valor_compra' END,
    CASE WHEN v.valor_residual IS DISTINCT FROM v_atual.valor_residual THEN 'valor_residual' END,
    CASE WHEN v.vida_meses     IS DISTINCT FROM v_atual.vida_meses     THEN 'vida_meses' END,
    CASE WHEN v.vida_origem    IS DISTINCT FROM v_atual.vida_origem    THEN 'vida_origem' END,
    CASE WHEN v.renda_mensal   IS DISTINCT FROM v_atual.renda_mensal   THEN 'renda_mensal' END,
    CASE WHEN v.inicio_aluguer IS DISTINCT FROM v_atual.inicio_aluguer THEN 'inicio_aluguer' END,
    CASE WHEN v.fim_aluguer    IS DISTINCT FROM v_atual.fim_aluguer    THEN 'fim_aluguer' END
  ]::text[], NULL);
  IF cardinality(v_mudou) > 0 THEN
    UPDATE public.ativo a
       SET nome = v.nome, data_compra = v.data_compra, valor_compra = v.valor_compra,
           valor_residual = v.valor_residual, vida_meses = v.vida_meses, vida_origem = v.vida_origem,
           renda_mensal = v.renda_mensal, inicio_aluguer = v.inicio_aluguer, fim_aluguer = v.fim_aluguer,
           updated_by = v_actor
     WHERE a.id = p_ativo_id AND a.organization_id = p_organization_id;
    PERFORM public.ativos_evento(p_organization_id, p_ativo_id, 'alterado', v_actor, NULL, v_mudou);
  END IF;

  IF v_pe.id IS NOT NULL THEN
    v_oc := array_remove(ARRAY[
      CASE WHEN v_entrega   IS DISTINCT FROM v_pe.entrega   THEN 'entrega' END,
      CASE WHEN v_devolucao IS DISTINCT FROM v_pe.devolucao THEN 'devolucao' END
    ]::text[], NULL);
    IF cardinality(v_oc) > 0 THEN
      UPDATE public.pessoas_equipamentos pe
         SET entrega = v_entrega, devolucao = v_devolucao, updated_by = v_actor
       WHERE pe.id = v_pe.id;
      PERFORM public.ativos_evento(p_organization_id, p_ativo_id, 'ocupacao_corrigida', v_actor, v_pe.id, v_oc);
    END IF;
  END IF;

  SELECT count(DISTINCT pe.pessoa_id) INTO v_pessoas
    FROM public.pessoas_equipamentos pe
   WHERE pe.ativo_id = p_ativo_id AND pe.organization_id = p_organization_id;
  SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_ativo_id AND a.organization_id = p_organization_id;
  RETURN public.ativos_json(v_atual) || jsonb_build_object(
    'alterado', cardinality(v_mudou) + cardinality(v_oc) > 0,
    'campos', to_jsonb(v_mudou || v_oc),
    'pessoas_afetadas', v_pessoas);
END;
$$;

-- ==============================================================================
-- 8. [M3] Carga inicial: linhas do RH sem ativo e não farda (hoje 0) ANTES da regra da
--    fonte única. Cada uma cria o ativo (comprado ou alugado), liga-o e limpa a cópia.
--    O actor do evento é quem criou a linha (a claim fica LOCAL e é reposta).
-- ==============================================================================
DO $carga$
DECLARE
  r      record;
  v_a    public.ativo;
  v_prev text;
  v_n    integer := 0;
BEGIN
  v_prev := current_setting('request.jwt.claims', true);
  FOR r IN SELECT e.id, e.organization_id, e.tipo, e.descricao, e.valor, e.entrega, e.conta_modo, e.conta_meses,
                  e.conta_inicio, e.conta_fim, e.estado, e.created_by, au.auth_user_id
             FROM public.pessoas_equipamentos e
             JOIN public.anew_users au ON au.id = e.created_by
            WHERE e.ativo_id IS NULL AND e.tipo <> 'fardamento'
            ORDER BY e.created_at, e.id LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', r.auth_user_id::text)::text, true);
    -- [M8] data de compra = a entrega (pessoas_equipamentos não tem data_compra).
    v_a := public.ativos_de_linha_rh(r.organization_id, r.created_by, r.tipo, r.descricao, r.valor, r.entrega,
                                     r.conta_modo, r.conta_meses, r.conta_inicio, r.conta_fim,
                                     r.entrega, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    UPDATE public.pessoas_equipamentos e
       SET ativo_id = v_a.id, tipo = NULL, descricao = NULL, valor = NULL,
           conta_modo = NULL, conta_meses = NULL, conta_inicio = NULL, conta_fim = NULL
     WHERE e.id = r.id;
    PERFORM public.ativos_evento(r.organization_id, v_a.id, 'ligado', r.created_by, r.id, '{}'::text[]);
    IF r.estado = 'devolvido' THEN
      PERFORM public.ativos_evento(r.organization_id, v_a.id, 'desligado', r.created_by, r.id, '{}'::text[]);
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev, '') = '' THEN '{}' ELSE v_prev END, true);
  RAISE NOTICE 'CARGA: % linha(s) do RH convertidas em ativos.', v_n;
END;
$carga$;

DO $carga_conferir$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.pessoas_equipamentos e
   WHERE (e.ativo_id IS NULL AND (e.tipo IS DISTINCT FROM 'fardamento' OR e.descricao IS NULL OR e.valor IS NULL OR e.conta_modo IS NULL))
      OR (e.ativo_id IS NOT NULL AND (e.tipo IS NOT NULL OR e.descricao IS NOT NULL OR e.valor IS NOT NULL OR e.conta_modo IS NOT NULL
                                      OR e.conta_meses IS NOT NULL OR e.conta_inicio IS NOT NULL OR e.conta_fim IS NOT NULL));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CARGA: % linha(s) do RH ficaram fora da regra da fonte única depois da carga. Nada foi aplicado.', v_n;
  END IF;
END;
$carga_conferir$;

-- ==============================================================================
-- 9. A regra da fonte única (DEPOIS da carga, [M3])
-- ==============================================================================
ALTER TABLE public.pessoas_equipamentos ADD CONSTRAINT pessoas_equipamentos_fonte_unica CHECK (
  (ativo_id IS NOT NULL
     AND tipo IS NULL AND descricao IS NULL AND valor IS NULL
     AND conta_modo IS NULL AND conta_meses IS NULL AND conta_inicio IS NULL AND conta_fim IS NULL)
  OR (ativo_id IS NULL
     AND tipo IS NOT NULL AND tipo = 'fardamento'
     AND descricao IS NOT NULL AND valor IS NOT NULL AND conta_modo IS NOT NULL));

COMMENT ON COLUMN public.pessoas_equipamentos.ativo_id IS
'Ativo (grupo pessoa) que esta linha ocupa de entrega a devolução. Com ativo, a linha não guarda tipo, descrição, valor nem conta (pessoas_equipamentos_fonte_unica): tudo vem do ativo. Sem ativo só a farda (decisão adiada). Desde 20270126900000; fonte única desde 20270129100000.';

-- ==============================================================================
-- 10. Direitos das funções: internas para ninguém; rpc só para authenticated
--     (os direitos por omissão da base dão EXECUTE a anon/authenticated/service_role).
-- ==============================================================================
REVOKE ALL ON FUNCTION public.ativos_hoje() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_prefixo(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_proximo_codigo(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_validar(uuid, uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_json(public.ativo) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_criar_interno(uuid, uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_de_linha_rh(uuid, uuid, text, text, numeric, date, text, integer, date, date, date, text, integer, uuid, text, numeric, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_verificar_entrega(public.ativo, uuid, date) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_desativar(uuid, uuid, date, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_reativar(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativos_listar(uuid, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_ler(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativos_opcoes(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_ligar_pessoa(uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_desligar_pessoa(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid, uuid, date, text, integer, uuid, text, numeric, date, date) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamento_devolver(uuid, uuid, date, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamento_alterar_conta(uuid, uuid, text, integer, date, date) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamentos_listar(uuid, uuid, integer, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamentos_livres(uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamento_corrigir(uuid, uuid, text[], text, numeric, numeric, date, integer, text, numeric, date, date, uuid, date, date) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_desativar(uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_reativar(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativos_listar(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_ler(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativos_opcoes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_ligar_pessoa(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_desligar_pessoa(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid, uuid, date, text, integer, uuid, text, numeric, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamento_devolver(uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamento_alterar_conta(uuid, uuid, text, integer, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamentos_listar(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamentos_livres(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamento_corrigir(uuid, uuid, text[], text, numeric, numeric, date, integer, text, numeric, date, date, uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date) IS
'Cria um ativo (ativos.edit), comprado ou alugado; código gerado por empresa e prefixo se vier vazio. Erros ATV02..ATV24 (MESSAGE = código, DETAIL em pt-PT). Devolve {id, codigo}. Desde 20270126900000; A1 em 20270129100000.';
COMMENT ON FUNCTION public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date, boolean) IS
'Altera um ativo (ativos.edit). Com p_campos_novos = false (ecrã antigo) forma, renda, datas do aluguer, origem da vida e armazém ficam como estão. Nunca muda a forma (ATV19). Desde 20270126900000; A1 em 20270129100000.';
COMMENT ON FUNCTION public.rpc_ativo_reativar(uuid, uuid) IS
'Reativa um ativo (ativos.edit). AVISO: apaga desativado_em e volta a pôr a renda ou a quota nos meses desde a desativação, também nos passados (a resposta leva aviso). Recusa (ATV30) se o armazém já tiver outro ativo vivo. A1 em 20270129100000.';
COMMENT ON FUNCTION public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid, uuid, date, text, integer, uuid, text, numeric, date, date) IS
'Atribui equipamento a uma pessoa (permissões do RH). Com p_ativo_id entrega um ativo livre; farda fica só no RH; o resto cria o ativo (comprado ou alugado) e liga-lhe a linha. Devolve {id, existente, ativo_id, codigo}. A1 em 20270129100000.';
COMMENT ON FUNCTION public.rpc_hr_equipamento_corrigir(uuid, uuid, text[], text, numeric, numeric, date, integer, text, numeric, date, date, uuid, date, date) IS
'Corrige valor, vida, renda, datas do aluguer e datas de uma entrega de um equipamento do RH. Pede ativos.edit (nunca as permissões do RH, ATV-1); escreve só em ativo_eventos (alterado, ocupacao_corrigida). Limite: 120 por hora por utilizador (ATV33). Devolve o ativo + pessoas_afetadas. Desde 20270129100000.';
COMMENT ON FUNCTION public.rpc_hr_equipamentos_livres(uuid, text) IS
'Ativos do grupo Pessoas vivos, sem ninguém e (alugados) com contrato não terminado, para entregar (hr.pessoas.retribuicao.view e .edit). Mostra valores a quem tem o RH mesmo sem ativos.view, de propósito. Sem fardamento. Desde 20270129100000.';

-- ==============================================================================
-- 11. Conferir (falha a migration inteira se algo não bater; catálogo com ::text)
-- ==============================================================================
DO $conferir$
DECLARE
  v_n integer;
  v_f text;
  v_r record;
BEGIN
  -- C1 As CHECKs que NÃO deviam mudar estão iguais (md5 lido a 26/11).
  FOR v_r IN SELECT * FROM (VALUES
      ('public.ativo', 'ativo_valor_compra', 'e585e3b200f56b4b473e851bea5f6648'),
      ('public.ativo', 'ativo_data_compra', '9dda99fd07f848d75d39778462c0447c'),
      ('public.ativo', 'ativo_valor_residual', '6e2429d91717405ef6a3afe27865cd35'),
      ('public.ativo', 'ativo_tipo_coerente', '3657275d9be5ed869f63e74aec0c9116'),
      ('public.ativo', 'ativo_codigo', 'c11431c65060bba32953a5c3ddb4a77b'),
      ('public.ativo', 'ativo_nome', '3151a188dcbc64afd0d0bacd90203b7f'),
      ('public.pessoas_equipamentos', 'pessoas_equipamentos_conta_coerente', 'd6bb31db40041d7cbb80f3f14efb04a5'),
      ('public.hr_custo_eventos', 'hr_custo_eventos_entidade_valida', '55c9778e4ef41b9ee4a5a163dc4b5ed2')
    ) AS x(tabela, nome, h) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                    WHERE c.conrelid = to_regclass(v_r.tabela) AND c.conname::text = v_r.nome
                      AND md5(pg_get_constraintdef(c.oid)::text) = v_r.h) THEN
      RAISE EXCEPTION 'C1: a regra % mudou, e não devia.', v_r.nome;
    END IF;
  END LOOP;

  -- C2 As CHECKs novas e substituídas existem, validadas, com o essencial no texto.
  FOREACH v_f IN ARRAY ARRAY['ativo_forma_aquisicao_valida', 'ativo_forma_coerente', 'ativo_renda_mensal',
      'ativo_aluguer_datas', 'ativo_vida_origem', 'ativo_armazem_coerente', 'ativo_vida_meses',
      'ativo_desativacao_coerente', 'ativo_equipamento_coerente'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.ativo')
                    AND c.conname::text = v_f AND c.contype::text = 'c' AND c.convalidated) THEN
      RAISE EXCEPTION 'C2: falta a regra % em ativo (ou não está validada).', v_f;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.ativo')
                  AND c.conname::text = 'ativo_desativacao_coerente'
                  AND lower(pg_get_constraintdef(c.oid)::text) LIKE '%coalesce(data_compra, inicio_aluguer)%') THEN
    RAISE EXCEPTION 'C2: ativo_desativacao_coerente não compara com coalesce(data_compra, inicio_aluguer).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.ativo')
                  AND c.conname::text = 'ativo_vida_meses'
                  AND pg_get_constraintdef(c.oid)::text LIKE '%alugado%') THEN
    RAISE EXCEPTION 'C2: ativo_vida_meses não dispensa a vida no alugado.';
  END IF;
  FOREACH v_f IN ARRAY ARRAY['ativo_eventos_tipo_valido', 'ativo_eventos_ligacao_coerente', 'ativo_eventos_campos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.ativo_eventos')
                    AND c.conname::text = v_f AND c.contype::text = 'c' AND c.convalidated
                    AND pg_get_constraintdef(c.oid)::text LIKE '%ocupacao_corrigida%') THEN
      RAISE EXCEPTION 'C2: a regra % de ativo_eventos não conhece ocupacao_corrigida.', v_f;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.pessoas_equipamentos')
                  AND c.conname::text = 'pessoas_equipamentos_fonte_unica' AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'C2: falta pessoas_equipamentos_fonte_unica (ou não está validada).';
  END IF;

  -- C3 Colunas: codigo obrigatório; compra e data opcionais; o RH sem NOT NULL nem omissão na conta.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.ativo') AND NOT a.attisdropped
     AND ((a.attname::text = 'codigo' AND a.attnotnull)
          OR (a.attname::text IN ('valor_compra', 'data_compra') AND NOT a.attnotnull)
          OR (a.attname::text = 'forma_aquisicao' AND a.attnotnull));
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'C3: colunas de ativo com a nulidade errada (% de 4).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_equipamentos') AND NOT a.attisdropped
     AND a.attname::text IN ('tipo', 'descricao', 'valor', 'conta_modo') AND NOT a.attnotnull AND NOT a.atthasdef;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'C3: pessoas_equipamentos ainda obriga tipo/descricao/valor/conta_modo (% de 4 livres).', v_n;
  END IF;

  -- C4 Armazém: a UNIQUE nova, a FK composta e o índice de um só ativo vivo.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.warehouses')
                  AND c.conname::text = 'warehouses_id_org_key' AND c.contype::text = 'u'
                  AND pg_get_constraintdef(c.oid)::text = 'UNIQUE (id, organization_id)')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.ativo')
                     AND c.conname::text = 'ativo_warehouse_fkey' AND c.contype::text = 'f')
     OR to_regclass('public.ativo_warehouse_ativo_key') IS NULL THEN
    RAISE EXCEPTION 'C4: falta warehouses_id_org_key, ativo_warehouse_fkey ou ativo_warehouse_ativo_key.';
  END IF;

  -- C5 [LOW] Nenhum direito de tabela para anon/authenticated em ativo, eventos, contador e RH;
  --    contador com RLS forçada e sem políticas. As políticas ativo_criar/ativo_editar ficam
  --    dormentes (só valeriam com direitos de tabela, que ninguém tem).
  FOREACH v_f IN ARRAY ARRAY['public.ativo', 'public.ativo_eventos', 'public.ativo_codigo_contador', 'public.pessoas_equipamentos'] LOOP
    IF has_table_privilege('anon', v_f, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', v_f, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'C5: anon ou authenticated tem direitos diretos em %.', v_f;
    END IF;
  END LOOP;
  IF has_table_privilege('service_role', 'public.ativo_codigo_contador', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'C5: service_role tem direitos diretos em ativo_codigo_contador.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass('public.ativo_codigo_contador')
                  AND c.relrowsecurity AND c.relforcerowsecurity)
     OR EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname::text = 'public' AND p.tablename::text = 'ativo_codigo_contador') THEN
    RAISE EXCEPTION 'C5: ativo_codigo_contador sem RLS forçada ou com políticas.';
  END IF;

  -- C6 Uma só sobrecarga de cada função; as que cresceram começam pelos argumentos de hoje.
  FOREACH v_f IN ARRAY ARRAY['ativos_validar', 'ativos_json', 'rpc_ativo_criar', 'rpc_ativo_alterar', 'rpc_ativo_desativar',
      'rpc_ativo_reativar', 'rpc_ativos_listar', 'rpc_ativo_ler', 'rpc_ativos_opcoes', 'rpc_ativo_ligar_pessoa',
      'rpc_ativo_desligar_pessoa', 'rpc_hr_equipamento_atribuir', 'rpc_hr_equipamento_devolver',
      'rpc_hr_equipamento_alterar_conta', 'rpc_hr_equipamentos_listar', 'rpc_hr_equipamentos_livres',
      'rpc_hr_equipamento_corrigir', 'ativos_hoje', 'ativos_prefixo', 'ativos_proximo_codigo', 'ativos_criar_interno',
      'ativos_de_linha_rh', 'ativos_verificar_entrega'] LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname::text = 'public' AND p.proname::text = v_f;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'C6: % tem % sobrecarga(s) (esperada 1).', v_f, v_n;
    END IF;
  END LOOP;
  FOR v_r IN SELECT * FROM (VALUES
      ('rpc_hr_equipamento_atribuir', 'p_pessoa_id uuid, p_organization_id uuid, p_tipo text, p_descricao text, p_valor numeric, p_entrega date, p_conta_modo text, p_conta_meses integer, p_conta_inicio date, p_conta_fim date, p_id uuid, '),
      ('rpc_ativo_criar', 'p_organization_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid, p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer, p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid, p_localizacao text, p_notas text, '),
      ('rpc_ativo_alterar', 'p_id uuid, p_organization_id uuid, p_nome text, p_tipo text, p_cat_equipamento_id uuid, p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer, p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid, p_localizacao text, p_notas text, ')
    ) AS x(nome, prefixo) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text = 'public' AND p.proname::text = v_r.nome
                      AND left(pg_get_function_identity_arguments(p.oid)::text, length(v_r.prefixo)) = v_r.prefixo) THEN
      RAISE EXCEPTION 'C6: % não começa pelos argumentos de hoje (o ecrã antigo deixaria de a chamar).', v_r.nome;
    END IF;
  END LOOP;

  -- C7 RPCs: authenticated executa, anon e service_role não; SECURITY DEFINER com search_path vazio.
  FOREACH v_f IN ARRAY ARRAY[
    'public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date)',
    'public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date, boolean)',
    'public.rpc_ativo_desativar(uuid, uuid, date, text, text)',
    'public.rpc_ativo_reativar(uuid, uuid)',
    'public.rpc_ativos_listar(uuid, boolean)',
    'public.rpc_ativo_ler(uuid, uuid)',
    'public.rpc_ativos_opcoes(uuid)',
    'public.rpc_ativo_ligar_pessoa(uuid, uuid, uuid)',
    'public.rpc_ativo_desligar_pessoa(uuid, uuid)',
    'public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid, uuid, date, text, integer, uuid, text, numeric, date, date)',
    'public.rpc_hr_equipamento_devolver(uuid, uuid, date, text)',
    'public.rpc_hr_equipamento_alterar_conta(uuid, uuid, text, integer, date, date)',
    'public.rpc_hr_equipamentos_listar(uuid, uuid, integer, integer)',
    'public.rpc_hr_equipamentos_livres(uuid, text)',
    'public.rpc_hr_equipamento_corrigir(uuid, uuid, text[], text, numeric, numeric, date, integer, text, numeric, date, date, uuid, date, date)'] LOOP
    IF to_regprocedure(v_f) IS NULL THEN
      RAISE EXCEPTION 'C7: falta %.', v_f;
    END IF;
    IF NOT has_function_privilege('authenticated', v_f, 'EXECUTE') OR has_function_privilege('anon', v_f, 'EXECUTE')
       OR has_function_privilege('service_role', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'C7: direitos de execução errados em %.', v_f;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_f) AND p.prosecdef
                     AND 'search_path=""' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'C7: % não é SECURITY DEFINER com search_path vazio.', v_f;
    END IF;
  END LOOP;
  -- As internas: ninguém executa.
  FOREACH v_f IN ARRAY ARRAY[
    'public.ativos_hoje()',
    'public.ativos_prefixo(text, text)',
    'public.ativos_proximo_codigo(uuid, text, text)',
    'public.ativos_validar(uuid, uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date)',
    'public.ativos_json(public.ativo)',
    'public.ativos_criar_interno(uuid, uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text, text, uuid, text, numeric, date, date)',
    'public.ativos_de_linha_rh(uuid, uuid, text, text, numeric, date, text, integer, date, date, date, text, integer, uuid, text, numeric, date, date)',
    'public.ativos_verificar_entrega(public.ativo, uuid, date)'] LOOP
    IF to_regprocedure(v_f) IS NULL THEN
      RAISE EXCEPTION 'C7: falta %.', v_f;
    END IF;
    IF has_function_privilege('authenticated', v_f, 'EXECUTE') OR has_function_privilege('anon', v_f, 'EXECUTE')
       OR has_function_privilege('service_role', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'C7: a função interna % ficou executável por anon, authenticated ou service_role.', v_f;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_f) AND p.prosecdef) THEN
      RAISE EXCEPTION 'C7: a função interna % não pode ser SECURITY DEFINER.', v_f;
    END IF;
  END LOOP;

  -- C8 A correção pede ativos.edit e nunca a escrita do RH (ATV-1), e não escreve eventos do RH.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text = 'rpc_hr_equipamento_corrigir'
     AND p.prosrc::text LIKE '%ativos_exigir(p_organization_id, ''ativos.edit'')%'
     AND p.prosrc::text NOT LIKE '%hr_custo_exigir_escrita%'
     AND p.prosrc::text NOT LIKE '%hr_custo_evento%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C8: rpc_hr_equipamento_corrigir não pede só ativos.edit.';
  END IF;

  -- C9 Dados: nenhuma linha do RH fora da farda sem ativo; os ativos de serviço ficaram comprados.
  SELECT count(*) INTO v_n FROM public.pessoas_equipamentos e WHERE e.ativo_id IS NULL AND e.tipo IS DISTINCT FROM 'fardamento';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C9: % linha(s) do RH sem ativo que não são farda.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.ativo a WHERE a.forma_aquisicao IS DISTINCT FROM 'comprado' AND a.grupo = 'servico';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C9: % ativo(s) de serviço não ficaram comprados.', v_n;
  END IF;

  -- C10 Nenhum gatilho novo (a pessoa apagada com equipamento ficou adiada).
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgrelid IN (to_regclass('public.ativo'), to_regclass('public.pessoas_equipamentos'))
     AND t.tgname::text NOT IN ('trg_ativo_updated_at', 'trg_pessoas_equipamentos_updated_at');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C10: % gatilho(s) inesperado(s) em ativo ou pessoas_equipamentos.', v_n;
  END IF;
END;
$conferir$;

COMMIT;
