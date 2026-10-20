-- ============================================================
-- 20261226070000_levantamento_questionario_tabelas
-- ============================================================
-- O que faz (desenho: vault ficheiros/crm/levantamento-configuravel-desenho.md,
--   secções 2, 3 e 4.1; decisões do utilizador de 20/10, D1 a D10):
--   1. Quatro tabelas NOVAS de configuração do levantamento, por organização:
--        levantamento_questionario  (uma linha por organização; versao)
--        levantamento_seccoes       (chave, titulo, aba, especial, ordem, activa, apagada_em)
--        levantamento_perguntas     (chave, texto, bloco, tipo, número/texto, condição, ordem)
--        levantamento_opcoes        (chave, texto, ordem, activa, apagada_em)
--      Sem dados de clientes. Apagar é marcar apagada_em (nunca DELETE); a
--      chave nunca muda nem se reutiliza (UNIQUE por organização, mesmo as
--      apagadas). O tipo de uma pergunta PODE mudar (D4 alterada a 20/10):
--      a regra «só sem respostas» vive em neg_guardar_questionario (migration
--      20261226090000), que conta as respostas antes de aceitar.
--      A organização de cada filho é garantida por chaves estrangeiras
--      compostas (secção, pergunta e condição da mesma organização).
--      Trigger próprio: id, organização, chave, aba, especial e pergunta de
--      uma opção não mudam; o que está apagado não volta; updated_at.
--   2. RLS: SELECT para authenticated com a regra de leitura de
--      negocio_workflow_config (pessoas.view, organização do utilizador e
--      chave de âmbito nessa organização; copiada do remoto a 20/10);
--      INSERT, UPDATE e DELETE recusados por políticas RESTRICTIVE false.
--      GRANT: authenticated só SELECT; anon nada; service_role ALL (como as
--      outras tabelas de Pessoas). Dono postgres, sem FORCE RLS: a escrita é
--      só pela função DEFINER de 20261226090000.
--   3. levantamento_respostas ganha o «snapshot» (colunas novas, todas NULL):
--      tipo, pergunta_texto, seccao_titulo, bloco, ordem, escolhas,
--      escolhas_texto, valor_texto, valor_numero. resposta passa a aceitar
--      NULL (escolha múltipla, texto e número); a secção passa de lista
--      fechada a formato de chave; CHECK de coerência por tipo (tipo NULL é a
--      forma antiga: só resposta). Índice novo (organization_id, pergunta)
--      para contar respostas por pergunta (D4).
--   4. fn_neg_semear_questionario(p_organization_id): copia o catálogo de
--      hoje do código (SECCOES_VISITA e BLOCO_QUALIFICACAO, só textos pt, D1)
--      para uma organização com Pessoas activa. Literal GERADO por script a
--      partir do código (gen/extrair_catalogo.mjs e gen/montar.py), não
--      escrito à mão. Só o dono a executa (sem EXECUTE para PUBLIC, anon,
--      authenticated nem service_role); serve a 20261226080000 (nike) e às
--      migrations que no futuro ligarem Pessoas noutra organização (D3).
-- NÃO FAZ: não semeia nenhuma organização (isso é 20261226080000); não
--   altera nenhuma função existente; não toca em negocio_workflow_config.
-- BLOQUEIOS: ACCESS EXCLUSIVE em levantamento_respostas (0 linhas na nike,
--   lido a 20/10; tabela só usada pela página Pessoas, que só a nike tem);
--   SHARE ROW EXCLUSIVE em anew_organizations e anew_users (chaves
--   estrangeiras novas) até ao COMMIT, que é imediato. lock_timeout 2 s: se
--   alguma estiver ocupada, a migration desiste sem nada feito.
-- MUDELAR: nenhum dado lido ou escrito. Não tem negocio_workflow_config nem
--   terá questionário.
-- PRECISA DE CÓDIGO? Não: nada lê as tabelas novas ainda, e as colunas novas
--   de levantamento_respostas são opcionais. A função antiga
--   neg_guardar_levantamento continua a gravar a forma antiga (tipo NULL).
-- Reversão: fora da pasta das migrations.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: estado lido no remoto a 20/10.
DO $pre$
DECLARE
  v_txt text;
BEGIN
  IF pg_catalog.to_regclass('public.levantamento_questionario') IS NOT NULL
     OR pg_catalog.to_regclass('public.levantamento_seccoes') IS NOT NULL
     OR pg_catalog.to_regclass('public.levantamento_perguntas') IS NOT NULL
     OR pg_catalog.to_regclass('public.levantamento_opcoes') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
                WHERE s.nspname::text = 'public'
                  AND p.proname::text IN ('fn_neg_semear_questionario', 'fn_levantamento_config_guardar')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as tabelas ou funções do questionário já existem; nada feito.';
  END IF;

  -- levantamento_respostas: exactamente as 8 colunas e as restrições de 20/10.
  IF (SELECT string_agg(a.attname::text || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)::text
                        || ':' || a.attnotnull::text, ',' ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.levantamento_respostas'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM 'id:uuid:true,levantamento_id:uuid:true,organization_id:uuid:true,seccao:text:true,'
                      'pergunta:text:true,resposta:text:true,created_at:timestamp with time zone:true,'
                      'updated_at:timestamp with time zone:true' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: levantamento_respostas tem colunas diferentes das de 20/10; nada feito.';
  END IF;
  IF (SELECT pg_catalog.pg_get_constraintdef(k.oid)::text FROM pg_catalog.pg_constraint k
      WHERE k.conrelid = 'public.levantamento_respostas'::regclass
        AND k.conname::text = 'levantamento_respostas_seccao_check')
     IS DISTINCT FROM 'CHECK ((seccao = ANY (ARRAY[''exterior''::text, ''interior''::text, ''area''::text, ''necessidades''::text, ''escolhas''::text, ''qualificacao''::text])))' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: levantamento_respostas_seccao_check não é a de 20/10; nada feito.';
  END IF;
  IF (SELECT string_agg(k.conname::text, ',' ORDER BY k.conname::text) FROM pg_catalog.pg_constraint k
      WHERE k.conrelid = 'public.levantamento_respostas'::regclass)
     IS DISTINCT FROM 'levantamento_respostas_levantamento_id_fkey,levantamento_respostas_levantamento_pergunta_key,'
                      'levantamento_respostas_organization_id_fkey,levantamento_respostas_pergunta_check,'
                      'levantamento_respostas_pkey,levantamento_respostas_resposta_check,levantamento_respostas_seccao_check' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: levantamento_respostas tem restrições diferentes das de 20/10; nada feito.';
  END IF;
  IF (SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text) FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.levantamento_respostas'::regclass AND NOT t.tgisinternal)
     IS DISTINCT FROM 'trg_00_levantamento_respostas_guardar,trg_levantamento_respostas_updated_at' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: levantamento_respostas tem triggers diferentes dos de 20/10; nada feito.';
  END IF;

  -- Funções de que as tabelas e as políticas dependem (md5 lidos a 20/10).
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_levantamento_respostas_guardar()',        '988800703458cc7e96d154124023d53f'),
              ('public.fn_levantamento_filhos_pai(uuid,boolean)',   'dc209276b2686aa8d6df18886aeeb91f'),
              ('public.has_anew_permission(uuid,text)',             '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',                 '29782031244dd3b0842ca43b271e2bf1'),
              ('public.crm_scope_keys(text)',                       '6abb12e1d7a3db943630e8f8d7e15ca8')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10: %; nada feito.', v_txt;
  END IF;

  IF pg_catalog.to_regclass('public.negocio_workflow_config') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta negocio_workflow_config; nada feito.';
  END IF;
END
$pre$;

-- ============================================================
-- 1. Tabelas
-- ============================================================

CREATE TABLE public.levantamento_questionario (
  organization_id uuid        NOT NULL,
  versao          integer     NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,
  CONSTRAINT levantamento_questionario_pkey PRIMARY KEY (organization_id),
  CONSTRAINT levantamento_questionario_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  CONSTRAINT levantamento_questionario_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT levantamento_questionario_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT levantamento_questionario_versao_check CHECK (versao >= 1)
);

CREATE TABLE public.levantamento_seccoes (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  chave           text        NOT NULL,
  titulo          text        NOT NULL,
  aba             text        NOT NULL DEFAULT 'visita',
  especial        text,
  ordem           integer     NOT NULL,
  activa          boolean     NOT NULL DEFAULT true,
  apagada_em      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT levantamento_seccoes_pkey PRIMARY KEY (id),
  CONSTRAINT levantamento_seccoes_org_chave_key UNIQUE (organization_id, chave),
  CONSTRAINT levantamento_seccoes_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT levantamento_seccoes_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.levantamento_questionario(organization_id) ON DELETE RESTRICT,
  CONSTRAINT levantamento_seccoes_chave_check CHECK (chave ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  CONSTRAINT levantamento_seccoes_titulo_check
    CHECK (char_length(titulo) BETWEEN 1 AND 80 AND titulo = btrim(titulo)),
  CONSTRAINT levantamento_seccoes_aba_check CHECK (aba IN ('visita', 'qualificacao')),
  CONSTRAINT levantamento_seccoes_especial_check CHECK (especial IS NULL OR especial IN ('visitas', 'medidas')),
  CONSTRAINT levantamento_seccoes_ordem_check CHECK (ordem >= 0),
  -- A Qualificação é a secção de chave fixa 'qualificacao', a única da aba
  -- qualificacao, e não se apaga (a ficha lê-a por esta chave).
  CONSTRAINT levantamento_seccoes_qualificacao_check
    CHECK ((aba = 'qualificacao') = (chave = 'qualificacao')
           AND (chave <> 'qualificacao' OR apagada_em IS NULL)),
  -- Visitas e Medidas: chave = tipo, aba visita, sempre activas e vivas (D6).
  CONSTRAINT levantamento_seccoes_especial_regras_check
    CHECK (especial IS NULL
           OR (aba = 'visita' AND chave = especial AND activa AND apagada_em IS NULL))
);

CREATE INDEX idx_levantamento_seccoes_org_ordem
  ON public.levantamento_seccoes (organization_id, ordem) WHERE apagada_em IS NULL;

CREATE TABLE public.levantamento_perguntas (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid          NOT NULL,
  seccao_id            uuid          NOT NULL,
  chave                text          NOT NULL,
  texto                text          NOT NULL,
  bloco                text,
  tipo                 text          NOT NULL,
  numero_min           numeric(14,3),
  numero_max           numeric(14,3),
  numero_casas         smallint,
  unidade              text,
  texto_max            smallint,
  depende_de           uuid,
  depende_opcoes       text[],
  depende_sem_resposta boolean       NOT NULL DEFAULT false,
  ordem                integer       NOT NULL,
  activa               boolean       NOT NULL DEFAULT true,
  apagada_em           timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT levantamento_perguntas_pkey PRIMARY KEY (id),
  CONSTRAINT levantamento_perguntas_org_chave_key UNIQUE (organization_id, chave),
  CONSTRAINT levantamento_perguntas_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT levantamento_perguntas_seccao_fkey
    FOREIGN KEY (seccao_id, organization_id)
    REFERENCES public.levantamento_seccoes(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT levantamento_perguntas_depende_fkey
    FOREIGN KEY (depende_de, organization_id)
    REFERENCES public.levantamento_perguntas(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT levantamento_perguntas_chave_check CHECK (chave ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  CONSTRAINT levantamento_perguntas_texto_check
    CHECK (char_length(texto) BETWEEN 1 AND 200 AND texto = btrim(texto)),
  CONSTRAINT levantamento_perguntas_bloco_check
    CHECK (bloco IS NULL OR (char_length(bloco) BETWEEN 1 AND 80 AND bloco = btrim(bloco))),
  CONSTRAINT levantamento_perguntas_tipo_check
    CHECK (tipo IN ('escolha_unica', 'escolha_multipla', 'texto', 'numero')),
  CONSTRAINT levantamento_perguntas_numero_check
    CHECK ((tipo = 'numero'
            OR (numero_min IS NULL AND numero_max IS NULL AND numero_casas IS NULL AND unidade IS NULL))
           AND (numero_min IS NULL OR numero_max IS NULL OR numero_min <= numero_max)
           AND (numero_casas IS NULL OR numero_casas BETWEEN 0 AND 3)
           AND (unidade IS NULL OR (char_length(unidade) BETWEEN 1 AND 12 AND unidade = btrim(unidade)))),
  CONSTRAINT levantamento_perguntas_texto_max_check
    CHECK (texto_max IS NULL OR (tipo = 'texto' AND texto_max BETWEEN 1 AND 2000)),
  CONSTRAINT levantamento_perguntas_depende_check
    CHECK ((depende_de IS NULL) = (depende_opcoes IS NULL)
           AND (depende_de IS NOT NULL OR NOT depende_sem_resposta)
           AND (depende_de IS NULL OR depende_de <> id)
           AND (depende_opcoes IS NULL
                OR (array_ndims(depende_opcoes) = 1 AND cardinality(depende_opcoes) BETWEEN 1 AND 30
                    AND array_position(depende_opcoes, NULL) IS NULL))),
  CONSTRAINT levantamento_perguntas_ordem_check CHECK (ordem >= 0)
);

CREATE INDEX idx_levantamento_perguntas_seccao_ordem
  ON public.levantamento_perguntas (seccao_id, ordem);
CREATE INDEX idx_levantamento_perguntas_depende_de
  ON public.levantamento_perguntas (depende_de) WHERE depende_de IS NOT NULL;

CREATE TABLE public.levantamento_opcoes (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  pergunta_id     uuid        NOT NULL,
  chave           text        NOT NULL,
  texto           text        NOT NULL,
  ordem           integer     NOT NULL,
  activa          boolean     NOT NULL DEFAULT true,
  apagada_em      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT levantamento_opcoes_pkey PRIMARY KEY (id),
  CONSTRAINT levantamento_opcoes_pergunta_chave_key UNIQUE (pergunta_id, chave),
  CONSTRAINT levantamento_opcoes_pergunta_fkey
    FOREIGN KEY (pergunta_id, organization_id)
    REFERENCES public.levantamento_perguntas(id, organization_id) ON DELETE RESTRICT,
  -- O formato que levantamento_respostas.resposta já aceita (há t0, p5, m24).
  CONSTRAINT levantamento_opcoes_chave_check CHECK (chave ~ '^[a-z0-9][A-Za-z0-9]{0,39}$'),
  CONSTRAINT levantamento_opcoes_texto_check
    CHECK (char_length(texto) BETWEEN 1 AND 80 AND texto = btrim(texto)),
  CONSTRAINT levantamento_opcoes_ordem_check CHECK (ordem >= 0)
);

CREATE INDEX idx_levantamento_opcoes_pergunta_ordem
  ON public.levantamento_opcoes (pergunta_id, ordem);
CREATE INDEX idx_levantamento_opcoes_organization_id
  ON public.levantamento_opcoes (organization_id);

-- ============================================================
-- 2. Trigger: o que não muda, e updated_at
-- ============================================================

CREATE FUNCTION public.fn_levantamento_config_guardar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n jsonb := to_jsonb(NEW);
  v_o jsonb := to_jsonb(OLD);
BEGIN
  IF (v_n ->> 'organization_id') IS DISTINCT FROM (v_o ->> 'organization_id')
     OR (v_n ->> 'id') IS DISTINCT FROM (v_o ->> 'id')
     OR (v_n ->> 'chave') IS DISTINCT FROM (v_o ->> 'chave')
     OR (v_n ->> 'aba') IS DISTINCT FROM (v_o ->> 'aba')
     OR (v_n ->> 'especial') IS DISTINCT FROM (v_o ->> 'especial')
     OR (v_n ->> 'pergunta_id') IS DISTINCT FROM (v_o ->> 'pergunta_id') THEN
    RAISE EXCEPTION 'Não é possível mudar a organização, o identificador, a chave, a aba ou a pergunta de um elemento do questionário.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_o ->> 'apagada_em') IS NOT NULL
     AND (v_n ->> 'apagada_em') IS DISTINCT FROM (v_o ->> 'apagada_em') THEN
    RAISE EXCEPTION 'Um elemento apagado do questionário não volta; crie outro.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_levantamento_config_guardar() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_00_levantamento_questionario_guardar
  BEFORE UPDATE ON public.levantamento_questionario
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamento_config_guardar();
CREATE TRIGGER trg_00_levantamento_seccoes_guardar
  BEFORE UPDATE ON public.levantamento_seccoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamento_config_guardar();
CREATE TRIGGER trg_00_levantamento_perguntas_guardar
  BEFORE UPDATE ON public.levantamento_perguntas
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamento_config_guardar();
CREATE TRIGGER trg_00_levantamento_opcoes_guardar
  BEFORE UPDATE ON public.levantamento_opcoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamento_config_guardar();

-- ============================================================
-- 3. RLS e privilégios
-- ============================================================

ALTER TABLE public.levantamento_questionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levantamento_seccoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levantamento_perguntas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levantamento_opcoes       ENABLE ROW LEVEL SECURITY;

CREATE POLICY levantamento_questionario_select
  ON public.levantamento_questionario AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
         AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
         AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.view'))) AS k(scope_key)
                     WHERE starts_with(k.scope_key, levantamento_questionario.organization_id::text || ':')));
CREATE POLICY levantamento_questionario_no_insert
  ON public.levantamento_questionario AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY levantamento_questionario_no_update
  ON public.levantamento_questionario AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY levantamento_questionario_no_delete
  ON public.levantamento_questionario AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE POLICY levantamento_seccoes_select
  ON public.levantamento_seccoes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
         AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
         AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.view'))) AS k(scope_key)
                     WHERE starts_with(k.scope_key, levantamento_seccoes.organization_id::text || ':')));
CREATE POLICY levantamento_seccoes_no_insert
  ON public.levantamento_seccoes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY levantamento_seccoes_no_update
  ON public.levantamento_seccoes AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY levantamento_seccoes_no_delete
  ON public.levantamento_seccoes AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE POLICY levantamento_perguntas_select
  ON public.levantamento_perguntas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
         AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
         AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.view'))) AS k(scope_key)
                     WHERE starts_with(k.scope_key, levantamento_perguntas.organization_id::text || ':')));
CREATE POLICY levantamento_perguntas_no_insert
  ON public.levantamento_perguntas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY levantamento_perguntas_no_update
  ON public.levantamento_perguntas AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY levantamento_perguntas_no_delete
  ON public.levantamento_perguntas AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE POLICY levantamento_opcoes_select
  ON public.levantamento_opcoes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
         AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
         AND EXISTS (SELECT 1 FROM unnest((SELECT public.crm_scope_keys('pessoas.view'))) AS k(scope_key)
                     WHERE starts_with(k.scope_key, levantamento_opcoes.organization_id::text || ':')));
CREATE POLICY levantamento_opcoes_no_insert
  ON public.levantamento_opcoes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY levantamento_opcoes_no_update
  ON public.levantamento_opcoes AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY levantamento_opcoes_no_delete
  ON public.levantamento_opcoes AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

REVOKE ALL ON TABLE public.levantamento_questionario FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.levantamento_seccoes      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.levantamento_perguntas    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.levantamento_opcoes       FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.levantamento_questionario TO authenticated;
GRANT SELECT ON TABLE public.levantamento_seccoes      TO authenticated;
GRANT SELECT ON TABLE public.levantamento_perguntas    TO authenticated;
GRANT SELECT ON TABLE public.levantamento_opcoes       TO authenticated;
GRANT ALL ON TABLE public.levantamento_questionario TO service_role;
GRANT ALL ON TABLE public.levantamento_seccoes      TO service_role;
GRANT ALL ON TABLE public.levantamento_perguntas    TO service_role;
GRANT ALL ON TABLE public.levantamento_opcoes       TO service_role;

COMMENT ON TABLE public.levantamento_questionario IS
  'Pessoas, levantamento configurável: uma linha por organização que tem o questionário (só uma migration a cria, por fn_neg_semear_questionario). versao sobe em cada gravação que muda alguma coisa (NG021). 20261226070000.';
COMMENT ON TABLE public.levantamento_seccoes IS
  'Pessoas, levantamento configurável: secções por organização. chave fixa e única (mesmo apagadas); qualificacao é a da aba Qualificação; visitas e medidas são especiais (só se reordenam). Apagar = apagada_em. 20261226070000.';
COMMENT ON TABLE public.levantamento_perguntas IS
  'Pessoas, levantamento configurável: perguntas por organização. chave fixa e única (é o que levantamento_respostas.pergunta guarda). tipo escolha_unica, escolha_multipla, texto ou numero; muda só sem respostas (neg_guardar_questionario). Condição de um nível (depende_de, depende_opcoes com chaves de opções). 20261226070000.';
COMMENT ON TABLE public.levantamento_opcoes IS
  'Pessoas, levantamento configurável: opções das perguntas de escolha. chave única por pergunta (é o que levantamento_respostas.resposta e escolhas guardam). 20261226070000.';

-- ============================================================
-- 4. levantamento_respostas: o snapshot
-- ============================================================

ALTER TABLE public.levantamento_respostas
  ADD COLUMN tipo           text,
  ADD COLUMN pergunta_texto text,
  ADD COLUMN seccao_titulo  text,
  ADD COLUMN bloco          text,
  ADD COLUMN ordem          integer,
  ADD COLUMN escolhas       text[],
  ADD COLUMN escolhas_texto text[],
  ADD COLUMN valor_texto    text,
  ADD COLUMN valor_numero   numeric(14,3),
  ALTER COLUMN resposta DROP NOT NULL,
  DROP CONSTRAINT levantamento_respostas_seccao_check;

ALTER TABLE public.levantamento_respostas
  -- As secções passam a ser da organização: formato de chave.
  ADD CONSTRAINT levantamento_respostas_seccao_check
    CHECK (seccao ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  ADD CONSTRAINT levantamento_respostas_snapshot_textos_check
    CHECK ((pergunta_texto IS NULL OR char_length(pergunta_texto) BETWEEN 1 AND 200)
           AND (seccao_titulo IS NULL OR char_length(seccao_titulo) BETWEEN 1 AND 80)
           AND (bloco IS NULL OR char_length(bloco) BETWEEN 1 AND 80)
           AND (valor_texto IS NULL OR char_length(valor_texto) BETWEEN 1 AND 2000)
           AND (ordem IS NULL OR ordem >= 0)),
  -- tipo NULL: a forma antiga (só a chave em resposta). Com tipo: o snapshot
  -- do que a pessoa viu, coerente com o tipo.
  ADD CONSTRAINT levantamento_respostas_snapshot_check
    CHECK (COALESCE(CASE
      WHEN tipo IS NULL THEN
        resposta IS NOT NULL AND pergunta_texto IS NULL AND seccao_titulo IS NULL AND bloco IS NULL
        AND ordem IS NULL AND escolhas IS NULL AND escolhas_texto IS NULL
        AND valor_texto IS NULL AND valor_numero IS NULL
      WHEN pergunta_texto IS NULL OR seccao_titulo IS NULL OR ordem IS NULL THEN false
      WHEN tipo = 'escolha_unica' THEN
        escolhas IS NOT NULL AND escolhas_texto IS NOT NULL
        AND array_ndims(escolhas) = 1 AND cardinality(escolhas) = 1
        AND array_ndims(escolhas_texto) = 1 AND cardinality(escolhas_texto) = 1
        AND escolhas[1] IS NOT NULL AND escolhas_texto[1] IS NOT NULL
        AND resposta IS NOT NULL AND resposta = escolhas[1]
        AND valor_texto IS NULL AND valor_numero IS NULL
      WHEN tipo = 'escolha_multipla' THEN
        escolhas IS NOT NULL AND escolhas_texto IS NOT NULL
        AND array_ndims(escolhas) = 1 AND cardinality(escolhas) BETWEEN 1 AND 30
        AND array_ndims(escolhas_texto) = 1 AND cardinality(escolhas_texto) = cardinality(escolhas)
        AND array_position(escolhas, NULL) IS NULL AND array_position(escolhas_texto, NULL) IS NULL
        AND resposta IS NULL AND valor_texto IS NULL AND valor_numero IS NULL
      WHEN tipo = 'texto' THEN
        valor_texto IS NOT NULL AND resposta IS NULL AND escolhas IS NULL AND escolhas_texto IS NULL
        AND valor_numero IS NULL
      WHEN tipo = 'numero' THEN
        valor_numero IS NOT NULL AND resposta IS NULL AND escolhas IS NULL AND escolhas_texto IS NULL
        AND valor_texto IS NULL
      ELSE false
    END, false));

-- Contar respostas de uma pergunta (D4) e ligar respostas à configuração.
CREATE INDEX idx_levantamento_respostas_org_pergunta
  ON public.levantamento_respostas (organization_id, pergunta);

COMMENT ON COLUMN public.levantamento_respostas.tipo IS
  'Snapshot (20261226070000): tipo da pergunta quando se respondeu. NULL = resposta antiga, só com a chave em resposta.';

-- ============================================================
-- 5. Sementeira: o catálogo de hoje (gerado a partir do código)
-- ============================================================

CREATE FUNCTION public.fn_neg_semear_questionario(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Gerado por gen/montar.py a partir de SECCOES_VISITA e BLOCO_QUALIFICACAO
  -- (worktree negocios-prototipo, src/components/negocio-metas). Só pt (D1).
  c_catalogo CONSTANT jsonb := $catalogo$[
    {"chave": "visitas", "titulo": "Visitas", "aba": "visita", "especial": "visitas", "perguntas": []},
    {"chave": "exterior", "titulo": "Exterior do edifício", "aba": "visita", "especial": null, "perguntas": [
      {"chave": "acesso", "texto": "Acesso", "bloco": "Acesso e estacionamento", "opcoes": [{"chave": "facil", "texto": "Fácil"}, {"chave": "dificil", "texto": "Difícil"}], "se": null},
      {"chave": "impactoPreco", "texto": "Impacto no preço", "bloco": "Acesso e estacionamento", "opcoes": [{"chave": "p5", "texto": "5%"}, {"chave": "p10", "texto": "10%"}, {"chave": "p15", "texto": "15%"}, {"chave": "p20", "texto": "20%"}], "se": {"pergunta": "acesso", "opcoes": ["dificil"], "sem_resposta": false}},
      {"chave": "estacionamento", "texto": "Estacionamento", "bloco": "Acesso e estacionamento", "opcoes": [{"chave": "pago", "texto": "Pago"}, {"chave": "naoPago", "texto": "Não pago"}, {"chave": "sem", "texto": "Sem estacionamento"}], "se": null},
      {"chave": "zonaEstacionamento", "texto": "Zona de estacionamento", "bloco": "Acesso e estacionamento", "opcoes": [{"chave": "verde", "texto": "Verde"}, {"chave": "amarela", "texto": "Amarela"}, {"chave": "vermelha", "texto": "Vermelha"}], "se": {"pergunta": "estacionamento", "opcoes": ["pago"], "sem_resposta": false}},
      {"chave": "distEntulho", "texto": "Da porta ao big bag ou contentor", "bloco": "Acesso e estacionamento", "opcoes": [{"chave": "ate10", "texto": "Até 10 m"}, {"chave": "de10a30", "texto": "10 a 30 m"}, {"chave": "mais30", "texto": "Mais de 30 m"}], "se": null},
      {"chave": "temElevador", "texto": "Tem elevador", "bloco": "O prédio", "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null}
    ]},
    {"chave": "interior", "titulo": "Interior do espaço", "aba": "visita", "especial": null, "perguntas": [
      {"chave": "tipoEspaco", "texto": "Tipo de espaço", "bloco": "O espaço", "opcoes": [{"chave": "casa", "texto": "Casa"}, {"chave": "escritorio", "texto": "Escritório"}], "se": null},
      {"chave": "tipologia", "texto": "Tipologia", "bloco": "O espaço", "opcoes": [{"chave": "t0", "texto": "T0"}, {"chave": "t1", "texto": "T1"}, {"chave": "t2", "texto": "T2"}, {"chave": "t3", "texto": "T3"}, {"chave": "t4", "texto": "T4"}, {"chave": "t5mais", "texto": "T5+"}], "se": {"pergunta": "tipoEspaco", "opcoes": ["casa"], "sem_resposta": true}},
      {"chave": "epoca", "texto": "Época de construção", "bloco": "O espaço", "opcoes": [{"chave": "antes1950", "texto": "Antes de 1950"}, {"chave": "de1950a1970", "texto": "1950 a 1970"}, {"chave": "de1970a1990", "texto": "1970 a 1990"}, {"chave": "de1990a2010", "texto": "1990 a 2010"}, {"chave": "depois2010", "texto": "Depois de 2010"}], "se": null},
      {"chave": "eletrica", "texto": "Instalação elétrica", "bloco": "Instalações", "opcoes": [{"chave": "antiga", "texto": "Antiga"}, {"chave": "renovada", "texto": "Renovada"}], "se": null},
      {"chave": "quadroDiferencial", "texto": "Quadro com diferencial", "bloco": "Instalações", "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null},
      {"chave": "canalizacao", "texto": "Canalização", "bloco": "Instalações", "opcoes": [{"chave": "ferro", "texto": "Ferro"}, {"chave": "pvc", "texto": "PVC"}, {"chave": "multicamada", "texto": "Multicamada"}, {"chave": "cobre", "texto": "Cobre"}, {"chave": "misto", "texto": "Misto"}, {"chave": "naoSei", "texto": "Não sei"}], "se": null},
      {"chave": "gas", "texto": "Gás", "bloco": "Instalações", "opcoes": [{"chave": "canalizado", "texto": "Canalizado"}, {"chave": "garrafa", "texto": "Garrafa"}, {"chave": "semGas", "texto": "Sem gás"}], "se": null},
      {"chave": "amianto", "texto": "Amianto", "bloco": "Durante a obra", "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}, {"chave": "naoSei", "texto": "Não sei"}], "se": null},
      {"chave": "habitada", "texto": "Habitada durante a obra", "bloco": "Durante a obra", "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null},
      {"chave": "animais", "texto": "Animais", "bloco": "Durante a obra", "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null}
    ]},
    {"chave": "area", "titulo": "Área de intervenção", "aba": "visita", "especial": null, "perguntas": [
      {"chave": "intervencao", "texto": "Intervenção", "bloco": "A divisão", "opcoes": [{"chave": "total", "texto": "Remodelação total"}, {"chave": "parcial", "texto": "Remodelação parcial"}, {"chave": "substituir", "texto": "Só substituir"}], "se": null},
      {"chave": "peDireito", "texto": "Pé-direito", "bloco": "A divisão", "opcoes": [{"chave": "m24", "texto": "2,4 m"}, {"chave": "m25", "texto": "2,5 m"}, {"chave": "m26", "texto": "2,6 m"}, {"chave": "m27", "texto": "2,7 m"}, {"chave": "m28", "texto": "2,8 m"}, {"chave": "m3", "texto": "3 m ou mais"}], "se": null},
      {"chave": "gasArea", "texto": "Gás na área", "bloco": "Instalações da divisão", "opcoes": [{"chave": "naoHa", "texto": "Não há"}, {"chave": "manter", "texto": "Manter"}, {"chave": "anular", "texto": "Anular"}, {"chave": "instalar", "texto": "Instalar"}], "se": null},
      {"chave": "toalheiro", "texto": "Toalheiro elétrico", "bloco": "Instalações da divisão", "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null},
      {"chave": "janela", "texto": "Janela na área", "bloco": "Instalações da divisão", "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null},
      {"chave": "localCortes", "texto": "Onde se fazem os cortes", "bloco": "Trabalho e proteções", "opcoes": [{"chave": "propria", "texto": "Na própria área"}, {"chave": "varanda", "texto": "Varanda"}, {"chave": "fora", "texto": "Fora (garagem, rua)"}], "se": null},
      {"chave": "distEntrada", "texto": "Da entrada até à área", "bloco": "Trabalho e proteções", "opcoes": [{"chave": "curta", "texto": "Curta (até 5 m)"}, {"chave": "media", "texto": "Média (5–15 m)"}, {"chave": "longa", "texto": "Longa (+15 m)"}], "se": null},
      {"chave": "mobilada", "texto": "Casa mobilada no caminho", "bloco": "Trabalho e proteções", "opcoes": [{"chave": "pouco", "texto": "Pouco"}, {"chave": "medio", "texto": "Médio"}, {"chave": "muito", "texto": "Muito"}], "se": null}
    ]},
    {"chave": "medidas", "titulo": "Medidas da área", "aba": "visita", "especial": "medidas", "perguntas": []},
    {"chave": "necessidades", "titulo": "Necessidades do cliente", "aba": "visita", "especial": null, "perguntas": [
      {"chave": "mantemLoucas", "texto": "O cliente mantém a sanita e a base de duche?", "bloco": "O que o cliente mantém", "opcoes": [{"chave": "sim", "texto": "Sim, mantém"}, {"chave": "nao", "texto": "Não, vai trocar"}], "se": null},
      {"chave": "mantemBanheira", "texto": "O cliente mantém a banheira?", "bloco": "O que o cliente mantém", "opcoes": [{"chave": "sim", "texto": "Sim, mantém"}, {"chave": "nao", "texto": "Não, vai trocar"}], "se": null},
      {"chave": "mantemPavimento", "texto": "O cliente mantém o pavimento?", "bloco": "O que o cliente mantém", "opcoes": [{"chave": "sim", "texto": "Sim, mantém"}, {"chave": "nao", "texto": "Não, vai trocar"}], "se": null},
      {"chave": "mantemMoveis", "texto": "O cliente mantém os móveis?", "bloco": "O que o cliente mantém", "opcoes": [{"chave": "sim", "texto": "Sim, mantém"}, {"chave": "nao", "texto": "Não, vai trocar"}], "se": null}
    ]},
    {"chave": "escolhas", "titulo": "Escolhas do cliente", "aba": "visita", "especial": null, "perguntas": [
      {"chave": "materiaisCliente", "texto": "O cliente fornece materiais", "bloco": null, "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null},
      {"chave": "mobilidadeReduzida", "texto": "Mobilidade reduzida", "bloco": null, "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null}
    ]},
    {"chave": "qualificacao", "titulo": "Qualificação", "aba": "qualificacao", "especial": null, "perguntas": [
      {"chave": "imovel", "texto": "Tipo de imóvel", "bloco": null, "opcoes": [{"chave": "apartamento", "texto": "Apartamento"}, {"chave": "moradia", "texto": "Moradia"}, {"chave": "loja", "texto": "Loja"}, {"chave": "escritorio", "texto": "Escritório"}], "se": null},
      {"chave": "posse", "texto": "O cliente é", "bloco": null, "opcoes": [{"chave": "proprietario", "texto": "Proprietário"}, {"chave": "inquilino", "texto": "Inquilino"}, {"chave": "administracao", "texto": "Administração"}], "se": null},
      {"chave": "decisor", "texto": "Quem decide", "bloco": null, "opcoes": [{"chave": "proprio", "texto": "O próprio"}, {"chave": "familia", "texto": "Com a família"}, {"chave": "administracao", "texto": "Administração"}], "se": null},
      {"chave": "orcCliente", "texto": "Orçamento do cliente", "bloco": null, "opcoes": [{"chave": "ate3000", "texto": "Até 3.000 €"}, {"chave": "de3000a6000", "texto": "3.000 a 6.000 €"}, {"chave": "de6000a10000", "texto": "6.000 a 10.000 €"}, {"chave": "mais10000", "texto": "Mais de 10.000 €"}, {"chave": "naoSabe", "texto": "Não sabe"}], "se": null},
      {"chave": "prazo", "texto": "Para quando", "bloco": null, "opcoes": [{"chave": "urgente", "texto": "Urgente (1 mês)"}, {"chave": "de1a3", "texto": "1 a 3 meses"}, {"chave": "de3a6", "texto": "3 a 6 meses"}, {"chave": "semPressa", "texto": "Sem pressa"}], "se": null},
      {"chave": "outrosOrc", "texto": "Pediu outros orçamentos", "bloco": null, "opcoes": [{"chave": "sim", "texto": "Sim"}, {"chave": "nao", "texto": "Não"}], "se": null}
    ]}
  ]$catalogo$::jsonb;
  v_s integer;
  v_p integer;
  v_o integer;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Sementeira do questionário: falta a organização.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Sementeira do questionário: a organização não tem a página Pessoas activa.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.levantamento_questionario q WHERE q.organization_id = p_organization_id) THEN
    RETURN jsonb_build_object('semeado', false);
  END IF;

  INSERT INTO public.levantamento_questionario (organization_id, versao) VALUES (p_organization_id, 1);

  INSERT INTO public.levantamento_seccoes (organization_id, chave, titulo, aba, especial, ordem)
  SELECT p_organization_id, s.value ->> 'chave', s.value ->> 'titulo', s.value ->> 'aba',
         s.value ->> 'especial', (s.ord - 1)::integer
  FROM jsonb_array_elements(c_catalogo) WITH ORDINALITY AS s(value, ord);
  GET DIAGNOSTICS v_s = ROW_COUNT;

  INSERT INTO public.levantamento_perguntas (organization_id, seccao_id, chave, texto, bloco, tipo, ordem)
  SELECT p_organization_id, ls.id, q.value ->> 'chave', q.value ->> 'texto', q.value ->> 'bloco',
         'escolha_unica', (q.ord - 1)::integer
  FROM jsonb_array_elements(c_catalogo) AS s(value)
  JOIN public.levantamento_seccoes ls
    ON ls.organization_id = p_organization_id AND ls.chave = s.value ->> 'chave'
  CROSS JOIN LATERAL jsonb_array_elements(s.value -> 'perguntas') WITH ORDINALITY AS q(value, ord);
  GET DIAGNOSTICS v_p = ROW_COUNT;

  INSERT INTO public.levantamento_opcoes (organization_id, pergunta_id, chave, texto, ordem)
  SELECT p_organization_id, lp.id, o.value ->> 'chave', o.value ->> 'texto', (o.ord - 1)::integer
  FROM jsonb_array_elements(c_catalogo) AS s(value)
  CROSS JOIN LATERAL jsonb_array_elements(s.value -> 'perguntas') AS q(value)
  JOIN public.levantamento_perguntas lp
    ON lp.organization_id = p_organization_id AND lp.chave = q.value ->> 'chave'
  CROSS JOIN LATERAL jsonb_array_elements(q.value -> 'opcoes') WITH ORDINALITY AS o(value, ord);
  GET DIAGNOSTICS v_o = ROW_COUNT;

  -- As condições (um nível): a pergunta aparece se a outra tiver uma destas opções
  -- (e também sem resposta, quando o código tinha a chave vazia "").
  UPDATE public.levantamento_perguntas lp
  SET depende_de = alvo.id,
      depende_opcoes = ARRAY(SELECT jsonb_array_elements_text(q.value -> 'se' -> 'opcoes')),
      depende_sem_resposta = (q.value -> 'se' ->> 'sem_resposta')::boolean
  FROM jsonb_array_elements(c_catalogo) AS s(value)
  CROSS JOIN LATERAL jsonb_array_elements(s.value -> 'perguntas') AS q(value)
  JOIN public.levantamento_perguntas alvo
    ON alvo.organization_id = p_organization_id AND alvo.chave = q.value -> 'se' ->> 'pergunta'
  WHERE jsonb_typeof(q.value -> 'se') = 'object'
    AND lp.organization_id = p_organization_id AND lp.chave = q.value ->> 'chave';

  RETURN jsonb_build_object('semeado', true, 'seccoes', v_s, 'perguntas', v_p, 'opcoes', v_o);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_semear_questionario(uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_neg_semear_questionario(uuid) IS
  'Pessoas, levantamento configurável: copia o catálogo de hoje (8 secções, 36 perguntas de escolha única, 109 opções, 3 condições; textos pt) para uma organização com negocio_workflow_config e sem questionário; devolve {semeado}. Só para migrations (sem EXECUTE para ninguém além do dono). 20261226070000.';

-- ============================================================
-- CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  v_t   text;
  v_txt text;
BEGIN
  -- 1. As quatro tabelas: dono postgres, RLS sem FORCE, quatro políticas com
  --    os nomes esperados, e privilégios (authenticated só SELECT; anon nada).
  FOREACH v_t IN ARRAY ARRAY['levantamento_questionario', 'levantamento_seccoes',
                             'levantamento_perguntas', 'levantamento_opcoes']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
                   WHERE c.oid = pg_catalog.to_regclass('public.' || v_t)
                     AND pg_catalog.pg_get_userbyid(c.relowner)::text = 'postgres'
                     AND c.relrowsecurity AND NOT c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'CONFERIR (1. dono ou RLS): %', v_t;
    END IF;
    IF (SELECT string_agg(po.polname::text || ':' || po.polcmd::text || ':' || po.polpermissive::text, ','
                          ORDER BY po.polname::text)
        FROM pg_catalog.pg_policy po WHERE po.polrelid = pg_catalog.to_regclass('public.' || v_t))
       IS DISTINCT FROM v_t || '_no_delete:d:false,' || v_t || '_no_insert:a:false,'
                        || v_t || '_no_update:w:false,' || v_t || '_select:r:true' THEN
      RAISE EXCEPTION 'CONFERIR (1. políticas): %', v_t;
    END IF;
    IF NOT pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'SELECT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'INSERT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'UPDATE')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'DELETE')
       OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'TRUNCATE')
       OR pg_catalog.has_table_privilege('anon', 'public.' || v_t, 'SELECT')
       OR pg_catalog.has_table_privilege('anon', 'public.' || v_t, 'INSERT')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) a
                  WHERE c.oid = pg_catalog.to_regclass('public.' || v_t) AND a.grantee = 0) THEN
      RAISE EXCEPTION 'CONFERIR (1. privilégios): %', v_t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                   WHERE t.tgrelid = pg_catalog.to_regclass('public.' || v_t)
                     AND t.tgname::text = 'trg_00_' || v_t || '_guardar' AND t.tgenabled::text = 'O') THEN
      RAISE EXCEPTION 'CONFERIR (1. trigger): %', v_t;
    END IF;
  END LOOP;

  -- 2. Nenhuma organização semeada aqui.
  IF EXISTS (SELECT 1 FROM public.levantamento_questionario) THEN
    RAISE EXCEPTION 'CONFERIR (2. não devia haver questionários)';
  END IF;

  -- 3. levantamento_respostas: colunas novas, resposta opcional, restrições.
  IF (SELECT string_agg(a.attname::text || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)::text
                        || ':' || a.attnotnull::text, ',' ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.levantamento_respostas'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM 'id:uuid:true,levantamento_id:uuid:true,organization_id:uuid:true,seccao:text:true,'
                      'pergunta:text:true,resposta:text:false,created_at:timestamp with time zone:true,'
                      'updated_at:timestamp with time zone:true,tipo:text:false,pergunta_texto:text:false,'
                      'seccao_titulo:text:false,bloco:text:false,ordem:integer:false,escolhas:text[]:false,'
                      'escolhas_texto:text[]:false,valor_texto:text:false,valor_numero:numeric(14,3):false' THEN
    RAISE EXCEPTION 'CONFERIR (3. colunas de levantamento_respostas)';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint k
      WHERE k.conrelid = 'public.levantamento_respostas'::regclass AND k.contype::text = 'c' AND k.convalidated
        AND k.conname::text IN ('levantamento_respostas_seccao_check', 'levantamento_respostas_snapshot_check',
                                'levantamento_respostas_snapshot_textos_check', 'levantamento_respostas_resposta_check',
                                'levantamento_respostas_pergunta_check')) <> 5
     OR (SELECT pg_catalog.pg_get_constraintdef(k.oid)::text FROM pg_catalog.pg_constraint k
         WHERE k.conrelid = 'public.levantamento_respostas'::regclass
           AND k.conname::text = 'levantamento_respostas_seccao_check') NOT LIKE '%^[a-z][A-Za-z0-9]{0,39}$%' THEN
    RAISE EXCEPTION 'CONFERIR (3. restrições de levantamento_respostas)';
  END IF;
  -- As políticas e os triggers de levantamento_respostas não mudaram.
  IF (SELECT count(*) FROM pg_catalog.pg_policy po
      WHERE po.polrelid = 'public.levantamento_respostas'::regclass) <> 5
     OR (SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text) FROM pg_catalog.pg_trigger t
         WHERE t.tgrelid = 'public.levantamento_respostas'::regclass AND NOT t.tgisinternal)
        IS DISTINCT FROM 'trg_00_levantamento_respostas_guardar,trg_levantamento_respostas_updated_at' THEN
    RAISE EXCEPTION 'CONFERIR (3. políticas ou triggers de levantamento_respostas mudaram)';
  END IF;

  -- 4. Funções novas: atributos e privilégios (só o dono executa).
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                 WHERE p.oid = pg_catalog.to_regprocedure('public.fn_neg_semear_questionario(uuid)')
                   AND p.prosecdef AND p.provolatile::text = 'v'
                   AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
                   AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[])
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_levantamento_config_guardar()')
                      AND NOT p.prosecdef
                      AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]) THEN
    RAISE EXCEPTION 'CONFERIR (4. atributos das funções novas)';
  END IF;
  v_txt := (SELECT string_agg(f.sig || '/' || r.rol, ', ')
            FROM (VALUES ('public.fn_neg_semear_questionario(uuid)'),
                         ('public.fn_levantamento_config_guardar()')) AS f(sig)
            CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rol)
            WHERE pg_catalog.has_function_privilege(r.rol, f.sig, 'EXECUTE'));
  IF v_txt IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
                WHERE p.oid IN (pg_catalog.to_regprocedure('public.fn_neg_semear_questionario(uuid)'),
                                pg_catalog.to_regprocedure('public.fn_levantamento_config_guardar()'))
                  AND a.grantee = 0) THEN
    RAISE EXCEPTION 'CONFERIR (4. privilégios a mais): %', COALESCE(v_txt, 'PUBLIC');
  END IF;
END
$conferir$;

COMMIT;
