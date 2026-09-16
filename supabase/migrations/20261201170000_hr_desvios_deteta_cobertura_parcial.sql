-- ==============================================================================
-- O tipo "planeado_sem_realizado" so dispara quando NAO HA sobreposicao
-- nenhuma entre planeado e realizado nesse dia (NOT EXISTS). Uma sobreposicao
-- PARCIAL -- picou parte do turno, faltou o resto (ex. o almoco: planeado
-- 09:00-18:00, picado 09:00-12:00 e 13:00-18:00, falta 1h) -- ja chega para
-- excluir esse planeado da lista, e nao ha nenhum dos outros tres tipos que
-- capture isto. O buraco fica invisivel na Fila de Trabalho.
--
-- Confirmado ao vivo, com dados reais da nike em Setembro de 2026: Nuno
-- Baptista (2026-09-04, 90 min por explicar), Dulce Ramos (2026-09-08, 89
-- min), Sofia Antunes (2026-09-10, 84 min) -- nenhum destes tres dias
-- aparece em NENHUM dos 4 tipos de desvio hoje.
--
--
-- -- A CORRECCAO -----------------------------------------------------------------
--
-- Tipo novo, (e) "planeado_parcialmente_realizado": para cada bloco
-- planeado, soma quantos minutos ja estao cobertos por realizado (LATERAL,
-- sobreposicao de intervalos), e dispara quando ha ALGUMA cobertura (>0,
-- senao e o tipo "a", que fica inalterado) mas nao cobre o bloco todo.
--
-- Nao precisa do seu proprio "least(_data_ate, current_date)" -- le da MESMA
-- CTE `planeado` que o tipo (a) ja usa, que ja vem filtrada por `dias`
-- (capada em current_date). O acto de justificar (marcar falta, completa ou
-- parcial) ja existe e ja funciona para os dois casos -- so faltava a fila
-- avisar que o dia precisa de atencao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Reaplicar o corpo de 20261201160000 sem o bloco UNION ALL do tipo (e).
--
-- Prerequisitos:
--   20261201160000  hr_assiduidade_desvios (4 tipos, travados em current_date)
-- ==============================================================================

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
      FROM generate_series(_data_de, least(_data_ate, current_date), interval '1 day') AS d
  ),
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

  -- (a) Havia turno e nao ha horas nenhumas.
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
     AND h.data BETWEEN _data_de AND least(_data_ate, current_date)
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
     AND pi.data_local BETWEEN _data_de AND least(_data_ate, current_date)
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
     AND f.data BETWEEN _data_de AND least(_data_ate, current_date)

  UNION ALL

  -- (e) Havia turno, ha ALGUMAS horas, mas nao cobrem o bloco todo -- o caso
  -- do almoco nao picado (planeado 9-18, picado 9-12 e 13-18, falta 1h), ou
  -- qualquer outra falta parcial sem registo. So dispara quando a cobertura
  -- e maior que zero (cobertura zero e o tipo "a", acima).
  SELECT p.organization_id, p.pessoa_id, p.data,
         'planeado_parcialmente_realizado'::text AS tipo,
         p.hora_inicio, p.hora_fim,
         ((EXTRACT(epoch FROM (p.hora_fim - p.hora_inicio)) / 60)::integer - cobertura.explicados) AS minutos,
         p.planeado_id, p.local_id,
         NULL::uuid AS referencia_id,
         'havia turno planeado e so parte das horas foi registada -- pode ser um almoco nao picado, ou outra falta parcial. Decide-se, nao se infere.'::text AS detalhe
    FROM planeado p
    JOIN LATERAL (
      -- "explicados" soma o realizado E qualquer falta ja registada que se
      -- sobreponha ao bloco -- nao basta EXISTS (uma falta pequena, alheia
      -- ao buraco real, ex. um atraso de 15 min de manha, nao pode calar um
      -- buraco de 1h ao almoco so por partilhar o mesmo bloco planeado).
      --
      -- Limitacao residual conhecida e aceite: se uma falta registada se
      -- sobrepuser em TEMPO a propria picagem real (estado de dados
      -- contraditorio -- falta significa tempo NAO trabalhado, nao devia
      -- acontecer), estes minutos contam a mesma janela duas vezes e
      -- "explicados" fica ligeiramente inflacionado, subestimando os
      -- minutos em falta. Nunca suprime o desvio por completo nesse caso
      -- (ao contrario do bug original com NOT EXISTS) -- precisao
      -- aproximada num caso raro e contraditorio, em vez de voltar a
      -- esconder o desvio.
      SELECT
        coalesce(sum(
          greatest(0, (EXTRACT(epoch FROM (
            least(p.hora_fim, h.hora_fim) - greatest(p.hora_inicio, h.hora_inicio)
          )) / 60)::integer)
        ), 0)
        +
        coalesce((
          SELECT sum(greatest(0, (EXTRACT(epoch FROM (
                   least(p.hora_fim, f.hora_fim) - greatest(p.hora_inicio, f.hora_inicio)
                 )) / 60)::integer))
            FROM public.v_hr_faltas_em_vigor f
           WHERE f.pessoa_id = p.pessoa_id
             AND f.data = p.data
             AND p.hora_inicio < f.hora_fim AND f.hora_inicio < p.hora_fim
        ), 0) AS explicados
        FROM public.v_hr_horario_realizado_em_vigor h
       WHERE h.pessoa_id = p.pessoa_id
         AND h.data = p.data
         AND p.hora_inicio < h.hora_fim AND h.hora_inicio < p.hora_fim
    ) cobertura ON true
   WHERE cobertura.explicados < (EXTRACT(epoch FROM (p.hora_fim - p.hora_inicio)) / 60)::integer
     AND EXISTS (
       -- So dispara (e) quando ha ALGUMA cobertura real de trabalho -- zero
       -- realizado e o tipo (a), mesmo que uma falta parcial ja exista.
       SELECT 1 FROM public.v_hr_horario_realizado_em_vigor h
        WHERE h.pessoa_id = p.pessoa_id
          AND h.data = p.data
          AND p.hora_inicio < h.hora_fim AND h.hora_inicio < p.hora_fim
     )
     AND NOT EXISTS (
       -- Ausencia aprovada continua a ser um EXISTS de dia inteiro -- a
       -- mesma limitacao que o tipo (a) ja tinha (nao conhece fraccoes de
       -- hora da ausencia). Fora de ambito desta migracao.
       SELECT 1 FROM public.pessoas_ausencias_dias a
        WHERE a.pessoa_id = p.pessoa_id
          AND a.data = p.data
          AND a.estado = 'aprovado'
     )
$$;

COMMENT ON FUNCTION public.hr_assiduidade_desvios(uuid, date, date) IS
'A fila de trabalho de quem gere assiduidade: onde e que o planeado e o realizado nao coincidem, numa janela de datas. Cinco tipos -- planeado_sem_realizado (zero cobertura), planeado_parcialmente_realizado (cobertura parcial, ex. almoco nao picado -- 20261201170000), realizado_sem_planeado, pendente_par, falta_coberta_por_ausencia. NUNCA olha para alem de HOJE, em nenhum dos cinco. Um dia com ausencia APROVADA tambem nao aparece como desvio -- ferias deferidas nao sao um desvio.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.hr_assiduidade_desvios(uuid,date,date)'::regprocedure) INTO v_def;

  IF v_def NOT LIKE '%planeado_parcialmente_realizado%' THEN
    RAISE EXCEPTION 'hr_assiduidade_desvios nao ficou com o tipo planeado_parcialmente_realizado.';
  END IF;

  IF (SELECT count(*) FROM regexp_matches(v_def, 'least\(_data_ate, current_date\)', 'g')) <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se 4 ocorrencias de least(_data_ate, current_date) (o tipo novo partilha a da CTE `dias` com o tipo a), encontraram-se %.',
      (SELECT count(*) FROM regexp_matches(v_def, 'least\(_data_ate, current_date\)', 'g'));
  END IF;

  RAISE NOTICE 'OK: hr_assiduidade_desvios passa a detectar cobertura parcial (tipo planeado_parcialmente_realizado), mantendo os quatro tipos anteriores.';
END;
$conferir$;
