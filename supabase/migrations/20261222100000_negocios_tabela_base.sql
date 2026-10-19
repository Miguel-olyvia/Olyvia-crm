-- ============================================================
-- 20261222100000_negocios_tabela_base
-- ============================================================
-- O que faz
--   Cria a tabela NOVA public.negocios (negócio opcional da página Pessoas:
--   uma pessoa, um comercial, estado aberto/ganho/perdido; se perdido,
--   guarda a fase, a data e o motivo) e o seu histórico imutável
--   public.negocio_eventos (perdeu / reabriu / ganhou), escrito só por
--   trigger. Acrescenta as permissões novas pessoas.view/create/edit/delete
--   e atribui-as SÓ aos papéis da organização nike que já têm o deals.*
--   correspondente.
--
--   O negócio NÃO tem serviço (decisão do utilizador, 18/10): o serviço
--   continua a ser acrescentado no orçamento, como hoje.
--
-- SÓ ACRESCENTA. Esta migration NÃO altera nenhuma tabela, função, trigger,
--   política nem configuração existente. Três tabelas que já existem recebem
--   linhas novas (só acrescento):
--     - anew_permissions (4);
--     - anew_role_permissions (papéis não-sistema da nike, organização
--       b6ffce4f-f630-4933-833a-008649757a33);
--     - entity_audit_log, indirectamente: o INSERT em anew_role_permissions
--       dispara o trigger existente trg_audit_anew_role_permissions
--       (fn_audit_anew_role_permissions), que regista as atribuições.
--   Nenhum papel global (super_admin/system_admin/client) nem papel de outra
--   organização recebe pessoas.* — não chega à Mudelar.
--
-- AVISO A QUEM APLICA: o CREATE TABLE com chaves estrangeiras toma, por
--   instantes, um bloqueio SHARE ROW EXCLUSIVE em anew_users, anew_entities
--   e anew_organizations, que bloqueia as escritas nessas tabelas enquanto
--   dura. As tabelas são partilhadas por todas as organizações, Mudelar
--   incluída: aplicar fora das horas de pico. O lock_timeout de 3s faz a
--   migration abortar (sem prender ninguém) se houver uma transacção longa
--   a segurar essas tabelas; nesse caso, voltar a tentar mais tarde.
--
-- Regras que a base impõe (triggers novos, não o ecrã):
--   - id, organization_id, entity_id e created_by não mudam depois de
--     criados (erro claro); root_organization_id e created_at também ficam
--     fixos. ÚNICA excepção: quando um utilizador é apagado, as chaves
--     estrangeiras ON DELETE SET NULL põem created_by, assigned_to e
--     deleted_by a NULL; os triggers deixam passar essa mudança para NULL
--     só se o utilizador antigo já não existir em anew_users.
--   - created_by, se vier nulo, é quem executa; perdido_em, ganho_em,
--     deleted_at e deleted_by são escritos pela base (now() e quem executa),
--     ignorando o que o cliente mande.
--   - O comercial (assigned_to) é validado como membro activo da
--     organização só quando muda (no INSERT pela política, no UPDATE pelo
--     trigger); um comercial que deixe de ser membro não impede editar.
--   - Enviar para o lixo exige pessoas.edit (política de UPDATE) E
--     pessoas.delete (trigger), com o âmbito de pessoas.delete avaliado
--     sobre o negócio tal como estava ANTES da alteração. É o comportamento
--     mais restritivo e é intencional (decisão do desenho). Restaurar exige
--     o mesmo.
--   - Um negócio no lixo não se altera: qualquer UPDATE é recusado, excepto
--     o restauro (deleted_at volta a NULL) e a limpeza de um utilizador
--     apagado.
--   - Sem sessão de utilizador (auth.uid() nulo), a verificação de
--     pessoas.delete só é dispensada a service_role, ao dono e às
--     migrations; uma sessão com papel authenticated/anon sem uid é recusada.
--   - Sem auditoria genérica em negocios (entity_audit_log lê-se com outras
--     permissões e copiaria notas e motivos): o histórico é negocio_eventos.
--   - Há evento a cada mudança de estado e também quando a fase ou o motivo
--     de uma perda já registada mudam (novo evento 'perdeu').
--   - A organização é ON DELETE RESTRICT nas duas tabelas (nada apaga
--     organizações fisicamente; assim a recusa é coerente e visível).
--
-- AVISOS
--   - Âmbito por omissão: sem linhas em anew_membership_permission_scopes
--     para pessoas.*, o âmbito é OWNED. Quem receber pessoas.view vê só os
--     negócios de que é comercial ou criador até alguém lhe definir o âmbito
--     (TEAM/ORG) no diálogo de âmbitos.
--   - RGPD: entity_id é ON DELETE RESTRICT. execute_entity_erasure não conta
--     negocios, por isso o pedido de apagamento de uma pessoa que só tenha
--     negócios falha (de forma visível) no RESTRICT; e no modo anonimizar não
--     limpa titulo/notas/motivo_perda nem os motivos dos eventos. A correcção
--     altera uma função existente e fica para uma migration à parte.
--
-- Razão da reabertura (negocio_eventos.motivo_reabertura):
--   O trigger do histórico lê-a, só no evento 'reabriu', da variável de
--   sessão LOCAL À TRANSACÇÃO app.negocio_motivo_reabertura, copia-a para o
--   evento e limpa-a. Quem a preenche é a futura função neg_anular_perda,
--   com set_config('app.negocio_motivo_reabertura', <texto>, true) antes do
--   UPDATE de estado. A API não consegue escrevê-la (set_config não está
--   exposto no PostgREST); sem ela o evento fica com motivo_reabertura nulo.
--
-- Funções existentes reutilizadas (lidas no remoto a 18/10, inalteradas; o
--   bloco CONFERIR compara o md5 da definição):
--   update_updated_at_column(), auto_assign_creator(),
--   resolve_root_organization_id(uuid), current_business_user_id(),
--   crm_scope_keys(text), has_anew_permission(uuid, text),
--   get_user_crm_org_ids(uuid), is_system_admin(uuid),
--   has_active_support_access(uuid).
--
-- PRECISA DE CÓDIGO NO MESMO ENVIO:
--   src/pages/Roles.tsx tem de levar a categoria 'pessoas' em
--   sidebarCategories e 'pessoas: Pessoas' em categoryLabels; sem isso as
--   permissões novas não aparecem no ecrã de papéis. Também
--   MembershipScopesDialog.tsx (categoryLabelsPt), DocsPermissions.tsx e
--   menuConfig.ts.
--
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ============================================================
-- 1. Tabela negocios
-- ============================================================

CREATE TABLE public.negocios (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  root_organization_id uuid        NOT NULL,
  entity_id            uuid        NOT NULL,
  assigned_to          uuid        NULL,
  titulo               text        NOT NULL,
  notas                text        NULL,
  estado               text        NOT NULL DEFAULT 'aberto',
  fase_perda           text        NULL,
  motivo_perda         text        NULL,
  perdido_em           timestamptz NULL,
  ganho_em             timestamptz NULL,
  created_by           uuid        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  deleted_by           uuid        NULL,

  CONSTRAINT negocios_pkey PRIMARY KEY (id),

  CONSTRAINT negocios_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  CONSTRAINT negocios_root_organization_id_fkey
    FOREIGN KEY (root_organization_id) REFERENCES public.anew_organizations(id),
  CONSTRAINT negocios_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.anew_entities(id) ON DELETE RESTRICT,
  CONSTRAINT negocios_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT negocios_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT negocios_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,

  CONSTRAINT negocios_titulo_check
    CHECK (btrim(titulo) <> '' AND char_length(titulo) <= 200),
  CONSTRAINT negocios_notas_check
    CHECK (notas IS NULL OR char_length(notas) <= 5000),
  CONSTRAINT negocios_motivo_perda_check
    CHECK (motivo_perda IS NULL OR char_length(motivo_perda) <= 1000),
  CONSTRAINT negocios_estado_check
    CHECK (estado IN ('aberto', 'ganho', 'perdido')),
  CONSTRAINT negocios_fase_perda_check
    CHECK (fase_perda IS NULL OR fase_perda IN
      ('lead', 'contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato')),
  -- Estrito: perdido exige fase, data e motivo; qualquer outro estado exige
  -- os três limpos. A data é posta pela base; a fase e o motivo têm de ser
  -- limpos pelo cliente ao reabrir (ficam no evento 'reabriu').
  CONSTRAINT negocios_perda_coerente
    CHECK (
      (estado = 'perdido'
        AND fase_perda IS NOT NULL
        AND perdido_em IS NOT NULL
        AND motivo_perda IS NOT NULL
        AND btrim(motivo_perda) <> '')
      OR
      (estado <> 'perdido'
        AND fase_perda IS NULL
        AND perdido_em IS NULL
        AND motivo_perda IS NULL)
    ),
  CONSTRAINT negocios_ganho_coerente
    CHECK ((estado = 'ganho') = (ganho_em IS NOT NULL))
);

-- Listagens e chaves estrangeiras. Os compostos são NÃO parciais: servem a
-- listagem por organização/estado e por pessoa, e também a verificação de
-- integridade ao apagar uma organização ou uma pessoa (que não pode usar
-- índices parciais). O do lixo é parcial (só listagem).
CREATE INDEX idx_negocios_org_estado
  ON public.negocios (organization_id, estado);
CREATE INDEX idx_negocios_entity_org
  ON public.negocios (entity_id, organization_id);
CREATE INDEX idx_negocios_lixo
  ON public.negocios (organization_id) WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_negocios_root_organization_id ON public.negocios (root_organization_id);
CREATE INDEX idx_negocios_assigned_to          ON public.negocios (assigned_to);
CREATE INDEX idx_negocios_created_by           ON public.negocios (created_by);
CREATE INDEX idx_negocios_deleted_by           ON public.negocios (deleted_by);

-- ============================================================
-- 2. Tabela negocio_eventos (histórico, só acrescentar)
-- ============================================================

CREATE TABLE public.negocio_eventos (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  negocio_id           uuid        NOT NULL,
  organization_id      uuid        NOT NULL,
  root_organization_id uuid        NOT NULL,
  tipo                 text        NOT NULL,
  fase                 text        NULL,
  motivo               text        NULL,
  motivo_reabertura    text        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        NULL,

  CONSTRAINT negocio_eventos_pkey PRIMARY KEY (id),

  CONSTRAINT negocio_eventos_negocio_id_fkey
    FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE RESTRICT,
  CONSTRAINT negocio_eventos_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  CONSTRAINT negocio_eventos_root_organization_id_fkey
    FOREIGN KEY (root_organization_id) REFERENCES public.anew_organizations(id),
  CONSTRAINT negocio_eventos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,

  CONSTRAINT negocio_eventos_tipo_check
    CHECK (tipo IN ('perdeu', 'reabriu', 'ganhou')),
  CONSTRAINT negocio_eventos_fase_check
    CHECK (fase IS NULL OR fase IN
      ('lead', 'contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato')),
  CONSTRAINT negocio_eventos_motivo_check
    CHECK (motivo IS NULL OR char_length(motivo) <= 1000),
  -- A razão da reabertura só existe em eventos 'reabriu'.
  CONSTRAINT negocio_eventos_motivo_reabertura_check
    CHECK (motivo_reabertura IS NULL
           OR (tipo = 'reabriu'
               AND btrim(motivo_reabertura) <> ''
               AND char_length(motivo_reabertura) <= 1000)),
  -- Num 'reabriu' vindo de perdido, fase/motivo guardam a perda desfeita;
  -- vindo de ganho ficam nulos.
  CONSTRAINT negocio_eventos_coerente
    CHECK (
      (tipo = 'perdeu' AND fase IS NOT NULL AND motivo IS NOT NULL)
      OR (tipo = 'ganhou' AND fase IS NULL AND motivo IS NULL)
      OR (tipo = 'reabriu')
    )
);

CREATE INDEX idx_negocio_eventos_negocio
  ON public.negocio_eventos (negocio_id, created_at DESC);
CREATE INDEX idx_negocio_eventos_org_tipo
  ON public.negocio_eventos (organization_id, tipo, created_at DESC);
CREATE INDEX idx_negocio_eventos_root_organization_id
  ON public.negocio_eventos (root_organization_id);
CREATE INDEX idx_negocio_eventos_created_by
  ON public.negocio_eventos (created_by);

-- ============================================================
-- 3. Funções novas (só de trigger; ninguém da API as executa)
-- ============================================================

-- Quem executa, em anew_users.id: primeiro o utilizador ligado a auth.uid()
-- (o mesmo id que crm_scope_keys usa nas chaves de âmbito), depois o mapa
-- legado de current_business_user_id() se existir em anew_users. Nulo sem
-- sessão (service_role, migrations).
CREATE FUNCTION public.fn_negocios_actor()
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  SELECT au.id INTO v_actor
  FROM public.anew_users au
  WHERE au.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_actor IS NULL THEN
    v_actor := public.current_business_user_id();
    IF v_actor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.id = v_actor) THEN
      v_actor := NULL;
    END IF;
  END IF;

  RETURN v_actor;
END;
$function$;

-- BEFORE INSERT: valores que a base decide, não o cliente.
-- Corre antes de trg_auto_assign_creator_negocios (ordem alfabética), por
-- isso assigned_to herda o created_by preenchido aqui.
CREATE FUNCTION public.fn_negocios_preparar_insercao()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.root_organization_id := public.resolve_root_organization_id(NEW.organization_id);

  IF NEW.created_by IS NULL THEN
    NEW.created_by := public.fn_negocios_actor();
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;
  NEW.perdido_em := CASE WHEN NEW.estado = 'perdido' THEN now() END;
  NEW.ganho_em   := CASE WHEN NEW.estado = 'ganho'   THEN now() END;

  RETURN NEW;
END;
$function$;

-- Verdadeiro quando uma referência a utilizador passa a NULL porque o
-- utilizador antigo já não existe em anew_users: é o UPDATE interno das
-- chaves estrangeiras ON DELETE SET NULL ao apagar um utilizador.
-- VOLATILE de propósito: cada consulta tira um snapshot novo e vê o
-- utilizador já apagado pelo comando anterior. Não usa current_user (as
-- funções que a chamam são SECURITY DEFINER).
CREATE FUNCTION public.fn_negocios_ref_utilizador_apagado(p_antigo uuid, p_novo uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN p_antigo IS NOT NULL
     AND p_novo IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.id = p_antigo);
END;
$function$;

-- Exige pessoas.delete com âmbito sobre o negócio tal como estava antes da
-- alteração. Sem uid: só passa quem não é authenticated/anon (service_role,
-- dono, migrations).
CREATE FUNCTION public.fn_negocios_exigir_permissao_lixo(
  p_organization_id uuid, p_assigned_to uuid, p_created_by uuid)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text := coalesce(current_setting('role', true), '');
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF v_uid IS NULL THEN
    IF v_role IN ('authenticated', 'anon') OR v_jwt_role IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Sessão sem utilizador: não é possível enviar este negócio para o lixo nem restaurá-lo.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN;
  END IF;

  IF NOT (
    public.has_anew_permission(v_uid, 'pessoas.delete')
    AND EXISTS (
      SELECT 1
      FROM unnest(public.crm_scope_keys('pessoas.delete')) AS k(scope_key)
      WHERE k.scope_key = p_organization_id::text || ':*'
         OR k.scope_key = p_organization_id::text || ':' || p_assigned_to::text
         OR k.scope_key = p_organization_id::text || ':' || p_created_by::text
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para enviar este negócio para o lixo ou para o restaurar (pessoas.delete).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$function$;

-- BEFORE UPDATE: imutáveis, negócio no lixo, comercial, datas de estado, e
-- a passagem vivo <-> lixo.
CREATE FUNCTION public.fn_negocios_guardar_alteracao()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_limpa_criador   boolean := public.fn_negocios_ref_utilizador_apagado(OLD.created_by, NEW.created_by);
  v_limpa_comercial boolean := public.fn_negocios_ref_utilizador_apagado(OLD.assigned_to, NEW.assigned_to);
  v_limpa_apagador  boolean := public.fn_negocios_ref_utilizador_apagado(OLD.deleted_by, NEW.deleted_by);
  v_ignorar         text[]  := ARRAY['created_by', 'assigned_to', 'deleted_by', 'updated_at'];
BEGIN
  -- 1. Imutáveis (created_by só pode ir a NULL se o utilizador foi apagado)
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é possível mudar o identificador de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar a organização de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'Não é possível mudar a pessoa de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT v_limpa_criador THEN
    RAISE EXCEPTION 'Não é possível mudar quem criou um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. No lixo: só o restauro, ou a limpeza de um utilizador apagado
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL
     AND ((to_jsonb(NEW) - v_ignorar) IS DISTINCT FROM (to_jsonb(OLD) - v_ignorar)
          OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NOT v_limpa_comercial)
          OR (NEW.deleted_by IS DISTINCT FROM OLD.deleted_by AND NOT v_limpa_apagador)) THEN
    RAISE EXCEPTION 'Este negócio está no lixo: tem de ser restaurado antes de ser alterado.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Comercial novo tem de ser membro activo (só quando muda para alguém)
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = NEW.assigned_to
         AND m.organization_id = NEW.organization_id
         AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'O comercial tem de ser membro activo da organização do negócio.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.root_organization_id := OLD.root_organization_id;
  NEW.created_at := OLD.created_at;

  -- 4. Datas de estado: now() ao entrar no estado, mantidas enquanto lá
  --    fica, limpas ao sair.
  NEW.perdido_em := CASE
    WHEN NEW.estado <> 'perdido' THEN NULL
    WHEN OLD.estado = 'perdido'  THEN OLD.perdido_em
    ELSE now() END;
  NEW.ganho_em := CASE
    WHEN NEW.estado <> 'ganho' THEN NULL
    WHEN OLD.estado = 'ganho'  THEN OLD.ganho_em
    ELSE now() END;

  -- 5. Lixo: só a passagem vivo <-> lixo conta; o valor é sempre da base.
  IF (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
    PERFORM public.fn_negocios_exigir_permissao_lixo(
      OLD.organization_id, OLD.assigned_to, OLD.created_by);

    IF NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
      NEW.deleted_by := public.fn_negocios_actor();
    ELSE
      NEW.deleted_by := NULL;
    END IF;
  ELSE
    NEW.deleted_at := OLD.deleted_at;
    NEW.deleted_by := CASE WHEN v_limpa_apagador THEN NULL ELSE OLD.deleted_by END;
  END IF;

  RETURN NEW;
END;
$function$;

-- AFTER INSERT/UPDATE: histórico. Ao contrário da auditoria genérica, NÃO
-- engole erros: se o evento não se grava, a alteração falha.
CREATE FUNCTION public.fn_negocios_registar_evento()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tipo        text;
  v_fase        text;
  v_motivo      text;
  v_motivo_reab text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'perdido' THEN
      v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
    ELSIF NEW.estado = 'ganho' THEN
      v_tipo := 'ganhou';
    ELSE
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      IF NEW.estado = 'perdido' THEN
        v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
      ELSIF NEW.estado = 'ganho' THEN
        v_tipo := 'ganhou';
      ELSE
        -- Reabrir: guarda a perda desfeita (nula se vinha de ganho) e a
        -- razão, se a função de reabrir a deixou na variável local.
        v_tipo := 'reabriu'; v_fase := OLD.fase_perda; v_motivo := OLD.motivo_perda;
        v_motivo_reab := NULLIF(btrim(current_setting('app.negocio_motivo_reabertura', true)), '');
        PERFORM set_config('app.negocio_motivo_reabertura', '', true);
      END IF;
    ELSIF NEW.estado = 'perdido'
          AND (NEW.fase_perda IS DISTINCT FROM OLD.fase_perda
               OR NEW.motivo_perda IS DISTINCT FROM OLD.motivo_perda) THEN
      -- Correcção da fase ou do motivo de uma perda já registada.
      v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
    ELSE
      RETURN NULL;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.negocio_eventos
    (negocio_id, organization_id, root_organization_id, tipo, fase, motivo,
     motivo_reabertura, created_by)
  VALUES
    (NEW.id, NEW.organization_id, NEW.root_organization_id, v_tipo, v_fase, v_motivo,
     v_motivo_reab, public.fn_negocios_actor());

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocios_actor()                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocios_ref_utilizador_apagado(uuid, uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocios_exigir_permissao_lixo(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocios_preparar_insercao()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocios_guardar_alteracao()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_negocios_registar_evento()                    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_negocios_actor()                              TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_negocios_ref_utilizador_apagado(uuid, uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_negocios_exigir_permissao_lixo(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_negocios_preparar_insercao()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_negocios_guardar_alteracao()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_negocios_registar_evento()                    TO service_role;

-- ============================================================
-- 4. Triggers de negocios (BEFORE correm por ordem alfabética)
-- ============================================================

CREATE TRIGGER trg_00_negocios_preparar_insercao
  BEFORE INSERT ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocios_preparar_insercao();

CREATE TRIGGER trg_00_negocios_guardar_alteracao
  BEFORE UPDATE ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocios_guardar_alteracao();

CREATE TRIGGER trg_auto_assign_creator_negocios
  BEFORE INSERT ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_creator();

CREATE TRIGGER trg_negocios_updated_at
  BEFORE UPDATE ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_negocios_eventos
  AFTER INSERT OR UPDATE OF estado, fase_perda, motivo_perda ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocios_registar_evento();

-- ============================================================
-- 5. Privilégios (o default ACL dá tudo a anon: tira-se)
-- ============================================================

REVOKE ALL ON TABLE public.negocios FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.negocios TO authenticated;
GRANT ALL ON TABLE public.negocios TO service_role;

REVOKE ALL ON TABLE public.negocio_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.negocio_eventos TO authenticated;
GRANT ALL ON TABLE public.negocio_eventos TO service_role;

-- ============================================================
-- 6. RLS — negocios
-- ============================================================
-- has_anew_permission não é por organização (e é o que deixa de fora os
-- super_admin/system_admin sem a linha no papel); quem prende à
-- organização é a chave de âmbito de crm_scope_keys, que só tem chaves
-- "<org>:..." das organizações onde a permissão vale.

ALTER TABLE public.negocios ENABLE ROW LEVEL SECURITY;

CREATE POLICY negocios_select
  ON public.negocios
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.view'))) AS k(scope_key)
      WHERE k.scope_key = negocios.organization_id::text || ':*'
         OR k.scope_key = negocios.organization_id::text || ':' || negocios.assigned_to::text
         OR k.scope_key = negocios.organization_id::text || ':' || negocios.created_by::text
    )
  );

CREATE POLICY negocios_insert
  ON public.negocios
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.create'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    -- pessoas.create NA PRÓPRIA organização (pessoas.create não tem âmbito:
    -- basta uma chave desta organização).
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.create'))) AS k(scope_key)
      WHERE starts_with(k.scope_key, negocios.organization_id::text || ':')
    )
    -- created_by é preenchido pela base se vier nulo; se vier, é o próprio
    -- (mesma resolução de anew_leads_insert).
    AND (
      created_by IS NULL
      OR created_by = (SELECT COALESCE(
           (SELECT au.id FROM public.anew_users au
             WHERE au.auth_user_id = (SELECT auth.uid()) LIMIT 1),
           public.current_business_user_id()))
    )
    -- A pessoa tem de estar ligada à organização.
    AND EXISTS (
      SELECT 1 FROM public.anew_entity_org_links l
      WHERE l.entity_id = negocios.entity_id
        AND l.organization_id = negocios.organization_id
    )
    -- O comercial, se houver, é membro activo da organização.
    AND (
      assigned_to IS NULL
      OR EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.user_id = negocios.assigned_to
          AND m.organization_id = negocios.organization_id
          AND m.status = 'active'
      )
    )
  );

-- A linha nova tem de continuar dentro do âmbito de pessoas.edit de quem
-- altera: com created_by imutável, é isto que limita a troca de comercial
-- (um OWNED que não criou o negócio não o pode entregar a outro).
-- A mudança de organização e de pessoa é recusada pelo trigger e, além
-- disso, a organização nova teria de dar chave de pessoas.edit.
-- O comercial NÃO é validado aqui (só quando muda, no trigger), nem a
-- ligação da pessoa (entity_id é imutável): assim um comercial que deixe
-- de ser membro, ou uma pessoa desligada, não impedem editar, reabrir ou
-- mandar para o lixo.
CREATE POLICY negocios_update
  ON public.negocios
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
      WHERE k.scope_key = negocios.organization_id::text || ':*'
         OR k.scope_key = negocios.organization_id::text || ':' || negocios.assigned_to::text
         OR k.scope_key = negocios.organization_id::text || ':' || negocios.created_by::text
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
      WHERE k.scope_key = negocios.organization_id::text || ':*'
         OR k.scope_key = negocios.organization_id::text || ':' || negocios.assigned_to::text
         OR k.scope_key = negocios.organization_id::text || ':' || negocios.created_by::text
    )
  );

-- DELETE físico proibido (só soft delete).
CREATE POLICY negocios_no_delete
  ON public.negocios
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- Cópia literal da política de deals.
CREATE POLICY system_admin_pii_default_deny
  ON public.negocios
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))))
    OR (public.is_system_admin((SELECT auth.uid())) AND public.has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================
-- 7. RLS — negocio_eventos
-- ============================================================

ALTER TABLE public.negocio_eventos ENABLE ROW LEVEL SECURITY;

-- A subconsulta a negocios corre sob a RLS de negocios: o evento herda a
-- visibilidade (e o âmbito) do negócio.
CREATE POLICY negocio_eventos_select
  ON public.negocio_eventos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = negocio_eventos.negocio_id
    )
  );

CREATE POLICY negocio_eventos_no_update
  ON public.negocio_eventos
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY negocio_eventos_no_delete
  ON public.negocio_eventos
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

CREATE POLICY system_admin_pii_default_deny
  ON public.negocio_eventos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))))
    OR (public.is_system_admin((SELECT auth.uid())) AND public.has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================
-- 8. Comentários
-- ============================================================

COMMENT ON TABLE public.negocios IS
  'Negócio (opcional) da página Pessoas: uma pessoa (anew_entities) acompanhada por um comercial, com estado aberto/ganho/perdido; se perdido, guarda a fase, a data e o motivo. Sem serviço (o serviço entra no orçamento). Independente de deals. Outras tabelas poderão apontar para aqui por negocio_id (ON DELETE SET NULL), sempre opcional. Só soft delete. Sem auditoria genérica: o histórico é negocio_eventos. Permissões pessoas.*.';
COMMENT ON COLUMN public.negocios.estado IS 'aberto | ganho | perdido.';
COMMENT ON COLUMN public.negocios.fase_perda IS 'Fase em que se perdeu (lista fechada); só preenchida quando estado = perdido.';
COMMENT ON COLUMN public.negocios.root_organization_id IS 'Preenchido por trigger no INSERT (resolve_root_organization_id); fixo depois.';
COMMENT ON COLUMN public.negocios.assigned_to IS 'Comercial (anew_users). Se vier nulo no INSERT, fica o created_by. Validado como membro activo só quando muda.';
COMMENT ON COLUMN public.negocios.created_by IS 'Quem criou; preenchido pela base se vier nulo; imutável (só passa a NULL se o utilizador for apagado).';
COMMENT ON COLUMN public.negocios.perdido_em IS 'Escrito pela base ao passar a perdido; limpo ao sair.';
COMMENT ON COLUMN public.negocios.ganho_em IS 'Escrito pela base ao passar a ganho; limpo ao sair.';
COMMENT ON COLUMN public.negocios.deleted_at IS 'Lixo. Escrito pela base (now()); pôr e tirar exige pessoas.edit e pessoas.delete. No lixo o negócio não se altera.';
COMMENT ON COLUMN public.negocios.deleted_by IS 'Quem enviou para o lixo; escrito pela base (passa a NULL se o utilizador for apagado).';
COMMENT ON TABLE public.negocio_eventos IS
  'Histórico imutável das mudanças de estado de um negócio (perdeu, reabriu, ganhou) e das correcções de fase/motivo de uma perda (novo perdeu). Escrito só pelo trigger de negocios; num ''reabriu'' guarda a fase e o motivo da perda desfeita.';
COMMENT ON COLUMN public.negocio_eventos.fase IS 'perdeu: fase da perda; reabriu: fase da perda desfeita (nula se vinha de ganho).';
COMMENT ON COLUMN public.negocio_eventos.motivo IS 'perdeu: motivo da perda; reabriu: motivo da perda desfeita (nulo se vinha de ganho).';
COMMENT ON COLUMN public.negocio_eventos.motivo_reabertura IS
  'Só em reabriu: razão da reabertura, lida da variável local à transacção app.negocio_motivo_reabertura (preenchida pela função de reabrir).';

-- ============================================================
-- 9. Permissões novas
-- ============================================================

INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('pessoas.view',   'Ver negócios de pessoas',
   'Ver a página Pessoas e os negócios (aberto, ganho, perdido) e o seu histórico',
   'pessoas', NULL, 0, false, 'organization', true),
  ('pessoas.create', 'Criar negócios de pessoas',
   'Criar um negócio para uma pessoa da organização',
   'pessoas', NULL, 1, false, 'organization', false),
  ('pessoas.edit',   'Editar negócios de pessoas',
   'Alterar um negócio: título, notas, comercial, estado, fase e motivo da perda',
   'pessoas', NULL, 2, false, 'organization', true),
  ('pessoas.delete', 'Eliminar negócios de pessoas',
   'Enviar um negócio para o lixo e restaurá-lo (soft delete; o apagamento definitivo não existe)',
   'pessoas', NULL, 3, true, 'organization', true)
ON CONFLICT (code) DO NOTHING;

-- Só papéis não-sistema da nike, espelhando deals.* (lido a 18/10):
--   testescope_base_role      deals.view               -> pessoas.view
--   testescope_outofteam_role deals.view               -> pessoas.view
--   testescope_vendas_senior  deals.view, deals.create -> pessoas.view, pessoas.create
-- Os ids fixos são cruzados com anew_roles: só entram se o papel continuar
-- a ser da nike, não-sistema e não apagado (se algum for apagado antes do
-- push, o CONFERIR 13 aborta a migration). Papéis não-sistema: não é
-- preciso desligar triggers (a auditoria regista as atribuições).
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT v.role_id, v.permission_code, NULL::uuid
FROM (VALUES
  ('cdbe453f-1732-4cec-aa0f-a5832324112f'::uuid, 'pessoas.view'),
  ('8aad9a25-905d-4162-ade0-1fa2566b6b16'::uuid, 'pessoas.view'),
  ('263ed08c-f6b7-4d5c-b3d0-1eca5a1017ec'::uuid, 'pessoas.view'),
  ('263ed08c-f6b7-4d5c-b3d0-1eca5a1017ec'::uuid, 'pessoas.create')
) AS v(role_id, permission_code)
JOIN public.anew_roles r ON r.id = v.role_id
WHERE r.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
  AND r.is_system = false
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- ============================================================
-- 10. CONFERIR
-- ============================================================
DO $$
DECLARE
  v_txt  text;
  v_exp  text;
  v_n    int;
BEGIN
  -- 1. RLS ligada nas duas tabelas
  SELECT count(*) INTO v_n
  FROM pg_class c
  WHERE c.oid IN ('public.negocios'::regclass, 'public.negocio_eventos'::regclass)
    AND c.relrowsecurity;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: RLS não está ligada nas duas tabelas (% de 2)', v_n;
  END IF;

  -- 2. Políticas de negocios (conjunto exacto)
  SELECT string_agg(p.policyname::text || ':' || p.permissive::text || ':' || p.cmd::text, ',' ORDER BY p.policyname)
  INTO v_txt
  FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'negocios';
  v_exp := 'negocios_insert:PERMISSIVE:INSERT,negocios_no_delete:RESTRICTIVE:DELETE,'
        || 'negocios_select:PERMISSIVE:SELECT,negocios_update:PERMISSIVE:UPDATE,'
        || 'system_admin_pii_default_deny:RESTRICTIVE:ALL';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: políticas de negocios inesperadas: %', v_txt;
  END IF;

  -- 2b. Políticas com âmbito de organização (chave de crm_scope_keys)
  SELECT string_agg(x.falta, ',') INTO v_txt
  FROM (
    SELECT 'select' AS falta FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'negocios' AND p.policyname = 'negocios_select'
       AND coalesce(p.qual, '') NOT LIKE '%crm_scope_keys(''pessoas.view''::text)%'
    UNION ALL
    SELECT 'insert' FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'negocios' AND p.policyname = 'negocios_insert'
       AND (coalesce(p.with_check, '') NOT LIKE '%crm_scope_keys(''pessoas.create''::text)%'
            OR coalesce(p.with_check, '') NOT LIKE '%starts_with(%')
    UNION ALL
    SELECT 'update_using' FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'negocios' AND p.policyname = 'negocios_update'
       AND coalesce(p.qual, '') NOT LIKE '%crm_scope_keys(''pessoas.edit''::text)%'
    UNION ALL
    SELECT 'update_check' FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'negocios' AND p.policyname = 'negocios_update'
       AND coalesce(p.with_check, '') NOT LIKE '%crm_scope_keys(''pessoas.edit''::text)%'
  ) x;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: políticas de negocios sem chave de âmbito: %', v_txt;
  END IF;

  -- 2c. O INSERT valida pessoa e comercial; o UPDATE já não (fica no
  --     trigger, só quando o comercial muda)
  SELECT string_agg(x.falta, ',') INTO v_txt
  FROM (
    SELECT 'insert_sem_pessoa_ou_comercial' AS falta FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'negocios' AND p.policyname = 'negocios_insert'
       AND (coalesce(p.with_check, '') NOT LIKE '%anew_entity_org_links%'
            OR coalesce(p.with_check, '') NOT LIKE '%anew_memberships%')
    UNION ALL
    SELECT 'update_valida_pessoa_ou_comercial' FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'negocios' AND p.policyname = 'negocios_update'
       AND (coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%anew_entity_org_links%'
            OR coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%anew_memberships%')
  ) x;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: validação de pessoa/comercial nas políticas inesperada: %', v_txt;
  END IF;

  -- 3. Políticas de negocio_eventos (conjunto exacto)
  SELECT string_agg(p.policyname::text || ':' || p.permissive::text || ':' || p.cmd::text, ',' ORDER BY p.policyname)
  INTO v_txt
  FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'negocio_eventos';
  v_exp := 'negocio_eventos_no_delete:RESTRICTIVE:DELETE,negocio_eventos_no_update:RESTRICTIVE:UPDATE,'
        || 'negocio_eventos_select:PERMISSIVE:SELECT,system_admin_pii_default_deny:RESTRICTIVE:ALL';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: políticas de negocio_eventos inesperadas: %', v_txt;
  END IF;

  -- 4. Nenhuma política com auth.uid() fora de (SELECT auth.uid())
  SELECT string_agg(p.tablename::text || '.' || p.policyname::text, ',')
  INTO v_txt
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename IN ('negocios', 'negocio_eventos')
    AND replace(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
                '( SELECT auth.uid() AS uid)', '') LIKE '%auth.uid()%';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: auth.uid() sem SELECT em: %', v_txt;
  END IF;

  -- 5. Colunas exactas e tipos
  SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' ORDER BY a.attnum)
  INTO v_txt
  FROM pg_attribute a
  WHERE a.attrelid = 'public.negocios'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  v_exp := 'id:uuid:true,organization_id:uuid:true,root_organization_id:uuid:true,entity_id:uuid:true,'
        || 'assigned_to:uuid:false,titulo:text:true,notas:text:false,estado:text:true,'
        || 'fase_perda:text:false,motivo_perda:text:false,'
        || 'perdido_em:timestamp with time zone:false,ganho_em:timestamp with time zone:false,'
        || 'created_by:uuid:false,created_at:timestamp with time zone:true,'
        || 'updated_at:timestamp with time zone:true,deleted_at:timestamp with time zone:false,'
        || 'deleted_by:uuid:false';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: colunas de negocios inesperadas: %', v_txt;
  END IF;

  SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' ORDER BY a.attnum)
  INTO v_txt
  FROM pg_attribute a
  WHERE a.attrelid = 'public.negocio_eventos'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  v_exp := 'id:uuid:true,negocio_id:uuid:true,organization_id:uuid:true,root_organization_id:uuid:true,'
        || 'tipo:text:true,fase:text:false,motivo:text:false,motivo_reabertura:text:false,'
        || 'created_at:timestamp with time zone:true,created_by:uuid:false';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: colunas de negocio_eventos inesperadas: %', v_txt;
  END IF;

  -- 6. Chaves estrangeiras: coluna, alvo (relname, sem depender do
  --    search_path) e acção ("char" convertido a text). As referências a
  --    anew_users têm de ser SET NULL (n): é desse UPDATE interno que os
  --    triggers deixam passar a mudança para NULL. A organização é RESTRICT.
  SELECT string_agg(a.attname::text || '>' || t.relname::text || ':' || c.confdeltype::text, ',' ORDER BY a.attname)
  INTO v_txt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class t ON t.oid = c.confrelid
  WHERE c.conrelid = 'public.negocios'::regclass AND c.contype::text = 'f';
  v_exp := 'assigned_to>anew_users:n,created_by>anew_users:n,deleted_by>anew_users:n,'
        || 'entity_id>anew_entities:r,organization_id>anew_organizations:r,'
        || 'root_organization_id>anew_organizations:a';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: chaves estrangeiras de negocios inesperadas: %', v_txt;
  END IF;

  SELECT string_agg(a.attname::text || '>' || t.relname::text || ':' || c.confdeltype::text, ',' ORDER BY a.attname)
  INTO v_txt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class t ON t.oid = c.confrelid
  WHERE c.conrelid = 'public.negocio_eventos'::regclass AND c.contype::text = 'f';
  v_exp := 'created_by>anew_users:n,negocio_id>negocios:r,'
        || 'organization_id>anew_organizations:r,root_organization_id>anew_organizations:a';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: chaves estrangeiras de negocio_eventos inesperadas: %', v_txt;
  END IF;

  -- 7. CHECKs presentes e validados
  SELECT string_agg(c.conname::text, ',' ORDER BY c.conname)
  INTO v_txt
  FROM pg_constraint c
  WHERE c.conrelid IN ('public.negocios'::regclass, 'public.negocio_eventos'::regclass)
    AND c.contype::text = 'c' AND c.convalidated;
  v_exp := 'negocio_eventos_coerente,negocio_eventos_fase_check,negocio_eventos_motivo_check,'
        || 'negocio_eventos_motivo_reabertura_check,negocio_eventos_tipo_check,'
        || 'negocios_estado_check,negocios_fase_perda_check,'
        || 'negocios_ganho_coerente,negocios_motivo_perda_check,negocios_notas_check,'
        || 'negocios_perda_coerente,negocios_titulo_check';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: CHECKs inesperados: %', v_txt;
  END IF;

  -- 8. Índices: os nomeados existem, e cada chave estrangeira das duas
  --    tabelas tem um índice NÃO parcial que começa por essa coluna.
  SELECT count(*) INTO v_n
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.indexname IN ('idx_negocios_org_estado', 'idx_negocios_entity_org',
                        'idx_negocios_lixo',
                        'idx_negocios_root_organization_id',
                        'idx_negocios_assigned_to', 'idx_negocios_created_by',
                        'idx_negocios_deleted_by',
                        'idx_negocio_eventos_negocio', 'idx_negocio_eventos_org_tipo',
                        'idx_negocio_eventos_root_organization_id', 'idx_negocio_eventos_created_by');
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'CONFERIR: faltam índices (% de 11)', v_n;
  END IF;

  -- Só o índice do lixo é parcial
  SELECT string_agg(ic.relname::text, ',' ORDER BY ic.relname)
  INTO v_txt
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  WHERE i.indrelid IN ('public.negocios'::regclass, 'public.negocio_eventos'::regclass)
    AND i.indpred IS NOT NULL;
  IF v_txt IS DISTINCT FROM 'idx_negocios_lixo' THEN
    RAISE EXCEPTION 'CONFERIR: índices parciais inesperados: %', v_txt;
  END IF;

  SELECT string_agg(t.relname::text || '.' || a.attname::text, ',')
  INTO v_txt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE c.conrelid IN ('public.negocios'::regclass, 'public.negocio_eventos'::regclass)
    AND c.contype::text = 'f'
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND i.indkey[0] = c.conkey[1]
        AND i.indpred IS NULL
    );
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: chaves estrangeiras sem índice não parcial: %', v_txt;
  END IF;

  -- 9. Triggers de negocios (conjunto exacto, ligados, função certa);
  --    nenhum de auditoria genérica; nenhum em negocio_eventos
  SELECT string_agg(t.tgname::text || ':' || p.proname::text || ':' || t.tgenabled::text, ',' ORDER BY t.tgname)
  INTO v_txt
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal;
  v_exp := 'trg_00_negocios_guardar_alteracao:fn_negocios_guardar_alteracao:O,'
        || 'trg_00_negocios_preparar_insercao:fn_negocios_preparar_insercao:O,'
        || 'trg_auto_assign_creator_negocios:auto_assign_creator:O,'
        || 'trg_negocios_eventos:fn_negocios_registar_evento:O,'
        || 'trg_negocios_updated_at:update_updated_at_column:O';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: triggers de negocios inesperados: %', v_txt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid IN ('public.negocios'::regclass, 'public.negocio_eventos'::regclass)
      AND p.proname = 'fn_generic_entity_audit'
  ) THEN
    RAISE EXCEPTION 'CONFERIR: há auditoria genérica nas tabelas novas (copiaria notas e motivos)';
  END IF;

  -- Momento e eventos dos triggers que guardam as regras
  SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname)
  INTO v_txt
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal
    AND (
      (t.tgname = 'trg_00_negocios_guardar_alteracao'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%BEFORE UPDATE ON public.negocios FOR EACH ROW%')
      OR (t.tgname = 'trg_00_negocios_preparar_insercao'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%BEFORE INSERT ON public.negocios FOR EACH ROW%')
      OR (t.tgname = 'trg_negocios_eventos'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%AFTER INSERT OR UPDATE OF estado, fase_perda, motivo_perda ON public.negocios FOR EACH ROW%')
    );
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: triggers com momento ou eventos errados: %', v_txt;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_trigger t WHERE t.tgrelid = 'public.negocio_eventos'::regclass AND NOT t.tgisinternal;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: negocio_eventos não devia ter triggers (tem %)', v_n;
  END IF;

  -- 10. Funções novas: SECURITY DEFINER com search_path fixo
  SELECT string_agg(e.sig, ',')
  INTO v_txt
  FROM (VALUES
    ('public.fn_negocios_actor()'),
    ('public.fn_negocios_ref_utilizador_apagado(uuid,uuid)'),
    ('public.fn_negocios_exigir_permissao_lixo(uuid,uuid,uuid)'),
    ('public.fn_negocios_preparar_insercao()'),
    ('public.fn_negocios_guardar_alteracao()'),
    ('public.fn_negocios_registar_evento()')
  ) AS e(sig)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure(e.sig)
      AND p.prosecdef
      AND array_to_string(p.proconfig, ',') LIKE 'search_path=%'
  );
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funções novas em falta, sem SECURITY DEFINER ou sem search_path: %', v_txt;
  END IF;

  -- 11. Privilégios
  IF has_table_privilege('anon', 'public.negocios', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.negocio_eventos', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'CONFERIR: anon tem privilégios numa das tabelas novas';
  END IF;
  IF NOT (has_table_privilege('authenticated', 'public.negocios', 'SELECT')
          AND has_table_privilege('authenticated', 'public.negocios', 'INSERT')
          AND has_table_privilege('authenticated', 'public.negocios', 'UPDATE')) THEN
    RAISE EXCEPTION 'CONFERIR: authenticated sem SELECT/INSERT/UPDATE em negocios';
  END IF;
  IF has_table_privilege('authenticated', 'public.negocios', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated tem DELETE/TRUNCATE/REFERENCES/TRIGGER em negocios';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.negocio_eventos', 'SELECT') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated sem SELECT em negocio_eventos';
  END IF;
  IF has_table_privilege('authenticated', 'public.negocio_eventos', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated pode escrever em negocio_eventos';
  END IF;
  SELECT string_agg(p.proname::text, ',')
  INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname LIKE 'fn\_negocios\_%'
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funções novas executáveis por anon/authenticated: %', v_txt;
  END IF;

  -- 12. As 4 permissões novas no catálogo
  SELECT count(*) INTO v_n
  FROM public.anew_permissions
  WHERE code IN ('pessoas.view', 'pessoas.create', 'pessoas.edit', 'pessoas.delete')
    AND category = 'pessoas';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CONFERIR: permissões pessoas.* no catálogo: % de 4', v_n;
  END IF;

  -- 13. Atribuições pessoas.*: só papéis não-sistema da nike (nunca globais,
  --     nunca de outra organização), e as 4 esperadas
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  JOIN public.anew_roles r ON r.id = rp.role_id
  WHERE rp.permission_code LIKE 'pessoas.%'
    AND (r.organization_id IS DISTINCT FROM 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
         OR r.is_system IS DISTINCT FROM false);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % atribuição(ões) pessoas.* fora dos papéis da nike', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  WHERE (rp.role_id, rp.permission_code) IN (
    ('cdbe453f-1732-4cec-aa0f-a5832324112f'::uuid, 'pessoas.view'),
    ('8aad9a25-905d-4162-ade0-1fa2566b6b16'::uuid, 'pessoas.view'),
    ('263ed08c-f6b7-4d5c-b3d0-1eca5a1017ec'::uuid, 'pessoas.view'),
    ('263ed08c-f6b7-4d5c-b3d0-1eca5a1017ec'::uuid, 'pessoas.create')
  );
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CONFERIR: atribuições pessoas.* aos papéis da nike: % de 4', v_n;
  END IF;

  -- 14. Funções existentes reutilizadas continuam iguais (md5 lido a 18/10)
  SELECT string_agg(e.sig, ',')
  INTO v_txt
  FROM (VALUES
    ('public.update_updated_at_column()',           'fc99e666cd1ddb90d5c5e86357e5d57e'),
    ('public.auto_assign_creator()',                '74aa7ec3bc191466e10442758f47f8cd'),
    ('public.resolve_root_organization_id(uuid)',   '0fd01d82d04202e94fecbc638af746a0'),
    ('public.current_business_user_id()',           '7e60101f074e4ff526559140be6618bb'),
    ('public.crm_scope_keys(text)',                 '6abb12e1d7a3db943630e8f8d7e15ca8'),
    ('public.has_anew_permission(uuid,text)',       '8f69ed134c7d20e080d8c5a4161a3151'),
    ('public.get_user_crm_org_ids(uuid)',           '29782031244dd3b0842ca43b271e2bf1'),
    ('public.is_system_admin(uuid)',                '159035010036f0045b091808cf9f77ef'),
    ('public.has_active_support_access(uuid)',      '6d8f902ee9fc7a59e4397412b2c121a0')
  ) AS e(sig, md5_esperado)
  WHERE to_regprocedure(e.sig) IS NULL
     OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.md5_esperado;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funções reutilizadas em falta ou mudadas desde a leitura: %', v_txt;
  END IF;
END;
$$;

RESET lock_timeout;
RESET statement_timeout;
