-- Negócio (Fase 2.2): o que o Negócio da Emylia guarda e a 20261231940000 ainda não tinha. Só acrescenta.
-- Visto ao escrever a ida e volta (src/emylia/real/negocioReal.ts) com os negócios de exemplo e o caso real da Anabela.
--   negocio_medidas.fotos_total       o total de fotografias quando a visita não as reparte por etapa
--   negocio_partes_fora               as partes da estimativa do modelo tiradas à mão (pela descrição: "pavimento")
--   negocio_produtos (fotografia)     o nome, a unidade, o custo, o PVP, o ramo e o fator do produto no dia em que se escolheu
--   orcamentos                        prestações escolhidas "por fases", demolição desligada à mão, aceite antes de ser substituída
--   orcamento_precos_manuais          preços de linhas de materiais mudados à mão (pela descrição: as linhas refeitas guardam-nos)
--   orcamento_versao_produtos/_partes os produtos e as partes tiradas de cada versão enviada (para mostrar o que mudou e repor)
--   faturas.chave, pagamentos.referencia   o id da fatura na Emylia e a referência do pagamento
--   orcamento_linhas (origem)        nas linhas de materiais da Emylia, que guardam o custo e o preço em total: a quantidade, o preço
--                                    e o custo por unidade da linha livre ou do produto (a linha fica com quantidade 1 e o total)
--   orcamento_linha_custos.congelado o custo da linha foi congelado no envio (a Emylia guarda o detalhe só então)
--   negocios.fatura_*                a fatura única do motor (o passo "Emitir fatura"), o pagamento validado e o recibo dela

SET lock_timeout = '5s';

ALTER TABLE public.negocio_medidas ADD COLUMN IF NOT EXISTS fotos_total smallint NOT NULL DEFAULT 0 CHECK (fotos_total >= 0);

CREATE TABLE IF NOT EXISTS public.negocio_partes_fora (
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  parte           text NOT NULL CHECK (length(btrim(parte)) > 0),
  PRIMARY KEY (negocio_id, parte),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE
);

ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS custo_un numeric(14,4) CHECK (custo_un IS NULL OR custo_un >= 0);
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS pvp_un numeric(14,4) CHECK (pvp_un IS NULL OR pvp_un >= 0);
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS fator numeric(10,4) CHECK (fator IS NULL OR fator > 0);
COMMENT ON COLUMN public.negocio_produtos.custo_un IS 'O custo do produto no dia em que se escolheu na visita (o Catálogo pode mudar depois).';

ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS prestacoes_por_fases boolean NOT NULL DEFAULT false;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS sem_demolicao boolean NOT NULL DEFAULT false;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS aceite_antes_em timestamptz;
COMMENT ON COLUMN public.orcamentos.prestacoes_por_fases IS 'As prestações foram escolhidas no plano "Por fases"; sem isto vêm das condições de pagamento escritas.';
COMMENT ON COLUMN public.orcamentos.aceite_antes_em IS 'Numa versão substituída: o cliente já a tinha aceite antes de pedir outra.';

CREATE TABLE IF NOT EXISTS public.orcamento_precos_manuais (
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  descricao       text NOT NULL,
  preco           numeric(14,2) NOT NULL CHECK (preco >= 0),
  PRIMARY KEY (orcamento_id, descricao),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.orcamento_versao_produtos (
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  ordem           integer NOT NULL,
  produto_id      uuid NOT NULL,
  nome            text,
  unidade         text,
  custo_un        numeric(14,4),
  pvp_un          numeric(14,4),
  categoria_id    uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  cliente_fornece boolean NOT NULL DEFAULT false,
  servico_id      uuid,
  fator           numeric(10,4),
  sem_instalacao  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (orcamento_id, ordem),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id, organization_id) REFERENCES public.products(id, organization_id),
  FOREIGN KEY (servico_id, organization_id) REFERENCES public.services(id, organization_id)
);
CREATE TABLE IF NOT EXISTS public.orcamento_versao_partes (
  organization_id uuid NOT NULL,
  orcamento_id    uuid NOT NULL,
  parte           text NOT NULL,
  PRIMARY KEY (orcamento_id, parte),
  FOREIGN KEY (orcamento_id, organization_id) REFERENCES public.orcamentos(id, organization_id) ON DELETE CASCADE
);

ALTER TABLE public.orcamento_linhas ADD COLUMN IF NOT EXISTS qtd_origem numeric(12,3) CHECK (qtd_origem IS NULL OR qtd_origem >= 0);
ALTER TABLE public.orcamento_linhas ADD COLUMN IF NOT EXISTS preco_un_origem numeric(14,4) CHECK (preco_un_origem IS NULL OR preco_un_origem >= 0);
ALTER TABLE public.orcamento_linhas ADD COLUMN IF NOT EXISTS custo_un_origem numeric(14,4) CHECK (custo_un_origem IS NULL OR custo_un_origem >= 0);
COMMENT ON COLUMN public.orcamento_linhas.qtd_origem IS 'Linha de materiais livre ou de produto: a quantidade mostrada (a linha guarda quantidade 1 e o total em preco_un).';
ALTER TABLE public.orcamento_linha_custos ADD COLUMN IF NOT EXISTS congelado boolean NOT NULL DEFAULT false;

ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fatura_numero text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fatura_em timestamptz;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fatura_paga boolean NOT NULL DEFAULT false;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS recibo_numero text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS recibo_em timestamptz;
COMMENT ON COLUMN public.negocios.fatura_numero IS 'A fatura única do motor da Emylia (o passo "Emitir fatura"); as faturas por prestação estão em faturas.';

ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS referencia text;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['negocio_partes_fora','orcamento_precos_manuais','orcamento_versao_produtos','orcamento_versao_partes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_ler') THEN
      EXECUTE format($p$CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated
        USING (public.is_system_admin_user((SELECT auth.uid())) OR public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id))$p$,
        t || '_ler', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $do$;

RESET lock_timeout;
