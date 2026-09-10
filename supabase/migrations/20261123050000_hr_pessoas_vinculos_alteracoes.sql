-- ==============================================================================
-- pessoas_vinculos_alteracoes -- historico de alteracoes ao vinculo e a funcao,
-- por trigger. Nunca guarda retribuicao.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Uma adenda (aumento, mudanca de funcao) altera campos de pessoas_vinculos ou
-- de pessoas.cargo, mas um UPDATE simples nao deixa rasto de qual era o valor
-- antes, quando mudou, nem porque. pessoas_retribuicoes ja tem o seu proprio
-- historico (fecha-se a versao aberta e abre-se uma nova); isto cobre o resto:
-- tipo de contrato, regime, horas, datas, categoria da funcao, e o cargo (que
-- vive em pessoas, nao em pessoas_vinculos).
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela append-only, escrita SO por dois triggers AFTER UPDATE (um em
-- pessoas_vinculos, outro em pessoas, so para cargo), ambos SECURITY DEFINER:
-- para cada campo de negocio que mudou, uma LINHA com valor_antes, valor_depois
-- e data_efeito=CURRENT_DATE. INSERT/UPDATE/DELETE directos ficam bloqueados a
-- authenticated -- um registo que o proprio possa escrever ou apagar nao e um
-- registo.
--
-- data_efeito e sempre a data da escrita (CURRENT_DATE), nao uma data futura
-- negociada: esta tabela regista O QUE MUDOU E QUANDO FICOU REGISTADO, nao um
-- calendario de vigencia -- isso continua a ser pessoas_retribuicoes.valido_de
-- para dinheiro, e as proprias colunas data_inicio/data_fim do vinculo para o
-- contrato.
--
-- valor_antes/valor_depois NUNCA guardam retribuicao: pessoas_vinculos nao tem
-- NENHUMA coluna de valor monetario (o salario vive em pessoas_retribuicoes,
-- que tem o seu proprio fecho e a sua propria auditoria em
-- pessoas_acessos_sensiveis desde 20261120060000) -- por isso o RISCO NAO
-- EXISTE aqui por construcao, nao por disciplina de quem escreve o trigger.
--
--
-- -- QUEM VE --------------------------------------------------------------------
--
-- hr.pessoas.vinculos.view (ve o historico de qualquer pessoa) OU a propria
-- pessoa via hr.pessoas.documentos.view.own -- reutiliza a mesma permissao de
-- "ver os meus documentos" para nao criar uma decima permissao so para isto;
-- ver o proprio historico de contrato e a mesma autoridade que ver os proprios
-- documentos.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER IF EXISTS trg_pessoas_registar_alteracao_cargo ON public.pessoas;
--   DROP TRIGGER IF EXISTS trg_pessoas_vinculos_registar_alteracao ON public.pessoas_vinculos;
--   DROP FUNCTION IF EXISTS public.hr_pessoas_registar_alteracao_cargo();
--   DROP FUNCTION IF EXISTS public.hr_vinculos_registar_alteracao();
--   DROP TABLE IF EXISTS public.pessoas_vinculos_alteracoes;
--
--
-- Prerequisitos:
--   20261120060000  pessoas_vinculos
--   20261120090000  hr_pessoa_do_utilizador
--   20261123010000  catalogo hr.pessoas.documentos.view.own
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_vinculos nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_vinculos_id_pessoa_org_key' AND conrelid = 'public.pessoas_vinculos'::regclass
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos_id_pessoa_org_key nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'public.hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.documentos.view.own') THEN
    RAISE EXCEPTION 'hr.pessoas.documentos.view.own nao esta no catalogo. Aplicar 20261123010000 primeiro.';
  END IF;

  -- Confirmar, e nao supor, que pessoas_vinculos nao ganhou salario nenhum
  -- entretanto -- esta migracao promete por escrito que a tabela nunca guarda
  -- retribuicao, e essa promessa depende deste facto.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name IN ('valor_base','salario','retribuicao','valor')
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos ganhou uma coluna de valor monetario. Reler o cabecalho desta migracao antes de continuar -- a promessa de "nunca guarda retribuicao" depende de isso nao acontecer.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_vinculos_alteracoes
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_vinculos_alteracoes (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  vinculo_id      uuid,
  pessoa_id       uuid NOT NULL,
  organization_id uuid NOT NULL,

  campo           text NOT NULL,
  valor_antes     text,
  valor_depois    text,
  data_efeito     date NOT NULL DEFAULT CURRENT_DATE,
  motivo          text,
  documento_id    uuid,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,

  CONSTRAINT pessoas_vinculos_alteracoes_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_vinculos_alteracoes_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_vinculos_alteracoes_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),
  CONSTRAINT pessoas_vinculos_alteracoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL
  -- documento_id referencia pessoas_documentos, criada so na migracao
  -- seguinte (20261123030000 ja aplicada antes desta na ordem do plano) --
  -- ver bloco abaixo, que adiciona a FK condicionalmente se a tabela existir.
);

COMMENT ON TABLE public.pessoas_vinculos_alteracoes IS
'Historico de alteracoes a pessoas_vinculos e a pessoas.cargo, uma linha por campo alterado, escrito SO por trigger (nunca directamente por authenticated). NUNCA guarda retribuicao -- pessoas_vinculos nao tem nenhuma coluna monetaria; o salario tem o seu proprio historico em pessoas_retribuicoes. data_efeito e a data em que a alteracao ficou registada, nao uma data de vigencia negociada.';
COMMENT ON COLUMN public.pessoas_vinculos_alteracoes.vinculo_id IS
'NULL quando a alteracao e a pessoas.cargo (que nao pertence a um vinculo especifico). Preenchido quando a alteracao e a uma coluna de pessoas_vinculos.';

DO $fk_documento$
BEGIN
  IF to_regclass('public.pessoas_documentos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'pessoas_vinculos_alteracoes_documento_fkey'
          AND conrelid = 'public.pessoas_vinculos_alteracoes'::regclass
     ) THEN
    ALTER TABLE public.pessoas_vinculos_alteracoes
      ADD CONSTRAINT pessoas_vinculos_alteracoes_documento_fkey
      FOREIGN KEY (documento_id) REFERENCES public.pessoas_documentos (id) ON DELETE SET NULL;
  END IF;
END;
$fk_documento$;

CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_alteracoes_pessoa_id
  ON public.pessoas_vinculos_alteracoes (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_alteracoes_vinculo_id
  ON public.pessoas_vinculos_alteracoes (vinculo_id) WHERE vinculo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_alteracoes_organization_id
  ON public.pessoas_vinculos_alteracoes (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_alteracoes_pessoa_data
  ON public.pessoas_vinculos_alteracoes (pessoa_id, data_efeito DESC);

REVOKE ALL ON TABLE public.pessoas_vinculos_alteracoes FROM anon;
REVOKE ALL ON TABLE public.pessoas_vinculos_alteracoes FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_vinculos_alteracoes TO authenticated;
GRANT ALL ON TABLE public.pessoas_vinculos_alteracoes TO service_role;

ALTER TABLE public.pessoas_vinculos_alteracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_vinculos_alteracoes_select ON public.pessoas_vinculos_alteracoes;
CREATE POLICY pessoas_vinculos_alteracoes_select ON public.pessoas_vinculos_alteracoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.view', organization_id))
    -- Auto-servico: a permissao certa e "ver a MINHA ficha", nao "ver os meus
    -- documentos". Isto e historico CONTRATUAL -- tipo de contrato, horas,
    -- periodo experimental, categoria --, nao um documento. Com a permissao de
    -- documentos, quem recebesse apenas "ver os meus documentos" passava a ver
    -- tambem todo o seu historico de contrato, e uma decisao de produto ficava
    -- escondida numa escolha de string.
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
    )
  );

DROP POLICY IF EXISTS pessoas_vinculos_alteracoes_block_insert ON public.pessoas_vinculos_alteracoes;
CREATE POLICY pessoas_vinculos_alteracoes_block_insert ON public.pessoas_vinculos_alteracoes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_vinculos_alteracoes_block_update ON public.pessoas_vinculos_alteracoes;
CREATE POLICY pessoas_vinculos_alteracoes_block_update ON public.pessoas_vinculos_alteracoes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_vinculos_alteracoes_block_delete ON public.pessoas_vinculos_alteracoes;
CREATE POLICY pessoas_vinculos_alteracoes_block_delete ON public.pessoas_vinculos_alteracoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ==============================================================================
-- Trigger 1: alteracoes a pessoas_vinculos
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_vinculos_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Todos os campos de negocio de pessoas_vinculos. NENHUM e monetario --
  -- a promessa da tabela depende deste facto, confirmado na guarda acima.
  v_campos text[] := ARRAY[
    'tipo_contrato', 'regime', 'horas_semanais', 'data_inicio', 'data_fim',
    'motivo_termo', 'periodo_experimental_ate', 'entidade_legal_org_id',
    'estado', 'tipo_trabalho', 'horas_frequencia', 'tempo_trabalho_pct',
    'dias_uteis', 'politica_feriados', 'horas_anuais_maximas',
    'horas_semanais_maximas', 'periodo_experimental_dias',
    'categoria_funcao', 'periodo_experimental_origem'
  ];
  v_old  jsonb := to_jsonb(OLD);
  v_new  jsonb := to_jsonb(NEW);
  v_campo text;
  v_criado_por uuid;
BEGIN
  -- Marcar como apagado (soft delete) nao e uma alteracao de negocio.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_vinculos_alteracoes
        (vinculo_id, pessoa_id, organization_id, campo, valor_antes, valor_depois, created_by)
      VALUES
        (NEW.id, NEW.pessoa_id, NEW.organization_id, v_campo, v_old ->> v_campo, v_new ->> v_campo, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_registar_alteracao() IS
'Escreve uma linha em pessoas_vinculos_alteracoes por CADA campo de negocio que mudou num UPDATE de pessoas_vinculos. Nao regista quando a unica mudanca e marcar deleted_at (soft delete). Comparacao feita via to_jsonb(OLD/NEW) ->> campo, por isso dias_uteis (array) fica gravado na sua representacao JSON.';

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_registar_alteracao ON public.pessoas_vinculos;
CREATE TRIGGER trg_pessoas_vinculos_registar_alteracao
  AFTER UPDATE ON public.pessoas_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.hr_vinculos_registar_alteracao();

-- ==============================================================================
-- Trigger 2: alteracoes a pessoas.cargo
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoas_registar_alteracao_cargo()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_criado_por uuid;
BEGIN
  IF NEW.cargo IS DISTINCT FROM OLD.cargo THEN
    SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

    INSERT INTO public.pessoas_vinculos_alteracoes
      (vinculo_id, pessoa_id, organization_id, campo, valor_antes, valor_depois, created_by)
    VALUES
      (NULL, NEW.id, NEW.organization_id, 'cargo', OLD.cargo, NEW.cargo, v_criado_por);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_registar_alteracao_cargo() IS
'Escreve uma linha em pessoas_vinculos_alteracoes (campo=cargo, vinculo_id=NULL) quando pessoas.cargo muda. O cargo vive em pessoas, nao em pessoas_vinculos, mas o historico e o mesmo -- e a funcao da pessoa, tal como a categoria e o contrato.';

DROP TRIGGER IF EXISTS trg_pessoas_registar_alteracao_cargo ON public.pessoas;
CREATE TRIGGER trg_pessoas_registar_alteracao_cargo
  AFTER UPDATE OF cargo ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_registar_alteracao_cargo();

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_vinculos_alteracoes';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'pessoas_vinculos_alteracoes ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_registar_alteracao'
       AND tgrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_vinculos_registar_alteracao nao foi criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_registar_alteracao_cargo'
       AND tgrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_registar_alteracao_cargo nao foi criado.';
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas_vinculos_alteracoes criada, 4 politicas, dois triggers de auditoria activos.';
END;
$conferir$;
