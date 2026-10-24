-- ==============================================================================
-- pessoas_ausencias_dias: o livro de dias. Uma linha por DIA CIVIL afectado.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um pedido e um intervalo (28 de Dezembro a 3 de Janeiro). Quatro coisas
-- diferentes precisam dele expandido dia a dia, e nenhuma se resolve bem com o
-- intervalo:
--
--   1. o calendario anual, que teria de expandir intervalos em cada leitura;
--   2. a imputacao ao periodo de saldo -- aquele pedido imputa a DOIS periodos,
--      e a alternativa era partir o pedido em dois, perdendo a unidade do que a
--      pessoa pediu;
--   3. os "20 dias uteis efectivamente gozados", que se contam por dia e nao
--      por intervalo;
--   4. a nao-sobreposicao entre pedidos, que com dias passa a ser uma
--      comparacao por data -- e btree_gist NAO esta instalado nesta base, por
--      isso um EXCLUDE sobre daterange nao e opcao.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = um dia civil de um pedido. fraccao_dia em (0.25, 0.50, 0.75,
-- 1.00), com CHECK fechado -- nao e um numeric livre, porque fraccoes
-- arbitrarias tornariam a soma por dia impossivel de verificar.
--
-- periodo_inicio viaja NA LINHA e nao no pedido: e assim que 28 de Dezembro e
-- 3 de Janeiro imputam a periodos de saldo diferentes sem partir o pedido.
--
-- e_feriado e e_fim_semana sao gravados, nao derivados: sao o retrato do
-- calendario no momento do pedido. Um feriado acrescentado em Dezembro nao pode
-- reescrever o que se contou em Marco.
--
-- estado (pendente / aprovado / recusado / cancelado) e ESPELHADO do pedido por
-- trigger AFTER UPDATE OF estado (20261121110000). Nao se escreve a mao: se se
-- escrevesse, haveria dias aprovados de pedidos recusados e o contador
-- divergiria em silencio.
--
--
-- -- NAO-SOBREPOSICAO POR DIA, EM TRIGGER --------------------------------------
--
-- hr_ausencias_dia_sem_sobreposicao(): a soma de fraccao_dia das linhas activas
-- da mesma pessoa na mesma data, incluindo a nova, nao pode exceder 1.00.
--
-- Trigger e nao EXCLUDE porque btree_gist nao esta instalado; trigger e nao
-- CHECK porque um CHECK ve uma linha e isto e um agregado; trigger e nao RPC
-- porque as Edge Functions e o service_role escrevem fora das RPCs.
--
-- SECURITY DEFINER pela razao ja registada no modulo: sob RLS de invocador,
-- quem tem escrita sem leitura nao veria as linhas existentes, e a verificacao
-- passaria por nao encontrar nada -- o pior tipo de guarda, a que aprova
-- sempre.
--
-- Fica assumida por escrito a MESMA janela de corrida que a ronda 2 assumiu:
-- duas transaccoes concorrentes a inserir o mesmo dia podem passar as duas,
-- porque o trigger le antes de a outra ter escrito. Sem btree_gist nao ha
-- EXCLUDE, e trancar a linha da pessoa custa mais do que o defeito.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A expansao do intervalo em dias e o espelho do estado: 20261121110000.
-- - Nao se conta nada automaticamente: conta_saldo vem do tipo, gravado na
--   linha pela RPC, e nao e lido do tipo na leitura -- um tipo que passe a nao
--   descontar saldo em Novembro nao reescreve Marco.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_ausencias_dias;
--   DROP FUNCTION public.hr_ausencias_dia_sem_sobreposicao();
--
--
-- Prerequisitos:
--   20261121060000  pessoas_ausencias_pedidos (unique id, pessoa_id, organization_id)
--   20261121020000  hr_ausencias_tipos
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao existe. Aplicar 20261121060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_pedidos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION 'A unique (id, pessoa_id, organization_id) dos pedidos nao existe; a FK composta depende dela.';
  END IF;

  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro.';
  END IF;

  -- btree_gist: confirma-se que NAO esta, para que o comentario sobre a razao
  -- de haver trigger em vez de EXCLUDE nao envelheca em silencio.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    RAISE NOTICE
      'btree_gist esta instalado. A nao-sobreposicao continua a ser por trigger nesta migracao; um EXCLUDE passa a ser possivel e e uma melhoria a considerar noutra ronda.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_ausencias_dias (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id       uuid NOT NULL,
  pessoa_id       uuid NOT NULL,
  organization_id uuid NOT NULL,
  tipo_id         uuid NOT NULL,

  data            date NOT NULL,
  fraccao_dia     numeric(3,2) NOT NULL DEFAULT 1.00,
  minutos         integer,

  -- Gravados na linha, nao lidos do tipo nem do calendario na leitura.
  conta_saldo     boolean NOT NULL DEFAULT true,
  e_feriado       boolean NOT NULL DEFAULT false,
  e_fim_semana    boolean NOT NULL DEFAULT false,

  -- O periodo de saldo a que ESTE dia imputa. E isto que faz um pedido de 28 de
  -- Dezembro a 3 de Janeiro cair em dois periodos sem ser partido em dois.
  periodo_inicio  date NOT NULL,

  -- ESPELHADO do pedido por trigger. Nao se escreve a mao.
  estado          text NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_ausencias_dias_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_ausencias_dias_id_org_key UNIQUE (id, organization_id),

  -- Alvo da FK composta de pessoas_faltas.ausencia_dia_id, na ronda de
  -- assiduidade. Sem ela, uma falta podia dizer que esta coberta pela ausencia
  -- de outra pessoa.
  CONSTRAINT pessoas_ausencias_dias_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  CONSTRAINT pessoas_ausencias_dias_pedido_fkey
    FOREIGN KEY (pedido_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_ausencias_pedidos (id, pessoa_id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT pessoas_ausencias_dias_tipo_fkey
    FOREIGN KEY (tipo_id, organization_id)
    REFERENCES public.hr_ausencias_tipos (id, organization_id) ON DELETE NO ACTION,

  -- Um mesmo pedido nao tem duas linhas para o mesmo dia: seria contar o dia
  -- duas vezes no proprio pedido.
  CONSTRAINT pessoas_ausencias_dias_pedido_data_key UNIQUE (pedido_id, data),

  -- CHECK fechado e nao numeric livre: fraccoes arbitrarias tornariam a soma
  -- por dia impossivel de verificar com sentido.
  CONSTRAINT pessoas_ausencias_dias_fraccao_valida
    CHECK (fraccao_dia IN (0.25, 0.50, 0.75, 1.00)),

  CONSTRAINT pessoas_ausencias_dias_minutos_positivos
    CHECK (minutos IS NULL OR minutos > 0),

  CONSTRAINT pessoas_ausencias_dias_estado_valido
    CHECK (estado IN ('pendente','aprovado','recusado','cancelado'))
);

-- Os indices que fazem o calendario e o contador. Parciais nos estados que
-- ocupam tempo: recusado e cancelado nao ocupam dia nenhum.
CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_dias_pessoa_data
  ON public.pessoas_ausencias_dias (pessoa_id, data)
  WHERE estado IN ('pendente','aprovado');

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_dias_org_data
  ON public.pessoas_ausencias_dias (organization_id, data)
  WHERE estado IN ('pendente','aprovado');

-- O indice do contador de saldo.
CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_dias_saldo
  ON public.pessoas_ausencias_dias (pessoa_id, periodo_inicio, tipo_id)
  WHERE estado = 'aprovado';

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_dias_pedido
  ON public.pessoas_ausencias_dias (pedido_id);

COMMENT ON TABLE public.pessoas_ausencias_dias IS
'O livro de dias: uma linha por DIA CIVIL de um pedido. E a peca que faz o resto do modulo funcionar, e justifica-se por quatro coisas de uma vez:

- o calendario anual le-a directamente, sem expandir intervalos;
- um pedido de 28 de Dezembro a 3 de Janeiro imputa-se a DOIS periodos de saldo, dia por dia, sem partir o pedido em dois;
- os "20 dias uteis efectivamente gozados" contam-se aqui e em nenhum outro sitio;
- a nao-sobreposicao entre pedidos passa a ser uma comparacao por data, sem btree_gist -- que nao esta instalado nesta base.

estado e ESPELHADO do pedido por trigger. Escrito a mao, haveria dias aprovados de pedidos recusados e o contador divergiria em silencio.

conta_saldo, e_feriado e e_fim_semana sao GRAVADOS: sao o retrato do tipo e do calendario no momento do pedido, e um feriado acrescentado em Dezembro nao reescreve o que se contou em Marco.';

COMMENT ON COLUMN public.pessoas_ausencias_dias.periodo_inicio IS
'O periodo de saldo a que ESTE dia imputa -- na linha, e nao no pedido. E assim que um pedido a cavalo do fim do ano cai em dois periodos sem perder a unidade do que a pessoa pediu.';

COMMENT ON COLUMN public.pessoas_ausencias_dias.fraccao_dia IS
'0.25, 0.50, 0.75 ou 1.00, com CHECK fechado. A soma das fraccoes activas da mesma pessoa na mesma data nao pode exceder 1.00 -- e o trigger hr_ausencias_dia_sem_sobreposicao que o garante.';

-- ---- Nao-sobreposicao por dia ----------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_dia_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_soma numeric(6,2);
BEGIN
  -- Um dia recusado ou cancelado nao ocupa tempo nenhum, e nao deve impedir a
  -- marcacao correcta na mesma data.
  IF NEW.estado NOT IN ('pendente','aprovado') THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(d.fraccao_dia), 0) + NEW.fraccao_dia
    INTO v_soma
    FROM public.pessoas_ausencias_dias d
   WHERE d.pessoa_id = NEW.pessoa_id
     AND d.data = NEW.data
     AND d.id <> NEW.id
     AND d.estado IN ('pendente','aprovado');

  IF v_soma > 1.00 THEN
    RAISE EXCEPTION
      'ausencia_dia_sobreposto: o dia % da pessoa % ficaria com % de dia marcado, e um dia tem 1.00. Ja ha ausencia pendente ou aprovada nessa data -- cancelar ou recusar a outra primeiro, ou reduzir a fraccao.',
      NEW.data, NEW.pessoa_id, to_char(v_soma, 'FM990.00')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_dia_sem_sobreposicao() IS
'Impede que a soma das fraccoes de dia activas da mesma pessoa na mesma data exceda 1.00. Linhas recusadas e canceladas estao isentas: nao ocupam tempo e nao devem impedir a marcacao correcta.

Trigger e nao EXCLUDE porque btree_gist nao esta instalado nesta base; trigger e nao CHECK porque um CHECK ve uma linha e isto e um agregado; trigger e nao RPC porque as Edge Functions e o service_role escrevem fora das RPCs, e uma regra que so vive na RPC nao alcanca esses caminhos.

SECURITY DEFINER: sob RLS de invocador, quem tem escrita sem leitura nao veria as linhas existentes e a verificacao passaria por nao encontrar nada -- o pior tipo de guarda, a que aprova sempre.

JANELA DE CORRIDA ASSUMIDA, a mesma da ronda 2: duas transaccoes concorrentes a inserir o mesmo dia podem passar as duas, porque o trigger le antes de a outra ter escrito. Sem btree_gist nao ha EXCLUDE, e trancar a linha da pessoa custa mais do que o defeito.';

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_dias_sem_sobreposicao ON public.pessoas_ausencias_dias;
CREATE TRIGGER trg_pessoas_ausencias_dias_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_ausencias_dias
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_dia_sem_sobreposicao();

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_dias_updated_at ON public.pessoas_ausencias_dias;
CREATE TRIGGER trg_pessoas_ausencias_dias_updated_at
  BEFORE UPDATE ON public.pessoas_ausencias_dias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_ausencias_dias FROM anon;
REVOKE ALL ON TABLE public.pessoas_ausencias_dias FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_ausencias_dias TO authenticated;
GRANT ALL ON TABLE public.pessoas_ausencias_dias TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_dias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_ausencias_dias_select ON public.pessoas_ausencias_dias;
CREATE POLICY pessoas_ausencias_dias_select ON public.pessoas_ausencias_dias
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.aprovar.chefia', organization_id))
      AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoa_id, organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_ausencias_dias_block_insert ON public.pessoas_ausencias_dias;
CREATE POLICY pessoas_ausencias_dias_block_insert ON public.pessoas_ausencias_dias
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_dias_block_update ON public.pessoas_ausencias_dias;
CREATE POLICY pessoas_ausencias_dias_block_update ON public.pessoas_ausencias_dias
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_dias_block_delete ON public.pessoas_ausencias_dias;
CREATE POLICY pessoas_ausencias_dias_block_delete ON public.pessoas_ausencias_dias
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_ausencias_dias_select ON public.pessoas_ausencias_dias IS
'Os mesmos tres ramos dos pedidos: organizacao, ficha-propria e cadeia de chefia. E esta politica que da o calendario anual a quem o pode ver.';

COMMENT ON POLICY pessoas_ausencias_dias_block_insert ON public.pessoas_ausencias_dias IS
'Escrita fechada. Expandir um pedido em dias imputa cada dia ao periodo de saldo certo, marca feriados e fins de semana com o calendario do momento, e corre a verificacao de sobreposicao por dia. Nada disso cabe num WITH CHECK. Entra pelas RPCs de 20261121110000.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
  v_restr     integer;
  v_qual      text;
  v_sec       boolean;
BEGIN
  IF to_regclass('public.pessoas_ausencias_dias') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_dias nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_ausencias_dias';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_dias';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_politicas;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_dias'
     AND permissive = 'RESTRICTIVE';
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita, encontraram-se %.', v_restr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_dias'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem GRANT de escrita. Esta tabela e SELECT e mais nada.';
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_dias'
     AND policyname = 'pessoas_ausencias_dias_select';

  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo de ficha-propria; o trabalhador nao veria o seu calendario.';
  END IF;
  IF v_qual NOT LIKE '%hr_ausencias_pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo da chefia.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  -- O trigger de sobreposicao tem de existir E ser SECURITY DEFINER.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_ausencias_dias')
       AND tgname = 'trg_pessoas_ausencias_dias_sem_sobreposicao'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger de nao-sobreposicao por dia nao ficou criado.';
  END IF;

  SELECT p.prosecdef INTO v_sec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_dia_sem_sobreposicao';

  IF v_sec IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'hr_ausencias_dia_sem_sobreposicao nao e SECURITY DEFINER. Sob RLS de invocador nao veria as linhas existentes e aprovaria sempre.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_dias_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_dias')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) nao ficou criada; a FK composta de pessoas_faltas.ausencia_dia_id (ronda de assiduidade) depende dela.';
  END IF;

  RAISE NOTICE 'Conferido: pessoas_ausencias_dias com o trigger de sobreposicao e escrita fechada.';
END;
$conferir$;
