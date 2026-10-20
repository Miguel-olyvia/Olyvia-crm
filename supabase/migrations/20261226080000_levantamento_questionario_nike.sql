-- ============================================================
-- 20261226080000_levantamento_questionario_nike
-- ============================================================
-- O que faz (desenho: vault ficheiros/crm/levantamento-configuravel-desenho.md,
--   secções 4.2 e 4.3): migration de DADOS, só na nike.
--   1. Semeia o questionário da nike (b6ffce4f-f630-4933-833a-008649757a33)
--      com a cópia do catálogo de hoje, por fn_neg_semear_questionario
--      (20261226070000): 8 secções (exterior, interior, área, necessidades,
--      escolhas e qualificação com perguntas; visitas e medidas especiais),
--      36 perguntas de escolha única com as chaves de hoje, 109 opções com as
--      chaves de hoje, 9 títulos de bloco e 3 condições
--      (impactoPreco se acesso = dificil; zonaEstacionamento se
--      estacionamento = pago; tipologia se tipoEspaco = casa ou sem resposta).
--      Números contados no código (gen/extrair_catalogo.mjs) a 20/10.
--   2. Preenche o snapshot das respostas da nike que já existam em
--      levantamentos LIVRES (sem negócio e fora do lixo), a partir da cópia
--      acabada de semear (textos idênticos aos que a pessoa viu). Liga pela
--      chave da pergunta e da opção; chave desconhecida fica como está. As
--      de levantamentos ligados ou no lixo ficam sem snapshot (o trigger
--      fn_levantamento_filhos_pai recusa escrever nelas; contorná-lo seria
--      mexer numa regra de congelamento). A 20/10 a nike tinha 0 respostas.
-- GUARDA: só corre se a única organização com negocio_workflow_config for a
--   nike; senão aborta e diz quantas são. Não escreve noutra organização.
-- MUDELAR: nenhum dado lido ou escrito (não tem negocio_workflow_config).
-- PRECISA DE CÓDIGO? Não: nada lê ainda o questionário (a Fase V continua
--   com o catálogo do código até ao passo de UI).
-- Reversão: fora da pasta das migrations.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição e guarda.
DO $pre$
DECLARE
  v_n integer;
BEGIN
  IF pg_catalog.to_regprocedure('public.fn_neg_semear_questionario(uuid)') IS NULL
     OR (SELECT md5(p.prosrc) FROM pg_catalog.pg_proc p
         WHERE p.oid = pg_catalog.to_regprocedure('public.fn_neg_semear_questionario(uuid)'))
        IS DISTINCT FROM '32a05a64569b2a44ce274da6ae5cb79b' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_neg_semear_questionario não é a de 20261226070000; nada feito.';
  END IF;

  v_n := (SELECT count(*) FROM public.negocio_workflow_config);
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                             WHERE c.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid) THEN
    RAISE EXCEPTION 'GUARDA: esperava só a nike em negocio_workflow_config e há % organizações (ou a nike não está); nada feito.', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.levantamento_questionario) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: já há questionários semeados; nada feito.';
  END IF;

  -- A migration corre sem sessão: a guarda de organização dos filhos do
  -- levantamento deixa passar (fn_levantamentos_exigir_organizacao, md5 de 20/10).
  IF md5(pg_catalog.pg_get_functiondef('public.fn_levantamentos_exigir_organizacao(uuid)'::regprocedure))
     <> '8d91040c105a1ba3aa59f2306a11ab08'
     OR md5(pg_catalog.pg_get_functiondef('public.fn_levantamento_filhos_pai(uuid,boolean)'::regprocedure))
     <> 'dc209276b2686aa8d6df18886aeeb91f'
     OR md5(pg_catalog.pg_get_functiondef('public.fn_levantamento_respostas_guardar()'::regprocedure))
     <> '988800703458cc7e96d154124023d53f' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as guardas dos filhos do levantamento mudaram desde 20/10; nada feito.';
  END IF;
END
$pre$;

-- 1. Semear a nike.
DO $semear$
DECLARE
  v_r jsonb;
BEGIN
  v_r := public.fn_neg_semear_questionario('b6ffce4f-f630-4933-833a-008649757a33'::uuid);
  IF v_r IS DISTINCT FROM '{"semeado": true, "seccoes": 8, "perguntas": 36, "opcoes": 109}'::jsonb THEN
    RAISE EXCEPTION 'Sementeira da nike inesperada: %', v_r::text;
  END IF;
END
$semear$;

-- 2. Snapshot das respostas da nike em levantamentos livres.
UPDATE public.levantamento_respostas lr
SET tipo           = 'escolha_unica',
    seccao         = s.chave,
    pergunta_texto = p.texto,
    seccao_titulo  = s.titulo,
    bloco          = p.bloco,
    ordem          = s.ordem * 1000 + p.ordem,
    escolhas       = ARRAY[o.chave],
    escolhas_texto = ARRAY[o.texto]
FROM public.levantamentos lt,
     public.levantamento_perguntas p,
     public.levantamento_seccoes s,
     public.levantamento_opcoes o
WHERE lr.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
  AND lr.tipo IS NULL
  AND lt.id = lr.levantamento_id
  AND lt.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
  AND lt.negocio_id IS NULL
  AND lt.deleted_at IS NULL
  AND p.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
  AND p.chave = lr.pergunta
  AND p.tipo = 'escolha_unica'
  AND s.id = p.seccao_id
  AND o.pergunta_id = p.id
  AND o.chave = lr.resposta;

-- CONFERIR
DO $conferir$
DECLARE
  c_nike CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_txt  text;
BEGIN
  -- 1. Só a nike tem questionário, na versão 1.
  IF (SELECT count(*) FROM public.levantamento_questionario) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.levantamento_questionario q
                    WHERE q.organization_id = c_nike AND q.versao = 1) THEN
    RAISE EXCEPTION 'CONFERIR (1. questionário da nike)';
  END IF;

  -- 2. Secções, pela ordem, com as perguntas por secção.
  v_txt := (SELECT string_agg(s.chave || ':' || s.aba || ':' || COALESCE(s.especial, '-') || ':'
                              || (SELECT count(*) FROM public.levantamento_perguntas p WHERE p.seccao_id = s.id)::text,
                              ',' ORDER BY s.ordem)
            FROM public.levantamento_seccoes s WHERE s.organization_id = c_nike);
  IF v_txt IS DISTINCT FROM 'visitas:visita:visitas:0,exterior:visita:-:6,interior:visita:-:10,area:visita:-:8,'
                            'medidas:visita:medidas:0,necessidades:visita:-:4,escolhas:visita:-:2,'
                            'qualificacao:qualificacao:-:6' THEN
    RAISE EXCEPTION 'CONFERIR (2. secções da nike): %', v_txt;
  END IF;

  -- 3. Totais: perguntas (todas de escolha única), opções, blocos e condições.
  IF (SELECT count(*) FROM public.levantamento_perguntas p WHERE p.organization_id = c_nike) <> 36
     OR (SELECT count(*) FROM public.levantamento_perguntas p
         WHERE p.organization_id = c_nike AND p.tipo = 'escolha_unica' AND p.activa AND p.apagada_em IS NULL) <> 36
     OR (SELECT count(*) FROM public.levantamento_opcoes o WHERE o.organization_id = c_nike) <> 109
     OR (SELECT count(DISTINCT s.chave || '/' || p.bloco) FROM public.levantamento_perguntas p
         JOIN public.levantamento_seccoes s ON s.id = p.seccao_id
         WHERE p.organization_id = c_nike AND p.bloco IS NOT NULL) <> 9 THEN
    RAISE EXCEPTION 'CONFERIR (3. totais da nike)';
  END IF;
  v_txt := (SELECT string_agg(p.chave || '>' || a.chave || ':' || array_to_string(p.depende_opcoes, '|')
                              || ':' || p.depende_sem_resposta::text, ',' ORDER BY p.chave)
            FROM public.levantamento_perguntas p
            JOIN public.levantamento_perguntas a ON a.id = p.depende_de
            WHERE p.organization_id = c_nike);
  IF v_txt IS DISTINCT FROM 'impactoPreco>acesso:dificil:false,tipologia>tipoEspaco:casa:true,'
                            'zonaEstacionamento>estacionamento:pago:false' THEN
    RAISE EXCEPTION 'CONFERIR (3. condições da nike): %', v_txt;
  END IF;

  -- 4. A cópia é exactamente o catálogo do código (impressão digital gerada
  --    pelo mesmo script que gerou o literal).
  v_txt := (SELECT md5(string_agg(s.chave || '|' || s.ordem::text || '|' || s.titulo || '|' || p.chave || '|'
                                  || p.ordem::text || '|' || COALESCE(p.bloco, '') || '|' || p.texto || '|'
                                  || o.chave || '|' || o.ordem::text || '|' || o.texto,
                                  E'\n' ORDER BY s.ordem, p.ordem, o.ordem))
            FROM public.levantamento_seccoes s
            JOIN public.levantamento_perguntas p ON p.seccao_id = s.id
            JOIN public.levantamento_opcoes o ON o.pergunta_id = p.id
            WHERE s.organization_id = c_nike);
  IF v_txt IS DISTINCT FROM '21b1941751f60b7ae6ab3a76a3ec3032' THEN
    RAISE EXCEPTION 'CONFERIR (4. a cópia difere do catálogo do código): %', v_txt;
  END IF;

  -- 5. Nenhuma resposta da nike em levantamento livre ficou sem snapshot
  --    quando a pergunta e a opção são conhecidas.
  IF EXISTS (SELECT 1 FROM public.levantamento_respostas lr
             JOIN public.levantamentos lt ON lt.id = lr.levantamento_id
             JOIN public.levantamento_perguntas p ON p.organization_id = c_nike AND p.chave = lr.pergunta
             JOIN public.levantamento_opcoes o ON o.pergunta_id = p.id AND o.chave = lr.resposta
             WHERE lr.organization_id = c_nike AND lr.tipo IS NULL
               AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'CONFERIR (5. respostas livres sem snapshot)';
  END IF;
END
$conferir$;

COMMIT;
