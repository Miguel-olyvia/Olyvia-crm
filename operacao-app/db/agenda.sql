-- ============================================================
--  Operações — a agenda que o CRM já tinha
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql.
--  Correr ANTES de: despacho.sql — é ele que chama isto ao agendar. A chamada
--  está atrás de um `to_regprocedure`, por isso sem este ficheiro o agendamento
--  funciona na mesma, só sem os avisos.
--
--  O problema que resolve: o aviso de choque que já existe só olha para ordens
--  de Operações. Não sabe que o técnico está de férias, nem que não trabalha às
--  sextas, nem que o dia é feriado. Marca-se a visita, e descobre-se na véspera.
--
--  O CRM tem isso tudo, e Operações ignorava-o:
--
--    schedule_resources          quem é quem na agenda
--    resource_time_off           férias e ausências, com aprovação
--    resource_availability_rules horário de cada pessoa, por dia da semana
--    schedule_holidays           feriados
--
--  **A ligação já existia e ninguém deu por ela.** `schedule_resources.user_id`
--  aponta para `anew_users.id` — o mesmo id que Operações usa. Não é preciso
--  tabela de mapa nenhuma, ao contrário do que se tinha assumido.
--
--  Escreve fora de `ops_*`? NÃO. Só lê, e só quatro tabelas.
--
--  ⚠ PRIVACIDADE: `resource_time_off` guarda `title`, `reason` e `notes`. Uma
--  ausência pode ser uma baixa médica, e quem marca uma visita não tem que
--  saber porquê — só que a pessoa não está. Por isso daqui só saem **datas**.
--  Nenhuma das três colunas é lida.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Sem as tabelas do CRM, isto fica desligado
-- ============================================================

DO $guarda$
BEGIN
  IF to_regclass('public.schedule_resources') IS NULL THEN
    RAISE NOTICE 'Sem as tabelas de agenda do CRM — os avisos de disponibilidade ficam desligados.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. O que impede alguém de estar num sítio a uma hora
-- ============================================================
-- Devolve uma linha por impedimento, ou nenhuma se a pessoa está livre.
--
-- `SECURITY DEFINER` porque as tabelas do CRM têm RLS própria, feita para os
-- ecrãs do CRM — um utilizador de Operações não lhes chega. Por isso a função
-- volta a fazer a verificação de âmbito ela mesma, logo na primeira linha: sem
-- isso, seria uma porta para ler a agenda de qualquer organização.

CREATE OR REPLACE FUNCTION public.ops_disponibilidade(
  _utilizador_id uuid,
  _org_id        uuid,
  _inicio        timestamptz,
  _fim           timestamptz
)
RETURNS TABLE (tipo text, detalhe text, desde date, ate date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_recurso uuid;
  v_ini     date := _inicio::date;
  v_fim     date := COALESCE(_fim, _inicio)::date;
BEGIN
  -- Âmbito, antes de tudo. Esta função lê tabelas do CRM com os privilégios de
  -- quem a criou; sem esta linha, qualquer sessão lia a agenda de toda a gente.
  IF NOT (
    public.is_system_admin_user(v_uid)
    OR _org_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- E a pessoa tem de ser da equipa de Operações desta organização. Sem isto,
  -- daria para sondar a agenda de qualquer utilizador do CRM.
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = _utilizador_id AND organization_id = _org_id
  ) THEN
    RETURN;
  END IF;

  IF to_regclass('public.schedule_resources') IS NULL THEN
    RETURN;
  END IF;

  SELECT sr.id INTO v_recurso
    FROM public.schedule_resources sr
   WHERE sr.user_id = _utilizador_id
     AND (sr.organization_id = _org_id OR sr.organization_id IS NULL)
     AND COALESCE(sr.is_active, true)
   LIMIT 1;

  -- ── Feriados ────────────────────────────────────────────────────────────
  -- Independentes da pessoa: um feriado é feriado para toda a gente. Ficam
  -- antes das outras verificações porque não precisam de recurso nenhum —
  -- quem ainda não está na agenda do CRM continua a ver os feriados.
  IF to_regclass('public.schedule_holidays') IS NOT NULL THEN
    RETURN QUERY
    SELECT 'feriado'::text,
           h.name::text,
           h.holiday_date,
           h.holiday_date
      FROM public.schedule_holidays h
     WHERE h.holiday_date BETWEEN v_ini AND v_fim
       AND (h.organization_id = _org_id OR h.organization_id IS NULL);
  END IF;

  IF v_recurso IS NULL THEN
    RETURN;
  END IF;

  -- ── Ausências ───────────────────────────────────────────────────────────
  -- Só as aprovadas. Um pedido de férias por aprovar não impede nada — ainda
  -- pode ser recusado, e travar o agendamento por causa dele seria decidir
  -- pelas costas de quem aprova.
  --
  -- Ver a nota de privacidade no topo: daqui só saem datas.
  IF to_regclass('public.resource_time_off') IS NOT NULL THEN
    RETURN QUERY
    SELECT 'ausente'::text,
           'Ausência marcada e aprovada'::text,
           t.start_date,
           t.end_date
      FROM public.resource_time_off t
     WHERE t.resource_id = v_recurso
       AND COALESCE(t.approved, false)
       AND daterange(t.start_date, t.end_date, '[]') && daterange(v_ini, v_fim, '[]');
  END IF;

  -- ── Fora do horário ─────────────────────────────────────────────────────
  -- Só se avisa quando a pessoa TEM horário declarado. Sem regras nenhumas,
  -- o silêncio quer dizer "não sabemos", e não "não trabalha" — avisar aí
  -- encheria o ecrã de avisos falsos para toda a gente que ainda não tem
  -- horário no CRM, e o resultado seria ninguém ler nenhum.
  IF to_regclass('public.resource_availability_rules') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.resource_availability_rules r
                  WHERE r.resource_id = v_recurso AND COALESCE(r.is_available, true))
     AND NOT EXISTS (
       SELECT 1
         FROM public.resource_availability_rules r
        WHERE r.resource_id = v_recurso
          AND COALESCE(r.is_available, true)
          AND r.day_of_week = EXTRACT(dow FROM _inicio)::int
          AND r.start_time <= _inicio::time
          AND r.end_time   >= _inicio::time
          AND (r.valid_from  IS NULL OR r.valid_from  <= v_ini)
          AND (r.valid_until IS NULL OR r.valid_until >= v_ini)
     ) THEN
    RETURN QUERY
    SELECT 'fora_de_horario'::text,
           'Fora do horário declarado desta pessoa'::text,
           v_ini,
           v_ini;
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.ops_disponibilidade(uuid, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_disponibilidade(uuid, uuid, timestamptz, timestamptz)
  TO authenticated, service_role;


-- ============================================================
-- 1b. A equipa toda, num pedido só
-- ============================================================
-- O ecrã de agenda precisa disto para cada pessoa da equipa. Perguntar uma a
-- uma davam dez idas ao servidor para desenhar um dia — e no telemóvel, com
-- rede fraca, isso vê-se.
--
-- Devolve `utilizador_id` para quem chama poder distribuir pelas colunas. Só
-- quem coordena a pode chamar: um técnico não tem que saber quem está de
-- férias na empresa toda.

CREATE OR REPLACE FUNCTION public.rpc_ops_agenda_do_dia(
  _org_id uuid,
  _dia    date
)
RETURNS TABLE (utilizador_id uuid, tipo text, detalhe text, desde date, ate date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := public.current_business_user_id();
  v_p    record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Alias obrigatório: `utilizador_id` é ao mesmo tempo uma coluna desta tabela
  -- e um parâmetro de saída do RETURNS TABLE. Sem qualificar, o plpgsql recusa
  -- a função por referência ambígua — e só na primeira vez que é chamada.
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil eu
     WHERE eu.utilizador_id = v_user AND eu.organization_id = _org_id AND eu.ativo
       AND eu.funcao IN ('admin', 'gestor', 'operador')
  ) AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Só quem coordena vê a agenda da equipa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_p IN
    SELECT up.utilizador_id
      FROM public.ops_utilizador_perfil up
     WHERE up.organization_id = _org_id AND up.ativo
  LOOP
    RETURN QUERY
    SELECT v_p.utilizador_id, d.tipo, d.detalhe, d.desde, d.ate
      FROM public.ops_disponibilidade(
             v_p.utilizador_id, _org_id,
             (_dia + time '00:00')::timestamptz,
             (_dia + time '23:59')::timestamptz) d;
  END LOOP;
END
$fn$;

REVOKE ALL ON FUNCTION public.rpc_ops_agenda_do_dia(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_agenda_do_dia(uuid, date)
  TO authenticated, service_role;


-- ============================================================
-- 2. Prova que a ligação existe mesmo
-- ============================================================
-- `schedule_resources.user_id → anew_users.id` é o pressuposto todo deste
-- ficheiro. Se um dia mudar, isto deixa de avisar seja o que for — em
-- silêncio, que é o pior modo de falhar. Fica escrito no arranque.

DO $prova$
DECLARE
  v_ok boolean;
BEGIN
  IF to_regclass('public.schedule_resources') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f'
       AND t.relname = 'schedule_resources'
       AND f.relname = 'anew_users'
       AND c.conname LIKE '%user_id%'
  ) INTO v_ok;

  IF v_ok THEN
    RAISE NOTICE 'Operações: agenda ligada — férias, horários e feriados do CRM.';
  ELSE
    RAISE WARNING 'schedule_resources.user_id já não aponta para anew_users — os avisos de disponibilidade vão ficar sempre vazios.';
  END IF;
END
$prova$;

COMMIT;
