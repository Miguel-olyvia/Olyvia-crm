-- ==============================================================================
-- 20261231993000_denuncias_tabelas  (RASCUNHO -- nao aplicar sem decisao)
-- ==============================================================================
-- Base: RH (uetjghdkwbywbftedtth). Desenho: supabase/rascunhos/DESENHO-denuncias.md,
-- com as correccoes da revisao de 28/10 (achados HIGH) indicadas abaixo.
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- Cria o modelo de dados do canal de denuncias, TODO FECHADO a anon,
-- authenticated e service_role: RLS ligada, politicas RESTRICTIVE block_* nas
-- quatro operacoes e REVOKE ALL (tabelas e sequencias). Nada se le nem escreve
-- por PostgREST: tudo passa pelas RPCs SECURITY DEFINER de 20261231994000.
-- Como nao ha GRANT nenhum, nao ha concessao por coluna para manter.
--
--   denuncias_canal           configuracao por organizacao: ativo, slug_publico
--                             (o ?org= da pagina publica), contador do codigo.
--   denuncias_responsaveis    quem trata os casos (designacao explicita).
--   denuncias                 o caso, SEM identidade e SEM PIN.
--   denuncias_acesso          1:1, so o HMAC do PIN, tentativas, bloqueio e o
--                             hash da sessao de acompanhamento.
--   denuncias_identidade      so denuncias identificadas (gatilho recusa numa
--                             anonima, HRD20).
--   denuncias_mensagens       conversa canal <-> denunciante (so acrescenta).
--   denuncias_notas           notas internas (so acrescenta; nenhuma RPC publica
--                             le esta tabela).
--   denuncias_eventos         historico e registo de acessos a identidade
--                             (identidade_vista com motivo); so acrescenta.
--   denuncias_impedidos       visados e conflitos; nunca se apaga, retira-se
--                             (retirado_em) e so o 'visado' registado por um
--                             responsavel.
--   denuncias_canal_auditoria auditoria de ORGANIZACAO (achados HIGH de conflito
--                             e de escalada): designacoes, remocoes, alteracoes
--                             do canal, visados registados por terceiros,
--                             impedimentos retirados e auto-atribuicoes. Le-se
--                             por RPC a todos os responsaveis e a quem configura.
--   denuncias_limites         limite de pedidos da Edge publica, AGREGADO por
--                             hora (achados HIGH de limite e de anonimato): uma
--                             contagem por (balde, chave, hora), sem a hora
--                             exacta de cada pedido e sem ligacao a denuncia
--                             nenhuma. Substitui rate_limit_attempts para o canal.
--                             Baldes: criar, entrar (por IP e por organizacao),
--                             canal e sessao (por IP e global).
--   denuncias_reservas        codigos reservados pela Edge entre "reservar" e
--                             "criar" (revisao de 28/10, HIGH do limite): a
--                             criacao so aceita um codigo com reserva viva e o
--                             mesmo nonce, e apaga-a na mesma transaccao. So a
--                             hora truncada; nenhuma linha sobrevive a criacao.
--
-- Funcoes desta migration (todas com search_path fixo e SEM EXECUTE para
-- PUBLIC, anon, authenticated nem service_role; so o dono as corre):
--   denuncias_hoje()                    a data de hoje em Europe/Lisbon.
--   denuncias_elegiveis(uuid)           responsaveis activos COM denuncias.gerir
--                                       (e a data de designacao). Definicao
--                                       UNICA de "quem pode tratar".
--   denuncias_regras()                  gatilho do caso: transicoes, imutaveis,
--                                       responsavel elegivel e nao impedido.
--   denuncias_identidade_regras()       gatilho: nunca numa anonima, imutavel.
--   denuncias_impedidos_regras()        gatilho: so se retira, uma vez.
--   denuncias_so_acrescenta()           gatilho das tabelas de historico.
--   denuncias_sem_truncate()            gatilho TRUNCATE das tabelas do canal.
--
-- -- CORRECCOES DA REVISAO (28/10) QUE VIVEM AQUI -----------------------------
--
-- * ANONIMATO: recebida_em e uma DATA (Europe/Lisbon), nao um instante; nao ha
--   criada_em/atualizada_em no caso. As RPCs gravam ao dia os instantes do lado
--   do denunciante numa anonima (evento 'recebida', mensagens e eventos de
--   resposta); a ordem da conversa vem de uma coluna seq (identidade), nao do
--   relogio. denuncias_limites so guarda a hora truncada e uma contagem.
--   Fica de fora da base (e vai ao juridico): registos de plataforma (Supabase,
--   alojamento do frontend) com IP e hora de cada pedido.
-- * CONFLITO / ESCALADA: impedimentos retiraveis so pelo configurador e so os
--   'visado' registados por um responsavel; tudo na auditoria de organizacao.
--   A data de designacao (desde) entra em denuncias_elegiveis para as RPCs so
--   mostrarem a um responsavel novo os casos recebidos depois da designacao
--   (os anteriores so se lhos atribuirem).
-- * ANEXOS: FICAM DE FORA desta entrega (fase 1 sem anexos, D7 e achado HIGH de
--   metadados em PDF/EXIF). Nao ha tabela de anexos nem buckets aqui.
--
-- -- CODIGO QUE TEM DE ENTRAR COM ESTA MIGRATION -------------------------------
--
-- Nenhum: as tabelas ficam vazias e fechadas; a UI continua em memoria ate ao
-- cliente novo (passo 4 do desenho). Aplicar SEMPRE no mesmo push que
-- 20261231994000: sozinha nao faz mal, mas tambem nao serve para nada.
--
-- -- ORDEM DE PUBLICACAO -------------------------------------------------------
--
-- 20261231992000 (permissoes) -> ESTA -> 20261231994000 (RPCs) -> segredos e
-- Edge canal-denuncias -> cliente. Testes (TESTE-denuncias.sql) ANTES do push,
-- dentro de BEGIN ... ROLLBACK, contra o remoto ainda sem nada disto.
--
-- -- NOTAS ---------------------------------------------------------------------
--
-- * As FKs para anew_users sao NO ACTION: os utilizadores apagam-se por
--   deleted_at nesta base; um DELETE fisico de quem tratou denuncias falha, de
--   proposito (o historico tem de manter quem fez o que).
-- * A conservacao de 5 anos (apagar casos com conservar_ate < hoje) e uma RPC de
--   20261231994000 sem GRANT e sem job: as tabelas de historico so deixam apagar
--   com o parametro de transaccao denuncias.conservacao = 'on', que so essa
--   funcao poe. A confirmar com o juridico (prazo, suspensao, o que se apaga).
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- So com as tabelas vazias e numa migration nova: DROP das 12 tabelas (ordem
-- inversa) e das 7 funcoes. Sem ficheiro de reversao na pasta, de proposito.
--
-- Prerequisitos:
--   20261231992000  denuncias.gerir / denuncias.configurar no catalogo
--   has_anew_permission_in_org(uuid, text, uuid), pessoas (id, organization_id)
-- ==============================================================================

SET LOCAL lock_timeout = '3s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname ILIKE '%denunc%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ja existem % objecto(s) de denuncias em public (tabelas, indices ou vistas). Investigar.', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname ILIKE '%denunc%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ja existem % funcao(oes) de denuncias em public. Investigar.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_permissions p
   WHERE p.code IN ('denuncias.gerir', 'denuncias.configurar') AND p.is_dangerous = true;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'denuncias.gerir/configurar nao estao no catalogo como perigosas. Aplicar 20261231992000 primeiro.';
  END IF;

  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas')
                    AND conname = 'pessoas_id_org_key' AND contype::text = 'u') THEN
    RAISE EXCEPTION 'pessoas nao tem UNIQUE (id, organization_id) (pessoas_id_org_key): a FK composta da identidade falharia.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.anew_users')
     AND attname IN ('id', 'auth_user_id', 'name', 'email', 'deleted_at') AND NOT attisdropped;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'anew_users nao tem id, auth_user_id, name, email e deleted_at (encontradas %).', v_n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = 'Europe/Lisbon') THEN
    RAISE EXCEPTION 'O fuso Europe/Lisbon nao existe nesta base.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Funcoes de apoio que os gatilhos usam
-- ==============================================================================

CREATE FUNCTION public.denuncias_hoje()
RETURNS date
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date
$$;

COMMENT ON FUNCTION public.denuncias_hoje() IS
'INTERNA: a data de hoje em Europe/Lisbon. Usada para recebida_em, prazos e conservar_ate. Desde 20261231993000.';

-- ==============================================================================
-- 2. Tabelas
-- ==============================================================================

-- 2.1 Configuracao por organizacao
CREATE TABLE public.denuncias_canal (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations (id),
  ativo           boolean NOT NULL DEFAULT false,
  slug_publico    text NOT NULL,
  ultimo_ano      integer,
  ultimo_numero   integer NOT NULL DEFAULT 0,
  atualizado_por  uuid REFERENCES public.anew_users (id),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_canal_slug_formato CHECK (slug_publico ~ '^[a-z0-9]([a-z0-9-]{2,38})[a-z0-9]$'),
  CONSTRAINT denuncias_canal_slug_unico UNIQUE (slug_publico),
  CONSTRAINT denuncias_canal_contador CHECK (ultimo_numero >= 0 AND (ultimo_ano IS NULL OR ultimo_ano BETWEEN 2020 AND 2200))
);

COMMENT ON TABLE public.denuncias_canal IS
'Canal de denuncias: uma linha por organizacao. ativo = a pagina publica aceita denuncias; slug_publico = o ?org= da pagina; ultimo_ano/ultimo_numero = contador do codigo DEN-AAAA-NNNN (transaccional, por organizacao e ano). Fechada a anon/authenticated/service_role: so por RPC. Desde 20261231993000.';

-- 2.2 Responsaveis do canal
CREATE TABLE public.denuncias_responsaveis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations (id),
  anew_user_id    uuid NOT NULL REFERENCES public.anew_users (id),
  ativo           boolean NOT NULL DEFAULT true,
  designado_por   uuid REFERENCES public.anew_users (id),
  designado_em    timestamptz NOT NULL DEFAULT now(),
  removido_por    uuid REFERENCES public.anew_users (id),
  removido_em     timestamptz,
  CONSTRAINT denuncias_responsaveis_unico UNIQUE (organization_id, anew_user_id),
  CONSTRAINT denuncias_responsaveis_remocao_coerente CHECK (ativo = (removido_em IS NULL))
);

CREATE INDEX idx_denuncias_responsaveis_user ON public.denuncias_responsaveis (anew_user_id);

COMMENT ON TABLE public.denuncias_responsaveis IS
'Quem trata os casos do canal. Tratar exige linha activa AQUI e a permissao denuncias.gerir (denuncias_elegiveis). Remover = ativo false. Voltar a designar repoe designado_em: um responsavel so ve, na fila, casos recebidos desde a designacao (os anteriores so se lhos atribuirem). Desde 20261231993000.';

-- 2.3 O caso
CREATE TABLE public.denuncias (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.anew_organizations (id),
  codigo             text NOT NULL,
  anonima            boolean NOT NULL DEFAULT true,
  origem             text NOT NULL,
  tipo               text NOT NULL,
  descricao          text NOT NULL,
  resumo             text NOT NULL,
  quando             text NOT NULL,
  onde               text,
  envolvidos         text,
  ainda_acontece     text NOT NULL DEFAULT 'nao_sei',
  testemunhas        text NOT NULL DEFAULT 'nao_sei',
  ja_reportado       text,
  boa_fe             boolean NOT NULL,
  estado             text NOT NULL DEFAULT 'recebida',
  gravidade          text NOT NULL DEFAULT 'media',
  avaliacao_inicial  text,
  responsavel_id     uuid REFERENCES public.anew_users (id),
  recebida_em        date NOT NULL DEFAULT public.denuncias_hoje(),
  prazo_confirmar    date NOT NULL,
  prazo_seguimento   date NOT NULL,
  confirmada_em      timestamptz,
  resultado          text,
  medidas            text,
  fundamentacao      text,
  decidida_em        timestamptz,
  motivo_arquivo     text,
  fechada_em         timestamptz,
  conservar_ate      date,
  CONSTRAINT denuncias_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT denuncias_codigo_unico UNIQUE (organization_id, codigo),
  CONSTRAINT denuncias_codigo_formato CHECK (codigo ~ '^DEN-[0-9]{4}-[0-9]{4,6}$'),
  CONSTRAINT denuncias_origem_valida CHECK (origem IN ('publica', 'aplicacao')),
  CONSTRAINT denuncias_tipo_valido CHECK (tipo IN ('assedio', 'discriminacao', 'corrupcao', 'fraude',
                                                   'seguranca', 'dados', 'conflito', 'outro')),
  CONSTRAINT denuncias_descricao_tamanho CHECK (length(btrim(descricao)) BETWEEN 30 AND 4000),
  CONSTRAINT denuncias_resumo_tamanho CHECK (length(resumo) <= 200),
  CONSTRAINT denuncias_quando_tamanho CHECK (length(btrim(quando)) BETWEEN 2 AND 200),
  CONSTRAINT denuncias_textos_tamanho CHECK (
        (onde IS NULL OR length(onde) <= 1000)
    AND (envolvidos IS NULL OR length(envolvidos) <= 1000)
    AND (ja_reportado IS NULL OR length(ja_reportado) <= 1000)
    AND (avaliacao_inicial IS NULL OR length(avaliacao_inicial) <= 2000)
    AND (medidas IS NULL OR length(medidas) <= 4000)
    AND (fundamentacao IS NULL OR length(fundamentacao) <= 4000)
    AND (motivo_arquivo IS NULL OR length(motivo_arquivo) <= 2000)),
  CONSTRAINT denuncias_sim_nao CHECK (ainda_acontece IN ('sim', 'nao', 'nao_sei')
                                      AND testemunhas IN ('sim', 'nao', 'nao_sei')),
  CONSTRAINT denuncias_boa_fe CHECK (boa_fe),
  CONSTRAINT denuncias_estado_valido CHECK (estado IN ('recebida', 'em_analise', 'mais_info', 'concluida', 'arquivada')),
  CONSTRAINT denuncias_gravidade_valida CHECK (gravidade IN ('baixa', 'media', 'alta')),
  CONSTRAINT denuncias_resultado_valido CHECK (resultado IS NULL OR resultado IN
                                               ('procedente', 'parcialmente_procedente', 'improcedente', 'sem_competencia')),
  -- Prazos gravados na criacao (Lei 93/2021, a confirmar com o juridico): 7 dias
  -- corridos para confirmar a rececao e 3 meses de calendario para o seguimento,
  -- ambos contados da rececao (como prazos.ts).
  CONSTRAINT denuncias_prazos CHECK (prazo_confirmar = recebida_em + 7
                                     AND prazo_seguimento = (recebida_em + interval '3 months')::date),
  CONSTRAINT denuncias_concluida_coerente CHECK (
    (estado = 'concluida') = (resultado IS NOT NULL AND decidida_em IS NOT NULL
                              AND fundamentacao IS NOT NULL AND length(btrim(fundamentacao)) >= 1)),
  CONSTRAINT denuncias_arquivada_coerente CHECK (
    (estado = 'arquivada') = (motivo_arquivo IS NOT NULL AND length(btrim(motivo_arquivo)) >= 3)),
  CONSTRAINT denuncias_fechada_coerente CHECK (
    (estado IN ('concluida', 'arquivada')) = (fechada_em IS NOT NULL AND conservar_ate IS NOT NULL)),
  CONSTRAINT denuncias_confirmada_antes CHECK (
    estado NOT IN ('em_analise', 'mais_info', 'concluida') OR confirmada_em IS NOT NULL)
);

CREATE INDEX idx_denuncias_org_estado ON public.denuncias (organization_id, estado, recebida_em);
CREATE INDEX idx_denuncias_org_responsavel ON public.denuncias (organization_id, responsavel_id);
CREATE INDEX idx_denuncias_responsavel ON public.denuncias (responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX idx_denuncias_conservar ON public.denuncias (conservar_ate) WHERE conservar_ate IS NOT NULL;

COMMENT ON TABLE public.denuncias IS
'O caso do canal de denuncias, sem identidade (denuncias_identidade) e sem PIN (denuncias_acesso). recebida_em e uma DATA de proposito (anonimato: sem instante de chegada). Os campos do relato sao imutaveis (gatilho denuncias_regras). Fechada a anon/authenticated/service_role: so por RPC. Desde 20261231993000.';
COMMENT ON COLUMN public.denuncias.conservar_ate IS
'fechada_em (data de Lisboa) + 5 anos; reabrir limpa-o. A conservacao (apagar depois desta data) so corre por rpc_denuncias_conservacao_executar, sem job ate decisao e parecer juridico.';

-- 2.4 Segredo e sessao do acompanhamento (1:1)
CREATE TABLE public.denuncias_acesso (
  denuncia_id         uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  pin_hash            text NOT NULL,
  tentativas_falhadas integer NOT NULL DEFAULT 0,
  bloqueios           integer NOT NULL DEFAULT 0,
  bloqueada_ate       timestamptz,
  sessao_hash         text,
  sessao_expira_em    timestamptz,
  CONSTRAINT denuncias_acesso_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT denuncias_acesso_hashes CHECK (pin_hash ~ '^[0-9a-f]{64}$'
                                            AND (sessao_hash IS NULL OR sessao_hash ~ '^[0-9a-f]{64}$')),
  CONSTRAINT denuncias_acesso_sessao_coerente CHECK ((sessao_hash IS NULL) = (sessao_expira_em IS NULL)),
  CONSTRAINT denuncias_acesso_contadores CHECK (tentativas_falhadas >= 0 AND bloqueios >= 0)
);

CREATE UNIQUE INDEX idx_denuncias_acesso_sessao ON public.denuncias_acesso (sessao_hash) WHERE sessao_hash IS NOT NULL;

COMMENT ON TABLE public.denuncias_acesso IS
'Acesso ao acompanhamento por codigo + PIN. pin_hash = HMAC-SHA-256 hex, calculado na Edge com um pepper e com organizacao+codigo como sal: o PIN nunca chega a base, nem em hash simples. sessao_hash = SHA-256 hex da sessao (30 min). Nenhuma RPC de gestao le esta tabela. Desde 20261231993000.';

-- 2.5 Identidade (so identificadas)
CREATE TABLE public.denuncias_identidade (
  denuncia_id     uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  anew_user_id    uuid REFERENCES public.anew_users (id),
  pessoa_id       uuid,
  nome            text,
  email           text,
  telefone        text,
  pode_contactar  boolean NOT NULL DEFAULT false,
  so_responsavel  boolean NOT NULL DEFAULT true,
  CONSTRAINT denuncias_identidade_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT denuncias_identidade_pessoa_fkey FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id),
  CONSTRAINT denuncias_identidade_tamanhos CHECK (
        (nome IS NULL OR length(nome) BETWEEN 1 AND 200)
    AND (email IS NULL OR (length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    AND (telefone IS NULL OR length(telefone) BETWEEN 3 AND 40)),
  CONSTRAINT denuncias_identidade_contacto CHECK (NOT pode_contactar OR email IS NOT NULL OR telefone IS NOT NULL)
);

CREATE INDEX idx_denuncias_identidade_user ON public.denuncias_identidade (organization_id, anew_user_id)
  WHERE anew_user_id IS NOT NULL;
CREATE INDEX idx_denuncias_identidade_pessoa ON public.denuncias_identidade (pessoa_id) WHERE pessoa_id IS NOT NULL;

COMMENT ON TABLE public.denuncias_identidade IS
'Identidade de quem denunciou, SO em denuncias identificadas: numa anonima nao existe linha (gatilho, HRD20). Le-se so por rpc_denuncia_identidade_ver, que exige motivo e regista o evento identidade_vista ANTES de devolver. so_responsavel = so o responsavel atribuido a pode ver. Desde 20261231993000.';

-- 2.6 Conversa
CREATE TABLE public.denuncias_mensagens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               bigint GENERATED ALWAYS AS IDENTITY,
  organization_id   uuid NOT NULL,
  denuncia_id       uuid NOT NULL,
  autor             text NOT NULL,
  autor_user_id     uuid REFERENCES public.anew_users (id),
  pedido_informacao boolean NOT NULL DEFAULT false,
  texto             text NOT NULL,
  criada_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_mensagens_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT denuncias_mensagens_autor CHECK (
    (autor = 'canal' AND autor_user_id IS NOT NULL)
    OR (autor = 'denunciante' AND autor_user_id IS NULL AND NOT pedido_informacao)),
  CONSTRAINT denuncias_mensagens_texto CHECK (length(btrim(texto)) BETWEEN 1 AND 4000)
);

CREATE INDEX idx_denuncias_mensagens_denuncia ON public.denuncias_mensagens (denuncia_id, seq);
CREATE INDEX idx_denuncias_mensagens_autor ON public.denuncias_mensagens (autor_user_id) WHERE autor_user_id IS NOT NULL;

COMMENT ON TABLE public.denuncias_mensagens IS
'Conversa entre o canal e o denunciante (o que o denunciante ve). A do denunciante nunca guarda autor. Numa anonima, criada_em das mensagens do denunciante e gravada ao dia (anonimato); a ordem e seq. So acrescenta. Desde 20261231993000.';

-- 2.7 Notas internas
CREATE TABLE public.denuncias_notas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL,
  denuncia_id     uuid NOT NULL,
  autor_user_id   uuid NOT NULL REFERENCES public.anew_users (id),
  texto           text NOT NULL,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_notas_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT denuncias_notas_texto CHECK (length(btrim(texto)) BETWEEN 1 AND 4000)
);

CREATE INDEX idx_denuncias_notas_denuncia ON public.denuncias_notas (denuncia_id, seq);
CREATE INDEX idx_denuncias_notas_autor ON public.denuncias_notas (autor_user_id);

COMMENT ON TABLE public.denuncias_notas IS
'Notas internas dos responsaveis. Tabela separada de proposito: nenhuma RPC do denunciante (publica ou "as minhas") le esta tabela. So acrescenta. Desde 20261231993000.';

-- 2.8 Historico e registo de acessos
CREATE TABLE public.denuncias_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL,
  denuncia_id     uuid NOT NULL,
  tipo            text NOT NULL,
  quem_user_id    uuid REFERENCES public.anew_users (id),
  dados           jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_eventos_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT denuncias_eventos_tipo CHECK (tipo IN (
    'recebida', 'rececao_confirmada', 'responsavel_atribuido', 'responsavel_libertado',
    'conflito_declarado', 'visado_registado', 'impedimento_retirado', 'gravidade_alterada',
    'avaliacao_alterada', 'mensagem_enviada', 'informacao_pedida', 'denunciante_respondeu',
    'nota_adicionada', 'concluida', 'arquivada', 'reaberta', 'identidade_vista', 'exportada',
    'consultada')),
  -- O denunciante nunca fica como autor; tudo o resto tem autor.
  CONSTRAINT denuncias_eventos_quem CHECK (
    (tipo IN ('recebida', 'denunciante_respondeu')) = (quem_user_id IS NULL)),
  CONSTRAINT denuncias_eventos_dados CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 1000),
  -- Ver a identidade e exportar exigem motivo (registo de acessos).
  CONSTRAINT denuncias_eventos_motivo CHECK (
    tipo NOT IN ('identidade_vista', 'exportada')
    OR (jsonb_typeof(dados -> 'motivo') = 'string' AND length(btrim(dados ->> 'motivo')) >= 3))
);

CREATE INDEX idx_denuncias_eventos_denuncia ON public.denuncias_eventos (denuncia_id, seq);
CREATE INDEX idx_denuncias_eventos_quem ON public.denuncias_eventos (quem_user_id) WHERE quem_user_id IS NOT NULL;

COMMENT ON TABLE public.denuncias_eventos IS
'Historico do caso e registo de acessos: identidade_vista (motivo obrigatorio) e exportada. dados so com metadados curtos (gravidade, resultado, motivo, alvo); nunca o texto das mensagens nem a identidade. Numa anonima, os eventos do lado do denunciante ficam ao dia. So acrescenta. Desde 20261231993000.';

-- 2.9 Impedidos (visados e conflitos)
CREATE TABLE public.denuncias_impedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  denuncia_id     uuid NOT NULL,
  anew_user_id    uuid NOT NULL REFERENCES public.anew_users (id),
  motivo          text NOT NULL,
  registado_por   uuid REFERENCES public.anew_users (id),
  registado_em    timestamptz NOT NULL DEFAULT now(),
  retirado_por    uuid REFERENCES public.anew_users (id),
  retirado_em     timestamptz,
  CONSTRAINT denuncias_impedidos_denuncia_fkey FOREIGN KEY (denuncia_id, organization_id)
    REFERENCES public.denuncias (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT denuncias_impedidos_motivo CHECK (motivo IN ('visado', 'conflito')),
  CONSTRAINT denuncias_impedidos_retirada_coerente CHECK ((retirado_em IS NULL) = (retirado_por IS NULL))
);

CREATE UNIQUE INDEX idx_denuncias_impedidos_ativo ON public.denuncias_impedidos (denuncia_id, anew_user_id)
  WHERE retirado_em IS NULL;
CREATE INDEX idx_denuncias_impedidos_user ON public.denuncias_impedidos (anew_user_id, organization_id)
  WHERE retirado_em IS NULL;

COMMENT ON TABLE public.denuncias_impedidos IS
'Quem nao pode ver nem tratar o caso: visado (indicado pelo denunciante, registado_por nulo, ou por um responsavel) ou conflito (declarado pelo proprio, ou automatico quando o denunciante identificado e da organizacao). Nunca se apaga; retira-se (retirado_em) so um visado registado por um responsavel, por quem tem denuncias.configurar. Desde 20261231993000.';

-- 2.10 Auditoria de organizacao
CREATE TABLE public.denuncias_canal_auditoria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  organization_id uuid NOT NULL REFERENCES public.anew_organizations (id),
  tipo            text NOT NULL,
  quem_user_id    uuid NOT NULL REFERENCES public.anew_users (id),
  alvo_user_id    uuid REFERENCES public.anew_users (id),
  denuncia_id     uuid REFERENCES public.denuncias (id) ON DELETE SET NULL,
  dados           jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denuncias_canal_auditoria_tipo CHECK (tipo IN (
    'responsavel_designado', 'responsavel_removido', 'canal_alterado', 'visado_registado',
    'conflito_declarado', 'impedimento_retirado', 'autoatribuicao')),
  CONSTRAINT denuncias_canal_auditoria_dados CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 1000)
);

CREATE INDEX idx_denuncias_canal_auditoria_org ON public.denuncias_canal_auditoria (organization_id, seq DESC);
CREATE INDEX idx_denuncias_canal_auditoria_denuncia ON public.denuncias_canal_auditoria (denuncia_id) WHERE denuncia_id IS NOT NULL;
CREATE INDEX idx_denuncias_canal_auditoria_quem ON public.denuncias_canal_auditoria (quem_user_id);
CREATE INDEX idx_denuncias_canal_auditoria_alvo ON public.denuncias_canal_auditoria (alvo_user_id) WHERE alvo_user_id IS NOT NULL;

COMMENT ON TABLE public.denuncias_canal_auditoria IS
'Auditoria do canal ao nivel da organizacao, visivel a TODOS os responsaveis e a quem configura (rpc_denuncias_canal_auditoria): designacoes, remocoes, alteracoes do canal, visados registados por terceiros, conflitos declarados, impedimentos retirados e auto-atribuicoes. Nunca o conteudo do caso. So acrescenta. Desde 20261231993000.';

-- 2.11 Limite de pedidos da Edge publica (agregado)
CREATE TABLE public.denuncias_limites (
  balde    text NOT NULL,
  chave    text NOT NULL,
  janela   timestamptz NOT NULL,
  contagem integer NOT NULL DEFAULT 0,
  PRIMARY KEY (balde, chave, janela),
  CONSTRAINT denuncias_limites_balde CHECK (balde IN ('criar', 'entrar', 'canal', 'sessao')),
  CONSTRAINT denuncias_limites_chave CHECK (chave ~ '^(ip:[0-9a-f]{64}|org:[0-9a-f-]{36}|semip:[0-9a-f-]{36}|global)$'),
  CONSTRAINT denuncias_limites_janela CHECK (janela = date_trunc('hour', janela)),
  CONSTRAINT denuncias_limites_contagem CHECK (contagem >= 0)
);

COMMENT ON TABLE public.denuncias_limites IS
'Contagens por hora da Edge publica do canal: ip:<HMAC do IP com pepper diario>, org:/semip:<organizacao> (criar, entrar) e global (canal, sessao). Nunca o hash da sessao (ligava a contagem a uma denuncia). So a hora truncada e um numero, sem instante de cada pedido e sem ligacao a nenhuma denuncia (anonimato). Incremento atomico por INSERT ... ON CONFLICT. Limpa-se ao fim de 24 h. Desde 20261231993000.';

-- 2.12 Reservas de codigo entre "reservar" e "criar" (Edge publica)
CREATE TABLE public.denuncias_reservas (
  organization_id uuid NOT NULL REFERENCES public.anew_organizations (id),
  codigo          text NOT NULL,
  reserva_hash    text NOT NULL,
  hora            timestamptz NOT NULL,
  PRIMARY KEY (organization_id, codigo),
  CONSTRAINT denuncias_reservas_codigo CHECK (codigo ~ '^DEN-[0-9]{4}-[0-9]{4,6}$'),
  CONSTRAINT denuncias_reservas_hash CHECK (reserva_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT denuncias_reservas_hora CHECK (hora = date_trunc('hour', hora))
);

COMMENT ON TABLE public.denuncias_reservas IS
'Codigos reservados pela Edge publica (rpc_denuncia_publica_reservar_codigo, que consome o limite de criar) a espera da criacao. rpc_denuncia_publica_criar so aceita um codigo com reserva desta organizacao, com o mesmo reserva_hash (nonce da Edge) e da hora corrente ou da anterior, e APAGA-A na mesma transaccao: um codigo nunca reservado (por exemplo do ano anterior) nao cria nada. So a hora truncada (anonimato); as sobras limpam-se em rpc_denuncias_limpar. Desde 20261231993000.';

-- ==============================================================================
-- 3. Quem pode tratar (definicao UNICA, usada pelo gatilho e pelas RPCs)
-- ==============================================================================

CREATE FUNCTION public.denuncias_elegiveis(p_organization_id uuid)
RETURNS TABLE (anew_user_id uuid, desde date)
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT r.anew_user_id, (r.designado_em AT TIME ZONE 'Europe/Lisbon')::date
    FROM public.denuncias_responsaveis r
    JOIN public.anew_users u ON u.id = r.anew_user_id
   WHERE r.organization_id = p_organization_id
     AND r.ativo
     AND u.deleted_at IS NULL
     AND u.auth_user_id IS NOT NULL
     AND public.has_anew_permission_in_org(u.auth_user_id, 'denuncias.gerir', p_organization_id)
$$;

COMMENT ON FUNCTION public.denuncias_elegiveis(uuid) IS
'INTERNA (sem EXECUTE para ninguem alem do dono): responsaveis do canal que podem tratar casos nesta organizacao = designados activos, com conta nao apagada e com denuncias.gerir. desde = data (Lisboa) da designacao. Ter todas as permissoes sem designacao nao chega. Desde 20261231993000.';

-- ==============================================================================
-- 4. Gatilhos
-- ==============================================================================

-- 4.1 O caso: transicoes (estados.ts), imutaveis e responsavel.
CREATE FUNCTION public.denuncias_regras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'recebida' OR NEW.responsavel_id IS NOT NULL OR NEW.confirmada_em IS NOT NULL THEN
      RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.anonima IS DISTINCT FROM OLD.anonima THEN
    RAISE EXCEPTION 'anonima_imutavel' USING ERRCODE = 'HRD20';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.codigo IS DISTINCT FROM OLD.codigo
     OR NEW.origem IS DISTINCT FROM OLD.origem
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.descricao IS DISTINCT FROM OLD.descricao
     OR NEW.resumo IS DISTINCT FROM OLD.resumo
     OR NEW.quando IS DISTINCT FROM OLD.quando
     OR NEW.onde IS DISTINCT FROM OLD.onde
     OR NEW.envolvidos IS DISTINCT FROM OLD.envolvidos
     OR NEW.ainda_acontece IS DISTINCT FROM OLD.ainda_acontece
     OR NEW.testemunhas IS DISTINCT FROM OLD.testemunhas
     OR NEW.ja_reportado IS DISTINCT FROM OLD.ja_reportado
     OR NEW.boa_fe IS DISTINCT FROM OLD.boa_fe
     OR NEW.recebida_em IS DISTINCT FROM OLD.recebida_em
     OR NEW.prazo_confirmar IS DISTINCT FROM OLD.prazo_confirmar
     OR NEW.prazo_seguimento IS DISTINCT FROM OLD.prazo_seguimento THEN
    RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
         (OLD.estado = 'recebida'   AND NEW.estado IN ('em_analise', 'arquivada'))
      OR (OLD.estado = 'em_analise' AND NEW.estado IN ('mais_info', 'concluida', 'arquivada'))
      OR (OLD.estado = 'mais_info'  AND NEW.estado IN ('em_analise', 'concluida', 'arquivada'))
      OR (OLD.estado = 'concluida'  AND NEW.estado = 'em_analise')
      OR (OLD.estado = 'arquivada'  AND NEW.estado = 'em_analise')) THEN
      RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'HRD01';
    END IF;
  END IF;

  IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    SELECT i.motivo INTO v_motivo
      FROM public.denuncias_impedidos i
     WHERE i.denuncia_id = NEW.id AND i.anew_user_id = NEW.responsavel_id AND i.retirado_em IS NULL
     ORDER BY (i.motivo = 'visado') DESC
     LIMIT 1;
    IF v_motivo = 'visado' THEN
      RAISE EXCEPTION 'denunciado' USING ERRCODE = 'HRD02';
    ELSIF v_motivo = 'conflito' THEN
      RAISE EXCEPTION 'conflito' USING ERRCODE = 'HRD03';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.denuncias_elegiveis(NEW.organization_id) e
                    WHERE e.anew_user_id = NEW.responsavel_id) THEN
      RAISE EXCEPTION 'nao_e_responsavel' USING ERRCODE = 'HRD14';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER denuncias_regras
BEFORE INSERT OR UPDATE ON public.denuncias
FOR EACH ROW EXECUTE FUNCTION public.denuncias_regras();

COMMENT ON FUNCTION public.denuncias_regras() IS
'Gatilho de denuncias: ao criar, so recebida e sem responsavel; anonima imutavel (HRD20); relato, codigo, organizacao e prazos imutaveis (HRD27); transicoes de estados.ts (HRD01); responsavel novo nunca visado (HRD02) nem em conflito (HRD03) e sempre elegivel (HRD14). Desde 20261231993000.';

-- 4.2 Identidade: nunca numa anonima; imutavel.
CREATE FUNCTION public.denuncias_identidade_regras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.denuncias d
                  WHERE d.id = NEW.denuncia_id AND d.organization_id = NEW.organization_id
                    AND d.anonima = false) THEN
    RAISE EXCEPTION 'anonima_imutavel' USING ERRCODE = 'HRD20';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER denuncias_identidade_regras
BEFORE INSERT OR UPDATE ON public.denuncias_identidade
FOR EACH ROW EXECUTE FUNCTION public.denuncias_identidade_regras();

COMMENT ON FUNCTION public.denuncias_identidade_regras() IS
'Gatilho de denuncias_identidade: recusa identidade numa denuncia anonima (HRD20) e qualquer alteracao (HRD27). Desde 20261231993000.';

-- 4.3 Impedidos: so se retira, e uma vez.
CREATE FUNCTION public.denuncias_impedidos_regras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.retirado_em IS NOT NULL
     OR NEW.retirado_em IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.denuncia_id IS DISTINCT FROM OLD.denuncia_id
     OR NEW.anew_user_id IS DISTINCT FROM OLD.anew_user_id
     OR NEW.motivo IS DISTINCT FROM OLD.motivo
     OR NEW.registado_por IS DISTINCT FROM OLD.registado_por
     OR NEW.registado_em IS DISTINCT FROM OLD.registado_em THEN
    RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER denuncias_impedidos_regras
BEFORE UPDATE ON public.denuncias_impedidos
FOR EACH ROW EXECUTE FUNCTION public.denuncias_impedidos_regras();

COMMENT ON FUNCTION public.denuncias_impedidos_regras() IS
'Gatilho de denuncias_impedidos: a unica alteracao permitida e retirar (retirado_em/_por), uma vez (HRD27). Desde 20261231993000.';

-- 4.4 Historico: so acrescenta. Apagar so pela conservacao.
CREATE FUNCTION public.denuncias_so_acrescenta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_setting('denuncias.conservacao', true) IS NOT DISTINCT FROM 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
END;
$$;

COMMENT ON FUNCTION public.denuncias_so_acrescenta() IS
'Gatilho das tabelas de historico do canal (mensagens, notas, eventos, auditoria, identidade, impedidos): recusa UPDATE e DELETE (HRD27), salvo dentro de rpc_denuncias_conservacao_executar, que poe denuncias.conservacao = on so na sua transaccao. Desde 20261231993000.';

CREATE TRIGGER denuncias_mensagens_so_acrescenta
BEFORE UPDATE OR DELETE ON public.denuncias_mensagens
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_notas_so_acrescenta
BEFORE UPDATE OR DELETE ON public.denuncias_notas
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_eventos_so_acrescenta
BEFORE UPDATE OR DELETE ON public.denuncias_eventos
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
-- A auditoria recebe o SET NULL da FK quando a conservacao apaga o caso.
CREATE TRIGGER denuncias_canal_auditoria_so_acrescenta
BEFORE UPDATE OR DELETE ON public.denuncias_canal_auditoria
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_identidade_sem_apagar
BEFORE DELETE ON public.denuncias_identidade
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_impedidos_sem_apagar
BEFORE DELETE ON public.denuncias_impedidos
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();
CREATE TRIGGER denuncias_sem_apagar
BEFORE DELETE ON public.denuncias
FOR EACH ROW EXECUTE FUNCTION public.denuncias_so_acrescenta();

-- 4.5 TRUNCATE recusado em todas (nem service_role, nem por engano).
CREATE FUNCTION public.denuncias_sem_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION 'campo_imutavel' USING ERRCODE = 'HRD27';
END;
$$;

COMMENT ON FUNCTION public.denuncias_sem_truncate() IS
'Gatilho BEFORE TRUNCATE das tabelas do canal de denuncias (excepto denuncias_limites): recusa sempre (HRD27). Desde 20261231993000.';

DO $truncate$
DECLARE
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['denuncias_canal', 'denuncias_responsaveis', 'denuncias', 'denuncias_acesso',
                             'denuncias_identidade', 'denuncias_mensagens', 'denuncias_notas',
                             'denuncias_eventos', 'denuncias_impedidos', 'denuncias_canal_auditoria']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.denuncias_sem_truncate()',
                   v_t || '_sem_truncate', v_t);
  END LOOP;
END;
$truncate$;

-- ==============================================================================
-- 5. Fechar tudo: RLS, RESTRICTIVE block_* e REVOKE (tabelas, sequencias, funcoes)
-- ==============================================================================
DO $fechar$
DECLARE
  v_t   text;
  v_s   text;
  v_f   text;
  v_op  text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['denuncias_canal', 'denuncias_responsaveis', 'denuncias', 'denuncias_acesso',
                             'denuncias_identidade', 'denuncias_mensagens', 'denuncias_notas',
                             'denuncias_eventos', 'denuncias_impedidos', 'denuncias_canal_auditoria',
                             'denuncias_limites', 'denuncias_reservas']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', v_t);
    FOREACH v_op IN ARRAY ARRAY['select', 'insert', 'update', 'delete'] LOOP
      IF v_op = 'insert' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false)',
                       v_t || '_block_insert', v_t);
      ELSIF v_op = 'update' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)',
                       v_t || '_block_update', v_t);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO anon, authenticated USING (false)',
                       v_t || '_block_' || v_op, v_t, upper(v_op));
      END IF;
    END LOOP;
  END LOOP;

  -- Sequencias das colunas de identidade (seq).
  FOR v_s IN
    SELECT s.oid::regclass::text
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid AND d.deptype::text IN ('a', 'i')
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE s.relkind::text = 'S' AND n.nspname = 'public' AND t.relname LIKE 'denuncias%'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role', v_s);
  END LOOP;

  -- Funcoes desta migration: so o dono.
  FOR v_f IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'denuncias%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_f);
  END LOOP;
END;
$fechar$;

-- ==============================================================================
-- 6. Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  k_tabelas constant text[] := ARRAY['denuncias_canal', 'denuncias_responsaveis', 'denuncias', 'denuncias_acesso',
                                     'denuncias_identidade', 'denuncias_mensagens', 'denuncias_notas',
                                     'denuncias_eventos', 'denuncias_impedidos', 'denuncias_canal_auditoria',
                                     'denuncias_limites', 'denuncias_reservas'];
  v_t    text;
  v_r    text;
  v_p    text;
  v_n    integer;
  r      record;
BEGIN
  FOREACH v_t IN ARRAY k_tabelas LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      RAISE EXCEPTION 'CONFERIR: a tabela % nao ficou criada.', v_t;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.' || v_t)) THEN
      RAISE EXCEPTION 'CONFERIR: % ficou sem RLS.', v_t;
    END IF;

    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_t
       AND permissive = 'RESTRICTIVE'
       AND policyname IN (v_t || '_block_select', v_t || '_block_insert', v_t || '_block_update', v_t || '_block_delete')
       AND roles @> ARRAY['anon', 'authenticated']::name[];
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'CONFERIR: % tem % de 4 politicas block_* RESTRICTIVE para anon e authenticated.', v_t, v_n;
    END IF;
    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_t AND permissive <> 'RESTRICTIVE';
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'CONFERIR: % tem % politica(s) permissiva(s); o canal so tem bloqueios.', v_t, v_n;
    END IF;

    FOREACH v_r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'public'] LOOP
      FOREACH v_p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_r, 'public.' || v_t, v_p) THEN
          RAISE EXCEPTION 'CONFERIR: % tem % em %.', v_r, v_p, v_t;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Nenhuma coluna com privilegio proprio (um GRANT por coluna furava o REVOKE de tabela).
  SELECT count(*) INTO v_n
    FROM information_schema.column_privileges cp
   WHERE cp.table_schema = 'public' AND cp.table_name = ANY (k_tabelas)
     AND cp.grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % privilegio(s) de coluna nas tabelas do canal.', v_n;
  END IF;

  -- Sequencias: 4 colunas seq; nenhuma usavel por quem nao e dono.
  SELECT count(*) INTO v_n
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype::text IN ('a', 'i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE s.relkind::text = 'S' AND n.nspname = 'public' AND t.relname LIKE 'denuncias%';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CONFERIR: esperavam-se 4 sequencias (seq) nas tabelas do canal, ha %.', v_n;
  END IF;
  FOR r IN
    SELECT s.oid AS oid, s.oid::regclass::text AS nome
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid AND d.deptype::text IN ('a', 'i')
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE s.relkind::text = 'S' AND n.nspname = 'public' AND t.relname LIKE 'denuncias%'
  LOOP
    FOREACH v_r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'public'] LOOP
      IF has_sequence_privilege(v_r, r.oid, 'USAGE') OR has_sequence_privilege(v_r, r.oid, 'SELECT')
         OR has_sequence_privilege(v_r, r.oid, 'UPDATE') THEN
        RAISE EXCEPTION 'CONFERIR: % tem privilegio na sequencia %.', v_r, r.nome;
      END IF;
    END LOOP;
  END LOOP;

  -- Funcoes: 7, search_path fixo, nenhuma SECURITY DEFINER, ninguem alem do dono executa.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'denuncias%';
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'CONFERIR: esperavam-se 7 funcoes denuncias* nesta migration, ha %.', v_n;
  END IF;
  FOR r IN
    SELECT p.oid AS oid, p.oid::regprocedure::text AS nome, p.prosecdef AS secdef, p.proconfig AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'denuncias%'
  LOOP
    IF r.secdef THEN
      RAISE EXCEPTION 'CONFERIR: % e SECURITY DEFINER; as funcoes desta migration nao o sao.', r.nome;
    END IF;
    IF NOT ('search_path=public, pg_temp' = ANY (coalesce(r.cfg, '{}'::text[]))) THEN
      RAISE EXCEPTION 'CONFERIR: % sem search_path fixo (%).', r.nome, coalesce(array_to_string(r.cfg, ';'), 'vazio');
    END IF;
    FOREACH v_r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'public'] LOOP
      IF has_function_privilege(v_r, r.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'CONFERIR: % executa %.', v_r, r.nome;
      END IF;
    END LOOP;
  END LOOP;

  -- Gatilhos esperados.
  SELECT count(*) INTO v_n FROM pg_trigger tg
   WHERE NOT tg.tgisinternal
     AND tg.tgrelid IN (SELECT to_regclass('public.' || x) FROM unnest(k_tabelas) AS x);
  IF v_n <> 20 THEN
    RAISE EXCEPTION 'CONFERIR: esperavam-se 20 gatilhos nas tabelas do canal (regras, so acrescenta, truncate), ha %.', v_n;
  END IF;

  RAISE NOTICE 'Conferido: 12 tabelas do canal com RLS e 4 bloqueios RESTRICTIVE cada, sem privilegios de tabela, coluna ou sequencia para anon/authenticated/service_role/PUBLIC; 7 funcoes internas so do dono; 20 gatilhos.';
END;
$conferir$;
