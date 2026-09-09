-- ==============================================================================
-- O saldo de ausencias: CALCULADO, nunca materializado.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O ecra precisa de mostrar, por pessoa, tipo e periodo: adquiridos,
-- disponiveis, utilizados. A tentacao e uma coluna "dias_disponiveis" numa
-- tabela.
--
-- Um saldo materializado tem de ser reescrito por CINCO caminhos independentes:
-- direito criado, ajuste aplicado, ajuste anulado, pedido aprovado, e ausencia
-- passada corrigida. A ronda 2 ja registou o preco de uma coluna com muitos
-- escritores.
--
-- Pior do que isso: o ajuste manual e o historico modificavel sao exactamente
-- os dois requisitos que fazem o saldo mudar PARA TRAS. Um contador
-- materializado que derive de um passado editavel e um contador que vai
-- divergir, e ninguem vai saber quando.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma funcao e uma vista, e coluna de saldo em tabela nenhuma. Corrigir um
-- ajuste de Fevereiro corrige o contador de Fevereiro em diante sem recalculo
-- nenhum, porque nao havia nada calculado.
--
--   adquiridos  = direito do periodo + soma dos ajustes POSITIVOS nao anulados
--   utilizados  = soma de fraccao_dia dos dias aprovados que contam saldo
--   pendentes   = a mesma soma, nos dias pendentes
--   disponiveis = adquiridos - utilizados - pendentes - |ajustes negativos|
--
-- pendentes existe e e mostrado, ao contrario do que outras ferramentas fazem:
-- um pedido em analise ja nao e saldo livre, e esconde-lo e como se marcasse
-- duas vezes as mesmas ferias.
--
--
-- -- SECURITY INVOKER, E E DELIBERADO -----------------------------------------
--
-- Ao contrario de quase tudo no modulo, esta funcao e SECURITY INVOKER. O saldo
-- e a soma de tres tabelas que JA TEM RLS correcta: sob invocador, ninguem le
-- um saldo de quem nao pode ver, e nao ha uma linha de codigo a decidir isso.
--
-- Um SECURITY DEFINER aqui seria uma porta lateral para dados de pessoas de
-- outras organizacoes -- passa-se-lhe um pessoa_id e um organization_id, e ela
-- responde. A vista tambem leva security_invoker=true, pela mesma razao: sem
-- isso corre com os direitos do dono e vira a mesma porta.
--
-- Consequencia honesta: quem nao ve as tabelas ve zeros, nao um erro. Um zero
-- de saldo lido sem permissao NAO prova ausencia de direito -- e a licao que
-- este repositorio ja registou sobre contagens de zero lidas sob RLS.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nenhuma tabela de cache. Se um dia doer, o remedio e uma tabela de cache
--   com funcao de reconstrucao determinista -- NAO uma coluna escrita a mao, e
--   nao nesta ronda.
-- - Nao ha calculo de acumulacao (accrual), nem proporcionalidade a admissao,
--   nem subsidio de ferias.
-- - Nao se toca em tabela nenhuma: esta migracao so cria uma funcao e uma vista.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP VIEW public.v_hr_ausencias_saldos;
--   DROP FUNCTION public.hr_ausencias_saldo(uuid, uuid, uuid, date);
--
--
-- Prerequisitos:
--   20261121030000  pessoas_ausencias_direitos
--   20261121040000  pessoas_ausencias_ajustes
--   20261121080000  pessoas_ausencias_dias
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_direitos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_direitos nao existe. Aplicar 20261121030000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_ausencias_ajustes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_ajustes nao existe. Aplicar 20261121040000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_ausencias_dias') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_dias nao existe. Aplicar 20261121080000 primeiro.';
  END IF;

  -- As tres tem de ter RLS: e nela que assenta a decisao de SECURITY INVOKER.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('pessoas_ausencias_direitos','pessoas_ausencias_ajustes','pessoas_ausencias_dias')
       AND c.relrowsecurity IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION
      'Alguma das tres tabelas do saldo esta sem RLS. A funcao e SECURITY INVOKER precisamente porque confia na RLS delas; sem RLS, seria uma porta aberta.';
  END IF;
END;
$guardas$;

-- ---- A funcao de saldo -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_saldo(
  _pessoa_id uuid,
  _organization_id uuid,
  _tipo_id uuid,
  _periodo_inicio date
)
RETURNS TABLE (
  adquiridos  numeric,
  ajustes     numeric,
  utilizados  numeric,
  pendentes   numeric,
  disponiveis numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH direito AS (
    SELECT coalesce(sum(d.dias_direito), 0)::numeric AS dias
      FROM public.pessoas_ausencias_direitos d
     WHERE d.pessoa_id = _pessoa_id
       AND d.organization_id = _organization_id
       AND d.tipo_id = _tipo_id
       AND d.periodo_inicio = _periodo_inicio
       AND d.deleted_at IS NULL
  ),
  aj AS (
    SELECT
      coalesce(sum(a.dias) FILTER (WHERE a.dias > 0), 0)::numeric AS positivos,
      coalesce(sum(-a.dias) FILTER (WHERE a.dias < 0), 0)::numeric AS negativos,
      coalesce(sum(a.dias), 0)::numeric AS liquido
      FROM public.pessoas_ausencias_ajustes a
     WHERE a.pessoa_id = _pessoa_id
       AND a.organization_id = _organization_id
       AND a.tipo_id = _tipo_id
       AND a.periodo_inicio = _periodo_inicio
       AND a.anulado_em IS NULL
  ),
  usados AS (
    SELECT
      coalesce(sum(x.fraccao_dia) FILTER (WHERE x.estado = 'aprovado'), 0)::numeric AS aprovados,
      coalesce(sum(x.fraccao_dia) FILTER (WHERE x.estado = 'pendente'), 0)::numeric AS pendentes
      FROM public.pessoas_ausencias_dias x
     WHERE x.pessoa_id = _pessoa_id
       AND x.organization_id = _organization_id
       AND x.tipo_id = _tipo_id
       AND x.periodo_inicio = _periodo_inicio
       AND x.conta_saldo = true
  )
  SELECT
    (direito.dias + aj.positivos)                                           AS adquiridos,
    aj.liquido                                                              AS ajustes,
    usados.aprovados                                                        AS utilizados,
    usados.pendentes                                                        AS pendentes,
    (direito.dias + aj.positivos - usados.aprovados - usados.pendentes - aj.negativos)
                                                                            AS disponiveis
  FROM direito, aj, usados
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_saldo(uuid, uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_saldo(uuid, uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_saldo(uuid, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_saldo(uuid, uuid, uuid, date) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_saldo(uuid, uuid, uuid, date) IS
'O saldo de ausencias de uma pessoa, num tipo, num periodo: adquiridos, ajustes (liquidos), utilizados, pendentes, disponiveis.

CALCULADO e nunca materializado. Um saldo em coluna teria de ser reescrito por cinco caminhos independentes -- direito criado, ajuste aplicado, ajuste anulado, pedido aprovado, ausencia passada corrigida -- e o ajuste manual e o historico modificavel sao exactamente o que faz o saldo mudar PARA TRAS. Assim, corrigir um ajuste de Fevereiro corrige o contador de Fevereiro em diante sem recalculo nenhum.

pendentes e devolvido e mostrado de proposito: um pedido em analise ja nao e saldo livre, e esconde-lo levaria a marcar duas vezes as mesmas ferias.

SECURITY INVOKER, ao contrario de quase tudo no modulo, e DELIBERADO: as tres tabelas somadas ja tem RLS correcta, e sob invocador ninguem le um saldo de quem nao pode ver. SECURITY DEFINER aqui seria uma porta lateral para dados de outras organizacoes -- bastava passar-lhe um pessoa_id.

CONSEQUENCIA HONESTA: quem nao ve as tabelas ve ZEROS, nao um erro. Um zero de saldo lido sem permissao nao prova ausencia de direito.';

-- ---- A vista do contador ---------------------------------------------------
-- security_invoker=true e obrigatorio: sem isso a vista corre com os direitos
-- do dono e torna-se a porta lateral que a funcao evitou.
CREATE OR REPLACE VIEW public.v_hr_ausencias_saldos
WITH (security_invoker = true) AS
WITH combinacoes AS (
  -- A uniao das tres origens: ha periodos com direito e sem gozo, com gozo e
  -- sem direito (o caso do ajuste ou do erro a corrigir), e com ajuste e mais
  -- nada. Partir de uma so das tabelas esconderia dois desses casos.
  SELECT d.pessoa_id, d.organization_id, d.tipo_id, d.periodo_inicio
    FROM public.pessoas_ausencias_direitos d
   WHERE d.deleted_at IS NULL
  UNION
  SELECT a.pessoa_id, a.organization_id, a.tipo_id, a.periodo_inicio
    FROM public.pessoas_ausencias_ajustes a
   WHERE a.anulado_em IS NULL
  UNION
  SELECT x.pessoa_id, x.organization_id, x.tipo_id, x.periodo_inicio
    FROM public.pessoas_ausencias_dias x
   WHERE x.estado IN ('pendente','aprovado')
)
SELECT
  c.pessoa_id,
  c.organization_id,
  c.tipo_id,
  c.periodo_inicio,
  s.adquiridos,
  s.ajustes,
  s.utilizados,
  s.pendentes,
  s.disponiveis
FROM combinacoes c
CROSS JOIN LATERAL public.hr_ausencias_saldo(
  c.pessoa_id, c.organization_id, c.tipo_id, c.periodo_inicio
) AS s;

REVOKE ALL ON public.v_hr_ausencias_saldos FROM anon;
GRANT SELECT ON public.v_hr_ausencias_saldos TO authenticated;
GRANT SELECT ON public.v_hr_ausencias_saldos TO service_role;

COMMENT ON VIEW public.v_hr_ausencias_saldos IS
'O contador de saldo por (pessoa, tipo, periodo), para o ecra. security_invoker=true: sem isso a vista corria com os direitos do dono e seria a porta lateral que a funcao de saldo evitou.

Parte da UNIAO das tres origens e nao de uma delas: ha periodos com direito e sem gozo, com gozo e sem direito (um ajuste, ou um erro a corrigir), e com ajuste e mais nada. Comecar so pelos direitos esconderia dois desses casos, que sao precisamente os que interessa ver.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_vol   char;
  v_sec   boolean;
  v_kind  char;
  v_opts  text;
BEGIN
  SELECT p.provolatile, p.prosecdef
    INTO v_vol, v_sec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_saldo' AND p.pronargs = 4;

  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_saldo(uuid, uuid, uuid, date) nao ficou criada com 4 argumentos.';
  END IF;

  IF v_vol <> 's' THEN
    RAISE EXCEPTION 'hr_ausencias_saldo nao e STABLE (volatilidade "%").', v_vol;
  END IF;

  -- Esta e a verificacao AO CONTRARIO das outras do modulo: aqui e SECURITY
  -- DEFINER que seria o defeito.
  IF v_sec IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'hr_ausencias_saldo ficou SECURITY DEFINER. Tem de ser INVOKER: como DEFINER, bastava passar-lhe um pessoa_id de outra organizacao para ler o saldo de qualquer pessoa.';
  END IF;

  IF has_function_privilege('anon', 'public.hr_ausencias_saldo(uuid, uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar hr_ausencias_saldo. O REVOKE nao pegou.';
  END IF;

  IF to_regclass('public.v_hr_ausencias_saldos') IS NULL THEN
    RAISE EXCEPTION 'A vista v_hr_ausencias_saldos nao ficou criada.';
  END IF;

  SELECT c.relkind, coalesce(array_to_string(c.reloptions, ','), '')
    INTO v_kind, v_opts
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'v_hr_ausencias_saldos';

  IF v_kind <> 'v' THEN
    RAISE EXCEPTION 'v_hr_ausencias_saldos nao e uma vista (relkind "%").', v_kind;
  END IF;

  IF v_opts NOT LIKE '%security_invoker=true%' THEN
    RAISE EXCEPTION
      'v_hr_ausencias_saldos ficou sem security_invoker=true. Assim corre com os direitos do dono e e uma porta lateral para as horas e os saldos de outras organizacoes. Opcoes actuais: "%"', v_opts;
  END IF;

  IF has_table_privilege('anon', 'public.v_hr_ausencias_saldos', 'SELECT') THEN
    RAISE EXCEPTION 'anon consegue ler v_hr_ausencias_saldos. O REVOKE nao pegou.';
  END IF;

  -- Nenhuma tabela do modulo pode ter ganho uma coluna de saldo pelo caminho.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name LIKE 'pessoas_ausencias%'
       AND column_name IN ('dias_disponiveis','saldo','saldo_dias','dias_saldo')
  ) THEN
    RAISE EXCEPTION
      'Alguma tabela de ausencias ganhou uma coluna de saldo materializado. O saldo e calculado; uma coluna com cinco escritores diverge e ninguem sabe quando.';
  END IF;

  RAISE NOTICE 'Conferido: hr_ausencias_saldo STABLE e SECURITY INVOKER, e a vista com security_invoker=true.';
END;
$conferir$;
