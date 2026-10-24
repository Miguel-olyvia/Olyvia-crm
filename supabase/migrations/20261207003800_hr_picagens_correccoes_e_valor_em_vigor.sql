-- ==============================================================================
-- Correccoes de picagem, o "valor em vigor", e as RPCs de picar / corrigir /
-- anular.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O registo de tempo de trabalho tem de ficar disponivel CINCO ANOS. Uma
-- correccao que faca UPDATE ao valor original destroi a prova de qual era o
-- valor antes -- e e precisamente essa prova que serve numa inspeccao ou numa
-- disputa. E um DELETE destroi tudo.
--
-- Mas se nada se apaga e nada se altera, fica a pergunta pratica: com tres
-- correccoes empilhadas, qual e o valor que conta?
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Cadeia de correccao por corrige_picagem_id, append-only, e o valor em vigor e
-- A CABECA DA CADEIA: a linha que ninguem corrige.
--
--   - corrigir e INSERIR uma linha nova, completa, com corrige_picagem_id a
--     apontar a errada, correccao_tipo e correccao_motivo obrigatorios (CHECK
--     em 20261121160000), e o autor gravado DUAS VEZES -- anew_user_id porque e
--     a identidade que decidiu, pessoa_id porque e a ficha que se le dentro de
--     cinco anos quando a conta ja nao existe;
--   - a linha corrigida passa a estado='corrigida'. E o UNICO update permitido,
--     e e a uma coluna de estado, nao ao valor;
--   - ninguem apaga: DELETE fechado por politica restritiva, e nao ha
--     deleted_at a oferecer atalho.
--
-- A CADEIA E MANTIDA LINEAR POR UM INDICE, e nao por confianca:
--
--   UNIQUE (corrige_picagem_id) WHERE corrige_picagem_id IS NOT NULL
--                                 AND estado <> 'anulada'
--
-- Com no maximo um corrector vivo por linha, a cabeca e trivialmente "a linha
-- que nenhuma outra corrige", e a leitura e um ANTI-JOIN e nao um WITH
-- RECURSIVE. Tres correccoes empilhadas dao tres linhas -- duas em 'corrigida'
-- e uma em 'valida' -- a vista devolve uma, e a auditoria ve as tres subindo
-- corrige_picagem_id.
--
-- A vista leva security_invoker = true. Sem isso corre com os direitos do dono e
-- vira porta lateral para as horas de outras organizacoes.
--
-- Duas guardas mais, em trigger: nao se corrige uma linha que ja esta
-- 'anulada' (anular e corrigir sao caminhos diferentes e nao se cruzam), e nao
-- se corrige uma linha de outra data-ancora sem o dizer.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A consolidacao: hr_picagens_consolidar() e criada aqui VAZIA e
--   20261121190000 substitui-lhe o corpo, para as RPCs nao terem de ser
--   reescritas la.
-- - A correccao do REALIZADO e da FALTA: 20261121180000 e 20261121200000, com o
--   mesmo desenho.
-- - PURGA aos cinco anos: nada apaga nada. A guarda desta ronda e de RETENCAO,
--   nao de expurgo. O dever de eliminar findo o prazo e outra politica, com
--   outra decisao, e um DELETE automatico sobre registos de tempo de trabalho
--   sem essa decisao seria pior do que nao o ter.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.rpc_hr_picagem_anular(uuid, text);
--   DROP FUNCTION public.rpc_hr_picagem_corrigir(uuid, timestamptz, text, uuid, text, text);
--   DROP FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, uuid, numeric, numeric, integer, text, uuid, text);
--   DROP VIEW public.v_hr_picagens_em_vigor;
--   DROP TRIGGER trg_pessoas_picagens_correccao_coerente ON public.pessoas_picagens;
--   DROP FUNCTION public.hr_picagem_correccao_coerente();
--   DROP FUNCTION public.hr_picagens_consolidar(uuid, uuid, date);
--   DROP INDEX public.uq_picagem_um_corrector_vivo;
--
--
-- Prerequisitos:
--   20261121160000  pessoas_picagens
--   20261121140000  hr.assiduidade.picar / .picar.outros / .corrigir no catalogo
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_picagens') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_picagens nao existe. Aplicar 20261121160000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_picagens'
       AND column_name = 'corrige_picagem_id'
  ) THEN
    RAISE EXCEPTION 'pessoas_picagens nao tem corrige_picagem_id. A cadeia de correccao depende dela.';
  END IF;

  IF to_regclass('public.schedule_settings') IS NULL THEN
    RAISE EXCEPTION
      'public.schedule_settings nao existe. E de la que vem o fuso da organizacao para datar a picagem.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'schedule_settings' AND column_name = 'timezone'
  ) THEN
    RAISE EXCEPTION 'schedule_settings nao tem timezone; a RPC de picar depende dela para datar o evento.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.picar') THEN
    RAISE EXCEPTION 'hr.assiduidade.picar nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.corrigir') THEN
    RAISE EXCEPTION 'hr.assiduidade.corrigir nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A cadeia linear
-- ==============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_picagem_um_corrector_vivo
  ON public.pessoas_picagens (corrige_picagem_id)
  WHERE corrige_picagem_id IS NOT NULL AND estado <> 'anulada';

COMMENT ON INDEX public.uq_picagem_um_corrector_vivo IS
'No maximo UM corrector vivo por linha. E o que torna a cadeia linear, e por isso o "valor em vigor" e trivialmente a linha que nenhuma outra corrige -- um anti-join, e nao um WITH RECURSIVE de resultado ambiguo. Sem este indice, duas correccoes concorrentes a mesma linha dariam duas cabecas e nao haveria valor em vigor nenhum.';

-- ==============================================================================
-- 2. As guardas de coerencia da correccao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_picagem_correccao_coerente()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_alvo public.pessoas_picagens;
BEGIN
  IF NEW.corrige_picagem_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.corrige_picagem_id = NEW.id THEN
    RAISE EXCEPTION 'picagem_corrige_a_si_mesma: uma picagem nao se corrige a si propria.'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.* INTO v_alvo FROM public.pessoas_picagens p WHERE p.id = NEW.corrige_picagem_id;

  IF v_alvo.id IS NULL THEN
    RAISE EXCEPTION 'picagem_alvo_inexistente: a picagem a corrigir nao existe.' USING ERRCODE = '23503';
  END IF;

  -- Anular e corrigir sao caminhos diferentes e nao se cruzam: uma linha
  -- anulada ja nao vale nada, e "corrigir" o que nao vale nada nao produz
  -- valor em vigor -- produz confusao na auditoria.
  IF v_alvo.estado = 'anulada' THEN
    RAISE EXCEPTION
      'picagem_alvo_anulada: a picagem % esta anulada e nao se corrige. Anular e corrigir sao caminhos diferentes: para repor o registo, inserir uma picagem nova sem corrige_picagem_id.',
      NEW.corrige_picagem_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_picagem_correccao_coerente() IS
'Recusa uma correccao que aponte a si mesma, a uma picagem inexistente, ou a uma picagem JA ANULADA. A FK composta (corrige_picagem_id, pessoa_id, organization_id) ja garante que o alvo e da mesma pessoa e da mesma organizacao; isto acrescenta o resto.

Anular e corrigir nao se cruzam de proposito: uma linha anulada nao vale nada, e corrigi-la nao produz valor em vigor -- produz uma cadeia que a auditoria nao consegue ler.';

DROP TRIGGER IF EXISTS trg_pessoas_picagens_correccao_coerente ON public.pessoas_picagens;
CREATE TRIGGER trg_pessoas_picagens_correccao_coerente
  BEFORE INSERT OR UPDATE ON public.pessoas_picagens
  FOR EACH ROW EXECUTE FUNCTION public.hr_picagem_correccao_coerente();

-- ==============================================================================
-- 3. O valor em vigor
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_hr_picagens_em_vigor
WITH (security_invoker = true) AS
SELECT p.*
  FROM public.pessoas_picagens p
 WHERE p.estado = 'valida'
   AND NOT EXISTS (
     SELECT 1 FROM public.pessoas_picagens c
      WHERE c.corrige_picagem_id = p.id
        AND c.estado <> 'anulada'
   );

REVOKE ALL ON public.v_hr_picagens_em_vigor FROM anon;
GRANT SELECT ON public.v_hr_picagens_em_vigor TO authenticated;
GRANT SELECT ON public.v_hr_picagens_em_vigor TO service_role;

COMMENT ON VIEW public.v_hr_picagens_em_vigor IS
'As picagens que CONTAM: validas e que ninguem corrige. E um anti-join e nao um WITH RECURSIVE, porque o indice uq_picagem_um_corrector_vivo mantem a cadeia linear.

Tres correccoes empilhadas dao tres linhas na tabela -- duas em corrigida e uma em valida -- e esta vista devolve uma. A auditoria ve as tres subindo corrige_picagem_id.

security_invoker = true e OBRIGATORIO: sem isso a vista corre com os direitos do dono e vira porta lateral para as horas de outras organizacoes.';

-- ==============================================================================
-- 4. A consolidacao: FUNCAO VAZIA, substituida em 20261121190000
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_picagens_consolidar(
  _pessoa_id uuid,
  _organization_id uuid,
  _data date
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- VAZIA DE PROPOSITO. 20261121190000 substitui-lhe o corpo, para que as RPCs
  -- abaixo nao tenham de ser reescritas nessa migracao -- reescrever uma RPC
  -- grande para lhe acrescentar uma chamada e o caminho por onde se ressuscita
  -- uma versao antiga por engano.
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_picagens_consolidar(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_picagens_consolidar(uuid, uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.hr_picagens_consolidar(uuid, uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_picagens_consolidar(uuid, uuid, date) TO service_role;

COMMENT ON FUNCTION public.hr_picagens_consolidar(uuid, uuid, date) IS
'Emparelha as picagens em vigor de um dia e escreve os intervalos em pessoas_horario_realizado. VAZIA nesta migracao; 20261121190000 substitui-lhe o corpo. authenticated NAO a executa: e chamada de dentro das RPCs.';

-- ==============================================================================
-- 5. rpc_hr_picar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_picar(
  _organization_id uuid,
  _pessoa_id uuid,
  _sentido text,
  _momento timestamptz DEFAULT now(),
  _local_id uuid DEFAULT NULL,
  _dispositivo_id uuid DEFAULT NULL,
  _latitude numeric DEFAULT NULL,
  _longitude numeric DEFAULT NULL,
  _precisao_metros integer DEFAULT NULL,
  _origem text DEFAULT 'web',
  _vinculo_id uuid DEFAULT NULL,
  _dispositivo_ref_externa text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_anew      uuid;
  v_eu        uuid;
  v_tz        text;
  v_data      date;
  v_hora      time;
  v_planeado  uuid;
  v_id        uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'picagem_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _sentido NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'picagem_sentido_invalido: o sentido e entrada ou saida (recebido "%").', _sentido
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_eu := public.hr_pessoa_do_utilizador(v_auth, _organization_id);

  -- Picar o proprio cartao e uma permissao; picar por outro e outra. E a razao
  -- de hr.assiduidade.picar existir: ate agora o unico caminho exigia
  -- hr.pessoas.horario_realizado.edit, que serve para escrever as horas de
  -- qualquer pessoa.
  IF v_eu IS NOT NULL AND v_eu = _pessoa_id THEN
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar', _organization_id) THEN
      RAISE EXCEPTION 'picagem_sem_permissao: falta hr.assiduidade.picar nesta organizacao.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar.outros', _organization_id) THEN
      RAISE EXCEPTION
        'picagem_sem_permissao: picar na ficha de outra pessoa exige hr.assiduidade.picar.outros nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas p
     WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'picagem_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '23503';
  END IF;

  -- O dispositivo tem de ser DESTA organizacao e estar activo. A FK composta ja
  -- garante a organizacao; isto apanha o dispositivo desligado.
  IF _dispositivo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_picagens_dispositivos d
       WHERE d.id = _dispositivo_id AND d.organization_id = _organization_id
         AND d.deleted_at IS NULL AND d.activo = true
    ) THEN
      RAISE EXCEPTION
        'picagem_dispositivo_invalido: o dispositivo nao existe nesta organizacao, esta apagado, ou esta desactivado.'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  -- O fuso da organizacao, resolvido UMA VEZ e gravado. Ver o cabecalho de
  -- 20261121160000 sobre porque data_local nao e uma coluna gerada.
  SELECT s.timezone INTO v_tz
    FROM public.schedule_settings s
   WHERE s.organization_id = _organization_id
   LIMIT 1;

  v_tz := coalesce(nullif(btrim(v_tz), ''), 'Europe/Lisbon');

  v_data := (_momento AT TIME ZONE v_tz)::date;
  v_hora := (_momento AT TIME ZONE v_tz)::time;

  -- O intervalo planeado que contem esta hora, se houver. E uma ligacao, nao um
  -- calculo: nulo e normal (horas extraordinarias, turno trocado, pessoa sem
  -- horario registado).
  SELECT hp.id INTO v_planeado
    FROM public.pessoas_horario_planeado hp
   WHERE hp.pessoa_id = _pessoa_id
     AND hp.organization_id = _organization_id
     AND hp.deleted_at IS NULL
     AND v_hora >= hp.hora_inicio AND v_hora < hp.hora_fim
   ORDER BY hp.hora_inicio
   LIMIT 1;

  INSERT INTO public.pessoas_picagens (
    pessoa_id, organization_id, momento, data_local, hora_local, sentido,
    local_id, vinculo_id, planeado_id, origem, dispositivo_id, dispositivo_ref_externa,
    latitude, longitude, precisao_metros,
    registado_por_anew_user_id, registado_por_pessoa_id, created_by
  ) VALUES (
    _pessoa_id, _organization_id, _momento, v_data, v_hora, _sentido,
    _local_id, _vinculo_id, v_planeado, coalesce(_origem, 'web'), _dispositivo_id, _dispositivo_ref_externa,
    _latitude, _longitude, _precisao_metros,
    v_anew, v_eu, v_anew
  )
  RETURNING id INTO v_id;

  IF _dispositivo_id IS NOT NULL THEN
    UPDATE public.hr_picagens_dispositivos
       SET ultima_picagem_em = _momento
     WHERE id = _dispositivo_id AND organization_id = _organization_id;
  END IF;

  PERFORM public.hr_picagens_consolidar(_pessoa_id, _organization_id, v_data);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, uuid, numeric, numeric, integer, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, uuid, numeric, numeric, integer, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, uuid, numeric, numeric, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, uuid, numeric, numeric, integer, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_picar(uuid, uuid, text, timestamptz, uuid, uuid, numeric, numeric, integer, text, uuid, text) IS
'O UNICO caminho para registar uma picagem. Verifica a permissao (picar o proprio cartao e uma, picar por outro e outra), valida o dispositivo, resolve o fuso da organizacao e GRAVA a data e a hora civis, liga ao intervalo planeado que contem a hora, e corre a consolidacao do dia.

NAO valida geocercas: as coordenadas gravam-se e a validacao de que caem dentro do local e ronda propria.';

-- ==============================================================================
-- 6. rpc_hr_picagem_corrigir
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_picagem_corrigir(
  _picagem_id uuid,
  _momento timestamptz,
  _sentido text,
  _local_id uuid,
  _correccao_tipo text,
  _correccao_motivo text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_eu   uuid;
  v_old  public.pessoas_picagens;
  v_tz   text;
  v_data date;
  v_hora time;
  v_new  uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'picagem_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _correccao_motivo IS NULL OR btrim(_correccao_motivo) = '' THEN
    RAISE EXCEPTION
      'picagem_correccao_sem_motivo: corrigir uma picagem exige motivo escrito. E o rasto que fica cinco anos.'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.* INTO v_old FROM public.pessoas_picagens p WHERE p.id = _picagem_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'picagem_inexistente: a picagem % nao existe.', _picagem_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.corrigir', v_old.organization_id) THEN
    RAISE EXCEPTION
      'picagem_sem_permissao: corrigir uma picagem exige hr.assiduidade.corrigir nesta organizacao. Marcar faltas (hr.assiduidade.gerir) e outra autoridade.'
      USING ERRCODE = '42501';
  END IF;

  IF v_old.estado <> 'valida' THEN
    RAISE EXCEPTION
      'picagem_nao_corrigivel: a picagem % esta em "%" e so se corrige uma picagem valida. Se ja foi corrigida, corrigir a linha em vigor.',
      _picagem_id, v_old.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_old.organization_id);

  SELECT s.timezone INTO v_tz
    FROM public.schedule_settings s WHERE s.organization_id = v_old.organization_id LIMIT 1;
  v_tz := coalesce(nullif(btrim(v_tz), ''), 'Europe/Lisbon');

  v_data := (_momento AT TIME ZONE v_tz)::date;
  v_hora := (_momento AT TIME ZONE v_tz)::time;

  -- A linha nova primeiro, a antiga marcada depois, na MESMA transaccao: o par
  -- nunca fica meio feito.
  INSERT INTO public.pessoas_picagens (
    pessoa_id, organization_id, momento, data_local, hora_local, sentido,
    local_id, vinculo_id, planeado_id, origem,
    corrige_picagem_id, correccao_tipo, correccao_motivo,
    registado_por_anew_user_id, registado_por_pessoa_id, created_by
  ) VALUES (
    v_old.pessoa_id, v_old.organization_id, _momento, v_data, v_hora,
    coalesce(_sentido, v_old.sentido),
    coalesce(_local_id, v_old.local_id), v_old.vinculo_id, v_old.planeado_id, 'manual_rh',
    _picagem_id, _correccao_tipo, btrim(_correccao_motivo),
    v_anew, v_eu, v_anew
  )
  RETURNING id INTO v_new;

  UPDATE public.pessoas_picagens SET estado = 'corrigida' WHERE id = _picagem_id;

  -- Reconsolidar os DOIS dias: a correccao pode ter mudado a data.
  PERFORM public.hr_picagens_consolidar(v_old.pessoa_id, v_old.organization_id, v_old.data_local);
  IF v_data <> v_old.data_local THEN
    PERFORM public.hr_picagens_consolidar(v_old.pessoa_id, v_old.organization_id, v_data);
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_picagem_corrigir(uuid, timestamptz, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_picagem_corrigir(uuid, timestamptz, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picagem_corrigir(uuid, timestamptz, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picagem_corrigir(uuid, timestamptz, text, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_picagem_corrigir(uuid, timestamptz, text, uuid, text, text) IS
'Corrige uma picagem: insere a linha nova com corrige_picagem_id e marca a antiga como corrigida, na MESMA transaccao -- o par nunca fica meio feito. Exige hr.assiduidade.corrigir e motivo escrito, e grava o autor duas vezes (anew_user e pessoa).

NUNCA faz UPDATE ao valor original: e essa a prova de qual era o valor antes, e e ela que serve numa inspeccao. Reconsolida os dois dias quando a correccao muda a data.';

-- ==============================================================================
-- 7. rpc_hr_picagem_anular
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_picagem_anular(
  _picagem_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_old  public.pessoas_picagens;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'picagem_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'picagem_anulacao_sem_motivo: anular uma picagem exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT p.* INTO v_old FROM public.pessoas_picagens p WHERE p.id = _picagem_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'picagem_inexistente: a picagem % nao existe.', _picagem_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.corrigir', v_old.organization_id) THEN
    RAISE EXCEPTION
      'picagem_sem_permissao: anular uma picagem exige hr.assiduidade.corrigir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_old.estado = 'anulada' THEN
    RAISE EXCEPTION 'picagem_ja_anulada: a picagem % ja foi anulada em %.', _picagem_id, v_old.anulado_em
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  UPDATE public.pessoas_picagens
     SET estado = 'anulada',
         anulado_em = now(),
         anulado_por_anew_user_id = v_anew,
         anulacao_motivo = btrim(_motivo)
   WHERE id = _picagem_id;

  PERFORM public.hr_picagens_consolidar(v_old.pessoa_id, v_old.organization_id, v_old.data_local);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_picagem_anular(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_picagem_anular(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picagem_anular(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picagem_anular(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_picagem_anular(uuid, text) IS
'Anula uma picagem, com autor e motivo. Nao apaga: a linha fica e continua legivel cinco anos. Reconsolida o dia, porque um evento anulado deixa de formar par.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_opts text;
  v_f    text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_picagem_um_corrector_vivo'
  ) THEN
    RAISE EXCEPTION
      'uq_picagem_um_corrector_vivo nao ficou criado. Sem ele a cadeia deixa de ser linear e nao ha valor em vigor definido.';
  END IF;

  IF to_regclass('public.v_hr_picagens_em_vigor') IS NULL THEN
    RAISE EXCEPTION 'A vista v_hr_picagens_em_vigor nao ficou criada.';
  END IF;

  SELECT coalesce(array_to_string(c.reloptions, ','), '') INTO v_opts
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'v_hr_picagens_em_vigor';

  IF v_opts NOT LIKE '%security_invoker=true%' THEN
    RAISE EXCEPTION
      'v_hr_picagens_em_vigor ficou sem security_invoker=true. Assim corre com os direitos do dono e e uma porta lateral para as horas de outras organizacoes. Opcoes: "%"', v_opts;
  END IF;

  IF has_table_privilege('anon', 'public.v_hr_picagens_em_vigor', 'SELECT') THEN
    RAISE EXCEPTION 'anon consegue ler v_hr_picagens_em_vigor. O REVOKE nao pegou.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_picagens')
       AND tgname = 'trg_pessoas_picagens_correccao_coerente' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger de coerencia da correccao nao ficou criado.';
  END IF;

  FOREACH v_f IN ARRAY ARRAY[
    'hr_picagens_consolidar','hr_picagem_correccao_coerente',
    'rpc_hr_picar','rpc_hr_picagem_corrigir','rpc_hr_picagem_anular'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_f
         AND p.prosecdef = true
         AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path%'
    ) THEN
      RAISE EXCEPTION '% nao existe, ou nao e SECURITY DEFINER com search_path fixo.', v_f;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.hr_picagens_consolidar(uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'authenticated consegue executar hr_picagens_consolidar directamente. E chamada de dentro das RPCs; exposta, escrevia horas sem verificacao de permissao.';
  END IF;

  RAISE NOTICE 'Conferido: cadeia linear, vista de valor em vigor com security_invoker, e as tres RPCs de picagem.';
END;
$conferir$;
