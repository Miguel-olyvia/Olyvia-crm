-- ============================================================
-- 20261222110000_levantamento_tabelas
-- ============================================================
-- O que faz
--   Cria as tabelas NOVAS do levantamento de obra da página Pessoas:
--     - public.levantamentos: um levantamento de uma pessoa (anew_entities),
--       com data, estado (por_fazer/feito), quem o fez, observações gerais,
--       morada da obra, a visita do calendário em que foi feito (opcional) e
--       o negócio a que ficou ligado (opcional, no máximo um por negócio);
--     - public.levantamento_linhas: as medidas (divisão, trabalho, medida,
--       unidade, observações), por ordem;
--     - public.levantamento_respostas: as respostas às perguntas da visita
--       (uma por pergunta), guardadas como chaves.
--   Não há jsonb: as respostas são pares chave -> chave em linhas tipadas.
--
-- SÓ ACRESCENTA. Esta migration NÃO altera nenhuma tabela, função, trigger,
--   política nem configuração existente, e NÃO escreve em nenhuma tabela
--   existente: nenhuma permissão nova (usa as pessoas.* da migration
--   20261222100000), nenhuma atribuição de permissões, nenhuma linha em
--   tabelas de auditoria. (Não há INSERT/UPDATE/DELETE a tabelas existentes
--   neste ficheiro; confirma-se por leitura.)
--
-- AVISO A QUEM APLICA (BLOQUEIO; LER ANTES DO PUSH):
--   A migration corre numa só transacção explícita (BEGIN ... COMMIT): se
--   o CONFERIR ou qualquer comando falhar, NADA fica criado.
--   As chaves estrangeiras exigem um bloqueio SHARE ROW EXCLUSIVE em
--   anew_organizations, anew_users, negocios, anew_entities e
--   SCHEDULE_ITEMS. Uma vez obtido, cada bloqueio fica seguro até ao COMMIT
--   e, enquanto dura, as ESCRITAS nessa tabela esperam (as leituras
--   continuam). anew_entities e schedule_items são escritas pelos
--   formulários públicos e pelo calendário de TODAS as organizações,
--   Mudelar incluída (produção real).
--   Para não entrar em fila nem formar ciclos de espera com essas escritas,
--   os cinco bloqueios são pedidos no início, por ordem fixa, com NOWAIT:
--   nunca se espera por um bloqueio. Se alguma tabela estiver ocupada, a
--   tentativa desfaz-se (larga o que apanhou), espera 250 ms e repete, até
--   10 tentativas (cerca de 2,5 s); se mesmo assim não conseguir, a
--   migration aborta com "Tabelas partilhadas ocupadas: voltar a tentar mais
--   tarde", sem ter prendido ninguém em fila e sem nada criado. Depois de
--   obtidos, o resto é só criação de objectos novos e o CONFERIR (fracção
--   de segundo), durante a qual as escritas nessas cinco tabelas esperam.
--   Aplicar COM TRÁFEGO BAIXO e SÓ COM CONFIRMAÇÃO EXPLÍCITA DO UTILIZADOR.
--
-- EFEITO NA MUDELAR: nenhum dado, nenhuma permissão. Além do bloqueio
--   acima, a única mudança sentida: apagar uma visita (schedule_items)
--   passa a verificar a chave estrangeira levantamentos.visita_id (pesquisa
--   no índice idx_levantamentos_visita_id; a tabela começa vazia em todas
--   as organizações). Dizer isto ao utilizador e esperar autorização.
--
-- ORDEM DE GRAVAÇÃO (obrigatória): CRIAR, PREENCHER, LIGAR.
--   1. INSERT do levantamento SEM negocio_id (um INSERT com negocio_id é
--      recusado: nasceria ligado, portanto congelado e vazio, e ocuparia o
--      lugar único do negócio);
--   2. INSERT/UPDATE/DELETE das linhas e respostas;
--   3. UPDATE do levantamento a pôr negocio_id. A partir daí fica congelado.
--
-- Regras que a base impõe (triggers novos, não o ecrã):
--   - id, organization_id e entity_id não mudam depois de criados; created_by
--     também não, excepto a passagem a NULL quando o utilizador é apagado;
--     root_organization_id e created_at ficam fixos.
--   - created_by, se vier nulo, é quem executa; feito_por, se vier nulo, é o
--     created_by. created_at, updated_at, deleted_at e deleted_by são
--     escritos pela base (now() e quem executa), ignorando o que o cliente
--     mande. data_levantamento é sempre mandada pelo cliente (sem default,
--     para não depender do fuso da sessão).
--   - Com sessão de utilizador, os triggers exigem que a organização do
--     levantamento (ou do pai, nas linhas e respostas) seja uma das do
--     utilizador (get_user_crm_org_ids); senão falham SEMPRE com a mesma
--     mensagem genérica ("Levantamento indisponível."). O que acontece antes
--     da guarda, para ser exacto: no INSERT do levantamento e na validação
--     das ligações, nada (a guarda é o primeiro passo); nas linhas e
--     respostas, uma leitura da organização do pai SEM bloqueio, cujo
--     resultado ("não existe" ou "outra organização") dá a mesma mensagem;
--     no UPDATE do levantamento, as funções do DECLARE lêem por id a visita,
--     o negócio e os utilizadores referidos na própria linha, que já passou
--     pela RLS de UPDATE. O FOR SHARE ao pai só acontece depois da guarda.
--     Assim os triggers, que correm antes da RLS do INSERT, não revelam
--     nada de outras organizações nem prendem linhas alheias.
--     A guarda é ENTRE organizações: dentro da mesma organização, quem tem
--     pessoas.edit e conhece o uuid de um levantamento pode distinguir os
--     estados "ligado a um negócio" e "no lixo" pelas mensagens (aceite).
--   - Ligações validadas só quando mudam (no INSERT, quando vêm preenchidas):
--       feito_por  -> membro activo da organização e não cliente
--                     (role_is_client IS NOT TRUE, como get_user_crm_org_ids);
--       visita_id  -> visita da mesma organização; se a visita tem lead, o
--                     lead tem de ser da mesma pessoa; sem lead (D5) só é
--                     aceite se também não tiver contacto, negócio (deal),
--                     cliente, ausência (time_off_type) nem férias
--                     (vacation_id) — para não ligar a folgas, férias ou
--                     reuniões de outras pessoas;
--       negocio_id -> só por UPDATE (ver ORDEM DE GRAVAÇÃO); negócio vivo
--                     (fora do lixo) da mesma organização e da mesma pessoa,
--                     e quem liga tem de ter pessoas.edit com âmbito sobre
--                     esse negócio (chave org:*, org:assigned_to ou
--                     org:created_by do negócio, como a política
--                     negocios_update). Se o negócio já tiver levantamento,
--                     a mensagem é genérica (a ligação é serializada por
--                     negócio, para não chegar ao erro do UNIQUE).
--   - Um levantamento ligado a um negócio fica CONGELADO (D3): não se altera,
--     não se desliga, não troca de negócio e não vai para o lixo (CHECK
--     levantamentos_lixo_coerente + trigger). As linhas e respostas de um
--     levantamento ligado também não se escrevem nem se apagam.
--   - Um só levantamento por negócio (D4): UNIQUE (negocio_id).
--   - Lixo só no pai (soft delete). Enviar para o lixo e restaurar exige
--     pessoas.edit (política de UPDATE) E pessoas.delete (trigger), com o
--     âmbito de pessoas.delete avaliado sobre o levantamento tal como estava
--     ANTES. No lixo o levantamento não se altera (só o restauro) e os
--     filhos ficam congelados. Como nos negócios, o restauro pode vir com
--     outras alterações no mesmo UPDATE (equivale a restaurar e editar; a
--     política de UPDATE exige pessoas.edit na mesma).
--   - Sem sessão de utilizador (auth.uid() nulo), a verificação de
--     pessoas.delete só é dispensada a service_role, ao dono e às
--     migrations; uma sessão com papel authenticated/anon sem uid é recusada.
--   - ÚNICAS excepções às regras de congelado/lixo: os UPDATE internos das
--     chaves estrangeiras ON DELETE SET NULL — visita apagada (visita_id),
--     negócio apagado fisicamente (negocio_id), utilizador apagado
--     (feito_por, created_by, deleted_by). Passam só se a linha antiga já
--     não existir e se nada mais mudar. Intencional: um negócio apagado
--     fisicamente (só service_role/dono o pode fazer) DESCONGELA o
--     levantamento, que volta a poder ser editado e ligado.
--   - DELETE físico do levantamento proibido a authenticated (sem GRANT e
--     política RESTRICTIVE). Os filhos têm ON DELETE CASCADE: só um
--     apagamento físico feito por service_role/dono (ex.: RGPD) os leva.
--   - As políticas de escrita das linhas e respostas exigem pessoas.edit
--     com âmbito sobre o pai, e também pessoas.view (a subconsulta ao pai
--     corre sob a RLS do pai, que exige pessoas.view).
--   - Sem auditoria genérica nas três tabelas (entity_audit_log lê-se com
--     outras permissões e copiaria observações e moradas).
--   - divisao, trabalho, pergunta e resposta: só o formato de chave é
--     verificado (D2, catálogo no código, "só exemplo"); unidade e secção
--     são listas fechadas.
--
-- AVISOS
--   - Âmbito por omissão: sem linhas em anew_membership_permission_scopes
--     para pessoas.*, o âmbito é OWNED (vê/edita quem fez ou criou).
--   - Na nike NINGUÉM tem pessoas.edit nem pessoas.delete (lido a 18/10):
--     quem só tem pessoas.create cria o levantamento mas não lhe acrescenta
--     linhas nem respostas, não o liga, não o edita nem o manda para o
--     lixo. A atribuição (D6) fica para uma migration própria; NÃO entra
--     aqui.
--   - RGPD: entity_id é ON DELETE RESTRICT. execute_entity_erasure (modo
--     apagar faz DELETE em anew_entities) não conhece levantamentos, por isso
--     fica BLOQUEADA para pessoas que tenham levantamentos (falha visível no
--     RESTRICT); no modo anonimizar não limpa notas, morada da obra nem
--     observações das linhas. A correcção altera uma função existente e fica
--     para uma migration à parte.
--   - Concorrência: o trigger dos filhos lê o pai com FOR SHARE (impede que
--     o levantamento seja ligado a um negócio ao mesmo tempo que se
--     acrescenta uma linha). Quem gravar pai e filhos na mesma transacção
--     deve escrever o PAI PRIMEIRO; filhos antes do pai, em duas sessões em
--     simultâneo sobre o mesmo levantamento, podem dar deadlock (o Postgres
--     aborta uma delas).
--
-- PRECISA DE CÓDIGO: nenhum ecrã lê estas tabelas ainda (o protótipo é em
--   memória), por isso nada fica partido. O hook que gravar terá de mandar
--   data_levantamento, medida em número com ponto decimal, NULL em vez de
--   texto vazio, gravar o pai antes dos filhos e seguir a ORDEM DE
--   GRAVAÇÃO acima (criar sem negocio_id, preencher, e só depois ligar).
--   O upsert das respostas (on conflict (levantamento_id, pergunta)) NÃO
--   pode mandar `id` no payload: num conflito, EXCLUDED.id é um uuid novo e
--   o trigger recusa mudar o identificador; sem `id`, funciona.
--
-- Funções existentes reutilizadas (lidas no remoto a 18/10, inalteradas; o
--   bloco CONFERIR compara o md5 da definição):
--   update_updated_at_column(), resolve_root_organization_id(uuid),
--   current_business_user_id(), crm_scope_keys(text),
--   has_anew_permission(uuid, text), get_user_crm_org_ids(uuid),
--   is_system_admin(uuid), has_active_support_access(uuid),
--   fn_negocios_actor(), fn_negocios_ref_utilizador_apagado(uuid, uuid).
--   auto_assign_creator() NÃO é usada (escreve assigned_to, que aqui não
--   existe).
--
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '60s';

-- Bloqueios no início, por ordem fixa, com NOWAIT (nunca entra em fila).
-- Cada tentativa é um sub-bloco: se uma tabela estiver ocupada, a excepção
-- desfaz o sub-bloco e larga os bloqueios que ele tinha apanhado; espera
-- 250 ms e repete. Quando o sub-bloco acaba sem erro, os bloqueios passam
-- para a transacção da migration e ficam seguros até ao COMMIT.
DO $$
DECLARE
  v_tentativa int := 0;
BEGIN
  LOOP
    v_tentativa := v_tentativa + 1;
    BEGIN
      LOCK TABLE public.anew_organizations IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.anew_users         IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.negocios           IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.anew_entities      IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.schedule_items     IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      IF v_tentativa >= 10 THEN
        RAISE EXCEPTION 'Tabelas partilhadas ocupadas: voltar a tentar mais tarde (% tentativas).', v_tentativa
          USING ERRCODE = 'lock_not_available';
      END IF;
      PERFORM pg_sleep(0.25);
    END;
  END LOOP;
END;
$$;

-- ============================================================
-- 1. Tabela levantamentos
-- ============================================================

CREATE TABLE public.levantamentos (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  root_organization_id uuid        NOT NULL,
  entity_id            uuid        NOT NULL,
  visita_id            uuid        NULL,
  negocio_id           uuid        NULL,
  feito_por            uuid        NULL,
  data_levantamento    date        NOT NULL,
  estado               text        NOT NULL DEFAULT 'por_fazer',
  notas                text        NULL,
  morada_rua           text        NULL,
  morada_codigo_postal text        NULL,
  morada_localidade    text        NULL,
  morada_andar         text        NULL,
  created_by           uuid        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,
  deleted_by           uuid        NULL,

  CONSTRAINT levantamentos_pkey PRIMARY KEY (id),
  -- Um levantamento por negócio (D4). NULLs são distintos: os levantamentos
  -- por ligar não colidem. Serve também de índice à chave estrangeira.
  CONSTRAINT levantamentos_negocio_id_key UNIQUE (negocio_id),

  CONSTRAINT levantamentos_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  CONSTRAINT levantamentos_root_organization_id_fkey
    FOREIGN KEY (root_organization_id) REFERENCES public.anew_organizations(id),
  CONSTRAINT levantamentos_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.anew_entities(id) ON DELETE RESTRICT,
  CONSTRAINT levantamentos_visita_id_fkey
    FOREIGN KEY (visita_id) REFERENCES public.schedule_items(id) ON DELETE SET NULL,
  CONSTRAINT levantamentos_negocio_id_fkey
    FOREIGN KEY (negocio_id) REFERENCES public.negocios(id) ON DELETE SET NULL,
  CONSTRAINT levantamentos_feito_por_fkey
    FOREIGN KEY (feito_por) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT levantamentos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT levantamentos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users(id) ON DELETE SET NULL,

  CONSTRAINT levantamentos_estado_check
    CHECK (estado IN ('por_fazer', 'feito')),
  CONSTRAINT levantamentos_notas_check
    CHECK (notas IS NULL OR char_length(notas) <= 5000),
  CONSTRAINT levantamentos_morada_rua_check
    CHECK (morada_rua IS NULL OR (btrim(morada_rua) <> '' AND char_length(morada_rua) <= 300)),
  CONSTRAINT levantamentos_morada_codigo_postal_check
    CHECK (morada_codigo_postal IS NULL OR morada_codigo_postal ~ '^[0-9]{4}-[0-9]{3}$'),
  CONSTRAINT levantamentos_morada_localidade_check
    CHECK (morada_localidade IS NULL OR (btrim(morada_localidade) <> '' AND char_length(morada_localidade) <= 120)),
  CONSTRAINT levantamentos_morada_andar_check
    CHECK (morada_andar IS NULL OR (btrim(morada_andar) <> '' AND char_length(morada_andar) <= 60)),
  -- Sem current_date: um CHECK tem de ser imutável.
  CONSTRAINT levantamentos_data_check
    CHECK (data_levantamento >= DATE '2000-01-01'),
  -- Um levantamento ligado a um negócio não vai para o lixo (D3).
  -- deleted_by não entra: passa a NULL quando o utilizador é apagado.
  CONSTRAINT levantamentos_lixo_coerente
    CHECK (deleted_at IS NULL OR negocio_id IS NULL)
);

-- Índices. Os das chaves estrangeiras são todos NÃO parciais: servem as
-- verificações de integridade ao apagar organização, pessoa, visita,
-- negócio ou utilizador (que não podem usar índices parciais). O do lixo é
-- o único parcial (só listagem).
CREATE INDEX idx_levantamentos_org_data
  ON public.levantamentos (organization_id, data_levantamento DESC);
CREATE INDEX idx_levantamentos_entity_org
  ON public.levantamentos (entity_id, organization_id);
-- Obrigatório: sem ele, apagar uma visita no calendário (Mudelar incluída)
-- faria uma leitura sequencial de levantamentos.
CREATE INDEX idx_levantamentos_visita_id
  ON public.levantamentos (visita_id);
CREATE INDEX idx_levantamentos_lixo
  ON public.levantamentos (organization_id) WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_levantamentos_root_organization_id ON public.levantamentos (root_organization_id);
CREATE INDEX idx_levantamentos_feito_por            ON public.levantamentos (feito_por);
CREATE INDEX idx_levantamentos_created_by           ON public.levantamentos (created_by);
CREATE INDEX idx_levantamentos_deleted_by           ON public.levantamentos (deleted_by);

-- ============================================================
-- 2. Tabela levantamento_linhas (medidas)
-- ============================================================

CREATE TABLE public.levantamento_linhas (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  levantamento_id uuid          NOT NULL,
  organization_id uuid          NOT NULL,
  divisao         text          NOT NULL,
  trabalho        text          NOT NULL,
  trabalho_outro  text          NULL,
  medida          numeric(12,3) NOT NULL,
  unidade         text          NOT NULL DEFAULT 'm2',
  observacoes     text          NULL,
  ordem           integer       NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT levantamento_linhas_pkey PRIMARY KEY (id),

  CONSTRAINT levantamento_linhas_levantamento_id_fkey
    FOREIGN KEY (levantamento_id) REFERENCES public.levantamentos(id) ON DELETE CASCADE,
  CONSTRAINT levantamento_linhas_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,

  -- Formato de chave (D2): o texto vem das traduções.
  CONSTRAINT levantamento_linhas_divisao_check
    CHECK (divisao ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  CONSTRAINT levantamento_linhas_trabalho_check
    CHECK (trabalho ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  -- O texto livre existe se e só se o trabalho é 'outro'; até 60 caracteres
  -- (MAX_TRABALHO_OUTRO da UI).
  CONSTRAINT levantamento_linhas_trabalho_outro_check
    CHECK (((trabalho = 'outro') = (trabalho_outro IS NOT NULL))
           AND (trabalho_outro IS NULL
                OR (btrim(trabalho_outro) <> '' AND char_length(trabalho_outro) <= 60))),
  CONSTRAINT levantamento_linhas_medida_check
    CHECK (medida > 0 AND medida < 1000000),
  CONSTRAINT levantamento_linhas_unidade_check
    CHECK (unidade IN ('m2', 'm', 'un')),
  CONSTRAINT levantamento_linhas_observacoes_check
    CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
  CONSTRAINT levantamento_linhas_ordem_check
    CHECK (ordem >= 0)
);

-- Serve a chave estrangeira e a leitura ordenada das linhas (desempate por id).
CREATE INDEX idx_levantamento_linhas_levantamento
  ON public.levantamento_linhas (levantamento_id, ordem);
CREATE INDEX idx_levantamento_linhas_organization_id
  ON public.levantamento_linhas (organization_id);

-- ============================================================
-- 3. Tabela levantamento_respostas
-- ============================================================

CREATE TABLE public.levantamento_respostas (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  levantamento_id uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  seccao          text        NOT NULL,
  pergunta        text        NOT NULL,
  resposta        text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT levantamento_respostas_pkey PRIMARY KEY (id),
  -- Uma resposta por pergunta (o id da pergunta é único em todo o painel).
  -- Permite upsert ... on conflict (levantamento_id, pergunta) e serve de
  -- índice à chave estrangeira.
  CONSTRAINT levantamento_respostas_levantamento_pergunta_key UNIQUE (levantamento_id, pergunta),

  CONSTRAINT levantamento_respostas_levantamento_id_fkey
    FOREIGN KEY (levantamento_id) REFERENCES public.levantamentos(id) ON DELETE CASCADE,
  CONSTRAINT levantamento_respostas_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,

  -- As 5 secções com perguntas ('visitas' e 'medidas' não têm respostas).
  CONSTRAINT levantamento_respostas_seccao_check
    CHECK (seccao IN ('exterior', 'interior', 'area', 'necessidades', 'escolhas')),
  CONSTRAINT levantamento_respostas_pergunta_check
    CHECK (pergunta ~ '^[a-z][A-Za-z0-9]{0,39}$'),
  -- Chave da opção; há opções como t0, p5 e m24 (letras e dígitos).
  CONSTRAINT levantamento_respostas_resposta_check
    CHECK (resposta ~ '^[a-z0-9][A-Za-z0-9]{0,39}$')
);

CREATE INDEX idx_levantamento_respostas_organization_id
  ON public.levantamento_respostas (organization_id);

-- ============================================================
-- 4. Funções novas (só de trigger; ninguém da API as executa)
-- ============================================================

-- Verdadeiro quando visita_id/negocio_id passa a NULL porque a linha
-- referida já não existe: é o UPDATE interno da chave estrangeira ON DELETE
-- SET NULL. Tem de passar mesmo num levantamento ligado ou no lixo.
-- VOLATILE de propósito (snapshot novo: vê a linha já apagada pelo comando
-- anterior). p_tabela só aceita os dois literais; sem SQL dinâmico.
CREATE FUNCTION public.fn_levantamentos_ref_desaparecida(
  p_tabela text, p_antigo uuid, p_novo uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_antigo IS NULL OR p_novo IS NOT NULL THEN
    RETURN false;
  END IF;

  CASE p_tabela
    WHEN 'schedule_items' THEN
      RETURN NOT EXISTS (SELECT 1 FROM public.schedule_items s WHERE s.id = p_antigo);
    WHEN 'negocios' THEN
      RETURN NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = p_antigo);
    ELSE
      RAISE EXCEPTION 'fn_levantamentos_ref_desaparecida: tabela não suportada (%)', p_tabela;
  END CASE;
END;
$function$;

-- Guarda de organização, no topo dos triggers que correm antes da RLS do
-- INSERT: com sessão de utilizador, a organização tem de ser uma das dele
-- (get_user_crm_org_ids). Senão falha SEMPRE com a mesma mensagem
-- genérica, para não servir de oráculo entre organizações. Sem uid: passa
-- só quem não é authenticated/anon (service_role, dono, migrations).
CREATE FUNCTION public.fn_levantamentos_exigir_organizacao(p_organization_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
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
      RAISE EXCEPTION 'Levantamento indisponível.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN;
  END IF;

  IF p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_crm_org_ids(v_uid)) THEN
    RAISE EXCEPTION 'Levantamento indisponível.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$function$;

-- Exige pessoas.delete com âmbito sobre o levantamento tal como estava antes
-- da alteração. Sem uid: só passa quem não é authenticated/anon
-- (service_role, dono, migrations).
CREATE FUNCTION public.fn_levantamentos_exigir_permissao_lixo(
  p_organization_id uuid, p_feito_por uuid, p_created_by uuid)
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
      RAISE EXCEPTION 'Sessão sem utilizador: não é possível enviar este levantamento para o lixo nem restaurá-lo.'
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
         OR k.scope_key = p_organization_id::text || ':' || p_feito_por::text
         OR k.scope_key = p_organization_id::text || ':' || p_created_by::text
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para enviar este levantamento para o lixo ou para o restaurar (pessoas.delete).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$function$;

-- Valida as ligações que mudaram (argumento NULL = não validar).
-- Corre como definer: a validação não depende de o utilizador ver a visita
-- no calendário; só revela existência dentro da organização do
-- levantamento (que já passou pela RLS).
CREATE FUNCTION public.fn_levantamentos_validar_ligacoes(
  p_organization_id uuid, p_entity_id uuid,
  p_feito_por uuid, p_visita_id uuid, p_negocio_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_visita record;
BEGIN
  -- Guarda de organização antes de qualquer leitura (mensagem genérica).
  PERFORM public.fn_levantamentos_exigir_organizacao(p_organization_id);

  IF p_feito_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.user_id = p_feito_por
      AND m.organization_id = p_organization_id
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Quem fez o levantamento tem de ser membro activo da organização.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_visita_id IS NOT NULL THEN
    SELECT s.organization_id, s.lead_id, s.contact_id, s.deal_id, s.client_id,
           s.time_off_type, s.vacation_id
      INTO v_visita
    FROM public.schedule_items s
    WHERE s.id = p_visita_id;

    IF NOT FOUND OR v_visita.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'A visita indicada não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_visita.lead_id IS NOT NULL THEN
      -- Com lead, o lead tem de ser da pessoa do levantamento.
      IF NOT EXISTS (
        SELECT 1 FROM public.anew_leads l
        WHERE l.id = v_visita.lead_id
          AND l.entity_id = p_entity_id
      ) THEN
        RAISE EXCEPTION 'A visita indicada é de outra pessoa.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_visita.contact_id IS NOT NULL
       OR v_visita.deal_id IS NOT NULL
       OR v_visita.client_id IS NOT NULL
       OR v_visita.time_off_type IS NOT NULL
       OR v_visita.vacation_id IS NOT NULL THEN
      -- D5: sem lead só se aceita uma visita "solta" (sem contacto, negócio,
      -- cliente, ausência nem férias): nunca uma folga, umas férias ou uma
      -- reunião de outra pessoa.
      RAISE EXCEPTION 'A visita indicada é de outra pessoa ou não é uma visita.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_negocio_id IS NOT NULL THEN
    -- Negócio vivo, da mesma organização e pessoa e, com sessão, com
    -- pessoas.edit de quem liga sobre esse negócio (espelha negocios_update:
    -- chave org:*, org:assigned_to ou org:created_by). Uma só mensagem para
    -- "não existe", "é de outra pessoa", "está no lixo" e "sem acesso".
    IF NOT EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.deleted_at IS NULL
        AND (
          v_uid IS NULL
          OR (
            public.has_anew_permission(v_uid, 'pessoas.edit')
            AND EXISTS (
              SELECT 1
              FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
              WHERE k.scope_key = n.organization_id::text || ':*'
                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'O negócio indicado não está disponível para ligar a este levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Serializa as ligações ao mesmo negócio: a segunda espera pelo fim da
    -- primeira e, com um snapshot novo, vê-a. Assim "já tem levantamento"
    -- dá esta mensagem e não o erro 23505 do UNIQUE (que mostraria o uuid).
    PERFORM pg_advisory_xact_lock(
      hashtextextended('levantamentos.negocio_id:' || p_negocio_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.negocio_id = p_negocio_id
    ) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$function$;

-- BEFORE INSERT: valores que a base decide, não o cliente.
CREATE FUNCTION public.fn_levantamentos_preparar_insercao()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_feito_por_dado uuid := NEW.feito_por;
BEGIN
  -- Guarda de organização antes de qualquer leitura (mensagem genérica).
  PERFORM public.fn_levantamentos_exigir_organizacao(NEW.organization_id);

  -- CRIAR, PREENCHER, LIGAR: nasce sempre por ligar. Um INSERT já ligado
  -- ficaria congelado e vazio (os filhos são recusados) e ocuparia o lugar
  -- único do negócio.
  IF NEW.negocio_id IS NOT NULL THEN
    RAISE EXCEPTION 'Um levantamento não se cria já ligado a um negócio: grave-o primeiro (com as medidas e respostas) e ligue-o depois.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.root_organization_id := public.resolve_root_organization_id(NEW.organization_id);

  IF NEW.created_by IS NULL THEN
    NEW.created_by := public.fn_negocios_actor();
  END IF;
  IF NEW.feito_por IS NULL THEN
    NEW.feito_por := NEW.created_by;
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;

  -- feito_por só é validado aqui se veio do cliente (o derivado de
  -- created_by é validado pela política de INSERT).
  PERFORM public.fn_levantamentos_validar_ligacoes(
    NEW.organization_id, NEW.entity_id,
    v_feito_por_dado, NEW.visita_id, NULL::uuid);

  RETURN NEW;
END;
$function$;

-- BEFORE UPDATE, por esta ordem: imutáveis; UPDATE interno das chaves
-- estrangeiras; ligado (congelado); no lixo (só restauro); ligações que
-- mudaram; fixos; passagem vivo <-> lixo.
CREATE FUNCTION public.fn_levantamentos_guardar_alteracao()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_limpa_visita   boolean := public.fn_levantamentos_ref_desaparecida('schedule_items', OLD.visita_id, NEW.visita_id);
  v_limpa_negocio  boolean := public.fn_levantamentos_ref_desaparecida('negocios', OLD.negocio_id, NEW.negocio_id);
  v_limpa_criador  boolean := public.fn_negocios_ref_utilizador_apagado(OLD.created_by, NEW.created_by);
  v_limpa_autor    boolean := public.fn_negocios_ref_utilizador_apagado(OLD.feito_por, NEW.feito_por);
  v_limpa_apagador boolean := public.fn_negocios_ref_utilizador_apagado(OLD.deleted_by, NEW.deleted_by);
  v_ignorar        text[]  := ARRAY['updated_at'];
BEGIN
  -- 1. Imutáveis (created_by só pode ir a NULL se o utilizador foi apagado)
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é possível mudar o identificador de um levantamento.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar a organização de um levantamento.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'Não é possível mudar a pessoa de um levantamento.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT v_limpa_criador THEN
    RAISE EXCEPTION 'Não é possível mudar quem criou um levantamento.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. UPDATE interno das chaves estrangeiras ON DELETE SET NULL: passa
  --    sempre (ligado ou no lixo), desde que nada mais mude.
  IF v_limpa_visita   THEN v_ignorar := v_ignorar || 'visita_id'::text;  END IF;
  IF v_limpa_negocio  THEN v_ignorar := v_ignorar || 'negocio_id'::text; END IF;
  IF v_limpa_criador  THEN v_ignorar := v_ignorar || 'created_by'::text; END IF;
  IF v_limpa_autor    THEN v_ignorar := v_ignorar || 'feito_por'::text;  END IF;
  IF v_limpa_apagador THEN v_ignorar := v_ignorar || 'deleted_by'::text; END IF;

  IF cardinality(v_ignorar) > 1
     AND (to_jsonb(NEW) - v_ignorar) = (to_jsonb(OLD) - v_ignorar) THEN
    RETURN NEW;
  END IF;

  -- 3. Ligado a um negócio: congelado (D3). Inclui desligar e trocar.
  IF OLD.negocio_id IS NOT NULL
     AND (to_jsonb(NEW) - 'updated_at'::text) IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at'::text) THEN
    RAISE EXCEPTION 'Este levantamento já está ligado a um negócio e não se altera; registe um novo.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. No lixo: só o restauro (deleted_at volta a NULL).
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL
     AND (to_jsonb(NEW) - 'updated_at'::text) IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at'::text) THEN
    RAISE EXCEPTION 'Este levantamento está no lixo: tem de ser restaurado antes de ser alterado.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5. Ligações que mudaram para um valor (negocio_id aqui só de NULL para
  --    valor: o ligado já foi recusado no passo 3). É aqui que se liga a um
  --    negócio (CRIAR, PREENCHER, LIGAR), com a guarda de organização, o
  --    acesso de pessoas.edit ao negócio e a serialização por negócio.
  PERFORM public.fn_levantamentos_validar_ligacoes(
    NEW.organization_id, NEW.entity_id,
    CASE WHEN NEW.feito_por  IS DISTINCT FROM OLD.feito_por  THEN NEW.feito_por  END,
    CASE WHEN NEW.visita_id  IS DISTINCT FROM OLD.visita_id  THEN NEW.visita_id  END,
    CASE WHEN NEW.negocio_id IS DISTINCT FROM OLD.negocio_id THEN NEW.negocio_id END);

  -- 6. Fixos
  NEW.root_organization_id := OLD.root_organization_id;
  NEW.created_at := OLD.created_at;

  -- 7. Lixo: só a passagem vivo <-> lixo conta; o valor é sempre da base.
  IF (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
    PERFORM public.fn_levantamentos_exigir_permissao_lixo(
      OLD.organization_id, OLD.feito_por, OLD.created_by);

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

-- Pai de uma linha/resposta. Primeiro a guarda de organização (sem
-- bloquear; "não existe" e "outra organização" dão a mesma mensagem,
-- "Levantamento indisponível."), só depois o FOR SHARE (FOR SHARE, não FOR
-- KEY SHARE: só o SHARE colide com o FOR NO KEY UPDATE de um UPDATE ao pai,
-- e é isso que impede ligar o levantamento a um negócio ao mesmo tempo que
-- se acrescenta uma linha). Recusa se o pai estiver ligado ou no lixo.
-- Devolve a organização do pai. Num DELETE em cascata o pai já não existe:
-- devolve NULL e deixa passar.
CREATE FUNCTION public.fn_levantamento_filhos_pai(
  p_levantamento_id uuid, p_apagar boolean)
  RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org     uuid;
  v_negocio uuid;
  v_lixo    timestamptz;
BEGIN
  -- 1. Organização do pai, SEM bloquear, só para a guarda.
  SELECT l.organization_id INTO v_org
  FROM public.levantamentos l
  WHERE l.id = p_levantamento_id;

  IF NOT FOUND THEN
    -- DELETE em cascata: o pai já foi apagado; deixa passar.
    IF p_apagar THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Levantamento indisponível.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Guarda de organização (mesma mensagem que "não existe").
  PERFORM public.fn_levantamentos_exigir_organizacao(v_org);

  -- 3. Só agora o FOR SHARE (nunca sobre linhas de outra organização).
  SELECT l.organization_id, l.negocio_id, l.deleted_at
    INTO v_org, v_negocio, v_lixo
  FROM public.levantamentos l
  WHERE l.id = p_levantamento_id
  FOR SHARE;

  IF NOT FOUND THEN
    IF p_apagar THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Levantamento indisponível.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_negocio IS NOT NULL THEN
    RAISE EXCEPTION 'Este levantamento já está ligado a um negócio e não se altera; registe um novo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_lixo IS NOT NULL THEN
    RAISE EXCEPTION 'Este levantamento está no lixo: tem de ser restaurado antes de ser alterado.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_org;
END;
$function$;

-- BEFORE INSERT OR UPDATE OR DELETE em levantamento_linhas.
CREATE FUNCTION public.fn_levantamento_linhas_guardar()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_levantamento_filhos_pai(OLD.levantamento_id, true);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Primeiro o pai (guarda de organização, ligado, lixo).
    PERFORM public.fn_levantamento_filhos_pai(OLD.levantamento_id, false);
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Não é possível mudar o identificador de uma linha do levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.levantamento_id IS DISTINCT FROM OLD.levantamento_id THEN
      RAISE EXCEPTION 'Não é possível passar uma linha para outro levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Não é possível mudar a organização de uma linha do levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  -- INSERT: a organização é a do pai, ignorando o que o cliente mande.
  NEW.organization_id := public.fn_levantamento_filhos_pai(NEW.levantamento_id, false);
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- BEFORE INSERT OR UPDATE OR DELETE em levantamento_respostas.
CREATE FUNCTION public.fn_levantamento_respostas_guardar()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_levantamento_filhos_pai(OLD.levantamento_id, true);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Primeiro o pai (guarda de organização, ligado, lixo).
    PERFORM public.fn_levantamento_filhos_pai(OLD.levantamento_id, false);
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Não é possível mudar o identificador de uma resposta do levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.levantamento_id IS DISTINCT FROM OLD.levantamento_id THEN
      RAISE EXCEPTION 'Não é possível passar uma resposta para outro levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Não é possível mudar a organização de uma resposta do levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.pergunta IS DISTINCT FROM OLD.pergunta THEN
      RAISE EXCEPTION 'Não é possível mudar a pergunta de uma resposta; apague-a e registe outra.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  -- INSERT: a organização é a do pai, ignorando o que o cliente mande.
  NEW.organization_id := public.fn_levantamento_filhos_pai(NEW.levantamento_id, false);
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_levantamentos_ref_desaparecida(text, uuid, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamentos_exigir_organizacao(uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamentos_exigir_permissao_lixo(uuid, uuid, uuid)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamentos_validar_ligacoes(uuid, uuid, uuid, uuid, uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamentos_preparar_insercao()                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamentos_guardar_alteracao()                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamento_filhos_pai(uuid, boolean)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamento_linhas_guardar()                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_levantamento_respostas_guardar()                              FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_levantamentos_ref_desaparecida(text, uuid, uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamentos_exigir_organizacao(uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamentos_exigir_permissao_lixo(uuid, uuid, uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamentos_validar_ligacoes(uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamentos_preparar_insercao()                            TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamentos_guardar_alteracao()                            TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamento_filhos_pai(uuid, boolean)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamento_linhas_guardar()                                TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_levantamento_respostas_guardar()                             TO service_role;

-- ============================================================
-- 5. Triggers (BEFORE correm por ordem alfabética do nome: os trg_00_
--    correm antes do updated_at). Sem auto_assign_creator, sem auditoria
--    genérica, sem histórico de eventos.
-- ============================================================

CREATE TRIGGER trg_00_levantamentos_preparar_insercao
  BEFORE INSERT ON public.levantamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamentos_preparar_insercao();

CREATE TRIGGER trg_00_levantamentos_guardar_alteracao
  BEFORE UPDATE ON public.levantamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamentos_guardar_alteracao();

CREATE TRIGGER trg_levantamentos_updated_at
  BEFORE UPDATE ON public.levantamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_00_levantamento_linhas_guardar
  BEFORE INSERT OR UPDATE OR DELETE ON public.levantamento_linhas
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamento_linhas_guardar();

CREATE TRIGGER trg_levantamento_linhas_updated_at
  BEFORE UPDATE ON public.levantamento_linhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_00_levantamento_respostas_guardar
  BEFORE INSERT OR UPDATE OR DELETE ON public.levantamento_respostas
  FOR EACH ROW EXECUTE FUNCTION public.fn_levantamento_respostas_guardar();

CREATE TRIGGER trg_levantamento_respostas_updated_at
  BEFORE UPDATE ON public.levantamento_respostas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. Privilégios (o default ACL dá tudo a anon: tira-se)
-- ============================================================

REVOKE ALL ON TABLE public.levantamentos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.levantamentos TO authenticated;
GRANT ALL ON TABLE public.levantamentos TO service_role;

REVOKE ALL ON TABLE public.levantamento_linhas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.levantamento_linhas TO authenticated;
GRANT ALL ON TABLE public.levantamento_linhas TO service_role;

REVOKE ALL ON TABLE public.levantamento_respostas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.levantamento_respostas TO authenticated;
GRANT ALL ON TABLE public.levantamento_respostas TO service_role;

-- ============================================================
-- 7. RLS — levantamentos
-- ============================================================
-- Mesmos padrões dos negócios: has_anew_permission como initplan; quem
-- prende à organização é a chave de âmbito de crm_scope_keys. O âmbito é
-- dado por feito_por e created_by.

ALTER TABLE public.levantamentos ENABLE ROW LEVEL SECURITY;

-- Mostra também os do lixo (o ecrã do lixo filtra).
CREATE POLICY levantamentos_select
  ON public.levantamentos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.view'))) AS k(scope_key)
      WHERE k.scope_key = levantamentos.organization_id::text || ':*'
         OR k.scope_key = levantamentos.organization_id::text || ':' || levantamentos.feito_por::text
         OR k.scope_key = levantamentos.organization_id::text || ':' || levantamentos.created_by::text
    )
  );

-- A visita e o negócio são validados no trigger (não aqui, para não
-- duplicar subconsultas).
CREATE POLICY levantamentos_insert
  ON public.levantamentos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.create'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    -- pessoas.create NA PRÓPRIA organização (sem âmbito: basta uma chave
    -- desta organização).
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.create'))) AS k(scope_key)
      WHERE starts_with(k.scope_key, levantamentos.organization_id::text || ':')
    )
    -- created_by é preenchido pela base se vier nulo; se vier, é o próprio.
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
      WHERE l.entity_id = levantamentos.entity_id
        AND l.organization_id = levantamentos.organization_id
    )
    -- Quem fez, se houver, é membro activo e não cliente da organização
    -- (como get_user_crm_org_ids).
    AND (
      feito_por IS NULL
      OR EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.user_id = levantamentos.feito_por
          AND m.organization_id = levantamentos.organization_id
          AND m.status = 'active'
          AND m.role_is_client IS NOT TRUE
      )
    )
    -- CRIAR, PREENCHER, LIGAR: nasce sempre por ligar (o trigger já o
    -- recusa com mensagem clara; isto é a segunda barreira).
    AND negocio_id IS NULL
  );

-- A linha nova tem de continuar dentro do âmbito de pessoas.edit de quem
-- altera. feito_por é validado no trigger, só quando muda.
CREATE POLICY levantamentos_update
  ON public.levantamentos
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
      WHERE k.scope_key = levantamentos.organization_id::text || ':*'
         OR k.scope_key = levantamentos.organization_id::text || ':' || levantamentos.feito_por::text
         OR k.scope_key = levantamentos.organization_id::text || ':' || levantamentos.created_by::text
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
      WHERE k.scope_key = levantamentos.organization_id::text || ':*'
         OR k.scope_key = levantamentos.organization_id::text || ':' || levantamentos.feito_por::text
         OR k.scope_key = levantamentos.organization_id::text || ':' || levantamentos.created_by::text
    )
  );

-- DELETE físico proibido (só soft delete).
CREATE POLICY levantamentos_no_delete
  ON public.levantamentos
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- Cópia literal da política dos negócios.
CREATE POLICY system_admin_pii_default_deny
  ON public.levantamentos
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
-- 8. RLS — levantamento_linhas e levantamento_respostas
-- ============================================================
-- Herdam do pai. Na leitura, a subconsulta a levantamentos corre sob a RLS
-- do pai (âmbito de pessoas.view). Na escrita, a RLS do pai dá o âmbito de
-- view, não o de edit: a chave de pessoas.edit vem explícita sobre o pai.
-- Pai ligado ou no lixo é recusado pelo trigger dos filhos (vale também
-- para service_role), não pela política.

ALTER TABLE public.levantamento_linhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY levantamento_linhas_select
  ON public.levantamento_linhas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_linhas.levantamento_id
    )
  );

CREATE POLICY levantamento_linhas_insert
  ON public.levantamento_linhas
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_linhas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  );

CREATE POLICY levantamento_linhas_update
  ON public.levantamento_linhas
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_linhas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_linhas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  );

CREATE POLICY levantamento_linhas_delete
  ON public.levantamento_linhas
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_linhas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  );

CREATE POLICY system_admin_pii_default_deny
  ON public.levantamento_linhas
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

ALTER TABLE public.levantamento_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY levantamento_respostas_select
  ON public.levantamento_respostas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.view'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_respostas.levantamento_id
    )
  );

CREATE POLICY levantamento_respostas_insert
  ON public.levantamento_respostas
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_respostas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  );

CREATE POLICY levantamento_respostas_update
  ON public.levantamento_respostas
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_respostas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_respostas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  );

CREATE POLICY levantamento_respostas_delete
  ON public.levantamento_respostas
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.edit'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.id = levantamento_respostas.levantamento_id
        AND EXISTS (
          SELECT 1
          FROM unnest((SELECT public.crm_scope_keys('pessoas.edit'))) AS k(scope_key)
          WHERE k.scope_key = l.organization_id::text || ':*'
             OR k.scope_key = l.organization_id::text || ':' || l.feito_por::text
             OR k.scope_key = l.organization_id::text || ':' || l.created_by::text
        )
    )
  );

CREATE POLICY system_admin_pii_default_deny
  ON public.levantamento_respostas
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
-- 9. Comentários
-- ============================================================

COMMENT ON TABLE public.levantamentos IS
  'Levantamento de obra de uma pessoa (anew_entities), da página Pessoas: data, estado, quem fez, observações, morada da obra, visita (opcional) e negócio ligado (opcional, um por negócio). Medidas em levantamento_linhas, respostas em levantamento_respostas. Ligado a um negócio fica congelado. Só soft delete. Sem auditoria genérica. Permissões pessoas.*.';
COMMENT ON COLUMN public.levantamentos.root_organization_id IS 'Preenchido por trigger no INSERT (resolve_root_organization_id); fixo depois.';
COMMENT ON COLUMN public.levantamentos.feito_por IS 'Quem fez o levantamento (anew_users). Se vier nulo no INSERT, fica o created_by. Validado como membro activo só quando muda. Entra no âmbito de pessoas.*.';
COMMENT ON COLUMN public.levantamentos.estado IS 'por_fazer | feito. Escrito pela UI (D1).';
COMMENT ON COLUMN public.levantamentos.visita_id IS 'Visita do calendário (schedule_items) em que foi feito; da mesma organização e, se a visita tem lead, da mesma pessoa. Passa a NULL se a visita for apagada.';
COMMENT ON COLUMN public.levantamentos.negocio_id IS 'Negócio a que ficou ligado: um levantamento por negócio; ligado fica congelado (não se altera, não se desliga, não vai para o lixo). Passa a NULL só se o negócio for apagado fisicamente.';
COMMENT ON COLUMN public.levantamentos.data_levantamento IS 'Data do levantamento, mandada sempre pelo cliente (data da visita ou hoje).';
COMMENT ON COLUMN public.levantamentos.created_by IS 'Quem criou; preenchido pela base se vier nulo; imutável (só passa a NULL se o utilizador for apagado).';
COMMENT ON COLUMN public.levantamentos.deleted_at IS 'Lixo. Escrito pela base (now()); pôr e tirar exige pessoas.edit e pessoas.delete. No lixo o levantamento e os filhos não se alteram.';
COMMENT ON COLUMN public.levantamentos.deleted_by IS 'Quem enviou para o lixo; escrito pela base (passa a NULL se o utilizador for apagado).';
COMMENT ON TABLE public.levantamento_linhas IS
  'Medidas de um levantamento (divisão, trabalho, medida, unidade). Composição pura: DELETE físico permitido com pessoas.edit; vai com o pai num apagamento físico. Congeladas se o pai estiver ligado a um negócio ou no lixo.';
COMMENT ON COLUMN public.levantamento_linhas.organization_id IS 'Cópia da organização do pai, escrita por trigger; imutável.';
COMMENT ON COLUMN public.levantamento_linhas.divisao IS 'Chave da divisão (formato verificado, sem lista fechada); o texto vem das traduções.';
COMMENT ON COLUMN public.levantamento_linhas.trabalho IS 'Chave do catálogo de trabalhos ou outro (formato verificado, sem lista fechada); o texto vem das traduções.';
COMMENT ON COLUMN public.levantamento_linhas.trabalho_outro IS 'Texto livre, só quando trabalho = outro (até 60 caracteres).';
COMMENT ON TABLE public.levantamento_respostas IS
  'Respostas às perguntas da visita de um levantamento, uma por pergunta, guardadas como chaves (o texto vem das traduções). Congeladas se o pai estiver ligado a um negócio ou no lixo.';
COMMENT ON COLUMN public.levantamento_respostas.organization_id IS 'Cópia da organização do pai, escrita por trigger; imutável.';
COMMENT ON COLUMN public.levantamento_respostas.pergunta IS 'Chave da pergunta (única em todo o painel); imutável.';
COMMENT ON COLUMN public.levantamento_respostas.resposta IS 'Chave da opção escolhida.';

-- ============================================================
-- 10. CONFERIR
-- ============================================================
DO $$
DECLARE
  v_txt  text;
  v_exp  text;
  v_n    int;
BEGIN
  -- 0. Uma só transacção: os cinco bloqueios do início continuam seguros
  --    por esta sessão (senão a migration não estaria em BEGIN/COMMIT).
  SELECT count(DISTINCT l.relation) INTO v_n
  FROM pg_locks l
  WHERE l.pid = pg_backend_pid()
    AND l.locktype = 'relation'
    AND l.granted
    AND l.mode IN ('ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
    AND l.relation IN ('public.anew_organizations'::regclass, 'public.anew_users'::regclass,
                       'public.negocios'::regclass, 'public.anew_entities'::regclass,
                       'public.schedule_items'::regclass);
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'CONFERIR: esperados 5 bloqueios seguros nas tabelas partilhadas, há % (a migration não corre numa só transacção?)', v_n;
  END IF;

  -- 1. RLS ligada nas três tabelas
  SELECT count(*) INTO v_n
  FROM pg_class c
  WHERE c.oid IN ('public.levantamentos'::regclass,
                  'public.levantamento_linhas'::regclass,
                  'public.levantamento_respostas'::regclass)
    AND c.relrowsecurity;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: RLS não está ligada nas três tabelas (% de 3)', v_n;
  END IF;

  -- 2. Políticas (conjunto exacto por tabela)
  SELECT string_agg(p.policyname::text || ':' || p.permissive::text || ':' || p.cmd::text, ','
                    ORDER BY p.policyname::text COLLATE "C")
  INTO v_txt
  FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'levantamentos';
  v_exp := 'levantamentos_insert:PERMISSIVE:INSERT,levantamentos_no_delete:RESTRICTIVE:DELETE,'
        || 'levantamentos_select:PERMISSIVE:SELECT,levantamentos_update:PERMISSIVE:UPDATE,'
        || 'system_admin_pii_default_deny:RESTRICTIVE:ALL';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: políticas de levantamentos inesperadas: %', v_txt;
  END IF;

  SELECT string_agg(p.policyname::text || ':' || p.permissive::text || ':' || p.cmd::text, ','
                    ORDER BY p.policyname::text COLLATE "C")
  INTO v_txt
  FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'levantamento_linhas';
  v_exp := 'levantamento_linhas_delete:PERMISSIVE:DELETE,levantamento_linhas_insert:PERMISSIVE:INSERT,'
        || 'levantamento_linhas_select:PERMISSIVE:SELECT,levantamento_linhas_update:PERMISSIVE:UPDATE,'
        || 'system_admin_pii_default_deny:RESTRICTIVE:ALL';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: políticas de levantamento_linhas inesperadas: %', v_txt;
  END IF;

  SELECT string_agg(p.policyname::text || ':' || p.permissive::text || ':' || p.cmd::text, ','
                    ORDER BY p.policyname::text COLLATE "C")
  INTO v_txt
  FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'levantamento_respostas';
  v_exp := 'levantamento_respostas_delete:PERMISSIVE:DELETE,levantamento_respostas_insert:PERMISSIVE:INSERT,'
        || 'levantamento_respostas_select:PERMISSIVE:SELECT,levantamento_respostas_update:PERMISSIVE:UPDATE,'
        || 'system_admin_pii_default_deny:RESTRICTIVE:ALL';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: políticas de levantamento_respostas inesperadas: %', v_txt;
  END IF;

  -- 3. Cada política com a chave de âmbito certa, e as validações esperadas
  SELECT string_agg(x.falta, ',') INTO v_txt
  FROM (
    SELECT p.tablename::text || '.' || p.policyname::text AS falta
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname IN ('levantamentos_select')
      AND coalesce(p.qual, '') NOT LIKE '%crm_scope_keys(''pessoas.view''::text)%'
    UNION ALL
    SELECT p.tablename::text || '.' || p.policyname::text
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.policyname = 'levantamentos_insert'
      AND (coalesce(p.with_check, '') NOT LIKE '%crm_scope_keys(''pessoas.create''::text)%'
           OR coalesce(p.with_check, '') NOT LIKE '%starts_with(%'
           OR coalesce(p.with_check, '') NOT LIKE '%anew_entity_org_links%'
           OR coalesce(p.with_check, '') NOT LIKE '%anew_memberships%'
           OR coalesce(p.with_check, '') NOT LIKE '%role_is_client IS NOT TRUE%'
           OR coalesce(p.with_check, '') NOT LIKE '%negocio_id IS NULL%')
    UNION ALL
    SELECT p.tablename::text || '.' || p.policyname::text
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.policyname = 'levantamentos_update'
      AND (coalesce(p.qual, '') NOT LIKE '%crm_scope_keys(''pessoas.edit''::text)%'
           OR coalesce(p.with_check, '') NOT LIKE '%crm_scope_keys(''pessoas.edit''::text)%')
    UNION ALL
    -- SELECT dos filhos: pessoas.view e EXISTS ao pai
    SELECT p.tablename::text || '.' || p.policyname::text
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname IN ('levantamento_linhas_select', 'levantamento_respostas_select')
      AND (coalesce(p.qual, '') NOT LIKE '%has_anew_permission(( SELECT auth.uid() AS uid), ''pessoas.view''::text)%'
           OR coalesce(p.qual, '') NOT LIKE '%organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid))%'
           OR coalesce(p.qual, '') NOT LIKE '%FROM levantamentos l%')
    UNION ALL
    -- Escrita dos filhos: pessoas.edit (permissão e chave) e EXISTS ao pai,
    -- em USING e/ou WITH CHECK conforme o comando
    SELECT p.tablename::text || '.' || p.policyname::text
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname IN ('levantamento_linhas_insert', 'levantamento_linhas_update', 'levantamento_linhas_delete',
                           'levantamento_respostas_insert', 'levantamento_respostas_update', 'levantamento_respostas_delete')
      AND (
        (p.cmd::text IN ('UPDATE', 'DELETE')
          AND (coalesce(p.qual, '') NOT LIKE '%has_anew_permission(( SELECT auth.uid() AS uid), ''pessoas.edit''::text)%'
               OR coalesce(p.qual, '') NOT LIKE '%crm_scope_keys(''pessoas.edit''::text)%'
               OR coalesce(p.qual, '') NOT LIKE '%organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid))%'
               OR coalesce(p.qual, '') NOT LIKE '%FROM levantamentos l%'))
        OR
        (p.cmd::text IN ('INSERT', 'UPDATE')
          AND (coalesce(p.with_check, '') NOT LIKE '%has_anew_permission(( SELECT auth.uid() AS uid), ''pessoas.edit''::text)%'
               OR coalesce(p.with_check, '') NOT LIKE '%crm_scope_keys(''pessoas.edit''::text)%'
               OR coalesce(p.with_check, '') NOT LIKE '%organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid))%'
               OR coalesce(p.with_check, '') NOT LIKE '%FROM levantamentos l%'))
      )
    UNION ALL
    -- O UPDATE do pai não valida pessoa nem quem fez (ficam no trigger)
    SELECT p.tablename::text || '.' || p.policyname::text || '(valida_ligacoes)'
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.policyname = 'levantamentos_update'
      AND (coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%anew_entity_org_links%'
           OR coalesce(p.qual, '') || coalesce(p.with_check, '') LIKE '%anew_memberships%')
  ) x;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: políticas sem a chave de âmbito ou a validação esperada: %', v_txt;
  END IF;

  -- 4. Nenhuma política com auth.uid() fora de (SELECT auth.uid())
  SELECT string_agg(p.tablename::text || '.' || p.policyname::text, ',')
  INTO v_txt
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN ('levantamentos', 'levantamento_linhas', 'levantamento_respostas')
    AND replace(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
                '( SELECT auth.uid() AS uid)', '') LIKE '%auth.uid()%';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: auth.uid() sem SELECT em: %', v_txt;
  END IF;

  -- 5. Colunas exactas e tipos
  SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' ORDER BY a.attnum)
  INTO v_txt
  FROM pg_attribute a
  WHERE a.attrelid = 'public.levantamentos'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  v_exp := 'id:uuid:true,organization_id:uuid:true,root_organization_id:uuid:true,entity_id:uuid:true,'
        || 'visita_id:uuid:false,negocio_id:uuid:false,feito_por:uuid:false,'
        || 'data_levantamento:date:true,estado:text:true,notas:text:false,'
        || 'morada_rua:text:false,morada_codigo_postal:text:false,morada_localidade:text:false,morada_andar:text:false,'
        || 'created_by:uuid:false,created_at:timestamp with time zone:true,'
        || 'updated_at:timestamp with time zone:true,deleted_at:timestamp with time zone:false,'
        || 'deleted_by:uuid:false';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: colunas de levantamentos inesperadas: %', v_txt;
  END IF;

  SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' ORDER BY a.attnum)
  INTO v_txt
  FROM pg_attribute a
  WHERE a.attrelid = 'public.levantamento_linhas'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  v_exp := 'id:uuid:true,levantamento_id:uuid:true,organization_id:uuid:true,'
        || 'divisao:text:true,trabalho:text:true,trabalho_outro:text:false,'
        || 'medida:numeric(12,3):true,unidade:text:true,observacoes:text:false,ordem:integer:true,'
        || 'created_at:timestamp with time zone:true,updated_at:timestamp with time zone:true';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: colunas de levantamento_linhas inesperadas: %', v_txt;
  END IF;

  SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' ORDER BY a.attnum)
  INTO v_txt
  FROM pg_attribute a
  WHERE a.attrelid = 'public.levantamento_respostas'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  v_exp := 'id:uuid:true,levantamento_id:uuid:true,organization_id:uuid:true,'
        || 'seccao:text:true,pergunta:text:true,resposta:text:true,'
        || 'created_at:timestamp with time zone:true,updated_at:timestamp with time zone:true';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: colunas de levantamento_respostas inesperadas: %', v_txt;
  END IF;

  -- 6. Chaves estrangeiras: coluna, alvo (relname) e acção ("char" -> text).
  --    Utilizadores, visita e negócio: SET NULL (n) — é desse UPDATE interno
  --    que o trigger deixa passar a mudança para NULL. Pessoa e organização:
  --    RESTRICT (r). Filhos: CASCADE (c) para o pai.
  SELECT string_agg(a.attname::text || '>' || t.relname::text || ':' || c.confdeltype::text, ','
                    ORDER BY a.attname::text COLLATE "C")
  INTO v_txt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class t ON t.oid = c.confrelid
  WHERE c.conrelid = 'public.levantamentos'::regclass AND c.contype::text = 'f';
  v_exp := 'created_by>anew_users:n,deleted_by>anew_users:n,entity_id>anew_entities:r,'
        || 'feito_por>anew_users:n,negocio_id>negocios:n,organization_id>anew_organizations:r,'
        || 'root_organization_id>anew_organizations:a,visita_id>schedule_items:n';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: chaves estrangeiras de levantamentos inesperadas: %', v_txt;
  END IF;

  SELECT string_agg(t2.relname::text || '.' || a.attname::text || '>' || t.relname::text || ':' || c.confdeltype::text, ','
                    ORDER BY t2.relname::text COLLATE "C", a.attname::text COLLATE "C")
  INTO v_txt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class t ON t.oid = c.confrelid
  JOIN pg_class t2 ON t2.oid = c.conrelid
  WHERE c.conrelid IN ('public.levantamento_linhas'::regclass, 'public.levantamento_respostas'::regclass)
    AND c.contype::text = 'f';
  v_exp := 'levantamento_linhas.levantamento_id>levantamentos:c,'
        || 'levantamento_linhas.organization_id>anew_organizations:r,'
        || 'levantamento_respostas.levantamento_id>levantamentos:c,'
        || 'levantamento_respostas.organization_id>anew_organizations:r';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: chaves estrangeiras dos filhos inesperadas: %', v_txt;
  END IF;

  -- 7. CHECKs presentes e validados (lista exacta)
  SELECT string_agg(c.conname::text, ',' ORDER BY c.conname::text COLLATE "C")
  INTO v_txt
  FROM pg_constraint c
  WHERE c.conrelid IN ('public.levantamentos'::regclass,
                       'public.levantamento_linhas'::regclass,
                       'public.levantamento_respostas'::regclass)
    AND c.contype::text = 'c' AND c.convalidated;
  v_exp := 'levantamento_linhas_divisao_check,levantamento_linhas_medida_check,'
        || 'levantamento_linhas_observacoes_check,levantamento_linhas_ordem_check,'
        || 'levantamento_linhas_trabalho_check,levantamento_linhas_trabalho_outro_check,'
        || 'levantamento_linhas_unidade_check,'
        || 'levantamento_respostas_pergunta_check,levantamento_respostas_resposta_check,'
        || 'levantamento_respostas_seccao_check,'
        || 'levantamentos_data_check,levantamentos_estado_check,levantamentos_lixo_coerente,'
        || 'levantamentos_morada_andar_check,levantamentos_morada_codigo_postal_check,'
        || 'levantamentos_morada_localidade_check,levantamentos_morada_rua_check,'
        || 'levantamentos_notas_check';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: CHECKs inesperados: %', v_txt;
  END IF;

  -- 7c. Os CHECKs que dizem as regras conferidos pela expressão
  SELECT string_agg(c.conname::text, ',' ORDER BY c.conname::text COLLATE "C")
  INTO v_txt
  FROM pg_constraint c
  WHERE c.contype::text = 'c'
    AND (
      (c.conrelid = 'public.levantamentos'::regclass AND c.conname = 'levantamentos_estado_check'
        AND pg_get_constraintdef(c.oid) <> 'CHECK ((estado = ANY (ARRAY[''por_fazer''::text, ''feito''::text])))')
      OR (c.conrelid = 'public.levantamentos'::regclass AND c.conname = 'levantamentos_lixo_coerente'
        AND pg_get_constraintdef(c.oid) <> 'CHECK (((deleted_at IS NULL) OR (negocio_id IS NULL)))')
      OR (c.conrelid = 'public.levantamento_linhas'::regclass AND c.conname = 'levantamento_linhas_unidade_check'
        AND pg_get_constraintdef(c.oid) <> 'CHECK ((unidade = ANY (ARRAY[''m2''::text, ''m''::text, ''un''::text])))')
      OR (c.conrelid = 'public.levantamento_respostas'::regclass AND c.conname = 'levantamento_respostas_seccao_check'
        AND pg_get_constraintdef(c.oid) NOT LIKE '%''exterior''::text, ''interior''::text, ''area''::text, ''necessidades''::text, ''escolhas''::text%')
    );
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: CHECKs com expressão inesperada: %', v_txt;
  END IF;

  -- 7b. UNIQUE (um levantamento por negócio; uma resposta por pergunta)
  SELECT string_agg(c.conname::text, ',' ORDER BY c.conname::text COLLATE "C")
  INTO v_txt
  FROM pg_constraint c
  WHERE c.conrelid IN ('public.levantamentos'::regclass,
                       'public.levantamento_linhas'::regclass,
                       'public.levantamento_respostas'::regclass)
    AND c.contype::text = 'u';
  IF v_txt IS DISTINCT FROM 'levantamento_respostas_levantamento_pergunta_key,levantamentos_negocio_id_key' THEN
    RAISE EXCEPTION 'CONFERIR: restrições UNIQUE inesperadas: %', v_txt;
  END IF;

  -- 8. Índices: os nomeados existem; só o do lixo é parcial; cada chave
  --    estrangeira tem um índice NÃO parcial que começa por essa coluna.
  SELECT count(*) INTO v_n
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.indexname IN ('idx_levantamentos_org_data', 'idx_levantamentos_entity_org',
                        'levantamentos_negocio_id_key', 'idx_levantamentos_visita_id',
                        'idx_levantamentos_lixo', 'idx_levantamentos_root_organization_id',
                        'idx_levantamentos_feito_por', 'idx_levantamentos_created_by',
                        'idx_levantamentos_deleted_by',
                        'idx_levantamento_linhas_levantamento', 'idx_levantamento_linhas_organization_id',
                        'levantamento_respostas_levantamento_pergunta_key',
                        'idx_levantamento_respostas_organization_id');
  IF v_n <> 13 THEN
    RAISE EXCEPTION 'CONFERIR: faltam índices (% de 13)', v_n;
  END IF;

  SELECT string_agg(ic.relname::text, ',' ORDER BY ic.relname::text COLLATE "C")
  INTO v_txt
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  WHERE i.indrelid IN ('public.levantamentos'::regclass,
                       'public.levantamento_linhas'::regclass,
                       'public.levantamento_respostas'::regclass)
    AND i.indpred IS NOT NULL;
  IF v_txt IS DISTINCT FROM 'idx_levantamentos_lixo' THEN
    RAISE EXCEPTION 'CONFERIR: índices parciais inesperados: %', v_txt;
  END IF;

  SELECT string_agg(t.relname::text || '.' || a.attname::text, ',')
  INTO v_txt
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE c.conrelid IN ('public.levantamentos'::regclass,
                       'public.levantamento_linhas'::regclass,
                       'public.levantamento_respostas'::regclass)
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

  SELECT string_agg(ic.relname::text, ',' ORDER BY ic.relname::text COLLATE "C")
  INTO v_txt
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  WHERE ic.relname IN ('levantamentos_negocio_id_key', 'levantamento_respostas_levantamento_pergunta_key')
    AND NOT i.indisunique;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: índices que deviam ser UNIQUE: %', v_txt;
  END IF;

  -- 9. Triggers (conjunto exacto, ligados, função certa)
  SELECT string_agg(c.relname::text || '.' || t.tgname::text || ':' || p.proname::text || ':' || t.tgenabled::text, ','
                    ORDER BY c.relname::text COLLATE "C", t.tgname::text COLLATE "C")
  INTO v_txt
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE t.tgrelid IN ('public.levantamentos'::regclass,
                      'public.levantamento_linhas'::regclass,
                      'public.levantamento_respostas'::regclass)
    AND NOT t.tgisinternal;
  v_exp := 'levantamento_linhas.trg_00_levantamento_linhas_guardar:fn_levantamento_linhas_guardar:O,'
        || 'levantamento_linhas.trg_levantamento_linhas_updated_at:update_updated_at_column:O,'
        || 'levantamento_respostas.trg_00_levantamento_respostas_guardar:fn_levantamento_respostas_guardar:O,'
        || 'levantamento_respostas.trg_levantamento_respostas_updated_at:update_updated_at_column:O,'
        || 'levantamentos.trg_00_levantamentos_guardar_alteracao:fn_levantamentos_guardar_alteracao:O,'
        || 'levantamentos.trg_00_levantamentos_preparar_insercao:fn_levantamentos_preparar_insercao:O,'
        || 'levantamentos.trg_levantamentos_updated_at:update_updated_at_column:O';
  IF v_txt IS DISTINCT FROM v_exp THEN
    RAISE EXCEPTION 'CONFERIR: triggers inesperados: %', v_txt;
  END IF;

  -- Nenhuma auditoria genérica nem auto_assign_creator nas tabelas novas
  SELECT string_agg(t.tgname::text || ':' || p.proname::text, ',')
  INTO v_txt
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid IN ('public.levantamentos'::regclass,
                      'public.levantamento_linhas'::regclass,
                      'public.levantamento_respostas'::regclass)
    AND (p.proname LIKE '%audit%' OR p.proname = 'auto_assign_creator');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: há auditoria genérica ou auto_assign_creator nas tabelas novas: %', v_txt;
  END IF;

  -- Momento e eventos dos triggers que guardam as regras
  SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text COLLATE "C")
  INTO v_txt
  FROM pg_trigger t
  WHERE t.tgrelid IN ('public.levantamentos'::regclass,
                      'public.levantamento_linhas'::regclass,
                      'public.levantamento_respostas'::regclass)
    AND NOT t.tgisinternal
    AND (
      (t.tgname = 'trg_00_levantamentos_preparar_insercao'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%BEFORE INSERT ON public.levantamentos FOR EACH ROW%')
      OR (t.tgname = 'trg_00_levantamentos_guardar_alteracao'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%BEFORE UPDATE ON public.levantamentos FOR EACH ROW%')
      OR (t.tgname = 'trg_00_levantamento_linhas_guardar'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%BEFORE INSERT OR DELETE OR UPDATE ON public.levantamento_linhas FOR EACH ROW%')
      OR (t.tgname = 'trg_00_levantamento_respostas_guardar'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%BEFORE INSERT OR DELETE OR UPDATE ON public.levantamento_respostas FOR EACH ROW%')
      OR (t.tgname LIKE '%updated_at'
        AND pg_get_triggerdef(t.oid) NOT LIKE '%BEFORE UPDATE ON public.levantament% FOR EACH ROW%')
    );
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: triggers com momento ou eventos errados: %', v_txt;
  END IF;

  -- 10. Funções novas: SECURITY DEFINER com search_path fixo, e não
  --     executáveis por anon/authenticated
  SELECT string_agg(e.sig, ',')
  INTO v_txt
  FROM (VALUES
    ('public.fn_levantamentos_ref_desaparecida(text,uuid,uuid)'),
    ('public.fn_levantamentos_exigir_organizacao(uuid)'),
    ('public.fn_levantamentos_exigir_permissao_lixo(uuid,uuid,uuid)'),
    ('public.fn_levantamentos_validar_ligacoes(uuid,uuid,uuid,uuid,uuid)'),
    ('public.fn_levantamentos_preparar_insercao()'),
    ('public.fn_levantamentos_guardar_alteracao()'),
    ('public.fn_levantamento_filhos_pai(uuid,boolean)'),
    ('public.fn_levantamento_linhas_guardar()'),
    ('public.fn_levantamento_respostas_guardar()')
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

  SELECT count(*) INTO v_n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname LIKE 'fn\_levantamento%';
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'CONFERIR: esperadas 9 funções fn_levantamento*, há %', v_n;
  END IF;

  -- 10b. As guardas estão no corpo das funções que correm antes da RLS:
  --      guarda de organização em validar_ligacoes, preparar_insercao e
  --      filhos_pai (antes do FOR SHARE); recusa de negocio_id no INSERT;
  --      acesso ao negócio, serialização e role_is_client na validação.
  SELECT string_agg(x.falta, ',') INTO v_txt
  FROM (
    SELECT 'validar_ligacoes' AS falta FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.fn_levantamentos_validar_ligacoes(uuid,uuid,uuid,uuid,uuid)')
       AND (p.prosrc NOT LIKE '%fn_levantamentos_exigir_organizacao(p_organization_id)%'
            OR p.prosrc NOT LIKE '%crm_scope_keys(''pessoas.edit'')%'
            OR p.prosrc NOT LIKE '%pg_advisory_xact_lock(%'
            OR p.prosrc NOT LIKE '%role_is_client IS NOT TRUE%'
            OR p.prosrc NOT LIKE '%time_off_type IS NOT NULL%')
    UNION ALL
    SELECT 'preparar_insercao' FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.fn_levantamentos_preparar_insercao()')
       AND (p.prosrc NOT LIKE '%fn_levantamentos_exigir_organizacao(NEW.organization_id)%'
            OR p.prosrc NOT LIKE '%IF NEW.negocio_id IS NOT NULL THEN%')
    UNION ALL
    SELECT 'filhos_pai' FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.fn_levantamento_filhos_pai(uuid,boolean)')
       AND (p.prosrc NOT LIKE '%fn_levantamentos_exigir_organizacao(v_org)%FOR SHARE%')
  ) x;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: guardas em falta no corpo de: %', v_txt;
  END IF;

  SELECT string_agg(p.proname::text, ',')
  INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname LIKE 'fn\_levantamento%'
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funções novas executáveis por anon/authenticated: %', v_txt;
  END IF;

  -- 11. Privilégios
  IF has_table_privilege('anon', 'public.levantamentos', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.levantamento_linhas', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.levantamento_respostas', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'CONFERIR: anon tem privilégios numa das tabelas novas';
  END IF;
  IF NOT (has_table_privilege('authenticated', 'public.levantamentos', 'SELECT')
          AND has_table_privilege('authenticated', 'public.levantamentos', 'INSERT')
          AND has_table_privilege('authenticated', 'public.levantamentos', 'UPDATE')) THEN
    RAISE EXCEPTION 'CONFERIR: authenticated sem SELECT/INSERT/UPDATE em levantamentos';
  END IF;
  IF has_table_privilege('authenticated', 'public.levantamentos', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated tem DELETE/TRUNCATE/REFERENCES/TRIGGER em levantamentos';
  END IF;
  IF NOT (has_table_privilege('authenticated', 'public.levantamento_linhas', 'SELECT')
          AND has_table_privilege('authenticated', 'public.levantamento_linhas', 'INSERT')
          AND has_table_privilege('authenticated', 'public.levantamento_linhas', 'UPDATE')
          AND has_table_privilege('authenticated', 'public.levantamento_linhas', 'DELETE')
          AND has_table_privilege('authenticated', 'public.levantamento_respostas', 'SELECT')
          AND has_table_privilege('authenticated', 'public.levantamento_respostas', 'INSERT')
          AND has_table_privilege('authenticated', 'public.levantamento_respostas', 'UPDATE')
          AND has_table_privilege('authenticated', 'public.levantamento_respostas', 'DELETE')) THEN
    RAISE EXCEPTION 'CONFERIR: authenticated sem SELECT/INSERT/UPDATE/DELETE nas tabelas-filhas';
  END IF;
  IF has_table_privilege('authenticated', 'public.levantamento_linhas', 'TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.levantamento_respostas', 'TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated tem TRUNCATE/REFERENCES/TRIGGER nas tabelas-filhas';
  END IF;

  -- 12. (Sem verificação de permissões: esta migration não tem nenhum
  --     INSERT/UPDATE/DELETE a tabelas existentes, o que se confirma por
  --     leitura; uma contagem antes/depois não podia falhar.)

  -- 13. Funções existentes reutilizadas continuam iguais (md5 lido a 18/10)
  SELECT string_agg(e.sig, ',')
  INTO v_txt
  FROM (VALUES
    ('public.update_updated_at_column()',                      'fc99e666cd1ddb90d5c5e86357e5d57e'),
    ('public.resolve_root_organization_id(uuid)',              '0fd01d82d04202e94fecbc638af746a0'),
    ('public.current_business_user_id()',                      '7e60101f074e4ff526559140be6618bb'),
    ('public.crm_scope_keys(text)',                            '6abb12e1d7a3db943630e8f8d7e15ca8'),
    ('public.has_anew_permission(uuid,text)',                  '8f69ed134c7d20e080d8c5a4161a3151'),
    ('public.get_user_crm_org_ids(uuid)',                      '29782031244dd3b0842ca43b271e2bf1'),
    ('public.is_system_admin(uuid)',                           '159035010036f0045b091808cf9f77ef'),
    ('public.has_active_support_access(uuid)',                 '6d8f902ee9fc7a59e4397412b2c121a0'),
    ('public.fn_negocios_actor()',                             '26296535afef27c393ab0c932995e3cb'),
    ('public.fn_negocios_ref_utilizador_apagado(uuid,uuid)',   '6e45bfff81ab95e812b44d126cc3d75a')
  ) AS e(sig, md5_esperado)
  WHERE to_regprocedure(e.sig) IS NULL
     OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.md5_esperado;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funções reutilizadas em falta ou mudadas desde a leitura: %', v_txt;
  END IF;
END;
$$;

COMMIT;

RESET lock_timeout;
RESET statement_timeout;
