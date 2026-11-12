-- ==============================================================================
-- Limpeza do que as regras salariais deixaram sem uso -- FASE FINAL (CONTRAIR).
-- DESTRUTIVA. IRREVERSIVEL sem uma migration de reposicao escrita a mao (ver
-- "COMO SE REVERTE"). So base RH (uetjghdkwbywbftedtth), onde so existe a nike;
-- nada disto chega a Mudelar (base principal).
-- Desenho: vault/ficheiros/rh/limpeza-regras-salariais-fase-final-desenho.md.
-- Fase anterior (expandir): 20270111700000.
--
-- NAO FAZER db push sem: (1) listar o remoto imediatamente antes, a partir do
-- worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth), e
-- confirmar que so este ficheiro fica pendente, com carimbo acima do maximo
-- aplicado; (2) correr supabase/tests/hr_limpeza_contrair_antes.test.sql e o
-- ensaio (este ficheiro com ROLLBACK no lugar de COMMIT, mais o bloco de prova
-- de hr_limpeza_contrair_depois.test.sql, gerado por script fora da pasta das
-- migrations) contra o remoto ANTES do push; (3) revisao ecc:database-reviewer
-- e ecc:security-reviewer.
-- NAO APLICAR entre as 01:10 e as 01:30 UTC: o cron hr-contratos-rotina-diaria
-- corre as 01:15 UTC e escreve em pessoas_vinculos (os LOCK abaixo esperariam
-- por ele, ou ele por esta migration).
--
--
-- -- NAO PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------
--
-- O cliente publicado (feature/rh-pessoas desde 9/11) ja usa as assinaturas
-- novas (sem p_subsidio, sem p_ano_min) e nenhuma consulta viva pede as
-- colunas largadas. Fica codigo SEM ROTA que deixa de funcionar se alguem o
-- abrir (src/hooks/useRegrasSubsidioAlimentacao.ts, a seccao Subsidio de
-- src/pages/ConfiguracaoVencimento.tsx, que so e importada por
-- src/pages/Vencimento.tsx, sem rota) e tipos opcionais: limpeza a parte.
--
--
-- -- O QUE SE LARGA ----------------------------------------------------------
--
--  1. rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)
--     (a assinatura antiga, com p_subsidio). Fica a de 5 argumentos.
--  2. rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)
--     (a antiga, com p_ano_min). Fica a de 4 argumentos.
--  3. pessoas_retribuicoes.subsidio_alimentacao (numeric(10,2)), com o CHECK
--     pessoas_retribuicoes_subsidio_nao_negativo.
--  4. pessoas_vinculos.horas_anuais_maximas (numeric(7,2)), com o CHECK
--     pessoas_vinculos_horas_anuais_maximas_validas e o comentario.
--  5. A tabela hr_regras_subsidio_alimentacao inteira (sem CASCADE): as 4
--     politicas, os indices, as constraints, o gatilho updated_at e o toast.
--     As permissoes hr.vencimento.subsidio.view e .gerir FICAM (sao usadas
--     pelas regras salariais e pela rota de processamento).
--
-- FICAM, de proposito: hr_horas_extra_config.ano_min (migration propria; 0
-- linhas) e o filtro de texto c.codigo <> 'subsidio_alimentacao' em
-- hr_admissao_pendencias (compara um codigo, nao a coluna).
--
--
-- -- O QUE MUDA, PARA ISSO SER POSSIVEL ------------------------------------------
--
-- A. Cinco funcoes deixam de citar as colunas (troca de linhas inteiras no
--    corpo VIVO: pg_get_functiondef + replace + EXECUTE; dono, privilegios,
--    SECURITY DEFINER, search_path, volatilidade e comentario ficam; o corpo
--    resultante e conferido por md5 contra o calculado fora da base):
--      hr_retribuicao_campos_da_versao: sai a chave subsidio_alimentacao.
--      hr_retribuicao_refazer_desde: sai a coluna do INSERT e o seu valor.
--      hr_retribuicoes_escrita_so_por_rpc: sai do ROW(...) comparado.
--      rpc_hr_retribuicao_definir_pessoal (5 arg.): deixa de herdar o valor
--        (declaracao, SELECT INTO, atribuicao, chave do jsonb e comentario).
--      hr_vinculos_registar_alteracao: sai horas_anuais_maximas da lista.
--    Sem isto, as quatro primeiras rebentavam na primeira chamada depois do
--    DROP (mudar cargo, definir subsidio e duodecimos, mudar o salario do
--    cargo e qualquer UPDATE a pessoas_retribuicoes).
--    Efeito lateral, inocuo: a fusao de trocos em hr_retribuicao_refazer_desde
--    deixa de distinguir versoes que so diferiam no subsidio (o valor deixou de
--    existir, por isso nao ha nada a distinguir).
-- B. hr_legado_arquivo ganha a coluna fase ('expandir' | 'contrair', sem
--    DEFAULT: quem acrescenta diz a fase) e a unicidade passa a (tabela, coluna,
--    registo_id, fase). As 26 linhas da fase 1 ficam 'expandir', intactas. A
--    fase 'contrair' e um INSTANTANEO COMPLETO, tirado aqui com as tabelas
--    trancadas, que SUBSTITUI POR INTEIRO a 'expandir' (essa ficou
--    desactualizada: 12 versoes criadas depois e 1 com o valido_ate mudado).
--    Consequencia (dados pessoais): o arquivo passa a ter os valores salariais
--    por pessoa EM DUPLICADO, versoes apagadas incluidas. O prazo de guarda e o
--    apagamento a pedido (RGPD; decisao 13 do utilizador, PENDENTE) valem para
--    as duas fases em conjunto. A tabela recusa UPDATE, DELETE e TRUNCATE a
--    TODOS, postgres incluido (gatilho); pessoa_id e o unico indice util para
--    um apagamento por pessoa. Esta migration nao escreve nenhum apagamento.
-- C. Comentarios que citavam as colunas largadas: o da RPC de 5 argumentos (o
--    texto novo), hr_horas_extra_config, pessoas_vinculos.horas_semanais_maximas,
--    pessoas_horas_extra.acima_limite e hr_horas_extra_pessoa_ctx (troca de uma
--    frase cada). O do arquivo e reescrito.
--
--
-- -- O QUE O UTILIZADOR VE MUDAR ----------------------------------------------
--
-- Nada nos ecras com rota: a ficha nao mostra o subsidio da pessoa, o contrato
-- emitido usa a regra salarial desde a fase 1 e as horas extra usam o limite
-- da regra. So muda para quem tiver aberto um separador de pre-visualizacao
-- anterior a 9/11 (receberia "funcao nao encontrada" nas RPC antigas) ou a
-- pagina antiga de Vencimento, que nao tem rota.
--
--
-- -- ORDEM DOS LOCKS ----------------------------------------------------------
--
-- Ordem de escrita lida nos corpos vivos: UPDATE em pessoas_vinculos dispara
-- hr_pessoas_vinculos_derivar_datas_pessoa (AFTER), que recalcula pessoas
-- (vinculos -> pessoas); hr_retribuicao_refazer_desde tranca pessoas FOR NO
-- KEY UPDATE e so depois escreve pessoas_retribuicoes (pessoas ->
-- retribuicoes). Nenhuma funcao ESCREVE vinculos e retribuicoes na mesma
-- transaccao. A migration tranca pela mesma ordem: pessoas_vinculos, pessoas
-- (EXCLUSIVE: as leituras continuam), pessoas_retribuicoes,
-- hr_regras_subsidio_alimentacao, hr_legado_arquivo. lock_timeout de 3 s: se
-- alguem estiver a escrever, a migration cai inteira e repete-se. Leituras e
-- verificacoes de FK tambem contam (uma RPC a meio pode dar deadlock 40P01,
-- detectado ao fim de 1 s). O DROP TABLE tranca ainda anew_users e
-- anew_organizations (FK da tabela antiga). Janela de milissegundos, so na
-- nike: aplicar fora de horas de utilizacao.
--
--
-- -- CODIGOS DE ERRO ----------------------------------------------------------
--
--   limpeza_contrair_fora_de_transaccao (25000)
--   limpeza_contrair_dependente_inesperado (2BP01): apareceu um dependente, uma
--     funcao, um comentario ou uma referencia que o desenho nao conhece.
--   limpeza_contrair_arquivo_incompleto (23514): o instantaneo nao bate com a
--     origem (contagem, soma, linha a linha) ou a fase 1 tem um valor que mudou.
--   As restantes guardas (G0-G7, F1-F9) usam o padrao da fase 1 (P0001).
--
--
-- -- COMO SE REVERTE (descrito; NAO ha ficheiro de reversao) ------------------
--
-- Por migration nova, a mao:
--  1. Recriar as colunas com o tipo e o CHECK (numeric(10,2) >= 0;
--     numeric(7,2) 0..4000) e o comentario de horas_anuais_maximas
--     (20261120140000). O attnum fica no fim (so estetico).
--  2. Preencher a partir de hr_legado_arquivo WHERE fase = 'contrair', por
--     UPDATE ... FROM arquivo WHERE id = registo_id. Em pessoas_retribuicoes o
--     gatilho hr_retribuicoes_escrita_so_por_rpc recusa a escrita directa de um
--     utilizador: correr como postgres, sem claims (auth.uid() NULL), ou ligar
--     set_config('hr.retribuicao_via_rpc', 'on', true) na transaccao. Os
--     gatilhos hr_retribuicoes_sem_sobreposicao e hr_retribuicao_valor_conforme_cargo
--     correm na mesma (o UPDATE so toca nesta coluna, por isso nao devem
--     recusar -- suposto, nao verificado); hr_retribuicoes_auditar regista um
--     acesso sensivel por linha em pessoas_acessos_sensiveis, via
--     hr_registar_acesso_sensivel (lido a 12/11; aceitavel, fica registado).
--  3. Recriar hr_regras_subsidio_alimentacao a partir de 20261201200000 e
--     20261210180000 (tabela, RLS, as 4 politicas, grants, gatilho, indices) e
--     inserir com jsonb_populate_record(NULL::public.hr_regras_subsidio_alimentacao, valor).
--  4. Repor nas 5 funcoes as linhas tiradas (troca inversa sobre o corpo vivo;
--     as linhas estao em tmp_lc_troca abaixo) e recriar as duas RPC antigas a
--     partir dos corpos em 20270111700000 (tmp_lx_esperado), com o mesmo ACL.
-- Perde-se de vez: o subsidio das versoes criadas DEPOIS do DROP; o attnum
-- original; e as linhas de origem apagadas fisicamente mais tarde (o arquivo
-- guarda o valor, mas ja nao ha onde o repor). Nada se perde dos valores que
-- existem no momento do DROP: a guarda do arquivo garante-o.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
-- search_path fixo: os nomes que as guardas comparam (regprocedure::text,
-- pg_describe_object) saem sem o prefixo public, tal como foram lidos.
SET LOCAL search_path = public, extensions;

-- ---- G00: dentro de uma transaccao ---------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '3s' THEN
    RAISE EXCEPTION
      'limpeza_contrair_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Corpos esperados no remoto (md5 SEM os \r, lido a 12/11) ------------------
-- Os corpos vivos tem CRLF; o md5 sem \r e independente do checkout.
CREATE TEMP TABLE tmp_lc_esperado (fn text PRIMARY KEY, md5_sem_cr text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_lc_esperado (fn, md5_sem_cr) VALUES
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)', '114c500d3e812fa5385bfccf4a5100dd'),
  ('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)',  'edce5b6e9697bd138ba6d9cb0761fea6'),
  ('public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes)',                   '363dab8f3462a959e35f615b8be058e5'),
  ('public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)',              '860cbefcc14d1e20298acea748cc4ace'),
  ('public.hr_retribuicoes_escrita_so_por_rpc()',                                           '4b16ba28fee30a6a91d758a90143db5b'),
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)',          '29ec077d844f4c77130b60c6f54c4137'),
  ('public.hr_vinculos_registar_alteracao()',                                               '1088ebe6756f9e4bc578e285006ec044'),
  ('public.hr_documento_variaveis(uuid, uuid, boolean)',                                    '5f27c4edb9608c4a1a89235f2264c593');

-- ---- As trocas, linha inteira a linha inteira (por ordem) ----------------------
-- antes/depois sao listas de LINHAS (sem fim de linha); depois vazio = a linha
-- sai. A ancora e eol + linhas unidas por eol + eol, com eol = CRLF ou LF
-- conforme o corpo vivo (G2 exige que o corpo seja todo CRLF ou todo LF).
CREATE TEMP TABLE tmp_lc_troca (
  fn     text    NOT NULL,
  ordem  integer NOT NULL,
  antes  text[]  NOT NULL,
  depois text[]  NOT NULL,
  PRIMARY KEY (fn, ordem)
) ON COMMIT DROP;
INSERT INTO tmp_lc_troca (fn, ordem, antes, depois) VALUES
('public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes)', 1,
  ARRAY[$l$    'subsidio_alimentacao',       p_r.subsidio_alimentacao,$l$], ARRAY[]::text[]),
('public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)', 1,
  ARRAY[$l$         subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct,$l$],
  ARRAY[$l$         subsidio_alimentacao_modo, duodecimos_pct,$l$]),
('public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)', 2,
  ARRAY[$l$         (v_p_campos ->> 'subsidio_alimentacao')::numeric,$l$], ARRAY[]::text[]),
('public.hr_retribuicoes_escrita_so_por_rpc()', 1,
  ARRAY[$l$           NEW.subsidio_alimentacao, NEW.subsidio_alimentacao_modo, NEW.duodecimos_pct,$l$],
  ARRAY[$l$           NEW.subsidio_alimentacao_modo, NEW.duodecimos_pct,$l$]),
('public.hr_retribuicoes_escrita_so_por_rpc()', 2,
  ARRAY[$l$           OLD.subsidio_alimentacao, OLD.subsidio_alimentacao_modo, OLD.duodecimos_pct,$l$],
  ARRAY[$l$           OLD.subsidio_alimentacao_modo, OLD.duodecimos_pct,$l$]),
('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', 1,
  ARRAY[$l$  v_subsidio       numeric;$l$], ARRAY[]::text[]),
('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', 2,
  ARRAY[$l$  -- Vinculo, moeda e SUBSIDIO: os da versao que cobre a data (o subsidio nao$l$,
        $l$  -- vem do pedido: herda-se, e o valor nao muda); senao o vinculo mais$l$,
        $l$  -- recente que nao terminou, EUR e sem subsidio.$l$],
  ARRAY[$l$  -- Vinculo e moeda: os da versao que cobre a data; senao o vinculo mais$l$,
        $l$  -- recente que nao terminou e EUR. O subsidio de alimentacao nao e da pessoa:$l$,
        $l$  -- vem da regra salarial da organizacao (a pessoa so escolhe o modo).$l$]),
('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', 3,
  ARRAY[$l$  SELECT r.vinculo_id, r.moeda, r.subsidio_alimentacao INTO v_vinculo, v_moeda, v_subsidio$l$],
  ARRAY[$l$  SELECT r.vinculo_id, r.moeda INTO v_vinculo, v_moeda$l$]),
('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', 4,
  ARRAY[$l$    v_subsidio := NULL;$l$], ARRAY[]::text[]),
('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', 5,
  ARRAY[$l$    'subsidio_alimentacao',       v_subsidio,$l$], ARRAY[]::text[]),
('public.hr_vinculos_registar_alteracao()', 1,
  ARRAY[$l$    'horas_periodo', 'horas_frequencia', 'horas_semanais_maximas', 'horas_anuais_maximas',$l$],
  ARRAY[$l$    'horas_periodo', 'horas_frequencia', 'horas_semanais_maximas',$l$]);

-- md5 dos corpos DEPOIS da troca, calculados fora da base sobre o prosrc vivo
-- de 12/11 (com CR = o texto bruto que fica em pg_proc; sem CR = independente
-- do fim de linha), e o diff de linhas esperado (tiradas / postas).
CREATE TEMP TABLE tmp_lc_md5_novo (
  fn text PRIMARY KEY, md5_cru text NOT NULL, md5_sem_cr text NOT NULL,
  tiradas integer NOT NULL, postas integer NOT NULL
) ON COMMIT DROP;
INSERT INTO tmp_lc_md5_novo (fn, md5_cru, md5_sem_cr, tiradas, postas) VALUES
  ('public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes)',          '9e387b5817f7fe5a03915d74cdac13f4', '1bd16ee9f0dd4be25feb5c618863984c', 1, 0),
  ('public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)',     '64e1fcaf575dd87b96d8669d72065762', '354a67e0a086396e42dbcafafd9dc538', 2, 1),
  ('public.hr_retribuicoes_escrita_so_por_rpc()',                                  '2c8738a176d81094613a65a1080eed2b', '9f08269b42dc514cba6f3e863dd53cb6', 2, 2),
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', '91e075901d94b1c272185d0504ef514f', 'ce91dd206c3884543e7a3975e725db36', 7, 4),
  ('public.hr_vinculos_registar_alteracao()',                                      'fade103a234984e3c7d3cd7d0c85ea63', '6ff1c4178569d0e3a7bf9a8f3271623e', 1, 1);

-- ---- Dependentes esperados, por NOME (pg_describe_object), lidos a 12/11 -------
-- O oid do toast normaliza-se para pg_toast_N.
CREATE TEMP TABLE tmp_lc_dep_esperado (alvo text NOT NULL, obj text NOT NULL, dt text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_lc_dep_esperado (alvo, obj, dt) VALUES
  ('col pessoas_retribuicoes.subsidio_alimentacao', 'constraint pessoas_retribuicoes_subsidio_nao_negativo on table pessoas_retribuicoes', 'a'),
  ('col pessoas_retribuicoes.subsidio_alimentacao', 'constraint pessoas_retribuicoes_subsidio_nao_negativo on table pessoas_retribuicoes', 'n'),
  ('col pessoas_vinculos.horas_anuais_maximas', 'constraint pessoas_vinculos_horas_anuais_maximas_validas on table pessoas_vinculos', 'a'),
  ('col pessoas_vinculos.horas_anuais_maximas', 'constraint pessoas_vinculos_horas_anuais_maximas_validas on table pessoas_vinculos', 'n'),
  ('tabela hr_regras_subsidio_alimentacao', 'type hr_regras_subsidio_alimentacao', 'i'),
  ('tabela hr_regras_subsidio_alimentacao', 'toast table pg_toast.pg_toast_N', 'i'),
  ('tabela hr_regras_subsidio_alimentacao', 'trigger trg_hr_regras_subsidio_alimentacao_updated_at on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'policy hr_regras_subsidio_alimentacao_select on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'policy hr_regras_subsidio_alimentacao_select on table hr_regras_subsidio_alimentacao', 'n'),
  ('tabela hr_regras_subsidio_alimentacao', 'policy hr_regras_subsidio_alimentacao_insert on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'policy hr_regras_subsidio_alimentacao_insert on table hr_regras_subsidio_alimentacao', 'n'),
  ('tabela hr_regras_subsidio_alimentacao', 'policy hr_regras_subsidio_alimentacao_update on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'policy hr_regras_subsidio_alimentacao_update on table hr_regras_subsidio_alimentacao', 'n'),
  ('tabela hr_regras_subsidio_alimentacao', 'policy hr_regras_subsidio_alimentacao_block_delete on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'default value for column id of table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'default value for column minutos_minimos_dia of table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'default value for column created_at of table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'default value for column updated_at of table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'constraint hr_regras_subsidio_alimentacao_pkey on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'constraint hr_regras_subsidio_alimentacao_org_key on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'constraint hr_regras_subsidio_alimentacao_org_fkey on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'constraint hr_regras_subsidio_alimentacao_minutos_positivos on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'constraint hr_regras_subsidio_alimentacao_minutos_positivos on table hr_regras_subsidio_alimentacao', 'n'),
  ('tabela hr_regras_subsidio_alimentacao', 'constraint hr_regras_subsidio_alimentacao_created_by_fkey on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'constraint hr_regras_subsidio_alimentacao_updated_by_fkey on table hr_regras_subsidio_alimentacao', 'a'),
  ('tabela hr_regras_subsidio_alimentacao', 'index idx_hr_regras_subsidio_alimentacao_organization_id', 'a'),
  ('tipo hr_regras_subsidio_alimentacao', 'type hr_regras_subsidio_alimentacao[]', 'i');

-- Funcoes (todos os esquemas) cujo corpo cita os nomes: antes e depois.
CREATE TEMP TABLE tmp_lc_fn_cita (fn text NOT NULL, quando text NOT NULL CHECK (quando IN ('antes', 'depois'))) ON COMMIT DROP;
INSERT INTO tmp_lc_fn_cita (fn, quando) VALUES
  ('hr_retribuicao_campos_da_versao(pessoas_retribuicoes)', 'antes'),
  ('hr_retribuicao_refazer_desde(uuid,date,jsonb,text,text,uuid)', 'antes'),
  ('hr_retribuicoes_escrita_so_por_rpc()', 'antes'),
  ('rpc_hr_retribuicao_definir_pessoal(uuid,date,text,smallint,text)', 'antes'),
  ('rpc_hr_retribuicao_definir_pessoal(uuid,date,numeric,text,smallint,text)', 'antes'),
  ('hr_vinculos_registar_alteracao()', 'antes'),
  ('hr_documento_variaveis(uuid,uuid,boolean)', 'antes'),
  ('hr_documento_variaveis_catalogo()', 'antes'),
  ('hr_processamento_resultado_erro(jsonb)', 'antes'),
  ('hr_admissao_pendencias(uuid)', 'antes'),
  ('hr_documento_variaveis(uuid,uuid,boolean)', 'depois'),
  ('hr_documento_variaveis_catalogo()', 'depois'),
  ('hr_processamento_resultado_erro(jsonb)', 'depois'),
  ('hr_admissao_pendencias(uuid)', 'depois');

-- ---- Guardas (so catalogo; os dados so se leem depois do LOCK) -------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_r     record;
  v_t     record;
  v_src   text;
  v_def   text;
  v_eol   text;
  v_anc   text;
BEGIN
  -- G0. Quem aplica passa a RLS (o arquivo e FORCE, sem politicas).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS nao escreveria o arquivo.', current_user::text;
  END IF;

  -- G1. As RPC antigas e as novas existem; cada nome tem exactamente 2 assinaturas.
  IF to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)') IS NULL
     OR to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)') IS NULL
     OR to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)') IS NULL
     OR to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'G1: as RPC antigas ou as novas nao existem com as assinaturas lidas.';
  END IF;
  SELECT string_agg(x.nome || '=' || x.n::text, ', ') INTO v_lista
    FROM (SELECT p.proname::text AS nome, count(*) AS n
            FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
           WHERE ns.nspname::text = 'public'
             AND p.proname::text IN ('rpc_hr_retribuicao_definir_pessoal', 'rpc_hr_horas_extra_config_guardar')
           GROUP BY p.proname) x
   WHERE x.n <> 2;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: numero de assinaturas inesperado: %.', v_lista;
  END IF;

  -- G2. md5 sem \r dos corpos vivos; corpo todo CRLF ou todo LF; cada ancora
  --     aparece exactamente uma vez no corpo bruto E em pg_get_functiondef,
  --     contada sobre o texto ja trocado pelas ancoras anteriores (a mesma
  --     forma em que o replace se faz); o resultado da o md5 calculado fora.
  FOR v_r IN SELECT * FROM tmp_lc_esperado ORDER BY fn LOOP
    IF to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'G2: % nao existe.', v_r.fn;
    END IF;
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF md5(replace(v_src, chr(13), '')) IS DISTINCT FROM v_r.md5_sem_cr THEN
      RAISE EXCEPTION 'G2: o corpo de % no remoto (md5 sem CR %) nao e o lido (%). Reler a versao mais recente antes de aplicar.',
        v_r.fn, md5(replace(v_src, chr(13), '')), v_r.md5_sem_cr;
    END IF;
  END LOOP;
  FOR v_r IN SELECT DISTINCT t.fn FROM tmp_lc_troca t ORDER BY t.fn LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    v_def := pg_get_functiondef(to_regprocedure(v_r.fn)::oid);
    v_n := length(v_src) - length(replace(v_src, chr(10), ''));
    IF (length(v_src) - length(replace(v_src, chr(13) || chr(10), ''))) / 2 = v_n
       AND v_n = length(v_src) - length(replace(v_src, chr(13), '')) THEN
      v_eol := chr(13) || chr(10);
    ELSIF position(chr(13) IN v_src) = 0 THEN
      v_eol := chr(10);
    ELSE
      RAISE EXCEPTION 'G2: o corpo de % mistura CRLF e LF; as ancoras de linha inteira nao sao fiaveis.', v_r.fn;
    END IF;
    FOR v_t IN SELECT * FROM tmp_lc_troca t WHERE t.fn = v_r.fn ORDER BY t.ordem LOOP
      v_anc := v_eol || array_to_string(v_t.antes, v_eol) || v_eol;
      IF (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1
         OR (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc) <> 1 THEN
        RAISE EXCEPTION 'G2: a troca % de % nao aparece exactamente uma vez (corpo ou definicao). Reler o corpo vivo.',
          v_t.ordem, v_r.fn;
      END IF;
      v_src := replace(v_src, v_anc, CASE WHEN cardinality(v_t.depois) = 0 THEN v_eol
                                          ELSE v_eol || array_to_string(v_t.depois, v_eol) || v_eol END);
      v_def := replace(v_def, v_anc, CASE WHEN cardinality(v_t.depois) = 0 THEN v_eol
                                          ELSE v_eol || array_to_string(v_t.depois, v_eol) || v_eol END);
    END LOOP;
    IF md5(replace(v_src, chr(13), '')) IS DISTINCT FROM (SELECT m.md5_sem_cr FROM tmp_lc_md5_novo m WHERE m.fn = v_r.fn) THEN
      RAISE EXCEPTION 'G2: o corpo trocado de % nao da o md5 calculado fora da base.', v_r.fn;
    END IF;
  END LOOP;

  -- G3. Dependentes das 2 colunas, da tabela e do tipo-linha: exactamente os
  --     esperados, comparados por NOME. As RPC antigas nao tem dependentes.
  CREATE TEMP TABLE tmp_lc_dep_vivo ON COMMIT DROP AS
  SELECT 'col pessoas_retribuicoes.subsidio_alimentacao'::text AS alvo,
         pg_describe_object(d.classid, d.objid, d.objsubid)::text AS obj, d.deptype::text AS dt
    FROM pg_depend d
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
   WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = 'public.pessoas_retribuicoes'::regclass
     AND a.attname::text = 'subsidio_alimentacao'
  UNION
  SELECT 'col pessoas_vinculos.horas_anuais_maximas', pg_describe_object(d.classid, d.objid, d.objsubid)::text, d.deptype::text
    FROM pg_depend d
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
   WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = 'public.pessoas_vinculos'::regclass
     AND a.attname::text = 'horas_anuais_maximas'
  UNION
  SELECT 'tabela hr_regras_subsidio_alimentacao',
         regexp_replace(pg_describe_object(d.classid, d.objid, d.objsubid)::text, 'pg_toast_[0-9]+', 'pg_toast_N'), d.deptype::text
    FROM pg_depend d
   WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = 'public.hr_regras_subsidio_alimentacao'::regclass
  UNION
  SELECT 'tipo hr_regras_subsidio_alimentacao', pg_describe_object(d.classid, d.objid, d.objsubid)::text, d.deptype::text
    FROM pg_depend d JOIN pg_type ty ON ty.oid = d.refobjid
   WHERE d.refclassid = 'pg_type'::regclass AND ty.typrelid = 'public.hr_regras_subsidio_alimentacao'::regclass
  UNION
  SELECT 'rpc antiga', pg_describe_object(d.classid, d.objid, d.objsubid)::text, d.deptype::text
    FROM pg_depend d
   WHERE d.refclassid = 'pg_proc'::regclass
     AND d.refobjid IN (to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)')::oid,
                        to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)')::oid);
  SELECT string_agg(x.s, '; ') INTO v_lista
    FROM ((SELECT 'a mais: ' || v.alvo || ' <- ' || v.obj || ' (' || v.dt || ')' AS s
             FROM (SELECT alvo, obj, dt FROM tmp_lc_dep_vivo EXCEPT SELECT alvo, obj, dt FROM tmp_lc_dep_esperado) v)
          UNION ALL
          (SELECT 'em falta: ' || e.alvo || ' <- ' || e.obj || ' (' || e.dt || ')'
             FROM (SELECT alvo, obj, dt FROM tmp_lc_dep_esperado EXCEPT SELECT alvo, obj, dt FROM tmp_lc_dep_vivo) e)) x;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'limpeza_contrair_dependente_inesperado: G3, dependentes diferentes do desenho: %', v_lista
      USING ERRCODE = '2BP01';
  END IF;

  -- G4. Funcoes (todos os esquemas nao-sistema) cujo corpo cita os nomes:
  --     exactamente as da lista 'antes'; nenhum corpo atomico os cita.
  SELECT string_agg(x.s, '; ') INTO v_lista
    FROM ((SELECT 'a mais: ' || a.f AS s
             FROM (SELECT p.oid::regprocedure::text AS f
                     FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text NOT IN ('pg_catalog', 'information_schema')
                      AND (p.prosrc ~ 'subsidio_alimentacao($|[^_a-z])|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia'
                           OR coalesce(pg_get_function_sqlbody(p.oid), '') ~ 'subsidio_alimentacao|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia')
                   EXCEPT
                   SELECT c.fn FROM tmp_lc_fn_cita c WHERE c.quando = 'antes') a)
          UNION ALL
          (SELECT 'em falta: ' || b.f
             FROM (SELECT c.fn AS f FROM tmp_lc_fn_cita c WHERE c.quando = 'antes'
                   EXCEPT
                   SELECT p.oid::regprocedure::text
                     FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text NOT IN ('pg_catalog', 'information_schema')
                      AND p.prosrc ~ 'subsidio_alimentacao($|[^_a-z])|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia') b)) x;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'limpeza_contrair_dependente_inesperado: G4, funcoes que citam os nomes diferentes do desenho: %', v_lista
      USING ERRCODE = '2BP01';
  END IF;

  -- G5. Nenhum cron cita os nomes ou as RPC antigas; nenhuma FK entra na tabela
  --     antiga; nenhuma funcao usa o tipo-linha dela.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM cron.job j
                WHERE j.command ~ 'subsidio_alimentacao|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia|rpc_hr_retribuicao_definir_pessoal|rpc_hr_horas_extra_config_guardar'$q$
      INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'limpeza_contrair_dependente_inesperado: G5, % jobs de cron citam os nomes.', v_n
        USING ERRCODE = '2BP01';
    END IF;
  END IF;
  SELECT string_agg(c.conname::text || ' em ' || c.conrelid::regclass::text, ', ') INTO v_lista
    FROM pg_constraint c
   WHERE c.confrelid = 'public.hr_regras_subsidio_alimentacao'::regclass;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'limpeza_contrair_dependente_inesperado: G5, FK que entram na tabela antiga: %', v_lista
      USING ERRCODE = '2BP01';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p
   WHERE p.prorettype IN (SELECT ty.oid FROM pg_type ty WHERE ty.typrelid = 'public.hr_regras_subsidio_alimentacao'::regclass
                          UNION SELECT ty.typarray FROM pg_type ty WHERE ty.typrelid = 'public.hr_regras_subsidio_alimentacao'::regclass)
      OR EXISTS (SELECT 1 FROM unnest(p.proargtypes::oid[]) t(o)
                  WHERE t.o IN (SELECT ty.oid FROM pg_type ty WHERE ty.typrelid = 'public.hr_regras_subsidio_alimentacao'::regclass));
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'limpeza_contrair_dependente_inesperado: G5, funcoes com o tipo-linha da tabela antiga: %', v_lista
      USING ERRCODE = '2BP01';
  END IF;

  -- G6. O arquivo esta como a fase 1 o deixou: 8 colunas, a UNIQUE antiga, os
  --     2 gatilhos, RLS ligada e FORCADA, 0 politicas, ACL so do dono, sem fase.
  SELECT count(*) INTO v_n
    FROM pg_attribute a
   WHERE a.attrelid = 'public.hr_legado_arquivo'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'tabela', 'coluna', 'registo_id', 'pessoa_id', 'valor', 'arquivado_em');
  IF v_n <> 8
     OR EXISTS (SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = 'public.hr_legado_arquivo'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                   AND a.attname::text NOT IN ('id', 'organization_id', 'tabela', 'coluna', 'registo_id', 'pessoa_id', 'valor', 'arquivado_em')) THEN
    RAISE EXCEPTION 'G6: hr_legado_arquivo nao tem exactamente as 8 colunas da fase 1 (ja tem fase?).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = 'public.hr_legado_arquivo'::regclass AND c.conname::text = 'hr_legado_arquivo_unico'
                    AND c.contype::text = 'u' AND pg_get_constraintdef(c.oid)::text = 'UNIQUE (tabela, coluna, registo_id)') THEN
    RAISE EXCEPTION 'G6: a UNIQUE hr_legado_arquivo_unico (tabela, coluna, registo_id) nao esta como a fase 1 a deixou.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = 'public.hr_legado_arquivo'::regclass AND NOT t.tgisinternal
     AND t.tgname::text IN ('trg_hr_legado_arquivo_so_acrescentar', 'trg_hr_legado_arquivo_sem_truncate')
     AND t.tgenabled::text = 'O';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'G6: os 2 gatilhos do arquivo nao estao ligados (% de 2).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c
                  WHERE c.oid = 'public.hr_legado_arquivo'::regclass
                    AND c.relrowsecurity AND c.relforcerowsecurity
                    AND c.relacl::text = '{postgres=arwdDxtm/postgres}')
     OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = 'public.hr_legado_arquivo'::regclass) THEN
    RAISE EXCEPTION 'G6: o arquivo nao esta fechado como a fase 1 o deixou (RLS forcada, 0 politicas, ACL so postgres).';
  END IF;

  -- G7. Objectos de suporte usados abaixo.
  IF to_regprocedure('public.hr_horas_extra_pessoa_ctx(uuid, uuid, date)') IS NULL
     OR to_regclass('public.hr_horas_extra_config') IS NULL
     OR to_regclass('public.pessoas_horas_extra') IS NULL
     OR to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'G7: faltam objectos de suporte (hr_horas_extra_pessoa_ctx, hr_horas_extra_config, pessoas_horas_extra, pessoas).';
  END IF;
END;
$guardas$;

-- ---- LOCK, pela ordem de escrita do modulo (ver cabecalho) ---------------------
LOCK TABLE public.pessoas_vinculos IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.pessoas IN EXCLUSIVE MODE;
LOCK TABLE public.pessoas_retribuicoes, public.hr_regras_subsidio_alimentacao, public.hr_legado_arquivo
  IN ACCESS EXCLUSIVE MODE;

-- ---- Estado de antes (para o conferir; nada se mostra) ---------------------------
CREATE TEMP TABLE tmp_lc_fn_antes ON COMMIT DROP AS
SELECT f.fn, p.oid AS fn_oid, p.prosrc, p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce(p.proacl::text, '') AS proacl, p.proowner, p.provolatile::text AS provolatile,
       p.proparallel::text AS proparallel, p.prolang, p.pronargdefaults, p.prorettype, p.proretset,
       p.prokind::text AS prokind, coalesce(obj_description(p.oid, 'pg_proc'), '') AS comentario
  FROM (SELECT DISTINCT t.fn FROM tmp_lc_troca t
        UNION SELECT 'public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer)') f
  JOIN pg_proc p ON p.oid = to_regprocedure(f.fn)::oid;

CREATE TEMP TABLE tmp_lc_arq_antes ON COMMIT DROP AS
SELECT 'public.hr_legado_arquivo'::regclass::oid AS rel_oid,
       count(*) AS n,
       md5(coalesce(string_agg(a.id::text || '|' || a.organization_id::text || '|' || a.tabela || '|' || a.coluna || '|'
                               || a.registo_id::text || '|' || coalesce(a.pessoa_id::text, '') || '|' || a.valor::text || '|'
                               || a.arquivado_em::text, E'\n' ORDER BY a.id), '')) AS md5
  FROM public.hr_legado_arquivo a;

CREATE TEMP TABLE tmp_lc_origem ON COMMIT DROP AS
SELECT 'pessoas_retribuicoes'::text AS tabela, count(*) AS n, sum(r.subsidio_alimentacao) AS soma
  FROM public.pessoas_retribuicoes r WHERE r.subsidio_alimentacao IS NOT NULL
UNION ALL
SELECT 'pessoas_vinculos', count(*), sum(v.horas_anuais_maximas)
  FROM public.pessoas_vinculos v WHERE v.horas_anuais_maximas IS NOT NULL
UNION ALL
SELECT 'hr_regras_subsidio_alimentacao', count(*), sum(s.minutos_minimos_dia)
  FROM public.hr_regras_subsidio_alimentacao s;


-- ==============================================================================
-- B. O arquivo: coluna fase e instantaneo completo 'contrair'
-- ==============================================================================
-- DEFAULT constante: nao reescreve a tabela nem dispara o gatilho de UPDATE;
-- as linhas da fase 1 ficam 'expandir'. Depois tira-se o DEFAULT (o valor das
-- linhas existentes fica): quem acrescentar diz a fase.
ALTER TABLE public.hr_legado_arquivo ADD COLUMN fase text NOT NULL DEFAULT 'expandir';
ALTER TABLE public.hr_legado_arquivo ALTER COLUMN fase DROP DEFAULT;
ALTER TABLE public.hr_legado_arquivo
  ADD CONSTRAINT hr_legado_arquivo_fase_valida CHECK (fase IN ('expandir', 'contrair'));
ALTER TABLE public.hr_legado_arquivo DROP CONSTRAINT hr_legado_arquivo_unico;
ALTER TABLE public.hr_legado_arquivo
  ADD CONSTRAINT hr_legado_arquivo_unico_fase UNIQUE (tabela, coluna, registo_id, fase);

COMMENT ON TABLE public.hr_legado_arquivo IS
'Arquivo SO DE ACRESCENTO dos valores largados pela limpeza das regras salariais (20270111700000 expandir; 20270115100000 contrair): pessoas_retribuicoes.subsidio_alimentacao (com valido_de, valido_ate, deleted_at), pessoas_vinculos.horas_anuais_maximas (com data_inicio, data_fim, deleted_at) e hr_regras_subsidio_alimentacao (coluna *, a linha inteira). Uma linha por (tabela, coluna, registo_id, fase). A fase contrair e o instantaneo completo tirado no momento do DROP e SUBSTITUI POR INTEIRO a fase expandir (que ficou desactualizada); para repor, ler so fase = contrair. DADOS PESSOAIS: os valores salariais por pessoa ficam em duplicado (as duas fases), versoes apagadas incluidas; o prazo de guarda e o apagamento a pedido (RGPD, decisao 13 do utilizador, pendente) valem para as duas fases em conjunto, e pessoa_id e o unico indice util para um apagamento por pessoa. UPDATE, DELETE e TRUNCATE recusados a todos, postgres incluido, por gatilho (22000): um apagamento exige uma migration que trate o gatilho. Sem FK de proposito (sobrevive ao que arquiva). RLS forcada, sem politicas, sem privilegios: so o dono le.';

COMMENT ON COLUMN public.hr_legado_arquivo.fase IS
'expandir = arquivado em 20270111700000 (desactualizado); contrair = instantaneo completo de 20270115100000, tirado com as tabelas trancadas imediatamente antes do DROP. E o contrair que vale.';

INSERT INTO public.hr_legado_arquivo (organization_id, tabela, coluna, registo_id, pessoa_id, valor, fase)
SELECT r.organization_id, 'pessoas_retribuicoes', 'subsidio_alimentacao', r.id, r.pessoa_id,
       jsonb_build_object('subsidio_alimentacao', r.subsidio_alimentacao,
                          'valido_de', r.valido_de, 'valido_ate', r.valido_ate,
                          'deleted_at', r.deleted_at),
       'contrair'
  FROM public.pessoas_retribuicoes r
 WHERE r.subsidio_alimentacao IS NOT NULL;

INSERT INTO public.hr_legado_arquivo (organization_id, tabela, coluna, registo_id, pessoa_id, valor, fase)
SELECT v.organization_id, 'pessoas_vinculos', 'horas_anuais_maximas', v.id, v.pessoa_id,
       jsonb_build_object('horas_anuais_maximas', v.horas_anuais_maximas,
                          'data_inicio', v.data_inicio, 'data_fim', v.data_fim,
                          'deleted_at', v.deleted_at),
       'contrair'
  FROM public.pessoas_vinculos v
 WHERE v.horas_anuais_maximas IS NOT NULL;

INSERT INTO public.hr_legado_arquivo (organization_id, tabela, coluna, registo_id, pessoa_id, valor, fase)
SELECT s.organization_id, 'hr_regras_subsidio_alimentacao', '*', s.id, NULL, to_jsonb(s), 'contrair'
  FROM public.hr_regras_subsidio_alimentacao s;

-- ---- Guarda de igualdade do arquivo (aborta tudo se nao bater) ------------------
-- Compara a origem com o instantaneo por vias independentes da expressao que o
-- escreveu (valor a valor, com casts), nos dois sentidos, e a fase 1 com a
-- final. So mostra numeros.
DO $arquivo$
DECLARE
  v_n_o  bigint;
  v_n_a  bigint;
  v_s_o  numeric;
  v_s_a  numeric;
  v_n    bigint;
  v_orf  bigint;
BEGIN
  -- Retribuicoes: contagem e soma.
  SELECT o.n, o.soma INTO v_n_o, v_s_o FROM tmp_lc_origem o WHERE o.tabela = 'pessoas_retribuicoes';
  SELECT count(*), sum((a.valor ->> 'subsidio_alimentacao')::numeric) INTO v_n_a, v_s_a
    FROM public.hr_legado_arquivo a
   WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_retribuicoes' AND a.coluna = 'subsidio_alimentacao';
  IF v_n_o <> v_n_a OR v_s_o IS DISTINCT FROM v_s_a THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: retribuicoes, origem % linhas e instantaneo %, ou as somas nao batem.', v_n_o, v_n_a
      USING ERRCODE = '23514';
  END IF;
  -- Linha a linha, origem -> instantaneo, valor a valor e com as 4 chaves exactas.
  SELECT count(*) INTO v_n
    FROM public.pessoas_retribuicoes r
   WHERE r.subsidio_alimentacao IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_legado_arquivo a
        WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_retribuicoes' AND a.coluna = 'subsidio_alimentacao'
          AND a.registo_id = r.id
          AND a.organization_id = r.organization_id
          AND a.pessoa_id IS NOT DISTINCT FROM r.pessoa_id
          AND (a.valor ->> 'subsidio_alimentacao')::numeric = r.subsidio_alimentacao
          AND (a.valor ->> 'valido_de')::date IS NOT DISTINCT FROM r.valido_de
          AND (a.valor ->> 'valido_ate')::date IS NOT DISTINCT FROM r.valido_ate
          AND (a.valor ->> 'deleted_at')::timestamptz IS NOT DISTINCT FROM r.deleted_at
          AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(a.valor) k)
              = ARRAY['deleted_at', 'subsidio_alimentacao', 'valido_ate', 'valido_de']);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: % retribuicoes com subsidio sem copia igual no instantaneo.', v_n
      USING ERRCODE = '23514';
  END IF;
  -- Instantaneo -> origem: cada linha tem origem com valor nao nulo igual.
  SELECT count(*) INTO v_n
    FROM public.hr_legado_arquivo a
   WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_retribuicoes'
     AND NOT EXISTS (SELECT 1 FROM public.pessoas_retribuicoes r
                      WHERE r.id = a.registo_id AND r.subsidio_alimentacao IS NOT NULL
                        AND r.subsidio_alimentacao = (a.valor ->> 'subsidio_alimentacao')::numeric);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: % linhas do instantaneo de retribuicoes sem origem igual.', v_n
      USING ERRCODE = '23514';
  END IF;
  -- O mesmo por EXCEPT, nos dois sentidos, sobre o tuplo inteiro.
  SELECT count(*) INTO v_n FROM (
    (SELECT r.id, r.organization_id, r.pessoa_id,
            jsonb_build_object('subsidio_alimentacao', r.subsidio_alimentacao, 'valido_de', r.valido_de,
                               'valido_ate', r.valido_ate, 'deleted_at', r.deleted_at)
       FROM public.pessoas_retribuicoes r WHERE r.subsidio_alimentacao IS NOT NULL
     EXCEPT
     SELECT a.registo_id, a.organization_id, a.pessoa_id, a.valor
       FROM public.hr_legado_arquivo a WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_retribuicoes')
    UNION ALL
    (SELECT a.registo_id, a.organization_id, a.pessoa_id, a.valor
       FROM public.hr_legado_arquivo a WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_retribuicoes'
     EXCEPT
     SELECT r.id, r.organization_id, r.pessoa_id,
            jsonb_build_object('subsidio_alimentacao', r.subsidio_alimentacao, 'valido_de', r.valido_de,
                               'valido_ate', r.valido_ate, 'deleted_at', r.deleted_at)
       FROM public.pessoas_retribuicoes r WHERE r.subsidio_alimentacao IS NOT NULL)) x;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: retribuicoes, % tuplos diferentes entre origem e instantaneo.', v_n
      USING ERRCODE = '23514';
  END IF;

  -- Vinculos: contagem, soma, linha a linha nos dois sentidos.
  SELECT o.n, o.soma INTO v_n_o, v_s_o FROM tmp_lc_origem o WHERE o.tabela = 'pessoas_vinculos';
  SELECT count(*), sum((a.valor ->> 'horas_anuais_maximas')::numeric) INTO v_n_a, v_s_a
    FROM public.hr_legado_arquivo a
   WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_vinculos' AND a.coluna = 'horas_anuais_maximas';
  IF v_n_o <> v_n_a OR v_s_o IS DISTINCT FROM v_s_a THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: vinculos, origem % linhas e instantaneo %, ou as somas nao batem.', v_n_o, v_n_a
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.pessoas_vinculos v
   WHERE v.horas_anuais_maximas IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_legado_arquivo a
        WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_vinculos' AND a.coluna = 'horas_anuais_maximas'
          AND a.registo_id = v.id
          AND a.organization_id = v.organization_id
          AND a.pessoa_id IS NOT DISTINCT FROM v.pessoa_id
          AND (a.valor ->> 'horas_anuais_maximas')::numeric = v.horas_anuais_maximas
          AND (a.valor ->> 'data_inicio')::date IS NOT DISTINCT FROM v.data_inicio
          AND (a.valor ->> 'data_fim')::date IS NOT DISTINCT FROM v.data_fim
          AND (a.valor ->> 'deleted_at')::timestamptz IS NOT DISTINCT FROM v.deleted_at
          AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(a.valor) k)
              = ARRAY['data_fim', 'data_inicio', 'deleted_at', 'horas_anuais_maximas']);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: % vinculos com horas anuais sem copia igual no instantaneo.', v_n
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.hr_legado_arquivo a
   WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_vinculos'
     AND NOT EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                      WHERE v.id = a.registo_id AND v.horas_anuais_maximas IS NOT NULL
                        AND v.horas_anuais_maximas = (a.valor ->> 'horas_anuais_maximas')::numeric);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: % linhas do instantaneo de vinculos sem origem igual.', v_n
      USING ERRCODE = '23514';
  END IF;

  -- Regra antiga: contagem, linha inteira exacta, nos dois sentidos.
  SELECT o.n INTO v_n_o FROM tmp_lc_origem o WHERE o.tabela = 'hr_regras_subsidio_alimentacao';
  SELECT count(*) INTO v_n_a FROM public.hr_legado_arquivo a
   WHERE a.fase = 'contrair' AND a.tabela = 'hr_regras_subsidio_alimentacao' AND a.coluna = '*';
  SELECT count(*) INTO v_n
    FROM public.hr_regras_subsidio_alimentacao s
   WHERE NOT EXISTS (SELECT 1 FROM public.hr_legado_arquivo a
                      WHERE a.fase = 'contrair' AND a.tabela = 'hr_regras_subsidio_alimentacao' AND a.coluna = '*'
                        AND a.registo_id = s.id AND a.organization_id = s.organization_id AND a.pessoa_id IS NULL
                        AND a.valor = to_jsonb(s)
                        AND (a.valor ->> 'minutos_minimos_dia')::integer = s.minutos_minimos_dia);
  SELECT count(*) INTO v_orf
    FROM public.hr_legado_arquivo a
   WHERE a.fase = 'contrair' AND a.tabela = 'hr_regras_subsidio_alimentacao'
     AND NOT EXISTS (SELECT 1 FROM public.hr_regras_subsidio_alimentacao s WHERE s.id = a.registo_id AND a.valor = to_jsonb(s));
  IF v_n_o <> v_n_a OR v_n <> 0 OR v_orf <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: regra antiga, origem % e instantaneo %; % sem copia exacta; % sem origem.',
      v_n_o, v_n_a, v_n, v_orf
      USING ERRCODE = '23514';
  END IF;

  -- Fase 1 contra fase final: cada linha 'expandir' cuja origem ainda existe
  -- tem de ter no instantaneo o MESMO valor (so datas e deleted_at podem
  -- diferir). Origem que existe mas ficou sem valor tambem aborta.
  SELECT count(*) INTO v_n
    FROM public.hr_legado_arquivo e
   WHERE e.fase = 'expandir' AND e.tabela = 'pessoas_retribuicoes'
     AND EXISTS (SELECT 1 FROM public.pessoas_retribuicoes r WHERE r.id = e.registo_id)
     AND NOT EXISTS (SELECT 1 FROM public.hr_legado_arquivo c
                      WHERE c.fase = 'contrair' AND c.tabela = e.tabela AND c.coluna = e.coluna AND c.registo_id = e.registo_id
                        AND (c.valor ->> 'subsidio_alimentacao')::numeric = (e.valor ->> 'subsidio_alimentacao')::numeric);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: % retribuicoes arquivadas na fase 1 tem hoje outro valor ou nenhum. Reler antes de largar.', v_n
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.hr_legado_arquivo e
   WHERE e.fase = 'expandir' AND e.tabela = 'pessoas_vinculos'
     AND EXISTS (SELECT 1 FROM public.pessoas_vinculos v WHERE v.id = e.registo_id)
     AND NOT EXISTS (SELECT 1 FROM public.hr_legado_arquivo c
                      WHERE c.fase = 'contrair' AND c.tabela = e.tabela AND c.coluna = e.coluna AND c.registo_id = e.registo_id
                        AND (c.valor ->> 'horas_anuais_maximas')::numeric = (e.valor ->> 'horas_anuais_maximas')::numeric);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: % vinculos arquivados na fase 1 tem hoje outro valor ou nenhum. Reler antes de largar.', v_n
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.hr_legado_arquivo e
   WHERE e.fase = 'expandir' AND e.tabela = 'hr_regras_subsidio_alimentacao'
     AND EXISTS (SELECT 1 FROM public.hr_regras_subsidio_alimentacao s WHERE s.id = e.registo_id)
     AND NOT EXISTS (SELECT 1 FROM public.hr_legado_arquivo c
                      WHERE c.fase = 'contrair' AND c.tabela = e.tabela AND c.coluna = e.coluna AND c.registo_id = e.registo_id
                        AND (c.valor -> 'minutos_minimos_dia') = (e.valor -> 'minutos_minimos_dia'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpeza_contrair_arquivo_incompleto: a regra antiga arquivada na fase 1 tem hoje outro valor (% linhas). Reler antes de largar.', v_n
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO v_orf
    FROM public.hr_legado_arquivo e
   WHERE e.fase = 'expandir'
     AND NOT EXISTS (SELECT 1 FROM public.hr_legado_arquivo c
                      WHERE c.fase = 'contrair' AND c.tabela = e.tabela AND c.coluna = e.coluna AND c.registo_id = e.registo_id);

  RAISE NOTICE 'arquivo contrair: retribuicoes %, vinculos %, regra antiga %; linhas da fase 1 sem par no instantaneo (origem apagada fisicamente): %.',
    (SELECT count(*) FROM public.hr_legado_arquivo a WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_retribuicoes'),
    (SELECT count(*) FROM public.hr_legado_arquivo a WHERE a.fase = 'contrair' AND a.tabela = 'pessoas_vinculos'),
    v_n_a, v_orf;
END;
$arquivo$;


-- ==============================================================================
-- A. As cinco funcoes deixam de citar as colunas
-- ==============================================================================
-- O corpo novo vai ao EXECUTE numa variavel (nunca por format(): os corpos tem
-- % nas mensagens). CREATE OR REPLACE mantem dono, ACL e comentario; a
-- definicao traz SECURITY DEFINER, SET search_path e a volatilidade.
DO $funcoes$
DECLARE
  v_r   record;
  v_t   record;
  v_src text;
  v_def text;
  v_eol text;
  v_anc text;
  v_nov text;
BEGIN
  FOR v_r IN SELECT DISTINCT t.fn FROM tmp_lc_troca t ORDER BY t.fn LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    v_def := pg_get_functiondef(to_regprocedure(v_r.fn)::oid);
    v_eol := CASE WHEN position(chr(13) IN v_src) > 0 THEN chr(13) || chr(10) ELSE chr(10) END;
    FOR v_t IN SELECT * FROM tmp_lc_troca t WHERE t.fn = v_r.fn ORDER BY t.ordem LOOP
      v_anc := v_eol || array_to_string(v_t.antes, v_eol) || v_eol;
      v_nov := CASE WHEN cardinality(v_t.depois) = 0 THEN v_eol
                    ELSE v_eol || array_to_string(v_t.depois, v_eol) || v_eol END;
      IF (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc) <> 1
         OR (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1 THEN
        RAISE EXCEPTION 'A: a troca % de % deixou de aparecer exactamente uma vez.', v_t.ordem, v_r.fn;
      END IF;
      v_def := replace(v_def, v_anc, v_nov);
      v_src := replace(v_src, v_anc, v_nov);
    END LOOP;
    EXECUTE v_def;
    IF (SELECT p.prosrc FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid) IS DISTINCT FROM v_src THEN
      RAISE EXCEPTION 'A: o corpo gravado de % nao e o corpo trocado.', v_r.fn;
    END IF;
  END LOOP;
END;
$funcoes$;


-- ==============================================================================
-- C. Comentarios que citavam as colunas largadas
-- ==============================================================================
COMMENT ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text) IS
'Define o modo do subsidio de alimentacao e os duodecimos de uma pessoa a partir de p_desde (versao nova de pessoas_retribuicoes, origem pessoa, com o salario do cargo nessa data). O valor do subsidio de alimentacao nao e da pessoa: vem da regra salarial da organizacao. Gates: hr.pessoas.retribuicao.edit (pessoa inexistente = sem permissao, 42501); data passada que reescreve versao em vigor exige hr.pessoas.retribuicao.corrigir; datas de 10 anos para tras a 5 para a frente (HRC04); motivo ate 500 (HRC03); modo NULL, dinheiro ou cartao e duodecimos NULL, 0, 50 ou 100 (HRC03); cargo na data (HRC11). Devolve jsonb: versoes_criadas, desde, salario_base e periodicidade (estes dois so com hr.pessoas.retribuicao.view). search_path vazio. Desde 20270111700000; unica assinatura desde 20270115100000.';

-- Troca de UMA frase em cada comentario vivo (guarda: aparece uma so vez).
CREATE TEMP TABLE tmp_lc_comentario (
  alvo_sql text NOT NULL, classe regclass NOT NULL, objoid oid NOT NULL, subid integer NOT NULL,
  antes text NOT NULL, depois text NOT NULL
) ON COMMIT DROP;
INSERT INTO tmp_lc_comentario (alvo_sql, classe, objoid, subid, antes, depois)
SELECT 'COLUMN public.pessoas_vinculos.horas_semanais_maximas', 'pg_class'::regclass, 'public.pessoas_vinculos'::regclass::oid,
       (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.pessoas_vinculos'::regclass AND a.attname::text = 'horas_semanais_maximas'),
       ' NAO tem relacao imposta com horas_anuais_maximas: 52 semanas de maximo semanal dao mais do que o maximo anual em qualquer contrato com ferias, e um CHECK a cruza-los rejeitaria contratos validos.',
       ' O limite anual vem da regra salarial da organizacao desde 20270109700000 (o maximo anual por contrato foi largado em 20270115100000).'
UNION ALL
SELECT 'TABLE public.hr_horas_extra_config', 'pg_class'::regclass, 'public.hr_horas_extra_config'::regclass::oid, 0,
       'por ano (ano_min, omissao quando o vinculo em vigor nao define horas_anuais_maximas)',
       'por ano (ano_min: ja nao conta para o limite anual, que vem da regra salarial da organizacao desde 20270109700000; a coluna fica ate uma migration propria)'
UNION ALL
SELECT 'COLUMN public.pessoas_horas_extra.acima_limite', 'pg_class'::regclass, 'public.pessoas_horas_extra'::regclass::oid,
       (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.pessoas_horas_extra'::regclass AND a.attname::text = 'acima_limite'),
       'ou do ano (horas_anuais_maximas x 60 do vinculo em vigor, senao config.ano_min)',
       'ou do ano (o limite anual da regra salarial em vigor, ver hr_horas_extra_pessoa_ctx, desde 20270109700000)'
UNION ALL
SELECT 'FUNCTION public.hr_horas_extra_pessoa_ctx(uuid, uuid, date)', 'pg_proc'::regclass,
       to_regprocedure('public.hr_horas_extra_pessoa_ctx(uuid, uuid, date)')::oid, 0,
       'Ja nao le pessoas_vinculos.horas_anuais_maximas nem hr_horas_extra_config.ano_min.',
       'Nao le nenhum limite anual por contrato nem hr_horas_extra_config.ano_min.';

DO $comentarios$
DECLARE
  v_r   record;
  v_txt text;
BEGIN
  FOR v_r IN SELECT * FROM tmp_lc_comentario ORDER BY alvo_sql LOOP
    SELECT d.description INTO v_txt FROM pg_description d
     WHERE d.classoid = v_r.classe AND d.objoid = v_r.objoid AND d.objsubid = v_r.subid;
    IF v_txt IS NULL OR (length(v_txt) - length(replace(v_txt, v_r.antes, ''))) / length(v_r.antes) <> 1 THEN
      RAISE EXCEPTION 'limpeza_contrair_dependente_inesperado: o comentario de % mudou (a frase a trocar nao aparece uma so vez).', v_r.alvo_sql
        USING ERRCODE = '2BP01';
    END IF;
    EXECUTE 'COMMENT ON ' || v_r.alvo_sql || ' IS ' || quote_literal(replace(v_txt, v_r.antes, v_r.depois));
  END LOOP;
END;
$comentarios$;


-- ==============================================================================
-- DROPs (sem CASCADE: um dependente que a guarda nao viu faz cair tudo)
-- ==============================================================================
DROP FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text);
DROP FUNCTION public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer);
ALTER TABLE public.pessoas_retribuicoes DROP COLUMN subsidio_alimentacao;
ALTER TABLE public.pessoas_vinculos DROP COLUMN horas_anuais_maximas;
DROP TABLE public.hr_regras_subsidio_alimentacao;


-- ==============================================================================
-- Conferir final, pelo catalogo (aborta se falhar)
-- ==============================================================================
DO $conferir$
DECLARE
  v_lista text;
  v_n     bigint;
  v_r     record;
  v_src   text;
  v_tir   bigint;
  v_pos   bigint;
BEGIN
  -- F1. Colunas, tabela e CHECKs ja nao existem.
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE NOT a.attisdropped
                AND ((a.attrelid = 'public.pessoas_retribuicoes'::regclass AND a.attname::text = 'subsidio_alimentacao')
                  OR (a.attrelid = 'public.pessoas_vinculos'::regclass AND a.attname::text = 'horas_anuais_maximas')))
     OR to_regclass('public.hr_regras_subsidio_alimentacao') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conname::text IN ('pessoas_retribuicoes_subsidio_nao_negativo', 'pessoas_vinculos_horas_anuais_maximas_validas')) THEN
    RAISE EXCEPTION 'F1: sobrou uma coluna, a tabela antiga ou um CHECK.';
  END IF;

  -- F2. Assinaturas antigas largadas; cada nome com 1 assinatura.
  IF to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'F2: uma RPC antiga ainda existe.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.proname::text IN ('rpc_hr_retribuicao_definir_pessoal', 'rpc_hr_horas_extra_config_guardar');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'F2: esperava 1 assinatura de cada RPC (2 no total), ha %.', v_n;
  END IF;

  -- F3. As 5 funcoes: md5 (bruto e sem CR) igual ao calculado fora da base;
  --     diff de linhas = so as trocas (tiradas / postas); oid, atributos,
  --     dono, ACL e comentario iguais (o da RPC nova e o texto novo).
  FOR v_r IN SELECT m.fn, m.md5_cru, m.md5_sem_cr, m.tiradas, m.postas, a.prosrc AS src_antes, a.fn_oid,
                    a.prosecdef, a.proconfig, a.proacl, a.proowner, a.provolatile, a.proparallel, a.prolang,
                    a.pronargdefaults, a.prorettype, a.proretset, a.prokind, a.comentario
               FROM tmp_lc_md5_novo m JOIN tmp_lc_fn_antes a ON a.fn = m.fn ORDER BY m.fn LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF md5(v_src) IS DISTINCT FROM v_r.md5_cru OR md5(replace(v_src, chr(13), '')) IS DISTINCT FROM v_r.md5_sem_cr THEN
      RAISE EXCEPTION 'F3: o corpo de % nao tem o md5 esperado (bruto %, sem CR %).', v_r.fn, md5(v_src), md5(replace(v_src, chr(13), ''));
    END IF;
    SELECT count(*) INTO v_tir FROM (
      SELECT l FROM regexp_split_to_table(replace(v_r.src_antes, chr(13), ''), E'\n') l
      EXCEPT ALL
      SELECT l FROM regexp_split_to_table(replace(v_src, chr(13), ''), E'\n') l) x;
    SELECT count(*) INTO v_pos FROM (
      SELECT l FROM regexp_split_to_table(replace(v_src, chr(13), ''), E'\n') l
      EXCEPT ALL
      SELECT l FROM regexp_split_to_table(replace(v_r.src_antes, chr(13), ''), E'\n') l) x;
    IF v_tir <> v_r.tiradas OR v_pos <> v_r.postas THEN
      RAISE EXCEPTION 'F3: o diff de % tem % linhas tiradas e % postas (esperado % e %).', v_r.fn, v_tir, v_pos, v_r.tiradas, v_r.postas;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = v_r.fn_oid
                      AND p.prosecdef = v_r.prosecdef
                      AND coalesce(array_to_string(p.proconfig, ','), '') = v_r.proconfig
                      AND coalesce(p.proacl::text, '') = v_r.proacl
                      AND p.proowner = v_r.proowner
                      AND p.provolatile::text = v_r.provolatile
                      AND p.proparallel::text = v_r.proparallel
                      AND p.prolang = v_r.prolang
                      AND p.pronargdefaults = v_r.pronargdefaults
                      AND p.prorettype = v_r.prorettype
                      AND p.proretset = v_r.proretset
                      AND p.prokind::text = v_r.prokind
                      AND (coalesce(obj_description(p.oid, 'pg_proc'), '') = v_r.comentario
                           OR v_r.fn = 'public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)')) THEN
      RAISE EXCEPTION 'F3: % mudou de oid, atributos, dono, ACL ou comentario.', v_r.fn;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM tmp_lc_md5_novo m JOIN tmp_lc_fn_antes a ON a.fn = m.fn) <> 5 THEN
    RAISE EXCEPTION 'F3: esperava conferir 5 funcoes.';
  END IF;
  -- A RPC de horas extra que fica (4 argumentos) nao mudou.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN tmp_lc_fn_antes a ON a.fn_oid = p.oid
                  WHERE a.fn = 'public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer)'
                    AND p.prosrc = a.prosrc AND coalesce(p.proacl::text, '') = a.proacl AND p.prosecdef = a.prosecdef) THEN
    RAISE EXCEPTION 'F3: rpc_hr_horas_extra_config_guardar (4 argumentos) mudou.';
  END IF;

  -- F4. Nenhuma funcao, de nenhum esquema, cita as colunas: so as 4 que
  --     mencionam o nome sem ser a coluna (lista 'depois'); nenhum corpo atomico.
  SELECT string_agg(x.s, '; ') INTO v_lista
    FROM ((SELECT 'a mais: ' || a.f AS s
             FROM (SELECT p.oid::regprocedure::text AS f
                     FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text NOT IN ('pg_catalog', 'information_schema')
                      AND (p.prosrc ~ 'subsidio_alimentacao($|[^_a-z])|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia'
                           OR coalesce(pg_get_function_sqlbody(p.oid), '') ~ 'subsidio_alimentacao|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia')
                   EXCEPT
                   SELECT c.fn FROM tmp_lc_fn_cita c WHERE c.quando = 'depois') a)
          UNION ALL
          (SELECT 'em falta: ' || b.f
             FROM (SELECT c.fn AS f FROM tmp_lc_fn_cita c WHERE c.quando = 'depois'
                   EXCEPT
                   SELECT p.oid::regprocedure::text
                     FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text NOT IN ('pg_catalog', 'information_schema')
                      AND p.prosrc ~ 'subsidio_alimentacao($|[^_a-z])') b)) x;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'F4: funcoes que ainda citam os nomes diferentes do esperado: %', v_lista;
  END IF;

  -- F5. O arquivo: instantaneo com as contagens da origem; a fase 1 intacta.
  SELECT string_agg(o.tabela || ' origem=' || o.n::text || ' arquivo=' || coalesce(a.n, 0)::text, ', ') INTO v_lista
    FROM tmp_lc_origem o
    LEFT JOIN (SELECT x.tabela, count(*) AS n FROM public.hr_legado_arquivo x WHERE x.fase = 'contrair' GROUP BY x.tabela) a
           ON a.tabela = o.tabela
   WHERE o.n <> coalesce(a.n, 0);
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'F5: o instantaneo nao tem as contagens da origem: %', v_lista;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tmp_lc_arq_antes b,
                        (SELECT count(*) AS n,
                                md5(coalesce(string_agg(a.id::text || '|' || a.organization_id::text || '|' || a.tabela || '|' || a.coluna || '|'
                                                        || a.registo_id::text || '|' || coalesce(a.pessoa_id::text, '') || '|' || a.valor::text || '|'
                                                        || a.arquivado_em::text, E'\n' ORDER BY a.id), '')) AS md5
                           FROM public.hr_legado_arquivo a WHERE a.fase = 'expandir') d
                  WHERE d.n = b.n AND d.md5 = b.md5) THEN
    RAISE EXCEPTION 'F5: as linhas da fase 1 (expandir) mudaram.';
  END IF;

  -- F6. O arquivo continua fechado e e a MESMA tabela (nao foi recriada; uma
  --     tabela nova herdaria o pg_default_acl do postgres, que da
  --     anon/authenticated arwdDxtm).
  IF NOT EXISTS (SELECT 1 FROM pg_class c, tmp_lc_arq_antes b
                  WHERE c.oid = 'public.hr_legado_arquivo'::regclass AND c.oid = b.rel_oid
                    AND c.relrowsecurity AND c.relforcerowsecurity
                    AND c.relacl::text = '{postgres=arwdDxtm/postgres}') THEN
    RAISE EXCEPTION 'F6: o arquivo deixou de estar fechado (relacl, RLS forcada) ou foi recriado.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = 'public.hr_legado_arquivo'::regclass)
     OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.hr_legado_arquivo'::regclass
                   AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL)
     OR (SELECT count(*) FROM pg_trigger t
          WHERE t.tgrelid = 'public.hr_legado_arquivo'::regclass AND NOT t.tgisinternal AND t.tgenabled::text = 'O'
            AND t.tgname::text IN ('trg_hr_legado_arquivo_so_acrescentar', 'trg_hr_legado_arquivo_sem_truncate')) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
                     WHERE c.conrelid = 'public.hr_legado_arquivo'::regclass AND c.conname::text = 'hr_legado_arquivo_unico_fase'
                       AND pg_get_constraintdef(c.oid)::text = 'UNIQUE (tabela, coluna, registo_id, fase)')
     OR EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid = 'public.hr_legado_arquivo'::regclass AND c.conname::text = 'hr_legado_arquivo_unico') THEN
    RAISE EXCEPTION 'F6: o arquivo tem politicas, ACL por coluna, gatilhos em falta ou a unicidade errada.';
  END IF;

  -- F7. Comentarios: so o do arquivo cita o que se largou; o nome
  --     subsidio_alimentacao (sem ser a coluna) so fica em 4 sitios conhecidos.
  SELECT string_agg(pg_describe_object(d.classoid, d.objoid, d.objsubid)::text, '; ') INTO v_lista
    FROM pg_description d
   WHERE d.description ~ 'horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia|p_subsidio($|[^_a-z])'
     AND NOT (d.classoid = 'pg_class'::regclass AND d.objoid = 'public.hr_legado_arquivo'::regclass AND d.objsubid = 0);
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'F7: comentarios que ainda citam o que se largou: %', v_lista;
  END IF;
  SELECT string_agg(x.o, '; ') INTO v_lista
    FROM (SELECT pg_describe_object(d.classoid, d.objoid, d.objsubid)::text AS o
            FROM pg_description d
           WHERE d.description ~ 'subsidio_alimentacao($|[^_a-z])'
          EXCEPT
          SELECT unnest(ARRAY['table hr_legado_arquivo',
                              'function hr_admissao_campos_obrigatorios()',
                              'function hr_admissao_campo_permissao()',
                              'column totais of table hr_processamento_resultados'])) x;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'F7: comentarios que citam subsidio_alimentacao fora dos 4 conhecidos: %', v_lista;
  END IF;

  -- F8. As vistas que leem pessoas_retribuicoes ou pessoas_vinculos ainda
  --     respondem (0 linhas, sem erro). Hoje nao ha nenhuma; fica a regra.
  FOR v_r IN SELECT DISTINCT c.oid::regclass::text AS vista
               FROM pg_class c
               JOIN pg_rewrite rw ON rw.ev_class = c.oid
               JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
              WHERE c.relkind IN ('v', 'm')
                AND d.refobjid IN ('public.pessoas_retribuicoes'::regclass, 'public.pessoas_vinculos'::regclass) LOOP
    EXECUTE 'SELECT count(*) FROM (SELECT 1 FROM ' || v_r.vista || ' LIMIT 0) x' INTO v_n;
  END LOOP;

  -- F9. As permissoes do subsidio ficam.
  IF (SELECT count(*) FROM public.anew_permissions ap
       WHERE ap.code IN ('hr.vencimento.subsidio.view', 'hr.vencimento.subsidio.gerir')) <> 2 THEN
    RAISE EXCEPTION 'F9: as permissoes hr.vencimento.subsidio.view e .gerir deviam ficar.';
  END IF;

  RAISE NOTICE 'conferir: colunas, tabela e RPC antigas largadas; 5 funcoes com o md5 esperado; arquivo contrair %, expandir %.',
    (SELECT count(*) FROM public.hr_legado_arquivo a WHERE a.fase = 'contrair'),
    (SELECT count(*) FROM public.hr_legado_arquivo a WHERE a.fase = 'expandir');
END;
$conferir$;

NOTIFY pgrst, 'reload schema';

COMMIT;
