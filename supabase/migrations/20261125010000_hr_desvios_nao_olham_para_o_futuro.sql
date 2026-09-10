-- ==============================================================================
-- Um dia que ainda nao chegou nao e um desvio.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A fila de trabalho da assiduidade mostrava 168 desvios numa organizacao com
-- dez pessoas. Quase todos eram "turno planeado sem horas" em dias FUTUROS: a
-- Dulce Ramos tem turno de manha e de tarde de segunda a sexta, e a fila
-- contava cada um deles ate ao fim do mes como se fosse uma falta por
-- esclarecer.
--
-- A vista v_hr_assiduidade_desvios ja parava em current_date (20261121250000,
-- a janela dos 62 dias). A FUNCAO hr_assiduidade_desvios(org, de, ate), que e
-- a que o ecra chama, aceitava qualquer intervalo -- e o ecra pede o MES
-- INTEIRO, do dia 1 ao dia 30. A inconsistencia entre as duas era o defeito.
--
--
-- -- ONDE SE CORRIGE, E PORQUE AQUI ---------------------------------------------
--
-- Na funcao, e nao no ecra. "Um turno de amanha sem horas registadas nao e um
-- desvio" nao e uma preferencia de quem olha para a lista: e o que a palavra
-- desvio significa. Uma guarda no ecra deixaria a proxima chamada -- um
-- relatorio, uma exportacao, outra pagina -- a contar os mesmos fantasmas.
--
-- A correccao e uma so: o gerador de dias passa de
--   generate_series(_data_de, _data_ate, ...)
-- para
--   generate_series(_data_de, least(_data_ate, current_date), ...)
--
-- Isso trava os quatro tipos de desvio, e nao so o planeado_sem_realizado --
-- e correcto para todos: nao ha picagens no futuro, nao ha pares pendentes no
-- futuro, e uma falta futura coberta por ausencia futura nao e trabalho para
-- ninguem fazer hoje. Pedir um intervalo futuro deixa de rebentar a fila:
-- devolve vazio, que e a resposta honesta.
--
-- O resto do corpo e IGUAL ao de 20261121250000. Foi copiado tal e qual, e
-- nao reescrito, para a diferenca entre as duas versoes ser exactamente esta
-- linha e nada mais.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Reaplicar o corpo de 20261121250000 (linhas 136-276) sem o least().
--
-- Prerequisitos:
--   20261121250000  hr_assiduidade_desvios e v_hr_assiduidade_desvios
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_assiduidade_desvios' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.hr_assiduidade_desvios(uuid,date,date) nao existe. Aplicar 20261121250000 primeiro.';
  END IF;
END;
$guardas$;


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
      -- NUNCA para alem de HOJE. Um turno planeado para amanha sem horas
      -- registadas nao e um desvio: e amanha. A vista por omissao ja
      -- parava em current_date, mas a funcao aceitava qualquer intervalo,
      -- e o ecra pede o MES INTEIRO -- por isso a fila de trabalho contava
      -- como desvio todos os turnos ate ao fim do mes.
      FROM generate_series(_data_de, least(_data_ate, current_date), interval '1 day') AS d
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

COMMENT ON FUNCTION public.hr_assiduidade_desvios(uuid, date, date) IS
'A fila de trabalho de quem gere assiduidade: onde e que o planeado e o realizado nao coincidem, numa janela de datas. Quatro tipos -- planeado_sem_realizado, realizado_sem_planeado, pendente_par, falta_coberta_por_ausencia. NUNCA olha para alem de HOJE, por muito longe que o intervalo pedido va: um turno de amanha sem horas registadas nao e um desvio, e amanha. Um dia com ausencia APROVADA tambem nao aparece como desvio -- ferias deferidas nao sao um desvio.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.hr_assiduidade_desvios(uuid,date,date)'::regprocedure) INTO v_def;

  IF v_def NOT LIKE '%least(_data_ate, current_date)%' THEN
    RAISE EXCEPTION
      'hr_assiduidade_desvios voltou a aceitar datas futuras. Sem o least(), a fila de trabalho conta como desvio todos os turnos planeados ate ao fim do intervalo pedido.';
  END IF;

  RAISE NOTICE 'OK: hr_assiduidade_desvios nunca olha para alem de hoje.';
END;
$conferir$;
