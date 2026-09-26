-- ============================================================
--  Operações — avisar quem tem de saber
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql.
--  Correr ANTES de: rpcs-tarefas.sql, planos.sql, despacho.sql — são esses que
--  chamam `ops_notificar()`. Se este ficheiro não correr, eles funcionam na
--  mesma: a chamada está atrás de um `to_regprocedure`, e simplesmente não
--  avisa ninguém.
--
--  ⚠ ESTE FICHEIRO ESCREVE NUMA TABELA DO CRM. É a única exceção do módulo,
--  fora do bucket de storage, e foi decidida de propósito.
--
--  O que escreve: linhas novas em `public.notifications`. Só INSERT. Nunca
--  UPDATE, nunca DELETE, e nenhuma alteração ao esquema.
--
--  Porquê: o CRM já tem um sino que a equipa abre todos os dias, e a tabela é
--  genérica — `type` é texto livre e `link` é uma rota qualquer. Construir um
--  segundo sino dentro de Operações dava dois sítios para olhar, e ninguém
--  olha para o segundo.
--
--  Três coisas que se descobriram a ler o CRM, e que mudam o desenho:
--
--   1. `kind` TEM de ser 'notification'. O default da coluna é 'alert', e o
--      sino filtra por `kind = 'notification'`. Uma linha com o default entra
--      na tabela, não dá erro nenhum, e nunca aparece a ninguém.
--
--   2. `user_id` é o id de **auth**, não de `anew_users`. Quem não tiver login
--      não tem sino — nesses casos não se escreve nada e não se rebenta.
--
--   3. `cleanup_duplicate_notifications()` do CRM resolve duplicados por
--      (type, entity_id, user_id), guardando o mais recente. Escrever com
--      `entity_id` nulo punha todos os avisos do mesmo tipo na mesma gaveta e
--      matava-os menos um. Por isso `entity_id` leva SEMPRE a ordem.
--
--  `cleanup_orphan_notifications()` só mexe em entity_type conhecidos do CRM
--  (contact, client, proposal, contract, quote, deal). O nosso é 'ops_ordem',
--  que essa função não conhece — e é por isso que não pode mudar.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Só faz alguma coisa se o CRM tiver a tabela
-- ============================================================
-- Numa base sem `notifications` isto não é um erro: é um módulo instalado sem
-- a parte dos avisos. As funções ficam criadas e não fazem nada.

DO $guarda$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'Sem public.notifications — as notificações ficam desligadas.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Escrever um aviso
-- ============================================================
-- Devolve `true` se escreveu. Devolve `false` — sem rebentar — quando não há
-- a quem escrever, ou quando o mesmo aviso já está por ler.
--
-- Nunca rebenta de propósito: um aviso que falha não pode desfazer o trabalho
-- que o gerou. Fechar uma ordem tem de continuar a fechar a ordem mesmo que o
-- sino esteja avariado.

CREATE OR REPLACE FUNCTION public.ops_notificar(
  _org_id        uuid,
  _utilizador_id uuid,          -- → anew_users.id
  _tipo          text,
  _titulo        text,
  _mensagem      text,
  _link          text DEFAULT NULL,
  _ordem_id      uuid DEFAULT NULL,
  _prioridade    text DEFAULT 'medium'
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_auth uuid;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN false; END IF;
  IF _utilizador_id IS NULL THEN RETURN false; END IF;

  SELECT auth_user_id INTO v_auth
    FROM public.anew_users
   WHERE id = _utilizador_id AND deleted_at IS NULL;

  -- Sem login não há sino. Não é erro — é uma pessoa que existe em Operações
  -- mas não entra na aplicação.
  IF v_auth IS NULL THEN RETURN false; END IF;

  -- O mesmo aviso, sobre a mesma ordem, para a mesma pessoa, ainda por ler.
  -- Sem isto, uma ordem atrasada há três dias enche o sino três vezes.
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_auth AND type = _tipo
       AND entity_id IS NOT DISTINCT FROM _ordem_id
       AND is_read = false AND is_dismissed = false AND is_resolved = false
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.notifications
    (user_id, organization_id, kind, type, title, message, link,
     entity_type, entity_id, priority, data)
  VALUES
    (v_auth, _org_id, 'notification', _tipo, _titulo, _mensagem, _link,
     CASE WHEN _ordem_id IS NULL THEN NULL ELSE 'ops_ordem' END,
     _ordem_id, _prioridade,
     jsonb_build_object('modulo', 'operacoes'));

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  -- Ver a nota no topo: o aviso é acessório, o trabalho não é.
  RAISE NOTICE 'Aviso não enviado (%): %', _tipo, SQLERRM;
  RETURN false;
END
$fn$;

REVOKE ALL ON FUNCTION public.ops_notificar(uuid, uuid, text, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. Avisar quem coordena
-- ============================================================
-- Há coisas que não têm um dono: uma não conformidade que gerou trabalho novo
-- é de quem distribui, não de quem a encontrou.
--
-- Não avisa o próprio autor. Quem carregou no botão acabou de ver o resultado
-- no ecrã; receber um sino a contar-lhe o que fez há dois segundos é ruído.

CREATE OR REPLACE FUNCTION public.ops_notificar_coordenacao(
  _org_id     uuid,
  _tipo       text,
  _titulo     text,
  _mensagem   text,
  _link       text DEFAULT NULL,
  _ordem_id   uuid DEFAULT NULL,
  _prioridade text DEFAULT 'medium',
  _exceto     uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_p record;
  v_n integer := 0;
BEGIN
  FOR v_p IN
    SELECT utilizador_id
      FROM public.ops_utilizador_perfil
     WHERE organization_id = _org_id
       AND ativo
       AND funcao IN ('admin', 'gestor')
       AND utilizador_id IS DISTINCT FROM _exceto
  LOOP
    IF public.ops_notificar(_org_id, v_p.utilizador_id, _tipo, _titulo,
                            _mensagem, _link, _ordem_id, _prioridade) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END
$fn$;

REVOKE ALL ON FUNCTION public.ops_notificar_coordenacao(uuid, text, text, text, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 3. O que se perde em silêncio
-- ============================================================
-- As duas falhas que ninguém vê acontecer:
--
--  · uma ordem passou a hora marcada e ninguém a começou;
--  · uma ordem ficou em pausa à espera de material, e a data de retoma passou.
--
-- Nenhuma das duas gera um evento — são o contrário disso, são a ausência de
-- um evento. Só se descobrem a olhar para o relógio.
--
-- É idempotente: o guarda do §1 impede o segundo aviso enquanto o primeiro
-- estiver por ler.

CREATE OR REPLACE FUNCTION public.ops_avisar_atrasos()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_o record;
  v_n integer := 0;
BEGIN
  -- Passou a hora e não começou.
  FOR v_o IN
    SELECT id, organization_id, codigo, titulo, responsavel_id, agendada_para
      FROM public.ops_ordem
     WHERE estado = 'agendada'
       AND agendada_para IS NOT NULL
       AND agendada_para < now()
  LOOP
    IF v_o.responsavel_id IS NOT NULL THEN
      IF public.ops_notificar(
           v_o.organization_id, v_o.responsavel_id, 'operacoes_ordem_atrasada',
           v_o.codigo || ' está atrasada',
           'Estava marcada para ' || to_char(v_o.agendada_para, 'DD/MM às HH24:MI')
             || ' e ainda não foi iniciada. ' || v_o.titulo,
           '/operacao/ordens/' || v_o.codigo, v_o.id, 'high') THEN
        v_n := v_n + 1;
      END IF;
    ELSE
      -- Sem responsável, o atraso é de quem devia ter distribuído.
      v_n := v_n + public.ops_notificar_coordenacao(
        v_o.organization_id, 'operacoes_ordem_atrasada',
        v_o.codigo || ' está atrasada e sem responsável',
        'Estava marcada para ' || to_char(v_o.agendada_para, 'DD/MM às HH24:MI')
          || ' e não tem ninguém atribuído. ' || v_o.titulo,
        '/operacao/ordens/' || v_o.codigo, v_o.id, 'high');
    END IF;
  END LOOP;

  -- Em pausa, e a data de retoma já passou.
  FOR v_o IN
    SELECT id, organization_id, codigo, titulo, responsavel_id,
           pausa_motivo, pausa_retoma_prevista
      FROM public.ops_ordem
     WHERE estado = 'pausada'
       AND pausa_retoma_prevista IS NOT NULL
       AND pausa_retoma_prevista < now()
  LOOP
    IF public.ops_notificar(
         v_o.organization_id, v_o.responsavel_id, 'operacoes_pausa_expirada',
         v_o.codigo || ' devia ter sido retomada',
         'Em pausa: ' || COALESCE(v_o.pausa_motivo, 'sem motivo registado')
           || '. A retoma estava prevista para '
           || to_char(v_o.pausa_retoma_prevista, 'DD/MM') || '.',
         '/operacao/ordens/' || v_o.codigo, v_o.id, 'high') THEN
      v_n := v_n + 1;
    END IF;

    v_n := v_n + public.ops_notificar_coordenacao(
      v_o.organization_id, 'operacoes_pausa_expirada',
      v_o.codigo || ' devia ter sido retomada',
      'A retoma estava prevista para '
        || to_char(v_o.pausa_retoma_prevista, 'DD/MM') || '. ' || v_o.titulo,
      '/operacao/ordens/' || v_o.codigo, v_o.id, 'high', v_o.responsavel_id);
  END LOOP;

  RETURN v_n;
END
$fn$;

REVOKE ALL ON FUNCTION public.ops_avisar_atrasos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_avisar_atrasos() TO service_role;


-- ============================================================
-- 4. A porta pela qual a aplicação pede a verificação
-- ============================================================
-- O pg_cron pode não estar ligado, e mesmo ligado corre de hora a hora. Quem
-- coordena abre o painel e quer a verdade daquele momento.
--
-- Só quem coordena a pode chamar: percorre a base inteira, e um técnico não
-- tem que mandar varrer as ordens de toda a gente.

CREATE OR REPLACE FUNCTION public.rpc_ops_avisar_atrasos()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := public.current_business_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = v_user AND ativo AND funcao IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Só quem coordena verifica os atrasos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object('ok', true, 'avisos', public.ops_avisar_atrasos());
END
$fn$;

REVOKE ALL ON FUNCTION public.rpc_ops_avisar_atrasos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_avisar_atrasos() TO authenticated, service_role;


-- ============================================================
-- 5. De hora a hora, se o pg_cron estiver ligado
-- ============================================================
-- Mesmo padrão que o CRM já usa nas suas migrations: tenta, e se a extensão
-- não existir segue em frente. Nunca faz falhar a instalação.

DO $agendar$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops-avisar-atrasos') THEN
      PERFORM cron.unschedule('ops-avisar-atrasos');
    END IF;

    PERFORM cron.schedule(
      'ops-avisar-atrasos', '0 * * * *',
      'SELECT public.ops_avisar_atrasos();');

    RAISE NOTICE 'pg_cron: ops-avisar-atrasos agendado de hora a hora.';
  ELSE
    RAISE NOTICE 'Sem pg_cron. Os atrasos são verificados quando alguém abre o painel.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron não agendado: %', SQLERRM;
END
$agendar$;

COMMIT;
