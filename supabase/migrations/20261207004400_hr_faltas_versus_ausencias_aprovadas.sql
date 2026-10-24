-- ==============================================================================
-- Faltas versus ausencias aprovadas: nao se marca falta sobre ferias deferidas.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um dia com ferias aprovadas nao e uma falta. Mas as duas coisas vivem em
-- tabelas diferentes, escritas por RPCs diferentes, por pessoas diferentes -- e
-- um acordo entre camadas de aplicacao ("a UI nao deixa") nao e uma garantia:
-- as Edge Functions e o service_role escrevem fora das RPCs.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Um trigger em pessoas_faltas le pessoas_ausencias_dias:
--
--   - ha ausencia APROVADA na mesma data com fraccao_dia = 1.00
--       -> RECUSA. O dia esta inteiro coberto e nao ha falta a marcar.
--   - fraccao_dia < 1.00 (meio dia de ferias aprovado)
--       -> PASSA. A outra metade do dia e trabalho e pode ter falta.
--   - ausencia em estado 'pendente'
--       -> PASSA, com NOTICE. Um pedido em analise nao impede a assiduidade de
--          registar o que aconteceu.
--
-- E o sentido INVERSO -- o atestado que chega na quinta-feira e a ausencia e
-- aprovada DEPOIS de a falta estar marcada -- resolve-se por
-- rpc_hr_falta_anular_por_ausencia: anula a falta com
-- anulacao_motivo = 'coberta por ausencia aprovada' e grava o ausencia_dia_id,
-- deixando o rasto. A falta nao desaparece.
--
-- NAO se liga isto ao trigger de aprovacao da ronda 3, de proposito: fazer a
-- aprovacao de um pedido escrever em pessoas_faltas seria acoplar dois modulos
-- por um trigger em cascata, e a ronda 3 ja e uma quebra coordenada suficiente.
-- A RPC e chamada pelo ecra, e a vista de desvios mostra as faltas cujo dia
-- passou a ter ausencia aprovada, para nenhuma ficar esquecida.
--
--
-- -- A FROUXIDAO ASSUMIDA -----------------------------------------------------
--
-- Meio dia de ausencia aprovada + falta parcial no mesmo dia: a base NAO
-- verifica que o periodo da falta nao invade a metade coberta. Nao e possivel
-- em SQL com o desenho da ronda 3, que guarda FRACCAO DE DIA e nao horas -- uma
-- ausencia de 0.50 nao diz se foi a manha ou a tarde.
--
-- Fica assumido por escrito: nesse caso, e responsabilidade de quem marca. E a
-- unica frouxidao desta ronda, e o caminho para a fechar e a ronda 3 passar a
-- guardar horas na fraccao, nao esta migracao a adivinhar.
--
--
-- -- DEPENDENCIA DURA ---------------------------------------------------------
--
-- Se pessoas_ausencias_dias NAO existir (ronda 3 nao aplicada), esta migracao
-- ABORTA nas guardas com a mensagem a dizer qual a migracao a aplicar primeiro.
-- Nao se escreve caminho degradado: um trigger que "as vezes" verifica
-- ausencias e pior do que um push que falha.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se altera pessoas_ausencias_dias, nem a maquina de estados da ronda 3,
--   nem as RPCs dela. A unica ligacao e de LEITURA no trigger.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.rpc_hr_falta_anular_por_ausencia(uuid, uuid);
--   DROP TRIGGER trg_pessoas_faltas_nao_cobre_ausencia ON public.pessoas_faltas;
--   DROP FUNCTION public.hr_falta_nao_cobre_ausencia_aprovada();
--   ALTER TABLE public.pessoas_faltas DROP CONSTRAINT pessoas_faltas_ausencia_dia_fkey;
--
--
-- Prerequisitos:
--   20261121200000  pessoas_faltas (a coluna ausencia_dia_id, sem FK)
--   20261121080000  pessoas_ausencias_dias (unique id, pessoa_id, organization_id)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_faltas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_faltas nao existe. Aplicar 20261121200000 primeiro.';
  END IF;

  -- A dependencia dura. Sem caminho degradado.
  IF to_regclass('public.pessoas_ausencias_dias') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_ausencias_dias NAO EXISTE. Aplicar 20261121080000 (ronda de ausencias) ANTES desta migracao. Nao se escreve caminho degradado: um trigger que as vezes verifica ausencias e pior do que um push que falha.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_dias_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_dias')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) de pessoas_ausencias_dias nao existe; a FK COMPOSTA de ausencia_dia_id depende dela. Sem ela, uma falta podia dizer que esta coberta pela ausencia de OUTRA pessoa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_faltas'
       AND column_name = 'ausencia_dia_id'
  ) THEN
    RAISE EXCEPTION 'pessoas_faltas nao tem ausencia_dia_id. Aplicar 20261121200000 primeiro.';
  END IF;

  -- O dominio de estado da ronda 3 tem de ser o esperado: o trigger le
  -- 'aprovado' e 'pendente'.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_dias_estado_valido'
       AND conrelid = to_regclass('public.pessoas_ausencias_dias')
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_dias nao tem o CHECK de estado esperado. Nao e a tabela da ronda 3 -- investigar antes de construir a guarda sobre ela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_dias'
       AND column_name = 'fraccao_dia'
  ) THEN
    RAISE EXCEPTION 'pessoas_ausencias_dias nao tem fraccao_dia; a guarda distingue dia inteiro de meio dia por ela.';
  END IF;
END;
$guardas$;

-- ---- A FK composta que 20261121200000 deixou pendente ----------------------
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_faltas_ausencia_dia_fkey'
       AND conrelid = to_regclass('public.pessoas_faltas')
  ) THEN
    ALTER TABLE public.pessoas_faltas
      ADD CONSTRAINT pessoas_faltas_ausencia_dia_fkey
      FOREIGN KEY (ausencia_dia_id, pessoa_id, organization_id)
      REFERENCES public.pessoas_ausencias_dias (id, pessoa_id, organization_id)
      ON DELETE SET NULL (ausencia_dia_id);
  END IF;
END;
$fk$;

COMMENT ON CONSTRAINT pessoas_faltas_ausencia_dia_fkey ON public.pessoas_faltas IS
'FK COMPOSTA de tres colunas. Uma FK simples deixaria uma falta dizer que esta coberta pela ausencia de OUTRA pessoa da mesma organizacao. SET NULL: apagar o dia de ausencia nao apaga a falta anulada, so lhe tira a explicacao -- que fica no anulacao_motivo.';

-- ---- A guarda --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_falta_nao_cobre_ausencia_aprovada()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_dia record;
BEGIN
  IF NEW.estado <> 'activa' THEN
    RETURN NEW;
  END IF;

  -- Uma falta que a propria RPC de anulacao esta a ligar ao dia de ausencia nao
  -- se recusa a si mesma: nesse caminho o estado ja e 'anulada' e o IF acima
  -- devolveu. Este ramo protege o caso de alguem ligar a ausencia numa falta
  -- que fica activa -- que e uma incoerencia e nao passa.
  SELECT d.id, d.estado, d.fraccao_dia
    INTO v_dia
    FROM public.pessoas_ausencias_dias d
   WHERE d.pessoa_id = NEW.pessoa_id
     AND d.organization_id = NEW.organization_id
     AND d.data = NEW.data
     AND d.estado IN ('aprovado','pendente')
   ORDER BY (d.estado = 'aprovado') DESC, d.fraccao_dia DESC
   LIMIT 1;

  IF v_dia.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_dia.estado = 'aprovado' AND v_dia.fraccao_dia >= 1.00 THEN
    RAISE EXCEPTION
      'falta_coberta_por_ausencia: o dia % ja tem ausencia APROVADA de dia inteiro; nao se marca falta sobre ferias deferidas. Se a ausencia esta errada, cancela-se o pedido (rpc_hr_ausencia_cancelar); se a falta e que esta certa, e a ausencia que tem de sair primeiro.',
      NEW.data
      USING ERRCODE = '23514';
  END IF;

  IF v_dia.estado = 'aprovado' THEN
    -- Meio dia aprovado: PASSA. A outra metade do dia e trabalho.
    -- E a frouxidao assumida: a base nao sabe se a ausencia foi a manha ou a
    -- tarde, porque a ronda 3 guarda fraccao de dia e nao horas.
    RAISE NOTICE
      'O dia % tem meio dia de ausencia aprovada. A falta passa, e verificar que o periodo nao invade a metade coberta e de quem marca -- a base guarda fraccao de dia e nao horas.',
      NEW.data;
    RETURN NEW;
  END IF;

  -- Pendente: passa, e avisa. Um pedido em analise nao impede a assiduidade de
  -- registar o que aconteceu.
  RAISE NOTICE
    'O dia % tem um pedido de ausencia PENDENTE. A falta e registada; se a ausencia for aprovada, usar rpc_hr_falta_anular_por_ausencia.',
    NEW.data;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_falta_nao_cobre_ausencia_aprovada() IS
'Recusa marcar falta num dia com ausencia APROVADA de dia inteiro. Meio dia aprovado passa (a outra metade e trabalho), e ausencia PENDENTE passa com aviso -- um pedido em analise nao impede a assiduidade de registar o que aconteceu.

Trigger e nao acordo entre camadas: as Edge Functions e o service_role escrevem fora das RPCs, e "a UI nao deixa" nao e uma garantia.

FROUXIDAO ASSUMIDA: com meio dia de ausencia aprovada, a base NAO verifica que o periodo da falta nao invade a metade coberta. Nao e possivel em SQL com o desenho da ronda 3, que guarda fraccao de dia e nao horas -- uma ausencia de 0.50 nao diz se foi a manha ou a tarde. E a unica frouxidao desta ronda, e fecha-se na ronda 3, nao aqui a adivinhar.

SECURITY DEFINER: le pessoas_ausencias_dias, que tem escrita fechada e leitura por permissao de ausencias -- que quem marca faltas pode nao ter.';

DROP TRIGGER IF EXISTS trg_pessoas_faltas_nao_cobre_ausencia ON public.pessoas_faltas;
CREATE TRIGGER trg_pessoas_faltas_nao_cobre_ausencia
  BEFORE INSERT OR UPDATE ON public.pessoas_faltas
  FOR EACH ROW EXECUTE FUNCTION public.hr_falta_nao_cobre_ausencia_aprovada();

-- ---- O sentido inverso: a ausencia aprovada DEPOIS da falta ---------------
CREATE OR REPLACE FUNCTION public.rpc_hr_falta_anular_por_ausencia(
  _falta_id uuid,
  _ausencia_dia_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_f    public.pessoas_faltas;
  v_dia  record;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'falta_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_f FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  IF v_f.id IS NULL THEN
    RAISE EXCEPTION 'falta_inexistente: a falta % nao existe.', _falta_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.faltas.edit', v_f.organization_id) THEN
    RAISE EXCEPTION
      'falta_sem_permissao: anular uma falta coberta por ausencia exige hr.assiduidade.faltas.edit nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_f.estado <> 'activa' THEN
    RAISE EXCEPTION
      'falta_nao_activa: a falta % esta em "%" e nao ha o que anular.', _falta_id, v_f.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT d.id, d.data, d.estado, d.pessoa_id, d.organization_id
    INTO v_dia
    FROM public.pessoas_ausencias_dias d
   WHERE d.id = _ausencia_dia_id;

  IF v_dia.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_dia_inexistente: o dia de ausencia % nao existe.', _ausencia_dia_id
      USING ERRCODE = '23503';
  END IF;

  -- A mesma pessoa, a mesma data, e APROVADA. Sem isto, esta RPC seria uma
  -- forma de apagar faltas invocando qualquer ausencia de qualquer pessoa.
  IF v_dia.pessoa_id <> v_f.pessoa_id OR v_dia.organization_id <> v_f.organization_id THEN
    RAISE EXCEPTION
      'ausencia_de_outra_pessoa: o dia de ausencia indicado nao e desta pessoa.'
      USING ERRCODE = '23514';
  END IF;

  IF v_dia.data <> v_f.data THEN
    RAISE EXCEPTION
      'ausencia_de_outra_data: o dia de ausencia e de % e a falta e de %.', v_dia.data, v_f.data
      USING ERRCODE = '23514';
  END IF;

  IF v_dia.estado <> 'aprovado' THEN
    RAISE EXCEPTION
      'ausencia_nao_aprovada: o dia de ausencia esta em "%" e so uma ausencia APROVADA cobre uma falta.', v_dia.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  UPDATE public.pessoas_faltas
     SET estado = 'anulada',
         anulado_em = now(),
         anulado_por_anew_user_id = v_anew,
         anulacao_motivo = 'coberta por ausencia aprovada',
         ausencia_dia_id = _ausencia_dia_id,
         updated_by = v_anew
   WHERE id = _falta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_falta_anular_por_ausencia(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_falta_anular_por_ausencia(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_anular_por_ausencia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_falta_anular_por_ausencia(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_falta_anular_por_ausencia(uuid, uuid) IS
'Resolve o caso comum do atestado que chega na quinta-feira: a ausencia e aprovada DEPOIS de a falta estar marcada. Anula a falta com anulacao_motivo="coberta por ausencia aprovada" e grava o ausencia_dia_id, deixando o rasto -- a falta nao desaparece.

Valida que o dia de ausencia e da MESMA pessoa, na MESMA data, e APROVADO. Sem isso, esta RPC seria uma forma de apagar faltas invocando qualquer ausencia de qualquer pessoa.

NAO esta ligada ao trigger de aprovacao da ronda 3, de proposito: fazer a aprovacao de um pedido escrever em pessoas_faltas seria acoplar dois modulos por um trigger em cascata. E chamada pelo ecra, e a vista de desvios mostra as faltas cujo dia passou a ter ausencia aprovada, para nenhuma ficar esquecida.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_corpo text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_faltas_ausencia_dia_fkey'
       AND conrelid = to_regclass('public.pessoas_faltas')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A FK composta de pessoas_faltas.ausencia_dia_id nao ficou criada com 3 colunas. Uma FK simples deixaria uma falta dizer que esta coberta pela ausencia de outra pessoa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_faltas')
       AND tgname = 'trg_pessoas_faltas_nao_cobre_ausencia' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger da guarda contra ausencias aprovadas nao ficou criado.';
  END IF;

  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_falta_nao_cobre_ausencia_aprovada';

  IF v_corpo IS NULL THEN
    RAISE EXCEPTION 'hr_falta_nao_cobre_ausencia_aprovada nao ficou criada.';
  END IF;

  -- Tem de olhar para pessoas_ausencias_dias: se nao olhar, nao verifica nada.
  IF v_corpo NOT LIKE '%pessoas_ausencias_dias%' THEN
    RAISE EXCEPTION
      'A guarda nao le pessoas_ausencias_dias. Um trigger que nao consulta as ausencias nao verifica nada.';
  END IF;

  -- E tem de distinguir dia inteiro de meio dia: sem isso, ou recusa meio dia
  -- (errado) ou aceita dia inteiro (pior).
  IF v_corpo NOT LIKE '%fraccao_dia%' THEN
    RAISE EXCEPTION
      'A guarda nao olha para fraccao_dia. Sem isso, ou recusa meio dia de ferias -- que e legitimo -- ou aceita falta sobre um dia inteiro deferido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_falta_anular_por_ausencia' AND p.pronargs = 2
       AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'rpc_hr_falta_anular_por_ausencia nao ficou criada como SECURITY DEFINER com 2 argumentos.';
  END IF;

  -- A ronda 3 nao pode ter sido alterada por esta migracao.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_ausencias_dias')
       AND tgname LIKE '%falta%' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'Ha um trigger de faltas em pessoas_ausencias_dias. Esta migracao le a ronda 3 e NAO lhe escreve -- acoplar os dois modulos por trigger em cascata era o que se evitou.';
  END IF;

  RAISE NOTICE 'Conferido: FK composta, guarda contra ausencias aprovadas, e a RPC do sentido inverso.';
END;
$conferir$;
