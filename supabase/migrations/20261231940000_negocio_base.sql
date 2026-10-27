-- Negócio (Fase 2.1 da migração da Emylia; plano em Olyvia2.0 docs/14-plano-migracao-olyvia.md, decisões 10 e 11).
--
-- As tabelas do Negócio da v2 (Olyvia 2.0, docs/base-de-dados/sql/03 a 05), ligadas às do CRM. Só acrescenta.
--   v2 organizacoes → anew_organizations · utilizadores/membros → anew_users · fichas → anew_entities (a pessoa do CRM)
--   v2 negocios → o negocios do CRM (colunas novas) · servicos/produtos/perfis → services/products/ops_skill (do Catálogo)
-- Não se usam quotes, proposals nem client_contracts: os automatismos deles (proposta automática, stock e pedido ao fornecedor
-- no contrato, conversão da lead) não disparam no fluxo novo; a encomenda sai no 1.º pagamento validado (decisão 10).
-- Sem JSON a guardar estado: o que na v2 era jsonb (parâmetros congelados do custo, detalhe da receita, cláusulas) tem tabela.
-- Leitura: quem tem pessoas.view na organização; os custos e as margens só com quotes.view_costs. Escrita: só pelas funções
-- (Fase 2.3); aqui nenhuma tabela nova aceita escritas diretas.
-- Ficam para depois: a demolição e o entulho do orçamento, as fotografias (ficheiros) e as Operações (Fase 3).

SET lock_timeout = '5s';

-- ------------------------------------------------------------------ chaves compostas para as ligações por organização
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['negocios','services','products','ops_skill'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_id_org_key') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (id, organization_id)', t, t || '_id_org_key');
    END IF;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------ negocios: o que a Emylia guarda no negócio
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fase smallint CHECK (fase IS NULL OR fase BETWEEN 0 AND 5);
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS linha text CHECK (linha IS NULL OR linha IN ('wc','coz','geral'));
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS linha_por_definir boolean NOT NULL DEFAULT false;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS servico_pedido text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS morada_obra text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS pedido_em timestamptz;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS dono_papel text CHECK (dono_papel IS NULL OR dono_papel IN ('comercial','financeiro','operacoes','juridico','direcao','tecnico','armazem','cliente'));
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS venda_direta boolean NOT NULL DEFAULT false;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS anulado_em timestamptz;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS anulado_por text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS anulado_motivo text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS anulado_origem text CHECK (anulado_origem IS NULL OR anulado_origem IN ('negocio','inventario'));
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fluxo_emylia boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.negocios.fase IS 'A fase do fluxo da Emylia: 0 Por contactar, 1 Contacto, 2 Visita, 3 Negócio, 4 Financeiro, 5 Obra.';
COMMENT ON COLUMN public.negocios.numero IS 'O número do negócio na organização (1050, 1051…). Dado sozinho ao criar.';
COMMENT ON COLUMN public.negocios.morada_obra IS 'A morada da obra (decisão 3: fica no negócio; copia-se para o levantamento ao fechar).';
COMMENT ON COLUMN public.negocios.dono_papel IS 'Quem tem o próximo passo, pelo papel (o motor da Emylia). O comercial responsável é assigned_to.';
COMMENT ON COLUMN public.negocios.fluxo_emylia IS 'O negócio segue o fluxo da Emylia (orçamento, contrato e financeiro nas tabelas novas).';
CREATE UNIQUE INDEX IF NOT EXISTS negocios_org_numero_key ON public.negocios (organization_id, numero) WHERE numero IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_negocios_numero() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('negocios_numero:' || NEW.organization_id::text, 0));
    SELECT coalesce(max(numero), 1000) + 1 INTO NEW.numero FROM public.negocios WHERE organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_negocios_numero' AND tgrelid = 'public.negocios'::regclass) THEN
    CREATE TRIGGER trg_negocios_numero BEFORE INSERT ON public.negocios FOR EACH ROW EXECUTE FUNCTION public.fn_negocios_numero();
  END IF;
END $do$;

-- ------------------------------------------------------------------ 03 respostas, visitas e necessidades
CREATE TABLE IF NOT EXISTS public.negocio_respostas (
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  campo_chave     text NOT NULL CHECK (length(btrim(campo_chave)) > 0),
  divisao         text NOT NULL DEFAULT '',
  valor           text NOT NULL,
  sugerido        boolean NOT NULL DEFAULT false,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  PRIMARY KEY (negocio_id, campo_chave, divisao),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.negocio_respostas IS 'As respostas aos campos das fases (chaves de campos.ts da Emylia), uma linha por campo e por divisão.';

CREATE TABLE IF NOT EXISTS public.visitas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  numero          smallint NOT NULL CHECK (numero > 0),
  marcada_para    timestamptz,
  utilizador_id   uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  schedule_item_id uuid REFERENCES public.schedule_items(id) ON DELETE SET NULL,
  estado          text NOT NULL DEFAULT 'marcada' CHECK (estado IN ('marcada','feita','cancelada')),
  feita_em        timestamptz,
  cancelada_motivo text,
  UNIQUE (negocio_id, numero),
  UNIQUE (id, organization_id),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE,
  CHECK ((estado = 'feita') = (feita_em IS NOT NULL))
);
COMMENT ON TABLE public.visitas IS 'As visitas do negócio (1.ª, 2.ª…). Os campos de cada visita estão em negocio_respostas (v<n>_…). Ligam-se à agenda do CRM por schedule_item_id.';

CREATE TABLE IF NOT EXISTS public.negocio_medidas (
  organization_id uuid NOT NULL,
  negocio_id      uuid PRIMARY KEY,
  pav             numeric(10,2) NOT NULL DEFAULT 0 CHECK (pav >= 0),
  par             numeric(10,2) NOT NULL DEFAULT 0 CHECK (par >= 0),
  ptf             numeric(6,0)  NOT NULL DEFAULT 0 CHECK (ptf >= 0),
  ptq             numeric(6,0)  NOT NULL DEFAULT 0 CHECK (ptq >= 0),
  pts             numeric(6,0)  NOT NULL DEFAULT 0 CHECK (pts >= 0),
  pcs             numeric(6,0)  NOT NULL DEFAULT 0 CHECK (pcs >= 0),
  necessidades    text[] NOT NULL DEFAULT '{}',
  slot            text,
  fotos_exterior  smallint NOT NULL DEFAULT 0 CHECK (fotos_exterior >= 0),
  fotos_interior  smallint NOT NULL DEFAULT 0 CHECK (fotos_interior >= 0),
  fotos_area      smallint NOT NULL DEFAULT 0 CHECK (fotos_area >= 0),
  fechada         boolean NOT NULL DEFAULT false,
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.negocio_medidas IS 'O que a visita decide: medidas (pts é o total dos pontos de água; ptf e ptq os pedidos), necessidades, fotografias por etapa e se a visita fechou.';

CREATE TABLE IF NOT EXISTS public.negocio_servicos (
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  servico_id      uuid NOT NULL,
  inclusao        text NOT NULL CHECK (inclusao IN ('pacote','fora','extra')),
  quantidade      numeric(12,3),
  mantem          boolean,
  cliente_compra  text,
  PRIMARY KEY (negocio_id, servico_id),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (servico_id, organization_id) REFERENCES public.services(id, organization_id),
  CHECK ((inclusao = 'extra') = (quantidade IS NOT NULL AND quantidade > 0))
);

CREATE TABLE IF NOT EXISTS public.negocio_produtos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  produto_id      uuid NOT NULL,
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  cliente_fornece boolean NOT NULL DEFAULT false,
  servico_id      uuid,
  sem_instalacao  boolean NOT NULL DEFAULT false,
  ordem           integer NOT NULL DEFAULT 0,
  UNIQUE (negocio_id, produto_id),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id, organization_id) REFERENCES public.products(id, organization_id),
  FOREIGN KEY (servico_id, organization_id) REFERENCES public.services(id, organization_id)
);

-- ------------------------------------------------------------------ 04 orçamentos (cada linha é uma versão da proposta)
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  negocio_id        uuid NOT NULL,
  versao            smallint NOT NULL DEFAULT 1 CHECK (versao > 0),
  estado            text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','enviado','aceite','substituido','recusado','anulado')),
  modelo            text NOT NULL,
  desconto          numeric(7,4) NOT NULL DEFAULT 0 CHECK (desconto BETWEEN 0 AND 1),
  venda_direta      boolean NOT NULL DEFAULT false,
  inicio_obra       date,
  equipa            smallint NOT NULL DEFAULT 1 CHECK (equipa BETWEEN 1 AND 4),
  verificado_em     timestamptz,
  aprovacao         text CHECK (aprovacao IN ('pedida','aprovada','recusada')),
  aprovacao_por     uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  aprovacao_em      timestamptz,
  justificacao_margem text,
  motivos_versao    text[] NOT NULL DEFAULT '{}',
  nota_versao       text,
  onde_refeita      text CHECK (onde_refeita IN ('orcamento','visita')),
  pedido_cliente_motivos text[],
  pedido_cliente_nota    text,
  pedido_cliente_em      timestamptz,
  recusa_motivos    text[],
  recusa_nota       text,
  recusada_em       timestamptz,
  enviado_em        timestamptz,
  enviado_por       uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  aceite_em         timestamptz,
  substituido_em    timestamptz,
  preco_total       numeric(14,2),
  preco_final       numeric(14,2),
  horas_total       numeric(10,2),
  base_mao_obra     numeric(14,2),
  base_materiais    numeric(14,2),
  iva_mao_obra      numeric(14,2),
  iva_materiais     numeric(14,2),
  total_com_iva     numeric(14,2),
  prazo_dias        smallint,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negocio_id, versao),
  UNIQUE (id, organization_id),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE,
  CHECK (estado <> 'rascunho' OR enviado_em IS NULL),
  CHECK (estado NOT IN ('enviado','aceite','recusado','substituido') OR (enviado_em IS NOT NULL AND preco_final IS NOT NULL AND total_com_iva IS NOT NULL)),
  CHECK ((estado = 'aceite') = (aceite_em IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS orcamentos_um_aberto ON public.orcamentos (negocio_id) WHERE estado IN ('rascunho','enviado');
CREATE UNIQUE INDEX IF NOT EXISTS orcamentos_um_aceite ON public.orcamentos (negocio_id) WHERE estado = 'aceite';
COMMENT ON TABLE public.orcamentos IS 'Uma versão da proposta. Enquanto rascunho refaz-se; ao enviar congela (linhas com custo e preço por unidade, totais aqui).';

-- O custo e a margem congelados (só quotes.view_costs). Os parâmetros usados ficam em orcamento_parametros (sem JSON).
CREATE TABLE IF NOT EXISTS public.orcamento_custos (
  organization_id   uuid NOT NULL,
  orcamento_id      uuid PRIMARY KEY,
  custo_total       numeric(14,2) NOT NULL,
  ajuste_prazo      numeric(14,2) NOT NULL DEFAULT 0,
  margem            numeric(7,4) NOT NULL,
  mao_obra          numeric(14,2) NOT NULL DEFAULT 0,
  estrutura         numeric(14,2) NOT NULL DEFAULT 0,
  equipamentos      numeric(14,2) NOT NULL DEFAULT 0,
  consumiveis       numeric(14,2) NOT NULL DEFAULT 0,
  materiais         numeric(14,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.orcamento_parametros (
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  chave           text NOT NULL CHECK (length(btrim(chave)) > 0),
  valor           numeric(16,6) NOT NULL,
  PRIMARY KEY (orcamento_id, chave),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.orcamento_parametros IS 'Os parâmetros usados no custo congelado (margem mínima e alvo, IVA, €/h de estrutura, meses, TSU…), um por linha.';

CREATE TABLE IF NOT EXISTS public.orcamento_linhas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  ordem           integer NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('servico','materiais_modelo','produto','cliente_fornece','levantamento','demolicao','livre')),
  servico_id      uuid,
  produto_id      uuid,
  efeito_chave    text,
  descricao       text NOT NULL,
  unidade         text,
  quantidade      numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantidade >= 0),
  preco_un        numeric(14,4) NOT NULL DEFAULT 0 CHECK (preco_un >= 0),
  horas_un        numeric(10,4) NOT NULL DEFAULT 0 CHECK (horas_un >= 0),
  preco_manual    boolean NOT NULL DEFAULT false,
  fase            smallint CHECK (fase BETWEEN 1 AND 4),
  parte_iva       text NOT NULL CHECK (parte_iva IN ('mao_obra','materiais')),
  taxa_iva        smallint CHECK (taxa_iva IN (6, 13, 23)),
  fornecedor      text,
  preco           numeric(14,2) GENERATED ALWAYS AS (round(quantidade * preco_un, 2)) STORED,
  horas           numeric(10,2) GENERATED ALWAYS AS (round(quantidade * horas_un, 2)) STORED,
  UNIQUE (orcamento_id, ordem),
  UNIQUE (id, organization_id),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (servico_id, organization_id) REFERENCES public.services(id, organization_id),
  FOREIGN KEY (produto_id, organization_id) REFERENCES public.products(id, organization_id),
  CHECK ((tipo = 'servico') = (servico_id IS NOT NULL)),
  CHECK (tipo <> 'cliente_fornece' OR preco_un = 0)
);
COMMENT ON COLUMN public.orcamento_linhas.taxa_iva IS 'A taxa de IVA da linha quando não é a da parte (serviço 6 %, materiais 23 %); ex.: subempreitada de materiais a 23 %.';

-- O custo da linha (só quotes.view_costs), congelado no envio: por unidade, partido nas parcelas, e os ofícios em orcamento_linha_oficios.
CREATE TABLE IF NOT EXISTS public.orcamento_linha_custos (
  organization_id uuid NOT NULL,
  linha_id        uuid PRIMARY KEY,
  custo_un        numeric(14,4) NOT NULL DEFAULT 0 CHECK (custo_un >= 0),
  horas_un        numeric(10,4) NOT NULL DEFAULT 0,
  mao_obra_un     numeric(14,4) NOT NULL DEFAULT 0,
  estrutura_un    numeric(14,4) NOT NULL DEFAULT 0,
  equipamentos_un numeric(14,4) NOT NULL DEFAULT 0,
  consumiveis_un  numeric(14,4) NOT NULL DEFAULT 0,
  ajuste_un       numeric(14,4) NOT NULL DEFAULT 0,
  estrutura_hora  numeric(14,4),
  manual          boolean NOT NULL DEFAULT false,
  congelado_em    timestamptz,
  FOREIGN KEY (linha_id, organization_id) REFERENCES public.orcamento_linhas(id, organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.orcamento_linha_oficios (
  organization_id uuid NOT NULL,
  linha_id        uuid NOT NULL,
  ordem           smallint NOT NULL,
  perfil_chave    text NOT NULL,
  nome            text NOT NULL,
  horas_un        numeric(10,4) NOT NULL DEFAULT 0,
  custo_hora      numeric(14,4) NOT NULL DEFAULT 0,
  tecnicos        text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (linha_id, ordem),
  FOREIGN KEY (linha_id, organization_id) REFERENCES public.orcamento_linhas(id, organization_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.orcamento_linha_oficios IS 'Os ofícios do custo congelado da linha: horas por unidade e €/h de cada perfil no dia do envio.';

CREATE TABLE IF NOT EXISTS public.orcamento_zonas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  ordem           smallint NOT NULL,
  nome            text NOT NULL CHECK (btrim(nome) <> ''),
  UNIQUE (id, organization_id),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_zonas_nome ON public.orcamento_zonas (orcamento_id, lower(btrim(nome)));
CREATE TABLE IF NOT EXISTS public.orcamento_linha_zonas (
  organization_id uuid NOT NULL,
  linha_id        uuid NOT NULL,
  zona_id         uuid NOT NULL,
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  valor           numeric(14,2) CHECK (valor >= 0),
  PRIMARY KEY (linha_id, zona_id),
  FOREIGN KEY (linha_id, organization_id) REFERENCES public.orcamento_linhas(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (zona_id, organization_id) REFERENCES public.orcamento_zonas(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS orcamento_linha_zonas_zona ON public.orcamento_linha_zonas (zona_id);

-- Os dias mudados à mão no prazo previsto, por tarefa (a chave do serviço no motor, ou 'demolicao').
CREATE TABLE IF NOT EXISTS public.orcamento_prazo (
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  tarefa          text NOT NULL,
  dias            numeric(6,1) NOT NULL CHECK (dias > 0 AND dias * 2 = round(dias * 2)),
  PRIMARY KEY (orcamento_id, tarefa),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.orcamento_prestacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  ordem           smallint NOT NULL,
  rotulo          text NOT NULL,
  pct             numeric(7,4) NOT NULL CHECK (pct > 0 AND pct <= 1),
  marco           text NOT NULL CHECK (marco IN ('adjudicacao','antes','fase','fim')),
  fase            smallint CHECK (fase BETWEEN 1 AND 4),
  UNIQUE (orcamento_id, ordem),
  UNIQUE (id, organization_id),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE,
  CHECK ((marco = 'fase') = (fase IS NOT NULL))
);
-- As prestações somam 100 % (no fim da transação: grava-se a lista inteira).
CREATE OR REPLACE FUNCTION public.fn_orcamento_prestacoes_cem() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_orc uuid := coalesce(NEW.orcamento_id, OLD.orcamento_id); v_soma numeric;
BEGIN
  SELECT sum(pct) INTO v_soma FROM public.orcamento_prestacoes WHERE orcamento_id = v_orc;
  IF v_soma IS NOT NULL AND abs(v_soma - 1) > 0.0001 THEN
    RAISE EXCEPTION 'As prestações do orçamento somam % %% e têm de somar 100 %%.', round(v_soma * 100, 2) USING ERRCODE = 'NE002';
  END IF;
  RETURN NULL;
END $$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orcamento_prestacoes_cem' AND tgrelid = 'public.orcamento_prestacoes'::regclass) THEN
    CREATE CONSTRAINT TRIGGER trg_orcamento_prestacoes_cem AFTER INSERT OR UPDATE OR DELETE ON public.orcamento_prestacoes
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_orcamento_prestacoes_cem();
  END IF;
END $do$;

CREATE TABLE IF NOT EXISTS public.orcamento_avisos_vistos (
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  chave           text NOT NULL,
  visto_em        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (orcamento_id, chave),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------ contratos
CREATE TABLE IF NOT EXISTS public.contratos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  versao          smallint NOT NULL DEFAULT 1 CHECK (versao > 0),
  estado          text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','enviado','alteracoes_pedidas','assinado','substituido','anulado')),
  revisto_por     text,
  revisto_em      timestamptz,
  enviado_em      timestamptz,
  assinado_em     timestamptz,
  substituido_em  timestamptz,
  anulado_em      timestamptz,
  anulado_motivo  text,
  UNIQUE (negocio_id, versao),
  UNIQUE (id, organization_id),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id),
  CHECK ((estado = 'assinado') = (assinado_em IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS contratos_um_vivo ON public.contratos (negocio_id) WHERE estado NOT IN ('substituido','anulado');
COMMENT ON COLUMN public.contratos.revisto_por IS 'Quem do Jurídico reviu esta versão (o nome, como a Emylia o mostra).';

CREATE TABLE IF NOT EXISTS public.contrato_clausulas (
  organization_id uuid NOT NULL,
  contrato_id     uuid NOT NULL,
  titulo          text NOT NULL CHECK (length(btrim(titulo)) > 0),
  texto           text NOT NULL,
  PRIMARY KEY (contrato_id, titulo),
  FOREIGN KEY (contrato_id, organization_id) REFERENCES public.contratos(id, organization_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.contrato_clausulas IS 'Só as cláusulas reescritas pelo Jurídico (pelo título); as outras são as do modelo.';

CREATE TABLE IF NOT EXISTS public.contrato_pedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contrato_id     uuid NOT NULL,
  clausula        text NOT NULL,
  nota            text NOT NULL,
  pedido_em       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (contrato_id, organization_id) REFERENCES public.contratos(id, organization_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------ adendas (trabalhos a mais depois do contrato)
CREATE TABLE IF NOT EXISTS public.adendas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  numero          smallint NOT NULL CHECK (numero > 0),
  estado          text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','enviada','aceite','assinada','recusada','anulada')),
  motivo          text NOT NULL,
  imprevisto_ref  text,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  enviada_em      timestamptz,
  aceite_em       timestamptz,
  assinada_em     timestamptz,
  recusada_em     timestamptz,
  recusa_motivo   text,
  anulada_em      timestamptz,
  total           numeric(14,2),
  total_com_iva   numeric(14,2),
  dias_a_mais     smallint,
  UNIQUE (negocio_id, numero),
  UNIQUE (id, organization_id),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE,
  CHECK ((estado = 'assinada') = (assinada_em IS NOT NULL)),
  CHECK ((estado = 'recusada') = (recusada_em IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.adenda_linhas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  adenda_id       uuid NOT NULL,
  ordem           integer NOT NULL DEFAULT 0,
  servico_id      uuid,
  descricao       text NOT NULL,
  unidade         text NOT NULL DEFAULT 'un',
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  preco_un        numeric(14,4) NOT NULL,
  custo_un        numeric(14,4) NOT NULL DEFAULT 0,
  horas_un        numeric(10,4) NOT NULL DEFAULT 0,
  perfil_id       uuid,
  UNIQUE (id, organization_id),
  FOREIGN KEY (adenda_id, organization_id) REFERENCES public.adendas(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (servico_id, organization_id) REFERENCES public.services(id, organization_id),
  FOREIGN KEY (perfil_id, organization_id) REFERENCES public.ops_skill(id, organization_id)
);
CREATE TABLE IF NOT EXISTS public.adenda_linha_materiais (
  organization_id uuid NOT NULL,
  adenda_linha_id uuid NOT NULL,
  produto_id      uuid NOT NULL,
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (adenda_linha_id, produto_id),
  FOREIGN KEY (adenda_linha_id, organization_id) REFERENCES public.adenda_linhas(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id, organization_id) REFERENCES public.products(id, organization_id)
);

-- ------------------------------------------------------------------ assinaturas (contrato, adenda; o auto de receção vem com as Operações)
CREATE TABLE IF NOT EXISTS public.assinaturas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  contrato_id     uuid,
  adenda_id       uuid,
  auto_ref        text,
  metodo          text NOT NULL CHECK (metodo IN ('digital','sms','desenho')),
  nome            text NOT NULL,
  telefone_mascarado text,
  identificador   text,
  prova_caminho   text,
  assinado_em     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (contrato_id, organization_id) REFERENCES public.contratos(id, organization_id),
  FOREIGN KEY (adenda_id, organization_id) REFERENCES public.adendas(id, organization_id),
  CHECK (num_nonnulls(contrato_id, adenda_id, auto_ref) = 1)
);
COMMENT ON COLUMN public.assinaturas.metodo IS 'digital = Chave Móvel Digital; sms = código por SMS (sms-otp); desenho só nas antigas.';

-- ------------------------------------------------------------------ 05 financeiro (a fatura emite-se no Eticadata; aqui a referência)
CREATE TABLE IF NOT EXISTS public.faturas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  prestacao_id    uuid,
  adenda_id       uuid,
  numero          text NOT NULL,
  emitida_em      timestamptz NOT NULL DEFAULT now(),
  emitida_por     uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  base_mao_obra   numeric(14,2) NOT NULL DEFAULT 0,
  base_materiais  numeric(14,2) NOT NULL DEFAULT 0,
  iva             numeric(14,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL CHECK (total >= 0),
  erp_ref         text,
  atcud           text,
  nif_cliente     text,
  vencimento      date,
  pdf_caminho     text,
  erp_pago        numeric(14,2),
  erp_lida_em     timestamptz,
  referencia_mb   text,
  estado          text NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','parcial','paga','anulada')),
  anulada_motivo  text,
  UNIQUE (organization_id, numero),
  UNIQUE (id, organization_id),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id),
  FOREIGN KEY (prestacao_id, organization_id) REFERENCES public.orcamento_prestacoes(id, organization_id),
  FOREIGN KEY (adenda_id, organization_id) REFERENCES public.adendas(id, organization_id),
  CHECK (num_nonnulls(prestacao_id, adenda_id) = 1),
  CHECK (total = base_mao_obra + base_materiais + iva)
);
CREATE UNIQUE INDEX IF NOT EXISTS faturas_uma_por_prestacao ON public.faturas (prestacao_id) WHERE estado <> 'anulada' AND prestacao_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS faturas_uma_por_adenda ON public.faturas (adenda_id) WHERE estado <> 'anulada' AND adenda_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pagamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  fatura_id       uuid NOT NULL,
  metodo          text NOT NULL CHECK (metodo IN ('multibanco','transferencia','debito_direto','cartao','numerario')),
  valor           numeric(14,2) NOT NULL CHECK (valor > 0),
  conta_destino   text,
  comprovativo_caminho text,
  iban_final      text,
  titular         text,
  comunicado_em   timestamptz NOT NULL DEFAULT now(),
  validado_em     timestamptz,
  validado_por    uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  recusado_motivo text,
  UNIQUE (id, organization_id),
  FOREIGN KEY (fatura_id, organization_id) REFERENCES public.faturas(id, organization_id),
  CHECK (validado_em IS NULL OR recusado_motivo IS NULL)
);

CREATE TABLE IF NOT EXISTS public.recibos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pagamento_id    uuid NOT NULL UNIQUE,
  numero          text NOT NULL,
  emitido_em      timestamptz NOT NULL DEFAULT now(),
  erp_ref         text,
  UNIQUE (organization_id, numero),
  FOREIGN KEY (pagamento_id, organization_id) REFERENCES public.pagamentos(id, organization_id)
);

-- ------------------------------------------------------------------ o histórico do negócio (o que a Emylia mostra: "Proposta enviada…")
CREATE TABLE IF NOT EXISTS public.negocio_historico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  ordem           integer NOT NULL,
  ocorrido_em     timestamptz NOT NULL DEFAULT now(),
  texto           text NOT NULL,
  tipo            text,
  autor           uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  UNIQUE (negocio_id, ordem),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.negocio_historico IS 'O histórico do negócio como a Emylia o mostra (texto e tipo). O registo automático do CRM continua em negocio_eventos.';

-- ------------------------------------------------------------------ segurança: ler com permissão na organização; escrever só pelas funções
DO $do$
DECLARE t text; v_perm text;
BEGIN
  FOREACH t IN ARRAY ARRAY['negocio_respostas','visitas','negocio_medidas','negocio_servicos','negocio_produtos','orcamentos','orcamento_custos',
    'orcamento_parametros','orcamento_linhas','orcamento_linha_custos','orcamento_linha_oficios','orcamento_zonas','orcamento_linha_zonas',
    'orcamento_prazo','orcamento_prestacoes','orcamento_avisos_vistos','contratos','contrato_clausulas','contrato_pedidos','adendas',
    'adenda_linhas','adenda_linha_materiais','assinaturas','faturas','pagamentos','recibos','negocio_historico'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    v_perm := CASE WHEN t IN ('orcamento_custos','orcamento_parametros','orcamento_linha_custos','orcamento_linha_oficios') THEN 'quotes.view_costs' ELSE 'pessoas.view' END;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_ler') THEN
      EXECUTE format($p$CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated
        USING (public.is_system_admin_user((SELECT auth.uid())) OR public.has_anew_permission_in_org((SELECT auth.uid()), %L, organization_id))$p$,
        t || '_ler', t, v_perm);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $do$;

RESET lock_timeout;
