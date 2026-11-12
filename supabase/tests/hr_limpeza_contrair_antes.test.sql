-- ============================================================
-- Verificacoes SO DE LEITURA: 20270115100000_hr_limpeza_contrair.sql (base RH) -- ANTES do push
-- ============================================================
-- Nao escreve nada (transaccao READ ONLY, desfeita). So catalogo e contagens; nunca mostra valores salariais.
-- Cada linha diz o que se mediu, o esperado e se bate (ok). Uma linha com ok = false bloqueia o push ate se reler o
-- desenho. As linhas 'info' sao numeros para anotar (o conferir da migration tem de mostrar os mesmos).
--
-- Correr (a partir do worktree ligado a RH; confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -o csv -f supabase/tests/hr_limpeza_contrair_antes.test.sql
-- ============================================================

BEGIN READ ONLY;

WITH
corpos(fn, md5_esperado) AS (VALUES
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)', '114c500d3e812fa5385bfccf4a5100dd'),
  ('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)',  'edce5b6e9697bd138ba6d9cb0761fea6'),
  ('public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes)',                   '363dab8f3462a959e35f615b8be058e5'),
  ('public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)',              '860cbefcc14d1e20298acea748cc4ace'),
  ('public.hr_retribuicoes_escrita_so_por_rpc()',                                           '4b16ba28fee30a6a91d758a90143db5b'),
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)',          '29ec077d844f4c77130b60c6f54c4137'),
  ('public.hr_vinculos_registar_alteracao()',                                               '1088ebe6756f9e4bc578e285006ec044'),
  ('public.hr_documento_variaveis(uuid, uuid, boolean)',                                    '5f27c4edb9608c4a1a89235f2264c593')),
ancoras(fn, linha) AS (VALUES
  ('public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes)', $l$    'subsidio_alimentacao',       p_r.subsidio_alimentacao,$l$),
  ('public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)', $l$         subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct,$l$),
  ('public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid)', $l$         (v_p_campos ->> 'subsidio_alimentacao')::numeric,$l$),
  ('public.hr_retribuicoes_escrita_so_por_rpc()', $l$           NEW.subsidio_alimentacao, NEW.subsidio_alimentacao_modo, NEW.duodecimos_pct,$l$),
  ('public.hr_retribuicoes_escrita_so_por_rpc()', $l$           OLD.subsidio_alimentacao, OLD.subsidio_alimentacao_modo, OLD.duodecimos_pct,$l$),
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', $l$  v_subsidio       numeric;$l$),
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', $l$  SELECT r.vinculo_id, r.moeda, r.subsidio_alimentacao INTO v_vinculo, v_moeda, v_subsidio$l$),
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', $l$    v_subsidio := NULL;$l$),
  ('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, text, smallint, text)', $l$    'subsidio_alimentacao',       v_subsidio,$l$),
  ('public.hr_vinculos_registar_alteracao()', $l$    'horas_periodo', 'horas_frequencia', 'horas_semanais_maximas', 'horas_anuais_maximas',$l$)),
cita AS (
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) AS lista, count(*) AS n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text NOT IN ('pg_catalog', 'information_schema')
     AND p.prosrc ~ 'subsidio_alimentacao($|[^_a-z])|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia'),
arq AS (SELECT * FROM public.hr_legado_arquivo),
ret AS (SELECT * FROM public.pessoas_retribuicoes WHERE subsidio_alimentacao IS NOT NULL)
SELECT 'organizacoes na base' AS verificacao, (SELECT count(*) FROM public.anew_organizations)::text AS medido, '1' AS esperado,
       (SELECT count(*) FROM public.anew_organizations) = 1 AS ok
UNION ALL
SELECT 'md5 sem CR ' || c.fn, md5(replace(p.prosrc, chr(13), '')), c.md5_esperado, md5(replace(p.prosrc, chr(13), '')) = c.md5_esperado
  FROM corpos c LEFT JOIN pg_proc p ON p.oid = to_regprocedure(c.fn)::oid
UNION ALL
SELECT 'ancora CRLF uma vez em ' || a.fn || ' / ' || left(btrim(a.linha), 40),
       ((length(p.prosrc) - length(replace(p.prosrc, chr(13) || chr(10) || a.linha || chr(13) || chr(10), '')))
         / length(chr(13) || chr(10) || a.linha || chr(13) || chr(10)))::text, '1',
       (length(p.prosrc) - length(replace(p.prosrc, chr(13) || chr(10) || a.linha || chr(13) || chr(10), '')))
         / length(chr(13) || chr(10) || a.linha || chr(13) || chr(10)) = 1
  FROM ancoras a JOIN pg_proc p ON p.oid = to_regprocedure(a.fn)::oid
UNION ALL
SELECT 'funcoes que citam os nomes', (SELECT n::text FROM cita), '10', (SELECT n FROM cita) = 10
UNION ALL
SELECT 'funcoes que citam os nomes (lista)', (SELECT lista FROM cita), 'as 5 a corrigir, as 2 rpc_hr_retribuicao_definir_pessoal, hr_documento_variaveis, _catalogo, hr_processamento_resultado_erro, hr_admissao_pendencias', NULL
UNION ALL
SELECT 'dependentes das 2 colunas (distintos)',
       (SELECT count(DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid))::text
          FROM pg_depend d JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
         WHERE d.refclassid = 'pg_class'::regclass
           AND ((d.refobjid = 'public.pessoas_retribuicoes'::regclass AND a.attname::text = 'subsidio_alimentacao')
             OR (d.refobjid = 'public.pessoas_vinculos'::regclass AND a.attname::text = 'horas_anuais_maximas'))),
       '2 (os 2 CHECK)',
       (SELECT count(DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid))
          FROM pg_depend d JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
         WHERE d.refclassid = 'pg_class'::regclass
           AND ((d.refobjid = 'public.pessoas_retribuicoes'::regclass AND a.attname::text = 'subsidio_alimentacao')
             OR (d.refobjid = 'public.pessoas_vinculos'::regclass AND a.attname::text = 'horas_anuais_maximas'))) = 2
UNION ALL
SELECT 'dependentes da tabela antiga (distintos)',
       (SELECT count(DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid))::text FROM pg_depend d
         WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = 'public.hr_regras_subsidio_alimentacao'::regclass),
       '18', (SELECT count(DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid)) FROM pg_depend d
               WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = 'public.hr_regras_subsidio_alimentacao'::regclass) = 18
UNION ALL
SELECT 'FK que entram na tabela antiga',
       (SELECT count(*)::text FROM pg_constraint c WHERE c.confrelid = 'public.hr_regras_subsidio_alimentacao'::regclass), '0',
       (SELECT count(*) FROM pg_constraint c WHERE c.confrelid = 'public.hr_regras_subsidio_alimentacao'::regclass) = 0
UNION ALL
SELECT 'cron que cita os nomes ou as RPC antigas',
       (SELECT count(*)::text FROM cron.job j WHERE j.command ~ 'subsidio_alimentacao|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia|rpc_hr_retribuicao_definir_pessoal|rpc_hr_horas_extra_config_guardar'),
       '0', (SELECT count(*) FROM cron.job j WHERE j.command ~ 'subsidio_alimentacao|horas_anuais_maximas|hr_regras_subsidio_alimentacao|minutos_minimos_dia|rpc_hr_retribuicao_definir_pessoal|rpc_hr_horas_extra_config_guardar') = 0
UNION ALL
SELECT 'vistas que leem pessoas_retribuicoes ou pessoas_vinculos',
       (SELECT count(DISTINCT rw.ev_class)::text FROM pg_rewrite rw JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
         WHERE d.refobjid IN ('public.pessoas_retribuicoes'::regclass, 'public.pessoas_vinculos'::regclass)
           AND rw.ev_class NOT IN ('public.pessoas_retribuicoes'::regclass, 'public.pessoas_vinculos'::regclass)),
       '0', NULL
UNION ALL
SELECT 'arquivo: colunas (sem fase)',
       (SELECT string_agg(a.attname::text, ',' ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid = 'public.hr_legado_arquivo'::regclass AND a.attnum > 0 AND NOT a.attisdropped),
       'id,organization_id,tabela,coluna,registo_id,pessoa_id,valor,arquivado_em',
       (SELECT string_agg(a.attname::text, ',' ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid = 'public.hr_legado_arquivo'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
         = 'id,organization_id,tabela,coluna,registo_id,pessoa_id,valor,arquivado_em'
UNION ALL
SELECT 'arquivo: fechado (relacl / rls / force / politicas)',
       (SELECT c.relacl::text || ' / ' || c.relrowsecurity::text || ' / ' || c.relforcerowsecurity::text || ' / '
               || (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::text
          FROM pg_class c WHERE c.oid = 'public.hr_legado_arquivo'::regclass),
       '{postgres=arwdDxtm/postgres} / true / true / 0',
       (SELECT c.relacl::text = '{postgres=arwdDxtm/postgres}' AND c.relrowsecurity AND c.relforcerowsecurity
               AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
          FROM pg_class c WHERE c.oid = 'public.hr_legado_arquivo'::regclass)
UNION ALL
SELECT 'arquivo: linhas (fase 1)', (SELECT count(*)::text FROM arq), '26', (SELECT count(*) FROM arq) = 26
UNION ALL
SELECT 'info: retribuicoes com subsidio (linhas / soma)', (SELECT count(*)::text || ' / ' || coalesce(sum(subsidio_alimentacao), 0)::text FROM ret),
       '37 / 314.20 a 12/11 (pode ter crescido)', NULL
UNION ALL
SELECT 'info: retribuicoes com subsidio SEM linha no arquivo (arquivo desactualizado)',
       (SELECT count(*)::text FROM ret r WHERE NOT EXISTS (SELECT 1 FROM arq a WHERE a.tabela = 'pessoas_retribuicoes' AND a.registo_id = r.id)),
       '12 a 12/11', NULL
UNION ALL
SELECT 'info: retribuicoes arquivadas com valido_ate ou deleted_at mudado',
       (SELECT count(*)::text FROM ret r JOIN arq a ON a.tabela = 'pessoas_retribuicoes' AND a.registo_id = r.id
         WHERE (a.valor ->> 'valido_ate')::date IS DISTINCT FROM r.valido_ate
            OR (a.valor ->> 'deleted_at')::timestamptz IS DISTINCT FROM r.deleted_at),
       '1 a 12/11', NULL
UNION ALL
SELECT 'retribuicoes arquivadas com o VALOR mudado ou sem valor hoje (a migration aborta)',
       (SELECT count(*)::text FROM arq a JOIN public.pessoas_retribuicoes r ON r.id = a.registo_id
         WHERE a.tabela = 'pessoas_retribuicoes'
           AND (r.subsidio_alimentacao IS NULL OR r.subsidio_alimentacao <> (a.valor ->> 'subsidio_alimentacao')::numeric)),
       '0',
       (SELECT count(*) FROM arq a JOIN public.pessoas_retribuicoes r ON r.id = a.registo_id
         WHERE a.tabela = 'pessoas_retribuicoes'
           AND (r.subsidio_alimentacao IS NULL OR r.subsidio_alimentacao <> (a.valor ->> 'subsidio_alimentacao')::numeric)) = 0
UNION ALL
SELECT 'info: vinculos com horas anuais', (SELECT count(*)::text FROM public.pessoas_vinculos WHERE horas_anuais_maximas IS NOT NULL), '0 a 12/11', NULL
UNION ALL
SELECT 'info: regra antiga (linhas)', (SELECT count(*)::text FROM public.hr_regras_subsidio_alimentacao), '1 a 12/11', NULL
UNION ALL
SELECT 'historico de contratos com horas_anuais_maximas',
       (SELECT count(*)::text FROM public.pessoas_vinculos_alteracoes x WHERE x.campo = 'horas_anuais_maximas'), '0',
       (SELECT count(*) FROM public.pessoas_vinculos_alteracoes x WHERE x.campo = 'horas_anuais_maximas') = 0
UNION ALL
SELECT 'comentarios a trocar (frase presente uma vez)',
       (SELECT count(*)::text FROM pg_description d
         WHERE (d.objoid = 'public.hr_horas_extra_config'::regclass AND d.objsubid = 0
                AND d.description LIKE '%por ano (ano_min, omissao quando o vinculo em vigor nao define horas_anuais_maximas)%')
            OR (d.objoid = 'public.pessoas_horas_extra'::regclass AND d.objsubid > 0
                AND d.description LIKE '%ou do ano (horas_anuais_maximas x 60 do vinculo em vigor, senao config.ano_min)%')
            OR (d.objoid = 'public.pessoas_vinculos'::regclass AND d.objsubid > 0
                AND d.description LIKE '% NAO tem relacao imposta com horas_anuais_maximas: 52 semanas%')
            OR (d.objoid = to_regprocedure('public.hr_horas_extra_pessoa_ctx(uuid, uuid, date)')::oid
                AND d.description LIKE '%Ja nao le pessoas_vinculos.horas_anuais_maximas nem hr_horas_extra_config.ano_min.%')),
       '4', NULL;

ROLLBACK;
