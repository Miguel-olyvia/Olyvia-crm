-- ==============================================================================
-- As vistas de assiduidade: faltas em vigor, e a fila de DESVIOS.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Quem gere assiduidade precisa de uma fila de trabalho: onde e que o planeado
-- e o realizado nao coincidem. E precisa dela SEM que a base transforme
-- automaticamente esses desvios em faltas -- um desvio pode ser uma picagem
-- esquecida, e converter picagem esquecida em falta injustificada e a coisa que
-- mais rapido faz perder a confianca no modulo.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma vista que PROPOE, com as horas ja calculadas para o formulario abrir
-- preenchido, e que NAO ESCREVE NADA. Quatro tipos de desvio:
--
--   planeado_sem_realizado      -- havia turno e nao ha horas. Candidato a
--                                  falta, ou picagem esquecida.
--   realizado_sem_planeado      -- ha horas e nao havia turno. Candidato a
--                                  trabalho extraordinario.
--   pendente_par                -- picagem em vigor que nao formou intervalo:
--                                  entrada sem saida, ou saida orfa.
--   falta_coberta_por_ausencia  -- falta activa num dia que passou a ter
--                                  ausencia aprovada. E o atestado que chegou
--                                  na quinta-feira, e resolve-se com
--                                  rpc_hr_falta_anular_por_ausencia.
--
-- E uma vista v_hr_faltas_em_vigor, gemea das das picagens e do realizado: a
-- falta que conta e a activa que ninguem corrige.
--
-- TODAS as vistas levam security_invoker = true. Sem isso correm com os
-- direitos do dono e viram porta lateral para as horas e as faltas de outras
-- organizacoes -- e uma vista de desvios sem isso seria a pior delas, porque
-- atravessa quatro tabelas de uma vez.
--
--
-- -- A JANELA, E PORQUE E LIMITADA --------------------------------------------
--
-- A vista cobre os ultimos 62 dias e nao a historia toda. Um desvio e uma FILA
-- DE TRABALHO, nao um relatorio historico: expandir o calendario planeado sobre
-- anos de dados, por pessoa e por dia, e uma travessia que cresce sem limite e
-- que ninguem vai olhar. Para uma janela arbitraria existe a funcao
-- hr_assiduidade_desvios(org, de, ate), com o mesmo conteudo.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - NADA nesta migracao escreve em pessoas_faltas. A vista propoe; a decisao e
--   humana, com hr.assiduidade.faltas.edit, por rpc_hr_falta_marcar.
-- - Tolerancias de atraso e arredondamentos: um desvio de tres minutos aparece
--   como desvio. Filtrar por tolerancia e uma regra de convencao colectiva, e
--   nao esta decidida -- o filtro fica no ecra, onde se pode mudar sem migracao.
-- - Horas extraordinarias, banco de horas, subsidio de refeicao, e qualquer
--   ligacao a pessoas_retribuicoes.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP VIEW public.v_hr_assiduidade_desvios;
--   DROP FUNCTION public.hr_assiduidade_desvios(uuid, date, date);
--   DROP VIEW public.v_hr_faltas_em_vigor;
--
--
-- Prerequisitos:
--   20261120150000  pessoas_horario_planeado (dia_semana 0=domingo, data, nao_trabalha)
--   20261121180000  v_hr_horario_realizado_em_vigor
--   20261121170000  v_hr_picagens_em_vigor
--   20261121200000  pessoas_faltas
--   20261121080000  pessoas_ausencias_dias
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'public.pessoas_horario_planeado',
    'public.pessoas_faltas',
    'public.pessoas_ausencias_dias',
    'public.v_hr_horario_realizado_em_vigor',
    'public.v_hr_picagens_em_vigor'
  ] LOOP
    IF to_regclass(v_t) IS NULL THEN
      RAISE EXCEPTION '% nao existe. Aplicar as migracoes anteriores desta ronda primeiro.', v_t;
    END IF;
  END LOOP;

  -- A convencao de dia_semana da ronda 2 e 0=domingo, e a vista depende dela:
  -- com outra convencao, os desvios sairiam desalinhados por um dia e ninguem
  -- notaria de imediato.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_dia_semana_valido'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
       AND pg_get_constraintdef(oid) LIKE '%>= 0%'
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_planeado nao tem o CHECK de dia_semana entre 0 e 6. A vista de desvios assenta na convencao 0=domingo (extract(dow)); com outra, os desvios sairiam desalinhados por um dia.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. As faltas em vigor
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_hr_faltas_em_vigor
WITH (security_invoker = true) AS
SELECT f.*
  FROM public.pessoas_faltas f
 WHERE f.estado = 'activa'
   AND NOT EXISTS (
     SELECT 1 FROM public.pessoas_faltas c
      WHERE c.corrige_falta_id = f.id
        AND c.estado <> 'anulada'
   );

REVOKE ALL ON public.v_hr_faltas_em_vigor FROM anon;
GRANT SELECT ON public.v_hr_faltas_em_vigor TO authenticated;
GRANT SELECT ON public.v_hr_faltas_em_vigor TO service_role;

COMMENT ON VIEW public.v_hr_faltas_em_vigor IS
'As faltas que CONTAM: activas e que ninguem corrige. Gemea de v_hr_picagens_em_vigor e v_hr_horario_realizado_em_vigor, e pela mesma razao -- corrigir e inserir, e a tabela em bruto contem tambem as versoes substituidas.

security_invoker = true e OBRIGATORIO: sem isso corre com os direitos do dono e vira porta lateral para as faltas de outras organizacoes.';

-- ==============================================================================
-- 2. Os desvios, como funcao com janela
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_assiduidade_desvios(
  _organization_id uuid,
  _data_de date,
  _data_ate date
)
RETURNS TABLE (
  organization_id uuid,
  pessoa_id       uuid,
  data            date,
  tipo            text,
  hora_inicio     time,
  hora_fim        time,
  minutos         integer,
  planeado_id     uuid,
  local_id        uuid,
  referencia_id   uuid,
  detalhe         text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH dias AS (
    SELECT d::date AS data
      FROM generate_series(_data_de, _data_ate, interval '1 day') AS d
  ),
  -- Uma excepcao por data SUBSTITUI as regras recorrentes desse dia: e a
  -- convencao da ronda 2, e resolve-se com o NOT EXISTS abaixo.
  planeado AS (
    SELECT hp.pessoa_id, hp.organization_id, di.data,
           hp.id AS planeado_id, hp.hora_inicio, hp.hora_fim, hp.local_id
      FROM public.pessoas_horario_planeado hp
      JOIN dias di ON di.data = hp.data
     WHERE hp.organization_id = _organization_id
       AND hp.deleted_at IS NULL
       AND hp.nao_trabalha = false
       AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL

    UNION ALL

    SELECT hp.pessoa_id, hp.organization_id, di.data,
           hp.id AS planeado_id, hp.hora_inicio, hp.hora_fim, hp.local_id
      FROM public.pessoas_horario_planeado hp
      JOIN dias di ON hp.dia_semana = extract(dow FROM di.data)::smallint
     WHERE hp.organization_id = _organization_id
       AND hp.deleted_at IS NULL
       AND hp.nao_trabalha = false
       AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL
       AND (hp.valido_de IS NULL OR di.data >= hp.valido_de)
       AND (hp.valido_ate IS NULL OR di.data <= hp.valido_ate)
       AND NOT EXISTS (
         SELECT 1 FROM public.pessoas_horario_planeado ex
          WHERE ex.pessoa_id = hp.pessoa_id
            AND ex.organization_id = hp.organization_id
            AND ex.data = di.data
            AND ex.deleted_at IS NULL
       )
  )

  -- (a) Havia turno e nao ha horas.
  SELECT p.organization_id, p.pessoa_id, p.data,
         'planeado_sem_realizado'::text AS tipo,
         p.hora_inicio, p.hora_fim,
         (EXTRACT(epoch FROM (p.hora_fim - p.hora_inicio)) / 60)::integer AS minutos,
         p.planeado_id, p.local_id,
         NULL::uuid AS referencia_id,
         'havia turno planeado e nao ha horas registadas. Pode ser falta, ou picagem esquecida -- decide-se, nao se infere.'::text AS detalhe
    FROM planeado p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.v_hr_horario_realizado_em_vigor h
      WHERE h.pessoa_id = p.pessoa_id
        AND h.data = p.data
        AND p.hora_inicio < h.hora_fim AND h.hora_inicio < p.hora_fim
   )
     AND NOT EXISTS (
     SELECT 1 FROM public.v_hr_faltas_em_vigor f
      WHERE f.pessoa_id = p.pessoa_id
        AND f.data = p.data
        AND p.hora_inicio < f.hora_fim AND f.hora_inicio < p.hora_fim
   )
     -- Um dia de ferias deferidas nao e um desvio.
     AND NOT EXISTS (
     SELECT 1 FROM public.pessoas_ausencias_dias a
      WHERE a.pessoa_id = p.pessoa_id
        AND a.data = p.data
        AND a.estado = 'aprovado'
   )

  UNION ALL

  -- (b) Ha horas e nao havia turno.
  SELECT h.organization_id, h.pessoa_id, h.data,
         'realizado_sem_planeado'::text,
         h.hora_inicio, h.hora_fim, h.minutos,
         h.planeado_id, h.local_id,
         h.id,
         'ha horas registadas e nao havia turno planeado. Candidato a trabalho extraordinario -- a base nao o classifica nem o converte em dinheiro.'::text
    FROM public.v_hr_horario_realizado_em_vigor h
   WHERE h.organization_id = _organization_id
     AND h.data BETWEEN _data_de AND _data_ate
     AND NOT EXISTS (
       SELECT 1 FROM planeado p
        WHERE p.pessoa_id = h.pessoa_id
          AND p.data = h.data
          AND h.hora_inicio < p.hora_fim AND p.hora_inicio < h.hora_fim
     )

  UNION ALL

  -- (c) Picagem que nao formou par.
  SELECT pi.organization_id, pi.pessoa_id, pi.data_local,
         'pendente_par'::text,
         pi.hora_local, NULL::time, NULL::integer,
         pi.planeado_id, pi.local_id,
         pi.id,
         CASE pi.sentido
           WHEN 'entrada' THEN 'entrada sem saida: o intervalo nao se fecha e nao ha horas contabilizadas. Corrigir com rpc_hr_picagem_corrigir, ou registar a saida em falta.'
           ELSE 'saida sem entrada: a consolidacao nao forma par nenhum a partir dela.'
         END::text
    FROM public.v_hr_picagens_em_vigor pi
   WHERE pi.organization_id = _organization_id
     AND pi.data_local BETWEEN _data_de AND _data_ate
     AND pi.realizado_id IS NULL

  UNION ALL

  -- (d) Falta que passou a estar coberta por ausencia aprovada.
  SELECT f.organization_id, f.pessoa_id, f.data,
         'falta_coberta_por_ausencia'::text,
         f.hora_inicio, f.hora_fim, f.minutos,
         f.planeado_id, f.local_id,
         a.id,
         'o dia passou a ter ausencia APROVADA depois de a falta ter sido marcada -- o atestado que chegou na quinta-feira. Resolve-se com rpc_hr_falta_anular_por_ausencia, que anula a falta com rasto.'::text
    FROM public.v_hr_faltas_em_vigor f
    JOIN public.pessoas_ausencias_dias a
      ON a.pessoa_id = f.pessoa_id
     AND a.organization_id = f.organization_id
     AND a.data = f.data
     AND a.estado = 'aprovado'
   WHERE f.organization_id = _organization_id
     AND f.data BETWEEN _data_de AND _data_ate
$$;

REVOKE ALL ON FUNCTION public.hr_assiduidade_desvios(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_assiduidade_desvios(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_assiduidade_desvios(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_assiduidade_desvios(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.hr_assiduidade_desvios(uuid, date, date) IS
'A fila de trabalho de quem gere assiduidade: onde e que o planeado e o realizado nao coincidem, numa janela de datas. Quatro tipos -- planeado_sem_realizado, realizado_sem_planeado, pendente_par, falta_coberta_por_ausencia.

PROPOE, NAO ESCREVE. Devolve as horas ja calculadas para o formulario de falta abrir preenchido, e nada mais: converter automaticamente um desvio em falta injustificada e a coisa que mais rapido faz perder a confianca no modulo, porque um desvio pode ser uma picagem esquecida.

Um dia com ausencia APROVADA nao aparece como planeado_sem_realizado: ferias deferidas nao sao um desvio.

SECURITY INVOKER, como hr_ausencias_saldo e pela mesma razao: atravessa quatro tabelas que ja tem RLS correcta, e sob invocador ninguem le desvios de quem nao pode ver. Como DEFINER, bastava passar-lhe um organization_id.

NAO filtra tolerancias: um desvio de tres minutos aparece. Filtrar por tolerancia e regra de convencao colectiva e nao esta decidida -- o filtro fica no ecra, onde se muda sem migracao.';

-- ==============================================================================
-- 3. A vista, com a janela dos ultimos 62 dias
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_hr_assiduidade_desvios
WITH (security_invoker = true) AS
SELECT d.*
  FROM (SELECT DISTINCT hp.organization_id FROM public.pessoas_horario_planeado hp
         WHERE hp.deleted_at IS NULL) AS orgs
  CROSS JOIN LATERAL public.hr_assiduidade_desvios(
    orgs.organization_id, (current_date - 62), current_date
  ) AS d;

REVOKE ALL ON public.v_hr_assiduidade_desvios FROM anon;
GRANT SELECT ON public.v_hr_assiduidade_desvios TO authenticated;
GRANT SELECT ON public.v_hr_assiduidade_desvios TO service_role;

COMMENT ON VIEW public.v_hr_assiduidade_desvios IS
'A fila de desvios dos ultimos 62 DIAS, para o ecra abrir sem parametros. A janela e limitada de proposito: um desvio e uma fila de trabalho e nao um relatorio historico, e expandir o calendario planeado sobre anos de dados, por pessoa e por dia, e uma travessia que cresce sem limite e que ninguem vai olhar. Para uma janela arbitraria, chamar hr_assiduidade_desvios(org, de, ate).

security_invoker = true, e a funcao por baixo tambem e INVOKER: sem isso esta vista seria a pior porta lateral do modulo, porque atravessa planeado, realizado, picagens, faltas e ausencias de uma vez.

Quem nao tem permissao ve zero linhas, nao um erro. Um zero de desvios lido sem permissao NAO prova que nao ha desvios.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_v    text;
  v_opts text;
  v_sec  boolean;
BEGIN
  -- As tres vistas gemeas de "valor em vigor" tem de existir todas: se faltar
  -- uma, ha uma tabela cujo valor em vigor se le da tabela em bruto, com as
  -- versoes substituidas la dentro.
  FOREACH v_v IN ARRAY ARRAY[
    'v_hr_faltas_em_vigor',
    'v_hr_picagens_em_vigor',
    'v_hr_horario_realizado_em_vigor',
    'v_hr_assiduidade_desvios'
  ] LOOP
    IF to_regclass('public.' || v_v) IS NULL THEN
      RAISE EXCEPTION 'A vista public.% nao existe.', v_v;
    END IF;

    SELECT coalesce(array_to_string(c.reloptions, ','), '') INTO v_opts
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_v;

    IF v_opts NOT LIKE '%security_invoker=true%' THEN
      RAISE EXCEPTION
        'A vista public.% ficou sem security_invoker=true. Assim corre com os direitos do dono e e uma porta lateral para os dados de outras organizacoes. Opcoes: "%"', v_v, v_opts;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_v, 'SELECT') THEN
      RAISE EXCEPTION 'anon consegue ler public.%. O REVOKE nao pegou.', v_v;
    END IF;
  END LOOP;

  -- A funcao de desvios tem de ser INVOKER. Aqui, como no saldo, e SECURITY
  -- DEFINER que seria o defeito.
  SELECT p.prosecdef INTO v_sec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_assiduidade_desvios' AND p.pronargs = 3;

  IF v_sec IS NULL THEN
    RAISE EXCEPTION 'hr_assiduidade_desvios(uuid, date, date) nao ficou criada com 3 argumentos.';
  END IF;

  IF v_sec IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'hr_assiduidade_desvios ficou SECURITY DEFINER. Tem de ser INVOKER: como DEFINER, bastava passar-lhe um organization_id para ler as horas e as faltas de qualquer organizacao.';
  END IF;

  IF has_function_privilege('anon', 'public.hr_assiduidade_desvios(uuid, date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar hr_assiduidade_desvios. O REVOKE nao pegou.';
  END IF;

  -- E a garantia que e o ponto todo desta migracao: nada aqui escreve.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_assiduidade_desvios'
       AND (p.prosrc ~* '\minsert\M' OR p.prosrc ~* '\mupdate\M' OR p.prosrc ~* '\mdelete\M')
  ) THEN
    RAISE EXCEPTION
      'hr_assiduidade_desvios contem uma escrita. A fila de desvios PROPOE e nao escreve: converter automaticamente um desvio em falta injustificada e a coisa que mais rapido faz perder a confianca no modulo.';
  END IF;

  RAISE NOTICE 'Conferido: as vistas de valor em vigor e a fila de desvios, todas INVOKER e todas sem escrita.';
END;
$conferir$;
