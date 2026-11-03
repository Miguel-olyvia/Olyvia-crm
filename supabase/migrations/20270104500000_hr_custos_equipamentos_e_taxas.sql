-- ==============================================================================
-- 20270104500000_hr_custos_equipamentos_e_taxas.sql
--
-- RH, ecra de Custos: passa da memoria (src/components/rh-exemplo/dados/lojaCusto.ts)
-- para a base tres coisas:
--   1. hr_custo_definicoes    -- taxa da empresa, seguro, valor por km e ajuda por
--                                dia, uma linha por organizacao (sem linha = omissao);
--   2. pessoas_custo_excecoes -- excepcao da taxa da empresa por pessoa (apagar a
--                                linha = voltar a taxa da empresa);
--   3. pessoas_equipamentos   -- equipamentos atribuidos, com o "como conta"
--                                (umaVez / repartido / todosMeses) e a devolucao.
-- Mais um registo so de acrescentar, hr_custo_eventos, que serve o limite de
-- escritas por actor (120 por hora) e a auditoria de quem mudou taxas.
--
-- Base: RH (uetjghdkwbywbftedtth). NUNCA a principal, NUNCA a Mudelar.
--
--
-- !!! PRECISA DE CODIGO NOVO -- NAO APLICAR SOZINHA !!! ------------------------
--
--  Nada no ecra usa isto enquanto o store em memoria lojaCusto.ts nao for
--  substituido por hooks que chamem as 8 RPCs abaixo (definicoes, excecoes e
--  equipamentos; os valores avulsos FICAM em memoria, fora desta migration).
--  Aplicar sozinha nao parte nada (so cria objectos novos), mas tambem nao muda
--  nada no ecra. O que o ecra tem de enviar e ler esta no resumo
--  (jobs/bbc4f3a6/tmp/migration-custos-resumo.md) e nos COMMENT de cada RPC.
--  Pontos de traducao obrigatorios no hook:
--   - conta_inicio / conta_fim sao DATE no 1.o dia do mes ('AAAA-MM-01'); o ecra
--     usa 'AAAA-MM'. A RPC aceita qualquer dia e leva-o ao dia 1.
--   - conta_meses vem NULL fora do 'repartido' (o ecra usa meses: 1).
--   - codigos HRA65 a HRA74 (abaixo) entram no catalogo de erros do ecra.
--  Ordem: db push --linked (a partir do worktree rh-pessoas, confirmar
--  supabase/.temp/project-ref = uetjgh...) -> front com os hooks.
--
--
-- -- [CONFIRMAR] ANTES DO PUSH ---------------------------------------------------
--  a) A tabela de organizacoes e public.anew_organizations (o pedido dizia
--     "organizations"; e a que pessoas usa, 20261207000200).
--  b) Os codigos HRA65 a HRA74 estao livres no repositorio (o ultimo usado e
--     HRA64). A guarda confere que nenhuma funcao do remoto os usa.
--  c) As permissoes: hr.pessoas.retribuicao.view e hr.pessoas.retribuicao.edit
--     (catalogo 20261207000100, ambas is_dangerous). A guarda confere-as.
--  d) Quem aplica tem BYPASSRLS (as tabelas ficam com FORCE RLS e sem politica:
--     so as RPCs SECURITY DEFINER lhes chegam). A guarda confere-o.
--
--
-- -- DESVIOS AO PEDIDO (decididos aqui, a validar) --------------------------------
--  1. Tabela nova hr_custo_eventos: as RPCs do RH contam o limite por actor num
--     registo de eventos; estas tabelas nao tinham nenhum. Guarda so numeros e
--     codigos (nunca nomes nem textos livres).
--  2. 'repartido' exige tambem conta_inicio e conta_fim NULL, e 'todosMeses'
--     exige conta_meses NULL (o mesmo que normalizarConta faz no ecra).
--  3. conta_inicio e conta_fim tem de ser o dia 1 do mes (CHECK).
--  4. A RPC normaliza como o ecra: os campos que o modo nao usa sao ignorados
--     (nao recusados); 'repartido' sem meses = 36; modo NULL = 'repartido'.
--  5. Valores com mais de 2 casas decimais arredondam-se ao centimo antes de
--     validar (0.004 passa a 0.00 e e recusado como valor_invalido).
--  6. As leituras escondem equipamentos e excepcoes de pessoas apagadas
--     (pessoas.deleted_at); arquivadas continuam a aparecer.
--  7. alterar_conta aceita equipamentos devolvidos (o ecra deixa).
--
--
-- -- REVISAO (bases de dados e seguranca), corrigido antes do push -----------------
--  MEDIUM-1 teto de 200 equipamentos por pessoa (HRA41, em fila por pessoa) e a
--           lista paginada (p_limite 500 por omissao, maximo 1000; p_offset),
--           ordem estavel entrega desc, created_at desc, id desc.
--  MEDIUM-2 a lista ja nao devolve created_by nem autor_nome.
--  MEDIUM-3 datas finitas entre 2000-01-01 e hoje + 10 anos nas RPCs (HRA67,
--           hr_custo_data_valida) e CHECK na tabela entre 2000-01-01 e 2100-01-01:
--           a base nunca guarda infinity; infinity em p_inicio da HRA67, nunca 23514.
--  LOW-1    escrever exige tambem hr.pessoas.retribuicao.view.
--  LOW-2    devolver e alterar_conta exigem a pessoa nao apagada (HRA31).
--  LOW-5    descricao sem caracteres de controlo (CHECK e HRA65).
--  M1       hr_custo_eventos.ator_id sem FK (o SET NULL chocava com o trigger de
--           imutabilidade ao apagar um anew_users); e anew_users.id por convencao.
--  M2       atribuir e idempotente por p_id (o cliente gera o id; um reenvio com
--           o mesmo id devolve o existente, sem segundo evento).
--  L3       indices parciais em created_by/updated_by/ator_id (WHERE NOT NULL).
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo) ------------------------------------------
--   reutilizados: 42501 insufficient_privilege (sem sessao, sem permissao, sem
--   utilizador da aplicacao), HRA10 pedido_invalido (tipo/modo desconhecido),
--   HRA31 nao_encontrado, HRA33 organizacao_nao_empregadora, HRA38
--   estado_invalido (equipamento ja devolvido), HRA41 limite_excedido (120
--   escritas por hora por actor; 200 equipamentos por pessoa).
--   novos (ecra entre parenteses):
--     HRA65 descricao_invalida        (semDescricao)
--     HRA66 valor_invalido            (valorZero)
--     HRA67 data_invalida             (semData; tambem data infinita ou fora de 2000-01-01..hoje+10 anos)
--     HRA68 meses_invalidos           (mesesInvalidos)
--     HRA69 conta_sem_inicio          (semInicio)
--     HRA70 conta_fim_antes_inicio    (fimAntesInicio)
--     HRA71 devolucao_antes_entrega   (antesDaEntrega)
--     HRA72 estado_devolucao_invalido (semEstado)
--     HRA73 taxa_invalida             (taxa da empresa, seguro ou excepcao fora de 0..100)
--     HRA74 valor_unitario_invalido   (valor por km ou ajuda por dia negativo ou nulo)
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so sem dados:
-- largar as 8 RPCs, as 7 funcoes internas e as 4 tabelas.
-- ==============================================================================

SET lock_timeout = '5s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- Dependencias.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_organizacao_empregadora(uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta has_anew_permission_in_org(uuid, text, uuid), hr_organizacao_empregadora(uuid) ou update_updated_at_column().';
  END IF;
  IF to_regclass('public.anew_organizations') IS NULL
     OR to_regclass('public.anew_users') IS NULL
     OR to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta anew_organizations, anew_users ou pessoas.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas')
                    AND c.conname::text = 'pessoas_id_org_key' AND c.contype::text = 'u') THEN
    RAISE EXCEPTION 'Guarda: pessoas nao tem a UNIQUE pessoas_id_org_key (alvo das FK compostas).';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.anew_users') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'auth_user_id');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: anew_users nao tem id e auth_user_id (encontradas % de 2).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'deleted_at');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: pessoas nao tem id, organization_id e deleted_at (encontradas % de 3).', v_n;
  END IF;

  -- As permissoes reutilizadas existem (nenhuma nova).
  SELECT count(DISTINCT code) INTO v_n FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.retribuicao.view', 'hr.pessoas.retribuicao.edit');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: faltam permissoes no catalogo (encontradas % de 2).', v_n;
  END IF;

  -- Nada do que esta migration cria pode ja existir.
  IF to_regclass('public.hr_custo_definicoes') IS NOT NULL
     OR to_regclass('public.pessoas_custo_excecoes') IS NOT NULL
     OR to_regclass('public.pessoas_equipamentos') IS NOT NULL
     OR to_regclass('public.hr_custo_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: uma das tabelas desta migration ja existe. Investigar.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND (p.proname::text LIKE 'rpc\_hr\_custo\_%'
          OR p.proname::text LIKE 'rpc\_hr\_equipamento%'
          OR p.proname::text LIKE 'hr\_custo\_%');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existem % funcao(oes) com nomes desta migration. Investigar.', v_n;
  END IF;

  -- [CONFIRMAR b] Os codigos novos nao estao em uso em nenhuma funcao do remoto.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.prosrc ~ 'HRA(6[5-9]|7[0-4])';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ha % funcao(oes) no remoto que ja usam um codigo entre HRA65 e HRA74. Escolher outros.', v_n;
  END IF;

  -- O dono das funcoes tem de passar a RLS (as tabelas novas ficam com FORCE e sem politica).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'Guarda: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao conseguiriam ler nem escrever.', current_user::text;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Tabelas
-- ==============================================================================

-- ---- 1.1 Definicoes de custo da organizacao ------------------------------------
CREATE TABLE public.hr_custo_definicoes (
  organization_id uuid          NOT NULL,
  taxa_empresa    numeric(5,2)  NOT NULL DEFAULT 23.75,
  seguro          numeric(5,2)  NOT NULL DEFAULT 5,
  valor_km        numeric(8,2)  NOT NULL DEFAULT 0.40,
  ajuda_dia       numeric(8,2)  NOT NULL DEFAULT 25,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      uuid,

  CONSTRAINT hr_custo_definicoes_pkey PRIMARY KEY (organization_id),
  CONSTRAINT hr_custo_definicoes_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_custo_definicoes_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_custo_definicoes_taxa_empresa CHECK (taxa_empresa BETWEEN 0 AND 100),
  CONSTRAINT hr_custo_definicoes_seguro       CHECK (seguro BETWEEN 0 AND 100),
  CONSTRAINT hr_custo_definicoes_valor_km     CHECK (valor_km >= 0),
  CONSTRAINT hr_custo_definicoes_ajuda_dia    CHECK (ajuda_dia >= 0)
);
COMMENT ON TABLE public.hr_custo_definicoes IS
'Definicoes de custo do RH por organizacao: taxa da empresa e seguro (percentagens 0..100), valor por km e ajuda de custo por dia (euros). Sem linha valem as omissoes (23.75, 5, 0.40, 25), as mesmas de hr_custo_definicoes_omissao(). Le-se e escreve-se SO pelas RPCs rpc_hr_custo_definicoes_*. Desde 20270104500000.';

-- ---- 1.2 Excepcao da taxa da empresa por pessoa ---------------------------------
CREATE TABLE public.pessoas_custo_excecoes (
  pessoa_id       uuid          NOT NULL,
  organization_id uuid          NOT NULL,
  taxa_empresa    numeric(5,2)  NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  updated_by      uuid,

  CONSTRAINT pessoas_custo_excecoes_pkey PRIMARY KEY (pessoa_id),
  CONSTRAINT pessoas_custo_excecoes_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_custo_excecoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_custo_excecoes_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_custo_excecoes_taxa CHECK (taxa_empresa BETWEEN 0 AND 100)
);
COMMENT ON TABLE public.pessoas_custo_excecoes IS
'Excepcao da taxa da empresa (0..100) para uma pessoa; substitui hr_custo_definicoes.taxa_empresa no custo dela. Tirar a excepcao = apagar a linha (rpc_hr_custo_excecao_definir com p_taxa NULL). Escrita so por RPC. Desde 20270104500000.';
CREATE INDEX idx_pessoas_custo_excecoes_org ON public.pessoas_custo_excecoes (organization_id);

-- ---- 1.3 Equipamentos atribuidos --------------------------------------------------
CREATE TABLE public.pessoas_equipamentos (
  id               uuid           NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid           NOT NULL,
  pessoa_id        uuid           NOT NULL,
  tipo             text           NOT NULL,
  descricao        text           NOT NULL,
  valor            numeric(12,2)  NOT NULL,
  entrega          date           NOT NULL,
  conta_modo       text           NOT NULL DEFAULT 'repartido',
  conta_meses      integer,
  conta_inicio     date,
  conta_fim        date,
  estado           text           NOT NULL DEFAULT 'atribuido',
  devolucao        date,
  estado_devolucao text,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  updated_by       uuid,

  CONSTRAINT pessoas_equipamentos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_equipamentos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_equipamentos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_equipamentos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_equipamentos_tipo_valido CHECK (
    tipo IN ('telemovel', 'portatil', 'viatura', 'fardamento', 'ferramentas', 'outro')),
  CONSTRAINT pessoas_equipamentos_descricao CHECK (
    descricao = btrim(descricao) AND length(descricao) BETWEEN 1 AND 200 AND descricao !~ '[[:cntrl:]]'),
  CONSTRAINT pessoas_equipamentos_valor CHECK (valor > 0),
  CONSTRAINT pessoas_equipamentos_conta_modo_valido CHECK (
    conta_modo IN ('umaVez', 'repartido', 'todosMeses')),
  CONSTRAINT pessoas_equipamentos_conta_coerente CHECK (
    (conta_modo = 'umaVez'
       AND conta_meses IS NULL AND conta_inicio IS NULL AND conta_fim IS NULL)
    OR (conta_modo = 'repartido'
       AND conta_meses IS NOT NULL AND conta_meses BETWEEN 1 AND 120
       AND conta_inicio IS NULL AND conta_fim IS NULL)
    OR (conta_modo = 'todosMeses'
       AND conta_meses IS NULL AND conta_inicio IS NOT NULL
       AND (conta_fim IS NULL OR conta_fim >= conta_inicio))),
  -- Nunca infinity nem datas absurdas (as RPCs sao mais estreitas: ate hoje + 10 anos).
  CONSTRAINT pessoas_equipamentos_datas_intervalo CHECK (
    entrega BETWEEN DATE '2000-01-01' AND DATE '2100-01-01'
    AND (devolucao IS NULL OR devolucao BETWEEN DATE '2000-01-01' AND DATE '2100-01-01')
    AND (conta_inicio IS NULL OR conta_inicio BETWEEN DATE '2000-01-01' AND DATE '2100-01-01')
    AND (conta_fim IS NULL OR conta_fim BETWEEN DATE '2000-01-01' AND DATE '2100-01-01')),
  CONSTRAINT pessoas_equipamentos_conta_dia_um CHECK (
    (conta_inicio IS NULL OR extract(day FROM conta_inicio) = 1)
    AND (conta_fim IS NULL OR extract(day FROM conta_fim) = 1)),
  CONSTRAINT pessoas_equipamentos_estado_valido CHECK (estado IN ('atribuido', 'devolvido')),
  CONSTRAINT pessoas_equipamentos_estado_devolucao_valido CHECK (
    estado_devolucao IS NULL OR estado_devolucao IN ('bom', 'desgaste', 'danificado')),
  CONSTRAINT pessoas_equipamentos_devolucao_coerente CHECK (
    (estado = 'atribuido' AND devolucao IS NULL AND estado_devolucao IS NULL)
    OR (estado = 'devolvido' AND devolucao IS NOT NULL AND estado_devolucao IS NOT NULL
        AND devolucao >= entrega))
);
COMMENT ON TABLE public.pessoas_equipamentos IS
'Equipamentos atribuidos a uma pessoa (custo do RH). valor: de aquisicao; no modo todosMeses e o valor de cada mes. Como conta: umaVez (tudo no mes da entrega), repartido (valor/conta_meses a partir do mes da entrega, 1..120) ou todosMeses (de conta_inicio a conta_fim, dia 1 do mes; sem fim continua). Devolver deixa de contar a partir do mes seguinte ao da devolucao. Sem DELETE: so se devolve. Escrita so por RPC. Desde 20270104500000.';
COMMENT ON COLUMN public.pessoas_equipamentos.conta_inicio IS
'So no todosMeses: primeiro mes que conta, guardado como o dia 1 desse mes (o ecra usa AAAA-MM). Desde 20270104500000.';
COMMENT ON COLUMN public.pessoas_equipamentos.conta_fim IS
'So no todosMeses: ultimo mes que conta (dia 1), NULL = continua. Desde 20270104500000.';
CREATE INDEX idx_pessoas_equipamentos_org_pessoa ON public.pessoas_equipamentos (organization_id, pessoa_id);
-- Para o ON DELETE SET NULL de anew_users nao varrer as tabelas (parciais: baratos).
CREATE INDEX idx_hr_custo_definicoes_updated_by ON public.hr_custo_definicoes (updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX idx_pessoas_custo_excecoes_created_by ON public.pessoas_custo_excecoes (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_pessoas_custo_excecoes_updated_by ON public.pessoas_custo_excecoes (updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX idx_pessoas_equipamentos_created_by ON public.pessoas_equipamentos (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_pessoas_equipamentos_updated_by ON public.pessoas_equipamentos (updated_by) WHERE updated_by IS NOT NULL;

-- ---- 1.4 Registo de eventos (limite por actor e auditoria) ----------------------
CREATE TABLE public.hr_custo_eventos (
  id              uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid         NOT NULL,
  pessoa_id       uuid,
  entidade        text         NOT NULL,
  entidade_id     uuid,
  evento          text         NOT NULL,
  ator_auth_uid   uuid         NOT NULL,
  ator_id         uuid,
  dados           jsonb        NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT hr_custo_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT hr_custo_eventos_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_custo_eventos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT hr_custo_eventos_entidade_valida CHECK (
    (entidade = 'definicoes' AND evento = 'definicoes_guardadas' AND pessoa_id IS NULL)
    OR (entidade = 'excecao' AND evento IN ('excecao_definida', 'excecao_removida') AND pessoa_id IS NOT NULL)
    OR (entidade = 'equipamento'
        AND evento IN ('equipamento_atribuido', 'equipamento_devolvido', 'equipamento_conta_alterada')
        AND pessoa_id IS NOT NULL AND entidade_id IS NOT NULL)),
  CONSTRAINT hr_custo_eventos_dados CHECK (jsonb_typeof(dados) = 'object' AND pg_column_size(dados) <= 2000)
);
COMMENT ON TABLE public.hr_custo_eventos IS
'Registo so de acrescentar das escritas do custo do RH (definicoes, excepcoes, equipamentos): serve o limite de 120 escritas por hora por actor (HRA41) e a auditoria. dados leva so numeros e codigos (antes/depois), nunca nomes nem descricoes. UPDATE, DELETE e TRUNCATE recusados por trigger. Desde 20270104500000.';
CREATE INDEX idx_hr_custo_eventos_ator ON public.hr_custo_eventos (ator_auth_uid, criado_em);
CREATE INDEX idx_hr_custo_eventos_org ON public.hr_custo_eventos (organization_id, criado_em);
CREATE INDEX idx_hr_custo_eventos_pessoa ON public.hr_custo_eventos (pessoa_id, organization_id) WHERE pessoa_id IS NOT NULL;
CREATE INDEX idx_hr_custo_eventos_ator_id ON public.hr_custo_eventos (ator_id) WHERE ator_id IS NOT NULL;
COMMENT ON COLUMN public.hr_custo_eventos.ator_id IS
'anew_users.id do actor, SEM FK de proposito (como os eventos do convite): um ON DELETE SET NULL chocaria com o trigger de imutabilidade ao apagar um utilizador. ator_auth_uid e o auth.users.id. Desde 20270104500000.';

-- ==============================================================================
-- 2. Triggers
-- ==============================================================================
CREATE TRIGGER trg_hr_custo_definicoes_updated_at
  BEFORE UPDATE ON public.hr_custo_definicoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pessoas_custo_excecoes_updated_at
  BEFORE UPDATE ON public.pessoas_custo_excecoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pessoas_equipamentos_updated_at
  BEFORE UPDATE ON public.pessoas_equipamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.hr_custo_eventos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'evento_imutavel' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER trg_hr_custo_eventos_sem_alterar
  BEFORE UPDATE OR DELETE ON public.hr_custo_eventos
  FOR EACH ROW EXECUTE FUNCTION public.hr_custo_eventos_imutavel();
CREATE TRIGGER trg_hr_custo_eventos_sem_truncate
  BEFORE TRUNCATE ON public.hr_custo_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_custo_eventos_imutavel();

-- ==============================================================================
-- 3. Privilegios e RLS: ninguem le nem escreve directamente; so as RPCs
-- ==============================================================================
REVOKE ALL ON TABLE public.hr_custo_definicoes    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_custo_excecoes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_equipamentos   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.hr_custo_eventos       FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.hr_custo_definicoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_custo_definicoes    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_custo_excecoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_custo_excecoes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_equipamentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_equipamentos   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_custo_eventos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_custo_eventos       FORCE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de proposito: sem privilegios de tabela nem politicas, o
-- PostgREST nao chega a estas tabelas. O linter do Supabase avisa "RLS sem
-- politica" (informativo); e o desenho.

-- ==============================================================================
-- 4. Funcoes internas (sem EXECUTE para ninguem)
-- ==============================================================================

-- 4.1 As omissoes das definicoes, num so sitio (o bloco de conferir compara-as
--     com os DEFAULT das colunas).
CREATE FUNCTION public.hr_custo_definicoes_omissao()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('taxa_empresa', 23.75::numeric(5,2), 'seguro', 5::numeric(5,2),
                            'valor_km', 0.40::numeric(8,2), 'ajuda_dia', 25::numeric(8,2))
$$;

-- 4.1b Uma data aceitavel: nao nula, finita (nunca infinity) e entre 2000-01-01
--      e hoje + 10 anos. Mais estreita do que o CHECK da tabela (2000..2100), para
--      a RPC responder HRA67 antes de o CHECK responder 23514.
CREATE FUNCTION public.hr_custo_data_valida(p_data date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT p_data IS NOT NULL
     AND isfinite(p_data)
     AND p_data >= DATE '2000-01-01'
     AND p_data <= (current_date + interval '10 years')::date
$$;

-- 4.2 O "como conta", normalizado e validado como normalizarConta + validarConta
--     do ecra (comoConta.ts). Os campos que o modo nao usa sao ignorados.
--     STABLE (e nao IMMUTABLE): a validade das datas depende de current_date.
CREATE FUNCTION public.hr_custo_conta_normalizar(
  p_modo text, p_meses integer, p_inicio date, p_fim date,
  OUT modo text, OUT meses integer, OUT inicio date, OUT fim date)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  modo   := coalesce(nullif(btrim(p_modo), ''), 'repartido');
  meses  := NULL;
  inicio := NULL;
  fim    := NULL;

  IF modo = 'umaVez' THEN
    RETURN;
  ELSIF modo = 'repartido' THEN
    meses := coalesce(p_meses, 36);
    IF meses < 1 OR meses > 120 THEN
      RAISE EXCEPTION 'meses_invalidos' USING ERRCODE = 'HRA68';
    END IF;
    RETURN;
  ELSIF modo = 'todosMeses' THEN
    IF p_inicio IS NULL THEN
      RAISE EXCEPTION 'conta_sem_inicio' USING ERRCODE = 'HRA69';
    END IF;
    -- Antes de qualquer conta: infinity ou fora do intervalo da HRA67 (nunca 23514).
    IF NOT public.hr_custo_data_valida(p_inicio)
       OR (p_fim IS NOT NULL AND NOT public.hr_custo_data_valida(p_fim)) THEN
      RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA67';
    END IF;
    -- O mes, guardado como o dia 1 (date - integer = date; sem fuso).
    inicio := p_inicio - (extract(day FROM p_inicio)::integer - 1);
    IF p_fim IS NOT NULL THEN
      fim := p_fim - (extract(day FROM p_fim)::integer - 1);
      IF fim < inicio THEN
        RAISE EXCEPTION 'conta_fim_antes_inicio' USING ERRCODE = 'HRA70';
      END IF;
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
END;
$$;

-- 4.3 Leitura: sessao e hr.pessoas.retribuicao.view na organizacao pedida.
CREATE FUNCTION public.hr_custo_exigir_leitura(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- 4.4 Escrita: sessao, hr.pessoas.retribuicao.view E .edit, utilizador da aplicacao,
--     organizacao empregadora e limite de 120 escritas por hora por actor (em
--     fila por actor, para duas chamadas simultaneas nao passarem as duas).
--     Devolve anew_users.id do actor. Tudo ANTES de ler ou trancar dados.
CREATE FUNCTION public.hr_custo_exigir_escrita(p_organization_id uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  c_limite constant integer := 120;
  v_uid  uuid := auth.uid();
  v_anew uuid;
  v_n    integer;
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', p_organization_id)
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.edit', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF NOT public.hr_organizacao_empregadora(p_organization_id) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hr_custo:' || v_uid::text, 0));
  SELECT count(*) INTO v_n
    FROM public.hr_custo_eventos e
   WHERE e.ator_auth_uid = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_limite THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;
  RETURN v_anew;
END;
$$;

-- 4.5 Grava um evento (o actor e sempre auth.uid()).
CREATE FUNCTION public.hr_custo_evento(
  p_organization_id uuid, p_pessoa_id uuid, p_entidade text, p_entidade_id uuid,
  p_evento text, p_ator_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = ''
AS $$
  INSERT INTO public.hr_custo_eventos
    (organization_id, pessoa_id, entidade, entidade_id, evento, ator_auth_uid, ator_id, dados)
  VALUES
    (p_organization_id, p_pessoa_id, p_entidade, p_entidade_id, p_evento, auth.uid(), p_ator_id,
     coalesce(p_dados, '{}'::jsonb))
$$;

-- ==============================================================================
-- 5. RPCs (authenticated; SECURITY DEFINER; permissao e organizacao primeiro)
-- ==============================================================================

-- 5.1 Ler as definicoes (as omissoes se ainda nao ha linha).
CREATE FUNCTION public.rpc_hr_custo_definicoes_ler(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r jsonb;
BEGIN
  PERFORM public.hr_custo_exigir_leitura(p_organization_id);

  SELECT jsonb_build_object('taxa_empresa', d.taxa_empresa, 'seguro', d.seguro,
                            'valor_km', d.valor_km, 'ajuda_dia', d.ajuda_dia,
                            'omissao', false, 'updated_at', d.updated_at)
    INTO v_r
    FROM public.hr_custo_definicoes d
   WHERE d.organization_id = p_organization_id;

  RETURN coalesce(v_r, public.hr_custo_definicoes_omissao()
                       || jsonb_build_object('omissao', true, 'updated_at', NULL));
END;
$$;

-- 5.2 Guardar as definicoes (upsert, as quatro de uma vez).
CREATE FUNCTION public.rpc_hr_custo_definicoes_guardar(
  p_organization_id uuid, p_taxa_empresa numeric, p_seguro numeric, p_valor_km numeric, p_ajuda_dia numeric)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew  uuid;
  v_taxa  numeric := round(p_taxa_empresa, 2);
  v_seg   numeric := round(p_seguro, 2);
  v_km    numeric := round(p_valor_km, 2);
  v_dia   numeric := round(p_ajuda_dia, 2);
  v_antes jsonb;
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);

  IF v_taxa IS NULL OR v_taxa < 0 OR v_taxa > 100
     OR v_seg IS NULL OR v_seg < 0 OR v_seg > 100 THEN
    RAISE EXCEPTION 'taxa_invalida' USING ERRCODE = 'HRA73';
  END IF;
  IF v_km IS NULL OR v_km < 0 OR v_km >= 1000000
     OR v_dia IS NULL OR v_dia < 0 OR v_dia >= 1000000 THEN
    RAISE EXCEPTION 'valor_unitario_invalido' USING ERRCODE = 'HRA74';
  END IF;

  SELECT jsonb_build_object('taxa_empresa', d.taxa_empresa, 'seguro', d.seguro,
                            'valor_km', d.valor_km, 'ajuda_dia', d.ajuda_dia)
    INTO v_antes
    FROM public.hr_custo_definicoes d
   WHERE d.organization_id = p_organization_id
   FOR UPDATE;

  INSERT INTO public.hr_custo_definicoes AS d
    (organization_id, taxa_empresa, seguro, valor_km, ajuda_dia, updated_by)
  VALUES
    (p_organization_id, v_taxa, v_seg, v_km, v_dia, v_anew)
  ON CONFLICT (organization_id) DO UPDATE
    SET taxa_empresa = EXCLUDED.taxa_empresa,
        seguro       = EXCLUDED.seguro,
        valor_km     = EXCLUDED.valor_km,
        ajuda_dia    = EXCLUDED.ajuda_dia,
        updated_by   = EXCLUDED.updated_by;

  PERFORM public.hr_custo_evento(p_organization_id, NULL, 'definicoes', NULL, 'definicoes_guardadas', v_anew,
    jsonb_build_object('antes', coalesce(v_antes, public.hr_custo_definicoes_omissao()),
                       'depois', jsonb_build_object('taxa_empresa', v_taxa, 'seguro', v_seg,
                                                    'valor_km', v_km, 'ajuda_dia', v_dia)));

  RETURN jsonb_build_object('taxa_empresa', v_taxa, 'seguro', v_seg, 'valor_km', v_km, 'ajuda_dia', v_dia,
                            'omissao', false);
END;
$$;

-- 5.3 Listar as excepcoes da organizacao.
CREATE FUNCTION public.rpc_hr_custo_excecoes_listar(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_r jsonb;
BEGIN
  PERFORM public.hr_custo_exigir_leitura(p_organization_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('pessoa_id', x.pessoa_id, 'taxa_empresa', x.taxa_empresa,
                                               'updated_at', x.updated_at)
                            ORDER BY x.pessoa_id), '[]'::jsonb)
    INTO v_r
    FROM public.pessoas_custo_excecoes x
    JOIN public.pessoas p ON p.id = x.pessoa_id AND p.organization_id = x.organization_id
   WHERE x.organization_id = p_organization_id
     AND p.deleted_at IS NULL;
  RETURN v_r;
END;
$$;

-- 5.4 Definir (ou tirar, com p_taxa NULL) a excepcao de uma pessoa.
CREATE FUNCTION public.rpc_hr_custo_excecao_definir(p_pessoa_id uuid, p_organization_id uuid, p_taxa numeric)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew  uuid;
  v_taxa  numeric := round(p_taxa, 2);
  v_antes numeric;
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);

  IF p_taxa IS NOT NULL AND (v_taxa < 0 OR v_taxa > 100) THEN
    RAISE EXCEPTION 'taxa_invalida' USING ERRCODE = 'HRA73';
  END IF;

  -- A pessoa e da organizacao pedida e nao esta apagada (a mesma resposta para
  -- inexistente e de outra organizacao).
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  SELECT x.taxa_empresa INTO v_antes
    FROM public.pessoas_custo_excecoes x
   WHERE x.pessoa_id = p_pessoa_id AND x.organization_id = p_organization_id
   FOR UPDATE;

  IF p_taxa IS NULL THEN
    IF v_antes IS NULL THEN
      -- Nada a tirar: idempotente, sem evento.
      RETURN jsonb_build_object('pessoa_id', p_pessoa_id, 'taxa_empresa', NULL, 'alterada', false);
    END IF;
    DELETE FROM public.pessoas_custo_excecoes x
     WHERE x.pessoa_id = p_pessoa_id AND x.organization_id = p_organization_id;
    PERFORM public.hr_custo_evento(p_organization_id, p_pessoa_id, 'excecao', p_pessoa_id, 'excecao_removida', v_anew,
                                   jsonb_build_object('antes', v_antes));
    RETURN jsonb_build_object('pessoa_id', p_pessoa_id, 'taxa_empresa', NULL, 'alterada', true);
  END IF;

  INSERT INTO public.pessoas_custo_excecoes AS x
    (pessoa_id, organization_id, taxa_empresa, created_by, updated_by)
  VALUES
    (p_pessoa_id, p_organization_id, v_taxa, v_anew, v_anew)
  ON CONFLICT (pessoa_id) DO UPDATE
    SET taxa_empresa = EXCLUDED.taxa_empresa,
        updated_by   = EXCLUDED.updated_by;

  PERFORM public.hr_custo_evento(p_organization_id, p_pessoa_id, 'excecao', p_pessoa_id, 'excecao_definida', v_anew,
                                 jsonb_build_object('antes', v_antes, 'depois', v_taxa));
  RETURN jsonb_build_object('pessoa_id', p_pessoa_id, 'taxa_empresa', v_taxa, 'alterada', true);
END;
$$;

-- 5.5 Listar equipamentos (da organizacao, ou so de uma pessoa), por paginas.
--     Ordem estavel: entrega desc, created_at desc, id desc. Nao devolve quem criou.
CREATE FUNCTION public.rpc_hr_equipamentos_listar(
  p_organization_id uuid, p_pessoa_id uuid DEFAULT NULL, p_limite integer DEFAULT 500, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_limite_max constant integer := 1000;
  v_limite integer := least(greatest(coalesce(p_limite, 500), 1), c_limite_max);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_r      jsonb;
BEGIN
  PERFORM public.hr_custo_exigir_leitura(p_organization_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'pessoa_id', q.pessoa_id, 'tipo', q.tipo, 'descricao', q.descricao,
           'valor', q.valor, 'entrega', q.entrega,
           'conta_modo', q.conta_modo, 'conta_meses', q.conta_meses,
           'conta_inicio', q.conta_inicio, 'conta_fim', q.conta_fim,
           'estado', q.estado, 'devolucao', q.devolucao, 'estado_devolucao', q.estado_devolucao,
           'created_at', q.created_at, 'updated_at', q.updated_at)
         ORDER BY q.entrega DESC, q.created_at DESC, q.id DESC), '[]'::jsonb)
    INTO v_r
    FROM (
      SELECT e.id, e.pessoa_id, e.tipo, e.descricao, e.valor, e.entrega, e.conta_modo, e.conta_meses,
             e.conta_inicio, e.conta_fim, e.estado, e.devolucao, e.estado_devolucao, e.created_at, e.updated_at
        FROM public.pessoas_equipamentos e
        JOIN public.pessoas p ON p.id = e.pessoa_id AND p.organization_id = e.organization_id
       WHERE e.organization_id = p_organization_id
         AND (p_pessoa_id IS NULL OR e.pessoa_id = p_pessoa_id)
         AND p.deleted_at IS NULL
       ORDER BY e.entrega DESC, e.created_at DESC, e.id DESC
       LIMIT v_limite OFFSET v_offset
    ) q;
  RETURN v_r;
END;
$$;

-- 5.6 Atribuir um equipamento. Idempotente por p_id: o cliente gera o id e um
--     reenvio (duplo clique, nova tentativa) com o mesmo id devolve o existente,
--     sem segundo registo nem segundo evento. Sem p_id gera-se um novo.
CREATE FUNCTION public.rpc_hr_equipamento_atribuir(
  p_pessoa_id uuid, p_organization_id uuid, p_tipo text, p_descricao text, p_valor numeric, p_entrega date,
  p_conta_modo text DEFAULT 'repartido', p_conta_meses integer DEFAULT NULL,
  p_conta_inicio date DEFAULT NULL, p_conta_fim date DEFAULT NULL,
  p_id uuid DEFAULT gen_random_uuid())
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_por_pessoa constant integer := 200;
  v_anew  uuid;
  v_desc  text := btrim(p_descricao);
  v_valor numeric := round(p_valor, 2);
  v_c     record;
  v_id    uuid := coalesce(p_id, gen_random_uuid());
  v_exist record;
  v_n     integer;
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);

  -- A mesma ordem de validarEquipamento (equipamentos.ts).
  IF p_tipo IS NULL OR p_tipo NOT IN ('telemovel', 'portatil', 'viatura', 'fardamento', 'ferramentas', 'outro') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF v_desc IS NULL OR length(v_desc) < 1 OR length(v_desc) > 200 OR v_desc ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'descricao_invalida' USING ERRCODE = 'HRA65';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 OR v_valor >= 10000000000 THEN
    RAISE EXCEPTION 'valor_invalido' USING ERRCODE = 'HRA66';
  END IF;
  IF NOT public.hr_custo_data_valida(p_entrega) THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA67';
  END IF;
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar(p_conta_modo, p_conta_meses, p_conta_inicio, p_conta_fim);

  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Em fila por pessoa: o teto e a idempotencia nao passam a dois pedidos simultaneos.
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_equipamentos:' || p_pessoa_id::text, 0));

  -- Reenvio com um id que ja existe: devolve-o se for desta pessoa e organizacao;
  -- um id de outra pessoa ou organizacao e um pedido invalido (nao se revela nada).
  SELECT e.id, e.pessoa_id, e.organization_id INTO v_exist
    FROM public.pessoas_equipamentos e
   WHERE e.id = v_id;
  IF FOUND THEN
    IF v_exist.organization_id = p_organization_id AND v_exist.pessoa_id = p_pessoa_id THEN
      RETURN jsonb_build_object('id', v_exist.id, 'existente', true);
    END IF;
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  -- Teto por pessoa (atribuidos e devolvidos): protege a lista e a base de lixo.
  SELECT count(*) INTO v_n
    FROM public.pessoas_equipamentos e
   WHERE e.organization_id = p_organization_id AND e.pessoa_id = p_pessoa_id;
  IF v_n >= c_max_por_pessoa THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  INSERT INTO public.pessoas_equipamentos
    (id, organization_id, pessoa_id, tipo, descricao, valor, entrega,
     conta_modo, conta_meses, conta_inicio, conta_fim, created_by, updated_by)
  VALUES
    (v_id, p_organization_id, p_pessoa_id, p_tipo, v_desc, v_valor, p_entrega,
     v_c.modo, v_c.meses, v_c.inicio, v_c.fim, v_anew, v_anew)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    -- So por corrida com outra pessoa a usar o mesmo id (a fila e por pessoa).
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  PERFORM public.hr_custo_evento(p_organization_id, p_pessoa_id, 'equipamento', v_id, 'equipamento_atribuido', v_anew,
    jsonb_build_object('tipo', p_tipo, 'valor', v_valor, 'conta_modo', v_c.modo, 'conta_meses', v_c.meses));
  RETURN jsonb_build_object('id', v_id, 'existente', false);
END;
$$;

-- 5.7 Devolver um equipamento atribuido.
CREATE FUNCTION public.rpc_hr_equipamento_devolver(p_id uuid, p_organization_id uuid, p_data date, p_estado text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew uuid;
  v_e    record;
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);

  IF NOT public.hr_custo_data_valida(p_data) THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA67';
  END IF;

  SELECT e.id, e.pessoa_id, e.entrega, e.estado INTO v_e
    FROM public.pessoas_equipamentos e
    JOIN public.pessoas p ON p.id = e.pessoa_id AND p.organization_id = e.organization_id
   WHERE e.id = p_id AND e.organization_id = p_organization_id AND p.deleted_at IS NULL
   FOR UPDATE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  -- Ja devolvido (incluindo um segundo clique): nao se devolve duas vezes.
  IF v_e.estado <> 'atribuido' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  IF p_data < v_e.entrega THEN
    RAISE EXCEPTION 'devolucao_antes_entrega' USING ERRCODE = 'HRA71';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('bom', 'desgaste', 'danificado') THEN
    RAISE EXCEPTION 'estado_devolucao_invalido' USING ERRCODE = 'HRA72';
  END IF;

  UPDATE public.pessoas_equipamentos
     SET estado = 'devolvido', devolucao = p_data, estado_devolucao = p_estado, updated_by = v_anew
   WHERE id = v_e.id;

  PERFORM public.hr_custo_evento(p_organization_id, v_e.pessoa_id, 'equipamento', v_e.id, 'equipamento_devolvido', v_anew,
                                 jsonb_build_object('devolucao', p_data, 'estado_devolucao', p_estado));
  RETURN jsonb_build_object('id', v_e.id, 'estado', 'devolvido', 'devolucao', p_data, 'estado_devolucao', p_estado);
END;
$$;

-- 5.8 Mudar o "como conta" (passa a valer em todos os meses, ja).
CREATE FUNCTION public.rpc_hr_equipamento_alterar_conta(
  p_id uuid, p_organization_id uuid, p_modo text, p_meses integer DEFAULT NULL,
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew uuid;
  v_c    record;
  v_e    record;
BEGIN
  v_anew := public.hr_custo_exigir_escrita(p_organization_id);
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar(p_modo, p_meses, p_inicio, p_fim);

  SELECT e.id, e.pessoa_id, e.conta_modo, e.conta_meses, e.conta_inicio, e.conta_fim INTO v_e
    FROM public.pessoas_equipamentos e
    JOIN public.pessoas p ON p.id = e.pessoa_id AND p.organization_id = e.organization_id
   WHERE e.id = p_id AND e.organization_id = p_organization_id AND p.deleted_at IS NULL
   FOR UPDATE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  UPDATE public.pessoas_equipamentos
     SET conta_modo = v_c.modo, conta_meses = v_c.meses, conta_inicio = v_c.inicio, conta_fim = v_c.fim,
         updated_by = v_anew
   WHERE id = v_e.id;

  PERFORM public.hr_custo_evento(p_organization_id, v_e.pessoa_id, 'equipamento', v_e.id, 'equipamento_conta_alterada', v_anew,
    jsonb_build_object(
      'antes',  jsonb_build_object('conta_modo', v_e.conta_modo, 'conta_meses', v_e.conta_meses,
                                   'conta_inicio', v_e.conta_inicio, 'conta_fim', v_e.conta_fim),
      'depois', jsonb_build_object('conta_modo', v_c.modo, 'conta_meses', v_c.meses,
                                   'conta_inicio', v_c.inicio, 'conta_fim', v_c.fim)));
  RETURN jsonb_build_object('id', v_e.id, 'conta_modo', v_c.modo, 'conta_meses', v_c.meses,
                            'conta_inicio', v_c.inicio, 'conta_fim', v_c.fim);
END;
$$;

-- ==============================================================================
-- 6. EXECUTE explicito (o Supabase da EXECUTE por omissao a anon e authenticated)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.hr_custo_eventos_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_custo_definicoes_omissao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_custo_data_valida(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_custo_conta_normalizar(text, integer, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_custo_exigir_leitura(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_custo_exigir_escrita(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_custo_evento(uuid, uuid, text, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_hr_custo_definicoes_ler(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_custo_definicoes_guardar(uuid, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_custo_excecoes_listar(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_custo_excecao_definir(uuid, uuid, numeric) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamentos_listar(uuid, uuid, integer, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamento_devolver(uuid, uuid, date, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_equipamento_alterar_conta(uuid, uuid, text, integer, date, date) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_hr_custo_definicoes_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_custo_definicoes_guardar(uuid, numeric, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_custo_excecoes_listar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_custo_excecao_definir(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamentos_listar(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamento_devolver(uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_equipamento_alterar_conta(uuid, uuid, text, integer, date, date) TO authenticated;

COMMENT ON FUNCTION public.hr_custo_definicoes_omissao() IS
'INTERNA. As omissoes das definicoes de custo (23.75, 5, 0.40, 25); tem de coincidir com os DEFAULT de hr_custo_definicoes (conferido na migration). Desde 20270104500000.';
COMMENT ON FUNCTION public.hr_custo_conta_normalizar(text, integer, date, date) IS
'INTERNA. Normaliza e valida o como conta (normalizarConta + validarConta do ecra): modo NULL = repartido; repartido sem meses = 36, fora de 1..120 HRA68; todosMeses sem inicio HRA69, inicio ou fim infinitos ou fora de 2000-01-01..hoje+10 anos HRA67, fim antes do inicio HRA70; inicio e fim levados ao dia 1 do mes; campos que o modo nao usa ficam NULL; modo desconhecido HRA10. STABLE (usa current_date). Desde 20270104500000.';
COMMENT ON FUNCTION public.hr_custo_data_valida(date) IS
'INTERNA. true se a data nao e nula, e finita e esta entre 2000-01-01 e hoje + 10 anos. Desde 20270104500000.';
COMMENT ON FUNCTION public.hr_custo_exigir_leitura(uuid) IS
'INTERNA. Sessao e hr.pessoas.retribuicao.view na organizacao pedida, senao 42501. Desde 20270104500000.';
COMMENT ON FUNCTION public.hr_custo_exigir_escrita(uuid) IS
'INTERNA. Sessao, hr.pessoas.retribuicao.view e .edit e utilizador da aplicacao (42501), organizacao empregadora (HRA33) e no maximo 120 escritas por hora por actor em hr_custo_eventos (HRA41, em fila por actor). Devolve anew_users.id. Desde 20270104500000.';
COMMENT ON FUNCTION public.hr_custo_evento(uuid, uuid, text, uuid, text, uuid, jsonb) IS
'INTERNA. Acrescenta um evento a hr_custo_eventos com ator_auth_uid = auth.uid(). Desde 20270104500000.';

COMMENT ON FUNCTION public.rpc_hr_custo_definicoes_ler(uuid) IS
'RH (authenticated). Devolve {taxa_empresa, seguro, valor_km, ajuda_dia, omissao, updated_at} da organizacao (as omissoes, com omissao=true, se nao ha linha). Exige hr.pessoas.retribuicao.view (42501). Desde 20270104500000.';
COMMENT ON FUNCTION public.rpc_hr_custo_definicoes_guardar(uuid, numeric, numeric, numeric, numeric) IS
'RH (authenticated). Guarda as quatro definicoes de uma vez (upsert), arredondadas ao centimo. Exige hr.pessoas.retribuicao.edit (42501) e organizacao empregadora (HRA33). Recusas: taxa_invalida HRA73 (taxa ou seguro fora de 0..100), valor_unitario_invalido HRA74 (km ou dia negativo/nulo), limite_excedido HRA41. Regista antes/depois em hr_custo_eventos. Desde 20270104500000.';
COMMENT ON FUNCTION public.rpc_hr_custo_excecoes_listar(uuid) IS
'RH (authenticated). Devolve [{pessoa_id, taxa_empresa, updated_at}] das pessoas nao apagadas da organizacao. Exige hr.pessoas.retribuicao.view (42501). Desde 20270104500000.';
COMMENT ON FUNCTION public.rpc_hr_custo_excecao_definir(uuid, uuid, numeric) IS
'RH (authenticated). p_taxa NULL tira a excepcao (idempotente: alterada=false se nao havia); senao upsert (0..100, ao centimo). A pessoa tem de ser da organizacao e nao apagada (HRA31). Exige hr.pessoas.retribuicao.edit (42501), organizacao empregadora (HRA33). Recusas: taxa_invalida HRA73, limite_excedido HRA41. Devolve {pessoa_id, taxa_empresa, alterada}. Desde 20270104500000.';
COMMENT ON FUNCTION public.rpc_hr_equipamentos_listar(uuid, uuid, integer, integer) IS
'RH (authenticated). Devolve uma pagina dos equipamentos da organizacao (ou so de p_pessoa_id), pessoas nao apagadas, ordem estavel entrega desc, created_at desc, id desc; p_limite 500 por omissao (1..1000), p_offset >= 0. Todos os campos excepto quem criou (sem created_by nem autor_nome). Exige hr.pessoas.retribuicao.view (42501). Desde 20270104500000.';
COMMENT ON FUNCTION public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid) IS
'RH (authenticated). Atribui um equipamento; devolve {id, existente}. Idempotente por p_id (gerado no cliente): um id ja existente desta pessoa e organizacao devolve-se com existente=true, sem novo evento; de outra pessoa/organizacao HRA10. Teto de 200 equipamentos por pessoa (HRA41). Exige hr.pessoas.retribuicao.view e .edit (42501), organizacao empregadora (HRA33). Recusas: pedido_invalido HRA10 (tipo ou modo desconhecido), descricao_invalida HRA65 (vazia, mais de 200 ou com caracteres de controlo), valor_invalido HRA66, data_invalida HRA67 (entrega ou datas da conta infinitas ou fora de 2000-01-01..hoje+10 anos), meses_invalidos HRA68, conta_sem_inicio HRA69, conta_fim_antes_inicio HRA70, nao_encontrado HRA31 (pessoa), limite_excedido HRA41. Desde 20270104500000.';
COMMENT ON FUNCTION public.rpc_hr_equipamento_devolver(uuid, uuid, date, text) IS
'RH (authenticated). Devolve um equipamento atribuido (bom, desgaste, danificado). Exige hr.pessoas.retribuicao.view e .edit (42501), organizacao empregadora (HRA33). Recusas: data_invalida HRA67 (nula, infinita ou fora de 2000-01-01..hoje+10 anos), nao_encontrado HRA31 (tambem com a pessoa apagada), estado_invalido HRA38 (ja devolvido), devolucao_antes_entrega HRA71, estado_devolucao_invalido HRA72, limite_excedido HRA41. Desde 20270104500000.';
COMMENT ON FUNCTION public.rpc_hr_equipamento_alterar_conta(uuid, uuid, text, integer, date, date) IS
'RH (authenticated). Muda so o como conta de um equipamento (atribuido ou devolvido); vale para todos os meses, ja. As regras de hr_custo_conta_normalizar (HRA10, HRA67, HRA68, HRA69, HRA70). Exige hr.pessoas.retribuicao.view e .edit (42501), organizacao empregadora (HRA33). Recusas: nao_encontrado HRA31 (tambem com a pessoa apagada), limite_excedido HRA41. Desde 20270104500000.';

-- ==============================================================================
-- 7. Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_tabs text[] := ARRAY['public.hr_custo_definicoes', 'public.pessoas_custo_excecoes',
                         'public.pessoas_equipamentos', 'public.hr_custo_eventos'];
  v_rpcs text[] := ARRAY[
    'public.rpc_hr_custo_definicoes_ler(uuid)',
    'public.rpc_hr_custo_definicoes_guardar(uuid, numeric, numeric, numeric, numeric)',
    'public.rpc_hr_custo_excecoes_listar(uuid)',
    'public.rpc_hr_custo_excecao_definir(uuid, uuid, numeric)',
    'public.rpc_hr_equipamentos_listar(uuid, uuid, integer, integer)',
    'public.rpc_hr_equipamento_atribuir(uuid, uuid, text, text, numeric, date, text, integer, date, date, uuid)',
    'public.rpc_hr_equipamento_devolver(uuid, uuid, date, text)',
    'public.rpc_hr_equipamento_alterar_conta(uuid, uuid, text, integer, date, date)'];
  v_internas text[] := ARRAY[
    'public.hr_custo_eventos_imutavel()',
    'public.hr_custo_definicoes_omissao()',
    'public.hr_custo_data_valida(date)',
    'public.hr_custo_conta_normalizar(text, integer, date, date)',
    'public.hr_custo_exigir_leitura(uuid)',
    'public.hr_custo_exigir_escrita(uuid)',
    'public.hr_custo_evento(uuid, uuid, text, uuid, text, uuid, jsonb)'];
  v_tab   text;
  v_fn    text;
  v_col   text;
  v_papel text;
  v_priv  text;
  v_oid   oid;
  v_expr  text;
  v_num   numeric;
  v_omis  jsonb := public.hr_custo_definicoes_omissao();
  v_c     record;
  v_lidos text[];
  v_n     integer;
BEGIN
  -- 1. RLS ligada e forcada; nenhum papel da API tem privilegio de tabela nem de
  --    coluna (o conjunto esperado de colunas concedidas e vazio, para todas as
  --    colunas de hoje e para as futuras).
  FOREACH v_tab IN ARRAY v_tabs LOOP
    v_oid := to_regclass(v_tab);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Conferir: a tabela % nao foi criada.', v_tab;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = v_oid AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'Conferir: % nao tem RLS ligada e forcada.', v_tab;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = v_oid) THEN
      RAISE EXCEPTION 'Conferir: % tem politicas; o desenho e sem nenhuma.', v_tab;
    END IF;
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_papel, v_oid, v_priv) THEN
          RAISE EXCEPTION 'Conferir: % tem % em %.', v_papel, v_priv, v_tab;
        END IF;
      END LOOP;
      FOR v_col IN
        SELECT a.attname::text FROM pg_attribute a
         WHERE a.attrelid = v_oid AND a.attnum > 0 AND NOT a.attisdropped
      LOOP
        FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
          IF has_column_privilege(v_papel, v_oid, v_col, v_priv) THEN
            RAISE EXCEPTION 'Conferir: % tem % na coluna %.%.', v_papel, v_priv, v_tab, v_col;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  -- 2. EXECUTE: as RPCs so para authenticated; as internas para ninguem.
  FOREACH v_fn IN ARRAY v_rpcs LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a RPC % nao existe.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % devia ser so de authenticated.', v_fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % nao existe.', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % tem EXECUTE para alguem.', v_fn;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % nao devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;

  -- 3. Todas as funcoes novas com search_path fixo e vazio.
  FOREACH v_fn IN ARRAY v_rpcs || v_internas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % nao tem search_path vazio.', v_fn;
    END IF;
  END LOOP;

  -- 4. Os DEFAULT das definicoes sao as omissoes de hr_custo_definicoes_omissao().
  FOREACH v_col IN ARRAY ARRAY['taxa_empresa', 'seguro', 'valor_km', 'ajuda_dia'] LOOP
    SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_expr
      FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = to_regclass('public.hr_custo_definicoes') AND a.attname::text = v_col;
    IF v_expr IS NULL THEN
      RAISE EXCEPTION 'Conferir: hr_custo_definicoes.% nao tem DEFAULT.', v_col;
    END IF;
    EXECUTE format('SELECT (%s)::numeric', v_expr) INTO v_num;
    IF v_num IS DISTINCT FROM (v_omis ->> v_col)::numeric THEN
      RAISE EXCEPTION 'Conferir: o DEFAULT de hr_custo_definicoes.% difere da omissao.', v_col;
    END IF;
  END LOOP;

  -- 5. As restricoes de pessoas_equipamentos e as FK compostas existem.
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_equipamentos') AND c.contype::text IN ('c', 'f')
     AND c.conname::text IN ('pessoas_equipamentos_pessoa_fkey', 'pessoas_equipamentos_tipo_valido',
                             'pessoas_equipamentos_descricao', 'pessoas_equipamentos_valor',
                             'pessoas_equipamentos_conta_modo_valido', 'pessoas_equipamentos_conta_coerente',
                             'pessoas_equipamentos_conta_dia_um', 'pessoas_equipamentos_estado_valido',
                             'pessoas_equipamentos_estado_devolucao_valido', 'pessoas_equipamentos_devolucao_coerente',
                             'pessoas_equipamentos_datas_intervalo');
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 11 restricoes em pessoas_equipamentos; ha %.', v_n;
  END IF;
  -- hr_custo_eventos.ator_id fica sem FK (o SET NULL chocava com a imutabilidade).
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.conrelid = to_regclass('public.hr_custo_eventos') AND c.contype::text = 'f'
                AND c.conkey @> ARRAY[(SELECT a.attnum FROM pg_attribute a
                                        WHERE a.attrelid = to_regclass('public.hr_custo_eventos')
                                          AND a.attname::text = 'ator_id')]) THEN
    RAISE EXCEPTION 'Conferir: hr_custo_eventos.ator_id tem uma FK; devia ficar solto.';
  END IF;
  -- O CHECK das datas e o dos caracteres de controlo, por comportamento sobre a
  -- definicao (sem escrever): infinity e um tab na descricao ficam de fora.
  IF position('[[:cntrl:]]' IN coalesce((SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
                                          WHERE c.conrelid = to_regclass('public.pessoas_equipamentos')
                                            AND c.conname::text = 'pessoas_equipamentos_descricao'), '')) = 0 THEN
    RAISE EXCEPTION 'Conferir: o CHECK da descricao nao recusa caracteres de controlo.';
  END IF;
  IF public.hr_custo_data_valida('infinity'::date) OR public.hr_custo_data_valida('-infinity'::date)
     OR public.hr_custo_data_valida(DATE '1999-12-31') OR public.hr_custo_data_valida(NULL)
     OR public.hr_custo_data_valida((current_date + interval '10 years 1 day')::date)
     OR NOT public.hr_custo_data_valida(DATE '2000-01-01') OR NOT public.hr_custo_data_valida(current_date) THEN
    RAISE EXCEPTION 'Conferir: hr_custo_data_valida nao da os valores esperados.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_custo_excecoes')
                    AND c.conname::text = 'pessoas_custo_excecoes_pessoa_fkey' AND c.contype::text = 'f') THEN
    RAISE EXCEPTION 'Conferir: falta a FK composta de pessoas_custo_excecoes.';
  END IF;

  -- 6. Os triggers novos estao activos.
  SELECT array_agg(t.tgname::text ORDER BY t.tgname::text) INTO v_lidos
    FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgname::text IN ('trg_hr_custo_definicoes_updated_at', 'trg_pessoas_custo_excecoes_updated_at',
                            'trg_pessoas_equipamentos_updated_at', 'trg_hr_custo_eventos_sem_alterar',
                            'trg_hr_custo_eventos_sem_truncate');
  IF coalesce(array_length(v_lidos, 1), 0) <> 5 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 5 triggers activos; ha %.', coalesce(array_to_string(v_lidos, ','), '(nenhum)');
  END IF;

  -- 7. O como conta, por comportamento (funcao pura; nada se escreve).
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar('umaVez', 5, DATE '2026-09-15', DATE '2026-10-15');
  IF v_c.modo <> 'umaVez' OR v_c.meses IS NOT NULL OR v_c.inicio IS NOT NULL OR v_c.fim IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: umaVez devia limpar meses, inicio e fim.';
  END IF;
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar(NULL, NULL, DATE '2026-09-15', NULL);
  IF v_c.modo <> 'repartido' OR v_c.meses IS DISTINCT FROM 36 OR v_c.inicio IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: sem modo devia dar repartido por 36 meses.';
  END IF;
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar('todosMeses', 1, DATE '2026-09-15', DATE '2026-12-31');
  IF v_c.modo <> 'todosMeses' OR v_c.meses IS NOT NULL
     OR v_c.inicio IS DISTINCT FROM DATE '2026-09-01' OR v_c.fim IS DISTINCT FROM DATE '2026-12-01' THEN
    RAISE EXCEPTION 'Conferir: todosMeses devia levar inicio e fim ao dia 1 e limpar meses.';
  END IF;
  SELECT * INTO v_c FROM public.hr_custo_conta_normalizar('todosMeses', NULL, DATE '2026-09-15', DATE '2026-09-02');
  IF v_c.fim IS DISTINCT FROM DATE '2026-09-01' THEN
    RAISE EXCEPTION 'Conferir: fim no mesmo mes do inicio devia ser aceite.';
  END IF;

  BEGIN
    PERFORM public.hr_custo_conta_normalizar('repartido', 121, NULL, NULL);
    RAISE EXCEPTION 'Conferir: repartido por 121 meses devia ser recusado.';
  EXCEPTION WHEN SQLSTATE 'HRA68' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_custo_conta_normalizar('repartido', 0, NULL, NULL);
    RAISE EXCEPTION 'Conferir: repartido por 0 meses devia ser recusado.';
  EXCEPTION WHEN SQLSTATE 'HRA68' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_custo_conta_normalizar('todosMeses', NULL, NULL, NULL);
    RAISE EXCEPTION 'Conferir: todosMeses sem inicio devia ser recusado.';
  EXCEPTION WHEN SQLSTATE 'HRA69' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_custo_conta_normalizar('todosMeses', NULL, DATE '2026-09-01', DATE '2026-08-31');
    RAISE EXCEPTION 'Conferir: fim antes do inicio devia ser recusado.';
  EXCEPTION WHEN SQLSTATE 'HRA70' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_custo_conta_normalizar('semanal', NULL, NULL, NULL);
    RAISE EXCEPTION 'Conferir: um modo desconhecido devia ser recusado.';
  EXCEPTION WHEN SQLSTATE 'HRA10' THEN NULL;
  END;
  -- infinity e datas fora do intervalo dao HRA67 (nunca 23514 nem outro erro).
  BEGIN
    PERFORM public.hr_custo_conta_normalizar('todosMeses', NULL, 'infinity'::date, NULL);
    RAISE EXCEPTION 'Conferir: inicio infinity devia dar HRA67.';
  EXCEPTION WHEN SQLSTATE 'HRA67' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_custo_conta_normalizar('todosMeses', NULL, DATE '2026-09-01', 'infinity'::date);
    RAISE EXCEPTION 'Conferir: fim infinity devia dar HRA67.';
  EXCEPTION WHEN SQLSTATE 'HRA67' THEN NULL;
  END;
  BEGIN
    PERFORM public.hr_custo_conta_normalizar('todosMeses', NULL, DATE '1999-12-01', NULL);
    RAISE EXCEPTION 'Conferir: inicio antes de 2000 devia dar HRA67.';
  EXCEPTION WHEN SQLSTATE 'HRA67' THEN NULL;
  END;

  RAISE NOTICE 'OK: custos do RH (4 tabelas com RLS forcada e sem privilegios, 8 RPCs so de authenticated, 7 internas sem EXECUTE), omissoes, datas e como conta conferidos.';
END;
$conferir$;
