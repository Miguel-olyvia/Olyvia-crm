-- ==============================================================================
-- Colocacao no organograma: duas coisas diferentes.
--   Na PESSOA:  VERSIONADA  (pessoas_colocacao_organograma)
--   No CENTRO:  coluna simples (hr_locais_trabalho.organograma_node_id)
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A filial/estrutura a que uma pessoa pertence faz parte do seu percurso --
-- muda quando ha uma transferencia, e a versao anterior continua a ser a
-- verdade sobre o periodo em que vigorou. Um centro de trabalho, pelo
-- contrario, pertence a uma filial de forma estavel; nao ha aqui um requisito
-- de historico por intervalo.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- pessoas_colocacao_organograma: satelite versionado, no molde de
-- pessoas_retribuicoes (uma so versao em aberto por pessoa, nao-sobreposicao
-- por trigger, soft delete). ALTERACAO (hr.pessoas.colocacao.edit) fecha a
-- versao em vigor e abre outra; CORRECCAO (hr.pessoas.colocacao.corrigir,
-- perigosa) mexe num periodo ja decorrido -- mesma distincao de
-- pessoas_afectacoes e pessoas_vinculos_horas, via hr_periodo_decorrido().
--
-- hr_locais_trabalho.organograma_node_id: coluna simples, sem versionamento --
-- um centro nao muda de filial com frequencia suficiente para justificar
-- historico, e editar-se-a pela permissao ja existente hr.locais.edit.
--
--
-- -- REGRA CRITICA: A FK NUNCA VIRA UM SEGUNDO AMBITO DE SEGURANCA -------------
--
-- organograma_node_id, nas duas tabelas, e FK SIMPLES e ANULAVEL contra
-- anew_organizations -- FORA de qualquer chave composta, e NUNCA referida
-- numa politica RLS. O ambito de seguranca continua a ser SEMPRE
-- organization_id; o no do organograma e so um dado de classificacao. A
-- classificacao NUNCA limita a que centros a pessoa pode ser afecta -- por
-- isso pessoas_afectacoes nao tem, e nao ganha, nenhuma referencia a esta
-- coluna.
--
-- E, precisamente porque nao pode entrar na RLS, o travao contra apontar para
-- um no de OUTRA organizacao vive num TRIGGER (BEFORE INSERT/UPDATE),
-- reaproveitado pelas duas tabelas: public.hr_no_pertence_a_arvore_da_org(),
-- que percorre anew_hierarchy a partir de organization_id (a arvore DESSA
-- organizacao, incluindo-a a ela propria) e recusa qualquer no fora dela.
--
--
-- -- COMO SE IDENTIFICA "A ARVORE DA PROPRIA ORGANIZACAO" -----------------------
--
-- organization_id + todos os descendentes em anew_hierarchy (parent_org_id ->
-- child_org_id), no mesmo padrao de get_org_subtree_ids (20261112480000). NAO
-- se sobe para ancestrais: subir sairia do ambito desta organizacao para o de
-- uma holding ou organizacao-mae, que e outra organizacao. A funcao aqui e
-- SECURITY DEFINER (ao contrario de get_org_subtree_ids, que e invoker) porque
-- corre dentro de um trigger de guarda e tem de ver anew_hierarchy por
-- inteiro, independentemente de quem escreve ter ou nao permissao de o ler.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Sem ramo de ficha-propria na politica de SELECT de
--   pessoas_colocacao_organograma: nao foi pedido, e fica em aberto.
-- - Sem auditoria em pessoas_acessos_sensiveis: nao e dado sensivel na
--   classificacao ja usada neste modulo (retribuicao, niss, iban,
--   sindicalizacao, saude).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER IF EXISTS trg_hr_locais_trabalho_organograma_na_arvore ON public.hr_locais_trabalho;
--   ALTER TABLE public.hr_locais_trabalho DROP COLUMN IF EXISTS organograma_node_id;
--   DROP TABLE IF EXISTS public.pessoas_colocacao_organograma;
--   DROP FUNCTION IF EXISTS public.hr_colocacao_organograma_sem_sobreposicao();
--   DROP FUNCTION IF EXISTS public.hr_no_pertence_a_arvore_da_org(uuid, uuid);
--
--
-- Prerequisitos:
--   20261120060000  pessoas_vinculos (nao usado directamente, mas confirma o
--                   estado geral do modulo)
--   20261120130000  hr_locais_trabalho, hr_locais_trabalho_id_org_key
--   20261130050000  catalogo hr.pessoas.colocacao.*
--   20261130060000  public.hr_periodo_decorrido(date)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
     ) THEN
    RAISE EXCEPTION 'public.pessoas ou pessoas_id_org_key nao existem.';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro.';
  END IF;

  IF to_regclass('public.anew_hierarchy') IS NULL THEN
    RAISE EXCEPTION 'public.anew_hierarchy nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_periodo_decorrido' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'public.hr_periodo_decorrido(date) nao existe. Aplicar 20261130060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'hr_satelite_ancora_imutavel() nao existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.colocacao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.colocacao.view nao esta no catalogo. Aplicar 20261130050000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.colocacao.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.colocacao.edit nao esta no catalogo. Aplicar 20261130050000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.colocacao.corrigir') THEN
    RAISE EXCEPTION 'hr.pessoas.colocacao.corrigir nao esta no catalogo. Aplicar 20261130050000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.locais.edit') THEN
    RAISE EXCEPTION 'hr.locais.edit nao esta no catalogo.';
  END IF;

  IF to_regclass('public.pessoas_colocacao_organograma') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'pessoas_colocacao_organograma_pessoa_fkey'
         AND conrelid = to_regclass('public.pessoas_colocacao_organograma')
    ) THEN
      RAISE EXCEPTION 'Ja existe public.pessoas_colocacao_organograma sem a FK esperada -- colisao de nome.';
    END IF;
    RAISE NOTICE 'public.pessoas_colocacao_organograma ja existe; migracao idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- Funcao partilhada: um no do organograma pertence a arvore da organizacao?
-- SECURITY DEFINER: corre dentro de triggers de guarda e tem de ver
-- anew_hierarchy por inteiro, independentemente do RLS de quem escreve.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_no_pertence_a_arvore_da_org(_organization_id uuid, _node_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT _node_id IS NULL
      OR _node_id = _organization_id
      OR EXISTS (
        WITH RECURSIVE arvore AS (
          SELECT _organization_id AS org_id
          UNION
          SELECT h.child_org_id
            FROM public.anew_hierarchy h
            JOIN arvore a ON a.org_id = h.parent_org_id
        )
        SELECT 1 FROM arvore WHERE org_id = _node_id
      )
$$;

COMMENT ON FUNCTION public.hr_no_pertence_a_arvore_da_org(uuid, uuid) IS
'true quando _node_id e a propria organizacao ou um descendente dela em anew_hierarchy (parent_org_id -> child_org_id), ou quando _node_id e NULL (sem classificacao, sempre legitimo). NAO sobe para ancestrais -- so desce, pela mesma logica de get_org_subtree_ids (20261112480000), mas SECURITY DEFINER porque corre num trigger de guarda e nao pode depender do RLS de quem escreve. Usada pelas guardas de organograma de pessoas_colocacao_organograma e hr_locais_trabalho -- NUNCA numa politica RLS, para o no do organograma nunca se tornar um segundo ambito de seguranca.';

-- ==============================================================================
-- pessoas_colocacao_organograma
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_colocacao_organograma (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id             uuid NOT NULL,
  organization_id       uuid NOT NULL,

  -- FK SIMPLES e ANULAVEL, fora de qualquer chave composta. Ver o cabecalho:
  -- nunca pode entrar numa politica RLS.
  organograma_node_id   uuid,

  valido_de             date NOT NULL,
  valido_ate            date,
  motivo                text,

  deleted_at            timestamptz,
  deleted_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,

  CONSTRAINT pessoas_colocacao_organograma_pkey PRIMARY KEY (id),

  CONSTRAINT pessoas_colocacao_organograma_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_colocacao_organograma_no_fkey
    FOREIGN KEY (organograma_node_id) REFERENCES public.anew_organizations (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_colocacao_organograma_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_colocacao_organograma_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_colocacao_organograma_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_colocacao_organograma_ate_depois_de
    CHECK (valido_ate IS NULL OR valido_ate >= valido_de)
);

COMMENT ON TABLE public.pessoas_colocacao_organograma IS
'A que no do organograma a pessoa esta colocada, versionado por intervalo -- a filial faz parte do percurso. Uma so versao em aberto por pessoa (indice unico parcial + trigger de nao-sobreposicao, molde de pessoas_retribuicoes). NAO limita a que centros a pessoa pode ser afecta: pessoas_afectacoes nao tem nenhuma referencia a esta tabela.';

COMMENT ON COLUMN public.pessoas_colocacao_organograma.organograma_node_id IS
'FK SIMPLES e ANULAVEL a anew_organizations, fora de qualquer chave composta e nunca referida em politica RLS -- e apenas classificacao, nunca ambito de seguranca (esse continua a ser sempre organization_id). Um trigger BEFORE INSERT/UPDATE (hr_no_pertence_a_arvore_da_org) recusa um no que nao pertenca a arvore da propria organization_id.';

CREATE INDEX IF NOT EXISTS idx_pessoas_colocacao_organograma_pessoa_id
  ON public.pessoas_colocacao_organograma (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_colocacao_organograma_organization_id
  ON public.pessoas_colocacao_organograma (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_colocacao_organograma_no
  ON public.pessoas_colocacao_organograma (organograma_node_id)
  WHERE organograma_node_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_colocacao_organograma_aberta
  ON public.pessoas_colocacao_organograma (pessoa_id)
  WHERE valido_ate IS NULL AND deleted_at IS NULL;

-- ---- Nao-sobreposicao, no molde exacto de hr_retribuicoes_sem_sobreposicao --
CREATE OR REPLACE FUNCTION public.hr_colocacao_organograma_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id, c.valido_de, c.valido_ate INTO v_conflito
    FROM public.pessoas_colocacao_organograma c
   WHERE c.pessoa_id = NEW.pessoa_id
     AND c.deleted_at IS NULL
     AND c.id <> NEW.id
     AND daterange(c.valido_de, c.valido_ate, '[)')
         && daterange(NEW.valido_de, NEW.valido_ate, '[)')
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'colocacao_organograma_sobreposta: o intervalo % a % cruza-se com a versao % (% a %). Fechar a versao anterior (valido_ate) antes de criar a nova.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_conflito.id, v_conflito.valido_de, coalesce(v_conflito.valido_ate::text, 'sem fim');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_colocacao_organograma_sem_sobreposicao() IS
'Impede duas versoes vivas de colocacao no organograma da mesma pessoa com intervalos que se cruzem -- so um no de organograma vigora de cada vez. SECURITY DEFINER pelo mesmo motivo de hr_retribuicoes_sem_sobreposicao.';

DROP TRIGGER IF EXISTS trg_pessoas_colocacao_organograma_sem_sobreposicao ON public.pessoas_colocacao_organograma;
CREATE TRIGGER trg_pessoas_colocacao_organograma_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_colocacao_organograma
  FOR EACH ROW EXECUTE FUNCTION public.hr_colocacao_organograma_sem_sobreposicao();

-- ---- Guarda: o no tem de pertencer a arvore da PROPRIA organizacao ---------
CREATE OR REPLACE FUNCTION public.hr_colocacao_organograma_na_arvore()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.hr_no_pertence_a_arvore_da_org(NEW.organization_id, NEW.organograma_node_id) THEN
    RAISE EXCEPTION
      'organograma_no_fora_da_arvore: o no % nao pertence a arvore da organizacao % em anew_hierarchy. Nao se pode colocar uma pessoa num no de outro cliente.',
      NEW.organograma_node_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_colocacao_organograma_na_arvore() IS
'Trigger de guarda (nunca RLS): recusa gravar organograma_node_id que nao pertenca a arvore da propria organization_id em anew_hierarchy. Reutiliza hr_no_pertence_a_arvore_da_org(), partilhada com o guarda equivalente em hr_locais_trabalho.';

DROP TRIGGER IF EXISTS trg_pessoas_colocacao_organograma_na_arvore ON public.pessoas_colocacao_organograma;
CREATE TRIGGER trg_pessoas_colocacao_organograma_na_arvore
  BEFORE INSERT OR UPDATE ON public.pessoas_colocacao_organograma
  FOR EACH ROW EXECUTE FUNCTION public.hr_colocacao_organograma_na_arvore();

-- ---- Triggers de padrao ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_colocacao_organograma_updated_at ON public.pessoas_colocacao_organograma;
CREATE TRIGGER trg_pessoas_colocacao_organograma_updated_at
  BEFORE UPDATE ON public.pessoas_colocacao_organograma
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_colocacao_organograma_ancora ON public.pessoas_colocacao_organograma;
CREATE TRIGGER trg_pessoas_colocacao_organograma_ancora
  BEFORE UPDATE ON public.pessoas_colocacao_organograma
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants -------------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_colocacao_organograma FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_colocacao_organograma TO authenticated;
GRANT ALL ON TABLE public.pessoas_colocacao_organograma TO service_role;

-- ---- RLS ------------------------------------------------------------------
ALTER TABLE public.pessoas_colocacao_organograma ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_colocacao_organograma_select ON public.pessoas_colocacao_organograma;
CREATE POLICY pessoas_colocacao_organograma_select ON public.pessoas_colocacao_organograma
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.colocacao.view', organization_id))
  );

DROP POLICY IF EXISTS pessoas_colocacao_organograma_insert ON public.pessoas_colocacao_organograma;
CREATE POLICY pessoas_colocacao_organograma_insert ON public.pessoas_colocacao_organograma
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (
      (
        NOT public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.colocacao.edit', organization_id))
      )
      OR (
        public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.colocacao.corrigir', organization_id))
      )
    )
  );

DROP POLICY IF EXISTS pessoas_colocacao_organograma_update ON public.pessoas_colocacao_organograma;
CREATE POLICY pessoas_colocacao_organograma_update ON public.pessoas_colocacao_organograma
  FOR UPDATE TO authenticated
  USING (
    (
      NOT public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.colocacao.edit', organization_id))
    )
    OR (
      public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.colocacao.corrigir', organization_id))
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.colocacao.edit', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.colocacao.corrigir', organization_id))
  );

DROP POLICY IF EXISTS pessoas_colocacao_organograma_block_delete ON public.pessoas_colocacao_organograma;
CREATE POLICY pessoas_colocacao_organograma_block_delete ON public.pessoas_colocacao_organograma
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_colocacao_organograma_update ON public.pessoas_colocacao_organograma IS
'ALTERACAO (hr.pessoas.colocacao.edit): a linha antiga nao decorreu. CORRECCAO (hr.pessoas.colocacao.corrigir, perigosa): a linha antiga ja decorreu. Mesma logica de pessoas_afectacoes_update.';

-- ==============================================================================
-- hr_locais_trabalho.organograma_node_id -- coluna simples, SEM versionamento
-- ==============================================================================
ALTER TABLE public.hr_locais_trabalho
  ADD COLUMN IF NOT EXISTS organograma_node_id uuid;

DO $fk_locais_organograma$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_organograma_no_fkey'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    ALTER TABLE public.hr_locais_trabalho
      ADD CONSTRAINT hr_locais_trabalho_organograma_no_fkey
      FOREIGN KEY (organograma_node_id) REFERENCES public.anew_organizations (id) ON DELETE SET NULL;
  END IF;
END;
$fk_locais_organograma$;

COMMENT ON COLUMN public.hr_locais_trabalho.organograma_node_id IS
'A que no do organograma este centro pertence. Coluna SIMPLES, sem versionamento -- um centro nao muda de filial com frequencia que justifique historico (ao contrario da colocacao da PESSOA, que e versionada em pessoas_colocacao_organograma). FK SIMPLES e ANULAVEL, fora de qualquer chave composta e nunca referida em politica RLS -- o ambito continua a ser sempre organization_id. Editada pela permissao ja existente hr.locais.edit. Um trigger BEFORE INSERT/UPDATE (hr_locais_trabalho_na_arvore) recusa um no fora da arvore da propria organization_id.';

CREATE INDEX IF NOT EXISTS idx_hr_locais_trabalho_organograma_no
  ON public.hr_locais_trabalho (organograma_node_id)
  WHERE organograma_node_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hr_locais_trabalho_na_arvore()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.hr_no_pertence_a_arvore_da_org(NEW.organization_id, NEW.organograma_node_id) THEN
    RAISE EXCEPTION
      'organograma_no_fora_da_arvore: o no % nao pertence a arvore da organizacao % em anew_hierarchy. Nao se pode colocar um centro num no de outro cliente.',
      NEW.organograma_node_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_locais_trabalho_na_arvore() IS
'Trigger de guarda (nunca RLS) equivalente a hr_colocacao_organograma_na_arvore, para hr_locais_trabalho.organograma_node_id.';

DROP TRIGGER IF EXISTS trg_hr_locais_trabalho_organograma_na_arvore ON public.hr_locais_trabalho;
CREATE TRIGGER trg_hr_locais_trabalho_organograma_na_arvore
  BEFORE INSERT OR UPDATE ON public.hr_locais_trabalho
  FOR EACH ROW EXECUTE FUNCTION public.hr_locais_trabalho_na_arvore();

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
BEGIN
  IF to_regclass('public.pessoas_colocacao_organograma') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_colocacao_organograma nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_colocacao_organograma';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_colocacao_organograma ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_colocacao_organograma';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('pessoas_colocacao_organograma', 'hr_locais_trabalho')
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%organograma_node_id%'
  ) THEN
    RAISE EXCEPTION
      'organograma_node_id apareceu numa politica RLS. Regra critica violada: o no do organograma nunca pode ser ambito de seguranca.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_colocacao_organograma_no_fkey'
       AND conrelid = to_regclass('public.pessoas_colocacao_organograma')
       AND cardinality(conkey) = 1
  ) THEN
    RAISE EXCEPTION 'pessoas_colocacao_organograma_no_fkey nao e a FK SIMPLES esperada (1 coluna).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_locais_trabalho' AND column_name = 'organograma_node_id'
  ) THEN
    RAISE EXCEPTION 'hr_locais_trabalho.organograma_node_id nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_organograma_no_fkey'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
       AND cardinality(conkey) = 1
  ) THEN
    RAISE EXCEPTION 'hr_locais_trabalho_organograma_no_fkey nao e a FK SIMPLES esperada (1 coluna).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_colocacao_organograma_na_arvore'
       AND tgrelid = to_regclass('public.pessoas_colocacao_organograma')
  ) THEN
    RAISE EXCEPTION 'O guarda de arvore de pessoas_colocacao_organograma nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_hr_locais_trabalho_organograma_na_arvore'
       AND tgrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION 'O guarda de arvore de hr_locais_trabalho nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_pessoas_colocacao_organograma_aberta'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial da versao aberta nao ficou criado.';
  END IF;

  RAISE NOTICE
    'OK: pessoas_colocacao_organograma criada (versionada, RLS activo, 4 politicas, alteracao vs correccao), hr_locais_trabalho.organograma_node_id criada (simples), FKs SIMPLES nas duas, guarda de arvore activo nas duas, organograma_node_id ausente de qualquer politica RLS.';
END;
$conferir$;
