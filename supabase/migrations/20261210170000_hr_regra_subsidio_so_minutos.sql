-- ==============================================================================
-- hr_regras_subsidio_alimentacao -- so o tempo minimo por dia e da organizacao.
--
-- POR APLICAR. PRECISA DO CODIGO NOVO NO MESMO COMMIT.
--
--
-- -- A DECISAO -----------------------------------------------------------------
--
-- O valor e o modo (cartao/dinheiro) do subsidio de alimentacao sao SO POR
-- PESSOA: pessoas_retribuicoes.subsidio_alimentacao e
-- pessoas_retribuicoes.subsidio_alimentacao_modo. A organizacao deixa de ter
-- valor por omissao. A unica regra que continua a ser da organizacao e
-- hr_regras_subsidio_alimentacao.minutos_minimos_dia (quantos minutos
-- trabalhados num dia dao direito ao subsidio desse dia).
--
-- Pessoa sem subsidio definido (NULL) = 0, com o aviso "sem subsidio definido"
-- no processamento.
--
--
-- -- O QUE ESTA MIGRATION FAZ --------------------------------------------------
--
-- SO COMENTARIOS. Marca valor_diario e modo como OBSOLETOS e diz na tabela que
-- so minutos_minimos_dia e usado. Sem DROP, sem alterar dados, sem tocar na
-- linha de nenhuma organizacao: as colunas ficam (NOT NULL, com DEFAULT) ate
-- serem retiradas numa migration posterior.
--
--
-- -- O CODIGO QUE TEM DE ENTRAR JUNTO ------------------------------------------
--
-- Esta migration so e verdadeira se o codigo ja nao usar as colunas:
--   src/hooks/useRegrasSubsidioAlimentacao.ts  (le e grava so minutos_minimos_dia)
--   src/lib/hr/processamentoTotais.ts          (valor so da pessoa)
--   src/pages/ConfiguracaoVencimento.tsx       (seccao so com o tempo minimo)
-- Aplicar o codigo antigo contra este comentario nao parte nada (e so
-- documentacao), mas deixaria o comentario a mentir.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Nao e preciso: so comentarios. Para repor os textos antigos, ver
-- 20261201200000_hr_regras_subsidio_alimentacao.sql.
--
-- Prerequisito:
--   20261201200000  hr_regras_subsidio_alimentacao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_coluna text;
BEGIN
  IF to_regclass('public.hr_regras_subsidio_alimentacao') IS NULL THEN
    RAISE EXCEPTION 'public.hr_regras_subsidio_alimentacao nao existe. Aplicar 20261201200000 primeiro.';
  END IF;

  FOREACH v_coluna IN ARRAY ARRAY['valor_diario', 'modo', 'minutos_minimos_dia']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'hr_regras_subsidio_alimentacao'
         AND column_name = v_coluna
    ) THEN
      RAISE EXCEPTION 'public.hr_regras_subsidio_alimentacao.% nao existe -- o schema mudou. Investigar antes de aplicar.', v_coluna;
    END IF;
  END LOOP;
END;
$guardas$;

-- ==============================================================================
-- 1. Os comentarios
-- ==============================================================================
COMMENT ON TABLE public.hr_regras_subsidio_alimentacao IS
'Regra do subsidio de alimentacao da organizacao, uma linha por organizacao (UNIQUE em organization_id). SO minutos_minimos_dia e usado: quantos minutos trabalhados num dia dao direito ao subsidio desse dia. O valor e o modo do subsidio sao por pessoa (pessoas_retribuicoes.subsidio_alimentacao e subsidio_alimentacao_modo); valor_diario e modo desta tabela estao obsoletos.';

COMMENT ON COLUMN public.hr_regras_subsidio_alimentacao.valor_diario IS
'OBSOLETO desde 2026-10-07: o valor e o modo do subsidio sao por pessoa (pessoas_retribuicoes); esta coluna e ignorada pelo codigo e fica ate ser retirada numa migration posterior.';

COMMENT ON COLUMN public.hr_regras_subsidio_alimentacao.modo IS
'OBSOLETO desde 2026-10-07: o valor e o modo do subsidio sao por pessoa (pessoas_retribuicoes); esta coluna e ignorada pelo codigo e fica ate ser retirada numa migration posterior.';

-- ==============================================================================
-- Conferir. Le pg_description e confirma os tres comentarios. Bloco aninhado que
-- TERMINA sempre em HR900 (nada a desfazer: so leitura). Qualquer falha propaga
-- com o seu proprio codigo.
-- ==============================================================================
DO $conferir$
DECLARE
  v_tabela text;
  v_valor  text;
  v_modo   text;
BEGIN
  BEGIN
    SELECT obj_description('public.hr_regras_subsidio_alimentacao'::regclass, 'pg_class')
      INTO v_tabela;

    SELECT d.description INTO v_valor
      FROM pg_description d
      JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid
     WHERE d.classoid = 'pg_class'::regclass
       AND d.objoid = 'public.hr_regras_subsidio_alimentacao'::regclass
       AND a.attname = 'valor_diario';

    SELECT d.description INTO v_modo
      FROM pg_description d
      JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid
     WHERE d.classoid = 'pg_class'::regclass
       AND d.objoid = 'public.hr_regras_subsidio_alimentacao'::regclass
       AND a.attname = 'modo';

    IF v_valor IS NULL OR v_valor NOT LIKE 'OBSOLETO desde 2026-10-07:%' THEN
      RAISE EXCEPTION 'valor_diario devia estar marcada como OBSOLETA; o comentario e: %.', COALESCE(v_valor, 'NULL')
        USING ERRCODE = 'HR901';
    END IF;

    IF v_modo IS NULL OR v_modo NOT LIKE 'OBSOLETO desde 2026-10-07:%' THEN
      RAISE EXCEPTION 'modo devia estar marcada como OBSOLETA; o comentario e: %.', COALESCE(v_modo, 'NULL')
        USING ERRCODE = 'HR902';
    END IF;

    IF v_tabela IS NULL OR v_tabela NOT LIKE '%SO minutos_minimos_dia e usado%' THEN
      RAISE EXCEPTION 'O comentario da tabela devia dizer que so minutos_minimos_dia e usado; e: %.', COALESCE(v_tabela, 'NULL')
        USING ERRCODE = 'HR903';
    END IF;

    RAISE EXCEPTION 'sentinela: conferencia concluida' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL;
  END;
END;
$conferir$;
