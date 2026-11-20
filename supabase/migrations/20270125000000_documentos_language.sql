-- ============================================================
-- Idioma dos documentos: coluna `language` em propostas e contratos
-- ============================================================
-- O que faz: acrescenta a coluna `language text NULL` a public.proposals e a
-- public.client_contracts, com um CHECK de formato e um comentario. Nada mais.
--
-- ADITIVA. Sem default e sem NOT NULL: todas as linhas existentes ficam com
-- language = NULL, que significa "portugues", exactamente o comportamento de
-- hoje. ADD COLUMN nulo e sem default nao reescreve a tabela (so catalogo).
-- O CHECK e validado ja (sem NOT VALID): a coluna e nova e toda nula, por isso
-- a validacao nao tem nada a recusar (base RH: proposals ~33 linhas,
-- client_contracts ~39, lido em pg_class.reltuples a 19/11).
--
-- Valores: codigos de idioma ISO 639-1 em minusculas, com regiao opcional, e
-- varios separados por "+", na ordem em que aparecem no documento.
--   pt | en | pt+en | en+pt | pt-BR
--
-- Leitura no codigo novo:
--   row.language ?? prompt_values.__idiomas ?? ['pt']
-- O CODIGO QUE USA ESTA COLUNA NAO A PODE SELECIONAR ANTES DE ESTA MIGRATION
-- ESTAR APLICADA: pedir uma coluna que nao existe faz falhar TODAS as leituras
-- da tabela no PostgREST. Migration primeiro, codigo depois (ou juntos).
--
-- Nao toca em triggers nem em funcoes. Em particular ficam iguais
-- trg_proposals_freeze_template_snapshot, trg_contracts_freeze_template,
-- trg_proposals_mark_dirty e compute_proposal_business_hash (lista explicita de
-- colunas: a coluna nova NAO entra no hash de negocio, por isso mudar so o
-- idioma nao marca a proposta como "com alteracoes por publicar").
-- republish_proposal_snapshot/record_proposal_decision usam row_to_json(p.*):
-- os snapshots publicados a partir daqui levam a chave "language" (aditivo; o
-- hash nao e calculado sobre o snapshot).
--
-- Privilegios: as duas tabelas tem GRANT ao nivel da tabela (lido em
-- pg_class.relacl: proposals -> authenticated, service_role; client_contracts
-- -> anon, authenticated, service_role) e NENHUMA concessao por coluna
-- (pg_attribute.attacl vazio). A coluna nova herda portanto os mesmos acessos
-- que as vizinhas, sem GRANT nenhum; o bloco de conferir verifica-o.
--
-- Mesma migration que a da main (20261229540000_documentos_language.sql),
-- trazida para o ramo RH com carimbo novo (posterior a todos os do remoto RH
-- e da pasta). Idempotente: na base principal, onde a da main ja correu, e
-- um no-op (IF NOT EXISTS na coluna e no CHECK; o conferir nao exige linhas
-- vazias, ao contrario do da main).
--
-- MIGRATION E CODIGO ENTRAM JUNTOS: o codigo do ramo RH (gerar contrato e
-- criar proposta com escolha de idioma) le e grava esta coluna.
--
-- Em qualquer base: so ganha uma coluna nula nas duas tabelas. Nenhuma linha
-- muda, nenhum ecra muda de comportamento.
-- ============================================================

SET LOCAL lock_timeout = '5s';

-- ─── 1. Colunas ─────────────────────────────────────────────────────────────
ALTER TABLE public.proposals        ADD COLUMN IF NOT EXISTS language text NULL;
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS language text NULL;

-- ─── 2. CHECK de formato ────────────────────────────────────────────────────
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.proposals'::regclass
                   AND conname = 'proposals_language_formato_chk') THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_language_formato_chk
      CHECK (language IS NULL OR language ~ '^[a-z]{2}(-[A-Za-z]{2})?(\+[a-z]{2}(-[A-Za-z]{2})?)*$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.client_contracts'::regclass
                   AND conname = 'client_contracts_language_formato_chk') THEN
    ALTER TABLE public.client_contracts
      ADD CONSTRAINT client_contracts_language_formato_chk
      CHECK (language IS NULL OR language ~ '^[a-z]{2}(-[A-Za-z]{2})?(\+[a-z]{2}(-[A-Za-z]{2})?)*$');
  END IF;
END $c$;

-- ─── 3. Comentarios ─────────────────────────────────────────────────────────
COMMENT ON COLUMN public.proposals.language IS
  'Idioma(s) do documento. NULL = portugues (comportamento anterior a coluna). '
  'Valores: codigos de idioma ISO 639-1 (regiao opcional, ex. pt-BR) separados por "+", '
  'na ordem em que aparecem no documento (ex.: pt, en, pt+en).';

COMMENT ON COLUMN public.client_contracts.language IS
  'Idioma(s) do documento. NULL = portugues (comportamento anterior a coluna). '
  'Valores: codigos de idioma ISO 639-1 (regiao opcional, ex. pt-BR) separados por "+", '
  'na ordem em que aparecem no documento (ex.: pt, en, pt+en).';

-- ─── 4. Conferir ────────────────────────────────────────────────────────────
DO $v$
DECLARE
  t   text;
  viz text;
  r   text;
  p   text;
  col record;
BEGIN
  FOREACH t IN ARRAY ARRAY['proposals', 'client_contracts'] LOOP
    SELECT c.data_type::text AS data_type, c.is_nullable::text AS is_nullable,
           c.column_default::text AS column_default
      INTO col
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = t AND c.column_name = 'language';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conferir: %.language nao existe', t;
    END IF;
    IF col.data_type <> 'text' THEN
      RAISE EXCEPTION 'conferir: %.language e % (esperado text)', t, col.data_type;
    END IF;
    IF col.is_nullable <> 'YES' THEN
      RAISE EXCEPTION 'conferir: %.language e NOT NULL', t;
    END IF;
    IF col.column_default IS NOT NULL THEN
      RAISE EXCEPTION 'conferir: %.language tem default %', t, col.column_default;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint k
                   WHERE k.conrelid = format('public.%I', t)::regclass
                     AND k.conname::text = t || '_language_formato_chk'
                     AND k.contype::text = 'c'
                     AND k.convalidated) THEN
      RAISE EXCEPTION 'conferir: CHECK %_language_formato_chk em falta ou por validar', t;
    END IF;

    IF col_description(format('public.%I', t)::regclass,
                       (SELECT a.attnum FROM pg_attribute a
                         WHERE a.attrelid = format('public.%I', t)::regclass
                           AND a.attname = 'language')::int) IS NULL THEN
      RAISE EXCEPTION 'conferir: %.language sem comentario', t;
    END IF;

    -- (A main conferia aqui «zero linhas preenchidas». Tirado de proposito: na
    -- base principal a coluna ja existe e ja tem valores escritos pelo codigo, e
    -- esse teste faria esta migration rebentar la quando o ramo RH chegar a main.)

    -- Sem concessoes por coluna: os acessos vem da tabela e sao os das vizinhas.
    IF EXISTS (SELECT 1 FROM pg_attribute a
               WHERE a.attrelid = format('public.%I', t)::regclass
                 AND a.attname = 'language' AND a.attacl IS NOT NULL) THEN
      RAISE EXCEPTION 'conferir: %.language tem ACL por coluna inesperada', t;
    END IF;
    viz := CASE t WHEN 'proposals' THEN 'title' ELSE 'notes' END;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
        IF has_column_privilege(r, format('public.%I', t), 'language', p)
           IS DISTINCT FROM has_column_privilege(r, format('public.%I', t), viz, p) THEN
          RAISE EXCEPTION 'conferir: %.language: % de % diferente da coluna %', t, p, r, viz;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Os triggers de snapshot e de "alteracoes por publicar" continuam la e ligados.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger g
                 WHERE g.tgrelid = 'public.proposals'::regclass
                   AND g.tgname::text = 'trg_proposals_freeze_template_snapshot'
                   AND g.tgenabled::text = 'O') THEN
    RAISE EXCEPTION 'conferir: trg_proposals_freeze_template_snapshot em falta ou desligado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger g
                 WHERE g.tgrelid = 'public.client_contracts'::regclass
                   AND g.tgname::text = 'trg_contracts_freeze_template'
                   AND g.tgenabled::text = 'O') THEN
    RAISE EXCEPTION 'conferir: trg_contracts_freeze_template em falta ou desligado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger g
                 WHERE g.tgrelid = 'public.proposals'::regclass
                   AND g.tgname::text = 'trg_proposals_mark_dirty'
                   AND g.tgenabled::text = 'O') THEN
    RAISE EXCEPTION 'conferir: trg_proposals_mark_dirty em falta ou desligado';
  END IF;
  IF to_regprocedure('public.compute_proposal_business_hash(uuid)') IS NULL THEN
    RAISE EXCEPTION 'conferir: compute_proposal_business_hash(uuid) em falta';
  END IF;
END $v$;
