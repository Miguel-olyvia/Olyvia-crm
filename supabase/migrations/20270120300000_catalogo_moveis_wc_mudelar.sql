-- =============================================================================
-- Catálogo — importação dos MÓVEIS & ARRUMAÇÃO CASA DE BANHO da MUDELAR, opção A: um produto por linha do Excel
-- («Moveis & Arrumação Casa de Banho_Rev1.xlsx», folha «Folha1», 11397 linhas, todas ativas).
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar.js + parse.js) a partir do Excel: as linhas de
-- dados abaixo não se editam à mão — regeneram-se. Molde: 20270118400000 (bases de duche, set-based) e 20270120200000
-- (resguardos: atributos de lista criados se faltarem, idempotente com as outras importações).
-- =============================================================================
--
-- Decisões do utilizador (17/11):
--   * Um produto por linha do Excel (por combinação): entram as 11397 (Móveis de lavatório 10226, Colunas 940, Espelhos 142, Tampos & Bancadas WC 84, Apliques LED 5); nenhuma fica de fora e nada
--     se agrupa (juntar fica para as «famílias»). Tudo se lê do NOME do produto; o SKU antigo não se guarda (o gerador só o
--     usa para conferir a coerência com o nome).
--   * Modelo = o nome sem o tipo (Móvel, Coluna, Bajo Lavabo, Encimera, Lavabo, Mueble, Espelho, Aplique…), sem a medida e
--     sem os atributos abaixo. 176 modelos; NNNN = a ordem da primeira linha de cada modelo no Excel, por
--     subcategoria. Moovlux: o tipo de lavatório (c/Lavatório Cerâmico, c/Lavatório Misy, c/Tampo) fica no nome do modelo
--     (como atributo também não havia colisões; no modelo não se cria mais um atributo). OMNI/IBIS: a composição
--     «(60+20)», «(70+30)», «(80+40)» muda com a largura e sai do modelo (o produto mantém o nome do Excel).
--   * Medida: só largura («60cm», «(p/ móvel 60cm)», «30CM») → Largura (lista, opção = o número, sigla = o número);
--     L×A → Medida 2D; L×A×P → Medida 3D (largura × comprimento × espessura, SKU LxAxP, ex. 80X50X45); Ø60 → 2D 60 × 60;
--     Duplach MANÁ/SIA/ETNA/ZAO: «Fondo 45cm, Alto 60cm» nas notas → 3D largura × 60 × 45. Sem medida no nome: 5
--     produtos (lavatórios sem medida e os 2 serviços de corte/perfuração).
--   * Atributos (de lista; criados se faltarem, procurados primeiro pelo código e pelo nome):
--       «Cor do corpo» (cor_corpo) e «Cor da frente» (cor_frente): Moovlux (Corpo X, Frente Y; «Corpo e Frente X»; «Todo X»)
--         e Chic&Bath (Armazón → Cor do corpo, Frente → Cor da frente); sigla = o código do Excel (WH, BCO, ARN, FC…);
--         hex copiado da opção da Cor com o mesmo nome;
--       «Veta» (veta): Horizontal H, Vertical V, Mixta MX (Chic&Bath BREDA);
--       «Puxador» (puxador): Negro TN, Plata Brillo TP (Chic&Bath BREDA, «Tirador Negro/Plata Brillo»; nunca muda o preço);
--       «Posição do puxador» (posicao_puxador): Centrado CEN, Esquerda ESQ, Direita DIR (Chic&Bath RIGA, «- Tirador
--         Centrado/Izquierda/Derecha»): as posições não se misturam com o acabamento do puxador;
--       «Lado» (lado): Esquerdo ESQ, Direito DIR (Moovlux «Pio Esquerdo/Direito», Duplach «Abertura Izquierda/Derecha»);
--       Cor e Tonalidade que já existem (Shower Bath «Moldura Preto/Branco Mate, Dourado Brilho»: P, B, D; BRILHO B, MATE M).
--   * Ordem do SKU: os atributos que já existem mantêm a ordem relativa (nenhum SKU existente muda — conferido); os novos
--     entram assim: Cor, Cor do corpo, Cor da frente, Tonalidade, Textura, Veta, Puxador, Posição do puxador, Lado,
--     Medida, … Ex.: MACB-ML-0001-WH-BCO-B-ESQ-80X50X45; MACB-ML-0019-ARN-FC-H-TN-60.
--   * Siglas: categoria MACB; Móveis de lavatório ML, Colunas C (era CL), Espelhos E (era ES), Tampos & Bancadas WC TB (era
--     TBW), Apliques LED AL.
--   * Descrição: a coluna «Atributos» inteira (características e notas internas: página do catálogo, regra de desconto,
--     avisos) vai para products.short_description (a descrição que o ecrã grava), um bloco por linha. 11397 produtos.
--   * Preços: custo = «Preço Compra», PVP = «Preço Venda», IVA 23. «Preço Compra» 0 = sem custo (50
--     produtos). PVP 0 (2): o nome leva « (sem preço)» e não há PVP. Grossista e distribuidor quando > 0
--     (0 e 0 neste Excel).
--   * Marcas Moovlux, Chic&Bath, Duplach, Shower Bath (já existem). Fornecedores: Anlorbel e Duplach = os que existem
--     («ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO», «DUPLACH Group, SAU»); «Sakidu SL» (Chic&Bath) e «New
--     Bath, Lda» (Shower Bath) criam-se se faltarem. supplier_sku = «Codigo do Fornecedor» (799 linhas); sem código
--     = o SKU novo. Estado = o do Excel (active).
--
-- Como em 20270118400000: SET-BASED, com o SKU calculado antes de inserir (a regra de fn_cat_sku_partes) e conferido
-- depois com fn_cat_sku_partes + fn_cat_modelo_numero para TODOS e com cat_prever_sku_modelo para 20 ao acaso. Os INSERT em
-- massa correm com app.audit_bypass = 'on'; fica UMA linha consolidada na auditoria. As escritas pequenas (atributos,
-- opções, ordem do SKU, siglas, modelos, fornecedores) ficam auditadas normalmente. Fonte: migration:moveis_wc_mudelar.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); não existir «Móveis & Arrumação Casa de Banho» ou uma das 5
-- subcategorias; já houver produtos (vivos ou apagados) numa delas; já houver um produto vivo da Mudelar com um dos
-- nomes; ou já houver nelas um modelo com um dos nomes ou números que não seja exatamente o mesmo. Inerte numa segunda
-- execução.
-- Falha (RAISE EXCEPTION, nada fica) se: faltar uma função do Catálogo ou a Medida não aceitar 3D; sigla da categoria
-- não for MACB; marcas, atributos cor/tonalidade/largura/medida ou membro para created_by faltarem; um atributo ou opção
-- for ambíguo, desativado ou de outro tipo; a sigla de uma opção nova estiver ocupada por outra; uma sigla de
-- subcategoria estiver ocupada por outra irmã; SKU repetido (diz quais) ou já usado; a ordem dos atributos existentes mudar.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): 11397 produtos, por subcategoria e por modelo;
-- 176 modelos; cada produto como a sua linha (nome, SKU, modelo, marca, estado, fornecedor, preços, descrição,
-- código do fornecedor, os 45100 valores de atributos e só esses); SKUs únicos, no formato, iguais ao recalculado
-- (todos) e a cat_prever_sku_modelo (20); siglas; ordem dos atributos existentes; nada escrito fora da Mudelar (xmin)
-- nem noutros produtos dela; uma amostra de SKUs de outras categorias intacta.
--
-- ORDEM: depois de 20270119600000 e 20270120200000. Teste: supabase/tests/catalogo_moveis_wc_mudelar.test.sql
-- (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes). ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que
-- estiver pendente; listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '15min';

DO $mig$
DECLARE
  c_org         constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte       constant text    := 'migration:moveis_wc_mudelar';
  c_total       constant integer := 11397;
  c_n_modelos   constant integer := 176;
  c_n_valores   constant integer := 45100;
  c_n_custo     constant integer := 11347;
  c_n_pvp       constant integer := 11395;
  c_n_gross     constant integer := 0;
  c_n_dist      constant integer := 0;
  c_n_cod       constant integer := 799;
  c_n_opcoes    constant integer := 87;
  c_n_descs     constant integer := 94;
  c_iva         constant numeric := 23;
  c_cat_nome    constant text    := 'Móveis & Arrumação Casa de Banho';
  c_cat_sigla   constant text    := 'MACB';
  c_unidade     constant text    := 'un';
  c_amostra     constant integer := 20;
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  c_max_atributos      constant integer := 200;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_i integer; v_ordem integer; v_xid text; v_txt text; v_code text;
  v_cat uuid; v_cat_sigla text; v_cat_ativa boolean; v_ativa boolean; v_criador uuid; v_uom uuid; v_sup uuid; v_id uuid;
  v_a_med uuid; v_med_unit text; v_regex text; v_forn_criados text := ''; v_attr_criados text := ''; v_opc_criadas text := '';
  v_ordem_antes uuid[]; v_ordem_depois uuid[];
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'moveis_wc_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)') IS NULL
     OR position('fn_cat_modelo_numero' IN coalesce((SELECT pr.prosrc FROM pg_proc pr
                                                     WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid), '')) = 0 THEN
    RAISE NOTICE 'moveis_wc_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  -- as funções do Catálogo que esta importação usa (existem na RH: se faltarem, é erro, não guarda)
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_medida(jsonb)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_unidade(uuid,text)', 'public.fn_cat_dimensao_medida(jsonb,text)',
                    'public.fn_cat_dimensao_texto(jsonb)', 'public.has_anew_permission_in_org(uuid,text,uuid)',
                    'public.fn_manual_audit_log(text,uuid,uuid,text,jsonb,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;
  -- a Medida tem de aceitar 3D (largura × comprimento × espessura)
  IF public.fn_cat_sku_medida('{"tipo":"3D","largura":80,"comprimento":50,"espessura":45,"unidade":"cm"}'::jsonb) IS DISTINCT FROM '80X50X45'
     OR public.fn_cat_medida_ler('{"tipo":"3D","largura":80,"comprimento":50,"espessura":45,"unidade":"cm"}'::jsonb, 'cm') IS NULL THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: a Medida do Catálogo não aceita 3D (largura × comprimento × espessura).';
  END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla, v_cat_ativa
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'moveis_wc_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados do Excel (gerados) ──────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._mv_subs, pg_temp._mv_modelos, pg_temp._mv_novos, pg_temp._mv_opcoes, pg_temp._mv_forn,
                       pg_temp._mv_marcas, pg_temp._mv_descs, pg_temp._mv_linhas, pg_temp._mv_attr, pg_temp._mv,
                       pg_temp._mv_vals, pg_temp._mv_amostra, pg_temp._mv_nomes, pg_temp._mv_medidas, pg_temp._mv_grupos;

  -- as 5 subcategorias: sigla nova, nome na Mudelar, quantos produtos, ordem
  CREATE TEMP TABLE _mv_subs (codigo text PRIMARY KEY, nome text NOT NULL, esperados integer NOT NULL, ordem integer NOT NULL,
                              sub_id uuid, sigla_antes text) ON COMMIT DROP;
  INSERT INTO _mv_subs (codigo, nome, esperados, ordem) VALUES
    ('ML', 'Móveis de lavatório', 10226, 1),
    ('C', 'Colunas', 940, 2),
    ('E', 'Espelhos', 142, 3),
    ('TB', 'Tampos & Bancadas WC', 84, 4),
    ('AL', 'Apliques LED', 5, 5);

  -- os modelos: subcategoria, número (NNNN do SKU), nome, quantos produtos
  CREATE TEMP TABLE _mv_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL,
                                 modelo_id uuid, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _mv_modelos (sub, numero, nome, esperados) VALUES
    ('ML', 1, 'OMNI Suspenso 1 Pio / 2 Gav + Porta c/Lavatório Cerâmico', 522),
    ('ML', 2, 'OMNI Suspenso 1 Pio / 2 Gav + Porta c/Lavatório Misy', 522),
    ('ML', 3, 'IBIS Suspenso 1 Pio / 2 Gav + Cubo Aberto c/Lavatório Cerâmico', 522),
    ('ML', 4, 'IBIS Suspenso 1 Pio / 2 Gav + Cubo Aberto c/Lavatório Misy', 522),
    ('ML', 5, 'AXIS Suspenso 1 Pio / 2 Gav c/Lavatório Cerâmico', 504),
    ('ML', 6, 'AXIS Suspenso 1 Pio / 2 Gav c/Tampo', 504),
    ('ML', 7, 'AXIS Suspenso 1 Pio / 2 Gav c/Lavatório Misy', 252),
    ('ML', 8, 'AXIS Suspenso 2 Pios / 2 Gav c/Lavatório Cerâmico', 84),
    ('ML', 9, 'AXIS Suspenso 2 Pios / 2 Gav c/Tampo', 84),
    ('ML', 10, 'AXIS Suspenso 2 Pios / 2 Gav c/Lavatório Misy', 84),
    ('ML', 11, 'AXIS Suspenso 2 Pios / 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 12, 'AXIS Suspenso 2 Pios / 4 Gav c/Tampo', 84),
    ('ML', 13, 'AXIS Suspenso 2 Pios / 4 Gav c/Lavatório Misy', 84),
    ('ML', 14, 'AXIS Suspenso 2 Pios / 4 Gav (entrega 4/5 semanas) c/Tampo', 336),
    ('ML', 15, 'AXIS Suspenso 2 Pios / 4 Gav (entrega 4/5 semanas) c/Lavatório Misy', 84),
    ('ML', 16, 'AXIS Suspenso 2 Pios / 4 Gav (entrega 4/5 semanas) c/Lavatório Cerâmico', 84),
    ('ML', 17, 'AXIS Suspenso 1 Pio / 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 252),
    ('ML', 18, 'AXIS c/Pés 1 Pio / 3 Gav c/Lavatório Cerâmico', 336),
    ('ML', 19, 'AXIS c/Pés 1 Pio / 3 Gav c/Lavatório Misy', 252),
    ('ML', 20, 'AXIS c/Pés 2 Pios / 3 Gav c/Lavatório Cerâmico', 84),
    ('ML', 21, 'AXIS c/Pés 2 Pios / 3 Gav c/Lavatório Misy', 84),
    ('ML', 22, 'AXIS c/Pés 2 Pios / 6 Gav (entrega 4/5 semanas) c/Lavatório Cerâmico', 84),
    ('ML', 23, 'AXIS c/Pés 2 Pios / 6 Gav (entrega 4/5 semanas) c/Lavatório Misy', 84),
    ('ML', 24, 'COIMBRA 1 Pio / 1 Porta + 2 Gav c/Lavatório Cerâmico', 84),
    ('ML', 25, 'COIMBRA 1 Pio / 1 Porta + 2 Gav c/Tampo', 84),
    ('ML', 26, 'COIMBRA 1 Pio / 2 Portas + 2 Gav c/Lavatório Cerâmico', 252),
    ('ML', 27, 'COIMBRA 1 Pio / 2 Portas + 2 Gav c/Tampo', 252),
    ('ML', 28, 'COIMBRA 1 Pio / 2 Portas + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 29, 'COIMBRA 1 Pio / 2 Portas + 4 Gav c/Tampo', 84),
    ('ML', 30, 'COIMBRA 2 Pios / 2 Portas + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 31, 'COIMBRA 2 Pios / 2 Portas + 4 Gav c/Tampo', 84),
    ('ML', 32, 'COIMBRA 1 Pio / 1 Porta + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 33, 'COIMBRA 1 Pio / 2 Portas + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 34, 'BRAGA c/Pés 1 Pio / 1 Porta c/1 Prat + 2 Gav c/Lavatório Cerâmico', 168),
    ('ML', 35, 'BRAGA c/Pés 1 Pio / 1 Porta c/1 Prat + 2 Gav c/Tampo', 168),
    ('ML', 36, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 2 Gav c/Lavatório Cerâmico', 252),
    ('ML', 37, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 2 Gav c/Tampo', 252),
    ('ML', 38, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 39, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 4 Gav c/Tampo', 84),
    ('ML', 40, 'BRAGA c/Pés 2 Pios / 2 Portas c/1 Prat + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 41, 'BRAGA c/Pés 2 Pios / 2 Portas c/1 Prat + 4 Gav c/Tampo', 84),
    ('ML', 42, 'BRAGA c/Pés 1 Pio / 1 Porta c/1 Prat + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 43, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 44, 'PORTO 1 Pio / 2 Portas c/Lavatório Cerâmico', 252),
    ('ML', 45, 'PORTO 1 Pio / 2 Portas c/Tampo', 252),
    ('ML', 46, 'PORTO 1 Pio / 3 Portas c/Lavatório Cerâmico', 168),
    ('ML', 47, 'PORTO 1 Pio / 3 Portas c/Tampo', 168),
    ('ML', 48, 'PORTO 2 Pios / 3 Portas c/Lavatório Cerâmico', 84),
    ('ML', 49, 'PORTO 2 Pios / 3 Portas c/Tampo', 84),
    ('ML', 50, 'PORTO 1 Pio / 2 Portas c/Fundo Reduzido c/Lavatório Cerâmico', 168),
    ('ML', 51, 'BEJA c/Pés 1 Pio / 2 Portas c/1 Prat c/Lavatório Cerâmico', 168),
    ('ML', 52, 'BEJA c/Pés 1 Pio / 3 Portas c/1 Prat c/Lavatório Cerâmico', 84),
    ('ML', 53, 'BREDA 1 cajón 27', 96),
    ('ML', 54, 'BREDA 1 cajón 42 y cajón interior', 96),
    ('ML', 55, 'BREDA 2 cajones simétricos', 144),
    ('ML', 56, 'BREDA 2 cajones asimétricos', 144),
    ('ML', 57, 'BREDA 3 cajones', 96),
    ('ML', 58, 'RIGA 1 cajón 27', 18),
    ('ML', 59, 'RIGA 1 cajón 42 y cajón interior', 18),
    ('ML', 60, 'RIGA 1 cajón - hueco inferior', 18),
    ('ML', 61, 'RIGA 2 cajones simétricos', 18),
    ('ML', 62, 'RIGA 2 cajones asimétricos', 18),
    ('ML', 63, 'RIGA 3 cajones', 18),
    ('ML', 64, 'MILANO 1 cajón 27', 6),
    ('ML', 65, 'MILANO 1 cajón 42 y cajón interior', 6),
    ('ML', 66, 'MILANO 2 cajones simétricos', 6),
    ('ML', 67, 'MILANO 2 cajones asimétricos', 6),
    ('ML', 68, 'MILANO 3 cajones', 6),
    ('ML', 69, 'MILANO 2 cajones - 1 puerta - Lavabo Esquerda', 3),
    ('ML', 70, 'MILANO 2 cajones - 1 puerta - Lavabo Direita', 3),
    ('ML', 71, 'MILANO 2 cajones - 1 puerta - Centrado - Porta Esquerda', 3),
    ('ML', 72, 'MILANO 2 cajones - 1 puerta - Centrado - Porta Direita', 3),
    ('ML', 73, 'MANÁ', 4),
    ('ML', 74, 'SIA', 4),
    ('ML', 75, 'ETNA', 4),
    ('ML', 76, 'ZAO', 4),
    ('ML', 77, 'VESUBIO', 4),
    ('C', 1, 'Suspensa AXIS', 84),
    ('C', 2, 'Lacado 1H (p/ Sia/Maná)', 1),
    ('C', 3, 'Lacado 3H (p/ Sia/Maná)', 1),
    ('C', 4, 'Lacado Puerta (p/ Sia/Maná)', 2),
    ('C', 5, 'Lacado Puerta+Hueco Bajo (p/ Sia/Maná)', 2),
    ('C', 6, 'Lacado Puerta+Hueco Alto (p/ Sia/Maná)', 2),
    ('C', 7, 'Melamina 1H (p/ Etna/Zao/Vesubio)', 1),
    ('C', 8, 'Melamina 3H (p/ Etna/Zao/Vesubio)', 1),
    ('C', 9, 'Melamina Puerta (p/ Etna/Zao/Vesubio)', 2),
    ('C', 10, 'Melamina Puerta+Hueco Bajo (p/ Etna/Zao/Vesubio)', 2),
    ('C', 11, 'Melamina Puerta+Hueco Alto (p/ Etna/Zao/Vesubio)', 2),
    ('C', 12, 'Line 2 Portas c/2 Prat', 84),
    ('C', 13, 'Line 4 Portas c/2 Prat', 84),
    ('C', 14, 'Alta Lux 2 Portas c/2 Prat + 2 Gav', 84),
    ('C', 15, 'Alta Lux 1 Porta c/1 Prat + 2 Gav + 1 Tulha', 84),
    ('C', 16, 'Alta Lux 4 Portas c/2 Prat + 2 Gav', 84),
    ('C', 17, 'Alta Lux 2 Portas c/2 Prat + 2 Gav + 1 Tulha', 84),
    ('C', 18, 'Baixa Lux 1 Gav + 1 Porta c/1 Prat', 84),
    ('C', 19, 'Baixa Lux 1 Gav + 1 Tulha', 168),
    ('C', 20, 'Baixa Lux 1 Gav + 2 Portas c/1 Prat', 84),
    ('E', 1, 'Rectangular Liso', 4),
    ('E', 2, 'Rectangular LED', 4),
    ('E', 3, 'Redondo Marco', 3),
    ('E', 4, 'Redondo Marco LED', 3),
    ('E', 5, 'Redondo Retroiluminado', 3),
    ('E', 6, 'Óvalo Liso', 1),
    ('E', 7, 'Óvalo Marco', 1),
    ('E', 8, 'Óvalo Repisa', 1),
    ('E', 9, 'Óvalo LED', 1),
    ('E', 10, 'Óvalo Marco LED', 1),
    ('E', 11, 'Óvalo Repisa LED', 1),
    ('E', 12, 'LIPI', 3),
    ('E', 13, 'Oval c/Moldura de 1cm', 1),
    ('E', 14, 'Circular c/Moldura de 3cm', 1),
    ('E', 15, 'Circular c/Moldura de 1cm', 1),
    ('E', 16, 'c/Moldura de 3cm', 3),
    ('E', 17, 'c/Moldura de 1cm', 4),
    ('E', 18, 'Round c/Cantos Redondos', 4),
    ('E', 19, 'Classic c/Moldura de 3cm', 4),
    ('E', 20, 'c/Prateleira', 5),
    ('E', 21, 'c/Orla Alumínio', 22),
    ('E', 22, 'LED Eris', 4),
    ('E', 23, 'LED MERCÚRIO', 2),
    ('E', 24, 'LED Plutão', 1),
    ('E', 25, 'LED MARTE', 5),
    ('E', 26, 'LED Urano', 3),
    ('E', 27, 'LED Lua', 1),
    ('E', 28, 'LED Neptuno', 3),
    ('E', 29, 'LED Calisto', 1),
    ('E', 30, 'LED Sol', 3),
    ('E', 31, 'LED Verona', 1),
    ('E', 32, 'LED Latina', 4),
    ('E', 33, 'LED Trentino', 12),
    ('E', 34, 'LED Roma', 3),
    ('E', 35, 'LED Milão', 3),
    ('E', 36, 'LED Florença', 3),
    ('E', 37, 'LED Modena', 4),
    ('E', 38, 'LED Rimini', 4),
    ('E', 39, 'LED Tivoli', 4),
    ('E', 40, 'LED Lucci', 3),
    ('E', 41, 'LED Bari', 4),
    ('E', 42, 'LED Vinci', 3),
    ('TB', 1, 'BREDA de tablero a medida', 6),
    ('TB', 2, 'BREDA sem lavabo Solid Bath a medida', 6),
    ('TB', 3, 'BREDA porcelana Munich dupla', 1),
    ('TB', 4, 'BREDA porcelana Bonn Verde Olivo', 1),
    ('TB', 5, 'BREDA porcelana Bremen Negro', 1),
    ('TB', 6, 'BREDA Solid Bath Toulon', 1),
    ('TB', 7, 'BREDA porcelana Munich Centrado', 6),
    ('TB', 8, 'RIGA Solid Bath Rondo', 1),
    ('TB', 9, 'RIGA Solid Bath Oh', 1),
    ('TB', 10, 'RIGA porcelana Alice Centrado', 6),
    ('TB', 11, 'RIGA porcelana Berlin Centrado', 6),
    ('TB', 12, 'MILANO tablero estándar', 6),
    ('TB', 13, 'MILANO porcelana Olfer', 1),
    ('TB', 14, 'MILANO Solid Bath Alice Desplazado Izq.', 3),
    ('TB', 15, 'MILANO mineral Pilsen Negro', 3),
    ('TB', 16, 'Estrutura Suspendida Inferior MILANO', 3),
    ('TB', 17, 'Repisa Estrutura MILANO', 3),
    ('TB', 18, 'Melamina (p/ Etna/Zao/Vesubio)', 6),
    ('TB', 19, 'Piedra Compacta (Resina) (p/ Maná/Sia)', 6),
    ('TB', 20, 'Serviço de Corte de Encimera Personalizado', 1),
    ('TB', 21, 'Serviço de Perfuração de Encimera para Lavabo', 1),
    ('TB', 22, 'Cerámica ST', 3),
    ('TB', 23, 'Cerámica ST Desplazado Izquierda', 1),
    ('TB', 24, 'Cerámica ST Desplazado Derecha', 1),
    ('TB', 25, 'Cerámica ST 2 Senos', 1),
    ('TB', 26, 'Resina HE+', 3),
    ('TB', 27, 'Resina Round', 1),
    ('TB', 28, 'Resina Libra', 1),
    ('TB', 29, 'Resina Ronda', 1),
    ('TB', 30, 'Resina Oval', 1),
    ('TB', 31, 'Resina Kuvic', 1),
    ('TB', 32, 'Resina Kuvic XL', 1),
    ('AL', 1, 'LED Lara Cromado', 1),
    ('AL', 2, 'LED Dourado', 1),
    ('AL', 3, 'LED Preto', 1),
    ('AL', 4, 'LED Beatriz', 1),
    ('AL', 5, 'LED Ana', 1);

  -- os atributos de lista a usar ou criar: código, rótulo, com hex, âncora e desvio da posição no SKU (se for criado)
  CREATE TEMP TABLE _mv_novos (papel text PRIMARY KEY, rotulo text NOT NULL, hex boolean NOT NULL, ancora text NOT NULL,
                               desvio integer NOT NULL, ordem integer NOT NULL, attr_id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _mv_novos (papel, rotulo, hex, ancora, desvio, ordem) VALUES
    ('cor_corpo', 'Cor do corpo', true, 'cor', 1, 1),
    ('cor_frente', 'Cor da frente', true, 'cor', 2, 2),
    ('veta', 'Veta', false, 'medida', -4, 3),
    ('puxador', 'Puxador', false, 'medida', -3, 4),
    ('posicao_puxador', 'Posição do puxador', false, 'medida', -2, 5),
    ('lado', 'Lado', false, 'medida', -1, 6);

  -- as opções usadas: atributo (papel), código do gerador (= a sigla se a opção for criada), nome da opção, ordem
  CREATE TEMP TABLE _mv_opcoes (papel text NOT NULL, codigo text NOT NULL, nome text NOT NULL, ordem integer NOT NULL,
                                grupo uuid, opcao_id uuid, valor text, sigla text, criada boolean NOT NULL DEFAULT false,
                                PRIMARY KEY (papel, codigo)) ON COMMIT DROP;
  INSERT INTO _mv_opcoes (papel, codigo, nome, ordem) VALUES
    ('cor', 'P', 'Preto', 1),
    ('cor', 'B', 'Branco', 2),
    ('cor', 'D', 'Dourado', 3),
    ('cor_corpo', 'WH', 'White', 1),
    ('cor_corpo', 'TBL', 'Todo Branco Lacado', 2),
    ('cor_corpo', 'TBR', 'Todo Branco', 3),
    ('cor_corpo', 'BCO', 'Branco', 4),
    ('cor_corpo', 'CCL', 'Cinza Claro', 5),
    ('cor_corpo', 'CME', 'Cinza Médio', 6),
    ('cor_corpo', 'ANT', 'Antracite', 7),
    ('cor_corpo', 'PTO', 'Preto', 8),
    ('cor_corpo', 'CRE', 'Creme', 9),
    ('cor_corpo', 'CAM', 'Camel', 10),
    ('cor_corpo', 'OUR', 'Ouro', 11),
    ('cor_corpo', 'COB', 'Cobre', 12),
    ('cor_corpo', 'CHO', 'Chocolate', 13),
    ('cor_corpo', 'VAG', 'Verde Água', 14),
    ('cor_corpo', 'AZE', 'Azeitona', 15),
    ('cor_corpo', 'AMA', 'Azul Mar', 16),
    ('cor_corpo', 'AES', 'Azul Escuro', 17),
    ('cor_corpo', 'PRA', 'Prata', 18),
    ('cor_corpo', 'ROS', 'Rosa', 19),
    ('cor_corpo', 'VER', 'Vermelho', 20),
    ('cor_corpo', 'AZB', 'Azabache', 21),
    ('cor_corpo', 'DEN', 'Denver', 22),
    ('cor_corpo', 'BLK', 'Black', 23),
    ('cor_corpo', 'ART', 'Artisan', 24),
    ('cor_corpo', 'LIN', 'Lincoln', 25),
    ('cor_corpo', 'HAL', 'Halifax', 26),
    ('cor_corpo', 'OAK', 'Oak', 27),
    ('cor_corpo', 'TEA', 'Tea', 28),
    ('cor_corpo', 'JOP', 'Joplim', 29),
    ('cor_corpo', 'ARN', 'Roble Noruega', 30),
    ('cor_corpo', 'AEC', 'Elite Claro', 31),
    ('cor_corpo', 'AOC', 'Olmo California', 32),
    ('cor_corpo', 'AEO', 'Elite Oscuro', 33),
    ('cor_frente', 'WH', 'White', 1),
    ('cor_frente', 'TBL', 'Todo Branco Lacado', 2),
    ('cor_frente', 'TBR', 'Todo Branco', 3),
    ('cor_frente', 'BCO', 'Branco', 4),
    ('cor_frente', 'CCL', 'Cinza Claro', 5),
    ('cor_frente', 'CME', 'Cinza Médio', 6),
    ('cor_frente', 'ANT', 'Antracite', 7),
    ('cor_frente', 'PTO', 'Preto', 8),
    ('cor_frente', 'CRE', 'Creme', 9),
    ('cor_frente', 'CAM', 'Camel', 10),
    ('cor_frente', 'OUR', 'Ouro', 11),
    ('cor_frente', 'COB', 'Cobre', 12),
    ('cor_frente', 'CHO', 'Chocolate', 13),
    ('cor_frente', 'VAG', 'Verde Água', 14),
    ('cor_frente', 'AZE', 'Azeitona', 15),
    ('cor_frente', 'AMA', 'Azul Mar', 16),
    ('cor_frente', 'AES', 'Azul Escuro', 17),
    ('cor_frente', 'PRA', 'Prata', 18),
    ('cor_frente', 'ROS', 'Rosa', 19),
    ('cor_frente', 'VER', 'Vermelho', 20),
    ('cor_frente', 'AZB', 'Azabache', 21),
    ('cor_frente', 'DEN', 'Denver', 22),
    ('cor_frente', 'BLK', 'Black', 23),
    ('cor_frente', 'ART', 'Artisan', 24),
    ('cor_frente', 'LIN', 'Lincoln', 25),
    ('cor_frente', 'HAL', 'Halifax', 26),
    ('cor_frente', 'OAK', 'Oak', 27),
    ('cor_frente', 'TEA', 'Tea', 28),
    ('cor_frente', 'JOP', 'Joplim', 29),
    ('cor_frente', 'FC', 'Elite Claro', 30),
    ('cor_frente', 'FO', 'Elite Oscuro', 31),
    ('tonalidade', 'B', 'BRILHO', 1),
    ('tonalidade', 'M', 'MATE', 2),
    ('veta', 'H', 'Horizontal', 1),
    ('veta', 'V', 'Vertical', 2),
    ('veta', 'MX', 'Mixta', 3),
    ('puxador', 'TN', 'Negro', 1),
    ('puxador', 'TP', 'Plata Brillo', 2),
    ('posicao_puxador', 'CEN', 'Centrado', 1),
    ('posicao_puxador', 'ESQ', 'Esquerda', 2),
    ('posicao_puxador', 'DIR', 'Direita', 3),
    ('lado', 'ESQ', 'Esquerdo', 1),
    ('lado', 'DIR', 'Direito', 2),
    ('largura', '18', '18', 1),
    ('largura', '30', '30', 2),
    ('largura', '60', '60', 3),
    ('largura', '70', '70', 4),
    ('largura', '80', '80', 5),
    ('largura', '90', '90', 6),
    ('largura', '100', '100', 7),
    ('largura', '120', '120', 8);

  CREATE TEMP TABLE _mv_forn (n integer PRIMARY KEY, nome text NOT NULL UNIQUE, id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _mv_forn (n, nome) VALUES
    (1, 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    (2, 'Sakidu SL'),
    (3, 'DUPLACH Group, SAU'),
    (4, 'New Bath, Lda');
  CREATE TEMP TABLE _mv_marcas (n integer PRIMARY KEY, nome text NOT NULL UNIQUE, id uuid) ON COMMIT DROP;
  INSERT INTO _mv_marcas (n, nome) VALUES
    (1, 'Moovlux'),
    (2, 'Chic&Bath'),
    (3, 'Duplach'),
    (4, 'Shower Bath');

  -- as descrições (a coluna «Atributos» do Excel, um bloco por linha), sem repetir
  CREATE TEMP TABLE _mv_descs (n integer PRIMARY KEY, texto text NOT NULL) ON COMMIT DROP;
  INSERT INTO _mv_descs (n, texto) VALUES
    (1, 'Com prateleira no interior; Sistema Soft Close
Nota: o CSV antigo tinha também uma variante ''c/tampo'' para Omni não presente nesta tabela de preços - preço dessa variante não confirmado aqui
Pág. 144-145
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (2, 'Prateleira no mesmo acabamento da Frente; Sistema Soft Close
Pág. 138-139
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (3, 'Sistema Soft Close
Pág. 155
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (4, 'Pés de 10cm
Sistema Soft Close
Pág. 157
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (5, 'Só portas com Sistema Soft Close
Pág. 167
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (6, 'Pés de 10cm
Só portas com Sistema Soft Close
Pág. 171
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (7, 'Sistema Soft Close
Pág. 169
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (8, 'Pés de 10cm
Fundo Reduzido
Sistema Soft Close
Pág. 175
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (9, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43101
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (10, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44101
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (11, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43141
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (12, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44141
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (13, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43102
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (14, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44102
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (15, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 45102
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (16, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43142
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (17, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44142
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (18, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 45142
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (19, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43103
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (20, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44103
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (21, 'Vendida separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 8-17
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (22, 'Vendida separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 8-17
Uso com 2 cubas (opção duplo escote)
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (23, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 8-17
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (24, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
15 acabados combináveis livremente (cor diferente no frente e no armazón), sem alterar preço nem código: 6 Madeiras (Roble Noruega, Roble Tibet(33), Roble América, Fresno Suecia, Olmo Canadá, Olmo California(32)); 7 Cores lisas (Blanco Mate(11), Capuchino, Gris Stone, Verde Trébol, Verde Boreal(34), Azul Brisa(35), Gris Marengo(14)); 2 Pedras (Petra Antracita, Marquina). Tirador Riga em 3 acabados de madeira: Roble Claro(6), Roble Oscuro(7), Roble Negro(8) - cor do tirador também não altera preço/código, fica em atributo. Códigos completos em Acabados Generales pág. 118.
Pág. 32-41
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (25, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 32-41
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (26, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Acabamentos combináveis (frente/armazón), sem alterar preço nem código: 4 Frentes Tesel (Negro(79), Blanco(72), Verde(78), Arena(73)) + 6 Madeiras + 7 Cores lisas + 2 Pedras (mesma paleta geral do Riga/Montreal). Uñero Altea em 3 acabamentos: Blanco(1), Negro(2), Cromo(3) - também não altera preço/código. Códigos completos em Acabados Generales pág. 118.
Pág. 42-53
Disponível também com estrutura metálica suspensa (mesma referência/preço)
Pág. 51
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (27, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Acabamentos combináveis (frente/armazón), sem alterar preço nem código: 4 Frentes Tesel (Negro(79), Blanco(72), Verde(78), Arena(73)) + 6 Madeiras + 7 Cores lisas + 2 Pedras (mesma paleta geral do Riga/Montreal). Uñero Altea em 3 acabamentos: Blanco(1), Negro(2), Cromo(3) - também não altera preço/código. Códigos completos em Acabados Generales pág. 118.
Pág. 42-53
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (28, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Acabamentos combináveis (frente/armazón), sem alterar preço nem código: 4 Frentes Tesel (Negro(79), Blanco(72), Verde(78), Arena(73)) + 6 Madeiras + 7 Cores lisas + 2 Pedras (mesma paleta geral do Riga/Montreal). Uñero Altea em 3 acabamentos: Blanco(1), Negro(2), Cromo(3) - também não altera preço/código. Códigos completos em Acabados Generales pág. 118.
Pág. 42-53
Modelos centrados não dispõem de organizador
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (29, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 42-53
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (30, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 42-53
Usada com Bajo Lavabo 1 cajón 27 em versão estrutura metálica
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (31, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 42-53
Usada com a Estrutura Suspendida Inferior
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (32, 'MDF 22mm lacado
10 cores Lacado: Océano, Oliva, Gris 7035, Blanco, Negro, Beige, Moka, Antracita, Mint, Rosa
Tirador integrado (sem tirador à parte)
Fondo 45cm, Alto 60cm
Pág. 62-75
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (33, 'MDF 22mm lacado
10 cores Lacado: Océano, Oliva, Gris 7035, Blanco, Negro, Beige, Moka, Antracita, Mint, Rosa
Tirador integrado (sem tirador à parte)
Fondo 45cm, Alto 60cm
Pág. 76-89
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (34, 'Melamina 19mm
10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina
Tirador Embutido: Cromo (por defeito), Negro (opcional), Blanco (opcional) - sem acréscimo
Fondo 45cm, Alto 60cm
Pág. 30-47
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (35, 'Melamina 19mm
10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina
Sem tirador à parte (frente com corte integrado)
Fondo 45cm, Alto 60cm
Pág. 48-61
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (36, 'Melamina 19mm
10 cores Melamina
Modelo compacto COM PATAS 12cm: Cromo (por defeito), Negro (opcional), Blanco (opcional) - sem acréscimo
Tirador Perfil L: Cromo/Negro/Blanco (sem acréscimo)
Disponível também em versão com Puerta em vez de gavetas
Pág. 204-215
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (37, '10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina
Não vendida separadamente - sempre em conjunto com o Mueble
Corte personalizado +30€; Perfuração para lavabo +60€ (referências à parte)
Pág. Tarifa 5
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (38, '10 cores Resina: Blanco, Gris 7035, Antracita, Negro, Beige, Moka, Océano, Oliva, Mint, Rosa
Não vendida separadamente - sempre em conjunto com o Mueble
Corte personalizado +30€; Perfuração para lavabo +60€ (referências à parte)
Pág. Tarifa 5
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (39, 'Serviço adicional, aplicável a qualquer encimera
Pág. Tarifa 5
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (40, 'Branco (única cor)
Não vendido separadamente - sempre em conjunto com o Mueble
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (41, 'Branco (única cor); 2 cubas
Não vendido separadamente - sempre em conjunto com o Mueble
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (42, '10 cores: Blanco, Gris 7035, Antracita, Negro, Océano, Beige, Moka, Rosa, Mint, Oliva
Não vendido separadamente - sempre em conjunto com o Mueble
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (43, 'Tablero + Canto de PVC gris
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (44, 'LED + Táctil + Calefactável (anti-embaciamento)
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (45, 'Estrutura metálica negra
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (46, 'LED + Táctil + Calefactável + Estrutura metálica negra
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (47, 'LED + Táctil + Calefactável (retroiluminado, sem marco)
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (48, 'Estrutura metálica negra + repisa de apoio
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (49, 'LED + Táctil + Calefactável
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (50, 'LED + Táctil + Calefactável + Estrutura metálica negra + repisa de apoio
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (51, 'Acabamento: Todo Branco Lacado, Todo Tea, Todo Oak, Todo Joplim (mesmo preço, sem frente separada do corpo)
Extra da tabela de PVP do Axis Suspenso
Pág. 155
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (52, 'Extra da tabela de PVP do Axis Suspenso
Pág. 155
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (53, '10 cores Lacado: Océano, Oliva, Gris 7035, Blanco, Negro, Beige, Moka, Antracita, Mint, Rosa (mesmo preço)
Auxiliar de colgar genérico da gama Lacados (Sia, Maná, e demais coleções Lacadas) - só Sia/Maná validados até agora
Pág. Tarifa 3
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (54, '10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina (mesmo preço)
Auxiliar de colgar genérico da gama Melamina (Etna, Zao, Vesubio, e demais coleções Melamina)
Pág. Tarifa 2
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (55, 'Sistema Soft Close; Pés de 10cm
Extra da tabela de PVP do Axis c/Pés
Pág. 179
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (56, 'Sistema Soft Close; Pés de 10cm
Colunas Auxiliares (produto avulso, não ligado a um móvel específico)
Pág. 180
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (57, 'Sistema Soft Close; Pés de 10cm
Colunas Auxiliares (produto avulso, não ligado a um móvel específico)
Pág. 181
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (58, 'Alumínio, 7,2w
Acabamento: Cromado
Fonte: print do Ricardo 13/08/2026
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (59, 'Alumínio
Acabamento: Dourado
Código de fornecedor 86989703
Fonte: print do Ricardo 13/08/2026
PENDENTE: preço a confirmar'),
    (60, 'Alumínio
Acabamento: Preto
Código de fornecedor 84826310
Fonte: print do Ricardo 13/08/2026
PENDENTE: preço a confirmar'),
    (61, 'Alumínio, 12w
Acabamentos: Branco Mate, Preto Mate, Cromado (mesmo preço)
Pág. 184
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (62, 'Alumínio, 7,2w
Acabamentos: Branco Mate, Preto Mate, Cromado (mesmo preço)
Pág. 184
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (63, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
Redondo
*Entrega 4/5 semanas
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (64, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (65, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
Redondo
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (66, 'Cor: Todos os Lacados, Oak, Tea, Joplim
Ver pág. 192
Pág. 185
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (67, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
*Entrega 4/5 semanas
Pág. 185
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (68, 'Acabamentos (mesmo preço, sem código próprio): Branco, Tea, Oak, Joplim, Denver, Azabache
*Entrega 4/5 semanas
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (69, 'Acabamento único: Alumínio
*Entrega 4/5 semanas
Pág. 185
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (70, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; 6500K
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (71, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; 6500K
Reversível: pode ser montado 60x70 ou 70x60
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (72, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Redondo
Pág. 188
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (73, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Redondo
Aro Alumínio Preto Mate
Pág. 188
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (74, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; Modelo Reversível
Retangular
Pág. 189
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (75, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; Modelo Reversível
Reversível: pode ser montado 60x70 ou 70x60
Retangular
Pág. 189
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (76, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Aro Alumínio Preto Mate
Pág. 189
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (77, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Redondo
Pág. 190
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (78, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Inclui espelho de aumento 3x Ø18cm integrado
Pág. 190
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (79, 'IP44; Botão ON/OFF
De pé (suporte para chão) ou fixação à parede
Pág. 191
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (80, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Reversível: pode ser montado 50x100 ou 100x50
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (81, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Reversível: pode ser montado 50x120 ou 120x50
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (82, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Reversível: pode ser montado 50x90 ou 90x50
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (83, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retroiluminado; formato orgânico
Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (84, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo retroiluminado com base reta; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (85, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo c/iluminação foscada e moldura metálica; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (86, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo retroiluminado; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (87, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo c/iluminação foscada; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (88, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Oval c/iluminação foscada; Aplicação vertical ou horizontal; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (89, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular c/iluminação foscada frontal; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (90, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular liso retroiluminado; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (91, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular com foscagem retroiluminado; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (92, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular com duas barras foscadas laterais; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (93, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular com barra foscada superior; Cor led 5550K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (94, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Oval com iluminação foscada lateral; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)');

  -- os nomes do Excel, partidos em « - » (cada linha guarda os números dos pedaços; o nome é a junção, com « - »)
  CREATE TEMP TABLE _mv_nomes (n integer PRIMARY KEY, texto text NOT NULL) ON COMMIT DROP;
  INSERT INTO _mv_nomes (n, texto) VALUES
    (1, 'Móvel OMNI Suspenso 80x50x45'),
    (2, '1 Pio Esquerdo / 2 Gav + Porta (60+20)'),
    (3, 'Corpo White, Frente White c/Lavatório Cerâmico'),
    (4, 'Corpo White, Frente White c/Lavatório Misy'),
    (5, 'Corpo White, Frente Azabache c/Lavatório Cerâmico'),
    (6, 'Corpo White, Frente Azabache c/Lavatório Misy'),
    (7, 'Corpo White, Frente Denver c/Lavatório Cerâmico'),
    (8, 'Corpo White, Frente Denver c/Lavatório Misy'),
    (9, 'Corpo White, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (10, 'Corpo White, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (11, 'Corpo White, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (12, 'Corpo White, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (13, 'Corpo White, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (14, 'Corpo White, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (15, 'Corpo White, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (16, 'Corpo White, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (17, 'Corpo White, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (18, 'Corpo White, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (19, 'Corpo White, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (20, 'Corpo White, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (21, 'Corpo White, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (22, 'Corpo White, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (23, 'Corpo White, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (24, 'Corpo White, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (25, 'Corpo White, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (26, 'Corpo White, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (27, 'Corpo White, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (28, 'Corpo White, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (29, 'Corpo White, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (30, 'Corpo White, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (31, 'Corpo White, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (32, 'Corpo White, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (33, 'Corpo White, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (34, 'Corpo White, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (35, 'Corpo White, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (36, 'Corpo White, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (37, 'Corpo White, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (38, 'Corpo White, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (39, 'Corpo White, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (40, 'Corpo White, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (41, 'Corpo White, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (42, 'Corpo White, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (43, 'Corpo White, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (44, 'Corpo White, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (45, 'Corpo White, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (46, 'Corpo White, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (47, 'Corpo White, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (48, 'Corpo White, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (49, 'Corpo White, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (50, 'Corpo White, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (51, 'Corpo White, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (52, 'Corpo White, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (53, 'Corpo White, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (54, 'Corpo White, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (55, 'Corpo White, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (56, 'Corpo White, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (57, 'Corpo White, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (58, 'Corpo White, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (59, 'Corpo White, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (60, 'Corpo White, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (61, 'Corpo White, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (62, 'Corpo White, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (63, 'Corpo White, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (64, 'Corpo White, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (65, 'Corpo White, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (66, 'Corpo White, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (67, 'Corpo White, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (68, 'Corpo White, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (69, 'Corpo White, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (70, 'Corpo White, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (71, 'Corpo White, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (72, 'Corpo White, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (73, 'Corpo White, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (74, 'Corpo White, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (75, 'Corpo White, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (76, 'Corpo White, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (77, 'Corpo White, Frente Oak (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (78, 'Corpo White, Frente Oak (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (79, 'Corpo White, Frente Tea (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (80, 'Corpo White, Frente Tea (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (81, 'Corpo White, Frente Joplim (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (82, 'Corpo White, Frente Joplim (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (83, 'Corpo White, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (84, 'Corpo White, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (85, 'Corpo White, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (86, 'Corpo White, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (87, 'Corpo White, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (88, 'Corpo White, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (89, 'Corpo White, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (90, 'Corpo White, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (91, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (92, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (93, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (94, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (95, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (96, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (97, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (98, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (99, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (100, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (101, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (102, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (103, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (104, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (105, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (106, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (107, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (108, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (109, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (110, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (111, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (112, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (113, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (114, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (115, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (116, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (117, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (118, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (119, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (120, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (121, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (122, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (123, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (124, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (125, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (126, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (127, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (128, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (129, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (130, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (131, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (132, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (133, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (134, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (135, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (136, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (137, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (138, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (139, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (140, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (141, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (142, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (143, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (144, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (145, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (146, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (147, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (148, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (149, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (150, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (151, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (152, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (153, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (154, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (155, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (156, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (157, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (158, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (159, 'Corpo e Frente Oak (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (160, 'Corpo e Frente Oak (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (161, 'Corpo e Frente Tea (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (162, 'Corpo e Frente Tea (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (163, 'Corpo e Frente Joplim (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (164, 'Corpo e Frente Joplim (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (165, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (166, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (167, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (168, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (169, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (170, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (171, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (172, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (173, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (174, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (175, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (176, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (177, '1 Pio Direito (+20% PVP) / 2 Gav + Porta (60+20)'),
    (178, 'Móvel OMNI Suspenso 100x50x45'),
    (179, '1 Pio Esquerdo / 2 Gav + Porta (70+30)'),
    (180, '1 Pio Direito (+20% PVP) / 2 Gav + Porta (70+30)'),
    (181, 'Móvel OMNI Suspenso 120x50x45'),
    (182, '1 Pio Esquerdo / 2 Gav + Porta (80+40)'),
    (183, '1 Pio Direito (+20% PVP) / 2 Gav + Porta (80+40)'),
    (184, 'Móvel IBIS Suspenso 80x50x45'),
    (185, '1 Pio Direito / 2 Gav + Cubo Aberto (60+20)'),
    (186, 'Corpo White, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (187, 'Corpo White, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (188, '1 Pio Esquerdo (+20% PVP) / 2 Gav + Cubo Aberto (60+20)'),
    (189, 'Móvel IBIS Suspenso 100x50x45'),
    (190, '1 Pio Direito / 2 Gav + Cubo Aberto (70+30)'),
    (191, '1 Pio Esquerdo (+20% PVP) / 2 Gav + Cubo Aberto (70+30)'),
    (192, 'Móvel IBIS Suspenso 120x50x45'),
    (193, '1 Pio Direito / 2 Gav + Cubo Aberto (80+40)'),
    (194, '1 Pio Esquerdo (+20% PVP) / 2 Gav + Cubo Aberto (80+40)'),
    (195, 'Móvel AXIS Suspenso 60x50x45'),
    (196, '1 Pio / 2 Gav'),
    (197, 'Todo Branco Lacado c/Lavatório Cerâmico'),
    (198, 'Todo Tea c/Lavatório Cerâmico'),
    (199, 'Todo Oak c/Lavatório Cerâmico'),
    (200, 'Todo Joplim c/Lavatório Cerâmico'),
    (201, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (202, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (203, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (204, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (205, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (206, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (207, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (208, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (209, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (210, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (211, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (212, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (213, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (214, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (215, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (216, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (217, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (218, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (219, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (220, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (221, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (222, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (223, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (224, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (225, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (226, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (227, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (228, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (229, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (230, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (231, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (232, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (233, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (234, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (235, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (236, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (237, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (238, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (239, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (240, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (241, 'Todo Branco Lacado c/Tampo'),
    (242, 'Todo Tea c/Tampo'),
    (243, 'Todo Oak c/Tampo'),
    (244, 'Todo Joplim c/Tampo'),
    (245, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (246, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (247, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (248, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (249, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (250, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (251, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (252, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (253, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (254, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (255, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (256, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (257, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (258, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (259, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (260, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (261, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (262, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (263, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (264, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (265, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (266, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (267, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (268, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (269, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (270, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (271, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (272, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (273, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (274, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (275, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (276, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (277, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (278, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (279, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (280, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (281, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (282, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (283, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (284, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (285, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (286, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (287, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (288, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (289, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (290, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (291, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (292, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (293, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (294, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (295, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (296, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (297, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (298, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (299, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (300, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (301, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (302, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (303, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (304, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (305, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (306, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (307, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (308, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (309, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (310, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (311, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (312, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (313, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (314, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (315, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (316, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (317, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (318, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (319, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (320, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (321, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (322, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (323, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (324, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (325, 'Móvel AXIS Suspenso 70x50x45'),
    (326, 'Móvel AXIS Suspenso 80x50x45'),
    (327, 'Todo Branco Lacado c/Lavatório Misy'),
    (328, 'Todo Tea c/Lavatório Misy'),
    (329, 'Todo Oak c/Lavatório Misy'),
    (330, 'Todo Joplim c/Lavatório Misy'),
    (331, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (332, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (333, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (334, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (335, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (336, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (337, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (338, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (339, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (340, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (341, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (342, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (343, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (344, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (345, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (346, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (347, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (348, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (349, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (350, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (351, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (352, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (353, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (354, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (355, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (356, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (357, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (358, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (359, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (360, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (361, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (362, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (363, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (364, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (365, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (366, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (367, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (368, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (369, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (370, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (371, 'Móvel AXIS Suspenso 90x50x45'),
    (372, 'Móvel AXIS Suspenso 100x50x45'),
    (373, 'Móvel AXIS Suspenso 120x50x45'),
    (374, '2 Pios / 2 Gav'),
    (375, '2 Pios / 4 Gav'),
    (376, 'Móvel AXIS Suspenso 140x50x45'),
    (377, '2 Pios / 4 Gav (entrega 4/5 semanas)'),
    (378, 'Móvel AXIS Suspenso 150x50x45'),
    (379, 'Móvel AXIS Suspenso 160x50x45'),
    (380, 'Móvel AXIS Suspenso 180x50x45'),
    (381, 'Móvel AXIS Suspenso 60x50x36'),
    (382, '1 Pio / 2 Gav c/Fundo Reduzido'),
    (383, 'Móvel AXIS Suspenso 80x50x36'),
    (384, 'Móvel AXIS Suspenso 100x50x36'),
    (385, 'Móvel AXIS c/Pés 60x81x45'),
    (386, '1 Pio / 3 Gav'),
    (387, 'Móvel AXIS c/Pés 80x81x45'),
    (388, 'Móvel AXIS c/Pés 100x81x45'),
    (389, 'Móvel AXIS c/Pés 120x81x45'),
    (390, '2 Pios / 3 Gav'),
    (391, '2 Pios / 6 Gav (entrega 4/5 semanas)'),
    (392, 'Móvel COIMBRA 60x50x45'),
    (393, '1 Pio / 1 Porta + 2 Gav'),
    (394, 'Todo Branco c/Lavatório Cerâmico'),
    (395, 'Corpo Todo Branco, Frente Branco Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (396, 'Corpo Todo Branco, Frente Branco Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (397, 'Corpo Todo Branco, Frente Cinza Claro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (398, 'Corpo Todo Branco, Frente Cinza Claro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (399, 'Corpo Todo Branco, Frente Cinza Médio Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (400, 'Corpo Todo Branco, Frente Cinza Médio Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (401, 'Corpo Todo Branco, Frente Antracite Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (402, 'Corpo Todo Branco, Frente Antracite Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (403, 'Corpo Todo Branco, Frente Preto Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (404, 'Corpo Todo Branco, Frente Preto Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (405, 'Corpo Todo Branco, Frente Creme Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (406, 'Corpo Todo Branco, Frente Creme Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (407, 'Corpo Todo Branco, Frente Camel Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (408, 'Corpo Todo Branco, Frente Camel Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (409, 'Corpo Todo Branco, Frente Ouro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (410, 'Corpo Todo Branco, Frente Ouro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (411, 'Corpo Todo Branco, Frente Cobre Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (412, 'Corpo Todo Branco, Frente Cobre Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (413, 'Corpo Todo Branco, Frente Chocolate Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (414, 'Corpo Todo Branco, Frente Chocolate Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (415, 'Corpo Todo Branco, Frente Verde Água Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (416, 'Corpo Todo Branco, Frente Verde Água Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (417, 'Corpo Todo Branco, Frente Azeitona Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (418, 'Corpo Todo Branco, Frente Azeitona Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (419, 'Corpo Todo Branco, Frente Azul Mar Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (420, 'Corpo Todo Branco, Frente Azul Mar Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (421, 'Corpo Todo Branco, Frente Azul Escuro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (422, 'Corpo Todo Branco, Frente Azul Escuro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (423, 'Corpo Todo Branco, Frente Prata Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (424, 'Corpo Todo Branco, Frente Prata Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (425, 'Corpo Todo Branco, Frente Rosa Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (426, 'Corpo Todo Branco, Frente Rosa Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (427, 'Corpo Todo Branco, Frente Vermelho Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (428, 'Corpo Todo Branco, Frente Vermelho Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (429, 'Corpo Todo Branco, Frente Azabache (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (430, 'Corpo Todo Branco, Frente Denver (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (431, 'Corpo Todo Branco, Frente Black (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (432, 'Corpo Todo Branco, Frente Artisan (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (433, 'Corpo Todo Branco, Frente Lincoln (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (434, 'Corpo Todo Branco, Frente Halifax (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (435, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (436, 'Corpo e Frente Branco Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (437, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (438, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (439, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (440, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (441, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (442, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (443, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (444, 'Corpo e Frente Preto Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (445, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (446, 'Corpo e Frente Creme Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (447, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (448, 'Corpo e Frente Camel Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (449, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (450, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (451, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (452, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (453, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (454, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (455, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (456, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (457, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (458, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (459, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (460, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (461, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (462, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (463, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (464, 'Corpo e Frente Prata Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (465, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (466, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (467, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (468, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (469, 'Corpo e Frente Azabache (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (470, 'Corpo e Frente Denver (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (471, 'Corpo e Frente Black (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (472, 'Corpo e Frente Artisan (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (473, 'Corpo e Frente Lincoln (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (474, 'Corpo e Frente Halifax (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (475, 'Todo Branco c/Tampo'),
    (476, 'Corpo Todo Branco, Frente Branco Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (477, 'Corpo Todo Branco, Frente Branco Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (478, 'Corpo Todo Branco, Frente Cinza Claro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (479, 'Corpo Todo Branco, Frente Cinza Claro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (480, 'Corpo Todo Branco, Frente Cinza Médio Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (481, 'Corpo Todo Branco, Frente Cinza Médio Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (482, 'Corpo Todo Branco, Frente Antracite Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (483, 'Corpo Todo Branco, Frente Antracite Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (484, 'Corpo Todo Branco, Frente Preto Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (485, 'Corpo Todo Branco, Frente Preto Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (486, 'Corpo Todo Branco, Frente Creme Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (487, 'Corpo Todo Branco, Frente Creme Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (488, 'Corpo Todo Branco, Frente Camel Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (489, 'Corpo Todo Branco, Frente Camel Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (490, 'Corpo Todo Branco, Frente Ouro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (491, 'Corpo Todo Branco, Frente Ouro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (492, 'Corpo Todo Branco, Frente Cobre Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (493, 'Corpo Todo Branco, Frente Cobre Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (494, 'Corpo Todo Branco, Frente Chocolate Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (495, 'Corpo Todo Branco, Frente Chocolate Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (496, 'Corpo Todo Branco, Frente Verde Água Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (497, 'Corpo Todo Branco, Frente Verde Água Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (498, 'Corpo Todo Branco, Frente Azeitona Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (499, 'Corpo Todo Branco, Frente Azeitona Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (500, 'Corpo Todo Branco, Frente Azul Mar Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (501, 'Corpo Todo Branco, Frente Azul Mar Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (502, 'Corpo Todo Branco, Frente Azul Escuro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (503, 'Corpo Todo Branco, Frente Azul Escuro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (504, 'Corpo Todo Branco, Frente Prata Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (505, 'Corpo Todo Branco, Frente Prata Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (506, 'Corpo Todo Branco, Frente Rosa Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (507, 'Corpo Todo Branco, Frente Rosa Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (508, 'Corpo Todo Branco, Frente Vermelho Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (509, 'Corpo Todo Branco, Frente Vermelho Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (510, 'Corpo Todo Branco, Frente Azabache (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (511, 'Corpo Todo Branco, Frente Denver (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (512, 'Corpo Todo Branco, Frente Black (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (513, 'Corpo Todo Branco, Frente Artisan (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (514, 'Corpo Todo Branco, Frente Lincoln (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (515, 'Corpo Todo Branco, Frente Halifax (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (516, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (517, 'Corpo e Frente Branco Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (518, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (519, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (520, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (521, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (522, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (523, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (524, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (525, 'Corpo e Frente Preto Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (526, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (527, 'Corpo e Frente Creme Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (528, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (529, 'Corpo e Frente Camel Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (530, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (531, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (532, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (533, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (534, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (535, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (536, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (537, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (538, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (539, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (540, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (541, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (542, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (543, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (544, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (545, 'Corpo e Frente Prata Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (546, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (547, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (548, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (549, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (550, 'Corpo e Frente Azabache (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (551, 'Corpo e Frente Denver (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (552, 'Corpo e Frente Black (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (553, 'Corpo e Frente Artisan (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (554, 'Corpo e Frente Lincoln (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (555, 'Corpo e Frente Halifax (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (556, 'Móvel COIMBRA 70x50x45'),
    (557, '1 Pio / 2 Portas + 2 Gav'),
    (558, 'Móvel COIMBRA 80x50x45'),
    (559, 'Móvel COIMBRA 100x50x45'),
    (560, 'Móvel COIMBRA 120x50x45'),
    (561, '1 Pio / 2 Portas + 4 Gav'),
    (562, '2 Pios / 2 Portas + 4 Gav'),
    (563, 'Móvel COIMBRA 60x50x36'),
    (564, '1 Pio / 1 Porta + 2 Gav c/Fundo Reduzido'),
    (565, 'Móvel COIMBRA 80x50x36'),
    (566, '1 Pio / 2 Portas + 2 Gav c/Fundo Reduzido'),
    (567, 'Móvel BRAGA c/Pés 50x81x41'),
    (568, '1 Pio / 1 Porta c/1 Prat + 2 Gav'),
    (569, 'Móvel BRAGA c/Pés 60x81x45'),
    (570, 'Móvel BRAGA c/Pés 70x81x45'),
    (571, '1 Pio / 2 Portas c/1 Prat + 2 Gav'),
    (572, 'Móvel BRAGA c/Pés 80x81x45'),
    (573, 'Móvel BRAGA c/Pés 100x81x45'),
    (574, 'Móvel BRAGA c/Pés 120x81x45'),
    (575, '1 Pio / 2 Portas c/1 Prat + 4 Gav'),
    (576, '2 Pios / 2 Portas c/1 Prat + 4 Gav'),
    (577, 'Móvel BRAGA c/Pés 60x81x36'),
    (578, '1 Pio / 1 Porta c/1 Prat + 2 Gav c/Fundo Reduzido'),
    (579, 'Móvel BRAGA c/Pés 80x81x36'),
    (580, '1 Pio / 2 Portas c/1 Prat + 2 Gav c/Fundo Reduzido'),
    (581, 'Móvel PORTO 50x50x41'),
    (582, '1 Pio / 2 Portas'),
    (583, 'Móvel PORTO 60x50x45'),
    (584, 'Móvel PORTO 80x50x45'),
    (585, 'Móvel PORTO 100x50x45'),
    (586, '1 Pio / 3 Portas'),
    (587, 'Móvel PORTO 120x50x45'),
    (588, '2 Pios / 3 Portas'),
    (589, 'Móvel PORTO 60x50x36'),
    (590, '1 Pio / 2 Portas c/Fundo Reduzido'),
    (591, 'Móvel PORTO 80x50x36'),
    (592, 'Móvel BEJA c/Pés 60x81x36'),
    (593, '1 Pio / 2 Portas c/1 Prat'),
    (594, 'Móvel BEJA c/Pés 80x81x36'),
    (595, 'Móvel BEJA c/Pés 100x81x36'),
    (596, '1 Pio / 3 Portas c/1 Prat'),
    (597, 'Bajo Lavabo BREDA 1 cajón 27 60cm'),
    (598, 'Veta Horizontal'),
    (599, 'Frente Elite Claro(71) Armazón Roble Noruega(52) Tirador Negro(2)'),
    (600, 'Frente Elite Claro(71) Armazón Roble Noruega(52) Tirador Plata Brillo(3)'),
    (601, 'Frente Elite Claro(71) Armazón Elite Claro(71) Tirador Negro(2)'),
    (602, 'Frente Elite Claro(71) Armazón Elite Claro(71) Tirador Plata Brillo(3)'),
    (603, 'Frente Elite Oscuro(70) Armazón Olmo California(32) Tirador Negro(2)'),
    (604, 'Frente Elite Oscuro(70) Armazón Olmo California(32) Tirador Plata Brillo(3)'),
    (605, 'Frente Elite Oscuro(70) Armazón Elite Oscuro(70) Tirador Negro(2)'),
    (606, 'Frente Elite Oscuro(70) Armazón Elite Oscuro(70) Tirador Plata Brillo(3)'),
    (607, 'Bajo Lavabo BREDA 1 cajón 27 70cm'),
    (608, 'Bajo Lavabo BREDA 1 cajón 27 80cm'),
    (609, 'Bajo Lavabo BREDA 1 cajón 27 90cm'),
    (610, 'Bajo Lavabo BREDA 1 cajón 27 100cm'),
    (611, 'Bajo Lavabo BREDA 1 cajón 27 120cm'),
    (612, 'Veta Vertical'),
    (613, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 60cm'),
    (614, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 70cm'),
    (615, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 80cm'),
    (616, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 90cm'),
    (617, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 100cm'),
    (618, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 120cm'),
    (619, 'Bajo Lavabo BREDA 2 cajones simétricos 60cm'),
    (620, 'Bajo Lavabo BREDA 2 cajones simétricos 70cm'),
    (621, 'Bajo Lavabo BREDA 2 cajones simétricos 80cm'),
    (622, 'Bajo Lavabo BREDA 2 cajones simétricos 90cm'),
    (623, 'Bajo Lavabo BREDA 2 cajones simétricos 100cm'),
    (624, 'Bajo Lavabo BREDA 2 cajones simétricos 120cm'),
    (625, 'Veta Mixta (H/V)'),
    (626, 'Bajo Lavabo BREDA 2 cajones asimétricos 60cm'),
    (627, 'Bajo Lavabo BREDA 2 cajones asimétricos 70cm'),
    (628, 'Bajo Lavabo BREDA 2 cajones asimétricos 80cm'),
    (629, 'Bajo Lavabo BREDA 2 cajones asimétricos 90cm'),
    (630, 'Bajo Lavabo BREDA 2 cajones asimétricos 100cm'),
    (631, 'Bajo Lavabo BREDA 2 cajones asimétricos 120cm'),
    (632, 'Bajo Lavabo BREDA 3 cajones 60cm'),
    (633, 'Bajo Lavabo BREDA 3 cajones 70cm'),
    (634, 'Bajo Lavabo BREDA 3 cajones 80cm'),
    (635, 'Bajo Lavabo BREDA 3 cajones 90cm'),
    (636, 'Bajo Lavabo BREDA 3 cajones 100cm'),
    (637, 'Bajo Lavabo BREDA 3 cajones 120cm'),
    (638, 'Encimera BREDA de tablero a medida 60cm'),
    (639, 'Encimera BREDA de tablero a medida 70cm'),
    (640, 'Encimera BREDA de tablero a medida 80cm'),
    (641, 'Encimera BREDA de tablero a medida 90cm'),
    (642, 'Encimera BREDA de tablero a medida 100cm'),
    (643, 'Encimera BREDA de tablero a medida 120cm'),
    (644, 'Encimera BREDA sem lavabo Solid Bath a medida 60cm'),
    (645, 'Encimera BREDA sem lavabo Solid Bath a medida 70cm'),
    (646, 'Encimera BREDA sem lavabo Solid Bath a medida 80cm'),
    (647, 'Encimera BREDA sem lavabo Solid Bath a medida 90cm'),
    (648, 'Encimera BREDA sem lavabo Solid Bath a medida 100cm'),
    (649, 'Encimera BREDA sem lavabo Solid Bath a medida 120cm'),
    (650, 'Encimera BREDA porcelana Munich dupla 120cm'),
    (651, 'Lavabo BREDA porcelana Bonn Verde Olivo'),
    (652, 'Lavabo BREDA porcelana Bremen Negro'),
    (653, 'Lavabo BREDA Solid Bath Toulon Ø40'),
    (654, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 60cm)'),
    (655, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 70cm)'),
    (656, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 80cm)'),
    (657, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 90cm)'),
    (658, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 100cm)'),
    (659, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 120cm)'),
    (660, 'Bajo Lavabo RIGA 1 cajón 27 60cm'),
    (661, 'Tirador Centrado'),
    (662, 'Tirador Izquierda'),
    (663, 'Tirador Derecha'),
    (664, 'Bajo Lavabo RIGA 1 cajón 27 70cm'),
    (665, 'Bajo Lavabo RIGA 1 cajón 27 80cm'),
    (666, 'Bajo Lavabo RIGA 1 cajón 27 90cm'),
    (667, 'Bajo Lavabo RIGA 1 cajón 27 100cm'),
    (668, 'Bajo Lavabo RIGA 1 cajón 27 120cm'),
    (669, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 60cm'),
    (670, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 70cm'),
    (671, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 80cm'),
    (672, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 90cm'),
    (673, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 100cm'),
    (674, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 120cm'),
    (675, 'Bajo Lavabo RIGA 1 cajón'),
    (676, 'hueco inferior 60cm'),
    (677, 'hueco inferior 70cm'),
    (678, 'hueco inferior 80cm'),
    (679, 'hueco inferior 90cm'),
    (680, 'hueco inferior 100cm'),
    (681, 'hueco inferior 120cm'),
    (682, 'Bajo Lavabo RIGA 2 cajones simétricos 60cm'),
    (683, 'Bajo Lavabo RIGA 2 cajones simétricos 70cm'),
    (684, 'Bajo Lavabo RIGA 2 cajones simétricos 80cm'),
    (685, 'Bajo Lavabo RIGA 2 cajones simétricos 90cm'),
    (686, 'Bajo Lavabo RIGA 2 cajones simétricos 100cm'),
    (687, 'Bajo Lavabo RIGA 2 cajones simétricos 120cm'),
    (688, 'Bajo Lavabo RIGA 2 cajones asimétricos 60cm'),
    (689, 'Bajo Lavabo RIGA 2 cajones asimétricos 70cm'),
    (690, 'Bajo Lavabo RIGA 2 cajones asimétricos 80cm'),
    (691, 'Bajo Lavabo RIGA 2 cajones asimétricos 90cm'),
    (692, 'Bajo Lavabo RIGA 2 cajones asimétricos 100cm'),
    (693, 'Bajo Lavabo RIGA 2 cajones asimétricos 120cm'),
    (694, 'Bajo Lavabo RIGA 3 cajones 60cm'),
    (695, 'Bajo Lavabo RIGA 3 cajones 70cm'),
    (696, 'Bajo Lavabo RIGA 3 cajones 80cm'),
    (697, 'Bajo Lavabo RIGA 3 cajones 90cm'),
    (698, 'Bajo Lavabo RIGA 3 cajones 100cm'),
    (699, 'Bajo Lavabo RIGA 3 cajones 120cm'),
    (700, 'Lavabo RIGA Solid Bath Rondo Ø40'),
    (701, 'Lavabo RIGA Solid Bath Oh Ø35'),
    (702, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 60cm)'),
    (703, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 70cm)'),
    (704, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 80cm)'),
    (705, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 90cm)'),
    (706, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 100cm)'),
    (707, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 120cm)'),
    (708, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 60cm)'),
    (709, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 70cm)'),
    (710, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 80cm)'),
    (711, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 90cm)'),
    (712, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 100cm)'),
    (713, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 120cm)'),
    (714, 'Bajo Lavabo MILANO 1 cajón 27 60cm'),
    (715, 'Bajo Lavabo MILANO 1 cajón 27 70cm'),
    (716, 'Bajo Lavabo MILANO 1 cajón 27 80cm'),
    (717, 'Bajo Lavabo MILANO 1 cajón 27 90cm'),
    (718, 'Bajo Lavabo MILANO 1 cajón 27 100cm'),
    (719, 'Bajo Lavabo MILANO 1 cajón 27 120cm'),
    (720, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 60cm'),
    (721, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 70cm'),
    (722, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 80cm'),
    (723, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 90cm'),
    (724, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 100cm'),
    (725, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 120cm'),
    (726, 'Bajo Lavabo MILANO 2 cajones simétricos 60cm'),
    (727, 'Bajo Lavabo MILANO 2 cajones simétricos 70cm'),
    (728, 'Bajo Lavabo MILANO 2 cajones simétricos 80cm'),
    (729, 'Bajo Lavabo MILANO 2 cajones simétricos 90cm'),
    (730, 'Bajo Lavabo MILANO 2 cajones simétricos 100cm'),
    (731, 'Bajo Lavabo MILANO 2 cajones simétricos 120cm'),
    (732, 'Bajo Lavabo MILANO 2 cajones asimétricos 60cm'),
    (733, 'Bajo Lavabo MILANO 2 cajones asimétricos 70cm'),
    (734, 'Bajo Lavabo MILANO 2 cajones asimétricos 80cm'),
    (735, 'Bajo Lavabo MILANO 2 cajones asimétricos 90cm'),
    (736, 'Bajo Lavabo MILANO 2 cajones asimétricos 100cm'),
    (737, 'Bajo Lavabo MILANO 2 cajones asimétricos 120cm'),
    (738, 'Bajo Lavabo MILANO 3 cajones 60cm'),
    (739, 'Bajo Lavabo MILANO 3 cajones 70cm'),
    (740, 'Bajo Lavabo MILANO 3 cajones 80cm'),
    (741, 'Bajo Lavabo MILANO 3 cajones 90cm'),
    (742, 'Bajo Lavabo MILANO 3 cajones 100cm'),
    (743, 'Bajo Lavabo MILANO 3 cajones 120cm'),
    (744, 'Bajo Lavabo MILANO 2 cajones'),
    (745, '1 puerta 90cm'),
    (746, 'Lavabo Esquerda'),
    (747, 'Lavabo Direita'),
    (748, 'Centrado'),
    (749, 'Porta Esquerda'),
    (750, 'Porta Direita'),
    (751, '1 puerta 100cm'),
    (752, '1 puerta 120cm'),
    (753, 'Encimera MILANO tablero estándar 60cm'),
    (754, 'Encimera MILANO tablero estándar 70cm'),
    (755, 'Encimera MILANO tablero estándar 80cm'),
    (756, 'Encimera MILANO tablero estándar 90cm'),
    (757, 'Encimera MILANO tablero estándar 100cm'),
    (758, 'Encimera MILANO tablero estándar 120cm'),
    (759, 'Lavabo MILANO porcelana Olfer'),
    (760, 'Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 90cm)'),
    (761, 'Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 100cm)'),
    (762, 'Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 120cm)'),
    (763, 'Lavabo MILANO mineral Pilsen Negro (p/ móvel 80cm)'),
    (764, 'Lavabo MILANO mineral Pilsen Negro (p/ móvel 100cm)'),
    (765, 'Lavabo MILANO mineral Pilsen Negro (p/ móvel 120cm)'),
    (766, 'Estrutura Suspendida Inferior MILANO (p/ móvel 80cm)'),
    (767, 'Estrutura Suspendida Inferior MILANO (p/ móvel 100cm)'),
    (768, 'Estrutura Suspendida Inferior MILANO (p/ móvel 120cm)'),
    (769, 'Repisa Estrutura MILANO (p/ móvel 80cm)'),
    (770, 'Repisa Estrutura MILANO (p/ móvel 100cm)'),
    (771, 'Repisa Estrutura MILANO (p/ móvel 120cm)'),
    (772, 'Mueble MANÁ 60cm'),
    (773, 'Mueble MANÁ 80cm'),
    (774, 'Mueble MANÁ 100cm'),
    (775, 'Mueble MANÁ 120cm (2 módulos de 60cm)'),
    (776, 'Mueble SIA 60cm'),
    (777, 'Mueble SIA 80cm'),
    (778, 'Mueble SIA 100cm'),
    (779, 'Mueble SIA 120cm (2 módulos de 60cm)'),
    (780, 'Mueble ETNA 60cm'),
    (781, 'Mueble ETNA 80cm'),
    (782, 'Mueble ETNA 100cm'),
    (783, 'Mueble ETNA 120cm (2 módulos de 60cm)'),
    (784, 'Mueble ZAO 60cm'),
    (785, 'Mueble ZAO 80cm'),
    (786, 'Mueble ZAO 100cm'),
    (787, 'Mueble ZAO 120cm (2 módulos de 60cm)'),
    (788, 'Mueble VESUBIO 60cm'),
    (789, 'Mueble VESUBIO 80cm'),
    (790, 'Mueble VESUBIO 100cm'),
    (791, 'Mueble VESUBIO 120cm (2 módulos de 60cm)'),
    (792, 'Encimera Melamina 60x46 (p/ Etna/Zao/Vesubio)'),
    (793, 'Encimera Melamina 80x46 (p/ Etna/Zao/Vesubio)'),
    (794, 'Encimera Melamina 100x46 (p/ Etna/Zao/Vesubio)'),
    (795, 'Encimera Melamina 120x46 (p/ Etna/Zao/Vesubio)'),
    (796, 'Encimera Melamina 140x46 (p/ Etna/Zao/Vesubio)'),
    (797, 'Encimera Melamina 160x46 (p/ Etna/Zao/Vesubio)'),
    (798, 'Encimera Piedra Compacta (Resina) 60x46 (p/ Maná/Sia)'),
    (799, 'Encimera Piedra Compacta (Resina) 80x46 (p/ Maná/Sia)'),
    (800, 'Encimera Piedra Compacta (Resina) 100x46 (p/ Maná/Sia)'),
    (801, 'Encimera Piedra Compacta (Resina) 120x46 (p/ Maná/Sia)'),
    (802, 'Encimera Piedra Compacta (Resina) 140x46 (p/ Maná/Sia)'),
    (803, 'Encimera Piedra Compacta (Resina) 160x46 (p/ Maná/Sia)'),
    (804, 'Serviço de Corte de Encimera Personalizado'),
    (805, 'Serviço de Perfuração de Encimera para Lavabo'),
    (806, 'Lavabo Cerámica ST 60x46'),
    (807, 'Lavabo Cerámica ST 80x46'),
    (808, 'Lavabo Cerámica ST 100x46'),
    (809, 'Lavabo Cerámica ST 120x46 Desplazado Izquierda'),
    (810, 'Lavabo Cerámica ST 120x46 Desplazado Derecha'),
    (811, 'Lavabo Cerámica ST 120x46 2 Senos'),
    (812, 'Lavabo Resina HE+ 60x46x8'),
    (813, 'Lavabo Resina HE+ 80x46x8'),
    (814, 'Lavabo Resina HE+ 100x46x8'),
    (815, 'Lavabo Sobreencimera Resina Round Ø40x8'),
    (816, 'Lavabo Sobreencimera Resina Libra 40x40x8'),
    (817, 'Lavabo Sobreencimera Resina Ronda Ø37x8'),
    (818, 'Lavabo Sobreencimera Resina Oval 50x37x8'),
    (819, 'Lavabo Sobreencimera Resina Kuvic 37x37x8'),
    (820, 'Lavabo Sobreencimera Resina Kuvic XL 50x37x8'),
    (821, 'Espelho Rectangular Liso 60x70cm'),
    (822, 'Espelho Rectangular Liso 80x70cm'),
    (823, 'Espelho Rectangular Liso 100x70cm'),
    (824, 'Espelho Rectangular Liso 120x70cm'),
    (825, 'Espelho Rectangular LED 60x70cm'),
    (826, 'Espelho Rectangular LED 80x70cm'),
    (827, 'Espelho Rectangular LED 100x70cm'),
    (828, 'Espelho Rectangular LED 120x70cm'),
    (829, 'Espelho Redondo Marco Ø60cm'),
    (830, 'Espelho Redondo Marco Ø80cm'),
    (831, 'Espelho Redondo Marco Ø100cm'),
    (832, 'Espelho Redondo Marco LED Ø60cm'),
    (833, 'Espelho Redondo Marco LED Ø80cm'),
    (834, 'Espelho Redondo Marco LED Ø100cm'),
    (835, 'Espelho Redondo Retroiluminado Ø60cm'),
    (836, 'Espelho Redondo Retroiluminado Ø80cm'),
    (837, 'Espelho Redondo Retroiluminado Ø100cm'),
    (838, 'Espelho Óvalo Liso 60x100'),
    (839, 'Espelho Óvalo Marco 60x100'),
    (840, 'Espelho Óvalo Repisa 60x90 (altura total 105cm)'),
    (841, 'Espelho Óvalo LED 60x100'),
    (842, 'Espelho Óvalo Marco LED 60x100'),
    (843, 'Espelho Óvalo Repisa LED 60x90 (altura total 105cm)'),
    (844, 'Coluna Suspensa AXIS 40x160x25'),
    (845, 'Todo Branco Lacado'),
    (846, 'Todo Tea'),
    (847, 'Todo Oak'),
    (848, 'Todo Joplim'),
    (849, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (850, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (851, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (852, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (853, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (854, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (855, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (856, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (857, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (858, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (859, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (860, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (861, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (862, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (863, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (864, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (865, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (866, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (867, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (868, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (869, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (870, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (871, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (872, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (873, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (874, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (875, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (876, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (877, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (878, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (879, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (880, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (881, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (882, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (883, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (884, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (885, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (886, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (887, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (888, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (889, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (890, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (891, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (892, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (893, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (894, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (895, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (896, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (897, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (898, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (899, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (900, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (901, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (902, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (903, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (904, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (905, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (906, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (907, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (908, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (909, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (910, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (911, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (912, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (913, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (914, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (915, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (916, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (917, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (918, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (919, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (920, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (921, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (922, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (923, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (924, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (925, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (926, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (927, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (928, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (929, 'Auxiliar de Colgar Lacado 1H 35x35x20 (p/ Sia/Maná)'),
    (930, 'Auxiliar de Colgar Lacado 3H 75x35x20 (p/ Sia/Maná)'),
    (931, 'Auxiliar de Colgar Lacado Puerta 75x35x20'),
    (932, 'Abertura Izquierda (p/ Sia/Maná)'),
    (933, 'Abertura Derecha (p/ Sia/Maná)'),
    (934, 'Auxiliar de Colgar Lacado Puerta+Hueco Bajo, Abertura Izquierda 75x35x20 (p/ Sia/Maná)'),
    (935, 'Auxiliar de Colgar Lacado Puerta+Hueco Bajo, Abertura Derecha 75x35x20 (p/ Sia/Maná)'),
    (936, 'Auxiliar de Colgar Lacado Puerta+Hueco Alto, Abertura Izquierda 75x35x20 (p/ Sia/Maná)'),
    (937, 'Auxiliar de Colgar Lacado Puerta+Hueco Alto, Abertura Derecha 75x35x20 (p/ Sia/Maná)'),
    (938, 'Auxiliar de Colgar Melamina 1H 35x35x20 (p/ Etna/Zao/Vesubio)'),
    (939, 'Auxiliar de Colgar Melamina 3H 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (940, 'Auxiliar de Colgar Melamina Puerta 75x35x20'),
    (941, 'Abertura Izquierda (p/ Etna/Zao/Vesubio)'),
    (942, 'Abertura Derecha (p/ Etna/Zao/Vesubio)'),
    (943, 'Auxiliar de Colgar Melamina Puerta+Hueco Bajo, Abertura Izquierda 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (944, 'Auxiliar de Colgar Melamina Puerta+Hueco Bajo, Abertura Derecha 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (945, 'Auxiliar de Colgar Melamina Puerta+Hueco Alto, Abertura Izquierda 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (946, 'Auxiliar de Colgar Melamina Puerta+Hueco Alto, Abertura Derecha 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (947, 'Coluna Line 30x170x32'),
    (948, '2 Portas c/2 Prat'),
    (949, 'Corpo Todo Branco, Frente Branco Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (950, 'Corpo Todo Branco, Frente Branco Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (951, 'Corpo Todo Branco, Frente Cinza Claro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (952, 'Corpo Todo Branco, Frente Cinza Claro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (953, 'Corpo Todo Branco, Frente Cinza Médio Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (954, 'Corpo Todo Branco, Frente Cinza Médio Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (955, 'Corpo Todo Branco, Frente Antracite Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (956, 'Corpo Todo Branco, Frente Antracite Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (957, 'Corpo Todo Branco, Frente Preto Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (958, 'Corpo Todo Branco, Frente Preto Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (959, 'Corpo Todo Branco, Frente Creme Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (960, 'Corpo Todo Branco, Frente Creme Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (961, 'Corpo Todo Branco, Frente Camel Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (962, 'Corpo Todo Branco, Frente Camel Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (963, 'Corpo Todo Branco, Frente Ouro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (964, 'Corpo Todo Branco, Frente Ouro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (965, 'Corpo Todo Branco, Frente Cobre Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (966, 'Corpo Todo Branco, Frente Cobre Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (967, 'Corpo Todo Branco, Frente Chocolate Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (968, 'Corpo Todo Branco, Frente Chocolate Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (969, 'Corpo Todo Branco, Frente Verde Água Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (970, 'Corpo Todo Branco, Frente Verde Água Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (971, 'Corpo Todo Branco, Frente Azeitona Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (972, 'Corpo Todo Branco, Frente Azeitona Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (973, 'Corpo Todo Branco, Frente Azul Mar Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (974, 'Corpo Todo Branco, Frente Azul Mar Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (975, 'Corpo Todo Branco, Frente Azul Escuro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (976, 'Corpo Todo Branco, Frente Azul Escuro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (977, 'Corpo Todo Branco, Frente Prata Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (978, 'Corpo Todo Branco, Frente Prata Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (979, 'Corpo Todo Branco, Frente Rosa Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (980, 'Corpo Todo Branco, Frente Rosa Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (981, 'Corpo Todo Branco, Frente Vermelho Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (982, 'Corpo Todo Branco, Frente Vermelho Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (983, 'Corpo Todo Branco, Frente Azabache (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (984, 'Corpo Todo Branco, Frente Denver (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (985, 'Corpo Todo Branco, Frente Black (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (986, 'Corpo Todo Branco, Frente Artisan (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (987, 'Corpo Todo Branco, Frente Lincoln (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (988, 'Corpo Todo Branco, Frente Halifax (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (989, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (990, 'Corpo e Frente Branco Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (991, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (992, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (993, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (994, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (995, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (996, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (997, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (998, 'Corpo e Frente Preto Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (999, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1000, 'Corpo e Frente Creme Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1001, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1002, 'Corpo e Frente Camel Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1003, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1004, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1005, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1006, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1007, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1008, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1009, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1010, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1011, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1012, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1013, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1014, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1015, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1016, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1017, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1018, 'Corpo e Frente Prata Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1019, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1020, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1021, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1022, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1023, 'Corpo e Frente Azabache (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1024, 'Corpo e Frente Denver (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1025, 'Corpo e Frente Black (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1026, 'Corpo e Frente Artisan (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1027, 'Corpo e Frente Lincoln (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1028, 'Corpo e Frente Halifax (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1029, 'Coluna Line 50x170x32'),
    (1030, '4 Portas c/2 Prat'),
    (1031, 'Coluna Alta Lux 40x170x32'),
    (1032, '2 Portas c/2 Prat + 2 Gav'),
    (1033, '1 Porta c/1 Prat + 2 Gav + 1 Tulha'),
    (1034, 'Coluna Alta Lux 60x170x32'),
    (1035, '4 Portas c/2 Prat + 2 Gav'),
    (1036, '2 Portas c/2 Prat + 2 Gav + 1 Tulha'),
    (1037, 'Coluna Baixa Lux 40x80x32'),
    (1038, '1 Gav + 1 Porta c/1 Prat'),
    (1039, '1 Gav + 1 Tulha'),
    (1040, 'Coluna Baixa Lux 60x80x32'),
    (1041, '1 Gav + 2 Portas c/1 Prat'),
    (1042, 'Aplique LED Lara Cromado 30CM'),
    (1043, 'Aplique LED Dourado 30CM'),
    (1044, 'Aplique LED Preto 30CM'),
    (1045, 'Aplique LED Beatriz 60CM'),
    (1046, 'Aplique LED Ana 18CM'),
    (1047, 'Espelho LIPI Ø80'),
    (1048, 'Espelho LIPI Ø100'),
    (1049, 'Espelho LIPI Ø120'),
    (1050, 'Espelho Oval c/Moldura de 1cm 90x50'),
    (1051, 'Espelho Circular c/Moldura de 3cm Ø70'),
    (1052, 'Espelho Circular c/Moldura de 1cm Ø70'),
    (1053, 'Espelho c/Moldura de 3cm 80x70'),
    (1054, 'Espelho c/Moldura de 3cm 100x70'),
    (1055, 'Espelho c/Moldura de 3cm 120x70'),
    (1056, 'Espelho c/Moldura de 1cm 80x70'),
    (1057, 'Espelho c/Moldura de 1cm 100x70'),
    (1058, 'Espelho c/Moldura de 1cm 120x70'),
    (1059, 'Espelho c/Moldura de 1cm 150x70'),
    (1060, 'Espelho Round c/Cantos Redondos 80x70'),
    (1061, 'Espelho Round c/Cantos Redondos 100x70'),
    (1062, 'Espelho Round c/Cantos Redondos 120x70'),
    (1063, 'Espelho Round c/Cantos Redondos 140x70'),
    (1064, 'Espelho Classic c/Moldura de 3cm 80x70'),
    (1065, 'Espelho Classic c/Moldura de 3cm 90x70'),
    (1066, 'Espelho Classic c/Moldura de 3cm 100x70'),
    (1067, 'Espelho Classic c/Moldura de 3cm 120x70'),
    (1068, 'Espelho c/Prateleira 60x72'),
    (1069, 'Espelho c/Prateleira 80x72'),
    (1070, 'Espelho c/Prateleira 100x72'),
    (1071, 'Espelho c/Prateleira 120x72'),
    (1072, 'Espelho c/Prateleira 140x72'),
    (1073, 'Espelho c/Orla Alumínio 100x50'),
    (1074, 'Espelho c/Orla Alumínio 100x60'),
    (1075, 'Espelho c/Orla Alumínio 100x70'),
    (1076, 'Espelho c/Orla Alumínio 100x80'),
    (1077, 'Espelho c/Orla Alumínio 120x50'),
    (1078, 'Espelho c/Orla Alumínio 120x60'),
    (1079, 'Espelho c/Orla Alumínio 120x70'),
    (1080, 'Espelho c/Orla Alumínio 120x80'),
    (1081, 'Espelho c/Orla Alumínio 60x40'),
    (1082, 'Espelho c/Orla Alumínio 60x50'),
    (1083, 'Espelho c/Orla Alumínio 60x60'),
    (1084, 'Espelho c/Orla Alumínio 70x50'),
    (1085, 'Espelho c/Orla Alumínio 70x60'),
    (1086, 'Espelho c/Orla Alumínio 70x70'),
    (1087, 'Espelho c/Orla Alumínio 80x50'),
    (1088, 'Espelho c/Orla Alumínio 80x60'),
    (1089, 'Espelho c/Orla Alumínio 80x70'),
    (1090, 'Espelho c/Orla Alumínio 80x80'),
    (1091, 'Espelho c/Orla Alumínio 90x50'),
    (1092, 'Espelho c/Orla Alumínio 90x60'),
    (1093, 'Espelho c/Orla Alumínio 90x70'),
    (1094, 'Espelho c/Orla Alumínio 90x80'),
    (1095, 'Espelho LED Eris 100x80'),
    (1096, 'Espelho LED Eris 120x80'),
    (1097, 'Espelho LED Eris 60x70'),
    (1098, 'Espelho LED Eris 80x80'),
    (1099, 'Espelho LED MERCÚRIO Ø60'),
    (1100, 'Espelho LED MERCÚRIO Ø80'),
    (1101, 'Espelho LED Plutão Ø80'),
    (1102, 'Espelho LED MARTE 45x90'),
    (1103, 'Espelho LED MARTE 100x80'),
    (1104, 'Espelho LED MARTE 120x80'),
    (1105, 'Espelho LED MARTE 60x70'),
    (1106, 'Espelho LED MARTE 80x80'),
    (1107, 'Espelho LED Urano 100x80'),
    (1108, 'Espelho LED Urano 120x80'),
    (1109, 'Espelho LED Urano 80x80'),
    (1110, 'Espelho LED Lua Ø80'),
    (1111, 'Espelho LED Neptuno 100x80'),
    (1112, 'Espelho LED Neptuno 120x80'),
    (1113, 'Espelho LED Neptuno 80x80'),
    (1114, 'Espelho LED Calisto 170x75'),
    (1115, 'Espelho LED Sol 50x100'),
    (1116, 'Espelho LED Sol 50x120'),
    (1117, 'Espelho LED Sol 50x90'),
    (1118, 'Espelho LED Verona 80x50'),
    (1119, 'Espelho LED Latina Ø60'),
    (1120, 'Espelho LED Latina Ø70'),
    (1121, 'Espelho LED Latina Ø80'),
    (1122, 'Espelho LED Latina Ø90'),
    (1123, 'Espelho LED Trentino Ø50'),
    (1124, 'Moldura Preto Mate'),
    (1125, 'Moldura Branco Mate'),
    (1126, 'Moldura Dourado Brilho'),
    (1127, 'Espelho LED Trentino Ø60'),
    (1128, 'Espelho LED Trentino Ø70'),
    (1129, 'Espelho LED Trentino Ø80'),
    (1130, 'Espelho LED Roma Ø60'),
    (1131, 'Espelho LED Roma Ø70'),
    (1132, 'Espelho LED Roma Ø80'),
    (1133, 'Espelho LED Milão Ø60'),
    (1134, 'Espelho LED Milão Ø70'),
    (1135, 'Espelho LED Milão Ø80'),
    (1136, 'Espelho LED Florença 100x50'),
    (1137, 'Espelho LED Florença 120x50'),
    (1138, 'Espelho LED Florença 80x50'),
    (1139, 'Espelho LED Modena 100x80'),
    (1140, 'Espelho LED Modena 120x80'),
    (1141, 'Espelho LED Modena 60x80'),
    (1142, 'Espelho LED Modena 80x80'),
    (1143, 'Espelho LED Rimini 100x80'),
    (1144, 'Espelho LED Rimini 120x80'),
    (1145, 'Espelho LED Rimini 60x80'),
    (1146, 'Espelho LED Rimini 80x80'),
    (1147, 'Espelho LED Tivoli 100x80'),
    (1148, 'Espelho LED Tivoli 120x80'),
    (1149, 'Espelho LED Tivoli 60x80'),
    (1150, 'Espelho LED Tivoli 80x80'),
    (1151, 'Espelho LED Lucci 100x60'),
    (1152, 'Espelho LED Lucci 60x50'),
    (1153, 'Espelho LED Lucci 80x65'),
    (1154, 'Espelho LED Bari 100x70'),
    (1155, 'Espelho LED Bari 120x70'),
    (1156, 'Espelho LED Bari 140x70'),
    (1157, 'Espelho LED Bari 80x70'),
    (1158, 'Espelho LED Vinci 50x100'),
    (1159, 'Espelho LED Vinci 50x120'),
    (1160, 'Espelho LED Vinci 50x80');
  -- as Medidas 2D/3D (cm): tipo, largura, comprimento, espessura
  CREATE TEMP TABLE _mv_medidas (n integer PRIMARY KEY, tipo text NOT NULL, l numeric NOT NULL, a numeric NOT NULL, p numeric) ON COMMIT DROP;
  INSERT INTO _mv_medidas (n, tipo, l, a, p) VALUES
    (1, '3D', 80, 50, 45),
    (2, '3D', 100, 50, 45),
    (3, '3D', 120, 50, 45),
    (4, '3D', 60, 50, 45),
    (5, '3D', 70, 50, 45),
    (6, '3D', 90, 50, 45),
    (7, '3D', 140, 50, 45),
    (8, '3D', 150, 50, 45),
    (9, '3D', 160, 50, 45),
    (10, '3D', 180, 50, 45),
    (11, '3D', 60, 50, 36),
    (12, '3D', 80, 50, 36),
    (13, '3D', 100, 50, 36),
    (14, '3D', 60, 81, 45),
    (15, '3D', 80, 81, 45),
    (16, '3D', 100, 81, 45),
    (17, '3D', 120, 81, 45),
    (18, '3D', 50, 81, 41),
    (19, '3D', 70, 81, 45),
    (20, '3D', 60, 81, 36),
    (21, '3D', 80, 81, 36),
    (22, '3D', 50, 50, 41),
    (23, '3D', 100, 81, 36),
    (24, '2D', 40, 40, NULL),
    (25, '2D', 35, 35, NULL),
    (26, '3D', 60, 60, 45),
    (27, '3D', 80, 60, 45),
    (28, '3D', 100, 60, 45),
    (29, '3D', 120, 60, 45),
    (30, '2D', 60, 46, NULL),
    (31, '2D', 80, 46, NULL),
    (32, '2D', 100, 46, NULL),
    (33, '2D', 120, 46, NULL),
    (34, '2D', 140, 46, NULL),
    (35, '2D', 160, 46, NULL),
    (36, '3D', 60, 46, 8),
    (37, '3D', 80, 46, 8),
    (38, '3D', 100, 46, 8),
    (39, '3D', 40, 40, 8),
    (40, '3D', 37, 37, 8),
    (41, '3D', 50, 37, 8),
    (42, '2D', 60, 70, NULL),
    (43, '2D', 80, 70, NULL),
    (44, '2D', 100, 70, NULL),
    (45, '2D', 120, 70, NULL),
    (46, '2D', 60, 60, NULL),
    (47, '2D', 80, 80, NULL),
    (48, '2D', 100, 100, NULL),
    (49, '2D', 60, 100, NULL),
    (50, '2D', 60, 90, NULL),
    (51, '3D', 40, 160, 25),
    (52, '3D', 35, 35, 20),
    (53, '3D', 75, 35, 20),
    (54, '3D', 30, 170, 32),
    (55, '3D', 50, 170, 32),
    (56, '3D', 40, 170, 32),
    (57, '3D', 60, 170, 32),
    (58, '3D', 40, 80, 32),
    (59, '3D', 60, 80, 32),
    (60, '2D', 120, 120, NULL),
    (61, '2D', 90, 50, NULL),
    (62, '2D', 70, 70, NULL),
    (63, '2D', 150, 70, NULL),
    (64, '2D', 140, 70, NULL),
    (65, '2D', 90, 70, NULL),
    (66, '2D', 60, 72, NULL),
    (67, '2D', 80, 72, NULL),
    (68, '2D', 100, 72, NULL),
    (69, '2D', 120, 72, NULL),
    (70, '2D', 140, 72, NULL),
    (71, '2D', 100, 50, NULL),
    (72, '2D', 100, 60, NULL),
    (73, '2D', 100, 80, NULL),
    (74, '2D', 120, 50, NULL),
    (75, '2D', 120, 60, NULL),
    (76, '2D', 120, 80, NULL),
    (77, '2D', 60, 40, NULL),
    (78, '2D', 60, 50, NULL),
    (79, '2D', 70, 50, NULL),
    (80, '2D', 70, 60, NULL),
    (81, '2D', 80, 50, NULL),
    (82, '2D', 80, 60, NULL),
    (83, '2D', 90, 60, NULL),
    (84, '2D', 90, 80, NULL),
    (85, '2D', 45, 90, NULL),
    (86, '2D', 170, 75, NULL),
    (87, '2D', 50, 100, NULL),
    (88, '2D', 50, 120, NULL),
    (89, '2D', 50, 90, NULL),
    (90, '2D', 90, 90, NULL),
    (91, '2D', 50, 50, NULL),
    (92, '2D', 60, 80, NULL),
    (93, '2D', 80, 65, NULL),
    (94, '2D', 50, 80, NULL);

  -- as 11397 linhas, uma por linha de texto, campos separados por «|» (vazio = sem valor): linha do Excel | sub |
  -- modelo | pedaços do nome (separados por «.») | cor | corpo | frente | tonalidade | veta | puxador | posição do puxador |
  -- lado | largura | medida | marca | fornecedor | custo | pvp | grossista | distribuidor | descrição | código do fornecedor
  CREATE TEMP TABLE _mv_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo smallint NOT NULL, partes integer[] NOT NULL,
                                cor text, corpo text, frente text, ton text, veta text, pux text, pos text, lado text, larg text,
                                medida integer, marca integer NOT NULL, fornecedor integer NOT NULL, custo numeric, pvp numeric,
                                grossista numeric, distribuidor numeric, descricao integer, cod_forn text,
                                nome text, med_tipo text, med_l numeric, med_a numeric, med_p numeric) ON COMMIT DROP;
  INSERT INTO _mv_linhas (linha, sub, modelo, partes, cor, corpo, frente, ton, veta, pux, pos, lado, larg,
                          medida, marca, fornecedor, custo, pvp, grossista, distribuidor, descricao, cod_forn)
  SELECT f[1]::integer, f[2], f[3]::smallint, string_to_array(f[4], '.')::integer[], nullif(f[5], ''), nullif(f[6], ''),
         nullif(f[7], ''), nullif(f[8], ''), nullif(f[9], ''), nullif(f[10], ''), nullif(f[11], ''), nullif(f[12], ''),
         nullif(f[13], ''), nullif(f[14], '')::integer, f[15]::integer, f[16]::integer, nullif(f[17], '')::numeric,
         nullif(f[18], '')::numeric, nullif(f[19], '')::numeric, nullif(f[20], '')::numeric, nullif(f[21], '')::integer,
         nullif(f[22], '')
  FROM (SELECT string_to_array(s, '|') AS f
        FROM regexp_split_to_table($linhas$
2|ML|1|1.2.3||WH|WH|||||ESQ||1|1|1|172.80|320.00|||1|
3|ML|2|1.2.4||WH|WH|||||ESQ||1|1|1|302.40|560.00|||1|
4|ML|1|1.2.5||WH|AZB|||||ESQ||1|1|1|172.80|320.00|||1|
5|ML|2|1.2.6||WH|AZB|||||ESQ||1|1|1|302.40|560.00|||1|
6|ML|1|1.2.7||WH|DEN|||||ESQ||1|1|1|172.80|320.00|||1|
7|ML|2|1.2.8||WH|DEN|||||ESQ||1|1|1|302.40|560.00|||1|
8|ML|1|1.2.9||WH|BCO|B||||ESQ||1|1|1|199.80|370.00|||1|
9|ML|2|1.2.10||WH|BCO|B||||ESQ||1|1|1|329.40|610.00|||1|
10|ML|1|1.2.11||WH|BCO|M||||ESQ||1|1|1|199.80|370.00|||1|
11|ML|2|1.2.12||WH|BCO|M||||ESQ||1|1|1|329.40|610.00|||1|
12|ML|1|1.2.13||WH|CCL|B||||ESQ||1|1|1|199.80|370.00|||1|
13|ML|2|1.2.14||WH|CCL|B||||ESQ||1|1|1|329.40|610.00|||1|
14|ML|1|1.2.15||WH|CCL|M||||ESQ||1|1|1|199.80|370.00|||1|
15|ML|2|1.2.16||WH|CCL|M||||ESQ||1|1|1|329.40|610.00|||1|
16|ML|1|1.2.17||WH|CME|B||||ESQ||1|1|1|199.80|370.00|||1|
17|ML|2|1.2.18||WH|CME|B||||ESQ||1|1|1|329.40|610.00|||1|
18|ML|1|1.2.19||WH|CME|M||||ESQ||1|1|1|199.80|370.00|||1|
19|ML|2|1.2.20||WH|CME|M||||ESQ||1|1|1|329.40|610.00|||1|
20|ML|1|1.2.21||WH|ANT|B||||ESQ||1|1|1|199.80|370.00|||1|
21|ML|2|1.2.22||WH|ANT|B||||ESQ||1|1|1|329.40|610.00|||1|
22|ML|1|1.2.23||WH|ANT|M||||ESQ||1|1|1|199.80|370.00|||1|
23|ML|2|1.2.24||WH|ANT|M||||ESQ||1|1|1|329.40|610.00|||1|
24|ML|1|1.2.25||WH|PTO|B||||ESQ||1|1|1|199.80|370.00|||1|
25|ML|2|1.2.26||WH|PTO|B||||ESQ||1|1|1|329.40|610.00|||1|
26|ML|1|1.2.27||WH|PTO|M||||ESQ||1|1|1|199.80|370.00|||1|
27|ML|2|1.2.28||WH|PTO|M||||ESQ||1|1|1|329.40|610.00|||1|
28|ML|1|1.2.29||WH|CRE|B||||ESQ||1|1|1|199.80|370.00|||1|
29|ML|2|1.2.30||WH|CRE|B||||ESQ||1|1|1|329.40|610.00|||1|
30|ML|1|1.2.31||WH|CRE|M||||ESQ||1|1|1|199.80|370.00|||1|
31|ML|2|1.2.32||WH|CRE|M||||ESQ||1|1|1|329.40|610.00|||1|
32|ML|1|1.2.33||WH|CAM|B||||ESQ||1|1|1|199.80|370.00|||1|
33|ML|2|1.2.34||WH|CAM|B||||ESQ||1|1|1|329.40|610.00|||1|
34|ML|1|1.2.35||WH|CAM|M||||ESQ||1|1|1|199.80|370.00|||1|
35|ML|2|1.2.36||WH|CAM|M||||ESQ||1|1|1|329.40|610.00|||1|
36|ML|1|1.2.37||WH|OUR|B||||ESQ||1|1|1|199.80|370.00|||1|
37|ML|2|1.2.38||WH|OUR|B||||ESQ||1|1|1|329.40|610.00|||1|
38|ML|1|1.2.39||WH|OUR|M||||ESQ||1|1|1|199.80|370.00|||1|
39|ML|2|1.2.40||WH|OUR|M||||ESQ||1|1|1|329.40|610.00|||1|
40|ML|1|1.2.41||WH|COB|B||||ESQ||1|1|1|199.80|370.00|||1|
41|ML|2|1.2.42||WH|COB|B||||ESQ||1|1|1|329.40|610.00|||1|
42|ML|1|1.2.43||WH|COB|M||||ESQ||1|1|1|199.80|370.00|||1|
43|ML|2|1.2.44||WH|COB|M||||ESQ||1|1|1|329.40|610.00|||1|
44|ML|1|1.2.45||WH|CHO|B||||ESQ||1|1|1|199.80|370.00|||1|
45|ML|2|1.2.46||WH|CHO|B||||ESQ||1|1|1|329.40|610.00|||1|
46|ML|1|1.2.47||WH|CHO|M||||ESQ||1|1|1|199.80|370.00|||1|
47|ML|2|1.2.48||WH|CHO|M||||ESQ||1|1|1|329.40|610.00|||1|
48|ML|1|1.2.49||WH|VAG|B||||ESQ||1|1|1|199.80|370.00|||1|
49|ML|2|1.2.50||WH|VAG|B||||ESQ||1|1|1|329.40|610.00|||1|
50|ML|1|1.2.51||WH|VAG|M||||ESQ||1|1|1|199.80|370.00|||1|
51|ML|2|1.2.52||WH|VAG|M||||ESQ||1|1|1|329.40|610.00|||1|
52|ML|1|1.2.53||WH|AZE|B||||ESQ||1|1|1|199.80|370.00|||1|
53|ML|2|1.2.54||WH|AZE|B||||ESQ||1|1|1|329.40|610.00|||1|
54|ML|1|1.2.55||WH|AZE|M||||ESQ||1|1|1|199.80|370.00|||1|
55|ML|2|1.2.56||WH|AZE|M||||ESQ||1|1|1|329.40|610.00|||1|
56|ML|1|1.2.57||WH|AMA|B||||ESQ||1|1|1|199.80|370.00|||1|
57|ML|2|1.2.58||WH|AMA|B||||ESQ||1|1|1|329.40|610.00|||1|
58|ML|1|1.2.59||WH|AMA|M||||ESQ||1|1|1|199.80|370.00|||1|
59|ML|2|1.2.60||WH|AMA|M||||ESQ||1|1|1|329.40|610.00|||1|
60|ML|1|1.2.61||WH|AES|B||||ESQ||1|1|1|199.80|370.00|||1|
61|ML|2|1.2.62||WH|AES|B||||ESQ||1|1|1|329.40|610.00|||1|
62|ML|1|1.2.63||WH|AES|M||||ESQ||1|1|1|199.80|370.00|||1|
63|ML|2|1.2.64||WH|AES|M||||ESQ||1|1|1|329.40|610.00|||1|
64|ML|1|1.2.65||WH|PRA|B||||ESQ||1|1|1|199.80|370.00|||1|
65|ML|2|1.2.66||WH|PRA|B||||ESQ||1|1|1|329.40|610.00|||1|
66|ML|1|1.2.67||WH|PRA|M||||ESQ||1|1|1|199.80|370.00|||1|
67|ML|2|1.2.68||WH|PRA|M||||ESQ||1|1|1|329.40|610.00|||1|
68|ML|1|1.2.69||WH|ROS|B||||ESQ||1|1|1|199.80|370.00|||1|
69|ML|2|1.2.70||WH|ROS|B||||ESQ||1|1|1|329.40|610.00|||1|
70|ML|1|1.2.71||WH|ROS|M||||ESQ||1|1|1|199.80|370.00|||1|
71|ML|2|1.2.72||WH|ROS|M||||ESQ||1|1|1|329.40|610.00|||1|
72|ML|1|1.2.73||WH|VER|B||||ESQ||1|1|1|199.80|370.00|||1|
73|ML|2|1.2.74||WH|VER|B||||ESQ||1|1|1|329.40|610.00|||1|
74|ML|1|1.2.75||WH|VER|M||||ESQ||1|1|1|199.80|370.00|||1|
75|ML|2|1.2.76||WH|VER|M||||ESQ||1|1|1|329.40|610.00|||1|
76|ML|1|1.2.77||WH|OAK|||||ESQ||1|1|1|199.80|370.00|||1|
77|ML|2|1.2.78||WH|OAK|||||ESQ||1|1|1|329.40|610.00|||1|
78|ML|1|1.2.79||WH|TEA|||||ESQ||1|1|1|199.80|370.00|||1|
79|ML|2|1.2.80||WH|TEA|||||ESQ||1|1|1|329.40|610.00|||1|
80|ML|1|1.2.81||WH|JOP|||||ESQ||1|1|1|199.80|370.00|||1|
81|ML|2|1.2.82||WH|JOP|||||ESQ||1|1|1|329.40|610.00|||1|
82|ML|1|1.2.83||WH|BLK|||||ESQ||1|1|1|199.80|370.00|||1|
83|ML|2|1.2.84||WH|BLK|||||ESQ||1|1|1|329.40|610.00|||1|
84|ML|1|1.2.85||WH|ART|||||ESQ||1|1|1|199.80|370.00|||1|
85|ML|2|1.2.86||WH|ART|||||ESQ||1|1|1|329.40|610.00|||1|
86|ML|1|1.2.87||WH|LIN|||||ESQ||1|1|1|199.80|370.00|||1|
87|ML|2|1.2.88||WH|LIN|||||ESQ||1|1|1|329.40|610.00|||1|
88|ML|1|1.2.89||WH|HAL|||||ESQ||1|1|1|199.80|370.00|||1|
89|ML|2|1.2.90||WH|HAL|||||ESQ||1|1|1|329.40|610.00|||1|
90|ML|1|1.2.91||BCO|BCO|B||||ESQ||1|1|1|221.40|410.00|||1|
91|ML|2|1.2.92||BCO|BCO|B||||ESQ||1|1|1|351.00|650.00|||1|
92|ML|1|1.2.93||BCO|BCO|M||||ESQ||1|1|1|221.40|410.00|||1|
93|ML|2|1.2.94||BCO|BCO|M||||ESQ||1|1|1|351.00|650.00|||1|
94|ML|1|1.2.95||CCL|CCL|B||||ESQ||1|1|1|221.40|410.00|||1|
95|ML|2|1.2.96||CCL|CCL|B||||ESQ||1|1|1|351.00|650.00|||1|
96|ML|1|1.2.97||CCL|CCL|M||||ESQ||1|1|1|221.40|410.00|||1|
97|ML|2|1.2.98||CCL|CCL|M||||ESQ||1|1|1|351.00|650.00|||1|
98|ML|1|1.2.99||CME|CME|B||||ESQ||1|1|1|221.40|410.00|||1|
99|ML|2|1.2.100||CME|CME|B||||ESQ||1|1|1|351.00|650.00|||1|
100|ML|1|1.2.101||CME|CME|M||||ESQ||1|1|1|221.40|410.00|||1|
101|ML|2|1.2.102||CME|CME|M||||ESQ||1|1|1|351.00|650.00|||1|
102|ML|1|1.2.103||ANT|ANT|B||||ESQ||1|1|1|221.40|410.00|||1|
103|ML|2|1.2.104||ANT|ANT|B||||ESQ||1|1|1|351.00|650.00|||1|
104|ML|1|1.2.105||ANT|ANT|M||||ESQ||1|1|1|221.40|410.00|||1|
105|ML|2|1.2.106||ANT|ANT|M||||ESQ||1|1|1|351.00|650.00|||1|
106|ML|1|1.2.107||PTO|PTO|B||||ESQ||1|1|1|221.40|410.00|||1|
107|ML|2|1.2.108||PTO|PTO|B||||ESQ||1|1|1|351.00|650.00|||1|
108|ML|1|1.2.109||PTO|PTO|M||||ESQ||1|1|1|221.40|410.00|||1|
109|ML|2|1.2.110||PTO|PTO|M||||ESQ||1|1|1|351.00|650.00|||1|
110|ML|1|1.2.111||CRE|CRE|B||||ESQ||1|1|1|221.40|410.00|||1|
111|ML|2|1.2.112||CRE|CRE|B||||ESQ||1|1|1|351.00|650.00|||1|
112|ML|1|1.2.113||CRE|CRE|M||||ESQ||1|1|1|221.40|410.00|||1|
113|ML|2|1.2.114||CRE|CRE|M||||ESQ||1|1|1|351.00|650.00|||1|
114|ML|1|1.2.115||CAM|CAM|B||||ESQ||1|1|1|221.40|410.00|||1|
115|ML|2|1.2.116||CAM|CAM|B||||ESQ||1|1|1|351.00|650.00|||1|
116|ML|1|1.2.117||CAM|CAM|M||||ESQ||1|1|1|221.40|410.00|||1|
117|ML|2|1.2.118||CAM|CAM|M||||ESQ||1|1|1|351.00|650.00|||1|
118|ML|1|1.2.119||OUR|OUR|B||||ESQ||1|1|1|221.40|410.00|||1|
119|ML|2|1.2.120||OUR|OUR|B||||ESQ||1|1|1|351.00|650.00|||1|
120|ML|1|1.2.121||OUR|OUR|M||||ESQ||1|1|1|221.40|410.00|||1|
121|ML|2|1.2.122||OUR|OUR|M||||ESQ||1|1|1|351.00|650.00|||1|
122|ML|1|1.2.123||COB|COB|B||||ESQ||1|1|1|221.40|410.00|||1|
123|ML|2|1.2.124||COB|COB|B||||ESQ||1|1|1|351.00|650.00|||1|
124|ML|1|1.2.125||COB|COB|M||||ESQ||1|1|1|221.40|410.00|||1|
125|ML|2|1.2.126||COB|COB|M||||ESQ||1|1|1|351.00|650.00|||1|
126|ML|1|1.2.127||CHO|CHO|B||||ESQ||1|1|1|221.40|410.00|||1|
127|ML|2|1.2.128||CHO|CHO|B||||ESQ||1|1|1|351.00|650.00|||1|
128|ML|1|1.2.129||CHO|CHO|M||||ESQ||1|1|1|221.40|410.00|||1|
129|ML|2|1.2.130||CHO|CHO|M||||ESQ||1|1|1|351.00|650.00|||1|
130|ML|1|1.2.131||VAG|VAG|B||||ESQ||1|1|1|221.40|410.00|||1|
131|ML|2|1.2.132||VAG|VAG|B||||ESQ||1|1|1|351.00|650.00|||1|
132|ML|1|1.2.133||VAG|VAG|M||||ESQ||1|1|1|221.40|410.00|||1|
133|ML|2|1.2.134||VAG|VAG|M||||ESQ||1|1|1|351.00|650.00|||1|
134|ML|1|1.2.135||AZE|AZE|B||||ESQ||1|1|1|221.40|410.00|||1|
135|ML|2|1.2.136||AZE|AZE|B||||ESQ||1|1|1|351.00|650.00|||1|
136|ML|1|1.2.137||AZE|AZE|M||||ESQ||1|1|1|221.40|410.00|||1|
137|ML|2|1.2.138||AZE|AZE|M||||ESQ||1|1|1|351.00|650.00|||1|
138|ML|1|1.2.139||AMA|AMA|B||||ESQ||1|1|1|221.40|410.00|||1|
139|ML|2|1.2.140||AMA|AMA|B||||ESQ||1|1|1|351.00|650.00|||1|
140|ML|1|1.2.141||AMA|AMA|M||||ESQ||1|1|1|221.40|410.00|||1|
141|ML|2|1.2.142||AMA|AMA|M||||ESQ||1|1|1|351.00|650.00|||1|
142|ML|1|1.2.143||AES|AES|B||||ESQ||1|1|1|221.40|410.00|||1|
143|ML|2|1.2.144||AES|AES|B||||ESQ||1|1|1|351.00|650.00|||1|
144|ML|1|1.2.145||AES|AES|M||||ESQ||1|1|1|221.40|410.00|||1|
145|ML|2|1.2.146||AES|AES|M||||ESQ||1|1|1|351.00|650.00|||1|
146|ML|1|1.2.147||PRA|PRA|B||||ESQ||1|1|1|221.40|410.00|||1|
147|ML|2|1.2.148||PRA|PRA|B||||ESQ||1|1|1|351.00|650.00|||1|
148|ML|1|1.2.149||PRA|PRA|M||||ESQ||1|1|1|221.40|410.00|||1|
149|ML|2|1.2.150||PRA|PRA|M||||ESQ||1|1|1|351.00|650.00|||1|
150|ML|1|1.2.151||ROS|ROS|B||||ESQ||1|1|1|221.40|410.00|||1|
151|ML|2|1.2.152||ROS|ROS|B||||ESQ||1|1|1|351.00|650.00|||1|
152|ML|1|1.2.153||ROS|ROS|M||||ESQ||1|1|1|221.40|410.00|||1|
153|ML|2|1.2.154||ROS|ROS|M||||ESQ||1|1|1|351.00|650.00|||1|
154|ML|1|1.2.155||VER|VER|B||||ESQ||1|1|1|221.40|410.00|||1|
155|ML|2|1.2.156||VER|VER|B||||ESQ||1|1|1|351.00|650.00|||1|
156|ML|1|1.2.157||VER|VER|M||||ESQ||1|1|1|221.40|410.00|||1|
157|ML|2|1.2.158||VER|VER|M||||ESQ||1|1|1|351.00|650.00|||1|
158|ML|1|1.2.159||OAK|OAK|||||ESQ||1|1|1|221.40|410.00|||1|
159|ML|2|1.2.160||OAK|OAK|||||ESQ||1|1|1|351.00|650.00|||1|
160|ML|1|1.2.161||TEA|TEA|||||ESQ||1|1|1|221.40|410.00|||1|
161|ML|2|1.2.162||TEA|TEA|||||ESQ||1|1|1|351.00|650.00|||1|
162|ML|1|1.2.163||JOP|JOP|||||ESQ||1|1|1|221.40|410.00|||1|
163|ML|2|1.2.164||JOP|JOP|||||ESQ||1|1|1|351.00|650.00|||1|
164|ML|1|1.2.165||AZB|AZB|||||ESQ||1|1|1|221.40|410.00|||1|
165|ML|2|1.2.166||AZB|AZB|||||ESQ||1|1|1|351.00|650.00|||1|
166|ML|1|1.2.167||DEN|DEN|||||ESQ||1|1|1|221.40|410.00|||1|
167|ML|2|1.2.168||DEN|DEN|||||ESQ||1|1|1|351.00|650.00|||1|
168|ML|1|1.2.169||BLK|BLK|||||ESQ||1|1|1|221.40|410.00|||1|
169|ML|2|1.2.170||BLK|BLK|||||ESQ||1|1|1|351.00|650.00|||1|
170|ML|1|1.2.171||ART|ART|||||ESQ||1|1|1|221.40|410.00|||1|
171|ML|2|1.2.172||ART|ART|||||ESQ||1|1|1|351.00|650.00|||1|
172|ML|1|1.2.173||LIN|LIN|||||ESQ||1|1|1|221.40|410.00|||1|
173|ML|2|1.2.174||LIN|LIN|||||ESQ||1|1|1|351.00|650.00|||1|
174|ML|1|1.2.175||HAL|HAL|||||ESQ||1|1|1|221.40|410.00|||1|
175|ML|2|1.2.176||HAL|HAL|||||ESQ||1|1|1|351.00|650.00|||1|
176|ML|1|1.177.3||WH|WH|||||DIR||1|1|1|207.36|384.00|||1|
177|ML|2|1.177.4||WH|WH|||||DIR||1|1|1|362.88|672.00|||1|
178|ML|1|1.177.5||WH|AZB|||||DIR||1|1|1|207.36|384.00|||1|
179|ML|2|1.177.6||WH|AZB|||||DIR||1|1|1|362.88|672.00|||1|
180|ML|1|1.177.7||WH|DEN|||||DIR||1|1|1|207.36|384.00|||1|
181|ML|2|1.177.8||WH|DEN|||||DIR||1|1|1|362.88|672.00|||1|
182|ML|1|1.177.9||WH|BCO|B||||DIR||1|1|1|234.36|434.00|||1|
183|ML|2|1.177.10||WH|BCO|B||||DIR||1|1|1|389.88|722.00|||1|
184|ML|1|1.177.11||WH|BCO|M||||DIR||1|1|1|234.36|434.00|||1|
185|ML|2|1.177.12||WH|BCO|M||||DIR||1|1|1|389.88|722.00|||1|
186|ML|1|1.177.13||WH|CCL|B||||DIR||1|1|1|234.36|434.00|||1|
187|ML|2|1.177.14||WH|CCL|B||||DIR||1|1|1|389.88|722.00|||1|
188|ML|1|1.177.15||WH|CCL|M||||DIR||1|1|1|234.36|434.00|||1|
189|ML|2|1.177.16||WH|CCL|M||||DIR||1|1|1|389.88|722.00|||1|
190|ML|1|1.177.17||WH|CME|B||||DIR||1|1|1|234.36|434.00|||1|
191|ML|2|1.177.18||WH|CME|B||||DIR||1|1|1|389.88|722.00|||1|
192|ML|1|1.177.19||WH|CME|M||||DIR||1|1|1|234.36|434.00|||1|
193|ML|2|1.177.20||WH|CME|M||||DIR||1|1|1|389.88|722.00|||1|
194|ML|1|1.177.21||WH|ANT|B||||DIR||1|1|1|234.36|434.00|||1|
195|ML|2|1.177.22||WH|ANT|B||||DIR||1|1|1|389.88|722.00|||1|
196|ML|1|1.177.23||WH|ANT|M||||DIR||1|1|1|234.36|434.00|||1|
197|ML|2|1.177.24||WH|ANT|M||||DIR||1|1|1|389.88|722.00|||1|
198|ML|1|1.177.25||WH|PTO|B||||DIR||1|1|1|234.36|434.00|||1|
199|ML|2|1.177.26||WH|PTO|B||||DIR||1|1|1|389.88|722.00|||1|
200|ML|1|1.177.27||WH|PTO|M||||DIR||1|1|1|234.36|434.00|||1|
201|ML|2|1.177.28||WH|PTO|M||||DIR||1|1|1|389.88|722.00|||1|
202|ML|1|1.177.29||WH|CRE|B||||DIR||1|1|1|234.36|434.00|||1|
203|ML|2|1.177.30||WH|CRE|B||||DIR||1|1|1|389.88|722.00|||1|
204|ML|1|1.177.31||WH|CRE|M||||DIR||1|1|1|234.36|434.00|||1|
205|ML|2|1.177.32||WH|CRE|M||||DIR||1|1|1|389.88|722.00|||1|
206|ML|1|1.177.33||WH|CAM|B||||DIR||1|1|1|234.36|434.00|||1|
207|ML|2|1.177.34||WH|CAM|B||||DIR||1|1|1|389.88|722.00|||1|
208|ML|1|1.177.35||WH|CAM|M||||DIR||1|1|1|234.36|434.00|||1|
209|ML|2|1.177.36||WH|CAM|M||||DIR||1|1|1|389.88|722.00|||1|
210|ML|1|1.177.37||WH|OUR|B||||DIR||1|1|1|234.36|434.00|||1|
211|ML|2|1.177.38||WH|OUR|B||||DIR||1|1|1|389.88|722.00|||1|
212|ML|1|1.177.39||WH|OUR|M||||DIR||1|1|1|234.36|434.00|||1|
213|ML|2|1.177.40||WH|OUR|M||||DIR||1|1|1|389.88|722.00|||1|
214|ML|1|1.177.41||WH|COB|B||||DIR||1|1|1|234.36|434.00|||1|
215|ML|2|1.177.42||WH|COB|B||||DIR||1|1|1|389.88|722.00|||1|
216|ML|1|1.177.43||WH|COB|M||||DIR||1|1|1|234.36|434.00|||1|
217|ML|2|1.177.44||WH|COB|M||||DIR||1|1|1|389.88|722.00|||1|
218|ML|1|1.177.45||WH|CHO|B||||DIR||1|1|1|234.36|434.00|||1|
219|ML|2|1.177.46||WH|CHO|B||||DIR||1|1|1|389.88|722.00|||1|
220|ML|1|1.177.47||WH|CHO|M||||DIR||1|1|1|234.36|434.00|||1|
221|ML|2|1.177.48||WH|CHO|M||||DIR||1|1|1|389.88|722.00|||1|
222|ML|1|1.177.49||WH|VAG|B||||DIR||1|1|1|234.36|434.00|||1|
223|ML|2|1.177.50||WH|VAG|B||||DIR||1|1|1|389.88|722.00|||1|
224|ML|1|1.177.51||WH|VAG|M||||DIR||1|1|1|234.36|434.00|||1|
225|ML|2|1.177.52||WH|VAG|M||||DIR||1|1|1|389.88|722.00|||1|
226|ML|1|1.177.53||WH|AZE|B||||DIR||1|1|1|234.36|434.00|||1|
227|ML|2|1.177.54||WH|AZE|B||||DIR||1|1|1|389.88|722.00|||1|
228|ML|1|1.177.55||WH|AZE|M||||DIR||1|1|1|234.36|434.00|||1|
229|ML|2|1.177.56||WH|AZE|M||||DIR||1|1|1|389.88|722.00|||1|
230|ML|1|1.177.57||WH|AMA|B||||DIR||1|1|1|234.36|434.00|||1|
231|ML|2|1.177.58||WH|AMA|B||||DIR||1|1|1|389.88|722.00|||1|
232|ML|1|1.177.59||WH|AMA|M||||DIR||1|1|1|234.36|434.00|||1|
233|ML|2|1.177.60||WH|AMA|M||||DIR||1|1|1|389.88|722.00|||1|
234|ML|1|1.177.61||WH|AES|B||||DIR||1|1|1|234.36|434.00|||1|
235|ML|2|1.177.62||WH|AES|B||||DIR||1|1|1|389.88|722.00|||1|
236|ML|1|1.177.63||WH|AES|M||||DIR||1|1|1|234.36|434.00|||1|
237|ML|2|1.177.64||WH|AES|M||||DIR||1|1|1|389.88|722.00|||1|
238|ML|1|1.177.65||WH|PRA|B||||DIR||1|1|1|234.36|434.00|||1|
239|ML|2|1.177.66||WH|PRA|B||||DIR||1|1|1|389.88|722.00|||1|
240|ML|1|1.177.67||WH|PRA|M||||DIR||1|1|1|234.36|434.00|||1|
241|ML|2|1.177.68||WH|PRA|M||||DIR||1|1|1|389.88|722.00|||1|
242|ML|1|1.177.69||WH|ROS|B||||DIR||1|1|1|234.36|434.00|||1|
243|ML|2|1.177.70||WH|ROS|B||||DIR||1|1|1|389.88|722.00|||1|
244|ML|1|1.177.71||WH|ROS|M||||DIR||1|1|1|234.36|434.00|||1|
245|ML|2|1.177.72||WH|ROS|M||||DIR||1|1|1|389.88|722.00|||1|
246|ML|1|1.177.73||WH|VER|B||||DIR||1|1|1|234.36|434.00|||1|
247|ML|2|1.177.74||WH|VER|B||||DIR||1|1|1|389.88|722.00|||1|
248|ML|1|1.177.75||WH|VER|M||||DIR||1|1|1|234.36|434.00|||1|
249|ML|2|1.177.76||WH|VER|M||||DIR||1|1|1|389.88|722.00|||1|
250|ML|1|1.177.77||WH|OAK|||||DIR||1|1|1|234.36|434.00|||1|
251|ML|2|1.177.78||WH|OAK|||||DIR||1|1|1|389.88|722.00|||1|
252|ML|1|1.177.79||WH|TEA|||||DIR||1|1|1|234.36|434.00|||1|
253|ML|2|1.177.80||WH|TEA|||||DIR||1|1|1|389.88|722.00|||1|
254|ML|1|1.177.81||WH|JOP|||||DIR||1|1|1|234.36|434.00|||1|
255|ML|2|1.177.82||WH|JOP|||||DIR||1|1|1|389.88|722.00|||1|
256|ML|1|1.177.83||WH|BLK|||||DIR||1|1|1|234.36|434.00|||1|
257|ML|2|1.177.84||WH|BLK|||||DIR||1|1|1|389.88|722.00|||1|
258|ML|1|1.177.85||WH|ART|||||DIR||1|1|1|234.36|434.00|||1|
259|ML|2|1.177.86||WH|ART|||||DIR||1|1|1|389.88|722.00|||1|
260|ML|1|1.177.87||WH|LIN|||||DIR||1|1|1|234.36|434.00|||1|
261|ML|2|1.177.88||WH|LIN|||||DIR||1|1|1|389.88|722.00|||1|
262|ML|1|1.177.89||WH|HAL|||||DIR||1|1|1|234.36|434.00|||1|
263|ML|2|1.177.90||WH|HAL|||||DIR||1|1|1|389.88|722.00|||1|
264|ML|1|1.177.91||BCO|BCO|B||||DIR||1|1|1|255.96|474.00|||1|
265|ML|2|1.177.92||BCO|BCO|B||||DIR||1|1|1|411.48|762.00|||1|
266|ML|1|1.177.93||BCO|BCO|M||||DIR||1|1|1|255.96|474.00|||1|
267|ML|2|1.177.94||BCO|BCO|M||||DIR||1|1|1|411.48|762.00|||1|
268|ML|1|1.177.95||CCL|CCL|B||||DIR||1|1|1|255.96|474.00|||1|
269|ML|2|1.177.96||CCL|CCL|B||||DIR||1|1|1|411.48|762.00|||1|
270|ML|1|1.177.97||CCL|CCL|M||||DIR||1|1|1|255.96|474.00|||1|
271|ML|2|1.177.98||CCL|CCL|M||||DIR||1|1|1|411.48|762.00|||1|
272|ML|1|1.177.99||CME|CME|B||||DIR||1|1|1|255.96|474.00|||1|
273|ML|2|1.177.100||CME|CME|B||||DIR||1|1|1|411.48|762.00|||1|
274|ML|1|1.177.101||CME|CME|M||||DIR||1|1|1|255.96|474.00|||1|
275|ML|2|1.177.102||CME|CME|M||||DIR||1|1|1|411.48|762.00|||1|
276|ML|1|1.177.103||ANT|ANT|B||||DIR||1|1|1|255.96|474.00|||1|
277|ML|2|1.177.104||ANT|ANT|B||||DIR||1|1|1|411.48|762.00|||1|
278|ML|1|1.177.105||ANT|ANT|M||||DIR||1|1|1|255.96|474.00|||1|
279|ML|2|1.177.106||ANT|ANT|M||||DIR||1|1|1|411.48|762.00|||1|
280|ML|1|1.177.107||PTO|PTO|B||||DIR||1|1|1|255.96|474.00|||1|
281|ML|2|1.177.108||PTO|PTO|B||||DIR||1|1|1|411.48|762.00|||1|
282|ML|1|1.177.109||PTO|PTO|M||||DIR||1|1|1|255.96|474.00|||1|
283|ML|2|1.177.110||PTO|PTO|M||||DIR||1|1|1|411.48|762.00|||1|
284|ML|1|1.177.111||CRE|CRE|B||||DIR||1|1|1|255.96|474.00|||1|
285|ML|2|1.177.112||CRE|CRE|B||||DIR||1|1|1|411.48|762.00|||1|
286|ML|1|1.177.113||CRE|CRE|M||||DIR||1|1|1|255.96|474.00|||1|
287|ML|2|1.177.114||CRE|CRE|M||||DIR||1|1|1|411.48|762.00|||1|
288|ML|1|1.177.115||CAM|CAM|B||||DIR||1|1|1|255.96|474.00|||1|
289|ML|2|1.177.116||CAM|CAM|B||||DIR||1|1|1|411.48|762.00|||1|
290|ML|1|1.177.117||CAM|CAM|M||||DIR||1|1|1|255.96|474.00|||1|
291|ML|2|1.177.118||CAM|CAM|M||||DIR||1|1|1|411.48|762.00|||1|
292|ML|1|1.177.119||OUR|OUR|B||||DIR||1|1|1|255.96|474.00|||1|
293|ML|2|1.177.120||OUR|OUR|B||||DIR||1|1|1|411.48|762.00|||1|
294|ML|1|1.177.121||OUR|OUR|M||||DIR||1|1|1|255.96|474.00|||1|
295|ML|2|1.177.122||OUR|OUR|M||||DIR||1|1|1|411.48|762.00|||1|
296|ML|1|1.177.123||COB|COB|B||||DIR||1|1|1|255.96|474.00|||1|
297|ML|2|1.177.124||COB|COB|B||||DIR||1|1|1|411.48|762.00|||1|
298|ML|1|1.177.125||COB|COB|M||||DIR||1|1|1|255.96|474.00|||1|
299|ML|2|1.177.126||COB|COB|M||||DIR||1|1|1|411.48|762.00|||1|
300|ML|1|1.177.127||CHO|CHO|B||||DIR||1|1|1|255.96|474.00|||1|
301|ML|2|1.177.128||CHO|CHO|B||||DIR||1|1|1|411.48|762.00|||1|
302|ML|1|1.177.129||CHO|CHO|M||||DIR||1|1|1|255.96|474.00|||1|
303|ML|2|1.177.130||CHO|CHO|M||||DIR||1|1|1|411.48|762.00|||1|
304|ML|1|1.177.131||VAG|VAG|B||||DIR||1|1|1|255.96|474.00|||1|
305|ML|2|1.177.132||VAG|VAG|B||||DIR||1|1|1|411.48|762.00|||1|
306|ML|1|1.177.133||VAG|VAG|M||||DIR||1|1|1|255.96|474.00|||1|
307|ML|2|1.177.134||VAG|VAG|M||||DIR||1|1|1|411.48|762.00|||1|
308|ML|1|1.177.135||AZE|AZE|B||||DIR||1|1|1|255.96|474.00|||1|
309|ML|2|1.177.136||AZE|AZE|B||||DIR||1|1|1|411.48|762.00|||1|
310|ML|1|1.177.137||AZE|AZE|M||||DIR||1|1|1|255.96|474.00|||1|
311|ML|2|1.177.138||AZE|AZE|M||||DIR||1|1|1|411.48|762.00|||1|
312|ML|1|1.177.139||AMA|AMA|B||||DIR||1|1|1|255.96|474.00|||1|
313|ML|2|1.177.140||AMA|AMA|B||||DIR||1|1|1|411.48|762.00|||1|
314|ML|1|1.177.141||AMA|AMA|M||||DIR||1|1|1|255.96|474.00|||1|
315|ML|2|1.177.142||AMA|AMA|M||||DIR||1|1|1|411.48|762.00|||1|
316|ML|1|1.177.143||AES|AES|B||||DIR||1|1|1|255.96|474.00|||1|
317|ML|2|1.177.144||AES|AES|B||||DIR||1|1|1|411.48|762.00|||1|
318|ML|1|1.177.145||AES|AES|M||||DIR||1|1|1|255.96|474.00|||1|
319|ML|2|1.177.146||AES|AES|M||||DIR||1|1|1|411.48|762.00|||1|
320|ML|1|1.177.147||PRA|PRA|B||||DIR||1|1|1|255.96|474.00|||1|
321|ML|2|1.177.148||PRA|PRA|B||||DIR||1|1|1|411.48|762.00|||1|
322|ML|1|1.177.149||PRA|PRA|M||||DIR||1|1|1|255.96|474.00|||1|
323|ML|2|1.177.150||PRA|PRA|M||||DIR||1|1|1|411.48|762.00|||1|
324|ML|1|1.177.151||ROS|ROS|B||||DIR||1|1|1|255.96|474.00|||1|
325|ML|2|1.177.152||ROS|ROS|B||||DIR||1|1|1|411.48|762.00|||1|
326|ML|1|1.177.153||ROS|ROS|M||||DIR||1|1|1|255.96|474.00|||1|
327|ML|2|1.177.154||ROS|ROS|M||||DIR||1|1|1|411.48|762.00|||1|
328|ML|1|1.177.155||VER|VER|B||||DIR||1|1|1|255.96|474.00|||1|
329|ML|2|1.177.156||VER|VER|B||||DIR||1|1|1|411.48|762.00|||1|
330|ML|1|1.177.157||VER|VER|M||||DIR||1|1|1|255.96|474.00|||1|
331|ML|2|1.177.158||VER|VER|M||||DIR||1|1|1|411.48|762.00|||1|
332|ML|1|1.177.159||OAK|OAK|||||DIR||1|1|1|255.96|474.00|||1|
333|ML|2|1.177.160||OAK|OAK|||||DIR||1|1|1|411.48|762.00|||1|
334|ML|1|1.177.161||TEA|TEA|||||DIR||1|1|1|255.96|474.00|||1|
335|ML|2|1.177.162||TEA|TEA|||||DIR||1|1|1|411.48|762.00|||1|
336|ML|1|1.177.163||JOP|JOP|||||DIR||1|1|1|255.96|474.00|||1|
337|ML|2|1.177.164||JOP|JOP|||||DIR||1|1|1|411.48|762.00|||1|
338|ML|1|1.177.165||AZB|AZB|||||DIR||1|1|1|255.96|474.00|||1|
339|ML|2|1.177.166||AZB|AZB|||||DIR||1|1|1|411.48|762.00|||1|
340|ML|1|1.177.167||DEN|DEN|||||DIR||1|1|1|255.96|474.00|||1|
341|ML|2|1.177.168||DEN|DEN|||||DIR||1|1|1|411.48|762.00|||1|
342|ML|1|1.177.169||BLK|BLK|||||DIR||1|1|1|255.96|474.00|||1|
343|ML|2|1.177.170||BLK|BLK|||||DIR||1|1|1|411.48|762.00|||1|
344|ML|1|1.177.171||ART|ART|||||DIR||1|1|1|255.96|474.00|||1|
345|ML|2|1.177.172||ART|ART|||||DIR||1|1|1|411.48|762.00|||1|
346|ML|1|1.177.173||LIN|LIN|||||DIR||1|1|1|255.96|474.00|||1|
347|ML|2|1.177.174||LIN|LIN|||||DIR||1|1|1|411.48|762.00|||1|
348|ML|1|1.177.175||HAL|HAL|||||DIR||1|1|1|255.96|474.00|||1|
349|ML|2|1.177.176||HAL|HAL|||||DIR||1|1|1|411.48|762.00|||1|
350|ML|1|178.179.3||WH|WH|||||ESQ||2|1|1|216.00|400.00|||1|
351|ML|2|178.179.4||WH|WH|||||ESQ||2|1|1|332.10|615.00|||1|
352|ML|1|178.179.5||WH|AZB|||||ESQ||2|1|1|216.00|400.00|||1|
353|ML|2|178.179.6||WH|AZB|||||ESQ||2|1|1|332.10|615.00|||1|
354|ML|1|178.179.7||WH|DEN|||||ESQ||2|1|1|216.00|400.00|||1|
355|ML|2|178.179.8||WH|DEN|||||ESQ||2|1|1|332.10|615.00|||1|
356|ML|1|178.179.9||WH|BCO|B||||ESQ||2|1|1|243.00|450.00|||1|
357|ML|2|178.179.10||WH|BCO|B||||ESQ||2|1|1|359.10|665.00|||1|
358|ML|1|178.179.11||WH|BCO|M||||ESQ||2|1|1|243.00|450.00|||1|
359|ML|2|178.179.12||WH|BCO|M||||ESQ||2|1|1|359.10|665.00|||1|
360|ML|1|178.179.13||WH|CCL|B||||ESQ||2|1|1|243.00|450.00|||1|
361|ML|2|178.179.14||WH|CCL|B||||ESQ||2|1|1|359.10|665.00|||1|
362|ML|1|178.179.15||WH|CCL|M||||ESQ||2|1|1|243.00|450.00|||1|
363|ML|2|178.179.16||WH|CCL|M||||ESQ||2|1|1|359.10|665.00|||1|
364|ML|1|178.179.17||WH|CME|B||||ESQ||2|1|1|243.00|450.00|||1|
365|ML|2|178.179.18||WH|CME|B||||ESQ||2|1|1|359.10|665.00|||1|
366|ML|1|178.179.19||WH|CME|M||||ESQ||2|1|1|243.00|450.00|||1|
367|ML|2|178.179.20||WH|CME|M||||ESQ||2|1|1|359.10|665.00|||1|
368|ML|1|178.179.21||WH|ANT|B||||ESQ||2|1|1|243.00|450.00|||1|
369|ML|2|178.179.22||WH|ANT|B||||ESQ||2|1|1|359.10|665.00|||1|
370|ML|1|178.179.23||WH|ANT|M||||ESQ||2|1|1|243.00|450.00|||1|
371|ML|2|178.179.24||WH|ANT|M||||ESQ||2|1|1|359.10|665.00|||1|
372|ML|1|178.179.25||WH|PTO|B||||ESQ||2|1|1|243.00|450.00|||1|
373|ML|2|178.179.26||WH|PTO|B||||ESQ||2|1|1|359.10|665.00|||1|
374|ML|1|178.179.27||WH|PTO|M||||ESQ||2|1|1|243.00|450.00|||1|
375|ML|2|178.179.28||WH|PTO|M||||ESQ||2|1|1|359.10|665.00|||1|
376|ML|1|178.179.29||WH|CRE|B||||ESQ||2|1|1|243.00|450.00|||1|
377|ML|2|178.179.30||WH|CRE|B||||ESQ||2|1|1|359.10|665.00|||1|
378|ML|1|178.179.31||WH|CRE|M||||ESQ||2|1|1|243.00|450.00|||1|
379|ML|2|178.179.32||WH|CRE|M||||ESQ||2|1|1|359.10|665.00|||1|
380|ML|1|178.179.33||WH|CAM|B||||ESQ||2|1|1|243.00|450.00|||1|
381|ML|2|178.179.34||WH|CAM|B||||ESQ||2|1|1|359.10|665.00|||1|
382|ML|1|178.179.35||WH|CAM|M||||ESQ||2|1|1|243.00|450.00|||1|
383|ML|2|178.179.36||WH|CAM|M||||ESQ||2|1|1|359.10|665.00|||1|
384|ML|1|178.179.37||WH|OUR|B||||ESQ||2|1|1|243.00|450.00|||1|
385|ML|2|178.179.38||WH|OUR|B||||ESQ||2|1|1|359.10|665.00|||1|
386|ML|1|178.179.39||WH|OUR|M||||ESQ||2|1|1|243.00|450.00|||1|
387|ML|2|178.179.40||WH|OUR|M||||ESQ||2|1|1|359.10|665.00|||1|
388|ML|1|178.179.41||WH|COB|B||||ESQ||2|1|1|243.00|450.00|||1|
389|ML|2|178.179.42||WH|COB|B||||ESQ||2|1|1|359.10|665.00|||1|
390|ML|1|178.179.43||WH|COB|M||||ESQ||2|1|1|243.00|450.00|||1|
391|ML|2|178.179.44||WH|COB|M||||ESQ||2|1|1|359.10|665.00|||1|
392|ML|1|178.179.45||WH|CHO|B||||ESQ||2|1|1|243.00|450.00|||1|
393|ML|2|178.179.46||WH|CHO|B||||ESQ||2|1|1|359.10|665.00|||1|
394|ML|1|178.179.47||WH|CHO|M||||ESQ||2|1|1|243.00|450.00|||1|
395|ML|2|178.179.48||WH|CHO|M||||ESQ||2|1|1|359.10|665.00|||1|
396|ML|1|178.179.49||WH|VAG|B||||ESQ||2|1|1|243.00|450.00|||1|
397|ML|2|178.179.50||WH|VAG|B||||ESQ||2|1|1|359.10|665.00|||1|
398|ML|1|178.179.51||WH|VAG|M||||ESQ||2|1|1|243.00|450.00|||1|
399|ML|2|178.179.52||WH|VAG|M||||ESQ||2|1|1|359.10|665.00|||1|
400|ML|1|178.179.53||WH|AZE|B||||ESQ||2|1|1|243.00|450.00|||1|
401|ML|2|178.179.54||WH|AZE|B||||ESQ||2|1|1|359.10|665.00|||1|
402|ML|1|178.179.55||WH|AZE|M||||ESQ||2|1|1|243.00|450.00|||1|
403|ML|2|178.179.56||WH|AZE|M||||ESQ||2|1|1|359.10|665.00|||1|
404|ML|1|178.179.57||WH|AMA|B||||ESQ||2|1|1|243.00|450.00|||1|
405|ML|2|178.179.58||WH|AMA|B||||ESQ||2|1|1|359.10|665.00|||1|
406|ML|1|178.179.59||WH|AMA|M||||ESQ||2|1|1|243.00|450.00|||1|
407|ML|2|178.179.60||WH|AMA|M||||ESQ||2|1|1|359.10|665.00|||1|
408|ML|1|178.179.61||WH|AES|B||||ESQ||2|1|1|243.00|450.00|||1|
409|ML|2|178.179.62||WH|AES|B||||ESQ||2|1|1|359.10|665.00|||1|
410|ML|1|178.179.63||WH|AES|M||||ESQ||2|1|1|243.00|450.00|||1|
411|ML|2|178.179.64||WH|AES|M||||ESQ||2|1|1|359.10|665.00|||1|
412|ML|1|178.179.65||WH|PRA|B||||ESQ||2|1|1|243.00|450.00|||1|
413|ML|2|178.179.66||WH|PRA|B||||ESQ||2|1|1|359.10|665.00|||1|
414|ML|1|178.179.67||WH|PRA|M||||ESQ||2|1|1|243.00|450.00|||1|
415|ML|2|178.179.68||WH|PRA|M||||ESQ||2|1|1|359.10|665.00|||1|
416|ML|1|178.179.69||WH|ROS|B||||ESQ||2|1|1|243.00|450.00|||1|
417|ML|2|178.179.70||WH|ROS|B||||ESQ||2|1|1|359.10|665.00|||1|
418|ML|1|178.179.71||WH|ROS|M||||ESQ||2|1|1|243.00|450.00|||1|
419|ML|2|178.179.72||WH|ROS|M||||ESQ||2|1|1|359.10|665.00|||1|
420|ML|1|178.179.73||WH|VER|B||||ESQ||2|1|1|243.00|450.00|||1|
421|ML|2|178.179.74||WH|VER|B||||ESQ||2|1|1|359.10|665.00|||1|
422|ML|1|178.179.75||WH|VER|M||||ESQ||2|1|1|243.00|450.00|||1|
423|ML|2|178.179.76||WH|VER|M||||ESQ||2|1|1|359.10|665.00|||1|
424|ML|1|178.179.77||WH|OAK|||||ESQ||2|1|1|243.00|450.00|||1|
425|ML|2|178.179.78||WH|OAK|||||ESQ||2|1|1|359.10|665.00|||1|
426|ML|1|178.179.79||WH|TEA|||||ESQ||2|1|1|243.00|450.00|||1|
427|ML|2|178.179.80||WH|TEA|||||ESQ||2|1|1|359.10|665.00|||1|
428|ML|1|178.179.81||WH|JOP|||||ESQ||2|1|1|243.00|450.00|||1|
429|ML|2|178.179.82||WH|JOP|||||ESQ||2|1|1|359.10|665.00|||1|
430|ML|1|178.179.83||WH|BLK|||||ESQ||2|1|1|243.00|450.00|||1|
431|ML|2|178.179.84||WH|BLK|||||ESQ||2|1|1|359.10|665.00|||1|
432|ML|1|178.179.85||WH|ART|||||ESQ||2|1|1|243.00|450.00|||1|
433|ML|2|178.179.86||WH|ART|||||ESQ||2|1|1|359.10|665.00|||1|
434|ML|1|178.179.87||WH|LIN|||||ESQ||2|1|1|243.00|450.00|||1|
435|ML|2|178.179.88||WH|LIN|||||ESQ||2|1|1|359.10|665.00|||1|
436|ML|1|178.179.89||WH|HAL|||||ESQ||2|1|1|243.00|450.00|||1|
437|ML|2|178.179.90||WH|HAL|||||ESQ||2|1|1|359.10|665.00|||1|
438|ML|1|178.179.91||BCO|BCO|B||||ESQ||2|1|1|264.60|490.00|||1|
439|ML|2|178.179.92||BCO|BCO|B||||ESQ||2|1|1|380.70|705.00|||1|
440|ML|1|178.179.93||BCO|BCO|M||||ESQ||2|1|1|264.60|490.00|||1|
441|ML|2|178.179.94||BCO|BCO|M||||ESQ||2|1|1|380.70|705.00|||1|
442|ML|1|178.179.95||CCL|CCL|B||||ESQ||2|1|1|264.60|490.00|||1|
443|ML|2|178.179.96||CCL|CCL|B||||ESQ||2|1|1|380.70|705.00|||1|
444|ML|1|178.179.97||CCL|CCL|M||||ESQ||2|1|1|264.60|490.00|||1|
445|ML|2|178.179.98||CCL|CCL|M||||ESQ||2|1|1|380.70|705.00|||1|
446|ML|1|178.179.99||CME|CME|B||||ESQ||2|1|1|264.60|490.00|||1|
447|ML|2|178.179.100||CME|CME|B||||ESQ||2|1|1|380.70|705.00|||1|
448|ML|1|178.179.101||CME|CME|M||||ESQ||2|1|1|264.60|490.00|||1|
449|ML|2|178.179.102||CME|CME|M||||ESQ||2|1|1|380.70|705.00|||1|
450|ML|1|178.179.103||ANT|ANT|B||||ESQ||2|1|1|264.60|490.00|||1|
451|ML|2|178.179.104||ANT|ANT|B||||ESQ||2|1|1|380.70|705.00|||1|
452|ML|1|178.179.105||ANT|ANT|M||||ESQ||2|1|1|264.60|490.00|||1|
453|ML|2|178.179.106||ANT|ANT|M||||ESQ||2|1|1|380.70|705.00|||1|
454|ML|1|178.179.107||PTO|PTO|B||||ESQ||2|1|1|264.60|490.00|||1|
455|ML|2|178.179.108||PTO|PTO|B||||ESQ||2|1|1|380.70|705.00|||1|
456|ML|1|178.179.109||PTO|PTO|M||||ESQ||2|1|1|264.60|490.00|||1|
457|ML|2|178.179.110||PTO|PTO|M||||ESQ||2|1|1|380.70|705.00|||1|
458|ML|1|178.179.111||CRE|CRE|B||||ESQ||2|1|1|264.60|490.00|||1|
459|ML|2|178.179.112||CRE|CRE|B||||ESQ||2|1|1|380.70|705.00|||1|
460|ML|1|178.179.113||CRE|CRE|M||||ESQ||2|1|1|264.60|490.00|||1|
461|ML|2|178.179.114||CRE|CRE|M||||ESQ||2|1|1|380.70|705.00|||1|
462|ML|1|178.179.115||CAM|CAM|B||||ESQ||2|1|1|264.60|490.00|||1|
463|ML|2|178.179.116||CAM|CAM|B||||ESQ||2|1|1|380.70|705.00|||1|
464|ML|1|178.179.117||CAM|CAM|M||||ESQ||2|1|1|264.60|490.00|||1|
465|ML|2|178.179.118||CAM|CAM|M||||ESQ||2|1|1|380.70|705.00|||1|
466|ML|1|178.179.119||OUR|OUR|B||||ESQ||2|1|1|264.60|490.00|||1|
467|ML|2|178.179.120||OUR|OUR|B||||ESQ||2|1|1|380.70|705.00|||1|
468|ML|1|178.179.121||OUR|OUR|M||||ESQ||2|1|1|264.60|490.00|||1|
469|ML|2|178.179.122||OUR|OUR|M||||ESQ||2|1|1|380.70|705.00|||1|
470|ML|1|178.179.123||COB|COB|B||||ESQ||2|1|1|264.60|490.00|||1|
471|ML|2|178.179.124||COB|COB|B||||ESQ||2|1|1|380.70|705.00|||1|
472|ML|1|178.179.125||COB|COB|M||||ESQ||2|1|1|264.60|490.00|||1|
473|ML|2|178.179.126||COB|COB|M||||ESQ||2|1|1|380.70|705.00|||1|
474|ML|1|178.179.127||CHO|CHO|B||||ESQ||2|1|1|264.60|490.00|||1|
475|ML|2|178.179.128||CHO|CHO|B||||ESQ||2|1|1|380.70|705.00|||1|
476|ML|1|178.179.129||CHO|CHO|M||||ESQ||2|1|1|264.60|490.00|||1|
477|ML|2|178.179.130||CHO|CHO|M||||ESQ||2|1|1|380.70|705.00|||1|
478|ML|1|178.179.131||VAG|VAG|B||||ESQ||2|1|1|264.60|490.00|||1|
479|ML|2|178.179.132||VAG|VAG|B||||ESQ||2|1|1|380.70|705.00|||1|
480|ML|1|178.179.133||VAG|VAG|M||||ESQ||2|1|1|264.60|490.00|||1|
481|ML|2|178.179.134||VAG|VAG|M||||ESQ||2|1|1|380.70|705.00|||1|
482|ML|1|178.179.135||AZE|AZE|B||||ESQ||2|1|1|264.60|490.00|||1|
483|ML|2|178.179.136||AZE|AZE|B||||ESQ||2|1|1|380.70|705.00|||1|
484|ML|1|178.179.137||AZE|AZE|M||||ESQ||2|1|1|264.60|490.00|||1|
485|ML|2|178.179.138||AZE|AZE|M||||ESQ||2|1|1|380.70|705.00|||1|
486|ML|1|178.179.139||AMA|AMA|B||||ESQ||2|1|1|264.60|490.00|||1|
487|ML|2|178.179.140||AMA|AMA|B||||ESQ||2|1|1|380.70|705.00|||1|
488|ML|1|178.179.141||AMA|AMA|M||||ESQ||2|1|1|264.60|490.00|||1|
489|ML|2|178.179.142||AMA|AMA|M||||ESQ||2|1|1|380.70|705.00|||1|
490|ML|1|178.179.143||AES|AES|B||||ESQ||2|1|1|264.60|490.00|||1|
491|ML|2|178.179.144||AES|AES|B||||ESQ||2|1|1|380.70|705.00|||1|
492|ML|1|178.179.145||AES|AES|M||||ESQ||2|1|1|264.60|490.00|||1|
493|ML|2|178.179.146||AES|AES|M||||ESQ||2|1|1|380.70|705.00|||1|
494|ML|1|178.179.147||PRA|PRA|B||||ESQ||2|1|1|264.60|490.00|||1|
495|ML|2|178.179.148||PRA|PRA|B||||ESQ||2|1|1|380.70|705.00|||1|
496|ML|1|178.179.149||PRA|PRA|M||||ESQ||2|1|1|264.60|490.00|||1|
497|ML|2|178.179.150||PRA|PRA|M||||ESQ||2|1|1|380.70|705.00|||1|
498|ML|1|178.179.151||ROS|ROS|B||||ESQ||2|1|1|264.60|490.00|||1|
499|ML|2|178.179.152||ROS|ROS|B||||ESQ||2|1|1|380.70|705.00|||1|
500|ML|1|178.179.153||ROS|ROS|M||||ESQ||2|1|1|264.60|490.00|||1|
501|ML|2|178.179.154||ROS|ROS|M||||ESQ||2|1|1|380.70|705.00|||1|
502|ML|1|178.179.155||VER|VER|B||||ESQ||2|1|1|264.60|490.00|||1|
503|ML|2|178.179.156||VER|VER|B||||ESQ||2|1|1|380.70|705.00|||1|
504|ML|1|178.179.157||VER|VER|M||||ESQ||2|1|1|264.60|490.00|||1|
505|ML|2|178.179.158||VER|VER|M||||ESQ||2|1|1|380.70|705.00|||1|
506|ML|1|178.179.159||OAK|OAK|||||ESQ||2|1|1|264.60|490.00|||1|
507|ML|2|178.179.160||OAK|OAK|||||ESQ||2|1|1|380.70|705.00|||1|
508|ML|1|178.179.161||TEA|TEA|||||ESQ||2|1|1|264.60|490.00|||1|
509|ML|2|178.179.162||TEA|TEA|||||ESQ||2|1|1|380.70|705.00|||1|
510|ML|1|178.179.163||JOP|JOP|||||ESQ||2|1|1|264.60|490.00|||1|
511|ML|2|178.179.164||JOP|JOP|||||ESQ||2|1|1|380.70|705.00|||1|
512|ML|1|178.179.165||AZB|AZB|||||ESQ||2|1|1|264.60|490.00|||1|
513|ML|2|178.179.166||AZB|AZB|||||ESQ||2|1|1|380.70|705.00|||1|
514|ML|1|178.179.167||DEN|DEN|||||ESQ||2|1|1|264.60|490.00|||1|
515|ML|2|178.179.168||DEN|DEN|||||ESQ||2|1|1|380.70|705.00|||1|
516|ML|1|178.179.169||BLK|BLK|||||ESQ||2|1|1|264.60|490.00|||1|
517|ML|2|178.179.170||BLK|BLK|||||ESQ||2|1|1|380.70|705.00|||1|
518|ML|1|178.179.171||ART|ART|||||ESQ||2|1|1|264.60|490.00|||1|
519|ML|2|178.179.172||ART|ART|||||ESQ||2|1|1|380.70|705.00|||1|
520|ML|1|178.179.173||LIN|LIN|||||ESQ||2|1|1|264.60|490.00|||1|
521|ML|2|178.179.174||LIN|LIN|||||ESQ||2|1|1|380.70|705.00|||1|
522|ML|1|178.179.175||HAL|HAL|||||ESQ||2|1|1|264.60|490.00|||1|
523|ML|2|178.179.176||HAL|HAL|||||ESQ||2|1|1|380.70|705.00|||1|
524|ML|1|178.180.3||WH|WH|||||DIR||2|1|1|259.20|480.00|||1|
525|ML|2|178.180.4||WH|WH|||||DIR||2|1|1|398.52|738.00|||1|
526|ML|1|178.180.5||WH|AZB|||||DIR||2|1|1|259.20|480.00|||1|
527|ML|2|178.180.6||WH|AZB|||||DIR||2|1|1|398.52|738.00|||1|
528|ML|1|178.180.7||WH|DEN|||||DIR||2|1|1|259.20|480.00|||1|
529|ML|2|178.180.8||WH|DEN|||||DIR||2|1|1|398.52|738.00|||1|
530|ML|1|178.180.9||WH|BCO|B||||DIR||2|1|1|286.20|530.00|||1|
531|ML|2|178.180.10||WH|BCO|B||||DIR||2|1|1|425.52|788.00|||1|
532|ML|1|178.180.11||WH|BCO|M||||DIR||2|1|1|286.20|530.00|||1|
533|ML|2|178.180.12||WH|BCO|M||||DIR||2|1|1|425.52|788.00|||1|
534|ML|1|178.180.13||WH|CCL|B||||DIR||2|1|1|286.20|530.00|||1|
535|ML|2|178.180.14||WH|CCL|B||||DIR||2|1|1|425.52|788.00|||1|
536|ML|1|178.180.15||WH|CCL|M||||DIR||2|1|1|286.20|530.00|||1|
537|ML|2|178.180.16||WH|CCL|M||||DIR||2|1|1|425.52|788.00|||1|
538|ML|1|178.180.17||WH|CME|B||||DIR||2|1|1|286.20|530.00|||1|
539|ML|2|178.180.18||WH|CME|B||||DIR||2|1|1|425.52|788.00|||1|
540|ML|1|178.180.19||WH|CME|M||||DIR||2|1|1|286.20|530.00|||1|
541|ML|2|178.180.20||WH|CME|M||||DIR||2|1|1|425.52|788.00|||1|
542|ML|1|178.180.21||WH|ANT|B||||DIR||2|1|1|286.20|530.00|||1|
543|ML|2|178.180.22||WH|ANT|B||||DIR||2|1|1|425.52|788.00|||1|
544|ML|1|178.180.23||WH|ANT|M||||DIR||2|1|1|286.20|530.00|||1|
545|ML|2|178.180.24||WH|ANT|M||||DIR||2|1|1|425.52|788.00|||1|
546|ML|1|178.180.25||WH|PTO|B||||DIR||2|1|1|286.20|530.00|||1|
547|ML|2|178.180.26||WH|PTO|B||||DIR||2|1|1|425.52|788.00|||1|
548|ML|1|178.180.27||WH|PTO|M||||DIR||2|1|1|286.20|530.00|||1|
549|ML|2|178.180.28||WH|PTO|M||||DIR||2|1|1|425.52|788.00|||1|
550|ML|1|178.180.29||WH|CRE|B||||DIR||2|1|1|286.20|530.00|||1|
551|ML|2|178.180.30||WH|CRE|B||||DIR||2|1|1|425.52|788.00|||1|
552|ML|1|178.180.31||WH|CRE|M||||DIR||2|1|1|286.20|530.00|||1|
553|ML|2|178.180.32||WH|CRE|M||||DIR||2|1|1|425.52|788.00|||1|
554|ML|1|178.180.33||WH|CAM|B||||DIR||2|1|1|286.20|530.00|||1|
555|ML|2|178.180.34||WH|CAM|B||||DIR||2|1|1|425.52|788.00|||1|
556|ML|1|178.180.35||WH|CAM|M||||DIR||2|1|1|286.20|530.00|||1|
557|ML|2|178.180.36||WH|CAM|M||||DIR||2|1|1|425.52|788.00|||1|
558|ML|1|178.180.37||WH|OUR|B||||DIR||2|1|1|286.20|530.00|||1|
559|ML|2|178.180.38||WH|OUR|B||||DIR||2|1|1|425.52|788.00|||1|
560|ML|1|178.180.39||WH|OUR|M||||DIR||2|1|1|286.20|530.00|||1|
561|ML|2|178.180.40||WH|OUR|M||||DIR||2|1|1|425.52|788.00|||1|
562|ML|1|178.180.41||WH|COB|B||||DIR||2|1|1|286.20|530.00|||1|
563|ML|2|178.180.42||WH|COB|B||||DIR||2|1|1|425.52|788.00|||1|
564|ML|1|178.180.43||WH|COB|M||||DIR||2|1|1|286.20|530.00|||1|
565|ML|2|178.180.44||WH|COB|M||||DIR||2|1|1|425.52|788.00|||1|
566|ML|1|178.180.45||WH|CHO|B||||DIR||2|1|1|286.20|530.00|||1|
567|ML|2|178.180.46||WH|CHO|B||||DIR||2|1|1|425.52|788.00|||1|
568|ML|1|178.180.47||WH|CHO|M||||DIR||2|1|1|286.20|530.00|||1|
569|ML|2|178.180.48||WH|CHO|M||||DIR||2|1|1|425.52|788.00|||1|
570|ML|1|178.180.49||WH|VAG|B||||DIR||2|1|1|286.20|530.00|||1|
571|ML|2|178.180.50||WH|VAG|B||||DIR||2|1|1|425.52|788.00|||1|
572|ML|1|178.180.51||WH|VAG|M||||DIR||2|1|1|286.20|530.00|||1|
573|ML|2|178.180.52||WH|VAG|M||||DIR||2|1|1|425.52|788.00|||1|
574|ML|1|178.180.53||WH|AZE|B||||DIR||2|1|1|286.20|530.00|||1|
575|ML|2|178.180.54||WH|AZE|B||||DIR||2|1|1|425.52|788.00|||1|
576|ML|1|178.180.55||WH|AZE|M||||DIR||2|1|1|286.20|530.00|||1|
577|ML|2|178.180.56||WH|AZE|M||||DIR||2|1|1|425.52|788.00|||1|
578|ML|1|178.180.57||WH|AMA|B||||DIR||2|1|1|286.20|530.00|||1|
579|ML|2|178.180.58||WH|AMA|B||||DIR||2|1|1|425.52|788.00|||1|
580|ML|1|178.180.59||WH|AMA|M||||DIR||2|1|1|286.20|530.00|||1|
581|ML|2|178.180.60||WH|AMA|M||||DIR||2|1|1|425.52|788.00|||1|
582|ML|1|178.180.61||WH|AES|B||||DIR||2|1|1|286.20|530.00|||1|
583|ML|2|178.180.62||WH|AES|B||||DIR||2|1|1|425.52|788.00|||1|
584|ML|1|178.180.63||WH|AES|M||||DIR||2|1|1|286.20|530.00|||1|
585|ML|2|178.180.64||WH|AES|M||||DIR||2|1|1|425.52|788.00|||1|
586|ML|1|178.180.65||WH|PRA|B||||DIR||2|1|1|286.20|530.00|||1|
587|ML|2|178.180.66||WH|PRA|B||||DIR||2|1|1|425.52|788.00|||1|
588|ML|1|178.180.67||WH|PRA|M||||DIR||2|1|1|286.20|530.00|||1|
589|ML|2|178.180.68||WH|PRA|M||||DIR||2|1|1|425.52|788.00|||1|
590|ML|1|178.180.69||WH|ROS|B||||DIR||2|1|1|286.20|530.00|||1|
591|ML|2|178.180.70||WH|ROS|B||||DIR||2|1|1|425.52|788.00|||1|
592|ML|1|178.180.71||WH|ROS|M||||DIR||2|1|1|286.20|530.00|||1|
593|ML|2|178.180.72||WH|ROS|M||||DIR||2|1|1|425.52|788.00|||1|
594|ML|1|178.180.73||WH|VER|B||||DIR||2|1|1|286.20|530.00|||1|
595|ML|2|178.180.74||WH|VER|B||||DIR||2|1|1|425.52|788.00|||1|
596|ML|1|178.180.75||WH|VER|M||||DIR||2|1|1|286.20|530.00|||1|
597|ML|2|178.180.76||WH|VER|M||||DIR||2|1|1|425.52|788.00|||1|
598|ML|1|178.180.77||WH|OAK|||||DIR||2|1|1|286.20|530.00|||1|
599|ML|2|178.180.78||WH|OAK|||||DIR||2|1|1|425.52|788.00|||1|
600|ML|1|178.180.79||WH|TEA|||||DIR||2|1|1|286.20|530.00|||1|
601|ML|2|178.180.80||WH|TEA|||||DIR||2|1|1|425.52|788.00|||1|
602|ML|1|178.180.81||WH|JOP|||||DIR||2|1|1|286.20|530.00|||1|
603|ML|2|178.180.82||WH|JOP|||||DIR||2|1|1|425.52|788.00|||1|
604|ML|1|178.180.83||WH|BLK|||||DIR||2|1|1|286.20|530.00|||1|
605|ML|2|178.180.84||WH|BLK|||||DIR||2|1|1|425.52|788.00|||1|
606|ML|1|178.180.85||WH|ART|||||DIR||2|1|1|286.20|530.00|||1|
607|ML|2|178.180.86||WH|ART|||||DIR||2|1|1|425.52|788.00|||1|
608|ML|1|178.180.87||WH|LIN|||||DIR||2|1|1|286.20|530.00|||1|
609|ML|2|178.180.88||WH|LIN|||||DIR||2|1|1|425.52|788.00|||1|
610|ML|1|178.180.89||WH|HAL|||||DIR||2|1|1|286.20|530.00|||1|
611|ML|2|178.180.90||WH|HAL|||||DIR||2|1|1|425.52|788.00|||1|
612|ML|1|178.180.91||BCO|BCO|B||||DIR||2|1|1|307.80|570.00|||1|
613|ML|2|178.180.92||BCO|BCO|B||||DIR||2|1|1|447.12|828.00|||1|
614|ML|1|178.180.93||BCO|BCO|M||||DIR||2|1|1|307.80|570.00|||1|
615|ML|2|178.180.94||BCO|BCO|M||||DIR||2|1|1|447.12|828.00|||1|
616|ML|1|178.180.95||CCL|CCL|B||||DIR||2|1|1|307.80|570.00|||1|
617|ML|2|178.180.96||CCL|CCL|B||||DIR||2|1|1|447.12|828.00|||1|
618|ML|1|178.180.97||CCL|CCL|M||||DIR||2|1|1|307.80|570.00|||1|
619|ML|2|178.180.98||CCL|CCL|M||||DIR||2|1|1|447.12|828.00|||1|
620|ML|1|178.180.99||CME|CME|B||||DIR||2|1|1|307.80|570.00|||1|
621|ML|2|178.180.100||CME|CME|B||||DIR||2|1|1|447.12|828.00|||1|
622|ML|1|178.180.101||CME|CME|M||||DIR||2|1|1|307.80|570.00|||1|
623|ML|2|178.180.102||CME|CME|M||||DIR||2|1|1|447.12|828.00|||1|
624|ML|1|178.180.103||ANT|ANT|B||||DIR||2|1|1|307.80|570.00|||1|
625|ML|2|178.180.104||ANT|ANT|B||||DIR||2|1|1|447.12|828.00|||1|
626|ML|1|178.180.105||ANT|ANT|M||||DIR||2|1|1|307.80|570.00|||1|
627|ML|2|178.180.106||ANT|ANT|M||||DIR||2|1|1|447.12|828.00|||1|
628|ML|1|178.180.107||PTO|PTO|B||||DIR||2|1|1|307.80|570.00|||1|
629|ML|2|178.180.108||PTO|PTO|B||||DIR||2|1|1|447.12|828.00|||1|
630|ML|1|178.180.109||PTO|PTO|M||||DIR||2|1|1|307.80|570.00|||1|
631|ML|2|178.180.110||PTO|PTO|M||||DIR||2|1|1|447.12|828.00|||1|
632|ML|1|178.180.111||CRE|CRE|B||||DIR||2|1|1|307.80|570.00|||1|
633|ML|2|178.180.112||CRE|CRE|B||||DIR||2|1|1|447.12|828.00|||1|
634|ML|1|178.180.113||CRE|CRE|M||||DIR||2|1|1|307.80|570.00|||1|
635|ML|2|178.180.114||CRE|CRE|M||||DIR||2|1|1|447.12|828.00|||1|
636|ML|1|178.180.115||CAM|CAM|B||||DIR||2|1|1|307.80|570.00|||1|
637|ML|2|178.180.116||CAM|CAM|B||||DIR||2|1|1|447.12|828.00|||1|
638|ML|1|178.180.117||CAM|CAM|M||||DIR||2|1|1|307.80|570.00|||1|
639|ML|2|178.180.118||CAM|CAM|M||||DIR||2|1|1|447.12|828.00|||1|
640|ML|1|178.180.119||OUR|OUR|B||||DIR||2|1|1|307.80|570.00|||1|
641|ML|2|178.180.120||OUR|OUR|B||||DIR||2|1|1|447.12|828.00|||1|
642|ML|1|178.180.121||OUR|OUR|M||||DIR||2|1|1|307.80|570.00|||1|
643|ML|2|178.180.122||OUR|OUR|M||||DIR||2|1|1|447.12|828.00|||1|
644|ML|1|178.180.123||COB|COB|B||||DIR||2|1|1|307.80|570.00|||1|
645|ML|2|178.180.124||COB|COB|B||||DIR||2|1|1|447.12|828.00|||1|
646|ML|1|178.180.125||COB|COB|M||||DIR||2|1|1|307.80|570.00|||1|
647|ML|2|178.180.126||COB|COB|M||||DIR||2|1|1|447.12|828.00|||1|
648|ML|1|178.180.127||CHO|CHO|B||||DIR||2|1|1|307.80|570.00|||1|
649|ML|2|178.180.128||CHO|CHO|B||||DIR||2|1|1|447.12|828.00|||1|
650|ML|1|178.180.129||CHO|CHO|M||||DIR||2|1|1|307.80|570.00|||1|
651|ML|2|178.180.130||CHO|CHO|M||||DIR||2|1|1|447.12|828.00|||1|
652|ML|1|178.180.131||VAG|VAG|B||||DIR||2|1|1|307.80|570.00|||1|
653|ML|2|178.180.132||VAG|VAG|B||||DIR||2|1|1|447.12|828.00|||1|
654|ML|1|178.180.133||VAG|VAG|M||||DIR||2|1|1|307.80|570.00|||1|
655|ML|2|178.180.134||VAG|VAG|M||||DIR||2|1|1|447.12|828.00|||1|
656|ML|1|178.180.135||AZE|AZE|B||||DIR||2|1|1|307.80|570.00|||1|
657|ML|2|178.180.136||AZE|AZE|B||||DIR||2|1|1|447.12|828.00|||1|
658|ML|1|178.180.137||AZE|AZE|M||||DIR||2|1|1|307.80|570.00|||1|
659|ML|2|178.180.138||AZE|AZE|M||||DIR||2|1|1|447.12|828.00|||1|
660|ML|1|178.180.139||AMA|AMA|B||||DIR||2|1|1|307.80|570.00|||1|
661|ML|2|178.180.140||AMA|AMA|B||||DIR||2|1|1|447.12|828.00|||1|
662|ML|1|178.180.141||AMA|AMA|M||||DIR||2|1|1|307.80|570.00|||1|
663|ML|2|178.180.142||AMA|AMA|M||||DIR||2|1|1|447.12|828.00|||1|
664|ML|1|178.180.143||AES|AES|B||||DIR||2|1|1|307.80|570.00|||1|
665|ML|2|178.180.144||AES|AES|B||||DIR||2|1|1|447.12|828.00|||1|
666|ML|1|178.180.145||AES|AES|M||||DIR||2|1|1|307.80|570.00|||1|
667|ML|2|178.180.146||AES|AES|M||||DIR||2|1|1|447.12|828.00|||1|
668|ML|1|178.180.147||PRA|PRA|B||||DIR||2|1|1|307.80|570.00|||1|
669|ML|2|178.180.148||PRA|PRA|B||||DIR||2|1|1|447.12|828.00|||1|
670|ML|1|178.180.149||PRA|PRA|M||||DIR||2|1|1|307.80|570.00|||1|
671|ML|2|178.180.150||PRA|PRA|M||||DIR||2|1|1|447.12|828.00|||1|
672|ML|1|178.180.151||ROS|ROS|B||||DIR||2|1|1|307.80|570.00|||1|
673|ML|2|178.180.152||ROS|ROS|B||||DIR||2|1|1|447.12|828.00|||1|
674|ML|1|178.180.153||ROS|ROS|M||||DIR||2|1|1|307.80|570.00|||1|
675|ML|2|178.180.154||ROS|ROS|M||||DIR||2|1|1|447.12|828.00|||1|
676|ML|1|178.180.155||VER|VER|B||||DIR||2|1|1|307.80|570.00|||1|
677|ML|2|178.180.156||VER|VER|B||||DIR||2|1|1|447.12|828.00|||1|
678|ML|1|178.180.157||VER|VER|M||||DIR||2|1|1|307.80|570.00|||1|
679|ML|2|178.180.158||VER|VER|M||||DIR||2|1|1|447.12|828.00|||1|
680|ML|1|178.180.159||OAK|OAK|||||DIR||2|1|1|307.80|570.00|||1|
681|ML|2|178.180.160||OAK|OAK|||||DIR||2|1|1|447.12|828.00|||1|
682|ML|1|178.180.161||TEA|TEA|||||DIR||2|1|1|307.80|570.00|||1|
683|ML|2|178.180.162||TEA|TEA|||||DIR||2|1|1|447.12|828.00|||1|
684|ML|1|178.180.163||JOP|JOP|||||DIR||2|1|1|307.80|570.00|||1|
685|ML|2|178.180.164||JOP|JOP|||||DIR||2|1|1|447.12|828.00|||1|
686|ML|1|178.180.165||AZB|AZB|||||DIR||2|1|1|307.80|570.00|||1|
687|ML|2|178.180.166||AZB|AZB|||||DIR||2|1|1|447.12|828.00|||1|
688|ML|1|178.180.167||DEN|DEN|||||DIR||2|1|1|307.80|570.00|||1|
689|ML|2|178.180.168||DEN|DEN|||||DIR||2|1|1|447.12|828.00|||1|
690|ML|1|178.180.169||BLK|BLK|||||DIR||2|1|1|307.80|570.00|||1|
691|ML|2|178.180.170||BLK|BLK|||||DIR||2|1|1|447.12|828.00|||1|
692|ML|1|178.180.171||ART|ART|||||DIR||2|1|1|307.80|570.00|||1|
693|ML|2|178.180.172||ART|ART|||||DIR||2|1|1|447.12|828.00|||1|
694|ML|1|178.180.173||LIN|LIN|||||DIR||2|1|1|307.80|570.00|||1|
695|ML|2|178.180.174||LIN|LIN|||||DIR||2|1|1|447.12|828.00|||1|
696|ML|1|178.180.175||HAL|HAL|||||DIR||2|1|1|307.80|570.00|||1|
697|ML|2|178.180.176||HAL|HAL|||||DIR||2|1|1|447.12|828.00|||1|
698|ML|1|181.182.3||WH|WH|||||ESQ||3|1|1|243.00|450.00|||1|
699|ML|2|181.182.4||WH|WH|||||ESQ||3|1|1|356.40|660.00|||1|
700|ML|1|181.182.5||WH|AZB|||||ESQ||3|1|1|243.00|450.00|||1|
701|ML|2|181.182.6||WH|AZB|||||ESQ||3|1|1|356.40|660.00|||1|
702|ML|1|181.182.7||WH|DEN|||||ESQ||3|1|1|243.00|450.00|||1|
703|ML|2|181.182.8||WH|DEN|||||ESQ||3|1|1|356.40|660.00|||1|
704|ML|1|181.182.9||WH|BCO|B||||ESQ||3|1|1|270.00|500.00|||1|
705|ML|2|181.182.10||WH|BCO|B||||ESQ||3|1|1|383.40|710.00|||1|
706|ML|1|181.182.11||WH|BCO|M||||ESQ||3|1|1|270.00|500.00|||1|
707|ML|2|181.182.12||WH|BCO|M||||ESQ||3|1|1|383.40|710.00|||1|
708|ML|1|181.182.13||WH|CCL|B||||ESQ||3|1|1|270.00|500.00|||1|
709|ML|2|181.182.14||WH|CCL|B||||ESQ||3|1|1|383.40|710.00|||1|
710|ML|1|181.182.15||WH|CCL|M||||ESQ||3|1|1|270.00|500.00|||1|
711|ML|2|181.182.16||WH|CCL|M||||ESQ||3|1|1|383.40|710.00|||1|
712|ML|1|181.182.17||WH|CME|B||||ESQ||3|1|1|270.00|500.00|||1|
713|ML|2|181.182.18||WH|CME|B||||ESQ||3|1|1|383.40|710.00|||1|
714|ML|1|181.182.19||WH|CME|M||||ESQ||3|1|1|270.00|500.00|||1|
715|ML|2|181.182.20||WH|CME|M||||ESQ||3|1|1|383.40|710.00|||1|
716|ML|1|181.182.21||WH|ANT|B||||ESQ||3|1|1|270.00|500.00|||1|
717|ML|2|181.182.22||WH|ANT|B||||ESQ||3|1|1|383.40|710.00|||1|
718|ML|1|181.182.23||WH|ANT|M||||ESQ||3|1|1|270.00|500.00|||1|
719|ML|2|181.182.24||WH|ANT|M||||ESQ||3|1|1|383.40|710.00|||1|
720|ML|1|181.182.25||WH|PTO|B||||ESQ||3|1|1|270.00|500.00|||1|
721|ML|2|181.182.26||WH|PTO|B||||ESQ||3|1|1|383.40|710.00|||1|
722|ML|1|181.182.27||WH|PTO|M||||ESQ||3|1|1|270.00|500.00|||1|
723|ML|2|181.182.28||WH|PTO|M||||ESQ||3|1|1|383.40|710.00|||1|
724|ML|1|181.182.29||WH|CRE|B||||ESQ||3|1|1|270.00|500.00|||1|
725|ML|2|181.182.30||WH|CRE|B||||ESQ||3|1|1|383.40|710.00|||1|
726|ML|1|181.182.31||WH|CRE|M||||ESQ||3|1|1|270.00|500.00|||1|
727|ML|2|181.182.32||WH|CRE|M||||ESQ||3|1|1|383.40|710.00|||1|
728|ML|1|181.182.33||WH|CAM|B||||ESQ||3|1|1|270.00|500.00|||1|
729|ML|2|181.182.34||WH|CAM|B||||ESQ||3|1|1|383.40|710.00|||1|
730|ML|1|181.182.35||WH|CAM|M||||ESQ||3|1|1|270.00|500.00|||1|
731|ML|2|181.182.36||WH|CAM|M||||ESQ||3|1|1|383.40|710.00|||1|
732|ML|1|181.182.37||WH|OUR|B||||ESQ||3|1|1|270.00|500.00|||1|
733|ML|2|181.182.38||WH|OUR|B||||ESQ||3|1|1|383.40|710.00|||1|
734|ML|1|181.182.39||WH|OUR|M||||ESQ||3|1|1|270.00|500.00|||1|
735|ML|2|181.182.40||WH|OUR|M||||ESQ||3|1|1|383.40|710.00|||1|
736|ML|1|181.182.41||WH|COB|B||||ESQ||3|1|1|270.00|500.00|||1|
737|ML|2|181.182.42||WH|COB|B||||ESQ||3|1|1|383.40|710.00|||1|
738|ML|1|181.182.43||WH|COB|M||||ESQ||3|1|1|270.00|500.00|||1|
739|ML|2|181.182.44||WH|COB|M||||ESQ||3|1|1|383.40|710.00|||1|
740|ML|1|181.182.45||WH|CHO|B||||ESQ||3|1|1|270.00|500.00|||1|
741|ML|2|181.182.46||WH|CHO|B||||ESQ||3|1|1|383.40|710.00|||1|
742|ML|1|181.182.47||WH|CHO|M||||ESQ||3|1|1|270.00|500.00|||1|
743|ML|2|181.182.48||WH|CHO|M||||ESQ||3|1|1|383.40|710.00|||1|
744|ML|1|181.182.49||WH|VAG|B||||ESQ||3|1|1|270.00|500.00|||1|
745|ML|2|181.182.50||WH|VAG|B||||ESQ||3|1|1|383.40|710.00|||1|
746|ML|1|181.182.51||WH|VAG|M||||ESQ||3|1|1|270.00|500.00|||1|
747|ML|2|181.182.52||WH|VAG|M||||ESQ||3|1|1|383.40|710.00|||1|
748|ML|1|181.182.53||WH|AZE|B||||ESQ||3|1|1|270.00|500.00|||1|
749|ML|2|181.182.54||WH|AZE|B||||ESQ||3|1|1|383.40|710.00|||1|
750|ML|1|181.182.55||WH|AZE|M||||ESQ||3|1|1|270.00|500.00|||1|
751|ML|2|181.182.56||WH|AZE|M||||ESQ||3|1|1|383.40|710.00|||1|
752|ML|1|181.182.57||WH|AMA|B||||ESQ||3|1|1|270.00|500.00|||1|
753|ML|2|181.182.58||WH|AMA|B||||ESQ||3|1|1|383.40|710.00|||1|
754|ML|1|181.182.59||WH|AMA|M||||ESQ||3|1|1|270.00|500.00|||1|
755|ML|2|181.182.60||WH|AMA|M||||ESQ||3|1|1|383.40|710.00|||1|
756|ML|1|181.182.61||WH|AES|B||||ESQ||3|1|1|270.00|500.00|||1|
757|ML|2|181.182.62||WH|AES|B||||ESQ||3|1|1|383.40|710.00|||1|
758|ML|1|181.182.63||WH|AES|M||||ESQ||3|1|1|270.00|500.00|||1|
759|ML|2|181.182.64||WH|AES|M||||ESQ||3|1|1|383.40|710.00|||1|
760|ML|1|181.182.65||WH|PRA|B||||ESQ||3|1|1|270.00|500.00|||1|
761|ML|2|181.182.66||WH|PRA|B||||ESQ||3|1|1|383.40|710.00|||1|
762|ML|1|181.182.67||WH|PRA|M||||ESQ||3|1|1|270.00|500.00|||1|
763|ML|2|181.182.68||WH|PRA|M||||ESQ||3|1|1|383.40|710.00|||1|
764|ML|1|181.182.69||WH|ROS|B||||ESQ||3|1|1|270.00|500.00|||1|
765|ML|2|181.182.70||WH|ROS|B||||ESQ||3|1|1|383.40|710.00|||1|
766|ML|1|181.182.71||WH|ROS|M||||ESQ||3|1|1|270.00|500.00|||1|
767|ML|2|181.182.72||WH|ROS|M||||ESQ||3|1|1|383.40|710.00|||1|
768|ML|1|181.182.73||WH|VER|B||||ESQ||3|1|1|270.00|500.00|||1|
769|ML|2|181.182.74||WH|VER|B||||ESQ||3|1|1|383.40|710.00|||1|
770|ML|1|181.182.75||WH|VER|M||||ESQ||3|1|1|270.00|500.00|||1|
771|ML|2|181.182.76||WH|VER|M||||ESQ||3|1|1|383.40|710.00|||1|
772|ML|1|181.182.77||WH|OAK|||||ESQ||3|1|1|270.00|500.00|||1|
773|ML|2|181.182.78||WH|OAK|||||ESQ||3|1|1|383.40|710.00|||1|
774|ML|1|181.182.79||WH|TEA|||||ESQ||3|1|1|270.00|500.00|||1|
775|ML|2|181.182.80||WH|TEA|||||ESQ||3|1|1|383.40|710.00|||1|
776|ML|1|181.182.81||WH|JOP|||||ESQ||3|1|1|270.00|500.00|||1|
777|ML|2|181.182.82||WH|JOP|||||ESQ||3|1|1|383.40|710.00|||1|
778|ML|1|181.182.83||WH|BLK|||||ESQ||3|1|1|270.00|500.00|||1|
779|ML|2|181.182.84||WH|BLK|||||ESQ||3|1|1|383.40|710.00|||1|
780|ML|1|181.182.85||WH|ART|||||ESQ||3|1|1|270.00|500.00|||1|
781|ML|2|181.182.86||WH|ART|||||ESQ||3|1|1|383.40|710.00|||1|
782|ML|1|181.182.87||WH|LIN|||||ESQ||3|1|1|270.00|500.00|||1|
783|ML|2|181.182.88||WH|LIN|||||ESQ||3|1|1|383.40|710.00|||1|
784|ML|1|181.182.89||WH|HAL|||||ESQ||3|1|1|270.00|500.00|||1|
785|ML|2|181.182.90||WH|HAL|||||ESQ||3|1|1|383.40|710.00|||1|
786|ML|1|181.182.91||BCO|BCO|B||||ESQ||3|1|1|291.60|540.00|||1|
787|ML|2|181.182.92||BCO|BCO|B||||ESQ||3|1|1|405.00|750.00|||1|
788|ML|1|181.182.93||BCO|BCO|M||||ESQ||3|1|1|291.60|540.00|||1|
789|ML|2|181.182.94||BCO|BCO|M||||ESQ||3|1|1|405.00|750.00|||1|
790|ML|1|181.182.95||CCL|CCL|B||||ESQ||3|1|1|291.60|540.00|||1|
791|ML|2|181.182.96||CCL|CCL|B||||ESQ||3|1|1|405.00|750.00|||1|
792|ML|1|181.182.97||CCL|CCL|M||||ESQ||3|1|1|291.60|540.00|||1|
793|ML|2|181.182.98||CCL|CCL|M||||ESQ||3|1|1|405.00|750.00|||1|
794|ML|1|181.182.99||CME|CME|B||||ESQ||3|1|1|291.60|540.00|||1|
795|ML|2|181.182.100||CME|CME|B||||ESQ||3|1|1|405.00|750.00|||1|
796|ML|1|181.182.101||CME|CME|M||||ESQ||3|1|1|291.60|540.00|||1|
797|ML|2|181.182.102||CME|CME|M||||ESQ||3|1|1|405.00|750.00|||1|
798|ML|1|181.182.103||ANT|ANT|B||||ESQ||3|1|1|291.60|540.00|||1|
799|ML|2|181.182.104||ANT|ANT|B||||ESQ||3|1|1|405.00|750.00|||1|
800|ML|1|181.182.105||ANT|ANT|M||||ESQ||3|1|1|291.60|540.00|||1|
801|ML|2|181.182.106||ANT|ANT|M||||ESQ||3|1|1|405.00|750.00|||1|
802|ML|1|181.182.107||PTO|PTO|B||||ESQ||3|1|1|291.60|540.00|||1|
803|ML|2|181.182.108||PTO|PTO|B||||ESQ||3|1|1|405.00|750.00|||1|
804|ML|1|181.182.109||PTO|PTO|M||||ESQ||3|1|1|291.60|540.00|||1|
805|ML|2|181.182.110||PTO|PTO|M||||ESQ||3|1|1|405.00|750.00|||1|
806|ML|1|181.182.111||CRE|CRE|B||||ESQ||3|1|1|291.60|540.00|||1|
807|ML|2|181.182.112||CRE|CRE|B||||ESQ||3|1|1|405.00|750.00|||1|
808|ML|1|181.182.113||CRE|CRE|M||||ESQ||3|1|1|291.60|540.00|||1|
809|ML|2|181.182.114||CRE|CRE|M||||ESQ||3|1|1|405.00|750.00|||1|
810|ML|1|181.182.115||CAM|CAM|B||||ESQ||3|1|1|291.60|540.00|||1|
811|ML|2|181.182.116||CAM|CAM|B||||ESQ||3|1|1|405.00|750.00|||1|
812|ML|1|181.182.117||CAM|CAM|M||||ESQ||3|1|1|291.60|540.00|||1|
813|ML|2|181.182.118||CAM|CAM|M||||ESQ||3|1|1|405.00|750.00|||1|
814|ML|1|181.182.119||OUR|OUR|B||||ESQ||3|1|1|291.60|540.00|||1|
815|ML|2|181.182.120||OUR|OUR|B||||ESQ||3|1|1|405.00|750.00|||1|
816|ML|1|181.182.121||OUR|OUR|M||||ESQ||3|1|1|291.60|540.00|||1|
817|ML|2|181.182.122||OUR|OUR|M||||ESQ||3|1|1|405.00|750.00|||1|
818|ML|1|181.182.123||COB|COB|B||||ESQ||3|1|1|291.60|540.00|||1|
819|ML|2|181.182.124||COB|COB|B||||ESQ||3|1|1|405.00|750.00|||1|
820|ML|1|181.182.125||COB|COB|M||||ESQ||3|1|1|291.60|540.00|||1|
821|ML|2|181.182.126||COB|COB|M||||ESQ||3|1|1|405.00|750.00|||1|
822|ML|1|181.182.127||CHO|CHO|B||||ESQ||3|1|1|291.60|540.00|||1|
823|ML|2|181.182.128||CHO|CHO|B||||ESQ||3|1|1|405.00|750.00|||1|
824|ML|1|181.182.129||CHO|CHO|M||||ESQ||3|1|1|291.60|540.00|||1|
825|ML|2|181.182.130||CHO|CHO|M||||ESQ||3|1|1|405.00|750.00|||1|
826|ML|1|181.182.131||VAG|VAG|B||||ESQ||3|1|1|291.60|540.00|||1|
827|ML|2|181.182.132||VAG|VAG|B||||ESQ||3|1|1|405.00|750.00|||1|
828|ML|1|181.182.133||VAG|VAG|M||||ESQ||3|1|1|291.60|540.00|||1|
829|ML|2|181.182.134||VAG|VAG|M||||ESQ||3|1|1|405.00|750.00|||1|
830|ML|1|181.182.135||AZE|AZE|B||||ESQ||3|1|1|291.60|540.00|||1|
831|ML|2|181.182.136||AZE|AZE|B||||ESQ||3|1|1|405.00|750.00|||1|
832|ML|1|181.182.137||AZE|AZE|M||||ESQ||3|1|1|291.60|540.00|||1|
833|ML|2|181.182.138||AZE|AZE|M||||ESQ||3|1|1|405.00|750.00|||1|
834|ML|1|181.182.139||AMA|AMA|B||||ESQ||3|1|1|291.60|540.00|||1|
835|ML|2|181.182.140||AMA|AMA|B||||ESQ||3|1|1|405.00|750.00|||1|
836|ML|1|181.182.141||AMA|AMA|M||||ESQ||3|1|1|291.60|540.00|||1|
837|ML|2|181.182.142||AMA|AMA|M||||ESQ||3|1|1|405.00|750.00|||1|
838|ML|1|181.182.143||AES|AES|B||||ESQ||3|1|1|291.60|540.00|||1|
839|ML|2|181.182.144||AES|AES|B||||ESQ||3|1|1|405.00|750.00|||1|
840|ML|1|181.182.145||AES|AES|M||||ESQ||3|1|1|291.60|540.00|||1|
841|ML|2|181.182.146||AES|AES|M||||ESQ||3|1|1|405.00|750.00|||1|
842|ML|1|181.182.147||PRA|PRA|B||||ESQ||3|1|1|291.60|540.00|||1|
843|ML|2|181.182.148||PRA|PRA|B||||ESQ||3|1|1|405.00|750.00|||1|
844|ML|1|181.182.149||PRA|PRA|M||||ESQ||3|1|1|291.60|540.00|||1|
845|ML|2|181.182.150||PRA|PRA|M||||ESQ||3|1|1|405.00|750.00|||1|
846|ML|1|181.182.151||ROS|ROS|B||||ESQ||3|1|1|291.60|540.00|||1|
847|ML|2|181.182.152||ROS|ROS|B||||ESQ||3|1|1|405.00|750.00|||1|
848|ML|1|181.182.153||ROS|ROS|M||||ESQ||3|1|1|291.60|540.00|||1|
849|ML|2|181.182.154||ROS|ROS|M||||ESQ||3|1|1|405.00|750.00|||1|
850|ML|1|181.182.155||VER|VER|B||||ESQ||3|1|1|291.60|540.00|||1|
851|ML|2|181.182.156||VER|VER|B||||ESQ||3|1|1|405.00|750.00|||1|
852|ML|1|181.182.157||VER|VER|M||||ESQ||3|1|1|291.60|540.00|||1|
853|ML|2|181.182.158||VER|VER|M||||ESQ||3|1|1|405.00|750.00|||1|
854|ML|1|181.182.159||OAK|OAK|||||ESQ||3|1|1|291.60|540.00|||1|
855|ML|2|181.182.160||OAK|OAK|||||ESQ||3|1|1|405.00|750.00|||1|
856|ML|1|181.182.161||TEA|TEA|||||ESQ||3|1|1|291.60|540.00|||1|
857|ML|2|181.182.162||TEA|TEA|||||ESQ||3|1|1|405.00|750.00|||1|
858|ML|1|181.182.163||JOP|JOP|||||ESQ||3|1|1|291.60|540.00|||1|
859|ML|2|181.182.164||JOP|JOP|||||ESQ||3|1|1|405.00|750.00|||1|
860|ML|1|181.182.165||AZB|AZB|||||ESQ||3|1|1|291.60|540.00|||1|
861|ML|2|181.182.166||AZB|AZB|||||ESQ||3|1|1|405.00|750.00|||1|
862|ML|1|181.182.167||DEN|DEN|||||ESQ||3|1|1|291.60|540.00|||1|
863|ML|2|181.182.168||DEN|DEN|||||ESQ||3|1|1|405.00|750.00|||1|
864|ML|1|181.182.169||BLK|BLK|||||ESQ||3|1|1|291.60|540.00|||1|
865|ML|2|181.182.170||BLK|BLK|||||ESQ||3|1|1|405.00|750.00|||1|
866|ML|1|181.182.171||ART|ART|||||ESQ||3|1|1|291.60|540.00|||1|
867|ML|2|181.182.172||ART|ART|||||ESQ||3|1|1|405.00|750.00|||1|
868|ML|1|181.182.173||LIN|LIN|||||ESQ||3|1|1|291.60|540.00|||1|
869|ML|2|181.182.174||LIN|LIN|||||ESQ||3|1|1|405.00|750.00|||1|
870|ML|1|181.182.175||HAL|HAL|||||ESQ||3|1|1|291.60|540.00|||1|
871|ML|2|181.182.176||HAL|HAL|||||ESQ||3|1|1|405.00|750.00|||1|
872|ML|1|181.183.3||WH|WH|||||DIR||3|1|1|291.60|540.00|||1|
873|ML|2|181.183.4||WH|WH|||||DIR||3|1|1|427.68|792.00|||1|
874|ML|1|181.183.5||WH|AZB|||||DIR||3|1|1|291.60|540.00|||1|
875|ML|2|181.183.6||WH|AZB|||||DIR||3|1|1|427.68|792.00|||1|
876|ML|1|181.183.7||WH|DEN|||||DIR||3|1|1|291.60|540.00|||1|
877|ML|2|181.183.8||WH|DEN|||||DIR||3|1|1|427.68|792.00|||1|
878|ML|1|181.183.9||WH|BCO|B||||DIR||3|1|1|318.60|590.00|||1|
879|ML|2|181.183.10||WH|BCO|B||||DIR||3|1|1|454.68|842.00|||1|
880|ML|1|181.183.11||WH|BCO|M||||DIR||3|1|1|318.60|590.00|||1|
881|ML|2|181.183.12||WH|BCO|M||||DIR||3|1|1|454.68|842.00|||1|
882|ML|1|181.183.13||WH|CCL|B||||DIR||3|1|1|318.60|590.00|||1|
883|ML|2|181.183.14||WH|CCL|B||||DIR||3|1|1|454.68|842.00|||1|
884|ML|1|181.183.15||WH|CCL|M||||DIR||3|1|1|318.60|590.00|||1|
885|ML|2|181.183.16||WH|CCL|M||||DIR||3|1|1|454.68|842.00|||1|
886|ML|1|181.183.17||WH|CME|B||||DIR||3|1|1|318.60|590.00|||1|
887|ML|2|181.183.18||WH|CME|B||||DIR||3|1|1|454.68|842.00|||1|
888|ML|1|181.183.19||WH|CME|M||||DIR||3|1|1|318.60|590.00|||1|
889|ML|2|181.183.20||WH|CME|M||||DIR||3|1|1|454.68|842.00|||1|
890|ML|1|181.183.21||WH|ANT|B||||DIR||3|1|1|318.60|590.00|||1|
891|ML|2|181.183.22||WH|ANT|B||||DIR||3|1|1|454.68|842.00|||1|
892|ML|1|181.183.23||WH|ANT|M||||DIR||3|1|1|318.60|590.00|||1|
893|ML|2|181.183.24||WH|ANT|M||||DIR||3|1|1|454.68|842.00|||1|
894|ML|1|181.183.25||WH|PTO|B||||DIR||3|1|1|318.60|590.00|||1|
895|ML|2|181.183.26||WH|PTO|B||||DIR||3|1|1|454.68|842.00|||1|
896|ML|1|181.183.27||WH|PTO|M||||DIR||3|1|1|318.60|590.00|||1|
897|ML|2|181.183.28||WH|PTO|M||||DIR||3|1|1|454.68|842.00|||1|
898|ML|1|181.183.29||WH|CRE|B||||DIR||3|1|1|318.60|590.00|||1|
899|ML|2|181.183.30||WH|CRE|B||||DIR||3|1|1|454.68|842.00|||1|
900|ML|1|181.183.31||WH|CRE|M||||DIR||3|1|1|318.60|590.00|||1|
901|ML|2|181.183.32||WH|CRE|M||||DIR||3|1|1|454.68|842.00|||1|
902|ML|1|181.183.33||WH|CAM|B||||DIR||3|1|1|318.60|590.00|||1|
903|ML|2|181.183.34||WH|CAM|B||||DIR||3|1|1|454.68|842.00|||1|
904|ML|1|181.183.35||WH|CAM|M||||DIR||3|1|1|318.60|590.00|||1|
905|ML|2|181.183.36||WH|CAM|M||||DIR||3|1|1|454.68|842.00|||1|
906|ML|1|181.183.37||WH|OUR|B||||DIR||3|1|1|318.60|590.00|||1|
907|ML|2|181.183.38||WH|OUR|B||||DIR||3|1|1|454.68|842.00|||1|
908|ML|1|181.183.39||WH|OUR|M||||DIR||3|1|1|318.60|590.00|||1|
909|ML|2|181.183.40||WH|OUR|M||||DIR||3|1|1|454.68|842.00|||1|
910|ML|1|181.183.41||WH|COB|B||||DIR||3|1|1|318.60|590.00|||1|
911|ML|2|181.183.42||WH|COB|B||||DIR||3|1|1|454.68|842.00|||1|
912|ML|1|181.183.43||WH|COB|M||||DIR||3|1|1|318.60|590.00|||1|
913|ML|2|181.183.44||WH|COB|M||||DIR||3|1|1|454.68|842.00|||1|
914|ML|1|181.183.45||WH|CHO|B||||DIR||3|1|1|318.60|590.00|||1|
915|ML|2|181.183.46||WH|CHO|B||||DIR||3|1|1|454.68|842.00|||1|
916|ML|1|181.183.47||WH|CHO|M||||DIR||3|1|1|318.60|590.00|||1|
917|ML|2|181.183.48||WH|CHO|M||||DIR||3|1|1|454.68|842.00|||1|
918|ML|1|181.183.49||WH|VAG|B||||DIR||3|1|1|318.60|590.00|||1|
919|ML|2|181.183.50||WH|VAG|B||||DIR||3|1|1|454.68|842.00|||1|
920|ML|1|181.183.51||WH|VAG|M||||DIR||3|1|1|318.60|590.00|||1|
921|ML|2|181.183.52||WH|VAG|M||||DIR||3|1|1|454.68|842.00|||1|
922|ML|1|181.183.53||WH|AZE|B||||DIR||3|1|1|318.60|590.00|||1|
923|ML|2|181.183.54||WH|AZE|B||||DIR||3|1|1|454.68|842.00|||1|
924|ML|1|181.183.55||WH|AZE|M||||DIR||3|1|1|318.60|590.00|||1|
925|ML|2|181.183.56||WH|AZE|M||||DIR||3|1|1|454.68|842.00|||1|
926|ML|1|181.183.57||WH|AMA|B||||DIR||3|1|1|318.60|590.00|||1|
927|ML|2|181.183.58||WH|AMA|B||||DIR||3|1|1|454.68|842.00|||1|
928|ML|1|181.183.59||WH|AMA|M||||DIR||3|1|1|318.60|590.00|||1|
929|ML|2|181.183.60||WH|AMA|M||||DIR||3|1|1|454.68|842.00|||1|
930|ML|1|181.183.61||WH|AES|B||||DIR||3|1|1|318.60|590.00|||1|
931|ML|2|181.183.62||WH|AES|B||||DIR||3|1|1|454.68|842.00|||1|
932|ML|1|181.183.63||WH|AES|M||||DIR||3|1|1|318.60|590.00|||1|
933|ML|2|181.183.64||WH|AES|M||||DIR||3|1|1|454.68|842.00|||1|
934|ML|1|181.183.65||WH|PRA|B||||DIR||3|1|1|318.60|590.00|||1|
935|ML|2|181.183.66||WH|PRA|B||||DIR||3|1|1|454.68|842.00|||1|
936|ML|1|181.183.67||WH|PRA|M||||DIR||3|1|1|318.60|590.00|||1|
937|ML|2|181.183.68||WH|PRA|M||||DIR||3|1|1|454.68|842.00|||1|
938|ML|1|181.183.69||WH|ROS|B||||DIR||3|1|1|318.60|590.00|||1|
939|ML|2|181.183.70||WH|ROS|B||||DIR||3|1|1|454.68|842.00|||1|
940|ML|1|181.183.71||WH|ROS|M||||DIR||3|1|1|318.60|590.00|||1|
941|ML|2|181.183.72||WH|ROS|M||||DIR||3|1|1|454.68|842.00|||1|
942|ML|1|181.183.73||WH|VER|B||||DIR||3|1|1|318.60|590.00|||1|
943|ML|2|181.183.74||WH|VER|B||||DIR||3|1|1|454.68|842.00|||1|
944|ML|1|181.183.75||WH|VER|M||||DIR||3|1|1|318.60|590.00|||1|
945|ML|2|181.183.76||WH|VER|M||||DIR||3|1|1|454.68|842.00|||1|
946|ML|1|181.183.77||WH|OAK|||||DIR||3|1|1|318.60|590.00|||1|
947|ML|2|181.183.78||WH|OAK|||||DIR||3|1|1|454.68|842.00|||1|
948|ML|1|181.183.79||WH|TEA|||||DIR||3|1|1|318.60|590.00|||1|
949|ML|2|181.183.80||WH|TEA|||||DIR||3|1|1|454.68|842.00|||1|
950|ML|1|181.183.81||WH|JOP|||||DIR||3|1|1|318.60|590.00|||1|
951|ML|2|181.183.82||WH|JOP|||||DIR||3|1|1|454.68|842.00|||1|
952|ML|1|181.183.83||WH|BLK|||||DIR||3|1|1|318.60|590.00|||1|
953|ML|2|181.183.84||WH|BLK|||||DIR||3|1|1|454.68|842.00|||1|
954|ML|1|181.183.85||WH|ART|||||DIR||3|1|1|318.60|590.00|||1|
955|ML|2|181.183.86||WH|ART|||||DIR||3|1|1|454.68|842.00|||1|
956|ML|1|181.183.87||WH|LIN|||||DIR||3|1|1|318.60|590.00|||1|
957|ML|2|181.183.88||WH|LIN|||||DIR||3|1|1|454.68|842.00|||1|
958|ML|1|181.183.89||WH|HAL|||||DIR||3|1|1|318.60|590.00|||1|
959|ML|2|181.183.90||WH|HAL|||||DIR||3|1|1|454.68|842.00|||1|
960|ML|1|181.183.91||BCO|BCO|B||||DIR||3|1|1|340.20|630.00|||1|
961|ML|2|181.183.92||BCO|BCO|B||||DIR||3|1|1|476.28|882.00|||1|
962|ML|1|181.183.93||BCO|BCO|M||||DIR||3|1|1|340.20|630.00|||1|
963|ML|2|181.183.94||BCO|BCO|M||||DIR||3|1|1|476.28|882.00|||1|
964|ML|1|181.183.95||CCL|CCL|B||||DIR||3|1|1|340.20|630.00|||1|
965|ML|2|181.183.96||CCL|CCL|B||||DIR||3|1|1|476.28|882.00|||1|
966|ML|1|181.183.97||CCL|CCL|M||||DIR||3|1|1|340.20|630.00|||1|
967|ML|2|181.183.98||CCL|CCL|M||||DIR||3|1|1|476.28|882.00|||1|
968|ML|1|181.183.99||CME|CME|B||||DIR||3|1|1|340.20|630.00|||1|
969|ML|2|181.183.100||CME|CME|B||||DIR||3|1|1|476.28|882.00|||1|
970|ML|1|181.183.101||CME|CME|M||||DIR||3|1|1|340.20|630.00|||1|
971|ML|2|181.183.102||CME|CME|M||||DIR||3|1|1|476.28|882.00|||1|
972|ML|1|181.183.103||ANT|ANT|B||||DIR||3|1|1|340.20|630.00|||1|
973|ML|2|181.183.104||ANT|ANT|B||||DIR||3|1|1|476.28|882.00|||1|
974|ML|1|181.183.105||ANT|ANT|M||||DIR||3|1|1|340.20|630.00|||1|
975|ML|2|181.183.106||ANT|ANT|M||||DIR||3|1|1|476.28|882.00|||1|
976|ML|1|181.183.107||PTO|PTO|B||||DIR||3|1|1|340.20|630.00|||1|
977|ML|2|181.183.108||PTO|PTO|B||||DIR||3|1|1|476.28|882.00|||1|
978|ML|1|181.183.109||PTO|PTO|M||||DIR||3|1|1|340.20|630.00|||1|
979|ML|2|181.183.110||PTO|PTO|M||||DIR||3|1|1|476.28|882.00|||1|
980|ML|1|181.183.111||CRE|CRE|B||||DIR||3|1|1|340.20|630.00|||1|
981|ML|2|181.183.112||CRE|CRE|B||||DIR||3|1|1|476.28|882.00|||1|
982|ML|1|181.183.113||CRE|CRE|M||||DIR||3|1|1|340.20|630.00|||1|
983|ML|2|181.183.114||CRE|CRE|M||||DIR||3|1|1|476.28|882.00|||1|
984|ML|1|181.183.115||CAM|CAM|B||||DIR||3|1|1|340.20|630.00|||1|
985|ML|2|181.183.116||CAM|CAM|B||||DIR||3|1|1|476.28|882.00|||1|
986|ML|1|181.183.117||CAM|CAM|M||||DIR||3|1|1|340.20|630.00|||1|
987|ML|2|181.183.118||CAM|CAM|M||||DIR||3|1|1|476.28|882.00|||1|
988|ML|1|181.183.119||OUR|OUR|B||||DIR||3|1|1|340.20|630.00|||1|
989|ML|2|181.183.120||OUR|OUR|B||||DIR||3|1|1|476.28|882.00|||1|
990|ML|1|181.183.121||OUR|OUR|M||||DIR||3|1|1|340.20|630.00|||1|
991|ML|2|181.183.122||OUR|OUR|M||||DIR||3|1|1|476.28|882.00|||1|
992|ML|1|181.183.123||COB|COB|B||||DIR||3|1|1|340.20|630.00|||1|
993|ML|2|181.183.124||COB|COB|B||||DIR||3|1|1|476.28|882.00|||1|
994|ML|1|181.183.125||COB|COB|M||||DIR||3|1|1|340.20|630.00|||1|
995|ML|2|181.183.126||COB|COB|M||||DIR||3|1|1|476.28|882.00|||1|
996|ML|1|181.183.127||CHO|CHO|B||||DIR||3|1|1|340.20|630.00|||1|
997|ML|2|181.183.128||CHO|CHO|B||||DIR||3|1|1|476.28|882.00|||1|
998|ML|1|181.183.129||CHO|CHO|M||||DIR||3|1|1|340.20|630.00|||1|
999|ML|2|181.183.130||CHO|CHO|M||||DIR||3|1|1|476.28|882.00|||1|
1000|ML|1|181.183.131||VAG|VAG|B||||DIR||3|1|1|340.20|630.00|||1|
1001|ML|2|181.183.132||VAG|VAG|B||||DIR||3|1|1|476.28|882.00|||1|
1002|ML|1|181.183.133||VAG|VAG|M||||DIR||3|1|1|340.20|630.00|||1|
1003|ML|2|181.183.134||VAG|VAG|M||||DIR||3|1|1|476.28|882.00|||1|
1004|ML|1|181.183.135||AZE|AZE|B||||DIR||3|1|1|340.20|630.00|||1|
1005|ML|2|181.183.136||AZE|AZE|B||||DIR||3|1|1|476.28|882.00|||1|
1006|ML|1|181.183.137||AZE|AZE|M||||DIR||3|1|1|340.20|630.00|||1|
1007|ML|2|181.183.138||AZE|AZE|M||||DIR||3|1|1|476.28|882.00|||1|
1008|ML|1|181.183.139||AMA|AMA|B||||DIR||3|1|1|340.20|630.00|||1|
1009|ML|2|181.183.140||AMA|AMA|B||||DIR||3|1|1|476.28|882.00|||1|
1010|ML|1|181.183.141||AMA|AMA|M||||DIR||3|1|1|340.20|630.00|||1|
1011|ML|2|181.183.142||AMA|AMA|M||||DIR||3|1|1|476.28|882.00|||1|
1012|ML|1|181.183.143||AES|AES|B||||DIR||3|1|1|340.20|630.00|||1|
1013|ML|2|181.183.144||AES|AES|B||||DIR||3|1|1|476.28|882.00|||1|
1014|ML|1|181.183.145||AES|AES|M||||DIR||3|1|1|340.20|630.00|||1|
1015|ML|2|181.183.146||AES|AES|M||||DIR||3|1|1|476.28|882.00|||1|
1016|ML|1|181.183.147||PRA|PRA|B||||DIR||3|1|1|340.20|630.00|||1|
1017|ML|2|181.183.148||PRA|PRA|B||||DIR||3|1|1|476.28|882.00|||1|
1018|ML|1|181.183.149||PRA|PRA|M||||DIR||3|1|1|340.20|630.00|||1|
1019|ML|2|181.183.150||PRA|PRA|M||||DIR||3|1|1|476.28|882.00|||1|
1020|ML|1|181.183.151||ROS|ROS|B||||DIR||3|1|1|340.20|630.00|||1|
1021|ML|2|181.183.152||ROS|ROS|B||||DIR||3|1|1|476.28|882.00|||1|
1022|ML|1|181.183.153||ROS|ROS|M||||DIR||3|1|1|340.20|630.00|||1|
1023|ML|2|181.183.154||ROS|ROS|M||||DIR||3|1|1|476.28|882.00|||1|
1024|ML|1|181.183.155||VER|VER|B||||DIR||3|1|1|340.20|630.00|||1|
1025|ML|2|181.183.156||VER|VER|B||||DIR||3|1|1|476.28|882.00|||1|
1026|ML|1|181.183.157||VER|VER|M||||DIR||3|1|1|340.20|630.00|||1|
1027|ML|2|181.183.158||VER|VER|M||||DIR||3|1|1|476.28|882.00|||1|
1028|ML|1|181.183.159||OAK|OAK|||||DIR||3|1|1|340.20|630.00|||1|
1029|ML|2|181.183.160||OAK|OAK|||||DIR||3|1|1|476.28|882.00|||1|
1030|ML|1|181.183.161||TEA|TEA|||||DIR||3|1|1|340.20|630.00|||1|
1031|ML|2|181.183.162||TEA|TEA|||||DIR||3|1|1|476.28|882.00|||1|
1032|ML|1|181.183.163||JOP|JOP|||||DIR||3|1|1|340.20|630.00|||1|
1033|ML|2|181.183.164||JOP|JOP|||||DIR||3|1|1|476.28|882.00|||1|
1034|ML|1|181.183.165||AZB|AZB|||||DIR||3|1|1|340.20|630.00|||1|
1035|ML|2|181.183.166||AZB|AZB|||||DIR||3|1|1|476.28|882.00|||1|
1036|ML|1|181.183.167||DEN|DEN|||||DIR||3|1|1|340.20|630.00|||1|
1037|ML|2|181.183.168||DEN|DEN|||||DIR||3|1|1|476.28|882.00|||1|
1038|ML|1|181.183.169||BLK|BLK|||||DIR||3|1|1|340.20|630.00|||1|
1039|ML|2|181.183.170||BLK|BLK|||||DIR||3|1|1|476.28|882.00|||1|
1040|ML|1|181.183.171||ART|ART|||||DIR||3|1|1|340.20|630.00|||1|
1041|ML|2|181.183.172||ART|ART|||||DIR||3|1|1|476.28|882.00|||1|
1042|ML|1|181.183.173||LIN|LIN|||||DIR||3|1|1|340.20|630.00|||1|
1043|ML|2|181.183.174||LIN|LIN|||||DIR||3|1|1|476.28|882.00|||1|
1044|ML|1|181.183.175||HAL|HAL|||||DIR||3|1|1|340.20|630.00|||1|
1045|ML|2|181.183.176||HAL|HAL|||||DIR||3|1|1|476.28|882.00|||1|
1046|ML|3|184.185.3||WH|WH|||||DIR||1|1|1|178.20|330.00|||2|
1047|ML|4|184.185.4||WH|WH|||||DIR||1|1|1|307.80|570.00|||2|
1048|ML|3|184.185.5||WH|AZB|||||DIR||1|1|1|178.20|330.00|||2|
1049|ML|4|184.185.6||WH|AZB|||||DIR||1|1|1|307.80|570.00|||2|
1050|ML|3|184.185.9||WH|BCO|B||||DIR||1|1|1|205.20|380.00|||2|
1051|ML|4|184.185.10||WH|BCO|B||||DIR||1|1|1|334.80|620.00|||2|
1052|ML|3|184.185.11||WH|BCO|M||||DIR||1|1|1|205.20|380.00|||2|
1053|ML|4|184.185.12||WH|BCO|M||||DIR||1|1|1|334.80|620.00|||2|
1054|ML|3|184.185.13||WH|CCL|B||||DIR||1|1|1|205.20|380.00|||2|
1055|ML|4|184.185.14||WH|CCL|B||||DIR||1|1|1|334.80|620.00|||2|
1056|ML|3|184.185.15||WH|CCL|M||||DIR||1|1|1|205.20|380.00|||2|
1057|ML|4|184.185.16||WH|CCL|M||||DIR||1|1|1|334.80|620.00|||2|
1058|ML|3|184.185.17||WH|CME|B||||DIR||1|1|1|205.20|380.00|||2|
1059|ML|4|184.185.18||WH|CME|B||||DIR||1|1|1|334.80|620.00|||2|
1060|ML|3|184.185.19||WH|CME|M||||DIR||1|1|1|205.20|380.00|||2|
1061|ML|4|184.185.20||WH|CME|M||||DIR||1|1|1|334.80|620.00|||2|
1062|ML|3|184.185.21||WH|ANT|B||||DIR||1|1|1|205.20|380.00|||2|
1063|ML|4|184.185.22||WH|ANT|B||||DIR||1|1|1|334.80|620.00|||2|
1064|ML|3|184.185.23||WH|ANT|M||||DIR||1|1|1|205.20|380.00|||2|
1065|ML|4|184.185.24||WH|ANT|M||||DIR||1|1|1|334.80|620.00|||2|
1066|ML|3|184.185.25||WH|PTO|B||||DIR||1|1|1|205.20|380.00|||2|
1067|ML|4|184.185.26||WH|PTO|B||||DIR||1|1|1|334.80|620.00|||2|
1068|ML|3|184.185.27||WH|PTO|M||||DIR||1|1|1|205.20|380.00|||2|
1069|ML|4|184.185.28||WH|PTO|M||||DIR||1|1|1|334.80|620.00|||2|
1070|ML|3|184.185.29||WH|CRE|B||||DIR||1|1|1|205.20|380.00|||2|
1071|ML|4|184.185.30||WH|CRE|B||||DIR||1|1|1|334.80|620.00|||2|
1072|ML|3|184.185.31||WH|CRE|M||||DIR||1|1|1|205.20|380.00|||2|
1073|ML|4|184.185.32||WH|CRE|M||||DIR||1|1|1|334.80|620.00|||2|
1074|ML|3|184.185.33||WH|CAM|B||||DIR||1|1|1|205.20|380.00|||2|
1075|ML|4|184.185.34||WH|CAM|B||||DIR||1|1|1|334.80|620.00|||2|
1076|ML|3|184.185.35||WH|CAM|M||||DIR||1|1|1|205.20|380.00|||2|
1077|ML|4|184.185.36||WH|CAM|M||||DIR||1|1|1|334.80|620.00|||2|
1078|ML|3|184.185.37||WH|OUR|B||||DIR||1|1|1|205.20|380.00|||2|
1079|ML|4|184.185.38||WH|OUR|B||||DIR||1|1|1|334.80|620.00|||2|
1080|ML|3|184.185.39||WH|OUR|M||||DIR||1|1|1|205.20|380.00|||2|
1081|ML|4|184.185.40||WH|OUR|M||||DIR||1|1|1|334.80|620.00|||2|
1082|ML|3|184.185.41||WH|COB|B||||DIR||1|1|1|205.20|380.00|||2|
1083|ML|4|184.185.42||WH|COB|B||||DIR||1|1|1|334.80|620.00|||2|
1084|ML|3|184.185.43||WH|COB|M||||DIR||1|1|1|205.20|380.00|||2|
1085|ML|4|184.185.44||WH|COB|M||||DIR||1|1|1|334.80|620.00|||2|
1086|ML|3|184.185.45||WH|CHO|B||||DIR||1|1|1|205.20|380.00|||2|
1087|ML|4|184.185.46||WH|CHO|B||||DIR||1|1|1|334.80|620.00|||2|
1088|ML|3|184.185.47||WH|CHO|M||||DIR||1|1|1|205.20|380.00|||2|
1089|ML|4|184.185.48||WH|CHO|M||||DIR||1|1|1|334.80|620.00|||2|
1090|ML|3|184.185.49||WH|VAG|B||||DIR||1|1|1|205.20|380.00|||2|
1091|ML|4|184.185.50||WH|VAG|B||||DIR||1|1|1|334.80|620.00|||2|
1092|ML|3|184.185.51||WH|VAG|M||||DIR||1|1|1|205.20|380.00|||2|
1093|ML|4|184.185.52||WH|VAG|M||||DIR||1|1|1|334.80|620.00|||2|
1094|ML|3|184.185.53||WH|AZE|B||||DIR||1|1|1|205.20|380.00|||2|
1095|ML|4|184.185.54||WH|AZE|B||||DIR||1|1|1|334.80|620.00|||2|
1096|ML|3|184.185.55||WH|AZE|M||||DIR||1|1|1|205.20|380.00|||2|
1097|ML|4|184.185.56||WH|AZE|M||||DIR||1|1|1|334.80|620.00|||2|
1098|ML|3|184.185.57||WH|AMA|B||||DIR||1|1|1|205.20|380.00|||2|
1099|ML|4|184.185.58||WH|AMA|B||||DIR||1|1|1|334.80|620.00|||2|
1100|ML|3|184.185.59||WH|AMA|M||||DIR||1|1|1|205.20|380.00|||2|
1101|ML|4|184.185.60||WH|AMA|M||||DIR||1|1|1|334.80|620.00|||2|
1102|ML|3|184.185.61||WH|AES|B||||DIR||1|1|1|205.20|380.00|||2|
1103|ML|4|184.185.62||WH|AES|B||||DIR||1|1|1|334.80|620.00|||2|
1104|ML|3|184.185.63||WH|AES|M||||DIR||1|1|1|205.20|380.00|||2|
1105|ML|4|184.185.64||WH|AES|M||||DIR||1|1|1|334.80|620.00|||2|
1106|ML|3|184.185.65||WH|PRA|B||||DIR||1|1|1|205.20|380.00|||2|
1107|ML|4|184.185.66||WH|PRA|B||||DIR||1|1|1|334.80|620.00|||2|
1108|ML|3|184.185.67||WH|PRA|M||||DIR||1|1|1|205.20|380.00|||2|
1109|ML|4|184.185.68||WH|PRA|M||||DIR||1|1|1|334.80|620.00|||2|
1110|ML|3|184.185.69||WH|ROS|B||||DIR||1|1|1|205.20|380.00|||2|
1111|ML|4|184.185.70||WH|ROS|B||||DIR||1|1|1|334.80|620.00|||2|
1112|ML|3|184.185.71||WH|ROS|M||||DIR||1|1|1|205.20|380.00|||2|
1113|ML|4|184.185.72||WH|ROS|M||||DIR||1|1|1|334.80|620.00|||2|
1114|ML|3|184.185.73||WH|VER|B||||DIR||1|1|1|205.20|380.00|||2|
1115|ML|4|184.185.74||WH|VER|B||||DIR||1|1|1|334.80|620.00|||2|
1116|ML|3|184.185.75||WH|VER|M||||DIR||1|1|1|205.20|380.00|||2|
1117|ML|4|184.185.76||WH|VER|M||||DIR||1|1|1|334.80|620.00|||2|
1118|ML|3|184.185.77||WH|OAK|||||DIR||1|1|1|205.20|380.00|||2|
1119|ML|4|184.185.78||WH|OAK|||||DIR||1|1|1|334.80|620.00|||2|
1120|ML|3|184.185.79||WH|TEA|||||DIR||1|1|1|205.20|380.00|||2|
1121|ML|4|184.185.80||WH|TEA|||||DIR||1|1|1|334.80|620.00|||2|
1122|ML|3|184.185.81||WH|JOP|||||DIR||1|1|1|205.20|380.00|||2|
1123|ML|4|184.185.82||WH|JOP|||||DIR||1|1|1|334.80|620.00|||2|
1124|ML|3|184.185.186||WH|DEN|||||DIR||1|1|1|205.20|380.00|||2|
1125|ML|4|184.185.187||WH|DEN|||||DIR||1|1|1|334.80|620.00|||2|
1126|ML|3|184.185.83||WH|BLK|||||DIR||1|1|1|205.20|380.00|||2|
1127|ML|4|184.185.84||WH|BLK|||||DIR||1|1|1|334.80|620.00|||2|
1128|ML|3|184.185.85||WH|ART|||||DIR||1|1|1|205.20|380.00|||2|
1129|ML|4|184.185.86||WH|ART|||||DIR||1|1|1|334.80|620.00|||2|
1130|ML|3|184.185.87||WH|LIN|||||DIR||1|1|1|205.20|380.00|||2|
1131|ML|4|184.185.88||WH|LIN|||||DIR||1|1|1|334.80|620.00|||2|
1132|ML|3|184.185.89||WH|HAL|||||DIR||1|1|1|205.20|380.00|||2|
1133|ML|4|184.185.90||WH|HAL|||||DIR||1|1|1|334.80|620.00|||2|
1134|ML|3|184.185.91||BCO|BCO|B||||DIR||1|1|1|226.80|420.00|||2|
1135|ML|4|184.185.92||BCO|BCO|B||||DIR||1|1|1|356.40|660.00|||2|
1136|ML|3|184.185.93||BCO|BCO|M||||DIR||1|1|1|226.80|420.00|||2|
1137|ML|4|184.185.94||BCO|BCO|M||||DIR||1|1|1|356.40|660.00|||2|
1138|ML|3|184.185.95||CCL|CCL|B||||DIR||1|1|1|226.80|420.00|||2|
1139|ML|4|184.185.96||CCL|CCL|B||||DIR||1|1|1|356.40|660.00|||2|
1140|ML|3|184.185.97||CCL|CCL|M||||DIR||1|1|1|226.80|420.00|||2|
1141|ML|4|184.185.98||CCL|CCL|M||||DIR||1|1|1|356.40|660.00|||2|
1142|ML|3|184.185.99||CME|CME|B||||DIR||1|1|1|226.80|420.00|||2|
1143|ML|4|184.185.100||CME|CME|B||||DIR||1|1|1|356.40|660.00|||2|
1144|ML|3|184.185.101||CME|CME|M||||DIR||1|1|1|226.80|420.00|||2|
1145|ML|4|184.185.102||CME|CME|M||||DIR||1|1|1|356.40|660.00|||2|
1146|ML|3|184.185.103||ANT|ANT|B||||DIR||1|1|1|226.80|420.00|||2|
1147|ML|4|184.185.104||ANT|ANT|B||||DIR||1|1|1|356.40|660.00|||2|
1148|ML|3|184.185.105||ANT|ANT|M||||DIR||1|1|1|226.80|420.00|||2|
1149|ML|4|184.185.106||ANT|ANT|M||||DIR||1|1|1|356.40|660.00|||2|
1150|ML|3|184.185.107||PTO|PTO|B||||DIR||1|1|1|226.80|420.00|||2|
1151|ML|4|184.185.108||PTO|PTO|B||||DIR||1|1|1|356.40|660.00|||2|
1152|ML|3|184.185.109||PTO|PTO|M||||DIR||1|1|1|226.80|420.00|||2|
1153|ML|4|184.185.110||PTO|PTO|M||||DIR||1|1|1|356.40|660.00|||2|
1154|ML|3|184.185.111||CRE|CRE|B||||DIR||1|1|1|226.80|420.00|||2|
1155|ML|4|184.185.112||CRE|CRE|B||||DIR||1|1|1|356.40|660.00|||2|
1156|ML|3|184.185.113||CRE|CRE|M||||DIR||1|1|1|226.80|420.00|||2|
1157|ML|4|184.185.114||CRE|CRE|M||||DIR||1|1|1|356.40|660.00|||2|
1158|ML|3|184.185.115||CAM|CAM|B||||DIR||1|1|1|226.80|420.00|||2|
1159|ML|4|184.185.116||CAM|CAM|B||||DIR||1|1|1|356.40|660.00|||2|
1160|ML|3|184.185.117||CAM|CAM|M||||DIR||1|1|1|226.80|420.00|||2|
1161|ML|4|184.185.118||CAM|CAM|M||||DIR||1|1|1|356.40|660.00|||2|
1162|ML|3|184.185.119||OUR|OUR|B||||DIR||1|1|1|226.80|420.00|||2|
1163|ML|4|184.185.120||OUR|OUR|B||||DIR||1|1|1|356.40|660.00|||2|
1164|ML|3|184.185.121||OUR|OUR|M||||DIR||1|1|1|226.80|420.00|||2|
1165|ML|4|184.185.122||OUR|OUR|M||||DIR||1|1|1|356.40|660.00|||2|
1166|ML|3|184.185.123||COB|COB|B||||DIR||1|1|1|226.80|420.00|||2|
1167|ML|4|184.185.124||COB|COB|B||||DIR||1|1|1|356.40|660.00|||2|
1168|ML|3|184.185.125||COB|COB|M||||DIR||1|1|1|226.80|420.00|||2|
1169|ML|4|184.185.126||COB|COB|M||||DIR||1|1|1|356.40|660.00|||2|
1170|ML|3|184.185.127||CHO|CHO|B||||DIR||1|1|1|226.80|420.00|||2|
1171|ML|4|184.185.128||CHO|CHO|B||||DIR||1|1|1|356.40|660.00|||2|
1172|ML|3|184.185.129||CHO|CHO|M||||DIR||1|1|1|226.80|420.00|||2|
1173|ML|4|184.185.130||CHO|CHO|M||||DIR||1|1|1|356.40|660.00|||2|
1174|ML|3|184.185.131||VAG|VAG|B||||DIR||1|1|1|226.80|420.00|||2|
1175|ML|4|184.185.132||VAG|VAG|B||||DIR||1|1|1|356.40|660.00|||2|
1176|ML|3|184.185.133||VAG|VAG|M||||DIR||1|1|1|226.80|420.00|||2|
1177|ML|4|184.185.134||VAG|VAG|M||||DIR||1|1|1|356.40|660.00|||2|
1178|ML|3|184.185.135||AZE|AZE|B||||DIR||1|1|1|226.80|420.00|||2|
1179|ML|4|184.185.136||AZE|AZE|B||||DIR||1|1|1|356.40|660.00|||2|
1180|ML|3|184.185.137||AZE|AZE|M||||DIR||1|1|1|226.80|420.00|||2|
1181|ML|4|184.185.138||AZE|AZE|M||||DIR||1|1|1|356.40|660.00|||2|
1182|ML|3|184.185.139||AMA|AMA|B||||DIR||1|1|1|226.80|420.00|||2|
1183|ML|4|184.185.140||AMA|AMA|B||||DIR||1|1|1|356.40|660.00|||2|
1184|ML|3|184.185.141||AMA|AMA|M||||DIR||1|1|1|226.80|420.00|||2|
1185|ML|4|184.185.142||AMA|AMA|M||||DIR||1|1|1|356.40|660.00|||2|
1186|ML|3|184.185.143||AES|AES|B||||DIR||1|1|1|226.80|420.00|||2|
1187|ML|4|184.185.144||AES|AES|B||||DIR||1|1|1|356.40|660.00|||2|
1188|ML|3|184.185.145||AES|AES|M||||DIR||1|1|1|226.80|420.00|||2|
1189|ML|4|184.185.146||AES|AES|M||||DIR||1|1|1|356.40|660.00|||2|
1190|ML|3|184.185.147||PRA|PRA|B||||DIR||1|1|1|226.80|420.00|||2|
1191|ML|4|184.185.148||PRA|PRA|B||||DIR||1|1|1|356.40|660.00|||2|
1192|ML|3|184.185.149||PRA|PRA|M||||DIR||1|1|1|226.80|420.00|||2|
1193|ML|4|184.185.150||PRA|PRA|M||||DIR||1|1|1|356.40|660.00|||2|
1194|ML|3|184.185.151||ROS|ROS|B||||DIR||1|1|1|226.80|420.00|||2|
1195|ML|4|184.185.152||ROS|ROS|B||||DIR||1|1|1|356.40|660.00|||2|
1196|ML|3|184.185.153||ROS|ROS|M||||DIR||1|1|1|226.80|420.00|||2|
1197|ML|4|184.185.154||ROS|ROS|M||||DIR||1|1|1|356.40|660.00|||2|
1198|ML|3|184.185.155||VER|VER|B||||DIR||1|1|1|226.80|420.00|||2|
1199|ML|4|184.185.156||VER|VER|B||||DIR||1|1|1|356.40|660.00|||2|
1200|ML|3|184.185.157||VER|VER|M||||DIR||1|1|1|226.80|420.00|||2|
1201|ML|4|184.185.158||VER|VER|M||||DIR||1|1|1|356.40|660.00|||2|
1202|ML|3|184.185.159||OAK|OAK|||||DIR||1|1|1|226.80|420.00|||2|
1203|ML|4|184.185.160||OAK|OAK|||||DIR||1|1|1|356.40|660.00|||2|
1204|ML|3|184.185.161||TEA|TEA|||||DIR||1|1|1|226.80|420.00|||2|
1205|ML|4|184.185.162||TEA|TEA|||||DIR||1|1|1|356.40|660.00|||2|
1206|ML|3|184.185.163||JOP|JOP|||||DIR||1|1|1|226.80|420.00|||2|
1207|ML|4|184.185.164||JOP|JOP|||||DIR||1|1|1|356.40|660.00|||2|
1208|ML|3|184.185.165||AZB|AZB|||||DIR||1|1|1|226.80|420.00|||2|
1209|ML|4|184.185.166||AZB|AZB|||||DIR||1|1|1|356.40|660.00|||2|
1210|ML|3|184.185.167||DEN|DEN|||||DIR||1|1|1|226.80|420.00|||2|
1211|ML|4|184.185.168||DEN|DEN|||||DIR||1|1|1|356.40|660.00|||2|
1212|ML|3|184.185.169||BLK|BLK|||||DIR||1|1|1|226.80|420.00|||2|
1213|ML|4|184.185.170||BLK|BLK|||||DIR||1|1|1|356.40|660.00|||2|
1214|ML|3|184.185.171||ART|ART|||||DIR||1|1|1|226.80|420.00|||2|
1215|ML|4|184.185.172||ART|ART|||||DIR||1|1|1|356.40|660.00|||2|
1216|ML|3|184.185.173||LIN|LIN|||||DIR||1|1|1|226.80|420.00|||2|
1217|ML|4|184.185.174||LIN|LIN|||||DIR||1|1|1|356.40|660.00|||2|
1218|ML|3|184.185.175||HAL|HAL|||||DIR||1|1|1|226.80|420.00|||2|
1219|ML|4|184.185.176||HAL|HAL|||||DIR||1|1|1|356.40|660.00|||2|
1220|ML|3|184.188.3||WH|WH|||||ESQ||1|1|1|213.84|396.00|||2|
1221|ML|4|184.188.4||WH|WH|||||ESQ||1|1|1|369.36|684.00|||2|
1222|ML|3|184.188.5||WH|AZB|||||ESQ||1|1|1|213.84|396.00|||2|
1223|ML|4|184.188.6||WH|AZB|||||ESQ||1|1|1|369.36|684.00|||2|
1224|ML|3|184.188.9||WH|BCO|B||||ESQ||1|1|1|240.84|446.00|||2|
1225|ML|4|184.188.10||WH|BCO|B||||ESQ||1|1|1|396.36|734.00|||2|
1226|ML|3|184.188.11||WH|BCO|M||||ESQ||1|1|1|240.84|446.00|||2|
1227|ML|4|184.188.12||WH|BCO|M||||ESQ||1|1|1|396.36|734.00|||2|
1228|ML|3|184.188.13||WH|CCL|B||||ESQ||1|1|1|240.84|446.00|||2|
1229|ML|4|184.188.14||WH|CCL|B||||ESQ||1|1|1|396.36|734.00|||2|
1230|ML|3|184.188.15||WH|CCL|M||||ESQ||1|1|1|240.84|446.00|||2|
1231|ML|4|184.188.16||WH|CCL|M||||ESQ||1|1|1|396.36|734.00|||2|
1232|ML|3|184.188.17||WH|CME|B||||ESQ||1|1|1|240.84|446.00|||2|
1233|ML|4|184.188.18||WH|CME|B||||ESQ||1|1|1|396.36|734.00|||2|
1234|ML|3|184.188.19||WH|CME|M||||ESQ||1|1|1|240.84|446.00|||2|
1235|ML|4|184.188.20||WH|CME|M||||ESQ||1|1|1|396.36|734.00|||2|
1236|ML|3|184.188.21||WH|ANT|B||||ESQ||1|1|1|240.84|446.00|||2|
1237|ML|4|184.188.22||WH|ANT|B||||ESQ||1|1|1|396.36|734.00|||2|
1238|ML|3|184.188.23||WH|ANT|M||||ESQ||1|1|1|240.84|446.00|||2|
1239|ML|4|184.188.24||WH|ANT|M||||ESQ||1|1|1|396.36|734.00|||2|
1240|ML|3|184.188.25||WH|PTO|B||||ESQ||1|1|1|240.84|446.00|||2|
1241|ML|4|184.188.26||WH|PTO|B||||ESQ||1|1|1|396.36|734.00|||2|
1242|ML|3|184.188.27||WH|PTO|M||||ESQ||1|1|1|240.84|446.00|||2|
1243|ML|4|184.188.28||WH|PTO|M||||ESQ||1|1|1|396.36|734.00|||2|
1244|ML|3|184.188.29||WH|CRE|B||||ESQ||1|1|1|240.84|446.00|||2|
1245|ML|4|184.188.30||WH|CRE|B||||ESQ||1|1|1|396.36|734.00|||2|
1246|ML|3|184.188.31||WH|CRE|M||||ESQ||1|1|1|240.84|446.00|||2|
1247|ML|4|184.188.32||WH|CRE|M||||ESQ||1|1|1|396.36|734.00|||2|
1248|ML|3|184.188.33||WH|CAM|B||||ESQ||1|1|1|240.84|446.00|||2|
1249|ML|4|184.188.34||WH|CAM|B||||ESQ||1|1|1|396.36|734.00|||2|
1250|ML|3|184.188.35||WH|CAM|M||||ESQ||1|1|1|240.84|446.00|||2|
1251|ML|4|184.188.36||WH|CAM|M||||ESQ||1|1|1|396.36|734.00|||2|
1252|ML|3|184.188.37||WH|OUR|B||||ESQ||1|1|1|240.84|446.00|||2|
1253|ML|4|184.188.38||WH|OUR|B||||ESQ||1|1|1|396.36|734.00|||2|
1254|ML|3|184.188.39||WH|OUR|M||||ESQ||1|1|1|240.84|446.00|||2|
1255|ML|4|184.188.40||WH|OUR|M||||ESQ||1|1|1|396.36|734.00|||2|
1256|ML|3|184.188.41||WH|COB|B||||ESQ||1|1|1|240.84|446.00|||2|
1257|ML|4|184.188.42||WH|COB|B||||ESQ||1|1|1|396.36|734.00|||2|
1258|ML|3|184.188.43||WH|COB|M||||ESQ||1|1|1|240.84|446.00|||2|
1259|ML|4|184.188.44||WH|COB|M||||ESQ||1|1|1|396.36|734.00|||2|
1260|ML|3|184.188.45||WH|CHO|B||||ESQ||1|1|1|240.84|446.00|||2|
1261|ML|4|184.188.46||WH|CHO|B||||ESQ||1|1|1|396.36|734.00|||2|
1262|ML|3|184.188.47||WH|CHO|M||||ESQ||1|1|1|240.84|446.00|||2|
1263|ML|4|184.188.48||WH|CHO|M||||ESQ||1|1|1|396.36|734.00|||2|
1264|ML|3|184.188.49||WH|VAG|B||||ESQ||1|1|1|240.84|446.00|||2|
1265|ML|4|184.188.50||WH|VAG|B||||ESQ||1|1|1|396.36|734.00|||2|
1266|ML|3|184.188.51||WH|VAG|M||||ESQ||1|1|1|240.84|446.00|||2|
1267|ML|4|184.188.52||WH|VAG|M||||ESQ||1|1|1|396.36|734.00|||2|
1268|ML|3|184.188.53||WH|AZE|B||||ESQ||1|1|1|240.84|446.00|||2|
1269|ML|4|184.188.54||WH|AZE|B||||ESQ||1|1|1|396.36|734.00|||2|
1270|ML|3|184.188.55||WH|AZE|M||||ESQ||1|1|1|240.84|446.00|||2|
1271|ML|4|184.188.56||WH|AZE|M||||ESQ||1|1|1|396.36|734.00|||2|
1272|ML|3|184.188.57||WH|AMA|B||||ESQ||1|1|1|240.84|446.00|||2|
1273|ML|4|184.188.58||WH|AMA|B||||ESQ||1|1|1|396.36|734.00|||2|
1274|ML|3|184.188.59||WH|AMA|M||||ESQ||1|1|1|240.84|446.00|||2|
1275|ML|4|184.188.60||WH|AMA|M||||ESQ||1|1|1|396.36|734.00|||2|
1276|ML|3|184.188.61||WH|AES|B||||ESQ||1|1|1|240.84|446.00|||2|
1277|ML|4|184.188.62||WH|AES|B||||ESQ||1|1|1|396.36|734.00|||2|
1278|ML|3|184.188.63||WH|AES|M||||ESQ||1|1|1|240.84|446.00|||2|
1279|ML|4|184.188.64||WH|AES|M||||ESQ||1|1|1|396.36|734.00|||2|
1280|ML|3|184.188.65||WH|PRA|B||||ESQ||1|1|1|240.84|446.00|||2|
1281|ML|4|184.188.66||WH|PRA|B||||ESQ||1|1|1|396.36|734.00|||2|
1282|ML|3|184.188.67||WH|PRA|M||||ESQ||1|1|1|240.84|446.00|||2|
1283|ML|4|184.188.68||WH|PRA|M||||ESQ||1|1|1|396.36|734.00|||2|
1284|ML|3|184.188.69||WH|ROS|B||||ESQ||1|1|1|240.84|446.00|||2|
1285|ML|4|184.188.70||WH|ROS|B||||ESQ||1|1|1|396.36|734.00|||2|
1286|ML|3|184.188.71||WH|ROS|M||||ESQ||1|1|1|240.84|446.00|||2|
1287|ML|4|184.188.72||WH|ROS|M||||ESQ||1|1|1|396.36|734.00|||2|
1288|ML|3|184.188.73||WH|VER|B||||ESQ||1|1|1|240.84|446.00|||2|
1289|ML|4|184.188.74||WH|VER|B||||ESQ||1|1|1|396.36|734.00|||2|
1290|ML|3|184.188.75||WH|VER|M||||ESQ||1|1|1|240.84|446.00|||2|
1291|ML|4|184.188.76||WH|VER|M||||ESQ||1|1|1|396.36|734.00|||2|
1292|ML|3|184.188.77||WH|OAK|||||ESQ||1|1|1|240.84|446.00|||2|
1293|ML|4|184.188.78||WH|OAK|||||ESQ||1|1|1|396.36|734.00|||2|
1294|ML|3|184.188.79||WH|TEA|||||ESQ||1|1|1|240.84|446.00|||2|
1295|ML|4|184.188.80||WH|TEA|||||ESQ||1|1|1|396.36|734.00|||2|
1296|ML|3|184.188.81||WH|JOP|||||ESQ||1|1|1|240.84|446.00|||2|
1297|ML|4|184.188.82||WH|JOP|||||ESQ||1|1|1|396.36|734.00|||2|
1298|ML|3|184.188.186||WH|DEN|||||ESQ||1|1|1|240.84|446.00|||2|
1299|ML|4|184.188.187||WH|DEN|||||ESQ||1|1|1|396.36|734.00|||2|
1300|ML|3|184.188.83||WH|BLK|||||ESQ||1|1|1|240.84|446.00|||2|
1301|ML|4|184.188.84||WH|BLK|||||ESQ||1|1|1|396.36|734.00|||2|
1302|ML|3|184.188.85||WH|ART|||||ESQ||1|1|1|240.84|446.00|||2|
1303|ML|4|184.188.86||WH|ART|||||ESQ||1|1|1|396.36|734.00|||2|
1304|ML|3|184.188.87||WH|LIN|||||ESQ||1|1|1|240.84|446.00|||2|
1305|ML|4|184.188.88||WH|LIN|||||ESQ||1|1|1|396.36|734.00|||2|
1306|ML|3|184.188.89||WH|HAL|||||ESQ||1|1|1|240.84|446.00|||2|
1307|ML|4|184.188.90||WH|HAL|||||ESQ||1|1|1|396.36|734.00|||2|
1308|ML|3|184.188.91||BCO|BCO|B||||ESQ||1|1|1|262.44|486.00|||2|
1309|ML|4|184.188.92||BCO|BCO|B||||ESQ||1|1|1|417.96|774.00|||2|
1310|ML|3|184.188.93||BCO|BCO|M||||ESQ||1|1|1|262.44|486.00|||2|
1311|ML|4|184.188.94||BCO|BCO|M||||ESQ||1|1|1|417.96|774.00|||2|
1312|ML|3|184.188.95||CCL|CCL|B||||ESQ||1|1|1|262.44|486.00|||2|
1313|ML|4|184.188.96||CCL|CCL|B||||ESQ||1|1|1|417.96|774.00|||2|
1314|ML|3|184.188.97||CCL|CCL|M||||ESQ||1|1|1|262.44|486.00|||2|
1315|ML|4|184.188.98||CCL|CCL|M||||ESQ||1|1|1|417.96|774.00|||2|
1316|ML|3|184.188.99||CME|CME|B||||ESQ||1|1|1|262.44|486.00|||2|
1317|ML|4|184.188.100||CME|CME|B||||ESQ||1|1|1|417.96|774.00|||2|
1318|ML|3|184.188.101||CME|CME|M||||ESQ||1|1|1|262.44|486.00|||2|
1319|ML|4|184.188.102||CME|CME|M||||ESQ||1|1|1|417.96|774.00|||2|
1320|ML|3|184.188.103||ANT|ANT|B||||ESQ||1|1|1|262.44|486.00|||2|
1321|ML|4|184.188.104||ANT|ANT|B||||ESQ||1|1|1|417.96|774.00|||2|
1322|ML|3|184.188.105||ANT|ANT|M||||ESQ||1|1|1|262.44|486.00|||2|
1323|ML|4|184.188.106||ANT|ANT|M||||ESQ||1|1|1|417.96|774.00|||2|
1324|ML|3|184.188.107||PTO|PTO|B||||ESQ||1|1|1|262.44|486.00|||2|
1325|ML|4|184.188.108||PTO|PTO|B||||ESQ||1|1|1|417.96|774.00|||2|
1326|ML|3|184.188.109||PTO|PTO|M||||ESQ||1|1|1|262.44|486.00|||2|
1327|ML|4|184.188.110||PTO|PTO|M||||ESQ||1|1|1|417.96|774.00|||2|
1328|ML|3|184.188.111||CRE|CRE|B||||ESQ||1|1|1|262.44|486.00|||2|
1329|ML|4|184.188.112||CRE|CRE|B||||ESQ||1|1|1|417.96|774.00|||2|
1330|ML|3|184.188.113||CRE|CRE|M||||ESQ||1|1|1|262.44|486.00|||2|
1331|ML|4|184.188.114||CRE|CRE|M||||ESQ||1|1|1|417.96|774.00|||2|
1332|ML|3|184.188.115||CAM|CAM|B||||ESQ||1|1|1|262.44|486.00|||2|
1333|ML|4|184.188.116||CAM|CAM|B||||ESQ||1|1|1|417.96|774.00|||2|
1334|ML|3|184.188.117||CAM|CAM|M||||ESQ||1|1|1|262.44|486.00|||2|
1335|ML|4|184.188.118||CAM|CAM|M||||ESQ||1|1|1|417.96|774.00|||2|
1336|ML|3|184.188.119||OUR|OUR|B||||ESQ||1|1|1|262.44|486.00|||2|
1337|ML|4|184.188.120||OUR|OUR|B||||ESQ||1|1|1|417.96|774.00|||2|
1338|ML|3|184.188.121||OUR|OUR|M||||ESQ||1|1|1|262.44|486.00|||2|
1339|ML|4|184.188.122||OUR|OUR|M||||ESQ||1|1|1|417.96|774.00|||2|
1340|ML|3|184.188.123||COB|COB|B||||ESQ||1|1|1|262.44|486.00|||2|
1341|ML|4|184.188.124||COB|COB|B||||ESQ||1|1|1|417.96|774.00|||2|
1342|ML|3|184.188.125||COB|COB|M||||ESQ||1|1|1|262.44|486.00|||2|
1343|ML|4|184.188.126||COB|COB|M||||ESQ||1|1|1|417.96|774.00|||2|
1344|ML|3|184.188.127||CHO|CHO|B||||ESQ||1|1|1|262.44|486.00|||2|
1345|ML|4|184.188.128||CHO|CHO|B||||ESQ||1|1|1|417.96|774.00|||2|
1346|ML|3|184.188.129||CHO|CHO|M||||ESQ||1|1|1|262.44|486.00|||2|
1347|ML|4|184.188.130||CHO|CHO|M||||ESQ||1|1|1|417.96|774.00|||2|
1348|ML|3|184.188.131||VAG|VAG|B||||ESQ||1|1|1|262.44|486.00|||2|
1349|ML|4|184.188.132||VAG|VAG|B||||ESQ||1|1|1|417.96|774.00|||2|
1350|ML|3|184.188.133||VAG|VAG|M||||ESQ||1|1|1|262.44|486.00|||2|
1351|ML|4|184.188.134||VAG|VAG|M||||ESQ||1|1|1|417.96|774.00|||2|
1352|ML|3|184.188.135||AZE|AZE|B||||ESQ||1|1|1|262.44|486.00|||2|
1353|ML|4|184.188.136||AZE|AZE|B||||ESQ||1|1|1|417.96|774.00|||2|
1354|ML|3|184.188.137||AZE|AZE|M||||ESQ||1|1|1|262.44|486.00|||2|
1355|ML|4|184.188.138||AZE|AZE|M||||ESQ||1|1|1|417.96|774.00|||2|
1356|ML|3|184.188.139||AMA|AMA|B||||ESQ||1|1|1|262.44|486.00|||2|
1357|ML|4|184.188.140||AMA|AMA|B||||ESQ||1|1|1|417.96|774.00|||2|
1358|ML|3|184.188.141||AMA|AMA|M||||ESQ||1|1|1|262.44|486.00|||2|
1359|ML|4|184.188.142||AMA|AMA|M||||ESQ||1|1|1|417.96|774.00|||2|
1360|ML|3|184.188.143||AES|AES|B||||ESQ||1|1|1|262.44|486.00|||2|
1361|ML|4|184.188.144||AES|AES|B||||ESQ||1|1|1|417.96|774.00|||2|
1362|ML|3|184.188.145||AES|AES|M||||ESQ||1|1|1|262.44|486.00|||2|
1363|ML|4|184.188.146||AES|AES|M||||ESQ||1|1|1|417.96|774.00|||2|
1364|ML|3|184.188.147||PRA|PRA|B||||ESQ||1|1|1|262.44|486.00|||2|
1365|ML|4|184.188.148||PRA|PRA|B||||ESQ||1|1|1|417.96|774.00|||2|
1366|ML|3|184.188.149||PRA|PRA|M||||ESQ||1|1|1|262.44|486.00|||2|
1367|ML|4|184.188.150||PRA|PRA|M||||ESQ||1|1|1|417.96|774.00|||2|
1368|ML|3|184.188.151||ROS|ROS|B||||ESQ||1|1|1|262.44|486.00|||2|
1369|ML|4|184.188.152||ROS|ROS|B||||ESQ||1|1|1|417.96|774.00|||2|
1370|ML|3|184.188.153||ROS|ROS|M||||ESQ||1|1|1|262.44|486.00|||2|
1371|ML|4|184.188.154||ROS|ROS|M||||ESQ||1|1|1|417.96|774.00|||2|
1372|ML|3|184.188.155||VER|VER|B||||ESQ||1|1|1|262.44|486.00|||2|
1373|ML|4|184.188.156||VER|VER|B||||ESQ||1|1|1|417.96|774.00|||2|
1374|ML|3|184.188.157||VER|VER|M||||ESQ||1|1|1|262.44|486.00|||2|
1375|ML|4|184.188.158||VER|VER|M||||ESQ||1|1|1|417.96|774.00|||2|
1376|ML|3|184.188.159||OAK|OAK|||||ESQ||1|1|1|262.44|486.00|||2|
1377|ML|4|184.188.160||OAK|OAK|||||ESQ||1|1|1|417.96|774.00|||2|
1378|ML|3|184.188.161||TEA|TEA|||||ESQ||1|1|1|262.44|486.00|||2|
1379|ML|4|184.188.162||TEA|TEA|||||ESQ||1|1|1|417.96|774.00|||2|
1380|ML|3|184.188.163||JOP|JOP|||||ESQ||1|1|1|262.44|486.00|||2|
1381|ML|4|184.188.164||JOP|JOP|||||ESQ||1|1|1|417.96|774.00|||2|
1382|ML|3|184.188.165||AZB|AZB|||||ESQ||1|1|1|262.44|486.00|||2|
1383|ML|4|184.188.166||AZB|AZB|||||ESQ||1|1|1|417.96|774.00|||2|
1384|ML|3|184.188.167||DEN|DEN|||||ESQ||1|1|1|262.44|486.00|||2|
1385|ML|4|184.188.168||DEN|DEN|||||ESQ||1|1|1|417.96|774.00|||2|
1386|ML|3|184.188.169||BLK|BLK|||||ESQ||1|1|1|262.44|486.00|||2|
1387|ML|4|184.188.170||BLK|BLK|||||ESQ||1|1|1|417.96|774.00|||2|
1388|ML|3|184.188.171||ART|ART|||||ESQ||1|1|1|262.44|486.00|||2|
1389|ML|4|184.188.172||ART|ART|||||ESQ||1|1|1|417.96|774.00|||2|
1390|ML|3|184.188.173||LIN|LIN|||||ESQ||1|1|1|262.44|486.00|||2|
1391|ML|4|184.188.174||LIN|LIN|||||ESQ||1|1|1|417.96|774.00|||2|
1392|ML|3|184.188.175||HAL|HAL|||||ESQ||1|1|1|262.44|486.00|||2|
1393|ML|4|184.188.176||HAL|HAL|||||ESQ||1|1|1|417.96|774.00|||2|
1394|ML|3|189.190.3||WH|WH|||||DIR||2|1|1|216.00|400.00|||2|
1395|ML|4|189.190.4||WH|WH|||||DIR||2|1|1|332.10|615.00|||2|
1396|ML|3|189.190.5||WH|AZB|||||DIR||2|1|1|216.00|400.00|||2|
1397|ML|4|189.190.6||WH|AZB|||||DIR||2|1|1|332.10|615.00|||2|
1398|ML|3|189.190.9||WH|BCO|B||||DIR||2|1|1|243.00|450.00|||2|
1399|ML|4|189.190.10||WH|BCO|B||||DIR||2|1|1|359.10|665.00|||2|
1400|ML|3|189.190.11||WH|BCO|M||||DIR||2|1|1|243.00|450.00|||2|
1401|ML|4|189.190.12||WH|BCO|M||||DIR||2|1|1|359.10|665.00|||2|
1402|ML|3|189.190.13||WH|CCL|B||||DIR||2|1|1|243.00|450.00|||2|
1403|ML|4|189.190.14||WH|CCL|B||||DIR||2|1|1|359.10|665.00|||2|
1404|ML|3|189.190.15||WH|CCL|M||||DIR||2|1|1|243.00|450.00|||2|
1405|ML|4|189.190.16||WH|CCL|M||||DIR||2|1|1|359.10|665.00|||2|
1406|ML|3|189.190.17||WH|CME|B||||DIR||2|1|1|243.00|450.00|||2|
1407|ML|4|189.190.18||WH|CME|B||||DIR||2|1|1|359.10|665.00|||2|
1408|ML|3|189.190.19||WH|CME|M||||DIR||2|1|1|243.00|450.00|||2|
1409|ML|4|189.190.20||WH|CME|M||||DIR||2|1|1|359.10|665.00|||2|
1410|ML|3|189.190.21||WH|ANT|B||||DIR||2|1|1|243.00|450.00|||2|
1411|ML|4|189.190.22||WH|ANT|B||||DIR||2|1|1|359.10|665.00|||2|
1412|ML|3|189.190.23||WH|ANT|M||||DIR||2|1|1|243.00|450.00|||2|
1413|ML|4|189.190.24||WH|ANT|M||||DIR||2|1|1|359.10|665.00|||2|
1414|ML|3|189.190.25||WH|PTO|B||||DIR||2|1|1|243.00|450.00|||2|
1415|ML|4|189.190.26||WH|PTO|B||||DIR||2|1|1|359.10|665.00|||2|
1416|ML|3|189.190.27||WH|PTO|M||||DIR||2|1|1|243.00|450.00|||2|
1417|ML|4|189.190.28||WH|PTO|M||||DIR||2|1|1|359.10|665.00|||2|
1418|ML|3|189.190.29||WH|CRE|B||||DIR||2|1|1|243.00|450.00|||2|
1419|ML|4|189.190.30||WH|CRE|B||||DIR||2|1|1|359.10|665.00|||2|
1420|ML|3|189.190.31||WH|CRE|M||||DIR||2|1|1|243.00|450.00|||2|
1421|ML|4|189.190.32||WH|CRE|M||||DIR||2|1|1|359.10|665.00|||2|
1422|ML|3|189.190.33||WH|CAM|B||||DIR||2|1|1|243.00|450.00|||2|
1423|ML|4|189.190.34||WH|CAM|B||||DIR||2|1|1|359.10|665.00|||2|
1424|ML|3|189.190.35||WH|CAM|M||||DIR||2|1|1|243.00|450.00|||2|
1425|ML|4|189.190.36||WH|CAM|M||||DIR||2|1|1|359.10|665.00|||2|
1426|ML|3|189.190.37||WH|OUR|B||||DIR||2|1|1|243.00|450.00|||2|
1427|ML|4|189.190.38||WH|OUR|B||||DIR||2|1|1|359.10|665.00|||2|
1428|ML|3|189.190.39||WH|OUR|M||||DIR||2|1|1|243.00|450.00|||2|
1429|ML|4|189.190.40||WH|OUR|M||||DIR||2|1|1|359.10|665.00|||2|
1430|ML|3|189.190.41||WH|COB|B||||DIR||2|1|1|243.00|450.00|||2|
1431|ML|4|189.190.42||WH|COB|B||||DIR||2|1|1|359.10|665.00|||2|
1432|ML|3|189.190.43||WH|COB|M||||DIR||2|1|1|243.00|450.00|||2|
1433|ML|4|189.190.44||WH|COB|M||||DIR||2|1|1|359.10|665.00|||2|
1434|ML|3|189.190.45||WH|CHO|B||||DIR||2|1|1|243.00|450.00|||2|
1435|ML|4|189.190.46||WH|CHO|B||||DIR||2|1|1|359.10|665.00|||2|
1436|ML|3|189.190.47||WH|CHO|M||||DIR||2|1|1|243.00|450.00|||2|
1437|ML|4|189.190.48||WH|CHO|M||||DIR||2|1|1|359.10|665.00|||2|
1438|ML|3|189.190.49||WH|VAG|B||||DIR||2|1|1|243.00|450.00|||2|
1439|ML|4|189.190.50||WH|VAG|B||||DIR||2|1|1|359.10|665.00|||2|
1440|ML|3|189.190.51||WH|VAG|M||||DIR||2|1|1|243.00|450.00|||2|
1441|ML|4|189.190.52||WH|VAG|M||||DIR||2|1|1|359.10|665.00|||2|
1442|ML|3|189.190.53||WH|AZE|B||||DIR||2|1|1|243.00|450.00|||2|
1443|ML|4|189.190.54||WH|AZE|B||||DIR||2|1|1|359.10|665.00|||2|
1444|ML|3|189.190.55||WH|AZE|M||||DIR||2|1|1|243.00|450.00|||2|
1445|ML|4|189.190.56||WH|AZE|M||||DIR||2|1|1|359.10|665.00|||2|
1446|ML|3|189.190.57||WH|AMA|B||||DIR||2|1|1|243.00|450.00|||2|
1447|ML|4|189.190.58||WH|AMA|B||||DIR||2|1|1|359.10|665.00|||2|
1448|ML|3|189.190.59||WH|AMA|M||||DIR||2|1|1|243.00|450.00|||2|
1449|ML|4|189.190.60||WH|AMA|M||||DIR||2|1|1|359.10|665.00|||2|
1450|ML|3|189.190.61||WH|AES|B||||DIR||2|1|1|243.00|450.00|||2|
1451|ML|4|189.190.62||WH|AES|B||||DIR||2|1|1|359.10|665.00|||2|
1452|ML|3|189.190.63||WH|AES|M||||DIR||2|1|1|243.00|450.00|||2|
1453|ML|4|189.190.64||WH|AES|M||||DIR||2|1|1|359.10|665.00|||2|
1454|ML|3|189.190.65||WH|PRA|B||||DIR||2|1|1|243.00|450.00|||2|
1455|ML|4|189.190.66||WH|PRA|B||||DIR||2|1|1|359.10|665.00|||2|
1456|ML|3|189.190.67||WH|PRA|M||||DIR||2|1|1|243.00|450.00|||2|
1457|ML|4|189.190.68||WH|PRA|M||||DIR||2|1|1|359.10|665.00|||2|
1458|ML|3|189.190.69||WH|ROS|B||||DIR||2|1|1|243.00|450.00|||2|
1459|ML|4|189.190.70||WH|ROS|B||||DIR||2|1|1|359.10|665.00|||2|
1460|ML|3|189.190.71||WH|ROS|M||||DIR||2|1|1|243.00|450.00|||2|
1461|ML|4|189.190.72||WH|ROS|M||||DIR||2|1|1|359.10|665.00|||2|
1462|ML|3|189.190.73||WH|VER|B||||DIR||2|1|1|243.00|450.00|||2|
1463|ML|4|189.190.74||WH|VER|B||||DIR||2|1|1|359.10|665.00|||2|
1464|ML|3|189.190.75||WH|VER|M||||DIR||2|1|1|243.00|450.00|||2|
1465|ML|4|189.190.76||WH|VER|M||||DIR||2|1|1|359.10|665.00|||2|
1466|ML|3|189.190.77||WH|OAK|||||DIR||2|1|1|243.00|450.00|||2|
1467|ML|4|189.190.78||WH|OAK|||||DIR||2|1|1|359.10|665.00|||2|
1468|ML|3|189.190.79||WH|TEA|||||DIR||2|1|1|243.00|450.00|||2|
1469|ML|4|189.190.80||WH|TEA|||||DIR||2|1|1|359.10|665.00|||2|
1470|ML|3|189.190.81||WH|JOP|||||DIR||2|1|1|243.00|450.00|||2|
1471|ML|4|189.190.82||WH|JOP|||||DIR||2|1|1|359.10|665.00|||2|
1472|ML|3|189.190.186||WH|DEN|||||DIR||2|1|1|243.00|450.00|||2|
1473|ML|4|189.190.187||WH|DEN|||||DIR||2|1|1|359.10|665.00|||2|
1474|ML|3|189.190.83||WH|BLK|||||DIR||2|1|1|243.00|450.00|||2|
1475|ML|4|189.190.84||WH|BLK|||||DIR||2|1|1|359.10|665.00|||2|
1476|ML|3|189.190.85||WH|ART|||||DIR||2|1|1|243.00|450.00|||2|
1477|ML|4|189.190.86||WH|ART|||||DIR||2|1|1|359.10|665.00|||2|
1478|ML|3|189.190.87||WH|LIN|||||DIR||2|1|1|243.00|450.00|||2|
1479|ML|4|189.190.88||WH|LIN|||||DIR||2|1|1|359.10|665.00|||2|
1480|ML|3|189.190.89||WH|HAL|||||DIR||2|1|1|243.00|450.00|||2|
1481|ML|4|189.190.90||WH|HAL|||||DIR||2|1|1|359.10|665.00|||2|
1482|ML|3|189.190.91||BCO|BCO|B||||DIR||2|1|1|264.60|490.00|||2|
1483|ML|4|189.190.92||BCO|BCO|B||||DIR||2|1|1|380.70|705.00|||2|
1484|ML|3|189.190.93||BCO|BCO|M||||DIR||2|1|1|264.60|490.00|||2|
1485|ML|4|189.190.94||BCO|BCO|M||||DIR||2|1|1|380.70|705.00|||2|
1486|ML|3|189.190.95||CCL|CCL|B||||DIR||2|1|1|264.60|490.00|||2|
1487|ML|4|189.190.96||CCL|CCL|B||||DIR||2|1|1|380.70|705.00|||2|
1488|ML|3|189.190.97||CCL|CCL|M||||DIR||2|1|1|264.60|490.00|||2|
1489|ML|4|189.190.98||CCL|CCL|M||||DIR||2|1|1|380.70|705.00|||2|
1490|ML|3|189.190.99||CME|CME|B||||DIR||2|1|1|264.60|490.00|||2|
1491|ML|4|189.190.100||CME|CME|B||||DIR||2|1|1|380.70|705.00|||2|
1492|ML|3|189.190.101||CME|CME|M||||DIR||2|1|1|264.60|490.00|||2|
1493|ML|4|189.190.102||CME|CME|M||||DIR||2|1|1|380.70|705.00|||2|
1494|ML|3|189.190.103||ANT|ANT|B||||DIR||2|1|1|264.60|490.00|||2|
1495|ML|4|189.190.104||ANT|ANT|B||||DIR||2|1|1|380.70|705.00|||2|
1496|ML|3|189.190.105||ANT|ANT|M||||DIR||2|1|1|264.60|490.00|||2|
1497|ML|4|189.190.106||ANT|ANT|M||||DIR||2|1|1|380.70|705.00|||2|
1498|ML|3|189.190.107||PTO|PTO|B||||DIR||2|1|1|264.60|490.00|||2|
1499|ML|4|189.190.108||PTO|PTO|B||||DIR||2|1|1|380.70|705.00|||2|
1500|ML|3|189.190.109||PTO|PTO|M||||DIR||2|1|1|264.60|490.00|||2|
1501|ML|4|189.190.110||PTO|PTO|M||||DIR||2|1|1|380.70|705.00|||2|
1502|ML|3|189.190.111||CRE|CRE|B||||DIR||2|1|1|264.60|490.00|||2|
1503|ML|4|189.190.112||CRE|CRE|B||||DIR||2|1|1|380.70|705.00|||2|
1504|ML|3|189.190.113||CRE|CRE|M||||DIR||2|1|1|264.60|490.00|||2|
1505|ML|4|189.190.114||CRE|CRE|M||||DIR||2|1|1|380.70|705.00|||2|
1506|ML|3|189.190.115||CAM|CAM|B||||DIR||2|1|1|264.60|490.00|||2|
1507|ML|4|189.190.116||CAM|CAM|B||||DIR||2|1|1|380.70|705.00|||2|
1508|ML|3|189.190.117||CAM|CAM|M||||DIR||2|1|1|264.60|490.00|||2|
1509|ML|4|189.190.118||CAM|CAM|M||||DIR||2|1|1|380.70|705.00|||2|
1510|ML|3|189.190.119||OUR|OUR|B||||DIR||2|1|1|264.60|490.00|||2|
1511|ML|4|189.190.120||OUR|OUR|B||||DIR||2|1|1|380.70|705.00|||2|
1512|ML|3|189.190.121||OUR|OUR|M||||DIR||2|1|1|264.60|490.00|||2|
1513|ML|4|189.190.122||OUR|OUR|M||||DIR||2|1|1|380.70|705.00|||2|
1514|ML|3|189.190.123||COB|COB|B||||DIR||2|1|1|264.60|490.00|||2|
1515|ML|4|189.190.124||COB|COB|B||||DIR||2|1|1|380.70|705.00|||2|
1516|ML|3|189.190.125||COB|COB|M||||DIR||2|1|1|264.60|490.00|||2|
1517|ML|4|189.190.126||COB|COB|M||||DIR||2|1|1|380.70|705.00|||2|
1518|ML|3|189.190.127||CHO|CHO|B||||DIR||2|1|1|264.60|490.00|||2|
1519|ML|4|189.190.128||CHO|CHO|B||||DIR||2|1|1|380.70|705.00|||2|
1520|ML|3|189.190.129||CHO|CHO|M||||DIR||2|1|1|264.60|490.00|||2|
1521|ML|4|189.190.130||CHO|CHO|M||||DIR||2|1|1|380.70|705.00|||2|
1522|ML|3|189.190.131||VAG|VAG|B||||DIR||2|1|1|264.60|490.00|||2|
1523|ML|4|189.190.132||VAG|VAG|B||||DIR||2|1|1|380.70|705.00|||2|
1524|ML|3|189.190.133||VAG|VAG|M||||DIR||2|1|1|264.60|490.00|||2|
1525|ML|4|189.190.134||VAG|VAG|M||||DIR||2|1|1|380.70|705.00|||2|
1526|ML|3|189.190.135||AZE|AZE|B||||DIR||2|1|1|264.60|490.00|||2|
1527|ML|4|189.190.136||AZE|AZE|B||||DIR||2|1|1|380.70|705.00|||2|
1528|ML|3|189.190.137||AZE|AZE|M||||DIR||2|1|1|264.60|490.00|||2|
1529|ML|4|189.190.138||AZE|AZE|M||||DIR||2|1|1|380.70|705.00|||2|
1530|ML|3|189.190.139||AMA|AMA|B||||DIR||2|1|1|264.60|490.00|||2|
1531|ML|4|189.190.140||AMA|AMA|B||||DIR||2|1|1|380.70|705.00|||2|
1532|ML|3|189.190.141||AMA|AMA|M||||DIR||2|1|1|264.60|490.00|||2|
1533|ML|4|189.190.142||AMA|AMA|M||||DIR||2|1|1|380.70|705.00|||2|
1534|ML|3|189.190.143||AES|AES|B||||DIR||2|1|1|264.60|490.00|||2|
1535|ML|4|189.190.144||AES|AES|B||||DIR||2|1|1|380.70|705.00|||2|
1536|ML|3|189.190.145||AES|AES|M||||DIR||2|1|1|264.60|490.00|||2|
1537|ML|4|189.190.146||AES|AES|M||||DIR||2|1|1|380.70|705.00|||2|
1538|ML|3|189.190.147||PRA|PRA|B||||DIR||2|1|1|264.60|490.00|||2|
1539|ML|4|189.190.148||PRA|PRA|B||||DIR||2|1|1|380.70|705.00|||2|
1540|ML|3|189.190.149||PRA|PRA|M||||DIR||2|1|1|264.60|490.00|||2|
1541|ML|4|189.190.150||PRA|PRA|M||||DIR||2|1|1|380.70|705.00|||2|
1542|ML|3|189.190.151||ROS|ROS|B||||DIR||2|1|1|264.60|490.00|||2|
1543|ML|4|189.190.152||ROS|ROS|B||||DIR||2|1|1|380.70|705.00|||2|
1544|ML|3|189.190.153||ROS|ROS|M||||DIR||2|1|1|264.60|490.00|||2|
1545|ML|4|189.190.154||ROS|ROS|M||||DIR||2|1|1|380.70|705.00|||2|
1546|ML|3|189.190.155||VER|VER|B||||DIR||2|1|1|264.60|490.00|||2|
1547|ML|4|189.190.156||VER|VER|B||||DIR||2|1|1|380.70|705.00|||2|
1548|ML|3|189.190.157||VER|VER|M||||DIR||2|1|1|264.60|490.00|||2|
1549|ML|4|189.190.158||VER|VER|M||||DIR||2|1|1|380.70|705.00|||2|
1550|ML|3|189.190.159||OAK|OAK|||||DIR||2|1|1|264.60|490.00|||2|
1551|ML|4|189.190.160||OAK|OAK|||||DIR||2|1|1|380.70|705.00|||2|
1552|ML|3|189.190.161||TEA|TEA|||||DIR||2|1|1|264.60|490.00|||2|
1553|ML|4|189.190.162||TEA|TEA|||||DIR||2|1|1|380.70|705.00|||2|
1554|ML|3|189.190.163||JOP|JOP|||||DIR||2|1|1|264.60|490.00|||2|
1555|ML|4|189.190.164||JOP|JOP|||||DIR||2|1|1|380.70|705.00|||2|
1556|ML|3|189.190.165||AZB|AZB|||||DIR||2|1|1|264.60|490.00|||2|
1557|ML|4|189.190.166||AZB|AZB|||||DIR||2|1|1|380.70|705.00|||2|
1558|ML|3|189.190.167||DEN|DEN|||||DIR||2|1|1|264.60|490.00|||2|
1559|ML|4|189.190.168||DEN|DEN|||||DIR||2|1|1|380.70|705.00|||2|
1560|ML|3|189.190.169||BLK|BLK|||||DIR||2|1|1|264.60|490.00|||2|
1561|ML|4|189.190.170||BLK|BLK|||||DIR||2|1|1|380.70|705.00|||2|
1562|ML|3|189.190.171||ART|ART|||||DIR||2|1|1|264.60|490.00|||2|
1563|ML|4|189.190.172||ART|ART|||||DIR||2|1|1|380.70|705.00|||2|
1564|ML|3|189.190.173||LIN|LIN|||||DIR||2|1|1|264.60|490.00|||2|
1565|ML|4|189.190.174||LIN|LIN|||||DIR||2|1|1|380.70|705.00|||2|
1566|ML|3|189.190.175||HAL|HAL|||||DIR||2|1|1|264.60|490.00|||2|
1567|ML|4|189.190.176||HAL|HAL|||||DIR||2|1|1|380.70|705.00|||2|
1568|ML|3|189.191.3||WH|WH|||||ESQ||2|1|1|259.20|480.00|||2|
1569|ML|4|189.191.4||WH|WH|||||ESQ||2|1|1|398.52|738.00|||2|
1570|ML|3|189.191.5||WH|AZB|||||ESQ||2|1|1|259.20|480.00|||2|
1571|ML|4|189.191.6||WH|AZB|||||ESQ||2|1|1|398.52|738.00|||2|
1572|ML|3|189.191.9||WH|BCO|B||||ESQ||2|1|1|286.20|530.00|||2|
1573|ML|4|189.191.10||WH|BCO|B||||ESQ||2|1|1|425.52|788.00|||2|
1574|ML|3|189.191.11||WH|BCO|M||||ESQ||2|1|1|286.20|530.00|||2|
1575|ML|4|189.191.12||WH|BCO|M||||ESQ||2|1|1|425.52|788.00|||2|
1576|ML|3|189.191.13||WH|CCL|B||||ESQ||2|1|1|286.20|530.00|||2|
1577|ML|4|189.191.14||WH|CCL|B||||ESQ||2|1|1|425.52|788.00|||2|
1578|ML|3|189.191.15||WH|CCL|M||||ESQ||2|1|1|286.20|530.00|||2|
1579|ML|4|189.191.16||WH|CCL|M||||ESQ||2|1|1|425.52|788.00|||2|
1580|ML|3|189.191.17||WH|CME|B||||ESQ||2|1|1|286.20|530.00|||2|
1581|ML|4|189.191.18||WH|CME|B||||ESQ||2|1|1|425.52|788.00|||2|
1582|ML|3|189.191.19||WH|CME|M||||ESQ||2|1|1|286.20|530.00|||2|
1583|ML|4|189.191.20||WH|CME|M||||ESQ||2|1|1|425.52|788.00|||2|
1584|ML|3|189.191.21||WH|ANT|B||||ESQ||2|1|1|286.20|530.00|||2|
1585|ML|4|189.191.22||WH|ANT|B||||ESQ||2|1|1|425.52|788.00|||2|
1586|ML|3|189.191.23||WH|ANT|M||||ESQ||2|1|1|286.20|530.00|||2|
1587|ML|4|189.191.24||WH|ANT|M||||ESQ||2|1|1|425.52|788.00|||2|
1588|ML|3|189.191.25||WH|PTO|B||||ESQ||2|1|1|286.20|530.00|||2|
1589|ML|4|189.191.26||WH|PTO|B||||ESQ||2|1|1|425.52|788.00|||2|
1590|ML|3|189.191.27||WH|PTO|M||||ESQ||2|1|1|286.20|530.00|||2|
1591|ML|4|189.191.28||WH|PTO|M||||ESQ||2|1|1|425.52|788.00|||2|
1592|ML|3|189.191.29||WH|CRE|B||||ESQ||2|1|1|286.20|530.00|||2|
1593|ML|4|189.191.30||WH|CRE|B||||ESQ||2|1|1|425.52|788.00|||2|
1594|ML|3|189.191.31||WH|CRE|M||||ESQ||2|1|1|286.20|530.00|||2|
1595|ML|4|189.191.32||WH|CRE|M||||ESQ||2|1|1|425.52|788.00|||2|
1596|ML|3|189.191.33||WH|CAM|B||||ESQ||2|1|1|286.20|530.00|||2|
1597|ML|4|189.191.34||WH|CAM|B||||ESQ||2|1|1|425.52|788.00|||2|
1598|ML|3|189.191.35||WH|CAM|M||||ESQ||2|1|1|286.20|530.00|||2|
1599|ML|4|189.191.36||WH|CAM|M||||ESQ||2|1|1|425.52|788.00|||2|
1600|ML|3|189.191.37||WH|OUR|B||||ESQ||2|1|1|286.20|530.00|||2|
1601|ML|4|189.191.38||WH|OUR|B||||ESQ||2|1|1|425.52|788.00|||2|
1602|ML|3|189.191.39||WH|OUR|M||||ESQ||2|1|1|286.20|530.00|||2|
1603|ML|4|189.191.40||WH|OUR|M||||ESQ||2|1|1|425.52|788.00|||2|
1604|ML|3|189.191.41||WH|COB|B||||ESQ||2|1|1|286.20|530.00|||2|
1605|ML|4|189.191.42||WH|COB|B||||ESQ||2|1|1|425.52|788.00|||2|
1606|ML|3|189.191.43||WH|COB|M||||ESQ||2|1|1|286.20|530.00|||2|
1607|ML|4|189.191.44||WH|COB|M||||ESQ||2|1|1|425.52|788.00|||2|
1608|ML|3|189.191.45||WH|CHO|B||||ESQ||2|1|1|286.20|530.00|||2|
1609|ML|4|189.191.46||WH|CHO|B||||ESQ||2|1|1|425.52|788.00|||2|
1610|ML|3|189.191.47||WH|CHO|M||||ESQ||2|1|1|286.20|530.00|||2|
1611|ML|4|189.191.48||WH|CHO|M||||ESQ||2|1|1|425.52|788.00|||2|
1612|ML|3|189.191.49||WH|VAG|B||||ESQ||2|1|1|286.20|530.00|||2|
1613|ML|4|189.191.50||WH|VAG|B||||ESQ||2|1|1|425.52|788.00|||2|
1614|ML|3|189.191.51||WH|VAG|M||||ESQ||2|1|1|286.20|530.00|||2|
1615|ML|4|189.191.52||WH|VAG|M||||ESQ||2|1|1|425.52|788.00|||2|
1616|ML|3|189.191.53||WH|AZE|B||||ESQ||2|1|1|286.20|530.00|||2|
1617|ML|4|189.191.54||WH|AZE|B||||ESQ||2|1|1|425.52|788.00|||2|
1618|ML|3|189.191.55||WH|AZE|M||||ESQ||2|1|1|286.20|530.00|||2|
1619|ML|4|189.191.56||WH|AZE|M||||ESQ||2|1|1|425.52|788.00|||2|
1620|ML|3|189.191.57||WH|AMA|B||||ESQ||2|1|1|286.20|530.00|||2|
1621|ML|4|189.191.58||WH|AMA|B||||ESQ||2|1|1|425.52|788.00|||2|
1622|ML|3|189.191.59||WH|AMA|M||||ESQ||2|1|1|286.20|530.00|||2|
1623|ML|4|189.191.60||WH|AMA|M||||ESQ||2|1|1|425.52|788.00|||2|
1624|ML|3|189.191.61||WH|AES|B||||ESQ||2|1|1|286.20|530.00|||2|
1625|ML|4|189.191.62||WH|AES|B||||ESQ||2|1|1|425.52|788.00|||2|
1626|ML|3|189.191.63||WH|AES|M||||ESQ||2|1|1|286.20|530.00|||2|
1627|ML|4|189.191.64||WH|AES|M||||ESQ||2|1|1|425.52|788.00|||2|
1628|ML|3|189.191.65||WH|PRA|B||||ESQ||2|1|1|286.20|530.00|||2|
1629|ML|4|189.191.66||WH|PRA|B||||ESQ||2|1|1|425.52|788.00|||2|
1630|ML|3|189.191.67||WH|PRA|M||||ESQ||2|1|1|286.20|530.00|||2|
1631|ML|4|189.191.68||WH|PRA|M||||ESQ||2|1|1|425.52|788.00|||2|
1632|ML|3|189.191.69||WH|ROS|B||||ESQ||2|1|1|286.20|530.00|||2|
1633|ML|4|189.191.70||WH|ROS|B||||ESQ||2|1|1|425.52|788.00|||2|
1634|ML|3|189.191.71||WH|ROS|M||||ESQ||2|1|1|286.20|530.00|||2|
1635|ML|4|189.191.72||WH|ROS|M||||ESQ||2|1|1|425.52|788.00|||2|
1636|ML|3|189.191.73||WH|VER|B||||ESQ||2|1|1|286.20|530.00|||2|
1637|ML|4|189.191.74||WH|VER|B||||ESQ||2|1|1|425.52|788.00|||2|
1638|ML|3|189.191.75||WH|VER|M||||ESQ||2|1|1|286.20|530.00|||2|
1639|ML|4|189.191.76||WH|VER|M||||ESQ||2|1|1|425.52|788.00|||2|
1640|ML|3|189.191.77||WH|OAK|||||ESQ||2|1|1|286.20|530.00|||2|
1641|ML|4|189.191.78||WH|OAK|||||ESQ||2|1|1|425.52|788.00|||2|
1642|ML|3|189.191.79||WH|TEA|||||ESQ||2|1|1|286.20|530.00|||2|
1643|ML|4|189.191.80||WH|TEA|||||ESQ||2|1|1|425.52|788.00|||2|
1644|ML|3|189.191.81||WH|JOP|||||ESQ||2|1|1|286.20|530.00|||2|
1645|ML|4|189.191.82||WH|JOP|||||ESQ||2|1|1|425.52|788.00|||2|
1646|ML|3|189.191.186||WH|DEN|||||ESQ||2|1|1|286.20|530.00|||2|
1647|ML|4|189.191.187||WH|DEN|||||ESQ||2|1|1|425.52|788.00|||2|
1648|ML|3|189.191.83||WH|BLK|||||ESQ||2|1|1|286.20|530.00|||2|
1649|ML|4|189.191.84||WH|BLK|||||ESQ||2|1|1|425.52|788.00|||2|
1650|ML|3|189.191.85||WH|ART|||||ESQ||2|1|1|286.20|530.00|||2|
1651|ML|4|189.191.86||WH|ART|||||ESQ||2|1|1|425.52|788.00|||2|
1652|ML|3|189.191.87||WH|LIN|||||ESQ||2|1|1|286.20|530.00|||2|
1653|ML|4|189.191.88||WH|LIN|||||ESQ||2|1|1|425.52|788.00|||2|
1654|ML|3|189.191.89||WH|HAL|||||ESQ||2|1|1|286.20|530.00|||2|
1655|ML|4|189.191.90||WH|HAL|||||ESQ||2|1|1|425.52|788.00|||2|
1656|ML|3|189.191.91||BCO|BCO|B||||ESQ||2|1|1|307.80|570.00|||2|
1657|ML|4|189.191.92||BCO|BCO|B||||ESQ||2|1|1|447.12|828.00|||2|
1658|ML|3|189.191.93||BCO|BCO|M||||ESQ||2|1|1|307.80|570.00|||2|
1659|ML|4|189.191.94||BCO|BCO|M||||ESQ||2|1|1|447.12|828.00|||2|
1660|ML|3|189.191.95||CCL|CCL|B||||ESQ||2|1|1|307.80|570.00|||2|
1661|ML|4|189.191.96||CCL|CCL|B||||ESQ||2|1|1|447.12|828.00|||2|
1662|ML|3|189.191.97||CCL|CCL|M||||ESQ||2|1|1|307.80|570.00|||2|
1663|ML|4|189.191.98||CCL|CCL|M||||ESQ||2|1|1|447.12|828.00|||2|
1664|ML|3|189.191.99||CME|CME|B||||ESQ||2|1|1|307.80|570.00|||2|
1665|ML|4|189.191.100||CME|CME|B||||ESQ||2|1|1|447.12|828.00|||2|
1666|ML|3|189.191.101||CME|CME|M||||ESQ||2|1|1|307.80|570.00|||2|
1667|ML|4|189.191.102||CME|CME|M||||ESQ||2|1|1|447.12|828.00|||2|
1668|ML|3|189.191.103||ANT|ANT|B||||ESQ||2|1|1|307.80|570.00|||2|
1669|ML|4|189.191.104||ANT|ANT|B||||ESQ||2|1|1|447.12|828.00|||2|
1670|ML|3|189.191.105||ANT|ANT|M||||ESQ||2|1|1|307.80|570.00|||2|
1671|ML|4|189.191.106||ANT|ANT|M||||ESQ||2|1|1|447.12|828.00|||2|
1672|ML|3|189.191.107||PTO|PTO|B||||ESQ||2|1|1|307.80|570.00|||2|
1673|ML|4|189.191.108||PTO|PTO|B||||ESQ||2|1|1|447.12|828.00|||2|
1674|ML|3|189.191.109||PTO|PTO|M||||ESQ||2|1|1|307.80|570.00|||2|
1675|ML|4|189.191.110||PTO|PTO|M||||ESQ||2|1|1|447.12|828.00|||2|
1676|ML|3|189.191.111||CRE|CRE|B||||ESQ||2|1|1|307.80|570.00|||2|
1677|ML|4|189.191.112||CRE|CRE|B||||ESQ||2|1|1|447.12|828.00|||2|
1678|ML|3|189.191.113||CRE|CRE|M||||ESQ||2|1|1|307.80|570.00|||2|
1679|ML|4|189.191.114||CRE|CRE|M||||ESQ||2|1|1|447.12|828.00|||2|
1680|ML|3|189.191.115||CAM|CAM|B||||ESQ||2|1|1|307.80|570.00|||2|
1681|ML|4|189.191.116||CAM|CAM|B||||ESQ||2|1|1|447.12|828.00|||2|
1682|ML|3|189.191.117||CAM|CAM|M||||ESQ||2|1|1|307.80|570.00|||2|
1683|ML|4|189.191.118||CAM|CAM|M||||ESQ||2|1|1|447.12|828.00|||2|
1684|ML|3|189.191.119||OUR|OUR|B||||ESQ||2|1|1|307.80|570.00|||2|
1685|ML|4|189.191.120||OUR|OUR|B||||ESQ||2|1|1|447.12|828.00|||2|
1686|ML|3|189.191.121||OUR|OUR|M||||ESQ||2|1|1|307.80|570.00|||2|
1687|ML|4|189.191.122||OUR|OUR|M||||ESQ||2|1|1|447.12|828.00|||2|
1688|ML|3|189.191.123||COB|COB|B||||ESQ||2|1|1|307.80|570.00|||2|
1689|ML|4|189.191.124||COB|COB|B||||ESQ||2|1|1|447.12|828.00|||2|
1690|ML|3|189.191.125||COB|COB|M||||ESQ||2|1|1|307.80|570.00|||2|
1691|ML|4|189.191.126||COB|COB|M||||ESQ||2|1|1|447.12|828.00|||2|
1692|ML|3|189.191.127||CHO|CHO|B||||ESQ||2|1|1|307.80|570.00|||2|
1693|ML|4|189.191.128||CHO|CHO|B||||ESQ||2|1|1|447.12|828.00|||2|
1694|ML|3|189.191.129||CHO|CHO|M||||ESQ||2|1|1|307.80|570.00|||2|
1695|ML|4|189.191.130||CHO|CHO|M||||ESQ||2|1|1|447.12|828.00|||2|
1696|ML|3|189.191.131||VAG|VAG|B||||ESQ||2|1|1|307.80|570.00|||2|
1697|ML|4|189.191.132||VAG|VAG|B||||ESQ||2|1|1|447.12|828.00|||2|
1698|ML|3|189.191.133||VAG|VAG|M||||ESQ||2|1|1|307.80|570.00|||2|
1699|ML|4|189.191.134||VAG|VAG|M||||ESQ||2|1|1|447.12|828.00|||2|
1700|ML|3|189.191.135||AZE|AZE|B||||ESQ||2|1|1|307.80|570.00|||2|
1701|ML|4|189.191.136||AZE|AZE|B||||ESQ||2|1|1|447.12|828.00|||2|
1702|ML|3|189.191.137||AZE|AZE|M||||ESQ||2|1|1|307.80|570.00|||2|
1703|ML|4|189.191.138||AZE|AZE|M||||ESQ||2|1|1|447.12|828.00|||2|
1704|ML|3|189.191.139||AMA|AMA|B||||ESQ||2|1|1|307.80|570.00|||2|
1705|ML|4|189.191.140||AMA|AMA|B||||ESQ||2|1|1|447.12|828.00|||2|
1706|ML|3|189.191.141||AMA|AMA|M||||ESQ||2|1|1|307.80|570.00|||2|
1707|ML|4|189.191.142||AMA|AMA|M||||ESQ||2|1|1|447.12|828.00|||2|
1708|ML|3|189.191.143||AES|AES|B||||ESQ||2|1|1|307.80|570.00|||2|
1709|ML|4|189.191.144||AES|AES|B||||ESQ||2|1|1|447.12|828.00|||2|
1710|ML|3|189.191.145||AES|AES|M||||ESQ||2|1|1|307.80|570.00|||2|
1711|ML|4|189.191.146||AES|AES|M||||ESQ||2|1|1|447.12|828.00|||2|
1712|ML|3|189.191.147||PRA|PRA|B||||ESQ||2|1|1|307.80|570.00|||2|
1713|ML|4|189.191.148||PRA|PRA|B||||ESQ||2|1|1|447.12|828.00|||2|
1714|ML|3|189.191.149||PRA|PRA|M||||ESQ||2|1|1|307.80|570.00|||2|
1715|ML|4|189.191.150||PRA|PRA|M||||ESQ||2|1|1|447.12|828.00|||2|
1716|ML|3|189.191.151||ROS|ROS|B||||ESQ||2|1|1|307.80|570.00|||2|
1717|ML|4|189.191.152||ROS|ROS|B||||ESQ||2|1|1|447.12|828.00|||2|
1718|ML|3|189.191.153||ROS|ROS|M||||ESQ||2|1|1|307.80|570.00|||2|
1719|ML|4|189.191.154||ROS|ROS|M||||ESQ||2|1|1|447.12|828.00|||2|
1720|ML|3|189.191.155||VER|VER|B||||ESQ||2|1|1|307.80|570.00|||2|
1721|ML|4|189.191.156||VER|VER|B||||ESQ||2|1|1|447.12|828.00|||2|
1722|ML|3|189.191.157||VER|VER|M||||ESQ||2|1|1|307.80|570.00|||2|
1723|ML|4|189.191.158||VER|VER|M||||ESQ||2|1|1|447.12|828.00|||2|
1724|ML|3|189.191.159||OAK|OAK|||||ESQ||2|1|1|307.80|570.00|||2|
1725|ML|4|189.191.160||OAK|OAK|||||ESQ||2|1|1|447.12|828.00|||2|
1726|ML|3|189.191.161||TEA|TEA|||||ESQ||2|1|1|307.80|570.00|||2|
1727|ML|4|189.191.162||TEA|TEA|||||ESQ||2|1|1|447.12|828.00|||2|
1728|ML|3|189.191.163||JOP|JOP|||||ESQ||2|1|1|307.80|570.00|||2|
1729|ML|4|189.191.164||JOP|JOP|||||ESQ||2|1|1|447.12|828.00|||2|
1730|ML|3|189.191.165||AZB|AZB|||||ESQ||2|1|1|307.80|570.00|||2|
1731|ML|4|189.191.166||AZB|AZB|||||ESQ||2|1|1|447.12|828.00|||2|
1732|ML|3|189.191.167||DEN|DEN|||||ESQ||2|1|1|307.80|570.00|||2|
1733|ML|4|189.191.168||DEN|DEN|||||ESQ||2|1|1|447.12|828.00|||2|
1734|ML|3|189.191.169||BLK|BLK|||||ESQ||2|1|1|307.80|570.00|||2|
1735|ML|4|189.191.170||BLK|BLK|||||ESQ||2|1|1|447.12|828.00|||2|
1736|ML|3|189.191.171||ART|ART|||||ESQ||2|1|1|307.80|570.00|||2|
1737|ML|4|189.191.172||ART|ART|||||ESQ||2|1|1|447.12|828.00|||2|
1738|ML|3|189.191.173||LIN|LIN|||||ESQ||2|1|1|307.80|570.00|||2|
1739|ML|4|189.191.174||LIN|LIN|||||ESQ||2|1|1|447.12|828.00|||2|
1740|ML|3|189.191.175||HAL|HAL|||||ESQ||2|1|1|307.80|570.00|||2|
1741|ML|4|189.191.176||HAL|HAL|||||ESQ||2|1|1|447.12|828.00|||2|
1742|ML|3|192.193.3||WH|WH|||||DIR||3|1|1|243.00|450.00|||2|
1743|ML|4|192.193.4||WH|WH|||||DIR||3|1|1|356.40|660.00|||2|
1744|ML|3|192.193.5||WH|AZB|||||DIR||3|1|1|243.00|450.00|||2|
1745|ML|4|192.193.6||WH|AZB|||||DIR||3|1|1|356.40|660.00|||2|
1746|ML|3|192.193.9||WH|BCO|B||||DIR||3|1|1|270.00|500.00|||2|
1747|ML|4|192.193.10||WH|BCO|B||||DIR||3|1|1|383.40|710.00|||2|
1748|ML|3|192.193.11||WH|BCO|M||||DIR||3|1|1|270.00|500.00|||2|
1749|ML|4|192.193.12||WH|BCO|M||||DIR||3|1|1|383.40|710.00|||2|
1750|ML|3|192.193.13||WH|CCL|B||||DIR||3|1|1|270.00|500.00|||2|
1751|ML|4|192.193.14||WH|CCL|B||||DIR||3|1|1|383.40|710.00|||2|
1752|ML|3|192.193.15||WH|CCL|M||||DIR||3|1|1|270.00|500.00|||2|
1753|ML|4|192.193.16||WH|CCL|M||||DIR||3|1|1|383.40|710.00|||2|
1754|ML|3|192.193.17||WH|CME|B||||DIR||3|1|1|270.00|500.00|||2|
1755|ML|4|192.193.18||WH|CME|B||||DIR||3|1|1|383.40|710.00|||2|
1756|ML|3|192.193.19||WH|CME|M||||DIR||3|1|1|270.00|500.00|||2|
1757|ML|4|192.193.20||WH|CME|M||||DIR||3|1|1|383.40|710.00|||2|
1758|ML|3|192.193.21||WH|ANT|B||||DIR||3|1|1|270.00|500.00|||2|
1759|ML|4|192.193.22||WH|ANT|B||||DIR||3|1|1|383.40|710.00|||2|
1760|ML|3|192.193.23||WH|ANT|M||||DIR||3|1|1|270.00|500.00|||2|
1761|ML|4|192.193.24||WH|ANT|M||||DIR||3|1|1|383.40|710.00|||2|
1762|ML|3|192.193.25||WH|PTO|B||||DIR||3|1|1|270.00|500.00|||2|
1763|ML|4|192.193.26||WH|PTO|B||||DIR||3|1|1|383.40|710.00|||2|
1764|ML|3|192.193.27||WH|PTO|M||||DIR||3|1|1|270.00|500.00|||2|
1765|ML|4|192.193.28||WH|PTO|M||||DIR||3|1|1|383.40|710.00|||2|
1766|ML|3|192.193.29||WH|CRE|B||||DIR||3|1|1|270.00|500.00|||2|
1767|ML|4|192.193.30||WH|CRE|B||||DIR||3|1|1|383.40|710.00|||2|
1768|ML|3|192.193.31||WH|CRE|M||||DIR||3|1|1|270.00|500.00|||2|
1769|ML|4|192.193.32||WH|CRE|M||||DIR||3|1|1|383.40|710.00|||2|
1770|ML|3|192.193.33||WH|CAM|B||||DIR||3|1|1|270.00|500.00|||2|
1771|ML|4|192.193.34||WH|CAM|B||||DIR||3|1|1|383.40|710.00|||2|
1772|ML|3|192.193.35||WH|CAM|M||||DIR||3|1|1|270.00|500.00|||2|
1773|ML|4|192.193.36||WH|CAM|M||||DIR||3|1|1|383.40|710.00|||2|
1774|ML|3|192.193.37||WH|OUR|B||||DIR||3|1|1|270.00|500.00|||2|
1775|ML|4|192.193.38||WH|OUR|B||||DIR||3|1|1|383.40|710.00|||2|
1776|ML|3|192.193.39||WH|OUR|M||||DIR||3|1|1|270.00|500.00|||2|
1777|ML|4|192.193.40||WH|OUR|M||||DIR||3|1|1|383.40|710.00|||2|
1778|ML|3|192.193.41||WH|COB|B||||DIR||3|1|1|270.00|500.00|||2|
1779|ML|4|192.193.42||WH|COB|B||||DIR||3|1|1|383.40|710.00|||2|
1780|ML|3|192.193.43||WH|COB|M||||DIR||3|1|1|270.00|500.00|||2|
1781|ML|4|192.193.44||WH|COB|M||||DIR||3|1|1|383.40|710.00|||2|
1782|ML|3|192.193.45||WH|CHO|B||||DIR||3|1|1|270.00|500.00|||2|
1783|ML|4|192.193.46||WH|CHO|B||||DIR||3|1|1|383.40|710.00|||2|
1784|ML|3|192.193.47||WH|CHO|M||||DIR||3|1|1|270.00|500.00|||2|
1785|ML|4|192.193.48||WH|CHO|M||||DIR||3|1|1|383.40|710.00|||2|
1786|ML|3|192.193.49||WH|VAG|B||||DIR||3|1|1|270.00|500.00|||2|
1787|ML|4|192.193.50||WH|VAG|B||||DIR||3|1|1|383.40|710.00|||2|
1788|ML|3|192.193.51||WH|VAG|M||||DIR||3|1|1|270.00|500.00|||2|
1789|ML|4|192.193.52||WH|VAG|M||||DIR||3|1|1|383.40|710.00|||2|
1790|ML|3|192.193.53||WH|AZE|B||||DIR||3|1|1|270.00|500.00|||2|
1791|ML|4|192.193.54||WH|AZE|B||||DIR||3|1|1|383.40|710.00|||2|
1792|ML|3|192.193.55||WH|AZE|M||||DIR||3|1|1|270.00|500.00|||2|
1793|ML|4|192.193.56||WH|AZE|M||||DIR||3|1|1|383.40|710.00|||2|
1794|ML|3|192.193.57||WH|AMA|B||||DIR||3|1|1|270.00|500.00|||2|
1795|ML|4|192.193.58||WH|AMA|B||||DIR||3|1|1|383.40|710.00|||2|
1796|ML|3|192.193.59||WH|AMA|M||||DIR||3|1|1|270.00|500.00|||2|
1797|ML|4|192.193.60||WH|AMA|M||||DIR||3|1|1|383.40|710.00|||2|
1798|ML|3|192.193.61||WH|AES|B||||DIR||3|1|1|270.00|500.00|||2|
1799|ML|4|192.193.62||WH|AES|B||||DIR||3|1|1|383.40|710.00|||2|
1800|ML|3|192.193.63||WH|AES|M||||DIR||3|1|1|270.00|500.00|||2|
1801|ML|4|192.193.64||WH|AES|M||||DIR||3|1|1|383.40|710.00|||2|
1802|ML|3|192.193.65||WH|PRA|B||||DIR||3|1|1|270.00|500.00|||2|
1803|ML|4|192.193.66||WH|PRA|B||||DIR||3|1|1|383.40|710.00|||2|
1804|ML|3|192.193.67||WH|PRA|M||||DIR||3|1|1|270.00|500.00|||2|
1805|ML|4|192.193.68||WH|PRA|M||||DIR||3|1|1|383.40|710.00|||2|
1806|ML|3|192.193.69||WH|ROS|B||||DIR||3|1|1|270.00|500.00|||2|
1807|ML|4|192.193.70||WH|ROS|B||||DIR||3|1|1|383.40|710.00|||2|
1808|ML|3|192.193.71||WH|ROS|M||||DIR||3|1|1|270.00|500.00|||2|
1809|ML|4|192.193.72||WH|ROS|M||||DIR||3|1|1|383.40|710.00|||2|
1810|ML|3|192.193.73||WH|VER|B||||DIR||3|1|1|270.00|500.00|||2|
1811|ML|4|192.193.74||WH|VER|B||||DIR||3|1|1|383.40|710.00|||2|
1812|ML|3|192.193.75||WH|VER|M||||DIR||3|1|1|270.00|500.00|||2|
1813|ML|4|192.193.76||WH|VER|M||||DIR||3|1|1|383.40|710.00|||2|
1814|ML|3|192.193.77||WH|OAK|||||DIR||3|1|1|270.00|500.00|||2|
1815|ML|4|192.193.78||WH|OAK|||||DIR||3|1|1|383.40|710.00|||2|
1816|ML|3|192.193.79||WH|TEA|||||DIR||3|1|1|270.00|500.00|||2|
1817|ML|4|192.193.80||WH|TEA|||||DIR||3|1|1|383.40|710.00|||2|
1818|ML|3|192.193.81||WH|JOP|||||DIR||3|1|1|270.00|500.00|||2|
1819|ML|4|192.193.82||WH|JOP|||||DIR||3|1|1|383.40|710.00|||2|
1820|ML|3|192.193.186||WH|DEN|||||DIR||3|1|1|270.00|500.00|||2|
1821|ML|4|192.193.187||WH|DEN|||||DIR||3|1|1|383.40|710.00|||2|
1822|ML|3|192.193.83||WH|BLK|||||DIR||3|1|1|270.00|500.00|||2|
1823|ML|4|192.193.84||WH|BLK|||||DIR||3|1|1|383.40|710.00|||2|
1824|ML|3|192.193.85||WH|ART|||||DIR||3|1|1|270.00|500.00|||2|
1825|ML|4|192.193.86||WH|ART|||||DIR||3|1|1|383.40|710.00|||2|
1826|ML|3|192.193.87||WH|LIN|||||DIR||3|1|1|270.00|500.00|||2|
1827|ML|4|192.193.88||WH|LIN|||||DIR||3|1|1|383.40|710.00|||2|
1828|ML|3|192.193.89||WH|HAL|||||DIR||3|1|1|270.00|500.00|||2|
1829|ML|4|192.193.90||WH|HAL|||||DIR||3|1|1|383.40|710.00|||2|
1830|ML|3|192.193.91||BCO|BCO|B||||DIR||3|1|1|291.60|540.00|||2|
1831|ML|4|192.193.92||BCO|BCO|B||||DIR||3|1|1|405.00|750.00|||2|
1832|ML|3|192.193.93||BCO|BCO|M||||DIR||3|1|1|291.60|540.00|||2|
1833|ML|4|192.193.94||BCO|BCO|M||||DIR||3|1|1|405.00|750.00|||2|
1834|ML|3|192.193.95||CCL|CCL|B||||DIR||3|1|1|291.60|540.00|||2|
1835|ML|4|192.193.96||CCL|CCL|B||||DIR||3|1|1|405.00|750.00|||2|
1836|ML|3|192.193.97||CCL|CCL|M||||DIR||3|1|1|291.60|540.00|||2|
1837|ML|4|192.193.98||CCL|CCL|M||||DIR||3|1|1|405.00|750.00|||2|
1838|ML|3|192.193.99||CME|CME|B||||DIR||3|1|1|291.60|540.00|||2|
1839|ML|4|192.193.100||CME|CME|B||||DIR||3|1|1|405.00|750.00|||2|
1840|ML|3|192.193.101||CME|CME|M||||DIR||3|1|1|291.60|540.00|||2|
1841|ML|4|192.193.102||CME|CME|M||||DIR||3|1|1|405.00|750.00|||2|
1842|ML|3|192.193.103||ANT|ANT|B||||DIR||3|1|1|291.60|540.00|||2|
1843|ML|4|192.193.104||ANT|ANT|B||||DIR||3|1|1|405.00|750.00|||2|
1844|ML|3|192.193.105||ANT|ANT|M||||DIR||3|1|1|291.60|540.00|||2|
1845|ML|4|192.193.106||ANT|ANT|M||||DIR||3|1|1|405.00|750.00|||2|
1846|ML|3|192.193.107||PTO|PTO|B||||DIR||3|1|1|291.60|540.00|||2|
1847|ML|4|192.193.108||PTO|PTO|B||||DIR||3|1|1|405.00|750.00|||2|
1848|ML|3|192.193.109||PTO|PTO|M||||DIR||3|1|1|291.60|540.00|||2|
1849|ML|4|192.193.110||PTO|PTO|M||||DIR||3|1|1|405.00|750.00|||2|
1850|ML|3|192.193.111||CRE|CRE|B||||DIR||3|1|1|291.60|540.00|||2|
1851|ML|4|192.193.112||CRE|CRE|B||||DIR||3|1|1|405.00|750.00|||2|
1852|ML|3|192.193.113||CRE|CRE|M||||DIR||3|1|1|291.60|540.00|||2|
1853|ML|4|192.193.114||CRE|CRE|M||||DIR||3|1|1|405.00|750.00|||2|
1854|ML|3|192.193.115||CAM|CAM|B||||DIR||3|1|1|291.60|540.00|||2|
1855|ML|4|192.193.116||CAM|CAM|B||||DIR||3|1|1|405.00|750.00|||2|
1856|ML|3|192.193.117||CAM|CAM|M||||DIR||3|1|1|291.60|540.00|||2|
1857|ML|4|192.193.118||CAM|CAM|M||||DIR||3|1|1|405.00|750.00|||2|
1858|ML|3|192.193.119||OUR|OUR|B||||DIR||3|1|1|291.60|540.00|||2|
1859|ML|4|192.193.120||OUR|OUR|B||||DIR||3|1|1|405.00|750.00|||2|
1860|ML|3|192.193.121||OUR|OUR|M||||DIR||3|1|1|291.60|540.00|||2|
1861|ML|4|192.193.122||OUR|OUR|M||||DIR||3|1|1|405.00|750.00|||2|
1862|ML|3|192.193.123||COB|COB|B||||DIR||3|1|1|291.60|540.00|||2|
1863|ML|4|192.193.124||COB|COB|B||||DIR||3|1|1|405.00|750.00|||2|
1864|ML|3|192.193.125||COB|COB|M||||DIR||3|1|1|291.60|540.00|||2|
1865|ML|4|192.193.126||COB|COB|M||||DIR||3|1|1|405.00|750.00|||2|
1866|ML|3|192.193.127||CHO|CHO|B||||DIR||3|1|1|291.60|540.00|||2|
1867|ML|4|192.193.128||CHO|CHO|B||||DIR||3|1|1|405.00|750.00|||2|
1868|ML|3|192.193.129||CHO|CHO|M||||DIR||3|1|1|291.60|540.00|||2|
1869|ML|4|192.193.130||CHO|CHO|M||||DIR||3|1|1|405.00|750.00|||2|
1870|ML|3|192.193.131||VAG|VAG|B||||DIR||3|1|1|291.60|540.00|||2|
1871|ML|4|192.193.132||VAG|VAG|B||||DIR||3|1|1|405.00|750.00|||2|
1872|ML|3|192.193.133||VAG|VAG|M||||DIR||3|1|1|291.60|540.00|||2|
1873|ML|4|192.193.134||VAG|VAG|M||||DIR||3|1|1|405.00|750.00|||2|
1874|ML|3|192.193.135||AZE|AZE|B||||DIR||3|1|1|291.60|540.00|||2|
1875|ML|4|192.193.136||AZE|AZE|B||||DIR||3|1|1|405.00|750.00|||2|
1876|ML|3|192.193.137||AZE|AZE|M||||DIR||3|1|1|291.60|540.00|||2|
1877|ML|4|192.193.138||AZE|AZE|M||||DIR||3|1|1|405.00|750.00|||2|
1878|ML|3|192.193.139||AMA|AMA|B||||DIR||3|1|1|291.60|540.00|||2|
1879|ML|4|192.193.140||AMA|AMA|B||||DIR||3|1|1|405.00|750.00|||2|
1880|ML|3|192.193.141||AMA|AMA|M||||DIR||3|1|1|291.60|540.00|||2|
1881|ML|4|192.193.142||AMA|AMA|M||||DIR||3|1|1|405.00|750.00|||2|
1882|ML|3|192.193.143||AES|AES|B||||DIR||3|1|1|291.60|540.00|||2|
1883|ML|4|192.193.144||AES|AES|B||||DIR||3|1|1|405.00|750.00|||2|
1884|ML|3|192.193.145||AES|AES|M||||DIR||3|1|1|291.60|540.00|||2|
1885|ML|4|192.193.146||AES|AES|M||||DIR||3|1|1|405.00|750.00|||2|
1886|ML|3|192.193.147||PRA|PRA|B||||DIR||3|1|1|291.60|540.00|||2|
1887|ML|4|192.193.148||PRA|PRA|B||||DIR||3|1|1|405.00|750.00|||2|
1888|ML|3|192.193.149||PRA|PRA|M||||DIR||3|1|1|291.60|540.00|||2|
1889|ML|4|192.193.150||PRA|PRA|M||||DIR||3|1|1|405.00|750.00|||2|
1890|ML|3|192.193.151||ROS|ROS|B||||DIR||3|1|1|291.60|540.00|||2|
1891|ML|4|192.193.152||ROS|ROS|B||||DIR||3|1|1|405.00|750.00|||2|
1892|ML|3|192.193.153||ROS|ROS|M||||DIR||3|1|1|291.60|540.00|||2|
1893|ML|4|192.193.154||ROS|ROS|M||||DIR||3|1|1|405.00|750.00|||2|
1894|ML|3|192.193.155||VER|VER|B||||DIR||3|1|1|291.60|540.00|||2|
1895|ML|4|192.193.156||VER|VER|B||||DIR||3|1|1|405.00|750.00|||2|
1896|ML|3|192.193.157||VER|VER|M||||DIR||3|1|1|291.60|540.00|||2|
1897|ML|4|192.193.158||VER|VER|M||||DIR||3|1|1|405.00|750.00|||2|
1898|ML|3|192.193.159||OAK|OAK|||||DIR||3|1|1|291.60|540.00|||2|
1899|ML|4|192.193.160||OAK|OAK|||||DIR||3|1|1|405.00|750.00|||2|
1900|ML|3|192.193.161||TEA|TEA|||||DIR||3|1|1|291.60|540.00|||2|
1901|ML|4|192.193.162||TEA|TEA|||||DIR||3|1|1|405.00|750.00|||2|
1902|ML|3|192.193.163||JOP|JOP|||||DIR||3|1|1|291.60|540.00|||2|
1903|ML|4|192.193.164||JOP|JOP|||||DIR||3|1|1|405.00|750.00|||2|
1904|ML|3|192.193.165||AZB|AZB|||||DIR||3|1|1|291.60|540.00|||2|
1905|ML|4|192.193.166||AZB|AZB|||||DIR||3|1|1|405.00|750.00|||2|
1906|ML|3|192.193.167||DEN|DEN|||||DIR||3|1|1|291.60|540.00|||2|
1907|ML|4|192.193.168||DEN|DEN|||||DIR||3|1|1|405.00|750.00|||2|
1908|ML|3|192.193.169||BLK|BLK|||||DIR||3|1|1|291.60|540.00|||2|
1909|ML|4|192.193.170||BLK|BLK|||||DIR||3|1|1|405.00|750.00|||2|
1910|ML|3|192.193.171||ART|ART|||||DIR||3|1|1|291.60|540.00|||2|
1911|ML|4|192.193.172||ART|ART|||||DIR||3|1|1|405.00|750.00|||2|
1912|ML|3|192.193.173||LIN|LIN|||||DIR||3|1|1|291.60|540.00|||2|
1913|ML|4|192.193.174||LIN|LIN|||||DIR||3|1|1|405.00|750.00|||2|
1914|ML|3|192.193.175||HAL|HAL|||||DIR||3|1|1|291.60|540.00|||2|
1915|ML|4|192.193.176||HAL|HAL|||||DIR||3|1|1|405.00|750.00|||2|
1916|ML|3|192.194.3||WH|WH|||||ESQ||3|1|1|291.60|540.00|||2|
1917|ML|4|192.194.4||WH|WH|||||ESQ||3|1|1|427.68|792.00|||2|
1918|ML|3|192.194.5||WH|AZB|||||ESQ||3|1|1|291.60|540.00|||2|
1919|ML|4|192.194.6||WH|AZB|||||ESQ||3|1|1|427.68|792.00|||2|
1920|ML|3|192.194.9||WH|BCO|B||||ESQ||3|1|1|318.60|590.00|||2|
1921|ML|4|192.194.10||WH|BCO|B||||ESQ||3|1|1|454.68|842.00|||2|
1922|ML|3|192.194.11||WH|BCO|M||||ESQ||3|1|1|318.60|590.00|||2|
1923|ML|4|192.194.12||WH|BCO|M||||ESQ||3|1|1|454.68|842.00|||2|
1924|ML|3|192.194.13||WH|CCL|B||||ESQ||3|1|1|318.60|590.00|||2|
1925|ML|4|192.194.14||WH|CCL|B||||ESQ||3|1|1|454.68|842.00|||2|
1926|ML|3|192.194.15||WH|CCL|M||||ESQ||3|1|1|318.60|590.00|||2|
1927|ML|4|192.194.16||WH|CCL|M||||ESQ||3|1|1|454.68|842.00|||2|
1928|ML|3|192.194.17||WH|CME|B||||ESQ||3|1|1|318.60|590.00|||2|
1929|ML|4|192.194.18||WH|CME|B||||ESQ||3|1|1|454.68|842.00|||2|
1930|ML|3|192.194.19||WH|CME|M||||ESQ||3|1|1|318.60|590.00|||2|
1931|ML|4|192.194.20||WH|CME|M||||ESQ||3|1|1|454.68|842.00|||2|
1932|ML|3|192.194.21||WH|ANT|B||||ESQ||3|1|1|318.60|590.00|||2|
1933|ML|4|192.194.22||WH|ANT|B||||ESQ||3|1|1|454.68|842.00|||2|
1934|ML|3|192.194.23||WH|ANT|M||||ESQ||3|1|1|318.60|590.00|||2|
1935|ML|4|192.194.24||WH|ANT|M||||ESQ||3|1|1|454.68|842.00|||2|
1936|ML|3|192.194.25||WH|PTO|B||||ESQ||3|1|1|318.60|590.00|||2|
1937|ML|4|192.194.26||WH|PTO|B||||ESQ||3|1|1|454.68|842.00|||2|
1938|ML|3|192.194.27||WH|PTO|M||||ESQ||3|1|1|318.60|590.00|||2|
1939|ML|4|192.194.28||WH|PTO|M||||ESQ||3|1|1|454.68|842.00|||2|
1940|ML|3|192.194.29||WH|CRE|B||||ESQ||3|1|1|318.60|590.00|||2|
1941|ML|4|192.194.30||WH|CRE|B||||ESQ||3|1|1|454.68|842.00|||2|
1942|ML|3|192.194.31||WH|CRE|M||||ESQ||3|1|1|318.60|590.00|||2|
1943|ML|4|192.194.32||WH|CRE|M||||ESQ||3|1|1|454.68|842.00|||2|
1944|ML|3|192.194.33||WH|CAM|B||||ESQ||3|1|1|318.60|590.00|||2|
1945|ML|4|192.194.34||WH|CAM|B||||ESQ||3|1|1|454.68|842.00|||2|
1946|ML|3|192.194.35||WH|CAM|M||||ESQ||3|1|1|318.60|590.00|||2|
1947|ML|4|192.194.36||WH|CAM|M||||ESQ||3|1|1|454.68|842.00|||2|
1948|ML|3|192.194.37||WH|OUR|B||||ESQ||3|1|1|318.60|590.00|||2|
1949|ML|4|192.194.38||WH|OUR|B||||ESQ||3|1|1|454.68|842.00|||2|
1950|ML|3|192.194.39||WH|OUR|M||||ESQ||3|1|1|318.60|590.00|||2|
1951|ML|4|192.194.40||WH|OUR|M||||ESQ||3|1|1|454.68|842.00|||2|
1952|ML|3|192.194.41||WH|COB|B||||ESQ||3|1|1|318.60|590.00|||2|
1953|ML|4|192.194.42||WH|COB|B||||ESQ||3|1|1|454.68|842.00|||2|
1954|ML|3|192.194.43||WH|COB|M||||ESQ||3|1|1|318.60|590.00|||2|
1955|ML|4|192.194.44||WH|COB|M||||ESQ||3|1|1|454.68|842.00|||2|
1956|ML|3|192.194.45||WH|CHO|B||||ESQ||3|1|1|318.60|590.00|||2|
1957|ML|4|192.194.46||WH|CHO|B||||ESQ||3|1|1|454.68|842.00|||2|
1958|ML|3|192.194.47||WH|CHO|M||||ESQ||3|1|1|318.60|590.00|||2|
1959|ML|4|192.194.48||WH|CHO|M||||ESQ||3|1|1|454.68|842.00|||2|
1960|ML|3|192.194.49||WH|VAG|B||||ESQ||3|1|1|318.60|590.00|||2|
1961|ML|4|192.194.50||WH|VAG|B||||ESQ||3|1|1|454.68|842.00|||2|
1962|ML|3|192.194.51||WH|VAG|M||||ESQ||3|1|1|318.60|590.00|||2|
1963|ML|4|192.194.52||WH|VAG|M||||ESQ||3|1|1|454.68|842.00|||2|
1964|ML|3|192.194.53||WH|AZE|B||||ESQ||3|1|1|318.60|590.00|||2|
1965|ML|4|192.194.54||WH|AZE|B||||ESQ||3|1|1|454.68|842.00|||2|
1966|ML|3|192.194.55||WH|AZE|M||||ESQ||3|1|1|318.60|590.00|||2|
1967|ML|4|192.194.56||WH|AZE|M||||ESQ||3|1|1|454.68|842.00|||2|
1968|ML|3|192.194.57||WH|AMA|B||||ESQ||3|1|1|318.60|590.00|||2|
1969|ML|4|192.194.58||WH|AMA|B||||ESQ||3|1|1|454.68|842.00|||2|
1970|ML|3|192.194.59||WH|AMA|M||||ESQ||3|1|1|318.60|590.00|||2|
1971|ML|4|192.194.60||WH|AMA|M||||ESQ||3|1|1|454.68|842.00|||2|
1972|ML|3|192.194.61||WH|AES|B||||ESQ||3|1|1|318.60|590.00|||2|
1973|ML|4|192.194.62||WH|AES|B||||ESQ||3|1|1|454.68|842.00|||2|
1974|ML|3|192.194.63||WH|AES|M||||ESQ||3|1|1|318.60|590.00|||2|
1975|ML|4|192.194.64||WH|AES|M||||ESQ||3|1|1|454.68|842.00|||2|
1976|ML|3|192.194.65||WH|PRA|B||||ESQ||3|1|1|318.60|590.00|||2|
1977|ML|4|192.194.66||WH|PRA|B||||ESQ||3|1|1|454.68|842.00|||2|
1978|ML|3|192.194.67||WH|PRA|M||||ESQ||3|1|1|318.60|590.00|||2|
1979|ML|4|192.194.68||WH|PRA|M||||ESQ||3|1|1|454.68|842.00|||2|
1980|ML|3|192.194.69||WH|ROS|B||||ESQ||3|1|1|318.60|590.00|||2|
1981|ML|4|192.194.70||WH|ROS|B||||ESQ||3|1|1|454.68|842.00|||2|
1982|ML|3|192.194.71||WH|ROS|M||||ESQ||3|1|1|318.60|590.00|||2|
1983|ML|4|192.194.72||WH|ROS|M||||ESQ||3|1|1|454.68|842.00|||2|
1984|ML|3|192.194.73||WH|VER|B||||ESQ||3|1|1|318.60|590.00|||2|
1985|ML|4|192.194.74||WH|VER|B||||ESQ||3|1|1|454.68|842.00|||2|
1986|ML|3|192.194.75||WH|VER|M||||ESQ||3|1|1|318.60|590.00|||2|
1987|ML|4|192.194.76||WH|VER|M||||ESQ||3|1|1|454.68|842.00|||2|
1988|ML|3|192.194.77||WH|OAK|||||ESQ||3|1|1|318.60|590.00|||2|
1989|ML|4|192.194.78||WH|OAK|||||ESQ||3|1|1|454.68|842.00|||2|
1990|ML|3|192.194.79||WH|TEA|||||ESQ||3|1|1|318.60|590.00|||2|
1991|ML|4|192.194.80||WH|TEA|||||ESQ||3|1|1|454.68|842.00|||2|
1992|ML|3|192.194.81||WH|JOP|||||ESQ||3|1|1|318.60|590.00|||2|
1993|ML|4|192.194.82||WH|JOP|||||ESQ||3|1|1|454.68|842.00|||2|
1994|ML|3|192.194.186||WH|DEN|||||ESQ||3|1|1|318.60|590.00|||2|
1995|ML|4|192.194.187||WH|DEN|||||ESQ||3|1|1|454.68|842.00|||2|
1996|ML|3|192.194.83||WH|BLK|||||ESQ||3|1|1|318.60|590.00|||2|
1997|ML|4|192.194.84||WH|BLK|||||ESQ||3|1|1|454.68|842.00|||2|
1998|ML|3|192.194.85||WH|ART|||||ESQ||3|1|1|318.60|590.00|||2|
1999|ML|4|192.194.86||WH|ART|||||ESQ||3|1|1|454.68|842.00|||2|
2000|ML|3|192.194.87||WH|LIN|||||ESQ||3|1|1|318.60|590.00|||2|
2001|ML|4|192.194.88||WH|LIN|||||ESQ||3|1|1|454.68|842.00|||2|
2002|ML|3|192.194.89||WH|HAL|||||ESQ||3|1|1|318.60|590.00|||2|
2003|ML|4|192.194.90||WH|HAL|||||ESQ||3|1|1|454.68|842.00|||2|
2004|ML|3|192.194.91||BCO|BCO|B||||ESQ||3|1|1|340.20|630.00|||2|
2005|ML|4|192.194.92||BCO|BCO|B||||ESQ||3|1|1|476.28|882.00|||2|
2006|ML|3|192.194.93||BCO|BCO|M||||ESQ||3|1|1|340.20|630.00|||2|
2007|ML|4|192.194.94||BCO|BCO|M||||ESQ||3|1|1|476.28|882.00|||2|
2008|ML|3|192.194.95||CCL|CCL|B||||ESQ||3|1|1|340.20|630.00|||2|
2009|ML|4|192.194.96||CCL|CCL|B||||ESQ||3|1|1|476.28|882.00|||2|
2010|ML|3|192.194.97||CCL|CCL|M||||ESQ||3|1|1|340.20|630.00|||2|
2011|ML|4|192.194.98||CCL|CCL|M||||ESQ||3|1|1|476.28|882.00|||2|
2012|ML|3|192.194.99||CME|CME|B||||ESQ||3|1|1|340.20|630.00|||2|
2013|ML|4|192.194.100||CME|CME|B||||ESQ||3|1|1|476.28|882.00|||2|
2014|ML|3|192.194.101||CME|CME|M||||ESQ||3|1|1|340.20|630.00|||2|
2015|ML|4|192.194.102||CME|CME|M||||ESQ||3|1|1|476.28|882.00|||2|
2016|ML|3|192.194.103||ANT|ANT|B||||ESQ||3|1|1|340.20|630.00|||2|
2017|ML|4|192.194.104||ANT|ANT|B||||ESQ||3|1|1|476.28|882.00|||2|
2018|ML|3|192.194.105||ANT|ANT|M||||ESQ||3|1|1|340.20|630.00|||2|
2019|ML|4|192.194.106||ANT|ANT|M||||ESQ||3|1|1|476.28|882.00|||2|
2020|ML|3|192.194.107||PTO|PTO|B||||ESQ||3|1|1|340.20|630.00|||2|
2021|ML|4|192.194.108||PTO|PTO|B||||ESQ||3|1|1|476.28|882.00|||2|
2022|ML|3|192.194.109||PTO|PTO|M||||ESQ||3|1|1|340.20|630.00|||2|
2023|ML|4|192.194.110||PTO|PTO|M||||ESQ||3|1|1|476.28|882.00|||2|
2024|ML|3|192.194.111||CRE|CRE|B||||ESQ||3|1|1|340.20|630.00|||2|
2025|ML|4|192.194.112||CRE|CRE|B||||ESQ||3|1|1|476.28|882.00|||2|
2026|ML|3|192.194.113||CRE|CRE|M||||ESQ||3|1|1|340.20|630.00|||2|
2027|ML|4|192.194.114||CRE|CRE|M||||ESQ||3|1|1|476.28|882.00|||2|
2028|ML|3|192.194.115||CAM|CAM|B||||ESQ||3|1|1|340.20|630.00|||2|
2029|ML|4|192.194.116||CAM|CAM|B||||ESQ||3|1|1|476.28|882.00|||2|
2030|ML|3|192.194.117||CAM|CAM|M||||ESQ||3|1|1|340.20|630.00|||2|
2031|ML|4|192.194.118||CAM|CAM|M||||ESQ||3|1|1|476.28|882.00|||2|
2032|ML|3|192.194.119||OUR|OUR|B||||ESQ||3|1|1|340.20|630.00|||2|
2033|ML|4|192.194.120||OUR|OUR|B||||ESQ||3|1|1|476.28|882.00|||2|
2034|ML|3|192.194.121||OUR|OUR|M||||ESQ||3|1|1|340.20|630.00|||2|
2035|ML|4|192.194.122||OUR|OUR|M||||ESQ||3|1|1|476.28|882.00|||2|
2036|ML|3|192.194.123||COB|COB|B||||ESQ||3|1|1|340.20|630.00|||2|
2037|ML|4|192.194.124||COB|COB|B||||ESQ||3|1|1|476.28|882.00|||2|
2038|ML|3|192.194.125||COB|COB|M||||ESQ||3|1|1|340.20|630.00|||2|
2039|ML|4|192.194.126||COB|COB|M||||ESQ||3|1|1|476.28|882.00|||2|
2040|ML|3|192.194.127||CHO|CHO|B||||ESQ||3|1|1|340.20|630.00|||2|
2041|ML|4|192.194.128||CHO|CHO|B||||ESQ||3|1|1|476.28|882.00|||2|
2042|ML|3|192.194.129||CHO|CHO|M||||ESQ||3|1|1|340.20|630.00|||2|
2043|ML|4|192.194.130||CHO|CHO|M||||ESQ||3|1|1|476.28|882.00|||2|
2044|ML|3|192.194.131||VAG|VAG|B||||ESQ||3|1|1|340.20|630.00|||2|
2045|ML|4|192.194.132||VAG|VAG|B||||ESQ||3|1|1|476.28|882.00|||2|
2046|ML|3|192.194.133||VAG|VAG|M||||ESQ||3|1|1|340.20|630.00|||2|
2047|ML|4|192.194.134||VAG|VAG|M||||ESQ||3|1|1|476.28|882.00|||2|
2048|ML|3|192.194.135||AZE|AZE|B||||ESQ||3|1|1|340.20|630.00|||2|
2049|ML|4|192.194.136||AZE|AZE|B||||ESQ||3|1|1|476.28|882.00|||2|
2050|ML|3|192.194.137||AZE|AZE|M||||ESQ||3|1|1|340.20|630.00|||2|
2051|ML|4|192.194.138||AZE|AZE|M||||ESQ||3|1|1|476.28|882.00|||2|
2052|ML|3|192.194.139||AMA|AMA|B||||ESQ||3|1|1|340.20|630.00|||2|
2053|ML|4|192.194.140||AMA|AMA|B||||ESQ||3|1|1|476.28|882.00|||2|
2054|ML|3|192.194.141||AMA|AMA|M||||ESQ||3|1|1|340.20|630.00|||2|
2055|ML|4|192.194.142||AMA|AMA|M||||ESQ||3|1|1|476.28|882.00|||2|
2056|ML|3|192.194.143||AES|AES|B||||ESQ||3|1|1|340.20|630.00|||2|
2057|ML|4|192.194.144||AES|AES|B||||ESQ||3|1|1|476.28|882.00|||2|
2058|ML|3|192.194.145||AES|AES|M||||ESQ||3|1|1|340.20|630.00|||2|
2059|ML|4|192.194.146||AES|AES|M||||ESQ||3|1|1|476.28|882.00|||2|
2060|ML|3|192.194.147||PRA|PRA|B||||ESQ||3|1|1|340.20|630.00|||2|
2061|ML|4|192.194.148||PRA|PRA|B||||ESQ||3|1|1|476.28|882.00|||2|
2062|ML|3|192.194.149||PRA|PRA|M||||ESQ||3|1|1|340.20|630.00|||2|
2063|ML|4|192.194.150||PRA|PRA|M||||ESQ||3|1|1|476.28|882.00|||2|
2064|ML|3|192.194.151||ROS|ROS|B||||ESQ||3|1|1|340.20|630.00|||2|
2065|ML|4|192.194.152||ROS|ROS|B||||ESQ||3|1|1|476.28|882.00|||2|
2066|ML|3|192.194.153||ROS|ROS|M||||ESQ||3|1|1|340.20|630.00|||2|
2067|ML|4|192.194.154||ROS|ROS|M||||ESQ||3|1|1|476.28|882.00|||2|
2068|ML|3|192.194.155||VER|VER|B||||ESQ||3|1|1|340.20|630.00|||2|
2069|ML|4|192.194.156||VER|VER|B||||ESQ||3|1|1|476.28|882.00|||2|
2070|ML|3|192.194.157||VER|VER|M||||ESQ||3|1|1|340.20|630.00|||2|
2071|ML|4|192.194.158||VER|VER|M||||ESQ||3|1|1|476.28|882.00|||2|
2072|ML|3|192.194.159||OAK|OAK|||||ESQ||3|1|1|340.20|630.00|||2|
2073|ML|4|192.194.160||OAK|OAK|||||ESQ||3|1|1|476.28|882.00|||2|
2074|ML|3|192.194.161||TEA|TEA|||||ESQ||3|1|1|340.20|630.00|||2|
2075|ML|4|192.194.162||TEA|TEA|||||ESQ||3|1|1|476.28|882.00|||2|
2076|ML|3|192.194.163||JOP|JOP|||||ESQ||3|1|1|340.20|630.00|||2|
2077|ML|4|192.194.164||JOP|JOP|||||ESQ||3|1|1|476.28|882.00|||2|
2078|ML|3|192.194.165||AZB|AZB|||||ESQ||3|1|1|340.20|630.00|||2|
2079|ML|4|192.194.166||AZB|AZB|||||ESQ||3|1|1|476.28|882.00|||2|
2080|ML|3|192.194.167||DEN|DEN|||||ESQ||3|1|1|340.20|630.00|||2|
2081|ML|4|192.194.168||DEN|DEN|||||ESQ||3|1|1|476.28|882.00|||2|
2082|ML|3|192.194.169||BLK|BLK|||||ESQ||3|1|1|340.20|630.00|||2|
2083|ML|4|192.194.170||BLK|BLK|||||ESQ||3|1|1|476.28|882.00|||2|
2084|ML|3|192.194.171||ART|ART|||||ESQ||3|1|1|340.20|630.00|||2|
2085|ML|4|192.194.172||ART|ART|||||ESQ||3|1|1|476.28|882.00|||2|
2086|ML|3|192.194.173||LIN|LIN|||||ESQ||3|1|1|340.20|630.00|||2|
2087|ML|4|192.194.174||LIN|LIN|||||ESQ||3|1|1|476.28|882.00|||2|
2088|ML|3|192.194.175||HAL|HAL|||||ESQ||3|1|1|340.20|630.00|||2|
2089|ML|4|192.194.176||HAL|HAL|||||ESQ||3|1|1|476.28|882.00|||2|
2090|ML|5|195.196.197||TBL|TBL|||||||4|1|1|129.60|240.00|||3|
2091|ML|5|195.196.198||TEA|TEA|||||||4|1|1|129.60|240.00|||3|
2092|ML|5|195.196.199||OAK|OAK|||||||4|1|1|129.60|240.00|||3|
2093|ML|5|195.196.200||JOP|JOP|||||||4|1|1|129.60|240.00|||3|
2094|ML|5|195.196.201||TBL|BCO|B||||||4|1|1|156.60|290.00|||3|
2095|ML|5|195.196.202||TBL|BCO|M||||||4|1|1|156.60|290.00|||3|
2096|ML|5|195.196.203||TBL|CCL|B||||||4|1|1|156.60|290.00|||3|
2097|ML|5|195.196.204||TBL|CCL|M||||||4|1|1|156.60|290.00|||3|
2098|ML|5|195.196.205||TBL|CME|B||||||4|1|1|156.60|290.00|||3|
2099|ML|5|195.196.206||TBL|CME|M||||||4|1|1|156.60|290.00|||3|
2100|ML|5|195.196.207||TBL|ANT|B||||||4|1|1|156.60|290.00|||3|
2101|ML|5|195.196.208||TBL|ANT|M||||||4|1|1|156.60|290.00|||3|
2102|ML|5|195.196.209||TBL|PTO|B||||||4|1|1|156.60|290.00|||3|
2103|ML|5|195.196.210||TBL|PTO|M||||||4|1|1|156.60|290.00|||3|
2104|ML|5|195.196.211||TBL|CRE|B||||||4|1|1|156.60|290.00|||3|
2105|ML|5|195.196.212||TBL|CRE|M||||||4|1|1|156.60|290.00|||3|
2106|ML|5|195.196.213||TBL|CAM|B||||||4|1|1|156.60|290.00|||3|
2107|ML|5|195.196.214||TBL|CAM|M||||||4|1|1|156.60|290.00|||3|
2108|ML|5|195.196.215||TBL|OUR|B||||||4|1|1|156.60|290.00|||3|
2109|ML|5|195.196.216||TBL|OUR|M||||||4|1|1|156.60|290.00|||3|
2110|ML|5|195.196.217||TBL|COB|B||||||4|1|1|156.60|290.00|||3|
2111|ML|5|195.196.218||TBL|COB|M||||||4|1|1|156.60|290.00|||3|
2112|ML|5|195.196.219||TBL|CHO|B||||||4|1|1|156.60|290.00|||3|
2113|ML|5|195.196.220||TBL|CHO|M||||||4|1|1|156.60|290.00|||3|
2114|ML|5|195.196.221||TBL|VAG|B||||||4|1|1|156.60|290.00|||3|
2115|ML|5|195.196.222||TBL|VAG|M||||||4|1|1|156.60|290.00|||3|
2116|ML|5|195.196.223||TBL|AZE|B||||||4|1|1|156.60|290.00|||3|
2117|ML|5|195.196.224||TBL|AZE|M||||||4|1|1|156.60|290.00|||3|
2118|ML|5|195.196.225||TBL|AMA|B||||||4|1|1|156.60|290.00|||3|
2119|ML|5|195.196.226||TBL|AMA|M||||||4|1|1|156.60|290.00|||3|
2120|ML|5|195.196.227||TBL|AES|B||||||4|1|1|156.60|290.00|||3|
2121|ML|5|195.196.228||TBL|AES|M||||||4|1|1|156.60|290.00|||3|
2122|ML|5|195.196.229||TBL|PRA|B||||||4|1|1|156.60|290.00|||3|
2123|ML|5|195.196.230||TBL|PRA|M||||||4|1|1|156.60|290.00|||3|
2124|ML|5|195.196.231||TBL|ROS|B||||||4|1|1|156.60|290.00|||3|
2125|ML|5|195.196.232||TBL|ROS|M||||||4|1|1|156.60|290.00|||3|
2126|ML|5|195.196.233||TBL|VER|B||||||4|1|1|156.60|290.00|||3|
2127|ML|5|195.196.234||TBL|VER|M||||||4|1|1|156.60|290.00|||3|
2128|ML|5|195.196.235||TBL|AZB|||||||4|1|1|156.60|290.00|||3|
2129|ML|5|195.196.236||TBL|DEN|||||||4|1|1|156.60|290.00|||3|
2130|ML|5|195.196.237||TBL|BLK|||||||4|1|1|156.60|290.00|||3|
2131|ML|5|195.196.238||TBL|ART|||||||4|1|1|156.60|290.00|||3|
2132|ML|5|195.196.239||TBL|LIN|||||||4|1|1|156.60|290.00|||3|
2133|ML|5|195.196.240||TBL|HAL|||||||4|1|1|156.60|290.00|||3|
2134|ML|5|195.196.91||BCO|BCO|B||||||4|1|1|178.20|330.00|||3|
2135|ML|5|195.196.93||BCO|BCO|M||||||4|1|1|178.20|330.00|||3|
2136|ML|5|195.196.95||CCL|CCL|B||||||4|1|1|178.20|330.00|||3|
2137|ML|5|195.196.97||CCL|CCL|M||||||4|1|1|178.20|330.00|||3|
2138|ML|5|195.196.99||CME|CME|B||||||4|1|1|178.20|330.00|||3|
2139|ML|5|195.196.101||CME|CME|M||||||4|1|1|178.20|330.00|||3|
2140|ML|5|195.196.103||ANT|ANT|B||||||4|1|1|178.20|330.00|||3|
2141|ML|5|195.196.105||ANT|ANT|M||||||4|1|1|178.20|330.00|||3|
2142|ML|5|195.196.107||PTO|PTO|B||||||4|1|1|178.20|330.00|||3|
2143|ML|5|195.196.109||PTO|PTO|M||||||4|1|1|178.20|330.00|||3|
2144|ML|5|195.196.111||CRE|CRE|B||||||4|1|1|178.20|330.00|||3|
2145|ML|5|195.196.113||CRE|CRE|M||||||4|1|1|178.20|330.00|||3|
2146|ML|5|195.196.115||CAM|CAM|B||||||4|1|1|178.20|330.00|||3|
2147|ML|5|195.196.117||CAM|CAM|M||||||4|1|1|178.20|330.00|||3|
2148|ML|5|195.196.119||OUR|OUR|B||||||4|1|1|178.20|330.00|||3|
2149|ML|5|195.196.121||OUR|OUR|M||||||4|1|1|178.20|330.00|||3|
2150|ML|5|195.196.123||COB|COB|B||||||4|1|1|178.20|330.00|||3|
2151|ML|5|195.196.125||COB|COB|M||||||4|1|1|178.20|330.00|||3|
2152|ML|5|195.196.127||CHO|CHO|B||||||4|1|1|178.20|330.00|||3|
2153|ML|5|195.196.129||CHO|CHO|M||||||4|1|1|178.20|330.00|||3|
2154|ML|5|195.196.131||VAG|VAG|B||||||4|1|1|178.20|330.00|||3|
2155|ML|5|195.196.133||VAG|VAG|M||||||4|1|1|178.20|330.00|||3|
2156|ML|5|195.196.135||AZE|AZE|B||||||4|1|1|178.20|330.00|||3|
2157|ML|5|195.196.137||AZE|AZE|M||||||4|1|1|178.20|330.00|||3|
2158|ML|5|195.196.139||AMA|AMA|B||||||4|1|1|178.20|330.00|||3|
2159|ML|5|195.196.141||AMA|AMA|M||||||4|1|1|178.20|330.00|||3|
2160|ML|5|195.196.143||AES|AES|B||||||4|1|1|178.20|330.00|||3|
2161|ML|5|195.196.145||AES|AES|M||||||4|1|1|178.20|330.00|||3|
2162|ML|5|195.196.147||PRA|PRA|B||||||4|1|1|178.20|330.00|||3|
2163|ML|5|195.196.149||PRA|PRA|M||||||4|1|1|178.20|330.00|||3|
2164|ML|5|195.196.151||ROS|ROS|B||||||4|1|1|178.20|330.00|||3|
2165|ML|5|195.196.153||ROS|ROS|M||||||4|1|1|178.20|330.00|||3|
2166|ML|5|195.196.155||VER|VER|B||||||4|1|1|178.20|330.00|||3|
2167|ML|5|195.196.157||VER|VER|M||||||4|1|1|178.20|330.00|||3|
2168|ML|5|195.196.165||AZB|AZB|||||||4|1|1|178.20|330.00|||3|
2169|ML|5|195.196.167||DEN|DEN|||||||4|1|1|178.20|330.00|||3|
2170|ML|5|195.196.169||BLK|BLK|||||||4|1|1|178.20|330.00|||3|
2171|ML|5|195.196.171||ART|ART|||||||4|1|1|178.20|330.00|||3|
2172|ML|5|195.196.173||LIN|LIN|||||||4|1|1|178.20|330.00|||3|
2173|ML|5|195.196.175||HAL|HAL|||||||4|1|1|178.20|330.00|||3|
2174|ML|6|195.196.241||TBL|TBL|||||||4|1|1|124.20|230.00|||3|
2175|ML|6|195.196.242||TEA|TEA|||||||4|1|1|124.20|230.00|||3|
2176|ML|6|195.196.243||OAK|OAK|||||||4|1|1|124.20|230.00|||3|
2177|ML|6|195.196.244||JOP|JOP|||||||4|1|1|124.20|230.00|||3|
2178|ML|6|195.196.245||TBL|BCO|B||||||4|1|1|151.20|280.00|||3|
2179|ML|6|195.196.246||TBL|BCO|M||||||4|1|1|151.20|280.00|||3|
2180|ML|6|195.196.247||TBL|CCL|B||||||4|1|1|151.20|280.00|||3|
2181|ML|6|195.196.248||TBL|CCL|M||||||4|1|1|151.20|280.00|||3|
2182|ML|6|195.196.249||TBL|CME|B||||||4|1|1|151.20|280.00|||3|
2183|ML|6|195.196.250||TBL|CME|M||||||4|1|1|151.20|280.00|||3|
2184|ML|6|195.196.251||TBL|ANT|B||||||4|1|1|151.20|280.00|||3|
2185|ML|6|195.196.252||TBL|ANT|M||||||4|1|1|151.20|280.00|||3|
2186|ML|6|195.196.253||TBL|PTO|B||||||4|1|1|151.20|280.00|||3|
2187|ML|6|195.196.254||TBL|PTO|M||||||4|1|1|151.20|280.00|||3|
2188|ML|6|195.196.255||TBL|CRE|B||||||4|1|1|151.20|280.00|||3|
2189|ML|6|195.196.256||TBL|CRE|M||||||4|1|1|151.20|280.00|||3|
2190|ML|6|195.196.257||TBL|CAM|B||||||4|1|1|151.20|280.00|||3|
2191|ML|6|195.196.258||TBL|CAM|M||||||4|1|1|151.20|280.00|||3|
2192|ML|6|195.196.259||TBL|OUR|B||||||4|1|1|151.20|280.00|||3|
2193|ML|6|195.196.260||TBL|OUR|M||||||4|1|1|151.20|280.00|||3|
2194|ML|6|195.196.261||TBL|COB|B||||||4|1|1|151.20|280.00|||3|
2195|ML|6|195.196.262||TBL|COB|M||||||4|1|1|151.20|280.00|||3|
2196|ML|6|195.196.263||TBL|CHO|B||||||4|1|1|151.20|280.00|||3|
2197|ML|6|195.196.264||TBL|CHO|M||||||4|1|1|151.20|280.00|||3|
2198|ML|6|195.196.265||TBL|VAG|B||||||4|1|1|151.20|280.00|||3|
2199|ML|6|195.196.266||TBL|VAG|M||||||4|1|1|151.20|280.00|||3|
2200|ML|6|195.196.267||TBL|AZE|B||||||4|1|1|151.20|280.00|||3|
2201|ML|6|195.196.268||TBL|AZE|M||||||4|1|1|151.20|280.00|||3|
2202|ML|6|195.196.269||TBL|AMA|B||||||4|1|1|151.20|280.00|||3|
2203|ML|6|195.196.270||TBL|AMA|M||||||4|1|1|151.20|280.00|||3|
2204|ML|6|195.196.271||TBL|AES|B||||||4|1|1|151.20|280.00|||3|
2205|ML|6|195.196.272||TBL|AES|M||||||4|1|1|151.20|280.00|||3|
2206|ML|6|195.196.273||TBL|PRA|B||||||4|1|1|151.20|280.00|||3|
2207|ML|6|195.196.274||TBL|PRA|M||||||4|1|1|151.20|280.00|||3|
2208|ML|6|195.196.275||TBL|ROS|B||||||4|1|1|151.20|280.00|||3|
2209|ML|6|195.196.276||TBL|ROS|M||||||4|1|1|151.20|280.00|||3|
2210|ML|6|195.196.277||TBL|VER|B||||||4|1|1|151.20|280.00|||3|
2211|ML|6|195.196.278||TBL|VER|M||||||4|1|1|151.20|280.00|||3|
2212|ML|6|195.196.279||TBL|AZB|||||||4|1|1|151.20|280.00|||3|
2213|ML|6|195.196.280||TBL|DEN|||||||4|1|1|151.20|280.00|||3|
2214|ML|6|195.196.281||TBL|BLK|||||||4|1|1|151.20|280.00|||3|
2215|ML|6|195.196.282||TBL|ART|||||||4|1|1|151.20|280.00|||3|
2216|ML|6|195.196.283||TBL|LIN|||||||4|1|1|151.20|280.00|||3|
2217|ML|6|195.196.284||TBL|HAL|||||||4|1|1|151.20|280.00|||3|
2218|ML|6|195.196.285||BCO|BCO|B||||||4|1|1|172.80|320.00|||3|
2219|ML|6|195.196.286||BCO|BCO|M||||||4|1|1|172.80|320.00|||3|
2220|ML|6|195.196.287||CCL|CCL|B||||||4|1|1|172.80|320.00|||3|
2221|ML|6|195.196.288||CCL|CCL|M||||||4|1|1|172.80|320.00|||3|
2222|ML|6|195.196.289||CME|CME|B||||||4|1|1|172.80|320.00|||3|
2223|ML|6|195.196.290||CME|CME|M||||||4|1|1|172.80|320.00|||3|
2224|ML|6|195.196.291||ANT|ANT|B||||||4|1|1|172.80|320.00|||3|
2225|ML|6|195.196.292||ANT|ANT|M||||||4|1|1|172.80|320.00|||3|
2226|ML|6|195.196.293||PTO|PTO|B||||||4|1|1|172.80|320.00|||3|
2227|ML|6|195.196.294||PTO|PTO|M||||||4|1|1|172.80|320.00|||3|
2228|ML|6|195.196.295||CRE|CRE|B||||||4|1|1|172.80|320.00|||3|
2229|ML|6|195.196.296||CRE|CRE|M||||||4|1|1|172.80|320.00|||3|
2230|ML|6|195.196.297||CAM|CAM|B||||||4|1|1|172.80|320.00|||3|
2231|ML|6|195.196.298||CAM|CAM|M||||||4|1|1|172.80|320.00|||3|
2232|ML|6|195.196.299||OUR|OUR|B||||||4|1|1|172.80|320.00|||3|
2233|ML|6|195.196.300||OUR|OUR|M||||||4|1|1|172.80|320.00|||3|
2234|ML|6|195.196.301||COB|COB|B||||||4|1|1|172.80|320.00|||3|
2235|ML|6|195.196.302||COB|COB|M||||||4|1|1|172.80|320.00|||3|
2236|ML|6|195.196.303||CHO|CHO|B||||||4|1|1|172.80|320.00|||3|
2237|ML|6|195.196.304||CHO|CHO|M||||||4|1|1|172.80|320.00|||3|
2238|ML|6|195.196.305||VAG|VAG|B||||||4|1|1|172.80|320.00|||3|
2239|ML|6|195.196.306||VAG|VAG|M||||||4|1|1|172.80|320.00|||3|
2240|ML|6|195.196.307||AZE|AZE|B||||||4|1|1|172.80|320.00|||3|
2241|ML|6|195.196.308||AZE|AZE|M||||||4|1|1|172.80|320.00|||3|
2242|ML|6|195.196.309||AMA|AMA|B||||||4|1|1|172.80|320.00|||3|
2243|ML|6|195.196.310||AMA|AMA|M||||||4|1|1|172.80|320.00|||3|
2244|ML|6|195.196.311||AES|AES|B||||||4|1|1|172.80|320.00|||3|
2245|ML|6|195.196.312||AES|AES|M||||||4|1|1|172.80|320.00|||3|
2246|ML|6|195.196.313||PRA|PRA|B||||||4|1|1|172.80|320.00|||3|
2247|ML|6|195.196.314||PRA|PRA|M||||||4|1|1|172.80|320.00|||3|
2248|ML|6|195.196.315||ROS|ROS|B||||||4|1|1|172.80|320.00|||3|
2249|ML|6|195.196.316||ROS|ROS|M||||||4|1|1|172.80|320.00|||3|
2250|ML|6|195.196.317||VER|VER|B||||||4|1|1|172.80|320.00|||3|
2251|ML|6|195.196.318||VER|VER|M||||||4|1|1|172.80|320.00|||3|
2252|ML|6|195.196.319||AZB|AZB|||||||4|1|1|172.80|320.00|||3|
2253|ML|6|195.196.320||DEN|DEN|||||||4|1|1|172.80|320.00|||3|
2254|ML|6|195.196.321||BLK|BLK|||||||4|1|1|172.80|320.00|||3|
2255|ML|6|195.196.322||ART|ART|||||||4|1|1|172.80|320.00|||3|
2256|ML|6|195.196.323||LIN|LIN|||||||4|1|1|172.80|320.00|||3|
2257|ML|6|195.196.324||HAL|HAL|||||||4|1|1|172.80|320.00|||3|
2258|ML|5|325.196.197||TBL|TBL|||||||5|1|1|135.00|250.00|||3|
2259|ML|5|325.196.198||TEA|TEA|||||||5|1|1|135.00|250.00|||3|
2260|ML|5|325.196.199||OAK|OAK|||||||5|1|1|135.00|250.00|||3|
2261|ML|5|325.196.200||JOP|JOP|||||||5|1|1|135.00|250.00|||3|
2262|ML|5|325.196.201||TBL|BCO|B||||||5|1|1|162.00|300.00|||3|
2263|ML|5|325.196.202||TBL|BCO|M||||||5|1|1|162.00|300.00|||3|
2264|ML|5|325.196.203||TBL|CCL|B||||||5|1|1|162.00|300.00|||3|
2265|ML|5|325.196.204||TBL|CCL|M||||||5|1|1|162.00|300.00|||3|
2266|ML|5|325.196.205||TBL|CME|B||||||5|1|1|162.00|300.00|||3|
2267|ML|5|325.196.206||TBL|CME|M||||||5|1|1|162.00|300.00|||3|
2268|ML|5|325.196.207||TBL|ANT|B||||||5|1|1|162.00|300.00|||3|
2269|ML|5|325.196.208||TBL|ANT|M||||||5|1|1|162.00|300.00|||3|
2270|ML|5|325.196.209||TBL|PTO|B||||||5|1|1|162.00|300.00|||3|
2271|ML|5|325.196.210||TBL|PTO|M||||||5|1|1|162.00|300.00|||3|
2272|ML|5|325.196.211||TBL|CRE|B||||||5|1|1|162.00|300.00|||3|
2273|ML|5|325.196.212||TBL|CRE|M||||||5|1|1|162.00|300.00|||3|
2274|ML|5|325.196.213||TBL|CAM|B||||||5|1|1|162.00|300.00|||3|
2275|ML|5|325.196.214||TBL|CAM|M||||||5|1|1|162.00|300.00|||3|
2276|ML|5|325.196.215||TBL|OUR|B||||||5|1|1|162.00|300.00|||3|
2277|ML|5|325.196.216||TBL|OUR|M||||||5|1|1|162.00|300.00|||3|
2278|ML|5|325.196.217||TBL|COB|B||||||5|1|1|162.00|300.00|||3|
2279|ML|5|325.196.218||TBL|COB|M||||||5|1|1|162.00|300.00|||3|
2280|ML|5|325.196.219||TBL|CHO|B||||||5|1|1|162.00|300.00|||3|
2281|ML|5|325.196.220||TBL|CHO|M||||||5|1|1|162.00|300.00|||3|
2282|ML|5|325.196.221||TBL|VAG|B||||||5|1|1|162.00|300.00|||3|
2283|ML|5|325.196.222||TBL|VAG|M||||||5|1|1|162.00|300.00|||3|
2284|ML|5|325.196.223||TBL|AZE|B||||||5|1|1|162.00|300.00|||3|
2285|ML|5|325.196.224||TBL|AZE|M||||||5|1|1|162.00|300.00|||3|
2286|ML|5|325.196.225||TBL|AMA|B||||||5|1|1|162.00|300.00|||3|
2287|ML|5|325.196.226||TBL|AMA|M||||||5|1|1|162.00|300.00|||3|
2288|ML|5|325.196.227||TBL|AES|B||||||5|1|1|162.00|300.00|||3|
2289|ML|5|325.196.228||TBL|AES|M||||||5|1|1|162.00|300.00|||3|
2290|ML|5|325.196.229||TBL|PRA|B||||||5|1|1|162.00|300.00|||3|
2291|ML|5|325.196.230||TBL|PRA|M||||||5|1|1|162.00|300.00|||3|
2292|ML|5|325.196.231||TBL|ROS|B||||||5|1|1|162.00|300.00|||3|
2293|ML|5|325.196.232||TBL|ROS|M||||||5|1|1|162.00|300.00|||3|
2294|ML|5|325.196.233||TBL|VER|B||||||5|1|1|162.00|300.00|||3|
2295|ML|5|325.196.234||TBL|VER|M||||||5|1|1|162.00|300.00|||3|
2296|ML|5|325.196.235||TBL|AZB|||||||5|1|1|162.00|300.00|||3|
2297|ML|5|325.196.236||TBL|DEN|||||||5|1|1|162.00|300.00|||3|
2298|ML|5|325.196.237||TBL|BLK|||||||5|1|1|162.00|300.00|||3|
2299|ML|5|325.196.238||TBL|ART|||||||5|1|1|162.00|300.00|||3|
2300|ML|5|325.196.239||TBL|LIN|||||||5|1|1|162.00|300.00|||3|
2301|ML|5|325.196.240||TBL|HAL|||||||5|1|1|162.00|300.00|||3|
2302|ML|5|325.196.91||BCO|BCO|B||||||5|1|1|183.60|340.00|||3|
2303|ML|5|325.196.93||BCO|BCO|M||||||5|1|1|183.60|340.00|||3|
2304|ML|5|325.196.95||CCL|CCL|B||||||5|1|1|183.60|340.00|||3|
2305|ML|5|325.196.97||CCL|CCL|M||||||5|1|1|183.60|340.00|||3|
2306|ML|5|325.196.99||CME|CME|B||||||5|1|1|183.60|340.00|||3|
2307|ML|5|325.196.101||CME|CME|M||||||5|1|1|183.60|340.00|||3|
2308|ML|5|325.196.103||ANT|ANT|B||||||5|1|1|183.60|340.00|||3|
2309|ML|5|325.196.105||ANT|ANT|M||||||5|1|1|183.60|340.00|||3|
2310|ML|5|325.196.107||PTO|PTO|B||||||5|1|1|183.60|340.00|||3|
2311|ML|5|325.196.109||PTO|PTO|M||||||5|1|1|183.60|340.00|||3|
2312|ML|5|325.196.111||CRE|CRE|B||||||5|1|1|183.60|340.00|||3|
2313|ML|5|325.196.113||CRE|CRE|M||||||5|1|1|183.60|340.00|||3|
2314|ML|5|325.196.115||CAM|CAM|B||||||5|1|1|183.60|340.00|||3|
2315|ML|5|325.196.117||CAM|CAM|M||||||5|1|1|183.60|340.00|||3|
2316|ML|5|325.196.119||OUR|OUR|B||||||5|1|1|183.60|340.00|||3|
2317|ML|5|325.196.121||OUR|OUR|M||||||5|1|1|183.60|340.00|||3|
2318|ML|5|325.196.123||COB|COB|B||||||5|1|1|183.60|340.00|||3|
2319|ML|5|325.196.125||COB|COB|M||||||5|1|1|183.60|340.00|||3|
2320|ML|5|325.196.127||CHO|CHO|B||||||5|1|1|183.60|340.00|||3|
2321|ML|5|325.196.129||CHO|CHO|M||||||5|1|1|183.60|340.00|||3|
2322|ML|5|325.196.131||VAG|VAG|B||||||5|1|1|183.60|340.00|||3|
2323|ML|5|325.196.133||VAG|VAG|M||||||5|1|1|183.60|340.00|||3|
2324|ML|5|325.196.135||AZE|AZE|B||||||5|1|1|183.60|340.00|||3|
2325|ML|5|325.196.137||AZE|AZE|M||||||5|1|1|183.60|340.00|||3|
2326|ML|5|325.196.139||AMA|AMA|B||||||5|1|1|183.60|340.00|||3|
2327|ML|5|325.196.141||AMA|AMA|M||||||5|1|1|183.60|340.00|||3|
2328|ML|5|325.196.143||AES|AES|B||||||5|1|1|183.60|340.00|||3|
2329|ML|5|325.196.145||AES|AES|M||||||5|1|1|183.60|340.00|||3|
2330|ML|5|325.196.147||PRA|PRA|B||||||5|1|1|183.60|340.00|||3|
2331|ML|5|325.196.149||PRA|PRA|M||||||5|1|1|183.60|340.00|||3|
2332|ML|5|325.196.151||ROS|ROS|B||||||5|1|1|183.60|340.00|||3|
2333|ML|5|325.196.153||ROS|ROS|M||||||5|1|1|183.60|340.00|||3|
2334|ML|5|325.196.155||VER|VER|B||||||5|1|1|183.60|340.00|||3|
2335|ML|5|325.196.157||VER|VER|M||||||5|1|1|183.60|340.00|||3|
2336|ML|5|325.196.165||AZB|AZB|||||||5|1|1|183.60|340.00|||3|
2337|ML|5|325.196.167||DEN|DEN|||||||5|1|1|183.60|340.00|||3|
2338|ML|5|325.196.169||BLK|BLK|||||||5|1|1|183.60|340.00|||3|
2339|ML|5|325.196.171||ART|ART|||||||5|1|1|183.60|340.00|||3|
2340|ML|5|325.196.173||LIN|LIN|||||||5|1|1|183.60|340.00|||3|
2341|ML|5|325.196.175||HAL|HAL|||||||5|1|1|183.60|340.00|||3|
2342|ML|6|325.196.241||TBL|TBL|||||||5|1|1|129.60|240.00|||3|
2343|ML|6|325.196.242||TEA|TEA|||||||5|1|1|129.60|240.00|||3|
2344|ML|6|325.196.243||OAK|OAK|||||||5|1|1|129.60|240.00|||3|
2345|ML|6|325.196.244||JOP|JOP|||||||5|1|1|129.60|240.00|||3|
2346|ML|6|325.196.245||TBL|BCO|B||||||5|1|1|156.60|290.00|||3|
2347|ML|6|325.196.246||TBL|BCO|M||||||5|1|1|156.60|290.00|||3|
2348|ML|6|325.196.247||TBL|CCL|B||||||5|1|1|156.60|290.00|||3|
2349|ML|6|325.196.248||TBL|CCL|M||||||5|1|1|156.60|290.00|||3|
2350|ML|6|325.196.249||TBL|CME|B||||||5|1|1|156.60|290.00|||3|
2351|ML|6|325.196.250||TBL|CME|M||||||5|1|1|156.60|290.00|||3|
2352|ML|6|325.196.251||TBL|ANT|B||||||5|1|1|156.60|290.00|||3|
2353|ML|6|325.196.252||TBL|ANT|M||||||5|1|1|156.60|290.00|||3|
2354|ML|6|325.196.253||TBL|PTO|B||||||5|1|1|156.60|290.00|||3|
2355|ML|6|325.196.254||TBL|PTO|M||||||5|1|1|156.60|290.00|||3|
2356|ML|6|325.196.255||TBL|CRE|B||||||5|1|1|156.60|290.00|||3|
2357|ML|6|325.196.256||TBL|CRE|M||||||5|1|1|156.60|290.00|||3|
2358|ML|6|325.196.257||TBL|CAM|B||||||5|1|1|156.60|290.00|||3|
2359|ML|6|325.196.258||TBL|CAM|M||||||5|1|1|156.60|290.00|||3|
2360|ML|6|325.196.259||TBL|OUR|B||||||5|1|1|156.60|290.00|||3|
2361|ML|6|325.196.260||TBL|OUR|M||||||5|1|1|156.60|290.00|||3|
2362|ML|6|325.196.261||TBL|COB|B||||||5|1|1|156.60|290.00|||3|
2363|ML|6|325.196.262||TBL|COB|M||||||5|1|1|156.60|290.00|||3|
2364|ML|6|325.196.263||TBL|CHO|B||||||5|1|1|156.60|290.00|||3|
2365|ML|6|325.196.264||TBL|CHO|M||||||5|1|1|156.60|290.00|||3|
2366|ML|6|325.196.265||TBL|VAG|B||||||5|1|1|156.60|290.00|||3|
2367|ML|6|325.196.266||TBL|VAG|M||||||5|1|1|156.60|290.00|||3|
2368|ML|6|325.196.267||TBL|AZE|B||||||5|1|1|156.60|290.00|||3|
2369|ML|6|325.196.268||TBL|AZE|M||||||5|1|1|156.60|290.00|||3|
2370|ML|6|325.196.269||TBL|AMA|B||||||5|1|1|156.60|290.00|||3|
2371|ML|6|325.196.270||TBL|AMA|M||||||5|1|1|156.60|290.00|||3|
2372|ML|6|325.196.271||TBL|AES|B||||||5|1|1|156.60|290.00|||3|
2373|ML|6|325.196.272||TBL|AES|M||||||5|1|1|156.60|290.00|||3|
2374|ML|6|325.196.273||TBL|PRA|B||||||5|1|1|156.60|290.00|||3|
2375|ML|6|325.196.274||TBL|PRA|M||||||5|1|1|156.60|290.00|||3|
2376|ML|6|325.196.275||TBL|ROS|B||||||5|1|1|156.60|290.00|||3|
2377|ML|6|325.196.276||TBL|ROS|M||||||5|1|1|156.60|290.00|||3|
2378|ML|6|325.196.277||TBL|VER|B||||||5|1|1|156.60|290.00|||3|
2379|ML|6|325.196.278||TBL|VER|M||||||5|1|1|156.60|290.00|||3|
2380|ML|6|325.196.279||TBL|AZB|||||||5|1|1|156.60|290.00|||3|
2381|ML|6|325.196.280||TBL|DEN|||||||5|1|1|156.60|290.00|||3|
2382|ML|6|325.196.281||TBL|BLK|||||||5|1|1|156.60|290.00|||3|
2383|ML|6|325.196.282||TBL|ART|||||||5|1|1|156.60|290.00|||3|
2384|ML|6|325.196.283||TBL|LIN|||||||5|1|1|156.60|290.00|||3|
2385|ML|6|325.196.284||TBL|HAL|||||||5|1|1|156.60|290.00|||3|
2386|ML|6|325.196.285||BCO|BCO|B||||||5|1|1|178.20|330.00|||3|
2387|ML|6|325.196.286||BCO|BCO|M||||||5|1|1|178.20|330.00|||3|
2388|ML|6|325.196.287||CCL|CCL|B||||||5|1|1|178.20|330.00|||3|
2389|ML|6|325.196.288||CCL|CCL|M||||||5|1|1|178.20|330.00|||3|
2390|ML|6|325.196.289||CME|CME|B||||||5|1|1|178.20|330.00|||3|
2391|ML|6|325.196.290||CME|CME|M||||||5|1|1|178.20|330.00|||3|
2392|ML|6|325.196.291||ANT|ANT|B||||||5|1|1|178.20|330.00|||3|
2393|ML|6|325.196.292||ANT|ANT|M||||||5|1|1|178.20|330.00|||3|
2394|ML|6|325.196.293||PTO|PTO|B||||||5|1|1|178.20|330.00|||3|
2395|ML|6|325.196.294||PTO|PTO|M||||||5|1|1|178.20|330.00|||3|
2396|ML|6|325.196.295||CRE|CRE|B||||||5|1|1|178.20|330.00|||3|
2397|ML|6|325.196.296||CRE|CRE|M||||||5|1|1|178.20|330.00|||3|
2398|ML|6|325.196.297||CAM|CAM|B||||||5|1|1|178.20|330.00|||3|
2399|ML|6|325.196.298||CAM|CAM|M||||||5|1|1|178.20|330.00|||3|
2400|ML|6|325.196.299||OUR|OUR|B||||||5|1|1|178.20|330.00|||3|
2401|ML|6|325.196.300||OUR|OUR|M||||||5|1|1|178.20|330.00|||3|
2402|ML|6|325.196.301||COB|COB|B||||||5|1|1|178.20|330.00|||3|
2403|ML|6|325.196.302||COB|COB|M||||||5|1|1|178.20|330.00|||3|
2404|ML|6|325.196.303||CHO|CHO|B||||||5|1|1|178.20|330.00|||3|
2405|ML|6|325.196.304||CHO|CHO|M||||||5|1|1|178.20|330.00|||3|
2406|ML|6|325.196.305||VAG|VAG|B||||||5|1|1|178.20|330.00|||3|
2407|ML|6|325.196.306||VAG|VAG|M||||||5|1|1|178.20|330.00|||3|
2408|ML|6|325.196.307||AZE|AZE|B||||||5|1|1|178.20|330.00|||3|
2409|ML|6|325.196.308||AZE|AZE|M||||||5|1|1|178.20|330.00|||3|
2410|ML|6|325.196.309||AMA|AMA|B||||||5|1|1|178.20|330.00|||3|
2411|ML|6|325.196.310||AMA|AMA|M||||||5|1|1|178.20|330.00|||3|
2412|ML|6|325.196.311||AES|AES|B||||||5|1|1|178.20|330.00|||3|
2413|ML|6|325.196.312||AES|AES|M||||||5|1|1|178.20|330.00|||3|
2414|ML|6|325.196.313||PRA|PRA|B||||||5|1|1|178.20|330.00|||3|
2415|ML|6|325.196.314||PRA|PRA|M||||||5|1|1|178.20|330.00|||3|
2416|ML|6|325.196.315||ROS|ROS|B||||||5|1|1|178.20|330.00|||3|
2417|ML|6|325.196.316||ROS|ROS|M||||||5|1|1|178.20|330.00|||3|
2418|ML|6|325.196.317||VER|VER|B||||||5|1|1|178.20|330.00|||3|
2419|ML|6|325.196.318||VER|VER|M||||||5|1|1|178.20|330.00|||3|
2420|ML|6|325.196.319||AZB|AZB|||||||5|1|1|178.20|330.00|||3|
2421|ML|6|325.196.320||DEN|DEN|||||||5|1|1|178.20|330.00|||3|
2422|ML|6|325.196.321||BLK|BLK|||||||5|1|1|178.20|330.00|||3|
2423|ML|6|325.196.322||ART|ART|||||||5|1|1|178.20|330.00|||3|
2424|ML|6|325.196.323||LIN|LIN|||||||5|1|1|178.20|330.00|||3|
2425|ML|6|325.196.324||HAL|HAL|||||||5|1|1|178.20|330.00|||3|
2426|ML|5|326.196.197||TBL|TBL|||||||1|1|1|140.40|260.00|||3|
2427|ML|5|326.196.198||TEA|TEA|||||||1|1|1|140.40|260.00|||3|
2428|ML|5|326.196.199||OAK|OAK|||||||1|1|1|140.40|260.00|||3|
2429|ML|5|326.196.200||JOP|JOP|||||||1|1|1|140.40|260.00|||3|
2430|ML|5|326.196.201||TBL|BCO|B||||||1|1|1|167.40|310.00|||3|
2431|ML|5|326.196.202||TBL|BCO|M||||||1|1|1|167.40|310.00|||3|
2432|ML|5|326.196.203||TBL|CCL|B||||||1|1|1|167.40|310.00|||3|
2433|ML|5|326.196.204||TBL|CCL|M||||||1|1|1|167.40|310.00|||3|
2434|ML|5|326.196.205||TBL|CME|B||||||1|1|1|167.40|310.00|||3|
2435|ML|5|326.196.206||TBL|CME|M||||||1|1|1|167.40|310.00|||3|
2436|ML|5|326.196.207||TBL|ANT|B||||||1|1|1|167.40|310.00|||3|
2437|ML|5|326.196.208||TBL|ANT|M||||||1|1|1|167.40|310.00|||3|
2438|ML|5|326.196.209||TBL|PTO|B||||||1|1|1|167.40|310.00|||3|
2439|ML|5|326.196.210||TBL|PTO|M||||||1|1|1|167.40|310.00|||3|
2440|ML|5|326.196.211||TBL|CRE|B||||||1|1|1|167.40|310.00|||3|
2441|ML|5|326.196.212||TBL|CRE|M||||||1|1|1|167.40|310.00|||3|
2442|ML|5|326.196.213||TBL|CAM|B||||||1|1|1|167.40|310.00|||3|
2443|ML|5|326.196.214||TBL|CAM|M||||||1|1|1|167.40|310.00|||3|
2444|ML|5|326.196.215||TBL|OUR|B||||||1|1|1|167.40|310.00|||3|
2445|ML|5|326.196.216||TBL|OUR|M||||||1|1|1|167.40|310.00|||3|
2446|ML|5|326.196.217||TBL|COB|B||||||1|1|1|167.40|310.00|||3|
2447|ML|5|326.196.218||TBL|COB|M||||||1|1|1|167.40|310.00|||3|
2448|ML|5|326.196.219||TBL|CHO|B||||||1|1|1|167.40|310.00|||3|
2449|ML|5|326.196.220||TBL|CHO|M||||||1|1|1|167.40|310.00|||3|
2450|ML|5|326.196.221||TBL|VAG|B||||||1|1|1|167.40|310.00|||3|
2451|ML|5|326.196.222||TBL|VAG|M||||||1|1|1|167.40|310.00|||3|
2452|ML|5|326.196.223||TBL|AZE|B||||||1|1|1|167.40|310.00|||3|
2453|ML|5|326.196.224||TBL|AZE|M||||||1|1|1|167.40|310.00|||3|
2454|ML|5|326.196.225||TBL|AMA|B||||||1|1|1|167.40|310.00|||3|
2455|ML|5|326.196.226||TBL|AMA|M||||||1|1|1|167.40|310.00|||3|
2456|ML|5|326.196.227||TBL|AES|B||||||1|1|1|167.40|310.00|||3|
2457|ML|5|326.196.228||TBL|AES|M||||||1|1|1|167.40|310.00|||3|
2458|ML|5|326.196.229||TBL|PRA|B||||||1|1|1|167.40|310.00|||3|
2459|ML|5|326.196.230||TBL|PRA|M||||||1|1|1|167.40|310.00|||3|
2460|ML|5|326.196.231||TBL|ROS|B||||||1|1|1|167.40|310.00|||3|
2461|ML|5|326.196.232||TBL|ROS|M||||||1|1|1|167.40|310.00|||3|
2462|ML|5|326.196.233||TBL|VER|B||||||1|1|1|167.40|310.00|||3|
2463|ML|5|326.196.234||TBL|VER|M||||||1|1|1|167.40|310.00|||3|
2464|ML|5|326.196.235||TBL|AZB|||||||1|1|1|167.40|310.00|||3|
2465|ML|5|326.196.236||TBL|DEN|||||||1|1|1|167.40|310.00|||3|
2466|ML|5|326.196.237||TBL|BLK|||||||1|1|1|167.40|310.00|||3|
2467|ML|5|326.196.238||TBL|ART|||||||1|1|1|167.40|310.00|||3|
2468|ML|5|326.196.239||TBL|LIN|||||||1|1|1|167.40|310.00|||3|
2469|ML|5|326.196.240||TBL|HAL|||||||1|1|1|167.40|310.00|||3|
2470|ML|5|326.196.91||BCO|BCO|B||||||1|1|1|189.00|350.00|||3|
2471|ML|5|326.196.93||BCO|BCO|M||||||1|1|1|189.00|350.00|||3|
2472|ML|5|326.196.95||CCL|CCL|B||||||1|1|1|189.00|350.00|||3|
2473|ML|5|326.196.97||CCL|CCL|M||||||1|1|1|189.00|350.00|||3|
2474|ML|5|326.196.99||CME|CME|B||||||1|1|1|189.00|350.00|||3|
2475|ML|5|326.196.101||CME|CME|M||||||1|1|1|189.00|350.00|||3|
2476|ML|5|326.196.103||ANT|ANT|B||||||1|1|1|189.00|350.00|||3|
2477|ML|5|326.196.105||ANT|ANT|M||||||1|1|1|189.00|350.00|||3|
2478|ML|5|326.196.107||PTO|PTO|B||||||1|1|1|189.00|350.00|||3|
2479|ML|5|326.196.109||PTO|PTO|M||||||1|1|1|189.00|350.00|||3|
2480|ML|5|326.196.111||CRE|CRE|B||||||1|1|1|189.00|350.00|||3|
2481|ML|5|326.196.113||CRE|CRE|M||||||1|1|1|189.00|350.00|||3|
2482|ML|5|326.196.115||CAM|CAM|B||||||1|1|1|189.00|350.00|||3|
2483|ML|5|326.196.117||CAM|CAM|M||||||1|1|1|189.00|350.00|||3|
2484|ML|5|326.196.119||OUR|OUR|B||||||1|1|1|189.00|350.00|||3|
2485|ML|5|326.196.121||OUR|OUR|M||||||1|1|1|189.00|350.00|||3|
2486|ML|5|326.196.123||COB|COB|B||||||1|1|1|189.00|350.00|||3|
2487|ML|5|326.196.125||COB|COB|M||||||1|1|1|189.00|350.00|||3|
2488|ML|5|326.196.127||CHO|CHO|B||||||1|1|1|189.00|350.00|||3|
2489|ML|5|326.196.129||CHO|CHO|M||||||1|1|1|189.00|350.00|||3|
2490|ML|5|326.196.131||VAG|VAG|B||||||1|1|1|189.00|350.00|||3|
2491|ML|5|326.196.133||VAG|VAG|M||||||1|1|1|189.00|350.00|||3|
2492|ML|5|326.196.135||AZE|AZE|B||||||1|1|1|189.00|350.00|||3|
2493|ML|5|326.196.137||AZE|AZE|M||||||1|1|1|189.00|350.00|||3|
2494|ML|5|326.196.139||AMA|AMA|B||||||1|1|1|189.00|350.00|||3|
2495|ML|5|326.196.141||AMA|AMA|M||||||1|1|1|189.00|350.00|||3|
2496|ML|5|326.196.143||AES|AES|B||||||1|1|1|189.00|350.00|||3|
2497|ML|5|326.196.145||AES|AES|M||||||1|1|1|189.00|350.00|||3|
2498|ML|5|326.196.147||PRA|PRA|B||||||1|1|1|189.00|350.00|||3|
2499|ML|5|326.196.149||PRA|PRA|M||||||1|1|1|189.00|350.00|||3|
2500|ML|5|326.196.151||ROS|ROS|B||||||1|1|1|189.00|350.00|||3|
2501|ML|5|326.196.153||ROS|ROS|M||||||1|1|1|189.00|350.00|||3|
2502|ML|5|326.196.155||VER|VER|B||||||1|1|1|189.00|350.00|||3|
2503|ML|5|326.196.157||VER|VER|M||||||1|1|1|189.00|350.00|||3|
2504|ML|5|326.196.165||AZB|AZB|||||||1|1|1|189.00|350.00|||3|
2505|ML|5|326.196.167||DEN|DEN|||||||1|1|1|189.00|350.00|||3|
2506|ML|5|326.196.169||BLK|BLK|||||||1|1|1|189.00|350.00|||3|
2507|ML|5|326.196.171||ART|ART|||||||1|1|1|189.00|350.00|||3|
2508|ML|5|326.196.173||LIN|LIN|||||||1|1|1|189.00|350.00|||3|
2509|ML|5|326.196.175||HAL|HAL|||||||1|1|1|189.00|350.00|||3|
2510|ML|6|326.196.241||TBL|TBL|||||||1|1|1|135.00|250.00|||3|
2511|ML|6|326.196.242||TEA|TEA|||||||1|1|1|135.00|250.00|||3|
2512|ML|6|326.196.243||OAK|OAK|||||||1|1|1|135.00|250.00|||3|
2513|ML|6|326.196.244||JOP|JOP|||||||1|1|1|135.00|250.00|||3|
2514|ML|6|326.196.245||TBL|BCO|B||||||1|1|1|162.00|300.00|||3|
2515|ML|6|326.196.246||TBL|BCO|M||||||1|1|1|162.00|300.00|||3|
2516|ML|6|326.196.247||TBL|CCL|B||||||1|1|1|162.00|300.00|||3|
2517|ML|6|326.196.248||TBL|CCL|M||||||1|1|1|162.00|300.00|||3|
2518|ML|6|326.196.249||TBL|CME|B||||||1|1|1|162.00|300.00|||3|
2519|ML|6|326.196.250||TBL|CME|M||||||1|1|1|162.00|300.00|||3|
2520|ML|6|326.196.251||TBL|ANT|B||||||1|1|1|162.00|300.00|||3|
2521|ML|6|326.196.252||TBL|ANT|M||||||1|1|1|162.00|300.00|||3|
2522|ML|6|326.196.253||TBL|PTO|B||||||1|1|1|162.00|300.00|||3|
2523|ML|6|326.196.254||TBL|PTO|M||||||1|1|1|162.00|300.00|||3|
2524|ML|6|326.196.255||TBL|CRE|B||||||1|1|1|162.00|300.00|||3|
2525|ML|6|326.196.256||TBL|CRE|M||||||1|1|1|162.00|300.00|||3|
2526|ML|6|326.196.257||TBL|CAM|B||||||1|1|1|162.00|300.00|||3|
2527|ML|6|326.196.258||TBL|CAM|M||||||1|1|1|162.00|300.00|||3|
2528|ML|6|326.196.259||TBL|OUR|B||||||1|1|1|162.00|300.00|||3|
2529|ML|6|326.196.260||TBL|OUR|M||||||1|1|1|162.00|300.00|||3|
2530|ML|6|326.196.261||TBL|COB|B||||||1|1|1|162.00|300.00|||3|
2531|ML|6|326.196.262||TBL|COB|M||||||1|1|1|162.00|300.00|||3|
2532|ML|6|326.196.263||TBL|CHO|B||||||1|1|1|162.00|300.00|||3|
2533|ML|6|326.196.264||TBL|CHO|M||||||1|1|1|162.00|300.00|||3|
2534|ML|6|326.196.265||TBL|VAG|B||||||1|1|1|162.00|300.00|||3|
2535|ML|6|326.196.266||TBL|VAG|M||||||1|1|1|162.00|300.00|||3|
2536|ML|6|326.196.267||TBL|AZE|B||||||1|1|1|162.00|300.00|||3|
2537|ML|6|326.196.268||TBL|AZE|M||||||1|1|1|162.00|300.00|||3|
2538|ML|6|326.196.269||TBL|AMA|B||||||1|1|1|162.00|300.00|||3|
2539|ML|6|326.196.270||TBL|AMA|M||||||1|1|1|162.00|300.00|||3|
2540|ML|6|326.196.271||TBL|AES|B||||||1|1|1|162.00|300.00|||3|
2541|ML|6|326.196.272||TBL|AES|M||||||1|1|1|162.00|300.00|||3|
2542|ML|6|326.196.273||TBL|PRA|B||||||1|1|1|162.00|300.00|||3|
2543|ML|6|326.196.274||TBL|PRA|M||||||1|1|1|162.00|300.00|||3|
2544|ML|6|326.196.275||TBL|ROS|B||||||1|1|1|162.00|300.00|||3|
2545|ML|6|326.196.276||TBL|ROS|M||||||1|1|1|162.00|300.00|||3|
2546|ML|6|326.196.277||TBL|VER|B||||||1|1|1|162.00|300.00|||3|
2547|ML|6|326.196.278||TBL|VER|M||||||1|1|1|162.00|300.00|||3|
2548|ML|6|326.196.279||TBL|AZB|||||||1|1|1|162.00|300.00|||3|
2549|ML|6|326.196.280||TBL|DEN|||||||1|1|1|162.00|300.00|||3|
2550|ML|6|326.196.281||TBL|BLK|||||||1|1|1|162.00|300.00|||3|
2551|ML|6|326.196.282||TBL|ART|||||||1|1|1|162.00|300.00|||3|
2552|ML|6|326.196.283||TBL|LIN|||||||1|1|1|162.00|300.00|||3|
2553|ML|6|326.196.284||TBL|HAL|||||||1|1|1|162.00|300.00|||3|
2554|ML|6|326.196.285||BCO|BCO|B||||||1|1|1|183.60|340.00|||3|
2555|ML|6|326.196.286||BCO|BCO|M||||||1|1|1|183.60|340.00|||3|
2556|ML|6|326.196.287||CCL|CCL|B||||||1|1|1|183.60|340.00|||3|
2557|ML|6|326.196.288||CCL|CCL|M||||||1|1|1|183.60|340.00|||3|
2558|ML|6|326.196.289||CME|CME|B||||||1|1|1|183.60|340.00|||3|
2559|ML|6|326.196.290||CME|CME|M||||||1|1|1|183.60|340.00|||3|
2560|ML|6|326.196.291||ANT|ANT|B||||||1|1|1|183.60|340.00|||3|
2561|ML|6|326.196.292||ANT|ANT|M||||||1|1|1|183.60|340.00|||3|
2562|ML|6|326.196.293||PTO|PTO|B||||||1|1|1|183.60|340.00|||3|
2563|ML|6|326.196.294||PTO|PTO|M||||||1|1|1|183.60|340.00|||3|
2564|ML|6|326.196.295||CRE|CRE|B||||||1|1|1|183.60|340.00|||3|
2565|ML|6|326.196.296||CRE|CRE|M||||||1|1|1|183.60|340.00|||3|
2566|ML|6|326.196.297||CAM|CAM|B||||||1|1|1|183.60|340.00|||3|
2567|ML|6|326.196.298||CAM|CAM|M||||||1|1|1|183.60|340.00|||3|
2568|ML|6|326.196.299||OUR|OUR|B||||||1|1|1|183.60|340.00|||3|
2569|ML|6|326.196.300||OUR|OUR|M||||||1|1|1|183.60|340.00|||3|
2570|ML|6|326.196.301||COB|COB|B||||||1|1|1|183.60|340.00|||3|
2571|ML|6|326.196.302||COB|COB|M||||||1|1|1|183.60|340.00|||3|
2572|ML|6|326.196.303||CHO|CHO|B||||||1|1|1|183.60|340.00|||3|
2573|ML|6|326.196.304||CHO|CHO|M||||||1|1|1|183.60|340.00|||3|
2574|ML|6|326.196.305||VAG|VAG|B||||||1|1|1|183.60|340.00|||3|
2575|ML|6|326.196.306||VAG|VAG|M||||||1|1|1|183.60|340.00|||3|
2576|ML|6|326.196.307||AZE|AZE|B||||||1|1|1|183.60|340.00|||3|
2577|ML|6|326.196.308||AZE|AZE|M||||||1|1|1|183.60|340.00|||3|
2578|ML|6|326.196.309||AMA|AMA|B||||||1|1|1|183.60|340.00|||3|
2579|ML|6|326.196.310||AMA|AMA|M||||||1|1|1|183.60|340.00|||3|
2580|ML|6|326.196.311||AES|AES|B||||||1|1|1|183.60|340.00|||3|
2581|ML|6|326.196.312||AES|AES|M||||||1|1|1|183.60|340.00|||3|
2582|ML|6|326.196.313||PRA|PRA|B||||||1|1|1|183.60|340.00|||3|
2583|ML|6|326.196.314||PRA|PRA|M||||||1|1|1|183.60|340.00|||3|
2584|ML|6|326.196.315||ROS|ROS|B||||||1|1|1|183.60|340.00|||3|
2585|ML|6|326.196.316||ROS|ROS|M||||||1|1|1|183.60|340.00|||3|
2586|ML|6|326.196.317||VER|VER|B||||||1|1|1|183.60|340.00|||3|
2587|ML|6|326.196.318||VER|VER|M||||||1|1|1|183.60|340.00|||3|
2588|ML|6|326.196.319||AZB|AZB|||||||1|1|1|183.60|340.00|||3|
2589|ML|6|326.196.320||DEN|DEN|||||||1|1|1|183.60|340.00|||3|
2590|ML|6|326.196.321||BLK|BLK|||||||1|1|1|183.60|340.00|||3|
2591|ML|6|326.196.322||ART|ART|||||||1|1|1|183.60|340.00|||3|
2592|ML|6|326.196.323||LIN|LIN|||||||1|1|1|183.60|340.00|||3|
2593|ML|6|326.196.324||HAL|HAL|||||||1|1|1|183.60|340.00|||3|
2594|ML|7|326.196.327||TBL|TBL|||||||1|1|1|264.60|490.00|||3|
2595|ML|7|326.196.328||TEA|TEA|||||||1|1|1|264.60|490.00|||3|
2596|ML|7|326.196.329||OAK|OAK|||||||1|1|1|264.60|490.00|||3|
2597|ML|7|326.196.330||JOP|JOP|||||||1|1|1|264.60|490.00|||3|
2598|ML|7|326.196.331||TBL|BCO|B||||||1|1|1|291.60|540.00|||3|
2599|ML|7|326.196.332||TBL|BCO|M||||||1|1|1|291.60|540.00|||3|
2600|ML|7|326.196.333||TBL|CCL|B||||||1|1|1|291.60|540.00|||3|
2601|ML|7|326.196.334||TBL|CCL|M||||||1|1|1|291.60|540.00|||3|
2602|ML|7|326.196.335||TBL|CME|B||||||1|1|1|291.60|540.00|||3|
2603|ML|7|326.196.336||TBL|CME|M||||||1|1|1|291.60|540.00|||3|
2604|ML|7|326.196.337||TBL|ANT|B||||||1|1|1|291.60|540.00|||3|
2605|ML|7|326.196.338||TBL|ANT|M||||||1|1|1|291.60|540.00|||3|
2606|ML|7|326.196.339||TBL|PTO|B||||||1|1|1|291.60|540.00|||3|
2607|ML|7|326.196.340||TBL|PTO|M||||||1|1|1|291.60|540.00|||3|
2608|ML|7|326.196.341||TBL|CRE|B||||||1|1|1|291.60|540.00|||3|
2609|ML|7|326.196.342||TBL|CRE|M||||||1|1|1|291.60|540.00|||3|
2610|ML|7|326.196.343||TBL|CAM|B||||||1|1|1|291.60|540.00|||3|
2611|ML|7|326.196.344||TBL|CAM|M||||||1|1|1|291.60|540.00|||3|
2612|ML|7|326.196.345||TBL|OUR|B||||||1|1|1|291.60|540.00|||3|
2613|ML|7|326.196.346||TBL|OUR|M||||||1|1|1|291.60|540.00|||3|
2614|ML|7|326.196.347||TBL|COB|B||||||1|1|1|291.60|540.00|||3|
2615|ML|7|326.196.348||TBL|COB|M||||||1|1|1|291.60|540.00|||3|
2616|ML|7|326.196.349||TBL|CHO|B||||||1|1|1|291.60|540.00|||3|
2617|ML|7|326.196.350||TBL|CHO|M||||||1|1|1|291.60|540.00|||3|
2618|ML|7|326.196.351||TBL|VAG|B||||||1|1|1|291.60|540.00|||3|
2619|ML|7|326.196.352||TBL|VAG|M||||||1|1|1|291.60|540.00|||3|
2620|ML|7|326.196.353||TBL|AZE|B||||||1|1|1|291.60|540.00|||3|
2621|ML|7|326.196.354||TBL|AZE|M||||||1|1|1|291.60|540.00|||3|
2622|ML|7|326.196.355||TBL|AMA|B||||||1|1|1|291.60|540.00|||3|
2623|ML|7|326.196.356||TBL|AMA|M||||||1|1|1|291.60|540.00|||3|
2624|ML|7|326.196.357||TBL|AES|B||||||1|1|1|291.60|540.00|||3|
2625|ML|7|326.196.358||TBL|AES|M||||||1|1|1|291.60|540.00|||3|
2626|ML|7|326.196.359||TBL|PRA|B||||||1|1|1|291.60|540.00|||3|
2627|ML|7|326.196.360||TBL|PRA|M||||||1|1|1|291.60|540.00|||3|
2628|ML|7|326.196.361||TBL|ROS|B||||||1|1|1|291.60|540.00|||3|
2629|ML|7|326.196.362||TBL|ROS|M||||||1|1|1|291.60|540.00|||3|
2630|ML|7|326.196.363||TBL|VER|B||||||1|1|1|291.60|540.00|||3|
2631|ML|7|326.196.364||TBL|VER|M||||||1|1|1|291.60|540.00|||3|
2632|ML|7|326.196.365||TBL|AZB|||||||1|1|1|291.60|540.00|||3|
2633|ML|7|326.196.366||TBL|DEN|||||||1|1|1|291.60|540.00|||3|
2634|ML|7|326.196.367||TBL|BLK|||||||1|1|1|291.60|540.00|||3|
2635|ML|7|326.196.368||TBL|ART|||||||1|1|1|291.60|540.00|||3|
2636|ML|7|326.196.369||TBL|LIN|||||||1|1|1|291.60|540.00|||3|
2637|ML|7|326.196.370||TBL|HAL|||||||1|1|1|291.60|540.00|||3|
2638|ML|7|326.196.92||BCO|BCO|B||||||1|1|1|313.20|580.00|||3|
2639|ML|7|326.196.94||BCO|BCO|M||||||1|1|1|313.20|580.00|||3|
2640|ML|7|326.196.96||CCL|CCL|B||||||1|1|1|313.20|580.00|||3|
2641|ML|7|326.196.98||CCL|CCL|M||||||1|1|1|313.20|580.00|||3|
2642|ML|7|326.196.100||CME|CME|B||||||1|1|1|313.20|580.00|||3|
2643|ML|7|326.196.102||CME|CME|M||||||1|1|1|313.20|580.00|||3|
2644|ML|7|326.196.104||ANT|ANT|B||||||1|1|1|313.20|580.00|||3|
2645|ML|7|326.196.106||ANT|ANT|M||||||1|1|1|313.20|580.00|||3|
2646|ML|7|326.196.108||PTO|PTO|B||||||1|1|1|313.20|580.00|||3|
2647|ML|7|326.196.110||PTO|PTO|M||||||1|1|1|313.20|580.00|||3|
2648|ML|7|326.196.112||CRE|CRE|B||||||1|1|1|313.20|580.00|||3|
2649|ML|7|326.196.114||CRE|CRE|M||||||1|1|1|313.20|580.00|||3|
2650|ML|7|326.196.116||CAM|CAM|B||||||1|1|1|313.20|580.00|||3|
2651|ML|7|326.196.118||CAM|CAM|M||||||1|1|1|313.20|580.00|||3|
2652|ML|7|326.196.120||OUR|OUR|B||||||1|1|1|313.20|580.00|||3|
2653|ML|7|326.196.122||OUR|OUR|M||||||1|1|1|313.20|580.00|||3|
2654|ML|7|326.196.124||COB|COB|B||||||1|1|1|313.20|580.00|||3|
2655|ML|7|326.196.126||COB|COB|M||||||1|1|1|313.20|580.00|||3|
2656|ML|7|326.196.128||CHO|CHO|B||||||1|1|1|313.20|580.00|||3|
2657|ML|7|326.196.130||CHO|CHO|M||||||1|1|1|313.20|580.00|||3|
2658|ML|7|326.196.132||VAG|VAG|B||||||1|1|1|313.20|580.00|||3|
2659|ML|7|326.196.134||VAG|VAG|M||||||1|1|1|313.20|580.00|||3|
2660|ML|7|326.196.136||AZE|AZE|B||||||1|1|1|313.20|580.00|||3|
2661|ML|7|326.196.138||AZE|AZE|M||||||1|1|1|313.20|580.00|||3|
2662|ML|7|326.196.140||AMA|AMA|B||||||1|1|1|313.20|580.00|||3|
2663|ML|7|326.196.142||AMA|AMA|M||||||1|1|1|313.20|580.00|||3|
2664|ML|7|326.196.144||AES|AES|B||||||1|1|1|313.20|580.00|||3|
2665|ML|7|326.196.146||AES|AES|M||||||1|1|1|313.20|580.00|||3|
2666|ML|7|326.196.148||PRA|PRA|B||||||1|1|1|313.20|580.00|||3|
2667|ML|7|326.196.150||PRA|PRA|M||||||1|1|1|313.20|580.00|||3|
2668|ML|7|326.196.152||ROS|ROS|B||||||1|1|1|313.20|580.00|||3|
2669|ML|7|326.196.154||ROS|ROS|M||||||1|1|1|313.20|580.00|||3|
2670|ML|7|326.196.156||VER|VER|B||||||1|1|1|313.20|580.00|||3|
2671|ML|7|326.196.158||VER|VER|M||||||1|1|1|313.20|580.00|||3|
2672|ML|7|326.196.166||AZB|AZB|||||||1|1|1|313.20|580.00|||3|
2673|ML|7|326.196.168||DEN|DEN|||||||1|1|1|313.20|580.00|||3|
2674|ML|7|326.196.170||BLK|BLK|||||||1|1|1|313.20|580.00|||3|
2675|ML|7|326.196.172||ART|ART|||||||1|1|1|313.20|580.00|||3|
2676|ML|7|326.196.174||LIN|LIN|||||||1|1|1|313.20|580.00|||3|
2677|ML|7|326.196.176||HAL|HAL|||||||1|1|1|313.20|580.00|||3|
2678|ML|5|371.196.197||TBL|TBL|||||||6|1|1|162.00|300.00|||3|
2679|ML|5|371.196.198||TEA|TEA|||||||6|1|1|162.00|300.00|||3|
2680|ML|5|371.196.199||OAK|OAK|||||||6|1|1|162.00|300.00|||3|
2681|ML|5|371.196.200||JOP|JOP|||||||6|1|1|162.00|300.00|||3|
2682|ML|5|371.196.201||TBL|BCO|B||||||6|1|1|189.00|350.00|||3|
2683|ML|5|371.196.202||TBL|BCO|M||||||6|1|1|189.00|350.00|||3|
2684|ML|5|371.196.203||TBL|CCL|B||||||6|1|1|189.00|350.00|||3|
2685|ML|5|371.196.204||TBL|CCL|M||||||6|1|1|189.00|350.00|||3|
2686|ML|5|371.196.205||TBL|CME|B||||||6|1|1|189.00|350.00|||3|
2687|ML|5|371.196.206||TBL|CME|M||||||6|1|1|189.00|350.00|||3|
2688|ML|5|371.196.207||TBL|ANT|B||||||6|1|1|189.00|350.00|||3|
2689|ML|5|371.196.208||TBL|ANT|M||||||6|1|1|189.00|350.00|||3|
2690|ML|5|371.196.209||TBL|PTO|B||||||6|1|1|189.00|350.00|||3|
2691|ML|5|371.196.210||TBL|PTO|M||||||6|1|1|189.00|350.00|||3|
2692|ML|5|371.196.211||TBL|CRE|B||||||6|1|1|189.00|350.00|||3|
2693|ML|5|371.196.212||TBL|CRE|M||||||6|1|1|189.00|350.00|||3|
2694|ML|5|371.196.213||TBL|CAM|B||||||6|1|1|189.00|350.00|||3|
2695|ML|5|371.196.214||TBL|CAM|M||||||6|1|1|189.00|350.00|||3|
2696|ML|5|371.196.215||TBL|OUR|B||||||6|1|1|189.00|350.00|||3|
2697|ML|5|371.196.216||TBL|OUR|M||||||6|1|1|189.00|350.00|||3|
2698|ML|5|371.196.217||TBL|COB|B||||||6|1|1|189.00|350.00|||3|
2699|ML|5|371.196.218||TBL|COB|M||||||6|1|1|189.00|350.00|||3|
2700|ML|5|371.196.219||TBL|CHO|B||||||6|1|1|189.00|350.00|||3|
2701|ML|5|371.196.220||TBL|CHO|M||||||6|1|1|189.00|350.00|||3|
2702|ML|5|371.196.221||TBL|VAG|B||||||6|1|1|189.00|350.00|||3|
2703|ML|5|371.196.222||TBL|VAG|M||||||6|1|1|189.00|350.00|||3|
2704|ML|5|371.196.223||TBL|AZE|B||||||6|1|1|189.00|350.00|||3|
2705|ML|5|371.196.224||TBL|AZE|M||||||6|1|1|189.00|350.00|||3|
2706|ML|5|371.196.225||TBL|AMA|B||||||6|1|1|189.00|350.00|||3|
2707|ML|5|371.196.226||TBL|AMA|M||||||6|1|1|189.00|350.00|||3|
2708|ML|5|371.196.227||TBL|AES|B||||||6|1|1|189.00|350.00|||3|
2709|ML|5|371.196.228||TBL|AES|M||||||6|1|1|189.00|350.00|||3|
2710|ML|5|371.196.229||TBL|PRA|B||||||6|1|1|189.00|350.00|||3|
2711|ML|5|371.196.230||TBL|PRA|M||||||6|1|1|189.00|350.00|||3|
2712|ML|5|371.196.231||TBL|ROS|B||||||6|1|1|189.00|350.00|||3|
2713|ML|5|371.196.232||TBL|ROS|M||||||6|1|1|189.00|350.00|||3|
2714|ML|5|371.196.233||TBL|VER|B||||||6|1|1|189.00|350.00|||3|
2715|ML|5|371.196.234||TBL|VER|M||||||6|1|1|189.00|350.00|||3|
2716|ML|5|371.196.235||TBL|AZB|||||||6|1|1|189.00|350.00|||3|
2717|ML|5|371.196.236||TBL|DEN|||||||6|1|1|189.00|350.00|||3|
2718|ML|5|371.196.237||TBL|BLK|||||||6|1|1|189.00|350.00|||3|
2719|ML|5|371.196.238||TBL|ART|||||||6|1|1|189.00|350.00|||3|
2720|ML|5|371.196.239||TBL|LIN|||||||6|1|1|189.00|350.00|||3|
2721|ML|5|371.196.240||TBL|HAL|||||||6|1|1|189.00|350.00|||3|
2722|ML|5|371.196.91||BCO|BCO|B||||||6|1|1|210.60|390.00|||3|
2723|ML|5|371.196.93||BCO|BCO|M||||||6|1|1|210.60|390.00|||3|
2724|ML|5|371.196.95||CCL|CCL|B||||||6|1|1|210.60|390.00|||3|
2725|ML|5|371.196.97||CCL|CCL|M||||||6|1|1|210.60|390.00|||3|
2726|ML|5|371.196.99||CME|CME|B||||||6|1|1|210.60|390.00|||3|
2727|ML|5|371.196.101||CME|CME|M||||||6|1|1|210.60|390.00|||3|
2728|ML|5|371.196.103||ANT|ANT|B||||||6|1|1|210.60|390.00|||3|
2729|ML|5|371.196.105||ANT|ANT|M||||||6|1|1|210.60|390.00|||3|
2730|ML|5|371.196.107||PTO|PTO|B||||||6|1|1|210.60|390.00|||3|
2731|ML|5|371.196.109||PTO|PTO|M||||||6|1|1|210.60|390.00|||3|
2732|ML|5|371.196.111||CRE|CRE|B||||||6|1|1|210.60|390.00|||3|
2733|ML|5|371.196.113||CRE|CRE|M||||||6|1|1|210.60|390.00|||3|
2734|ML|5|371.196.115||CAM|CAM|B||||||6|1|1|210.60|390.00|||3|
2735|ML|5|371.196.117||CAM|CAM|M||||||6|1|1|210.60|390.00|||3|
2736|ML|5|371.196.119||OUR|OUR|B||||||6|1|1|210.60|390.00|||3|
2737|ML|5|371.196.121||OUR|OUR|M||||||6|1|1|210.60|390.00|||3|
2738|ML|5|371.196.123||COB|COB|B||||||6|1|1|210.60|390.00|||3|
2739|ML|5|371.196.125||COB|COB|M||||||6|1|1|210.60|390.00|||3|
2740|ML|5|371.196.127||CHO|CHO|B||||||6|1|1|210.60|390.00|||3|
2741|ML|5|371.196.129||CHO|CHO|M||||||6|1|1|210.60|390.00|||3|
2742|ML|5|371.196.131||VAG|VAG|B||||||6|1|1|210.60|390.00|||3|
2743|ML|5|371.196.133||VAG|VAG|M||||||6|1|1|210.60|390.00|||3|
2744|ML|5|371.196.135||AZE|AZE|B||||||6|1|1|210.60|390.00|||3|
2745|ML|5|371.196.137||AZE|AZE|M||||||6|1|1|210.60|390.00|||3|
2746|ML|5|371.196.139||AMA|AMA|B||||||6|1|1|210.60|390.00|||3|
2747|ML|5|371.196.141||AMA|AMA|M||||||6|1|1|210.60|390.00|||3|
2748|ML|5|371.196.143||AES|AES|B||||||6|1|1|210.60|390.00|||3|
2749|ML|5|371.196.145||AES|AES|M||||||6|1|1|210.60|390.00|||3|
2750|ML|5|371.196.147||PRA|PRA|B||||||6|1|1|210.60|390.00|||3|
2751|ML|5|371.196.149||PRA|PRA|M||||||6|1|1|210.60|390.00|||3|
2752|ML|5|371.196.151||ROS|ROS|B||||||6|1|1|210.60|390.00|||3|
2753|ML|5|371.196.153||ROS|ROS|M||||||6|1|1|210.60|390.00|||3|
2754|ML|5|371.196.155||VER|VER|B||||||6|1|1|210.60|390.00|||3|
2755|ML|5|371.196.157||VER|VER|M||||||6|1|1|210.60|390.00|||3|
2756|ML|5|371.196.165||AZB|AZB|||||||6|1|1|210.60|390.00|||3|
2757|ML|5|371.196.167||DEN|DEN|||||||6|1|1|210.60|390.00|||3|
2758|ML|5|371.196.169||BLK|BLK|||||||6|1|1|210.60|390.00|||3|
2759|ML|5|371.196.171||ART|ART|||||||6|1|1|210.60|390.00|||3|
2760|ML|5|371.196.173||LIN|LIN|||||||6|1|1|210.60|390.00|||3|
2761|ML|5|371.196.175||HAL|HAL|||||||6|1|1|210.60|390.00|||3|
2762|ML|6|371.196.241||TBL|TBL|||||||6|1|1|156.60|290.00|||3|
2763|ML|6|371.196.242||TEA|TEA|||||||6|1|1|156.60|290.00|||3|
2764|ML|6|371.196.243||OAK|OAK|||||||6|1|1|156.60|290.00|||3|
2765|ML|6|371.196.244||JOP|JOP|||||||6|1|1|156.60|290.00|||3|
2766|ML|6|371.196.245||TBL|BCO|B||||||6|1|1|183.60|340.00|||3|
2767|ML|6|371.196.246||TBL|BCO|M||||||6|1|1|183.60|340.00|||3|
2768|ML|6|371.196.247||TBL|CCL|B||||||6|1|1|183.60|340.00|||3|
2769|ML|6|371.196.248||TBL|CCL|M||||||6|1|1|183.60|340.00|||3|
2770|ML|6|371.196.249||TBL|CME|B||||||6|1|1|183.60|340.00|||3|
2771|ML|6|371.196.250||TBL|CME|M||||||6|1|1|183.60|340.00|||3|
2772|ML|6|371.196.251||TBL|ANT|B||||||6|1|1|183.60|340.00|||3|
2773|ML|6|371.196.252||TBL|ANT|M||||||6|1|1|183.60|340.00|||3|
2774|ML|6|371.196.253||TBL|PTO|B||||||6|1|1|183.60|340.00|||3|
2775|ML|6|371.196.254||TBL|PTO|M||||||6|1|1|183.60|340.00|||3|
2776|ML|6|371.196.255||TBL|CRE|B||||||6|1|1|183.60|340.00|||3|
2777|ML|6|371.196.256||TBL|CRE|M||||||6|1|1|183.60|340.00|||3|
2778|ML|6|371.196.257||TBL|CAM|B||||||6|1|1|183.60|340.00|||3|
2779|ML|6|371.196.258||TBL|CAM|M||||||6|1|1|183.60|340.00|||3|
2780|ML|6|371.196.259||TBL|OUR|B||||||6|1|1|183.60|340.00|||3|
2781|ML|6|371.196.260||TBL|OUR|M||||||6|1|1|183.60|340.00|||3|
2782|ML|6|371.196.261||TBL|COB|B||||||6|1|1|183.60|340.00|||3|
2783|ML|6|371.196.262||TBL|COB|M||||||6|1|1|183.60|340.00|||3|
2784|ML|6|371.196.263||TBL|CHO|B||||||6|1|1|183.60|340.00|||3|
2785|ML|6|371.196.264||TBL|CHO|M||||||6|1|1|183.60|340.00|||3|
2786|ML|6|371.196.265||TBL|VAG|B||||||6|1|1|183.60|340.00|||3|
2787|ML|6|371.196.266||TBL|VAG|M||||||6|1|1|183.60|340.00|||3|
2788|ML|6|371.196.267||TBL|AZE|B||||||6|1|1|183.60|340.00|||3|
2789|ML|6|371.196.268||TBL|AZE|M||||||6|1|1|183.60|340.00|||3|
2790|ML|6|371.196.269||TBL|AMA|B||||||6|1|1|183.60|340.00|||3|
2791|ML|6|371.196.270||TBL|AMA|M||||||6|1|1|183.60|340.00|||3|
2792|ML|6|371.196.271||TBL|AES|B||||||6|1|1|183.60|340.00|||3|
2793|ML|6|371.196.272||TBL|AES|M||||||6|1|1|183.60|340.00|||3|
2794|ML|6|371.196.273||TBL|PRA|B||||||6|1|1|183.60|340.00|||3|
2795|ML|6|371.196.274||TBL|PRA|M||||||6|1|1|183.60|340.00|||3|
2796|ML|6|371.196.275||TBL|ROS|B||||||6|1|1|183.60|340.00|||3|
2797|ML|6|371.196.276||TBL|ROS|M||||||6|1|1|183.60|340.00|||3|
2798|ML|6|371.196.277||TBL|VER|B||||||6|1|1|183.60|340.00|||3|
2799|ML|6|371.196.278||TBL|VER|M||||||6|1|1|183.60|340.00|||3|
2800|ML|6|371.196.279||TBL|AZB|||||||6|1|1|183.60|340.00|||3|
2801|ML|6|371.196.280||TBL|DEN|||||||6|1|1|183.60|340.00|||3|
2802|ML|6|371.196.281||TBL|BLK|||||||6|1|1|183.60|340.00|||3|
2803|ML|6|371.196.282||TBL|ART|||||||6|1|1|183.60|340.00|||3|
2804|ML|6|371.196.283||TBL|LIN|||||||6|1|1|183.60|340.00|||3|
2805|ML|6|371.196.284||TBL|HAL|||||||6|1|1|183.60|340.00|||3|
2806|ML|6|371.196.285||BCO|BCO|B||||||6|1|1|205.20|380.00|||3|
2807|ML|6|371.196.286||BCO|BCO|M||||||6|1|1|205.20|380.00|||3|
2808|ML|6|371.196.287||CCL|CCL|B||||||6|1|1|205.20|380.00|||3|
2809|ML|6|371.196.288||CCL|CCL|M||||||6|1|1|205.20|380.00|||3|
2810|ML|6|371.196.289||CME|CME|B||||||6|1|1|205.20|380.00|||3|
2811|ML|6|371.196.290||CME|CME|M||||||6|1|1|205.20|380.00|||3|
2812|ML|6|371.196.291||ANT|ANT|B||||||6|1|1|205.20|380.00|||3|
2813|ML|6|371.196.292||ANT|ANT|M||||||6|1|1|205.20|380.00|||3|
2814|ML|6|371.196.293||PTO|PTO|B||||||6|1|1|205.20|380.00|||3|
2815|ML|6|371.196.294||PTO|PTO|M||||||6|1|1|205.20|380.00|||3|
2816|ML|6|371.196.295||CRE|CRE|B||||||6|1|1|205.20|380.00|||3|
2817|ML|6|371.196.296||CRE|CRE|M||||||6|1|1|205.20|380.00|||3|
2818|ML|6|371.196.297||CAM|CAM|B||||||6|1|1|205.20|380.00|||3|
2819|ML|6|371.196.298||CAM|CAM|M||||||6|1|1|205.20|380.00|||3|
2820|ML|6|371.196.299||OUR|OUR|B||||||6|1|1|205.20|380.00|||3|
2821|ML|6|371.196.300||OUR|OUR|M||||||6|1|1|205.20|380.00|||3|
2822|ML|6|371.196.301||COB|COB|B||||||6|1|1|205.20|380.00|||3|
2823|ML|6|371.196.302||COB|COB|M||||||6|1|1|205.20|380.00|||3|
2824|ML|6|371.196.303||CHO|CHO|B||||||6|1|1|205.20|380.00|||3|
2825|ML|6|371.196.304||CHO|CHO|M||||||6|1|1|205.20|380.00|||3|
2826|ML|6|371.196.305||VAG|VAG|B||||||6|1|1|205.20|380.00|||3|
2827|ML|6|371.196.306||VAG|VAG|M||||||6|1|1|205.20|380.00|||3|
2828|ML|6|371.196.307||AZE|AZE|B||||||6|1|1|205.20|380.00|||3|
2829|ML|6|371.196.308||AZE|AZE|M||||||6|1|1|205.20|380.00|||3|
2830|ML|6|371.196.309||AMA|AMA|B||||||6|1|1|205.20|380.00|||3|
2831|ML|6|371.196.310||AMA|AMA|M||||||6|1|1|205.20|380.00|||3|
2832|ML|6|371.196.311||AES|AES|B||||||6|1|1|205.20|380.00|||3|
2833|ML|6|371.196.312||AES|AES|M||||||6|1|1|205.20|380.00|||3|
2834|ML|6|371.196.313||PRA|PRA|B||||||6|1|1|205.20|380.00|||3|
2835|ML|6|371.196.314||PRA|PRA|M||||||6|1|1|205.20|380.00|||3|
2836|ML|6|371.196.315||ROS|ROS|B||||||6|1|1|205.20|380.00|||3|
2837|ML|6|371.196.316||ROS|ROS|M||||||6|1|1|205.20|380.00|||3|
2838|ML|6|371.196.317||VER|VER|B||||||6|1|1|205.20|380.00|||3|
2839|ML|6|371.196.318||VER|VER|M||||||6|1|1|205.20|380.00|||3|
2840|ML|6|371.196.319||AZB|AZB|||||||6|1|1|205.20|380.00|||3|
2841|ML|6|371.196.320||DEN|DEN|||||||6|1|1|205.20|380.00|||3|
2842|ML|6|371.196.321||BLK|BLK|||||||6|1|1|205.20|380.00|||3|
2843|ML|6|371.196.322||ART|ART|||||||6|1|1|205.20|380.00|||3|
2844|ML|6|371.196.323||LIN|LIN|||||||6|1|1|205.20|380.00|||3|
2845|ML|6|371.196.324||HAL|HAL|||||||6|1|1|205.20|380.00|||3|
2846|ML|5|372.196.197||TBL|TBL|||||||2|1|1|178.20|330.00|||3|
2847|ML|5|372.196.198||TEA|TEA|||||||2|1|1|178.20|330.00|||3|
2848|ML|5|372.196.199||OAK|OAK|||||||2|1|1|178.20|330.00|||3|
2849|ML|5|372.196.200||JOP|JOP|||||||2|1|1|178.20|330.00|||3|
2850|ML|5|372.196.201||TBL|BCO|B||||||2|1|1|205.20|380.00|||3|
2851|ML|5|372.196.202||TBL|BCO|M||||||2|1|1|205.20|380.00|||3|
2852|ML|5|372.196.203||TBL|CCL|B||||||2|1|1|205.20|380.00|||3|
2853|ML|5|372.196.204||TBL|CCL|M||||||2|1|1|205.20|380.00|||3|
2854|ML|5|372.196.205||TBL|CME|B||||||2|1|1|205.20|380.00|||3|
2855|ML|5|372.196.206||TBL|CME|M||||||2|1|1|205.20|380.00|||3|
2856|ML|5|372.196.207||TBL|ANT|B||||||2|1|1|205.20|380.00|||3|
2857|ML|5|372.196.208||TBL|ANT|M||||||2|1|1|205.20|380.00|||3|
2858|ML|5|372.196.209||TBL|PTO|B||||||2|1|1|205.20|380.00|||3|
2859|ML|5|372.196.210||TBL|PTO|M||||||2|1|1|205.20|380.00|||3|
2860|ML|5|372.196.211||TBL|CRE|B||||||2|1|1|205.20|380.00|||3|
2861|ML|5|372.196.212||TBL|CRE|M||||||2|1|1|205.20|380.00|||3|
2862|ML|5|372.196.213||TBL|CAM|B||||||2|1|1|205.20|380.00|||3|
2863|ML|5|372.196.214||TBL|CAM|M||||||2|1|1|205.20|380.00|||3|
2864|ML|5|372.196.215||TBL|OUR|B||||||2|1|1|205.20|380.00|||3|
2865|ML|5|372.196.216||TBL|OUR|M||||||2|1|1|205.20|380.00|||3|
2866|ML|5|372.196.217||TBL|COB|B||||||2|1|1|205.20|380.00|||3|
2867|ML|5|372.196.218||TBL|COB|M||||||2|1|1|205.20|380.00|||3|
2868|ML|5|372.196.219||TBL|CHO|B||||||2|1|1|205.20|380.00|||3|
2869|ML|5|372.196.220||TBL|CHO|M||||||2|1|1|205.20|380.00|||3|
2870|ML|5|372.196.221||TBL|VAG|B||||||2|1|1|205.20|380.00|||3|
2871|ML|5|372.196.222||TBL|VAG|M||||||2|1|1|205.20|380.00|||3|
2872|ML|5|372.196.223||TBL|AZE|B||||||2|1|1|205.20|380.00|||3|
2873|ML|5|372.196.224||TBL|AZE|M||||||2|1|1|205.20|380.00|||3|
2874|ML|5|372.196.225||TBL|AMA|B||||||2|1|1|205.20|380.00|||3|
2875|ML|5|372.196.226||TBL|AMA|M||||||2|1|1|205.20|380.00|||3|
2876|ML|5|372.196.227||TBL|AES|B||||||2|1|1|205.20|380.00|||3|
2877|ML|5|372.196.228||TBL|AES|M||||||2|1|1|205.20|380.00|||3|
2878|ML|5|372.196.229||TBL|PRA|B||||||2|1|1|205.20|380.00|||3|
2879|ML|5|372.196.230||TBL|PRA|M||||||2|1|1|205.20|380.00|||3|
2880|ML|5|372.196.231||TBL|ROS|B||||||2|1|1|205.20|380.00|||3|
2881|ML|5|372.196.232||TBL|ROS|M||||||2|1|1|205.20|380.00|||3|
2882|ML|5|372.196.233||TBL|VER|B||||||2|1|1|205.20|380.00|||3|
2883|ML|5|372.196.234||TBL|VER|M||||||2|1|1|205.20|380.00|||3|
2884|ML|5|372.196.235||TBL|AZB|||||||2|1|1|205.20|380.00|||3|
2885|ML|5|372.196.236||TBL|DEN|||||||2|1|1|205.20|380.00|||3|
2886|ML|5|372.196.237||TBL|BLK|||||||2|1|1|205.20|380.00|||3|
2887|ML|5|372.196.238||TBL|ART|||||||2|1|1|205.20|380.00|||3|
2888|ML|5|372.196.239||TBL|LIN|||||||2|1|1|205.20|380.00|||3|
2889|ML|5|372.196.240||TBL|HAL|||||||2|1|1|205.20|380.00|||3|
2890|ML|5|372.196.91||BCO|BCO|B||||||2|1|1|226.80|420.00|||3|
2891|ML|5|372.196.93||BCO|BCO|M||||||2|1|1|226.80|420.00|||3|
2892|ML|5|372.196.95||CCL|CCL|B||||||2|1|1|226.80|420.00|||3|
2893|ML|5|372.196.97||CCL|CCL|M||||||2|1|1|226.80|420.00|||3|
2894|ML|5|372.196.99||CME|CME|B||||||2|1|1|226.80|420.00|||3|
2895|ML|5|372.196.101||CME|CME|M||||||2|1|1|226.80|420.00|||3|
2896|ML|5|372.196.103||ANT|ANT|B||||||2|1|1|226.80|420.00|||3|
2897|ML|5|372.196.105||ANT|ANT|M||||||2|1|1|226.80|420.00|||3|
2898|ML|5|372.196.107||PTO|PTO|B||||||2|1|1|226.80|420.00|||3|
2899|ML|5|372.196.109||PTO|PTO|M||||||2|1|1|226.80|420.00|||3|
2900|ML|5|372.196.111||CRE|CRE|B||||||2|1|1|226.80|420.00|||3|
2901|ML|5|372.196.113||CRE|CRE|M||||||2|1|1|226.80|420.00|||3|
2902|ML|5|372.196.115||CAM|CAM|B||||||2|1|1|226.80|420.00|||3|
2903|ML|5|372.196.117||CAM|CAM|M||||||2|1|1|226.80|420.00|||3|
2904|ML|5|372.196.119||OUR|OUR|B||||||2|1|1|226.80|420.00|||3|
2905|ML|5|372.196.121||OUR|OUR|M||||||2|1|1|226.80|420.00|||3|
2906|ML|5|372.196.123||COB|COB|B||||||2|1|1|226.80|420.00|||3|
2907|ML|5|372.196.125||COB|COB|M||||||2|1|1|226.80|420.00|||3|
2908|ML|5|372.196.127||CHO|CHO|B||||||2|1|1|226.80|420.00|||3|
2909|ML|5|372.196.129||CHO|CHO|M||||||2|1|1|226.80|420.00|||3|
2910|ML|5|372.196.131||VAG|VAG|B||||||2|1|1|226.80|420.00|||3|
2911|ML|5|372.196.133||VAG|VAG|M||||||2|1|1|226.80|420.00|||3|
2912|ML|5|372.196.135||AZE|AZE|B||||||2|1|1|226.80|420.00|||3|
2913|ML|5|372.196.137||AZE|AZE|M||||||2|1|1|226.80|420.00|||3|
2914|ML|5|372.196.139||AMA|AMA|B||||||2|1|1|226.80|420.00|||3|
2915|ML|5|372.196.141||AMA|AMA|M||||||2|1|1|226.80|420.00|||3|
2916|ML|5|372.196.143||AES|AES|B||||||2|1|1|226.80|420.00|||3|
2917|ML|5|372.196.145||AES|AES|M||||||2|1|1|226.80|420.00|||3|
2918|ML|5|372.196.147||PRA|PRA|B||||||2|1|1|226.80|420.00|||3|
2919|ML|5|372.196.149||PRA|PRA|M||||||2|1|1|226.80|420.00|||3|
2920|ML|5|372.196.151||ROS|ROS|B||||||2|1|1|226.80|420.00|||3|
2921|ML|5|372.196.153||ROS|ROS|M||||||2|1|1|226.80|420.00|||3|
2922|ML|5|372.196.155||VER|VER|B||||||2|1|1|226.80|420.00|||3|
2923|ML|5|372.196.157||VER|VER|M||||||2|1|1|226.80|420.00|||3|
2924|ML|5|372.196.165||AZB|AZB|||||||2|1|1|226.80|420.00|||3|
2925|ML|5|372.196.167||DEN|DEN|||||||2|1|1|226.80|420.00|||3|
2926|ML|5|372.196.169||BLK|BLK|||||||2|1|1|226.80|420.00|||3|
2927|ML|5|372.196.171||ART|ART|||||||2|1|1|226.80|420.00|||3|
2928|ML|5|372.196.173||LIN|LIN|||||||2|1|1|226.80|420.00|||3|
2929|ML|5|372.196.175||HAL|HAL|||||||2|1|1|226.80|420.00|||3|
2930|ML|6|372.196.241||TBL|TBL|||||||2|1|1|172.80|320.00|||3|
2931|ML|6|372.196.242||TEA|TEA|||||||2|1|1|172.80|320.00|||3|
2932|ML|6|372.196.243||OAK|OAK|||||||2|1|1|172.80|320.00|||3|
2933|ML|6|372.196.244||JOP|JOP|||||||2|1|1|172.80|320.00|||3|
2934|ML|6|372.196.245||TBL|BCO|B||||||2|1|1|199.80|370.00|||3|
2935|ML|6|372.196.246||TBL|BCO|M||||||2|1|1|199.80|370.00|||3|
2936|ML|6|372.196.247||TBL|CCL|B||||||2|1|1|199.80|370.00|||3|
2937|ML|6|372.196.248||TBL|CCL|M||||||2|1|1|199.80|370.00|||3|
2938|ML|6|372.196.249||TBL|CME|B||||||2|1|1|199.80|370.00|||3|
2939|ML|6|372.196.250||TBL|CME|M||||||2|1|1|199.80|370.00|||3|
2940|ML|6|372.196.251||TBL|ANT|B||||||2|1|1|199.80|370.00|||3|
2941|ML|6|372.196.252||TBL|ANT|M||||||2|1|1|199.80|370.00|||3|
2942|ML|6|372.196.253||TBL|PTO|B||||||2|1|1|199.80|370.00|||3|
2943|ML|6|372.196.254||TBL|PTO|M||||||2|1|1|199.80|370.00|||3|
2944|ML|6|372.196.255||TBL|CRE|B||||||2|1|1|199.80|370.00|||3|
2945|ML|6|372.196.256||TBL|CRE|M||||||2|1|1|199.80|370.00|||3|
2946|ML|6|372.196.257||TBL|CAM|B||||||2|1|1|199.80|370.00|||3|
2947|ML|6|372.196.258||TBL|CAM|M||||||2|1|1|199.80|370.00|||3|
2948|ML|6|372.196.259||TBL|OUR|B||||||2|1|1|199.80|370.00|||3|
2949|ML|6|372.196.260||TBL|OUR|M||||||2|1|1|199.80|370.00|||3|
2950|ML|6|372.196.261||TBL|COB|B||||||2|1|1|199.80|370.00|||3|
2951|ML|6|372.196.262||TBL|COB|M||||||2|1|1|199.80|370.00|||3|
2952|ML|6|372.196.263||TBL|CHO|B||||||2|1|1|199.80|370.00|||3|
2953|ML|6|372.196.264||TBL|CHO|M||||||2|1|1|199.80|370.00|||3|
2954|ML|6|372.196.265||TBL|VAG|B||||||2|1|1|199.80|370.00|||3|
2955|ML|6|372.196.266||TBL|VAG|M||||||2|1|1|199.80|370.00|||3|
2956|ML|6|372.196.267||TBL|AZE|B||||||2|1|1|199.80|370.00|||3|
2957|ML|6|372.196.268||TBL|AZE|M||||||2|1|1|199.80|370.00|||3|
2958|ML|6|372.196.269||TBL|AMA|B||||||2|1|1|199.80|370.00|||3|
2959|ML|6|372.196.270||TBL|AMA|M||||||2|1|1|199.80|370.00|||3|
2960|ML|6|372.196.271||TBL|AES|B||||||2|1|1|199.80|370.00|||3|
2961|ML|6|372.196.272||TBL|AES|M||||||2|1|1|199.80|370.00|||3|
2962|ML|6|372.196.273||TBL|PRA|B||||||2|1|1|199.80|370.00|||3|
2963|ML|6|372.196.274||TBL|PRA|M||||||2|1|1|199.80|370.00|||3|
2964|ML|6|372.196.275||TBL|ROS|B||||||2|1|1|199.80|370.00|||3|
2965|ML|6|372.196.276||TBL|ROS|M||||||2|1|1|199.80|370.00|||3|
2966|ML|6|372.196.277||TBL|VER|B||||||2|1|1|199.80|370.00|||3|
2967|ML|6|372.196.278||TBL|VER|M||||||2|1|1|199.80|370.00|||3|
2968|ML|6|372.196.279||TBL|AZB|||||||2|1|1|199.80|370.00|||3|
2969|ML|6|372.196.280||TBL|DEN|||||||2|1|1|199.80|370.00|||3|
2970|ML|6|372.196.281||TBL|BLK|||||||2|1|1|199.80|370.00|||3|
2971|ML|6|372.196.282||TBL|ART|||||||2|1|1|199.80|370.00|||3|
2972|ML|6|372.196.283||TBL|LIN|||||||2|1|1|199.80|370.00|||3|
2973|ML|6|372.196.284||TBL|HAL|||||||2|1|1|199.80|370.00|||3|
2974|ML|6|372.196.285||BCO|BCO|B||||||2|1|1|221.40|410.00|||3|
2975|ML|6|372.196.286||BCO|BCO|M||||||2|1|1|221.40|410.00|||3|
2976|ML|6|372.196.287||CCL|CCL|B||||||2|1|1|221.40|410.00|||3|
2977|ML|6|372.196.288||CCL|CCL|M||||||2|1|1|221.40|410.00|||3|
2978|ML|6|372.196.289||CME|CME|B||||||2|1|1|221.40|410.00|||3|
2979|ML|6|372.196.290||CME|CME|M||||||2|1|1|221.40|410.00|||3|
2980|ML|6|372.196.291||ANT|ANT|B||||||2|1|1|221.40|410.00|||3|
2981|ML|6|372.196.292||ANT|ANT|M||||||2|1|1|221.40|410.00|||3|
2982|ML|6|372.196.293||PTO|PTO|B||||||2|1|1|221.40|410.00|||3|
2983|ML|6|372.196.294||PTO|PTO|M||||||2|1|1|221.40|410.00|||3|
2984|ML|6|372.196.295||CRE|CRE|B||||||2|1|1|221.40|410.00|||3|
2985|ML|6|372.196.296||CRE|CRE|M||||||2|1|1|221.40|410.00|||3|
2986|ML|6|372.196.297||CAM|CAM|B||||||2|1|1|221.40|410.00|||3|
2987|ML|6|372.196.298||CAM|CAM|M||||||2|1|1|221.40|410.00|||3|
2988|ML|6|372.196.299||OUR|OUR|B||||||2|1|1|221.40|410.00|||3|
2989|ML|6|372.196.300||OUR|OUR|M||||||2|1|1|221.40|410.00|||3|
2990|ML|6|372.196.301||COB|COB|B||||||2|1|1|221.40|410.00|||3|
2991|ML|6|372.196.302||COB|COB|M||||||2|1|1|221.40|410.00|||3|
2992|ML|6|372.196.303||CHO|CHO|B||||||2|1|1|221.40|410.00|||3|
2993|ML|6|372.196.304||CHO|CHO|M||||||2|1|1|221.40|410.00|||3|
2994|ML|6|372.196.305||VAG|VAG|B||||||2|1|1|221.40|410.00|||3|
2995|ML|6|372.196.306||VAG|VAG|M||||||2|1|1|221.40|410.00|||3|
2996|ML|6|372.196.307||AZE|AZE|B||||||2|1|1|221.40|410.00|||3|
2997|ML|6|372.196.308||AZE|AZE|M||||||2|1|1|221.40|410.00|||3|
2998|ML|6|372.196.309||AMA|AMA|B||||||2|1|1|221.40|410.00|||3|
2999|ML|6|372.196.310||AMA|AMA|M||||||2|1|1|221.40|410.00|||3|
3000|ML|6|372.196.311||AES|AES|B||||||2|1|1|221.40|410.00|||3|
3001|ML|6|372.196.312||AES|AES|M||||||2|1|1|221.40|410.00|||3|
3002|ML|6|372.196.313||PRA|PRA|B||||||2|1|1|221.40|410.00|||3|
3003|ML|6|372.196.314||PRA|PRA|M||||||2|1|1|221.40|410.00|||3|
3004|ML|6|372.196.315||ROS|ROS|B||||||2|1|1|221.40|410.00|||3|
3005|ML|6|372.196.316||ROS|ROS|M||||||2|1|1|221.40|410.00|||3|
3006|ML|6|372.196.317||VER|VER|B||||||2|1|1|221.40|410.00|||3|
3007|ML|6|372.196.318||VER|VER|M||||||2|1|1|221.40|410.00|||3|
3008|ML|6|372.196.319||AZB|AZB|||||||2|1|1|221.40|410.00|||3|
3009|ML|6|372.196.320||DEN|DEN|||||||2|1|1|221.40|410.00|||3|
3010|ML|6|372.196.321||BLK|BLK|||||||2|1|1|221.40|410.00|||3|
3011|ML|6|372.196.322||ART|ART|||||||2|1|1|221.40|410.00|||3|
3012|ML|6|372.196.323||LIN|LIN|||||||2|1|1|221.40|410.00|||3|
3013|ML|6|372.196.324||HAL|HAL|||||||2|1|1|221.40|410.00|||3|
3014|ML|7|372.196.327||TBL|TBL|||||||2|1|1|332.10|615.00|||3|
3015|ML|7|372.196.328||TEA|TEA|||||||2|1|1|332.10|615.00|||3|
3016|ML|7|372.196.329||OAK|OAK|||||||2|1|1|332.10|615.00|||3|
3017|ML|7|372.196.330||JOP|JOP|||||||2|1|1|332.10|615.00|||3|
3018|ML|7|372.196.331||TBL|BCO|B||||||2|1|1|359.10|665.00|||3|
3019|ML|7|372.196.332||TBL|BCO|M||||||2|1|1|359.10|665.00|||3|
3020|ML|7|372.196.333||TBL|CCL|B||||||2|1|1|359.10|665.00|||3|
3021|ML|7|372.196.334||TBL|CCL|M||||||2|1|1|359.10|665.00|||3|
3022|ML|7|372.196.335||TBL|CME|B||||||2|1|1|359.10|665.00|||3|
3023|ML|7|372.196.336||TBL|CME|M||||||2|1|1|359.10|665.00|||3|
3024|ML|7|372.196.337||TBL|ANT|B||||||2|1|1|359.10|665.00|||3|
3025|ML|7|372.196.338||TBL|ANT|M||||||2|1|1|359.10|665.00|||3|
3026|ML|7|372.196.339||TBL|PTO|B||||||2|1|1|359.10|665.00|||3|
3027|ML|7|372.196.340||TBL|PTO|M||||||2|1|1|359.10|665.00|||3|
3028|ML|7|372.196.341||TBL|CRE|B||||||2|1|1|359.10|665.00|||3|
3029|ML|7|372.196.342||TBL|CRE|M||||||2|1|1|359.10|665.00|||3|
3030|ML|7|372.196.343||TBL|CAM|B||||||2|1|1|359.10|665.00|||3|
3031|ML|7|372.196.344||TBL|CAM|M||||||2|1|1|359.10|665.00|||3|
3032|ML|7|372.196.345||TBL|OUR|B||||||2|1|1|359.10|665.00|||3|
3033|ML|7|372.196.346||TBL|OUR|M||||||2|1|1|359.10|665.00|||3|
3034|ML|7|372.196.347||TBL|COB|B||||||2|1|1|359.10|665.00|||3|
3035|ML|7|372.196.348||TBL|COB|M||||||2|1|1|359.10|665.00|||3|
3036|ML|7|372.196.349||TBL|CHO|B||||||2|1|1|359.10|665.00|||3|
3037|ML|7|372.196.350||TBL|CHO|M||||||2|1|1|359.10|665.00|||3|
3038|ML|7|372.196.351||TBL|VAG|B||||||2|1|1|359.10|665.00|||3|
3039|ML|7|372.196.352||TBL|VAG|M||||||2|1|1|359.10|665.00|||3|
3040|ML|7|372.196.353||TBL|AZE|B||||||2|1|1|359.10|665.00|||3|
3041|ML|7|372.196.354||TBL|AZE|M||||||2|1|1|359.10|665.00|||3|
3042|ML|7|372.196.355||TBL|AMA|B||||||2|1|1|359.10|665.00|||3|
3043|ML|7|372.196.356||TBL|AMA|M||||||2|1|1|359.10|665.00|||3|
3044|ML|7|372.196.357||TBL|AES|B||||||2|1|1|359.10|665.00|||3|
3045|ML|7|372.196.358||TBL|AES|M||||||2|1|1|359.10|665.00|||3|
3046|ML|7|372.196.359||TBL|PRA|B||||||2|1|1|359.10|665.00|||3|
3047|ML|7|372.196.360||TBL|PRA|M||||||2|1|1|359.10|665.00|||3|
3048|ML|7|372.196.361||TBL|ROS|B||||||2|1|1|359.10|665.00|||3|
3049|ML|7|372.196.362||TBL|ROS|M||||||2|1|1|359.10|665.00|||3|
3050|ML|7|372.196.363||TBL|VER|B||||||2|1|1|359.10|665.00|||3|
3051|ML|7|372.196.364||TBL|VER|M||||||2|1|1|359.10|665.00|||3|
3052|ML|7|372.196.365||TBL|AZB|||||||2|1|1|359.10|665.00|||3|
3053|ML|7|372.196.366||TBL|DEN|||||||2|1|1|359.10|665.00|||3|
3054|ML|7|372.196.367||TBL|BLK|||||||2|1|1|359.10|665.00|||3|
3055|ML|7|372.196.368||TBL|ART|||||||2|1|1|359.10|665.00|||3|
3056|ML|7|372.196.369||TBL|LIN|||||||2|1|1|359.10|665.00|||3|
3057|ML|7|372.196.370||TBL|HAL|||||||2|1|1|359.10|665.00|||3|
3058|ML|7|372.196.92||BCO|BCO|B||||||2|1|1|380.70|705.00|||3|
3059|ML|7|372.196.94||BCO|BCO|M||||||2|1|1|380.70|705.00|||3|
3060|ML|7|372.196.96||CCL|CCL|B||||||2|1|1|380.70|705.00|||3|
3061|ML|7|372.196.98||CCL|CCL|M||||||2|1|1|380.70|705.00|||3|
3062|ML|7|372.196.100||CME|CME|B||||||2|1|1|380.70|705.00|||3|
3063|ML|7|372.196.102||CME|CME|M||||||2|1|1|380.70|705.00|||3|
3064|ML|7|372.196.104||ANT|ANT|B||||||2|1|1|380.70|705.00|||3|
3065|ML|7|372.196.106||ANT|ANT|M||||||2|1|1|380.70|705.00|||3|
3066|ML|7|372.196.108||PTO|PTO|B||||||2|1|1|380.70|705.00|||3|
3067|ML|7|372.196.110||PTO|PTO|M||||||2|1|1|380.70|705.00|||3|
3068|ML|7|372.196.112||CRE|CRE|B||||||2|1|1|380.70|705.00|||3|
3069|ML|7|372.196.114||CRE|CRE|M||||||2|1|1|380.70|705.00|||3|
3070|ML|7|372.196.116||CAM|CAM|B||||||2|1|1|380.70|705.00|||3|
3071|ML|7|372.196.118||CAM|CAM|M||||||2|1|1|380.70|705.00|||3|
3072|ML|7|372.196.120||OUR|OUR|B||||||2|1|1|380.70|705.00|||3|
3073|ML|7|372.196.122||OUR|OUR|M||||||2|1|1|380.70|705.00|||3|
3074|ML|7|372.196.124||COB|COB|B||||||2|1|1|380.70|705.00|||3|
3075|ML|7|372.196.126||COB|COB|M||||||2|1|1|380.70|705.00|||3|
3076|ML|7|372.196.128||CHO|CHO|B||||||2|1|1|380.70|705.00|||3|
3077|ML|7|372.196.130||CHO|CHO|M||||||2|1|1|380.70|705.00|||3|
3078|ML|7|372.196.132||VAG|VAG|B||||||2|1|1|380.70|705.00|||3|
3079|ML|7|372.196.134||VAG|VAG|M||||||2|1|1|380.70|705.00|||3|
3080|ML|7|372.196.136||AZE|AZE|B||||||2|1|1|380.70|705.00|||3|
3081|ML|7|372.196.138||AZE|AZE|M||||||2|1|1|380.70|705.00|||3|
3082|ML|7|372.196.140||AMA|AMA|B||||||2|1|1|380.70|705.00|||3|
3083|ML|7|372.196.142||AMA|AMA|M||||||2|1|1|380.70|705.00|||3|
3084|ML|7|372.196.144||AES|AES|B||||||2|1|1|380.70|705.00|||3|
3085|ML|7|372.196.146||AES|AES|M||||||2|1|1|380.70|705.00|||3|
3086|ML|7|372.196.148||PRA|PRA|B||||||2|1|1|380.70|705.00|||3|
3087|ML|7|372.196.150||PRA|PRA|M||||||2|1|1|380.70|705.00|||3|
3088|ML|7|372.196.152||ROS|ROS|B||||||2|1|1|380.70|705.00|||3|
3089|ML|7|372.196.154||ROS|ROS|M||||||2|1|1|380.70|705.00|||3|
3090|ML|7|372.196.156||VER|VER|B||||||2|1|1|380.70|705.00|||3|
3091|ML|7|372.196.158||VER|VER|M||||||2|1|1|380.70|705.00|||3|
3092|ML|7|372.196.166||AZB|AZB|||||||2|1|1|380.70|705.00|||3|
3093|ML|7|372.196.168||DEN|DEN|||||||2|1|1|380.70|705.00|||3|
3094|ML|7|372.196.170||BLK|BLK|||||||2|1|1|380.70|705.00|||3|
3095|ML|7|372.196.172||ART|ART|||||||2|1|1|380.70|705.00|||3|
3096|ML|7|372.196.174||LIN|LIN|||||||2|1|1|380.70|705.00|||3|
3097|ML|7|372.196.176||HAL|HAL|||||||2|1|1|380.70|705.00|||3|
3098|ML|5|373.196.197||TBL|TBL|||||||3|1|1|243.00|450.00|||3|
3099|ML|5|373.196.198||TEA|TEA|||||||3|1|1|243.00|450.00|||3|
3100|ML|5|373.196.199||OAK|OAK|||||||3|1|1|243.00|450.00|||3|
3101|ML|5|373.196.200||JOP|JOP|||||||3|1|1|243.00|450.00|||3|
3102|ML|5|373.196.201||TBL|BCO|B||||||3|1|1|270.00|500.00|||3|
3103|ML|5|373.196.202||TBL|BCO|M||||||3|1|1|270.00|500.00|||3|
3104|ML|5|373.196.203||TBL|CCL|B||||||3|1|1|270.00|500.00|||3|
3105|ML|5|373.196.204||TBL|CCL|M||||||3|1|1|270.00|500.00|||3|
3106|ML|5|373.196.205||TBL|CME|B||||||3|1|1|270.00|500.00|||3|
3107|ML|5|373.196.206||TBL|CME|M||||||3|1|1|270.00|500.00|||3|
3108|ML|5|373.196.207||TBL|ANT|B||||||3|1|1|270.00|500.00|||3|
3109|ML|5|373.196.208||TBL|ANT|M||||||3|1|1|270.00|500.00|||3|
3110|ML|5|373.196.209||TBL|PTO|B||||||3|1|1|270.00|500.00|||3|
3111|ML|5|373.196.210||TBL|PTO|M||||||3|1|1|270.00|500.00|||3|
3112|ML|5|373.196.211||TBL|CRE|B||||||3|1|1|270.00|500.00|||3|
3113|ML|5|373.196.212||TBL|CRE|M||||||3|1|1|270.00|500.00|||3|
3114|ML|5|373.196.213||TBL|CAM|B||||||3|1|1|270.00|500.00|||3|
3115|ML|5|373.196.214||TBL|CAM|M||||||3|1|1|270.00|500.00|||3|
3116|ML|5|373.196.215||TBL|OUR|B||||||3|1|1|270.00|500.00|||3|
3117|ML|5|373.196.216||TBL|OUR|M||||||3|1|1|270.00|500.00|||3|
3118|ML|5|373.196.217||TBL|COB|B||||||3|1|1|270.00|500.00|||3|
3119|ML|5|373.196.218||TBL|COB|M||||||3|1|1|270.00|500.00|||3|
3120|ML|5|373.196.219||TBL|CHO|B||||||3|1|1|270.00|500.00|||3|
3121|ML|5|373.196.220||TBL|CHO|M||||||3|1|1|270.00|500.00|||3|
3122|ML|5|373.196.221||TBL|VAG|B||||||3|1|1|270.00|500.00|||3|
3123|ML|5|373.196.222||TBL|VAG|M||||||3|1|1|270.00|500.00|||3|
3124|ML|5|373.196.223||TBL|AZE|B||||||3|1|1|270.00|500.00|||3|
3125|ML|5|373.196.224||TBL|AZE|M||||||3|1|1|270.00|500.00|||3|
3126|ML|5|373.196.225||TBL|AMA|B||||||3|1|1|270.00|500.00|||3|
3127|ML|5|373.196.226||TBL|AMA|M||||||3|1|1|270.00|500.00|||3|
3128|ML|5|373.196.227||TBL|AES|B||||||3|1|1|270.00|500.00|||3|
3129|ML|5|373.196.228||TBL|AES|M||||||3|1|1|270.00|500.00|||3|
3130|ML|5|373.196.229||TBL|PRA|B||||||3|1|1|270.00|500.00|||3|
3131|ML|5|373.196.230||TBL|PRA|M||||||3|1|1|270.00|500.00|||3|
3132|ML|5|373.196.231||TBL|ROS|B||||||3|1|1|270.00|500.00|||3|
3133|ML|5|373.196.232||TBL|ROS|M||||||3|1|1|270.00|500.00|||3|
3134|ML|5|373.196.233||TBL|VER|B||||||3|1|1|270.00|500.00|||3|
3135|ML|5|373.196.234||TBL|VER|M||||||3|1|1|270.00|500.00|||3|
3136|ML|5|373.196.235||TBL|AZB|||||||3|1|1|270.00|500.00|||3|
3137|ML|5|373.196.236||TBL|DEN|||||||3|1|1|270.00|500.00|||3|
3138|ML|5|373.196.237||TBL|BLK|||||||3|1|1|270.00|500.00|||3|
3139|ML|5|373.196.238||TBL|ART|||||||3|1|1|270.00|500.00|||3|
3140|ML|5|373.196.239||TBL|LIN|||||||3|1|1|270.00|500.00|||3|
3141|ML|5|373.196.240||TBL|HAL|||||||3|1|1|270.00|500.00|||3|
3142|ML|5|373.196.91||BCO|BCO|B||||||3|1|1|291.60|540.00|||3|
3143|ML|5|373.196.93||BCO|BCO|M||||||3|1|1|291.60|540.00|||3|
3144|ML|5|373.196.95||CCL|CCL|B||||||3|1|1|291.60|540.00|||3|
3145|ML|5|373.196.97||CCL|CCL|M||||||3|1|1|291.60|540.00|||3|
3146|ML|5|373.196.99||CME|CME|B||||||3|1|1|291.60|540.00|||3|
3147|ML|5|373.196.101||CME|CME|M||||||3|1|1|291.60|540.00|||3|
3148|ML|5|373.196.103||ANT|ANT|B||||||3|1|1|291.60|540.00|||3|
3149|ML|5|373.196.105||ANT|ANT|M||||||3|1|1|291.60|540.00|||3|
3150|ML|5|373.196.107||PTO|PTO|B||||||3|1|1|291.60|540.00|||3|
3151|ML|5|373.196.109||PTO|PTO|M||||||3|1|1|291.60|540.00|||3|
3152|ML|5|373.196.111||CRE|CRE|B||||||3|1|1|291.60|540.00|||3|
3153|ML|5|373.196.113||CRE|CRE|M||||||3|1|1|291.60|540.00|||3|
3154|ML|5|373.196.115||CAM|CAM|B||||||3|1|1|291.60|540.00|||3|
3155|ML|5|373.196.117||CAM|CAM|M||||||3|1|1|291.60|540.00|||3|
3156|ML|5|373.196.119||OUR|OUR|B||||||3|1|1|291.60|540.00|||3|
3157|ML|5|373.196.121||OUR|OUR|M||||||3|1|1|291.60|540.00|||3|
3158|ML|5|373.196.123||COB|COB|B||||||3|1|1|291.60|540.00|||3|
3159|ML|5|373.196.125||COB|COB|M||||||3|1|1|291.60|540.00|||3|
3160|ML|5|373.196.127||CHO|CHO|B||||||3|1|1|291.60|540.00|||3|
3161|ML|5|373.196.129||CHO|CHO|M||||||3|1|1|291.60|540.00|||3|
3162|ML|5|373.196.131||VAG|VAG|B||||||3|1|1|291.60|540.00|||3|
3163|ML|5|373.196.133||VAG|VAG|M||||||3|1|1|291.60|540.00|||3|
3164|ML|5|373.196.135||AZE|AZE|B||||||3|1|1|291.60|540.00|||3|
3165|ML|5|373.196.137||AZE|AZE|M||||||3|1|1|291.60|540.00|||3|
3166|ML|5|373.196.139||AMA|AMA|B||||||3|1|1|291.60|540.00|||3|
3167|ML|5|373.196.141||AMA|AMA|M||||||3|1|1|291.60|540.00|||3|
3168|ML|5|373.196.143||AES|AES|B||||||3|1|1|291.60|540.00|||3|
3169|ML|5|373.196.145||AES|AES|M||||||3|1|1|291.60|540.00|||3|
3170|ML|5|373.196.147||PRA|PRA|B||||||3|1|1|291.60|540.00|||3|
3171|ML|5|373.196.149||PRA|PRA|M||||||3|1|1|291.60|540.00|||3|
3172|ML|5|373.196.151||ROS|ROS|B||||||3|1|1|291.60|540.00|||3|
3173|ML|5|373.196.153||ROS|ROS|M||||||3|1|1|291.60|540.00|||3|
3174|ML|5|373.196.155||VER|VER|B||||||3|1|1|291.60|540.00|||3|
3175|ML|5|373.196.157||VER|VER|M||||||3|1|1|291.60|540.00|||3|
3176|ML|5|373.196.165||AZB|AZB|||||||3|1|1|291.60|540.00|||3|
3177|ML|5|373.196.167||DEN|DEN|||||||3|1|1|291.60|540.00|||3|
3178|ML|5|373.196.169||BLK|BLK|||||||3|1|1|291.60|540.00|||3|
3179|ML|5|373.196.171||ART|ART|||||||3|1|1|291.60|540.00|||3|
3180|ML|5|373.196.173||LIN|LIN|||||||3|1|1|291.60|540.00|||3|
3181|ML|5|373.196.175||HAL|HAL|||||||3|1|1|291.60|540.00|||3|
3182|ML|6|373.196.241||TBL|TBL|||||||3|1|1|237.60|440.00|||3|
3183|ML|6|373.196.242||TEA|TEA|||||||3|1|1|237.60|440.00|||3|
3184|ML|6|373.196.243||OAK|OAK|||||||3|1|1|237.60|440.00|||3|
3185|ML|6|373.196.244||JOP|JOP|||||||3|1|1|237.60|440.00|||3|
3186|ML|6|373.196.245||TBL|BCO|B||||||3|1|1|264.60|490.00|||3|
3187|ML|6|373.196.246||TBL|BCO|M||||||3|1|1|264.60|490.00|||3|
3188|ML|6|373.196.247||TBL|CCL|B||||||3|1|1|264.60|490.00|||3|
3189|ML|6|373.196.248||TBL|CCL|M||||||3|1|1|264.60|490.00|||3|
3190|ML|6|373.196.249||TBL|CME|B||||||3|1|1|264.60|490.00|||3|
3191|ML|6|373.196.250||TBL|CME|M||||||3|1|1|264.60|490.00|||3|
3192|ML|6|373.196.251||TBL|ANT|B||||||3|1|1|264.60|490.00|||3|
3193|ML|6|373.196.252||TBL|ANT|M||||||3|1|1|264.60|490.00|||3|
3194|ML|6|373.196.253||TBL|PTO|B||||||3|1|1|264.60|490.00|||3|
3195|ML|6|373.196.254||TBL|PTO|M||||||3|1|1|264.60|490.00|||3|
3196|ML|6|373.196.255||TBL|CRE|B||||||3|1|1|264.60|490.00|||3|
3197|ML|6|373.196.256||TBL|CRE|M||||||3|1|1|264.60|490.00|||3|
3198|ML|6|373.196.257||TBL|CAM|B||||||3|1|1|264.60|490.00|||3|
3199|ML|6|373.196.258||TBL|CAM|M||||||3|1|1|264.60|490.00|||3|
3200|ML|6|373.196.259||TBL|OUR|B||||||3|1|1|264.60|490.00|||3|
3201|ML|6|373.196.260||TBL|OUR|M||||||3|1|1|264.60|490.00|||3|
3202|ML|6|373.196.261||TBL|COB|B||||||3|1|1|264.60|490.00|||3|
3203|ML|6|373.196.262||TBL|COB|M||||||3|1|1|264.60|490.00|||3|
3204|ML|6|373.196.263||TBL|CHO|B||||||3|1|1|264.60|490.00|||3|
3205|ML|6|373.196.264||TBL|CHO|M||||||3|1|1|264.60|490.00|||3|
3206|ML|6|373.196.265||TBL|VAG|B||||||3|1|1|264.60|490.00|||3|
3207|ML|6|373.196.266||TBL|VAG|M||||||3|1|1|264.60|490.00|||3|
3208|ML|6|373.196.267||TBL|AZE|B||||||3|1|1|264.60|490.00|||3|
3209|ML|6|373.196.268||TBL|AZE|M||||||3|1|1|264.60|490.00|||3|
3210|ML|6|373.196.269||TBL|AMA|B||||||3|1|1|264.60|490.00|||3|
3211|ML|6|373.196.270||TBL|AMA|M||||||3|1|1|264.60|490.00|||3|
3212|ML|6|373.196.271||TBL|AES|B||||||3|1|1|264.60|490.00|||3|
3213|ML|6|373.196.272||TBL|AES|M||||||3|1|1|264.60|490.00|||3|
3214|ML|6|373.196.273||TBL|PRA|B||||||3|1|1|264.60|490.00|||3|
3215|ML|6|373.196.274||TBL|PRA|M||||||3|1|1|264.60|490.00|||3|
3216|ML|6|373.196.275||TBL|ROS|B||||||3|1|1|264.60|490.00|||3|
3217|ML|6|373.196.276||TBL|ROS|M||||||3|1|1|264.60|490.00|||3|
3218|ML|6|373.196.277||TBL|VER|B||||||3|1|1|264.60|490.00|||3|
3219|ML|6|373.196.278||TBL|VER|M||||||3|1|1|264.60|490.00|||3|
3220|ML|6|373.196.279||TBL|AZB|||||||3|1|1|264.60|490.00|||3|
3221|ML|6|373.196.280||TBL|DEN|||||||3|1|1|264.60|490.00|||3|
3222|ML|6|373.196.281||TBL|BLK|||||||3|1|1|264.60|490.00|||3|
3223|ML|6|373.196.282||TBL|ART|||||||3|1|1|264.60|490.00|||3|
3224|ML|6|373.196.283||TBL|LIN|||||||3|1|1|264.60|490.00|||3|
3225|ML|6|373.196.284||TBL|HAL|||||||3|1|1|264.60|490.00|||3|
3226|ML|6|373.196.285||BCO|BCO|B||||||3|1|1|286.20|530.00|||3|
3227|ML|6|373.196.286||BCO|BCO|M||||||3|1|1|286.20|530.00|||3|
3228|ML|6|373.196.287||CCL|CCL|B||||||3|1|1|286.20|530.00|||3|
3229|ML|6|373.196.288||CCL|CCL|M||||||3|1|1|286.20|530.00|||3|
3230|ML|6|373.196.289||CME|CME|B||||||3|1|1|286.20|530.00|||3|
3231|ML|6|373.196.290||CME|CME|M||||||3|1|1|286.20|530.00|||3|
3232|ML|6|373.196.291||ANT|ANT|B||||||3|1|1|286.20|530.00|||3|
3233|ML|6|373.196.292||ANT|ANT|M||||||3|1|1|286.20|530.00|||3|
3234|ML|6|373.196.293||PTO|PTO|B||||||3|1|1|286.20|530.00|||3|
3235|ML|6|373.196.294||PTO|PTO|M||||||3|1|1|286.20|530.00|||3|
3236|ML|6|373.196.295||CRE|CRE|B||||||3|1|1|286.20|530.00|||3|
3237|ML|6|373.196.296||CRE|CRE|M||||||3|1|1|286.20|530.00|||3|
3238|ML|6|373.196.297||CAM|CAM|B||||||3|1|1|286.20|530.00|||3|
3239|ML|6|373.196.298||CAM|CAM|M||||||3|1|1|286.20|530.00|||3|
3240|ML|6|373.196.299||OUR|OUR|B||||||3|1|1|286.20|530.00|||3|
3241|ML|6|373.196.300||OUR|OUR|M||||||3|1|1|286.20|530.00|||3|
3242|ML|6|373.196.301||COB|COB|B||||||3|1|1|286.20|530.00|||3|
3243|ML|6|373.196.302||COB|COB|M||||||3|1|1|286.20|530.00|||3|
3244|ML|6|373.196.303||CHO|CHO|B||||||3|1|1|286.20|530.00|||3|
3245|ML|6|373.196.304||CHO|CHO|M||||||3|1|1|286.20|530.00|||3|
3246|ML|6|373.196.305||VAG|VAG|B||||||3|1|1|286.20|530.00|||3|
3247|ML|6|373.196.306||VAG|VAG|M||||||3|1|1|286.20|530.00|||3|
3248|ML|6|373.196.307||AZE|AZE|B||||||3|1|1|286.20|530.00|||3|
3249|ML|6|373.196.308||AZE|AZE|M||||||3|1|1|286.20|530.00|||3|
3250|ML|6|373.196.309||AMA|AMA|B||||||3|1|1|286.20|530.00|||3|
3251|ML|6|373.196.310||AMA|AMA|M||||||3|1|1|286.20|530.00|||3|
3252|ML|6|373.196.311||AES|AES|B||||||3|1|1|286.20|530.00|||3|
3253|ML|6|373.196.312||AES|AES|M||||||3|1|1|286.20|530.00|||3|
3254|ML|6|373.196.313||PRA|PRA|B||||||3|1|1|286.20|530.00|||3|
3255|ML|6|373.196.314||PRA|PRA|M||||||3|1|1|286.20|530.00|||3|
3256|ML|6|373.196.315||ROS|ROS|B||||||3|1|1|286.20|530.00|||3|
3257|ML|6|373.196.316||ROS|ROS|M||||||3|1|1|286.20|530.00|||3|
3258|ML|6|373.196.317||VER|VER|B||||||3|1|1|286.20|530.00|||3|
3259|ML|6|373.196.318||VER|VER|M||||||3|1|1|286.20|530.00|||3|
3260|ML|6|373.196.319||AZB|AZB|||||||3|1|1|286.20|530.00|||3|
3261|ML|6|373.196.320||DEN|DEN|||||||3|1|1|286.20|530.00|||3|
3262|ML|6|373.196.321||BLK|BLK|||||||3|1|1|286.20|530.00|||3|
3263|ML|6|373.196.322||ART|ART|||||||3|1|1|286.20|530.00|||3|
3264|ML|6|373.196.323||LIN|LIN|||||||3|1|1|286.20|530.00|||3|
3265|ML|6|373.196.324||HAL|HAL|||||||3|1|1|286.20|530.00|||3|
3266|ML|7|373.196.327||TBL|TBL|||||||3|1|1|402.30|745.00|||3|
3267|ML|7|373.196.328||TEA|TEA|||||||3|1|1|402.30|745.00|||3|
3268|ML|7|373.196.329||OAK|OAK|||||||3|1|1|402.30|745.00|||3|
3269|ML|7|373.196.330||JOP|JOP|||||||3|1|1|402.30|745.00|||3|
3270|ML|7|373.196.331||TBL|BCO|B||||||3|1|1|429.30|795.00|||3|
3271|ML|7|373.196.332||TBL|BCO|M||||||3|1|1|429.30|795.00|||3|
3272|ML|7|373.196.333||TBL|CCL|B||||||3|1|1|429.30|795.00|||3|
3273|ML|7|373.196.334||TBL|CCL|M||||||3|1|1|429.30|795.00|||3|
3274|ML|7|373.196.335||TBL|CME|B||||||3|1|1|429.30|795.00|||3|
3275|ML|7|373.196.336||TBL|CME|M||||||3|1|1|429.30|795.00|||3|
3276|ML|7|373.196.337||TBL|ANT|B||||||3|1|1|429.30|795.00|||3|
3277|ML|7|373.196.338||TBL|ANT|M||||||3|1|1|429.30|795.00|||3|
3278|ML|7|373.196.339||TBL|PTO|B||||||3|1|1|429.30|795.00|||3|
3279|ML|7|373.196.340||TBL|PTO|M||||||3|1|1|429.30|795.00|||3|
3280|ML|7|373.196.341||TBL|CRE|B||||||3|1|1|429.30|795.00|||3|
3281|ML|7|373.196.342||TBL|CRE|M||||||3|1|1|429.30|795.00|||3|
3282|ML|7|373.196.343||TBL|CAM|B||||||3|1|1|429.30|795.00|||3|
3283|ML|7|373.196.344||TBL|CAM|M||||||3|1|1|429.30|795.00|||3|
3284|ML|7|373.196.345||TBL|OUR|B||||||3|1|1|429.30|795.00|||3|
3285|ML|7|373.196.346||TBL|OUR|M||||||3|1|1|429.30|795.00|||3|
3286|ML|7|373.196.347||TBL|COB|B||||||3|1|1|429.30|795.00|||3|
3287|ML|7|373.196.348||TBL|COB|M||||||3|1|1|429.30|795.00|||3|
3288|ML|7|373.196.349||TBL|CHO|B||||||3|1|1|429.30|795.00|||3|
3289|ML|7|373.196.350||TBL|CHO|M||||||3|1|1|429.30|795.00|||3|
3290|ML|7|373.196.351||TBL|VAG|B||||||3|1|1|429.30|795.00|||3|
3291|ML|7|373.196.352||TBL|VAG|M||||||3|1|1|429.30|795.00|||3|
3292|ML|7|373.196.353||TBL|AZE|B||||||3|1|1|429.30|795.00|||3|
3293|ML|7|373.196.354||TBL|AZE|M||||||3|1|1|429.30|795.00|||3|
3294|ML|7|373.196.355||TBL|AMA|B||||||3|1|1|429.30|795.00|||3|
3295|ML|7|373.196.356||TBL|AMA|M||||||3|1|1|429.30|795.00|||3|
3296|ML|7|373.196.357||TBL|AES|B||||||3|1|1|429.30|795.00|||3|
3297|ML|7|373.196.358||TBL|AES|M||||||3|1|1|429.30|795.00|||3|
3298|ML|7|373.196.359||TBL|PRA|B||||||3|1|1|429.30|795.00|||3|
3299|ML|7|373.196.360||TBL|PRA|M||||||3|1|1|429.30|795.00|||3|
3300|ML|7|373.196.361||TBL|ROS|B||||||3|1|1|429.30|795.00|||3|
3301|ML|7|373.196.362||TBL|ROS|M||||||3|1|1|429.30|795.00|||3|
3302|ML|7|373.196.363||TBL|VER|B||||||3|1|1|429.30|795.00|||3|
3303|ML|7|373.196.364||TBL|VER|M||||||3|1|1|429.30|795.00|||3|
3304|ML|7|373.196.365||TBL|AZB|||||||3|1|1|429.30|795.00|||3|
3305|ML|7|373.196.366||TBL|DEN|||||||3|1|1|429.30|795.00|||3|
3306|ML|7|373.196.367||TBL|BLK|||||||3|1|1|429.30|795.00|||3|
3307|ML|7|373.196.368||TBL|ART|||||||3|1|1|429.30|795.00|||3|
3308|ML|7|373.196.369||TBL|LIN|||||||3|1|1|429.30|795.00|||3|
3309|ML|7|373.196.370||TBL|HAL|||||||3|1|1|429.30|795.00|||3|
3310|ML|7|373.196.92||BCO|BCO|B||||||3|1|1|450.90|835.00|||3|
3311|ML|7|373.196.94||BCO|BCO|M||||||3|1|1|450.90|835.00|||3|
3312|ML|7|373.196.96||CCL|CCL|B||||||3|1|1|450.90|835.00|||3|
3313|ML|7|373.196.98||CCL|CCL|M||||||3|1|1|450.90|835.00|||3|
3314|ML|7|373.196.100||CME|CME|B||||||3|1|1|450.90|835.00|||3|
3315|ML|7|373.196.102||CME|CME|M||||||3|1|1|450.90|835.00|||3|
3316|ML|7|373.196.104||ANT|ANT|B||||||3|1|1|450.90|835.00|||3|
3317|ML|7|373.196.106||ANT|ANT|M||||||3|1|1|450.90|835.00|||3|
3318|ML|7|373.196.108||PTO|PTO|B||||||3|1|1|450.90|835.00|||3|
3319|ML|7|373.196.110||PTO|PTO|M||||||3|1|1|450.90|835.00|||3|
3320|ML|7|373.196.112||CRE|CRE|B||||||3|1|1|450.90|835.00|||3|
3321|ML|7|373.196.114||CRE|CRE|M||||||3|1|1|450.90|835.00|||3|
3322|ML|7|373.196.116||CAM|CAM|B||||||3|1|1|450.90|835.00|||3|
3323|ML|7|373.196.118||CAM|CAM|M||||||3|1|1|450.90|835.00|||3|
3324|ML|7|373.196.120||OUR|OUR|B||||||3|1|1|450.90|835.00|||3|
3325|ML|7|373.196.122||OUR|OUR|M||||||3|1|1|450.90|835.00|||3|
3326|ML|7|373.196.124||COB|COB|B||||||3|1|1|450.90|835.00|||3|
3327|ML|7|373.196.126||COB|COB|M||||||3|1|1|450.90|835.00|||3|
3328|ML|7|373.196.128||CHO|CHO|B||||||3|1|1|450.90|835.00|||3|
3329|ML|7|373.196.130||CHO|CHO|M||||||3|1|1|450.90|835.00|||3|
3330|ML|7|373.196.132||VAG|VAG|B||||||3|1|1|450.90|835.00|||3|
3331|ML|7|373.196.134||VAG|VAG|M||||||3|1|1|450.90|835.00|||3|
3332|ML|7|373.196.136||AZE|AZE|B||||||3|1|1|450.90|835.00|||3|
3333|ML|7|373.196.138||AZE|AZE|M||||||3|1|1|450.90|835.00|||3|
3334|ML|7|373.196.140||AMA|AMA|B||||||3|1|1|450.90|835.00|||3|
3335|ML|7|373.196.142||AMA|AMA|M||||||3|1|1|450.90|835.00|||3|
3336|ML|7|373.196.144||AES|AES|B||||||3|1|1|450.90|835.00|||3|
3337|ML|7|373.196.146||AES|AES|M||||||3|1|1|450.90|835.00|||3|
3338|ML|7|373.196.148||PRA|PRA|B||||||3|1|1|450.90|835.00|||3|
3339|ML|7|373.196.150||PRA|PRA|M||||||3|1|1|450.90|835.00|||3|
3340|ML|7|373.196.152||ROS|ROS|B||||||3|1|1|450.90|835.00|||3|
3341|ML|7|373.196.154||ROS|ROS|M||||||3|1|1|450.90|835.00|||3|
3342|ML|7|373.196.156||VER|VER|B||||||3|1|1|450.90|835.00|||3|
3343|ML|7|373.196.158||VER|VER|M||||||3|1|1|450.90|835.00|||3|
3344|ML|7|373.196.166||AZB|AZB|||||||3|1|1|450.90|835.00|||3|
3345|ML|7|373.196.168||DEN|DEN|||||||3|1|1|450.90|835.00|||3|
3346|ML|7|373.196.170||BLK|BLK|||||||3|1|1|450.90|835.00|||3|
3347|ML|7|373.196.172||ART|ART|||||||3|1|1|450.90|835.00|||3|
3348|ML|7|373.196.174||LIN|LIN|||||||3|1|1|450.90|835.00|||3|
3349|ML|7|373.196.176||HAL|HAL|||||||3|1|1|450.90|835.00|||3|
3350|ML|8|373.374.197||TBL|TBL|||||||3|1|1|264.60|490.00|||3|
3351|ML|8|373.374.198||TEA|TEA|||||||3|1|1|264.60|490.00|||3|
3352|ML|8|373.374.199||OAK|OAK|||||||3|1|1|264.60|490.00|||3|
3353|ML|8|373.374.200||JOP|JOP|||||||3|1|1|264.60|490.00|||3|
3354|ML|8|373.374.201||TBL|BCO|B||||||3|1|1|291.60|540.00|||3|
3355|ML|8|373.374.202||TBL|BCO|M||||||3|1|1|291.60|540.00|||3|
3356|ML|8|373.374.203||TBL|CCL|B||||||3|1|1|291.60|540.00|||3|
3357|ML|8|373.374.204||TBL|CCL|M||||||3|1|1|291.60|540.00|||3|
3358|ML|8|373.374.205||TBL|CME|B||||||3|1|1|291.60|540.00|||3|
3359|ML|8|373.374.206||TBL|CME|M||||||3|1|1|291.60|540.00|||3|
3360|ML|8|373.374.207||TBL|ANT|B||||||3|1|1|291.60|540.00|||3|
3361|ML|8|373.374.208||TBL|ANT|M||||||3|1|1|291.60|540.00|||3|
3362|ML|8|373.374.209||TBL|PTO|B||||||3|1|1|291.60|540.00|||3|
3363|ML|8|373.374.210||TBL|PTO|M||||||3|1|1|291.60|540.00|||3|
3364|ML|8|373.374.211||TBL|CRE|B||||||3|1|1|291.60|540.00|||3|
3365|ML|8|373.374.212||TBL|CRE|M||||||3|1|1|291.60|540.00|||3|
3366|ML|8|373.374.213||TBL|CAM|B||||||3|1|1|291.60|540.00|||3|
3367|ML|8|373.374.214||TBL|CAM|M||||||3|1|1|291.60|540.00|||3|
3368|ML|8|373.374.215||TBL|OUR|B||||||3|1|1|291.60|540.00|||3|
3369|ML|8|373.374.216||TBL|OUR|M||||||3|1|1|291.60|540.00|||3|
3370|ML|8|373.374.217||TBL|COB|B||||||3|1|1|291.60|540.00|||3|
3371|ML|8|373.374.218||TBL|COB|M||||||3|1|1|291.60|540.00|||3|
3372|ML|8|373.374.219||TBL|CHO|B||||||3|1|1|291.60|540.00|||3|
3373|ML|8|373.374.220||TBL|CHO|M||||||3|1|1|291.60|540.00|||3|
3374|ML|8|373.374.221||TBL|VAG|B||||||3|1|1|291.60|540.00|||3|
3375|ML|8|373.374.222||TBL|VAG|M||||||3|1|1|291.60|540.00|||3|
3376|ML|8|373.374.223||TBL|AZE|B||||||3|1|1|291.60|540.00|||3|
3377|ML|8|373.374.224||TBL|AZE|M||||||3|1|1|291.60|540.00|||3|
3378|ML|8|373.374.225||TBL|AMA|B||||||3|1|1|291.60|540.00|||3|
3379|ML|8|373.374.226||TBL|AMA|M||||||3|1|1|291.60|540.00|||3|
3380|ML|8|373.374.227||TBL|AES|B||||||3|1|1|291.60|540.00|||3|
3381|ML|8|373.374.228||TBL|AES|M||||||3|1|1|291.60|540.00|||3|
3382|ML|8|373.374.229||TBL|PRA|B||||||3|1|1|291.60|540.00|||3|
3383|ML|8|373.374.230||TBL|PRA|M||||||3|1|1|291.60|540.00|||3|
3384|ML|8|373.374.231||TBL|ROS|B||||||3|1|1|291.60|540.00|||3|
3385|ML|8|373.374.232||TBL|ROS|M||||||3|1|1|291.60|540.00|||3|
3386|ML|8|373.374.233||TBL|VER|B||||||3|1|1|291.60|540.00|||3|
3387|ML|8|373.374.234||TBL|VER|M||||||3|1|1|291.60|540.00|||3|
3388|ML|8|373.374.235||TBL|AZB|||||||3|1|1|291.60|540.00|||3|
3389|ML|8|373.374.236||TBL|DEN|||||||3|1|1|291.60|540.00|||3|
3390|ML|8|373.374.237||TBL|BLK|||||||3|1|1|291.60|540.00|||3|
3391|ML|8|373.374.238||TBL|ART|||||||3|1|1|291.60|540.00|||3|
3392|ML|8|373.374.239||TBL|LIN|||||||3|1|1|291.60|540.00|||3|
3393|ML|8|373.374.240||TBL|HAL|||||||3|1|1|291.60|540.00|||3|
3394|ML|8|373.374.91||BCO|BCO|B||||||3|1|1|313.20|580.00|||3|
3395|ML|8|373.374.93||BCO|BCO|M||||||3|1|1|313.20|580.00|||3|
3396|ML|8|373.374.95||CCL|CCL|B||||||3|1|1|313.20|580.00|||3|
3397|ML|8|373.374.97||CCL|CCL|M||||||3|1|1|313.20|580.00|||3|
3398|ML|8|373.374.99||CME|CME|B||||||3|1|1|313.20|580.00|||3|
3399|ML|8|373.374.101||CME|CME|M||||||3|1|1|313.20|580.00|||3|
3400|ML|8|373.374.103||ANT|ANT|B||||||3|1|1|313.20|580.00|||3|
3401|ML|8|373.374.105||ANT|ANT|M||||||3|1|1|313.20|580.00|||3|
3402|ML|8|373.374.107||PTO|PTO|B||||||3|1|1|313.20|580.00|||3|
3403|ML|8|373.374.109||PTO|PTO|M||||||3|1|1|313.20|580.00|||3|
3404|ML|8|373.374.111||CRE|CRE|B||||||3|1|1|313.20|580.00|||3|
3405|ML|8|373.374.113||CRE|CRE|M||||||3|1|1|313.20|580.00|||3|
3406|ML|8|373.374.115||CAM|CAM|B||||||3|1|1|313.20|580.00|||3|
3407|ML|8|373.374.117||CAM|CAM|M||||||3|1|1|313.20|580.00|||3|
3408|ML|8|373.374.119||OUR|OUR|B||||||3|1|1|313.20|580.00|||3|
3409|ML|8|373.374.121||OUR|OUR|M||||||3|1|1|313.20|580.00|||3|
3410|ML|8|373.374.123||COB|COB|B||||||3|1|1|313.20|580.00|||3|
3411|ML|8|373.374.125||COB|COB|M||||||3|1|1|313.20|580.00|||3|
3412|ML|8|373.374.127||CHO|CHO|B||||||3|1|1|313.20|580.00|||3|
3413|ML|8|373.374.129||CHO|CHO|M||||||3|1|1|313.20|580.00|||3|
3414|ML|8|373.374.131||VAG|VAG|B||||||3|1|1|313.20|580.00|||3|
3415|ML|8|373.374.133||VAG|VAG|M||||||3|1|1|313.20|580.00|||3|
3416|ML|8|373.374.135||AZE|AZE|B||||||3|1|1|313.20|580.00|||3|
3417|ML|8|373.374.137||AZE|AZE|M||||||3|1|1|313.20|580.00|||3|
3418|ML|8|373.374.139||AMA|AMA|B||||||3|1|1|313.20|580.00|||3|
3419|ML|8|373.374.141||AMA|AMA|M||||||3|1|1|313.20|580.00|||3|
3420|ML|8|373.374.143||AES|AES|B||||||3|1|1|313.20|580.00|||3|
3421|ML|8|373.374.145||AES|AES|M||||||3|1|1|313.20|580.00|||3|
3422|ML|8|373.374.147||PRA|PRA|B||||||3|1|1|313.20|580.00|||3|
3423|ML|8|373.374.149||PRA|PRA|M||||||3|1|1|313.20|580.00|||3|
3424|ML|8|373.374.151||ROS|ROS|B||||||3|1|1|313.20|580.00|||3|
3425|ML|8|373.374.153||ROS|ROS|M||||||3|1|1|313.20|580.00|||3|
3426|ML|8|373.374.155||VER|VER|B||||||3|1|1|313.20|580.00|||3|
3427|ML|8|373.374.157||VER|VER|M||||||3|1|1|313.20|580.00|||3|
3428|ML|8|373.374.165||AZB|AZB|||||||3|1|1|313.20|580.00|||3|
3429|ML|8|373.374.167||DEN|DEN|||||||3|1|1|313.20|580.00|||3|
3430|ML|8|373.374.169||BLK|BLK|||||||3|1|1|313.20|580.00|||3|
3431|ML|8|373.374.171||ART|ART|||||||3|1|1|313.20|580.00|||3|
3432|ML|8|373.374.173||LIN|LIN|||||||3|1|1|313.20|580.00|||3|
3433|ML|8|373.374.175||HAL|HAL|||||||3|1|1|313.20|580.00|||3|
3434|ML|9|373.374.241||TBL|TBL|||||||3|1|1|259.20|480.00|||3|
3435|ML|9|373.374.242||TEA|TEA|||||||3|1|1|259.20|480.00|||3|
3436|ML|9|373.374.243||OAK|OAK|||||||3|1|1|259.20|480.00|||3|
3437|ML|9|373.374.244||JOP|JOP|||||||3|1|1|259.20|480.00|||3|
3438|ML|9|373.374.245||TBL|BCO|B||||||3|1|1|286.20|530.00|||3|
3439|ML|9|373.374.246||TBL|BCO|M||||||3|1|1|286.20|530.00|||3|
3440|ML|9|373.374.247||TBL|CCL|B||||||3|1|1|286.20|530.00|||3|
3441|ML|9|373.374.248||TBL|CCL|M||||||3|1|1|286.20|530.00|||3|
3442|ML|9|373.374.249||TBL|CME|B||||||3|1|1|286.20|530.00|||3|
3443|ML|9|373.374.250||TBL|CME|M||||||3|1|1|286.20|530.00|||3|
3444|ML|9|373.374.251||TBL|ANT|B||||||3|1|1|286.20|530.00|||3|
3445|ML|9|373.374.252||TBL|ANT|M||||||3|1|1|286.20|530.00|||3|
3446|ML|9|373.374.253||TBL|PTO|B||||||3|1|1|286.20|530.00|||3|
3447|ML|9|373.374.254||TBL|PTO|M||||||3|1|1|286.20|530.00|||3|
3448|ML|9|373.374.255||TBL|CRE|B||||||3|1|1|286.20|530.00|||3|
3449|ML|9|373.374.256||TBL|CRE|M||||||3|1|1|286.20|530.00|||3|
3450|ML|9|373.374.257||TBL|CAM|B||||||3|1|1|286.20|530.00|||3|
3451|ML|9|373.374.258||TBL|CAM|M||||||3|1|1|286.20|530.00|||3|
3452|ML|9|373.374.259||TBL|OUR|B||||||3|1|1|286.20|530.00|||3|
3453|ML|9|373.374.260||TBL|OUR|M||||||3|1|1|286.20|530.00|||3|
3454|ML|9|373.374.261||TBL|COB|B||||||3|1|1|286.20|530.00|||3|
3455|ML|9|373.374.262||TBL|COB|M||||||3|1|1|286.20|530.00|||3|
3456|ML|9|373.374.263||TBL|CHO|B||||||3|1|1|286.20|530.00|||3|
3457|ML|9|373.374.264||TBL|CHO|M||||||3|1|1|286.20|530.00|||3|
3458|ML|9|373.374.265||TBL|VAG|B||||||3|1|1|286.20|530.00|||3|
3459|ML|9|373.374.266||TBL|VAG|M||||||3|1|1|286.20|530.00|||3|
3460|ML|9|373.374.267||TBL|AZE|B||||||3|1|1|286.20|530.00|||3|
3461|ML|9|373.374.268||TBL|AZE|M||||||3|1|1|286.20|530.00|||3|
3462|ML|9|373.374.269||TBL|AMA|B||||||3|1|1|286.20|530.00|||3|
3463|ML|9|373.374.270||TBL|AMA|M||||||3|1|1|286.20|530.00|||3|
3464|ML|9|373.374.271||TBL|AES|B||||||3|1|1|286.20|530.00|||3|
3465|ML|9|373.374.272||TBL|AES|M||||||3|1|1|286.20|530.00|||3|
3466|ML|9|373.374.273||TBL|PRA|B||||||3|1|1|286.20|530.00|||3|
3467|ML|9|373.374.274||TBL|PRA|M||||||3|1|1|286.20|530.00|||3|
3468|ML|9|373.374.275||TBL|ROS|B||||||3|1|1|286.20|530.00|||3|
3469|ML|9|373.374.276||TBL|ROS|M||||||3|1|1|286.20|530.00|||3|
3470|ML|9|373.374.277||TBL|VER|B||||||3|1|1|286.20|530.00|||3|
3471|ML|9|373.374.278||TBL|VER|M||||||3|1|1|286.20|530.00|||3|
3472|ML|9|373.374.279||TBL|AZB|||||||3|1|1|286.20|530.00|||3|
3473|ML|9|373.374.280||TBL|DEN|||||||3|1|1|286.20|530.00|||3|
3474|ML|9|373.374.281||TBL|BLK|||||||3|1|1|286.20|530.00|||3|
3475|ML|9|373.374.282||TBL|ART|||||||3|1|1|286.20|530.00|||3|
3476|ML|9|373.374.283||TBL|LIN|||||||3|1|1|286.20|530.00|||3|
3477|ML|9|373.374.284||TBL|HAL|||||||3|1|1|286.20|530.00|||3|
3478|ML|9|373.374.285||BCO|BCO|B||||||3|1|1|307.80|570.00|||3|
3479|ML|9|373.374.286||BCO|BCO|M||||||3|1|1|307.80|570.00|||3|
3480|ML|9|373.374.287||CCL|CCL|B||||||3|1|1|307.80|570.00|||3|
3481|ML|9|373.374.288||CCL|CCL|M||||||3|1|1|307.80|570.00|||3|
3482|ML|9|373.374.289||CME|CME|B||||||3|1|1|307.80|570.00|||3|
3483|ML|9|373.374.290||CME|CME|M||||||3|1|1|307.80|570.00|||3|
3484|ML|9|373.374.291||ANT|ANT|B||||||3|1|1|307.80|570.00|||3|
3485|ML|9|373.374.292||ANT|ANT|M||||||3|1|1|307.80|570.00|||3|
3486|ML|9|373.374.293||PTO|PTO|B||||||3|1|1|307.80|570.00|||3|
3487|ML|9|373.374.294||PTO|PTO|M||||||3|1|1|307.80|570.00|||3|
3488|ML|9|373.374.295||CRE|CRE|B||||||3|1|1|307.80|570.00|||3|
3489|ML|9|373.374.296||CRE|CRE|M||||||3|1|1|307.80|570.00|||3|
3490|ML|9|373.374.297||CAM|CAM|B||||||3|1|1|307.80|570.00|||3|
3491|ML|9|373.374.298||CAM|CAM|M||||||3|1|1|307.80|570.00|||3|
3492|ML|9|373.374.299||OUR|OUR|B||||||3|1|1|307.80|570.00|||3|
3493|ML|9|373.374.300||OUR|OUR|M||||||3|1|1|307.80|570.00|||3|
3494|ML|9|373.374.301||COB|COB|B||||||3|1|1|307.80|570.00|||3|
3495|ML|9|373.374.302||COB|COB|M||||||3|1|1|307.80|570.00|||3|
3496|ML|9|373.374.303||CHO|CHO|B||||||3|1|1|307.80|570.00|||3|
3497|ML|9|373.374.304||CHO|CHO|M||||||3|1|1|307.80|570.00|||3|
3498|ML|9|373.374.305||VAG|VAG|B||||||3|1|1|307.80|570.00|||3|
3499|ML|9|373.374.306||VAG|VAG|M||||||3|1|1|307.80|570.00|||3|
3500|ML|9|373.374.307||AZE|AZE|B||||||3|1|1|307.80|570.00|||3|
3501|ML|9|373.374.308||AZE|AZE|M||||||3|1|1|307.80|570.00|||3|
3502|ML|9|373.374.309||AMA|AMA|B||||||3|1|1|307.80|570.00|||3|
3503|ML|9|373.374.310||AMA|AMA|M||||||3|1|1|307.80|570.00|||3|
3504|ML|9|373.374.311||AES|AES|B||||||3|1|1|307.80|570.00|||3|
3505|ML|9|373.374.312||AES|AES|M||||||3|1|1|307.80|570.00|||3|
3506|ML|9|373.374.313||PRA|PRA|B||||||3|1|1|307.80|570.00|||3|
3507|ML|9|373.374.314||PRA|PRA|M||||||3|1|1|307.80|570.00|||3|
3508|ML|9|373.374.315||ROS|ROS|B||||||3|1|1|307.80|570.00|||3|
3509|ML|9|373.374.316||ROS|ROS|M||||||3|1|1|307.80|570.00|||3|
3510|ML|9|373.374.317||VER|VER|B||||||3|1|1|307.80|570.00|||3|
3511|ML|9|373.374.318||VER|VER|M||||||3|1|1|307.80|570.00|||3|
3512|ML|9|373.374.319||AZB|AZB|||||||3|1|1|307.80|570.00|||3|
3513|ML|9|373.374.320||DEN|DEN|||||||3|1|1|307.80|570.00|||3|
3514|ML|9|373.374.321||BLK|BLK|||||||3|1|1|307.80|570.00|||3|
3515|ML|9|373.374.322||ART|ART|||||||3|1|1|307.80|570.00|||3|
3516|ML|9|373.374.323||LIN|LIN|||||||3|1|1|307.80|570.00|||3|
3517|ML|9|373.374.324||HAL|HAL|||||||3|1|1|307.80|570.00|||3|
3518|ML|10|373.374.327||TBL|TBL|||||||3|1|1|507.60|940.00|||3|
3519|ML|10|373.374.328||TEA|TEA|||||||3|1|1|507.60|940.00|||3|
3520|ML|10|373.374.329||OAK|OAK|||||||3|1|1|507.60|940.00|||3|
3521|ML|10|373.374.330||JOP|JOP|||||||3|1|1|507.60|940.00|||3|
3522|ML|10|373.374.331||TBL|BCO|B||||||3|1|1|534.60|990.00|||3|
3523|ML|10|373.374.332||TBL|BCO|M||||||3|1|1|534.60|990.00|||3|
3524|ML|10|373.374.333||TBL|CCL|B||||||3|1|1|534.60|990.00|||3|
3525|ML|10|373.374.334||TBL|CCL|M||||||3|1|1|534.60|990.00|||3|
3526|ML|10|373.374.335||TBL|CME|B||||||3|1|1|534.60|990.00|||3|
3527|ML|10|373.374.336||TBL|CME|M||||||3|1|1|534.60|990.00|||3|
3528|ML|10|373.374.337||TBL|ANT|B||||||3|1|1|534.60|990.00|||3|
3529|ML|10|373.374.338||TBL|ANT|M||||||3|1|1|534.60|990.00|||3|
3530|ML|10|373.374.339||TBL|PTO|B||||||3|1|1|534.60|990.00|||3|
3531|ML|10|373.374.340||TBL|PTO|M||||||3|1|1|534.60|990.00|||3|
3532|ML|10|373.374.341||TBL|CRE|B||||||3|1|1|534.60|990.00|||3|
3533|ML|10|373.374.342||TBL|CRE|M||||||3|1|1|534.60|990.00|||3|
3534|ML|10|373.374.343||TBL|CAM|B||||||3|1|1|534.60|990.00|||3|
3535|ML|10|373.374.344||TBL|CAM|M||||||3|1|1|534.60|990.00|||3|
3536|ML|10|373.374.345||TBL|OUR|B||||||3|1|1|534.60|990.00|||3|
3537|ML|10|373.374.346||TBL|OUR|M||||||3|1|1|534.60|990.00|||3|
3538|ML|10|373.374.347||TBL|COB|B||||||3|1|1|534.60|990.00|||3|
3539|ML|10|373.374.348||TBL|COB|M||||||3|1|1|534.60|990.00|||3|
3540|ML|10|373.374.349||TBL|CHO|B||||||3|1|1|534.60|990.00|||3|
3541|ML|10|373.374.350||TBL|CHO|M||||||3|1|1|534.60|990.00|||3|
3542|ML|10|373.374.351||TBL|VAG|B||||||3|1|1|534.60|990.00|||3|
3543|ML|10|373.374.352||TBL|VAG|M||||||3|1|1|534.60|990.00|||3|
3544|ML|10|373.374.353||TBL|AZE|B||||||3|1|1|534.60|990.00|||3|
3545|ML|10|373.374.354||TBL|AZE|M||||||3|1|1|534.60|990.00|||3|
3546|ML|10|373.374.355||TBL|AMA|B||||||3|1|1|534.60|990.00|||3|
3547|ML|10|373.374.356||TBL|AMA|M||||||3|1|1|534.60|990.00|||3|
3548|ML|10|373.374.357||TBL|AES|B||||||3|1|1|534.60|990.00|||3|
3549|ML|10|373.374.358||TBL|AES|M||||||3|1|1|534.60|990.00|||3|
3550|ML|10|373.374.359||TBL|PRA|B||||||3|1|1|534.60|990.00|||3|
3551|ML|10|373.374.360||TBL|PRA|M||||||3|1|1|534.60|990.00|||3|
3552|ML|10|373.374.361||TBL|ROS|B||||||3|1|1|534.60|990.00|||3|
3553|ML|10|373.374.362||TBL|ROS|M||||||3|1|1|534.60|990.00|||3|
3554|ML|10|373.374.363||TBL|VER|B||||||3|1|1|534.60|990.00|||3|
3555|ML|10|373.374.364||TBL|VER|M||||||3|1|1|534.60|990.00|||3|
3556|ML|10|373.374.365||TBL|AZB|||||||3|1|1|534.60|990.00|||3|
3557|ML|10|373.374.366||TBL|DEN|||||||3|1|1|534.60|990.00|||3|
3558|ML|10|373.374.367||TBL|BLK|||||||3|1|1|534.60|990.00|||3|
3559|ML|10|373.374.368||TBL|ART|||||||3|1|1|534.60|990.00|||3|
3560|ML|10|373.374.369||TBL|LIN|||||||3|1|1|534.60|990.00|||3|
3561|ML|10|373.374.370||TBL|HAL|||||||3|1|1|534.60|990.00|||3|
3562|ML|10|373.374.92||BCO|BCO|B||||||3|1|1|556.20|1030.00|||3|
3563|ML|10|373.374.94||BCO|BCO|M||||||3|1|1|556.20|1030.00|||3|
3564|ML|10|373.374.96||CCL|CCL|B||||||3|1|1|556.20|1030.00|||3|
3565|ML|10|373.374.98||CCL|CCL|M||||||3|1|1|556.20|1030.00|||3|
3566|ML|10|373.374.100||CME|CME|B||||||3|1|1|556.20|1030.00|||3|
3567|ML|10|373.374.102||CME|CME|M||||||3|1|1|556.20|1030.00|||3|
3568|ML|10|373.374.104||ANT|ANT|B||||||3|1|1|556.20|1030.00|||3|
3569|ML|10|373.374.106||ANT|ANT|M||||||3|1|1|556.20|1030.00|||3|
3570|ML|10|373.374.108||PTO|PTO|B||||||3|1|1|556.20|1030.00|||3|
3571|ML|10|373.374.110||PTO|PTO|M||||||3|1|1|556.20|1030.00|||3|
3572|ML|10|373.374.112||CRE|CRE|B||||||3|1|1|556.20|1030.00|||3|
3573|ML|10|373.374.114||CRE|CRE|M||||||3|1|1|556.20|1030.00|||3|
3574|ML|10|373.374.116||CAM|CAM|B||||||3|1|1|556.20|1030.00|||3|
3575|ML|10|373.374.118||CAM|CAM|M||||||3|1|1|556.20|1030.00|||3|
3576|ML|10|373.374.120||OUR|OUR|B||||||3|1|1|556.20|1030.00|||3|
3577|ML|10|373.374.122||OUR|OUR|M||||||3|1|1|556.20|1030.00|||3|
3578|ML|10|373.374.124||COB|COB|B||||||3|1|1|556.20|1030.00|||3|
3579|ML|10|373.374.126||COB|COB|M||||||3|1|1|556.20|1030.00|||3|
3580|ML|10|373.374.128||CHO|CHO|B||||||3|1|1|556.20|1030.00|||3|
3581|ML|10|373.374.130||CHO|CHO|M||||||3|1|1|556.20|1030.00|||3|
3582|ML|10|373.374.132||VAG|VAG|B||||||3|1|1|556.20|1030.00|||3|
3583|ML|10|373.374.134||VAG|VAG|M||||||3|1|1|556.20|1030.00|||3|
3584|ML|10|373.374.136||AZE|AZE|B||||||3|1|1|556.20|1030.00|||3|
3585|ML|10|373.374.138||AZE|AZE|M||||||3|1|1|556.20|1030.00|||3|
3586|ML|10|373.374.140||AMA|AMA|B||||||3|1|1|556.20|1030.00|||3|
3587|ML|10|373.374.142||AMA|AMA|M||||||3|1|1|556.20|1030.00|||3|
3588|ML|10|373.374.144||AES|AES|B||||||3|1|1|556.20|1030.00|||3|
3589|ML|10|373.374.146||AES|AES|M||||||3|1|1|556.20|1030.00|||3|
3590|ML|10|373.374.148||PRA|PRA|B||||||3|1|1|556.20|1030.00|||3|
3591|ML|10|373.374.150||PRA|PRA|M||||||3|1|1|556.20|1030.00|||3|
3592|ML|10|373.374.152||ROS|ROS|B||||||3|1|1|556.20|1030.00|||3|
3593|ML|10|373.374.154||ROS|ROS|M||||||3|1|1|556.20|1030.00|||3|
3594|ML|10|373.374.156||VER|VER|B||||||3|1|1|556.20|1030.00|||3|
3595|ML|10|373.374.158||VER|VER|M||||||3|1|1|556.20|1030.00|||3|
3596|ML|10|373.374.166||AZB|AZB|||||||3|1|1|556.20|1030.00|||3|
3597|ML|10|373.374.168||DEN|DEN|||||||3|1|1|556.20|1030.00|||3|
3598|ML|10|373.374.170||BLK|BLK|||||||3|1|1|556.20|1030.00|||3|
3599|ML|10|373.374.172||ART|ART|||||||3|1|1|556.20|1030.00|||3|
3600|ML|10|373.374.174||LIN|LIN|||||||3|1|1|556.20|1030.00|||3|
3601|ML|10|373.374.176||HAL|HAL|||||||3|1|1|556.20|1030.00|||3|
3602|ML|11|373.375.197||TBL|TBL|||||||3|1|1|345.60|640.00|||3|
3603|ML|11|373.375.198||TEA|TEA|||||||3|1|1|345.60|640.00|||3|
3604|ML|11|373.375.199||OAK|OAK|||||||3|1|1|345.60|640.00|||3|
3605|ML|11|373.375.200||JOP|JOP|||||||3|1|1|345.60|640.00|||3|
3606|ML|11|373.375.201||TBL|BCO|B||||||3|1|1|372.60|690.00|||3|
3607|ML|11|373.375.202||TBL|BCO|M||||||3|1|1|372.60|690.00|||3|
3608|ML|11|373.375.203||TBL|CCL|B||||||3|1|1|372.60|690.00|||3|
3609|ML|11|373.375.204||TBL|CCL|M||||||3|1|1|372.60|690.00|||3|
3610|ML|11|373.375.205||TBL|CME|B||||||3|1|1|372.60|690.00|||3|
3611|ML|11|373.375.206||TBL|CME|M||||||3|1|1|372.60|690.00|||3|
3612|ML|11|373.375.207||TBL|ANT|B||||||3|1|1|372.60|690.00|||3|
3613|ML|11|373.375.208||TBL|ANT|M||||||3|1|1|372.60|690.00|||3|
3614|ML|11|373.375.209||TBL|PTO|B||||||3|1|1|372.60|690.00|||3|
3615|ML|11|373.375.210||TBL|PTO|M||||||3|1|1|372.60|690.00|||3|
3616|ML|11|373.375.211||TBL|CRE|B||||||3|1|1|372.60|690.00|||3|
3617|ML|11|373.375.212||TBL|CRE|M||||||3|1|1|372.60|690.00|||3|
3618|ML|11|373.375.213||TBL|CAM|B||||||3|1|1|372.60|690.00|||3|
3619|ML|11|373.375.214||TBL|CAM|M||||||3|1|1|372.60|690.00|||3|
3620|ML|11|373.375.215||TBL|OUR|B||||||3|1|1|372.60|690.00|||3|
3621|ML|11|373.375.216||TBL|OUR|M||||||3|1|1|372.60|690.00|||3|
3622|ML|11|373.375.217||TBL|COB|B||||||3|1|1|372.60|690.00|||3|
3623|ML|11|373.375.218||TBL|COB|M||||||3|1|1|372.60|690.00|||3|
3624|ML|11|373.375.219||TBL|CHO|B||||||3|1|1|372.60|690.00|||3|
3625|ML|11|373.375.220||TBL|CHO|M||||||3|1|1|372.60|690.00|||3|
3626|ML|11|373.375.221||TBL|VAG|B||||||3|1|1|372.60|690.00|||3|
3627|ML|11|373.375.222||TBL|VAG|M||||||3|1|1|372.60|690.00|||3|
3628|ML|11|373.375.223||TBL|AZE|B||||||3|1|1|372.60|690.00|||3|
3629|ML|11|373.375.224||TBL|AZE|M||||||3|1|1|372.60|690.00|||3|
3630|ML|11|373.375.225||TBL|AMA|B||||||3|1|1|372.60|690.00|||3|
3631|ML|11|373.375.226||TBL|AMA|M||||||3|1|1|372.60|690.00|||3|
3632|ML|11|373.375.227||TBL|AES|B||||||3|1|1|372.60|690.00|||3|
3633|ML|11|373.375.228||TBL|AES|M||||||3|1|1|372.60|690.00|||3|
3634|ML|11|373.375.229||TBL|PRA|B||||||3|1|1|372.60|690.00|||3|
3635|ML|11|373.375.230||TBL|PRA|M||||||3|1|1|372.60|690.00|||3|
3636|ML|11|373.375.231||TBL|ROS|B||||||3|1|1|372.60|690.00|||3|
3637|ML|11|373.375.232||TBL|ROS|M||||||3|1|1|372.60|690.00|||3|
3638|ML|11|373.375.233||TBL|VER|B||||||3|1|1|372.60|690.00|||3|
3639|ML|11|373.375.234||TBL|VER|M||||||3|1|1|372.60|690.00|||3|
3640|ML|11|373.375.235||TBL|AZB|||||||3|1|1|372.60|690.00|||3|
3641|ML|11|373.375.236||TBL|DEN|||||||3|1|1|372.60|690.00|||3|
3642|ML|11|373.375.237||TBL|BLK|||||||3|1|1|372.60|690.00|||3|
3643|ML|11|373.375.238||TBL|ART|||||||3|1|1|372.60|690.00|||3|
3644|ML|11|373.375.239||TBL|LIN|||||||3|1|1|372.60|690.00|||3|
3645|ML|11|373.375.240||TBL|HAL|||||||3|1|1|372.60|690.00|||3|
3646|ML|11|373.375.91||BCO|BCO|B||||||3|1|1|394.20|730.00|||3|
3647|ML|11|373.375.93||BCO|BCO|M||||||3|1|1|394.20|730.00|||3|
3648|ML|11|373.375.95||CCL|CCL|B||||||3|1|1|394.20|730.00|||3|
3649|ML|11|373.375.97||CCL|CCL|M||||||3|1|1|394.20|730.00|||3|
3650|ML|11|373.375.99||CME|CME|B||||||3|1|1|394.20|730.00|||3|
3651|ML|11|373.375.101||CME|CME|M||||||3|1|1|394.20|730.00|||3|
3652|ML|11|373.375.103||ANT|ANT|B||||||3|1|1|394.20|730.00|||3|
3653|ML|11|373.375.105||ANT|ANT|M||||||3|1|1|394.20|730.00|||3|
3654|ML|11|373.375.107||PTO|PTO|B||||||3|1|1|394.20|730.00|||3|
3655|ML|11|373.375.109||PTO|PTO|M||||||3|1|1|394.20|730.00|||3|
3656|ML|11|373.375.111||CRE|CRE|B||||||3|1|1|394.20|730.00|||3|
3657|ML|11|373.375.113||CRE|CRE|M||||||3|1|1|394.20|730.00|||3|
3658|ML|11|373.375.115||CAM|CAM|B||||||3|1|1|394.20|730.00|||3|
3659|ML|11|373.375.117||CAM|CAM|M||||||3|1|1|394.20|730.00|||3|
3660|ML|11|373.375.119||OUR|OUR|B||||||3|1|1|394.20|730.00|||3|
3661|ML|11|373.375.121||OUR|OUR|M||||||3|1|1|394.20|730.00|||3|
3662|ML|11|373.375.123||COB|COB|B||||||3|1|1|394.20|730.00|||3|
3663|ML|11|373.375.125||COB|COB|M||||||3|1|1|394.20|730.00|||3|
3664|ML|11|373.375.127||CHO|CHO|B||||||3|1|1|394.20|730.00|||3|
3665|ML|11|373.375.129||CHO|CHO|M||||||3|1|1|394.20|730.00|||3|
3666|ML|11|373.375.131||VAG|VAG|B||||||3|1|1|394.20|730.00|||3|
3667|ML|11|373.375.133||VAG|VAG|M||||||3|1|1|394.20|730.00|||3|
3668|ML|11|373.375.135||AZE|AZE|B||||||3|1|1|394.20|730.00|||3|
3669|ML|11|373.375.137||AZE|AZE|M||||||3|1|1|394.20|730.00|||3|
3670|ML|11|373.375.139||AMA|AMA|B||||||3|1|1|394.20|730.00|||3|
3671|ML|11|373.375.141||AMA|AMA|M||||||3|1|1|394.20|730.00|||3|
3672|ML|11|373.375.143||AES|AES|B||||||3|1|1|394.20|730.00|||3|
3673|ML|11|373.375.145||AES|AES|M||||||3|1|1|394.20|730.00|||3|
3674|ML|11|373.375.147||PRA|PRA|B||||||3|1|1|394.20|730.00|||3|
3675|ML|11|373.375.149||PRA|PRA|M||||||3|1|1|394.20|730.00|||3|
3676|ML|11|373.375.151||ROS|ROS|B||||||3|1|1|394.20|730.00|||3|
3677|ML|11|373.375.153||ROS|ROS|M||||||3|1|1|394.20|730.00|||3|
3678|ML|11|373.375.155||VER|VER|B||||||3|1|1|394.20|730.00|||3|
3679|ML|11|373.375.157||VER|VER|M||||||3|1|1|394.20|730.00|||3|
3680|ML|11|373.375.165||AZB|AZB|||||||3|1|1|394.20|730.00|||3|
3681|ML|11|373.375.167||DEN|DEN|||||||3|1|1|394.20|730.00|||3|
3682|ML|11|373.375.169||BLK|BLK|||||||3|1|1|394.20|730.00|||3|
3683|ML|11|373.375.171||ART|ART|||||||3|1|1|394.20|730.00|||3|
3684|ML|11|373.375.173||LIN|LIN|||||||3|1|1|394.20|730.00|||3|
3685|ML|11|373.375.175||HAL|HAL|||||||3|1|1|394.20|730.00|||3|
3686|ML|12|373.375.241||TBL|TBL|||||||3|1|1|318.60|590.00|||3|
3687|ML|12|373.375.242||TEA|TEA|||||||3|1|1|318.60|590.00|||3|
3688|ML|12|373.375.243||OAK|OAK|||||||3|1|1|318.60|590.00|||3|
3689|ML|12|373.375.244||JOP|JOP|||||||3|1|1|318.60|590.00|||3|
3690|ML|12|373.375.245||TBL|BCO|B||||||3|1|1|345.60|640.00|||3|
3691|ML|12|373.375.246||TBL|BCO|M||||||3|1|1|345.60|640.00|||3|
3692|ML|12|373.375.247||TBL|CCL|B||||||3|1|1|345.60|640.00|||3|
3693|ML|12|373.375.248||TBL|CCL|M||||||3|1|1|345.60|640.00|||3|
3694|ML|12|373.375.249||TBL|CME|B||||||3|1|1|345.60|640.00|||3|
3695|ML|12|373.375.250||TBL|CME|M||||||3|1|1|345.60|640.00|||3|
3696|ML|12|373.375.251||TBL|ANT|B||||||3|1|1|345.60|640.00|||3|
3697|ML|12|373.375.252||TBL|ANT|M||||||3|1|1|345.60|640.00|||3|
3698|ML|12|373.375.253||TBL|PTO|B||||||3|1|1|345.60|640.00|||3|
3699|ML|12|373.375.254||TBL|PTO|M||||||3|1|1|345.60|640.00|||3|
3700|ML|12|373.375.255||TBL|CRE|B||||||3|1|1|345.60|640.00|||3|
3701|ML|12|373.375.256||TBL|CRE|M||||||3|1|1|345.60|640.00|||3|
3702|ML|12|373.375.257||TBL|CAM|B||||||3|1|1|345.60|640.00|||3|
3703|ML|12|373.375.258||TBL|CAM|M||||||3|1|1|345.60|640.00|||3|
3704|ML|12|373.375.259||TBL|OUR|B||||||3|1|1|345.60|640.00|||3|
3705|ML|12|373.375.260||TBL|OUR|M||||||3|1|1|345.60|640.00|||3|
3706|ML|12|373.375.261||TBL|COB|B||||||3|1|1|345.60|640.00|||3|
3707|ML|12|373.375.262||TBL|COB|M||||||3|1|1|345.60|640.00|||3|
3708|ML|12|373.375.263||TBL|CHO|B||||||3|1|1|345.60|640.00|||3|
3709|ML|12|373.375.264||TBL|CHO|M||||||3|1|1|345.60|640.00|||3|
3710|ML|12|373.375.265||TBL|VAG|B||||||3|1|1|345.60|640.00|||3|
3711|ML|12|373.375.266||TBL|VAG|M||||||3|1|1|345.60|640.00|||3|
3712|ML|12|373.375.267||TBL|AZE|B||||||3|1|1|345.60|640.00|||3|
3713|ML|12|373.375.268||TBL|AZE|M||||||3|1|1|345.60|640.00|||3|
3714|ML|12|373.375.269||TBL|AMA|B||||||3|1|1|345.60|640.00|||3|
3715|ML|12|373.375.270||TBL|AMA|M||||||3|1|1|345.60|640.00|||3|
3716|ML|12|373.375.271||TBL|AES|B||||||3|1|1|345.60|640.00|||3|
3717|ML|12|373.375.272||TBL|AES|M||||||3|1|1|345.60|640.00|||3|
3718|ML|12|373.375.273||TBL|PRA|B||||||3|1|1|345.60|640.00|||3|
3719|ML|12|373.375.274||TBL|PRA|M||||||3|1|1|345.60|640.00|||3|
3720|ML|12|373.375.275||TBL|ROS|B||||||3|1|1|345.60|640.00|||3|
3721|ML|12|373.375.276||TBL|ROS|M||||||3|1|1|345.60|640.00|||3|
3722|ML|12|373.375.277||TBL|VER|B||||||3|1|1|345.60|640.00|||3|
3723|ML|12|373.375.278||TBL|VER|M||||||3|1|1|345.60|640.00|||3|
3724|ML|12|373.375.279||TBL|AZB|||||||3|1|1|345.60|640.00|||3|
3725|ML|12|373.375.280||TBL|DEN|||||||3|1|1|345.60|640.00|||3|
3726|ML|12|373.375.281||TBL|BLK|||||||3|1|1|345.60|640.00|||3|
3727|ML|12|373.375.282||TBL|ART|||||||3|1|1|345.60|640.00|||3|
3728|ML|12|373.375.283||TBL|LIN|||||||3|1|1|345.60|640.00|||3|
3729|ML|12|373.375.284||TBL|HAL|||||||3|1|1|345.60|640.00|||3|
3730|ML|12|373.375.285||BCO|BCO|B||||||3|1|1|367.20|680.00|||3|
3731|ML|12|373.375.286||BCO|BCO|M||||||3|1|1|367.20|680.00|||3|
3732|ML|12|373.375.287||CCL|CCL|B||||||3|1|1|367.20|680.00|||3|
3733|ML|12|373.375.288||CCL|CCL|M||||||3|1|1|367.20|680.00|||3|
3734|ML|12|373.375.289||CME|CME|B||||||3|1|1|367.20|680.00|||3|
3735|ML|12|373.375.290||CME|CME|M||||||3|1|1|367.20|680.00|||3|
3736|ML|12|373.375.291||ANT|ANT|B||||||3|1|1|367.20|680.00|||3|
3737|ML|12|373.375.292||ANT|ANT|M||||||3|1|1|367.20|680.00|||3|
3738|ML|12|373.375.293||PTO|PTO|B||||||3|1|1|367.20|680.00|||3|
3739|ML|12|373.375.294||PTO|PTO|M||||||3|1|1|367.20|680.00|||3|
3740|ML|12|373.375.295||CRE|CRE|B||||||3|1|1|367.20|680.00|||3|
3741|ML|12|373.375.296||CRE|CRE|M||||||3|1|1|367.20|680.00|||3|
3742|ML|12|373.375.297||CAM|CAM|B||||||3|1|1|367.20|680.00|||3|
3743|ML|12|373.375.298||CAM|CAM|M||||||3|1|1|367.20|680.00|||3|
3744|ML|12|373.375.299||OUR|OUR|B||||||3|1|1|367.20|680.00|||3|
3745|ML|12|373.375.300||OUR|OUR|M||||||3|1|1|367.20|680.00|||3|
3746|ML|12|373.375.301||COB|COB|B||||||3|1|1|367.20|680.00|||3|
3747|ML|12|373.375.302||COB|COB|M||||||3|1|1|367.20|680.00|||3|
3748|ML|12|373.375.303||CHO|CHO|B||||||3|1|1|367.20|680.00|||3|
3749|ML|12|373.375.304||CHO|CHO|M||||||3|1|1|367.20|680.00|||3|
3750|ML|12|373.375.305||VAG|VAG|B||||||3|1|1|367.20|680.00|||3|
3751|ML|12|373.375.306||VAG|VAG|M||||||3|1|1|367.20|680.00|||3|
3752|ML|12|373.375.307||AZE|AZE|B||||||3|1|1|367.20|680.00|||3|
3753|ML|12|373.375.308||AZE|AZE|M||||||3|1|1|367.20|680.00|||3|
3754|ML|12|373.375.309||AMA|AMA|B||||||3|1|1|367.20|680.00|||3|
3755|ML|12|373.375.310||AMA|AMA|M||||||3|1|1|367.20|680.00|||3|
3756|ML|12|373.375.311||AES|AES|B||||||3|1|1|367.20|680.00|||3|
3757|ML|12|373.375.312||AES|AES|M||||||3|1|1|367.20|680.00|||3|
3758|ML|12|373.375.313||PRA|PRA|B||||||3|1|1|367.20|680.00|||3|
3759|ML|12|373.375.314||PRA|PRA|M||||||3|1|1|367.20|680.00|||3|
3760|ML|12|373.375.315||ROS|ROS|B||||||3|1|1|367.20|680.00|||3|
3761|ML|12|373.375.316||ROS|ROS|M||||||3|1|1|367.20|680.00|||3|
3762|ML|12|373.375.317||VER|VER|B||||||3|1|1|367.20|680.00|||3|
3763|ML|12|373.375.318||VER|VER|M||||||3|1|1|367.20|680.00|||3|
3764|ML|12|373.375.319||AZB|AZB|||||||3|1|1|367.20|680.00|||3|
3765|ML|12|373.375.320||DEN|DEN|||||||3|1|1|367.20|680.00|||3|
3766|ML|12|373.375.321||BLK|BLK|||||||3|1|1|367.20|680.00|||3|
3767|ML|12|373.375.322||ART|ART|||||||3|1|1|367.20|680.00|||3|
3768|ML|12|373.375.323||LIN|LIN|||||||3|1|1|367.20|680.00|||3|
3769|ML|12|373.375.324||HAL|HAL|||||||3|1|1|367.20|680.00|||3|
3770|ML|13|373.375.327||TBL|TBL|||||||3|1|1|567.00|1050.00|||3|
3771|ML|13|373.375.328||TEA|TEA|||||||3|1|1|567.00|1050.00|||3|
3772|ML|13|373.375.329||OAK|OAK|||||||3|1|1|567.00|1050.00|||3|
3773|ML|13|373.375.330||JOP|JOP|||||||3|1|1|567.00|1050.00|||3|
3774|ML|13|373.375.331||TBL|BCO|B||||||3|1|1|594.00|1100.00|||3|
3775|ML|13|373.375.332||TBL|BCO|M||||||3|1|1|594.00|1100.00|||3|
3776|ML|13|373.375.333||TBL|CCL|B||||||3|1|1|594.00|1100.00|||3|
3777|ML|13|373.375.334||TBL|CCL|M||||||3|1|1|594.00|1100.00|||3|
3778|ML|13|373.375.335||TBL|CME|B||||||3|1|1|594.00|1100.00|||3|
3779|ML|13|373.375.336||TBL|CME|M||||||3|1|1|594.00|1100.00|||3|
3780|ML|13|373.375.337||TBL|ANT|B||||||3|1|1|594.00|1100.00|||3|
3781|ML|13|373.375.338||TBL|ANT|M||||||3|1|1|594.00|1100.00|||3|
3782|ML|13|373.375.339||TBL|PTO|B||||||3|1|1|594.00|1100.00|||3|
3783|ML|13|373.375.340||TBL|PTO|M||||||3|1|1|594.00|1100.00|||3|
3784|ML|13|373.375.341||TBL|CRE|B||||||3|1|1|594.00|1100.00|||3|
3785|ML|13|373.375.342||TBL|CRE|M||||||3|1|1|594.00|1100.00|||3|
3786|ML|13|373.375.343||TBL|CAM|B||||||3|1|1|594.00|1100.00|||3|
3787|ML|13|373.375.344||TBL|CAM|M||||||3|1|1|594.00|1100.00|||3|
3788|ML|13|373.375.345||TBL|OUR|B||||||3|1|1|594.00|1100.00|||3|
3789|ML|13|373.375.346||TBL|OUR|M||||||3|1|1|594.00|1100.00|||3|
3790|ML|13|373.375.347||TBL|COB|B||||||3|1|1|594.00|1100.00|||3|
3791|ML|13|373.375.348||TBL|COB|M||||||3|1|1|594.00|1100.00|||3|
3792|ML|13|373.375.349||TBL|CHO|B||||||3|1|1|594.00|1100.00|||3|
3793|ML|13|373.375.350||TBL|CHO|M||||||3|1|1|594.00|1100.00|||3|
3794|ML|13|373.375.351||TBL|VAG|B||||||3|1|1|594.00|1100.00|||3|
3795|ML|13|373.375.352||TBL|VAG|M||||||3|1|1|594.00|1100.00|||3|
3796|ML|13|373.375.353||TBL|AZE|B||||||3|1|1|594.00|1100.00|||3|
3797|ML|13|373.375.354||TBL|AZE|M||||||3|1|1|594.00|1100.00|||3|
3798|ML|13|373.375.355||TBL|AMA|B||||||3|1|1|594.00|1100.00|||3|
3799|ML|13|373.375.356||TBL|AMA|M||||||3|1|1|594.00|1100.00|||3|
3800|ML|13|373.375.357||TBL|AES|B||||||3|1|1|594.00|1100.00|||3|
3801|ML|13|373.375.358||TBL|AES|M||||||3|1|1|594.00|1100.00|||3|
3802|ML|13|373.375.359||TBL|PRA|B||||||3|1|1|594.00|1100.00|||3|
3803|ML|13|373.375.360||TBL|PRA|M||||||3|1|1|594.00|1100.00|||3|
3804|ML|13|373.375.361||TBL|ROS|B||||||3|1|1|594.00|1100.00|||3|
3805|ML|13|373.375.362||TBL|ROS|M||||||3|1|1|594.00|1100.00|||3|
3806|ML|13|373.375.363||TBL|VER|B||||||3|1|1|594.00|1100.00|||3|
3807|ML|13|373.375.364||TBL|VER|M||||||3|1|1|594.00|1100.00|||3|
3808|ML|13|373.375.365||TBL|AZB|||||||3|1|1|594.00|1100.00|||3|
3809|ML|13|373.375.366||TBL|DEN|||||||3|1|1|594.00|1100.00|||3|
3810|ML|13|373.375.367||TBL|BLK|||||||3|1|1|594.00|1100.00|||3|
3811|ML|13|373.375.368||TBL|ART|||||||3|1|1|594.00|1100.00|||3|
3812|ML|13|373.375.369||TBL|LIN|||||||3|1|1|594.00|1100.00|||3|
3813|ML|13|373.375.370||TBL|HAL|||||||3|1|1|594.00|1100.00|||3|
3814|ML|13|373.375.92||BCO|BCO|B||||||3|1|1|615.60|1140.00|||3|
3815|ML|13|373.375.94||BCO|BCO|M||||||3|1|1|615.60|1140.00|||3|
3816|ML|13|373.375.96||CCL|CCL|B||||||3|1|1|615.60|1140.00|||3|
3817|ML|13|373.375.98||CCL|CCL|M||||||3|1|1|615.60|1140.00|||3|
3818|ML|13|373.375.100||CME|CME|B||||||3|1|1|615.60|1140.00|||3|
3819|ML|13|373.375.102||CME|CME|M||||||3|1|1|615.60|1140.00|||3|
3820|ML|13|373.375.104||ANT|ANT|B||||||3|1|1|615.60|1140.00|||3|
3821|ML|13|373.375.106||ANT|ANT|M||||||3|1|1|615.60|1140.00|||3|
3822|ML|13|373.375.108||PTO|PTO|B||||||3|1|1|615.60|1140.00|||3|
3823|ML|13|373.375.110||PTO|PTO|M||||||3|1|1|615.60|1140.00|||3|
3824|ML|13|373.375.112||CRE|CRE|B||||||3|1|1|615.60|1140.00|||3|
3825|ML|13|373.375.114||CRE|CRE|M||||||3|1|1|615.60|1140.00|||3|
3826|ML|13|373.375.116||CAM|CAM|B||||||3|1|1|615.60|1140.00|||3|
3827|ML|13|373.375.118||CAM|CAM|M||||||3|1|1|615.60|1140.00|||3|
3828|ML|13|373.375.120||OUR|OUR|B||||||3|1|1|615.60|1140.00|||3|
3829|ML|13|373.375.122||OUR|OUR|M||||||3|1|1|615.60|1140.00|||3|
3830|ML|13|373.375.124||COB|COB|B||||||3|1|1|615.60|1140.00|||3|
3831|ML|13|373.375.126||COB|COB|M||||||3|1|1|615.60|1140.00|||3|
3832|ML|13|373.375.128||CHO|CHO|B||||||3|1|1|615.60|1140.00|||3|
3833|ML|13|373.375.130||CHO|CHO|M||||||3|1|1|615.60|1140.00|||3|
3834|ML|13|373.375.132||VAG|VAG|B||||||3|1|1|615.60|1140.00|||3|
3835|ML|13|373.375.134||VAG|VAG|M||||||3|1|1|615.60|1140.00|||3|
3836|ML|13|373.375.136||AZE|AZE|B||||||3|1|1|615.60|1140.00|||3|
3837|ML|13|373.375.138||AZE|AZE|M||||||3|1|1|615.60|1140.00|||3|
3838|ML|13|373.375.140||AMA|AMA|B||||||3|1|1|615.60|1140.00|||3|
3839|ML|13|373.375.142||AMA|AMA|M||||||3|1|1|615.60|1140.00|||3|
3840|ML|13|373.375.144||AES|AES|B||||||3|1|1|615.60|1140.00|||3|
3841|ML|13|373.375.146||AES|AES|M||||||3|1|1|615.60|1140.00|||3|
3842|ML|13|373.375.148||PRA|PRA|B||||||3|1|1|615.60|1140.00|||3|
3843|ML|13|373.375.150||PRA|PRA|M||||||3|1|1|615.60|1140.00|||3|
3844|ML|13|373.375.152||ROS|ROS|B||||||3|1|1|615.60|1140.00|||3|
3845|ML|13|373.375.154||ROS|ROS|M||||||3|1|1|615.60|1140.00|||3|
3846|ML|13|373.375.156||VER|VER|B||||||3|1|1|615.60|1140.00|||3|
3847|ML|13|373.375.158||VER|VER|M||||||3|1|1|615.60|1140.00|||3|
3848|ML|13|373.375.166||AZB|AZB|||||||3|1|1|615.60|1140.00|||3|
3849|ML|13|373.375.168||DEN|DEN|||||||3|1|1|615.60|1140.00|||3|
3850|ML|13|373.375.170||BLK|BLK|||||||3|1|1|615.60|1140.00|||3|
3851|ML|13|373.375.172||ART|ART|||||||3|1|1|615.60|1140.00|||3|
3852|ML|13|373.375.174||LIN|LIN|||||||3|1|1|615.60|1140.00|||3|
3853|ML|13|373.375.176||HAL|HAL|||||||3|1|1|615.60|1140.00|||3|
3854|ML|14|376.377.241||TBL|TBL|||||||7|1|1|399.60|740.00|||3|
3855|ML|14|376.377.242||TEA|TEA|||||||7|1|1|399.60|740.00|||3|
3856|ML|14|376.377.243||OAK|OAK|||||||7|1|1|399.60|740.00|||3|
3857|ML|14|376.377.244||JOP|JOP|||||||7|1|1|399.60|740.00|||3|
3858|ML|14|376.377.245||TBL|BCO|B||||||7|1|1|426.60|790.00|||3|
3859|ML|14|376.377.246||TBL|BCO|M||||||7|1|1|426.60|790.00|||3|
3860|ML|14|376.377.247||TBL|CCL|B||||||7|1|1|426.60|790.00|||3|
3861|ML|14|376.377.248||TBL|CCL|M||||||7|1|1|426.60|790.00|||3|
3862|ML|14|376.377.249||TBL|CME|B||||||7|1|1|426.60|790.00|||3|
3863|ML|14|376.377.250||TBL|CME|M||||||7|1|1|426.60|790.00|||3|
3864|ML|14|376.377.251||TBL|ANT|B||||||7|1|1|426.60|790.00|||3|
3865|ML|14|376.377.252||TBL|ANT|M||||||7|1|1|426.60|790.00|||3|
3866|ML|14|376.377.253||TBL|PTO|B||||||7|1|1|426.60|790.00|||3|
3867|ML|14|376.377.254||TBL|PTO|M||||||7|1|1|426.60|790.00|||3|
3868|ML|14|376.377.255||TBL|CRE|B||||||7|1|1|426.60|790.00|||3|
3869|ML|14|376.377.256||TBL|CRE|M||||||7|1|1|426.60|790.00|||3|
3870|ML|14|376.377.257||TBL|CAM|B||||||7|1|1|426.60|790.00|||3|
3871|ML|14|376.377.258||TBL|CAM|M||||||7|1|1|426.60|790.00|||3|
3872|ML|14|376.377.259||TBL|OUR|B||||||7|1|1|426.60|790.00|||3|
3873|ML|14|376.377.260||TBL|OUR|M||||||7|1|1|426.60|790.00|||3|
3874|ML|14|376.377.261||TBL|COB|B||||||7|1|1|426.60|790.00|||3|
3875|ML|14|376.377.262||TBL|COB|M||||||7|1|1|426.60|790.00|||3|
3876|ML|14|376.377.263||TBL|CHO|B||||||7|1|1|426.60|790.00|||3|
3877|ML|14|376.377.264||TBL|CHO|M||||||7|1|1|426.60|790.00|||3|
3878|ML|14|376.377.265||TBL|VAG|B||||||7|1|1|426.60|790.00|||3|
3879|ML|14|376.377.266||TBL|VAG|M||||||7|1|1|426.60|790.00|||3|
3880|ML|14|376.377.267||TBL|AZE|B||||||7|1|1|426.60|790.00|||3|
3881|ML|14|376.377.268||TBL|AZE|M||||||7|1|1|426.60|790.00|||3|
3882|ML|14|376.377.269||TBL|AMA|B||||||7|1|1|426.60|790.00|||3|
3883|ML|14|376.377.270||TBL|AMA|M||||||7|1|1|426.60|790.00|||3|
3884|ML|14|376.377.271||TBL|AES|B||||||7|1|1|426.60|790.00|||3|
3885|ML|14|376.377.272||TBL|AES|M||||||7|1|1|426.60|790.00|||3|
3886|ML|14|376.377.273||TBL|PRA|B||||||7|1|1|426.60|790.00|||3|
3887|ML|14|376.377.274||TBL|PRA|M||||||7|1|1|426.60|790.00|||3|
3888|ML|14|376.377.275||TBL|ROS|B||||||7|1|1|426.60|790.00|||3|
3889|ML|14|376.377.276||TBL|ROS|M||||||7|1|1|426.60|790.00|||3|
3890|ML|14|376.377.277||TBL|VER|B||||||7|1|1|426.60|790.00|||3|
3891|ML|14|376.377.278||TBL|VER|M||||||7|1|1|426.60|790.00|||3|
3892|ML|14|376.377.279||TBL|AZB|||||||7|1|1|426.60|790.00|||3|
3893|ML|14|376.377.280||TBL|DEN|||||||7|1|1|426.60|790.00|||3|
3894|ML|14|376.377.281||TBL|BLK|||||||7|1|1|426.60|790.00|||3|
3895|ML|14|376.377.282||TBL|ART|||||||7|1|1|426.60|790.00|||3|
3896|ML|14|376.377.283||TBL|LIN|||||||7|1|1|426.60|790.00|||3|
3897|ML|14|376.377.284||TBL|HAL|||||||7|1|1|426.60|790.00|||3|
3898|ML|14|376.377.285||BCO|BCO|B||||||7|1|1|448.20|830.00|||3|
3899|ML|14|376.377.286||BCO|BCO|M||||||7|1|1|448.20|830.00|||3|
3900|ML|14|376.377.287||CCL|CCL|B||||||7|1|1|448.20|830.00|||3|
3901|ML|14|376.377.288||CCL|CCL|M||||||7|1|1|448.20|830.00|||3|
3902|ML|14|376.377.289||CME|CME|B||||||7|1|1|448.20|830.00|||3|
3903|ML|14|376.377.290||CME|CME|M||||||7|1|1|448.20|830.00|||3|
3904|ML|14|376.377.291||ANT|ANT|B||||||7|1|1|448.20|830.00|||3|
3905|ML|14|376.377.292||ANT|ANT|M||||||7|1|1|448.20|830.00|||3|
3906|ML|14|376.377.293||PTO|PTO|B||||||7|1|1|448.20|830.00|||3|
3907|ML|14|376.377.294||PTO|PTO|M||||||7|1|1|448.20|830.00|||3|
3908|ML|14|376.377.295||CRE|CRE|B||||||7|1|1|448.20|830.00|||3|
3909|ML|14|376.377.296||CRE|CRE|M||||||7|1|1|448.20|830.00|||3|
3910|ML|14|376.377.297||CAM|CAM|B||||||7|1|1|448.20|830.00|||3|
3911|ML|14|376.377.298||CAM|CAM|M||||||7|1|1|448.20|830.00|||3|
3912|ML|14|376.377.299||OUR|OUR|B||||||7|1|1|448.20|830.00|||3|
3913|ML|14|376.377.300||OUR|OUR|M||||||7|1|1|448.20|830.00|||3|
3914|ML|14|376.377.301||COB|COB|B||||||7|1|1|448.20|830.00|||3|
3915|ML|14|376.377.302||COB|COB|M||||||7|1|1|448.20|830.00|||3|
3916|ML|14|376.377.303||CHO|CHO|B||||||7|1|1|448.20|830.00|||3|
3917|ML|14|376.377.304||CHO|CHO|M||||||7|1|1|448.20|830.00|||3|
3918|ML|14|376.377.305||VAG|VAG|B||||||7|1|1|448.20|830.00|||3|
3919|ML|14|376.377.306||VAG|VAG|M||||||7|1|1|448.20|830.00|||3|
3920|ML|14|376.377.307||AZE|AZE|B||||||7|1|1|448.20|830.00|||3|
3921|ML|14|376.377.308||AZE|AZE|M||||||7|1|1|448.20|830.00|||3|
3922|ML|14|376.377.309||AMA|AMA|B||||||7|1|1|448.20|830.00|||3|
3923|ML|14|376.377.310||AMA|AMA|M||||||7|1|1|448.20|830.00|||3|
3924|ML|14|376.377.311||AES|AES|B||||||7|1|1|448.20|830.00|||3|
3925|ML|14|376.377.312||AES|AES|M||||||7|1|1|448.20|830.00|||3|
3926|ML|14|376.377.313||PRA|PRA|B||||||7|1|1|448.20|830.00|||3|
3927|ML|14|376.377.314||PRA|PRA|M||||||7|1|1|448.20|830.00|||3|
3928|ML|14|376.377.315||ROS|ROS|B||||||7|1|1|448.20|830.00|||3|
3929|ML|14|376.377.316||ROS|ROS|M||||||7|1|1|448.20|830.00|||3|
3930|ML|14|376.377.317||VER|VER|B||||||7|1|1|448.20|830.00|||3|
3931|ML|14|376.377.318||VER|VER|M||||||7|1|1|448.20|830.00|||3|
3932|ML|14|376.377.319||AZB|AZB|||||||7|1|1|448.20|830.00|||3|
3933|ML|14|376.377.320||DEN|DEN|||||||7|1|1|448.20|830.00|||3|
3934|ML|14|376.377.321||BLK|BLK|||||||7|1|1|448.20|830.00|||3|
3935|ML|14|376.377.322||ART|ART|||||||7|1|1|448.20|830.00|||3|
3936|ML|14|376.377.323||LIN|LIN|||||||7|1|1|448.20|830.00|||3|
3937|ML|14|376.377.324||HAL|HAL|||||||7|1|1|448.20|830.00|||3|
3938|ML|15|376.377.327||TBL|TBL|||||||7|1|1|702.00|1300.00|||3|
3939|ML|15|376.377.328||TEA|TEA|||||||7|1|1|702.00|1300.00|||3|
3940|ML|15|376.377.329||OAK|OAK|||||||7|1|1|702.00|1300.00|||3|
3941|ML|15|376.377.330||JOP|JOP|||||||7|1|1|702.00|1300.00|||3|
3942|ML|15|376.377.331||TBL|BCO|B||||||7|1|1|729.00|1350.00|||3|
3943|ML|15|376.377.332||TBL|BCO|M||||||7|1|1|729.00|1350.00|||3|
3944|ML|15|376.377.333||TBL|CCL|B||||||7|1|1|729.00|1350.00|||3|
3945|ML|15|376.377.334||TBL|CCL|M||||||7|1|1|729.00|1350.00|||3|
3946|ML|15|376.377.335||TBL|CME|B||||||7|1|1|729.00|1350.00|||3|
3947|ML|15|376.377.336||TBL|CME|M||||||7|1|1|729.00|1350.00|||3|
3948|ML|15|376.377.337||TBL|ANT|B||||||7|1|1|729.00|1350.00|||3|
3949|ML|15|376.377.338||TBL|ANT|M||||||7|1|1|729.00|1350.00|||3|
3950|ML|15|376.377.339||TBL|PTO|B||||||7|1|1|729.00|1350.00|||3|
3951|ML|15|376.377.340||TBL|PTO|M||||||7|1|1|729.00|1350.00|||3|
3952|ML|15|376.377.341||TBL|CRE|B||||||7|1|1|729.00|1350.00|||3|
3953|ML|15|376.377.342||TBL|CRE|M||||||7|1|1|729.00|1350.00|||3|
3954|ML|15|376.377.343||TBL|CAM|B||||||7|1|1|729.00|1350.00|||3|
3955|ML|15|376.377.344||TBL|CAM|M||||||7|1|1|729.00|1350.00|||3|
3956|ML|15|376.377.345||TBL|OUR|B||||||7|1|1|729.00|1350.00|||3|
3957|ML|15|376.377.346||TBL|OUR|M||||||7|1|1|729.00|1350.00|||3|
3958|ML|15|376.377.347||TBL|COB|B||||||7|1|1|729.00|1350.00|||3|
3959|ML|15|376.377.348||TBL|COB|M||||||7|1|1|729.00|1350.00|||3|
3960|ML|15|376.377.349||TBL|CHO|B||||||7|1|1|729.00|1350.00|||3|
3961|ML|15|376.377.350||TBL|CHO|M||||||7|1|1|729.00|1350.00|||3|
3962|ML|15|376.377.351||TBL|VAG|B||||||7|1|1|729.00|1350.00|||3|
3963|ML|15|376.377.352||TBL|VAG|M||||||7|1|1|729.00|1350.00|||3|
3964|ML|15|376.377.353||TBL|AZE|B||||||7|1|1|729.00|1350.00|||3|
3965|ML|15|376.377.354||TBL|AZE|M||||||7|1|1|729.00|1350.00|||3|
3966|ML|15|376.377.355||TBL|AMA|B||||||7|1|1|729.00|1350.00|||3|
3967|ML|15|376.377.356||TBL|AMA|M||||||7|1|1|729.00|1350.00|||3|
3968|ML|15|376.377.357||TBL|AES|B||||||7|1|1|729.00|1350.00|||3|
3969|ML|15|376.377.358||TBL|AES|M||||||7|1|1|729.00|1350.00|||3|
3970|ML|15|376.377.359||TBL|PRA|B||||||7|1|1|729.00|1350.00|||3|
3971|ML|15|376.377.360||TBL|PRA|M||||||7|1|1|729.00|1350.00|||3|
3972|ML|15|376.377.361||TBL|ROS|B||||||7|1|1|729.00|1350.00|||3|
3973|ML|15|376.377.362||TBL|ROS|M||||||7|1|1|729.00|1350.00|||3|
3974|ML|15|376.377.363||TBL|VER|B||||||7|1|1|729.00|1350.00|||3|
3975|ML|15|376.377.364||TBL|VER|M||||||7|1|1|729.00|1350.00|||3|
3976|ML|15|376.377.365||TBL|AZB|||||||7|1|1|729.00|1350.00|||3|
3977|ML|15|376.377.366||TBL|DEN|||||||7|1|1|729.00|1350.00|||3|
3978|ML|15|376.377.367||TBL|BLK|||||||7|1|1|729.00|1350.00|||3|
3979|ML|15|376.377.368||TBL|ART|||||||7|1|1|729.00|1350.00|||3|
3980|ML|15|376.377.369||TBL|LIN|||||||7|1|1|729.00|1350.00|||3|
3981|ML|15|376.377.370||TBL|HAL|||||||7|1|1|729.00|1350.00|||3|
3982|ML|15|376.377.92||BCO|BCO|B||||||7|1|1|750.60|1390.00|||3|
3983|ML|15|376.377.94||BCO|BCO|M||||||7|1|1|750.60|1390.00|||3|
3984|ML|15|376.377.96||CCL|CCL|B||||||7|1|1|750.60|1390.00|||3|
3985|ML|15|376.377.98||CCL|CCL|M||||||7|1|1|750.60|1390.00|||3|
3986|ML|15|376.377.100||CME|CME|B||||||7|1|1|750.60|1390.00|||3|
3987|ML|15|376.377.102||CME|CME|M||||||7|1|1|750.60|1390.00|||3|
3988|ML|15|376.377.104||ANT|ANT|B||||||7|1|1|750.60|1390.00|||3|
3989|ML|15|376.377.106||ANT|ANT|M||||||7|1|1|750.60|1390.00|||3|
3990|ML|15|376.377.108||PTO|PTO|B||||||7|1|1|750.60|1390.00|||3|
3991|ML|15|376.377.110||PTO|PTO|M||||||7|1|1|750.60|1390.00|||3|
3992|ML|15|376.377.112||CRE|CRE|B||||||7|1|1|750.60|1390.00|||3|
3993|ML|15|376.377.114||CRE|CRE|M||||||7|1|1|750.60|1390.00|||3|
3994|ML|15|376.377.116||CAM|CAM|B||||||7|1|1|750.60|1390.00|||3|
3995|ML|15|376.377.118||CAM|CAM|M||||||7|1|1|750.60|1390.00|||3|
3996|ML|15|376.377.120||OUR|OUR|B||||||7|1|1|750.60|1390.00|||3|
3997|ML|15|376.377.122||OUR|OUR|M||||||7|1|1|750.60|1390.00|||3|
3998|ML|15|376.377.124||COB|COB|B||||||7|1|1|750.60|1390.00|||3|
3999|ML|15|376.377.126||COB|COB|M||||||7|1|1|750.60|1390.00|||3|
4000|ML|15|376.377.128||CHO|CHO|B||||||7|1|1|750.60|1390.00|||3|
4001|ML|15|376.377.130||CHO|CHO|M||||||7|1|1|750.60|1390.00|||3|
4002|ML|15|376.377.132||VAG|VAG|B||||||7|1|1|750.60|1390.00|||3|
4003|ML|15|376.377.134||VAG|VAG|M||||||7|1|1|750.60|1390.00|||3|
4004|ML|15|376.377.136||AZE|AZE|B||||||7|1|1|750.60|1390.00|||3|
4005|ML|15|376.377.138||AZE|AZE|M||||||7|1|1|750.60|1390.00|||3|
4006|ML|15|376.377.140||AMA|AMA|B||||||7|1|1|750.60|1390.00|||3|
4007|ML|15|376.377.142||AMA|AMA|M||||||7|1|1|750.60|1390.00|||3|
4008|ML|15|376.377.144||AES|AES|B||||||7|1|1|750.60|1390.00|||3|
4009|ML|15|376.377.146||AES|AES|M||||||7|1|1|750.60|1390.00|||3|
4010|ML|15|376.377.148||PRA|PRA|B||||||7|1|1|750.60|1390.00|||3|
4011|ML|15|376.377.150||PRA|PRA|M||||||7|1|1|750.60|1390.00|||3|
4012|ML|15|376.377.152||ROS|ROS|B||||||7|1|1|750.60|1390.00|||3|
4013|ML|15|376.377.154||ROS|ROS|M||||||7|1|1|750.60|1390.00|||3|
4014|ML|15|376.377.156||VER|VER|B||||||7|1|1|750.60|1390.00|||3|
4015|ML|15|376.377.158||VER|VER|M||||||7|1|1|750.60|1390.00|||3|
4016|ML|15|376.377.166||AZB|AZB|||||||7|1|1|750.60|1390.00|||3|
4017|ML|15|376.377.168||DEN|DEN|||||||7|1|1|750.60|1390.00|||3|
4018|ML|15|376.377.170||BLK|BLK|||||||7|1|1|750.60|1390.00|||3|
4019|ML|15|376.377.172||ART|ART|||||||7|1|1|750.60|1390.00|||3|
4020|ML|15|376.377.174||LIN|LIN|||||||7|1|1|750.60|1390.00|||3|
4021|ML|15|376.377.176||HAL|HAL|||||||7|1|1|750.60|1390.00|||3|
4022|ML|16|378.377.197||TBL|TBL|||||||8|1|1|534.60|990.00|||3|
4023|ML|16|378.377.198||TEA|TEA|||||||8|1|1|534.60|990.00|||3|
4024|ML|16|378.377.199||OAK|OAK|||||||8|1|1|534.60|990.00|||3|
4025|ML|16|378.377.200||JOP|JOP|||||||8|1|1|534.60|990.00|||3|
4026|ML|16|378.377.201||TBL|BCO|B||||||8|1|1|561.60|1040.00|||3|
4027|ML|16|378.377.202||TBL|BCO|M||||||8|1|1|561.60|1040.00|||3|
4028|ML|16|378.377.203||TBL|CCL|B||||||8|1|1|561.60|1040.00|||3|
4029|ML|16|378.377.204||TBL|CCL|M||||||8|1|1|561.60|1040.00|||3|
4030|ML|16|378.377.205||TBL|CME|B||||||8|1|1|561.60|1040.00|||3|
4031|ML|16|378.377.206||TBL|CME|M||||||8|1|1|561.60|1040.00|||3|
4032|ML|16|378.377.207||TBL|ANT|B||||||8|1|1|561.60|1040.00|||3|
4033|ML|16|378.377.208||TBL|ANT|M||||||8|1|1|561.60|1040.00|||3|
4034|ML|16|378.377.209||TBL|PTO|B||||||8|1|1|561.60|1040.00|||3|
4035|ML|16|378.377.210||TBL|PTO|M||||||8|1|1|561.60|1040.00|||3|
4036|ML|16|378.377.211||TBL|CRE|B||||||8|1|1|561.60|1040.00|||3|
4037|ML|16|378.377.212||TBL|CRE|M||||||8|1|1|561.60|1040.00|||3|
4038|ML|16|378.377.213||TBL|CAM|B||||||8|1|1|561.60|1040.00|||3|
4039|ML|16|378.377.214||TBL|CAM|M||||||8|1|1|561.60|1040.00|||3|
4040|ML|16|378.377.215||TBL|OUR|B||||||8|1|1|561.60|1040.00|||3|
4041|ML|16|378.377.216||TBL|OUR|M||||||8|1|1|561.60|1040.00|||3|
4042|ML|16|378.377.217||TBL|COB|B||||||8|1|1|561.60|1040.00|||3|
4043|ML|16|378.377.218||TBL|COB|M||||||8|1|1|561.60|1040.00|||3|
4044|ML|16|378.377.219||TBL|CHO|B||||||8|1|1|561.60|1040.00|||3|
4045|ML|16|378.377.220||TBL|CHO|M||||||8|1|1|561.60|1040.00|||3|
4046|ML|16|378.377.221||TBL|VAG|B||||||8|1|1|561.60|1040.00|||3|
4047|ML|16|378.377.222||TBL|VAG|M||||||8|1|1|561.60|1040.00|||3|
4048|ML|16|378.377.223||TBL|AZE|B||||||8|1|1|561.60|1040.00|||3|
4049|ML|16|378.377.224||TBL|AZE|M||||||8|1|1|561.60|1040.00|||3|
4050|ML|16|378.377.225||TBL|AMA|B||||||8|1|1|561.60|1040.00|||3|
4051|ML|16|378.377.226||TBL|AMA|M||||||8|1|1|561.60|1040.00|||3|
4052|ML|16|378.377.227||TBL|AES|B||||||8|1|1|561.60|1040.00|||3|
4053|ML|16|378.377.228||TBL|AES|M||||||8|1|1|561.60|1040.00|||3|
4054|ML|16|378.377.229||TBL|PRA|B||||||8|1|1|561.60|1040.00|||3|
4055|ML|16|378.377.230||TBL|PRA|M||||||8|1|1|561.60|1040.00|||3|
4056|ML|16|378.377.231||TBL|ROS|B||||||8|1|1|561.60|1040.00|||3|
4057|ML|16|378.377.232||TBL|ROS|M||||||8|1|1|561.60|1040.00|||3|
4058|ML|16|378.377.233||TBL|VER|B||||||8|1|1|561.60|1040.00|||3|
4059|ML|16|378.377.234||TBL|VER|M||||||8|1|1|561.60|1040.00|||3|
4060|ML|16|378.377.235||TBL|AZB|||||||8|1|1|561.60|1040.00|||3|
4061|ML|16|378.377.236||TBL|DEN|||||||8|1|1|561.60|1040.00|||3|
4062|ML|16|378.377.237||TBL|BLK|||||||8|1|1|561.60|1040.00|||3|
4063|ML|16|378.377.238||TBL|ART|||||||8|1|1|561.60|1040.00|||3|
4064|ML|16|378.377.239||TBL|LIN|||||||8|1|1|561.60|1040.00|||3|
4065|ML|16|378.377.240||TBL|HAL|||||||8|1|1|561.60|1040.00|||3|
4066|ML|16|378.377.91||BCO|BCO|B||||||8|1|1|583.20|1080.00|||3|
4067|ML|16|378.377.93||BCO|BCO|M||||||8|1|1|583.20|1080.00|||3|
4068|ML|16|378.377.95||CCL|CCL|B||||||8|1|1|583.20|1080.00|||3|
4069|ML|16|378.377.97||CCL|CCL|M||||||8|1|1|583.20|1080.00|||3|
4070|ML|16|378.377.99||CME|CME|B||||||8|1|1|583.20|1080.00|||3|
4071|ML|16|378.377.101||CME|CME|M||||||8|1|1|583.20|1080.00|||3|
4072|ML|16|378.377.103||ANT|ANT|B||||||8|1|1|583.20|1080.00|||3|
4073|ML|16|378.377.105||ANT|ANT|M||||||8|1|1|583.20|1080.00|||3|
4074|ML|16|378.377.107||PTO|PTO|B||||||8|1|1|583.20|1080.00|||3|
4075|ML|16|378.377.109||PTO|PTO|M||||||8|1|1|583.20|1080.00|||3|
4076|ML|16|378.377.111||CRE|CRE|B||||||8|1|1|583.20|1080.00|||3|
4077|ML|16|378.377.113||CRE|CRE|M||||||8|1|1|583.20|1080.00|||3|
4078|ML|16|378.377.115||CAM|CAM|B||||||8|1|1|583.20|1080.00|||3|
4079|ML|16|378.377.117||CAM|CAM|M||||||8|1|1|583.20|1080.00|||3|
4080|ML|16|378.377.119||OUR|OUR|B||||||8|1|1|583.20|1080.00|||3|
4081|ML|16|378.377.121||OUR|OUR|M||||||8|1|1|583.20|1080.00|||3|
4082|ML|16|378.377.123||COB|COB|B||||||8|1|1|583.20|1080.00|||3|
4083|ML|16|378.377.125||COB|COB|M||||||8|1|1|583.20|1080.00|||3|
4084|ML|16|378.377.127||CHO|CHO|B||||||8|1|1|583.20|1080.00|||3|
4085|ML|16|378.377.129||CHO|CHO|M||||||8|1|1|583.20|1080.00|||3|
4086|ML|16|378.377.131||VAG|VAG|B||||||8|1|1|583.20|1080.00|||3|
4087|ML|16|378.377.133||VAG|VAG|M||||||8|1|1|583.20|1080.00|||3|
4088|ML|16|378.377.135||AZE|AZE|B||||||8|1|1|583.20|1080.00|||3|
4089|ML|16|378.377.137||AZE|AZE|M||||||8|1|1|583.20|1080.00|||3|
4090|ML|16|378.377.139||AMA|AMA|B||||||8|1|1|583.20|1080.00|||3|
4091|ML|16|378.377.141||AMA|AMA|M||||||8|1|1|583.20|1080.00|||3|
4092|ML|16|378.377.143||AES|AES|B||||||8|1|1|583.20|1080.00|||3|
4093|ML|16|378.377.145||AES|AES|M||||||8|1|1|583.20|1080.00|||3|
4094|ML|16|378.377.147||PRA|PRA|B||||||8|1|1|583.20|1080.00|||3|
4095|ML|16|378.377.149||PRA|PRA|M||||||8|1|1|583.20|1080.00|||3|
4096|ML|16|378.377.151||ROS|ROS|B||||||8|1|1|583.20|1080.00|||3|
4097|ML|16|378.377.153||ROS|ROS|M||||||8|1|1|583.20|1080.00|||3|
4098|ML|16|378.377.155||VER|VER|B||||||8|1|1|583.20|1080.00|||3|
4099|ML|16|378.377.157||VER|VER|M||||||8|1|1|583.20|1080.00|||3|
4100|ML|16|378.377.165||AZB|AZB|||||||8|1|1|583.20|1080.00|||3|
4101|ML|16|378.377.167||DEN|DEN|||||||8|1|1|583.20|1080.00|||3|
4102|ML|16|378.377.169||BLK|BLK|||||||8|1|1|583.20|1080.00|||3|
4103|ML|16|378.377.171||ART|ART|||||||8|1|1|583.20|1080.00|||3|
4104|ML|16|378.377.173||LIN|LIN|||||||8|1|1|583.20|1080.00|||3|
4105|ML|16|378.377.175||HAL|HAL|||||||8|1|1|583.20|1080.00|||3|
4106|ML|14|378.377.241||TBL|TBL|||||||8|1|1|432.00|800.00|||3|
4107|ML|14|378.377.242||TEA|TEA|||||||8|1|1|432.00|800.00|||3|
4108|ML|14|378.377.243||OAK|OAK|||||||8|1|1|432.00|800.00|||3|
4109|ML|14|378.377.244||JOP|JOP|||||||8|1|1|432.00|800.00|||3|
4110|ML|14|378.377.245||TBL|BCO|B||||||8|1|1|459.00|850.00|||3|
4111|ML|14|378.377.246||TBL|BCO|M||||||8|1|1|459.00|850.00|||3|
4112|ML|14|378.377.247||TBL|CCL|B||||||8|1|1|459.00|850.00|||3|
4113|ML|14|378.377.248||TBL|CCL|M||||||8|1|1|459.00|850.00|||3|
4114|ML|14|378.377.249||TBL|CME|B||||||8|1|1|459.00|850.00|||3|
4115|ML|14|378.377.250||TBL|CME|M||||||8|1|1|459.00|850.00|||3|
4116|ML|14|378.377.251||TBL|ANT|B||||||8|1|1|459.00|850.00|||3|
4117|ML|14|378.377.252||TBL|ANT|M||||||8|1|1|459.00|850.00|||3|
4118|ML|14|378.377.253||TBL|PTO|B||||||8|1|1|459.00|850.00|||3|
4119|ML|14|378.377.254||TBL|PTO|M||||||8|1|1|459.00|850.00|||3|
4120|ML|14|378.377.255||TBL|CRE|B||||||8|1|1|459.00|850.00|||3|
4121|ML|14|378.377.256||TBL|CRE|M||||||8|1|1|459.00|850.00|||3|
4122|ML|14|378.377.257||TBL|CAM|B||||||8|1|1|459.00|850.00|||3|
4123|ML|14|378.377.258||TBL|CAM|M||||||8|1|1|459.00|850.00|||3|
4124|ML|14|378.377.259||TBL|OUR|B||||||8|1|1|459.00|850.00|||3|
4125|ML|14|378.377.260||TBL|OUR|M||||||8|1|1|459.00|850.00|||3|
4126|ML|14|378.377.261||TBL|COB|B||||||8|1|1|459.00|850.00|||3|
4127|ML|14|378.377.262||TBL|COB|M||||||8|1|1|459.00|850.00|||3|
4128|ML|14|378.377.263||TBL|CHO|B||||||8|1|1|459.00|850.00|||3|
4129|ML|14|378.377.264||TBL|CHO|M||||||8|1|1|459.00|850.00|||3|
4130|ML|14|378.377.265||TBL|VAG|B||||||8|1|1|459.00|850.00|||3|
4131|ML|14|378.377.266||TBL|VAG|M||||||8|1|1|459.00|850.00|||3|
4132|ML|14|378.377.267||TBL|AZE|B||||||8|1|1|459.00|850.00|||3|
4133|ML|14|378.377.268||TBL|AZE|M||||||8|1|1|459.00|850.00|||3|
4134|ML|14|378.377.269||TBL|AMA|B||||||8|1|1|459.00|850.00|||3|
4135|ML|14|378.377.270||TBL|AMA|M||||||8|1|1|459.00|850.00|||3|
4136|ML|14|378.377.271||TBL|AES|B||||||8|1|1|459.00|850.00|||3|
4137|ML|14|378.377.272||TBL|AES|M||||||8|1|1|459.00|850.00|||3|
4138|ML|14|378.377.273||TBL|PRA|B||||||8|1|1|459.00|850.00|||3|
4139|ML|14|378.377.274||TBL|PRA|M||||||8|1|1|459.00|850.00|||3|
4140|ML|14|378.377.275||TBL|ROS|B||||||8|1|1|459.00|850.00|||3|
4141|ML|14|378.377.276||TBL|ROS|M||||||8|1|1|459.00|850.00|||3|
4142|ML|14|378.377.277||TBL|VER|B||||||8|1|1|459.00|850.00|||3|
4143|ML|14|378.377.278||TBL|VER|M||||||8|1|1|459.00|850.00|||3|
4144|ML|14|378.377.279||TBL|AZB|||||||8|1|1|459.00|850.00|||3|
4145|ML|14|378.377.280||TBL|DEN|||||||8|1|1|459.00|850.00|||3|
4146|ML|14|378.377.281||TBL|BLK|||||||8|1|1|459.00|850.00|||3|
4147|ML|14|378.377.282||TBL|ART|||||||8|1|1|459.00|850.00|||3|
4148|ML|14|378.377.283||TBL|LIN|||||||8|1|1|459.00|850.00|||3|
4149|ML|14|378.377.284||TBL|HAL|||||||8|1|1|459.00|850.00|||3|
4150|ML|14|378.377.285||BCO|BCO|B||||||8|1|1|480.60|890.00|||3|
4151|ML|14|378.377.286||BCO|BCO|M||||||8|1|1|480.60|890.00|||3|
4152|ML|14|378.377.287||CCL|CCL|B||||||8|1|1|480.60|890.00|||3|
4153|ML|14|378.377.288||CCL|CCL|M||||||8|1|1|480.60|890.00|||3|
4154|ML|14|378.377.289||CME|CME|B||||||8|1|1|480.60|890.00|||3|
4155|ML|14|378.377.290||CME|CME|M||||||8|1|1|480.60|890.00|||3|
4156|ML|14|378.377.291||ANT|ANT|B||||||8|1|1|480.60|890.00|||3|
4157|ML|14|378.377.292||ANT|ANT|M||||||8|1|1|480.60|890.00|||3|
4158|ML|14|378.377.293||PTO|PTO|B||||||8|1|1|480.60|890.00|||3|
4159|ML|14|378.377.294||PTO|PTO|M||||||8|1|1|480.60|890.00|||3|
4160|ML|14|378.377.295||CRE|CRE|B||||||8|1|1|480.60|890.00|||3|
4161|ML|14|378.377.296||CRE|CRE|M||||||8|1|1|480.60|890.00|||3|
4162|ML|14|378.377.297||CAM|CAM|B||||||8|1|1|480.60|890.00|||3|
4163|ML|14|378.377.298||CAM|CAM|M||||||8|1|1|480.60|890.00|||3|
4164|ML|14|378.377.299||OUR|OUR|B||||||8|1|1|480.60|890.00|||3|
4165|ML|14|378.377.300||OUR|OUR|M||||||8|1|1|480.60|890.00|||3|
4166|ML|14|378.377.301||COB|COB|B||||||8|1|1|480.60|890.00|||3|
4167|ML|14|378.377.302||COB|COB|M||||||8|1|1|480.60|890.00|||3|
4168|ML|14|378.377.303||CHO|CHO|B||||||8|1|1|480.60|890.00|||3|
4169|ML|14|378.377.304||CHO|CHO|M||||||8|1|1|480.60|890.00|||3|
4170|ML|14|378.377.305||VAG|VAG|B||||||8|1|1|480.60|890.00|||3|
4171|ML|14|378.377.306||VAG|VAG|M||||||8|1|1|480.60|890.00|||3|
4172|ML|14|378.377.307||AZE|AZE|B||||||8|1|1|480.60|890.00|||3|
4173|ML|14|378.377.308||AZE|AZE|M||||||8|1|1|480.60|890.00|||3|
4174|ML|14|378.377.309||AMA|AMA|B||||||8|1|1|480.60|890.00|||3|
4175|ML|14|378.377.310||AMA|AMA|M||||||8|1|1|480.60|890.00|||3|
4176|ML|14|378.377.311||AES|AES|B||||||8|1|1|480.60|890.00|||3|
4177|ML|14|378.377.312||AES|AES|M||||||8|1|1|480.60|890.00|||3|
4178|ML|14|378.377.313||PRA|PRA|B||||||8|1|1|480.60|890.00|||3|
4179|ML|14|378.377.314||PRA|PRA|M||||||8|1|1|480.60|890.00|||3|
4180|ML|14|378.377.315||ROS|ROS|B||||||8|1|1|480.60|890.00|||3|
4181|ML|14|378.377.316||ROS|ROS|M||||||8|1|1|480.60|890.00|||3|
4182|ML|14|378.377.317||VER|VER|B||||||8|1|1|480.60|890.00|||3|
4183|ML|14|378.377.318||VER|VER|M||||||8|1|1|480.60|890.00|||3|
4184|ML|14|378.377.319||AZB|AZB|||||||8|1|1|480.60|890.00|||3|
4185|ML|14|378.377.320||DEN|DEN|||||||8|1|1|480.60|890.00|||3|
4186|ML|14|378.377.321||BLK|BLK|||||||8|1|1|480.60|890.00|||3|
4187|ML|14|378.377.322||ART|ART|||||||8|1|1|480.60|890.00|||3|
4188|ML|14|378.377.323||LIN|LIN|||||||8|1|1|480.60|890.00|||3|
4189|ML|14|378.377.324||HAL|HAL|||||||8|1|1|480.60|890.00|||3|
4190|ML|14|379.377.241||TBL|TBL|||||||9|1|1|496.80|920.00|||3|
4191|ML|14|379.377.242||TEA|TEA|||||||9|1|1|496.80|920.00|||3|
4192|ML|14|379.377.243||OAK|OAK|||||||9|1|1|496.80|920.00|||3|
4193|ML|14|379.377.244||JOP|JOP|||||||9|1|1|496.80|920.00|||3|
4194|ML|14|379.377.245||TBL|BCO|B||||||9|1|1|523.80|970.00|||3|
4195|ML|14|379.377.246||TBL|BCO|M||||||9|1|1|523.80|970.00|||3|
4196|ML|14|379.377.247||TBL|CCL|B||||||9|1|1|523.80|970.00|||3|
4197|ML|14|379.377.248||TBL|CCL|M||||||9|1|1|523.80|970.00|||3|
4198|ML|14|379.377.249||TBL|CME|B||||||9|1|1|523.80|970.00|||3|
4199|ML|14|379.377.250||TBL|CME|M||||||9|1|1|523.80|970.00|||3|
4200|ML|14|379.377.251||TBL|ANT|B||||||9|1|1|523.80|970.00|||3|
4201|ML|14|379.377.252||TBL|ANT|M||||||9|1|1|523.80|970.00|||3|
4202|ML|14|379.377.253||TBL|PTO|B||||||9|1|1|523.80|970.00|||3|
4203|ML|14|379.377.254||TBL|PTO|M||||||9|1|1|523.80|970.00|||3|
4204|ML|14|379.377.255||TBL|CRE|B||||||9|1|1|523.80|970.00|||3|
4205|ML|14|379.377.256||TBL|CRE|M||||||9|1|1|523.80|970.00|||3|
4206|ML|14|379.377.257||TBL|CAM|B||||||9|1|1|523.80|970.00|||3|
4207|ML|14|379.377.258||TBL|CAM|M||||||9|1|1|523.80|970.00|||3|
4208|ML|14|379.377.259||TBL|OUR|B||||||9|1|1|523.80|970.00|||3|
4209|ML|14|379.377.260||TBL|OUR|M||||||9|1|1|523.80|970.00|||3|
4210|ML|14|379.377.261||TBL|COB|B||||||9|1|1|523.80|970.00|||3|
4211|ML|14|379.377.262||TBL|COB|M||||||9|1|1|523.80|970.00|||3|
4212|ML|14|379.377.263||TBL|CHO|B||||||9|1|1|523.80|970.00|||3|
4213|ML|14|379.377.264||TBL|CHO|M||||||9|1|1|523.80|970.00|||3|
4214|ML|14|379.377.265||TBL|VAG|B||||||9|1|1|523.80|970.00|||3|
4215|ML|14|379.377.266||TBL|VAG|M||||||9|1|1|523.80|970.00|||3|
4216|ML|14|379.377.267||TBL|AZE|B||||||9|1|1|523.80|970.00|||3|
4217|ML|14|379.377.268||TBL|AZE|M||||||9|1|1|523.80|970.00|||3|
4218|ML|14|379.377.269||TBL|AMA|B||||||9|1|1|523.80|970.00|||3|
4219|ML|14|379.377.270||TBL|AMA|M||||||9|1|1|523.80|970.00|||3|
4220|ML|14|379.377.271||TBL|AES|B||||||9|1|1|523.80|970.00|||3|
4221|ML|14|379.377.272||TBL|AES|M||||||9|1|1|523.80|970.00|||3|
4222|ML|14|379.377.273||TBL|PRA|B||||||9|1|1|523.80|970.00|||3|
4223|ML|14|379.377.274||TBL|PRA|M||||||9|1|1|523.80|970.00|||3|
4224|ML|14|379.377.275||TBL|ROS|B||||||9|1|1|523.80|970.00|||3|
4225|ML|14|379.377.276||TBL|ROS|M||||||9|1|1|523.80|970.00|||3|
4226|ML|14|379.377.277||TBL|VER|B||||||9|1|1|523.80|970.00|||3|
4227|ML|14|379.377.278||TBL|VER|M||||||9|1|1|523.80|970.00|||3|
4228|ML|14|379.377.279||TBL|AZB|||||||9|1|1|523.80|970.00|||3|
4229|ML|14|379.377.280||TBL|DEN|||||||9|1|1|523.80|970.00|||3|
4230|ML|14|379.377.281||TBL|BLK|||||||9|1|1|523.80|970.00|||3|
4231|ML|14|379.377.282||TBL|ART|||||||9|1|1|523.80|970.00|||3|
4232|ML|14|379.377.283||TBL|LIN|||||||9|1|1|523.80|970.00|||3|
4233|ML|14|379.377.284||TBL|HAL|||||||9|1|1|523.80|970.00|||3|
4234|ML|14|379.377.285||BCO|BCO|B||||||9|1|1|545.40|1010.00|||3|
4235|ML|14|379.377.286||BCO|BCO|M||||||9|1|1|545.40|1010.00|||3|
4236|ML|14|379.377.287||CCL|CCL|B||||||9|1|1|545.40|1010.00|||3|
4237|ML|14|379.377.288||CCL|CCL|M||||||9|1|1|545.40|1010.00|||3|
4238|ML|14|379.377.289||CME|CME|B||||||9|1|1|545.40|1010.00|||3|
4239|ML|14|379.377.290||CME|CME|M||||||9|1|1|545.40|1010.00|||3|
4240|ML|14|379.377.291||ANT|ANT|B||||||9|1|1|545.40|1010.00|||3|
4241|ML|14|379.377.292||ANT|ANT|M||||||9|1|1|545.40|1010.00|||3|
4242|ML|14|379.377.293||PTO|PTO|B||||||9|1|1|545.40|1010.00|||3|
4243|ML|14|379.377.294||PTO|PTO|M||||||9|1|1|545.40|1010.00|||3|
4244|ML|14|379.377.295||CRE|CRE|B||||||9|1|1|545.40|1010.00|||3|
4245|ML|14|379.377.296||CRE|CRE|M||||||9|1|1|545.40|1010.00|||3|
4246|ML|14|379.377.297||CAM|CAM|B||||||9|1|1|545.40|1010.00|||3|
4247|ML|14|379.377.298||CAM|CAM|M||||||9|1|1|545.40|1010.00|||3|
4248|ML|14|379.377.299||OUR|OUR|B||||||9|1|1|545.40|1010.00|||3|
4249|ML|14|379.377.300||OUR|OUR|M||||||9|1|1|545.40|1010.00|||3|
4250|ML|14|379.377.301||COB|COB|B||||||9|1|1|545.40|1010.00|||3|
4251|ML|14|379.377.302||COB|COB|M||||||9|1|1|545.40|1010.00|||3|
4252|ML|14|379.377.303||CHO|CHO|B||||||9|1|1|545.40|1010.00|||3|
4253|ML|14|379.377.304||CHO|CHO|M||||||9|1|1|545.40|1010.00|||3|
4254|ML|14|379.377.305||VAG|VAG|B||||||9|1|1|545.40|1010.00|||3|
4255|ML|14|379.377.306||VAG|VAG|M||||||9|1|1|545.40|1010.00|||3|
4256|ML|14|379.377.307||AZE|AZE|B||||||9|1|1|545.40|1010.00|||3|
4257|ML|14|379.377.308||AZE|AZE|M||||||9|1|1|545.40|1010.00|||3|
4258|ML|14|379.377.309||AMA|AMA|B||||||9|1|1|545.40|1010.00|||3|
4259|ML|14|379.377.310||AMA|AMA|M||||||9|1|1|545.40|1010.00|||3|
4260|ML|14|379.377.311||AES|AES|B||||||9|1|1|545.40|1010.00|||3|
4261|ML|14|379.377.312||AES|AES|M||||||9|1|1|545.40|1010.00|||3|
4262|ML|14|379.377.313||PRA|PRA|B||||||9|1|1|545.40|1010.00|||3|
4263|ML|14|379.377.314||PRA|PRA|M||||||9|1|1|545.40|1010.00|||3|
4264|ML|14|379.377.315||ROS|ROS|B||||||9|1|1|545.40|1010.00|||3|
4265|ML|14|379.377.316||ROS|ROS|M||||||9|1|1|545.40|1010.00|||3|
4266|ML|14|379.377.317||VER|VER|B||||||9|1|1|545.40|1010.00|||3|
4267|ML|14|379.377.318||VER|VER|M||||||9|1|1|545.40|1010.00|||3|
4268|ML|14|379.377.319||AZB|AZB|||||||9|1|1|545.40|1010.00|||3|
4269|ML|14|379.377.320||DEN|DEN|||||||9|1|1|545.40|1010.00|||3|
4270|ML|14|379.377.321||BLK|BLK|||||||9|1|1|545.40|1010.00|||3|
4271|ML|14|379.377.322||ART|ART|||||||9|1|1|545.40|1010.00|||3|
4272|ML|14|379.377.323||LIN|LIN|||||||9|1|1|545.40|1010.00|||3|
4273|ML|14|379.377.324||HAL|HAL|||||||9|1|1|545.40|1010.00|||3|
4274|ML|14|380.377.241||TBL|TBL|||||||10|1|1|583.20|1080.00|||3|
4275|ML|14|380.377.242||TEA|TEA|||||||10|1|1|583.20|1080.00|||3|
4276|ML|14|380.377.243||OAK|OAK|||||||10|1|1|583.20|1080.00|||3|
4277|ML|14|380.377.244||JOP|JOP|||||||10|1|1|583.20|1080.00|||3|
4278|ML|14|380.377.245||TBL|BCO|B||||||10|1|1|610.20|1130.00|||3|
4279|ML|14|380.377.246||TBL|BCO|M||||||10|1|1|610.20|1130.00|||3|
4280|ML|14|380.377.247||TBL|CCL|B||||||10|1|1|610.20|1130.00|||3|
4281|ML|14|380.377.248||TBL|CCL|M||||||10|1|1|610.20|1130.00|||3|
4282|ML|14|380.377.249||TBL|CME|B||||||10|1|1|610.20|1130.00|||3|
4283|ML|14|380.377.250||TBL|CME|M||||||10|1|1|610.20|1130.00|||3|
4284|ML|14|380.377.251||TBL|ANT|B||||||10|1|1|610.20|1130.00|||3|
4285|ML|14|380.377.252||TBL|ANT|M||||||10|1|1|610.20|1130.00|||3|
4286|ML|14|380.377.253||TBL|PTO|B||||||10|1|1|610.20|1130.00|||3|
4287|ML|14|380.377.254||TBL|PTO|M||||||10|1|1|610.20|1130.00|||3|
4288|ML|14|380.377.255||TBL|CRE|B||||||10|1|1|610.20|1130.00|||3|
4289|ML|14|380.377.256||TBL|CRE|M||||||10|1|1|610.20|1130.00|||3|
4290|ML|14|380.377.257||TBL|CAM|B||||||10|1|1|610.20|1130.00|||3|
4291|ML|14|380.377.258||TBL|CAM|M||||||10|1|1|610.20|1130.00|||3|
4292|ML|14|380.377.259||TBL|OUR|B||||||10|1|1|610.20|1130.00|||3|
4293|ML|14|380.377.260||TBL|OUR|M||||||10|1|1|610.20|1130.00|||3|
4294|ML|14|380.377.261||TBL|COB|B||||||10|1|1|610.20|1130.00|||3|
4295|ML|14|380.377.262||TBL|COB|M||||||10|1|1|610.20|1130.00|||3|
4296|ML|14|380.377.263||TBL|CHO|B||||||10|1|1|610.20|1130.00|||3|
4297|ML|14|380.377.264||TBL|CHO|M||||||10|1|1|610.20|1130.00|||3|
4298|ML|14|380.377.265||TBL|VAG|B||||||10|1|1|610.20|1130.00|||3|
4299|ML|14|380.377.266||TBL|VAG|M||||||10|1|1|610.20|1130.00|||3|
4300|ML|14|380.377.267||TBL|AZE|B||||||10|1|1|610.20|1130.00|||3|
4301|ML|14|380.377.268||TBL|AZE|M||||||10|1|1|610.20|1130.00|||3|
4302|ML|14|380.377.269||TBL|AMA|B||||||10|1|1|610.20|1130.00|||3|
4303|ML|14|380.377.270||TBL|AMA|M||||||10|1|1|610.20|1130.00|||3|
4304|ML|14|380.377.271||TBL|AES|B||||||10|1|1|610.20|1130.00|||3|
4305|ML|14|380.377.272||TBL|AES|M||||||10|1|1|610.20|1130.00|||3|
4306|ML|14|380.377.273||TBL|PRA|B||||||10|1|1|610.20|1130.00|||3|
4307|ML|14|380.377.274||TBL|PRA|M||||||10|1|1|610.20|1130.00|||3|
4308|ML|14|380.377.275||TBL|ROS|B||||||10|1|1|610.20|1130.00|||3|
4309|ML|14|380.377.276||TBL|ROS|M||||||10|1|1|610.20|1130.00|||3|
4310|ML|14|380.377.277||TBL|VER|B||||||10|1|1|610.20|1130.00|||3|
4311|ML|14|380.377.278||TBL|VER|M||||||10|1|1|610.20|1130.00|||3|
4312|ML|14|380.377.279||TBL|AZB|||||||10|1|1|610.20|1130.00|||3|
4313|ML|14|380.377.280||TBL|DEN|||||||10|1|1|610.20|1130.00|||3|
4314|ML|14|380.377.281||TBL|BLK|||||||10|1|1|610.20|1130.00|||3|
4315|ML|14|380.377.282||TBL|ART|||||||10|1|1|610.20|1130.00|||3|
4316|ML|14|380.377.283||TBL|LIN|||||||10|1|1|610.20|1130.00|||3|
4317|ML|14|380.377.284||TBL|HAL|||||||10|1|1|610.20|1130.00|||3|
4318|ML|14|380.377.285||BCO|BCO|B||||||10|1|1|631.80|1170.00|||3|
4319|ML|14|380.377.286||BCO|BCO|M||||||10|1|1|631.80|1170.00|||3|
4320|ML|14|380.377.287||CCL|CCL|B||||||10|1|1|631.80|1170.00|||3|
4321|ML|14|380.377.288||CCL|CCL|M||||||10|1|1|631.80|1170.00|||3|
4322|ML|14|380.377.289||CME|CME|B||||||10|1|1|631.80|1170.00|||3|
4323|ML|14|380.377.290||CME|CME|M||||||10|1|1|631.80|1170.00|||3|
4324|ML|14|380.377.291||ANT|ANT|B||||||10|1|1|631.80|1170.00|||3|
4325|ML|14|380.377.292||ANT|ANT|M||||||10|1|1|631.80|1170.00|||3|
4326|ML|14|380.377.293||PTO|PTO|B||||||10|1|1|631.80|1170.00|||3|
4327|ML|14|380.377.294||PTO|PTO|M||||||10|1|1|631.80|1170.00|||3|
4328|ML|14|380.377.295||CRE|CRE|B||||||10|1|1|631.80|1170.00|||3|
4329|ML|14|380.377.296||CRE|CRE|M||||||10|1|1|631.80|1170.00|||3|
4330|ML|14|380.377.297||CAM|CAM|B||||||10|1|1|631.80|1170.00|||3|
4331|ML|14|380.377.298||CAM|CAM|M||||||10|1|1|631.80|1170.00|||3|
4332|ML|14|380.377.299||OUR|OUR|B||||||10|1|1|631.80|1170.00|||3|
4333|ML|14|380.377.300||OUR|OUR|M||||||10|1|1|631.80|1170.00|||3|
4334|ML|14|380.377.301||COB|COB|B||||||10|1|1|631.80|1170.00|||3|
4335|ML|14|380.377.302||COB|COB|M||||||10|1|1|631.80|1170.00|||3|
4336|ML|14|380.377.303||CHO|CHO|B||||||10|1|1|631.80|1170.00|||3|
4337|ML|14|380.377.304||CHO|CHO|M||||||10|1|1|631.80|1170.00|||3|
4338|ML|14|380.377.305||VAG|VAG|B||||||10|1|1|631.80|1170.00|||3|
4339|ML|14|380.377.306||VAG|VAG|M||||||10|1|1|631.80|1170.00|||3|
4340|ML|14|380.377.307||AZE|AZE|B||||||10|1|1|631.80|1170.00|||3|
4341|ML|14|380.377.308||AZE|AZE|M||||||10|1|1|631.80|1170.00|||3|
4342|ML|14|380.377.309||AMA|AMA|B||||||10|1|1|631.80|1170.00|||3|
4343|ML|14|380.377.310||AMA|AMA|M||||||10|1|1|631.80|1170.00|||3|
4344|ML|14|380.377.311||AES|AES|B||||||10|1|1|631.80|1170.00|||3|
4345|ML|14|380.377.312||AES|AES|M||||||10|1|1|631.80|1170.00|||3|
4346|ML|14|380.377.313||PRA|PRA|B||||||10|1|1|631.80|1170.00|||3|
4347|ML|14|380.377.314||PRA|PRA|M||||||10|1|1|631.80|1170.00|||3|
4348|ML|14|380.377.315||ROS|ROS|B||||||10|1|1|631.80|1170.00|||3|
4349|ML|14|380.377.316||ROS|ROS|M||||||10|1|1|631.80|1170.00|||3|
4350|ML|14|380.377.317||VER|VER|B||||||10|1|1|631.80|1170.00|||3|
4351|ML|14|380.377.318||VER|VER|M||||||10|1|1|631.80|1170.00|||3|
4352|ML|14|380.377.319||AZB|AZB|||||||10|1|1|631.80|1170.00|||3|
4353|ML|14|380.377.320||DEN|DEN|||||||10|1|1|631.80|1170.00|||3|
4354|ML|14|380.377.321||BLK|BLK|||||||10|1|1|631.80|1170.00|||3|
4355|ML|14|380.377.322||ART|ART|||||||10|1|1|631.80|1170.00|||3|
4356|ML|14|380.377.323||LIN|LIN|||||||10|1|1|631.80|1170.00|||3|
4357|ML|14|380.377.324||HAL|HAL|||||||10|1|1|631.80|1170.00|||3|
4358|ML|17|381.382.197||TBL|TBL|||||||11|1|1|151.20|280.00|||3|
4359|ML|17|381.382.198||TEA|TEA|||||||11|1|1|151.20|280.00|||3|
4360|ML|17|381.382.199||OAK|OAK|||||||11|1|1|151.20|280.00|||3|
4361|ML|17|381.382.200||JOP|JOP|||||||11|1|1|151.20|280.00|||3|
4362|ML|17|381.382.201||TBL|BCO|B||||||11|1|1|178.20|330.00|||3|
4363|ML|17|381.382.202||TBL|BCO|M||||||11|1|1|178.20|330.00|||3|
4364|ML|17|381.382.203||TBL|CCL|B||||||11|1|1|178.20|330.00|||3|
4365|ML|17|381.382.204||TBL|CCL|M||||||11|1|1|178.20|330.00|||3|
4366|ML|17|381.382.205||TBL|CME|B||||||11|1|1|178.20|330.00|||3|
4367|ML|17|381.382.206||TBL|CME|M||||||11|1|1|178.20|330.00|||3|
4368|ML|17|381.382.207||TBL|ANT|B||||||11|1|1|178.20|330.00|||3|
4369|ML|17|381.382.208||TBL|ANT|M||||||11|1|1|178.20|330.00|||3|
4370|ML|17|381.382.209||TBL|PTO|B||||||11|1|1|178.20|330.00|||3|
4371|ML|17|381.382.210||TBL|PTO|M||||||11|1|1|178.20|330.00|||3|
4372|ML|17|381.382.211||TBL|CRE|B||||||11|1|1|178.20|330.00|||3|
4373|ML|17|381.382.212||TBL|CRE|M||||||11|1|1|178.20|330.00|||3|
4374|ML|17|381.382.213||TBL|CAM|B||||||11|1|1|178.20|330.00|||3|
4375|ML|17|381.382.214||TBL|CAM|M||||||11|1|1|178.20|330.00|||3|
4376|ML|17|381.382.215||TBL|OUR|B||||||11|1|1|178.20|330.00|||3|
4377|ML|17|381.382.216||TBL|OUR|M||||||11|1|1|178.20|330.00|||3|
4378|ML|17|381.382.217||TBL|COB|B||||||11|1|1|178.20|330.00|||3|
4379|ML|17|381.382.218||TBL|COB|M||||||11|1|1|178.20|330.00|||3|
4380|ML|17|381.382.219||TBL|CHO|B||||||11|1|1|178.20|330.00|||3|
4381|ML|17|381.382.220||TBL|CHO|M||||||11|1|1|178.20|330.00|||3|
4382|ML|17|381.382.221||TBL|VAG|B||||||11|1|1|178.20|330.00|||3|
4383|ML|17|381.382.222||TBL|VAG|M||||||11|1|1|178.20|330.00|||3|
4384|ML|17|381.382.223||TBL|AZE|B||||||11|1|1|178.20|330.00|||3|
4385|ML|17|381.382.224||TBL|AZE|M||||||11|1|1|178.20|330.00|||3|
4386|ML|17|381.382.225||TBL|AMA|B||||||11|1|1|178.20|330.00|||3|
4387|ML|17|381.382.226||TBL|AMA|M||||||11|1|1|178.20|330.00|||3|
4388|ML|17|381.382.227||TBL|AES|B||||||11|1|1|178.20|330.00|||3|
4389|ML|17|381.382.228||TBL|AES|M||||||11|1|1|178.20|330.00|||3|
4390|ML|17|381.382.229||TBL|PRA|B||||||11|1|1|178.20|330.00|||3|
4391|ML|17|381.382.230||TBL|PRA|M||||||11|1|1|178.20|330.00|||3|
4392|ML|17|381.382.231||TBL|ROS|B||||||11|1|1|178.20|330.00|||3|
4393|ML|17|381.382.232||TBL|ROS|M||||||11|1|1|178.20|330.00|||3|
4394|ML|17|381.382.233||TBL|VER|B||||||11|1|1|178.20|330.00|||3|
4395|ML|17|381.382.234||TBL|VER|M||||||11|1|1|178.20|330.00|||3|
4396|ML|17|381.382.235||TBL|AZB|||||||11|1|1|178.20|330.00|||3|
4397|ML|17|381.382.236||TBL|DEN|||||||11|1|1|178.20|330.00|||3|
4398|ML|17|381.382.237||TBL|BLK|||||||11|1|1|178.20|330.00|||3|
4399|ML|17|381.382.238||TBL|ART|||||||11|1|1|178.20|330.00|||3|
4400|ML|17|381.382.239||TBL|LIN|||||||11|1|1|178.20|330.00|||3|
4401|ML|17|381.382.240||TBL|HAL|||||||11|1|1|178.20|330.00|||3|
4402|ML|17|381.382.91||BCO|BCO|B||||||11|1|1|199.80|370.00|||3|
4403|ML|17|381.382.93||BCO|BCO|M||||||11|1|1|199.80|370.00|||3|
4404|ML|17|381.382.95||CCL|CCL|B||||||11|1|1|199.80|370.00|||3|
4405|ML|17|381.382.97||CCL|CCL|M||||||11|1|1|199.80|370.00|||3|
4406|ML|17|381.382.99||CME|CME|B||||||11|1|1|199.80|370.00|||3|
4407|ML|17|381.382.101||CME|CME|M||||||11|1|1|199.80|370.00|||3|
4408|ML|17|381.382.103||ANT|ANT|B||||||11|1|1|199.80|370.00|||3|
4409|ML|17|381.382.105||ANT|ANT|M||||||11|1|1|199.80|370.00|||3|
4410|ML|17|381.382.107||PTO|PTO|B||||||11|1|1|199.80|370.00|||3|
4411|ML|17|381.382.109||PTO|PTO|M||||||11|1|1|199.80|370.00|||3|
4412|ML|17|381.382.111||CRE|CRE|B||||||11|1|1|199.80|370.00|||3|
4413|ML|17|381.382.113||CRE|CRE|M||||||11|1|1|199.80|370.00|||3|
4414|ML|17|381.382.115||CAM|CAM|B||||||11|1|1|199.80|370.00|||3|
4415|ML|17|381.382.117||CAM|CAM|M||||||11|1|1|199.80|370.00|||3|
4416|ML|17|381.382.119||OUR|OUR|B||||||11|1|1|199.80|370.00|||3|
4417|ML|17|381.382.121||OUR|OUR|M||||||11|1|1|199.80|370.00|||3|
4418|ML|17|381.382.123||COB|COB|B||||||11|1|1|199.80|370.00|||3|
4419|ML|17|381.382.125||COB|COB|M||||||11|1|1|199.80|370.00|||3|
4420|ML|17|381.382.127||CHO|CHO|B||||||11|1|1|199.80|370.00|||3|
4421|ML|17|381.382.129||CHO|CHO|M||||||11|1|1|199.80|370.00|||3|
4422|ML|17|381.382.131||VAG|VAG|B||||||11|1|1|199.80|370.00|||3|
4423|ML|17|381.382.133||VAG|VAG|M||||||11|1|1|199.80|370.00|||3|
4424|ML|17|381.382.135||AZE|AZE|B||||||11|1|1|199.80|370.00|||3|
4425|ML|17|381.382.137||AZE|AZE|M||||||11|1|1|199.80|370.00|||3|
4426|ML|17|381.382.139||AMA|AMA|B||||||11|1|1|199.80|370.00|||3|
4427|ML|17|381.382.141||AMA|AMA|M||||||11|1|1|199.80|370.00|||3|
4428|ML|17|381.382.143||AES|AES|B||||||11|1|1|199.80|370.00|||3|
4429|ML|17|381.382.145||AES|AES|M||||||11|1|1|199.80|370.00|||3|
4430|ML|17|381.382.147||PRA|PRA|B||||||11|1|1|199.80|370.00|||3|
4431|ML|17|381.382.149||PRA|PRA|M||||||11|1|1|199.80|370.00|||3|
4432|ML|17|381.382.151||ROS|ROS|B||||||11|1|1|199.80|370.00|||3|
4433|ML|17|381.382.153||ROS|ROS|M||||||11|1|1|199.80|370.00|||3|
4434|ML|17|381.382.155||VER|VER|B||||||11|1|1|199.80|370.00|||3|
4435|ML|17|381.382.157||VER|VER|M||||||11|1|1|199.80|370.00|||3|
4436|ML|17|381.382.165||AZB|AZB|||||||11|1|1|199.80|370.00|||3|
4437|ML|17|381.382.167||DEN|DEN|||||||11|1|1|199.80|370.00|||3|
4438|ML|17|381.382.169||BLK|BLK|||||||11|1|1|199.80|370.00|||3|
4439|ML|17|381.382.171||ART|ART|||||||11|1|1|199.80|370.00|||3|
4440|ML|17|381.382.173||LIN|LIN|||||||11|1|1|199.80|370.00|||3|
4441|ML|17|381.382.175||HAL|HAL|||||||11|1|1|199.80|370.00|||3|
4442|ML|17|383.382.197||TBL|TBL|||||||12|1|1|156.60|290.00|||3|
4443|ML|17|383.382.198||TEA|TEA|||||||12|1|1|156.60|290.00|||3|
4444|ML|17|383.382.199||OAK|OAK|||||||12|1|1|156.60|290.00|||3|
4445|ML|17|383.382.200||JOP|JOP|||||||12|1|1|156.60|290.00|||3|
4446|ML|17|383.382.201||TBL|BCO|B||||||12|1|1|183.60|340.00|||3|
4447|ML|17|383.382.202||TBL|BCO|M||||||12|1|1|183.60|340.00|||3|
4448|ML|17|383.382.203||TBL|CCL|B||||||12|1|1|183.60|340.00|||3|
4449|ML|17|383.382.204||TBL|CCL|M||||||12|1|1|183.60|340.00|||3|
4450|ML|17|383.382.205||TBL|CME|B||||||12|1|1|183.60|340.00|||3|
4451|ML|17|383.382.206||TBL|CME|M||||||12|1|1|183.60|340.00|||3|
4452|ML|17|383.382.207||TBL|ANT|B||||||12|1|1|183.60|340.00|||3|
4453|ML|17|383.382.208||TBL|ANT|M||||||12|1|1|183.60|340.00|||3|
4454|ML|17|383.382.209||TBL|PTO|B||||||12|1|1|183.60|340.00|||3|
4455|ML|17|383.382.210||TBL|PTO|M||||||12|1|1|183.60|340.00|||3|
4456|ML|17|383.382.211||TBL|CRE|B||||||12|1|1|183.60|340.00|||3|
4457|ML|17|383.382.212||TBL|CRE|M||||||12|1|1|183.60|340.00|||3|
4458|ML|17|383.382.213||TBL|CAM|B||||||12|1|1|183.60|340.00|||3|
4459|ML|17|383.382.214||TBL|CAM|M||||||12|1|1|183.60|340.00|||3|
4460|ML|17|383.382.215||TBL|OUR|B||||||12|1|1|183.60|340.00|||3|
4461|ML|17|383.382.216||TBL|OUR|M||||||12|1|1|183.60|340.00|||3|
4462|ML|17|383.382.217||TBL|COB|B||||||12|1|1|183.60|340.00|||3|
4463|ML|17|383.382.218||TBL|COB|M||||||12|1|1|183.60|340.00|||3|
4464|ML|17|383.382.219||TBL|CHO|B||||||12|1|1|183.60|340.00|||3|
4465|ML|17|383.382.220||TBL|CHO|M||||||12|1|1|183.60|340.00|||3|
4466|ML|17|383.382.221||TBL|VAG|B||||||12|1|1|183.60|340.00|||3|
4467|ML|17|383.382.222||TBL|VAG|M||||||12|1|1|183.60|340.00|||3|
4468|ML|17|383.382.223||TBL|AZE|B||||||12|1|1|183.60|340.00|||3|
4469|ML|17|383.382.224||TBL|AZE|M||||||12|1|1|183.60|340.00|||3|
4470|ML|17|383.382.225||TBL|AMA|B||||||12|1|1|183.60|340.00|||3|
4471|ML|17|383.382.226||TBL|AMA|M||||||12|1|1|183.60|340.00|||3|
4472|ML|17|383.382.227||TBL|AES|B||||||12|1|1|183.60|340.00|||3|
4473|ML|17|383.382.228||TBL|AES|M||||||12|1|1|183.60|340.00|||3|
4474|ML|17|383.382.229||TBL|PRA|B||||||12|1|1|183.60|340.00|||3|
4475|ML|17|383.382.230||TBL|PRA|M||||||12|1|1|183.60|340.00|||3|
4476|ML|17|383.382.231||TBL|ROS|B||||||12|1|1|183.60|340.00|||3|
4477|ML|17|383.382.232||TBL|ROS|M||||||12|1|1|183.60|340.00|||3|
4478|ML|17|383.382.233||TBL|VER|B||||||12|1|1|183.60|340.00|||3|
4479|ML|17|383.382.234||TBL|VER|M||||||12|1|1|183.60|340.00|||3|
4480|ML|17|383.382.235||TBL|AZB|||||||12|1|1|183.60|340.00|||3|
4481|ML|17|383.382.236||TBL|DEN|||||||12|1|1|183.60|340.00|||3|
4482|ML|17|383.382.237||TBL|BLK|||||||12|1|1|183.60|340.00|||3|
4483|ML|17|383.382.238||TBL|ART|||||||12|1|1|183.60|340.00|||3|
4484|ML|17|383.382.239||TBL|LIN|||||||12|1|1|183.60|340.00|||3|
4485|ML|17|383.382.240||TBL|HAL|||||||12|1|1|183.60|340.00|||3|
4486|ML|17|383.382.91||BCO|BCO|B||||||12|1|1|205.20|380.00|||3|
4487|ML|17|383.382.93||BCO|BCO|M||||||12|1|1|205.20|380.00|||3|
4488|ML|17|383.382.95||CCL|CCL|B||||||12|1|1|205.20|380.00|||3|
4489|ML|17|383.382.97||CCL|CCL|M||||||12|1|1|205.20|380.00|||3|
4490|ML|17|383.382.99||CME|CME|B||||||12|1|1|205.20|380.00|||3|
4491|ML|17|383.382.101||CME|CME|M||||||12|1|1|205.20|380.00|||3|
4492|ML|17|383.382.103||ANT|ANT|B||||||12|1|1|205.20|380.00|||3|
4493|ML|17|383.382.105||ANT|ANT|M||||||12|1|1|205.20|380.00|||3|
4494|ML|17|383.382.107||PTO|PTO|B||||||12|1|1|205.20|380.00|||3|
4495|ML|17|383.382.109||PTO|PTO|M||||||12|1|1|205.20|380.00|||3|
4496|ML|17|383.382.111||CRE|CRE|B||||||12|1|1|205.20|380.00|||3|
4497|ML|17|383.382.113||CRE|CRE|M||||||12|1|1|205.20|380.00|||3|
4498|ML|17|383.382.115||CAM|CAM|B||||||12|1|1|205.20|380.00|||3|
4499|ML|17|383.382.117||CAM|CAM|M||||||12|1|1|205.20|380.00|||3|
4500|ML|17|383.382.119||OUR|OUR|B||||||12|1|1|205.20|380.00|||3|
4501|ML|17|383.382.121||OUR|OUR|M||||||12|1|1|205.20|380.00|||3|
4502|ML|17|383.382.123||COB|COB|B||||||12|1|1|205.20|380.00|||3|
4503|ML|17|383.382.125||COB|COB|M||||||12|1|1|205.20|380.00|||3|
4504|ML|17|383.382.127||CHO|CHO|B||||||12|1|1|205.20|380.00|||3|
4505|ML|17|383.382.129||CHO|CHO|M||||||12|1|1|205.20|380.00|||3|
4506|ML|17|383.382.131||VAG|VAG|B||||||12|1|1|205.20|380.00|||3|
4507|ML|17|383.382.133||VAG|VAG|M||||||12|1|1|205.20|380.00|||3|
4508|ML|17|383.382.135||AZE|AZE|B||||||12|1|1|205.20|380.00|||3|
4509|ML|17|383.382.137||AZE|AZE|M||||||12|1|1|205.20|380.00|||3|
4510|ML|17|383.382.139||AMA|AMA|B||||||12|1|1|205.20|380.00|||3|
4511|ML|17|383.382.141||AMA|AMA|M||||||12|1|1|205.20|380.00|||3|
4512|ML|17|383.382.143||AES|AES|B||||||12|1|1|205.20|380.00|||3|
4513|ML|17|383.382.145||AES|AES|M||||||12|1|1|205.20|380.00|||3|
4514|ML|17|383.382.147||PRA|PRA|B||||||12|1|1|205.20|380.00|||3|
4515|ML|17|383.382.149||PRA|PRA|M||||||12|1|1|205.20|380.00|||3|
4516|ML|17|383.382.151||ROS|ROS|B||||||12|1|1|205.20|380.00|||3|
4517|ML|17|383.382.153||ROS|ROS|M||||||12|1|1|205.20|380.00|||3|
4518|ML|17|383.382.155||VER|VER|B||||||12|1|1|205.20|380.00|||3|
4519|ML|17|383.382.157||VER|VER|M||||||12|1|1|205.20|380.00|||3|
4520|ML|17|383.382.165||AZB|AZB|||||||12|1|1|205.20|380.00|||3|
4521|ML|17|383.382.167||DEN|DEN|||||||12|1|1|205.20|380.00|||3|
4522|ML|17|383.382.169||BLK|BLK|||||||12|1|1|205.20|380.00|||3|
4523|ML|17|383.382.171||ART|ART|||||||12|1|1|205.20|380.00|||3|
4524|ML|17|383.382.173||LIN|LIN|||||||12|1|1|205.20|380.00|||3|
4525|ML|17|383.382.175||HAL|HAL|||||||12|1|1|205.20|380.00|||3|
4526|ML|17|384.382.197||TBL|TBL|||||||13|1|1|199.80|370.00|||3|
4527|ML|17|384.382.198||TEA|TEA|||||||13|1|1|199.80|370.00|||3|
4528|ML|17|384.382.199||OAK|OAK|||||||13|1|1|199.80|370.00|||3|
4529|ML|17|384.382.200||JOP|JOP|||||||13|1|1|199.80|370.00|||3|
4530|ML|17|384.382.201||TBL|BCO|B||||||13|1|1|226.80|420.00|||3|
4531|ML|17|384.382.202||TBL|BCO|M||||||13|1|1|226.80|420.00|||3|
4532|ML|17|384.382.203||TBL|CCL|B||||||13|1|1|226.80|420.00|||3|
4533|ML|17|384.382.204||TBL|CCL|M||||||13|1|1|226.80|420.00|||3|
4534|ML|17|384.382.205||TBL|CME|B||||||13|1|1|226.80|420.00|||3|
4535|ML|17|384.382.206||TBL|CME|M||||||13|1|1|226.80|420.00|||3|
4536|ML|17|384.382.207||TBL|ANT|B||||||13|1|1|226.80|420.00|||3|
4537|ML|17|384.382.208||TBL|ANT|M||||||13|1|1|226.80|420.00|||3|
4538|ML|17|384.382.209||TBL|PTO|B||||||13|1|1|226.80|420.00|||3|
4539|ML|17|384.382.210||TBL|PTO|M||||||13|1|1|226.80|420.00|||3|
4540|ML|17|384.382.211||TBL|CRE|B||||||13|1|1|226.80|420.00|||3|
4541|ML|17|384.382.212||TBL|CRE|M||||||13|1|1|226.80|420.00|||3|
4542|ML|17|384.382.213||TBL|CAM|B||||||13|1|1|226.80|420.00|||3|
4543|ML|17|384.382.214||TBL|CAM|M||||||13|1|1|226.80|420.00|||3|
4544|ML|17|384.382.215||TBL|OUR|B||||||13|1|1|226.80|420.00|||3|
4545|ML|17|384.382.216||TBL|OUR|M||||||13|1|1|226.80|420.00|||3|
4546|ML|17|384.382.217||TBL|COB|B||||||13|1|1|226.80|420.00|||3|
4547|ML|17|384.382.218||TBL|COB|M||||||13|1|1|226.80|420.00|||3|
4548|ML|17|384.382.219||TBL|CHO|B||||||13|1|1|226.80|420.00|||3|
4549|ML|17|384.382.220||TBL|CHO|M||||||13|1|1|226.80|420.00|||3|
4550|ML|17|384.382.221||TBL|VAG|B||||||13|1|1|226.80|420.00|||3|
4551|ML|17|384.382.222||TBL|VAG|M||||||13|1|1|226.80|420.00|||3|
4552|ML|17|384.382.223||TBL|AZE|B||||||13|1|1|226.80|420.00|||3|
4553|ML|17|384.382.224||TBL|AZE|M||||||13|1|1|226.80|420.00|||3|
4554|ML|17|384.382.225||TBL|AMA|B||||||13|1|1|226.80|420.00|||3|
4555|ML|17|384.382.226||TBL|AMA|M||||||13|1|1|226.80|420.00|||3|
4556|ML|17|384.382.227||TBL|AES|B||||||13|1|1|226.80|420.00|||3|
4557|ML|17|384.382.228||TBL|AES|M||||||13|1|1|226.80|420.00|||3|
4558|ML|17|384.382.229||TBL|PRA|B||||||13|1|1|226.80|420.00|||3|
4559|ML|17|384.382.230||TBL|PRA|M||||||13|1|1|226.80|420.00|||3|
4560|ML|17|384.382.231||TBL|ROS|B||||||13|1|1|226.80|420.00|||3|
4561|ML|17|384.382.232||TBL|ROS|M||||||13|1|1|226.80|420.00|||3|
4562|ML|17|384.382.233||TBL|VER|B||||||13|1|1|226.80|420.00|||3|
4563|ML|17|384.382.234||TBL|VER|M||||||13|1|1|226.80|420.00|||3|
4564|ML|17|384.382.235||TBL|AZB|||||||13|1|1|226.80|420.00|||3|
4565|ML|17|384.382.236||TBL|DEN|||||||13|1|1|226.80|420.00|||3|
4566|ML|17|384.382.237||TBL|BLK|||||||13|1|1|226.80|420.00|||3|
4567|ML|17|384.382.238||TBL|ART|||||||13|1|1|226.80|420.00|||3|
4568|ML|17|384.382.239||TBL|LIN|||||||13|1|1|226.80|420.00|||3|
4569|ML|17|384.382.240||TBL|HAL|||||||13|1|1|226.80|420.00|||3|
4570|ML|17|384.382.91||BCO|BCO|B||||||13|1|1|248.40|460.00|||3|
4571|ML|17|384.382.93||BCO|BCO|M||||||13|1|1|248.40|460.00|||3|
4572|ML|17|384.382.95||CCL|CCL|B||||||13|1|1|248.40|460.00|||3|
4573|ML|17|384.382.97||CCL|CCL|M||||||13|1|1|248.40|460.00|||3|
4574|ML|17|384.382.99||CME|CME|B||||||13|1|1|248.40|460.00|||3|
4575|ML|17|384.382.101||CME|CME|M||||||13|1|1|248.40|460.00|||3|
4576|ML|17|384.382.103||ANT|ANT|B||||||13|1|1|248.40|460.00|||3|
4577|ML|17|384.382.105||ANT|ANT|M||||||13|1|1|248.40|460.00|||3|
4578|ML|17|384.382.107||PTO|PTO|B||||||13|1|1|248.40|460.00|||3|
4579|ML|17|384.382.109||PTO|PTO|M||||||13|1|1|248.40|460.00|||3|
4580|ML|17|384.382.111||CRE|CRE|B||||||13|1|1|248.40|460.00|||3|
4581|ML|17|384.382.113||CRE|CRE|M||||||13|1|1|248.40|460.00|||3|
4582|ML|17|384.382.115||CAM|CAM|B||||||13|1|1|248.40|460.00|||3|
4583|ML|17|384.382.117||CAM|CAM|M||||||13|1|1|248.40|460.00|||3|
4584|ML|17|384.382.119||OUR|OUR|B||||||13|1|1|248.40|460.00|||3|
4585|ML|17|384.382.121||OUR|OUR|M||||||13|1|1|248.40|460.00|||3|
4586|ML|17|384.382.123||COB|COB|B||||||13|1|1|248.40|460.00|||3|
4587|ML|17|384.382.125||COB|COB|M||||||13|1|1|248.40|460.00|||3|
4588|ML|17|384.382.127||CHO|CHO|B||||||13|1|1|248.40|460.00|||3|
4589|ML|17|384.382.129||CHO|CHO|M||||||13|1|1|248.40|460.00|||3|
4590|ML|17|384.382.131||VAG|VAG|B||||||13|1|1|248.40|460.00|||3|
4591|ML|17|384.382.133||VAG|VAG|M||||||13|1|1|248.40|460.00|||3|
4592|ML|17|384.382.135||AZE|AZE|B||||||13|1|1|248.40|460.00|||3|
4593|ML|17|384.382.137||AZE|AZE|M||||||13|1|1|248.40|460.00|||3|
4594|ML|17|384.382.139||AMA|AMA|B||||||13|1|1|248.40|460.00|||3|
4595|ML|17|384.382.141||AMA|AMA|M||||||13|1|1|248.40|460.00|||3|
4596|ML|17|384.382.143||AES|AES|B||||||13|1|1|248.40|460.00|||3|
4597|ML|17|384.382.145||AES|AES|M||||||13|1|1|248.40|460.00|||3|
4598|ML|17|384.382.147||PRA|PRA|B||||||13|1|1|248.40|460.00|||3|
4599|ML|17|384.382.149||PRA|PRA|M||||||13|1|1|248.40|460.00|||3|
4600|ML|17|384.382.151||ROS|ROS|B||||||13|1|1|248.40|460.00|||3|
4601|ML|17|384.382.153||ROS|ROS|M||||||13|1|1|248.40|460.00|||3|
4602|ML|17|384.382.155||VER|VER|B||||||13|1|1|248.40|460.00|||3|
4603|ML|17|384.382.157||VER|VER|M||||||13|1|1|248.40|460.00|||3|
4604|ML|17|384.382.165||AZB|AZB|||||||13|1|1|248.40|460.00|||3|
4605|ML|17|384.382.167||DEN|DEN|||||||13|1|1|248.40|460.00|||3|
4606|ML|17|384.382.169||BLK|BLK|||||||13|1|1|248.40|460.00|||3|
4607|ML|17|384.382.171||ART|ART|||||||13|1|1|248.40|460.00|||3|
4608|ML|17|384.382.173||LIN|LIN|||||||13|1|1|248.40|460.00|||3|
4609|ML|17|384.382.175||HAL|HAL|||||||13|1|1|248.40|460.00|||3|
4610|ML|18|385.386.197||TBL|TBL|||||||14|1|1|162.00|300.00|||4|
4611|ML|18|385.386.198||TEA|TEA|||||||14|1|1|162.00|300.00|||4|
4612|ML|18|385.386.199||OAK|OAK|||||||14|1|1|162.00|300.00|||4|
4613|ML|18|385.386.200||JOP|JOP|||||||14|1|1|162.00|300.00|||4|
4614|ML|18|385.386.201||TBL|BCO|B||||||14|1|1|189.00|350.00|||4|
4615|ML|18|385.386.202||TBL|BCO|M||||||14|1|1|189.00|350.00|||4|
4616|ML|18|385.386.203||TBL|CCL|B||||||14|1|1|189.00|350.00|||4|
4617|ML|18|385.386.204||TBL|CCL|M||||||14|1|1|189.00|350.00|||4|
4618|ML|18|385.386.205||TBL|CME|B||||||14|1|1|189.00|350.00|||4|
4619|ML|18|385.386.206||TBL|CME|M||||||14|1|1|189.00|350.00|||4|
4620|ML|18|385.386.207||TBL|ANT|B||||||14|1|1|189.00|350.00|||4|
4621|ML|18|385.386.208||TBL|ANT|M||||||14|1|1|189.00|350.00|||4|
4622|ML|18|385.386.209||TBL|PTO|B||||||14|1|1|189.00|350.00|||4|
4623|ML|18|385.386.210||TBL|PTO|M||||||14|1|1|189.00|350.00|||4|
4624|ML|18|385.386.211||TBL|CRE|B||||||14|1|1|189.00|350.00|||4|
4625|ML|18|385.386.212||TBL|CRE|M||||||14|1|1|189.00|350.00|||4|
4626|ML|18|385.386.213||TBL|CAM|B||||||14|1|1|189.00|350.00|||4|
4627|ML|18|385.386.214||TBL|CAM|M||||||14|1|1|189.00|350.00|||4|
4628|ML|18|385.386.215||TBL|OUR|B||||||14|1|1|189.00|350.00|||4|
4629|ML|18|385.386.216||TBL|OUR|M||||||14|1|1|189.00|350.00|||4|
4630|ML|18|385.386.217||TBL|COB|B||||||14|1|1|189.00|350.00|||4|
4631|ML|18|385.386.218||TBL|COB|M||||||14|1|1|189.00|350.00|||4|
4632|ML|18|385.386.219||TBL|CHO|B||||||14|1|1|189.00|350.00|||4|
4633|ML|18|385.386.220||TBL|CHO|M||||||14|1|1|189.00|350.00|||4|
4634|ML|18|385.386.221||TBL|VAG|B||||||14|1|1|189.00|350.00|||4|
4635|ML|18|385.386.222||TBL|VAG|M||||||14|1|1|189.00|350.00|||4|
4636|ML|18|385.386.223||TBL|AZE|B||||||14|1|1|189.00|350.00|||4|
4637|ML|18|385.386.224||TBL|AZE|M||||||14|1|1|189.00|350.00|||4|
4638|ML|18|385.386.225||TBL|AMA|B||||||14|1|1|189.00|350.00|||4|
4639|ML|18|385.386.226||TBL|AMA|M||||||14|1|1|189.00|350.00|||4|
4640|ML|18|385.386.227||TBL|AES|B||||||14|1|1|189.00|350.00|||4|
4641|ML|18|385.386.228||TBL|AES|M||||||14|1|1|189.00|350.00|||4|
4642|ML|18|385.386.229||TBL|PRA|B||||||14|1|1|189.00|350.00|||4|
4643|ML|18|385.386.230||TBL|PRA|M||||||14|1|1|189.00|350.00|||4|
4644|ML|18|385.386.231||TBL|ROS|B||||||14|1|1|189.00|350.00|||4|
4645|ML|18|385.386.232||TBL|ROS|M||||||14|1|1|189.00|350.00|||4|
4646|ML|18|385.386.233||TBL|VER|B||||||14|1|1|189.00|350.00|||4|
4647|ML|18|385.386.234||TBL|VER|M||||||14|1|1|189.00|350.00|||4|
4648|ML|18|385.386.235||TBL|AZB|||||||14|1|1|189.00|350.00|||4|
4649|ML|18|385.386.236||TBL|DEN|||||||14|1|1|189.00|350.00|||4|
4650|ML|18|385.386.237||TBL|BLK|||||||14|1|1|189.00|350.00|||4|
4651|ML|18|385.386.238||TBL|ART|||||||14|1|1|189.00|350.00|||4|
4652|ML|18|385.386.239||TBL|LIN|||||||14|1|1|189.00|350.00|||4|
4653|ML|18|385.386.240||TBL|HAL|||||||14|1|1|189.00|350.00|||4|
4654|ML|18|385.386.91||BCO|BCO|B||||||14|1|1|210.60|390.00|||4|
4655|ML|18|385.386.93||BCO|BCO|M||||||14|1|1|210.60|390.00|||4|
4656|ML|18|385.386.95||CCL|CCL|B||||||14|1|1|210.60|390.00|||4|
4657|ML|18|385.386.97||CCL|CCL|M||||||14|1|1|210.60|390.00|||4|
4658|ML|18|385.386.99||CME|CME|B||||||14|1|1|210.60|390.00|||4|
4659|ML|18|385.386.101||CME|CME|M||||||14|1|1|210.60|390.00|||4|
4660|ML|18|385.386.103||ANT|ANT|B||||||14|1|1|210.60|390.00|||4|
4661|ML|18|385.386.105||ANT|ANT|M||||||14|1|1|210.60|390.00|||4|
4662|ML|18|385.386.107||PTO|PTO|B||||||14|1|1|210.60|390.00|||4|
4663|ML|18|385.386.109||PTO|PTO|M||||||14|1|1|210.60|390.00|||4|
4664|ML|18|385.386.111||CRE|CRE|B||||||14|1|1|210.60|390.00|||4|
4665|ML|18|385.386.113||CRE|CRE|M||||||14|1|1|210.60|390.00|||4|
4666|ML|18|385.386.115||CAM|CAM|B||||||14|1|1|210.60|390.00|||4|
4667|ML|18|385.386.117||CAM|CAM|M||||||14|1|1|210.60|390.00|||4|
4668|ML|18|385.386.119||OUR|OUR|B||||||14|1|1|210.60|390.00|||4|
4669|ML|18|385.386.121||OUR|OUR|M||||||14|1|1|210.60|390.00|||4|
4670|ML|18|385.386.123||COB|COB|B||||||14|1|1|210.60|390.00|||4|
4671|ML|18|385.386.125||COB|COB|M||||||14|1|1|210.60|390.00|||4|
4672|ML|18|385.386.127||CHO|CHO|B||||||14|1|1|210.60|390.00|||4|
4673|ML|18|385.386.129||CHO|CHO|M||||||14|1|1|210.60|390.00|||4|
4674|ML|18|385.386.131||VAG|VAG|B||||||14|1|1|210.60|390.00|||4|
4675|ML|18|385.386.133||VAG|VAG|M||||||14|1|1|210.60|390.00|||4|
4676|ML|18|385.386.135||AZE|AZE|B||||||14|1|1|210.60|390.00|||4|
4677|ML|18|385.386.137||AZE|AZE|M||||||14|1|1|210.60|390.00|||4|
4678|ML|18|385.386.139||AMA|AMA|B||||||14|1|1|210.60|390.00|||4|
4679|ML|18|385.386.141||AMA|AMA|M||||||14|1|1|210.60|390.00|||4|
4680|ML|18|385.386.143||AES|AES|B||||||14|1|1|210.60|390.00|||4|
4681|ML|18|385.386.145||AES|AES|M||||||14|1|1|210.60|390.00|||4|
4682|ML|18|385.386.147||PRA|PRA|B||||||14|1|1|210.60|390.00|||4|
4683|ML|18|385.386.149||PRA|PRA|M||||||14|1|1|210.60|390.00|||4|
4684|ML|18|385.386.151||ROS|ROS|B||||||14|1|1|210.60|390.00|||4|
4685|ML|18|385.386.153||ROS|ROS|M||||||14|1|1|210.60|390.00|||4|
4686|ML|18|385.386.155||VER|VER|B||||||14|1|1|210.60|390.00|||4|
4687|ML|18|385.386.157||VER|VER|M||||||14|1|1|210.60|390.00|||4|
4688|ML|18|385.386.165||AZB|AZB|||||||14|1|1|210.60|390.00|||4|
4689|ML|18|385.386.167||DEN|DEN|||||||14|1|1|210.60|390.00|||4|
4690|ML|18|385.386.169||BLK|BLK|||||||14|1|1|210.60|390.00|||4|
4691|ML|18|385.386.171||ART|ART|||||||14|1|1|210.60|390.00|||4|
4692|ML|18|385.386.173||LIN|LIN|||||||14|1|1|210.60|390.00|||4|
4693|ML|18|385.386.175||HAL|HAL|||||||14|1|1|210.60|390.00|||4|
4694|ML|18|387.386.197||TBL|TBL|||||||15|1|1|178.20|330.00|||4|
4695|ML|18|387.386.198||TEA|TEA|||||||15|1|1|178.20|330.00|||4|
4696|ML|18|387.386.199||OAK|OAK|||||||15|1|1|178.20|330.00|||4|
4697|ML|18|387.386.200||JOP|JOP|||||||15|1|1|178.20|330.00|||4|
4698|ML|18|387.386.201||TBL|BCO|B||||||15|1|1|205.20|380.00|||4|
4699|ML|18|387.386.202||TBL|BCO|M||||||15|1|1|205.20|380.00|||4|
4700|ML|18|387.386.203||TBL|CCL|B||||||15|1|1|205.20|380.00|||4|
4701|ML|18|387.386.204||TBL|CCL|M||||||15|1|1|205.20|380.00|||4|
4702|ML|18|387.386.205||TBL|CME|B||||||15|1|1|205.20|380.00|||4|
4703|ML|18|387.386.206||TBL|CME|M||||||15|1|1|205.20|380.00|||4|
4704|ML|18|387.386.207||TBL|ANT|B||||||15|1|1|205.20|380.00|||4|
4705|ML|18|387.386.208||TBL|ANT|M||||||15|1|1|205.20|380.00|||4|
4706|ML|18|387.386.209||TBL|PTO|B||||||15|1|1|205.20|380.00|||4|
4707|ML|18|387.386.210||TBL|PTO|M||||||15|1|1|205.20|380.00|||4|
4708|ML|18|387.386.211||TBL|CRE|B||||||15|1|1|205.20|380.00|||4|
4709|ML|18|387.386.212||TBL|CRE|M||||||15|1|1|205.20|380.00|||4|
4710|ML|18|387.386.213||TBL|CAM|B||||||15|1|1|205.20|380.00|||4|
4711|ML|18|387.386.214||TBL|CAM|M||||||15|1|1|205.20|380.00|||4|
4712|ML|18|387.386.215||TBL|OUR|B||||||15|1|1|205.20|380.00|||4|
4713|ML|18|387.386.216||TBL|OUR|M||||||15|1|1|205.20|380.00|||4|
4714|ML|18|387.386.217||TBL|COB|B||||||15|1|1|205.20|380.00|||4|
4715|ML|18|387.386.218||TBL|COB|M||||||15|1|1|205.20|380.00|||4|
4716|ML|18|387.386.219||TBL|CHO|B||||||15|1|1|205.20|380.00|||4|
4717|ML|18|387.386.220||TBL|CHO|M||||||15|1|1|205.20|380.00|||4|
4718|ML|18|387.386.221||TBL|VAG|B||||||15|1|1|205.20|380.00|||4|
4719|ML|18|387.386.222||TBL|VAG|M||||||15|1|1|205.20|380.00|||4|
4720|ML|18|387.386.223||TBL|AZE|B||||||15|1|1|205.20|380.00|||4|
4721|ML|18|387.386.224||TBL|AZE|M||||||15|1|1|205.20|380.00|||4|
4722|ML|18|387.386.225||TBL|AMA|B||||||15|1|1|205.20|380.00|||4|
4723|ML|18|387.386.226||TBL|AMA|M||||||15|1|1|205.20|380.00|||4|
4724|ML|18|387.386.227||TBL|AES|B||||||15|1|1|205.20|380.00|||4|
4725|ML|18|387.386.228||TBL|AES|M||||||15|1|1|205.20|380.00|||4|
4726|ML|18|387.386.229||TBL|PRA|B||||||15|1|1|205.20|380.00|||4|
4727|ML|18|387.386.230||TBL|PRA|M||||||15|1|1|205.20|380.00|||4|
4728|ML|18|387.386.231||TBL|ROS|B||||||15|1|1|205.20|380.00|||4|
4729|ML|18|387.386.232||TBL|ROS|M||||||15|1|1|205.20|380.00|||4|
4730|ML|18|387.386.233||TBL|VER|B||||||15|1|1|205.20|380.00|||4|
4731|ML|18|387.386.234||TBL|VER|M||||||15|1|1|205.20|380.00|||4|
4732|ML|18|387.386.235||TBL|AZB|||||||15|1|1|205.20|380.00|||4|
4733|ML|18|387.386.236||TBL|DEN|||||||15|1|1|205.20|380.00|||4|
4734|ML|18|387.386.237||TBL|BLK|||||||15|1|1|205.20|380.00|||4|
4735|ML|18|387.386.238||TBL|ART|||||||15|1|1|205.20|380.00|||4|
4736|ML|18|387.386.239||TBL|LIN|||||||15|1|1|205.20|380.00|||4|
4737|ML|18|387.386.240||TBL|HAL|||||||15|1|1|205.20|380.00|||4|
4738|ML|18|387.386.91||BCO|BCO|B||||||15|1|1|226.80|420.00|||4|
4739|ML|18|387.386.93||BCO|BCO|M||||||15|1|1|226.80|420.00|||4|
4740|ML|18|387.386.95||CCL|CCL|B||||||15|1|1|226.80|420.00|||4|
4741|ML|18|387.386.97||CCL|CCL|M||||||15|1|1|226.80|420.00|||4|
4742|ML|18|387.386.99||CME|CME|B||||||15|1|1|226.80|420.00|||4|
4743|ML|18|387.386.101||CME|CME|M||||||15|1|1|226.80|420.00|||4|
4744|ML|18|387.386.103||ANT|ANT|B||||||15|1|1|226.80|420.00|||4|
4745|ML|18|387.386.105||ANT|ANT|M||||||15|1|1|226.80|420.00|||4|
4746|ML|18|387.386.107||PTO|PTO|B||||||15|1|1|226.80|420.00|||4|
4747|ML|18|387.386.109||PTO|PTO|M||||||15|1|1|226.80|420.00|||4|
4748|ML|18|387.386.111||CRE|CRE|B||||||15|1|1|226.80|420.00|||4|
4749|ML|18|387.386.113||CRE|CRE|M||||||15|1|1|226.80|420.00|||4|
4750|ML|18|387.386.115||CAM|CAM|B||||||15|1|1|226.80|420.00|||4|
4751|ML|18|387.386.117||CAM|CAM|M||||||15|1|1|226.80|420.00|||4|
4752|ML|18|387.386.119||OUR|OUR|B||||||15|1|1|226.80|420.00|||4|
4753|ML|18|387.386.121||OUR|OUR|M||||||15|1|1|226.80|420.00|||4|
4754|ML|18|387.386.123||COB|COB|B||||||15|1|1|226.80|420.00|||4|
4755|ML|18|387.386.125||COB|COB|M||||||15|1|1|226.80|420.00|||4|
4756|ML|18|387.386.127||CHO|CHO|B||||||15|1|1|226.80|420.00|||4|
4757|ML|18|387.386.129||CHO|CHO|M||||||15|1|1|226.80|420.00|||4|
4758|ML|18|387.386.131||VAG|VAG|B||||||15|1|1|226.80|420.00|||4|
4759|ML|18|387.386.133||VAG|VAG|M||||||15|1|1|226.80|420.00|||4|
4760|ML|18|387.386.135||AZE|AZE|B||||||15|1|1|226.80|420.00|||4|
4761|ML|18|387.386.137||AZE|AZE|M||||||15|1|1|226.80|420.00|||4|
4762|ML|18|387.386.139||AMA|AMA|B||||||15|1|1|226.80|420.00|||4|
4763|ML|18|387.386.141||AMA|AMA|M||||||15|1|1|226.80|420.00|||4|
4764|ML|18|387.386.143||AES|AES|B||||||15|1|1|226.80|420.00|||4|
4765|ML|18|387.386.145||AES|AES|M||||||15|1|1|226.80|420.00|||4|
4766|ML|18|387.386.147||PRA|PRA|B||||||15|1|1|226.80|420.00|||4|
4767|ML|18|387.386.149||PRA|PRA|M||||||15|1|1|226.80|420.00|||4|
4768|ML|18|387.386.151||ROS|ROS|B||||||15|1|1|226.80|420.00|||4|
4769|ML|18|387.386.153||ROS|ROS|M||||||15|1|1|226.80|420.00|||4|
4770|ML|18|387.386.155||VER|VER|B||||||15|1|1|226.80|420.00|||4|
4771|ML|18|387.386.157||VER|VER|M||||||15|1|1|226.80|420.00|||4|
4772|ML|18|387.386.165||AZB|AZB|||||||15|1|1|226.80|420.00|||4|
4773|ML|18|387.386.167||DEN|DEN|||||||15|1|1|226.80|420.00|||4|
4774|ML|18|387.386.169||BLK|BLK|||||||15|1|1|226.80|420.00|||4|
4775|ML|18|387.386.171||ART|ART|||||||15|1|1|226.80|420.00|||4|
4776|ML|18|387.386.173||LIN|LIN|||||||15|1|1|226.80|420.00|||4|
4777|ML|18|387.386.175||HAL|HAL|||||||15|1|1|226.80|420.00|||4|
4778|ML|19|387.386.327||TBL|TBL|||||||15|1|1|280.80|520.00|||4|
4779|ML|19|387.386.328||TEA|TEA|||||||15|1|1|280.80|520.00|||4|
4780|ML|19|387.386.329||OAK|OAK|||||||15|1|1|280.80|520.00|||4|
4781|ML|19|387.386.330||JOP|JOP|||||||15|1|1|280.80|520.00|||4|
4782|ML|19|387.386.331||TBL|BCO|B||||||15|1|1|307.80|570.00|||4|
4783|ML|19|387.386.332||TBL|BCO|M||||||15|1|1|307.80|570.00|||4|
4784|ML|19|387.386.333||TBL|CCL|B||||||15|1|1|307.80|570.00|||4|
4785|ML|19|387.386.334||TBL|CCL|M||||||15|1|1|307.80|570.00|||4|
4786|ML|19|387.386.335||TBL|CME|B||||||15|1|1|307.80|570.00|||4|
4787|ML|19|387.386.336||TBL|CME|M||||||15|1|1|307.80|570.00|||4|
4788|ML|19|387.386.337||TBL|ANT|B||||||15|1|1|307.80|570.00|||4|
4789|ML|19|387.386.338||TBL|ANT|M||||||15|1|1|307.80|570.00|||4|
4790|ML|19|387.386.339||TBL|PTO|B||||||15|1|1|307.80|570.00|||4|
4791|ML|19|387.386.340||TBL|PTO|M||||||15|1|1|307.80|570.00|||4|
4792|ML|19|387.386.341||TBL|CRE|B||||||15|1|1|307.80|570.00|||4|
4793|ML|19|387.386.342||TBL|CRE|M||||||15|1|1|307.80|570.00|||4|
4794|ML|19|387.386.343||TBL|CAM|B||||||15|1|1|307.80|570.00|||4|
4795|ML|19|387.386.344||TBL|CAM|M||||||15|1|1|307.80|570.00|||4|
4796|ML|19|387.386.345||TBL|OUR|B||||||15|1|1|307.80|570.00|||4|
4797|ML|19|387.386.346||TBL|OUR|M||||||15|1|1|307.80|570.00|||4|
4798|ML|19|387.386.347||TBL|COB|B||||||15|1|1|307.80|570.00|||4|
4799|ML|19|387.386.348||TBL|COB|M||||||15|1|1|307.80|570.00|||4|
4800|ML|19|387.386.349||TBL|CHO|B||||||15|1|1|307.80|570.00|||4|
4801|ML|19|387.386.350||TBL|CHO|M||||||15|1|1|307.80|570.00|||4|
4802|ML|19|387.386.351||TBL|VAG|B||||||15|1|1|307.80|570.00|||4|
4803|ML|19|387.386.352||TBL|VAG|M||||||15|1|1|307.80|570.00|||4|
4804|ML|19|387.386.353||TBL|AZE|B||||||15|1|1|307.80|570.00|||4|
4805|ML|19|387.386.354||TBL|AZE|M||||||15|1|1|307.80|570.00|||4|
4806|ML|19|387.386.355||TBL|AMA|B||||||15|1|1|307.80|570.00|||4|
4807|ML|19|387.386.356||TBL|AMA|M||||||15|1|1|307.80|570.00|||4|
4808|ML|19|387.386.357||TBL|AES|B||||||15|1|1|307.80|570.00|||4|
4809|ML|19|387.386.358||TBL|AES|M||||||15|1|1|307.80|570.00|||4|
4810|ML|19|387.386.359||TBL|PRA|B||||||15|1|1|307.80|570.00|||4|
4811|ML|19|387.386.360||TBL|PRA|M||||||15|1|1|307.80|570.00|||4|
4812|ML|19|387.386.361||TBL|ROS|B||||||15|1|1|307.80|570.00|||4|
4813|ML|19|387.386.362||TBL|ROS|M||||||15|1|1|307.80|570.00|||4|
4814|ML|19|387.386.363||TBL|VER|B||||||15|1|1|307.80|570.00|||4|
4815|ML|19|387.386.364||TBL|VER|M||||||15|1|1|307.80|570.00|||4|
4816|ML|19|387.386.365||TBL|AZB|||||||15|1|1|307.80|570.00|||4|
4817|ML|19|387.386.366||TBL|DEN|||||||15|1|1|307.80|570.00|||4|
4818|ML|19|387.386.367||TBL|BLK|||||||15|1|1|307.80|570.00|||4|
4819|ML|19|387.386.368||TBL|ART|||||||15|1|1|307.80|570.00|||4|
4820|ML|19|387.386.369||TBL|LIN|||||||15|1|1|307.80|570.00|||4|
4821|ML|19|387.386.370||TBL|HAL|||||||15|1|1|307.80|570.00|||4|
4822|ML|19|387.386.92||BCO|BCO|B||||||15|1|1|329.40|610.00|||4|
4823|ML|19|387.386.94||BCO|BCO|M||||||15|1|1|329.40|610.00|||4|
4824|ML|19|387.386.96||CCL|CCL|B||||||15|1|1|329.40|610.00|||4|
4825|ML|19|387.386.98||CCL|CCL|M||||||15|1|1|329.40|610.00|||4|
4826|ML|19|387.386.100||CME|CME|B||||||15|1|1|329.40|610.00|||4|
4827|ML|19|387.386.102||CME|CME|M||||||15|1|1|329.40|610.00|||4|
4828|ML|19|387.386.104||ANT|ANT|B||||||15|1|1|329.40|610.00|||4|
4829|ML|19|387.386.106||ANT|ANT|M||||||15|1|1|329.40|610.00|||4|
4830|ML|19|387.386.108||PTO|PTO|B||||||15|1|1|329.40|610.00|||4|
4831|ML|19|387.386.110||PTO|PTO|M||||||15|1|1|329.40|610.00|||4|
4832|ML|19|387.386.112||CRE|CRE|B||||||15|1|1|329.40|610.00|||4|
4833|ML|19|387.386.114||CRE|CRE|M||||||15|1|1|329.40|610.00|||4|
4834|ML|19|387.386.116||CAM|CAM|B||||||15|1|1|329.40|610.00|||4|
4835|ML|19|387.386.118||CAM|CAM|M||||||15|1|1|329.40|610.00|||4|
4836|ML|19|387.386.120||OUR|OUR|B||||||15|1|1|329.40|610.00|||4|
4837|ML|19|387.386.122||OUR|OUR|M||||||15|1|1|329.40|610.00|||4|
4838|ML|19|387.386.124||COB|COB|B||||||15|1|1|329.40|610.00|||4|
4839|ML|19|387.386.126||COB|COB|M||||||15|1|1|329.40|610.00|||4|
4840|ML|19|387.386.128||CHO|CHO|B||||||15|1|1|329.40|610.00|||4|
4841|ML|19|387.386.130||CHO|CHO|M||||||15|1|1|329.40|610.00|||4|
4842|ML|19|387.386.132||VAG|VAG|B||||||15|1|1|329.40|610.00|||4|
4843|ML|19|387.386.134||VAG|VAG|M||||||15|1|1|329.40|610.00|||4|
4844|ML|19|387.386.136||AZE|AZE|B||||||15|1|1|329.40|610.00|||4|
4845|ML|19|387.386.138||AZE|AZE|M||||||15|1|1|329.40|610.00|||4|
4846|ML|19|387.386.140||AMA|AMA|B||||||15|1|1|329.40|610.00|||4|
4847|ML|19|387.386.142||AMA|AMA|M||||||15|1|1|329.40|610.00|||4|
4848|ML|19|387.386.144||AES|AES|B||||||15|1|1|329.40|610.00|||4|
4849|ML|19|387.386.146||AES|AES|M||||||15|1|1|329.40|610.00|||4|
4850|ML|19|387.386.148||PRA|PRA|B||||||15|1|1|329.40|610.00|||4|
4851|ML|19|387.386.150||PRA|PRA|M||||||15|1|1|329.40|610.00|||4|
4852|ML|19|387.386.152||ROS|ROS|B||||||15|1|1|329.40|610.00|||4|
4853|ML|19|387.386.154||ROS|ROS|M||||||15|1|1|329.40|610.00|||4|
4854|ML|19|387.386.156||VER|VER|B||||||15|1|1|329.40|610.00|||4|
4855|ML|19|387.386.158||VER|VER|M||||||15|1|1|329.40|610.00|||4|
4856|ML|19|387.386.166||AZB|AZB|||||||15|1|1|329.40|610.00|||4|
4857|ML|19|387.386.168||DEN|DEN|||||||15|1|1|329.40|610.00|||4|
4858|ML|19|387.386.170||BLK|BLK|||||||15|1|1|329.40|610.00|||4|
4859|ML|19|387.386.172||ART|ART|||||||15|1|1|329.40|610.00|||4|
4860|ML|19|387.386.174||LIN|LIN|||||||15|1|1|329.40|610.00|||4|
4861|ML|19|387.386.176||HAL|HAL|||||||15|1|1|329.40|610.00|||4|
4862|ML|18|388.386.197||TBL|TBL|||||||16|1|1|210.60|390.00|||4|
4863|ML|18|388.386.198||TEA|TEA|||||||16|1|1|210.60|390.00|||4|
4864|ML|18|388.386.199||OAK|OAK|||||||16|1|1|210.60|390.00|||4|
4865|ML|18|388.386.200||JOP|JOP|||||||16|1|1|210.60|390.00|||4|
4866|ML|18|388.386.201||TBL|BCO|B||||||16|1|1|237.60|440.00|||4|
4867|ML|18|388.386.202||TBL|BCO|M||||||16|1|1|237.60|440.00|||4|
4868|ML|18|388.386.203||TBL|CCL|B||||||16|1|1|237.60|440.00|||4|
4869|ML|18|388.386.204||TBL|CCL|M||||||16|1|1|237.60|440.00|||4|
4870|ML|18|388.386.205||TBL|CME|B||||||16|1|1|237.60|440.00|||4|
4871|ML|18|388.386.206||TBL|CME|M||||||16|1|1|237.60|440.00|||4|
4872|ML|18|388.386.207||TBL|ANT|B||||||16|1|1|237.60|440.00|||4|
4873|ML|18|388.386.208||TBL|ANT|M||||||16|1|1|237.60|440.00|||4|
4874|ML|18|388.386.209||TBL|PTO|B||||||16|1|1|237.60|440.00|||4|
4875|ML|18|388.386.210||TBL|PTO|M||||||16|1|1|237.60|440.00|||4|
4876|ML|18|388.386.211||TBL|CRE|B||||||16|1|1|237.60|440.00|||4|
4877|ML|18|388.386.212||TBL|CRE|M||||||16|1|1|237.60|440.00|||4|
4878|ML|18|388.386.213||TBL|CAM|B||||||16|1|1|237.60|440.00|||4|
4879|ML|18|388.386.214||TBL|CAM|M||||||16|1|1|237.60|440.00|||4|
4880|ML|18|388.386.215||TBL|OUR|B||||||16|1|1|237.60|440.00|||4|
4881|ML|18|388.386.216||TBL|OUR|M||||||16|1|1|237.60|440.00|||4|
4882|ML|18|388.386.217||TBL|COB|B||||||16|1|1|237.60|440.00|||4|
4883|ML|18|388.386.218||TBL|COB|M||||||16|1|1|237.60|440.00|||4|
4884|ML|18|388.386.219||TBL|CHO|B||||||16|1|1|237.60|440.00|||4|
4885|ML|18|388.386.220||TBL|CHO|M||||||16|1|1|237.60|440.00|||4|
4886|ML|18|388.386.221||TBL|VAG|B||||||16|1|1|237.60|440.00|||4|
4887|ML|18|388.386.222||TBL|VAG|M||||||16|1|1|237.60|440.00|||4|
4888|ML|18|388.386.223||TBL|AZE|B||||||16|1|1|237.60|440.00|||4|
4889|ML|18|388.386.224||TBL|AZE|M||||||16|1|1|237.60|440.00|||4|
4890|ML|18|388.386.225||TBL|AMA|B||||||16|1|1|237.60|440.00|||4|
4891|ML|18|388.386.226||TBL|AMA|M||||||16|1|1|237.60|440.00|||4|
4892|ML|18|388.386.227||TBL|AES|B||||||16|1|1|237.60|440.00|||4|
4893|ML|18|388.386.228||TBL|AES|M||||||16|1|1|237.60|440.00|||4|
4894|ML|18|388.386.229||TBL|PRA|B||||||16|1|1|237.60|440.00|||4|
4895|ML|18|388.386.230||TBL|PRA|M||||||16|1|1|237.60|440.00|||4|
4896|ML|18|388.386.231||TBL|ROS|B||||||16|1|1|237.60|440.00|||4|
4897|ML|18|388.386.232||TBL|ROS|M||||||16|1|1|237.60|440.00|||4|
4898|ML|18|388.386.233||TBL|VER|B||||||16|1|1|237.60|440.00|||4|
4899|ML|18|388.386.234||TBL|VER|M||||||16|1|1|237.60|440.00|||4|
4900|ML|18|388.386.235||TBL|AZB|||||||16|1|1|237.60|440.00|||4|
4901|ML|18|388.386.236||TBL|DEN|||||||16|1|1|237.60|440.00|||4|
4902|ML|18|388.386.237||TBL|BLK|||||||16|1|1|237.60|440.00|||4|
4903|ML|18|388.386.238||TBL|ART|||||||16|1|1|237.60|440.00|||4|
4904|ML|18|388.386.239||TBL|LIN|||||||16|1|1|237.60|440.00|||4|
4905|ML|18|388.386.240||TBL|HAL|||||||16|1|1|237.60|440.00|||4|
4906|ML|18|388.386.91||BCO|BCO|B||||||16|1|1|259.20|480.00|||4|
4907|ML|18|388.386.93||BCO|BCO|M||||||16|1|1|259.20|480.00|||4|
4908|ML|18|388.386.95||CCL|CCL|B||||||16|1|1|259.20|480.00|||4|
4909|ML|18|388.386.97||CCL|CCL|M||||||16|1|1|259.20|480.00|||4|
4910|ML|18|388.386.99||CME|CME|B||||||16|1|1|259.20|480.00|||4|
4911|ML|18|388.386.101||CME|CME|M||||||16|1|1|259.20|480.00|||4|
4912|ML|18|388.386.103||ANT|ANT|B||||||16|1|1|259.20|480.00|||4|
4913|ML|18|388.386.105||ANT|ANT|M||||||16|1|1|259.20|480.00|||4|
4914|ML|18|388.386.107||PTO|PTO|B||||||16|1|1|259.20|480.00|||4|
4915|ML|18|388.386.109||PTO|PTO|M||||||16|1|1|259.20|480.00|||4|
4916|ML|18|388.386.111||CRE|CRE|B||||||16|1|1|259.20|480.00|||4|
4917|ML|18|388.386.113||CRE|CRE|M||||||16|1|1|259.20|480.00|||4|
4918|ML|18|388.386.115||CAM|CAM|B||||||16|1|1|259.20|480.00|||4|
4919|ML|18|388.386.117||CAM|CAM|M||||||16|1|1|259.20|480.00|||4|
4920|ML|18|388.386.119||OUR|OUR|B||||||16|1|1|259.20|480.00|||4|
4921|ML|18|388.386.121||OUR|OUR|M||||||16|1|1|259.20|480.00|||4|
4922|ML|18|388.386.123||COB|COB|B||||||16|1|1|259.20|480.00|||4|
4923|ML|18|388.386.125||COB|COB|M||||||16|1|1|259.20|480.00|||4|
4924|ML|18|388.386.127||CHO|CHO|B||||||16|1|1|259.20|480.00|||4|
4925|ML|18|388.386.129||CHO|CHO|M||||||16|1|1|259.20|480.00|||4|
4926|ML|18|388.386.131||VAG|VAG|B||||||16|1|1|259.20|480.00|||4|
4927|ML|18|388.386.133||VAG|VAG|M||||||16|1|1|259.20|480.00|||4|
4928|ML|18|388.386.135||AZE|AZE|B||||||16|1|1|259.20|480.00|||4|
4929|ML|18|388.386.137||AZE|AZE|M||||||16|1|1|259.20|480.00|||4|
4930|ML|18|388.386.139||AMA|AMA|B||||||16|1|1|259.20|480.00|||4|
4931|ML|18|388.386.141||AMA|AMA|M||||||16|1|1|259.20|480.00|||4|
4932|ML|18|388.386.143||AES|AES|B||||||16|1|1|259.20|480.00|||4|
4933|ML|18|388.386.145||AES|AES|M||||||16|1|1|259.20|480.00|||4|
4934|ML|18|388.386.147||PRA|PRA|B||||||16|1|1|259.20|480.00|||4|
4935|ML|18|388.386.149||PRA|PRA|M||||||16|1|1|259.20|480.00|||4|
4936|ML|18|388.386.151||ROS|ROS|B||||||16|1|1|259.20|480.00|||4|
4937|ML|18|388.386.153||ROS|ROS|M||||||16|1|1|259.20|480.00|||4|
4938|ML|18|388.386.155||VER|VER|B||||||16|1|1|259.20|480.00|||4|
4939|ML|18|388.386.157||VER|VER|M||||||16|1|1|259.20|480.00|||4|
4940|ML|18|388.386.165||AZB|AZB|||||||16|1|1|259.20|480.00|||4|
4941|ML|18|388.386.167||DEN|DEN|||||||16|1|1|259.20|480.00|||4|
4942|ML|18|388.386.169||BLK|BLK|||||||16|1|1|259.20|480.00|||4|
4943|ML|18|388.386.171||ART|ART|||||||16|1|1|259.20|480.00|||4|
4944|ML|18|388.386.173||LIN|LIN|||||||16|1|1|259.20|480.00|||4|
4945|ML|18|388.386.175||HAL|HAL|||||||16|1|1|259.20|480.00|||4|
4946|ML|19|388.386.327||TBL|TBL|||||||16|1|1|326.70|605.00|||4|
4947|ML|19|388.386.328||TEA|TEA|||||||16|1|1|326.70|605.00|||4|
4948|ML|19|388.386.329||OAK|OAK|||||||16|1|1|326.70|605.00|||4|
4949|ML|19|388.386.330||JOP|JOP|||||||16|1|1|326.70|605.00|||4|
4950|ML|19|388.386.331||TBL|BCO|B||||||16|1|1|353.70|655.00|||4|
4951|ML|19|388.386.332||TBL|BCO|M||||||16|1|1|353.70|655.00|||4|
4952|ML|19|388.386.333||TBL|CCL|B||||||16|1|1|353.70|655.00|||4|
4953|ML|19|388.386.334||TBL|CCL|M||||||16|1|1|353.70|655.00|||4|
4954|ML|19|388.386.335||TBL|CME|B||||||16|1|1|353.70|655.00|||4|
4955|ML|19|388.386.336||TBL|CME|M||||||16|1|1|353.70|655.00|||4|
4956|ML|19|388.386.337||TBL|ANT|B||||||16|1|1|353.70|655.00|||4|
4957|ML|19|388.386.338||TBL|ANT|M||||||16|1|1|353.70|655.00|||4|
4958|ML|19|388.386.339||TBL|PTO|B||||||16|1|1|353.70|655.00|||4|
4959|ML|19|388.386.340||TBL|PTO|M||||||16|1|1|353.70|655.00|||4|
4960|ML|19|388.386.341||TBL|CRE|B||||||16|1|1|353.70|655.00|||4|
4961|ML|19|388.386.342||TBL|CRE|M||||||16|1|1|353.70|655.00|||4|
4962|ML|19|388.386.343||TBL|CAM|B||||||16|1|1|353.70|655.00|||4|
4963|ML|19|388.386.344||TBL|CAM|M||||||16|1|1|353.70|655.00|||4|
4964|ML|19|388.386.345||TBL|OUR|B||||||16|1|1|353.70|655.00|||4|
4965|ML|19|388.386.346||TBL|OUR|M||||||16|1|1|353.70|655.00|||4|
4966|ML|19|388.386.347||TBL|COB|B||||||16|1|1|353.70|655.00|||4|
4967|ML|19|388.386.348||TBL|COB|M||||||16|1|1|353.70|655.00|||4|
4968|ML|19|388.386.349||TBL|CHO|B||||||16|1|1|353.70|655.00|||4|
4969|ML|19|388.386.350||TBL|CHO|M||||||16|1|1|353.70|655.00|||4|
4970|ML|19|388.386.351||TBL|VAG|B||||||16|1|1|353.70|655.00|||4|
4971|ML|19|388.386.352||TBL|VAG|M||||||16|1|1|353.70|655.00|||4|
4972|ML|19|388.386.353||TBL|AZE|B||||||16|1|1|353.70|655.00|||4|
4973|ML|19|388.386.354||TBL|AZE|M||||||16|1|1|353.70|655.00|||4|
4974|ML|19|388.386.355||TBL|AMA|B||||||16|1|1|353.70|655.00|||4|
4975|ML|19|388.386.356||TBL|AMA|M||||||16|1|1|353.70|655.00|||4|
4976|ML|19|388.386.357||TBL|AES|B||||||16|1|1|353.70|655.00|||4|
4977|ML|19|388.386.358||TBL|AES|M||||||16|1|1|353.70|655.00|||4|
4978|ML|19|388.386.359||TBL|PRA|B||||||16|1|1|353.70|655.00|||4|
4979|ML|19|388.386.360||TBL|PRA|M||||||16|1|1|353.70|655.00|||4|
4980|ML|19|388.386.361||TBL|ROS|B||||||16|1|1|353.70|655.00|||4|
4981|ML|19|388.386.362||TBL|ROS|M||||||16|1|1|353.70|655.00|||4|
4982|ML|19|388.386.363||TBL|VER|B||||||16|1|1|353.70|655.00|||4|
4983|ML|19|388.386.364||TBL|VER|M||||||16|1|1|353.70|655.00|||4|
4984|ML|19|388.386.365||TBL|AZB|||||||16|1|1|353.70|655.00|||4|
4985|ML|19|388.386.366||TBL|DEN|||||||16|1|1|353.70|655.00|||4|
4986|ML|19|388.386.367||TBL|BLK|||||||16|1|1|353.70|655.00|||4|
4987|ML|19|388.386.368||TBL|ART|||||||16|1|1|353.70|655.00|||4|
4988|ML|19|388.386.369||TBL|LIN|||||||16|1|1|353.70|655.00|||4|
4989|ML|19|388.386.370||TBL|HAL|||||||16|1|1|353.70|655.00|||4|
4990|ML|19|388.386.92||BCO|BCO|B||||||16|1|1|375.30|695.00|||4|
4991|ML|19|388.386.94||BCO|BCO|M||||||16|1|1|375.30|695.00|||4|
4992|ML|19|388.386.96||CCL|CCL|B||||||16|1|1|375.30|695.00|||4|
4993|ML|19|388.386.98||CCL|CCL|M||||||16|1|1|375.30|695.00|||4|
4994|ML|19|388.386.100||CME|CME|B||||||16|1|1|375.30|695.00|||4|
4995|ML|19|388.386.102||CME|CME|M||||||16|1|1|375.30|695.00|||4|
4996|ML|19|388.386.104||ANT|ANT|B||||||16|1|1|375.30|695.00|||4|
4997|ML|19|388.386.106||ANT|ANT|M||||||16|1|1|375.30|695.00|||4|
4998|ML|19|388.386.108||PTO|PTO|B||||||16|1|1|375.30|695.00|||4|
4999|ML|19|388.386.110||PTO|PTO|M||||||16|1|1|375.30|695.00|||4|
5000|ML|19|388.386.112||CRE|CRE|B||||||16|1|1|375.30|695.00|||4|
5001|ML|19|388.386.114||CRE|CRE|M||||||16|1|1|375.30|695.00|||4|
5002|ML|19|388.386.116||CAM|CAM|B||||||16|1|1|375.30|695.00|||4|
5003|ML|19|388.386.118||CAM|CAM|M||||||16|1|1|375.30|695.00|||4|
5004|ML|19|388.386.120||OUR|OUR|B||||||16|1|1|375.30|695.00|||4|
5005|ML|19|388.386.122||OUR|OUR|M||||||16|1|1|375.30|695.00|||4|
5006|ML|19|388.386.124||COB|COB|B||||||16|1|1|375.30|695.00|||4|
5007|ML|19|388.386.126||COB|COB|M||||||16|1|1|375.30|695.00|||4|
5008|ML|19|388.386.128||CHO|CHO|B||||||16|1|1|375.30|695.00|||4|
5009|ML|19|388.386.130||CHO|CHO|M||||||16|1|1|375.30|695.00|||4|
5010|ML|19|388.386.132||VAG|VAG|B||||||16|1|1|375.30|695.00|||4|
5011|ML|19|388.386.134||VAG|VAG|M||||||16|1|1|375.30|695.00|||4|
5012|ML|19|388.386.136||AZE|AZE|B||||||16|1|1|375.30|695.00|||4|
5013|ML|19|388.386.138||AZE|AZE|M||||||16|1|1|375.30|695.00|||4|
5014|ML|19|388.386.140||AMA|AMA|B||||||16|1|1|375.30|695.00|||4|
5015|ML|19|388.386.142||AMA|AMA|M||||||16|1|1|375.30|695.00|||4|
5016|ML|19|388.386.144||AES|AES|B||||||16|1|1|375.30|695.00|||4|
5017|ML|19|388.386.146||AES|AES|M||||||16|1|1|375.30|695.00|||4|
5018|ML|19|388.386.148||PRA|PRA|B||||||16|1|1|375.30|695.00|||4|
5019|ML|19|388.386.150||PRA|PRA|M||||||16|1|1|375.30|695.00|||4|
5020|ML|19|388.386.152||ROS|ROS|B||||||16|1|1|375.30|695.00|||4|
5021|ML|19|388.386.154||ROS|ROS|M||||||16|1|1|375.30|695.00|||4|
5022|ML|19|388.386.156||VER|VER|B||||||16|1|1|375.30|695.00|||4|
5023|ML|19|388.386.158||VER|VER|M||||||16|1|1|375.30|695.00|||4|
5024|ML|19|388.386.166||AZB|AZB|||||||16|1|1|375.30|695.00|||4|
5025|ML|19|388.386.168||DEN|DEN|||||||16|1|1|375.30|695.00|||4|
5026|ML|19|388.386.170||BLK|BLK|||||||16|1|1|375.30|695.00|||4|
5027|ML|19|388.386.172||ART|ART|||||||16|1|1|375.30|695.00|||4|
5028|ML|19|388.386.174||LIN|LIN|||||||16|1|1|375.30|695.00|||4|
5029|ML|19|388.386.176||HAL|HAL|||||||16|1|1|375.30|695.00|||4|
5030|ML|18|389.386.197||TBL|TBL|||||||17|1|1|275.40|510.00|||4|
5031|ML|18|389.386.198||TEA|TEA|||||||17|1|1|275.40|510.00|||4|
5032|ML|18|389.386.199||OAK|OAK|||||||17|1|1|275.40|510.00|||4|
5033|ML|18|389.386.200||JOP|JOP|||||||17|1|1|275.40|510.00|||4|
5034|ML|18|389.386.201||TBL|BCO|B||||||17|1|1|302.40|560.00|||4|
5035|ML|18|389.386.202||TBL|BCO|M||||||17|1|1|302.40|560.00|||4|
5036|ML|18|389.386.203||TBL|CCL|B||||||17|1|1|302.40|560.00|||4|
5037|ML|18|389.386.204||TBL|CCL|M||||||17|1|1|302.40|560.00|||4|
5038|ML|18|389.386.205||TBL|CME|B||||||17|1|1|302.40|560.00|||4|
5039|ML|18|389.386.206||TBL|CME|M||||||17|1|1|302.40|560.00|||4|
5040|ML|18|389.386.207||TBL|ANT|B||||||17|1|1|302.40|560.00|||4|
5041|ML|18|389.386.208||TBL|ANT|M||||||17|1|1|302.40|560.00|||4|
5042|ML|18|389.386.209||TBL|PTO|B||||||17|1|1|302.40|560.00|||4|
5043|ML|18|389.386.210||TBL|PTO|M||||||17|1|1|302.40|560.00|||4|
5044|ML|18|389.386.211||TBL|CRE|B||||||17|1|1|302.40|560.00|||4|
5045|ML|18|389.386.212||TBL|CRE|M||||||17|1|1|302.40|560.00|||4|
5046|ML|18|389.386.213||TBL|CAM|B||||||17|1|1|302.40|560.00|||4|
5047|ML|18|389.386.214||TBL|CAM|M||||||17|1|1|302.40|560.00|||4|
5048|ML|18|389.386.215||TBL|OUR|B||||||17|1|1|302.40|560.00|||4|
5049|ML|18|389.386.216||TBL|OUR|M||||||17|1|1|302.40|560.00|||4|
5050|ML|18|389.386.217||TBL|COB|B||||||17|1|1|302.40|560.00|||4|
5051|ML|18|389.386.218||TBL|COB|M||||||17|1|1|302.40|560.00|||4|
5052|ML|18|389.386.219||TBL|CHO|B||||||17|1|1|302.40|560.00|||4|
5053|ML|18|389.386.220||TBL|CHO|M||||||17|1|1|302.40|560.00|||4|
5054|ML|18|389.386.221||TBL|VAG|B||||||17|1|1|302.40|560.00|||4|
5055|ML|18|389.386.222||TBL|VAG|M||||||17|1|1|302.40|560.00|||4|
5056|ML|18|389.386.223||TBL|AZE|B||||||17|1|1|302.40|560.00|||4|
5057|ML|18|389.386.224||TBL|AZE|M||||||17|1|1|302.40|560.00|||4|
5058|ML|18|389.386.225||TBL|AMA|B||||||17|1|1|302.40|560.00|||4|
5059|ML|18|389.386.226||TBL|AMA|M||||||17|1|1|302.40|560.00|||4|
5060|ML|18|389.386.227||TBL|AES|B||||||17|1|1|302.40|560.00|||4|
5061|ML|18|389.386.228||TBL|AES|M||||||17|1|1|302.40|560.00|||4|
5062|ML|18|389.386.229||TBL|PRA|B||||||17|1|1|302.40|560.00|||4|
5063|ML|18|389.386.230||TBL|PRA|M||||||17|1|1|302.40|560.00|||4|
5064|ML|18|389.386.231||TBL|ROS|B||||||17|1|1|302.40|560.00|||4|
5065|ML|18|389.386.232||TBL|ROS|M||||||17|1|1|302.40|560.00|||4|
5066|ML|18|389.386.233||TBL|VER|B||||||17|1|1|302.40|560.00|||4|
5067|ML|18|389.386.234||TBL|VER|M||||||17|1|1|302.40|560.00|||4|
5068|ML|18|389.386.235||TBL|AZB|||||||17|1|1|302.40|560.00|||4|
5069|ML|18|389.386.236||TBL|DEN|||||||17|1|1|302.40|560.00|||4|
5070|ML|18|389.386.237||TBL|BLK|||||||17|1|1|302.40|560.00|||4|
5071|ML|18|389.386.238||TBL|ART|||||||17|1|1|302.40|560.00|||4|
5072|ML|18|389.386.239||TBL|LIN|||||||17|1|1|302.40|560.00|||4|
5073|ML|18|389.386.240||TBL|HAL|||||||17|1|1|302.40|560.00|||4|
5074|ML|18|389.386.91||BCO|BCO|B||||||17|1|1|324.00|600.00|||4|
5075|ML|18|389.386.93||BCO|BCO|M||||||17|1|1|324.00|600.00|||4|
5076|ML|18|389.386.95||CCL|CCL|B||||||17|1|1|324.00|600.00|||4|
5077|ML|18|389.386.97||CCL|CCL|M||||||17|1|1|324.00|600.00|||4|
5078|ML|18|389.386.99||CME|CME|B||||||17|1|1|324.00|600.00|||4|
5079|ML|18|389.386.101||CME|CME|M||||||17|1|1|324.00|600.00|||4|
5080|ML|18|389.386.103||ANT|ANT|B||||||17|1|1|324.00|600.00|||4|
5081|ML|18|389.386.105||ANT|ANT|M||||||17|1|1|324.00|600.00|||4|
5082|ML|18|389.386.107||PTO|PTO|B||||||17|1|1|324.00|600.00|||4|
5083|ML|18|389.386.109||PTO|PTO|M||||||17|1|1|324.00|600.00|||4|
5084|ML|18|389.386.111||CRE|CRE|B||||||17|1|1|324.00|600.00|||4|
5085|ML|18|389.386.113||CRE|CRE|M||||||17|1|1|324.00|600.00|||4|
5086|ML|18|389.386.115||CAM|CAM|B||||||17|1|1|324.00|600.00|||4|
5087|ML|18|389.386.117||CAM|CAM|M||||||17|1|1|324.00|600.00|||4|
5088|ML|18|389.386.119||OUR|OUR|B||||||17|1|1|324.00|600.00|||4|
5089|ML|18|389.386.121||OUR|OUR|M||||||17|1|1|324.00|600.00|||4|
5090|ML|18|389.386.123||COB|COB|B||||||17|1|1|324.00|600.00|||4|
5091|ML|18|389.386.125||COB|COB|M||||||17|1|1|324.00|600.00|||4|
5092|ML|18|389.386.127||CHO|CHO|B||||||17|1|1|324.00|600.00|||4|
5093|ML|18|389.386.129||CHO|CHO|M||||||17|1|1|324.00|600.00|||4|
5094|ML|18|389.386.131||VAG|VAG|B||||||17|1|1|324.00|600.00|||4|
5095|ML|18|389.386.133||VAG|VAG|M||||||17|1|1|324.00|600.00|||4|
5096|ML|18|389.386.135||AZE|AZE|B||||||17|1|1|324.00|600.00|||4|
5097|ML|18|389.386.137||AZE|AZE|M||||||17|1|1|324.00|600.00|||4|
5098|ML|18|389.386.139||AMA|AMA|B||||||17|1|1|324.00|600.00|||4|
5099|ML|18|389.386.141||AMA|AMA|M||||||17|1|1|324.00|600.00|||4|
5100|ML|18|389.386.143||AES|AES|B||||||17|1|1|324.00|600.00|||4|
5101|ML|18|389.386.145||AES|AES|M||||||17|1|1|324.00|600.00|||4|
5102|ML|18|389.386.147||PRA|PRA|B||||||17|1|1|324.00|600.00|||4|
5103|ML|18|389.386.149||PRA|PRA|M||||||17|1|1|324.00|600.00|||4|
5104|ML|18|389.386.151||ROS|ROS|B||||||17|1|1|324.00|600.00|||4|
5105|ML|18|389.386.153||ROS|ROS|M||||||17|1|1|324.00|600.00|||4|
5106|ML|18|389.386.155||VER|VER|B||||||17|1|1|324.00|600.00|||4|
5107|ML|18|389.386.157||VER|VER|M||||||17|1|1|324.00|600.00|||4|
5108|ML|18|389.386.165||AZB|AZB|||||||17|1|1|324.00|600.00|||4|
5109|ML|18|389.386.167||DEN|DEN|||||||17|1|1|324.00|600.00|||4|
5110|ML|18|389.386.169||BLK|BLK|||||||17|1|1|324.00|600.00|||4|
5111|ML|18|389.386.171||ART|ART|||||||17|1|1|324.00|600.00|||4|
5112|ML|18|389.386.173||LIN|LIN|||||||17|1|1|324.00|600.00|||4|
5113|ML|18|389.386.175||HAL|HAL|||||||17|1|1|324.00|600.00|||4|
5114|ML|19|389.386.327||TBL|TBL|||||||17|1|1|375.30|695.00|||4|
5115|ML|19|389.386.328||TEA|TEA|||||||17|1|1|375.30|695.00|||4|
5116|ML|19|389.386.329||OAK|OAK|||||||17|1|1|375.30|695.00|||4|
5117|ML|19|389.386.330||JOP|JOP|||||||17|1|1|375.30|695.00|||4|
5118|ML|19|389.386.331||TBL|BCO|B||||||17|1|1|402.30|745.00|||4|
5119|ML|19|389.386.332||TBL|BCO|M||||||17|1|1|402.30|745.00|||4|
5120|ML|19|389.386.333||TBL|CCL|B||||||17|1|1|402.30|745.00|||4|
5121|ML|19|389.386.334||TBL|CCL|M||||||17|1|1|402.30|745.00|||4|
5122|ML|19|389.386.335||TBL|CME|B||||||17|1|1|402.30|745.00|||4|
5123|ML|19|389.386.336||TBL|CME|M||||||17|1|1|402.30|745.00|||4|
5124|ML|19|389.386.337||TBL|ANT|B||||||17|1|1|402.30|745.00|||4|
5125|ML|19|389.386.338||TBL|ANT|M||||||17|1|1|402.30|745.00|||4|
5126|ML|19|389.386.339||TBL|PTO|B||||||17|1|1|402.30|745.00|||4|
5127|ML|19|389.386.340||TBL|PTO|M||||||17|1|1|402.30|745.00|||4|
5128|ML|19|389.386.341||TBL|CRE|B||||||17|1|1|402.30|745.00|||4|
5129|ML|19|389.386.342||TBL|CRE|M||||||17|1|1|402.30|745.00|||4|
5130|ML|19|389.386.343||TBL|CAM|B||||||17|1|1|402.30|745.00|||4|
5131|ML|19|389.386.344||TBL|CAM|M||||||17|1|1|402.30|745.00|||4|
5132|ML|19|389.386.345||TBL|OUR|B||||||17|1|1|402.30|745.00|||4|
5133|ML|19|389.386.346||TBL|OUR|M||||||17|1|1|402.30|745.00|||4|
5134|ML|19|389.386.347||TBL|COB|B||||||17|1|1|402.30|745.00|||4|
5135|ML|19|389.386.348||TBL|COB|M||||||17|1|1|402.30|745.00|||4|
5136|ML|19|389.386.349||TBL|CHO|B||||||17|1|1|402.30|745.00|||4|
5137|ML|19|389.386.350||TBL|CHO|M||||||17|1|1|402.30|745.00|||4|
5138|ML|19|389.386.351||TBL|VAG|B||||||17|1|1|402.30|745.00|||4|
5139|ML|19|389.386.352||TBL|VAG|M||||||17|1|1|402.30|745.00|||4|
5140|ML|19|389.386.353||TBL|AZE|B||||||17|1|1|402.30|745.00|||4|
5141|ML|19|389.386.354||TBL|AZE|M||||||17|1|1|402.30|745.00|||4|
5142|ML|19|389.386.355||TBL|AMA|B||||||17|1|1|402.30|745.00|||4|
5143|ML|19|389.386.356||TBL|AMA|M||||||17|1|1|402.30|745.00|||4|
5144|ML|19|389.386.357||TBL|AES|B||||||17|1|1|402.30|745.00|||4|
5145|ML|19|389.386.358||TBL|AES|M||||||17|1|1|402.30|745.00|||4|
5146|ML|19|389.386.359||TBL|PRA|B||||||17|1|1|402.30|745.00|||4|
5147|ML|19|389.386.360||TBL|PRA|M||||||17|1|1|402.30|745.00|||4|
5148|ML|19|389.386.361||TBL|ROS|B||||||17|1|1|402.30|745.00|||4|
5149|ML|19|389.386.362||TBL|ROS|M||||||17|1|1|402.30|745.00|||4|
5150|ML|19|389.386.363||TBL|VER|B||||||17|1|1|402.30|745.00|||4|
5151|ML|19|389.386.364||TBL|VER|M||||||17|1|1|402.30|745.00|||4|
5152|ML|19|389.386.365||TBL|AZB|||||||17|1|1|402.30|745.00|||4|
5153|ML|19|389.386.366||TBL|DEN|||||||17|1|1|402.30|745.00|||4|
5154|ML|19|389.386.367||TBL|BLK|||||||17|1|1|402.30|745.00|||4|
5155|ML|19|389.386.368||TBL|ART|||||||17|1|1|402.30|745.00|||4|
5156|ML|19|389.386.369||TBL|LIN|||||||17|1|1|402.30|745.00|||4|
5157|ML|19|389.386.370||TBL|HAL|||||||17|1|1|402.30|745.00|||4|
5158|ML|19|389.386.92||BCO|BCO|B||||||17|1|1|423.90|785.00|||4|
5159|ML|19|389.386.94||BCO|BCO|M||||||17|1|1|423.90|785.00|||4|
5160|ML|19|389.386.96||CCL|CCL|B||||||17|1|1|423.90|785.00|||4|
5161|ML|19|389.386.98||CCL|CCL|M||||||17|1|1|423.90|785.00|||4|
5162|ML|19|389.386.100||CME|CME|B||||||17|1|1|423.90|785.00|||4|
5163|ML|19|389.386.102||CME|CME|M||||||17|1|1|423.90|785.00|||4|
5164|ML|19|389.386.104||ANT|ANT|B||||||17|1|1|423.90|785.00|||4|
5165|ML|19|389.386.106||ANT|ANT|M||||||17|1|1|423.90|785.00|||4|
5166|ML|19|389.386.108||PTO|PTO|B||||||17|1|1|423.90|785.00|||4|
5167|ML|19|389.386.110||PTO|PTO|M||||||17|1|1|423.90|785.00|||4|
5168|ML|19|389.386.112||CRE|CRE|B||||||17|1|1|423.90|785.00|||4|
5169|ML|19|389.386.114||CRE|CRE|M||||||17|1|1|423.90|785.00|||4|
5170|ML|19|389.386.116||CAM|CAM|B||||||17|1|1|423.90|785.00|||4|
5171|ML|19|389.386.118||CAM|CAM|M||||||17|1|1|423.90|785.00|||4|
5172|ML|19|389.386.120||OUR|OUR|B||||||17|1|1|423.90|785.00|||4|
5173|ML|19|389.386.122||OUR|OUR|M||||||17|1|1|423.90|785.00|||4|
5174|ML|19|389.386.124||COB|COB|B||||||17|1|1|423.90|785.00|||4|
5175|ML|19|389.386.126||COB|COB|M||||||17|1|1|423.90|785.00|||4|
5176|ML|19|389.386.128||CHO|CHO|B||||||17|1|1|423.90|785.00|||4|
5177|ML|19|389.386.130||CHO|CHO|M||||||17|1|1|423.90|785.00|||4|
5178|ML|19|389.386.132||VAG|VAG|B||||||17|1|1|423.90|785.00|||4|
5179|ML|19|389.386.134||VAG|VAG|M||||||17|1|1|423.90|785.00|||4|
5180|ML|19|389.386.136||AZE|AZE|B||||||17|1|1|423.90|785.00|||4|
5181|ML|19|389.386.138||AZE|AZE|M||||||17|1|1|423.90|785.00|||4|
5182|ML|19|389.386.140||AMA|AMA|B||||||17|1|1|423.90|785.00|||4|
5183|ML|19|389.386.142||AMA|AMA|M||||||17|1|1|423.90|785.00|||4|
5184|ML|19|389.386.144||AES|AES|B||||||17|1|1|423.90|785.00|||4|
5185|ML|19|389.386.146||AES|AES|M||||||17|1|1|423.90|785.00|||4|
5186|ML|19|389.386.148||PRA|PRA|B||||||17|1|1|423.90|785.00|||4|
5187|ML|19|389.386.150||PRA|PRA|M||||||17|1|1|423.90|785.00|||4|
5188|ML|19|389.386.152||ROS|ROS|B||||||17|1|1|423.90|785.00|||4|
5189|ML|19|389.386.154||ROS|ROS|M||||||17|1|1|423.90|785.00|||4|
5190|ML|19|389.386.156||VER|VER|B||||||17|1|1|423.90|785.00|||4|
5191|ML|19|389.386.158||VER|VER|M||||||17|1|1|423.90|785.00|||4|
5192|ML|19|389.386.166||AZB|AZB|||||||17|1|1|423.90|785.00|||4|
5193|ML|19|389.386.168||DEN|DEN|||||||17|1|1|423.90|785.00|||4|
5194|ML|19|389.386.170||BLK|BLK|||||||17|1|1|423.90|785.00|||4|
5195|ML|19|389.386.172||ART|ART|||||||17|1|1|423.90|785.00|||4|
5196|ML|19|389.386.174||LIN|LIN|||||||17|1|1|423.90|785.00|||4|
5197|ML|19|389.386.176||HAL|HAL|||||||17|1|1|423.90|785.00|||4|
5198|ML|20|389.390.197||TBL|TBL|||||||17|1|1|302.40|560.00|||4|
5199|ML|20|389.390.198||TEA|TEA|||||||17|1|1|302.40|560.00|||4|
5200|ML|20|389.390.199||OAK|OAK|||||||17|1|1|302.40|560.00|||4|
5201|ML|20|389.390.200||JOP|JOP|||||||17|1|1|302.40|560.00|||4|
5202|ML|20|389.390.201||TBL|BCO|B||||||17|1|1|329.40|610.00|||4|
5203|ML|20|389.390.202||TBL|BCO|M||||||17|1|1|329.40|610.00|||4|
5204|ML|20|389.390.203||TBL|CCL|B||||||17|1|1|329.40|610.00|||4|
5205|ML|20|389.390.204||TBL|CCL|M||||||17|1|1|329.40|610.00|||4|
5206|ML|20|389.390.205||TBL|CME|B||||||17|1|1|329.40|610.00|||4|
5207|ML|20|389.390.206||TBL|CME|M||||||17|1|1|329.40|610.00|||4|
5208|ML|20|389.390.207||TBL|ANT|B||||||17|1|1|329.40|610.00|||4|
5209|ML|20|389.390.208||TBL|ANT|M||||||17|1|1|329.40|610.00|||4|
5210|ML|20|389.390.209||TBL|PTO|B||||||17|1|1|329.40|610.00|||4|
5211|ML|20|389.390.210||TBL|PTO|M||||||17|1|1|329.40|610.00|||4|
5212|ML|20|389.390.211||TBL|CRE|B||||||17|1|1|329.40|610.00|||4|
5213|ML|20|389.390.212||TBL|CRE|M||||||17|1|1|329.40|610.00|||4|
5214|ML|20|389.390.213||TBL|CAM|B||||||17|1|1|329.40|610.00|||4|
5215|ML|20|389.390.214||TBL|CAM|M||||||17|1|1|329.40|610.00|||4|
5216|ML|20|389.390.215||TBL|OUR|B||||||17|1|1|329.40|610.00|||4|
5217|ML|20|389.390.216||TBL|OUR|M||||||17|1|1|329.40|610.00|||4|
5218|ML|20|389.390.217||TBL|COB|B||||||17|1|1|329.40|610.00|||4|
5219|ML|20|389.390.218||TBL|COB|M||||||17|1|1|329.40|610.00|||4|
5220|ML|20|389.390.219||TBL|CHO|B||||||17|1|1|329.40|610.00|||4|
5221|ML|20|389.390.220||TBL|CHO|M||||||17|1|1|329.40|610.00|||4|
5222|ML|20|389.390.221||TBL|VAG|B||||||17|1|1|329.40|610.00|||4|
5223|ML|20|389.390.222||TBL|VAG|M||||||17|1|1|329.40|610.00|||4|
5224|ML|20|389.390.223||TBL|AZE|B||||||17|1|1|329.40|610.00|||4|
5225|ML|20|389.390.224||TBL|AZE|M||||||17|1|1|329.40|610.00|||4|
5226|ML|20|389.390.225||TBL|AMA|B||||||17|1|1|329.40|610.00|||4|
5227|ML|20|389.390.226||TBL|AMA|M||||||17|1|1|329.40|610.00|||4|
5228|ML|20|389.390.227||TBL|AES|B||||||17|1|1|329.40|610.00|||4|
5229|ML|20|389.390.228||TBL|AES|M||||||17|1|1|329.40|610.00|||4|
5230|ML|20|389.390.229||TBL|PRA|B||||||17|1|1|329.40|610.00|||4|
5231|ML|20|389.390.230||TBL|PRA|M||||||17|1|1|329.40|610.00|||4|
5232|ML|20|389.390.231||TBL|ROS|B||||||17|1|1|329.40|610.00|||4|
5233|ML|20|389.390.232||TBL|ROS|M||||||17|1|1|329.40|610.00|||4|
5234|ML|20|389.390.233||TBL|VER|B||||||17|1|1|329.40|610.00|||4|
5235|ML|20|389.390.234||TBL|VER|M||||||17|1|1|329.40|610.00|||4|
5236|ML|20|389.390.235||TBL|AZB|||||||17|1|1|329.40|610.00|||4|
5237|ML|20|389.390.236||TBL|DEN|||||||17|1|1|329.40|610.00|||4|
5238|ML|20|389.390.237||TBL|BLK|||||||17|1|1|329.40|610.00|||4|
5239|ML|20|389.390.238||TBL|ART|||||||17|1|1|329.40|610.00|||4|
5240|ML|20|389.390.239||TBL|LIN|||||||17|1|1|329.40|610.00|||4|
5241|ML|20|389.390.240||TBL|HAL|||||||17|1|1|329.40|610.00|||4|
5242|ML|20|389.390.91||BCO|BCO|B||||||17|1|1|351.00|650.00|||4|
5243|ML|20|389.390.93||BCO|BCO|M||||||17|1|1|351.00|650.00|||4|
5244|ML|20|389.390.95||CCL|CCL|B||||||17|1|1|351.00|650.00|||4|
5245|ML|20|389.390.97||CCL|CCL|M||||||17|1|1|351.00|650.00|||4|
5246|ML|20|389.390.99||CME|CME|B||||||17|1|1|351.00|650.00|||4|
5247|ML|20|389.390.101||CME|CME|M||||||17|1|1|351.00|650.00|||4|
5248|ML|20|389.390.103||ANT|ANT|B||||||17|1|1|351.00|650.00|||4|
5249|ML|20|389.390.105||ANT|ANT|M||||||17|1|1|351.00|650.00|||4|
5250|ML|20|389.390.107||PTO|PTO|B||||||17|1|1|351.00|650.00|||4|
5251|ML|20|389.390.109||PTO|PTO|M||||||17|1|1|351.00|650.00|||4|
5252|ML|20|389.390.111||CRE|CRE|B||||||17|1|1|351.00|650.00|||4|
5253|ML|20|389.390.113||CRE|CRE|M||||||17|1|1|351.00|650.00|||4|
5254|ML|20|389.390.115||CAM|CAM|B||||||17|1|1|351.00|650.00|||4|
5255|ML|20|389.390.117||CAM|CAM|M||||||17|1|1|351.00|650.00|||4|
5256|ML|20|389.390.119||OUR|OUR|B||||||17|1|1|351.00|650.00|||4|
5257|ML|20|389.390.121||OUR|OUR|M||||||17|1|1|351.00|650.00|||4|
5258|ML|20|389.390.123||COB|COB|B||||||17|1|1|351.00|650.00|||4|
5259|ML|20|389.390.125||COB|COB|M||||||17|1|1|351.00|650.00|||4|
5260|ML|20|389.390.127||CHO|CHO|B||||||17|1|1|351.00|650.00|||4|
5261|ML|20|389.390.129||CHO|CHO|M||||||17|1|1|351.00|650.00|||4|
5262|ML|20|389.390.131||VAG|VAG|B||||||17|1|1|351.00|650.00|||4|
5263|ML|20|389.390.133||VAG|VAG|M||||||17|1|1|351.00|650.00|||4|
5264|ML|20|389.390.135||AZE|AZE|B||||||17|1|1|351.00|650.00|||4|
5265|ML|20|389.390.137||AZE|AZE|M||||||17|1|1|351.00|650.00|||4|
5266|ML|20|389.390.139||AMA|AMA|B||||||17|1|1|351.00|650.00|||4|
5267|ML|20|389.390.141||AMA|AMA|M||||||17|1|1|351.00|650.00|||4|
5268|ML|20|389.390.143||AES|AES|B||||||17|1|1|351.00|650.00|||4|
5269|ML|20|389.390.145||AES|AES|M||||||17|1|1|351.00|650.00|||4|
5270|ML|20|389.390.147||PRA|PRA|B||||||17|1|1|351.00|650.00|||4|
5271|ML|20|389.390.149||PRA|PRA|M||||||17|1|1|351.00|650.00|||4|
5272|ML|20|389.390.151||ROS|ROS|B||||||17|1|1|351.00|650.00|||4|
5273|ML|20|389.390.153||ROS|ROS|M||||||17|1|1|351.00|650.00|||4|
5274|ML|20|389.390.155||VER|VER|B||||||17|1|1|351.00|650.00|||4|
5275|ML|20|389.390.157||VER|VER|M||||||17|1|1|351.00|650.00|||4|
5276|ML|20|389.390.165||AZB|AZB|||||||17|1|1|351.00|650.00|||4|
5277|ML|20|389.390.167||DEN|DEN|||||||17|1|1|351.00|650.00|||4|
5278|ML|20|389.390.169||BLK|BLK|||||||17|1|1|351.00|650.00|||4|
5279|ML|20|389.390.171||ART|ART|||||||17|1|1|351.00|650.00|||4|
5280|ML|20|389.390.173||LIN|LIN|||||||17|1|1|351.00|650.00|||4|
5281|ML|20|389.390.175||HAL|HAL|||||||17|1|1|351.00|650.00|||4|
5282|ML|21|389.390.327||TBL|TBL|||||||17|1|1|475.20|880.00|||4|
5283|ML|21|389.390.328||TEA|TEA|||||||17|1|1|475.20|880.00|||4|
5284|ML|21|389.390.329||OAK|OAK|||||||17|1|1|475.20|880.00|||4|
5285|ML|21|389.390.330||JOP|JOP|||||||17|1|1|475.20|880.00|||4|
5286|ML|21|389.390.331||TBL|BCO|B||||||17|1|1|502.20|930.00|||4|
5287|ML|21|389.390.332||TBL|BCO|M||||||17|1|1|502.20|930.00|||4|
5288|ML|21|389.390.333||TBL|CCL|B||||||17|1|1|502.20|930.00|||4|
5289|ML|21|389.390.334||TBL|CCL|M||||||17|1|1|502.20|930.00|||4|
5290|ML|21|389.390.335||TBL|CME|B||||||17|1|1|502.20|930.00|||4|
5291|ML|21|389.390.336||TBL|CME|M||||||17|1|1|502.20|930.00|||4|
5292|ML|21|389.390.337||TBL|ANT|B||||||17|1|1|502.20|930.00|||4|
5293|ML|21|389.390.338||TBL|ANT|M||||||17|1|1|502.20|930.00|||4|
5294|ML|21|389.390.339||TBL|PTO|B||||||17|1|1|502.20|930.00|||4|
5295|ML|21|389.390.340||TBL|PTO|M||||||17|1|1|502.20|930.00|||4|
5296|ML|21|389.390.341||TBL|CRE|B||||||17|1|1|502.20|930.00|||4|
5297|ML|21|389.390.342||TBL|CRE|M||||||17|1|1|502.20|930.00|||4|
5298|ML|21|389.390.343||TBL|CAM|B||||||17|1|1|502.20|930.00|||4|
5299|ML|21|389.390.344||TBL|CAM|M||||||17|1|1|502.20|930.00|||4|
5300|ML|21|389.390.345||TBL|OUR|B||||||17|1|1|502.20|930.00|||4|
5301|ML|21|389.390.346||TBL|OUR|M||||||17|1|1|502.20|930.00|||4|
5302|ML|21|389.390.347||TBL|COB|B||||||17|1|1|502.20|930.00|||4|
5303|ML|21|389.390.348||TBL|COB|M||||||17|1|1|502.20|930.00|||4|
5304|ML|21|389.390.349||TBL|CHO|B||||||17|1|1|502.20|930.00|||4|
5305|ML|21|389.390.350||TBL|CHO|M||||||17|1|1|502.20|930.00|||4|
5306|ML|21|389.390.351||TBL|VAG|B||||||17|1|1|502.20|930.00|||4|
5307|ML|21|389.390.352||TBL|VAG|M||||||17|1|1|502.20|930.00|||4|
5308|ML|21|389.390.353||TBL|AZE|B||||||17|1|1|502.20|930.00|||4|
5309|ML|21|389.390.354||TBL|AZE|M||||||17|1|1|502.20|930.00|||4|
5310|ML|21|389.390.355||TBL|AMA|B||||||17|1|1|502.20|930.00|||4|
5311|ML|21|389.390.356||TBL|AMA|M||||||17|1|1|502.20|930.00|||4|
5312|ML|21|389.390.357||TBL|AES|B||||||17|1|1|502.20|930.00|||4|
5313|ML|21|389.390.358||TBL|AES|M||||||17|1|1|502.20|930.00|||4|
5314|ML|21|389.390.359||TBL|PRA|B||||||17|1|1|502.20|930.00|||4|
5315|ML|21|389.390.360||TBL|PRA|M||||||17|1|1|502.20|930.00|||4|
5316|ML|21|389.390.361||TBL|ROS|B||||||17|1|1|502.20|930.00|||4|
5317|ML|21|389.390.362||TBL|ROS|M||||||17|1|1|502.20|930.00|||4|
5318|ML|21|389.390.363||TBL|VER|B||||||17|1|1|502.20|930.00|||4|
5319|ML|21|389.390.364||TBL|VER|M||||||17|1|1|502.20|930.00|||4|
5320|ML|21|389.390.365||TBL|AZB|||||||17|1|1|502.20|930.00|||4|
5321|ML|21|389.390.366||TBL|DEN|||||||17|1|1|502.20|930.00|||4|
5322|ML|21|389.390.367||TBL|BLK|||||||17|1|1|502.20|930.00|||4|
5323|ML|21|389.390.368||TBL|ART|||||||17|1|1|502.20|930.00|||4|
5324|ML|21|389.390.369||TBL|LIN|||||||17|1|1|502.20|930.00|||4|
5325|ML|21|389.390.370||TBL|HAL|||||||17|1|1|502.20|930.00|||4|
5326|ML|21|389.390.92||BCO|BCO|B||||||17|1|1|523.80|970.00|||4|
5327|ML|21|389.390.94||BCO|BCO|M||||||17|1|1|523.80|970.00|||4|
5328|ML|21|389.390.96||CCL|CCL|B||||||17|1|1|523.80|970.00|||4|
5329|ML|21|389.390.98||CCL|CCL|M||||||17|1|1|523.80|970.00|||4|
5330|ML|21|389.390.100||CME|CME|B||||||17|1|1|523.80|970.00|||4|
5331|ML|21|389.390.102||CME|CME|M||||||17|1|1|523.80|970.00|||4|
5332|ML|21|389.390.104||ANT|ANT|B||||||17|1|1|523.80|970.00|||4|
5333|ML|21|389.390.106||ANT|ANT|M||||||17|1|1|523.80|970.00|||4|
5334|ML|21|389.390.108||PTO|PTO|B||||||17|1|1|523.80|970.00|||4|
5335|ML|21|389.390.110||PTO|PTO|M||||||17|1|1|523.80|970.00|||4|
5336|ML|21|389.390.112||CRE|CRE|B||||||17|1|1|523.80|970.00|||4|
5337|ML|21|389.390.114||CRE|CRE|M||||||17|1|1|523.80|970.00|||4|
5338|ML|21|389.390.116||CAM|CAM|B||||||17|1|1|523.80|970.00|||4|
5339|ML|21|389.390.118||CAM|CAM|M||||||17|1|1|523.80|970.00|||4|
5340|ML|21|389.390.120||OUR|OUR|B||||||17|1|1|523.80|970.00|||4|
5341|ML|21|389.390.122||OUR|OUR|M||||||17|1|1|523.80|970.00|||4|
5342|ML|21|389.390.124||COB|COB|B||||||17|1|1|523.80|970.00|||4|
5343|ML|21|389.390.126||COB|COB|M||||||17|1|1|523.80|970.00|||4|
5344|ML|21|389.390.128||CHO|CHO|B||||||17|1|1|523.80|970.00|||4|
5345|ML|21|389.390.130||CHO|CHO|M||||||17|1|1|523.80|970.00|||4|
5346|ML|21|389.390.132||VAG|VAG|B||||||17|1|1|523.80|970.00|||4|
5347|ML|21|389.390.134||VAG|VAG|M||||||17|1|1|523.80|970.00|||4|
5348|ML|21|389.390.136||AZE|AZE|B||||||17|1|1|523.80|970.00|||4|
5349|ML|21|389.390.138||AZE|AZE|M||||||17|1|1|523.80|970.00|||4|
5350|ML|21|389.390.140||AMA|AMA|B||||||17|1|1|523.80|970.00|||4|
5351|ML|21|389.390.142||AMA|AMA|M||||||17|1|1|523.80|970.00|||4|
5352|ML|21|389.390.144||AES|AES|B||||||17|1|1|523.80|970.00|||4|
5353|ML|21|389.390.146||AES|AES|M||||||17|1|1|523.80|970.00|||4|
5354|ML|21|389.390.148||PRA|PRA|B||||||17|1|1|523.80|970.00|||4|
5355|ML|21|389.390.150||PRA|PRA|M||||||17|1|1|523.80|970.00|||4|
5356|ML|21|389.390.152||ROS|ROS|B||||||17|1|1|523.80|970.00|||4|
5357|ML|21|389.390.154||ROS|ROS|M||||||17|1|1|523.80|970.00|||4|
5358|ML|21|389.390.156||VER|VER|B||||||17|1|1|523.80|970.00|||4|
5359|ML|21|389.390.158||VER|VER|M||||||17|1|1|523.80|970.00|||4|
5360|ML|21|389.390.166||AZB|AZB|||||||17|1|1|523.80|970.00|||4|
5361|ML|21|389.390.168||DEN|DEN|||||||17|1|1|523.80|970.00|||4|
5362|ML|21|389.390.170||BLK|BLK|||||||17|1|1|523.80|970.00|||4|
5363|ML|21|389.390.172||ART|ART|||||||17|1|1|523.80|970.00|||4|
5364|ML|21|389.390.174||LIN|LIN|||||||17|1|1|523.80|970.00|||4|
5365|ML|21|389.390.176||HAL|HAL|||||||17|1|1|523.80|970.00|||4|
5366|ML|22|389.391.197||TBL|TBL|||||||17|1|1|410.40|760.00|||4|
5367|ML|22|389.391.198||TEA|TEA|||||||17|1|1|410.40|760.00|||4|
5368|ML|22|389.391.199||OAK|OAK|||||||17|1|1|410.40|760.00|||4|
5369|ML|22|389.391.200||JOP|JOP|||||||17|1|1|410.40|760.00|||4|
5370|ML|22|389.391.201||TBL|BCO|B||||||17|1|1|437.40|810.00|||4|
5371|ML|22|389.391.202||TBL|BCO|M||||||17|1|1|437.40|810.00|||4|
5372|ML|22|389.391.203||TBL|CCL|B||||||17|1|1|437.40|810.00|||4|
5373|ML|22|389.391.204||TBL|CCL|M||||||17|1|1|437.40|810.00|||4|
5374|ML|22|389.391.205||TBL|CME|B||||||17|1|1|437.40|810.00|||4|
5375|ML|22|389.391.206||TBL|CME|M||||||17|1|1|437.40|810.00|||4|
5376|ML|22|389.391.207||TBL|ANT|B||||||17|1|1|437.40|810.00|||4|
5377|ML|22|389.391.208||TBL|ANT|M||||||17|1|1|437.40|810.00|||4|
5378|ML|22|389.391.209||TBL|PTO|B||||||17|1|1|437.40|810.00|||4|
5379|ML|22|389.391.210||TBL|PTO|M||||||17|1|1|437.40|810.00|||4|
5380|ML|22|389.391.211||TBL|CRE|B||||||17|1|1|437.40|810.00|||4|
5381|ML|22|389.391.212||TBL|CRE|M||||||17|1|1|437.40|810.00|||4|
5382|ML|22|389.391.213||TBL|CAM|B||||||17|1|1|437.40|810.00|||4|
5383|ML|22|389.391.214||TBL|CAM|M||||||17|1|1|437.40|810.00|||4|
5384|ML|22|389.391.215||TBL|OUR|B||||||17|1|1|437.40|810.00|||4|
5385|ML|22|389.391.216||TBL|OUR|M||||||17|1|1|437.40|810.00|||4|
5386|ML|22|389.391.217||TBL|COB|B||||||17|1|1|437.40|810.00|||4|
5387|ML|22|389.391.218||TBL|COB|M||||||17|1|1|437.40|810.00|||4|
5388|ML|22|389.391.219||TBL|CHO|B||||||17|1|1|437.40|810.00|||4|
5389|ML|22|389.391.220||TBL|CHO|M||||||17|1|1|437.40|810.00|||4|
5390|ML|22|389.391.221||TBL|VAG|B||||||17|1|1|437.40|810.00|||4|
5391|ML|22|389.391.222||TBL|VAG|M||||||17|1|1|437.40|810.00|||4|
5392|ML|22|389.391.223||TBL|AZE|B||||||17|1|1|437.40|810.00|||4|
5393|ML|22|389.391.224||TBL|AZE|M||||||17|1|1|437.40|810.00|||4|
5394|ML|22|389.391.225||TBL|AMA|B||||||17|1|1|437.40|810.00|||4|
5395|ML|22|389.391.226||TBL|AMA|M||||||17|1|1|437.40|810.00|||4|
5396|ML|22|389.391.227||TBL|AES|B||||||17|1|1|437.40|810.00|||4|
5397|ML|22|389.391.228||TBL|AES|M||||||17|1|1|437.40|810.00|||4|
5398|ML|22|389.391.229||TBL|PRA|B||||||17|1|1|437.40|810.00|||4|
5399|ML|22|389.391.230||TBL|PRA|M||||||17|1|1|437.40|810.00|||4|
5400|ML|22|389.391.231||TBL|ROS|B||||||17|1|1|437.40|810.00|||4|
5401|ML|22|389.391.232||TBL|ROS|M||||||17|1|1|437.40|810.00|||4|
5402|ML|22|389.391.233||TBL|VER|B||||||17|1|1|437.40|810.00|||4|
5403|ML|22|389.391.234||TBL|VER|M||||||17|1|1|437.40|810.00|||4|
5404|ML|22|389.391.235||TBL|AZB|||||||17|1|1|437.40|810.00|||4|
5405|ML|22|389.391.236||TBL|DEN|||||||17|1|1|437.40|810.00|||4|
5406|ML|22|389.391.237||TBL|BLK|||||||17|1|1|437.40|810.00|||4|
5407|ML|22|389.391.238||TBL|ART|||||||17|1|1|437.40|810.00|||4|
5408|ML|22|389.391.239||TBL|LIN|||||||17|1|1|437.40|810.00|||4|
5409|ML|22|389.391.240||TBL|HAL|||||||17|1|1|437.40|810.00|||4|
5410|ML|22|389.391.91||BCO|BCO|B||||||17|1|1|459.00|850.00|||4|
5411|ML|22|389.391.93||BCO|BCO|M||||||17|1|1|459.00|850.00|||4|
5412|ML|22|389.391.95||CCL|CCL|B||||||17|1|1|459.00|850.00|||4|
5413|ML|22|389.391.97||CCL|CCL|M||||||17|1|1|459.00|850.00|||4|
5414|ML|22|389.391.99||CME|CME|B||||||17|1|1|459.00|850.00|||4|
5415|ML|22|389.391.101||CME|CME|M||||||17|1|1|459.00|850.00|||4|
5416|ML|22|389.391.103||ANT|ANT|B||||||17|1|1|459.00|850.00|||4|
5417|ML|22|389.391.105||ANT|ANT|M||||||17|1|1|459.00|850.00|||4|
5418|ML|22|389.391.107||PTO|PTO|B||||||17|1|1|459.00|850.00|||4|
5419|ML|22|389.391.109||PTO|PTO|M||||||17|1|1|459.00|850.00|||4|
5420|ML|22|389.391.111||CRE|CRE|B||||||17|1|1|459.00|850.00|||4|
5421|ML|22|389.391.113||CRE|CRE|M||||||17|1|1|459.00|850.00|||4|
5422|ML|22|389.391.115||CAM|CAM|B||||||17|1|1|459.00|850.00|||4|
5423|ML|22|389.391.117||CAM|CAM|M||||||17|1|1|459.00|850.00|||4|
5424|ML|22|389.391.119||OUR|OUR|B||||||17|1|1|459.00|850.00|||4|
5425|ML|22|389.391.121||OUR|OUR|M||||||17|1|1|459.00|850.00|||4|
5426|ML|22|389.391.123||COB|COB|B||||||17|1|1|459.00|850.00|||4|
5427|ML|22|389.391.125||COB|COB|M||||||17|1|1|459.00|850.00|||4|
5428|ML|22|389.391.127||CHO|CHO|B||||||17|1|1|459.00|850.00|||4|
5429|ML|22|389.391.129||CHO|CHO|M||||||17|1|1|459.00|850.00|||4|
5430|ML|22|389.391.131||VAG|VAG|B||||||17|1|1|459.00|850.00|||4|
5431|ML|22|389.391.133||VAG|VAG|M||||||17|1|1|459.00|850.00|||4|
5432|ML|22|389.391.135||AZE|AZE|B||||||17|1|1|459.00|850.00|||4|
5433|ML|22|389.391.137||AZE|AZE|M||||||17|1|1|459.00|850.00|||4|
5434|ML|22|389.391.139||AMA|AMA|B||||||17|1|1|459.00|850.00|||4|
5435|ML|22|389.391.141||AMA|AMA|M||||||17|1|1|459.00|850.00|||4|
5436|ML|22|389.391.143||AES|AES|B||||||17|1|1|459.00|850.00|||4|
5437|ML|22|389.391.145||AES|AES|M||||||17|1|1|459.00|850.00|||4|
5438|ML|22|389.391.147||PRA|PRA|B||||||17|1|1|459.00|850.00|||4|
5439|ML|22|389.391.149||PRA|PRA|M||||||17|1|1|459.00|850.00|||4|
5440|ML|22|389.391.151||ROS|ROS|B||||||17|1|1|459.00|850.00|||4|
5441|ML|22|389.391.153||ROS|ROS|M||||||17|1|1|459.00|850.00|||4|
5442|ML|22|389.391.155||VER|VER|B||||||17|1|1|459.00|850.00|||4|
5443|ML|22|389.391.157||VER|VER|M||||||17|1|1|459.00|850.00|||4|
5444|ML|22|389.391.165||AZB|AZB|||||||17|1|1|459.00|850.00|||4|
5445|ML|22|389.391.167||DEN|DEN|||||||17|1|1|459.00|850.00|||4|
5446|ML|22|389.391.169||BLK|BLK|||||||17|1|1|459.00|850.00|||4|
5447|ML|22|389.391.171||ART|ART|||||||17|1|1|459.00|850.00|||4|
5448|ML|22|389.391.173||LIN|LIN|||||||17|1|1|459.00|850.00|||4|
5449|ML|22|389.391.175||HAL|HAL|||||||17|1|1|459.00|850.00|||4|
5450|ML|23|389.391.327||TBL|TBL|||||||17|1|1|583.20|1080.00|||4|
5451|ML|23|389.391.328||TEA|TEA|||||||17|1|1|583.20|1080.00|||4|
5452|ML|23|389.391.329||OAK|OAK|||||||17|1|1|583.20|1080.00|||4|
5453|ML|23|389.391.330||JOP|JOP|||||||17|1|1|583.20|1080.00|||4|
5454|ML|23|389.391.331||TBL|BCO|B||||||17|1|1|610.20|1130.00|||4|
5455|ML|23|389.391.332||TBL|BCO|M||||||17|1|1|610.20|1130.00|||4|
5456|ML|23|389.391.333||TBL|CCL|B||||||17|1|1|610.20|1130.00|||4|
5457|ML|23|389.391.334||TBL|CCL|M||||||17|1|1|610.20|1130.00|||4|
5458|ML|23|389.391.335||TBL|CME|B||||||17|1|1|610.20|1130.00|||4|
5459|ML|23|389.391.336||TBL|CME|M||||||17|1|1|610.20|1130.00|||4|
5460|ML|23|389.391.337||TBL|ANT|B||||||17|1|1|610.20|1130.00|||4|
5461|ML|23|389.391.338||TBL|ANT|M||||||17|1|1|610.20|1130.00|||4|
5462|ML|23|389.391.339||TBL|PTO|B||||||17|1|1|610.20|1130.00|||4|
5463|ML|23|389.391.340||TBL|PTO|M||||||17|1|1|610.20|1130.00|||4|
5464|ML|23|389.391.341||TBL|CRE|B||||||17|1|1|610.20|1130.00|||4|
5465|ML|23|389.391.342||TBL|CRE|M||||||17|1|1|610.20|1130.00|||4|
5466|ML|23|389.391.343||TBL|CAM|B||||||17|1|1|610.20|1130.00|||4|
5467|ML|23|389.391.344||TBL|CAM|M||||||17|1|1|610.20|1130.00|||4|
5468|ML|23|389.391.345||TBL|OUR|B||||||17|1|1|610.20|1130.00|||4|
5469|ML|23|389.391.346||TBL|OUR|M||||||17|1|1|610.20|1130.00|||4|
5470|ML|23|389.391.347||TBL|COB|B||||||17|1|1|610.20|1130.00|||4|
5471|ML|23|389.391.348||TBL|COB|M||||||17|1|1|610.20|1130.00|||4|
5472|ML|23|389.391.349||TBL|CHO|B||||||17|1|1|610.20|1130.00|||4|
5473|ML|23|389.391.350||TBL|CHO|M||||||17|1|1|610.20|1130.00|||4|
5474|ML|23|389.391.351||TBL|VAG|B||||||17|1|1|610.20|1130.00|||4|
5475|ML|23|389.391.352||TBL|VAG|M||||||17|1|1|610.20|1130.00|||4|
5476|ML|23|389.391.353||TBL|AZE|B||||||17|1|1|610.20|1130.00|||4|
5477|ML|23|389.391.354||TBL|AZE|M||||||17|1|1|610.20|1130.00|||4|
5478|ML|23|389.391.355||TBL|AMA|B||||||17|1|1|610.20|1130.00|||4|
5479|ML|23|389.391.356||TBL|AMA|M||||||17|1|1|610.20|1130.00|||4|
5480|ML|23|389.391.357||TBL|AES|B||||||17|1|1|610.20|1130.00|||4|
5481|ML|23|389.391.358||TBL|AES|M||||||17|1|1|610.20|1130.00|||4|
5482|ML|23|389.391.359||TBL|PRA|B||||||17|1|1|610.20|1130.00|||4|
5483|ML|23|389.391.360||TBL|PRA|M||||||17|1|1|610.20|1130.00|||4|
5484|ML|23|389.391.361||TBL|ROS|B||||||17|1|1|610.20|1130.00|||4|
5485|ML|23|389.391.362||TBL|ROS|M||||||17|1|1|610.20|1130.00|||4|
5486|ML|23|389.391.363||TBL|VER|B||||||17|1|1|610.20|1130.00|||4|
5487|ML|23|389.391.364||TBL|VER|M||||||17|1|1|610.20|1130.00|||4|
5488|ML|23|389.391.365||TBL|AZB|||||||17|1|1|610.20|1130.00|||4|
5489|ML|23|389.391.366||TBL|DEN|||||||17|1|1|610.20|1130.00|||4|
5490|ML|23|389.391.367||TBL|BLK|||||||17|1|1|610.20|1130.00|||4|
5491|ML|23|389.391.368||TBL|ART|||||||17|1|1|610.20|1130.00|||4|
5492|ML|23|389.391.369||TBL|LIN|||||||17|1|1|610.20|1130.00|||4|
5493|ML|23|389.391.370||TBL|HAL|||||||17|1|1|610.20|1130.00|||4|
5494|ML|23|389.391.92||BCO|BCO|B||||||17|1|1|631.80|1170.00|||4|
5495|ML|23|389.391.94||BCO|BCO|M||||||17|1|1|631.80|1170.00|||4|
5496|ML|23|389.391.96||CCL|CCL|B||||||17|1|1|631.80|1170.00|||4|
5497|ML|23|389.391.98||CCL|CCL|M||||||17|1|1|631.80|1170.00|||4|
5498|ML|23|389.391.100||CME|CME|B||||||17|1|1|631.80|1170.00|||4|
5499|ML|23|389.391.102||CME|CME|M||||||17|1|1|631.80|1170.00|||4|
5500|ML|23|389.391.104||ANT|ANT|B||||||17|1|1|631.80|1170.00|||4|
5501|ML|23|389.391.106||ANT|ANT|M||||||17|1|1|631.80|1170.00|||4|
5502|ML|23|389.391.108||PTO|PTO|B||||||17|1|1|631.80|1170.00|||4|
5503|ML|23|389.391.110||PTO|PTO|M||||||17|1|1|631.80|1170.00|||4|
5504|ML|23|389.391.112||CRE|CRE|B||||||17|1|1|631.80|1170.00|||4|
5505|ML|23|389.391.114||CRE|CRE|M||||||17|1|1|631.80|1170.00|||4|
5506|ML|23|389.391.116||CAM|CAM|B||||||17|1|1|631.80|1170.00|||4|
5507|ML|23|389.391.118||CAM|CAM|M||||||17|1|1|631.80|1170.00|||4|
5508|ML|23|389.391.120||OUR|OUR|B||||||17|1|1|631.80|1170.00|||4|
5509|ML|23|389.391.122||OUR|OUR|M||||||17|1|1|631.80|1170.00|||4|
5510|ML|23|389.391.124||COB|COB|B||||||17|1|1|631.80|1170.00|||4|
5511|ML|23|389.391.126||COB|COB|M||||||17|1|1|631.80|1170.00|||4|
5512|ML|23|389.391.128||CHO|CHO|B||||||17|1|1|631.80|1170.00|||4|
5513|ML|23|389.391.130||CHO|CHO|M||||||17|1|1|631.80|1170.00|||4|
5514|ML|23|389.391.132||VAG|VAG|B||||||17|1|1|631.80|1170.00|||4|
5515|ML|23|389.391.134||VAG|VAG|M||||||17|1|1|631.80|1170.00|||4|
5516|ML|23|389.391.136||AZE|AZE|B||||||17|1|1|631.80|1170.00|||4|
5517|ML|23|389.391.138||AZE|AZE|M||||||17|1|1|631.80|1170.00|||4|
5518|ML|23|389.391.140||AMA|AMA|B||||||17|1|1|631.80|1170.00|||4|
5519|ML|23|389.391.142||AMA|AMA|M||||||17|1|1|631.80|1170.00|||4|
5520|ML|23|389.391.144||AES|AES|B||||||17|1|1|631.80|1170.00|||4|
5521|ML|23|389.391.146||AES|AES|M||||||17|1|1|631.80|1170.00|||4|
5522|ML|23|389.391.148||PRA|PRA|B||||||17|1|1|631.80|1170.00|||4|
5523|ML|23|389.391.150||PRA|PRA|M||||||17|1|1|631.80|1170.00|||4|
5524|ML|23|389.391.152||ROS|ROS|B||||||17|1|1|631.80|1170.00|||4|
5525|ML|23|389.391.154||ROS|ROS|M||||||17|1|1|631.80|1170.00|||4|
5526|ML|23|389.391.156||VER|VER|B||||||17|1|1|631.80|1170.00|||4|
5527|ML|23|389.391.158||VER|VER|M||||||17|1|1|631.80|1170.00|||4|
5528|ML|23|389.391.166||AZB|AZB|||||||17|1|1|631.80|1170.00|||4|
5529|ML|23|389.391.168||DEN|DEN|||||||17|1|1|631.80|1170.00|||4|
5530|ML|23|389.391.170||BLK|BLK|||||||17|1|1|631.80|1170.00|||4|
5531|ML|23|389.391.172||ART|ART|||||||17|1|1|631.80|1170.00|||4|
5532|ML|23|389.391.174||LIN|LIN|||||||17|1|1|631.80|1170.00|||4|
5533|ML|23|389.391.176||HAL|HAL|||||||17|1|1|631.80|1170.00|||4|
5534|ML|24|392.393.394||TBR|TBR|||||||4|1|1|92.88|172.00|||5|
5535|ML|24|392.393.198||TEA|TEA|||||||4|1|1|92.88|172.00|||5|
5536|ML|24|392.393.199||OAK|OAK|||||||4|1|1|92.88|172.00|||5|
5537|ML|24|392.393.200||JOP|JOP|||||||4|1|1|92.88|172.00|||5|
5538|ML|24|392.393.395||TBR|BCO|B||||||4|1|1|136.08|252.00|||5|
5539|ML|24|392.393.396||TBR|BCO|M||||||4|1|1|136.08|252.00|||5|
5540|ML|24|392.393.397||TBR|CCL|B||||||4|1|1|136.08|252.00|||5|
5541|ML|24|392.393.398||TBR|CCL|M||||||4|1|1|136.08|252.00|||5|
5542|ML|24|392.393.399||TBR|CME|B||||||4|1|1|136.08|252.00|||5|
5543|ML|24|392.393.400||TBR|CME|M||||||4|1|1|136.08|252.00|||5|
5544|ML|24|392.393.401||TBR|ANT|B||||||4|1|1|136.08|252.00|||5|
5545|ML|24|392.393.402||TBR|ANT|M||||||4|1|1|136.08|252.00|||5|
5546|ML|24|392.393.403||TBR|PTO|B||||||4|1|1|136.08|252.00|||5|
5547|ML|24|392.393.404||TBR|PTO|M||||||4|1|1|136.08|252.00|||5|
5548|ML|24|392.393.405||TBR|CRE|B||||||4|1|1|136.08|252.00|||5|
5549|ML|24|392.393.406||TBR|CRE|M||||||4|1|1|136.08|252.00|||5|
5550|ML|24|392.393.407||TBR|CAM|B||||||4|1|1|136.08|252.00|||5|
5551|ML|24|392.393.408||TBR|CAM|M||||||4|1|1|136.08|252.00|||5|
5552|ML|24|392.393.409||TBR|OUR|B||||||4|1|1|136.08|252.00|||5|
5553|ML|24|392.393.410||TBR|OUR|M||||||4|1|1|136.08|252.00|||5|
5554|ML|24|392.393.411||TBR|COB|B||||||4|1|1|136.08|252.00|||5|
5555|ML|24|392.393.412||TBR|COB|M||||||4|1|1|136.08|252.00|||5|
5556|ML|24|392.393.413||TBR|CHO|B||||||4|1|1|136.08|252.00|||5|
5557|ML|24|392.393.414||TBR|CHO|M||||||4|1|1|136.08|252.00|||5|
5558|ML|24|392.393.415||TBR|VAG|B||||||4|1|1|136.08|252.00|||5|
5559|ML|24|392.393.416||TBR|VAG|M||||||4|1|1|136.08|252.00|||5|
5560|ML|24|392.393.417||TBR|AZE|B||||||4|1|1|136.08|252.00|||5|
5561|ML|24|392.393.418||TBR|AZE|M||||||4|1|1|136.08|252.00|||5|
5562|ML|24|392.393.419||TBR|AMA|B||||||4|1|1|136.08|252.00|||5|
5563|ML|24|392.393.420||TBR|AMA|M||||||4|1|1|136.08|252.00|||5|
5564|ML|24|392.393.421||TBR|AES|B||||||4|1|1|136.08|252.00|||5|
5565|ML|24|392.393.422||TBR|AES|M||||||4|1|1|136.08|252.00|||5|
5566|ML|24|392.393.423||TBR|PRA|B||||||4|1|1|136.08|252.00|||5|
5567|ML|24|392.393.424||TBR|PRA|M||||||4|1|1|136.08|252.00|||5|
5568|ML|24|392.393.425||TBR|ROS|B||||||4|1|1|136.08|252.00|||5|
5569|ML|24|392.393.426||TBR|ROS|M||||||4|1|1|136.08|252.00|||5|
5570|ML|24|392.393.427||TBR|VER|B||||||4|1|1|136.08|252.00|||5|
5571|ML|24|392.393.428||TBR|VER|M||||||4|1|1|136.08|252.00|||5|
5572|ML|24|392.393.429||TBR|AZB|||||||4|1|1|136.08|252.00|||5|
5573|ML|24|392.393.430||TBR|DEN|||||||4|1|1|136.08|252.00|||5|
5574|ML|24|392.393.431||TBR|BLK|||||||4|1|1|136.08|252.00|||5|
5575|ML|24|392.393.432||TBR|ART|||||||4|1|1|136.08|252.00|||5|
5576|ML|24|392.393.433||TBR|LIN|||||||4|1|1|136.08|252.00|||5|
5577|ML|24|392.393.434||TBR|HAL|||||||4|1|1|136.08|252.00|||5|
5578|ML|24|392.393.435||BCO|BCO|B||||||4|1|1|157.68|292.00|||5|
5579|ML|24|392.393.436||BCO|BCO|M||||||4|1|1|157.68|292.00|||5|
5580|ML|24|392.393.437||CCL|CCL|B||||||4|1|1|157.68|292.00|||5|
5581|ML|24|392.393.438||CCL|CCL|M||||||4|1|1|157.68|292.00|||5|
5582|ML|24|392.393.439||CME|CME|B||||||4|1|1|157.68|292.00|||5|
5583|ML|24|392.393.440||CME|CME|M||||||4|1|1|157.68|292.00|||5|
5584|ML|24|392.393.441||ANT|ANT|B||||||4|1|1|157.68|292.00|||5|
5585|ML|24|392.393.442||ANT|ANT|M||||||4|1|1|157.68|292.00|||5|
5586|ML|24|392.393.443||PTO|PTO|B||||||4|1|1|157.68|292.00|||5|
5587|ML|24|392.393.444||PTO|PTO|M||||||4|1|1|157.68|292.00|||5|
5588|ML|24|392.393.445||CRE|CRE|B||||||4|1|1|157.68|292.00|||5|
5589|ML|24|392.393.446||CRE|CRE|M||||||4|1|1|157.68|292.00|||5|
5590|ML|24|392.393.447||CAM|CAM|B||||||4|1|1|157.68|292.00|||5|
5591|ML|24|392.393.448||CAM|CAM|M||||||4|1|1|157.68|292.00|||5|
5592|ML|24|392.393.449||OUR|OUR|B||||||4|1|1|157.68|292.00|||5|
5593|ML|24|392.393.450||OUR|OUR|M||||||4|1|1|157.68|292.00|||5|
5594|ML|24|392.393.451||COB|COB|B||||||4|1|1|157.68|292.00|||5|
5595|ML|24|392.393.452||COB|COB|M||||||4|1|1|157.68|292.00|||5|
5596|ML|24|392.393.453||CHO|CHO|B||||||4|1|1|157.68|292.00|||5|
5597|ML|24|392.393.454||CHO|CHO|M||||||4|1|1|157.68|292.00|||5|
5598|ML|24|392.393.455||VAG|VAG|B||||||4|1|1|157.68|292.00|||5|
5599|ML|24|392.393.456||VAG|VAG|M||||||4|1|1|157.68|292.00|||5|
5600|ML|24|392.393.457||AZE|AZE|B||||||4|1|1|157.68|292.00|||5|
5601|ML|24|392.393.458||AZE|AZE|M||||||4|1|1|157.68|292.00|||5|
5602|ML|24|392.393.459||AMA|AMA|B||||||4|1|1|157.68|292.00|||5|
5603|ML|24|392.393.460||AMA|AMA|M||||||4|1|1|157.68|292.00|||5|
5604|ML|24|392.393.461||AES|AES|B||||||4|1|1|157.68|292.00|||5|
5605|ML|24|392.393.462||AES|AES|M||||||4|1|1|157.68|292.00|||5|
5606|ML|24|392.393.463||PRA|PRA|B||||||4|1|1|157.68|292.00|||5|
5607|ML|24|392.393.464||PRA|PRA|M||||||4|1|1|157.68|292.00|||5|
5608|ML|24|392.393.465||ROS|ROS|B||||||4|1|1|157.68|292.00|||5|
5609|ML|24|392.393.466||ROS|ROS|M||||||4|1|1|157.68|292.00|||5|
5610|ML|24|392.393.467||VER|VER|B||||||4|1|1|157.68|292.00|||5|
5611|ML|24|392.393.468||VER|VER|M||||||4|1|1|157.68|292.00|||5|
5612|ML|24|392.393.469||AZB|AZB|||||||4|1|1|157.68|292.00|||5|
5613|ML|24|392.393.470||DEN|DEN|||||||4|1|1|157.68|292.00|||5|
5614|ML|24|392.393.471||BLK|BLK|||||||4|1|1|157.68|292.00|||5|
5615|ML|24|392.393.472||ART|ART|||||||4|1|1|157.68|292.00|||5|
5616|ML|24|392.393.473||LIN|LIN|||||||4|1|1|157.68|292.00|||5|
5617|ML|24|392.393.474||HAL|HAL|||||||4|1|1|157.68|292.00|||5|
5618|ML|25|392.393.475||TBR|TBR|||||||4|1|1|92.88|172.00|||5|
5619|ML|25|392.393.242||TEA|TEA|||||||4|1|1|92.88|172.00|||5|
5620|ML|25|392.393.243||OAK|OAK|||||||4|1|1|92.88|172.00|||5|
5621|ML|25|392.393.244||JOP|JOP|||||||4|1|1|92.88|172.00|||5|
5622|ML|25|392.393.476||TBR|BCO|B||||||4|1|1|136.08|252.00|||5|
5623|ML|25|392.393.477||TBR|BCO|M||||||4|1|1|136.08|252.00|||5|
5624|ML|25|392.393.478||TBR|CCL|B||||||4|1|1|136.08|252.00|||5|
5625|ML|25|392.393.479||TBR|CCL|M||||||4|1|1|136.08|252.00|||5|
5626|ML|25|392.393.480||TBR|CME|B||||||4|1|1|136.08|252.00|||5|
5627|ML|25|392.393.481||TBR|CME|M||||||4|1|1|136.08|252.00|||5|
5628|ML|25|392.393.482||TBR|ANT|B||||||4|1|1|136.08|252.00|||5|
5629|ML|25|392.393.483||TBR|ANT|M||||||4|1|1|136.08|252.00|||5|
5630|ML|25|392.393.484||TBR|PTO|B||||||4|1|1|136.08|252.00|||5|
5631|ML|25|392.393.485||TBR|PTO|M||||||4|1|1|136.08|252.00|||5|
5632|ML|25|392.393.486||TBR|CRE|B||||||4|1|1|136.08|252.00|||5|
5633|ML|25|392.393.487||TBR|CRE|M||||||4|1|1|136.08|252.00|||5|
5634|ML|25|392.393.488||TBR|CAM|B||||||4|1|1|136.08|252.00|||5|
5635|ML|25|392.393.489||TBR|CAM|M||||||4|1|1|136.08|252.00|||5|
5636|ML|25|392.393.490||TBR|OUR|B||||||4|1|1|136.08|252.00|||5|
5637|ML|25|392.393.491||TBR|OUR|M||||||4|1|1|136.08|252.00|||5|
5638|ML|25|392.393.492||TBR|COB|B||||||4|1|1|136.08|252.00|||5|
5639|ML|25|392.393.493||TBR|COB|M||||||4|1|1|136.08|252.00|||5|
5640|ML|25|392.393.494||TBR|CHO|B||||||4|1|1|136.08|252.00|||5|
5641|ML|25|392.393.495||TBR|CHO|M||||||4|1|1|136.08|252.00|||5|
5642|ML|25|392.393.496||TBR|VAG|B||||||4|1|1|136.08|252.00|||5|
5643|ML|25|392.393.497||TBR|VAG|M||||||4|1|1|136.08|252.00|||5|
5644|ML|25|392.393.498||TBR|AZE|B||||||4|1|1|136.08|252.00|||5|
5645|ML|25|392.393.499||TBR|AZE|M||||||4|1|1|136.08|252.00|||5|
5646|ML|25|392.393.500||TBR|AMA|B||||||4|1|1|136.08|252.00|||5|
5647|ML|25|392.393.501||TBR|AMA|M||||||4|1|1|136.08|252.00|||5|
5648|ML|25|392.393.502||TBR|AES|B||||||4|1|1|136.08|252.00|||5|
5649|ML|25|392.393.503||TBR|AES|M||||||4|1|1|136.08|252.00|||5|
5650|ML|25|392.393.504||TBR|PRA|B||||||4|1|1|136.08|252.00|||5|
5651|ML|25|392.393.505||TBR|PRA|M||||||4|1|1|136.08|252.00|||5|
5652|ML|25|392.393.506||TBR|ROS|B||||||4|1|1|136.08|252.00|||5|
5653|ML|25|392.393.507||TBR|ROS|M||||||4|1|1|136.08|252.00|||5|
5654|ML|25|392.393.508||TBR|VER|B||||||4|1|1|136.08|252.00|||5|
5655|ML|25|392.393.509||TBR|VER|M||||||4|1|1|136.08|252.00|||5|
5656|ML|25|392.393.510||TBR|AZB|||||||4|1|1|136.08|252.00|||5|
5657|ML|25|392.393.511||TBR|DEN|||||||4|1|1|136.08|252.00|||5|
5658|ML|25|392.393.512||TBR|BLK|||||||4|1|1|136.08|252.00|||5|
5659|ML|25|392.393.513||TBR|ART|||||||4|1|1|136.08|252.00|||5|
5660|ML|25|392.393.514||TBR|LIN|||||||4|1|1|136.08|252.00|||5|
5661|ML|25|392.393.515||TBR|HAL|||||||4|1|1|136.08|252.00|||5|
5662|ML|25|392.393.516||BCO|BCO|B||||||4|1|1|157.68|292.00|||5|
5663|ML|25|392.393.517||BCO|BCO|M||||||4|1|1|157.68|292.00|||5|
5664|ML|25|392.393.518||CCL|CCL|B||||||4|1|1|157.68|292.00|||5|
5665|ML|25|392.393.519||CCL|CCL|M||||||4|1|1|157.68|292.00|||5|
5666|ML|25|392.393.520||CME|CME|B||||||4|1|1|157.68|292.00|||5|
5667|ML|25|392.393.521||CME|CME|M||||||4|1|1|157.68|292.00|||5|
5668|ML|25|392.393.522||ANT|ANT|B||||||4|1|1|157.68|292.00|||5|
5669|ML|25|392.393.523||ANT|ANT|M||||||4|1|1|157.68|292.00|||5|
5670|ML|25|392.393.524||PTO|PTO|B||||||4|1|1|157.68|292.00|||5|
5671|ML|25|392.393.525||PTO|PTO|M||||||4|1|1|157.68|292.00|||5|
5672|ML|25|392.393.526||CRE|CRE|B||||||4|1|1|157.68|292.00|||5|
5673|ML|25|392.393.527||CRE|CRE|M||||||4|1|1|157.68|292.00|||5|
5674|ML|25|392.393.528||CAM|CAM|B||||||4|1|1|157.68|292.00|||5|
5675|ML|25|392.393.529||CAM|CAM|M||||||4|1|1|157.68|292.00|||5|
5676|ML|25|392.393.530||OUR|OUR|B||||||4|1|1|157.68|292.00|||5|
5677|ML|25|392.393.531||OUR|OUR|M||||||4|1|1|157.68|292.00|||5|
5678|ML|25|392.393.532||COB|COB|B||||||4|1|1|157.68|292.00|||5|
5679|ML|25|392.393.533||COB|COB|M||||||4|1|1|157.68|292.00|||5|
5680|ML|25|392.393.534||CHO|CHO|B||||||4|1|1|157.68|292.00|||5|
5681|ML|25|392.393.535||CHO|CHO|M||||||4|1|1|157.68|292.00|||5|
5682|ML|25|392.393.536||VAG|VAG|B||||||4|1|1|157.68|292.00|||5|
5683|ML|25|392.393.537||VAG|VAG|M||||||4|1|1|157.68|292.00|||5|
5684|ML|25|392.393.538||AZE|AZE|B||||||4|1|1|157.68|292.00|||5|
5685|ML|25|392.393.539||AZE|AZE|M||||||4|1|1|157.68|292.00|||5|
5686|ML|25|392.393.540||AMA|AMA|B||||||4|1|1|157.68|292.00|||5|
5687|ML|25|392.393.541||AMA|AMA|M||||||4|1|1|157.68|292.00|||5|
5688|ML|25|392.393.542||AES|AES|B||||||4|1|1|157.68|292.00|||5|
5689|ML|25|392.393.543||AES|AES|M||||||4|1|1|157.68|292.00|||5|
5690|ML|25|392.393.544||PRA|PRA|B||||||4|1|1|157.68|292.00|||5|
5691|ML|25|392.393.545||PRA|PRA|M||||||4|1|1|157.68|292.00|||5|
5692|ML|25|392.393.546||ROS|ROS|B||||||4|1|1|157.68|292.00|||5|
5693|ML|25|392.393.547||ROS|ROS|M||||||4|1|1|157.68|292.00|||5|
5694|ML|25|392.393.548||VER|VER|B||||||4|1|1|157.68|292.00|||5|
5695|ML|25|392.393.549||VER|VER|M||||||4|1|1|157.68|292.00|||5|
5696|ML|25|392.393.550||AZB|AZB|||||||4|1|1|157.68|292.00|||5|
5697|ML|25|392.393.551||DEN|DEN|||||||4|1|1|157.68|292.00|||5|
5698|ML|25|392.393.552||BLK|BLK|||||||4|1|1|157.68|292.00|||5|
5699|ML|25|392.393.553||ART|ART|||||||4|1|1|157.68|292.00|||5|
5700|ML|25|392.393.554||LIN|LIN|||||||4|1|1|157.68|292.00|||5|
5701|ML|25|392.393.555||HAL|HAL|||||||4|1|1|157.68|292.00|||5|
5702|ML|26|556.557.394||TBR|TBR|||||||5|1|1|102.60|190.00|||5|
5703|ML|26|556.557.198||TEA|TEA|||||||5|1|1|102.60|190.00|||5|
5704|ML|26|556.557.199||OAK|OAK|||||||5|1|1|102.60|190.00|||5|
5705|ML|26|556.557.200||JOP|JOP|||||||5|1|1|102.60|190.00|||5|
5706|ML|26|556.557.395||TBR|BCO|B||||||5|1|1|145.80|270.00|||5|
5707|ML|26|556.557.396||TBR|BCO|M||||||5|1|1|145.80|270.00|||5|
5708|ML|26|556.557.397||TBR|CCL|B||||||5|1|1|145.80|270.00|||5|
5709|ML|26|556.557.398||TBR|CCL|M||||||5|1|1|145.80|270.00|||5|
5710|ML|26|556.557.399||TBR|CME|B||||||5|1|1|145.80|270.00|||5|
5711|ML|26|556.557.400||TBR|CME|M||||||5|1|1|145.80|270.00|||5|
5712|ML|26|556.557.401||TBR|ANT|B||||||5|1|1|145.80|270.00|||5|
5713|ML|26|556.557.402||TBR|ANT|M||||||5|1|1|145.80|270.00|||5|
5714|ML|26|556.557.403||TBR|PTO|B||||||5|1|1|145.80|270.00|||5|
5715|ML|26|556.557.404||TBR|PTO|M||||||5|1|1|145.80|270.00|||5|
5716|ML|26|556.557.405||TBR|CRE|B||||||5|1|1|145.80|270.00|||5|
5717|ML|26|556.557.406||TBR|CRE|M||||||5|1|1|145.80|270.00|||5|
5718|ML|26|556.557.407||TBR|CAM|B||||||5|1|1|145.80|270.00|||5|
5719|ML|26|556.557.408||TBR|CAM|M||||||5|1|1|145.80|270.00|||5|
5720|ML|26|556.557.409||TBR|OUR|B||||||5|1|1|145.80|270.00|||5|
5721|ML|26|556.557.410||TBR|OUR|M||||||5|1|1|145.80|270.00|||5|
5722|ML|26|556.557.411||TBR|COB|B||||||5|1|1|145.80|270.00|||5|
5723|ML|26|556.557.412||TBR|COB|M||||||5|1|1|145.80|270.00|||5|
5724|ML|26|556.557.413||TBR|CHO|B||||||5|1|1|145.80|270.00|||5|
5725|ML|26|556.557.414||TBR|CHO|M||||||5|1|1|145.80|270.00|||5|
5726|ML|26|556.557.415||TBR|VAG|B||||||5|1|1|145.80|270.00|||5|
5727|ML|26|556.557.416||TBR|VAG|M||||||5|1|1|145.80|270.00|||5|
5728|ML|26|556.557.417||TBR|AZE|B||||||5|1|1|145.80|270.00|||5|
5729|ML|26|556.557.418||TBR|AZE|M||||||5|1|1|145.80|270.00|||5|
5730|ML|26|556.557.419||TBR|AMA|B||||||5|1|1|145.80|270.00|||5|
5731|ML|26|556.557.420||TBR|AMA|M||||||5|1|1|145.80|270.00|||5|
5732|ML|26|556.557.421||TBR|AES|B||||||5|1|1|145.80|270.00|||5|
5733|ML|26|556.557.422||TBR|AES|M||||||5|1|1|145.80|270.00|||5|
5734|ML|26|556.557.423||TBR|PRA|B||||||5|1|1|145.80|270.00|||5|
5735|ML|26|556.557.424||TBR|PRA|M||||||5|1|1|145.80|270.00|||5|
5736|ML|26|556.557.425||TBR|ROS|B||||||5|1|1|145.80|270.00|||5|
5737|ML|26|556.557.426||TBR|ROS|M||||||5|1|1|145.80|270.00|||5|
5738|ML|26|556.557.427||TBR|VER|B||||||5|1|1|145.80|270.00|||5|
5739|ML|26|556.557.428||TBR|VER|M||||||5|1|1|145.80|270.00|||5|
5740|ML|26|556.557.429||TBR|AZB|||||||5|1|1|145.80|270.00|||5|
5741|ML|26|556.557.430||TBR|DEN|||||||5|1|1|145.80|270.00|||5|
5742|ML|26|556.557.431||TBR|BLK|||||||5|1|1|145.80|270.00|||5|
5743|ML|26|556.557.432||TBR|ART|||||||5|1|1|145.80|270.00|||5|
5744|ML|26|556.557.433||TBR|LIN|||||||5|1|1|145.80|270.00|||5|
5745|ML|26|556.557.434||TBR|HAL|||||||5|1|1|145.80|270.00|||5|
5746|ML|26|556.557.435||BCO|BCO|B||||||5|1|1|167.40|310.00|||5|
5747|ML|26|556.557.436||BCO|BCO|M||||||5|1|1|167.40|310.00|||5|
5748|ML|26|556.557.437||CCL|CCL|B||||||5|1|1|167.40|310.00|||5|
5749|ML|26|556.557.438||CCL|CCL|M||||||5|1|1|167.40|310.00|||5|
5750|ML|26|556.557.439||CME|CME|B||||||5|1|1|167.40|310.00|||5|
5751|ML|26|556.557.440||CME|CME|M||||||5|1|1|167.40|310.00|||5|
5752|ML|26|556.557.441||ANT|ANT|B||||||5|1|1|167.40|310.00|||5|
5753|ML|26|556.557.442||ANT|ANT|M||||||5|1|1|167.40|310.00|||5|
5754|ML|26|556.557.443||PTO|PTO|B||||||5|1|1|167.40|310.00|||5|
5755|ML|26|556.557.444||PTO|PTO|M||||||5|1|1|167.40|310.00|||5|
5756|ML|26|556.557.445||CRE|CRE|B||||||5|1|1|167.40|310.00|||5|
5757|ML|26|556.557.446||CRE|CRE|M||||||5|1|1|167.40|310.00|||5|
5758|ML|26|556.557.447||CAM|CAM|B||||||5|1|1|167.40|310.00|||5|
5759|ML|26|556.557.448||CAM|CAM|M||||||5|1|1|167.40|310.00|||5|
5760|ML|26|556.557.449||OUR|OUR|B||||||5|1|1|167.40|310.00|||5|
5761|ML|26|556.557.450||OUR|OUR|M||||||5|1|1|167.40|310.00|||5|
5762|ML|26|556.557.451||COB|COB|B||||||5|1|1|167.40|310.00|||5|
5763|ML|26|556.557.452||COB|COB|M||||||5|1|1|167.40|310.00|||5|
5764|ML|26|556.557.453||CHO|CHO|B||||||5|1|1|167.40|310.00|||5|
5765|ML|26|556.557.454||CHO|CHO|M||||||5|1|1|167.40|310.00|||5|
5766|ML|26|556.557.455||VAG|VAG|B||||||5|1|1|167.40|310.00|||5|
5767|ML|26|556.557.456||VAG|VAG|M||||||5|1|1|167.40|310.00|||5|
5768|ML|26|556.557.457||AZE|AZE|B||||||5|1|1|167.40|310.00|||5|
5769|ML|26|556.557.458||AZE|AZE|M||||||5|1|1|167.40|310.00|||5|
5770|ML|26|556.557.459||AMA|AMA|B||||||5|1|1|167.40|310.00|||5|
5771|ML|26|556.557.460||AMA|AMA|M||||||5|1|1|167.40|310.00|||5|
5772|ML|26|556.557.461||AES|AES|B||||||5|1|1|167.40|310.00|||5|
5773|ML|26|556.557.462||AES|AES|M||||||5|1|1|167.40|310.00|||5|
5774|ML|26|556.557.463||PRA|PRA|B||||||5|1|1|167.40|310.00|||5|
5775|ML|26|556.557.464||PRA|PRA|M||||||5|1|1|167.40|310.00|||5|
5776|ML|26|556.557.465||ROS|ROS|B||||||5|1|1|167.40|310.00|||5|
5777|ML|26|556.557.466||ROS|ROS|M||||||5|1|1|167.40|310.00|||5|
5778|ML|26|556.557.467||VER|VER|B||||||5|1|1|167.40|310.00|||5|
5779|ML|26|556.557.468||VER|VER|M||||||5|1|1|167.40|310.00|||5|
5780|ML|26|556.557.469||AZB|AZB|||||||5|1|1|167.40|310.00|||5|
5781|ML|26|556.557.470||DEN|DEN|||||||5|1|1|167.40|310.00|||5|
5782|ML|26|556.557.471||BLK|BLK|||||||5|1|1|167.40|310.00|||5|
5783|ML|26|556.557.472||ART|ART|||||||5|1|1|167.40|310.00|||5|
5784|ML|26|556.557.473||LIN|LIN|||||||5|1|1|167.40|310.00|||5|
5785|ML|26|556.557.474||HAL|HAL|||||||5|1|1|167.40|310.00|||5|
5786|ML|27|556.557.475||TBR|TBR|||||||5|1|1|102.60|190.00|||5|
5787|ML|27|556.557.242||TEA|TEA|||||||5|1|1|102.60|190.00|||5|
5788|ML|27|556.557.243||OAK|OAK|||||||5|1|1|102.60|190.00|||5|
5789|ML|27|556.557.244||JOP|JOP|||||||5|1|1|102.60|190.00|||5|
5790|ML|27|556.557.476||TBR|BCO|B||||||5|1|1|145.80|270.00|||5|
5791|ML|27|556.557.477||TBR|BCO|M||||||5|1|1|145.80|270.00|||5|
5792|ML|27|556.557.478||TBR|CCL|B||||||5|1|1|145.80|270.00|||5|
5793|ML|27|556.557.479||TBR|CCL|M||||||5|1|1|145.80|270.00|||5|
5794|ML|27|556.557.480||TBR|CME|B||||||5|1|1|145.80|270.00|||5|
5795|ML|27|556.557.481||TBR|CME|M||||||5|1|1|145.80|270.00|||5|
5796|ML|27|556.557.482||TBR|ANT|B||||||5|1|1|145.80|270.00|||5|
5797|ML|27|556.557.483||TBR|ANT|M||||||5|1|1|145.80|270.00|||5|
5798|ML|27|556.557.484||TBR|PTO|B||||||5|1|1|145.80|270.00|||5|
5799|ML|27|556.557.485||TBR|PTO|M||||||5|1|1|145.80|270.00|||5|
5800|ML|27|556.557.486||TBR|CRE|B||||||5|1|1|145.80|270.00|||5|
5801|ML|27|556.557.487||TBR|CRE|M||||||5|1|1|145.80|270.00|||5|
5802|ML|27|556.557.488||TBR|CAM|B||||||5|1|1|145.80|270.00|||5|
5803|ML|27|556.557.489||TBR|CAM|M||||||5|1|1|145.80|270.00|||5|
5804|ML|27|556.557.490||TBR|OUR|B||||||5|1|1|145.80|270.00|||5|
5805|ML|27|556.557.491||TBR|OUR|M||||||5|1|1|145.80|270.00|||5|
5806|ML|27|556.557.492||TBR|COB|B||||||5|1|1|145.80|270.00|||5|
5807|ML|27|556.557.493||TBR|COB|M||||||5|1|1|145.80|270.00|||5|
5808|ML|27|556.557.494||TBR|CHO|B||||||5|1|1|145.80|270.00|||5|
5809|ML|27|556.557.495||TBR|CHO|M||||||5|1|1|145.80|270.00|||5|
5810|ML|27|556.557.496||TBR|VAG|B||||||5|1|1|145.80|270.00|||5|
5811|ML|27|556.557.497||TBR|VAG|M||||||5|1|1|145.80|270.00|||5|
5812|ML|27|556.557.498||TBR|AZE|B||||||5|1|1|145.80|270.00|||5|
5813|ML|27|556.557.499||TBR|AZE|M||||||5|1|1|145.80|270.00|||5|
5814|ML|27|556.557.500||TBR|AMA|B||||||5|1|1|145.80|270.00|||5|
5815|ML|27|556.557.501||TBR|AMA|M||||||5|1|1|145.80|270.00|||5|
5816|ML|27|556.557.502||TBR|AES|B||||||5|1|1|145.80|270.00|||5|
5817|ML|27|556.557.503||TBR|AES|M||||||5|1|1|145.80|270.00|||5|
5818|ML|27|556.557.504||TBR|PRA|B||||||5|1|1|145.80|270.00|||5|
5819|ML|27|556.557.505||TBR|PRA|M||||||5|1|1|145.80|270.00|||5|
5820|ML|27|556.557.506||TBR|ROS|B||||||5|1|1|145.80|270.00|||5|
5821|ML|27|556.557.507||TBR|ROS|M||||||5|1|1|145.80|270.00|||5|
5822|ML|27|556.557.508||TBR|VER|B||||||5|1|1|145.80|270.00|||5|
5823|ML|27|556.557.509||TBR|VER|M||||||5|1|1|145.80|270.00|||5|
5824|ML|27|556.557.510||TBR|AZB|||||||5|1|1|145.80|270.00|||5|
5825|ML|27|556.557.511||TBR|DEN|||||||5|1|1|145.80|270.00|||5|
5826|ML|27|556.557.512||TBR|BLK|||||||5|1|1|145.80|270.00|||5|
5827|ML|27|556.557.513||TBR|ART|||||||5|1|1|145.80|270.00|||5|
5828|ML|27|556.557.514||TBR|LIN|||||||5|1|1|145.80|270.00|||5|
5829|ML|27|556.557.515||TBR|HAL|||||||5|1|1|145.80|270.00|||5|
5830|ML|27|556.557.516||BCO|BCO|B||||||5|1|1|167.40|310.00|||5|
5831|ML|27|556.557.517||BCO|BCO|M||||||5|1|1|167.40|310.00|||5|
5832|ML|27|556.557.518||CCL|CCL|B||||||5|1|1|167.40|310.00|||5|
5833|ML|27|556.557.519||CCL|CCL|M||||||5|1|1|167.40|310.00|||5|
5834|ML|27|556.557.520||CME|CME|B||||||5|1|1|167.40|310.00|||5|
5835|ML|27|556.557.521||CME|CME|M||||||5|1|1|167.40|310.00|||5|
5836|ML|27|556.557.522||ANT|ANT|B||||||5|1|1|167.40|310.00|||5|
5837|ML|27|556.557.523||ANT|ANT|M||||||5|1|1|167.40|310.00|||5|
5838|ML|27|556.557.524||PTO|PTO|B||||||5|1|1|167.40|310.00|||5|
5839|ML|27|556.557.525||PTO|PTO|M||||||5|1|1|167.40|310.00|||5|
5840|ML|27|556.557.526||CRE|CRE|B||||||5|1|1|167.40|310.00|||5|
5841|ML|27|556.557.527||CRE|CRE|M||||||5|1|1|167.40|310.00|||5|
5842|ML|27|556.557.528||CAM|CAM|B||||||5|1|1|167.40|310.00|||5|
5843|ML|27|556.557.529||CAM|CAM|M||||||5|1|1|167.40|310.00|||5|
5844|ML|27|556.557.530||OUR|OUR|B||||||5|1|1|167.40|310.00|||5|
5845|ML|27|556.557.531||OUR|OUR|M||||||5|1|1|167.40|310.00|||5|
5846|ML|27|556.557.532||COB|COB|B||||||5|1|1|167.40|310.00|||5|
5847|ML|27|556.557.533||COB|COB|M||||||5|1|1|167.40|310.00|||5|
5848|ML|27|556.557.534||CHO|CHO|B||||||5|1|1|167.40|310.00|||5|
5849|ML|27|556.557.535||CHO|CHO|M||||||5|1|1|167.40|310.00|||5|
5850|ML|27|556.557.536||VAG|VAG|B||||||5|1|1|167.40|310.00|||5|
5851|ML|27|556.557.537||VAG|VAG|M||||||5|1|1|167.40|310.00|||5|
5852|ML|27|556.557.538||AZE|AZE|B||||||5|1|1|167.40|310.00|||5|
5853|ML|27|556.557.539||AZE|AZE|M||||||5|1|1|167.40|310.00|||5|
5854|ML|27|556.557.540||AMA|AMA|B||||||5|1|1|167.40|310.00|||5|
5855|ML|27|556.557.541||AMA|AMA|M||||||5|1|1|167.40|310.00|||5|
5856|ML|27|556.557.542||AES|AES|B||||||5|1|1|167.40|310.00|||5|
5857|ML|27|556.557.543||AES|AES|M||||||5|1|1|167.40|310.00|||5|
5858|ML|27|556.557.544||PRA|PRA|B||||||5|1|1|167.40|310.00|||5|
5859|ML|27|556.557.545||PRA|PRA|M||||||5|1|1|167.40|310.00|||5|
5860|ML|27|556.557.546||ROS|ROS|B||||||5|1|1|167.40|310.00|||5|
5861|ML|27|556.557.547||ROS|ROS|M||||||5|1|1|167.40|310.00|||5|
5862|ML|27|556.557.548||VER|VER|B||||||5|1|1|167.40|310.00|||5|
5863|ML|27|556.557.549||VER|VER|M||||||5|1|1|167.40|310.00|||5|
5864|ML|27|556.557.550||AZB|AZB|||||||5|1|1|167.40|310.00|||5|
5865|ML|27|556.557.551||DEN|DEN|||||||5|1|1|167.40|310.00|||5|
5866|ML|27|556.557.552||BLK|BLK|||||||5|1|1|167.40|310.00|||5|
5867|ML|27|556.557.553||ART|ART|||||||5|1|1|167.40|310.00|||5|
5868|ML|27|556.557.554||LIN|LIN|||||||5|1|1|167.40|310.00|||5|
5869|ML|27|556.557.555||HAL|HAL|||||||5|1|1|167.40|310.00|||5|
5870|ML|26|558.557.394||TBR|TBR|||||||1|1|1|108.00|200.00|||5|
5871|ML|26|558.557.198||TEA|TEA|||||||1|1|1|108.00|200.00|||5|
5872|ML|26|558.557.199||OAK|OAK|||||||1|1|1|108.00|200.00|||5|
5873|ML|26|558.557.200||JOP|JOP|||||||1|1|1|108.00|200.00|||5|
5874|ML|26|558.557.395||TBR|BCO|B||||||1|1|1|151.20|280.00|||5|
5875|ML|26|558.557.396||TBR|BCO|M||||||1|1|1|151.20|280.00|||5|
5876|ML|26|558.557.397||TBR|CCL|B||||||1|1|1|151.20|280.00|||5|
5877|ML|26|558.557.398||TBR|CCL|M||||||1|1|1|151.20|280.00|||5|
5878|ML|26|558.557.399||TBR|CME|B||||||1|1|1|151.20|280.00|||5|
5879|ML|26|558.557.400||TBR|CME|M||||||1|1|1|151.20|280.00|||5|
5880|ML|26|558.557.401||TBR|ANT|B||||||1|1|1|151.20|280.00|||5|
5881|ML|26|558.557.402||TBR|ANT|M||||||1|1|1|151.20|280.00|||5|
5882|ML|26|558.557.403||TBR|PTO|B||||||1|1|1|151.20|280.00|||5|
5883|ML|26|558.557.404||TBR|PTO|M||||||1|1|1|151.20|280.00|||5|
5884|ML|26|558.557.405||TBR|CRE|B||||||1|1|1|151.20|280.00|||5|
5885|ML|26|558.557.406||TBR|CRE|M||||||1|1|1|151.20|280.00|||5|
5886|ML|26|558.557.407||TBR|CAM|B||||||1|1|1|151.20|280.00|||5|
5887|ML|26|558.557.408||TBR|CAM|M||||||1|1|1|151.20|280.00|||5|
5888|ML|26|558.557.409||TBR|OUR|B||||||1|1|1|151.20|280.00|||5|
5889|ML|26|558.557.410||TBR|OUR|M||||||1|1|1|151.20|280.00|||5|
5890|ML|26|558.557.411||TBR|COB|B||||||1|1|1|151.20|280.00|||5|
5891|ML|26|558.557.412||TBR|COB|M||||||1|1|1|151.20|280.00|||5|
5892|ML|26|558.557.413||TBR|CHO|B||||||1|1|1|151.20|280.00|||5|
5893|ML|26|558.557.414||TBR|CHO|M||||||1|1|1|151.20|280.00|||5|
5894|ML|26|558.557.415||TBR|VAG|B||||||1|1|1|151.20|280.00|||5|
5895|ML|26|558.557.416||TBR|VAG|M||||||1|1|1|151.20|280.00|||5|
5896|ML|26|558.557.417||TBR|AZE|B||||||1|1|1|151.20|280.00|||5|
5897|ML|26|558.557.418||TBR|AZE|M||||||1|1|1|151.20|280.00|||5|
5898|ML|26|558.557.419||TBR|AMA|B||||||1|1|1|151.20|280.00|||5|
5899|ML|26|558.557.420||TBR|AMA|M||||||1|1|1|151.20|280.00|||5|
5900|ML|26|558.557.421||TBR|AES|B||||||1|1|1|151.20|280.00|||5|
5901|ML|26|558.557.422||TBR|AES|M||||||1|1|1|151.20|280.00|||5|
5902|ML|26|558.557.423||TBR|PRA|B||||||1|1|1|151.20|280.00|||5|
5903|ML|26|558.557.424||TBR|PRA|M||||||1|1|1|151.20|280.00|||5|
5904|ML|26|558.557.425||TBR|ROS|B||||||1|1|1|151.20|280.00|||5|
5905|ML|26|558.557.426||TBR|ROS|M||||||1|1|1|151.20|280.00|||5|
5906|ML|26|558.557.427||TBR|VER|B||||||1|1|1|151.20|280.00|||5|
5907|ML|26|558.557.428||TBR|VER|M||||||1|1|1|151.20|280.00|||5|
5908|ML|26|558.557.429||TBR|AZB|||||||1|1|1|151.20|280.00|||5|
5909|ML|26|558.557.430||TBR|DEN|||||||1|1|1|151.20|280.00|||5|
5910|ML|26|558.557.431||TBR|BLK|||||||1|1|1|151.20|280.00|||5|
5911|ML|26|558.557.432||TBR|ART|||||||1|1|1|151.20|280.00|||5|
5912|ML|26|558.557.433||TBR|LIN|||||||1|1|1|151.20|280.00|||5|
5913|ML|26|558.557.434||TBR|HAL|||||||1|1|1|151.20|280.00|||5|
5914|ML|26|558.557.435||BCO|BCO|B||||||1|1|1|172.80|320.00|||5|
5915|ML|26|558.557.436||BCO|BCO|M||||||1|1|1|172.80|320.00|||5|
5916|ML|26|558.557.437||CCL|CCL|B||||||1|1|1|172.80|320.00|||5|
5917|ML|26|558.557.438||CCL|CCL|M||||||1|1|1|172.80|320.00|||5|
5918|ML|26|558.557.439||CME|CME|B||||||1|1|1|172.80|320.00|||5|
5919|ML|26|558.557.440||CME|CME|M||||||1|1|1|172.80|320.00|||5|
5920|ML|26|558.557.441||ANT|ANT|B||||||1|1|1|172.80|320.00|||5|
5921|ML|26|558.557.442||ANT|ANT|M||||||1|1|1|172.80|320.00|||5|
5922|ML|26|558.557.443||PTO|PTO|B||||||1|1|1|172.80|320.00|||5|
5923|ML|26|558.557.444||PTO|PTO|M||||||1|1|1|172.80|320.00|||5|
5924|ML|26|558.557.445||CRE|CRE|B||||||1|1|1|172.80|320.00|||5|
5925|ML|26|558.557.446||CRE|CRE|M||||||1|1|1|172.80|320.00|||5|
5926|ML|26|558.557.447||CAM|CAM|B||||||1|1|1|172.80|320.00|||5|
5927|ML|26|558.557.448||CAM|CAM|M||||||1|1|1|172.80|320.00|||5|
5928|ML|26|558.557.449||OUR|OUR|B||||||1|1|1|172.80|320.00|||5|
5929|ML|26|558.557.450||OUR|OUR|M||||||1|1|1|172.80|320.00|||5|
5930|ML|26|558.557.451||COB|COB|B||||||1|1|1|172.80|320.00|||5|
5931|ML|26|558.557.452||COB|COB|M||||||1|1|1|172.80|320.00|||5|
5932|ML|26|558.557.453||CHO|CHO|B||||||1|1|1|172.80|320.00|||5|
5933|ML|26|558.557.454||CHO|CHO|M||||||1|1|1|172.80|320.00|||5|
5934|ML|26|558.557.455||VAG|VAG|B||||||1|1|1|172.80|320.00|||5|
5935|ML|26|558.557.456||VAG|VAG|M||||||1|1|1|172.80|320.00|||5|
5936|ML|26|558.557.457||AZE|AZE|B||||||1|1|1|172.80|320.00|||5|
5937|ML|26|558.557.458||AZE|AZE|M||||||1|1|1|172.80|320.00|||5|
5938|ML|26|558.557.459||AMA|AMA|B||||||1|1|1|172.80|320.00|||5|
5939|ML|26|558.557.460||AMA|AMA|M||||||1|1|1|172.80|320.00|||5|
5940|ML|26|558.557.461||AES|AES|B||||||1|1|1|172.80|320.00|||5|
5941|ML|26|558.557.462||AES|AES|M||||||1|1|1|172.80|320.00|||5|
5942|ML|26|558.557.463||PRA|PRA|B||||||1|1|1|172.80|320.00|||5|
5943|ML|26|558.557.464||PRA|PRA|M||||||1|1|1|172.80|320.00|||5|
5944|ML|26|558.557.465||ROS|ROS|B||||||1|1|1|172.80|320.00|||5|
5945|ML|26|558.557.466||ROS|ROS|M||||||1|1|1|172.80|320.00|||5|
5946|ML|26|558.557.467||VER|VER|B||||||1|1|1|172.80|320.00|||5|
5947|ML|26|558.557.468||VER|VER|M||||||1|1|1|172.80|320.00|||5|
5948|ML|26|558.557.469||AZB|AZB|||||||1|1|1|172.80|320.00|||5|
5949|ML|26|558.557.470||DEN|DEN|||||||1|1|1|172.80|320.00|||5|
5950|ML|26|558.557.471||BLK|BLK|||||||1|1|1|172.80|320.00|||5|
5951|ML|26|558.557.472||ART|ART|||||||1|1|1|172.80|320.00|||5|
5952|ML|26|558.557.473||LIN|LIN|||||||1|1|1|172.80|320.00|||5|
5953|ML|26|558.557.474||HAL|HAL|||||||1|1|1|172.80|320.00|||5|
5954|ML|27|558.557.475||TBR|TBR|||||||1|1|1|108.00|200.00|||5|
5955|ML|27|558.557.242||TEA|TEA|||||||1|1|1|108.00|200.00|||5|
5956|ML|27|558.557.243||OAK|OAK|||||||1|1|1|108.00|200.00|||5|
5957|ML|27|558.557.244||JOP|JOP|||||||1|1|1|108.00|200.00|||5|
5958|ML|27|558.557.476||TBR|BCO|B||||||1|1|1|151.20|280.00|||5|
5959|ML|27|558.557.477||TBR|BCO|M||||||1|1|1|151.20|280.00|||5|
5960|ML|27|558.557.478||TBR|CCL|B||||||1|1|1|151.20|280.00|||5|
5961|ML|27|558.557.479||TBR|CCL|M||||||1|1|1|151.20|280.00|||5|
5962|ML|27|558.557.480||TBR|CME|B||||||1|1|1|151.20|280.00|||5|
5963|ML|27|558.557.481||TBR|CME|M||||||1|1|1|151.20|280.00|||5|
5964|ML|27|558.557.482||TBR|ANT|B||||||1|1|1|151.20|280.00|||5|
5965|ML|27|558.557.483||TBR|ANT|M||||||1|1|1|151.20|280.00|||5|
5966|ML|27|558.557.484||TBR|PTO|B||||||1|1|1|151.20|280.00|||5|
5967|ML|27|558.557.485||TBR|PTO|M||||||1|1|1|151.20|280.00|||5|
5968|ML|27|558.557.486||TBR|CRE|B||||||1|1|1|151.20|280.00|||5|
5969|ML|27|558.557.487||TBR|CRE|M||||||1|1|1|151.20|280.00|||5|
5970|ML|27|558.557.488||TBR|CAM|B||||||1|1|1|151.20|280.00|||5|
5971|ML|27|558.557.489||TBR|CAM|M||||||1|1|1|151.20|280.00|||5|
5972|ML|27|558.557.490||TBR|OUR|B||||||1|1|1|151.20|280.00|||5|
5973|ML|27|558.557.491||TBR|OUR|M||||||1|1|1|151.20|280.00|||5|
5974|ML|27|558.557.492||TBR|COB|B||||||1|1|1|151.20|280.00|||5|
5975|ML|27|558.557.493||TBR|COB|M||||||1|1|1|151.20|280.00|||5|
5976|ML|27|558.557.494||TBR|CHO|B||||||1|1|1|151.20|280.00|||5|
5977|ML|27|558.557.495||TBR|CHO|M||||||1|1|1|151.20|280.00|||5|
5978|ML|27|558.557.496||TBR|VAG|B||||||1|1|1|151.20|280.00|||5|
5979|ML|27|558.557.497||TBR|VAG|M||||||1|1|1|151.20|280.00|||5|
5980|ML|27|558.557.498||TBR|AZE|B||||||1|1|1|151.20|280.00|||5|
5981|ML|27|558.557.499||TBR|AZE|M||||||1|1|1|151.20|280.00|||5|
5982|ML|27|558.557.500||TBR|AMA|B||||||1|1|1|151.20|280.00|||5|
5983|ML|27|558.557.501||TBR|AMA|M||||||1|1|1|151.20|280.00|||5|
5984|ML|27|558.557.502||TBR|AES|B||||||1|1|1|151.20|280.00|||5|
5985|ML|27|558.557.503||TBR|AES|M||||||1|1|1|151.20|280.00|||5|
5986|ML|27|558.557.504||TBR|PRA|B||||||1|1|1|151.20|280.00|||5|
5987|ML|27|558.557.505||TBR|PRA|M||||||1|1|1|151.20|280.00|||5|
5988|ML|27|558.557.506||TBR|ROS|B||||||1|1|1|151.20|280.00|||5|
5989|ML|27|558.557.507||TBR|ROS|M||||||1|1|1|151.20|280.00|||5|
5990|ML|27|558.557.508||TBR|VER|B||||||1|1|1|151.20|280.00|||5|
5991|ML|27|558.557.509||TBR|VER|M||||||1|1|1|151.20|280.00|||5|
5992|ML|27|558.557.510||TBR|AZB|||||||1|1|1|151.20|280.00|||5|
5993|ML|27|558.557.511||TBR|DEN|||||||1|1|1|151.20|280.00|||5|
5994|ML|27|558.557.512||TBR|BLK|||||||1|1|1|151.20|280.00|||5|
5995|ML|27|558.557.513||TBR|ART|||||||1|1|1|151.20|280.00|||5|
5996|ML|27|558.557.514||TBR|LIN|||||||1|1|1|151.20|280.00|||5|
5997|ML|27|558.557.515||TBR|HAL|||||||1|1|1|151.20|280.00|||5|
5998|ML|27|558.557.516||BCO|BCO|B||||||1|1|1|172.80|320.00|||5|
5999|ML|27|558.557.517||BCO|BCO|M||||||1|1|1|172.80|320.00|||5|
6000|ML|27|558.557.518||CCL|CCL|B||||||1|1|1|172.80|320.00|||5|
6001|ML|27|558.557.519||CCL|CCL|M||||||1|1|1|172.80|320.00|||5|
6002|ML|27|558.557.520||CME|CME|B||||||1|1|1|172.80|320.00|||5|
6003|ML|27|558.557.521||CME|CME|M||||||1|1|1|172.80|320.00|||5|
6004|ML|27|558.557.522||ANT|ANT|B||||||1|1|1|172.80|320.00|||5|
6005|ML|27|558.557.523||ANT|ANT|M||||||1|1|1|172.80|320.00|||5|
6006|ML|27|558.557.524||PTO|PTO|B||||||1|1|1|172.80|320.00|||5|
6007|ML|27|558.557.525||PTO|PTO|M||||||1|1|1|172.80|320.00|||5|
6008|ML|27|558.557.526||CRE|CRE|B||||||1|1|1|172.80|320.00|||5|
6009|ML|27|558.557.527||CRE|CRE|M||||||1|1|1|172.80|320.00|||5|
6010|ML|27|558.557.528||CAM|CAM|B||||||1|1|1|172.80|320.00|||5|
6011|ML|27|558.557.529||CAM|CAM|M||||||1|1|1|172.80|320.00|||5|
6012|ML|27|558.557.530||OUR|OUR|B||||||1|1|1|172.80|320.00|||5|
6013|ML|27|558.557.531||OUR|OUR|M||||||1|1|1|172.80|320.00|||5|
6014|ML|27|558.557.532||COB|COB|B||||||1|1|1|172.80|320.00|||5|
6015|ML|27|558.557.533||COB|COB|M||||||1|1|1|172.80|320.00|||5|
6016|ML|27|558.557.534||CHO|CHO|B||||||1|1|1|172.80|320.00|||5|
6017|ML|27|558.557.535||CHO|CHO|M||||||1|1|1|172.80|320.00|||5|
6018|ML|27|558.557.536||VAG|VAG|B||||||1|1|1|172.80|320.00|||5|
6019|ML|27|558.557.537||VAG|VAG|M||||||1|1|1|172.80|320.00|||5|
6020|ML|27|558.557.538||AZE|AZE|B||||||1|1|1|172.80|320.00|||5|
6021|ML|27|558.557.539||AZE|AZE|M||||||1|1|1|172.80|320.00|||5|
6022|ML|27|558.557.540||AMA|AMA|B||||||1|1|1|172.80|320.00|||5|
6023|ML|27|558.557.541||AMA|AMA|M||||||1|1|1|172.80|320.00|||5|
6024|ML|27|558.557.542||AES|AES|B||||||1|1|1|172.80|320.00|||5|
6025|ML|27|558.557.543||AES|AES|M||||||1|1|1|172.80|320.00|||5|
6026|ML|27|558.557.544||PRA|PRA|B||||||1|1|1|172.80|320.00|||5|
6027|ML|27|558.557.545||PRA|PRA|M||||||1|1|1|172.80|320.00|||5|
6028|ML|27|558.557.546||ROS|ROS|B||||||1|1|1|172.80|320.00|||5|
6029|ML|27|558.557.547||ROS|ROS|M||||||1|1|1|172.80|320.00|||5|
6030|ML|27|558.557.548||VER|VER|B||||||1|1|1|172.80|320.00|||5|
6031|ML|27|558.557.549||VER|VER|M||||||1|1|1|172.80|320.00|||5|
6032|ML|27|558.557.550||AZB|AZB|||||||1|1|1|172.80|320.00|||5|
6033|ML|27|558.557.551||DEN|DEN|||||||1|1|1|172.80|320.00|||5|
6034|ML|27|558.557.552||BLK|BLK|||||||1|1|1|172.80|320.00|||5|
6035|ML|27|558.557.553||ART|ART|||||||1|1|1|172.80|320.00|||5|
6036|ML|27|558.557.554||LIN|LIN|||||||1|1|1|172.80|320.00|||5|
6037|ML|27|558.557.555||HAL|HAL|||||||1|1|1|172.80|320.00|||5|
6038|ML|26|559.557.394||TBR|TBR|||||||2|1|1|151.20|280.00|||5|
6039|ML|26|559.557.198||TEA|TEA|||||||2|1|1|151.20|280.00|||5|
6040|ML|26|559.557.199||OAK|OAK|||||||2|1|1|151.20|280.00|||5|
6041|ML|26|559.557.200||JOP|JOP|||||||2|1|1|151.20|280.00|||5|
6042|ML|26|559.557.395||TBR|BCO|B||||||2|1|1|194.40|360.00|||5|
6043|ML|26|559.557.396||TBR|BCO|M||||||2|1|1|194.40|360.00|||5|
6044|ML|26|559.557.397||TBR|CCL|B||||||2|1|1|194.40|360.00|||5|
6045|ML|26|559.557.398||TBR|CCL|M||||||2|1|1|194.40|360.00|||5|
6046|ML|26|559.557.399||TBR|CME|B||||||2|1|1|194.40|360.00|||5|
6047|ML|26|559.557.400||TBR|CME|M||||||2|1|1|194.40|360.00|||5|
6048|ML|26|559.557.401||TBR|ANT|B||||||2|1|1|194.40|360.00|||5|
6049|ML|26|559.557.402||TBR|ANT|M||||||2|1|1|194.40|360.00|||5|
6050|ML|26|559.557.403||TBR|PTO|B||||||2|1|1|194.40|360.00|||5|
6051|ML|26|559.557.404||TBR|PTO|M||||||2|1|1|194.40|360.00|||5|
6052|ML|26|559.557.405||TBR|CRE|B||||||2|1|1|194.40|360.00|||5|
6053|ML|26|559.557.406||TBR|CRE|M||||||2|1|1|194.40|360.00|||5|
6054|ML|26|559.557.407||TBR|CAM|B||||||2|1|1|194.40|360.00|||5|
6055|ML|26|559.557.408||TBR|CAM|M||||||2|1|1|194.40|360.00|||5|
6056|ML|26|559.557.409||TBR|OUR|B||||||2|1|1|194.40|360.00|||5|
6057|ML|26|559.557.410||TBR|OUR|M||||||2|1|1|194.40|360.00|||5|
6058|ML|26|559.557.411||TBR|COB|B||||||2|1|1|194.40|360.00|||5|
6059|ML|26|559.557.412||TBR|COB|M||||||2|1|1|194.40|360.00|||5|
6060|ML|26|559.557.413||TBR|CHO|B||||||2|1|1|194.40|360.00|||5|
6061|ML|26|559.557.414||TBR|CHO|M||||||2|1|1|194.40|360.00|||5|
6062|ML|26|559.557.415||TBR|VAG|B||||||2|1|1|194.40|360.00|||5|
6063|ML|26|559.557.416||TBR|VAG|M||||||2|1|1|194.40|360.00|||5|
6064|ML|26|559.557.417||TBR|AZE|B||||||2|1|1|194.40|360.00|||5|
6065|ML|26|559.557.418||TBR|AZE|M||||||2|1|1|194.40|360.00|||5|
6066|ML|26|559.557.419||TBR|AMA|B||||||2|1|1|194.40|360.00|||5|
6067|ML|26|559.557.420||TBR|AMA|M||||||2|1|1|194.40|360.00|||5|
6068|ML|26|559.557.421||TBR|AES|B||||||2|1|1|194.40|360.00|||5|
6069|ML|26|559.557.422||TBR|AES|M||||||2|1|1|194.40|360.00|||5|
6070|ML|26|559.557.423||TBR|PRA|B||||||2|1|1|194.40|360.00|||5|
6071|ML|26|559.557.424||TBR|PRA|M||||||2|1|1|194.40|360.00|||5|
6072|ML|26|559.557.425||TBR|ROS|B||||||2|1|1|194.40|360.00|||5|
6073|ML|26|559.557.426||TBR|ROS|M||||||2|1|1|194.40|360.00|||5|
6074|ML|26|559.557.427||TBR|VER|B||||||2|1|1|194.40|360.00|||5|
6075|ML|26|559.557.428||TBR|VER|M||||||2|1|1|194.40|360.00|||5|
6076|ML|26|559.557.429||TBR|AZB|||||||2|1|1|194.40|360.00|||5|
6077|ML|26|559.557.430||TBR|DEN|||||||2|1|1|194.40|360.00|||5|
6078|ML|26|559.557.431||TBR|BLK|||||||2|1|1|194.40|360.00|||5|
6079|ML|26|559.557.432||TBR|ART|||||||2|1|1|194.40|360.00|||5|
6080|ML|26|559.557.433||TBR|LIN|||||||2|1|1|194.40|360.00|||5|
6081|ML|26|559.557.434||TBR|HAL|||||||2|1|1|194.40|360.00|||5|
6082|ML|26|559.557.435||BCO|BCO|B||||||2|1|1|216.00|400.00|||5|
6083|ML|26|559.557.436||BCO|BCO|M||||||2|1|1|216.00|400.00|||5|
6084|ML|26|559.557.437||CCL|CCL|B||||||2|1|1|216.00|400.00|||5|
6085|ML|26|559.557.438||CCL|CCL|M||||||2|1|1|216.00|400.00|||5|
6086|ML|26|559.557.439||CME|CME|B||||||2|1|1|216.00|400.00|||5|
6087|ML|26|559.557.440||CME|CME|M||||||2|1|1|216.00|400.00|||5|
6088|ML|26|559.557.441||ANT|ANT|B||||||2|1|1|216.00|400.00|||5|
6089|ML|26|559.557.442||ANT|ANT|M||||||2|1|1|216.00|400.00|||5|
6090|ML|26|559.557.443||PTO|PTO|B||||||2|1|1|216.00|400.00|||5|
6091|ML|26|559.557.444||PTO|PTO|M||||||2|1|1|216.00|400.00|||5|
6092|ML|26|559.557.445||CRE|CRE|B||||||2|1|1|216.00|400.00|||5|
6093|ML|26|559.557.446||CRE|CRE|M||||||2|1|1|216.00|400.00|||5|
6094|ML|26|559.557.447||CAM|CAM|B||||||2|1|1|216.00|400.00|||5|
6095|ML|26|559.557.448||CAM|CAM|M||||||2|1|1|216.00|400.00|||5|
6096|ML|26|559.557.449||OUR|OUR|B||||||2|1|1|216.00|400.00|||5|
6097|ML|26|559.557.450||OUR|OUR|M||||||2|1|1|216.00|400.00|||5|
6098|ML|26|559.557.451||COB|COB|B||||||2|1|1|216.00|400.00|||5|
6099|ML|26|559.557.452||COB|COB|M||||||2|1|1|216.00|400.00|||5|
6100|ML|26|559.557.453||CHO|CHO|B||||||2|1|1|216.00|400.00|||5|
6101|ML|26|559.557.454||CHO|CHO|M||||||2|1|1|216.00|400.00|||5|
6102|ML|26|559.557.455||VAG|VAG|B||||||2|1|1|216.00|400.00|||5|
6103|ML|26|559.557.456||VAG|VAG|M||||||2|1|1|216.00|400.00|||5|
6104|ML|26|559.557.457||AZE|AZE|B||||||2|1|1|216.00|400.00|||5|
6105|ML|26|559.557.458||AZE|AZE|M||||||2|1|1|216.00|400.00|||5|
6106|ML|26|559.557.459||AMA|AMA|B||||||2|1|1|216.00|400.00|||5|
6107|ML|26|559.557.460||AMA|AMA|M||||||2|1|1|216.00|400.00|||5|
6108|ML|26|559.557.461||AES|AES|B||||||2|1|1|216.00|400.00|||5|
6109|ML|26|559.557.462||AES|AES|M||||||2|1|1|216.00|400.00|||5|
6110|ML|26|559.557.463||PRA|PRA|B||||||2|1|1|216.00|400.00|||5|
6111|ML|26|559.557.464||PRA|PRA|M||||||2|1|1|216.00|400.00|||5|
6112|ML|26|559.557.465||ROS|ROS|B||||||2|1|1|216.00|400.00|||5|
6113|ML|26|559.557.466||ROS|ROS|M||||||2|1|1|216.00|400.00|||5|
6114|ML|26|559.557.467||VER|VER|B||||||2|1|1|216.00|400.00|||5|
6115|ML|26|559.557.468||VER|VER|M||||||2|1|1|216.00|400.00|||5|
6116|ML|26|559.557.469||AZB|AZB|||||||2|1|1|216.00|400.00|||5|
6117|ML|26|559.557.470||DEN|DEN|||||||2|1|1|216.00|400.00|||5|
6118|ML|26|559.557.471||BLK|BLK|||||||2|1|1|216.00|400.00|||5|
6119|ML|26|559.557.472||ART|ART|||||||2|1|1|216.00|400.00|||5|
6120|ML|26|559.557.473||LIN|LIN|||||||2|1|1|216.00|400.00|||5|
6121|ML|26|559.557.474||HAL|HAL|||||||2|1|1|216.00|400.00|||5|
6122|ML|27|559.557.475||TBR|TBR|||||||2|1|1|151.20|280.00|||5|
6123|ML|27|559.557.242||TEA|TEA|||||||2|1|1|151.20|280.00|||5|
6124|ML|27|559.557.243||OAK|OAK|||||||2|1|1|151.20|280.00|||5|
6125|ML|27|559.557.244||JOP|JOP|||||||2|1|1|151.20|280.00|||5|
6126|ML|27|559.557.476||TBR|BCO|B||||||2|1|1|194.40|360.00|||5|
6127|ML|27|559.557.477||TBR|BCO|M||||||2|1|1|194.40|360.00|||5|
6128|ML|27|559.557.478||TBR|CCL|B||||||2|1|1|194.40|360.00|||5|
6129|ML|27|559.557.479||TBR|CCL|M||||||2|1|1|194.40|360.00|||5|
6130|ML|27|559.557.480||TBR|CME|B||||||2|1|1|194.40|360.00|||5|
6131|ML|27|559.557.481||TBR|CME|M||||||2|1|1|194.40|360.00|||5|
6132|ML|27|559.557.482||TBR|ANT|B||||||2|1|1|194.40|360.00|||5|
6133|ML|27|559.557.483||TBR|ANT|M||||||2|1|1|194.40|360.00|||5|
6134|ML|27|559.557.484||TBR|PTO|B||||||2|1|1|194.40|360.00|||5|
6135|ML|27|559.557.485||TBR|PTO|M||||||2|1|1|194.40|360.00|||5|
6136|ML|27|559.557.486||TBR|CRE|B||||||2|1|1|194.40|360.00|||5|
6137|ML|27|559.557.487||TBR|CRE|M||||||2|1|1|194.40|360.00|||5|
6138|ML|27|559.557.488||TBR|CAM|B||||||2|1|1|194.40|360.00|||5|
6139|ML|27|559.557.489||TBR|CAM|M||||||2|1|1|194.40|360.00|||5|
6140|ML|27|559.557.490||TBR|OUR|B||||||2|1|1|194.40|360.00|||5|
6141|ML|27|559.557.491||TBR|OUR|M||||||2|1|1|194.40|360.00|||5|
6142|ML|27|559.557.492||TBR|COB|B||||||2|1|1|194.40|360.00|||5|
6143|ML|27|559.557.493||TBR|COB|M||||||2|1|1|194.40|360.00|||5|
6144|ML|27|559.557.494||TBR|CHO|B||||||2|1|1|194.40|360.00|||5|
6145|ML|27|559.557.495||TBR|CHO|M||||||2|1|1|194.40|360.00|||5|
6146|ML|27|559.557.496||TBR|VAG|B||||||2|1|1|194.40|360.00|||5|
6147|ML|27|559.557.497||TBR|VAG|M||||||2|1|1|194.40|360.00|||5|
6148|ML|27|559.557.498||TBR|AZE|B||||||2|1|1|194.40|360.00|||5|
6149|ML|27|559.557.499||TBR|AZE|M||||||2|1|1|194.40|360.00|||5|
6150|ML|27|559.557.500||TBR|AMA|B||||||2|1|1|194.40|360.00|||5|
6151|ML|27|559.557.501||TBR|AMA|M||||||2|1|1|194.40|360.00|||5|
6152|ML|27|559.557.502||TBR|AES|B||||||2|1|1|194.40|360.00|||5|
6153|ML|27|559.557.503||TBR|AES|M||||||2|1|1|194.40|360.00|||5|
6154|ML|27|559.557.504||TBR|PRA|B||||||2|1|1|194.40|360.00|||5|
6155|ML|27|559.557.505||TBR|PRA|M||||||2|1|1|194.40|360.00|||5|
6156|ML|27|559.557.506||TBR|ROS|B||||||2|1|1|194.40|360.00|||5|
6157|ML|27|559.557.507||TBR|ROS|M||||||2|1|1|194.40|360.00|||5|
6158|ML|27|559.557.508||TBR|VER|B||||||2|1|1|194.40|360.00|||5|
6159|ML|27|559.557.509||TBR|VER|M||||||2|1|1|194.40|360.00|||5|
6160|ML|27|559.557.510||TBR|AZB|||||||2|1|1|194.40|360.00|||5|
6161|ML|27|559.557.511||TBR|DEN|||||||2|1|1|194.40|360.00|||5|
6162|ML|27|559.557.512||TBR|BLK|||||||2|1|1|194.40|360.00|||5|
6163|ML|27|559.557.513||TBR|ART|||||||2|1|1|194.40|360.00|||5|
6164|ML|27|559.557.514||TBR|LIN|||||||2|1|1|194.40|360.00|||5|
6165|ML|27|559.557.515||TBR|HAL|||||||2|1|1|194.40|360.00|||5|
6166|ML|27|559.557.516||BCO|BCO|B||||||2|1|1|216.00|400.00|||5|
6167|ML|27|559.557.517||BCO|BCO|M||||||2|1|1|216.00|400.00|||5|
6168|ML|27|559.557.518||CCL|CCL|B||||||2|1|1|216.00|400.00|||5|
6169|ML|27|559.557.519||CCL|CCL|M||||||2|1|1|216.00|400.00|||5|
6170|ML|27|559.557.520||CME|CME|B||||||2|1|1|216.00|400.00|||5|
6171|ML|27|559.557.521||CME|CME|M||||||2|1|1|216.00|400.00|||5|
6172|ML|27|559.557.522||ANT|ANT|B||||||2|1|1|216.00|400.00|||5|
6173|ML|27|559.557.523||ANT|ANT|M||||||2|1|1|216.00|400.00|||5|
6174|ML|27|559.557.524||PTO|PTO|B||||||2|1|1|216.00|400.00|||5|
6175|ML|27|559.557.525||PTO|PTO|M||||||2|1|1|216.00|400.00|||5|
6176|ML|27|559.557.526||CRE|CRE|B||||||2|1|1|216.00|400.00|||5|
6177|ML|27|559.557.527||CRE|CRE|M||||||2|1|1|216.00|400.00|||5|
6178|ML|27|559.557.528||CAM|CAM|B||||||2|1|1|216.00|400.00|||5|
6179|ML|27|559.557.529||CAM|CAM|M||||||2|1|1|216.00|400.00|||5|
6180|ML|27|559.557.530||OUR|OUR|B||||||2|1|1|216.00|400.00|||5|
6181|ML|27|559.557.531||OUR|OUR|M||||||2|1|1|216.00|400.00|||5|
6182|ML|27|559.557.532||COB|COB|B||||||2|1|1|216.00|400.00|||5|
6183|ML|27|559.557.533||COB|COB|M||||||2|1|1|216.00|400.00|||5|
6184|ML|27|559.557.534||CHO|CHO|B||||||2|1|1|216.00|400.00|||5|
6185|ML|27|559.557.535||CHO|CHO|M||||||2|1|1|216.00|400.00|||5|
6186|ML|27|559.557.536||VAG|VAG|B||||||2|1|1|216.00|400.00|||5|
6187|ML|27|559.557.537||VAG|VAG|M||||||2|1|1|216.00|400.00|||5|
6188|ML|27|559.557.538||AZE|AZE|B||||||2|1|1|216.00|400.00|||5|
6189|ML|27|559.557.539||AZE|AZE|M||||||2|1|1|216.00|400.00|||5|
6190|ML|27|559.557.540||AMA|AMA|B||||||2|1|1|216.00|400.00|||5|
6191|ML|27|559.557.541||AMA|AMA|M||||||2|1|1|216.00|400.00|||5|
6192|ML|27|559.557.542||AES|AES|B||||||2|1|1|216.00|400.00|||5|
6193|ML|27|559.557.543||AES|AES|M||||||2|1|1|216.00|400.00|||5|
6194|ML|27|559.557.544||PRA|PRA|B||||||2|1|1|216.00|400.00|||5|
6195|ML|27|559.557.545||PRA|PRA|M||||||2|1|1|216.00|400.00|||5|
6196|ML|27|559.557.546||ROS|ROS|B||||||2|1|1|216.00|400.00|||5|
6197|ML|27|559.557.547||ROS|ROS|M||||||2|1|1|216.00|400.00|||5|
6198|ML|27|559.557.548||VER|VER|B||||||2|1|1|216.00|400.00|||5|
6199|ML|27|559.557.549||VER|VER|M||||||2|1|1|216.00|400.00|||5|
6200|ML|27|559.557.550||AZB|AZB|||||||2|1|1|216.00|400.00|||5|
6201|ML|27|559.557.551||DEN|DEN|||||||2|1|1|216.00|400.00|||5|
6202|ML|27|559.557.552||BLK|BLK|||||||2|1|1|216.00|400.00|||5|
6203|ML|27|559.557.553||ART|ART|||||||2|1|1|216.00|400.00|||5|
6204|ML|27|559.557.554||LIN|LIN|||||||2|1|1|216.00|400.00|||5|
6205|ML|27|559.557.555||HAL|HAL|||||||2|1|1|216.00|400.00|||5|
6206|ML|28|560.561.394||TBR|TBR|||||||3|1|1|205.20|380.00|||5|
6207|ML|28|560.561.198||TEA|TEA|||||||3|1|1|205.20|380.00|||5|
6208|ML|28|560.561.199||OAK|OAK|||||||3|1|1|205.20|380.00|||5|
6209|ML|28|560.561.200||JOP|JOP|||||||3|1|1|205.20|380.00|||5|
6210|ML|28|560.561.395||TBR|BCO|B||||||3|1|1|248.40|460.00|||5|
6211|ML|28|560.561.396||TBR|BCO|M||||||3|1|1|248.40|460.00|||5|
6212|ML|28|560.561.397||TBR|CCL|B||||||3|1|1|248.40|460.00|||5|
6213|ML|28|560.561.398||TBR|CCL|M||||||3|1|1|248.40|460.00|||5|
6214|ML|28|560.561.399||TBR|CME|B||||||3|1|1|248.40|460.00|||5|
6215|ML|28|560.561.400||TBR|CME|M||||||3|1|1|248.40|460.00|||5|
6216|ML|28|560.561.401||TBR|ANT|B||||||3|1|1|248.40|460.00|||5|
6217|ML|28|560.561.402||TBR|ANT|M||||||3|1|1|248.40|460.00|||5|
6218|ML|28|560.561.403||TBR|PTO|B||||||3|1|1|248.40|460.00|||5|
6219|ML|28|560.561.404||TBR|PTO|M||||||3|1|1|248.40|460.00|||5|
6220|ML|28|560.561.405||TBR|CRE|B||||||3|1|1|248.40|460.00|||5|
6221|ML|28|560.561.406||TBR|CRE|M||||||3|1|1|248.40|460.00|||5|
6222|ML|28|560.561.407||TBR|CAM|B||||||3|1|1|248.40|460.00|||5|
6223|ML|28|560.561.408||TBR|CAM|M||||||3|1|1|248.40|460.00|||5|
6224|ML|28|560.561.409||TBR|OUR|B||||||3|1|1|248.40|460.00|||5|
6225|ML|28|560.561.410||TBR|OUR|M||||||3|1|1|248.40|460.00|||5|
6226|ML|28|560.561.411||TBR|COB|B||||||3|1|1|248.40|460.00|||5|
6227|ML|28|560.561.412||TBR|COB|M||||||3|1|1|248.40|460.00|||5|
6228|ML|28|560.561.413||TBR|CHO|B||||||3|1|1|248.40|460.00|||5|
6229|ML|28|560.561.414||TBR|CHO|M||||||3|1|1|248.40|460.00|||5|
6230|ML|28|560.561.415||TBR|VAG|B||||||3|1|1|248.40|460.00|||5|
6231|ML|28|560.561.416||TBR|VAG|M||||||3|1|1|248.40|460.00|||5|
6232|ML|28|560.561.417||TBR|AZE|B||||||3|1|1|248.40|460.00|||5|
6233|ML|28|560.561.418||TBR|AZE|M||||||3|1|1|248.40|460.00|||5|
6234|ML|28|560.561.419||TBR|AMA|B||||||3|1|1|248.40|460.00|||5|
6235|ML|28|560.561.420||TBR|AMA|M||||||3|1|1|248.40|460.00|||5|
6236|ML|28|560.561.421||TBR|AES|B||||||3|1|1|248.40|460.00|||5|
6237|ML|28|560.561.422||TBR|AES|M||||||3|1|1|248.40|460.00|||5|
6238|ML|28|560.561.423||TBR|PRA|B||||||3|1|1|248.40|460.00|||5|
6239|ML|28|560.561.424||TBR|PRA|M||||||3|1|1|248.40|460.00|||5|
6240|ML|28|560.561.425||TBR|ROS|B||||||3|1|1|248.40|460.00|||5|
6241|ML|28|560.561.426||TBR|ROS|M||||||3|1|1|248.40|460.00|||5|
6242|ML|28|560.561.427||TBR|VER|B||||||3|1|1|248.40|460.00|||5|
6243|ML|28|560.561.428||TBR|VER|M||||||3|1|1|248.40|460.00|||5|
6244|ML|28|560.561.429||TBR|AZB|||||||3|1|1|248.40|460.00|||5|
6245|ML|28|560.561.430||TBR|DEN|||||||3|1|1|248.40|460.00|||5|
6246|ML|28|560.561.431||TBR|BLK|||||||3|1|1|248.40|460.00|||5|
6247|ML|28|560.561.432||TBR|ART|||||||3|1|1|248.40|460.00|||5|
6248|ML|28|560.561.433||TBR|LIN|||||||3|1|1|248.40|460.00|||5|
6249|ML|28|560.561.434||TBR|HAL|||||||3|1|1|248.40|460.00|||5|
6250|ML|28|560.561.435||BCO|BCO|B||||||3|1|1|270.00|500.00|||5|
6251|ML|28|560.561.436||BCO|BCO|M||||||3|1|1|270.00|500.00|||5|
6252|ML|28|560.561.437||CCL|CCL|B||||||3|1|1|270.00|500.00|||5|
6253|ML|28|560.561.438||CCL|CCL|M||||||3|1|1|270.00|500.00|||5|
6254|ML|28|560.561.439||CME|CME|B||||||3|1|1|270.00|500.00|||5|
6255|ML|28|560.561.440||CME|CME|M||||||3|1|1|270.00|500.00|||5|
6256|ML|28|560.561.441||ANT|ANT|B||||||3|1|1|270.00|500.00|||5|
6257|ML|28|560.561.442||ANT|ANT|M||||||3|1|1|270.00|500.00|||5|
6258|ML|28|560.561.443||PTO|PTO|B||||||3|1|1|270.00|500.00|||5|
6259|ML|28|560.561.444||PTO|PTO|M||||||3|1|1|270.00|500.00|||5|
6260|ML|28|560.561.445||CRE|CRE|B||||||3|1|1|270.00|500.00|||5|
6261|ML|28|560.561.446||CRE|CRE|M||||||3|1|1|270.00|500.00|||5|
6262|ML|28|560.561.447||CAM|CAM|B||||||3|1|1|270.00|500.00|||5|
6263|ML|28|560.561.448||CAM|CAM|M||||||3|1|1|270.00|500.00|||5|
6264|ML|28|560.561.449||OUR|OUR|B||||||3|1|1|270.00|500.00|||5|
6265|ML|28|560.561.450||OUR|OUR|M||||||3|1|1|270.00|500.00|||5|
6266|ML|28|560.561.451||COB|COB|B||||||3|1|1|270.00|500.00|||5|
6267|ML|28|560.561.452||COB|COB|M||||||3|1|1|270.00|500.00|||5|
6268|ML|28|560.561.453||CHO|CHO|B||||||3|1|1|270.00|500.00|||5|
6269|ML|28|560.561.454||CHO|CHO|M||||||3|1|1|270.00|500.00|||5|
6270|ML|28|560.561.455||VAG|VAG|B||||||3|1|1|270.00|500.00|||5|
6271|ML|28|560.561.456||VAG|VAG|M||||||3|1|1|270.00|500.00|||5|
6272|ML|28|560.561.457||AZE|AZE|B||||||3|1|1|270.00|500.00|||5|
6273|ML|28|560.561.458||AZE|AZE|M||||||3|1|1|270.00|500.00|||5|
6274|ML|28|560.561.459||AMA|AMA|B||||||3|1|1|270.00|500.00|||5|
6275|ML|28|560.561.460||AMA|AMA|M||||||3|1|1|270.00|500.00|||5|
6276|ML|28|560.561.461||AES|AES|B||||||3|1|1|270.00|500.00|||5|
6277|ML|28|560.561.462||AES|AES|M||||||3|1|1|270.00|500.00|||5|
6278|ML|28|560.561.463||PRA|PRA|B||||||3|1|1|270.00|500.00|||5|
6279|ML|28|560.561.464||PRA|PRA|M||||||3|1|1|270.00|500.00|||5|
6280|ML|28|560.561.465||ROS|ROS|B||||||3|1|1|270.00|500.00|||5|
6281|ML|28|560.561.466||ROS|ROS|M||||||3|1|1|270.00|500.00|||5|
6282|ML|28|560.561.467||VER|VER|B||||||3|1|1|270.00|500.00|||5|
6283|ML|28|560.561.468||VER|VER|M||||||3|1|1|270.00|500.00|||5|
6284|ML|28|560.561.469||AZB|AZB|||||||3|1|1|270.00|500.00|||5|
6285|ML|28|560.561.470||DEN|DEN|||||||3|1|1|270.00|500.00|||5|
6286|ML|28|560.561.471||BLK|BLK|||||||3|1|1|270.00|500.00|||5|
6287|ML|28|560.561.472||ART|ART|||||||3|1|1|270.00|500.00|||5|
6288|ML|28|560.561.473||LIN|LIN|||||||3|1|1|270.00|500.00|||5|
6289|ML|28|560.561.474||HAL|HAL|||||||3|1|1|270.00|500.00|||5|
6290|ML|29|560.561.475||TBR|TBR|||||||3|1|1|205.20|380.00|||5|
6291|ML|29|560.561.242||TEA|TEA|||||||3|1|1|205.20|380.00|||5|
6292|ML|29|560.561.243||OAK|OAK|||||||3|1|1|205.20|380.00|||5|
6293|ML|29|560.561.244||JOP|JOP|||||||3|1|1|205.20|380.00|||5|
6294|ML|29|560.561.476||TBR|BCO|B||||||3|1|1|248.40|460.00|||5|
6295|ML|29|560.561.477||TBR|BCO|M||||||3|1|1|248.40|460.00|||5|
6296|ML|29|560.561.478||TBR|CCL|B||||||3|1|1|248.40|460.00|||5|
6297|ML|29|560.561.479||TBR|CCL|M||||||3|1|1|248.40|460.00|||5|
6298|ML|29|560.561.480||TBR|CME|B||||||3|1|1|248.40|460.00|||5|
6299|ML|29|560.561.481||TBR|CME|M||||||3|1|1|248.40|460.00|||5|
6300|ML|29|560.561.482||TBR|ANT|B||||||3|1|1|248.40|460.00|||5|
6301|ML|29|560.561.483||TBR|ANT|M||||||3|1|1|248.40|460.00|||5|
6302|ML|29|560.561.484||TBR|PTO|B||||||3|1|1|248.40|460.00|||5|
6303|ML|29|560.561.485||TBR|PTO|M||||||3|1|1|248.40|460.00|||5|
6304|ML|29|560.561.486||TBR|CRE|B||||||3|1|1|248.40|460.00|||5|
6305|ML|29|560.561.487||TBR|CRE|M||||||3|1|1|248.40|460.00|||5|
6306|ML|29|560.561.488||TBR|CAM|B||||||3|1|1|248.40|460.00|||5|
6307|ML|29|560.561.489||TBR|CAM|M||||||3|1|1|248.40|460.00|||5|
6308|ML|29|560.561.490||TBR|OUR|B||||||3|1|1|248.40|460.00|||5|
6309|ML|29|560.561.491||TBR|OUR|M||||||3|1|1|248.40|460.00|||5|
6310|ML|29|560.561.492||TBR|COB|B||||||3|1|1|248.40|460.00|||5|
6311|ML|29|560.561.493||TBR|COB|M||||||3|1|1|248.40|460.00|||5|
6312|ML|29|560.561.494||TBR|CHO|B||||||3|1|1|248.40|460.00|||5|
6313|ML|29|560.561.495||TBR|CHO|M||||||3|1|1|248.40|460.00|||5|
6314|ML|29|560.561.496||TBR|VAG|B||||||3|1|1|248.40|460.00|||5|
6315|ML|29|560.561.497||TBR|VAG|M||||||3|1|1|248.40|460.00|||5|
6316|ML|29|560.561.498||TBR|AZE|B||||||3|1|1|248.40|460.00|||5|
6317|ML|29|560.561.499||TBR|AZE|M||||||3|1|1|248.40|460.00|||5|
6318|ML|29|560.561.500||TBR|AMA|B||||||3|1|1|248.40|460.00|||5|
6319|ML|29|560.561.501||TBR|AMA|M||||||3|1|1|248.40|460.00|||5|
6320|ML|29|560.561.502||TBR|AES|B||||||3|1|1|248.40|460.00|||5|
6321|ML|29|560.561.503||TBR|AES|M||||||3|1|1|248.40|460.00|||5|
6322|ML|29|560.561.504||TBR|PRA|B||||||3|1|1|248.40|460.00|||5|
6323|ML|29|560.561.505||TBR|PRA|M||||||3|1|1|248.40|460.00|||5|
6324|ML|29|560.561.506||TBR|ROS|B||||||3|1|1|248.40|460.00|||5|
6325|ML|29|560.561.507||TBR|ROS|M||||||3|1|1|248.40|460.00|||5|
6326|ML|29|560.561.508||TBR|VER|B||||||3|1|1|248.40|460.00|||5|
6327|ML|29|560.561.509||TBR|VER|M||||||3|1|1|248.40|460.00|||5|
6328|ML|29|560.561.510||TBR|AZB|||||||3|1|1|248.40|460.00|||5|
6329|ML|29|560.561.511||TBR|DEN|||||||3|1|1|248.40|460.00|||5|
6330|ML|29|560.561.512||TBR|BLK|||||||3|1|1|248.40|460.00|||5|
6331|ML|29|560.561.513||TBR|ART|||||||3|1|1|248.40|460.00|||5|
6332|ML|29|560.561.514||TBR|LIN|||||||3|1|1|248.40|460.00|||5|
6333|ML|29|560.561.515||TBR|HAL|||||||3|1|1|248.40|460.00|||5|
6334|ML|29|560.561.516||BCO|BCO|B||||||3|1|1|270.00|500.00|||5|
6335|ML|29|560.561.517||BCO|BCO|M||||||3|1|1|270.00|500.00|||5|
6336|ML|29|560.561.518||CCL|CCL|B||||||3|1|1|270.00|500.00|||5|
6337|ML|29|560.561.519||CCL|CCL|M||||||3|1|1|270.00|500.00|||5|
6338|ML|29|560.561.520||CME|CME|B||||||3|1|1|270.00|500.00|||5|
6339|ML|29|560.561.521||CME|CME|M||||||3|1|1|270.00|500.00|||5|
6340|ML|29|560.561.522||ANT|ANT|B||||||3|1|1|270.00|500.00|||5|
6341|ML|29|560.561.523||ANT|ANT|M||||||3|1|1|270.00|500.00|||5|
6342|ML|29|560.561.524||PTO|PTO|B||||||3|1|1|270.00|500.00|||5|
6343|ML|29|560.561.525||PTO|PTO|M||||||3|1|1|270.00|500.00|||5|
6344|ML|29|560.561.526||CRE|CRE|B||||||3|1|1|270.00|500.00|||5|
6345|ML|29|560.561.527||CRE|CRE|M||||||3|1|1|270.00|500.00|||5|
6346|ML|29|560.561.528||CAM|CAM|B||||||3|1|1|270.00|500.00|||5|
6347|ML|29|560.561.529||CAM|CAM|M||||||3|1|1|270.00|500.00|||5|
6348|ML|29|560.561.530||OUR|OUR|B||||||3|1|1|270.00|500.00|||5|
6349|ML|29|560.561.531||OUR|OUR|M||||||3|1|1|270.00|500.00|||5|
6350|ML|29|560.561.532||COB|COB|B||||||3|1|1|270.00|500.00|||5|
6351|ML|29|560.561.533||COB|COB|M||||||3|1|1|270.00|500.00|||5|
6352|ML|29|560.561.534||CHO|CHO|B||||||3|1|1|270.00|500.00|||5|
6353|ML|29|560.561.535||CHO|CHO|M||||||3|1|1|270.00|500.00|||5|
6354|ML|29|560.561.536||VAG|VAG|B||||||3|1|1|270.00|500.00|||5|
6355|ML|29|560.561.537||VAG|VAG|M||||||3|1|1|270.00|500.00|||5|
6356|ML|29|560.561.538||AZE|AZE|B||||||3|1|1|270.00|500.00|||5|
6357|ML|29|560.561.539||AZE|AZE|M||||||3|1|1|270.00|500.00|||5|
6358|ML|29|560.561.540||AMA|AMA|B||||||3|1|1|270.00|500.00|||5|
6359|ML|29|560.561.541||AMA|AMA|M||||||3|1|1|270.00|500.00|||5|
6360|ML|29|560.561.542||AES|AES|B||||||3|1|1|270.00|500.00|||5|
6361|ML|29|560.561.543||AES|AES|M||||||3|1|1|270.00|500.00|||5|
6362|ML|29|560.561.544||PRA|PRA|B||||||3|1|1|270.00|500.00|||5|
6363|ML|29|560.561.545||PRA|PRA|M||||||3|1|1|270.00|500.00|||5|
6364|ML|29|560.561.546||ROS|ROS|B||||||3|1|1|270.00|500.00|||5|
6365|ML|29|560.561.547||ROS|ROS|M||||||3|1|1|270.00|500.00|||5|
6366|ML|29|560.561.548||VER|VER|B||||||3|1|1|270.00|500.00|||5|
6367|ML|29|560.561.549||VER|VER|M||||||3|1|1|270.00|500.00|||5|
6368|ML|29|560.561.550||AZB|AZB|||||||3|1|1|270.00|500.00|||5|
6369|ML|29|560.561.551||DEN|DEN|||||||3|1|1|270.00|500.00|||5|
6370|ML|29|560.561.552||BLK|BLK|||||||3|1|1|270.00|500.00|||5|
6371|ML|29|560.561.553||ART|ART|||||||3|1|1|270.00|500.00|||5|
6372|ML|29|560.561.554||LIN|LIN|||||||3|1|1|270.00|500.00|||5|
6373|ML|29|560.561.555||HAL|HAL|||||||3|1|1|270.00|500.00|||5|
6374|ML|30|560.562.394||TBR|TBR|||||||3|1|1|221.40|410.00|||5|
6375|ML|30|560.562.198||TEA|TEA|||||||3|1|1|221.40|410.00|||5|
6376|ML|30|560.562.199||OAK|OAK|||||||3|1|1|221.40|410.00|||5|
6377|ML|30|560.562.200||JOP|JOP|||||||3|1|1|221.40|410.00|||5|
6378|ML|30|560.562.395||TBR|BCO|B||||||3|1|1|264.60|490.00|||5|
6379|ML|30|560.562.396||TBR|BCO|M||||||3|1|1|264.60|490.00|||5|
6380|ML|30|560.562.397||TBR|CCL|B||||||3|1|1|264.60|490.00|||5|
6381|ML|30|560.562.398||TBR|CCL|M||||||3|1|1|264.60|490.00|||5|
6382|ML|30|560.562.399||TBR|CME|B||||||3|1|1|264.60|490.00|||5|
6383|ML|30|560.562.400||TBR|CME|M||||||3|1|1|264.60|490.00|||5|
6384|ML|30|560.562.401||TBR|ANT|B||||||3|1|1|264.60|490.00|||5|
6385|ML|30|560.562.402||TBR|ANT|M||||||3|1|1|264.60|490.00|||5|
6386|ML|30|560.562.403||TBR|PTO|B||||||3|1|1|264.60|490.00|||5|
6387|ML|30|560.562.404||TBR|PTO|M||||||3|1|1|264.60|490.00|||5|
6388|ML|30|560.562.405||TBR|CRE|B||||||3|1|1|264.60|490.00|||5|
6389|ML|30|560.562.406||TBR|CRE|M||||||3|1|1|264.60|490.00|||5|
6390|ML|30|560.562.407||TBR|CAM|B||||||3|1|1|264.60|490.00|||5|
6391|ML|30|560.562.408||TBR|CAM|M||||||3|1|1|264.60|490.00|||5|
6392|ML|30|560.562.409||TBR|OUR|B||||||3|1|1|264.60|490.00|||5|
6393|ML|30|560.562.410||TBR|OUR|M||||||3|1|1|264.60|490.00|||5|
6394|ML|30|560.562.411||TBR|COB|B||||||3|1|1|264.60|490.00|||5|
6395|ML|30|560.562.412||TBR|COB|M||||||3|1|1|264.60|490.00|||5|
6396|ML|30|560.562.413||TBR|CHO|B||||||3|1|1|264.60|490.00|||5|
6397|ML|30|560.562.414||TBR|CHO|M||||||3|1|1|264.60|490.00|||5|
6398|ML|30|560.562.415||TBR|VAG|B||||||3|1|1|264.60|490.00|||5|
6399|ML|30|560.562.416||TBR|VAG|M||||||3|1|1|264.60|490.00|||5|
6400|ML|30|560.562.417||TBR|AZE|B||||||3|1|1|264.60|490.00|||5|
6401|ML|30|560.562.418||TBR|AZE|M||||||3|1|1|264.60|490.00|||5|
6402|ML|30|560.562.419||TBR|AMA|B||||||3|1|1|264.60|490.00|||5|
6403|ML|30|560.562.420||TBR|AMA|M||||||3|1|1|264.60|490.00|||5|
6404|ML|30|560.562.421||TBR|AES|B||||||3|1|1|264.60|490.00|||5|
6405|ML|30|560.562.422||TBR|AES|M||||||3|1|1|264.60|490.00|||5|
6406|ML|30|560.562.423||TBR|PRA|B||||||3|1|1|264.60|490.00|||5|
6407|ML|30|560.562.424||TBR|PRA|M||||||3|1|1|264.60|490.00|||5|
6408|ML|30|560.562.425||TBR|ROS|B||||||3|1|1|264.60|490.00|||5|
6409|ML|30|560.562.426||TBR|ROS|M||||||3|1|1|264.60|490.00|||5|
6410|ML|30|560.562.427||TBR|VER|B||||||3|1|1|264.60|490.00|||5|
6411|ML|30|560.562.428||TBR|VER|M||||||3|1|1|264.60|490.00|||5|
6412|ML|30|560.562.429||TBR|AZB|||||||3|1|1|264.60|490.00|||5|
6413|ML|30|560.562.430||TBR|DEN|||||||3|1|1|264.60|490.00|||5|
6414|ML|30|560.562.431||TBR|BLK|||||||3|1|1|264.60|490.00|||5|
6415|ML|30|560.562.432||TBR|ART|||||||3|1|1|264.60|490.00|||5|
6416|ML|30|560.562.433||TBR|LIN|||||||3|1|1|264.60|490.00|||5|
6417|ML|30|560.562.434||TBR|HAL|||||||3|1|1|264.60|490.00|||5|
6418|ML|30|560.562.435||BCO|BCO|B||||||3|1|1|286.20|530.00|||5|
6419|ML|30|560.562.436||BCO|BCO|M||||||3|1|1|286.20|530.00|||5|
6420|ML|30|560.562.437||CCL|CCL|B||||||3|1|1|286.20|530.00|||5|
6421|ML|30|560.562.438||CCL|CCL|M||||||3|1|1|286.20|530.00|||5|
6422|ML|30|560.562.439||CME|CME|B||||||3|1|1|286.20|530.00|||5|
6423|ML|30|560.562.440||CME|CME|M||||||3|1|1|286.20|530.00|||5|
6424|ML|30|560.562.441||ANT|ANT|B||||||3|1|1|286.20|530.00|||5|
6425|ML|30|560.562.442||ANT|ANT|M||||||3|1|1|286.20|530.00|||5|
6426|ML|30|560.562.443||PTO|PTO|B||||||3|1|1|286.20|530.00|||5|
6427|ML|30|560.562.444||PTO|PTO|M||||||3|1|1|286.20|530.00|||5|
6428|ML|30|560.562.445||CRE|CRE|B||||||3|1|1|286.20|530.00|||5|
6429|ML|30|560.562.446||CRE|CRE|M||||||3|1|1|286.20|530.00|||5|
6430|ML|30|560.562.447||CAM|CAM|B||||||3|1|1|286.20|530.00|||5|
6431|ML|30|560.562.448||CAM|CAM|M||||||3|1|1|286.20|530.00|||5|
6432|ML|30|560.562.449||OUR|OUR|B||||||3|1|1|286.20|530.00|||5|
6433|ML|30|560.562.450||OUR|OUR|M||||||3|1|1|286.20|530.00|||5|
6434|ML|30|560.562.451||COB|COB|B||||||3|1|1|286.20|530.00|||5|
6435|ML|30|560.562.452||COB|COB|M||||||3|1|1|286.20|530.00|||5|
6436|ML|30|560.562.453||CHO|CHO|B||||||3|1|1|286.20|530.00|||5|
6437|ML|30|560.562.454||CHO|CHO|M||||||3|1|1|286.20|530.00|||5|
6438|ML|30|560.562.455||VAG|VAG|B||||||3|1|1|286.20|530.00|||5|
6439|ML|30|560.562.456||VAG|VAG|M||||||3|1|1|286.20|530.00|||5|
6440|ML|30|560.562.457||AZE|AZE|B||||||3|1|1|286.20|530.00|||5|
6441|ML|30|560.562.458||AZE|AZE|M||||||3|1|1|286.20|530.00|||5|
6442|ML|30|560.562.459||AMA|AMA|B||||||3|1|1|286.20|530.00|||5|
6443|ML|30|560.562.460||AMA|AMA|M||||||3|1|1|286.20|530.00|||5|
6444|ML|30|560.562.461||AES|AES|B||||||3|1|1|286.20|530.00|||5|
6445|ML|30|560.562.462||AES|AES|M||||||3|1|1|286.20|530.00|||5|
6446|ML|30|560.562.463||PRA|PRA|B||||||3|1|1|286.20|530.00|||5|
6447|ML|30|560.562.464||PRA|PRA|M||||||3|1|1|286.20|530.00|||5|
6448|ML|30|560.562.465||ROS|ROS|B||||||3|1|1|286.20|530.00|||5|
6449|ML|30|560.562.466||ROS|ROS|M||||||3|1|1|286.20|530.00|||5|
6450|ML|30|560.562.467||VER|VER|B||||||3|1|1|286.20|530.00|||5|
6451|ML|30|560.562.468||VER|VER|M||||||3|1|1|286.20|530.00|||5|
6452|ML|30|560.562.469||AZB|AZB|||||||3|1|1|286.20|530.00|||5|
6453|ML|30|560.562.470||DEN|DEN|||||||3|1|1|286.20|530.00|||5|
6454|ML|30|560.562.471||BLK|BLK|||||||3|1|1|286.20|530.00|||5|
6455|ML|30|560.562.472||ART|ART|||||||3|1|1|286.20|530.00|||5|
6456|ML|30|560.562.473||LIN|LIN|||||||3|1|1|286.20|530.00|||5|
6457|ML|30|560.562.474||HAL|HAL|||||||3|1|1|286.20|530.00|||5|
6458|ML|31|560.562.475||TBR|TBR|||||||3|1|1|205.20|380.00|||5|
6459|ML|31|560.562.242||TEA|TEA|||||||3|1|1|205.20|380.00|||5|
6460|ML|31|560.562.243||OAK|OAK|||||||3|1|1|205.20|380.00|||5|
6461|ML|31|560.562.244||JOP|JOP|||||||3|1|1|205.20|380.00|||5|
6462|ML|31|560.562.476||TBR|BCO|B||||||3|1|1|248.40|460.00|||5|
6463|ML|31|560.562.477||TBR|BCO|M||||||3|1|1|248.40|460.00|||5|
6464|ML|31|560.562.478||TBR|CCL|B||||||3|1|1|248.40|460.00|||5|
6465|ML|31|560.562.479||TBR|CCL|M||||||3|1|1|248.40|460.00|||5|
6466|ML|31|560.562.480||TBR|CME|B||||||3|1|1|248.40|460.00|||5|
6467|ML|31|560.562.481||TBR|CME|M||||||3|1|1|248.40|460.00|||5|
6468|ML|31|560.562.482||TBR|ANT|B||||||3|1|1|248.40|460.00|||5|
6469|ML|31|560.562.483||TBR|ANT|M||||||3|1|1|248.40|460.00|||5|
6470|ML|31|560.562.484||TBR|PTO|B||||||3|1|1|248.40|460.00|||5|
6471|ML|31|560.562.485||TBR|PTO|M||||||3|1|1|248.40|460.00|||5|
6472|ML|31|560.562.486||TBR|CRE|B||||||3|1|1|248.40|460.00|||5|
6473|ML|31|560.562.487||TBR|CRE|M||||||3|1|1|248.40|460.00|||5|
6474|ML|31|560.562.488||TBR|CAM|B||||||3|1|1|248.40|460.00|||5|
6475|ML|31|560.562.489||TBR|CAM|M||||||3|1|1|248.40|460.00|||5|
6476|ML|31|560.562.490||TBR|OUR|B||||||3|1|1|248.40|460.00|||5|
6477|ML|31|560.562.491||TBR|OUR|M||||||3|1|1|248.40|460.00|||5|
6478|ML|31|560.562.492||TBR|COB|B||||||3|1|1|248.40|460.00|||5|
6479|ML|31|560.562.493||TBR|COB|M||||||3|1|1|248.40|460.00|||5|
6480|ML|31|560.562.494||TBR|CHO|B||||||3|1|1|248.40|460.00|||5|
6481|ML|31|560.562.495||TBR|CHO|M||||||3|1|1|248.40|460.00|||5|
6482|ML|31|560.562.496||TBR|VAG|B||||||3|1|1|248.40|460.00|||5|
6483|ML|31|560.562.497||TBR|VAG|M||||||3|1|1|248.40|460.00|||5|
6484|ML|31|560.562.498||TBR|AZE|B||||||3|1|1|248.40|460.00|||5|
6485|ML|31|560.562.499||TBR|AZE|M||||||3|1|1|248.40|460.00|||5|
6486|ML|31|560.562.500||TBR|AMA|B||||||3|1|1|248.40|460.00|||5|
6487|ML|31|560.562.501||TBR|AMA|M||||||3|1|1|248.40|460.00|||5|
6488|ML|31|560.562.502||TBR|AES|B||||||3|1|1|248.40|460.00|||5|
6489|ML|31|560.562.503||TBR|AES|M||||||3|1|1|248.40|460.00|||5|
6490|ML|31|560.562.504||TBR|PRA|B||||||3|1|1|248.40|460.00|||5|
6491|ML|31|560.562.505||TBR|PRA|M||||||3|1|1|248.40|460.00|||5|
6492|ML|31|560.562.506||TBR|ROS|B||||||3|1|1|248.40|460.00|||5|
6493|ML|31|560.562.507||TBR|ROS|M||||||3|1|1|248.40|460.00|||5|
6494|ML|31|560.562.508||TBR|VER|B||||||3|1|1|248.40|460.00|||5|
6495|ML|31|560.562.509||TBR|VER|M||||||3|1|1|248.40|460.00|||5|
6496|ML|31|560.562.510||TBR|AZB|||||||3|1|1|248.40|460.00|||5|
6497|ML|31|560.562.511||TBR|DEN|||||||3|1|1|248.40|460.00|||5|
6498|ML|31|560.562.512||TBR|BLK|||||||3|1|1|248.40|460.00|||5|
6499|ML|31|560.562.513||TBR|ART|||||||3|1|1|248.40|460.00|||5|
6500|ML|31|560.562.514||TBR|LIN|||||||3|1|1|248.40|460.00|||5|
6501|ML|31|560.562.515||TBR|HAL|||||||3|1|1|248.40|460.00|||5|
6502|ML|31|560.562.516||BCO|BCO|B||||||3|1|1|270.00|500.00|||5|
6503|ML|31|560.562.517||BCO|BCO|M||||||3|1|1|270.00|500.00|||5|
6504|ML|31|560.562.518||CCL|CCL|B||||||3|1|1|270.00|500.00|||5|
6505|ML|31|560.562.519||CCL|CCL|M||||||3|1|1|270.00|500.00|||5|
6506|ML|31|560.562.520||CME|CME|B||||||3|1|1|270.00|500.00|||5|
6507|ML|31|560.562.521||CME|CME|M||||||3|1|1|270.00|500.00|||5|
6508|ML|31|560.562.522||ANT|ANT|B||||||3|1|1|270.00|500.00|||5|
6509|ML|31|560.562.523||ANT|ANT|M||||||3|1|1|270.00|500.00|||5|
6510|ML|31|560.562.524||PTO|PTO|B||||||3|1|1|270.00|500.00|||5|
6511|ML|31|560.562.525||PTO|PTO|M||||||3|1|1|270.00|500.00|||5|
6512|ML|31|560.562.526||CRE|CRE|B||||||3|1|1|270.00|500.00|||5|
6513|ML|31|560.562.527||CRE|CRE|M||||||3|1|1|270.00|500.00|||5|
6514|ML|31|560.562.528||CAM|CAM|B||||||3|1|1|270.00|500.00|||5|
6515|ML|31|560.562.529||CAM|CAM|M||||||3|1|1|270.00|500.00|||5|
6516|ML|31|560.562.530||OUR|OUR|B||||||3|1|1|270.00|500.00|||5|
6517|ML|31|560.562.531||OUR|OUR|M||||||3|1|1|270.00|500.00|||5|
6518|ML|31|560.562.532||COB|COB|B||||||3|1|1|270.00|500.00|||5|
6519|ML|31|560.562.533||COB|COB|M||||||3|1|1|270.00|500.00|||5|
6520|ML|31|560.562.534||CHO|CHO|B||||||3|1|1|270.00|500.00|||5|
6521|ML|31|560.562.535||CHO|CHO|M||||||3|1|1|270.00|500.00|||5|
6522|ML|31|560.562.536||VAG|VAG|B||||||3|1|1|270.00|500.00|||5|
6523|ML|31|560.562.537||VAG|VAG|M||||||3|1|1|270.00|500.00|||5|
6524|ML|31|560.562.538||AZE|AZE|B||||||3|1|1|270.00|500.00|||5|
6525|ML|31|560.562.539||AZE|AZE|M||||||3|1|1|270.00|500.00|||5|
6526|ML|31|560.562.540||AMA|AMA|B||||||3|1|1|270.00|500.00|||5|
6527|ML|31|560.562.541||AMA|AMA|M||||||3|1|1|270.00|500.00|||5|
6528|ML|31|560.562.542||AES|AES|B||||||3|1|1|270.00|500.00|||5|
6529|ML|31|560.562.543||AES|AES|M||||||3|1|1|270.00|500.00|||5|
6530|ML|31|560.562.544||PRA|PRA|B||||||3|1|1|270.00|500.00|||5|
6531|ML|31|560.562.545||PRA|PRA|M||||||3|1|1|270.00|500.00|||5|
6532|ML|31|560.562.546||ROS|ROS|B||||||3|1|1|270.00|500.00|||5|
6533|ML|31|560.562.547||ROS|ROS|M||||||3|1|1|270.00|500.00|||5|
6534|ML|31|560.562.548||VER|VER|B||||||3|1|1|270.00|500.00|||5|
6535|ML|31|560.562.549||VER|VER|M||||||3|1|1|270.00|500.00|||5|
6536|ML|31|560.562.550||AZB|AZB|||||||3|1|1|270.00|500.00|||5|
6537|ML|31|560.562.551||DEN|DEN|||||||3|1|1|270.00|500.00|||5|
6538|ML|31|560.562.552||BLK|BLK|||||||3|1|1|270.00|500.00|||5|
6539|ML|31|560.562.553||ART|ART|||||||3|1|1|270.00|500.00|||5|
6540|ML|31|560.562.554||LIN|LIN|||||||3|1|1|270.00|500.00|||5|
6541|ML|31|560.562.555||HAL|HAL|||||||3|1|1|270.00|500.00|||5|
6542|ML|32|563.564.394||TBR|TBR|||||||11|1|1|107.46|199.00|||5|
6543|ML|32|563.564.198||TEA|TEA|||||||11|1|1|107.46|199.00|||5|
6544|ML|32|563.564.199||OAK|OAK|||||||11|1|1|107.46|199.00|||5|
6545|ML|32|563.564.200||JOP|JOP|||||||11|1|1|107.46|199.00|||5|
6546|ML|32|563.564.395||TBR|BCO|B||||||11|1|1|150.66|279.00|||5|
6547|ML|32|563.564.396||TBR|BCO|M||||||11|1|1|150.66|279.00|||5|
6548|ML|32|563.564.397||TBR|CCL|B||||||11|1|1|150.66|279.00|||5|
6549|ML|32|563.564.398||TBR|CCL|M||||||11|1|1|150.66|279.00|||5|
6550|ML|32|563.564.399||TBR|CME|B||||||11|1|1|150.66|279.00|||5|
6551|ML|32|563.564.400||TBR|CME|M||||||11|1|1|150.66|279.00|||5|
6552|ML|32|563.564.401||TBR|ANT|B||||||11|1|1|150.66|279.00|||5|
6553|ML|32|563.564.402||TBR|ANT|M||||||11|1|1|150.66|279.00|||5|
6554|ML|32|563.564.403||TBR|PTO|B||||||11|1|1|150.66|279.00|||5|
6555|ML|32|563.564.404||TBR|PTO|M||||||11|1|1|150.66|279.00|||5|
6556|ML|32|563.564.405||TBR|CRE|B||||||11|1|1|150.66|279.00|||5|
6557|ML|32|563.564.406||TBR|CRE|M||||||11|1|1|150.66|279.00|||5|
6558|ML|32|563.564.407||TBR|CAM|B||||||11|1|1|150.66|279.00|||5|
6559|ML|32|563.564.408||TBR|CAM|M||||||11|1|1|150.66|279.00|||5|
6560|ML|32|563.564.409||TBR|OUR|B||||||11|1|1|150.66|279.00|||5|
6561|ML|32|563.564.410||TBR|OUR|M||||||11|1|1|150.66|279.00|||5|
6562|ML|32|563.564.411||TBR|COB|B||||||11|1|1|150.66|279.00|||5|
6563|ML|32|563.564.412||TBR|COB|M||||||11|1|1|150.66|279.00|||5|
6564|ML|32|563.564.413||TBR|CHO|B||||||11|1|1|150.66|279.00|||5|
6565|ML|32|563.564.414||TBR|CHO|M||||||11|1|1|150.66|279.00|||5|
6566|ML|32|563.564.415||TBR|VAG|B||||||11|1|1|150.66|279.00|||5|
6567|ML|32|563.564.416||TBR|VAG|M||||||11|1|1|150.66|279.00|||5|
6568|ML|32|563.564.417||TBR|AZE|B||||||11|1|1|150.66|279.00|||5|
6569|ML|32|563.564.418||TBR|AZE|M||||||11|1|1|150.66|279.00|||5|
6570|ML|32|563.564.419||TBR|AMA|B||||||11|1|1|150.66|279.00|||5|
6571|ML|32|563.564.420||TBR|AMA|M||||||11|1|1|150.66|279.00|||5|
6572|ML|32|563.564.421||TBR|AES|B||||||11|1|1|150.66|279.00|||5|
6573|ML|32|563.564.422||TBR|AES|M||||||11|1|1|150.66|279.00|||5|
6574|ML|32|563.564.423||TBR|PRA|B||||||11|1|1|150.66|279.00|||5|
6575|ML|32|563.564.424||TBR|PRA|M||||||11|1|1|150.66|279.00|||5|
6576|ML|32|563.564.425||TBR|ROS|B||||||11|1|1|150.66|279.00|||5|
6577|ML|32|563.564.426||TBR|ROS|M||||||11|1|1|150.66|279.00|||5|
6578|ML|32|563.564.427||TBR|VER|B||||||11|1|1|150.66|279.00|||5|
6579|ML|32|563.564.428||TBR|VER|M||||||11|1|1|150.66|279.00|||5|
6580|ML|32|563.564.429||TBR|AZB|||||||11|1|1|150.66|279.00|||5|
6581|ML|32|563.564.430||TBR|DEN|||||||11|1|1|150.66|279.00|||5|
6582|ML|32|563.564.431||TBR|BLK|||||||11|1|1|150.66|279.00|||5|
6583|ML|32|563.564.432||TBR|ART|||||||11|1|1|150.66|279.00|||5|
6584|ML|32|563.564.433||TBR|LIN|||||||11|1|1|150.66|279.00|||5|
6585|ML|32|563.564.434||TBR|HAL|||||||11|1|1|150.66|279.00|||5|
6586|ML|32|563.564.435||BCO|BCO|B||||||11|1|1|172.26|319.00|||5|
6587|ML|32|563.564.436||BCO|BCO|M||||||11|1|1|172.26|319.00|||5|
6588|ML|32|563.564.437||CCL|CCL|B||||||11|1|1|172.26|319.00|||5|
6589|ML|32|563.564.438||CCL|CCL|M||||||11|1|1|172.26|319.00|||5|
6590|ML|32|563.564.439||CME|CME|B||||||11|1|1|172.26|319.00|||5|
6591|ML|32|563.564.440||CME|CME|M||||||11|1|1|172.26|319.00|||5|
6592|ML|32|563.564.441||ANT|ANT|B||||||11|1|1|172.26|319.00|||5|
6593|ML|32|563.564.442||ANT|ANT|M||||||11|1|1|172.26|319.00|||5|
6594|ML|32|563.564.443||PTO|PTO|B||||||11|1|1|172.26|319.00|||5|
6595|ML|32|563.564.444||PTO|PTO|M||||||11|1|1|172.26|319.00|||5|
6596|ML|32|563.564.445||CRE|CRE|B||||||11|1|1|172.26|319.00|||5|
6597|ML|32|563.564.446||CRE|CRE|M||||||11|1|1|172.26|319.00|||5|
6598|ML|32|563.564.447||CAM|CAM|B||||||11|1|1|172.26|319.00|||5|
6599|ML|32|563.564.448||CAM|CAM|M||||||11|1|1|172.26|319.00|||5|
6600|ML|32|563.564.449||OUR|OUR|B||||||11|1|1|172.26|319.00|||5|
6601|ML|32|563.564.450||OUR|OUR|M||||||11|1|1|172.26|319.00|||5|
6602|ML|32|563.564.451||COB|COB|B||||||11|1|1|172.26|319.00|||5|
6603|ML|32|563.564.452||COB|COB|M||||||11|1|1|172.26|319.00|||5|
6604|ML|32|563.564.453||CHO|CHO|B||||||11|1|1|172.26|319.00|||5|
6605|ML|32|563.564.454||CHO|CHO|M||||||11|1|1|172.26|319.00|||5|
6606|ML|32|563.564.455||VAG|VAG|B||||||11|1|1|172.26|319.00|||5|
6607|ML|32|563.564.456||VAG|VAG|M||||||11|1|1|172.26|319.00|||5|
6608|ML|32|563.564.457||AZE|AZE|B||||||11|1|1|172.26|319.00|||5|
6609|ML|32|563.564.458||AZE|AZE|M||||||11|1|1|172.26|319.00|||5|
6610|ML|32|563.564.459||AMA|AMA|B||||||11|1|1|172.26|319.00|||5|
6611|ML|32|563.564.460||AMA|AMA|M||||||11|1|1|172.26|319.00|||5|
6612|ML|32|563.564.461||AES|AES|B||||||11|1|1|172.26|319.00|||5|
6613|ML|32|563.564.462||AES|AES|M||||||11|1|1|172.26|319.00|||5|
6614|ML|32|563.564.463||PRA|PRA|B||||||11|1|1|172.26|319.00|||5|
6615|ML|32|563.564.464||PRA|PRA|M||||||11|1|1|172.26|319.00|||5|
6616|ML|32|563.564.465||ROS|ROS|B||||||11|1|1|172.26|319.00|||5|
6617|ML|32|563.564.466||ROS|ROS|M||||||11|1|1|172.26|319.00|||5|
6618|ML|32|563.564.467||VER|VER|B||||||11|1|1|172.26|319.00|||5|
6619|ML|32|563.564.468||VER|VER|M||||||11|1|1|172.26|319.00|||5|
6620|ML|32|563.564.469||AZB|AZB|||||||11|1|1|172.26|319.00|||5|
6621|ML|32|563.564.470||DEN|DEN|||||||11|1|1|172.26|319.00|||5|
6622|ML|32|563.564.471||BLK|BLK|||||||11|1|1|172.26|319.00|||5|
6623|ML|32|563.564.472||ART|ART|||||||11|1|1|172.26|319.00|||5|
6624|ML|32|563.564.473||LIN|LIN|||||||11|1|1|172.26|319.00|||5|
6625|ML|32|563.564.474||HAL|HAL|||||||11|1|1|172.26|319.00|||5|
6626|ML|33|565.566.394||TBR|TBR|||||||12|1|1|113.40|210.00|||5|
6627|ML|33|565.566.198||TEA|TEA|||||||12|1|1|113.40|210.00|||5|
6628|ML|33|565.566.199||OAK|OAK|||||||12|1|1|113.40|210.00|||5|
6629|ML|33|565.566.200||JOP|JOP|||||||12|1|1|113.40|210.00|||5|
6630|ML|33|565.566.395||TBR|BCO|B||||||12|1|1|156.60|290.00|||5|
6631|ML|33|565.566.396||TBR|BCO|M||||||12|1|1|156.60|290.00|||5|
6632|ML|33|565.566.397||TBR|CCL|B||||||12|1|1|156.60|290.00|||5|
6633|ML|33|565.566.398||TBR|CCL|M||||||12|1|1|156.60|290.00|||5|
6634|ML|33|565.566.399||TBR|CME|B||||||12|1|1|156.60|290.00|||5|
6635|ML|33|565.566.400||TBR|CME|M||||||12|1|1|156.60|290.00|||5|
6636|ML|33|565.566.401||TBR|ANT|B||||||12|1|1|156.60|290.00|||5|
6637|ML|33|565.566.402||TBR|ANT|M||||||12|1|1|156.60|290.00|||5|
6638|ML|33|565.566.403||TBR|PTO|B||||||12|1|1|156.60|290.00|||5|
6639|ML|33|565.566.404||TBR|PTO|M||||||12|1|1|156.60|290.00|||5|
6640|ML|33|565.566.405||TBR|CRE|B||||||12|1|1|156.60|290.00|||5|
6641|ML|33|565.566.406||TBR|CRE|M||||||12|1|1|156.60|290.00|||5|
6642|ML|33|565.566.407||TBR|CAM|B||||||12|1|1|156.60|290.00|||5|
6643|ML|33|565.566.408||TBR|CAM|M||||||12|1|1|156.60|290.00|||5|
6644|ML|33|565.566.409||TBR|OUR|B||||||12|1|1|156.60|290.00|||5|
6645|ML|33|565.566.410||TBR|OUR|M||||||12|1|1|156.60|290.00|||5|
6646|ML|33|565.566.411||TBR|COB|B||||||12|1|1|156.60|290.00|||5|
6647|ML|33|565.566.412||TBR|COB|M||||||12|1|1|156.60|290.00|||5|
6648|ML|33|565.566.413||TBR|CHO|B||||||12|1|1|156.60|290.00|||5|
6649|ML|33|565.566.414||TBR|CHO|M||||||12|1|1|156.60|290.00|||5|
6650|ML|33|565.566.415||TBR|VAG|B||||||12|1|1|156.60|290.00|||5|
6651|ML|33|565.566.416||TBR|VAG|M||||||12|1|1|156.60|290.00|||5|
6652|ML|33|565.566.417||TBR|AZE|B||||||12|1|1|156.60|290.00|||5|
6653|ML|33|565.566.418||TBR|AZE|M||||||12|1|1|156.60|290.00|||5|
6654|ML|33|565.566.419||TBR|AMA|B||||||12|1|1|156.60|290.00|||5|
6655|ML|33|565.566.420||TBR|AMA|M||||||12|1|1|156.60|290.00|||5|
6656|ML|33|565.566.421||TBR|AES|B||||||12|1|1|156.60|290.00|||5|
6657|ML|33|565.566.422||TBR|AES|M||||||12|1|1|156.60|290.00|||5|
6658|ML|33|565.566.423||TBR|PRA|B||||||12|1|1|156.60|290.00|||5|
6659|ML|33|565.566.424||TBR|PRA|M||||||12|1|1|156.60|290.00|||5|
6660|ML|33|565.566.425||TBR|ROS|B||||||12|1|1|156.60|290.00|||5|
6661|ML|33|565.566.426||TBR|ROS|M||||||12|1|1|156.60|290.00|||5|
6662|ML|33|565.566.427||TBR|VER|B||||||12|1|1|156.60|290.00|||5|
6663|ML|33|565.566.428||TBR|VER|M||||||12|1|1|156.60|290.00|||5|
6664|ML|33|565.566.429||TBR|AZB|||||||12|1|1|156.60|290.00|||5|
6665|ML|33|565.566.430||TBR|DEN|||||||12|1|1|156.60|290.00|||5|
6666|ML|33|565.566.431||TBR|BLK|||||||12|1|1|156.60|290.00|||5|
6667|ML|33|565.566.432||TBR|ART|||||||12|1|1|156.60|290.00|||5|
6668|ML|33|565.566.433||TBR|LIN|||||||12|1|1|156.60|290.00|||5|
6669|ML|33|565.566.434||TBR|HAL|||||||12|1|1|156.60|290.00|||5|
6670|ML|33|565.566.435||BCO|BCO|B||||||12|1|1|178.20|330.00|||5|
6671|ML|33|565.566.436||BCO|BCO|M||||||12|1|1|178.20|330.00|||5|
6672|ML|33|565.566.437||CCL|CCL|B||||||12|1|1|178.20|330.00|||5|
6673|ML|33|565.566.438||CCL|CCL|M||||||12|1|1|178.20|330.00|||5|
6674|ML|33|565.566.439||CME|CME|B||||||12|1|1|178.20|330.00|||5|
6675|ML|33|565.566.440||CME|CME|M||||||12|1|1|178.20|330.00|||5|
6676|ML|33|565.566.441||ANT|ANT|B||||||12|1|1|178.20|330.00|||5|
6677|ML|33|565.566.442||ANT|ANT|M||||||12|1|1|178.20|330.00|||5|
6678|ML|33|565.566.443||PTO|PTO|B||||||12|1|1|178.20|330.00|||5|
6679|ML|33|565.566.444||PTO|PTO|M||||||12|1|1|178.20|330.00|||5|
6680|ML|33|565.566.445||CRE|CRE|B||||||12|1|1|178.20|330.00|||5|
6681|ML|33|565.566.446||CRE|CRE|M||||||12|1|1|178.20|330.00|||5|
6682|ML|33|565.566.447||CAM|CAM|B||||||12|1|1|178.20|330.00|||5|
6683|ML|33|565.566.448||CAM|CAM|M||||||12|1|1|178.20|330.00|||5|
6684|ML|33|565.566.449||OUR|OUR|B||||||12|1|1|178.20|330.00|||5|
6685|ML|33|565.566.450||OUR|OUR|M||||||12|1|1|178.20|330.00|||5|
6686|ML|33|565.566.451||COB|COB|B||||||12|1|1|178.20|330.00|||5|
6687|ML|33|565.566.452||COB|COB|M||||||12|1|1|178.20|330.00|||5|
6688|ML|33|565.566.453||CHO|CHO|B||||||12|1|1|178.20|330.00|||5|
6689|ML|33|565.566.454||CHO|CHO|M||||||12|1|1|178.20|330.00|||5|
6690|ML|33|565.566.455||VAG|VAG|B||||||12|1|1|178.20|330.00|||5|
6691|ML|33|565.566.456||VAG|VAG|M||||||12|1|1|178.20|330.00|||5|
6692|ML|33|565.566.457||AZE|AZE|B||||||12|1|1|178.20|330.00|||5|
6693|ML|33|565.566.458||AZE|AZE|M||||||12|1|1|178.20|330.00|||5|
6694|ML|33|565.566.459||AMA|AMA|B||||||12|1|1|178.20|330.00|||5|
6695|ML|33|565.566.460||AMA|AMA|M||||||12|1|1|178.20|330.00|||5|
6696|ML|33|565.566.461||AES|AES|B||||||12|1|1|178.20|330.00|||5|
6697|ML|33|565.566.462||AES|AES|M||||||12|1|1|178.20|330.00|||5|
6698|ML|33|565.566.463||PRA|PRA|B||||||12|1|1|178.20|330.00|||5|
6699|ML|33|565.566.464||PRA|PRA|M||||||12|1|1|178.20|330.00|||5|
6700|ML|33|565.566.465||ROS|ROS|B||||||12|1|1|178.20|330.00|||5|
6701|ML|33|565.566.466||ROS|ROS|M||||||12|1|1|178.20|330.00|||5|
6702|ML|33|565.566.467||VER|VER|B||||||12|1|1|178.20|330.00|||5|
6703|ML|33|565.566.468||VER|VER|M||||||12|1|1|178.20|330.00|||5|
6704|ML|33|565.566.469||AZB|AZB|||||||12|1|1|178.20|330.00|||5|
6705|ML|33|565.566.470||DEN|DEN|||||||12|1|1|178.20|330.00|||5|
6706|ML|33|565.566.471||BLK|BLK|||||||12|1|1|178.20|330.00|||5|
6707|ML|33|565.566.472||ART|ART|||||||12|1|1|178.20|330.00|||5|
6708|ML|33|565.566.473||LIN|LIN|||||||12|1|1|178.20|330.00|||5|
6709|ML|33|565.566.474||HAL|HAL|||||||12|1|1|178.20|330.00|||5|
6710|ML|34|567.568.394||TBR|TBR|||||||18|1|1|94.50|175.00|||6|
6711|ML|34|567.568.198||TEA|TEA|||||||18|1|1|94.50|175.00|||6|
6712|ML|34|567.568.199||OAK|OAK|||||||18|1|1|94.50|175.00|||6|
6713|ML|34|567.568.200||JOP|JOP|||||||18|1|1|94.50|175.00|||6|
6714|ML|34|567.568.395||TBR|BCO|B||||||18|1|1|137.70|255.00|||6|
6715|ML|34|567.568.396||TBR|BCO|M||||||18|1|1|137.70|255.00|||6|
6716|ML|34|567.568.397||TBR|CCL|B||||||18|1|1|137.70|255.00|||6|
6717|ML|34|567.568.398||TBR|CCL|M||||||18|1|1|137.70|255.00|||6|
6718|ML|34|567.568.399||TBR|CME|B||||||18|1|1|137.70|255.00|||6|
6719|ML|34|567.568.400||TBR|CME|M||||||18|1|1|137.70|255.00|||6|
6720|ML|34|567.568.401||TBR|ANT|B||||||18|1|1|137.70|255.00|||6|
6721|ML|34|567.568.402||TBR|ANT|M||||||18|1|1|137.70|255.00|||6|
6722|ML|34|567.568.403||TBR|PTO|B||||||18|1|1|137.70|255.00|||6|
6723|ML|34|567.568.404||TBR|PTO|M||||||18|1|1|137.70|255.00|||6|
6724|ML|34|567.568.405||TBR|CRE|B||||||18|1|1|137.70|255.00|||6|
6725|ML|34|567.568.406||TBR|CRE|M||||||18|1|1|137.70|255.00|||6|
6726|ML|34|567.568.407||TBR|CAM|B||||||18|1|1|137.70|255.00|||6|
6727|ML|34|567.568.408||TBR|CAM|M||||||18|1|1|137.70|255.00|||6|
6728|ML|34|567.568.409||TBR|OUR|B||||||18|1|1|137.70|255.00|||6|
6729|ML|34|567.568.410||TBR|OUR|M||||||18|1|1|137.70|255.00|||6|
6730|ML|34|567.568.411||TBR|COB|B||||||18|1|1|137.70|255.00|||6|
6731|ML|34|567.568.412||TBR|COB|M||||||18|1|1|137.70|255.00|||6|
6732|ML|34|567.568.413||TBR|CHO|B||||||18|1|1|137.70|255.00|||6|
6733|ML|34|567.568.414||TBR|CHO|M||||||18|1|1|137.70|255.00|||6|
6734|ML|34|567.568.415||TBR|VAG|B||||||18|1|1|137.70|255.00|||6|
6735|ML|34|567.568.416||TBR|VAG|M||||||18|1|1|137.70|255.00|||6|
6736|ML|34|567.568.417||TBR|AZE|B||||||18|1|1|137.70|255.00|||6|
6737|ML|34|567.568.418||TBR|AZE|M||||||18|1|1|137.70|255.00|||6|
6738|ML|34|567.568.419||TBR|AMA|B||||||18|1|1|137.70|255.00|||6|
6739|ML|34|567.568.420||TBR|AMA|M||||||18|1|1|137.70|255.00|||6|
6740|ML|34|567.568.421||TBR|AES|B||||||18|1|1|137.70|255.00|||6|
6741|ML|34|567.568.422||TBR|AES|M||||||18|1|1|137.70|255.00|||6|
6742|ML|34|567.568.423||TBR|PRA|B||||||18|1|1|137.70|255.00|||6|
6743|ML|34|567.568.424||TBR|PRA|M||||||18|1|1|137.70|255.00|||6|
6744|ML|34|567.568.425||TBR|ROS|B||||||18|1|1|137.70|255.00|||6|
6745|ML|34|567.568.426||TBR|ROS|M||||||18|1|1|137.70|255.00|||6|
6746|ML|34|567.568.427||TBR|VER|B||||||18|1|1|137.70|255.00|||6|
6747|ML|34|567.568.428||TBR|VER|M||||||18|1|1|137.70|255.00|||6|
6748|ML|34|567.568.429||TBR|AZB|||||||18|1|1|137.70|255.00|||6|
6749|ML|34|567.568.430||TBR|DEN|||||||18|1|1|137.70|255.00|||6|
6750|ML|34|567.568.431||TBR|BLK|||||||18|1|1|137.70|255.00|||6|
6751|ML|34|567.568.432||TBR|ART|||||||18|1|1|137.70|255.00|||6|
6752|ML|34|567.568.433||TBR|LIN|||||||18|1|1|137.70|255.00|||6|
6753|ML|34|567.568.434||TBR|HAL|||||||18|1|1|137.70|255.00|||6|
6754|ML|34|567.568.435||BCO|BCO|B||||||18|1|1|159.30|295.00|||6|
6755|ML|34|567.568.436||BCO|BCO|M||||||18|1|1|159.30|295.00|||6|
6756|ML|34|567.568.437||CCL|CCL|B||||||18|1|1|159.30|295.00|||6|
6757|ML|34|567.568.438||CCL|CCL|M||||||18|1|1|159.30|295.00|||6|
6758|ML|34|567.568.439||CME|CME|B||||||18|1|1|159.30|295.00|||6|
6759|ML|34|567.568.440||CME|CME|M||||||18|1|1|159.30|295.00|||6|
6760|ML|34|567.568.441||ANT|ANT|B||||||18|1|1|159.30|295.00|||6|
6761|ML|34|567.568.442||ANT|ANT|M||||||18|1|1|159.30|295.00|||6|
6762|ML|34|567.568.443||PTO|PTO|B||||||18|1|1|159.30|295.00|||6|
6763|ML|34|567.568.444||PTO|PTO|M||||||18|1|1|159.30|295.00|||6|
6764|ML|34|567.568.445||CRE|CRE|B||||||18|1|1|159.30|295.00|||6|
6765|ML|34|567.568.446||CRE|CRE|M||||||18|1|1|159.30|295.00|||6|
6766|ML|34|567.568.447||CAM|CAM|B||||||18|1|1|159.30|295.00|||6|
6767|ML|34|567.568.448||CAM|CAM|M||||||18|1|1|159.30|295.00|||6|
6768|ML|34|567.568.449||OUR|OUR|B||||||18|1|1|159.30|295.00|||6|
6769|ML|34|567.568.450||OUR|OUR|M||||||18|1|1|159.30|295.00|||6|
6770|ML|34|567.568.451||COB|COB|B||||||18|1|1|159.30|295.00|||6|
6771|ML|34|567.568.452||COB|COB|M||||||18|1|1|159.30|295.00|||6|
6772|ML|34|567.568.453||CHO|CHO|B||||||18|1|1|159.30|295.00|||6|
6773|ML|34|567.568.454||CHO|CHO|M||||||18|1|1|159.30|295.00|||6|
6774|ML|34|567.568.455||VAG|VAG|B||||||18|1|1|159.30|295.00|||6|
6775|ML|34|567.568.456||VAG|VAG|M||||||18|1|1|159.30|295.00|||6|
6776|ML|34|567.568.457||AZE|AZE|B||||||18|1|1|159.30|295.00|||6|
6777|ML|34|567.568.458||AZE|AZE|M||||||18|1|1|159.30|295.00|||6|
6778|ML|34|567.568.459||AMA|AMA|B||||||18|1|1|159.30|295.00|||6|
6779|ML|34|567.568.460||AMA|AMA|M||||||18|1|1|159.30|295.00|||6|
6780|ML|34|567.568.461||AES|AES|B||||||18|1|1|159.30|295.00|||6|
6781|ML|34|567.568.462||AES|AES|M||||||18|1|1|159.30|295.00|||6|
6782|ML|34|567.568.463||PRA|PRA|B||||||18|1|1|159.30|295.00|||6|
6783|ML|34|567.568.464||PRA|PRA|M||||||18|1|1|159.30|295.00|||6|
6784|ML|34|567.568.465||ROS|ROS|B||||||18|1|1|159.30|295.00|||6|
6785|ML|34|567.568.466||ROS|ROS|M||||||18|1|1|159.30|295.00|||6|
6786|ML|34|567.568.467||VER|VER|B||||||18|1|1|159.30|295.00|||6|
6787|ML|34|567.568.468||VER|VER|M||||||18|1|1|159.30|295.00|||6|
6788|ML|34|567.568.469||AZB|AZB|||||||18|1|1|159.30|295.00|||6|
6789|ML|34|567.568.470||DEN|DEN|||||||18|1|1|159.30|295.00|||6|
6790|ML|34|567.568.471||BLK|BLK|||||||18|1|1|159.30|295.00|||6|
6791|ML|34|567.568.472||ART|ART|||||||18|1|1|159.30|295.00|||6|
6792|ML|34|567.568.473||LIN|LIN|||||||18|1|1|159.30|295.00|||6|
6793|ML|34|567.568.474||HAL|HAL|||||||18|1|1|159.30|295.00|||6|
6794|ML|35|567.568.475||TBR|TBR|||||||18|1|1|94.50|175.00|||6|
6795|ML|35|567.568.242||TEA|TEA|||||||18|1|1|94.50|175.00|||6|
6796|ML|35|567.568.243||OAK|OAK|||||||18|1|1|94.50|175.00|||6|
6797|ML|35|567.568.244||JOP|JOP|||||||18|1|1|94.50|175.00|||6|
6798|ML|35|567.568.476||TBR|BCO|B||||||18|1|1|137.70|255.00|||6|
6799|ML|35|567.568.477||TBR|BCO|M||||||18|1|1|137.70|255.00|||6|
6800|ML|35|567.568.478||TBR|CCL|B||||||18|1|1|137.70|255.00|||6|
6801|ML|35|567.568.479||TBR|CCL|M||||||18|1|1|137.70|255.00|||6|
6802|ML|35|567.568.480||TBR|CME|B||||||18|1|1|137.70|255.00|||6|
6803|ML|35|567.568.481||TBR|CME|M||||||18|1|1|137.70|255.00|||6|
6804|ML|35|567.568.482||TBR|ANT|B||||||18|1|1|137.70|255.00|||6|
6805|ML|35|567.568.483||TBR|ANT|M||||||18|1|1|137.70|255.00|||6|
6806|ML|35|567.568.484||TBR|PTO|B||||||18|1|1|137.70|255.00|||6|
6807|ML|35|567.568.485||TBR|PTO|M||||||18|1|1|137.70|255.00|||6|
6808|ML|35|567.568.486||TBR|CRE|B||||||18|1|1|137.70|255.00|||6|
6809|ML|35|567.568.487||TBR|CRE|M||||||18|1|1|137.70|255.00|||6|
6810|ML|35|567.568.488||TBR|CAM|B||||||18|1|1|137.70|255.00|||6|
6811|ML|35|567.568.489||TBR|CAM|M||||||18|1|1|137.70|255.00|||6|
6812|ML|35|567.568.490||TBR|OUR|B||||||18|1|1|137.70|255.00|||6|
6813|ML|35|567.568.491||TBR|OUR|M||||||18|1|1|137.70|255.00|||6|
6814|ML|35|567.568.492||TBR|COB|B||||||18|1|1|137.70|255.00|||6|
6815|ML|35|567.568.493||TBR|COB|M||||||18|1|1|137.70|255.00|||6|
6816|ML|35|567.568.494||TBR|CHO|B||||||18|1|1|137.70|255.00|||6|
6817|ML|35|567.568.495||TBR|CHO|M||||||18|1|1|137.70|255.00|||6|
6818|ML|35|567.568.496||TBR|VAG|B||||||18|1|1|137.70|255.00|||6|
6819|ML|35|567.568.497||TBR|VAG|M||||||18|1|1|137.70|255.00|||6|
6820|ML|35|567.568.498||TBR|AZE|B||||||18|1|1|137.70|255.00|||6|
6821|ML|35|567.568.499||TBR|AZE|M||||||18|1|1|137.70|255.00|||6|
6822|ML|35|567.568.500||TBR|AMA|B||||||18|1|1|137.70|255.00|||6|
6823|ML|35|567.568.501||TBR|AMA|M||||||18|1|1|137.70|255.00|||6|
6824|ML|35|567.568.502||TBR|AES|B||||||18|1|1|137.70|255.00|||6|
6825|ML|35|567.568.503||TBR|AES|M||||||18|1|1|137.70|255.00|||6|
6826|ML|35|567.568.504||TBR|PRA|B||||||18|1|1|137.70|255.00|||6|
6827|ML|35|567.568.505||TBR|PRA|M||||||18|1|1|137.70|255.00|||6|
6828|ML|35|567.568.506||TBR|ROS|B||||||18|1|1|137.70|255.00|||6|
6829|ML|35|567.568.507||TBR|ROS|M||||||18|1|1|137.70|255.00|||6|
6830|ML|35|567.568.508||TBR|VER|B||||||18|1|1|137.70|255.00|||6|
6831|ML|35|567.568.509||TBR|VER|M||||||18|1|1|137.70|255.00|||6|
6832|ML|35|567.568.510||TBR|AZB|||||||18|1|1|137.70|255.00|||6|
6833|ML|35|567.568.511||TBR|DEN|||||||18|1|1|137.70|255.00|||6|
6834|ML|35|567.568.512||TBR|BLK|||||||18|1|1|137.70|255.00|||6|
6835|ML|35|567.568.513||TBR|ART|||||||18|1|1|137.70|255.00|||6|
6836|ML|35|567.568.514||TBR|LIN|||||||18|1|1|137.70|255.00|||6|
6837|ML|35|567.568.515||TBR|HAL|||||||18|1|1|137.70|255.00|||6|
6838|ML|35|567.568.516||BCO|BCO|B||||||18|1|1|159.30|295.00|||6|
6839|ML|35|567.568.517||BCO|BCO|M||||||18|1|1|159.30|295.00|||6|
6840|ML|35|567.568.518||CCL|CCL|B||||||18|1|1|159.30|295.00|||6|
6841|ML|35|567.568.519||CCL|CCL|M||||||18|1|1|159.30|295.00|||6|
6842|ML|35|567.568.520||CME|CME|B||||||18|1|1|159.30|295.00|||6|
6843|ML|35|567.568.521||CME|CME|M||||||18|1|1|159.30|295.00|||6|
6844|ML|35|567.568.522||ANT|ANT|B||||||18|1|1|159.30|295.00|||6|
6845|ML|35|567.568.523||ANT|ANT|M||||||18|1|1|159.30|295.00|||6|
6846|ML|35|567.568.524||PTO|PTO|B||||||18|1|1|159.30|295.00|||6|
6847|ML|35|567.568.525||PTO|PTO|M||||||18|1|1|159.30|295.00|||6|
6848|ML|35|567.568.526||CRE|CRE|B||||||18|1|1|159.30|295.00|||6|
6849|ML|35|567.568.527||CRE|CRE|M||||||18|1|1|159.30|295.00|||6|
6850|ML|35|567.568.528||CAM|CAM|B||||||18|1|1|159.30|295.00|||6|
6851|ML|35|567.568.529||CAM|CAM|M||||||18|1|1|159.30|295.00|||6|
6852|ML|35|567.568.530||OUR|OUR|B||||||18|1|1|159.30|295.00|||6|
6853|ML|35|567.568.531||OUR|OUR|M||||||18|1|1|159.30|295.00|||6|
6854|ML|35|567.568.532||COB|COB|B||||||18|1|1|159.30|295.00|||6|
6855|ML|35|567.568.533||COB|COB|M||||||18|1|1|159.30|295.00|||6|
6856|ML|35|567.568.534||CHO|CHO|B||||||18|1|1|159.30|295.00|||6|
6857|ML|35|567.568.535||CHO|CHO|M||||||18|1|1|159.30|295.00|||6|
6858|ML|35|567.568.536||VAG|VAG|B||||||18|1|1|159.30|295.00|||6|
6859|ML|35|567.568.537||VAG|VAG|M||||||18|1|1|159.30|295.00|||6|
6860|ML|35|567.568.538||AZE|AZE|B||||||18|1|1|159.30|295.00|||6|
6861|ML|35|567.568.539||AZE|AZE|M||||||18|1|1|159.30|295.00|||6|
6862|ML|35|567.568.540||AMA|AMA|B||||||18|1|1|159.30|295.00|||6|
6863|ML|35|567.568.541||AMA|AMA|M||||||18|1|1|159.30|295.00|||6|
6864|ML|35|567.568.542||AES|AES|B||||||18|1|1|159.30|295.00|||6|
6865|ML|35|567.568.543||AES|AES|M||||||18|1|1|159.30|295.00|||6|
6866|ML|35|567.568.544||PRA|PRA|B||||||18|1|1|159.30|295.00|||6|
6867|ML|35|567.568.545||PRA|PRA|M||||||18|1|1|159.30|295.00|||6|
6868|ML|35|567.568.546||ROS|ROS|B||||||18|1|1|159.30|295.00|||6|
6869|ML|35|567.568.547||ROS|ROS|M||||||18|1|1|159.30|295.00|||6|
6870|ML|35|567.568.548||VER|VER|B||||||18|1|1|159.30|295.00|||6|
6871|ML|35|567.568.549||VER|VER|M||||||18|1|1|159.30|295.00|||6|
6872|ML|35|567.568.550||AZB|AZB|||||||18|1|1|159.30|295.00|||6|
6873|ML|35|567.568.551||DEN|DEN|||||||18|1|1|159.30|295.00|||6|
6874|ML|35|567.568.552||BLK|BLK|||||||18|1|1|159.30|295.00|||6|
6875|ML|35|567.568.553||ART|ART|||||||18|1|1|159.30|295.00|||6|
6876|ML|35|567.568.554||LIN|LIN|||||||18|1|1|159.30|295.00|||6|
6877|ML|35|567.568.555||HAL|HAL|||||||18|1|1|159.30|295.00|||6|
6878|ML|34|569.568.394||TBR|TBR|||||||14|1|1|96.12|178.00|||6|
6879|ML|34|569.568.198||TEA|TEA|||||||14|1|1|96.12|178.00|||6|
6880|ML|34|569.568.199||OAK|OAK|||||||14|1|1|96.12|178.00|||6|
6881|ML|34|569.568.200||JOP|JOP|||||||14|1|1|96.12|178.00|||6|
6882|ML|34|569.568.395||TBR|BCO|B||||||14|1|1|139.32|258.00|||6|
6883|ML|34|569.568.396||TBR|BCO|M||||||14|1|1|139.32|258.00|||6|
6884|ML|34|569.568.397||TBR|CCL|B||||||14|1|1|139.32|258.00|||6|
6885|ML|34|569.568.398||TBR|CCL|M||||||14|1|1|139.32|258.00|||6|
6886|ML|34|569.568.399||TBR|CME|B||||||14|1|1|139.32|258.00|||6|
6887|ML|34|569.568.400||TBR|CME|M||||||14|1|1|139.32|258.00|||6|
6888|ML|34|569.568.401||TBR|ANT|B||||||14|1|1|139.32|258.00|||6|
6889|ML|34|569.568.402||TBR|ANT|M||||||14|1|1|139.32|258.00|||6|
6890|ML|34|569.568.403||TBR|PTO|B||||||14|1|1|139.32|258.00|||6|
6891|ML|34|569.568.404||TBR|PTO|M||||||14|1|1|139.32|258.00|||6|
6892|ML|34|569.568.405||TBR|CRE|B||||||14|1|1|139.32|258.00|||6|
6893|ML|34|569.568.406||TBR|CRE|M||||||14|1|1|139.32|258.00|||6|
6894|ML|34|569.568.407||TBR|CAM|B||||||14|1|1|139.32|258.00|||6|
6895|ML|34|569.568.408||TBR|CAM|M||||||14|1|1|139.32|258.00|||6|
6896|ML|34|569.568.409||TBR|OUR|B||||||14|1|1|139.32|258.00|||6|
6897|ML|34|569.568.410||TBR|OUR|M||||||14|1|1|139.32|258.00|||6|
6898|ML|34|569.568.411||TBR|COB|B||||||14|1|1|139.32|258.00|||6|
6899|ML|34|569.568.412||TBR|COB|M||||||14|1|1|139.32|258.00|||6|
6900|ML|34|569.568.413||TBR|CHO|B||||||14|1|1|139.32|258.00|||6|
6901|ML|34|569.568.414||TBR|CHO|M||||||14|1|1|139.32|258.00|||6|
6902|ML|34|569.568.415||TBR|VAG|B||||||14|1|1|139.32|258.00|||6|
6903|ML|34|569.568.416||TBR|VAG|M||||||14|1|1|139.32|258.00|||6|
6904|ML|34|569.568.417||TBR|AZE|B||||||14|1|1|139.32|258.00|||6|
6905|ML|34|569.568.418||TBR|AZE|M||||||14|1|1|139.32|258.00|||6|
6906|ML|34|569.568.419||TBR|AMA|B||||||14|1|1|139.32|258.00|||6|
6907|ML|34|569.568.420||TBR|AMA|M||||||14|1|1|139.32|258.00|||6|
6908|ML|34|569.568.421||TBR|AES|B||||||14|1|1|139.32|258.00|||6|
6909|ML|34|569.568.422||TBR|AES|M||||||14|1|1|139.32|258.00|||6|
6910|ML|34|569.568.423||TBR|PRA|B||||||14|1|1|139.32|258.00|||6|
6911|ML|34|569.568.424||TBR|PRA|M||||||14|1|1|139.32|258.00|||6|
6912|ML|34|569.568.425||TBR|ROS|B||||||14|1|1|139.32|258.00|||6|
6913|ML|34|569.568.426||TBR|ROS|M||||||14|1|1|139.32|258.00|||6|
6914|ML|34|569.568.427||TBR|VER|B||||||14|1|1|139.32|258.00|||6|
6915|ML|34|569.568.428||TBR|VER|M||||||14|1|1|139.32|258.00|||6|
6916|ML|34|569.568.429||TBR|AZB|||||||14|1|1|139.32|258.00|||6|
6917|ML|34|569.568.430||TBR|DEN|||||||14|1|1|139.32|258.00|||6|
6918|ML|34|569.568.431||TBR|BLK|||||||14|1|1|139.32|258.00|||6|
6919|ML|34|569.568.432||TBR|ART|||||||14|1|1|139.32|258.00|||6|
6920|ML|34|569.568.433||TBR|LIN|||||||14|1|1|139.32|258.00|||6|
6921|ML|34|569.568.434||TBR|HAL|||||||14|1|1|139.32|258.00|||6|
6922|ML|34|569.568.435||BCO|BCO|B||||||14|1|1|160.92|298.00|||6|
6923|ML|34|569.568.436||BCO|BCO|M||||||14|1|1|160.92|298.00|||6|
6924|ML|34|569.568.437||CCL|CCL|B||||||14|1|1|160.92|298.00|||6|
6925|ML|34|569.568.438||CCL|CCL|M||||||14|1|1|160.92|298.00|||6|
6926|ML|34|569.568.439||CME|CME|B||||||14|1|1|160.92|298.00|||6|
6927|ML|34|569.568.440||CME|CME|M||||||14|1|1|160.92|298.00|||6|
6928|ML|34|569.568.441||ANT|ANT|B||||||14|1|1|160.92|298.00|||6|
6929|ML|34|569.568.442||ANT|ANT|M||||||14|1|1|160.92|298.00|||6|
6930|ML|34|569.568.443||PTO|PTO|B||||||14|1|1|160.92|298.00|||6|
6931|ML|34|569.568.444||PTO|PTO|M||||||14|1|1|160.92|298.00|||6|
6932|ML|34|569.568.445||CRE|CRE|B||||||14|1|1|160.92|298.00|||6|
6933|ML|34|569.568.446||CRE|CRE|M||||||14|1|1|160.92|298.00|||6|
6934|ML|34|569.568.447||CAM|CAM|B||||||14|1|1|160.92|298.00|||6|
6935|ML|34|569.568.448||CAM|CAM|M||||||14|1|1|160.92|298.00|||6|
6936|ML|34|569.568.449||OUR|OUR|B||||||14|1|1|160.92|298.00|||6|
6937|ML|34|569.568.450||OUR|OUR|M||||||14|1|1|160.92|298.00|||6|
6938|ML|34|569.568.451||COB|COB|B||||||14|1|1|160.92|298.00|||6|
6939|ML|34|569.568.452||COB|COB|M||||||14|1|1|160.92|298.00|||6|
6940|ML|34|569.568.453||CHO|CHO|B||||||14|1|1|160.92|298.00|||6|
6941|ML|34|569.568.454||CHO|CHO|M||||||14|1|1|160.92|298.00|||6|
6942|ML|34|569.568.455||VAG|VAG|B||||||14|1|1|160.92|298.00|||6|
6943|ML|34|569.568.456||VAG|VAG|M||||||14|1|1|160.92|298.00|||6|
6944|ML|34|569.568.457||AZE|AZE|B||||||14|1|1|160.92|298.00|||6|
6945|ML|34|569.568.458||AZE|AZE|M||||||14|1|1|160.92|298.00|||6|
6946|ML|34|569.568.459||AMA|AMA|B||||||14|1|1|160.92|298.00|||6|
6947|ML|34|569.568.460||AMA|AMA|M||||||14|1|1|160.92|298.00|||6|
6948|ML|34|569.568.461||AES|AES|B||||||14|1|1|160.92|298.00|||6|
6949|ML|34|569.568.462||AES|AES|M||||||14|1|1|160.92|298.00|||6|
6950|ML|34|569.568.463||PRA|PRA|B||||||14|1|1|160.92|298.00|||6|
6951|ML|34|569.568.464||PRA|PRA|M||||||14|1|1|160.92|298.00|||6|
6952|ML|34|569.568.465||ROS|ROS|B||||||14|1|1|160.92|298.00|||6|
6953|ML|34|569.568.466||ROS|ROS|M||||||14|1|1|160.92|298.00|||6|
6954|ML|34|569.568.467||VER|VER|B||||||14|1|1|160.92|298.00|||6|
6955|ML|34|569.568.468||VER|VER|M||||||14|1|1|160.92|298.00|||6|
6956|ML|34|569.568.469||AZB|AZB|||||||14|1|1|160.92|298.00|||6|
6957|ML|34|569.568.470||DEN|DEN|||||||14|1|1|160.92|298.00|||6|
6958|ML|34|569.568.471||BLK|BLK|||||||14|1|1|160.92|298.00|||6|
6959|ML|34|569.568.472||ART|ART|||||||14|1|1|160.92|298.00|||6|
6960|ML|34|569.568.473||LIN|LIN|||||||14|1|1|160.92|298.00|||6|
6961|ML|34|569.568.474||HAL|HAL|||||||14|1|1|160.92|298.00|||6|
6962|ML|35|569.568.475||TBR|TBR|||||||14|1|1|96.12|178.00|||6|
6963|ML|35|569.568.242||TEA|TEA|||||||14|1|1|96.12|178.00|||6|
6964|ML|35|569.568.243||OAK|OAK|||||||14|1|1|96.12|178.00|||6|
6965|ML|35|569.568.244||JOP|JOP|||||||14|1|1|96.12|178.00|||6|
6966|ML|35|569.568.476||TBR|BCO|B||||||14|1|1|139.32|258.00|||6|
6967|ML|35|569.568.477||TBR|BCO|M||||||14|1|1|139.32|258.00|||6|
6968|ML|35|569.568.478||TBR|CCL|B||||||14|1|1|139.32|258.00|||6|
6969|ML|35|569.568.479||TBR|CCL|M||||||14|1|1|139.32|258.00|||6|
6970|ML|35|569.568.480||TBR|CME|B||||||14|1|1|139.32|258.00|||6|
6971|ML|35|569.568.481||TBR|CME|M||||||14|1|1|139.32|258.00|||6|
6972|ML|35|569.568.482||TBR|ANT|B||||||14|1|1|139.32|258.00|||6|
6973|ML|35|569.568.483||TBR|ANT|M||||||14|1|1|139.32|258.00|||6|
6974|ML|35|569.568.484||TBR|PTO|B||||||14|1|1|139.32|258.00|||6|
6975|ML|35|569.568.485||TBR|PTO|M||||||14|1|1|139.32|258.00|||6|
6976|ML|35|569.568.486||TBR|CRE|B||||||14|1|1|139.32|258.00|||6|
6977|ML|35|569.568.487||TBR|CRE|M||||||14|1|1|139.32|258.00|||6|
6978|ML|35|569.568.488||TBR|CAM|B||||||14|1|1|139.32|258.00|||6|
6979|ML|35|569.568.489||TBR|CAM|M||||||14|1|1|139.32|258.00|||6|
6980|ML|35|569.568.490||TBR|OUR|B||||||14|1|1|139.32|258.00|||6|
6981|ML|35|569.568.491||TBR|OUR|M||||||14|1|1|139.32|258.00|||6|
6982|ML|35|569.568.492||TBR|COB|B||||||14|1|1|139.32|258.00|||6|
6983|ML|35|569.568.493||TBR|COB|M||||||14|1|1|139.32|258.00|||6|
6984|ML|35|569.568.494||TBR|CHO|B||||||14|1|1|139.32|258.00|||6|
6985|ML|35|569.568.495||TBR|CHO|M||||||14|1|1|139.32|258.00|||6|
6986|ML|35|569.568.496||TBR|VAG|B||||||14|1|1|139.32|258.00|||6|
6987|ML|35|569.568.497||TBR|VAG|M||||||14|1|1|139.32|258.00|||6|
6988|ML|35|569.568.498||TBR|AZE|B||||||14|1|1|139.32|258.00|||6|
6989|ML|35|569.568.499||TBR|AZE|M||||||14|1|1|139.32|258.00|||6|
6990|ML|35|569.568.500||TBR|AMA|B||||||14|1|1|139.32|258.00|||6|
6991|ML|35|569.568.501||TBR|AMA|M||||||14|1|1|139.32|258.00|||6|
6992|ML|35|569.568.502||TBR|AES|B||||||14|1|1|139.32|258.00|||6|
6993|ML|35|569.568.503||TBR|AES|M||||||14|1|1|139.32|258.00|||6|
6994|ML|35|569.568.504||TBR|PRA|B||||||14|1|1|139.32|258.00|||6|
6995|ML|35|569.568.505||TBR|PRA|M||||||14|1|1|139.32|258.00|||6|
6996|ML|35|569.568.506||TBR|ROS|B||||||14|1|1|139.32|258.00|||6|
6997|ML|35|569.568.507||TBR|ROS|M||||||14|1|1|139.32|258.00|||6|
6998|ML|35|569.568.508||TBR|VER|B||||||14|1|1|139.32|258.00|||6|
6999|ML|35|569.568.509||TBR|VER|M||||||14|1|1|139.32|258.00|||6|
7000|ML|35|569.568.510||TBR|AZB|||||||14|1|1|139.32|258.00|||6|
7001|ML|35|569.568.511||TBR|DEN|||||||14|1|1|139.32|258.00|||6|
7002|ML|35|569.568.512||TBR|BLK|||||||14|1|1|139.32|258.00|||6|
7003|ML|35|569.568.513||TBR|ART|||||||14|1|1|139.32|258.00|||6|
7004|ML|35|569.568.514||TBR|LIN|||||||14|1|1|139.32|258.00|||6|
7005|ML|35|569.568.515||TBR|HAL|||||||14|1|1|139.32|258.00|||6|
7006|ML|35|569.568.516||BCO|BCO|B||||||14|1|1|160.92|298.00|||6|
7007|ML|35|569.568.517||BCO|BCO|M||||||14|1|1|160.92|298.00|||6|
7008|ML|35|569.568.518||CCL|CCL|B||||||14|1|1|160.92|298.00|||6|
7009|ML|35|569.568.519||CCL|CCL|M||||||14|1|1|160.92|298.00|||6|
7010|ML|35|569.568.520||CME|CME|B||||||14|1|1|160.92|298.00|||6|
7011|ML|35|569.568.521||CME|CME|M||||||14|1|1|160.92|298.00|||6|
7012|ML|35|569.568.522||ANT|ANT|B||||||14|1|1|160.92|298.00|||6|
7013|ML|35|569.568.523||ANT|ANT|M||||||14|1|1|160.92|298.00|||6|
7014|ML|35|569.568.524||PTO|PTO|B||||||14|1|1|160.92|298.00|||6|
7015|ML|35|569.568.525||PTO|PTO|M||||||14|1|1|160.92|298.00|||6|
7016|ML|35|569.568.526||CRE|CRE|B||||||14|1|1|160.92|298.00|||6|
7017|ML|35|569.568.527||CRE|CRE|M||||||14|1|1|160.92|298.00|||6|
7018|ML|35|569.568.528||CAM|CAM|B||||||14|1|1|160.92|298.00|||6|
7019|ML|35|569.568.529||CAM|CAM|M||||||14|1|1|160.92|298.00|||6|
7020|ML|35|569.568.530||OUR|OUR|B||||||14|1|1|160.92|298.00|||6|
7021|ML|35|569.568.531||OUR|OUR|M||||||14|1|1|160.92|298.00|||6|
7022|ML|35|569.568.532||COB|COB|B||||||14|1|1|160.92|298.00|||6|
7023|ML|35|569.568.533||COB|COB|M||||||14|1|1|160.92|298.00|||6|
7024|ML|35|569.568.534||CHO|CHO|B||||||14|1|1|160.92|298.00|||6|
7025|ML|35|569.568.535||CHO|CHO|M||||||14|1|1|160.92|298.00|||6|
7026|ML|35|569.568.536||VAG|VAG|B||||||14|1|1|160.92|298.00|||6|
7027|ML|35|569.568.537||VAG|VAG|M||||||14|1|1|160.92|298.00|||6|
7028|ML|35|569.568.538||AZE|AZE|B||||||14|1|1|160.92|298.00|||6|
7029|ML|35|569.568.539||AZE|AZE|M||||||14|1|1|160.92|298.00|||6|
7030|ML|35|569.568.540||AMA|AMA|B||||||14|1|1|160.92|298.00|||6|
7031|ML|35|569.568.541||AMA|AMA|M||||||14|1|1|160.92|298.00|||6|
7032|ML|35|569.568.542||AES|AES|B||||||14|1|1|160.92|298.00|||6|
7033|ML|35|569.568.543||AES|AES|M||||||14|1|1|160.92|298.00|||6|
7034|ML|35|569.568.544||PRA|PRA|B||||||14|1|1|160.92|298.00|||6|
7035|ML|35|569.568.545||PRA|PRA|M||||||14|1|1|160.92|298.00|||6|
7036|ML|35|569.568.546||ROS|ROS|B||||||14|1|1|160.92|298.00|||6|
7037|ML|35|569.568.547||ROS|ROS|M||||||14|1|1|160.92|298.00|||6|
7038|ML|35|569.568.548||VER|VER|B||||||14|1|1|160.92|298.00|||6|
7039|ML|35|569.568.549||VER|VER|M||||||14|1|1|160.92|298.00|||6|
7040|ML|35|569.568.550||AZB|AZB|||||||14|1|1|160.92|298.00|||6|
7041|ML|35|569.568.551||DEN|DEN|||||||14|1|1|160.92|298.00|||6|
7042|ML|35|569.568.552||BLK|BLK|||||||14|1|1|160.92|298.00|||6|
7043|ML|35|569.568.553||ART|ART|||||||14|1|1|160.92|298.00|||6|
7044|ML|35|569.568.554||LIN|LIN|||||||14|1|1|160.92|298.00|||6|
7045|ML|35|569.568.555||HAL|HAL|||||||14|1|1|160.92|298.00|||6|
7046|ML|36|570.571.394||TBR|TBR|||||||19|1|1|102.60|190.00|||6|
7047|ML|36|570.571.198||TEA|TEA|||||||19|1|1|102.60|190.00|||6|
7048|ML|36|570.571.199||OAK|OAK|||||||19|1|1|102.60|190.00|||6|
7049|ML|36|570.571.200||JOP|JOP|||||||19|1|1|102.60|190.00|||6|
7050|ML|36|570.571.395||TBR|BCO|B||||||19|1|1|145.80|270.00|||6|
7051|ML|36|570.571.396||TBR|BCO|M||||||19|1|1|145.80|270.00|||6|
7052|ML|36|570.571.397||TBR|CCL|B||||||19|1|1|145.80|270.00|||6|
7053|ML|36|570.571.398||TBR|CCL|M||||||19|1|1|145.80|270.00|||6|
7054|ML|36|570.571.399||TBR|CME|B||||||19|1|1|145.80|270.00|||6|
7055|ML|36|570.571.400||TBR|CME|M||||||19|1|1|145.80|270.00|||6|
7056|ML|36|570.571.401||TBR|ANT|B||||||19|1|1|145.80|270.00|||6|
7057|ML|36|570.571.402||TBR|ANT|M||||||19|1|1|145.80|270.00|||6|
7058|ML|36|570.571.403||TBR|PTO|B||||||19|1|1|145.80|270.00|||6|
7059|ML|36|570.571.404||TBR|PTO|M||||||19|1|1|145.80|270.00|||6|
7060|ML|36|570.571.405||TBR|CRE|B||||||19|1|1|145.80|270.00|||6|
7061|ML|36|570.571.406||TBR|CRE|M||||||19|1|1|145.80|270.00|||6|
7062|ML|36|570.571.407||TBR|CAM|B||||||19|1|1|145.80|270.00|||6|
7063|ML|36|570.571.408||TBR|CAM|M||||||19|1|1|145.80|270.00|||6|
7064|ML|36|570.571.409||TBR|OUR|B||||||19|1|1|145.80|270.00|||6|
7065|ML|36|570.571.410||TBR|OUR|M||||||19|1|1|145.80|270.00|||6|
7066|ML|36|570.571.411||TBR|COB|B||||||19|1|1|145.80|270.00|||6|
7067|ML|36|570.571.412||TBR|COB|M||||||19|1|1|145.80|270.00|||6|
7068|ML|36|570.571.413||TBR|CHO|B||||||19|1|1|145.80|270.00|||6|
7069|ML|36|570.571.414||TBR|CHO|M||||||19|1|1|145.80|270.00|||6|
7070|ML|36|570.571.415||TBR|VAG|B||||||19|1|1|145.80|270.00|||6|
7071|ML|36|570.571.416||TBR|VAG|M||||||19|1|1|145.80|270.00|||6|
7072|ML|36|570.571.417||TBR|AZE|B||||||19|1|1|145.80|270.00|||6|
7073|ML|36|570.571.418||TBR|AZE|M||||||19|1|1|145.80|270.00|||6|
7074|ML|36|570.571.419||TBR|AMA|B||||||19|1|1|145.80|270.00|||6|
7075|ML|36|570.571.420||TBR|AMA|M||||||19|1|1|145.80|270.00|||6|
7076|ML|36|570.571.421||TBR|AES|B||||||19|1|1|145.80|270.00|||6|
7077|ML|36|570.571.422||TBR|AES|M||||||19|1|1|145.80|270.00|||6|
7078|ML|36|570.571.423||TBR|PRA|B||||||19|1|1|145.80|270.00|||6|
7079|ML|36|570.571.424||TBR|PRA|M||||||19|1|1|145.80|270.00|||6|
7080|ML|36|570.571.425||TBR|ROS|B||||||19|1|1|145.80|270.00|||6|
7081|ML|36|570.571.426||TBR|ROS|M||||||19|1|1|145.80|270.00|||6|
7082|ML|36|570.571.427||TBR|VER|B||||||19|1|1|145.80|270.00|||6|
7083|ML|36|570.571.428||TBR|VER|M||||||19|1|1|145.80|270.00|||6|
7084|ML|36|570.571.429||TBR|AZB|||||||19|1|1|145.80|270.00|||6|
7085|ML|36|570.571.430||TBR|DEN|||||||19|1|1|145.80|270.00|||6|
7086|ML|36|570.571.431||TBR|BLK|||||||19|1|1|145.80|270.00|||6|
7087|ML|36|570.571.432||TBR|ART|||||||19|1|1|145.80|270.00|||6|
7088|ML|36|570.571.433||TBR|LIN|||||||19|1|1|145.80|270.00|||6|
7089|ML|36|570.571.434||TBR|HAL|||||||19|1|1|145.80|270.00|||6|
7090|ML|36|570.571.435||BCO|BCO|B||||||19|1|1|167.40|310.00|||6|
7091|ML|36|570.571.436||BCO|BCO|M||||||19|1|1|167.40|310.00|||6|
7092|ML|36|570.571.437||CCL|CCL|B||||||19|1|1|167.40|310.00|||6|
7093|ML|36|570.571.438||CCL|CCL|M||||||19|1|1|167.40|310.00|||6|
7094|ML|36|570.571.439||CME|CME|B||||||19|1|1|167.40|310.00|||6|
7095|ML|36|570.571.440||CME|CME|M||||||19|1|1|167.40|310.00|||6|
7096|ML|36|570.571.441||ANT|ANT|B||||||19|1|1|167.40|310.00|||6|
7097|ML|36|570.571.442||ANT|ANT|M||||||19|1|1|167.40|310.00|||6|
7098|ML|36|570.571.443||PTO|PTO|B||||||19|1|1|167.40|310.00|||6|
7099|ML|36|570.571.444||PTO|PTO|M||||||19|1|1|167.40|310.00|||6|
7100|ML|36|570.571.445||CRE|CRE|B||||||19|1|1|167.40|310.00|||6|
7101|ML|36|570.571.446||CRE|CRE|M||||||19|1|1|167.40|310.00|||6|
7102|ML|36|570.571.447||CAM|CAM|B||||||19|1|1|167.40|310.00|||6|
7103|ML|36|570.571.448||CAM|CAM|M||||||19|1|1|167.40|310.00|||6|
7104|ML|36|570.571.449||OUR|OUR|B||||||19|1|1|167.40|310.00|||6|
7105|ML|36|570.571.450||OUR|OUR|M||||||19|1|1|167.40|310.00|||6|
7106|ML|36|570.571.451||COB|COB|B||||||19|1|1|167.40|310.00|||6|
7107|ML|36|570.571.452||COB|COB|M||||||19|1|1|167.40|310.00|||6|
7108|ML|36|570.571.453||CHO|CHO|B||||||19|1|1|167.40|310.00|||6|
7109|ML|36|570.571.454||CHO|CHO|M||||||19|1|1|167.40|310.00|||6|
7110|ML|36|570.571.455||VAG|VAG|B||||||19|1|1|167.40|310.00|||6|
7111|ML|36|570.571.456||VAG|VAG|M||||||19|1|1|167.40|310.00|||6|
7112|ML|36|570.571.457||AZE|AZE|B||||||19|1|1|167.40|310.00|||6|
7113|ML|36|570.571.458||AZE|AZE|M||||||19|1|1|167.40|310.00|||6|
7114|ML|36|570.571.459||AMA|AMA|B||||||19|1|1|167.40|310.00|||6|
7115|ML|36|570.571.460||AMA|AMA|M||||||19|1|1|167.40|310.00|||6|
7116|ML|36|570.571.461||AES|AES|B||||||19|1|1|167.40|310.00|||6|
7117|ML|36|570.571.462||AES|AES|M||||||19|1|1|167.40|310.00|||6|
7118|ML|36|570.571.463||PRA|PRA|B||||||19|1|1|167.40|310.00|||6|
7119|ML|36|570.571.464||PRA|PRA|M||||||19|1|1|167.40|310.00|||6|
7120|ML|36|570.571.465||ROS|ROS|B||||||19|1|1|167.40|310.00|||6|
7121|ML|36|570.571.466||ROS|ROS|M||||||19|1|1|167.40|310.00|||6|
7122|ML|36|570.571.467||VER|VER|B||||||19|1|1|167.40|310.00|||6|
7123|ML|36|570.571.468||VER|VER|M||||||19|1|1|167.40|310.00|||6|
7124|ML|36|570.571.469||AZB|AZB|||||||19|1|1|167.40|310.00|||6|
7125|ML|36|570.571.470||DEN|DEN|||||||19|1|1|167.40|310.00|||6|
7126|ML|36|570.571.471||BLK|BLK|||||||19|1|1|167.40|310.00|||6|
7127|ML|36|570.571.472||ART|ART|||||||19|1|1|167.40|310.00|||6|
7128|ML|36|570.571.473||LIN|LIN|||||||19|1|1|167.40|310.00|||6|
7129|ML|36|570.571.474||HAL|HAL|||||||19|1|1|167.40|310.00|||6|
7130|ML|37|570.571.475||TBR|TBR|||||||19|1|1|102.60|190.00|||6|
7131|ML|37|570.571.242||TEA|TEA|||||||19|1|1|102.60|190.00|||6|
7132|ML|37|570.571.243||OAK|OAK|||||||19|1|1|102.60|190.00|||6|
7133|ML|37|570.571.244||JOP|JOP|||||||19|1|1|102.60|190.00|||6|
7134|ML|37|570.571.476||TBR|BCO|B||||||19|1|1|145.80|270.00|||6|
7135|ML|37|570.571.477||TBR|BCO|M||||||19|1|1|145.80|270.00|||6|
7136|ML|37|570.571.478||TBR|CCL|B||||||19|1|1|145.80|270.00|||6|
7137|ML|37|570.571.479||TBR|CCL|M||||||19|1|1|145.80|270.00|||6|
7138|ML|37|570.571.480||TBR|CME|B||||||19|1|1|145.80|270.00|||6|
7139|ML|37|570.571.481||TBR|CME|M||||||19|1|1|145.80|270.00|||6|
7140|ML|37|570.571.482||TBR|ANT|B||||||19|1|1|145.80|270.00|||6|
7141|ML|37|570.571.483||TBR|ANT|M||||||19|1|1|145.80|270.00|||6|
7142|ML|37|570.571.484||TBR|PTO|B||||||19|1|1|145.80|270.00|||6|
7143|ML|37|570.571.485||TBR|PTO|M||||||19|1|1|145.80|270.00|||6|
7144|ML|37|570.571.486||TBR|CRE|B||||||19|1|1|145.80|270.00|||6|
7145|ML|37|570.571.487||TBR|CRE|M||||||19|1|1|145.80|270.00|||6|
7146|ML|37|570.571.488||TBR|CAM|B||||||19|1|1|145.80|270.00|||6|
7147|ML|37|570.571.489||TBR|CAM|M||||||19|1|1|145.80|270.00|||6|
7148|ML|37|570.571.490||TBR|OUR|B||||||19|1|1|145.80|270.00|||6|
7149|ML|37|570.571.491||TBR|OUR|M||||||19|1|1|145.80|270.00|||6|
7150|ML|37|570.571.492||TBR|COB|B||||||19|1|1|145.80|270.00|||6|
7151|ML|37|570.571.493||TBR|COB|M||||||19|1|1|145.80|270.00|||6|
7152|ML|37|570.571.494||TBR|CHO|B||||||19|1|1|145.80|270.00|||6|
7153|ML|37|570.571.495||TBR|CHO|M||||||19|1|1|145.80|270.00|||6|
7154|ML|37|570.571.496||TBR|VAG|B||||||19|1|1|145.80|270.00|||6|
7155|ML|37|570.571.497||TBR|VAG|M||||||19|1|1|145.80|270.00|||6|
7156|ML|37|570.571.498||TBR|AZE|B||||||19|1|1|145.80|270.00|||6|
7157|ML|37|570.571.499||TBR|AZE|M||||||19|1|1|145.80|270.00|||6|
7158|ML|37|570.571.500||TBR|AMA|B||||||19|1|1|145.80|270.00|||6|
7159|ML|37|570.571.501||TBR|AMA|M||||||19|1|1|145.80|270.00|||6|
7160|ML|37|570.571.502||TBR|AES|B||||||19|1|1|145.80|270.00|||6|
7161|ML|37|570.571.503||TBR|AES|M||||||19|1|1|145.80|270.00|||6|
7162|ML|37|570.571.504||TBR|PRA|B||||||19|1|1|145.80|270.00|||6|
7163|ML|37|570.571.505||TBR|PRA|M||||||19|1|1|145.80|270.00|||6|
7164|ML|37|570.571.506||TBR|ROS|B||||||19|1|1|145.80|270.00|||6|
7165|ML|37|570.571.507||TBR|ROS|M||||||19|1|1|145.80|270.00|||6|
7166|ML|37|570.571.508||TBR|VER|B||||||19|1|1|145.80|270.00|||6|
7167|ML|37|570.571.509||TBR|VER|M||||||19|1|1|145.80|270.00|||6|
7168|ML|37|570.571.510||TBR|AZB|||||||19|1|1|145.80|270.00|||6|
7169|ML|37|570.571.511||TBR|DEN|||||||19|1|1|145.80|270.00|||6|
7170|ML|37|570.571.512||TBR|BLK|||||||19|1|1|145.80|270.00|||6|
7171|ML|37|570.571.513||TBR|ART|||||||19|1|1|145.80|270.00|||6|
7172|ML|37|570.571.514||TBR|LIN|||||||19|1|1|145.80|270.00|||6|
7173|ML|37|570.571.515||TBR|HAL|||||||19|1|1|145.80|270.00|||6|
7174|ML|37|570.571.516||BCO|BCO|B||||||19|1|1|167.40|310.00|||6|
7175|ML|37|570.571.517||BCO|BCO|M||||||19|1|1|167.40|310.00|||6|
7176|ML|37|570.571.518||CCL|CCL|B||||||19|1|1|167.40|310.00|||6|
7177|ML|37|570.571.519||CCL|CCL|M||||||19|1|1|167.40|310.00|||6|
7178|ML|37|570.571.520||CME|CME|B||||||19|1|1|167.40|310.00|||6|
7179|ML|37|570.571.521||CME|CME|M||||||19|1|1|167.40|310.00|||6|
7180|ML|37|570.571.522||ANT|ANT|B||||||19|1|1|167.40|310.00|||6|
7181|ML|37|570.571.523||ANT|ANT|M||||||19|1|1|167.40|310.00|||6|
7182|ML|37|570.571.524||PTO|PTO|B||||||19|1|1|167.40|310.00|||6|
7183|ML|37|570.571.525||PTO|PTO|M||||||19|1|1|167.40|310.00|||6|
7184|ML|37|570.571.526||CRE|CRE|B||||||19|1|1|167.40|310.00|||6|
7185|ML|37|570.571.527||CRE|CRE|M||||||19|1|1|167.40|310.00|||6|
7186|ML|37|570.571.528||CAM|CAM|B||||||19|1|1|167.40|310.00|||6|
7187|ML|37|570.571.529||CAM|CAM|M||||||19|1|1|167.40|310.00|||6|
7188|ML|37|570.571.530||OUR|OUR|B||||||19|1|1|167.40|310.00|||6|
7189|ML|37|570.571.531||OUR|OUR|M||||||19|1|1|167.40|310.00|||6|
7190|ML|37|570.571.532||COB|COB|B||||||19|1|1|167.40|310.00|||6|
7191|ML|37|570.571.533||COB|COB|M||||||19|1|1|167.40|310.00|||6|
7192|ML|37|570.571.534||CHO|CHO|B||||||19|1|1|167.40|310.00|||6|
7193|ML|37|570.571.535||CHO|CHO|M||||||19|1|1|167.40|310.00|||6|
7194|ML|37|570.571.536||VAG|VAG|B||||||19|1|1|167.40|310.00|||6|
7195|ML|37|570.571.537||VAG|VAG|M||||||19|1|1|167.40|310.00|||6|
7196|ML|37|570.571.538||AZE|AZE|B||||||19|1|1|167.40|310.00|||6|
7197|ML|37|570.571.539||AZE|AZE|M||||||19|1|1|167.40|310.00|||6|
7198|ML|37|570.571.540||AMA|AMA|B||||||19|1|1|167.40|310.00|||6|
7199|ML|37|570.571.541||AMA|AMA|M||||||19|1|1|167.40|310.00|||6|
7200|ML|37|570.571.542||AES|AES|B||||||19|1|1|167.40|310.00|||6|
7201|ML|37|570.571.543||AES|AES|M||||||19|1|1|167.40|310.00|||6|
7202|ML|37|570.571.544||PRA|PRA|B||||||19|1|1|167.40|310.00|||6|
7203|ML|37|570.571.545||PRA|PRA|M||||||19|1|1|167.40|310.00|||6|
7204|ML|37|570.571.546||ROS|ROS|B||||||19|1|1|167.40|310.00|||6|
7205|ML|37|570.571.547||ROS|ROS|M||||||19|1|1|167.40|310.00|||6|
7206|ML|37|570.571.548||VER|VER|B||||||19|1|1|167.40|310.00|||6|
7207|ML|37|570.571.549||VER|VER|M||||||19|1|1|167.40|310.00|||6|
7208|ML|37|570.571.550||AZB|AZB|||||||19|1|1|167.40|310.00|||6|
7209|ML|37|570.571.551||DEN|DEN|||||||19|1|1|167.40|310.00|||6|
7210|ML|37|570.571.552||BLK|BLK|||||||19|1|1|167.40|310.00|||6|
7211|ML|37|570.571.553||ART|ART|||||||19|1|1|167.40|310.00|||6|
7212|ML|37|570.571.554||LIN|LIN|||||||19|1|1|167.40|310.00|||6|
7213|ML|37|570.571.555||HAL|HAL|||||||19|1|1|167.40|310.00|||6|
7214|ML|36|572.571.394||TBR|TBR|||||||15|1|1|108.00|200.00|||6|
7215|ML|36|572.571.198||TEA|TEA|||||||15|1|1|108.00|200.00|||6|
7216|ML|36|572.571.199||OAK|OAK|||||||15|1|1|108.00|200.00|||6|
7217|ML|36|572.571.200||JOP|JOP|||||||15|1|1|108.00|200.00|||6|
7218|ML|36|572.571.395||TBR|BCO|B||||||15|1|1|151.20|280.00|||6|
7219|ML|36|572.571.396||TBR|BCO|M||||||15|1|1|151.20|280.00|||6|
7220|ML|36|572.571.397||TBR|CCL|B||||||15|1|1|151.20|280.00|||6|
7221|ML|36|572.571.398||TBR|CCL|M||||||15|1|1|151.20|280.00|||6|
7222|ML|36|572.571.399||TBR|CME|B||||||15|1|1|151.20|280.00|||6|
7223|ML|36|572.571.400||TBR|CME|M||||||15|1|1|151.20|280.00|||6|
7224|ML|36|572.571.401||TBR|ANT|B||||||15|1|1|151.20|280.00|||6|
7225|ML|36|572.571.402||TBR|ANT|M||||||15|1|1|151.20|280.00|||6|
7226|ML|36|572.571.403||TBR|PTO|B||||||15|1|1|151.20|280.00|||6|
7227|ML|36|572.571.404||TBR|PTO|M||||||15|1|1|151.20|280.00|||6|
7228|ML|36|572.571.405||TBR|CRE|B||||||15|1|1|151.20|280.00|||6|
7229|ML|36|572.571.406||TBR|CRE|M||||||15|1|1|151.20|280.00|||6|
7230|ML|36|572.571.407||TBR|CAM|B||||||15|1|1|151.20|280.00|||6|
7231|ML|36|572.571.408||TBR|CAM|M||||||15|1|1|151.20|280.00|||6|
7232|ML|36|572.571.409||TBR|OUR|B||||||15|1|1|151.20|280.00|||6|
7233|ML|36|572.571.410||TBR|OUR|M||||||15|1|1|151.20|280.00|||6|
7234|ML|36|572.571.411||TBR|COB|B||||||15|1|1|151.20|280.00|||6|
7235|ML|36|572.571.412||TBR|COB|M||||||15|1|1|151.20|280.00|||6|
7236|ML|36|572.571.413||TBR|CHO|B||||||15|1|1|151.20|280.00|||6|
7237|ML|36|572.571.414||TBR|CHO|M||||||15|1|1|151.20|280.00|||6|
7238|ML|36|572.571.415||TBR|VAG|B||||||15|1|1|151.20|280.00|||6|
7239|ML|36|572.571.416||TBR|VAG|M||||||15|1|1|151.20|280.00|||6|
7240|ML|36|572.571.417||TBR|AZE|B||||||15|1|1|151.20|280.00|||6|
7241|ML|36|572.571.418||TBR|AZE|M||||||15|1|1|151.20|280.00|||6|
7242|ML|36|572.571.419||TBR|AMA|B||||||15|1|1|151.20|280.00|||6|
7243|ML|36|572.571.420||TBR|AMA|M||||||15|1|1|151.20|280.00|||6|
7244|ML|36|572.571.421||TBR|AES|B||||||15|1|1|151.20|280.00|||6|
7245|ML|36|572.571.422||TBR|AES|M||||||15|1|1|151.20|280.00|||6|
7246|ML|36|572.571.423||TBR|PRA|B||||||15|1|1|151.20|280.00|||6|
7247|ML|36|572.571.424||TBR|PRA|M||||||15|1|1|151.20|280.00|||6|
7248|ML|36|572.571.425||TBR|ROS|B||||||15|1|1|151.20|280.00|||6|
7249|ML|36|572.571.426||TBR|ROS|M||||||15|1|1|151.20|280.00|||6|
7250|ML|36|572.571.427||TBR|VER|B||||||15|1|1|151.20|280.00|||6|
7251|ML|36|572.571.428||TBR|VER|M||||||15|1|1|151.20|280.00|||6|
7252|ML|36|572.571.429||TBR|AZB|||||||15|1|1|151.20|280.00|||6|
7253|ML|36|572.571.430||TBR|DEN|||||||15|1|1|151.20|280.00|||6|
7254|ML|36|572.571.431||TBR|BLK|||||||15|1|1|151.20|280.00|||6|
7255|ML|36|572.571.432||TBR|ART|||||||15|1|1|151.20|280.00|||6|
7256|ML|36|572.571.433||TBR|LIN|||||||15|1|1|151.20|280.00|||6|
7257|ML|36|572.571.434||TBR|HAL|||||||15|1|1|151.20|280.00|||6|
7258|ML|36|572.571.435||BCO|BCO|B||||||15|1|1|172.80|320.00|||6|
7259|ML|36|572.571.436||BCO|BCO|M||||||15|1|1|172.80|320.00|||6|
7260|ML|36|572.571.437||CCL|CCL|B||||||15|1|1|172.80|320.00|||6|
7261|ML|36|572.571.438||CCL|CCL|M||||||15|1|1|172.80|320.00|||6|
7262|ML|36|572.571.439||CME|CME|B||||||15|1|1|172.80|320.00|||6|
7263|ML|36|572.571.440||CME|CME|M||||||15|1|1|172.80|320.00|||6|
7264|ML|36|572.571.441||ANT|ANT|B||||||15|1|1|172.80|320.00|||6|
7265|ML|36|572.571.442||ANT|ANT|M||||||15|1|1|172.80|320.00|||6|
7266|ML|36|572.571.443||PTO|PTO|B||||||15|1|1|172.80|320.00|||6|
7267|ML|36|572.571.444||PTO|PTO|M||||||15|1|1|172.80|320.00|||6|
7268|ML|36|572.571.445||CRE|CRE|B||||||15|1|1|172.80|320.00|||6|
7269|ML|36|572.571.446||CRE|CRE|M||||||15|1|1|172.80|320.00|||6|
7270|ML|36|572.571.447||CAM|CAM|B||||||15|1|1|172.80|320.00|||6|
7271|ML|36|572.571.448||CAM|CAM|M||||||15|1|1|172.80|320.00|||6|
7272|ML|36|572.571.449||OUR|OUR|B||||||15|1|1|172.80|320.00|||6|
7273|ML|36|572.571.450||OUR|OUR|M||||||15|1|1|172.80|320.00|||6|
7274|ML|36|572.571.451||COB|COB|B||||||15|1|1|172.80|320.00|||6|
7275|ML|36|572.571.452||COB|COB|M||||||15|1|1|172.80|320.00|||6|
7276|ML|36|572.571.453||CHO|CHO|B||||||15|1|1|172.80|320.00|||6|
7277|ML|36|572.571.454||CHO|CHO|M||||||15|1|1|172.80|320.00|||6|
7278|ML|36|572.571.455||VAG|VAG|B||||||15|1|1|172.80|320.00|||6|
7279|ML|36|572.571.456||VAG|VAG|M||||||15|1|1|172.80|320.00|||6|
7280|ML|36|572.571.457||AZE|AZE|B||||||15|1|1|172.80|320.00|||6|
7281|ML|36|572.571.458||AZE|AZE|M||||||15|1|1|172.80|320.00|||6|
7282|ML|36|572.571.459||AMA|AMA|B||||||15|1|1|172.80|320.00|||6|
7283|ML|36|572.571.460||AMA|AMA|M||||||15|1|1|172.80|320.00|||6|
7284|ML|36|572.571.461||AES|AES|B||||||15|1|1|172.80|320.00|||6|
7285|ML|36|572.571.462||AES|AES|M||||||15|1|1|172.80|320.00|||6|
7286|ML|36|572.571.463||PRA|PRA|B||||||15|1|1|172.80|320.00|||6|
7287|ML|36|572.571.464||PRA|PRA|M||||||15|1|1|172.80|320.00|||6|
7288|ML|36|572.571.465||ROS|ROS|B||||||15|1|1|172.80|320.00|||6|
7289|ML|36|572.571.466||ROS|ROS|M||||||15|1|1|172.80|320.00|||6|
7290|ML|36|572.571.467||VER|VER|B||||||15|1|1|172.80|320.00|||6|
7291|ML|36|572.571.468||VER|VER|M||||||15|1|1|172.80|320.00|||6|
7292|ML|36|572.571.469||AZB|AZB|||||||15|1|1|172.80|320.00|||6|
7293|ML|36|572.571.470||DEN|DEN|||||||15|1|1|172.80|320.00|||6|
7294|ML|36|572.571.471||BLK|BLK|||||||15|1|1|172.80|320.00|||6|
7295|ML|36|572.571.472||ART|ART|||||||15|1|1|172.80|320.00|||6|
7296|ML|36|572.571.473||LIN|LIN|||||||15|1|1|172.80|320.00|||6|
7297|ML|36|572.571.474||HAL|HAL|||||||15|1|1|172.80|320.00|||6|
7298|ML|37|572.571.475||TBR|TBR|||||||15|1|1|108.00|200.00|||6|
7299|ML|37|572.571.242||TEA|TEA|||||||15|1|1|108.00|200.00|||6|
7300|ML|37|572.571.243||OAK|OAK|||||||15|1|1|108.00|200.00|||6|
7301|ML|37|572.571.244||JOP|JOP|||||||15|1|1|108.00|200.00|||6|
7302|ML|37|572.571.476||TBR|BCO|B||||||15|1|1|151.20|280.00|||6|
7303|ML|37|572.571.477||TBR|BCO|M||||||15|1|1|151.20|280.00|||6|
7304|ML|37|572.571.478||TBR|CCL|B||||||15|1|1|151.20|280.00|||6|
7305|ML|37|572.571.479||TBR|CCL|M||||||15|1|1|151.20|280.00|||6|
7306|ML|37|572.571.480||TBR|CME|B||||||15|1|1|151.20|280.00|||6|
7307|ML|37|572.571.481||TBR|CME|M||||||15|1|1|151.20|280.00|||6|
7308|ML|37|572.571.482||TBR|ANT|B||||||15|1|1|151.20|280.00|||6|
7309|ML|37|572.571.483||TBR|ANT|M||||||15|1|1|151.20|280.00|||6|
7310|ML|37|572.571.484||TBR|PTO|B||||||15|1|1|151.20|280.00|||6|
7311|ML|37|572.571.485||TBR|PTO|M||||||15|1|1|151.20|280.00|||6|
7312|ML|37|572.571.486||TBR|CRE|B||||||15|1|1|151.20|280.00|||6|
7313|ML|37|572.571.487||TBR|CRE|M||||||15|1|1|151.20|280.00|||6|
7314|ML|37|572.571.488||TBR|CAM|B||||||15|1|1|151.20|280.00|||6|
7315|ML|37|572.571.489||TBR|CAM|M||||||15|1|1|151.20|280.00|||6|
7316|ML|37|572.571.490||TBR|OUR|B||||||15|1|1|151.20|280.00|||6|
7317|ML|37|572.571.491||TBR|OUR|M||||||15|1|1|151.20|280.00|||6|
7318|ML|37|572.571.492||TBR|COB|B||||||15|1|1|151.20|280.00|||6|
7319|ML|37|572.571.493||TBR|COB|M||||||15|1|1|151.20|280.00|||6|
7320|ML|37|572.571.494||TBR|CHO|B||||||15|1|1|151.20|280.00|||6|
7321|ML|37|572.571.495||TBR|CHO|M||||||15|1|1|151.20|280.00|||6|
7322|ML|37|572.571.496||TBR|VAG|B||||||15|1|1|151.20|280.00|||6|
7323|ML|37|572.571.497||TBR|VAG|M||||||15|1|1|151.20|280.00|||6|
7324|ML|37|572.571.498||TBR|AZE|B||||||15|1|1|151.20|280.00|||6|
7325|ML|37|572.571.499||TBR|AZE|M||||||15|1|1|151.20|280.00|||6|
7326|ML|37|572.571.500||TBR|AMA|B||||||15|1|1|151.20|280.00|||6|
7327|ML|37|572.571.501||TBR|AMA|M||||||15|1|1|151.20|280.00|||6|
7328|ML|37|572.571.502||TBR|AES|B||||||15|1|1|151.20|280.00|||6|
7329|ML|37|572.571.503||TBR|AES|M||||||15|1|1|151.20|280.00|||6|
7330|ML|37|572.571.504||TBR|PRA|B||||||15|1|1|151.20|280.00|||6|
7331|ML|37|572.571.505||TBR|PRA|M||||||15|1|1|151.20|280.00|||6|
7332|ML|37|572.571.506||TBR|ROS|B||||||15|1|1|151.20|280.00|||6|
7333|ML|37|572.571.507||TBR|ROS|M||||||15|1|1|151.20|280.00|||6|
7334|ML|37|572.571.508||TBR|VER|B||||||15|1|1|151.20|280.00|||6|
7335|ML|37|572.571.509||TBR|VER|M||||||15|1|1|151.20|280.00|||6|
7336|ML|37|572.571.510||TBR|AZB|||||||15|1|1|151.20|280.00|||6|
7337|ML|37|572.571.511||TBR|DEN|||||||15|1|1|151.20|280.00|||6|
7338|ML|37|572.571.512||TBR|BLK|||||||15|1|1|151.20|280.00|||6|
7339|ML|37|572.571.513||TBR|ART|||||||15|1|1|151.20|280.00|||6|
7340|ML|37|572.571.514||TBR|LIN|||||||15|1|1|151.20|280.00|||6|
7341|ML|37|572.571.515||TBR|HAL|||||||15|1|1|151.20|280.00|||6|
7342|ML|37|572.571.516||BCO|BCO|B||||||15|1|1|172.80|320.00|||6|
7343|ML|37|572.571.517||BCO|BCO|M||||||15|1|1|172.80|320.00|||6|
7344|ML|37|572.571.518||CCL|CCL|B||||||15|1|1|172.80|320.00|||6|
7345|ML|37|572.571.519||CCL|CCL|M||||||15|1|1|172.80|320.00|||6|
7346|ML|37|572.571.520||CME|CME|B||||||15|1|1|172.80|320.00|||6|
7347|ML|37|572.571.521||CME|CME|M||||||15|1|1|172.80|320.00|||6|
7348|ML|37|572.571.522||ANT|ANT|B||||||15|1|1|172.80|320.00|||6|
7349|ML|37|572.571.523||ANT|ANT|M||||||15|1|1|172.80|320.00|||6|
7350|ML|37|572.571.524||PTO|PTO|B||||||15|1|1|172.80|320.00|||6|
7351|ML|37|572.571.525||PTO|PTO|M||||||15|1|1|172.80|320.00|||6|
7352|ML|37|572.571.526||CRE|CRE|B||||||15|1|1|172.80|320.00|||6|
7353|ML|37|572.571.527||CRE|CRE|M||||||15|1|1|172.80|320.00|||6|
7354|ML|37|572.571.528||CAM|CAM|B||||||15|1|1|172.80|320.00|||6|
7355|ML|37|572.571.529||CAM|CAM|M||||||15|1|1|172.80|320.00|||6|
7356|ML|37|572.571.530||OUR|OUR|B||||||15|1|1|172.80|320.00|||6|
7357|ML|37|572.571.531||OUR|OUR|M||||||15|1|1|172.80|320.00|||6|
7358|ML|37|572.571.532||COB|COB|B||||||15|1|1|172.80|320.00|||6|
7359|ML|37|572.571.533||COB|COB|M||||||15|1|1|172.80|320.00|||6|
7360|ML|37|572.571.534||CHO|CHO|B||||||15|1|1|172.80|320.00|||6|
7361|ML|37|572.571.535||CHO|CHO|M||||||15|1|1|172.80|320.00|||6|
7362|ML|37|572.571.536||VAG|VAG|B||||||15|1|1|172.80|320.00|||6|
7363|ML|37|572.571.537||VAG|VAG|M||||||15|1|1|172.80|320.00|||6|
7364|ML|37|572.571.538||AZE|AZE|B||||||15|1|1|172.80|320.00|||6|
7365|ML|37|572.571.539||AZE|AZE|M||||||15|1|1|172.80|320.00|||6|
7366|ML|37|572.571.540||AMA|AMA|B||||||15|1|1|172.80|320.00|||6|
7367|ML|37|572.571.541||AMA|AMA|M||||||15|1|1|172.80|320.00|||6|
7368|ML|37|572.571.542||AES|AES|B||||||15|1|1|172.80|320.00|||6|
7369|ML|37|572.571.543||AES|AES|M||||||15|1|1|172.80|320.00|||6|
7370|ML|37|572.571.544||PRA|PRA|B||||||15|1|1|172.80|320.00|||6|
7371|ML|37|572.571.545||PRA|PRA|M||||||15|1|1|172.80|320.00|||6|
7372|ML|37|572.571.546||ROS|ROS|B||||||15|1|1|172.80|320.00|||6|
7373|ML|37|572.571.547||ROS|ROS|M||||||15|1|1|172.80|320.00|||6|
7374|ML|37|572.571.548||VER|VER|B||||||15|1|1|172.80|320.00|||6|
7375|ML|37|572.571.549||VER|VER|M||||||15|1|1|172.80|320.00|||6|
7376|ML|37|572.571.550||AZB|AZB|||||||15|1|1|172.80|320.00|||6|
7377|ML|37|572.571.551||DEN|DEN|||||||15|1|1|172.80|320.00|||6|
7378|ML|37|572.571.552||BLK|BLK|||||||15|1|1|172.80|320.00|||6|
7379|ML|37|572.571.553||ART|ART|||||||15|1|1|172.80|320.00|||6|
7380|ML|37|572.571.554||LIN|LIN|||||||15|1|1|172.80|320.00|||6|
7381|ML|37|572.571.555||HAL|HAL|||||||15|1|1|172.80|320.00|||6|
7382|ML|36|573.571.394||TBR|TBR|||||||16|1|1|151.20|280.00|||6|
7383|ML|36|573.571.198||TEA|TEA|||||||16|1|1|151.20|280.00|||6|
7384|ML|36|573.571.199||OAK|OAK|||||||16|1|1|151.20|280.00|||6|
7385|ML|36|573.571.200||JOP|JOP|||||||16|1|1|151.20|280.00|||6|
7386|ML|36|573.571.395||TBR|BCO|B||||||16|1|1|194.40|360.00|||6|
7387|ML|36|573.571.396||TBR|BCO|M||||||16|1|1|194.40|360.00|||6|
7388|ML|36|573.571.397||TBR|CCL|B||||||16|1|1|194.40|360.00|||6|
7389|ML|36|573.571.398||TBR|CCL|M||||||16|1|1|194.40|360.00|||6|
7390|ML|36|573.571.399||TBR|CME|B||||||16|1|1|194.40|360.00|||6|
7391|ML|36|573.571.400||TBR|CME|M||||||16|1|1|194.40|360.00|||6|
7392|ML|36|573.571.401||TBR|ANT|B||||||16|1|1|194.40|360.00|||6|
7393|ML|36|573.571.402||TBR|ANT|M||||||16|1|1|194.40|360.00|||6|
7394|ML|36|573.571.403||TBR|PTO|B||||||16|1|1|194.40|360.00|||6|
7395|ML|36|573.571.404||TBR|PTO|M||||||16|1|1|194.40|360.00|||6|
7396|ML|36|573.571.405||TBR|CRE|B||||||16|1|1|194.40|360.00|||6|
7397|ML|36|573.571.406||TBR|CRE|M||||||16|1|1|194.40|360.00|||6|
7398|ML|36|573.571.407||TBR|CAM|B||||||16|1|1|194.40|360.00|||6|
7399|ML|36|573.571.408||TBR|CAM|M||||||16|1|1|194.40|360.00|||6|
7400|ML|36|573.571.409||TBR|OUR|B||||||16|1|1|194.40|360.00|||6|
7401|ML|36|573.571.410||TBR|OUR|M||||||16|1|1|194.40|360.00|||6|
7402|ML|36|573.571.411||TBR|COB|B||||||16|1|1|194.40|360.00|||6|
7403|ML|36|573.571.412||TBR|COB|M||||||16|1|1|194.40|360.00|||6|
7404|ML|36|573.571.413||TBR|CHO|B||||||16|1|1|194.40|360.00|||6|
7405|ML|36|573.571.414||TBR|CHO|M||||||16|1|1|194.40|360.00|||6|
7406|ML|36|573.571.415||TBR|VAG|B||||||16|1|1|194.40|360.00|||6|
7407|ML|36|573.571.416||TBR|VAG|M||||||16|1|1|194.40|360.00|||6|
7408|ML|36|573.571.417||TBR|AZE|B||||||16|1|1|194.40|360.00|||6|
7409|ML|36|573.571.418||TBR|AZE|M||||||16|1|1|194.40|360.00|||6|
7410|ML|36|573.571.419||TBR|AMA|B||||||16|1|1|194.40|360.00|||6|
7411|ML|36|573.571.420||TBR|AMA|M||||||16|1|1|194.40|360.00|||6|
7412|ML|36|573.571.421||TBR|AES|B||||||16|1|1|194.40|360.00|||6|
7413|ML|36|573.571.422||TBR|AES|M||||||16|1|1|194.40|360.00|||6|
7414|ML|36|573.571.423||TBR|PRA|B||||||16|1|1|194.40|360.00|||6|
7415|ML|36|573.571.424||TBR|PRA|M||||||16|1|1|194.40|360.00|||6|
7416|ML|36|573.571.425||TBR|ROS|B||||||16|1|1|194.40|360.00|||6|
7417|ML|36|573.571.426||TBR|ROS|M||||||16|1|1|194.40|360.00|||6|
7418|ML|36|573.571.427||TBR|VER|B||||||16|1|1|194.40|360.00|||6|
7419|ML|36|573.571.428||TBR|VER|M||||||16|1|1|194.40|360.00|||6|
7420|ML|36|573.571.429||TBR|AZB|||||||16|1|1|194.40|360.00|||6|
7421|ML|36|573.571.430||TBR|DEN|||||||16|1|1|194.40|360.00|||6|
7422|ML|36|573.571.431||TBR|BLK|||||||16|1|1|194.40|360.00|||6|
7423|ML|36|573.571.432||TBR|ART|||||||16|1|1|194.40|360.00|||6|
7424|ML|36|573.571.433||TBR|LIN|||||||16|1|1|194.40|360.00|||6|
7425|ML|36|573.571.434||TBR|HAL|||||||16|1|1|194.40|360.00|||6|
7426|ML|36|573.571.435||BCO|BCO|B||||||16|1|1|216.00|400.00|||6|
7427|ML|36|573.571.436||BCO|BCO|M||||||16|1|1|216.00|400.00|||6|
7428|ML|36|573.571.437||CCL|CCL|B||||||16|1|1|216.00|400.00|||6|
7429|ML|36|573.571.438||CCL|CCL|M||||||16|1|1|216.00|400.00|||6|
7430|ML|36|573.571.439||CME|CME|B||||||16|1|1|216.00|400.00|||6|
7431|ML|36|573.571.440||CME|CME|M||||||16|1|1|216.00|400.00|||6|
7432|ML|36|573.571.441||ANT|ANT|B||||||16|1|1|216.00|400.00|||6|
7433|ML|36|573.571.442||ANT|ANT|M||||||16|1|1|216.00|400.00|||6|
7434|ML|36|573.571.443||PTO|PTO|B||||||16|1|1|216.00|400.00|||6|
7435|ML|36|573.571.444||PTO|PTO|M||||||16|1|1|216.00|400.00|||6|
7436|ML|36|573.571.445||CRE|CRE|B||||||16|1|1|216.00|400.00|||6|
7437|ML|36|573.571.446||CRE|CRE|M||||||16|1|1|216.00|400.00|||6|
7438|ML|36|573.571.447||CAM|CAM|B||||||16|1|1|216.00|400.00|||6|
7439|ML|36|573.571.448||CAM|CAM|M||||||16|1|1|216.00|400.00|||6|
7440|ML|36|573.571.449||OUR|OUR|B||||||16|1|1|216.00|400.00|||6|
7441|ML|36|573.571.450||OUR|OUR|M||||||16|1|1|216.00|400.00|||6|
7442|ML|36|573.571.451||COB|COB|B||||||16|1|1|216.00|400.00|||6|
7443|ML|36|573.571.452||COB|COB|M||||||16|1|1|216.00|400.00|||6|
7444|ML|36|573.571.453||CHO|CHO|B||||||16|1|1|216.00|400.00|||6|
7445|ML|36|573.571.454||CHO|CHO|M||||||16|1|1|216.00|400.00|||6|
7446|ML|36|573.571.455||VAG|VAG|B||||||16|1|1|216.00|400.00|||6|
7447|ML|36|573.571.456||VAG|VAG|M||||||16|1|1|216.00|400.00|||6|
7448|ML|36|573.571.457||AZE|AZE|B||||||16|1|1|216.00|400.00|||6|
7449|ML|36|573.571.458||AZE|AZE|M||||||16|1|1|216.00|400.00|||6|
7450|ML|36|573.571.459||AMA|AMA|B||||||16|1|1|216.00|400.00|||6|
7451|ML|36|573.571.460||AMA|AMA|M||||||16|1|1|216.00|400.00|||6|
7452|ML|36|573.571.461||AES|AES|B||||||16|1|1|216.00|400.00|||6|
7453|ML|36|573.571.462||AES|AES|M||||||16|1|1|216.00|400.00|||6|
7454|ML|36|573.571.463||PRA|PRA|B||||||16|1|1|216.00|400.00|||6|
7455|ML|36|573.571.464||PRA|PRA|M||||||16|1|1|216.00|400.00|||6|
7456|ML|36|573.571.465||ROS|ROS|B||||||16|1|1|216.00|400.00|||6|
7457|ML|36|573.571.466||ROS|ROS|M||||||16|1|1|216.00|400.00|||6|
7458|ML|36|573.571.467||VER|VER|B||||||16|1|1|216.00|400.00|||6|
7459|ML|36|573.571.468||VER|VER|M||||||16|1|1|216.00|400.00|||6|
7460|ML|36|573.571.469||AZB|AZB|||||||16|1|1|216.00|400.00|||6|
7461|ML|36|573.571.470||DEN|DEN|||||||16|1|1|216.00|400.00|||6|
7462|ML|36|573.571.471||BLK|BLK|||||||16|1|1|216.00|400.00|||6|
7463|ML|36|573.571.472||ART|ART|||||||16|1|1|216.00|400.00|||6|
7464|ML|36|573.571.473||LIN|LIN|||||||16|1|1|216.00|400.00|||6|
7465|ML|36|573.571.474||HAL|HAL|||||||16|1|1|216.00|400.00|||6|
7466|ML|37|573.571.475||TBR|TBR|||||||16|1|1|151.20|280.00|||6|
7467|ML|37|573.571.242||TEA|TEA|||||||16|1|1|151.20|280.00|||6|
7468|ML|37|573.571.243||OAK|OAK|||||||16|1|1|151.20|280.00|||6|
7469|ML|37|573.571.244||JOP|JOP|||||||16|1|1|151.20|280.00|||6|
7470|ML|37|573.571.476||TBR|BCO|B||||||16|1|1|194.40|360.00|||6|
7471|ML|37|573.571.477||TBR|BCO|M||||||16|1|1|194.40|360.00|||6|
7472|ML|37|573.571.478||TBR|CCL|B||||||16|1|1|194.40|360.00|||6|
7473|ML|37|573.571.479||TBR|CCL|M||||||16|1|1|194.40|360.00|||6|
7474|ML|37|573.571.480||TBR|CME|B||||||16|1|1|194.40|360.00|||6|
7475|ML|37|573.571.481||TBR|CME|M||||||16|1|1|194.40|360.00|||6|
7476|ML|37|573.571.482||TBR|ANT|B||||||16|1|1|194.40|360.00|||6|
7477|ML|37|573.571.483||TBR|ANT|M||||||16|1|1|194.40|360.00|||6|
7478|ML|37|573.571.484||TBR|PTO|B||||||16|1|1|194.40|360.00|||6|
7479|ML|37|573.571.485||TBR|PTO|M||||||16|1|1|194.40|360.00|||6|
7480|ML|37|573.571.486||TBR|CRE|B||||||16|1|1|194.40|360.00|||6|
7481|ML|37|573.571.487||TBR|CRE|M||||||16|1|1|194.40|360.00|||6|
7482|ML|37|573.571.488||TBR|CAM|B||||||16|1|1|194.40|360.00|||6|
7483|ML|37|573.571.489||TBR|CAM|M||||||16|1|1|194.40|360.00|||6|
7484|ML|37|573.571.490||TBR|OUR|B||||||16|1|1|194.40|360.00|||6|
7485|ML|37|573.571.491||TBR|OUR|M||||||16|1|1|194.40|360.00|||6|
7486|ML|37|573.571.492||TBR|COB|B||||||16|1|1|194.40|360.00|||6|
7487|ML|37|573.571.493||TBR|COB|M||||||16|1|1|194.40|360.00|||6|
7488|ML|37|573.571.494||TBR|CHO|B||||||16|1|1|194.40|360.00|||6|
7489|ML|37|573.571.495||TBR|CHO|M||||||16|1|1|194.40|360.00|||6|
7490|ML|37|573.571.496||TBR|VAG|B||||||16|1|1|194.40|360.00|||6|
7491|ML|37|573.571.497||TBR|VAG|M||||||16|1|1|194.40|360.00|||6|
7492|ML|37|573.571.498||TBR|AZE|B||||||16|1|1|194.40|360.00|||6|
7493|ML|37|573.571.499||TBR|AZE|M||||||16|1|1|194.40|360.00|||6|
7494|ML|37|573.571.500||TBR|AMA|B||||||16|1|1|194.40|360.00|||6|
7495|ML|37|573.571.501||TBR|AMA|M||||||16|1|1|194.40|360.00|||6|
7496|ML|37|573.571.502||TBR|AES|B||||||16|1|1|194.40|360.00|||6|
7497|ML|37|573.571.503||TBR|AES|M||||||16|1|1|194.40|360.00|||6|
7498|ML|37|573.571.504||TBR|PRA|B||||||16|1|1|194.40|360.00|||6|
7499|ML|37|573.571.505||TBR|PRA|M||||||16|1|1|194.40|360.00|||6|
7500|ML|37|573.571.506||TBR|ROS|B||||||16|1|1|194.40|360.00|||6|
7501|ML|37|573.571.507||TBR|ROS|M||||||16|1|1|194.40|360.00|||6|
7502|ML|37|573.571.508||TBR|VER|B||||||16|1|1|194.40|360.00|||6|
7503|ML|37|573.571.509||TBR|VER|M||||||16|1|1|194.40|360.00|||6|
7504|ML|37|573.571.510||TBR|AZB|||||||16|1|1|194.40|360.00|||6|
7505|ML|37|573.571.511||TBR|DEN|||||||16|1|1|194.40|360.00|||6|
7506|ML|37|573.571.512||TBR|BLK|||||||16|1|1|194.40|360.00|||6|
7507|ML|37|573.571.513||TBR|ART|||||||16|1|1|194.40|360.00|||6|
7508|ML|37|573.571.514||TBR|LIN|||||||16|1|1|194.40|360.00|||6|
7509|ML|37|573.571.515||TBR|HAL|||||||16|1|1|194.40|360.00|||6|
7510|ML|37|573.571.516||BCO|BCO|B||||||16|1|1|216.00|400.00|||6|
7511|ML|37|573.571.517||BCO|BCO|M||||||16|1|1|216.00|400.00|||6|
7512|ML|37|573.571.518||CCL|CCL|B||||||16|1|1|216.00|400.00|||6|
7513|ML|37|573.571.519||CCL|CCL|M||||||16|1|1|216.00|400.00|||6|
7514|ML|37|573.571.520||CME|CME|B||||||16|1|1|216.00|400.00|||6|
7515|ML|37|573.571.521||CME|CME|M||||||16|1|1|216.00|400.00|||6|
7516|ML|37|573.571.522||ANT|ANT|B||||||16|1|1|216.00|400.00|||6|
7517|ML|37|573.571.523||ANT|ANT|M||||||16|1|1|216.00|400.00|||6|
7518|ML|37|573.571.524||PTO|PTO|B||||||16|1|1|216.00|400.00|||6|
7519|ML|37|573.571.525||PTO|PTO|M||||||16|1|1|216.00|400.00|||6|
7520|ML|37|573.571.526||CRE|CRE|B||||||16|1|1|216.00|400.00|||6|
7521|ML|37|573.571.527||CRE|CRE|M||||||16|1|1|216.00|400.00|||6|
7522|ML|37|573.571.528||CAM|CAM|B||||||16|1|1|216.00|400.00|||6|
7523|ML|37|573.571.529||CAM|CAM|M||||||16|1|1|216.00|400.00|||6|
7524|ML|37|573.571.530||OUR|OUR|B||||||16|1|1|216.00|400.00|||6|
7525|ML|37|573.571.531||OUR|OUR|M||||||16|1|1|216.00|400.00|||6|
7526|ML|37|573.571.532||COB|COB|B||||||16|1|1|216.00|400.00|||6|
7527|ML|37|573.571.533||COB|COB|M||||||16|1|1|216.00|400.00|||6|
7528|ML|37|573.571.534||CHO|CHO|B||||||16|1|1|216.00|400.00|||6|
7529|ML|37|573.571.535||CHO|CHO|M||||||16|1|1|216.00|400.00|||6|
7530|ML|37|573.571.536||VAG|VAG|B||||||16|1|1|216.00|400.00|||6|
7531|ML|37|573.571.537||VAG|VAG|M||||||16|1|1|216.00|400.00|||6|
7532|ML|37|573.571.538||AZE|AZE|B||||||16|1|1|216.00|400.00|||6|
7533|ML|37|573.571.539||AZE|AZE|M||||||16|1|1|216.00|400.00|||6|
7534|ML|37|573.571.540||AMA|AMA|B||||||16|1|1|216.00|400.00|||6|
7535|ML|37|573.571.541||AMA|AMA|M||||||16|1|1|216.00|400.00|||6|
7536|ML|37|573.571.542||AES|AES|B||||||16|1|1|216.00|400.00|||6|
7537|ML|37|573.571.543||AES|AES|M||||||16|1|1|216.00|400.00|||6|
7538|ML|37|573.571.544||PRA|PRA|B||||||16|1|1|216.00|400.00|||6|
7539|ML|37|573.571.545||PRA|PRA|M||||||16|1|1|216.00|400.00|||6|
7540|ML|37|573.571.546||ROS|ROS|B||||||16|1|1|216.00|400.00|||6|
7541|ML|37|573.571.547||ROS|ROS|M||||||16|1|1|216.00|400.00|||6|
7542|ML|37|573.571.548||VER|VER|B||||||16|1|1|216.00|400.00|||6|
7543|ML|37|573.571.549||VER|VER|M||||||16|1|1|216.00|400.00|||6|
7544|ML|37|573.571.550||AZB|AZB|||||||16|1|1|216.00|400.00|||6|
7545|ML|37|573.571.551||DEN|DEN|||||||16|1|1|216.00|400.00|||6|
7546|ML|37|573.571.552||BLK|BLK|||||||16|1|1|216.00|400.00|||6|
7547|ML|37|573.571.553||ART|ART|||||||16|1|1|216.00|400.00|||6|
7548|ML|37|573.571.554||LIN|LIN|||||||16|1|1|216.00|400.00|||6|
7549|ML|37|573.571.555||HAL|HAL|||||||16|1|1|216.00|400.00|||6|
7550|ML|38|574.575.394||TBR|TBR|||||||17|1|1|205.20|380.00|||6|
7551|ML|38|574.575.198||TEA|TEA|||||||17|1|1|205.20|380.00|||6|
7552|ML|38|574.575.199||OAK|OAK|||||||17|1|1|205.20|380.00|||6|
7553|ML|38|574.575.200||JOP|JOP|||||||17|1|1|205.20|380.00|||6|
7554|ML|38|574.575.395||TBR|BCO|B||||||17|1|1|248.40|460.00|||6|
7555|ML|38|574.575.396||TBR|BCO|M||||||17|1|1|248.40|460.00|||6|
7556|ML|38|574.575.397||TBR|CCL|B||||||17|1|1|248.40|460.00|||6|
7557|ML|38|574.575.398||TBR|CCL|M||||||17|1|1|248.40|460.00|||6|
7558|ML|38|574.575.399||TBR|CME|B||||||17|1|1|248.40|460.00|||6|
7559|ML|38|574.575.400||TBR|CME|M||||||17|1|1|248.40|460.00|||6|
7560|ML|38|574.575.401||TBR|ANT|B||||||17|1|1|248.40|460.00|||6|
7561|ML|38|574.575.402||TBR|ANT|M||||||17|1|1|248.40|460.00|||6|
7562|ML|38|574.575.403||TBR|PTO|B||||||17|1|1|248.40|460.00|||6|
7563|ML|38|574.575.404||TBR|PTO|M||||||17|1|1|248.40|460.00|||6|
7564|ML|38|574.575.405||TBR|CRE|B||||||17|1|1|248.40|460.00|||6|
7565|ML|38|574.575.406||TBR|CRE|M||||||17|1|1|248.40|460.00|||6|
7566|ML|38|574.575.407||TBR|CAM|B||||||17|1|1|248.40|460.00|||6|
7567|ML|38|574.575.408||TBR|CAM|M||||||17|1|1|248.40|460.00|||6|
7568|ML|38|574.575.409||TBR|OUR|B||||||17|1|1|248.40|460.00|||6|
7569|ML|38|574.575.410||TBR|OUR|M||||||17|1|1|248.40|460.00|||6|
7570|ML|38|574.575.411||TBR|COB|B||||||17|1|1|248.40|460.00|||6|
7571|ML|38|574.575.412||TBR|COB|M||||||17|1|1|248.40|460.00|||6|
7572|ML|38|574.575.413||TBR|CHO|B||||||17|1|1|248.40|460.00|||6|
7573|ML|38|574.575.414||TBR|CHO|M||||||17|1|1|248.40|460.00|||6|
7574|ML|38|574.575.415||TBR|VAG|B||||||17|1|1|248.40|460.00|||6|
7575|ML|38|574.575.416||TBR|VAG|M||||||17|1|1|248.40|460.00|||6|
7576|ML|38|574.575.417||TBR|AZE|B||||||17|1|1|248.40|460.00|||6|
7577|ML|38|574.575.418||TBR|AZE|M||||||17|1|1|248.40|460.00|||6|
7578|ML|38|574.575.419||TBR|AMA|B||||||17|1|1|248.40|460.00|||6|
7579|ML|38|574.575.420||TBR|AMA|M||||||17|1|1|248.40|460.00|||6|
7580|ML|38|574.575.421||TBR|AES|B||||||17|1|1|248.40|460.00|||6|
7581|ML|38|574.575.422||TBR|AES|M||||||17|1|1|248.40|460.00|||6|
7582|ML|38|574.575.423||TBR|PRA|B||||||17|1|1|248.40|460.00|||6|
7583|ML|38|574.575.424||TBR|PRA|M||||||17|1|1|248.40|460.00|||6|
7584|ML|38|574.575.425||TBR|ROS|B||||||17|1|1|248.40|460.00|||6|
7585|ML|38|574.575.426||TBR|ROS|M||||||17|1|1|248.40|460.00|||6|
7586|ML|38|574.575.427||TBR|VER|B||||||17|1|1|248.40|460.00|||6|
7587|ML|38|574.575.428||TBR|VER|M||||||17|1|1|248.40|460.00|||6|
7588|ML|38|574.575.429||TBR|AZB|||||||17|1|1|248.40|460.00|||6|
7589|ML|38|574.575.430||TBR|DEN|||||||17|1|1|248.40|460.00|||6|
7590|ML|38|574.575.431||TBR|BLK|||||||17|1|1|248.40|460.00|||6|
7591|ML|38|574.575.432||TBR|ART|||||||17|1|1|248.40|460.00|||6|
7592|ML|38|574.575.433||TBR|LIN|||||||17|1|1|248.40|460.00|||6|
7593|ML|38|574.575.434||TBR|HAL|||||||17|1|1|248.40|460.00|||6|
7594|ML|38|574.575.435||BCO|BCO|B||||||17|1|1|270.00|500.00|||6|
7595|ML|38|574.575.436||BCO|BCO|M||||||17|1|1|270.00|500.00|||6|
7596|ML|38|574.575.437||CCL|CCL|B||||||17|1|1|270.00|500.00|||6|
7597|ML|38|574.575.438||CCL|CCL|M||||||17|1|1|270.00|500.00|||6|
7598|ML|38|574.575.439||CME|CME|B||||||17|1|1|270.00|500.00|||6|
7599|ML|38|574.575.440||CME|CME|M||||||17|1|1|270.00|500.00|||6|
7600|ML|38|574.575.441||ANT|ANT|B||||||17|1|1|270.00|500.00|||6|
7601|ML|38|574.575.442||ANT|ANT|M||||||17|1|1|270.00|500.00|||6|
7602|ML|38|574.575.443||PTO|PTO|B||||||17|1|1|270.00|500.00|||6|
7603|ML|38|574.575.444||PTO|PTO|M||||||17|1|1|270.00|500.00|||6|
7604|ML|38|574.575.445||CRE|CRE|B||||||17|1|1|270.00|500.00|||6|
7605|ML|38|574.575.446||CRE|CRE|M||||||17|1|1|270.00|500.00|||6|
7606|ML|38|574.575.447||CAM|CAM|B||||||17|1|1|270.00|500.00|||6|
7607|ML|38|574.575.448||CAM|CAM|M||||||17|1|1|270.00|500.00|||6|
7608|ML|38|574.575.449||OUR|OUR|B||||||17|1|1|270.00|500.00|||6|
7609|ML|38|574.575.450||OUR|OUR|M||||||17|1|1|270.00|500.00|||6|
7610|ML|38|574.575.451||COB|COB|B||||||17|1|1|270.00|500.00|||6|
7611|ML|38|574.575.452||COB|COB|M||||||17|1|1|270.00|500.00|||6|
7612|ML|38|574.575.453||CHO|CHO|B||||||17|1|1|270.00|500.00|||6|
7613|ML|38|574.575.454||CHO|CHO|M||||||17|1|1|270.00|500.00|||6|
7614|ML|38|574.575.455||VAG|VAG|B||||||17|1|1|270.00|500.00|||6|
7615|ML|38|574.575.456||VAG|VAG|M||||||17|1|1|270.00|500.00|||6|
7616|ML|38|574.575.457||AZE|AZE|B||||||17|1|1|270.00|500.00|||6|
7617|ML|38|574.575.458||AZE|AZE|M||||||17|1|1|270.00|500.00|||6|
7618|ML|38|574.575.459||AMA|AMA|B||||||17|1|1|270.00|500.00|||6|
7619|ML|38|574.575.460||AMA|AMA|M||||||17|1|1|270.00|500.00|||6|
7620|ML|38|574.575.461||AES|AES|B||||||17|1|1|270.00|500.00|||6|
7621|ML|38|574.575.462||AES|AES|M||||||17|1|1|270.00|500.00|||6|
7622|ML|38|574.575.463||PRA|PRA|B||||||17|1|1|270.00|500.00|||6|
7623|ML|38|574.575.464||PRA|PRA|M||||||17|1|1|270.00|500.00|||6|
7624|ML|38|574.575.465||ROS|ROS|B||||||17|1|1|270.00|500.00|||6|
7625|ML|38|574.575.466||ROS|ROS|M||||||17|1|1|270.00|500.00|||6|
7626|ML|38|574.575.467||VER|VER|B||||||17|1|1|270.00|500.00|||6|
7627|ML|38|574.575.468||VER|VER|M||||||17|1|1|270.00|500.00|||6|
7628|ML|38|574.575.469||AZB|AZB|||||||17|1|1|270.00|500.00|||6|
7629|ML|38|574.575.470||DEN|DEN|||||||17|1|1|270.00|500.00|||6|
7630|ML|38|574.575.471||BLK|BLK|||||||17|1|1|270.00|500.00|||6|
7631|ML|38|574.575.472||ART|ART|||||||17|1|1|270.00|500.00|||6|
7632|ML|38|574.575.473||LIN|LIN|||||||17|1|1|270.00|500.00|||6|
7633|ML|38|574.575.474||HAL|HAL|||||||17|1|1|270.00|500.00|||6|
7634|ML|39|574.575.475||TBR|TBR|||||||17|1|1|205.20|380.00|||6|
7635|ML|39|574.575.242||TEA|TEA|||||||17|1|1|205.20|380.00|||6|
7636|ML|39|574.575.243||OAK|OAK|||||||17|1|1|205.20|380.00|||6|
7637|ML|39|574.575.244||JOP|JOP|||||||17|1|1|205.20|380.00|||6|
7638|ML|39|574.575.476||TBR|BCO|B||||||17|1|1|248.40|460.00|||6|
7639|ML|39|574.575.477||TBR|BCO|M||||||17|1|1|248.40|460.00|||6|
7640|ML|39|574.575.478||TBR|CCL|B||||||17|1|1|248.40|460.00|||6|
7641|ML|39|574.575.479||TBR|CCL|M||||||17|1|1|248.40|460.00|||6|
7642|ML|39|574.575.480||TBR|CME|B||||||17|1|1|248.40|460.00|||6|
7643|ML|39|574.575.481||TBR|CME|M||||||17|1|1|248.40|460.00|||6|
7644|ML|39|574.575.482||TBR|ANT|B||||||17|1|1|248.40|460.00|||6|
7645|ML|39|574.575.483||TBR|ANT|M||||||17|1|1|248.40|460.00|||6|
7646|ML|39|574.575.484||TBR|PTO|B||||||17|1|1|248.40|460.00|||6|
7647|ML|39|574.575.485||TBR|PTO|M||||||17|1|1|248.40|460.00|||6|
7648|ML|39|574.575.486||TBR|CRE|B||||||17|1|1|248.40|460.00|||6|
7649|ML|39|574.575.487||TBR|CRE|M||||||17|1|1|248.40|460.00|||6|
7650|ML|39|574.575.488||TBR|CAM|B||||||17|1|1|248.40|460.00|||6|
7651|ML|39|574.575.489||TBR|CAM|M||||||17|1|1|248.40|460.00|||6|
7652|ML|39|574.575.490||TBR|OUR|B||||||17|1|1|248.40|460.00|||6|
7653|ML|39|574.575.491||TBR|OUR|M||||||17|1|1|248.40|460.00|||6|
7654|ML|39|574.575.492||TBR|COB|B||||||17|1|1|248.40|460.00|||6|
7655|ML|39|574.575.493||TBR|COB|M||||||17|1|1|248.40|460.00|||6|
7656|ML|39|574.575.494||TBR|CHO|B||||||17|1|1|248.40|460.00|||6|
7657|ML|39|574.575.495||TBR|CHO|M||||||17|1|1|248.40|460.00|||6|
7658|ML|39|574.575.496||TBR|VAG|B||||||17|1|1|248.40|460.00|||6|
7659|ML|39|574.575.497||TBR|VAG|M||||||17|1|1|248.40|460.00|||6|
7660|ML|39|574.575.498||TBR|AZE|B||||||17|1|1|248.40|460.00|||6|
7661|ML|39|574.575.499||TBR|AZE|M||||||17|1|1|248.40|460.00|||6|
7662|ML|39|574.575.500||TBR|AMA|B||||||17|1|1|248.40|460.00|||6|
7663|ML|39|574.575.501||TBR|AMA|M||||||17|1|1|248.40|460.00|||6|
7664|ML|39|574.575.502||TBR|AES|B||||||17|1|1|248.40|460.00|||6|
7665|ML|39|574.575.503||TBR|AES|M||||||17|1|1|248.40|460.00|||6|
7666|ML|39|574.575.504||TBR|PRA|B||||||17|1|1|248.40|460.00|||6|
7667|ML|39|574.575.505||TBR|PRA|M||||||17|1|1|248.40|460.00|||6|
7668|ML|39|574.575.506||TBR|ROS|B||||||17|1|1|248.40|460.00|||6|
7669|ML|39|574.575.507||TBR|ROS|M||||||17|1|1|248.40|460.00|||6|
7670|ML|39|574.575.508||TBR|VER|B||||||17|1|1|248.40|460.00|||6|
7671|ML|39|574.575.509||TBR|VER|M||||||17|1|1|248.40|460.00|||6|
7672|ML|39|574.575.510||TBR|AZB|||||||17|1|1|248.40|460.00|||6|
7673|ML|39|574.575.511||TBR|DEN|||||||17|1|1|248.40|460.00|||6|
7674|ML|39|574.575.512||TBR|BLK|||||||17|1|1|248.40|460.00|||6|
7675|ML|39|574.575.513||TBR|ART|||||||17|1|1|248.40|460.00|||6|
7676|ML|39|574.575.514||TBR|LIN|||||||17|1|1|248.40|460.00|||6|
7677|ML|39|574.575.515||TBR|HAL|||||||17|1|1|248.40|460.00|||6|
7678|ML|39|574.575.516||BCO|BCO|B||||||17|1|1|270.00|500.00|||6|
7679|ML|39|574.575.517||BCO|BCO|M||||||17|1|1|270.00|500.00|||6|
7680|ML|39|574.575.518||CCL|CCL|B||||||17|1|1|270.00|500.00|||6|
7681|ML|39|574.575.519||CCL|CCL|M||||||17|1|1|270.00|500.00|||6|
7682|ML|39|574.575.520||CME|CME|B||||||17|1|1|270.00|500.00|||6|
7683|ML|39|574.575.521||CME|CME|M||||||17|1|1|270.00|500.00|||6|
7684|ML|39|574.575.522||ANT|ANT|B||||||17|1|1|270.00|500.00|||6|
7685|ML|39|574.575.523||ANT|ANT|M||||||17|1|1|270.00|500.00|||6|
7686|ML|39|574.575.524||PTO|PTO|B||||||17|1|1|270.00|500.00|||6|
7687|ML|39|574.575.525||PTO|PTO|M||||||17|1|1|270.00|500.00|||6|
7688|ML|39|574.575.526||CRE|CRE|B||||||17|1|1|270.00|500.00|||6|
7689|ML|39|574.575.527||CRE|CRE|M||||||17|1|1|270.00|500.00|||6|
7690|ML|39|574.575.528||CAM|CAM|B||||||17|1|1|270.00|500.00|||6|
7691|ML|39|574.575.529||CAM|CAM|M||||||17|1|1|270.00|500.00|||6|
7692|ML|39|574.575.530||OUR|OUR|B||||||17|1|1|270.00|500.00|||6|
7693|ML|39|574.575.531||OUR|OUR|M||||||17|1|1|270.00|500.00|||6|
7694|ML|39|574.575.532||COB|COB|B||||||17|1|1|270.00|500.00|||6|
7695|ML|39|574.575.533||COB|COB|M||||||17|1|1|270.00|500.00|||6|
7696|ML|39|574.575.534||CHO|CHO|B||||||17|1|1|270.00|500.00|||6|
7697|ML|39|574.575.535||CHO|CHO|M||||||17|1|1|270.00|500.00|||6|
7698|ML|39|574.575.536||VAG|VAG|B||||||17|1|1|270.00|500.00|||6|
7699|ML|39|574.575.537||VAG|VAG|M||||||17|1|1|270.00|500.00|||6|
7700|ML|39|574.575.538||AZE|AZE|B||||||17|1|1|270.00|500.00|||6|
7701|ML|39|574.575.539||AZE|AZE|M||||||17|1|1|270.00|500.00|||6|
7702|ML|39|574.575.540||AMA|AMA|B||||||17|1|1|270.00|500.00|||6|
7703|ML|39|574.575.541||AMA|AMA|M||||||17|1|1|270.00|500.00|||6|
7704|ML|39|574.575.542||AES|AES|B||||||17|1|1|270.00|500.00|||6|
7705|ML|39|574.575.543||AES|AES|M||||||17|1|1|270.00|500.00|||6|
7706|ML|39|574.575.544||PRA|PRA|B||||||17|1|1|270.00|500.00|||6|
7707|ML|39|574.575.545||PRA|PRA|M||||||17|1|1|270.00|500.00|||6|
7708|ML|39|574.575.546||ROS|ROS|B||||||17|1|1|270.00|500.00|||6|
7709|ML|39|574.575.547||ROS|ROS|M||||||17|1|1|270.00|500.00|||6|
7710|ML|39|574.575.548||VER|VER|B||||||17|1|1|270.00|500.00|||6|
7711|ML|39|574.575.549||VER|VER|M||||||17|1|1|270.00|500.00|||6|
7712|ML|39|574.575.550||AZB|AZB|||||||17|1|1|270.00|500.00|||6|
7713|ML|39|574.575.551||DEN|DEN|||||||17|1|1|270.00|500.00|||6|
7714|ML|39|574.575.552||BLK|BLK|||||||17|1|1|270.00|500.00|||6|
7715|ML|39|574.575.553||ART|ART|||||||17|1|1|270.00|500.00|||6|
7716|ML|39|574.575.554||LIN|LIN|||||||17|1|1|270.00|500.00|||6|
7717|ML|39|574.575.555||HAL|HAL|||||||17|1|1|270.00|500.00|||6|
7718|ML|40|574.576.394||TBR|TBR|||||||17|1|1|226.80|420.00|||6|
7719|ML|40|574.576.198||TEA|TEA|||||||17|1|1|226.80|420.00|||6|
7720|ML|40|574.576.199||OAK|OAK|||||||17|1|1|226.80|420.00|||6|
7721|ML|40|574.576.200||JOP|JOP|||||||17|1|1|226.80|420.00|||6|
7722|ML|40|574.576.395||TBR|BCO|B||||||17|1|1|270.00|500.00|||6|
7723|ML|40|574.576.396||TBR|BCO|M||||||17|1|1|270.00|500.00|||6|
7724|ML|40|574.576.397||TBR|CCL|B||||||17|1|1|270.00|500.00|||6|
7725|ML|40|574.576.398||TBR|CCL|M||||||17|1|1|270.00|500.00|||6|
7726|ML|40|574.576.399||TBR|CME|B||||||17|1|1|270.00|500.00|||6|
7727|ML|40|574.576.400||TBR|CME|M||||||17|1|1|270.00|500.00|||6|
7728|ML|40|574.576.401||TBR|ANT|B||||||17|1|1|270.00|500.00|||6|
7729|ML|40|574.576.402||TBR|ANT|M||||||17|1|1|270.00|500.00|||6|
7730|ML|40|574.576.403||TBR|PTO|B||||||17|1|1|270.00|500.00|||6|
7731|ML|40|574.576.404||TBR|PTO|M||||||17|1|1|270.00|500.00|||6|
7732|ML|40|574.576.405||TBR|CRE|B||||||17|1|1|270.00|500.00|||6|
7733|ML|40|574.576.406||TBR|CRE|M||||||17|1|1|270.00|500.00|||6|
7734|ML|40|574.576.407||TBR|CAM|B||||||17|1|1|270.00|500.00|||6|
7735|ML|40|574.576.408||TBR|CAM|M||||||17|1|1|270.00|500.00|||6|
7736|ML|40|574.576.409||TBR|OUR|B||||||17|1|1|270.00|500.00|||6|
7737|ML|40|574.576.410||TBR|OUR|M||||||17|1|1|270.00|500.00|||6|
7738|ML|40|574.576.411||TBR|COB|B||||||17|1|1|270.00|500.00|||6|
7739|ML|40|574.576.412||TBR|COB|M||||||17|1|1|270.00|500.00|||6|
7740|ML|40|574.576.413||TBR|CHO|B||||||17|1|1|270.00|500.00|||6|
7741|ML|40|574.576.414||TBR|CHO|M||||||17|1|1|270.00|500.00|||6|
7742|ML|40|574.576.415||TBR|VAG|B||||||17|1|1|270.00|500.00|||6|
7743|ML|40|574.576.416||TBR|VAG|M||||||17|1|1|270.00|500.00|||6|
7744|ML|40|574.576.417||TBR|AZE|B||||||17|1|1|270.00|500.00|||6|
7745|ML|40|574.576.418||TBR|AZE|M||||||17|1|1|270.00|500.00|||6|
7746|ML|40|574.576.419||TBR|AMA|B||||||17|1|1|270.00|500.00|||6|
7747|ML|40|574.576.420||TBR|AMA|M||||||17|1|1|270.00|500.00|||6|
7748|ML|40|574.576.421||TBR|AES|B||||||17|1|1|270.00|500.00|||6|
7749|ML|40|574.576.422||TBR|AES|M||||||17|1|1|270.00|500.00|||6|
7750|ML|40|574.576.423||TBR|PRA|B||||||17|1|1|270.00|500.00|||6|
7751|ML|40|574.576.424||TBR|PRA|M||||||17|1|1|270.00|500.00|||6|
7752|ML|40|574.576.425||TBR|ROS|B||||||17|1|1|270.00|500.00|||6|
7753|ML|40|574.576.426||TBR|ROS|M||||||17|1|1|270.00|500.00|||6|
7754|ML|40|574.576.427||TBR|VER|B||||||17|1|1|270.00|500.00|||6|
7755|ML|40|574.576.428||TBR|VER|M||||||17|1|1|270.00|500.00|||6|
7756|ML|40|574.576.429||TBR|AZB|||||||17|1|1|270.00|500.00|||6|
7757|ML|40|574.576.430||TBR|DEN|||||||17|1|1|270.00|500.00|||6|
7758|ML|40|574.576.431||TBR|BLK|||||||17|1|1|270.00|500.00|||6|
7759|ML|40|574.576.432||TBR|ART|||||||17|1|1|270.00|500.00|||6|
7760|ML|40|574.576.433||TBR|LIN|||||||17|1|1|270.00|500.00|||6|
7761|ML|40|574.576.434||TBR|HAL|||||||17|1|1|270.00|500.00|||6|
7762|ML|40|574.576.435||BCO|BCO|B||||||17|1|1|291.60|540.00|||6|
7763|ML|40|574.576.436||BCO|BCO|M||||||17|1|1|291.60|540.00|||6|
7764|ML|40|574.576.437||CCL|CCL|B||||||17|1|1|291.60|540.00|||6|
7765|ML|40|574.576.438||CCL|CCL|M||||||17|1|1|291.60|540.00|||6|
7766|ML|40|574.576.439||CME|CME|B||||||17|1|1|291.60|540.00|||6|
7767|ML|40|574.576.440||CME|CME|M||||||17|1|1|291.60|540.00|||6|
7768|ML|40|574.576.441||ANT|ANT|B||||||17|1|1|291.60|540.00|||6|
7769|ML|40|574.576.442||ANT|ANT|M||||||17|1|1|291.60|540.00|||6|
7770|ML|40|574.576.443||PTO|PTO|B||||||17|1|1|291.60|540.00|||6|
7771|ML|40|574.576.444||PTO|PTO|M||||||17|1|1|291.60|540.00|||6|
7772|ML|40|574.576.445||CRE|CRE|B||||||17|1|1|291.60|540.00|||6|
7773|ML|40|574.576.446||CRE|CRE|M||||||17|1|1|291.60|540.00|||6|
7774|ML|40|574.576.447||CAM|CAM|B||||||17|1|1|291.60|540.00|||6|
7775|ML|40|574.576.448||CAM|CAM|M||||||17|1|1|291.60|540.00|||6|
7776|ML|40|574.576.449||OUR|OUR|B||||||17|1|1|291.60|540.00|||6|
7777|ML|40|574.576.450||OUR|OUR|M||||||17|1|1|291.60|540.00|||6|
7778|ML|40|574.576.451||COB|COB|B||||||17|1|1|291.60|540.00|||6|
7779|ML|40|574.576.452||COB|COB|M||||||17|1|1|291.60|540.00|||6|
7780|ML|40|574.576.453||CHO|CHO|B||||||17|1|1|291.60|540.00|||6|
7781|ML|40|574.576.454||CHO|CHO|M||||||17|1|1|291.60|540.00|||6|
7782|ML|40|574.576.455||VAG|VAG|B||||||17|1|1|291.60|540.00|||6|
7783|ML|40|574.576.456||VAG|VAG|M||||||17|1|1|291.60|540.00|||6|
7784|ML|40|574.576.457||AZE|AZE|B||||||17|1|1|291.60|540.00|||6|
7785|ML|40|574.576.458||AZE|AZE|M||||||17|1|1|291.60|540.00|||6|
7786|ML|40|574.576.459||AMA|AMA|B||||||17|1|1|291.60|540.00|||6|
7787|ML|40|574.576.460||AMA|AMA|M||||||17|1|1|291.60|540.00|||6|
7788|ML|40|574.576.461||AES|AES|B||||||17|1|1|291.60|540.00|||6|
7789|ML|40|574.576.462||AES|AES|M||||||17|1|1|291.60|540.00|||6|
7790|ML|40|574.576.463||PRA|PRA|B||||||17|1|1|291.60|540.00|||6|
7791|ML|40|574.576.464||PRA|PRA|M||||||17|1|1|291.60|540.00|||6|
7792|ML|40|574.576.465||ROS|ROS|B||||||17|1|1|291.60|540.00|||6|
7793|ML|40|574.576.466||ROS|ROS|M||||||17|1|1|291.60|540.00|||6|
7794|ML|40|574.576.467||VER|VER|B||||||17|1|1|291.60|540.00|||6|
7795|ML|40|574.576.468||VER|VER|M||||||17|1|1|291.60|540.00|||6|
7796|ML|40|574.576.469||AZB|AZB|||||||17|1|1|291.60|540.00|||6|
7797|ML|40|574.576.470||DEN|DEN|||||||17|1|1|291.60|540.00|||6|
7798|ML|40|574.576.471||BLK|BLK|||||||17|1|1|291.60|540.00|||6|
7799|ML|40|574.576.472||ART|ART|||||||17|1|1|291.60|540.00|||6|
7800|ML|40|574.576.473||LIN|LIN|||||||17|1|1|291.60|540.00|||6|
7801|ML|40|574.576.474||HAL|HAL|||||||17|1|1|291.60|540.00|||6|
7802|ML|41|574.576.475||TBR|TBR|||||||17|1|1|205.20|380.00|||6|
7803|ML|41|574.576.242||TEA|TEA|||||||17|1|1|205.20|380.00|||6|
7804|ML|41|574.576.243||OAK|OAK|||||||17|1|1|205.20|380.00|||6|
7805|ML|41|574.576.244||JOP|JOP|||||||17|1|1|205.20|380.00|||6|
7806|ML|41|574.576.476||TBR|BCO|B||||||17|1|1|248.40|460.00|||6|
7807|ML|41|574.576.477||TBR|BCO|M||||||17|1|1|248.40|460.00|||6|
7808|ML|41|574.576.478||TBR|CCL|B||||||17|1|1|248.40|460.00|||6|
7809|ML|41|574.576.479||TBR|CCL|M||||||17|1|1|248.40|460.00|||6|
7810|ML|41|574.576.480||TBR|CME|B||||||17|1|1|248.40|460.00|||6|
7811|ML|41|574.576.481||TBR|CME|M||||||17|1|1|248.40|460.00|||6|
7812|ML|41|574.576.482||TBR|ANT|B||||||17|1|1|248.40|460.00|||6|
7813|ML|41|574.576.483||TBR|ANT|M||||||17|1|1|248.40|460.00|||6|
7814|ML|41|574.576.484||TBR|PTO|B||||||17|1|1|248.40|460.00|||6|
7815|ML|41|574.576.485||TBR|PTO|M||||||17|1|1|248.40|460.00|||6|
7816|ML|41|574.576.486||TBR|CRE|B||||||17|1|1|248.40|460.00|||6|
7817|ML|41|574.576.487||TBR|CRE|M||||||17|1|1|248.40|460.00|||6|
7818|ML|41|574.576.488||TBR|CAM|B||||||17|1|1|248.40|460.00|||6|
7819|ML|41|574.576.489||TBR|CAM|M||||||17|1|1|248.40|460.00|||6|
7820|ML|41|574.576.490||TBR|OUR|B||||||17|1|1|248.40|460.00|||6|
7821|ML|41|574.576.491||TBR|OUR|M||||||17|1|1|248.40|460.00|||6|
7822|ML|41|574.576.492||TBR|COB|B||||||17|1|1|248.40|460.00|||6|
7823|ML|41|574.576.493||TBR|COB|M||||||17|1|1|248.40|460.00|||6|
7824|ML|41|574.576.494||TBR|CHO|B||||||17|1|1|248.40|460.00|||6|
7825|ML|41|574.576.495||TBR|CHO|M||||||17|1|1|248.40|460.00|||6|
7826|ML|41|574.576.496||TBR|VAG|B||||||17|1|1|248.40|460.00|||6|
7827|ML|41|574.576.497||TBR|VAG|M||||||17|1|1|248.40|460.00|||6|
7828|ML|41|574.576.498||TBR|AZE|B||||||17|1|1|248.40|460.00|||6|
7829|ML|41|574.576.499||TBR|AZE|M||||||17|1|1|248.40|460.00|||6|
7830|ML|41|574.576.500||TBR|AMA|B||||||17|1|1|248.40|460.00|||6|
7831|ML|41|574.576.501||TBR|AMA|M||||||17|1|1|248.40|460.00|||6|
7832|ML|41|574.576.502||TBR|AES|B||||||17|1|1|248.40|460.00|||6|
7833|ML|41|574.576.503||TBR|AES|M||||||17|1|1|248.40|460.00|||6|
7834|ML|41|574.576.504||TBR|PRA|B||||||17|1|1|248.40|460.00|||6|
7835|ML|41|574.576.505||TBR|PRA|M||||||17|1|1|248.40|460.00|||6|
7836|ML|41|574.576.506||TBR|ROS|B||||||17|1|1|248.40|460.00|||6|
7837|ML|41|574.576.507||TBR|ROS|M||||||17|1|1|248.40|460.00|||6|
7838|ML|41|574.576.508||TBR|VER|B||||||17|1|1|248.40|460.00|||6|
7839|ML|41|574.576.509||TBR|VER|M||||||17|1|1|248.40|460.00|||6|
7840|ML|41|574.576.510||TBR|AZB|||||||17|1|1|248.40|460.00|||6|
7841|ML|41|574.576.511||TBR|DEN|||||||17|1|1|248.40|460.00|||6|
7842|ML|41|574.576.512||TBR|BLK|||||||17|1|1|248.40|460.00|||6|
7843|ML|41|574.576.513||TBR|ART|||||||17|1|1|248.40|460.00|||6|
7844|ML|41|574.576.514||TBR|LIN|||||||17|1|1|248.40|460.00|||6|
7845|ML|41|574.576.515||TBR|HAL|||||||17|1|1|248.40|460.00|||6|
7846|ML|41|574.576.516||BCO|BCO|B||||||17|1|1|270.00|500.00|||6|
7847|ML|41|574.576.517||BCO|BCO|M||||||17|1|1|270.00|500.00|||6|
7848|ML|41|574.576.518||CCL|CCL|B||||||17|1|1|270.00|500.00|||6|
7849|ML|41|574.576.519||CCL|CCL|M||||||17|1|1|270.00|500.00|||6|
7850|ML|41|574.576.520||CME|CME|B||||||17|1|1|270.00|500.00|||6|
7851|ML|41|574.576.521||CME|CME|M||||||17|1|1|270.00|500.00|||6|
7852|ML|41|574.576.522||ANT|ANT|B||||||17|1|1|270.00|500.00|||6|
7853|ML|41|574.576.523||ANT|ANT|M||||||17|1|1|270.00|500.00|||6|
7854|ML|41|574.576.524||PTO|PTO|B||||||17|1|1|270.00|500.00|||6|
7855|ML|41|574.576.525||PTO|PTO|M||||||17|1|1|270.00|500.00|||6|
7856|ML|41|574.576.526||CRE|CRE|B||||||17|1|1|270.00|500.00|||6|
7857|ML|41|574.576.527||CRE|CRE|M||||||17|1|1|270.00|500.00|||6|
7858|ML|41|574.576.528||CAM|CAM|B||||||17|1|1|270.00|500.00|||6|
7859|ML|41|574.576.529||CAM|CAM|M||||||17|1|1|270.00|500.00|||6|
7860|ML|41|574.576.530||OUR|OUR|B||||||17|1|1|270.00|500.00|||6|
7861|ML|41|574.576.531||OUR|OUR|M||||||17|1|1|270.00|500.00|||6|
7862|ML|41|574.576.532||COB|COB|B||||||17|1|1|270.00|500.00|||6|
7863|ML|41|574.576.533||COB|COB|M||||||17|1|1|270.00|500.00|||6|
7864|ML|41|574.576.534||CHO|CHO|B||||||17|1|1|270.00|500.00|||6|
7865|ML|41|574.576.535||CHO|CHO|M||||||17|1|1|270.00|500.00|||6|
7866|ML|41|574.576.536||VAG|VAG|B||||||17|1|1|270.00|500.00|||6|
7867|ML|41|574.576.537||VAG|VAG|M||||||17|1|1|270.00|500.00|||6|
7868|ML|41|574.576.538||AZE|AZE|B||||||17|1|1|270.00|500.00|||6|
7869|ML|41|574.576.539||AZE|AZE|M||||||17|1|1|270.00|500.00|||6|
7870|ML|41|574.576.540||AMA|AMA|B||||||17|1|1|270.00|500.00|||6|
7871|ML|41|574.576.541||AMA|AMA|M||||||17|1|1|270.00|500.00|||6|
7872|ML|41|574.576.542||AES|AES|B||||||17|1|1|270.00|500.00|||6|
7873|ML|41|574.576.543||AES|AES|M||||||17|1|1|270.00|500.00|||6|
7874|ML|41|574.576.544||PRA|PRA|B||||||17|1|1|270.00|500.00|||6|
7875|ML|41|574.576.545||PRA|PRA|M||||||17|1|1|270.00|500.00|||6|
7876|ML|41|574.576.546||ROS|ROS|B||||||17|1|1|270.00|500.00|||6|
7877|ML|41|574.576.547||ROS|ROS|M||||||17|1|1|270.00|500.00|||6|
7878|ML|41|574.576.548||VER|VER|B||||||17|1|1|270.00|500.00|||6|
7879|ML|41|574.576.549||VER|VER|M||||||17|1|1|270.00|500.00|||6|
7880|ML|41|574.576.550||AZB|AZB|||||||17|1|1|270.00|500.00|||6|
7881|ML|41|574.576.551||DEN|DEN|||||||17|1|1|270.00|500.00|||6|
7882|ML|41|574.576.552||BLK|BLK|||||||17|1|1|270.00|500.00|||6|
7883|ML|41|574.576.553||ART|ART|||||||17|1|1|270.00|500.00|||6|
7884|ML|41|574.576.554||LIN|LIN|||||||17|1|1|270.00|500.00|||6|
7885|ML|41|574.576.555||HAL|HAL|||||||17|1|1|270.00|500.00|||6|
7886|ML|42|577.578.394||TBR|TBR|||||||20|1|1|107.46|199.00|||6|
7887|ML|42|577.578.198||TEA|TEA|||||||20|1|1|107.46|199.00|||6|
7888|ML|42|577.578.199||OAK|OAK|||||||20|1|1|107.46|199.00|||6|
7889|ML|42|577.578.200||JOP|JOP|||||||20|1|1|107.46|199.00|||6|
7890|ML|42|577.578.395||TBR|BCO|B||||||20|1|1|150.66|279.00|||6|
7891|ML|42|577.578.396||TBR|BCO|M||||||20|1|1|150.66|279.00|||6|
7892|ML|42|577.578.397||TBR|CCL|B||||||20|1|1|150.66|279.00|||6|
7893|ML|42|577.578.398||TBR|CCL|M||||||20|1|1|150.66|279.00|||6|
7894|ML|42|577.578.399||TBR|CME|B||||||20|1|1|150.66|279.00|||6|
7895|ML|42|577.578.400||TBR|CME|M||||||20|1|1|150.66|279.00|||6|
7896|ML|42|577.578.401||TBR|ANT|B||||||20|1|1|150.66|279.00|||6|
7897|ML|42|577.578.402||TBR|ANT|M||||||20|1|1|150.66|279.00|||6|
7898|ML|42|577.578.403||TBR|PTO|B||||||20|1|1|150.66|279.00|||6|
7899|ML|42|577.578.404||TBR|PTO|M||||||20|1|1|150.66|279.00|||6|
7900|ML|42|577.578.405||TBR|CRE|B||||||20|1|1|150.66|279.00|||6|
7901|ML|42|577.578.406||TBR|CRE|M||||||20|1|1|150.66|279.00|||6|
7902|ML|42|577.578.407||TBR|CAM|B||||||20|1|1|150.66|279.00|||6|
7903|ML|42|577.578.408||TBR|CAM|M||||||20|1|1|150.66|279.00|||6|
7904|ML|42|577.578.409||TBR|OUR|B||||||20|1|1|150.66|279.00|||6|
7905|ML|42|577.578.410||TBR|OUR|M||||||20|1|1|150.66|279.00|||6|
7906|ML|42|577.578.411||TBR|COB|B||||||20|1|1|150.66|279.00|||6|
7907|ML|42|577.578.412||TBR|COB|M||||||20|1|1|150.66|279.00|||6|
7908|ML|42|577.578.413||TBR|CHO|B||||||20|1|1|150.66|279.00|||6|
7909|ML|42|577.578.414||TBR|CHO|M||||||20|1|1|150.66|279.00|||6|
7910|ML|42|577.578.415||TBR|VAG|B||||||20|1|1|150.66|279.00|||6|
7911|ML|42|577.578.416||TBR|VAG|M||||||20|1|1|150.66|279.00|||6|
7912|ML|42|577.578.417||TBR|AZE|B||||||20|1|1|150.66|279.00|||6|
7913|ML|42|577.578.418||TBR|AZE|M||||||20|1|1|150.66|279.00|||6|
7914|ML|42|577.578.419||TBR|AMA|B||||||20|1|1|150.66|279.00|||6|
7915|ML|42|577.578.420||TBR|AMA|M||||||20|1|1|150.66|279.00|||6|
7916|ML|42|577.578.421||TBR|AES|B||||||20|1|1|150.66|279.00|||6|
7917|ML|42|577.578.422||TBR|AES|M||||||20|1|1|150.66|279.00|||6|
7918|ML|42|577.578.423||TBR|PRA|B||||||20|1|1|150.66|279.00|||6|
7919|ML|42|577.578.424||TBR|PRA|M||||||20|1|1|150.66|279.00|||6|
7920|ML|42|577.578.425||TBR|ROS|B||||||20|1|1|150.66|279.00|||6|
7921|ML|42|577.578.426||TBR|ROS|M||||||20|1|1|150.66|279.00|||6|
7922|ML|42|577.578.427||TBR|VER|B||||||20|1|1|150.66|279.00|||6|
7923|ML|42|577.578.428||TBR|VER|M||||||20|1|1|150.66|279.00|||6|
7924|ML|42|577.578.429||TBR|AZB|||||||20|1|1|150.66|279.00|||6|
7925|ML|42|577.578.430||TBR|DEN|||||||20|1|1|150.66|279.00|||6|
7926|ML|42|577.578.431||TBR|BLK|||||||20|1|1|150.66|279.00|||6|
7927|ML|42|577.578.432||TBR|ART|||||||20|1|1|150.66|279.00|||6|
7928|ML|42|577.578.433||TBR|LIN|||||||20|1|1|150.66|279.00|||6|
7929|ML|42|577.578.434||TBR|HAL|||||||20|1|1|150.66|279.00|||6|
7930|ML|42|577.578.435||BCO|BCO|B||||||20|1|1|172.26|319.00|||6|
7931|ML|42|577.578.436||BCO|BCO|M||||||20|1|1|172.26|319.00|||6|
7932|ML|42|577.578.437||CCL|CCL|B||||||20|1|1|172.26|319.00|||6|
7933|ML|42|577.578.438||CCL|CCL|M||||||20|1|1|172.26|319.00|||6|
7934|ML|42|577.578.439||CME|CME|B||||||20|1|1|172.26|319.00|||6|
7935|ML|42|577.578.440||CME|CME|M||||||20|1|1|172.26|319.00|||6|
7936|ML|42|577.578.441||ANT|ANT|B||||||20|1|1|172.26|319.00|||6|
7937|ML|42|577.578.442||ANT|ANT|M||||||20|1|1|172.26|319.00|||6|
7938|ML|42|577.578.443||PTO|PTO|B||||||20|1|1|172.26|319.00|||6|
7939|ML|42|577.578.444||PTO|PTO|M||||||20|1|1|172.26|319.00|||6|
7940|ML|42|577.578.445||CRE|CRE|B||||||20|1|1|172.26|319.00|||6|
7941|ML|42|577.578.446||CRE|CRE|M||||||20|1|1|172.26|319.00|||6|
7942|ML|42|577.578.447||CAM|CAM|B||||||20|1|1|172.26|319.00|||6|
7943|ML|42|577.578.448||CAM|CAM|M||||||20|1|1|172.26|319.00|||6|
7944|ML|42|577.578.449||OUR|OUR|B||||||20|1|1|172.26|319.00|||6|
7945|ML|42|577.578.450||OUR|OUR|M||||||20|1|1|172.26|319.00|||6|
7946|ML|42|577.578.451||COB|COB|B||||||20|1|1|172.26|319.00|||6|
7947|ML|42|577.578.452||COB|COB|M||||||20|1|1|172.26|319.00|||6|
7948|ML|42|577.578.453||CHO|CHO|B||||||20|1|1|172.26|319.00|||6|
7949|ML|42|577.578.454||CHO|CHO|M||||||20|1|1|172.26|319.00|||6|
7950|ML|42|577.578.455||VAG|VAG|B||||||20|1|1|172.26|319.00|||6|
7951|ML|42|577.578.456||VAG|VAG|M||||||20|1|1|172.26|319.00|||6|
7952|ML|42|577.578.457||AZE|AZE|B||||||20|1|1|172.26|319.00|||6|
7953|ML|42|577.578.458||AZE|AZE|M||||||20|1|1|172.26|319.00|||6|
7954|ML|42|577.578.459||AMA|AMA|B||||||20|1|1|172.26|319.00|||6|
7955|ML|42|577.578.460||AMA|AMA|M||||||20|1|1|172.26|319.00|||6|
7956|ML|42|577.578.461||AES|AES|B||||||20|1|1|172.26|319.00|||6|
7957|ML|42|577.578.462||AES|AES|M||||||20|1|1|172.26|319.00|||6|
7958|ML|42|577.578.463||PRA|PRA|B||||||20|1|1|172.26|319.00|||6|
7959|ML|42|577.578.464||PRA|PRA|M||||||20|1|1|172.26|319.00|||6|
7960|ML|42|577.578.465||ROS|ROS|B||||||20|1|1|172.26|319.00|||6|
7961|ML|42|577.578.466||ROS|ROS|M||||||20|1|1|172.26|319.00|||6|
7962|ML|42|577.578.467||VER|VER|B||||||20|1|1|172.26|319.00|||6|
7963|ML|42|577.578.468||VER|VER|M||||||20|1|1|172.26|319.00|||6|
7964|ML|42|577.578.469||AZB|AZB|||||||20|1|1|172.26|319.00|||6|
7965|ML|42|577.578.470||DEN|DEN|||||||20|1|1|172.26|319.00|||6|
7966|ML|42|577.578.471||BLK|BLK|||||||20|1|1|172.26|319.00|||6|
7967|ML|42|577.578.472||ART|ART|||||||20|1|1|172.26|319.00|||6|
7968|ML|42|577.578.473||LIN|LIN|||||||20|1|1|172.26|319.00|||6|
7969|ML|42|577.578.474||HAL|HAL|||||||20|1|1|172.26|319.00|||6|
7970|ML|43|579.580.394||TBR|TBR|||||||21|1|1|113.40|210.00|||6|
7971|ML|43|579.580.198||TEA|TEA|||||||21|1|1|113.40|210.00|||6|
7972|ML|43|579.580.199||OAK|OAK|||||||21|1|1|113.40|210.00|||6|
7973|ML|43|579.580.200||JOP|JOP|||||||21|1|1|113.40|210.00|||6|
7974|ML|43|579.580.395||TBR|BCO|B||||||21|1|1|156.60|290.00|||6|
7975|ML|43|579.580.396||TBR|BCO|M||||||21|1|1|156.60|290.00|||6|
7976|ML|43|579.580.397||TBR|CCL|B||||||21|1|1|156.60|290.00|||6|
7977|ML|43|579.580.398||TBR|CCL|M||||||21|1|1|156.60|290.00|||6|
7978|ML|43|579.580.399||TBR|CME|B||||||21|1|1|156.60|290.00|||6|
7979|ML|43|579.580.400||TBR|CME|M||||||21|1|1|156.60|290.00|||6|
7980|ML|43|579.580.401||TBR|ANT|B||||||21|1|1|156.60|290.00|||6|
7981|ML|43|579.580.402||TBR|ANT|M||||||21|1|1|156.60|290.00|||6|
7982|ML|43|579.580.403||TBR|PTO|B||||||21|1|1|156.60|290.00|||6|
7983|ML|43|579.580.404||TBR|PTO|M||||||21|1|1|156.60|290.00|||6|
7984|ML|43|579.580.405||TBR|CRE|B||||||21|1|1|156.60|290.00|||6|
7985|ML|43|579.580.406||TBR|CRE|M||||||21|1|1|156.60|290.00|||6|
7986|ML|43|579.580.407||TBR|CAM|B||||||21|1|1|156.60|290.00|||6|
7987|ML|43|579.580.408||TBR|CAM|M||||||21|1|1|156.60|290.00|||6|
7988|ML|43|579.580.409||TBR|OUR|B||||||21|1|1|156.60|290.00|||6|
7989|ML|43|579.580.410||TBR|OUR|M||||||21|1|1|156.60|290.00|||6|
7990|ML|43|579.580.411||TBR|COB|B||||||21|1|1|156.60|290.00|||6|
7991|ML|43|579.580.412||TBR|COB|M||||||21|1|1|156.60|290.00|||6|
7992|ML|43|579.580.413||TBR|CHO|B||||||21|1|1|156.60|290.00|||6|
7993|ML|43|579.580.414||TBR|CHO|M||||||21|1|1|156.60|290.00|||6|
7994|ML|43|579.580.415||TBR|VAG|B||||||21|1|1|156.60|290.00|||6|
7995|ML|43|579.580.416||TBR|VAG|M||||||21|1|1|156.60|290.00|||6|
7996|ML|43|579.580.417||TBR|AZE|B||||||21|1|1|156.60|290.00|||6|
7997|ML|43|579.580.418||TBR|AZE|M||||||21|1|1|156.60|290.00|||6|
7998|ML|43|579.580.419||TBR|AMA|B||||||21|1|1|156.60|290.00|||6|
7999|ML|43|579.580.420||TBR|AMA|M||||||21|1|1|156.60|290.00|||6|
8000|ML|43|579.580.421||TBR|AES|B||||||21|1|1|156.60|290.00|||6|
8001|ML|43|579.580.422||TBR|AES|M||||||21|1|1|156.60|290.00|||6|
8002|ML|43|579.580.423||TBR|PRA|B||||||21|1|1|156.60|290.00|||6|
8003|ML|43|579.580.424||TBR|PRA|M||||||21|1|1|156.60|290.00|||6|
8004|ML|43|579.580.425||TBR|ROS|B||||||21|1|1|156.60|290.00|||6|
8005|ML|43|579.580.426||TBR|ROS|M||||||21|1|1|156.60|290.00|||6|
8006|ML|43|579.580.427||TBR|VER|B||||||21|1|1|156.60|290.00|||6|
8007|ML|43|579.580.428||TBR|VER|M||||||21|1|1|156.60|290.00|||6|
8008|ML|43|579.580.429||TBR|AZB|||||||21|1|1|156.60|290.00|||6|
8009|ML|43|579.580.430||TBR|DEN|||||||21|1|1|156.60|290.00|||6|
8010|ML|43|579.580.431||TBR|BLK|||||||21|1|1|156.60|290.00|||6|
8011|ML|43|579.580.432||TBR|ART|||||||21|1|1|156.60|290.00|||6|
8012|ML|43|579.580.433||TBR|LIN|||||||21|1|1|156.60|290.00|||6|
8013|ML|43|579.580.434||TBR|HAL|||||||21|1|1|156.60|290.00|||6|
8014|ML|43|579.580.435||BCO|BCO|B||||||21|1|1|178.20|330.00|||6|
8015|ML|43|579.580.436||BCO|BCO|M||||||21|1|1|178.20|330.00|||6|
8016|ML|43|579.580.437||CCL|CCL|B||||||21|1|1|178.20|330.00|||6|
8017|ML|43|579.580.438||CCL|CCL|M||||||21|1|1|178.20|330.00|||6|
8018|ML|43|579.580.439||CME|CME|B||||||21|1|1|178.20|330.00|||6|
8019|ML|43|579.580.440||CME|CME|M||||||21|1|1|178.20|330.00|||6|
8020|ML|43|579.580.441||ANT|ANT|B||||||21|1|1|178.20|330.00|||6|
8021|ML|43|579.580.442||ANT|ANT|M||||||21|1|1|178.20|330.00|||6|
8022|ML|43|579.580.443||PTO|PTO|B||||||21|1|1|178.20|330.00|||6|
8023|ML|43|579.580.444||PTO|PTO|M||||||21|1|1|178.20|330.00|||6|
8024|ML|43|579.580.445||CRE|CRE|B||||||21|1|1|178.20|330.00|||6|
8025|ML|43|579.580.446||CRE|CRE|M||||||21|1|1|178.20|330.00|||6|
8026|ML|43|579.580.447||CAM|CAM|B||||||21|1|1|178.20|330.00|||6|
8027|ML|43|579.580.448||CAM|CAM|M||||||21|1|1|178.20|330.00|||6|
8028|ML|43|579.580.449||OUR|OUR|B||||||21|1|1|178.20|330.00|||6|
8029|ML|43|579.580.450||OUR|OUR|M||||||21|1|1|178.20|330.00|||6|
8030|ML|43|579.580.451||COB|COB|B||||||21|1|1|178.20|330.00|||6|
8031|ML|43|579.580.452||COB|COB|M||||||21|1|1|178.20|330.00|||6|
8032|ML|43|579.580.453||CHO|CHO|B||||||21|1|1|178.20|330.00|||6|
8033|ML|43|579.580.454||CHO|CHO|M||||||21|1|1|178.20|330.00|||6|
8034|ML|43|579.580.455||VAG|VAG|B||||||21|1|1|178.20|330.00|||6|
8035|ML|43|579.580.456||VAG|VAG|M||||||21|1|1|178.20|330.00|||6|
8036|ML|43|579.580.457||AZE|AZE|B||||||21|1|1|178.20|330.00|||6|
8037|ML|43|579.580.458||AZE|AZE|M||||||21|1|1|178.20|330.00|||6|
8038|ML|43|579.580.459||AMA|AMA|B||||||21|1|1|178.20|330.00|||6|
8039|ML|43|579.580.460||AMA|AMA|M||||||21|1|1|178.20|330.00|||6|
8040|ML|43|579.580.461||AES|AES|B||||||21|1|1|178.20|330.00|||6|
8041|ML|43|579.580.462||AES|AES|M||||||21|1|1|178.20|330.00|||6|
8042|ML|43|579.580.463||PRA|PRA|B||||||21|1|1|178.20|330.00|||6|
8043|ML|43|579.580.464||PRA|PRA|M||||||21|1|1|178.20|330.00|||6|
8044|ML|43|579.580.465||ROS|ROS|B||||||21|1|1|178.20|330.00|||6|
8045|ML|43|579.580.466||ROS|ROS|M||||||21|1|1|178.20|330.00|||6|
8046|ML|43|579.580.467||VER|VER|B||||||21|1|1|178.20|330.00|||6|
8047|ML|43|579.580.468||VER|VER|M||||||21|1|1|178.20|330.00|||6|
8048|ML|43|579.580.469||AZB|AZB|||||||21|1|1|178.20|330.00|||6|
8049|ML|43|579.580.470||DEN|DEN|||||||21|1|1|178.20|330.00|||6|
8050|ML|43|579.580.471||BLK|BLK|||||||21|1|1|178.20|330.00|||6|
8051|ML|43|579.580.472||ART|ART|||||||21|1|1|178.20|330.00|||6|
8052|ML|43|579.580.473||LIN|LIN|||||||21|1|1|178.20|330.00|||6|
8053|ML|43|579.580.474||HAL|HAL|||||||21|1|1|178.20|330.00|||6|
8054|ML|44|581.582.394||TBR|TBR|||||||22|1|1|81.00|150.00|||7|
8055|ML|44|581.582.198||TEA|TEA|||||||22|1|1|81.00|150.00|||7|
8056|ML|44|581.582.199||OAK|OAK|||||||22|1|1|81.00|150.00|||7|
8057|ML|44|581.582.200||JOP|JOP|||||||22|1|1|81.00|150.00|||7|
8058|ML|44|581.582.395||TBR|BCO|B||||||22|1|1|124.20|230.00|||7|
8059|ML|44|581.582.396||TBR|BCO|M||||||22|1|1|124.20|230.00|||7|
8060|ML|44|581.582.397||TBR|CCL|B||||||22|1|1|124.20|230.00|||7|
8061|ML|44|581.582.398||TBR|CCL|M||||||22|1|1|124.20|230.00|||7|
8062|ML|44|581.582.399||TBR|CME|B||||||22|1|1|124.20|230.00|||7|
8063|ML|44|581.582.400||TBR|CME|M||||||22|1|1|124.20|230.00|||7|
8064|ML|44|581.582.401||TBR|ANT|B||||||22|1|1|124.20|230.00|||7|
8065|ML|44|581.582.402||TBR|ANT|M||||||22|1|1|124.20|230.00|||7|
8066|ML|44|581.582.403||TBR|PTO|B||||||22|1|1|124.20|230.00|||7|
8067|ML|44|581.582.404||TBR|PTO|M||||||22|1|1|124.20|230.00|||7|
8068|ML|44|581.582.405||TBR|CRE|B||||||22|1|1|124.20|230.00|||7|
8069|ML|44|581.582.406||TBR|CRE|M||||||22|1|1|124.20|230.00|||7|
8070|ML|44|581.582.407||TBR|CAM|B||||||22|1|1|124.20|230.00|||7|
8071|ML|44|581.582.408||TBR|CAM|M||||||22|1|1|124.20|230.00|||7|
8072|ML|44|581.582.409||TBR|OUR|B||||||22|1|1|124.20|230.00|||7|
8073|ML|44|581.582.410||TBR|OUR|M||||||22|1|1|124.20|230.00|||7|
8074|ML|44|581.582.411||TBR|COB|B||||||22|1|1|124.20|230.00|||7|
8075|ML|44|581.582.412||TBR|COB|M||||||22|1|1|124.20|230.00|||7|
8076|ML|44|581.582.413||TBR|CHO|B||||||22|1|1|124.20|230.00|||7|
8077|ML|44|581.582.414||TBR|CHO|M||||||22|1|1|124.20|230.00|||7|
8078|ML|44|581.582.415||TBR|VAG|B||||||22|1|1|124.20|230.00|||7|
8079|ML|44|581.582.416||TBR|VAG|M||||||22|1|1|124.20|230.00|||7|
8080|ML|44|581.582.417||TBR|AZE|B||||||22|1|1|124.20|230.00|||7|
8081|ML|44|581.582.418||TBR|AZE|M||||||22|1|1|124.20|230.00|||7|
8082|ML|44|581.582.419||TBR|AMA|B||||||22|1|1|124.20|230.00|||7|
8083|ML|44|581.582.420||TBR|AMA|M||||||22|1|1|124.20|230.00|||7|
8084|ML|44|581.582.421||TBR|AES|B||||||22|1|1|124.20|230.00|||7|
8085|ML|44|581.582.422||TBR|AES|M||||||22|1|1|124.20|230.00|||7|
8086|ML|44|581.582.423||TBR|PRA|B||||||22|1|1|124.20|230.00|||7|
8087|ML|44|581.582.424||TBR|PRA|M||||||22|1|1|124.20|230.00|||7|
8088|ML|44|581.582.425||TBR|ROS|B||||||22|1|1|124.20|230.00|||7|
8089|ML|44|581.582.426||TBR|ROS|M||||||22|1|1|124.20|230.00|||7|
8090|ML|44|581.582.427||TBR|VER|B||||||22|1|1|124.20|230.00|||7|
8091|ML|44|581.582.428||TBR|VER|M||||||22|1|1|124.20|230.00|||7|
8092|ML|44|581.582.429||TBR|AZB|||||||22|1|1|124.20|230.00|||7|
8093|ML|44|581.582.430||TBR|DEN|||||||22|1|1|124.20|230.00|||7|
8094|ML|44|581.582.431||TBR|BLK|||||||22|1|1|124.20|230.00|||7|
8095|ML|44|581.582.432||TBR|ART|||||||22|1|1|124.20|230.00|||7|
8096|ML|44|581.582.433||TBR|LIN|||||||22|1|1|124.20|230.00|||7|
8097|ML|44|581.582.434||TBR|HAL|||||||22|1|1|124.20|230.00|||7|
8098|ML|44|581.582.435||BCO|BCO|B||||||22|1|1|145.80|270.00|||7|
8099|ML|44|581.582.436||BCO|BCO|M||||||22|1|1|145.80|270.00|||7|
8100|ML|44|581.582.437||CCL|CCL|B||||||22|1|1|145.80|270.00|||7|
8101|ML|44|581.582.438||CCL|CCL|M||||||22|1|1|145.80|270.00|||7|
8102|ML|44|581.582.439||CME|CME|B||||||22|1|1|145.80|270.00|||7|
8103|ML|44|581.582.440||CME|CME|M||||||22|1|1|145.80|270.00|||7|
8104|ML|44|581.582.441||ANT|ANT|B||||||22|1|1|145.80|270.00|||7|
8105|ML|44|581.582.442||ANT|ANT|M||||||22|1|1|145.80|270.00|||7|
8106|ML|44|581.582.443||PTO|PTO|B||||||22|1|1|145.80|270.00|||7|
8107|ML|44|581.582.444||PTO|PTO|M||||||22|1|1|145.80|270.00|||7|
8108|ML|44|581.582.445||CRE|CRE|B||||||22|1|1|145.80|270.00|||7|
8109|ML|44|581.582.446||CRE|CRE|M||||||22|1|1|145.80|270.00|||7|
8110|ML|44|581.582.447||CAM|CAM|B||||||22|1|1|145.80|270.00|||7|
8111|ML|44|581.582.448||CAM|CAM|M||||||22|1|1|145.80|270.00|||7|
8112|ML|44|581.582.449||OUR|OUR|B||||||22|1|1|145.80|270.00|||7|
8113|ML|44|581.582.450||OUR|OUR|M||||||22|1|1|145.80|270.00|||7|
8114|ML|44|581.582.451||COB|COB|B||||||22|1|1|145.80|270.00|||7|
8115|ML|44|581.582.452||COB|COB|M||||||22|1|1|145.80|270.00|||7|
8116|ML|44|581.582.453||CHO|CHO|B||||||22|1|1|145.80|270.00|||7|
8117|ML|44|581.582.454||CHO|CHO|M||||||22|1|1|145.80|270.00|||7|
8118|ML|44|581.582.455||VAG|VAG|B||||||22|1|1|145.80|270.00|||7|
8119|ML|44|581.582.456||VAG|VAG|M||||||22|1|1|145.80|270.00|||7|
8120|ML|44|581.582.457||AZE|AZE|B||||||22|1|1|145.80|270.00|||7|
8121|ML|44|581.582.458||AZE|AZE|M||||||22|1|1|145.80|270.00|||7|
8122|ML|44|581.582.459||AMA|AMA|B||||||22|1|1|145.80|270.00|||7|
8123|ML|44|581.582.460||AMA|AMA|M||||||22|1|1|145.80|270.00|||7|
8124|ML|44|581.582.461||AES|AES|B||||||22|1|1|145.80|270.00|||7|
8125|ML|44|581.582.462||AES|AES|M||||||22|1|1|145.80|270.00|||7|
8126|ML|44|581.582.463||PRA|PRA|B||||||22|1|1|145.80|270.00|||7|
8127|ML|44|581.582.464||PRA|PRA|M||||||22|1|1|145.80|270.00|||7|
8128|ML|44|581.582.465||ROS|ROS|B||||||22|1|1|145.80|270.00|||7|
8129|ML|44|581.582.466||ROS|ROS|M||||||22|1|1|145.80|270.00|||7|
8130|ML|44|581.582.467||VER|VER|B||||||22|1|1|145.80|270.00|||7|
8131|ML|44|581.582.468||VER|VER|M||||||22|1|1|145.80|270.00|||7|
8132|ML|44|581.582.469||AZB|AZB|||||||22|1|1|145.80|270.00|||7|
8133|ML|44|581.582.470||DEN|DEN|||||||22|1|1|145.80|270.00|||7|
8134|ML|44|581.582.471||BLK|BLK|||||||22|1|1|145.80|270.00|||7|
8135|ML|44|581.582.472||ART|ART|||||||22|1|1|145.80|270.00|||7|
8136|ML|44|581.582.473||LIN|LIN|||||||22|1|1|145.80|270.00|||7|
8137|ML|44|581.582.474||HAL|HAL|||||||22|1|1|145.80|270.00|||7|
8138|ML|45|581.582.475||TBR|TBR|||||||22|1|1|81.00|150.00|||7|
8139|ML|45|581.582.242||TEA|TEA|||||||22|1|1|81.00|150.00|||7|
8140|ML|45|581.582.243||OAK|OAK|||||||22|1|1|81.00|150.00|||7|
8141|ML|45|581.582.244||JOP|JOP|||||||22|1|1|81.00|150.00|||7|
8142|ML|45|581.582.476||TBR|BCO|B||||||22|1|1|124.20|230.00|||7|
8143|ML|45|581.582.477||TBR|BCO|M||||||22|1|1|124.20|230.00|||7|
8144|ML|45|581.582.478||TBR|CCL|B||||||22|1|1|124.20|230.00|||7|
8145|ML|45|581.582.479||TBR|CCL|M||||||22|1|1|124.20|230.00|||7|
8146|ML|45|581.582.480||TBR|CME|B||||||22|1|1|124.20|230.00|||7|
8147|ML|45|581.582.481||TBR|CME|M||||||22|1|1|124.20|230.00|||7|
8148|ML|45|581.582.482||TBR|ANT|B||||||22|1|1|124.20|230.00|||7|
8149|ML|45|581.582.483||TBR|ANT|M||||||22|1|1|124.20|230.00|||7|
8150|ML|45|581.582.484||TBR|PTO|B||||||22|1|1|124.20|230.00|||7|
8151|ML|45|581.582.485||TBR|PTO|M||||||22|1|1|124.20|230.00|||7|
8152|ML|45|581.582.486||TBR|CRE|B||||||22|1|1|124.20|230.00|||7|
8153|ML|45|581.582.487||TBR|CRE|M||||||22|1|1|124.20|230.00|||7|
8154|ML|45|581.582.488||TBR|CAM|B||||||22|1|1|124.20|230.00|||7|
8155|ML|45|581.582.489||TBR|CAM|M||||||22|1|1|124.20|230.00|||7|
8156|ML|45|581.582.490||TBR|OUR|B||||||22|1|1|124.20|230.00|||7|
8157|ML|45|581.582.491||TBR|OUR|M||||||22|1|1|124.20|230.00|||7|
8158|ML|45|581.582.492||TBR|COB|B||||||22|1|1|124.20|230.00|||7|
8159|ML|45|581.582.493||TBR|COB|M||||||22|1|1|124.20|230.00|||7|
8160|ML|45|581.582.494||TBR|CHO|B||||||22|1|1|124.20|230.00|||7|
8161|ML|45|581.582.495||TBR|CHO|M||||||22|1|1|124.20|230.00|||7|
8162|ML|45|581.582.496||TBR|VAG|B||||||22|1|1|124.20|230.00|||7|
8163|ML|45|581.582.497||TBR|VAG|M||||||22|1|1|124.20|230.00|||7|
8164|ML|45|581.582.498||TBR|AZE|B||||||22|1|1|124.20|230.00|||7|
8165|ML|45|581.582.499||TBR|AZE|M||||||22|1|1|124.20|230.00|||7|
8166|ML|45|581.582.500||TBR|AMA|B||||||22|1|1|124.20|230.00|||7|
8167|ML|45|581.582.501||TBR|AMA|M||||||22|1|1|124.20|230.00|||7|
8168|ML|45|581.582.502||TBR|AES|B||||||22|1|1|124.20|230.00|||7|
8169|ML|45|581.582.503||TBR|AES|M||||||22|1|1|124.20|230.00|||7|
8170|ML|45|581.582.504||TBR|PRA|B||||||22|1|1|124.20|230.00|||7|
8171|ML|45|581.582.505||TBR|PRA|M||||||22|1|1|124.20|230.00|||7|
8172|ML|45|581.582.506||TBR|ROS|B||||||22|1|1|124.20|230.00|||7|
8173|ML|45|581.582.507||TBR|ROS|M||||||22|1|1|124.20|230.00|||7|
8174|ML|45|581.582.508||TBR|VER|B||||||22|1|1|124.20|230.00|||7|
8175|ML|45|581.582.509||TBR|VER|M||||||22|1|1|124.20|230.00|||7|
8176|ML|45|581.582.510||TBR|AZB|||||||22|1|1|124.20|230.00|||7|
8177|ML|45|581.582.511||TBR|DEN|||||||22|1|1|124.20|230.00|||7|
8178|ML|45|581.582.512||TBR|BLK|||||||22|1|1|124.20|230.00|||7|
8179|ML|45|581.582.513||TBR|ART|||||||22|1|1|124.20|230.00|||7|
8180|ML|45|581.582.514||TBR|LIN|||||||22|1|1|124.20|230.00|||7|
8181|ML|45|581.582.515||TBR|HAL|||||||22|1|1|124.20|230.00|||7|
8182|ML|45|581.582.516||BCO|BCO|B||||||22|1|1|145.80|270.00|||7|
8183|ML|45|581.582.517||BCO|BCO|M||||||22|1|1|145.80|270.00|||7|
8184|ML|45|581.582.518||CCL|CCL|B||||||22|1|1|145.80|270.00|||7|
8185|ML|45|581.582.519||CCL|CCL|M||||||22|1|1|145.80|270.00|||7|
8186|ML|45|581.582.520||CME|CME|B||||||22|1|1|145.80|270.00|||7|
8187|ML|45|581.582.521||CME|CME|M||||||22|1|1|145.80|270.00|||7|
8188|ML|45|581.582.522||ANT|ANT|B||||||22|1|1|145.80|270.00|||7|
8189|ML|45|581.582.523||ANT|ANT|M||||||22|1|1|145.80|270.00|||7|
8190|ML|45|581.582.524||PTO|PTO|B||||||22|1|1|145.80|270.00|||7|
8191|ML|45|581.582.525||PTO|PTO|M||||||22|1|1|145.80|270.00|||7|
8192|ML|45|581.582.526||CRE|CRE|B||||||22|1|1|145.80|270.00|||7|
8193|ML|45|581.582.527||CRE|CRE|M||||||22|1|1|145.80|270.00|||7|
8194|ML|45|581.582.528||CAM|CAM|B||||||22|1|1|145.80|270.00|||7|
8195|ML|45|581.582.529||CAM|CAM|M||||||22|1|1|145.80|270.00|||7|
8196|ML|45|581.582.530||OUR|OUR|B||||||22|1|1|145.80|270.00|||7|
8197|ML|45|581.582.531||OUR|OUR|M||||||22|1|1|145.80|270.00|||7|
8198|ML|45|581.582.532||COB|COB|B||||||22|1|1|145.80|270.00|||7|
8199|ML|45|581.582.533||COB|COB|M||||||22|1|1|145.80|270.00|||7|
8200|ML|45|581.582.534||CHO|CHO|B||||||22|1|1|145.80|270.00|||7|
8201|ML|45|581.582.535||CHO|CHO|M||||||22|1|1|145.80|270.00|||7|
8202|ML|45|581.582.536||VAG|VAG|B||||||22|1|1|145.80|270.00|||7|
8203|ML|45|581.582.537||VAG|VAG|M||||||22|1|1|145.80|270.00|||7|
8204|ML|45|581.582.538||AZE|AZE|B||||||22|1|1|145.80|270.00|||7|
8205|ML|45|581.582.539||AZE|AZE|M||||||22|1|1|145.80|270.00|||7|
8206|ML|45|581.582.540||AMA|AMA|B||||||22|1|1|145.80|270.00|||7|
8207|ML|45|581.582.541||AMA|AMA|M||||||22|1|1|145.80|270.00|||7|
8208|ML|45|581.582.542||AES|AES|B||||||22|1|1|145.80|270.00|||7|
8209|ML|45|581.582.543||AES|AES|M||||||22|1|1|145.80|270.00|||7|
8210|ML|45|581.582.544||PRA|PRA|B||||||22|1|1|145.80|270.00|||7|
8211|ML|45|581.582.545||PRA|PRA|M||||||22|1|1|145.80|270.00|||7|
8212|ML|45|581.582.546||ROS|ROS|B||||||22|1|1|145.80|270.00|||7|
8213|ML|45|581.582.547||ROS|ROS|M||||||22|1|1|145.80|270.00|||7|
8214|ML|45|581.582.548||VER|VER|B||||||22|1|1|145.80|270.00|||7|
8215|ML|45|581.582.549||VER|VER|M||||||22|1|1|145.80|270.00|||7|
8216|ML|45|581.582.550||AZB|AZB|||||||22|1|1|145.80|270.00|||7|
8217|ML|45|581.582.551||DEN|DEN|||||||22|1|1|145.80|270.00|||7|
8218|ML|45|581.582.552||BLK|BLK|||||||22|1|1|145.80|270.00|||7|
8219|ML|45|581.582.553||ART|ART|||||||22|1|1|145.80|270.00|||7|
8220|ML|45|581.582.554||LIN|LIN|||||||22|1|1|145.80|270.00|||7|
8221|ML|45|581.582.555||HAL|HAL|||||||22|1|1|145.80|270.00|||7|
8222|ML|44|583.582.394||TBR|TBR|||||||4|1|1|83.70|155.00|||7|
8223|ML|44|583.582.198||TEA|TEA|||||||4|1|1|83.70|155.00|||7|
8224|ML|44|583.582.199||OAK|OAK|||||||4|1|1|83.70|155.00|||7|
8225|ML|44|583.582.200||JOP|JOP|||||||4|1|1|83.70|155.00|||7|
8226|ML|44|583.582.395||TBR|BCO|B||||||4|1|1|126.90|235.00|||7|
8227|ML|44|583.582.396||TBR|BCO|M||||||4|1|1|126.90|235.00|||7|
8228|ML|44|583.582.397||TBR|CCL|B||||||4|1|1|126.90|235.00|||7|
8229|ML|44|583.582.398||TBR|CCL|M||||||4|1|1|126.90|235.00|||7|
8230|ML|44|583.582.399||TBR|CME|B||||||4|1|1|126.90|235.00|||7|
8231|ML|44|583.582.400||TBR|CME|M||||||4|1|1|126.90|235.00|||7|
8232|ML|44|583.582.401||TBR|ANT|B||||||4|1|1|126.90|235.00|||7|
8233|ML|44|583.582.402||TBR|ANT|M||||||4|1|1|126.90|235.00|||7|
8234|ML|44|583.582.403||TBR|PTO|B||||||4|1|1|126.90|235.00|||7|
8235|ML|44|583.582.404||TBR|PTO|M||||||4|1|1|126.90|235.00|||7|
8236|ML|44|583.582.405||TBR|CRE|B||||||4|1|1|126.90|235.00|||7|
8237|ML|44|583.582.406||TBR|CRE|M||||||4|1|1|126.90|235.00|||7|
8238|ML|44|583.582.407||TBR|CAM|B||||||4|1|1|126.90|235.00|||7|
8239|ML|44|583.582.408||TBR|CAM|M||||||4|1|1|126.90|235.00|||7|
8240|ML|44|583.582.409||TBR|OUR|B||||||4|1|1|126.90|235.00|||7|
8241|ML|44|583.582.410||TBR|OUR|M||||||4|1|1|126.90|235.00|||7|
8242|ML|44|583.582.411||TBR|COB|B||||||4|1|1|126.90|235.00|||7|
8243|ML|44|583.582.412||TBR|COB|M||||||4|1|1|126.90|235.00|||7|
8244|ML|44|583.582.413||TBR|CHO|B||||||4|1|1|126.90|235.00|||7|
8245|ML|44|583.582.414||TBR|CHO|M||||||4|1|1|126.90|235.00|||7|
8246|ML|44|583.582.415||TBR|VAG|B||||||4|1|1|126.90|235.00|||7|
8247|ML|44|583.582.416||TBR|VAG|M||||||4|1|1|126.90|235.00|||7|
8248|ML|44|583.582.417||TBR|AZE|B||||||4|1|1|126.90|235.00|||7|
8249|ML|44|583.582.418||TBR|AZE|M||||||4|1|1|126.90|235.00|||7|
8250|ML|44|583.582.419||TBR|AMA|B||||||4|1|1|126.90|235.00|||7|
8251|ML|44|583.582.420||TBR|AMA|M||||||4|1|1|126.90|235.00|||7|
8252|ML|44|583.582.421||TBR|AES|B||||||4|1|1|126.90|235.00|||7|
8253|ML|44|583.582.422||TBR|AES|M||||||4|1|1|126.90|235.00|||7|
8254|ML|44|583.582.423||TBR|PRA|B||||||4|1|1|126.90|235.00|||7|
8255|ML|44|583.582.424||TBR|PRA|M||||||4|1|1|126.90|235.00|||7|
8256|ML|44|583.582.425||TBR|ROS|B||||||4|1|1|126.90|235.00|||7|
8257|ML|44|583.582.426||TBR|ROS|M||||||4|1|1|126.90|235.00|||7|
8258|ML|44|583.582.427||TBR|VER|B||||||4|1|1|126.90|235.00|||7|
8259|ML|44|583.582.428||TBR|VER|M||||||4|1|1|126.90|235.00|||7|
8260|ML|44|583.582.429||TBR|AZB|||||||4|1|1|126.90|235.00|||7|
8261|ML|44|583.582.430||TBR|DEN|||||||4|1|1|126.90|235.00|||7|
8262|ML|44|583.582.431||TBR|BLK|||||||4|1|1|126.90|235.00|||7|
8263|ML|44|583.582.432||TBR|ART|||||||4|1|1|126.90|235.00|||7|
8264|ML|44|583.582.433||TBR|LIN|||||||4|1|1|126.90|235.00|||7|
8265|ML|44|583.582.434||TBR|HAL|||||||4|1|1|126.90|235.00|||7|
8266|ML|44|583.582.435||BCO|BCO|B||||||4|1|1|148.50|275.00|||7|
8267|ML|44|583.582.436||BCO|BCO|M||||||4|1|1|148.50|275.00|||7|
8268|ML|44|583.582.437||CCL|CCL|B||||||4|1|1|148.50|275.00|||7|
8269|ML|44|583.582.438||CCL|CCL|M||||||4|1|1|148.50|275.00|||7|
8270|ML|44|583.582.439||CME|CME|B||||||4|1|1|148.50|275.00|||7|
8271|ML|44|583.582.440||CME|CME|M||||||4|1|1|148.50|275.00|||7|
8272|ML|44|583.582.441||ANT|ANT|B||||||4|1|1|148.50|275.00|||7|
8273|ML|44|583.582.442||ANT|ANT|M||||||4|1|1|148.50|275.00|||7|
8274|ML|44|583.582.443||PTO|PTO|B||||||4|1|1|148.50|275.00|||7|
8275|ML|44|583.582.444||PTO|PTO|M||||||4|1|1|148.50|275.00|||7|
8276|ML|44|583.582.445||CRE|CRE|B||||||4|1|1|148.50|275.00|||7|
8277|ML|44|583.582.446||CRE|CRE|M||||||4|1|1|148.50|275.00|||7|
8278|ML|44|583.582.447||CAM|CAM|B||||||4|1|1|148.50|275.00|||7|
8279|ML|44|583.582.448||CAM|CAM|M||||||4|1|1|148.50|275.00|||7|
8280|ML|44|583.582.449||OUR|OUR|B||||||4|1|1|148.50|275.00|||7|
8281|ML|44|583.582.450||OUR|OUR|M||||||4|1|1|148.50|275.00|||7|
8282|ML|44|583.582.451||COB|COB|B||||||4|1|1|148.50|275.00|||7|
8283|ML|44|583.582.452||COB|COB|M||||||4|1|1|148.50|275.00|||7|
8284|ML|44|583.582.453||CHO|CHO|B||||||4|1|1|148.50|275.00|||7|
8285|ML|44|583.582.454||CHO|CHO|M||||||4|1|1|148.50|275.00|||7|
8286|ML|44|583.582.455||VAG|VAG|B||||||4|1|1|148.50|275.00|||7|
8287|ML|44|583.582.456||VAG|VAG|M||||||4|1|1|148.50|275.00|||7|
8288|ML|44|583.582.457||AZE|AZE|B||||||4|1|1|148.50|275.00|||7|
8289|ML|44|583.582.458||AZE|AZE|M||||||4|1|1|148.50|275.00|||7|
8290|ML|44|583.582.459||AMA|AMA|B||||||4|1|1|148.50|275.00|||7|
8291|ML|44|583.582.460||AMA|AMA|M||||||4|1|1|148.50|275.00|||7|
8292|ML|44|583.582.461||AES|AES|B||||||4|1|1|148.50|275.00|||7|
8293|ML|44|583.582.462||AES|AES|M||||||4|1|1|148.50|275.00|||7|
8294|ML|44|583.582.463||PRA|PRA|B||||||4|1|1|148.50|275.00|||7|
8295|ML|44|583.582.464||PRA|PRA|M||||||4|1|1|148.50|275.00|||7|
8296|ML|44|583.582.465||ROS|ROS|B||||||4|1|1|148.50|275.00|||7|
8297|ML|44|583.582.466||ROS|ROS|M||||||4|1|1|148.50|275.00|||7|
8298|ML|44|583.582.467||VER|VER|B||||||4|1|1|148.50|275.00|||7|
8299|ML|44|583.582.468||VER|VER|M||||||4|1|1|148.50|275.00|||7|
8300|ML|44|583.582.469||AZB|AZB|||||||4|1|1|148.50|275.00|||7|
8301|ML|44|583.582.470||DEN|DEN|||||||4|1|1|148.50|275.00|||7|
8302|ML|44|583.582.471||BLK|BLK|||||||4|1|1|148.50|275.00|||7|
8303|ML|44|583.582.472||ART|ART|||||||4|1|1|148.50|275.00|||7|
8304|ML|44|583.582.473||LIN|LIN|||||||4|1|1|148.50|275.00|||7|
8305|ML|44|583.582.474||HAL|HAL|||||||4|1|1|148.50|275.00|||7|
8306|ML|45|583.582.475||TBR|TBR|||||||4|1|1|83.70|155.00|||7|
8307|ML|45|583.582.242||TEA|TEA|||||||4|1|1|83.70|155.00|||7|
8308|ML|45|583.582.243||OAK|OAK|||||||4|1|1|83.70|155.00|||7|
8309|ML|45|583.582.244||JOP|JOP|||||||4|1|1|83.70|155.00|||7|
8310|ML|45|583.582.476||TBR|BCO|B||||||4|1|1|126.90|235.00|||7|
8311|ML|45|583.582.477||TBR|BCO|M||||||4|1|1|126.90|235.00|||7|
8312|ML|45|583.582.478||TBR|CCL|B||||||4|1|1|126.90|235.00|||7|
8313|ML|45|583.582.479||TBR|CCL|M||||||4|1|1|126.90|235.00|||7|
8314|ML|45|583.582.480||TBR|CME|B||||||4|1|1|126.90|235.00|||7|
8315|ML|45|583.582.481||TBR|CME|M||||||4|1|1|126.90|235.00|||7|
8316|ML|45|583.582.482||TBR|ANT|B||||||4|1|1|126.90|235.00|||7|
8317|ML|45|583.582.483||TBR|ANT|M||||||4|1|1|126.90|235.00|||7|
8318|ML|45|583.582.484||TBR|PTO|B||||||4|1|1|126.90|235.00|||7|
8319|ML|45|583.582.485||TBR|PTO|M||||||4|1|1|126.90|235.00|||7|
8320|ML|45|583.582.486||TBR|CRE|B||||||4|1|1|126.90|235.00|||7|
8321|ML|45|583.582.487||TBR|CRE|M||||||4|1|1|126.90|235.00|||7|
8322|ML|45|583.582.488||TBR|CAM|B||||||4|1|1|126.90|235.00|||7|
8323|ML|45|583.582.489||TBR|CAM|M||||||4|1|1|126.90|235.00|||7|
8324|ML|45|583.582.490||TBR|OUR|B||||||4|1|1|126.90|235.00|||7|
8325|ML|45|583.582.491||TBR|OUR|M||||||4|1|1|126.90|235.00|||7|
8326|ML|45|583.582.492||TBR|COB|B||||||4|1|1|126.90|235.00|||7|
8327|ML|45|583.582.493||TBR|COB|M||||||4|1|1|126.90|235.00|||7|
8328|ML|45|583.582.494||TBR|CHO|B||||||4|1|1|126.90|235.00|||7|
8329|ML|45|583.582.495||TBR|CHO|M||||||4|1|1|126.90|235.00|||7|
8330|ML|45|583.582.496||TBR|VAG|B||||||4|1|1|126.90|235.00|||7|
8331|ML|45|583.582.497||TBR|VAG|M||||||4|1|1|126.90|235.00|||7|
8332|ML|45|583.582.498||TBR|AZE|B||||||4|1|1|126.90|235.00|||7|
8333|ML|45|583.582.499||TBR|AZE|M||||||4|1|1|126.90|235.00|||7|
8334|ML|45|583.582.500||TBR|AMA|B||||||4|1|1|126.90|235.00|||7|
8335|ML|45|583.582.501||TBR|AMA|M||||||4|1|1|126.90|235.00|||7|
8336|ML|45|583.582.502||TBR|AES|B||||||4|1|1|126.90|235.00|||7|
8337|ML|45|583.582.503||TBR|AES|M||||||4|1|1|126.90|235.00|||7|
8338|ML|45|583.582.504||TBR|PRA|B||||||4|1|1|126.90|235.00|||7|
8339|ML|45|583.582.505||TBR|PRA|M||||||4|1|1|126.90|235.00|||7|
8340|ML|45|583.582.506||TBR|ROS|B||||||4|1|1|126.90|235.00|||7|
8341|ML|45|583.582.507||TBR|ROS|M||||||4|1|1|126.90|235.00|||7|
8342|ML|45|583.582.508||TBR|VER|B||||||4|1|1|126.90|235.00|||7|
8343|ML|45|583.582.509||TBR|VER|M||||||4|1|1|126.90|235.00|||7|
8344|ML|45|583.582.510||TBR|AZB|||||||4|1|1|126.90|235.00|||7|
8345|ML|45|583.582.511||TBR|DEN|||||||4|1|1|126.90|235.00|||7|
8346|ML|45|583.582.512||TBR|BLK|||||||4|1|1|126.90|235.00|||7|
8347|ML|45|583.582.513||TBR|ART|||||||4|1|1|126.90|235.00|||7|
8348|ML|45|583.582.514||TBR|LIN|||||||4|1|1|126.90|235.00|||7|
8349|ML|45|583.582.515||TBR|HAL|||||||4|1|1|126.90|235.00|||7|
8350|ML|45|583.582.516||BCO|BCO|B||||||4|1|1|148.50|275.00|||7|
8351|ML|45|583.582.517||BCO|BCO|M||||||4|1|1|148.50|275.00|||7|
8352|ML|45|583.582.518||CCL|CCL|B||||||4|1|1|148.50|275.00|||7|
8353|ML|45|583.582.519||CCL|CCL|M||||||4|1|1|148.50|275.00|||7|
8354|ML|45|583.582.520||CME|CME|B||||||4|1|1|148.50|275.00|||7|
8355|ML|45|583.582.521||CME|CME|M||||||4|1|1|148.50|275.00|||7|
8356|ML|45|583.582.522||ANT|ANT|B||||||4|1|1|148.50|275.00|||7|
8357|ML|45|583.582.523||ANT|ANT|M||||||4|1|1|148.50|275.00|||7|
8358|ML|45|583.582.524||PTO|PTO|B||||||4|1|1|148.50|275.00|||7|
8359|ML|45|583.582.525||PTO|PTO|M||||||4|1|1|148.50|275.00|||7|
8360|ML|45|583.582.526||CRE|CRE|B||||||4|1|1|148.50|275.00|||7|
8361|ML|45|583.582.527||CRE|CRE|M||||||4|1|1|148.50|275.00|||7|
8362|ML|45|583.582.528||CAM|CAM|B||||||4|1|1|148.50|275.00|||7|
8363|ML|45|583.582.529||CAM|CAM|M||||||4|1|1|148.50|275.00|||7|
8364|ML|45|583.582.530||OUR|OUR|B||||||4|1|1|148.50|275.00|||7|
8365|ML|45|583.582.531||OUR|OUR|M||||||4|1|1|148.50|275.00|||7|
8366|ML|45|583.582.532||COB|COB|B||||||4|1|1|148.50|275.00|||7|
8367|ML|45|583.582.533||COB|COB|M||||||4|1|1|148.50|275.00|||7|
8368|ML|45|583.582.534||CHO|CHO|B||||||4|1|1|148.50|275.00|||7|
8369|ML|45|583.582.535||CHO|CHO|M||||||4|1|1|148.50|275.00|||7|
8370|ML|45|583.582.536||VAG|VAG|B||||||4|1|1|148.50|275.00|||7|
8371|ML|45|583.582.537||VAG|VAG|M||||||4|1|1|148.50|275.00|||7|
8372|ML|45|583.582.538||AZE|AZE|B||||||4|1|1|148.50|275.00|||7|
8373|ML|45|583.582.539||AZE|AZE|M||||||4|1|1|148.50|275.00|||7|
8374|ML|45|583.582.540||AMA|AMA|B||||||4|1|1|148.50|275.00|||7|
8375|ML|45|583.582.541||AMA|AMA|M||||||4|1|1|148.50|275.00|||7|
8376|ML|45|583.582.542||AES|AES|B||||||4|1|1|148.50|275.00|||7|
8377|ML|45|583.582.543||AES|AES|M||||||4|1|1|148.50|275.00|||7|
8378|ML|45|583.582.544||PRA|PRA|B||||||4|1|1|148.50|275.00|||7|
8379|ML|45|583.582.545||PRA|PRA|M||||||4|1|1|148.50|275.00|||7|
8380|ML|45|583.582.546||ROS|ROS|B||||||4|1|1|148.50|275.00|||7|
8381|ML|45|583.582.547||ROS|ROS|M||||||4|1|1|148.50|275.00|||7|
8382|ML|45|583.582.548||VER|VER|B||||||4|1|1|148.50|275.00|||7|
8383|ML|45|583.582.549||VER|VER|M||||||4|1|1|148.50|275.00|||7|
8384|ML|45|583.582.550||AZB|AZB|||||||4|1|1|148.50|275.00|||7|
8385|ML|45|583.582.551||DEN|DEN|||||||4|1|1|148.50|275.00|||7|
8386|ML|45|583.582.552||BLK|BLK|||||||4|1|1|148.50|275.00|||7|
8387|ML|45|583.582.553||ART|ART|||||||4|1|1|148.50|275.00|||7|
8388|ML|45|583.582.554||LIN|LIN|||||||4|1|1|148.50|275.00|||7|
8389|ML|45|583.582.555||HAL|HAL|||||||4|1|1|148.50|275.00|||7|
8390|ML|44|584.582.394||TBR|TBR|||||||1|1|1|93.42|173.00|||7|
8391|ML|44|584.582.198||TEA|TEA|||||||1|1|1|93.42|173.00|||7|
8392|ML|44|584.582.199||OAK|OAK|||||||1|1|1|93.42|173.00|||7|
8393|ML|44|584.582.200||JOP|JOP|||||||1|1|1|93.42|173.00|||7|
8394|ML|44|584.582.395||TBR|BCO|B||||||1|1|1|136.62|253.00|||7|
8395|ML|44|584.582.396||TBR|BCO|M||||||1|1|1|136.62|253.00|||7|
8396|ML|44|584.582.397||TBR|CCL|B||||||1|1|1|136.62|253.00|||7|
8397|ML|44|584.582.398||TBR|CCL|M||||||1|1|1|136.62|253.00|||7|
8398|ML|44|584.582.399||TBR|CME|B||||||1|1|1|136.62|253.00|||7|
8399|ML|44|584.582.400||TBR|CME|M||||||1|1|1|136.62|253.00|||7|
8400|ML|44|584.582.401||TBR|ANT|B||||||1|1|1|136.62|253.00|||7|
8401|ML|44|584.582.402||TBR|ANT|M||||||1|1|1|136.62|253.00|||7|
8402|ML|44|584.582.403||TBR|PTO|B||||||1|1|1|136.62|253.00|||7|
8403|ML|44|584.582.404||TBR|PTO|M||||||1|1|1|136.62|253.00|||7|
8404|ML|44|584.582.405||TBR|CRE|B||||||1|1|1|136.62|253.00|||7|
8405|ML|44|584.582.406||TBR|CRE|M||||||1|1|1|136.62|253.00|||7|
8406|ML|44|584.582.407||TBR|CAM|B||||||1|1|1|136.62|253.00|||7|
8407|ML|44|584.582.408||TBR|CAM|M||||||1|1|1|136.62|253.00|||7|
8408|ML|44|584.582.409||TBR|OUR|B||||||1|1|1|136.62|253.00|||7|
8409|ML|44|584.582.410||TBR|OUR|M||||||1|1|1|136.62|253.00|||7|
8410|ML|44|584.582.411||TBR|COB|B||||||1|1|1|136.62|253.00|||7|
8411|ML|44|584.582.412||TBR|COB|M||||||1|1|1|136.62|253.00|||7|
8412|ML|44|584.582.413||TBR|CHO|B||||||1|1|1|136.62|253.00|||7|
8413|ML|44|584.582.414||TBR|CHO|M||||||1|1|1|136.62|253.00|||7|
8414|ML|44|584.582.415||TBR|VAG|B||||||1|1|1|136.62|253.00|||7|
8415|ML|44|584.582.416||TBR|VAG|M||||||1|1|1|136.62|253.00|||7|
8416|ML|44|584.582.417||TBR|AZE|B||||||1|1|1|136.62|253.00|||7|
8417|ML|44|584.582.418||TBR|AZE|M||||||1|1|1|136.62|253.00|||7|
8418|ML|44|584.582.419||TBR|AMA|B||||||1|1|1|136.62|253.00|||7|
8419|ML|44|584.582.420||TBR|AMA|M||||||1|1|1|136.62|253.00|||7|
8420|ML|44|584.582.421||TBR|AES|B||||||1|1|1|136.62|253.00|||7|
8421|ML|44|584.582.422||TBR|AES|M||||||1|1|1|136.62|253.00|||7|
8422|ML|44|584.582.423||TBR|PRA|B||||||1|1|1|136.62|253.00|||7|
8423|ML|44|584.582.424||TBR|PRA|M||||||1|1|1|136.62|253.00|||7|
8424|ML|44|584.582.425||TBR|ROS|B||||||1|1|1|136.62|253.00|||7|
8425|ML|44|584.582.426||TBR|ROS|M||||||1|1|1|136.62|253.00|||7|
8426|ML|44|584.582.427||TBR|VER|B||||||1|1|1|136.62|253.00|||7|
8427|ML|44|584.582.428||TBR|VER|M||||||1|1|1|136.62|253.00|||7|
8428|ML|44|584.582.429||TBR|AZB|||||||1|1|1|136.62|253.00|||7|
8429|ML|44|584.582.430||TBR|DEN|||||||1|1|1|136.62|253.00|||7|
8430|ML|44|584.582.431||TBR|BLK|||||||1|1|1|136.62|253.00|||7|
8431|ML|44|584.582.432||TBR|ART|||||||1|1|1|136.62|253.00|||7|
8432|ML|44|584.582.433||TBR|LIN|||||||1|1|1|136.62|253.00|||7|
8433|ML|44|584.582.434||TBR|HAL|||||||1|1|1|136.62|253.00|||7|
8434|ML|44|584.582.435||BCO|BCO|B||||||1|1|1|158.22|293.00|||7|
8435|ML|44|584.582.436||BCO|BCO|M||||||1|1|1|158.22|293.00|||7|
8436|ML|44|584.582.437||CCL|CCL|B||||||1|1|1|158.22|293.00|||7|
8437|ML|44|584.582.438||CCL|CCL|M||||||1|1|1|158.22|293.00|||7|
8438|ML|44|584.582.439||CME|CME|B||||||1|1|1|158.22|293.00|||7|
8439|ML|44|584.582.440||CME|CME|M||||||1|1|1|158.22|293.00|||7|
8440|ML|44|584.582.441||ANT|ANT|B||||||1|1|1|158.22|293.00|||7|
8441|ML|44|584.582.442||ANT|ANT|M||||||1|1|1|158.22|293.00|||7|
8442|ML|44|584.582.443||PTO|PTO|B||||||1|1|1|158.22|293.00|||7|
8443|ML|44|584.582.444||PTO|PTO|M||||||1|1|1|158.22|293.00|||7|
8444|ML|44|584.582.445||CRE|CRE|B||||||1|1|1|158.22|293.00|||7|
8445|ML|44|584.582.446||CRE|CRE|M||||||1|1|1|158.22|293.00|||7|
8446|ML|44|584.582.447||CAM|CAM|B||||||1|1|1|158.22|293.00|||7|
8447|ML|44|584.582.448||CAM|CAM|M||||||1|1|1|158.22|293.00|||7|
8448|ML|44|584.582.449||OUR|OUR|B||||||1|1|1|158.22|293.00|||7|
8449|ML|44|584.582.450||OUR|OUR|M||||||1|1|1|158.22|293.00|||7|
8450|ML|44|584.582.451||COB|COB|B||||||1|1|1|158.22|293.00|||7|
8451|ML|44|584.582.452||COB|COB|M||||||1|1|1|158.22|293.00|||7|
8452|ML|44|584.582.453||CHO|CHO|B||||||1|1|1|158.22|293.00|||7|
8453|ML|44|584.582.454||CHO|CHO|M||||||1|1|1|158.22|293.00|||7|
8454|ML|44|584.582.455||VAG|VAG|B||||||1|1|1|158.22|293.00|||7|
8455|ML|44|584.582.456||VAG|VAG|M||||||1|1|1|158.22|293.00|||7|
8456|ML|44|584.582.457||AZE|AZE|B||||||1|1|1|158.22|293.00|||7|
8457|ML|44|584.582.458||AZE|AZE|M||||||1|1|1|158.22|293.00|||7|
8458|ML|44|584.582.459||AMA|AMA|B||||||1|1|1|158.22|293.00|||7|
8459|ML|44|584.582.460||AMA|AMA|M||||||1|1|1|158.22|293.00|||7|
8460|ML|44|584.582.461||AES|AES|B||||||1|1|1|158.22|293.00|||7|
8461|ML|44|584.582.462||AES|AES|M||||||1|1|1|158.22|293.00|||7|
8462|ML|44|584.582.463||PRA|PRA|B||||||1|1|1|158.22|293.00|||7|
8463|ML|44|584.582.464||PRA|PRA|M||||||1|1|1|158.22|293.00|||7|
8464|ML|44|584.582.465||ROS|ROS|B||||||1|1|1|158.22|293.00|||7|
8465|ML|44|584.582.466||ROS|ROS|M||||||1|1|1|158.22|293.00|||7|
8466|ML|44|584.582.467||VER|VER|B||||||1|1|1|158.22|293.00|||7|
8467|ML|44|584.582.468||VER|VER|M||||||1|1|1|158.22|293.00|||7|
8468|ML|44|584.582.469||AZB|AZB|||||||1|1|1|158.22|293.00|||7|
8469|ML|44|584.582.470||DEN|DEN|||||||1|1|1|158.22|293.00|||7|
8470|ML|44|584.582.471||BLK|BLK|||||||1|1|1|158.22|293.00|||7|
8471|ML|44|584.582.472||ART|ART|||||||1|1|1|158.22|293.00|||7|
8472|ML|44|584.582.473||LIN|LIN|||||||1|1|1|158.22|293.00|||7|
8473|ML|44|584.582.474||HAL|HAL|||||||1|1|1|158.22|293.00|||7|
8474|ML|45|584.582.475||TBR|TBR|||||||1|1|1|93.42|173.00|||7|
8475|ML|45|584.582.242||TEA|TEA|||||||1|1|1|93.42|173.00|||7|
8476|ML|45|584.582.243||OAK|OAK|||||||1|1|1|93.42|173.00|||7|
8477|ML|45|584.582.244||JOP|JOP|||||||1|1|1|93.42|173.00|||7|
8478|ML|45|584.582.476||TBR|BCO|B||||||1|1|1|136.62|253.00|||7|
8479|ML|45|584.582.477||TBR|BCO|M||||||1|1|1|136.62|253.00|||7|
8480|ML|45|584.582.478||TBR|CCL|B||||||1|1|1|136.62|253.00|||7|
8481|ML|45|584.582.479||TBR|CCL|M||||||1|1|1|136.62|253.00|||7|
8482|ML|45|584.582.480||TBR|CME|B||||||1|1|1|136.62|253.00|||7|
8483|ML|45|584.582.481||TBR|CME|M||||||1|1|1|136.62|253.00|||7|
8484|ML|45|584.582.482||TBR|ANT|B||||||1|1|1|136.62|253.00|||7|
8485|ML|45|584.582.483||TBR|ANT|M||||||1|1|1|136.62|253.00|||7|
8486|ML|45|584.582.484||TBR|PTO|B||||||1|1|1|136.62|253.00|||7|
8487|ML|45|584.582.485||TBR|PTO|M||||||1|1|1|136.62|253.00|||7|
8488|ML|45|584.582.486||TBR|CRE|B||||||1|1|1|136.62|253.00|||7|
8489|ML|45|584.582.487||TBR|CRE|M||||||1|1|1|136.62|253.00|||7|
8490|ML|45|584.582.488||TBR|CAM|B||||||1|1|1|136.62|253.00|||7|
8491|ML|45|584.582.489||TBR|CAM|M||||||1|1|1|136.62|253.00|||7|
8492|ML|45|584.582.490||TBR|OUR|B||||||1|1|1|136.62|253.00|||7|
8493|ML|45|584.582.491||TBR|OUR|M||||||1|1|1|136.62|253.00|||7|
8494|ML|45|584.582.492||TBR|COB|B||||||1|1|1|136.62|253.00|||7|
8495|ML|45|584.582.493||TBR|COB|M||||||1|1|1|136.62|253.00|||7|
8496|ML|45|584.582.494||TBR|CHO|B||||||1|1|1|136.62|253.00|||7|
8497|ML|45|584.582.495||TBR|CHO|M||||||1|1|1|136.62|253.00|||7|
8498|ML|45|584.582.496||TBR|VAG|B||||||1|1|1|136.62|253.00|||7|
8499|ML|45|584.582.497||TBR|VAG|M||||||1|1|1|136.62|253.00|||7|
8500|ML|45|584.582.498||TBR|AZE|B||||||1|1|1|136.62|253.00|||7|
8501|ML|45|584.582.499||TBR|AZE|M||||||1|1|1|136.62|253.00|||7|
8502|ML|45|584.582.500||TBR|AMA|B||||||1|1|1|136.62|253.00|||7|
8503|ML|45|584.582.501||TBR|AMA|M||||||1|1|1|136.62|253.00|||7|
8504|ML|45|584.582.502||TBR|AES|B||||||1|1|1|136.62|253.00|||7|
8505|ML|45|584.582.503||TBR|AES|M||||||1|1|1|136.62|253.00|||7|
8506|ML|45|584.582.504||TBR|PRA|B||||||1|1|1|136.62|253.00|||7|
8507|ML|45|584.582.505||TBR|PRA|M||||||1|1|1|136.62|253.00|||7|
8508|ML|45|584.582.506||TBR|ROS|B||||||1|1|1|136.62|253.00|||7|
8509|ML|45|584.582.507||TBR|ROS|M||||||1|1|1|136.62|253.00|||7|
8510|ML|45|584.582.508||TBR|VER|B||||||1|1|1|136.62|253.00|||7|
8511|ML|45|584.582.509||TBR|VER|M||||||1|1|1|136.62|253.00|||7|
8512|ML|45|584.582.510||TBR|AZB|||||||1|1|1|136.62|253.00|||7|
8513|ML|45|584.582.511||TBR|DEN|||||||1|1|1|136.62|253.00|||7|
8514|ML|45|584.582.512||TBR|BLK|||||||1|1|1|136.62|253.00|||7|
8515|ML|45|584.582.513||TBR|ART|||||||1|1|1|136.62|253.00|||7|
8516|ML|45|584.582.514||TBR|LIN|||||||1|1|1|136.62|253.00|||7|
8517|ML|45|584.582.515||TBR|HAL|||||||1|1|1|136.62|253.00|||7|
8518|ML|45|584.582.516||BCO|BCO|B||||||1|1|1|158.22|293.00|||7|
8519|ML|45|584.582.517||BCO|BCO|M||||||1|1|1|158.22|293.00|||7|
8520|ML|45|584.582.518||CCL|CCL|B||||||1|1|1|158.22|293.00|||7|
8521|ML|45|584.582.519||CCL|CCL|M||||||1|1|1|158.22|293.00|||7|
8522|ML|45|584.582.520||CME|CME|B||||||1|1|1|158.22|293.00|||7|
8523|ML|45|584.582.521||CME|CME|M||||||1|1|1|158.22|293.00|||7|
8524|ML|45|584.582.522||ANT|ANT|B||||||1|1|1|158.22|293.00|||7|
8525|ML|45|584.582.523||ANT|ANT|M||||||1|1|1|158.22|293.00|||7|
8526|ML|45|584.582.524||PTO|PTO|B||||||1|1|1|158.22|293.00|||7|
8527|ML|45|584.582.525||PTO|PTO|M||||||1|1|1|158.22|293.00|||7|
8528|ML|45|584.582.526||CRE|CRE|B||||||1|1|1|158.22|293.00|||7|
8529|ML|45|584.582.527||CRE|CRE|M||||||1|1|1|158.22|293.00|||7|
8530|ML|45|584.582.528||CAM|CAM|B||||||1|1|1|158.22|293.00|||7|
8531|ML|45|584.582.529||CAM|CAM|M||||||1|1|1|158.22|293.00|||7|
8532|ML|45|584.582.530||OUR|OUR|B||||||1|1|1|158.22|293.00|||7|
8533|ML|45|584.582.531||OUR|OUR|M||||||1|1|1|158.22|293.00|||7|
8534|ML|45|584.582.532||COB|COB|B||||||1|1|1|158.22|293.00|||7|
8535|ML|45|584.582.533||COB|COB|M||||||1|1|1|158.22|293.00|||7|
8536|ML|45|584.582.534||CHO|CHO|B||||||1|1|1|158.22|293.00|||7|
8537|ML|45|584.582.535||CHO|CHO|M||||||1|1|1|158.22|293.00|||7|
8538|ML|45|584.582.536||VAG|VAG|B||||||1|1|1|158.22|293.00|||7|
8539|ML|45|584.582.537||VAG|VAG|M||||||1|1|1|158.22|293.00|||7|
8540|ML|45|584.582.538||AZE|AZE|B||||||1|1|1|158.22|293.00|||7|
8541|ML|45|584.582.539||AZE|AZE|M||||||1|1|1|158.22|293.00|||7|
8542|ML|45|584.582.540||AMA|AMA|B||||||1|1|1|158.22|293.00|||7|
8543|ML|45|584.582.541||AMA|AMA|M||||||1|1|1|158.22|293.00|||7|
8544|ML|45|584.582.542||AES|AES|B||||||1|1|1|158.22|293.00|||7|
8545|ML|45|584.582.543||AES|AES|M||||||1|1|1|158.22|293.00|||7|
8546|ML|45|584.582.544||PRA|PRA|B||||||1|1|1|158.22|293.00|||7|
8547|ML|45|584.582.545||PRA|PRA|M||||||1|1|1|158.22|293.00|||7|
8548|ML|45|584.582.546||ROS|ROS|B||||||1|1|1|158.22|293.00|||7|
8549|ML|45|584.582.547||ROS|ROS|M||||||1|1|1|158.22|293.00|||7|
8550|ML|45|584.582.548||VER|VER|B||||||1|1|1|158.22|293.00|||7|
8551|ML|45|584.582.549||VER|VER|M||||||1|1|1|158.22|293.00|||7|
8552|ML|45|584.582.550||AZB|AZB|||||||1|1|1|158.22|293.00|||7|
8553|ML|45|584.582.551||DEN|DEN|||||||1|1|1|158.22|293.00|||7|
8554|ML|45|584.582.552||BLK|BLK|||||||1|1|1|158.22|293.00|||7|
8555|ML|45|584.582.553||ART|ART|||||||1|1|1|158.22|293.00|||7|
8556|ML|45|584.582.554||LIN|LIN|||||||1|1|1|158.22|293.00|||7|
8557|ML|45|584.582.555||HAL|HAL|||||||1|1|1|158.22|293.00|||7|
8558|ML|46|585.586.394||TBR|TBR|||||||2|1|1|135.00|250.00|||7|
8559|ML|46|585.586.198||TEA|TEA|||||||2|1|1|135.00|250.00|||7|
8560|ML|46|585.586.199||OAK|OAK|||||||2|1|1|135.00|250.00|||7|
8561|ML|46|585.586.200||JOP|JOP|||||||2|1|1|135.00|250.00|||7|
8562|ML|46|585.586.395||TBR|BCO|B||||||2|1|1|178.20|330.00|||7|
8563|ML|46|585.586.396||TBR|BCO|M||||||2|1|1|178.20|330.00|||7|
8564|ML|46|585.586.397||TBR|CCL|B||||||2|1|1|178.20|330.00|||7|
8565|ML|46|585.586.398||TBR|CCL|M||||||2|1|1|178.20|330.00|||7|
8566|ML|46|585.586.399||TBR|CME|B||||||2|1|1|178.20|330.00|||7|
8567|ML|46|585.586.400||TBR|CME|M||||||2|1|1|178.20|330.00|||7|
8568|ML|46|585.586.401||TBR|ANT|B||||||2|1|1|178.20|330.00|||7|
8569|ML|46|585.586.402||TBR|ANT|M||||||2|1|1|178.20|330.00|||7|
8570|ML|46|585.586.403||TBR|PTO|B||||||2|1|1|178.20|330.00|||7|
8571|ML|46|585.586.404||TBR|PTO|M||||||2|1|1|178.20|330.00|||7|
8572|ML|46|585.586.405||TBR|CRE|B||||||2|1|1|178.20|330.00|||7|
8573|ML|46|585.586.406||TBR|CRE|M||||||2|1|1|178.20|330.00|||7|
8574|ML|46|585.586.407||TBR|CAM|B||||||2|1|1|178.20|330.00|||7|
8575|ML|46|585.586.408||TBR|CAM|M||||||2|1|1|178.20|330.00|||7|
8576|ML|46|585.586.409||TBR|OUR|B||||||2|1|1|178.20|330.00|||7|
8577|ML|46|585.586.410||TBR|OUR|M||||||2|1|1|178.20|330.00|||7|
8578|ML|46|585.586.411||TBR|COB|B||||||2|1|1|178.20|330.00|||7|
8579|ML|46|585.586.412||TBR|COB|M||||||2|1|1|178.20|330.00|||7|
8580|ML|46|585.586.413||TBR|CHO|B||||||2|1|1|178.20|330.00|||7|
8581|ML|46|585.586.414||TBR|CHO|M||||||2|1|1|178.20|330.00|||7|
8582|ML|46|585.586.415||TBR|VAG|B||||||2|1|1|178.20|330.00|||7|
8583|ML|46|585.586.416||TBR|VAG|M||||||2|1|1|178.20|330.00|||7|
8584|ML|46|585.586.417||TBR|AZE|B||||||2|1|1|178.20|330.00|||7|
8585|ML|46|585.586.418||TBR|AZE|M||||||2|1|1|178.20|330.00|||7|
8586|ML|46|585.586.419||TBR|AMA|B||||||2|1|1|178.20|330.00|||7|
8587|ML|46|585.586.420||TBR|AMA|M||||||2|1|1|178.20|330.00|||7|
8588|ML|46|585.586.421||TBR|AES|B||||||2|1|1|178.20|330.00|||7|
8589|ML|46|585.586.422||TBR|AES|M||||||2|1|1|178.20|330.00|||7|
8590|ML|46|585.586.423||TBR|PRA|B||||||2|1|1|178.20|330.00|||7|
8591|ML|46|585.586.424||TBR|PRA|M||||||2|1|1|178.20|330.00|||7|
8592|ML|46|585.586.425||TBR|ROS|B||||||2|1|1|178.20|330.00|||7|
8593|ML|46|585.586.426||TBR|ROS|M||||||2|1|1|178.20|330.00|||7|
8594|ML|46|585.586.427||TBR|VER|B||||||2|1|1|178.20|330.00|||7|
8595|ML|46|585.586.428||TBR|VER|M||||||2|1|1|178.20|330.00|||7|
8596|ML|46|585.586.429||TBR|AZB|||||||2|1|1|178.20|330.00|||7|
8597|ML|46|585.586.430||TBR|DEN|||||||2|1|1|178.20|330.00|||7|
8598|ML|46|585.586.431||TBR|BLK|||||||2|1|1|178.20|330.00|||7|
8599|ML|46|585.586.432||TBR|ART|||||||2|1|1|178.20|330.00|||7|
8600|ML|46|585.586.433||TBR|LIN|||||||2|1|1|178.20|330.00|||7|
8601|ML|46|585.586.434||TBR|HAL|||||||2|1|1|178.20|330.00|||7|
8602|ML|46|585.586.435||BCO|BCO|B||||||2|1|1|199.80|370.00|||7|
8603|ML|46|585.586.436||BCO|BCO|M||||||2|1|1|199.80|370.00|||7|
8604|ML|46|585.586.437||CCL|CCL|B||||||2|1|1|199.80|370.00|||7|
8605|ML|46|585.586.438||CCL|CCL|M||||||2|1|1|199.80|370.00|||7|
8606|ML|46|585.586.439||CME|CME|B||||||2|1|1|199.80|370.00|||7|
8607|ML|46|585.586.440||CME|CME|M||||||2|1|1|199.80|370.00|||7|
8608|ML|46|585.586.441||ANT|ANT|B||||||2|1|1|199.80|370.00|||7|
8609|ML|46|585.586.442||ANT|ANT|M||||||2|1|1|199.80|370.00|||7|
8610|ML|46|585.586.443||PTO|PTO|B||||||2|1|1|199.80|370.00|||7|
8611|ML|46|585.586.444||PTO|PTO|M||||||2|1|1|199.80|370.00|||7|
8612|ML|46|585.586.445||CRE|CRE|B||||||2|1|1|199.80|370.00|||7|
8613|ML|46|585.586.446||CRE|CRE|M||||||2|1|1|199.80|370.00|||7|
8614|ML|46|585.586.447||CAM|CAM|B||||||2|1|1|199.80|370.00|||7|
8615|ML|46|585.586.448||CAM|CAM|M||||||2|1|1|199.80|370.00|||7|
8616|ML|46|585.586.449||OUR|OUR|B||||||2|1|1|199.80|370.00|||7|
8617|ML|46|585.586.450||OUR|OUR|M||||||2|1|1|199.80|370.00|||7|
8618|ML|46|585.586.451||COB|COB|B||||||2|1|1|199.80|370.00|||7|
8619|ML|46|585.586.452||COB|COB|M||||||2|1|1|199.80|370.00|||7|
8620|ML|46|585.586.453||CHO|CHO|B||||||2|1|1|199.80|370.00|||7|
8621|ML|46|585.586.454||CHO|CHO|M||||||2|1|1|199.80|370.00|||7|
8622|ML|46|585.586.455||VAG|VAG|B||||||2|1|1|199.80|370.00|||7|
8623|ML|46|585.586.456||VAG|VAG|M||||||2|1|1|199.80|370.00|||7|
8624|ML|46|585.586.457||AZE|AZE|B||||||2|1|1|199.80|370.00|||7|
8625|ML|46|585.586.458||AZE|AZE|M||||||2|1|1|199.80|370.00|||7|
8626|ML|46|585.586.459||AMA|AMA|B||||||2|1|1|199.80|370.00|||7|
8627|ML|46|585.586.460||AMA|AMA|M||||||2|1|1|199.80|370.00|||7|
8628|ML|46|585.586.461||AES|AES|B||||||2|1|1|199.80|370.00|||7|
8629|ML|46|585.586.462||AES|AES|M||||||2|1|1|199.80|370.00|||7|
8630|ML|46|585.586.463||PRA|PRA|B||||||2|1|1|199.80|370.00|||7|
8631|ML|46|585.586.464||PRA|PRA|M||||||2|1|1|199.80|370.00|||7|
8632|ML|46|585.586.465||ROS|ROS|B||||||2|1|1|199.80|370.00|||7|
8633|ML|46|585.586.466||ROS|ROS|M||||||2|1|1|199.80|370.00|||7|
8634|ML|46|585.586.467||VER|VER|B||||||2|1|1|199.80|370.00|||7|
8635|ML|46|585.586.468||VER|VER|M||||||2|1|1|199.80|370.00|||7|
8636|ML|46|585.586.469||AZB|AZB|||||||2|1|1|199.80|370.00|||7|
8637|ML|46|585.586.470||DEN|DEN|||||||2|1|1|199.80|370.00|||7|
8638|ML|46|585.586.471||BLK|BLK|||||||2|1|1|199.80|370.00|||7|
8639|ML|46|585.586.472||ART|ART|||||||2|1|1|199.80|370.00|||7|
8640|ML|46|585.586.473||LIN|LIN|||||||2|1|1|199.80|370.00|||7|
8641|ML|46|585.586.474||HAL|HAL|||||||2|1|1|199.80|370.00|||7|
8642|ML|47|585.586.475||TBR|TBR|||||||2|1|1|135.00|250.00|||7|
8643|ML|47|585.586.242||TEA|TEA|||||||2|1|1|135.00|250.00|||7|
8644|ML|47|585.586.243||OAK|OAK|||||||2|1|1|135.00|250.00|||7|
8645|ML|47|585.586.244||JOP|JOP|||||||2|1|1|135.00|250.00|||7|
8646|ML|47|585.586.476||TBR|BCO|B||||||2|1|1|178.20|330.00|||7|
8647|ML|47|585.586.477||TBR|BCO|M||||||2|1|1|178.20|330.00|||7|
8648|ML|47|585.586.478||TBR|CCL|B||||||2|1|1|178.20|330.00|||7|
8649|ML|47|585.586.479||TBR|CCL|M||||||2|1|1|178.20|330.00|||7|
8650|ML|47|585.586.480||TBR|CME|B||||||2|1|1|178.20|330.00|||7|
8651|ML|47|585.586.481||TBR|CME|M||||||2|1|1|178.20|330.00|||7|
8652|ML|47|585.586.482||TBR|ANT|B||||||2|1|1|178.20|330.00|||7|
8653|ML|47|585.586.483||TBR|ANT|M||||||2|1|1|178.20|330.00|||7|
8654|ML|47|585.586.484||TBR|PTO|B||||||2|1|1|178.20|330.00|||7|
8655|ML|47|585.586.485||TBR|PTO|M||||||2|1|1|178.20|330.00|||7|
8656|ML|47|585.586.486||TBR|CRE|B||||||2|1|1|178.20|330.00|||7|
8657|ML|47|585.586.487||TBR|CRE|M||||||2|1|1|178.20|330.00|||7|
8658|ML|47|585.586.488||TBR|CAM|B||||||2|1|1|178.20|330.00|||7|
8659|ML|47|585.586.489||TBR|CAM|M||||||2|1|1|178.20|330.00|||7|
8660|ML|47|585.586.490||TBR|OUR|B||||||2|1|1|178.20|330.00|||7|
8661|ML|47|585.586.491||TBR|OUR|M||||||2|1|1|178.20|330.00|||7|
8662|ML|47|585.586.492||TBR|COB|B||||||2|1|1|178.20|330.00|||7|
8663|ML|47|585.586.493||TBR|COB|M||||||2|1|1|178.20|330.00|||7|
8664|ML|47|585.586.494||TBR|CHO|B||||||2|1|1|178.20|330.00|||7|
8665|ML|47|585.586.495||TBR|CHO|M||||||2|1|1|178.20|330.00|||7|
8666|ML|47|585.586.496||TBR|VAG|B||||||2|1|1|178.20|330.00|||7|
8667|ML|47|585.586.497||TBR|VAG|M||||||2|1|1|178.20|330.00|||7|
8668|ML|47|585.586.498||TBR|AZE|B||||||2|1|1|178.20|330.00|||7|
8669|ML|47|585.586.499||TBR|AZE|M||||||2|1|1|178.20|330.00|||7|
8670|ML|47|585.586.500||TBR|AMA|B||||||2|1|1|178.20|330.00|||7|
8671|ML|47|585.586.501||TBR|AMA|M||||||2|1|1|178.20|330.00|||7|
8672|ML|47|585.586.502||TBR|AES|B||||||2|1|1|178.20|330.00|||7|
8673|ML|47|585.586.503||TBR|AES|M||||||2|1|1|178.20|330.00|||7|
8674|ML|47|585.586.504||TBR|PRA|B||||||2|1|1|178.20|330.00|||7|
8675|ML|47|585.586.505||TBR|PRA|M||||||2|1|1|178.20|330.00|||7|
8676|ML|47|585.586.506||TBR|ROS|B||||||2|1|1|178.20|330.00|||7|
8677|ML|47|585.586.507||TBR|ROS|M||||||2|1|1|178.20|330.00|||7|
8678|ML|47|585.586.508||TBR|VER|B||||||2|1|1|178.20|330.00|||7|
8679|ML|47|585.586.509||TBR|VER|M||||||2|1|1|178.20|330.00|||7|
8680|ML|47|585.586.510||TBR|AZB|||||||2|1|1|178.20|330.00|||7|
8681|ML|47|585.586.511||TBR|DEN|||||||2|1|1|178.20|330.00|||7|
8682|ML|47|585.586.512||TBR|BLK|||||||2|1|1|178.20|330.00|||7|
8683|ML|47|585.586.513||TBR|ART|||||||2|1|1|178.20|330.00|||7|
8684|ML|47|585.586.514||TBR|LIN|||||||2|1|1|178.20|330.00|||7|
8685|ML|47|585.586.515||TBR|HAL|||||||2|1|1|178.20|330.00|||7|
8686|ML|47|585.586.516||BCO|BCO|B||||||2|1|1|199.80|370.00|||7|
8687|ML|47|585.586.517||BCO|BCO|M||||||2|1|1|199.80|370.00|||7|
8688|ML|47|585.586.518||CCL|CCL|B||||||2|1|1|199.80|370.00|||7|
8689|ML|47|585.586.519||CCL|CCL|M||||||2|1|1|199.80|370.00|||7|
8690|ML|47|585.586.520||CME|CME|B||||||2|1|1|199.80|370.00|||7|
8691|ML|47|585.586.521||CME|CME|M||||||2|1|1|199.80|370.00|||7|
8692|ML|47|585.586.522||ANT|ANT|B||||||2|1|1|199.80|370.00|||7|
8693|ML|47|585.586.523||ANT|ANT|M||||||2|1|1|199.80|370.00|||7|
8694|ML|47|585.586.524||PTO|PTO|B||||||2|1|1|199.80|370.00|||7|
8695|ML|47|585.586.525||PTO|PTO|M||||||2|1|1|199.80|370.00|||7|
8696|ML|47|585.586.526||CRE|CRE|B||||||2|1|1|199.80|370.00|||7|
8697|ML|47|585.586.527||CRE|CRE|M||||||2|1|1|199.80|370.00|||7|
8698|ML|47|585.586.528||CAM|CAM|B||||||2|1|1|199.80|370.00|||7|
8699|ML|47|585.586.529||CAM|CAM|M||||||2|1|1|199.80|370.00|||7|
8700|ML|47|585.586.530||OUR|OUR|B||||||2|1|1|199.80|370.00|||7|
8701|ML|47|585.586.531||OUR|OUR|M||||||2|1|1|199.80|370.00|||7|
8702|ML|47|585.586.532||COB|COB|B||||||2|1|1|199.80|370.00|||7|
8703|ML|47|585.586.533||COB|COB|M||||||2|1|1|199.80|370.00|||7|
8704|ML|47|585.586.534||CHO|CHO|B||||||2|1|1|199.80|370.00|||7|
8705|ML|47|585.586.535||CHO|CHO|M||||||2|1|1|199.80|370.00|||7|
8706|ML|47|585.586.536||VAG|VAG|B||||||2|1|1|199.80|370.00|||7|
8707|ML|47|585.586.537||VAG|VAG|M||||||2|1|1|199.80|370.00|||7|
8708|ML|47|585.586.538||AZE|AZE|B||||||2|1|1|199.80|370.00|||7|
8709|ML|47|585.586.539||AZE|AZE|M||||||2|1|1|199.80|370.00|||7|
8710|ML|47|585.586.540||AMA|AMA|B||||||2|1|1|199.80|370.00|||7|
8711|ML|47|585.586.541||AMA|AMA|M||||||2|1|1|199.80|370.00|||7|
8712|ML|47|585.586.542||AES|AES|B||||||2|1|1|199.80|370.00|||7|
8713|ML|47|585.586.543||AES|AES|M||||||2|1|1|199.80|370.00|||7|
8714|ML|47|585.586.544||PRA|PRA|B||||||2|1|1|199.80|370.00|||7|
8715|ML|47|585.586.545||PRA|PRA|M||||||2|1|1|199.80|370.00|||7|
8716|ML|47|585.586.546||ROS|ROS|B||||||2|1|1|199.80|370.00|||7|
8717|ML|47|585.586.547||ROS|ROS|M||||||2|1|1|199.80|370.00|||7|
8718|ML|47|585.586.548||VER|VER|B||||||2|1|1|199.80|370.00|||7|
8719|ML|47|585.586.549||VER|VER|M||||||2|1|1|199.80|370.00|||7|
8720|ML|47|585.586.550||AZB|AZB|||||||2|1|1|199.80|370.00|||7|
8721|ML|47|585.586.551||DEN|DEN|||||||2|1|1|199.80|370.00|||7|
8722|ML|47|585.586.552||BLK|BLK|||||||2|1|1|199.80|370.00|||7|
8723|ML|47|585.586.553||ART|ART|||||||2|1|1|199.80|370.00|||7|
8724|ML|47|585.586.554||LIN|LIN|||||||2|1|1|199.80|370.00|||7|
8725|ML|47|585.586.555||HAL|HAL|||||||2|1|1|199.80|370.00|||7|
8726|ML|46|587.586.394||TBR|TBR|||||||3|1|1|183.60|340.00|||7|
8727|ML|46|587.586.198||TEA|TEA|||||||3|1|1|183.60|340.00|||7|
8728|ML|46|587.586.199||OAK|OAK|||||||3|1|1|183.60|340.00|||7|
8729|ML|46|587.586.200||JOP|JOP|||||||3|1|1|183.60|340.00|||7|
8730|ML|46|587.586.395||TBR|BCO|B||||||3|1|1|226.80|420.00|||7|
8731|ML|46|587.586.396||TBR|BCO|M||||||3|1|1|226.80|420.00|||7|
8732|ML|46|587.586.397||TBR|CCL|B||||||3|1|1|226.80|420.00|||7|
8733|ML|46|587.586.398||TBR|CCL|M||||||3|1|1|226.80|420.00|||7|
8734|ML|46|587.586.399||TBR|CME|B||||||3|1|1|226.80|420.00|||7|
8735|ML|46|587.586.400||TBR|CME|M||||||3|1|1|226.80|420.00|||7|
8736|ML|46|587.586.401||TBR|ANT|B||||||3|1|1|226.80|420.00|||7|
8737|ML|46|587.586.402||TBR|ANT|M||||||3|1|1|226.80|420.00|||7|
8738|ML|46|587.586.403||TBR|PTO|B||||||3|1|1|226.80|420.00|||7|
8739|ML|46|587.586.404||TBR|PTO|M||||||3|1|1|226.80|420.00|||7|
8740|ML|46|587.586.405||TBR|CRE|B||||||3|1|1|226.80|420.00|||7|
8741|ML|46|587.586.406||TBR|CRE|M||||||3|1|1|226.80|420.00|||7|
8742|ML|46|587.586.407||TBR|CAM|B||||||3|1|1|226.80|420.00|||7|
8743|ML|46|587.586.408||TBR|CAM|M||||||3|1|1|226.80|420.00|||7|
8744|ML|46|587.586.409||TBR|OUR|B||||||3|1|1|226.80|420.00|||7|
8745|ML|46|587.586.410||TBR|OUR|M||||||3|1|1|226.80|420.00|||7|
8746|ML|46|587.586.411||TBR|COB|B||||||3|1|1|226.80|420.00|||7|
8747|ML|46|587.586.412||TBR|COB|M||||||3|1|1|226.80|420.00|||7|
8748|ML|46|587.586.413||TBR|CHO|B||||||3|1|1|226.80|420.00|||7|
8749|ML|46|587.586.414||TBR|CHO|M||||||3|1|1|226.80|420.00|||7|
8750|ML|46|587.586.415||TBR|VAG|B||||||3|1|1|226.80|420.00|||7|
8751|ML|46|587.586.416||TBR|VAG|M||||||3|1|1|226.80|420.00|||7|
8752|ML|46|587.586.417||TBR|AZE|B||||||3|1|1|226.80|420.00|||7|
8753|ML|46|587.586.418||TBR|AZE|M||||||3|1|1|226.80|420.00|||7|
8754|ML|46|587.586.419||TBR|AMA|B||||||3|1|1|226.80|420.00|||7|
8755|ML|46|587.586.420||TBR|AMA|M||||||3|1|1|226.80|420.00|||7|
8756|ML|46|587.586.421||TBR|AES|B||||||3|1|1|226.80|420.00|||7|
8757|ML|46|587.586.422||TBR|AES|M||||||3|1|1|226.80|420.00|||7|
8758|ML|46|587.586.423||TBR|PRA|B||||||3|1|1|226.80|420.00|||7|
8759|ML|46|587.586.424||TBR|PRA|M||||||3|1|1|226.80|420.00|||7|
8760|ML|46|587.586.425||TBR|ROS|B||||||3|1|1|226.80|420.00|||7|
8761|ML|46|587.586.426||TBR|ROS|M||||||3|1|1|226.80|420.00|||7|
8762|ML|46|587.586.427||TBR|VER|B||||||3|1|1|226.80|420.00|||7|
8763|ML|46|587.586.428||TBR|VER|M||||||3|1|1|226.80|420.00|||7|
8764|ML|46|587.586.429||TBR|AZB|||||||3|1|1|226.80|420.00|||7|
8765|ML|46|587.586.430||TBR|DEN|||||||3|1|1|226.80|420.00|||7|
8766|ML|46|587.586.431||TBR|BLK|||||||3|1|1|226.80|420.00|||7|
8767|ML|46|587.586.432||TBR|ART|||||||3|1|1|226.80|420.00|||7|
8768|ML|46|587.586.433||TBR|LIN|||||||3|1|1|226.80|420.00|||7|
8769|ML|46|587.586.434||TBR|HAL|||||||3|1|1|226.80|420.00|||7|
8770|ML|46|587.586.435||BCO|BCO|B||||||3|1|1|248.40|460.00|||7|
8771|ML|46|587.586.436||BCO|BCO|M||||||3|1|1|248.40|460.00|||7|
8772|ML|46|587.586.437||CCL|CCL|B||||||3|1|1|248.40|460.00|||7|
8773|ML|46|587.586.438||CCL|CCL|M||||||3|1|1|248.40|460.00|||7|
8774|ML|46|587.586.439||CME|CME|B||||||3|1|1|248.40|460.00|||7|
8775|ML|46|587.586.440||CME|CME|M||||||3|1|1|248.40|460.00|||7|
8776|ML|46|587.586.441||ANT|ANT|B||||||3|1|1|248.40|460.00|||7|
8777|ML|46|587.586.442||ANT|ANT|M||||||3|1|1|248.40|460.00|||7|
8778|ML|46|587.586.443||PTO|PTO|B||||||3|1|1|248.40|460.00|||7|
8779|ML|46|587.586.444||PTO|PTO|M||||||3|1|1|248.40|460.00|||7|
8780|ML|46|587.586.445||CRE|CRE|B||||||3|1|1|248.40|460.00|||7|
8781|ML|46|587.586.446||CRE|CRE|M||||||3|1|1|248.40|460.00|||7|
8782|ML|46|587.586.447||CAM|CAM|B||||||3|1|1|248.40|460.00|||7|
8783|ML|46|587.586.448||CAM|CAM|M||||||3|1|1|248.40|460.00|||7|
8784|ML|46|587.586.449||OUR|OUR|B||||||3|1|1|248.40|460.00|||7|
8785|ML|46|587.586.450||OUR|OUR|M||||||3|1|1|248.40|460.00|||7|
8786|ML|46|587.586.451||COB|COB|B||||||3|1|1|248.40|460.00|||7|
8787|ML|46|587.586.452||COB|COB|M||||||3|1|1|248.40|460.00|||7|
8788|ML|46|587.586.453||CHO|CHO|B||||||3|1|1|248.40|460.00|||7|
8789|ML|46|587.586.454||CHO|CHO|M||||||3|1|1|248.40|460.00|||7|
8790|ML|46|587.586.455||VAG|VAG|B||||||3|1|1|248.40|460.00|||7|
8791|ML|46|587.586.456||VAG|VAG|M||||||3|1|1|248.40|460.00|||7|
8792|ML|46|587.586.457||AZE|AZE|B||||||3|1|1|248.40|460.00|||7|
8793|ML|46|587.586.458||AZE|AZE|M||||||3|1|1|248.40|460.00|||7|
8794|ML|46|587.586.459||AMA|AMA|B||||||3|1|1|248.40|460.00|||7|
8795|ML|46|587.586.460||AMA|AMA|M||||||3|1|1|248.40|460.00|||7|
8796|ML|46|587.586.461||AES|AES|B||||||3|1|1|248.40|460.00|||7|
8797|ML|46|587.586.462||AES|AES|M||||||3|1|1|248.40|460.00|||7|
8798|ML|46|587.586.463||PRA|PRA|B||||||3|1|1|248.40|460.00|||7|
8799|ML|46|587.586.464||PRA|PRA|M||||||3|1|1|248.40|460.00|||7|
8800|ML|46|587.586.465||ROS|ROS|B||||||3|1|1|248.40|460.00|||7|
8801|ML|46|587.586.466||ROS|ROS|M||||||3|1|1|248.40|460.00|||7|
8802|ML|46|587.586.467||VER|VER|B||||||3|1|1|248.40|460.00|||7|
8803|ML|46|587.586.468||VER|VER|M||||||3|1|1|248.40|460.00|||7|
8804|ML|46|587.586.469||AZB|AZB|||||||3|1|1|248.40|460.00|||7|
8805|ML|46|587.586.470||DEN|DEN|||||||3|1|1|248.40|460.00|||7|
8806|ML|46|587.586.471||BLK|BLK|||||||3|1|1|248.40|460.00|||7|
8807|ML|46|587.586.472||ART|ART|||||||3|1|1|248.40|460.00|||7|
8808|ML|46|587.586.473||LIN|LIN|||||||3|1|1|248.40|460.00|||7|
8809|ML|46|587.586.474||HAL|HAL|||||||3|1|1|248.40|460.00|||7|
8810|ML|47|587.586.475||TBR|TBR|||||||3|1|1|183.60|340.00|||7|
8811|ML|47|587.586.242||TEA|TEA|||||||3|1|1|183.60|340.00|||7|
8812|ML|47|587.586.243||OAK|OAK|||||||3|1|1|183.60|340.00|||7|
8813|ML|47|587.586.244||JOP|JOP|||||||3|1|1|183.60|340.00|||7|
8814|ML|47|587.586.476||TBR|BCO|B||||||3|1|1|226.80|420.00|||7|
8815|ML|47|587.586.477||TBR|BCO|M||||||3|1|1|226.80|420.00|||7|
8816|ML|47|587.586.478||TBR|CCL|B||||||3|1|1|226.80|420.00|||7|
8817|ML|47|587.586.479||TBR|CCL|M||||||3|1|1|226.80|420.00|||7|
8818|ML|47|587.586.480||TBR|CME|B||||||3|1|1|226.80|420.00|||7|
8819|ML|47|587.586.481||TBR|CME|M||||||3|1|1|226.80|420.00|||7|
8820|ML|47|587.586.482||TBR|ANT|B||||||3|1|1|226.80|420.00|||7|
8821|ML|47|587.586.483||TBR|ANT|M||||||3|1|1|226.80|420.00|||7|
8822|ML|47|587.586.484||TBR|PTO|B||||||3|1|1|226.80|420.00|||7|
8823|ML|47|587.586.485||TBR|PTO|M||||||3|1|1|226.80|420.00|||7|
8824|ML|47|587.586.486||TBR|CRE|B||||||3|1|1|226.80|420.00|||7|
8825|ML|47|587.586.487||TBR|CRE|M||||||3|1|1|226.80|420.00|||7|
8826|ML|47|587.586.488||TBR|CAM|B||||||3|1|1|226.80|420.00|||7|
8827|ML|47|587.586.489||TBR|CAM|M||||||3|1|1|226.80|420.00|||7|
8828|ML|47|587.586.490||TBR|OUR|B||||||3|1|1|226.80|420.00|||7|
8829|ML|47|587.586.491||TBR|OUR|M||||||3|1|1|226.80|420.00|||7|
8830|ML|47|587.586.492||TBR|COB|B||||||3|1|1|226.80|420.00|||7|
8831|ML|47|587.586.493||TBR|COB|M||||||3|1|1|226.80|420.00|||7|
8832|ML|47|587.586.494||TBR|CHO|B||||||3|1|1|226.80|420.00|||7|
8833|ML|47|587.586.495||TBR|CHO|M||||||3|1|1|226.80|420.00|||7|
8834|ML|47|587.586.496||TBR|VAG|B||||||3|1|1|226.80|420.00|||7|
8835|ML|47|587.586.497||TBR|VAG|M||||||3|1|1|226.80|420.00|||7|
8836|ML|47|587.586.498||TBR|AZE|B||||||3|1|1|226.80|420.00|||7|
8837|ML|47|587.586.499||TBR|AZE|M||||||3|1|1|226.80|420.00|||7|
8838|ML|47|587.586.500||TBR|AMA|B||||||3|1|1|226.80|420.00|||7|
8839|ML|47|587.586.501||TBR|AMA|M||||||3|1|1|226.80|420.00|||7|
8840|ML|47|587.586.502||TBR|AES|B||||||3|1|1|226.80|420.00|||7|
8841|ML|47|587.586.503||TBR|AES|M||||||3|1|1|226.80|420.00|||7|
8842|ML|47|587.586.504||TBR|PRA|B||||||3|1|1|226.80|420.00|||7|
8843|ML|47|587.586.505||TBR|PRA|M||||||3|1|1|226.80|420.00|||7|
8844|ML|47|587.586.506||TBR|ROS|B||||||3|1|1|226.80|420.00|||7|
8845|ML|47|587.586.507||TBR|ROS|M||||||3|1|1|226.80|420.00|||7|
8846|ML|47|587.586.508||TBR|VER|B||||||3|1|1|226.80|420.00|||7|
8847|ML|47|587.586.509||TBR|VER|M||||||3|1|1|226.80|420.00|||7|
8848|ML|47|587.586.510||TBR|AZB|||||||3|1|1|226.80|420.00|||7|
8849|ML|47|587.586.511||TBR|DEN|||||||3|1|1|226.80|420.00|||7|
8850|ML|47|587.586.512||TBR|BLK|||||||3|1|1|226.80|420.00|||7|
8851|ML|47|587.586.513||TBR|ART|||||||3|1|1|226.80|420.00|||7|
8852|ML|47|587.586.514||TBR|LIN|||||||3|1|1|226.80|420.00|||7|
8853|ML|47|587.586.515||TBR|HAL|||||||3|1|1|226.80|420.00|||7|
8854|ML|47|587.586.516||BCO|BCO|B||||||3|1|1|248.40|460.00|||7|
8855|ML|47|587.586.517||BCO|BCO|M||||||3|1|1|248.40|460.00|||7|
8856|ML|47|587.586.518||CCL|CCL|B||||||3|1|1|248.40|460.00|||7|
8857|ML|47|587.586.519||CCL|CCL|M||||||3|1|1|248.40|460.00|||7|
8858|ML|47|587.586.520||CME|CME|B||||||3|1|1|248.40|460.00|||7|
8859|ML|47|587.586.521||CME|CME|M||||||3|1|1|248.40|460.00|||7|
8860|ML|47|587.586.522||ANT|ANT|B||||||3|1|1|248.40|460.00|||7|
8861|ML|47|587.586.523||ANT|ANT|M||||||3|1|1|248.40|460.00|||7|
8862|ML|47|587.586.524||PTO|PTO|B||||||3|1|1|248.40|460.00|||7|
8863|ML|47|587.586.525||PTO|PTO|M||||||3|1|1|248.40|460.00|||7|
8864|ML|47|587.586.526||CRE|CRE|B||||||3|1|1|248.40|460.00|||7|
8865|ML|47|587.586.527||CRE|CRE|M||||||3|1|1|248.40|460.00|||7|
8866|ML|47|587.586.528||CAM|CAM|B||||||3|1|1|248.40|460.00|||7|
8867|ML|47|587.586.529||CAM|CAM|M||||||3|1|1|248.40|460.00|||7|
8868|ML|47|587.586.530||OUR|OUR|B||||||3|1|1|248.40|460.00|||7|
8869|ML|47|587.586.531||OUR|OUR|M||||||3|1|1|248.40|460.00|||7|
8870|ML|47|587.586.532||COB|COB|B||||||3|1|1|248.40|460.00|||7|
8871|ML|47|587.586.533||COB|COB|M||||||3|1|1|248.40|460.00|||7|
8872|ML|47|587.586.534||CHO|CHO|B||||||3|1|1|248.40|460.00|||7|
8873|ML|47|587.586.535||CHO|CHO|M||||||3|1|1|248.40|460.00|||7|
8874|ML|47|587.586.536||VAG|VAG|B||||||3|1|1|248.40|460.00|||7|
8875|ML|47|587.586.537||VAG|VAG|M||||||3|1|1|248.40|460.00|||7|
8876|ML|47|587.586.538||AZE|AZE|B||||||3|1|1|248.40|460.00|||7|
8877|ML|47|587.586.539||AZE|AZE|M||||||3|1|1|248.40|460.00|||7|
8878|ML|47|587.586.540||AMA|AMA|B||||||3|1|1|248.40|460.00|||7|
8879|ML|47|587.586.541||AMA|AMA|M||||||3|1|1|248.40|460.00|||7|
8880|ML|47|587.586.542||AES|AES|B||||||3|1|1|248.40|460.00|||7|
8881|ML|47|587.586.543||AES|AES|M||||||3|1|1|248.40|460.00|||7|
8882|ML|47|587.586.544||PRA|PRA|B||||||3|1|1|248.40|460.00|||7|
8883|ML|47|587.586.545||PRA|PRA|M||||||3|1|1|248.40|460.00|||7|
8884|ML|47|587.586.546||ROS|ROS|B||||||3|1|1|248.40|460.00|||7|
8885|ML|47|587.586.547||ROS|ROS|M||||||3|1|1|248.40|460.00|||7|
8886|ML|47|587.586.548||VER|VER|B||||||3|1|1|248.40|460.00|||7|
8887|ML|47|587.586.549||VER|VER|M||||||3|1|1|248.40|460.00|||7|
8888|ML|47|587.586.550||AZB|AZB|||||||3|1|1|248.40|460.00|||7|
8889|ML|47|587.586.551||DEN|DEN|||||||3|1|1|248.40|460.00|||7|
8890|ML|47|587.586.552||BLK|BLK|||||||3|1|1|248.40|460.00|||7|
8891|ML|47|587.586.553||ART|ART|||||||3|1|1|248.40|460.00|||7|
8892|ML|47|587.586.554||LIN|LIN|||||||3|1|1|248.40|460.00|||7|
8893|ML|47|587.586.555||HAL|HAL|||||||3|1|1|248.40|460.00|||7|
8894|ML|48|587.588.394||TBR|TBR|||||||3|1|1|199.80|370.00|||7|
8895|ML|48|587.588.198||TEA|TEA|||||||3|1|1|199.80|370.00|||7|
8896|ML|48|587.588.199||OAK|OAK|||||||3|1|1|199.80|370.00|||7|
8897|ML|48|587.588.200||JOP|JOP|||||||3|1|1|199.80|370.00|||7|
8898|ML|48|587.588.395||TBR|BCO|B||||||3|1|1|243.00|450.00|||7|
8899|ML|48|587.588.396||TBR|BCO|M||||||3|1|1|243.00|450.00|||7|
8900|ML|48|587.588.397||TBR|CCL|B||||||3|1|1|243.00|450.00|||7|
8901|ML|48|587.588.398||TBR|CCL|M||||||3|1|1|243.00|450.00|||7|
8902|ML|48|587.588.399||TBR|CME|B||||||3|1|1|243.00|450.00|||7|
8903|ML|48|587.588.400||TBR|CME|M||||||3|1|1|243.00|450.00|||7|
8904|ML|48|587.588.401||TBR|ANT|B||||||3|1|1|243.00|450.00|||7|
8905|ML|48|587.588.402||TBR|ANT|M||||||3|1|1|243.00|450.00|||7|
8906|ML|48|587.588.403||TBR|PTO|B||||||3|1|1|243.00|450.00|||7|
8907|ML|48|587.588.404||TBR|PTO|M||||||3|1|1|243.00|450.00|||7|
8908|ML|48|587.588.405||TBR|CRE|B||||||3|1|1|243.00|450.00|||7|
8909|ML|48|587.588.406||TBR|CRE|M||||||3|1|1|243.00|450.00|||7|
8910|ML|48|587.588.407||TBR|CAM|B||||||3|1|1|243.00|450.00|||7|
8911|ML|48|587.588.408||TBR|CAM|M||||||3|1|1|243.00|450.00|||7|
8912|ML|48|587.588.409||TBR|OUR|B||||||3|1|1|243.00|450.00|||7|
8913|ML|48|587.588.410||TBR|OUR|M||||||3|1|1|243.00|450.00|||7|
8914|ML|48|587.588.411||TBR|COB|B||||||3|1|1|243.00|450.00|||7|
8915|ML|48|587.588.412||TBR|COB|M||||||3|1|1|243.00|450.00|||7|
8916|ML|48|587.588.413||TBR|CHO|B||||||3|1|1|243.00|450.00|||7|
8917|ML|48|587.588.414||TBR|CHO|M||||||3|1|1|243.00|450.00|||7|
8918|ML|48|587.588.415||TBR|VAG|B||||||3|1|1|243.00|450.00|||7|
8919|ML|48|587.588.416||TBR|VAG|M||||||3|1|1|243.00|450.00|||7|
8920|ML|48|587.588.417||TBR|AZE|B||||||3|1|1|243.00|450.00|||7|
8921|ML|48|587.588.418||TBR|AZE|M||||||3|1|1|243.00|450.00|||7|
8922|ML|48|587.588.419||TBR|AMA|B||||||3|1|1|243.00|450.00|||7|
8923|ML|48|587.588.420||TBR|AMA|M||||||3|1|1|243.00|450.00|||7|
8924|ML|48|587.588.421||TBR|AES|B||||||3|1|1|243.00|450.00|||7|
8925|ML|48|587.588.422||TBR|AES|M||||||3|1|1|243.00|450.00|||7|
8926|ML|48|587.588.423||TBR|PRA|B||||||3|1|1|243.00|450.00|||7|
8927|ML|48|587.588.424||TBR|PRA|M||||||3|1|1|243.00|450.00|||7|
8928|ML|48|587.588.425||TBR|ROS|B||||||3|1|1|243.00|450.00|||7|
8929|ML|48|587.588.426||TBR|ROS|M||||||3|1|1|243.00|450.00|||7|
8930|ML|48|587.588.427||TBR|VER|B||||||3|1|1|243.00|450.00|||7|
8931|ML|48|587.588.428||TBR|VER|M||||||3|1|1|243.00|450.00|||7|
8932|ML|48|587.588.429||TBR|AZB|||||||3|1|1|243.00|450.00|||7|
8933|ML|48|587.588.430||TBR|DEN|||||||3|1|1|243.00|450.00|||7|
8934|ML|48|587.588.431||TBR|BLK|||||||3|1|1|243.00|450.00|||7|
8935|ML|48|587.588.432||TBR|ART|||||||3|1|1|243.00|450.00|||7|
8936|ML|48|587.588.433||TBR|LIN|||||||3|1|1|243.00|450.00|||7|
8937|ML|48|587.588.434||TBR|HAL|||||||3|1|1|243.00|450.00|||7|
8938|ML|48|587.588.435||BCO|BCO|B||||||3|1|1|264.60|490.00|||7|
8939|ML|48|587.588.436||BCO|BCO|M||||||3|1|1|264.60|490.00|||7|
8940|ML|48|587.588.437||CCL|CCL|B||||||3|1|1|264.60|490.00|||7|
8941|ML|48|587.588.438||CCL|CCL|M||||||3|1|1|264.60|490.00|||7|
8942|ML|48|587.588.439||CME|CME|B||||||3|1|1|264.60|490.00|||7|
8943|ML|48|587.588.440||CME|CME|M||||||3|1|1|264.60|490.00|||7|
8944|ML|48|587.588.441||ANT|ANT|B||||||3|1|1|264.60|490.00|||7|
8945|ML|48|587.588.442||ANT|ANT|M||||||3|1|1|264.60|490.00|||7|
8946|ML|48|587.588.443||PTO|PTO|B||||||3|1|1|264.60|490.00|||7|
8947|ML|48|587.588.444||PTO|PTO|M||||||3|1|1|264.60|490.00|||7|
8948|ML|48|587.588.445||CRE|CRE|B||||||3|1|1|264.60|490.00|||7|
8949|ML|48|587.588.446||CRE|CRE|M||||||3|1|1|264.60|490.00|||7|
8950|ML|48|587.588.447||CAM|CAM|B||||||3|1|1|264.60|490.00|||7|
8951|ML|48|587.588.448||CAM|CAM|M||||||3|1|1|264.60|490.00|||7|
8952|ML|48|587.588.449||OUR|OUR|B||||||3|1|1|264.60|490.00|||7|
8953|ML|48|587.588.450||OUR|OUR|M||||||3|1|1|264.60|490.00|||7|
8954|ML|48|587.588.451||COB|COB|B||||||3|1|1|264.60|490.00|||7|
8955|ML|48|587.588.452||COB|COB|M||||||3|1|1|264.60|490.00|||7|
8956|ML|48|587.588.453||CHO|CHO|B||||||3|1|1|264.60|490.00|||7|
8957|ML|48|587.588.454||CHO|CHO|M||||||3|1|1|264.60|490.00|||7|
8958|ML|48|587.588.455||VAG|VAG|B||||||3|1|1|264.60|490.00|||7|
8959|ML|48|587.588.456||VAG|VAG|M||||||3|1|1|264.60|490.00|||7|
8960|ML|48|587.588.457||AZE|AZE|B||||||3|1|1|264.60|490.00|||7|
8961|ML|48|587.588.458||AZE|AZE|M||||||3|1|1|264.60|490.00|||7|
8962|ML|48|587.588.459||AMA|AMA|B||||||3|1|1|264.60|490.00|||7|
8963|ML|48|587.588.460||AMA|AMA|M||||||3|1|1|264.60|490.00|||7|
8964|ML|48|587.588.461||AES|AES|B||||||3|1|1|264.60|490.00|||7|
8965|ML|48|587.588.462||AES|AES|M||||||3|1|1|264.60|490.00|||7|
8966|ML|48|587.588.463||PRA|PRA|B||||||3|1|1|264.60|490.00|||7|
8967|ML|48|587.588.464||PRA|PRA|M||||||3|1|1|264.60|490.00|||7|
8968|ML|48|587.588.465||ROS|ROS|B||||||3|1|1|264.60|490.00|||7|
8969|ML|48|587.588.466||ROS|ROS|M||||||3|1|1|264.60|490.00|||7|
8970|ML|48|587.588.467||VER|VER|B||||||3|1|1|264.60|490.00|||7|
8971|ML|48|587.588.468||VER|VER|M||||||3|1|1|264.60|490.00|||7|
8972|ML|48|587.588.469||AZB|AZB|||||||3|1|1|264.60|490.00|||7|
8973|ML|48|587.588.470||DEN|DEN|||||||3|1|1|264.60|490.00|||7|
8974|ML|48|587.588.471||BLK|BLK|||||||3|1|1|264.60|490.00|||7|
8975|ML|48|587.588.472||ART|ART|||||||3|1|1|264.60|490.00|||7|
8976|ML|48|587.588.473||LIN|LIN|||||||3|1|1|264.60|490.00|||7|
8977|ML|48|587.588.474||HAL|HAL|||||||3|1|1|264.60|490.00|||7|
8978|ML|49|587.588.475||TBR|TBR|||||||3|1|1|183.60|340.00|||7|
8979|ML|49|587.588.242||TEA|TEA|||||||3|1|1|183.60|340.00|||7|
8980|ML|49|587.588.243||OAK|OAK|||||||3|1|1|183.60|340.00|||7|
8981|ML|49|587.588.244||JOP|JOP|||||||3|1|1|183.60|340.00|||7|
8982|ML|49|587.588.476||TBR|BCO|B||||||3|1|1|226.80|420.00|||7|
8983|ML|49|587.588.477||TBR|BCO|M||||||3|1|1|226.80|420.00|||7|
8984|ML|49|587.588.478||TBR|CCL|B||||||3|1|1|226.80|420.00|||7|
8985|ML|49|587.588.479||TBR|CCL|M||||||3|1|1|226.80|420.00|||7|
8986|ML|49|587.588.480||TBR|CME|B||||||3|1|1|226.80|420.00|||7|
8987|ML|49|587.588.481||TBR|CME|M||||||3|1|1|226.80|420.00|||7|
8988|ML|49|587.588.482||TBR|ANT|B||||||3|1|1|226.80|420.00|||7|
8989|ML|49|587.588.483||TBR|ANT|M||||||3|1|1|226.80|420.00|||7|
8990|ML|49|587.588.484||TBR|PTO|B||||||3|1|1|226.80|420.00|||7|
8991|ML|49|587.588.485||TBR|PTO|M||||||3|1|1|226.80|420.00|||7|
8992|ML|49|587.588.486||TBR|CRE|B||||||3|1|1|226.80|420.00|||7|
8993|ML|49|587.588.487||TBR|CRE|M||||||3|1|1|226.80|420.00|||7|
8994|ML|49|587.588.488||TBR|CAM|B||||||3|1|1|226.80|420.00|||7|
8995|ML|49|587.588.489||TBR|CAM|M||||||3|1|1|226.80|420.00|||7|
8996|ML|49|587.588.490||TBR|OUR|B||||||3|1|1|226.80|420.00|||7|
8997|ML|49|587.588.491||TBR|OUR|M||||||3|1|1|226.80|420.00|||7|
8998|ML|49|587.588.492||TBR|COB|B||||||3|1|1|226.80|420.00|||7|
8999|ML|49|587.588.493||TBR|COB|M||||||3|1|1|226.80|420.00|||7|
9000|ML|49|587.588.494||TBR|CHO|B||||||3|1|1|226.80|420.00|||7|
9001|ML|49|587.588.495||TBR|CHO|M||||||3|1|1|226.80|420.00|||7|
9002|ML|49|587.588.496||TBR|VAG|B||||||3|1|1|226.80|420.00|||7|
9003|ML|49|587.588.497||TBR|VAG|M||||||3|1|1|226.80|420.00|||7|
9004|ML|49|587.588.498||TBR|AZE|B||||||3|1|1|226.80|420.00|||7|
9005|ML|49|587.588.499||TBR|AZE|M||||||3|1|1|226.80|420.00|||7|
9006|ML|49|587.588.500||TBR|AMA|B||||||3|1|1|226.80|420.00|||7|
9007|ML|49|587.588.501||TBR|AMA|M||||||3|1|1|226.80|420.00|||7|
9008|ML|49|587.588.502||TBR|AES|B||||||3|1|1|226.80|420.00|||7|
9009|ML|49|587.588.503||TBR|AES|M||||||3|1|1|226.80|420.00|||7|
9010|ML|49|587.588.504||TBR|PRA|B||||||3|1|1|226.80|420.00|||7|
9011|ML|49|587.588.505||TBR|PRA|M||||||3|1|1|226.80|420.00|||7|
9012|ML|49|587.588.506||TBR|ROS|B||||||3|1|1|226.80|420.00|||7|
9013|ML|49|587.588.507||TBR|ROS|M||||||3|1|1|226.80|420.00|||7|
9014|ML|49|587.588.508||TBR|VER|B||||||3|1|1|226.80|420.00|||7|
9015|ML|49|587.588.509||TBR|VER|M||||||3|1|1|226.80|420.00|||7|
9016|ML|49|587.588.510||TBR|AZB|||||||3|1|1|226.80|420.00|||7|
9017|ML|49|587.588.511||TBR|DEN|||||||3|1|1|226.80|420.00|||7|
9018|ML|49|587.588.512||TBR|BLK|||||||3|1|1|226.80|420.00|||7|
9019|ML|49|587.588.513||TBR|ART|||||||3|1|1|226.80|420.00|||7|
9020|ML|49|587.588.514||TBR|LIN|||||||3|1|1|226.80|420.00|||7|
9021|ML|49|587.588.515||TBR|HAL|||||||3|1|1|226.80|420.00|||7|
9022|ML|49|587.588.516||BCO|BCO|B||||||3|1|1|248.40|460.00|||7|
9023|ML|49|587.588.517||BCO|BCO|M||||||3|1|1|248.40|460.00|||7|
9024|ML|49|587.588.518||CCL|CCL|B||||||3|1|1|248.40|460.00|||7|
9025|ML|49|587.588.519||CCL|CCL|M||||||3|1|1|248.40|460.00|||7|
9026|ML|49|587.588.520||CME|CME|B||||||3|1|1|248.40|460.00|||7|
9027|ML|49|587.588.521||CME|CME|M||||||3|1|1|248.40|460.00|||7|
9028|ML|49|587.588.522||ANT|ANT|B||||||3|1|1|248.40|460.00|||7|
9029|ML|49|587.588.523||ANT|ANT|M||||||3|1|1|248.40|460.00|||7|
9030|ML|49|587.588.524||PTO|PTO|B||||||3|1|1|248.40|460.00|||7|
9031|ML|49|587.588.525||PTO|PTO|M||||||3|1|1|248.40|460.00|||7|
9032|ML|49|587.588.526||CRE|CRE|B||||||3|1|1|248.40|460.00|||7|
9033|ML|49|587.588.527||CRE|CRE|M||||||3|1|1|248.40|460.00|||7|
9034|ML|49|587.588.528||CAM|CAM|B||||||3|1|1|248.40|460.00|||7|
9035|ML|49|587.588.529||CAM|CAM|M||||||3|1|1|248.40|460.00|||7|
9036|ML|49|587.588.530||OUR|OUR|B||||||3|1|1|248.40|460.00|||7|
9037|ML|49|587.588.531||OUR|OUR|M||||||3|1|1|248.40|460.00|||7|
9038|ML|49|587.588.532||COB|COB|B||||||3|1|1|248.40|460.00|||7|
9039|ML|49|587.588.533||COB|COB|M||||||3|1|1|248.40|460.00|||7|
9040|ML|49|587.588.534||CHO|CHO|B||||||3|1|1|248.40|460.00|||7|
9041|ML|49|587.588.535||CHO|CHO|M||||||3|1|1|248.40|460.00|||7|
9042|ML|49|587.588.536||VAG|VAG|B||||||3|1|1|248.40|460.00|||7|
9043|ML|49|587.588.537||VAG|VAG|M||||||3|1|1|248.40|460.00|||7|
9044|ML|49|587.588.538||AZE|AZE|B||||||3|1|1|248.40|460.00|||7|
9045|ML|49|587.588.539||AZE|AZE|M||||||3|1|1|248.40|460.00|||7|
9046|ML|49|587.588.540||AMA|AMA|B||||||3|1|1|248.40|460.00|||7|
9047|ML|49|587.588.541||AMA|AMA|M||||||3|1|1|248.40|460.00|||7|
9048|ML|49|587.588.542||AES|AES|B||||||3|1|1|248.40|460.00|||7|
9049|ML|49|587.588.543||AES|AES|M||||||3|1|1|248.40|460.00|||7|
9050|ML|49|587.588.544||PRA|PRA|B||||||3|1|1|248.40|460.00|||7|
9051|ML|49|587.588.545||PRA|PRA|M||||||3|1|1|248.40|460.00|||7|
9052|ML|49|587.588.546||ROS|ROS|B||||||3|1|1|248.40|460.00|||7|
9053|ML|49|587.588.547||ROS|ROS|M||||||3|1|1|248.40|460.00|||7|
9054|ML|49|587.588.548||VER|VER|B||||||3|1|1|248.40|460.00|||7|
9055|ML|49|587.588.549||VER|VER|M||||||3|1|1|248.40|460.00|||7|
9056|ML|49|587.588.550||AZB|AZB|||||||3|1|1|248.40|460.00|||7|
9057|ML|49|587.588.551||DEN|DEN|||||||3|1|1|248.40|460.00|||7|
9058|ML|49|587.588.552||BLK|BLK|||||||3|1|1|248.40|460.00|||7|
9059|ML|49|587.588.553||ART|ART|||||||3|1|1|248.40|460.00|||7|
9060|ML|49|587.588.554||LIN|LIN|||||||3|1|1|248.40|460.00|||7|
9061|ML|49|587.588.555||HAL|HAL|||||||3|1|1|248.40|460.00|||7|
9062|ML|50|589.590.394||TBR|TBR|||||||11|1|1|97.20|180.00|||7|
9063|ML|50|589.590.198||TEA|TEA|||||||11|1|1|97.20|180.00|||7|
9064|ML|50|589.590.199||OAK|OAK|||||||11|1|1|97.20|180.00|||7|
9065|ML|50|589.590.200||JOP|JOP|||||||11|1|1|97.20|180.00|||7|
9066|ML|50|589.590.395||TBR|BCO|B||||||11|1|1|140.40|260.00|||7|
9067|ML|50|589.590.396||TBR|BCO|M||||||11|1|1|140.40|260.00|||7|
9068|ML|50|589.590.397||TBR|CCL|B||||||11|1|1|140.40|260.00|||7|
9069|ML|50|589.590.398||TBR|CCL|M||||||11|1|1|140.40|260.00|||7|
9070|ML|50|589.590.399||TBR|CME|B||||||11|1|1|140.40|260.00|||7|
9071|ML|50|589.590.400||TBR|CME|M||||||11|1|1|140.40|260.00|||7|
9072|ML|50|589.590.401||TBR|ANT|B||||||11|1|1|140.40|260.00|||7|
9073|ML|50|589.590.402||TBR|ANT|M||||||11|1|1|140.40|260.00|||7|
9074|ML|50|589.590.403||TBR|PTO|B||||||11|1|1|140.40|260.00|||7|
9075|ML|50|589.590.404||TBR|PTO|M||||||11|1|1|140.40|260.00|||7|
9076|ML|50|589.590.405||TBR|CRE|B||||||11|1|1|140.40|260.00|||7|
9077|ML|50|589.590.406||TBR|CRE|M||||||11|1|1|140.40|260.00|||7|
9078|ML|50|589.590.407||TBR|CAM|B||||||11|1|1|140.40|260.00|||7|
9079|ML|50|589.590.408||TBR|CAM|M||||||11|1|1|140.40|260.00|||7|
9080|ML|50|589.590.409||TBR|OUR|B||||||11|1|1|140.40|260.00|||7|
9081|ML|50|589.590.410||TBR|OUR|M||||||11|1|1|140.40|260.00|||7|
9082|ML|50|589.590.411||TBR|COB|B||||||11|1|1|140.40|260.00|||7|
9083|ML|50|589.590.412||TBR|COB|M||||||11|1|1|140.40|260.00|||7|
9084|ML|50|589.590.413||TBR|CHO|B||||||11|1|1|140.40|260.00|||7|
9085|ML|50|589.590.414||TBR|CHO|M||||||11|1|1|140.40|260.00|||7|
9086|ML|50|589.590.415||TBR|VAG|B||||||11|1|1|140.40|260.00|||7|
9087|ML|50|589.590.416||TBR|VAG|M||||||11|1|1|140.40|260.00|||7|
9088|ML|50|589.590.417||TBR|AZE|B||||||11|1|1|140.40|260.00|||7|
9089|ML|50|589.590.418||TBR|AZE|M||||||11|1|1|140.40|260.00|||7|
9090|ML|50|589.590.419||TBR|AMA|B||||||11|1|1|140.40|260.00|||7|
9091|ML|50|589.590.420||TBR|AMA|M||||||11|1|1|140.40|260.00|||7|
9092|ML|50|589.590.421||TBR|AES|B||||||11|1|1|140.40|260.00|||7|
9093|ML|50|589.590.422||TBR|AES|M||||||11|1|1|140.40|260.00|||7|
9094|ML|50|589.590.423||TBR|PRA|B||||||11|1|1|140.40|260.00|||7|
9095|ML|50|589.590.424||TBR|PRA|M||||||11|1|1|140.40|260.00|||7|
9096|ML|50|589.590.425||TBR|ROS|B||||||11|1|1|140.40|260.00|||7|
9097|ML|50|589.590.426||TBR|ROS|M||||||11|1|1|140.40|260.00|||7|
9098|ML|50|589.590.427||TBR|VER|B||||||11|1|1|140.40|260.00|||7|
9099|ML|50|589.590.428||TBR|VER|M||||||11|1|1|140.40|260.00|||7|
9100|ML|50|589.590.429||TBR|AZB|||||||11|1|1|140.40|260.00|||7|
9101|ML|50|589.590.430||TBR|DEN|||||||11|1|1|140.40|260.00|||7|
9102|ML|50|589.590.431||TBR|BLK|||||||11|1|1|140.40|260.00|||7|
9103|ML|50|589.590.432||TBR|ART|||||||11|1|1|140.40|260.00|||7|
9104|ML|50|589.590.433||TBR|LIN|||||||11|1|1|140.40|260.00|||7|
9105|ML|50|589.590.434||TBR|HAL|||||||11|1|1|140.40|260.00|||7|
9106|ML|50|589.590.435||BCO|BCO|B||||||11|1|1|162.00|300.00|||7|
9107|ML|50|589.590.436||BCO|BCO|M||||||11|1|1|162.00|300.00|||7|
9108|ML|50|589.590.437||CCL|CCL|B||||||11|1|1|162.00|300.00|||7|
9109|ML|50|589.590.438||CCL|CCL|M||||||11|1|1|162.00|300.00|||7|
9110|ML|50|589.590.439||CME|CME|B||||||11|1|1|162.00|300.00|||7|
9111|ML|50|589.590.440||CME|CME|M||||||11|1|1|162.00|300.00|||7|
9112|ML|50|589.590.441||ANT|ANT|B||||||11|1|1|162.00|300.00|||7|
9113|ML|50|589.590.442||ANT|ANT|M||||||11|1|1|162.00|300.00|||7|
9114|ML|50|589.590.443||PTO|PTO|B||||||11|1|1|162.00|300.00|||7|
9115|ML|50|589.590.444||PTO|PTO|M||||||11|1|1|162.00|300.00|||7|
9116|ML|50|589.590.445||CRE|CRE|B||||||11|1|1|162.00|300.00|||7|
9117|ML|50|589.590.446||CRE|CRE|M||||||11|1|1|162.00|300.00|||7|
9118|ML|50|589.590.447||CAM|CAM|B||||||11|1|1|162.00|300.00|||7|
9119|ML|50|589.590.448||CAM|CAM|M||||||11|1|1|162.00|300.00|||7|
9120|ML|50|589.590.449||OUR|OUR|B||||||11|1|1|162.00|300.00|||7|
9121|ML|50|589.590.450||OUR|OUR|M||||||11|1|1|162.00|300.00|||7|
9122|ML|50|589.590.451||COB|COB|B||||||11|1|1|162.00|300.00|||7|
9123|ML|50|589.590.452||COB|COB|M||||||11|1|1|162.00|300.00|||7|
9124|ML|50|589.590.453||CHO|CHO|B||||||11|1|1|162.00|300.00|||7|
9125|ML|50|589.590.454||CHO|CHO|M||||||11|1|1|162.00|300.00|||7|
9126|ML|50|589.590.455||VAG|VAG|B||||||11|1|1|162.00|300.00|||7|
9127|ML|50|589.590.456||VAG|VAG|M||||||11|1|1|162.00|300.00|||7|
9128|ML|50|589.590.457||AZE|AZE|B||||||11|1|1|162.00|300.00|||7|
9129|ML|50|589.590.458||AZE|AZE|M||||||11|1|1|162.00|300.00|||7|
9130|ML|50|589.590.459||AMA|AMA|B||||||11|1|1|162.00|300.00|||7|
9131|ML|50|589.590.460||AMA|AMA|M||||||11|1|1|162.00|300.00|||7|
9132|ML|50|589.590.461||AES|AES|B||||||11|1|1|162.00|300.00|||7|
9133|ML|50|589.590.462||AES|AES|M||||||11|1|1|162.00|300.00|||7|
9134|ML|50|589.590.463||PRA|PRA|B||||||11|1|1|162.00|300.00|||7|
9135|ML|50|589.590.464||PRA|PRA|M||||||11|1|1|162.00|300.00|||7|
9136|ML|50|589.590.465||ROS|ROS|B||||||11|1|1|162.00|300.00|||7|
9137|ML|50|589.590.466||ROS|ROS|M||||||11|1|1|162.00|300.00|||7|
9138|ML|50|589.590.467||VER|VER|B||||||11|1|1|162.00|300.00|||7|
9139|ML|50|589.590.468||VER|VER|M||||||11|1|1|162.00|300.00|||7|
9140|ML|50|589.590.469||AZB|AZB|||||||11|1|1|162.00|300.00|||7|
9141|ML|50|589.590.470||DEN|DEN|||||||11|1|1|162.00|300.00|||7|
9142|ML|50|589.590.471||BLK|BLK|||||||11|1|1|162.00|300.00|||7|
9143|ML|50|589.590.472||ART|ART|||||||11|1|1|162.00|300.00|||7|
9144|ML|50|589.590.473||LIN|LIN|||||||11|1|1|162.00|300.00|||7|
9145|ML|50|589.590.474||HAL|HAL|||||||11|1|1|162.00|300.00|||7|
9146|ML|50|591.590.394||TBR|TBR|||||||12|1|1|103.68|192.00|||7|
9147|ML|50|591.590.198||TEA|TEA|||||||12|1|1|103.68|192.00|||7|
9148|ML|50|591.590.199||OAK|OAK|||||||12|1|1|103.68|192.00|||7|
9149|ML|50|591.590.200||JOP|JOP|||||||12|1|1|103.68|192.00|||7|
9150|ML|50|591.590.395||TBR|BCO|B||||||12|1|1|146.88|272.00|||7|
9151|ML|50|591.590.396||TBR|BCO|M||||||12|1|1|146.88|272.00|||7|
9152|ML|50|591.590.397||TBR|CCL|B||||||12|1|1|146.88|272.00|||7|
9153|ML|50|591.590.398||TBR|CCL|M||||||12|1|1|146.88|272.00|||7|
9154|ML|50|591.590.399||TBR|CME|B||||||12|1|1|146.88|272.00|||7|
9155|ML|50|591.590.400||TBR|CME|M||||||12|1|1|146.88|272.00|||7|
9156|ML|50|591.590.401||TBR|ANT|B||||||12|1|1|146.88|272.00|||7|
9157|ML|50|591.590.402||TBR|ANT|M||||||12|1|1|146.88|272.00|||7|
9158|ML|50|591.590.403||TBR|PTO|B||||||12|1|1|146.88|272.00|||7|
9159|ML|50|591.590.404||TBR|PTO|M||||||12|1|1|146.88|272.00|||7|
9160|ML|50|591.590.405||TBR|CRE|B||||||12|1|1|146.88|272.00|||7|
9161|ML|50|591.590.406||TBR|CRE|M||||||12|1|1|146.88|272.00|||7|
9162|ML|50|591.590.407||TBR|CAM|B||||||12|1|1|146.88|272.00|||7|
9163|ML|50|591.590.408||TBR|CAM|M||||||12|1|1|146.88|272.00|||7|
9164|ML|50|591.590.409||TBR|OUR|B||||||12|1|1|146.88|272.00|||7|
9165|ML|50|591.590.410||TBR|OUR|M||||||12|1|1|146.88|272.00|||7|
9166|ML|50|591.590.411||TBR|COB|B||||||12|1|1|146.88|272.00|||7|
9167|ML|50|591.590.412||TBR|COB|M||||||12|1|1|146.88|272.00|||7|
9168|ML|50|591.590.413||TBR|CHO|B||||||12|1|1|146.88|272.00|||7|
9169|ML|50|591.590.414||TBR|CHO|M||||||12|1|1|146.88|272.00|||7|
9170|ML|50|591.590.415||TBR|VAG|B||||||12|1|1|146.88|272.00|||7|
9171|ML|50|591.590.416||TBR|VAG|M||||||12|1|1|146.88|272.00|||7|
9172|ML|50|591.590.417||TBR|AZE|B||||||12|1|1|146.88|272.00|||7|
9173|ML|50|591.590.418||TBR|AZE|M||||||12|1|1|146.88|272.00|||7|
9174|ML|50|591.590.419||TBR|AMA|B||||||12|1|1|146.88|272.00|||7|
9175|ML|50|591.590.420||TBR|AMA|M||||||12|1|1|146.88|272.00|||7|
9176|ML|50|591.590.421||TBR|AES|B||||||12|1|1|146.88|272.00|||7|
9177|ML|50|591.590.422||TBR|AES|M||||||12|1|1|146.88|272.00|||7|
9178|ML|50|591.590.423||TBR|PRA|B||||||12|1|1|146.88|272.00|||7|
9179|ML|50|591.590.424||TBR|PRA|M||||||12|1|1|146.88|272.00|||7|
9180|ML|50|591.590.425||TBR|ROS|B||||||12|1|1|146.88|272.00|||7|
9181|ML|50|591.590.426||TBR|ROS|M||||||12|1|1|146.88|272.00|||7|
9182|ML|50|591.590.427||TBR|VER|B||||||12|1|1|146.88|272.00|||7|
9183|ML|50|591.590.428||TBR|VER|M||||||12|1|1|146.88|272.00|||7|
9184|ML|50|591.590.429||TBR|AZB|||||||12|1|1|146.88|272.00|||7|
9185|ML|50|591.590.430||TBR|DEN|||||||12|1|1|146.88|272.00|||7|
9186|ML|50|591.590.431||TBR|BLK|||||||12|1|1|146.88|272.00|||7|
9187|ML|50|591.590.432||TBR|ART|||||||12|1|1|146.88|272.00|||7|
9188|ML|50|591.590.433||TBR|LIN|||||||12|1|1|146.88|272.00|||7|
9189|ML|50|591.590.434||TBR|HAL|||||||12|1|1|146.88|272.00|||7|
9190|ML|50|591.590.435||BCO|BCO|B||||||12|1|1|168.48|312.00|||7|
9191|ML|50|591.590.436||BCO|BCO|M||||||12|1|1|168.48|312.00|||7|
9192|ML|50|591.590.437||CCL|CCL|B||||||12|1|1|168.48|312.00|||7|
9193|ML|50|591.590.438||CCL|CCL|M||||||12|1|1|168.48|312.00|||7|
9194|ML|50|591.590.439||CME|CME|B||||||12|1|1|168.48|312.00|||7|
9195|ML|50|591.590.440||CME|CME|M||||||12|1|1|168.48|312.00|||7|
9196|ML|50|591.590.441||ANT|ANT|B||||||12|1|1|168.48|312.00|||7|
9197|ML|50|591.590.442||ANT|ANT|M||||||12|1|1|168.48|312.00|||7|
9198|ML|50|591.590.443||PTO|PTO|B||||||12|1|1|168.48|312.00|||7|
9199|ML|50|591.590.444||PTO|PTO|M||||||12|1|1|168.48|312.00|||7|
9200|ML|50|591.590.445||CRE|CRE|B||||||12|1|1|168.48|312.00|||7|
9201|ML|50|591.590.446||CRE|CRE|M||||||12|1|1|168.48|312.00|||7|
9202|ML|50|591.590.447||CAM|CAM|B||||||12|1|1|168.48|312.00|||7|
9203|ML|50|591.590.448||CAM|CAM|M||||||12|1|1|168.48|312.00|||7|
9204|ML|50|591.590.449||OUR|OUR|B||||||12|1|1|168.48|312.00|||7|
9205|ML|50|591.590.450||OUR|OUR|M||||||12|1|1|168.48|312.00|||7|
9206|ML|50|591.590.451||COB|COB|B||||||12|1|1|168.48|312.00|||7|
9207|ML|50|591.590.452||COB|COB|M||||||12|1|1|168.48|312.00|||7|
9208|ML|50|591.590.453||CHO|CHO|B||||||12|1|1|168.48|312.00|||7|
9209|ML|50|591.590.454||CHO|CHO|M||||||12|1|1|168.48|312.00|||7|
9210|ML|50|591.590.455||VAG|VAG|B||||||12|1|1|168.48|312.00|||7|
9211|ML|50|591.590.456||VAG|VAG|M||||||12|1|1|168.48|312.00|||7|
9212|ML|50|591.590.457||AZE|AZE|B||||||12|1|1|168.48|312.00|||7|
9213|ML|50|591.590.458||AZE|AZE|M||||||12|1|1|168.48|312.00|||7|
9214|ML|50|591.590.459||AMA|AMA|B||||||12|1|1|168.48|312.00|||7|
9215|ML|50|591.590.460||AMA|AMA|M||||||12|1|1|168.48|312.00|||7|
9216|ML|50|591.590.461||AES|AES|B||||||12|1|1|168.48|312.00|||7|
9217|ML|50|591.590.462||AES|AES|M||||||12|1|1|168.48|312.00|||7|
9218|ML|50|591.590.463||PRA|PRA|B||||||12|1|1|168.48|312.00|||7|
9219|ML|50|591.590.464||PRA|PRA|M||||||12|1|1|168.48|312.00|||7|
9220|ML|50|591.590.465||ROS|ROS|B||||||12|1|1|168.48|312.00|||7|
9221|ML|50|591.590.466||ROS|ROS|M||||||12|1|1|168.48|312.00|||7|
9222|ML|50|591.590.467||VER|VER|B||||||12|1|1|168.48|312.00|||7|
9223|ML|50|591.590.468||VER|VER|M||||||12|1|1|168.48|312.00|||7|
9224|ML|50|591.590.469||AZB|AZB|||||||12|1|1|168.48|312.00|||7|
9225|ML|50|591.590.470||DEN|DEN|||||||12|1|1|168.48|312.00|||7|
9226|ML|50|591.590.471||BLK|BLK|||||||12|1|1|168.48|312.00|||7|
9227|ML|50|591.590.472||ART|ART|||||||12|1|1|168.48|312.00|||7|
9228|ML|50|591.590.473||LIN|LIN|||||||12|1|1|168.48|312.00|||7|
9229|ML|50|591.590.474||HAL|HAL|||||||12|1|1|168.48|312.00|||7|
9230|ML|51|592.593.394||TBR|TBR|||||||20|1|1|86.94|161.00|||8|
9231|ML|51|592.593.198||TEA|TEA|||||||20|1|1|86.94|161.00|||8|
9232|ML|51|592.593.199||OAK|OAK|||||||20|1|1|86.94|161.00|||8|
9233|ML|51|592.593.200||JOP|JOP|||||||20|1|1|86.94|161.00|||8|
9234|ML|51|592.593.395||TBR|BCO|B||||||20|1|1|130.14|241.00|||8|
9235|ML|51|592.593.396||TBR|BCO|M||||||20|1|1|130.14|241.00|||8|
9236|ML|51|592.593.397||TBR|CCL|B||||||20|1|1|130.14|241.00|||8|
9237|ML|51|592.593.398||TBR|CCL|M||||||20|1|1|130.14|241.00|||8|
9238|ML|51|592.593.399||TBR|CME|B||||||20|1|1|130.14|241.00|||8|
9239|ML|51|592.593.400||TBR|CME|M||||||20|1|1|130.14|241.00|||8|
9240|ML|51|592.593.401||TBR|ANT|B||||||20|1|1|130.14|241.00|||8|
9241|ML|51|592.593.402||TBR|ANT|M||||||20|1|1|130.14|241.00|||8|
9242|ML|51|592.593.403||TBR|PTO|B||||||20|1|1|130.14|241.00|||8|
9243|ML|51|592.593.404||TBR|PTO|M||||||20|1|1|130.14|241.00|||8|
9244|ML|51|592.593.405||TBR|CRE|B||||||20|1|1|130.14|241.00|||8|
9245|ML|51|592.593.406||TBR|CRE|M||||||20|1|1|130.14|241.00|||8|
9246|ML|51|592.593.407||TBR|CAM|B||||||20|1|1|130.14|241.00|||8|
9247|ML|51|592.593.408||TBR|CAM|M||||||20|1|1|130.14|241.00|||8|
9248|ML|51|592.593.409||TBR|OUR|B||||||20|1|1|130.14|241.00|||8|
9249|ML|51|592.593.410||TBR|OUR|M||||||20|1|1|130.14|241.00|||8|
9250|ML|51|592.593.411||TBR|COB|B||||||20|1|1|130.14|241.00|||8|
9251|ML|51|592.593.412||TBR|COB|M||||||20|1|1|130.14|241.00|||8|
9252|ML|51|592.593.413||TBR|CHO|B||||||20|1|1|130.14|241.00|||8|
9253|ML|51|592.593.414||TBR|CHO|M||||||20|1|1|130.14|241.00|||8|
9254|ML|51|592.593.415||TBR|VAG|B||||||20|1|1|130.14|241.00|||8|
9255|ML|51|592.593.416||TBR|VAG|M||||||20|1|1|130.14|241.00|||8|
9256|ML|51|592.593.417||TBR|AZE|B||||||20|1|1|130.14|241.00|||8|
9257|ML|51|592.593.418||TBR|AZE|M||||||20|1|1|130.14|241.00|||8|
9258|ML|51|592.593.419||TBR|AMA|B||||||20|1|1|130.14|241.00|||8|
9259|ML|51|592.593.420||TBR|AMA|M||||||20|1|1|130.14|241.00|||8|
9260|ML|51|592.593.421||TBR|AES|B||||||20|1|1|130.14|241.00|||8|
9261|ML|51|592.593.422||TBR|AES|M||||||20|1|1|130.14|241.00|||8|
9262|ML|51|592.593.423||TBR|PRA|B||||||20|1|1|130.14|241.00|||8|
9263|ML|51|592.593.424||TBR|PRA|M||||||20|1|1|130.14|241.00|||8|
9264|ML|51|592.593.425||TBR|ROS|B||||||20|1|1|130.14|241.00|||8|
9265|ML|51|592.593.426||TBR|ROS|M||||||20|1|1|130.14|241.00|||8|
9266|ML|51|592.593.427||TBR|VER|B||||||20|1|1|130.14|241.00|||8|
9267|ML|51|592.593.428||TBR|VER|M||||||20|1|1|130.14|241.00|||8|
9268|ML|51|592.593.429||TBR|AZB|||||||20|1|1|130.14|241.00|||8|
9269|ML|51|592.593.430||TBR|DEN|||||||20|1|1|130.14|241.00|||8|
9270|ML|51|592.593.431||TBR|BLK|||||||20|1|1|130.14|241.00|||8|
9271|ML|51|592.593.432||TBR|ART|||||||20|1|1|130.14|241.00|||8|
9272|ML|51|592.593.433||TBR|LIN|||||||20|1|1|130.14|241.00|||8|
9273|ML|51|592.593.434||TBR|HAL|||||||20|1|1|130.14|241.00|||8|
9274|ML|51|592.593.435||BCO|BCO|B||||||20|1|1|151.74|281.00|||8|
9275|ML|51|592.593.436||BCO|BCO|M||||||20|1|1|151.74|281.00|||8|
9276|ML|51|592.593.437||CCL|CCL|B||||||20|1|1|151.74|281.00|||8|
9277|ML|51|592.593.438||CCL|CCL|M||||||20|1|1|151.74|281.00|||8|
9278|ML|51|592.593.439||CME|CME|B||||||20|1|1|151.74|281.00|||8|
9279|ML|51|592.593.440||CME|CME|M||||||20|1|1|151.74|281.00|||8|
9280|ML|51|592.593.441||ANT|ANT|B||||||20|1|1|151.74|281.00|||8|
9281|ML|51|592.593.442||ANT|ANT|M||||||20|1|1|151.74|281.00|||8|
9282|ML|51|592.593.443||PTO|PTO|B||||||20|1|1|151.74|281.00|||8|
9283|ML|51|592.593.444||PTO|PTO|M||||||20|1|1|151.74|281.00|||8|
9284|ML|51|592.593.445||CRE|CRE|B||||||20|1|1|151.74|281.00|||8|
9285|ML|51|592.593.446||CRE|CRE|M||||||20|1|1|151.74|281.00|||8|
9286|ML|51|592.593.447||CAM|CAM|B||||||20|1|1|151.74|281.00|||8|
9287|ML|51|592.593.448||CAM|CAM|M||||||20|1|1|151.74|281.00|||8|
9288|ML|51|592.593.449||OUR|OUR|B||||||20|1|1|151.74|281.00|||8|
9289|ML|51|592.593.450||OUR|OUR|M||||||20|1|1|151.74|281.00|||8|
9290|ML|51|592.593.451||COB|COB|B||||||20|1|1|151.74|281.00|||8|
9291|ML|51|592.593.452||COB|COB|M||||||20|1|1|151.74|281.00|||8|
9292|ML|51|592.593.453||CHO|CHO|B||||||20|1|1|151.74|281.00|||8|
9293|ML|51|592.593.454||CHO|CHO|M||||||20|1|1|151.74|281.00|||8|
9294|ML|51|592.593.455||VAG|VAG|B||||||20|1|1|151.74|281.00|||8|
9295|ML|51|592.593.456||VAG|VAG|M||||||20|1|1|151.74|281.00|||8|
9296|ML|51|592.593.457||AZE|AZE|B||||||20|1|1|151.74|281.00|||8|
9297|ML|51|592.593.458||AZE|AZE|M||||||20|1|1|151.74|281.00|||8|
9298|ML|51|592.593.459||AMA|AMA|B||||||20|1|1|151.74|281.00|||8|
9299|ML|51|592.593.460||AMA|AMA|M||||||20|1|1|151.74|281.00|||8|
9300|ML|51|592.593.461||AES|AES|B||||||20|1|1|151.74|281.00|||8|
9301|ML|51|592.593.462||AES|AES|M||||||20|1|1|151.74|281.00|||8|
9302|ML|51|592.593.463||PRA|PRA|B||||||20|1|1|151.74|281.00|||8|
9303|ML|51|592.593.464||PRA|PRA|M||||||20|1|1|151.74|281.00|||8|
9304|ML|51|592.593.465||ROS|ROS|B||||||20|1|1|151.74|281.00|||8|
9305|ML|51|592.593.466||ROS|ROS|M||||||20|1|1|151.74|281.00|||8|
9306|ML|51|592.593.467||VER|VER|B||||||20|1|1|151.74|281.00|||8|
9307|ML|51|592.593.468||VER|VER|M||||||20|1|1|151.74|281.00|||8|
9308|ML|51|592.593.469||AZB|AZB|||||||20|1|1|151.74|281.00|||8|
9309|ML|51|592.593.470||DEN|DEN|||||||20|1|1|151.74|281.00|||8|
9310|ML|51|592.593.471||BLK|BLK|||||||20|1|1|151.74|281.00|||8|
9311|ML|51|592.593.472||ART|ART|||||||20|1|1|151.74|281.00|||8|
9312|ML|51|592.593.473||LIN|LIN|||||||20|1|1|151.74|281.00|||8|
9313|ML|51|592.593.474||HAL|HAL|||||||20|1|1|151.74|281.00|||8|
9314|ML|51|594.593.394||TBR|TBR|||||||21|1|1|99.36|184.00|||8|
9315|ML|51|594.593.198||TEA|TEA|||||||21|1|1|99.36|184.00|||8|
9316|ML|51|594.593.199||OAK|OAK|||||||21|1|1|99.36|184.00|||8|
9317|ML|51|594.593.200||JOP|JOP|||||||21|1|1|99.36|184.00|||8|
9318|ML|51|594.593.395||TBR|BCO|B||||||21|1|1|142.56|264.00|||8|
9319|ML|51|594.593.396||TBR|BCO|M||||||21|1|1|142.56|264.00|||8|
9320|ML|51|594.593.397||TBR|CCL|B||||||21|1|1|142.56|264.00|||8|
9321|ML|51|594.593.398||TBR|CCL|M||||||21|1|1|142.56|264.00|||8|
9322|ML|51|594.593.399||TBR|CME|B||||||21|1|1|142.56|264.00|||8|
9323|ML|51|594.593.400||TBR|CME|M||||||21|1|1|142.56|264.00|||8|
9324|ML|51|594.593.401||TBR|ANT|B||||||21|1|1|142.56|264.00|||8|
9325|ML|51|594.593.402||TBR|ANT|M||||||21|1|1|142.56|264.00|||8|
9326|ML|51|594.593.403||TBR|PTO|B||||||21|1|1|142.56|264.00|||8|
9327|ML|51|594.593.404||TBR|PTO|M||||||21|1|1|142.56|264.00|||8|
9328|ML|51|594.593.405||TBR|CRE|B||||||21|1|1|142.56|264.00|||8|
9329|ML|51|594.593.406||TBR|CRE|M||||||21|1|1|142.56|264.00|||8|
9330|ML|51|594.593.407||TBR|CAM|B||||||21|1|1|142.56|264.00|||8|
9331|ML|51|594.593.408||TBR|CAM|M||||||21|1|1|142.56|264.00|||8|
9332|ML|51|594.593.409||TBR|OUR|B||||||21|1|1|142.56|264.00|||8|
9333|ML|51|594.593.410||TBR|OUR|M||||||21|1|1|142.56|264.00|||8|
9334|ML|51|594.593.411||TBR|COB|B||||||21|1|1|142.56|264.00|||8|
9335|ML|51|594.593.412||TBR|COB|M||||||21|1|1|142.56|264.00|||8|
9336|ML|51|594.593.413||TBR|CHO|B||||||21|1|1|142.56|264.00|||8|
9337|ML|51|594.593.414||TBR|CHO|M||||||21|1|1|142.56|264.00|||8|
9338|ML|51|594.593.415||TBR|VAG|B||||||21|1|1|142.56|264.00|||8|
9339|ML|51|594.593.416||TBR|VAG|M||||||21|1|1|142.56|264.00|||8|
9340|ML|51|594.593.417||TBR|AZE|B||||||21|1|1|142.56|264.00|||8|
9341|ML|51|594.593.418||TBR|AZE|M||||||21|1|1|142.56|264.00|||8|
9342|ML|51|594.593.419||TBR|AMA|B||||||21|1|1|142.56|264.00|||8|
9343|ML|51|594.593.420||TBR|AMA|M||||||21|1|1|142.56|264.00|||8|
9344|ML|51|594.593.421||TBR|AES|B||||||21|1|1|142.56|264.00|||8|
9345|ML|51|594.593.422||TBR|AES|M||||||21|1|1|142.56|264.00|||8|
9346|ML|51|594.593.423||TBR|PRA|B||||||21|1|1|142.56|264.00|||8|
9347|ML|51|594.593.424||TBR|PRA|M||||||21|1|1|142.56|264.00|||8|
9348|ML|51|594.593.425||TBR|ROS|B||||||21|1|1|142.56|264.00|||8|
9349|ML|51|594.593.426||TBR|ROS|M||||||21|1|1|142.56|264.00|||8|
9350|ML|51|594.593.427||TBR|VER|B||||||21|1|1|142.56|264.00|||8|
9351|ML|51|594.593.428||TBR|VER|M||||||21|1|1|142.56|264.00|||8|
9352|ML|51|594.593.429||TBR|AZB|||||||21|1|1|142.56|264.00|||8|
9353|ML|51|594.593.430||TBR|DEN|||||||21|1|1|142.56|264.00|||8|
9354|ML|51|594.593.431||TBR|BLK|||||||21|1|1|142.56|264.00|||8|
9355|ML|51|594.593.432||TBR|ART|||||||21|1|1|142.56|264.00|||8|
9356|ML|51|594.593.433||TBR|LIN|||||||21|1|1|142.56|264.00|||8|
9357|ML|51|594.593.434||TBR|HAL|||||||21|1|1|142.56|264.00|||8|
9358|ML|51|594.593.435||BCO|BCO|B||||||21|1|1|164.16|304.00|||8|
9359|ML|51|594.593.436||BCO|BCO|M||||||21|1|1|164.16|304.00|||8|
9360|ML|51|594.593.437||CCL|CCL|B||||||21|1|1|164.16|304.00|||8|
9361|ML|51|594.593.438||CCL|CCL|M||||||21|1|1|164.16|304.00|||8|
9362|ML|51|594.593.439||CME|CME|B||||||21|1|1|164.16|304.00|||8|
9363|ML|51|594.593.440||CME|CME|M||||||21|1|1|164.16|304.00|||8|
9364|ML|51|594.593.441||ANT|ANT|B||||||21|1|1|164.16|304.00|||8|
9365|ML|51|594.593.442||ANT|ANT|M||||||21|1|1|164.16|304.00|||8|
9366|ML|51|594.593.443||PTO|PTO|B||||||21|1|1|164.16|304.00|||8|
9367|ML|51|594.593.444||PTO|PTO|M||||||21|1|1|164.16|304.00|||8|
9368|ML|51|594.593.445||CRE|CRE|B||||||21|1|1|164.16|304.00|||8|
9369|ML|51|594.593.446||CRE|CRE|M||||||21|1|1|164.16|304.00|||8|
9370|ML|51|594.593.447||CAM|CAM|B||||||21|1|1|164.16|304.00|||8|
9371|ML|51|594.593.448||CAM|CAM|M||||||21|1|1|164.16|304.00|||8|
9372|ML|51|594.593.449||OUR|OUR|B||||||21|1|1|164.16|304.00|||8|
9373|ML|51|594.593.450||OUR|OUR|M||||||21|1|1|164.16|304.00|||8|
9374|ML|51|594.593.451||COB|COB|B||||||21|1|1|164.16|304.00|||8|
9375|ML|51|594.593.452||COB|COB|M||||||21|1|1|164.16|304.00|||8|
9376|ML|51|594.593.453||CHO|CHO|B||||||21|1|1|164.16|304.00|||8|
9377|ML|51|594.593.454||CHO|CHO|M||||||21|1|1|164.16|304.00|||8|
9378|ML|51|594.593.455||VAG|VAG|B||||||21|1|1|164.16|304.00|||8|
9379|ML|51|594.593.456||VAG|VAG|M||||||21|1|1|164.16|304.00|||8|
9380|ML|51|594.593.457||AZE|AZE|B||||||21|1|1|164.16|304.00|||8|
9381|ML|51|594.593.458||AZE|AZE|M||||||21|1|1|164.16|304.00|||8|
9382|ML|51|594.593.459||AMA|AMA|B||||||21|1|1|164.16|304.00|||8|
9383|ML|51|594.593.460||AMA|AMA|M||||||21|1|1|164.16|304.00|||8|
9384|ML|51|594.593.461||AES|AES|B||||||21|1|1|164.16|304.00|||8|
9385|ML|51|594.593.462||AES|AES|M||||||21|1|1|164.16|304.00|||8|
9386|ML|51|594.593.463||PRA|PRA|B||||||21|1|1|164.16|304.00|||8|
9387|ML|51|594.593.464||PRA|PRA|M||||||21|1|1|164.16|304.00|||8|
9388|ML|51|594.593.465||ROS|ROS|B||||||21|1|1|164.16|304.00|||8|
9389|ML|51|594.593.466||ROS|ROS|M||||||21|1|1|164.16|304.00|||8|
9390|ML|51|594.593.467||VER|VER|B||||||21|1|1|164.16|304.00|||8|
9391|ML|51|594.593.468||VER|VER|M||||||21|1|1|164.16|304.00|||8|
9392|ML|51|594.593.469||AZB|AZB|||||||21|1|1|164.16|304.00|||8|
9393|ML|51|594.593.470||DEN|DEN|||||||21|1|1|164.16|304.00|||8|
9394|ML|51|594.593.471||BLK|BLK|||||||21|1|1|164.16|304.00|||8|
9395|ML|51|594.593.472||ART|ART|||||||21|1|1|164.16|304.00|||8|
9396|ML|51|594.593.473||LIN|LIN|||||||21|1|1|164.16|304.00|||8|
9397|ML|51|594.593.474||HAL|HAL|||||||21|1|1|164.16|304.00|||8|
9398|ML|52|595.596.394||TBR|TBR|||||||23|1|1|124.20|230.00|||8|
9399|ML|52|595.596.198||TEA|TEA|||||||23|1|1|124.20|230.00|||8|
9400|ML|52|595.596.199||OAK|OAK|||||||23|1|1|124.20|230.00|||8|
9401|ML|52|595.596.200||JOP|JOP|||||||23|1|1|124.20|230.00|||8|
9402|ML|52|595.596.395||TBR|BCO|B||||||23|1|1|167.40|310.00|||8|
9403|ML|52|595.596.396||TBR|BCO|M||||||23|1|1|167.40|310.00|||8|
9404|ML|52|595.596.397||TBR|CCL|B||||||23|1|1|167.40|310.00|||8|
9405|ML|52|595.596.398||TBR|CCL|M||||||23|1|1|167.40|310.00|||8|
9406|ML|52|595.596.399||TBR|CME|B||||||23|1|1|167.40|310.00|||8|
9407|ML|52|595.596.400||TBR|CME|M||||||23|1|1|167.40|310.00|||8|
9408|ML|52|595.596.401||TBR|ANT|B||||||23|1|1|167.40|310.00|||8|
9409|ML|52|595.596.402||TBR|ANT|M||||||23|1|1|167.40|310.00|||8|
9410|ML|52|595.596.403||TBR|PTO|B||||||23|1|1|167.40|310.00|||8|
9411|ML|52|595.596.404||TBR|PTO|M||||||23|1|1|167.40|310.00|||8|
9412|ML|52|595.596.405||TBR|CRE|B||||||23|1|1|167.40|310.00|||8|
9413|ML|52|595.596.406||TBR|CRE|M||||||23|1|1|167.40|310.00|||8|
9414|ML|52|595.596.407||TBR|CAM|B||||||23|1|1|167.40|310.00|||8|
9415|ML|52|595.596.408||TBR|CAM|M||||||23|1|1|167.40|310.00|||8|
9416|ML|52|595.596.409||TBR|OUR|B||||||23|1|1|167.40|310.00|||8|
9417|ML|52|595.596.410||TBR|OUR|M||||||23|1|1|167.40|310.00|||8|
9418|ML|52|595.596.411||TBR|COB|B||||||23|1|1|167.40|310.00|||8|
9419|ML|52|595.596.412||TBR|COB|M||||||23|1|1|167.40|310.00|||8|
9420|ML|52|595.596.413||TBR|CHO|B||||||23|1|1|167.40|310.00|||8|
9421|ML|52|595.596.414||TBR|CHO|M||||||23|1|1|167.40|310.00|||8|
9422|ML|52|595.596.415||TBR|VAG|B||||||23|1|1|167.40|310.00|||8|
9423|ML|52|595.596.416||TBR|VAG|M||||||23|1|1|167.40|310.00|||8|
9424|ML|52|595.596.417||TBR|AZE|B||||||23|1|1|167.40|310.00|||8|
9425|ML|52|595.596.418||TBR|AZE|M||||||23|1|1|167.40|310.00|||8|
9426|ML|52|595.596.419||TBR|AMA|B||||||23|1|1|167.40|310.00|||8|
9427|ML|52|595.596.420||TBR|AMA|M||||||23|1|1|167.40|310.00|||8|
9428|ML|52|595.596.421||TBR|AES|B||||||23|1|1|167.40|310.00|||8|
9429|ML|52|595.596.422||TBR|AES|M||||||23|1|1|167.40|310.00|||8|
9430|ML|52|595.596.423||TBR|PRA|B||||||23|1|1|167.40|310.00|||8|
9431|ML|52|595.596.424||TBR|PRA|M||||||23|1|1|167.40|310.00|||8|
9432|ML|52|595.596.425||TBR|ROS|B||||||23|1|1|167.40|310.00|||8|
9433|ML|52|595.596.426||TBR|ROS|M||||||23|1|1|167.40|310.00|||8|
9434|ML|52|595.596.427||TBR|VER|B||||||23|1|1|167.40|310.00|||8|
9435|ML|52|595.596.428||TBR|VER|M||||||23|1|1|167.40|310.00|||8|
9436|ML|52|595.596.429||TBR|AZB|||||||23|1|1|167.40|310.00|||8|
9437|ML|52|595.596.430||TBR|DEN|||||||23|1|1|167.40|310.00|||8|
9438|ML|52|595.596.431||TBR|BLK|||||||23|1|1|167.40|310.00|||8|
9439|ML|52|595.596.432||TBR|ART|||||||23|1|1|167.40|310.00|||8|
9440|ML|52|595.596.433||TBR|LIN|||||||23|1|1|167.40|310.00|||8|
9441|ML|52|595.596.434||TBR|HAL|||||||23|1|1|167.40|310.00|||8|
9442|ML|52|595.596.435||BCO|BCO|B||||||23|1|1|189.00|350.00|||8|
9443|ML|52|595.596.436||BCO|BCO|M||||||23|1|1|189.00|350.00|||8|
9444|ML|52|595.596.437||CCL|CCL|B||||||23|1|1|189.00|350.00|||8|
9445|ML|52|595.596.438||CCL|CCL|M||||||23|1|1|189.00|350.00|||8|
9446|ML|52|595.596.439||CME|CME|B||||||23|1|1|189.00|350.00|||8|
9447|ML|52|595.596.440||CME|CME|M||||||23|1|1|189.00|350.00|||8|
9448|ML|52|595.596.441||ANT|ANT|B||||||23|1|1|189.00|350.00|||8|
9449|ML|52|595.596.442||ANT|ANT|M||||||23|1|1|189.00|350.00|||8|
9450|ML|52|595.596.443||PTO|PTO|B||||||23|1|1|189.00|350.00|||8|
9451|ML|52|595.596.444||PTO|PTO|M||||||23|1|1|189.00|350.00|||8|
9452|ML|52|595.596.445||CRE|CRE|B||||||23|1|1|189.00|350.00|||8|
9453|ML|52|595.596.446||CRE|CRE|M||||||23|1|1|189.00|350.00|||8|
9454|ML|52|595.596.447||CAM|CAM|B||||||23|1|1|189.00|350.00|||8|
9455|ML|52|595.596.448||CAM|CAM|M||||||23|1|1|189.00|350.00|||8|
9456|ML|52|595.596.449||OUR|OUR|B||||||23|1|1|189.00|350.00|||8|
9457|ML|52|595.596.450||OUR|OUR|M||||||23|1|1|189.00|350.00|||8|
9458|ML|52|595.596.451||COB|COB|B||||||23|1|1|189.00|350.00|||8|
9459|ML|52|595.596.452||COB|COB|M||||||23|1|1|189.00|350.00|||8|
9460|ML|52|595.596.453||CHO|CHO|B||||||23|1|1|189.00|350.00|||8|
9461|ML|52|595.596.454||CHO|CHO|M||||||23|1|1|189.00|350.00|||8|
9462|ML|52|595.596.455||VAG|VAG|B||||||23|1|1|189.00|350.00|||8|
9463|ML|52|595.596.456||VAG|VAG|M||||||23|1|1|189.00|350.00|||8|
9464|ML|52|595.596.457||AZE|AZE|B||||||23|1|1|189.00|350.00|||8|
9465|ML|52|595.596.458||AZE|AZE|M||||||23|1|1|189.00|350.00|||8|
9466|ML|52|595.596.459||AMA|AMA|B||||||23|1|1|189.00|350.00|||8|
9467|ML|52|595.596.460||AMA|AMA|M||||||23|1|1|189.00|350.00|||8|
9468|ML|52|595.596.461||AES|AES|B||||||23|1|1|189.00|350.00|||8|
9469|ML|52|595.596.462||AES|AES|M||||||23|1|1|189.00|350.00|||8|
9470|ML|52|595.596.463||PRA|PRA|B||||||23|1|1|189.00|350.00|||8|
9471|ML|52|595.596.464||PRA|PRA|M||||||23|1|1|189.00|350.00|||8|
9472|ML|52|595.596.465||ROS|ROS|B||||||23|1|1|189.00|350.00|||8|
9473|ML|52|595.596.466||ROS|ROS|M||||||23|1|1|189.00|350.00|||8|
9474|ML|52|595.596.467||VER|VER|B||||||23|1|1|189.00|350.00|||8|
9475|ML|52|595.596.468||VER|VER|M||||||23|1|1|189.00|350.00|||8|
9476|ML|52|595.596.469||AZB|AZB|||||||23|1|1|189.00|350.00|||8|
9477|ML|52|595.596.470||DEN|DEN|||||||23|1|1|189.00|350.00|||8|
9478|ML|52|595.596.471||BLK|BLK|||||||23|1|1|189.00|350.00|||8|
9479|ML|52|595.596.472||ART|ART|||||||23|1|1|189.00|350.00|||8|
9480|ML|52|595.596.473||LIN|LIN|||||||23|1|1|189.00|350.00|||8|
9481|ML|52|595.596.474||HAL|HAL|||||||23|1|1|189.00|350.00|||8|
9482|ML|53|597.598.599||ARN|FC||H|TN|||60||2|2|166.44|292.00|||9|43101
9483|ML|53|597.598.600||ARN|FC||H|TP|||60||2|2|166.44|292.00|||9|43101
9484|ML|53|597.598.601||AEC|FC||H|TN|||60||2|2|166.44|292.00|||9|43101
9485|ML|53|597.598.602||AEC|FC||H|TP|||60||2|2|166.44|292.00|||9|43101
9486|ML|53|597.598.603||AOC|FO||H|TN|||60||2|2|166.44|292.00|||9|43101
9487|ML|53|597.598.604||AOC|FO||H|TP|||60||2|2|166.44|292.00|||9|43101
9488|ML|53|597.598.605||AEO|FO||H|TN|||60||2|2|166.44|292.00|||9|43101
9489|ML|53|597.598.606||AEO|FO||H|TP|||60||2|2|166.44|292.00|||9|43101
9490|ML|53|607.598.599||ARN|FC||H|TN|||70||2|2|171.00|300.00|||9|43101
9491|ML|53|607.598.600||ARN|FC||H|TP|||70||2|2|171.00|300.00|||9|43101
9492|ML|53|607.598.601||AEC|FC||H|TN|||70||2|2|171.00|300.00|||9|43101
9493|ML|53|607.598.602||AEC|FC||H|TP|||70||2|2|171.00|300.00|||9|43101
9494|ML|53|607.598.603||AOC|FO||H|TN|||70||2|2|171.00|300.00|||9|43101
9495|ML|53|607.598.604||AOC|FO||H|TP|||70||2|2|171.00|300.00|||9|43101
9496|ML|53|607.598.605||AEO|FO||H|TN|||70||2|2|171.00|300.00|||9|43101
9497|ML|53|607.598.606||AEO|FO||H|TP|||70||2|2|171.00|300.00|||9|43101
9498|ML|53|608.598.599||ARN|FC||H|TN|||80||2|2|177.84|312.00|||9|43101
9499|ML|53|608.598.600||ARN|FC||H|TP|||80||2|2|177.84|312.00|||9|43101
9500|ML|53|608.598.601||AEC|FC||H|TN|||80||2|2|177.84|312.00|||9|43101
9501|ML|53|608.598.602||AEC|FC||H|TP|||80||2|2|177.84|312.00|||9|43101
9502|ML|53|608.598.603||AOC|FO||H|TN|||80||2|2|177.84|312.00|||9|43101
9503|ML|53|608.598.604||AOC|FO||H|TP|||80||2|2|177.84|312.00|||9|43101
9504|ML|53|608.598.605||AEO|FO||H|TN|||80||2|2|177.84|312.00|||9|43101
9505|ML|53|608.598.606||AEO|FO||H|TP|||80||2|2|177.84|312.00|||9|43101
9506|ML|53|609.598.599||ARN|FC||H|TN|||90||2|2|185.25|325.00|||9|43101
9507|ML|53|609.598.600||ARN|FC||H|TP|||90||2|2|185.25|325.00|||9|43101
9508|ML|53|609.598.601||AEC|FC||H|TN|||90||2|2|185.25|325.00|||9|43101
9509|ML|53|609.598.602||AEC|FC||H|TP|||90||2|2|185.25|325.00|||9|43101
9510|ML|53|609.598.603||AOC|FO||H|TN|||90||2|2|185.25|325.00|||9|43101
9511|ML|53|609.598.604||AOC|FO||H|TP|||90||2|2|185.25|325.00|||9|43101
9512|ML|53|609.598.605||AEO|FO||H|TN|||90||2|2|185.25|325.00|||9|43101
9513|ML|53|609.598.606||AEO|FO||H|TP|||90||2|2|185.25|325.00|||9|43101
9514|ML|53|610.598.599||ARN|FC||H|TN|||100||2|2|200.07|351.00|||9|43101
9515|ML|53|610.598.600||ARN|FC||H|TP|||100||2|2|200.07|351.00|||9|43101
9516|ML|53|610.598.601||AEC|FC||H|TN|||100||2|2|200.07|351.00|||9|43101
9517|ML|53|610.598.602||AEC|FC||H|TP|||100||2|2|200.07|351.00|||9|43101
9518|ML|53|610.598.603||AOC|FO||H|TN|||100||2|2|200.07|351.00|||9|43101
9519|ML|53|610.598.604||AOC|FO||H|TP|||100||2|2|200.07|351.00|||9|43101
9520|ML|53|610.598.605||AEO|FO||H|TN|||100||2|2|200.07|351.00|||9|43101
9521|ML|53|610.598.606||AEO|FO||H|TP|||100||2|2|200.07|351.00|||9|43101
9522|ML|53|611.598.599||ARN|FC||H|TN|||120||2|2|205.77|361.00|||9|43101
9523|ML|53|611.598.600||ARN|FC||H|TP|||120||2|2|205.77|361.00|||9|43101
9524|ML|53|611.598.601||AEC|FC||H|TN|||120||2|2|205.77|361.00|||9|43101
9525|ML|53|611.598.602||AEC|FC||H|TP|||120||2|2|205.77|361.00|||9|43101
9526|ML|53|611.598.603||AOC|FO||H|TN|||120||2|2|205.77|361.00|||9|43101
9527|ML|53|611.598.604||AOC|FO||H|TP|||120||2|2|205.77|361.00|||9|43101
9528|ML|53|611.598.605||AEO|FO||H|TN|||120||2|2|205.77|361.00|||9|43101
9529|ML|53|611.598.606||AEO|FO||H|TP|||120||2|2|205.77|361.00|||9|43101
9530|ML|53|597.612.599||ARN|FC||V|TN|||60||2|2|166.44|292.00|||10|44101
9531|ML|53|597.612.600||ARN|FC||V|TP|||60||2|2|166.44|292.00|||10|44101
9532|ML|53|597.612.601||AEC|FC||V|TN|||60||2|2|166.44|292.00|||10|44101
9533|ML|53|597.612.602||AEC|FC||V|TP|||60||2|2|166.44|292.00|||10|44101
9534|ML|53|597.612.603||AOC|FO||V|TN|||60||2|2|166.44|292.00|||10|44101
9535|ML|53|597.612.604||AOC|FO||V|TP|||60||2|2|166.44|292.00|||10|44101
9536|ML|53|597.612.605||AEO|FO||V|TN|||60||2|2|166.44|292.00|||10|44101
9537|ML|53|597.612.606||AEO|FO||V|TP|||60||2|2|166.44|292.00|||10|44101
9538|ML|53|607.612.599||ARN|FC||V|TN|||70||2|2|171.00|300.00|||10|44101
9539|ML|53|607.612.600||ARN|FC||V|TP|||70||2|2|171.00|300.00|||10|44101
9540|ML|53|607.612.601||AEC|FC||V|TN|||70||2|2|171.00|300.00|||10|44101
9541|ML|53|607.612.602||AEC|FC||V|TP|||70||2|2|171.00|300.00|||10|44101
9542|ML|53|607.612.603||AOC|FO||V|TN|||70||2|2|171.00|300.00|||10|44101
9543|ML|53|607.612.604||AOC|FO||V|TP|||70||2|2|171.00|300.00|||10|44101
9544|ML|53|607.612.605||AEO|FO||V|TN|||70||2|2|171.00|300.00|||10|44101
9545|ML|53|607.612.606||AEO|FO||V|TP|||70||2|2|171.00|300.00|||10|44101
9546|ML|53|608.612.599||ARN|FC||V|TN|||80||2|2|177.84|312.00|||10|44101
9547|ML|53|608.612.600||ARN|FC||V|TP|||80||2|2|177.84|312.00|||10|44101
9548|ML|53|608.612.601||AEC|FC||V|TN|||80||2|2|177.84|312.00|||10|44101
9549|ML|53|608.612.602||AEC|FC||V|TP|||80||2|2|177.84|312.00|||10|44101
9550|ML|53|608.612.603||AOC|FO||V|TN|||80||2|2|177.84|312.00|||10|44101
9551|ML|53|608.612.604||AOC|FO||V|TP|||80||2|2|177.84|312.00|||10|44101
9552|ML|53|608.612.605||AEO|FO||V|TN|||80||2|2|177.84|312.00|||10|44101
9553|ML|53|608.612.606||AEO|FO||V|TP|||80||2|2|177.84|312.00|||10|44101
9554|ML|53|609.612.599||ARN|FC||V|TN|||90||2|2|185.25|325.00|||10|44101
9555|ML|53|609.612.600||ARN|FC||V|TP|||90||2|2|185.25|325.00|||10|44101
9556|ML|53|609.612.601||AEC|FC||V|TN|||90||2|2|185.25|325.00|||10|44101
9557|ML|53|609.612.602||AEC|FC||V|TP|||90||2|2|185.25|325.00|||10|44101
9558|ML|53|609.612.603||AOC|FO||V|TN|||90||2|2|185.25|325.00|||10|44101
9559|ML|53|609.612.604||AOC|FO||V|TP|||90||2|2|185.25|325.00|||10|44101
9560|ML|53|609.612.605||AEO|FO||V|TN|||90||2|2|185.25|325.00|||10|44101
9561|ML|53|609.612.606||AEO|FO||V|TP|||90||2|2|185.25|325.00|||10|44101
9562|ML|53|610.612.599||ARN|FC||V|TN|||100||2|2|200.07|351.00|||10|44101
9563|ML|53|610.612.600||ARN|FC||V|TP|||100||2|2|200.07|351.00|||10|44101
9564|ML|53|610.612.601||AEC|FC||V|TN|||100||2|2|200.07|351.00|||10|44101
9565|ML|53|610.612.602||AEC|FC||V|TP|||100||2|2|200.07|351.00|||10|44101
9566|ML|53|610.612.603||AOC|FO||V|TN|||100||2|2|200.07|351.00|||10|44101
9567|ML|53|610.612.604||AOC|FO||V|TP|||100||2|2|200.07|351.00|||10|44101
9568|ML|53|610.612.605||AEO|FO||V|TN|||100||2|2|200.07|351.00|||10|44101
9569|ML|53|610.612.606||AEO|FO||V|TP|||100||2|2|200.07|351.00|||10|44101
9570|ML|53|611.612.599||ARN|FC||V|TN|||120||2|2|205.77|361.00|||10|44101
9571|ML|53|611.612.600||ARN|FC||V|TP|||120||2|2|205.77|361.00|||10|44101
9572|ML|53|611.612.601||AEC|FC||V|TN|||120||2|2|205.77|361.00|||10|44101
9573|ML|53|611.612.602||AEC|FC||V|TP|||120||2|2|205.77|361.00|||10|44101
9574|ML|53|611.612.603||AOC|FO||V|TN|||120||2|2|205.77|361.00|||10|44101
9575|ML|53|611.612.604||AOC|FO||V|TP|||120||2|2|205.77|361.00|||10|44101
9576|ML|53|611.612.605||AEO|FO||V|TN|||120||2|2|205.77|361.00|||10|44101
9577|ML|53|611.612.606||AEO|FO||V|TP|||120||2|2|205.77|361.00|||10|44101
9578|ML|54|613.598.599||ARN|FC||H|TN|||60||2|2|235.98|414.00|||11|43141
9579|ML|54|613.598.600||ARN|FC||H|TP|||60||2|2|235.98|414.00|||11|43141
9580|ML|54|613.598.601||AEC|FC||H|TN|||60||2|2|235.98|414.00|||11|43141
9581|ML|54|613.598.602||AEC|FC||H|TP|||60||2|2|235.98|414.00|||11|43141
9582|ML|54|613.598.603||AOC|FO||H|TN|||60||2|2|235.98|414.00|||11|43141
9583|ML|54|613.598.604||AOC|FO||H|TP|||60||2|2|235.98|414.00|||11|43141
9584|ML|54|613.598.605||AEO|FO||H|TN|||60||2|2|235.98|414.00|||11|43141
9585|ML|54|613.598.606||AEO|FO||H|TP|||60||2|2|235.98|414.00|||11|43141
9586|ML|54|614.598.599||ARN|FC||H|TN|||70||2|2|241.68|424.00|||11|43141
9587|ML|54|614.598.600||ARN|FC||H|TP|||70||2|2|241.68|424.00|||11|43141
9588|ML|54|614.598.601||AEC|FC||H|TN|||70||2|2|241.68|424.00|||11|43141
9589|ML|54|614.598.602||AEC|FC||H|TP|||70||2|2|241.68|424.00|||11|43141
9590|ML|54|614.598.603||AOC|FO||H|TN|||70||2|2|241.68|424.00|||11|43141
9591|ML|54|614.598.604||AOC|FO||H|TP|||70||2|2|241.68|424.00|||11|43141
9592|ML|54|614.598.605||AEO|FO||H|TN|||70||2|2|241.68|424.00|||11|43141
9593|ML|54|614.598.606||AEO|FO||H|TP|||70||2|2|241.68|424.00|||11|43141
9594|ML|54|615.598.599||ARN|FC||H|TN|||80||2|2|249.09|437.00|||11|43141
9595|ML|54|615.598.600||ARN|FC||H|TP|||80||2|2|249.09|437.00|||11|43141
9596|ML|54|615.598.601||AEC|FC||H|TN|||80||2|2|249.09|437.00|||11|43141
9597|ML|54|615.598.602||AEC|FC||H|TP|||80||2|2|249.09|437.00|||11|43141
9598|ML|54|615.598.603||AOC|FO||H|TN|||80||2|2|249.09|437.00|||11|43141
9599|ML|54|615.598.604||AOC|FO||H|TP|||80||2|2|249.09|437.00|||11|43141
9600|ML|54|615.598.605||AEO|FO||H|TN|||80||2|2|249.09|437.00|||11|43141
9601|ML|54|615.598.606||AEO|FO||H|TP|||80||2|2|249.09|437.00|||11|43141
9602|ML|54|616.598.599||ARN|FC||H|TN|||90||2|2|256.50|450.00|||11|43141
9603|ML|54|616.598.600||ARN|FC||H|TP|||90||2|2|256.50|450.00|||11|43141
9604|ML|54|616.598.601||AEC|FC||H|TN|||90||2|2|256.50|450.00|||11|43141
9605|ML|54|616.598.602||AEC|FC||H|TP|||90||2|2|256.50|450.00|||11|43141
9606|ML|54|616.598.603||AOC|FO||H|TN|||90||2|2|256.50|450.00|||11|43141
9607|ML|54|616.598.604||AOC|FO||H|TP|||90||2|2|256.50|450.00|||11|43141
9608|ML|54|616.598.605||AEO|FO||H|TN|||90||2|2|256.50|450.00|||11|43141
9609|ML|54|616.598.606||AEO|FO||H|TP|||90||2|2|256.50|450.00|||11|43141
9610|ML|54|617.598.599||ARN|FC||H|TN|||100||2|2|273.03|479.00|||11|43141
9611|ML|54|617.598.600||ARN|FC||H|TP|||100||2|2|273.03|479.00|||11|43141
9612|ML|54|617.598.601||AEC|FC||H|TN|||100||2|2|273.03|479.00|||11|43141
9613|ML|54|617.598.602||AEC|FC||H|TP|||100||2|2|273.03|479.00|||11|43141
9614|ML|54|617.598.603||AOC|FO||H|TN|||100||2|2|273.03|479.00|||11|43141
9615|ML|54|617.598.604||AOC|FO||H|TP|||100||2|2|273.03|479.00|||11|43141
9616|ML|54|617.598.605||AEO|FO||H|TN|||100||2|2|273.03|479.00|||11|43141
9617|ML|54|617.598.606||AEO|FO||H|TP|||100||2|2|273.03|479.00|||11|43141
9618|ML|54|618.598.599||ARN|FC||H|TN|||120||2|2|279.30|490.00|||11|43141
9619|ML|54|618.598.600||ARN|FC||H|TP|||120||2|2|279.30|490.00|||11|43141
9620|ML|54|618.598.601||AEC|FC||H|TN|||120||2|2|279.30|490.00|||11|43141
9621|ML|54|618.598.602||AEC|FC||H|TP|||120||2|2|279.30|490.00|||11|43141
9622|ML|54|618.598.603||AOC|FO||H|TN|||120||2|2|279.30|490.00|||11|43141
9623|ML|54|618.598.604||AOC|FO||H|TP|||120||2|2|279.30|490.00|||11|43141
9624|ML|54|618.598.605||AEO|FO||H|TN|||120||2|2|279.30|490.00|||11|43141
9625|ML|54|618.598.606||AEO|FO||H|TP|||120||2|2|279.30|490.00|||11|43141
9626|ML|54|613.612.599||ARN|FC||V|TN|||60||2|2|235.98|414.00|||12|44141
9627|ML|54|613.612.600||ARN|FC||V|TP|||60||2|2|235.98|414.00|||12|44141
9628|ML|54|613.612.601||AEC|FC||V|TN|||60||2|2|235.98|414.00|||12|44141
9629|ML|54|613.612.602||AEC|FC||V|TP|||60||2|2|235.98|414.00|||12|44141
9630|ML|54|613.612.603||AOC|FO||V|TN|||60||2|2|235.98|414.00|||12|44141
9631|ML|54|613.612.604||AOC|FO||V|TP|||60||2|2|235.98|414.00|||12|44141
9632|ML|54|613.612.605||AEO|FO||V|TN|||60||2|2|235.98|414.00|||12|44141
9633|ML|54|613.612.606||AEO|FO||V|TP|||60||2|2|235.98|414.00|||12|44141
9634|ML|54|614.612.599||ARN|FC||V|TN|||70||2|2|241.68|424.00|||12|44141
9635|ML|54|614.612.600||ARN|FC||V|TP|||70||2|2|241.68|424.00|||12|44141
9636|ML|54|614.612.601||AEC|FC||V|TN|||70||2|2|241.68|424.00|||12|44141
9637|ML|54|614.612.602||AEC|FC||V|TP|||70||2|2|241.68|424.00|||12|44141
9638|ML|54|614.612.603||AOC|FO||V|TN|||70||2|2|241.68|424.00|||12|44141
9639|ML|54|614.612.604||AOC|FO||V|TP|||70||2|2|241.68|424.00|||12|44141
9640|ML|54|614.612.605||AEO|FO||V|TN|||70||2|2|241.68|424.00|||12|44141
9641|ML|54|614.612.606||AEO|FO||V|TP|||70||2|2|241.68|424.00|||12|44141
9642|ML|54|615.612.599||ARN|FC||V|TN|||80||2|2|249.09|437.00|||12|44141
9643|ML|54|615.612.600||ARN|FC||V|TP|||80||2|2|249.09|437.00|||12|44141
9644|ML|54|615.612.601||AEC|FC||V|TN|||80||2|2|249.09|437.00|||12|44141
9645|ML|54|615.612.602||AEC|FC||V|TP|||80||2|2|249.09|437.00|||12|44141
9646|ML|54|615.612.603||AOC|FO||V|TN|||80||2|2|249.09|437.00|||12|44141
9647|ML|54|615.612.604||AOC|FO||V|TP|||80||2|2|249.09|437.00|||12|44141
9648|ML|54|615.612.605||AEO|FO||V|TN|||80||2|2|249.09|437.00|||12|44141
9649|ML|54|615.612.606||AEO|FO||V|TP|||80||2|2|249.09|437.00|||12|44141
9650|ML|54|616.612.599||ARN|FC||V|TN|||90||2|2|256.50|450.00|||12|44141
9651|ML|54|616.612.600||ARN|FC||V|TP|||90||2|2|256.50|450.00|||12|44141
9652|ML|54|616.612.601||AEC|FC||V|TN|||90||2|2|256.50|450.00|||12|44141
9653|ML|54|616.612.602||AEC|FC||V|TP|||90||2|2|256.50|450.00|||12|44141
9654|ML|54|616.612.603||AOC|FO||V|TN|||90||2|2|256.50|450.00|||12|44141
9655|ML|54|616.612.604||AOC|FO||V|TP|||90||2|2|256.50|450.00|||12|44141
9656|ML|54|616.612.605||AEO|FO||V|TN|||90||2|2|256.50|450.00|||12|44141
9657|ML|54|616.612.606||AEO|FO||V|TP|||90||2|2|256.50|450.00|||12|44141
9658|ML|54|617.612.599||ARN|FC||V|TN|||100||2|2|273.03|479.00|||12|44141
9659|ML|54|617.612.600||ARN|FC||V|TP|||100||2|2|273.03|479.00|||12|44141
9660|ML|54|617.612.601||AEC|FC||V|TN|||100||2|2|273.03|479.00|||12|44141
9661|ML|54|617.612.602||AEC|FC||V|TP|||100||2|2|273.03|479.00|||12|44141
9662|ML|54|617.612.603||AOC|FO||V|TN|||100||2|2|273.03|479.00|||12|44141
9663|ML|54|617.612.604||AOC|FO||V|TP|||100||2|2|273.03|479.00|||12|44141
9664|ML|54|617.612.605||AEO|FO||V|TN|||100||2|2|273.03|479.00|||12|44141
9665|ML|54|617.612.606||AEO|FO||V|TP|||100||2|2|273.03|479.00|||12|44141
9666|ML|54|618.612.599||ARN|FC||V|TN|||120||2|2|279.30|490.00|||12|44141
9667|ML|54|618.612.600||ARN|FC||V|TP|||120||2|2|279.30|490.00|||12|44141
9668|ML|54|618.612.601||AEC|FC||V|TN|||120||2|2|279.30|490.00|||12|44141
9669|ML|54|618.612.602||AEC|FC||V|TP|||120||2|2|279.30|490.00|||12|44141
9670|ML|54|618.612.603||AOC|FO||V|TN|||120||2|2|279.30|490.00|||12|44141
9671|ML|54|618.612.604||AOC|FO||V|TP|||120||2|2|279.30|490.00|||12|44141
9672|ML|54|618.612.605||AEO|FO||V|TN|||120||2|2|279.30|490.00|||12|44141
9673|ML|54|618.612.606||AEO|FO||V|TP|||120||2|2|279.30|490.00|||12|44141
9674|ML|55|619.598.599||ARN|FC||H|TN|||60||2|2|250.23|439.00|||13|43102
9675|ML|55|619.598.600||ARN|FC||H|TP|||60||2|2|250.23|439.00|||13|43102
9676|ML|55|619.598.601||AEC|FC||H|TN|||60||2|2|250.23|439.00|||13|43102
9677|ML|55|619.598.602||AEC|FC||H|TP|||60||2|2|250.23|439.00|||13|43102
9678|ML|55|619.598.603||AOC|FO||H|TN|||60||2|2|250.23|439.00|||13|43102
9679|ML|55|619.598.604||AOC|FO||H|TP|||60||2|2|250.23|439.00|||13|43102
9680|ML|55|619.598.605||AEO|FO||H|TN|||60||2|2|250.23|439.00|||13|43102
9681|ML|55|619.598.606||AEO|FO||H|TP|||60||2|2|250.23|439.00|||13|43102
9682|ML|55|620.598.599||ARN|FC||H|TN|||70||2|2|261.63|459.00|||13|43102
9683|ML|55|620.598.600||ARN|FC||H|TP|||70||2|2|261.63|459.00|||13|43102
9684|ML|55|620.598.601||AEC|FC||H|TN|||70||2|2|261.63|459.00|||13|43102
9685|ML|55|620.598.602||AEC|FC||H|TP|||70||2|2|261.63|459.00|||13|43102
9686|ML|55|620.598.603||AOC|FO||H|TN|||70||2|2|261.63|459.00|||13|43102
9687|ML|55|620.598.604||AOC|FO||H|TP|||70||2|2|261.63|459.00|||13|43102
9688|ML|55|620.598.605||AEO|FO||H|TN|||70||2|2|261.63|459.00|||13|43102
9689|ML|55|620.598.606||AEO|FO||H|TP|||70||2|2|261.63|459.00|||13|43102
9690|ML|55|621.598.599||ARN|FC||H|TN|||80||2|2|266.76|468.00|||13|43102
9691|ML|55|621.598.600||ARN|FC||H|TP|||80||2|2|266.76|468.00|||13|43102
9692|ML|55|621.598.601||AEC|FC||H|TN|||80||2|2|266.76|468.00|||13|43102
9693|ML|55|621.598.602||AEC|FC||H|TP|||80||2|2|266.76|468.00|||13|43102
9694|ML|55|621.598.603||AOC|FO||H|TN|||80||2|2|266.76|468.00|||13|43102
9695|ML|55|621.598.604||AOC|FO||H|TP|||80||2|2|266.76|468.00|||13|43102
9696|ML|55|621.598.605||AEO|FO||H|TN|||80||2|2|266.76|468.00|||13|43102
9697|ML|55|621.598.606||AEO|FO||H|TP|||80||2|2|266.76|468.00|||13|43102
9698|ML|55|622.598.599||ARN|FC||H|TN|||90||2|2|292.41|513.00|||13|43102
9699|ML|55|622.598.600||ARN|FC||H|TP|||90||2|2|292.41|513.00|||13|43102
9700|ML|55|622.598.601||AEC|FC||H|TN|||90||2|2|292.41|513.00|||13|43102
9701|ML|55|622.598.602||AEC|FC||H|TP|||90||2|2|292.41|513.00|||13|43102
9702|ML|55|622.598.603||AOC|FO||H|TN|||90||2|2|292.41|513.00|||13|43102
9703|ML|55|622.598.604||AOC|FO||H|TP|||90||2|2|292.41|513.00|||13|43102
9704|ML|55|622.598.605||AEO|FO||H|TN|||90||2|2|292.41|513.00|||13|43102
9705|ML|55|622.598.606||AEO|FO||H|TP|||90||2|2|292.41|513.00|||13|43102
9706|ML|55|623.598.599||ARN|FC||H|TN|||100||2|2|306.66|538.00|||13|43102
9707|ML|55|623.598.600||ARN|FC||H|TP|||100||2|2|306.66|538.00|||13|43102
9708|ML|55|623.598.601||AEC|FC||H|TN|||100||2|2|306.66|538.00|||13|43102
9709|ML|55|623.598.602||AEC|FC||H|TP|||100||2|2|306.66|538.00|||13|43102
9710|ML|55|623.598.603||AOC|FO||H|TN|||100||2|2|306.66|538.00|||13|43102
9711|ML|55|623.598.604||AOC|FO||H|TP|||100||2|2|306.66|538.00|||13|43102
9712|ML|55|623.598.605||AEO|FO||H|TN|||100||2|2|306.66|538.00|||13|43102
9713|ML|55|623.598.606||AEO|FO||H|TP|||100||2|2|306.66|538.00|||13|43102
9714|ML|55|624.598.599||ARN|FC||H|TN|||120||2|2|323.19|567.00|||13|43102
9715|ML|55|624.598.600||ARN|FC||H|TP|||120||2|2|323.19|567.00|||13|43102
9716|ML|55|624.598.601||AEC|FC||H|TN|||120||2|2|323.19|567.00|||13|43102
9717|ML|55|624.598.602||AEC|FC||H|TP|||120||2|2|323.19|567.00|||13|43102
9718|ML|55|624.598.603||AOC|FO||H|TN|||120||2|2|323.19|567.00|||13|43102
9719|ML|55|624.598.604||AOC|FO||H|TP|||120||2|2|323.19|567.00|||13|43102
9720|ML|55|624.598.605||AEO|FO||H|TN|||120||2|2|323.19|567.00|||13|43102
9721|ML|55|624.598.606||AEO|FO||H|TP|||120||2|2|323.19|567.00|||13|43102
9722|ML|55|619.612.599||ARN|FC||V|TN|||60||2|2|250.23|439.00|||14|44102
9723|ML|55|619.612.600||ARN|FC||V|TP|||60||2|2|250.23|439.00|||14|44102
9724|ML|55|619.612.601||AEC|FC||V|TN|||60||2|2|250.23|439.00|||14|44102
9725|ML|55|619.612.602||AEC|FC||V|TP|||60||2|2|250.23|439.00|||14|44102
9726|ML|55|619.612.603||AOC|FO||V|TN|||60||2|2|250.23|439.00|||14|44102
9727|ML|55|619.612.604||AOC|FO||V|TP|||60||2|2|250.23|439.00|||14|44102
9728|ML|55|619.612.605||AEO|FO||V|TN|||60||2|2|250.23|439.00|||14|44102
9729|ML|55|619.612.606||AEO|FO||V|TP|||60||2|2|250.23|439.00|||14|44102
9730|ML|55|620.612.599||ARN|FC||V|TN|||70||2|2|261.63|459.00|||14|44102
9731|ML|55|620.612.600||ARN|FC||V|TP|||70||2|2|261.63|459.00|||14|44102
9732|ML|55|620.612.601||AEC|FC||V|TN|||70||2|2|261.63|459.00|||14|44102
9733|ML|55|620.612.602||AEC|FC||V|TP|||70||2|2|261.63|459.00|||14|44102
9734|ML|55|620.612.603||AOC|FO||V|TN|||70||2|2|261.63|459.00|||14|44102
9735|ML|55|620.612.604||AOC|FO||V|TP|||70||2|2|261.63|459.00|||14|44102
9736|ML|55|620.612.605||AEO|FO||V|TN|||70||2|2|261.63|459.00|||14|44102
9737|ML|55|620.612.606||AEO|FO||V|TP|||70||2|2|261.63|459.00|||14|44102
9738|ML|55|621.612.599||ARN|FC||V|TN|||80||2|2|266.76|468.00|||14|44102
9739|ML|55|621.612.600||ARN|FC||V|TP|||80||2|2|266.76|468.00|||14|44102
9740|ML|55|621.612.601||AEC|FC||V|TN|||80||2|2|266.76|468.00|||14|44102
9741|ML|55|621.612.602||AEC|FC||V|TP|||80||2|2|266.76|468.00|||14|44102
9742|ML|55|621.612.603||AOC|FO||V|TN|||80||2|2|266.76|468.00|||14|44102
9743|ML|55|621.612.604||AOC|FO||V|TP|||80||2|2|266.76|468.00|||14|44102
9744|ML|55|621.612.605||AEO|FO||V|TN|||80||2|2|266.76|468.00|||14|44102
9745|ML|55|621.612.606||AEO|FO||V|TP|||80||2|2|266.76|468.00|||14|44102
9746|ML|55|622.612.599||ARN|FC||V|TN|||90||2|2|292.41|513.00|||14|44102
9747|ML|55|622.612.600||ARN|FC||V|TP|||90||2|2|292.41|513.00|||14|44102
9748|ML|55|622.612.601||AEC|FC||V|TN|||90||2|2|292.41|513.00|||14|44102
9749|ML|55|622.612.602||AEC|FC||V|TP|||90||2|2|292.41|513.00|||14|44102
9750|ML|55|622.612.603||AOC|FO||V|TN|||90||2|2|292.41|513.00|||14|44102
9751|ML|55|622.612.604||AOC|FO||V|TP|||90||2|2|292.41|513.00|||14|44102
9752|ML|55|622.612.605||AEO|FO||V|TN|||90||2|2|292.41|513.00|||14|44102
9753|ML|55|622.612.606||AEO|FO||V|TP|||90||2|2|292.41|513.00|||14|44102
9754|ML|55|623.612.599||ARN|FC||V|TN|||100||2|2|306.66|538.00|||14|44102
9755|ML|55|623.612.600||ARN|FC||V|TP|||100||2|2|306.66|538.00|||14|44102
9756|ML|55|623.612.601||AEC|FC||V|TN|||100||2|2|306.66|538.00|||14|44102
9757|ML|55|623.612.602||AEC|FC||V|TP|||100||2|2|306.66|538.00|||14|44102
9758|ML|55|623.612.603||AOC|FO||V|TN|||100||2|2|306.66|538.00|||14|44102
9759|ML|55|623.612.604||AOC|FO||V|TP|||100||2|2|306.66|538.00|||14|44102
9760|ML|55|623.612.605||AEO|FO||V|TN|||100||2|2|306.66|538.00|||14|44102
9761|ML|55|623.612.606||AEO|FO||V|TP|||100||2|2|306.66|538.00|||14|44102
9762|ML|55|624.612.599||ARN|FC||V|TN|||120||2|2|323.19|567.00|||14|44102
9763|ML|55|624.612.600||ARN|FC||V|TP|||120||2|2|323.19|567.00|||14|44102
9764|ML|55|624.612.601||AEC|FC||V|TN|||120||2|2|323.19|567.00|||14|44102
9765|ML|55|624.612.602||AEC|FC||V|TP|||120||2|2|323.19|567.00|||14|44102
9766|ML|55|624.612.603||AOC|FO||V|TN|||120||2|2|323.19|567.00|||14|44102
9767|ML|55|624.612.604||AOC|FO||V|TP|||120||2|2|323.19|567.00|||14|44102
9768|ML|55|624.612.605||AEO|FO||V|TN|||120||2|2|323.19|567.00|||14|44102
9769|ML|55|624.612.606||AEO|FO||V|TP|||120||2|2|323.19|567.00|||14|44102
9770|ML|55|619.625.599||ARN|FC||MX|TN|||60||2|2|250.23|439.00|||15|45102
9771|ML|55|619.625.600||ARN|FC||MX|TP|||60||2|2|250.23|439.00|||15|45102
9772|ML|55|619.625.601||AEC|FC||MX|TN|||60||2|2|250.23|439.00|||15|45102
9773|ML|55|619.625.602||AEC|FC||MX|TP|||60||2|2|250.23|439.00|||15|45102
9774|ML|55|619.625.603||AOC|FO||MX|TN|||60||2|2|250.23|439.00|||15|45102
9775|ML|55|619.625.604||AOC|FO||MX|TP|||60||2|2|250.23|439.00|||15|45102
9776|ML|55|619.625.605||AEO|FO||MX|TN|||60||2|2|250.23|439.00|||15|45102
9777|ML|55|619.625.606||AEO|FO||MX|TP|||60||2|2|250.23|439.00|||15|45102
9778|ML|55|620.625.599||ARN|FC||MX|TN|||70||2|2|261.63|459.00|||15|45102
9779|ML|55|620.625.600||ARN|FC||MX|TP|||70||2|2|261.63|459.00|||15|45102
9780|ML|55|620.625.601||AEC|FC||MX|TN|||70||2|2|261.63|459.00|||15|45102
9781|ML|55|620.625.602||AEC|FC||MX|TP|||70||2|2|261.63|459.00|||15|45102
9782|ML|55|620.625.603||AOC|FO||MX|TN|||70||2|2|261.63|459.00|||15|45102
9783|ML|55|620.625.604||AOC|FO||MX|TP|||70||2|2|261.63|459.00|||15|45102
9784|ML|55|620.625.605||AEO|FO||MX|TN|||70||2|2|261.63|459.00|||15|45102
9785|ML|55|620.625.606||AEO|FO||MX|TP|||70||2|2|261.63|459.00|||15|45102
9786|ML|55|621.625.599||ARN|FC||MX|TN|||80||2|2|266.76|468.00|||15|45102
9787|ML|55|621.625.600||ARN|FC||MX|TP|||80||2|2|266.76|468.00|||15|45102
9788|ML|55|621.625.601||AEC|FC||MX|TN|||80||2|2|266.76|468.00|||15|45102
9789|ML|55|621.625.602||AEC|FC||MX|TP|||80||2|2|266.76|468.00|||15|45102
9790|ML|55|621.625.603||AOC|FO||MX|TN|||80||2|2|266.76|468.00|||15|45102
9791|ML|55|621.625.604||AOC|FO||MX|TP|||80||2|2|266.76|468.00|||15|45102
9792|ML|55|621.625.605||AEO|FO||MX|TN|||80||2|2|266.76|468.00|||15|45102
9793|ML|55|621.625.606||AEO|FO||MX|TP|||80||2|2|266.76|468.00|||15|45102
9794|ML|55|622.625.599||ARN|FC||MX|TN|||90||2|2|292.41|513.00|||15|45102
9795|ML|55|622.625.600||ARN|FC||MX|TP|||90||2|2|292.41|513.00|||15|45102
9796|ML|55|622.625.601||AEC|FC||MX|TN|||90||2|2|292.41|513.00|||15|45102
9797|ML|55|622.625.602||AEC|FC||MX|TP|||90||2|2|292.41|513.00|||15|45102
9798|ML|55|622.625.603||AOC|FO||MX|TN|||90||2|2|292.41|513.00|||15|45102
9799|ML|55|622.625.604||AOC|FO||MX|TP|||90||2|2|292.41|513.00|||15|45102
9800|ML|55|622.625.605||AEO|FO||MX|TN|||90||2|2|292.41|513.00|||15|45102
9801|ML|55|622.625.606||AEO|FO||MX|TP|||90||2|2|292.41|513.00|||15|45102
9802|ML|55|623.625.599||ARN|FC||MX|TN|||100||2|2|306.66|538.00|||15|45102
9803|ML|55|623.625.600||ARN|FC||MX|TP|||100||2|2|306.66|538.00|||15|45102
9804|ML|55|623.625.601||AEC|FC||MX|TN|||100||2|2|306.66|538.00|||15|45102
9805|ML|55|623.625.602||AEC|FC||MX|TP|||100||2|2|306.66|538.00|||15|45102
9806|ML|55|623.625.603||AOC|FO||MX|TN|||100||2|2|306.66|538.00|||15|45102
9807|ML|55|623.625.604||AOC|FO||MX|TP|||100||2|2|306.66|538.00|||15|45102
9808|ML|55|623.625.605||AEO|FO||MX|TN|||100||2|2|306.66|538.00|||15|45102
9809|ML|55|623.625.606||AEO|FO||MX|TP|||100||2|2|306.66|538.00|||15|45102
9810|ML|55|624.625.599||ARN|FC||MX|TN|||120||2|2|323.19|567.00|||15|45102
9811|ML|55|624.625.600||ARN|FC||MX|TP|||120||2|2|323.19|567.00|||15|45102
9812|ML|55|624.625.601||AEC|FC||MX|TN|||120||2|2|323.19|567.00|||15|45102
9813|ML|55|624.625.602||AEC|FC||MX|TP|||120||2|2|323.19|567.00|||15|45102
9814|ML|55|624.625.603||AOC|FO||MX|TN|||120||2|2|323.19|567.00|||15|45102
9815|ML|55|624.625.604||AOC|FO||MX|TP|||120||2|2|323.19|567.00|||15|45102
9816|ML|55|624.625.605||AEO|FO||MX|TN|||120||2|2|323.19|567.00|||15|45102
9817|ML|55|624.625.606||AEO|FO||MX|TP|||120||2|2|323.19|567.00|||15|45102
9818|ML|56|626.598.599||ARN|FC||H|TN|||60||2|2|262.77|461.00|||16|43142
9819|ML|56|626.598.600||ARN|FC||H|TP|||60||2|2|262.77|461.00|||16|43142
9820|ML|56|626.598.601||AEC|FC||H|TN|||60||2|2|262.77|461.00|||16|43142
9821|ML|56|626.598.602||AEC|FC||H|TP|||60||2|2|262.77|461.00|||16|43142
9822|ML|56|626.598.603||AOC|FO||H|TN|||60||2|2|262.77|461.00|||16|43142
9823|ML|56|626.598.604||AOC|FO||H|TP|||60||2|2|262.77|461.00|||16|43142
9824|ML|56|626.598.605||AEO|FO||H|TN|||60||2|2|262.77|461.00|||16|43142
9825|ML|56|626.598.606||AEO|FO||H|TP|||60||2|2|262.77|461.00|||16|43142
9826|ML|56|627.598.599||ARN|FC||H|TN|||70||2|2|274.74|482.00|||16|43142
9827|ML|56|627.598.600||ARN|FC||H|TP|||70||2|2|274.74|482.00|||16|43142
9828|ML|56|627.598.601||AEC|FC||H|TN|||70||2|2|274.74|482.00|||16|43142
9829|ML|56|627.598.602||AEC|FC||H|TP|||70||2|2|274.74|482.00|||16|43142
9830|ML|56|627.598.603||AOC|FO||H|TN|||70||2|2|274.74|482.00|||16|43142
9831|ML|56|627.598.604||AOC|FO||H|TP|||70||2|2|274.74|482.00|||16|43142
9832|ML|56|627.598.605||AEO|FO||H|TN|||70||2|2|274.74|482.00|||16|43142
9833|ML|56|627.598.606||AEO|FO||H|TP|||70||2|2|274.74|482.00|||16|43142
9834|ML|56|628.598.599||ARN|FC||H|TN|||80||2|2|279.87|491.00|||16|43142
9835|ML|56|628.598.600||ARN|FC||H|TP|||80||2|2|279.87|491.00|||16|43142
9836|ML|56|628.598.601||AEC|FC||H|TN|||80||2|2|279.87|491.00|||16|43142
9837|ML|56|628.598.602||AEC|FC||H|TP|||80||2|2|279.87|491.00|||16|43142
9838|ML|56|628.598.603||AOC|FO||H|TN|||80||2|2|279.87|491.00|||16|43142
9839|ML|56|628.598.604||AOC|FO||H|TP|||80||2|2|279.87|491.00|||16|43142
9840|ML|56|628.598.605||AEO|FO||H|TN|||80||2|2|279.87|491.00|||16|43142
9841|ML|56|628.598.606||AEO|FO||H|TP|||80||2|2|279.87|491.00|||16|43142
9842|ML|56|629.598.599||ARN|FC||H|TN|||90||2|2|306.66|538.00|||16|43142
9843|ML|56|629.598.600||ARN|FC||H|TP|||90||2|2|306.66|538.00|||16|43142
9844|ML|56|629.598.601||AEC|FC||H|TN|||90||2|2|306.66|538.00|||16|43142
9845|ML|56|629.598.602||AEC|FC||H|TP|||90||2|2|306.66|538.00|||16|43142
9846|ML|56|629.598.603||AOC|FO||H|TN|||90||2|2|306.66|538.00|||16|43142
9847|ML|56|629.598.604||AOC|FO||H|TP|||90||2|2|306.66|538.00|||16|43142
9848|ML|56|629.598.605||AEO|FO||H|TN|||90||2|2|306.66|538.00|||16|43142
9849|ML|56|629.598.606||AEO|FO||H|TP|||90||2|2|306.66|538.00|||16|43142
9850|ML|56|630.598.599||ARN|FC||H|TN|||100||2|2|322.05|565.00|||16|43142
9851|ML|56|630.598.600||ARN|FC||H|TP|||100||2|2|322.05|565.00|||16|43142
9852|ML|56|630.598.601||AEC|FC||H|TN|||100||2|2|322.05|565.00|||16|43142
9853|ML|56|630.598.602||AEC|FC||H|TP|||100||2|2|322.05|565.00|||16|43142
9854|ML|56|630.598.603||AOC|FO||H|TN|||100||2|2|322.05|565.00|||16|43142
9855|ML|56|630.598.604||AOC|FO||H|TP|||100||2|2|322.05|565.00|||16|43142
9856|ML|56|630.598.605||AEO|FO||H|TN|||100||2|2|322.05|565.00|||16|43142
9857|ML|56|630.598.606||AEO|FO||H|TP|||100||2|2|322.05|565.00|||16|43142
9858|ML|56|631.598.599||ARN|FC||H|TN|||120||2|2|339.15|595.00|||16|43142
9859|ML|56|631.598.600||ARN|FC||H|TP|||120||2|2|339.15|595.00|||16|43142
9860|ML|56|631.598.601||AEC|FC||H|TN|||120||2|2|339.15|595.00|||16|43142
9861|ML|56|631.598.602||AEC|FC||H|TP|||120||2|2|339.15|595.00|||16|43142
9862|ML|56|631.598.603||AOC|FO||H|TN|||120||2|2|339.15|595.00|||16|43142
9863|ML|56|631.598.604||AOC|FO||H|TP|||120||2|2|339.15|595.00|||16|43142
9864|ML|56|631.598.605||AEO|FO||H|TN|||120||2|2|339.15|595.00|||16|43142
9865|ML|56|631.598.606||AEO|FO||H|TP|||120||2|2|339.15|595.00|||16|43142
9866|ML|56|626.612.599||ARN|FC||V|TN|||60||2|2|262.77|461.00|||17|44142
9867|ML|56|626.612.600||ARN|FC||V|TP|||60||2|2|262.77|461.00|||17|44142
9868|ML|56|626.612.601||AEC|FC||V|TN|||60||2|2|262.77|461.00|||17|44142
9869|ML|56|626.612.602||AEC|FC||V|TP|||60||2|2|262.77|461.00|||17|44142
9870|ML|56|626.612.603||AOC|FO||V|TN|||60||2|2|262.77|461.00|||17|44142
9871|ML|56|626.612.604||AOC|FO||V|TP|||60||2|2|262.77|461.00|||17|44142
9872|ML|56|626.612.605||AEO|FO||V|TN|||60||2|2|262.77|461.00|||17|44142
9873|ML|56|626.612.606||AEO|FO||V|TP|||60||2|2|262.77|461.00|||17|44142
9874|ML|56|627.612.599||ARN|FC||V|TN|||70||2|2|274.74|482.00|||17|44142
9875|ML|56|627.612.600||ARN|FC||V|TP|||70||2|2|274.74|482.00|||17|44142
9876|ML|56|627.612.601||AEC|FC||V|TN|||70||2|2|274.74|482.00|||17|44142
9877|ML|56|627.612.602||AEC|FC||V|TP|||70||2|2|274.74|482.00|||17|44142
9878|ML|56|627.612.603||AOC|FO||V|TN|||70||2|2|274.74|482.00|||17|44142
9879|ML|56|627.612.604||AOC|FO||V|TP|||70||2|2|274.74|482.00|||17|44142
9880|ML|56|627.612.605||AEO|FO||V|TN|||70||2|2|274.74|482.00|||17|44142
9881|ML|56|627.612.606||AEO|FO||V|TP|||70||2|2|274.74|482.00|||17|44142
9882|ML|56|628.612.599||ARN|FC||V|TN|||80||2|2|279.87|491.00|||17|44142
9883|ML|56|628.612.600||ARN|FC||V|TP|||80||2|2|279.87|491.00|||17|44142
9884|ML|56|628.612.601||AEC|FC||V|TN|||80||2|2|279.87|491.00|||17|44142
9885|ML|56|628.612.602||AEC|FC||V|TP|||80||2|2|279.87|491.00|||17|44142
9886|ML|56|628.612.603||AOC|FO||V|TN|||80||2|2|279.87|491.00|||17|44142
9887|ML|56|628.612.604||AOC|FO||V|TP|||80||2|2|279.87|491.00|||17|44142
9888|ML|56|628.612.605||AEO|FO||V|TN|||80||2|2|279.87|491.00|||17|44142
9889|ML|56|628.612.606||AEO|FO||V|TP|||80||2|2|279.87|491.00|||17|44142
9890|ML|56|629.612.599||ARN|FC||V|TN|||90||2|2|306.66|538.00|||17|44142
9891|ML|56|629.612.600||ARN|FC||V|TP|||90||2|2|306.66|538.00|||17|44142
9892|ML|56|629.612.601||AEC|FC||V|TN|||90||2|2|306.66|538.00|||17|44142
9893|ML|56|629.612.602||AEC|FC||V|TP|||90||2|2|306.66|538.00|||17|44142
9894|ML|56|629.612.603||AOC|FO||V|TN|||90||2|2|306.66|538.00|||17|44142
9895|ML|56|629.612.604||AOC|FO||V|TP|||90||2|2|306.66|538.00|||17|44142
9896|ML|56|629.612.605||AEO|FO||V|TN|||90||2|2|306.66|538.00|||17|44142
9897|ML|56|629.612.606||AEO|FO||V|TP|||90||2|2|306.66|538.00|||17|44142
9898|ML|56|630.612.599||ARN|FC||V|TN|||100||2|2|322.05|565.00|||17|44142
9899|ML|56|630.612.600||ARN|FC||V|TP|||100||2|2|322.05|565.00|||17|44142
9900|ML|56|630.612.601||AEC|FC||V|TN|||100||2|2|322.05|565.00|||17|44142
9901|ML|56|630.612.602||AEC|FC||V|TP|||100||2|2|322.05|565.00|||17|44142
9902|ML|56|630.612.603||AOC|FO||V|TN|||100||2|2|322.05|565.00|||17|44142
9903|ML|56|630.612.604||AOC|FO||V|TP|||100||2|2|322.05|565.00|||17|44142
9904|ML|56|630.612.605||AEO|FO||V|TN|||100||2|2|322.05|565.00|||17|44142
9905|ML|56|630.612.606||AEO|FO||V|TP|||100||2|2|322.05|565.00|||17|44142
9906|ML|56|631.612.599||ARN|FC||V|TN|||120||2|2|339.15|595.00|||17|44142
9907|ML|56|631.612.600||ARN|FC||V|TP|||120||2|2|339.15|595.00|||17|44142
9908|ML|56|631.612.601||AEC|FC||V|TN|||120||2|2|339.15|595.00|||17|44142
9909|ML|56|631.612.602||AEC|FC||V|TP|||120||2|2|339.15|595.00|||17|44142
9910|ML|56|631.612.603||AOC|FO||V|TN|||120||2|2|339.15|595.00|||17|44142
9911|ML|56|631.612.604||AOC|FO||V|TP|||120||2|2|339.15|595.00|||17|44142
9912|ML|56|631.612.605||AEO|FO||V|TN|||120||2|2|339.15|595.00|||17|44142
9913|ML|56|631.612.606||AEO|FO||V|TP|||120||2|2|339.15|595.00|||17|44142
9914|ML|56|626.625.599||ARN|FC||MX|TN|||60||2|2|262.77|461.00|||18|45142
9915|ML|56|626.625.600||ARN|FC||MX|TP|||60||2|2|262.77|461.00|||18|45142
9916|ML|56|626.625.601||AEC|FC||MX|TN|||60||2|2|262.77|461.00|||18|45142
9917|ML|56|626.625.602||AEC|FC||MX|TP|||60||2|2|262.77|461.00|||18|45142
9918|ML|56|626.625.603||AOC|FO||MX|TN|||60||2|2|262.77|461.00|||18|45142
9919|ML|56|626.625.604||AOC|FO||MX|TP|||60||2|2|262.77|461.00|||18|45142
9920|ML|56|626.625.605||AEO|FO||MX|TN|||60||2|2|262.77|461.00|||18|45142
9921|ML|56|626.625.606||AEO|FO||MX|TP|||60||2|2|262.77|461.00|||18|45142
9922|ML|56|627.625.599||ARN|FC||MX|TN|||70||2|2|274.74|482.00|||18|45142
9923|ML|56|627.625.600||ARN|FC||MX|TP|||70||2|2|274.74|482.00|||18|45142
9924|ML|56|627.625.601||AEC|FC||MX|TN|||70||2|2|274.74|482.00|||18|45142
9925|ML|56|627.625.602||AEC|FC||MX|TP|||70||2|2|274.74|482.00|||18|45142
9926|ML|56|627.625.603||AOC|FO||MX|TN|||70||2|2|274.74|482.00|||18|45142
9927|ML|56|627.625.604||AOC|FO||MX|TP|||70||2|2|274.74|482.00|||18|45142
9928|ML|56|627.625.605||AEO|FO||MX|TN|||70||2|2|274.74|482.00|||18|45142
9929|ML|56|627.625.606||AEO|FO||MX|TP|||70||2|2|274.74|482.00|||18|45142
9930|ML|56|628.625.599||ARN|FC||MX|TN|||80||2|2|279.87|491.00|||18|45142
9931|ML|56|628.625.600||ARN|FC||MX|TP|||80||2|2|279.87|491.00|||18|45142
9932|ML|56|628.625.601||AEC|FC||MX|TN|||80||2|2|279.87|491.00|||18|45142
9933|ML|56|628.625.602||AEC|FC||MX|TP|||80||2|2|279.87|491.00|||18|45142
9934|ML|56|628.625.603||AOC|FO||MX|TN|||80||2|2|279.87|491.00|||18|45142
9935|ML|56|628.625.604||AOC|FO||MX|TP|||80||2|2|279.87|491.00|||18|45142
9936|ML|56|628.625.605||AEO|FO||MX|TN|||80||2|2|279.87|491.00|||18|45142
9937|ML|56|628.625.606||AEO|FO||MX|TP|||80||2|2|279.87|491.00|||18|45142
9938|ML|56|629.625.599||ARN|FC||MX|TN|||90||2|2|306.66|538.00|||18|45142
9939|ML|56|629.625.600||ARN|FC||MX|TP|||90||2|2|306.66|538.00|||18|45142
9940|ML|56|629.625.601||AEC|FC||MX|TN|||90||2|2|306.66|538.00|||18|45142
9941|ML|56|629.625.602||AEC|FC||MX|TP|||90||2|2|306.66|538.00|||18|45142
9942|ML|56|629.625.603||AOC|FO||MX|TN|||90||2|2|306.66|538.00|||18|45142
9943|ML|56|629.625.604||AOC|FO||MX|TP|||90||2|2|306.66|538.00|||18|45142
9944|ML|56|629.625.605||AEO|FO||MX|TN|||90||2|2|306.66|538.00|||18|45142
9945|ML|56|629.625.606||AEO|FO||MX|TP|||90||2|2|306.66|538.00|||18|45142
9946|ML|56|630.625.599||ARN|FC||MX|TN|||100||2|2|322.05|565.00|||18|45142
9947|ML|56|630.625.600||ARN|FC||MX|TP|||100||2|2|322.05|565.00|||18|45142
9948|ML|56|630.625.601||AEC|FC||MX|TN|||100||2|2|322.05|565.00|||18|45142
9949|ML|56|630.625.602||AEC|FC||MX|TP|||100||2|2|322.05|565.00|||18|45142
9950|ML|56|630.625.603||AOC|FO||MX|TN|||100||2|2|322.05|565.00|||18|45142
9951|ML|56|630.625.604||AOC|FO||MX|TP|||100||2|2|322.05|565.00|||18|45142
9952|ML|56|630.625.605||AEO|FO||MX|TN|||100||2|2|322.05|565.00|||18|45142
9953|ML|56|630.625.606||AEO|FO||MX|TP|||100||2|2|322.05|565.00|||18|45142
9954|ML|56|631.625.599||ARN|FC||MX|TN|||120||2|2|339.15|595.00|||18|45142
9955|ML|56|631.625.600||ARN|FC||MX|TP|||120||2|2|339.15|595.00|||18|45142
9956|ML|56|631.625.601||AEC|FC||MX|TN|||120||2|2|339.15|595.00|||18|45142
9957|ML|56|631.625.602||AEC|FC||MX|TP|||120||2|2|339.15|595.00|||18|45142
9958|ML|56|631.625.603||AOC|FO||MX|TN|||120||2|2|339.15|595.00|||18|45142
9959|ML|56|631.625.604||AOC|FO||MX|TP|||120||2|2|339.15|595.00|||18|45142
9960|ML|56|631.625.605||AEO|FO||MX|TN|||120||2|2|339.15|595.00|||18|45142
9961|ML|56|631.625.606||AEO|FO||MX|TP|||120||2|2|339.15|595.00|||18|45142
9962|ML|57|632.598.599||ARN|FC||H|TN|||60||2|2|344.28|604.00|||19|43103
9963|ML|57|632.598.600||ARN|FC||H|TP|||60||2|2|344.28|604.00|||19|43103
9964|ML|57|632.598.601||AEC|FC||H|TN|||60||2|2|344.28|604.00|||19|43103
9965|ML|57|632.598.602||AEC|FC||H|TP|||60||2|2|344.28|604.00|||19|43103
9966|ML|57|632.598.603||AOC|FO||H|TN|||60||2|2|344.28|604.00|||19|43103
9967|ML|57|632.598.604||AOC|FO||H|TP|||60||2|2|344.28|604.00|||19|43103
9968|ML|57|632.598.605||AEO|FO||H|TN|||60||2|2|344.28|604.00|||19|43103
9969|ML|57|632.598.606||AEO|FO||H|TP|||60||2|2|344.28|604.00|||19|43103
9970|ML|57|633.598.599||ARN|FC||H|TN|||70||2|2|360.81|633.00|||19|43103
9971|ML|57|633.598.600||ARN|FC||H|TP|||70||2|2|360.81|633.00|||19|43103
9972|ML|57|633.598.601||AEC|FC||H|TN|||70||2|2|360.81|633.00|||19|43103
9973|ML|57|633.598.602||AEC|FC||H|TP|||70||2|2|360.81|633.00|||19|43103
9974|ML|57|633.598.603||AOC|FO||H|TN|||70||2|2|360.81|633.00|||19|43103
9975|ML|57|633.598.604||AOC|FO||H|TP|||70||2|2|360.81|633.00|||19|43103
9976|ML|57|633.598.605||AEO|FO||H|TN|||70||2|2|360.81|633.00|||19|43103
9977|ML|57|633.598.606||AEO|FO||H|TP|||70||2|2|360.81|633.00|||19|43103
9978|ML|57|634.598.599||ARN|FC||H|TN|||80||2|2|375.06|658.00|||19|43103
9979|ML|57|634.598.600||ARN|FC||H|TP|||80||2|2|375.06|658.00|||19|43103
9980|ML|57|634.598.601||AEC|FC||H|TN|||80||2|2|375.06|658.00|||19|43103
9981|ML|57|634.598.602||AEC|FC||H|TP|||80||2|2|375.06|658.00|||19|43103
9982|ML|57|634.598.603||AOC|FO||H|TN|||80||2|2|375.06|658.00|||19|43103
9983|ML|57|634.598.604||AOC|FO||H|TP|||80||2|2|375.06|658.00|||19|43103
9984|ML|57|634.598.605||AEO|FO||H|TN|||80||2|2|375.06|658.00|||19|43103
9985|ML|57|634.598.606||AEO|FO||H|TP|||80||2|2|375.06|658.00|||19|43103
9986|ML|57|635.598.599||ARN|FC||H|TN|||90||2|2|396.72|696.00|||19|43103
9987|ML|57|635.598.600||ARN|FC||H|TP|||90||2|2|396.72|696.00|||19|43103
9988|ML|57|635.598.601||AEC|FC||H|TN|||90||2|2|396.72|696.00|||19|43103
9989|ML|57|635.598.602||AEC|FC||H|TP|||90||2|2|396.72|696.00|||19|43103
9990|ML|57|635.598.603||AOC|FO||H|TN|||90||2|2|396.72|696.00|||19|43103
9991|ML|57|635.598.604||AOC|FO||H|TP|||90||2|2|396.72|696.00|||19|43103
9992|ML|57|635.598.605||AEO|FO||H|TN|||90||2|2|396.72|696.00|||19|43103
9993|ML|57|635.598.606||AEO|FO||H|TP|||90||2|2|396.72|696.00|||19|43103
9994|ML|57|636.598.599||ARN|FC||H|TN|||100||2|2|406.98|714.00|||19|43103
9995|ML|57|636.598.600||ARN|FC||H|TP|||100||2|2|406.98|714.00|||19|43103
9996|ML|57|636.598.601||AEC|FC||H|TN|||100||2|2|406.98|714.00|||19|43103
9997|ML|57|636.598.602||AEC|FC||H|TP|||100||2|2|406.98|714.00|||19|43103
9998|ML|57|636.598.603||AOC|FO||H|TN|||100||2|2|406.98|714.00|||19|43103
9999|ML|57|636.598.604||AOC|FO||H|TP|||100||2|2|406.98|714.00|||19|43103
10000|ML|57|636.598.605||AEO|FO||H|TN|||100||2|2|406.98|714.00|||19|43103
10001|ML|57|636.598.606||AEO|FO||H|TP|||100||2|2|406.98|714.00|||19|43103
10002|ML|57|637.598.599||ARN|FC||H|TN|||120||2|2|436.62|766.00|||19|43103
10003|ML|57|637.598.600||ARN|FC||H|TP|||120||2|2|436.62|766.00|||19|43103
10004|ML|57|637.598.601||AEC|FC||H|TN|||120||2|2|436.62|766.00|||19|43103
10005|ML|57|637.598.602||AEC|FC||H|TP|||120||2|2|436.62|766.00|||19|43103
10006|ML|57|637.598.603||AOC|FO||H|TN|||120||2|2|436.62|766.00|||19|43103
10007|ML|57|637.598.604||AOC|FO||H|TP|||120||2|2|436.62|766.00|||19|43103
10008|ML|57|637.598.605||AEO|FO||H|TN|||120||2|2|436.62|766.00|||19|43103
10009|ML|57|637.598.606||AEO|FO||H|TP|||120||2|2|436.62|766.00|||19|43103
10010|ML|57|632.612.599||ARN|FC||V|TN|||60||2|2|344.28|604.00|||20|44103
10011|ML|57|632.612.600||ARN|FC||V|TP|||60||2|2|344.28|604.00|||20|44103
10012|ML|57|632.612.601||AEC|FC||V|TN|||60||2|2|344.28|604.00|||20|44103
10013|ML|57|632.612.602||AEC|FC||V|TP|||60||2|2|344.28|604.00|||20|44103
10014|ML|57|632.612.603||AOC|FO||V|TN|||60||2|2|344.28|604.00|||20|44103
10015|ML|57|632.612.604||AOC|FO||V|TP|||60||2|2|344.28|604.00|||20|44103
10016|ML|57|632.612.605||AEO|FO||V|TN|||60||2|2|344.28|604.00|||20|44103
10017|ML|57|632.612.606||AEO|FO||V|TP|||60||2|2|344.28|604.00|||20|44103
10018|ML|57|633.612.599||ARN|FC||V|TN|||70||2|2|360.81|633.00|||20|44103
10019|ML|57|633.612.600||ARN|FC||V|TP|||70||2|2|360.81|633.00|||20|44103
10020|ML|57|633.612.601||AEC|FC||V|TN|||70||2|2|360.81|633.00|||20|44103
10021|ML|57|633.612.602||AEC|FC||V|TP|||70||2|2|360.81|633.00|||20|44103
10022|ML|57|633.612.603||AOC|FO||V|TN|||70||2|2|360.81|633.00|||20|44103
10023|ML|57|633.612.604||AOC|FO||V|TP|||70||2|2|360.81|633.00|||20|44103
10024|ML|57|633.612.605||AEO|FO||V|TN|||70||2|2|360.81|633.00|||20|44103
10025|ML|57|633.612.606||AEO|FO||V|TP|||70||2|2|360.81|633.00|||20|44103
10026|ML|57|634.612.599||ARN|FC||V|TN|||80||2|2|375.06|658.00|||20|44103
10027|ML|57|634.612.600||ARN|FC||V|TP|||80||2|2|375.06|658.00|||20|44103
10028|ML|57|634.612.601||AEC|FC||V|TN|||80||2|2|375.06|658.00|||20|44103
10029|ML|57|634.612.602||AEC|FC||V|TP|||80||2|2|375.06|658.00|||20|44103
10030|ML|57|634.612.603||AOC|FO||V|TN|||80||2|2|375.06|658.00|||20|44103
10031|ML|57|634.612.604||AOC|FO||V|TP|||80||2|2|375.06|658.00|||20|44103
10032|ML|57|634.612.605||AEO|FO||V|TN|||80||2|2|375.06|658.00|||20|44103
10033|ML|57|634.612.606||AEO|FO||V|TP|||80||2|2|375.06|658.00|||20|44103
10034|ML|57|635.612.599||ARN|FC||V|TN|||90||2|2|396.72|696.00|||20|44103
10035|ML|57|635.612.600||ARN|FC||V|TP|||90||2|2|396.72|696.00|||20|44103
10036|ML|57|635.612.601||AEC|FC||V|TN|||90||2|2|396.72|696.00|||20|44103
10037|ML|57|635.612.602||AEC|FC||V|TP|||90||2|2|396.72|696.00|||20|44103
10038|ML|57|635.612.603||AOC|FO||V|TN|||90||2|2|396.72|696.00|||20|44103
10039|ML|57|635.612.604||AOC|FO||V|TP|||90||2|2|396.72|696.00|||20|44103
10040|ML|57|635.612.605||AEO|FO||V|TN|||90||2|2|396.72|696.00|||20|44103
10041|ML|57|635.612.606||AEO|FO||V|TP|||90||2|2|396.72|696.00|||20|44103
10042|ML|57|636.612.599||ARN|FC||V|TN|||100||2|2|406.98|714.00|||20|44103
10043|ML|57|636.612.600||ARN|FC||V|TP|||100||2|2|406.98|714.00|||20|44103
10044|ML|57|636.612.601||AEC|FC||V|TN|||100||2|2|406.98|714.00|||20|44103
10045|ML|57|636.612.602||AEC|FC||V|TP|||100||2|2|406.98|714.00|||20|44103
10046|ML|57|636.612.603||AOC|FO||V|TN|||100||2|2|406.98|714.00|||20|44103
10047|ML|57|636.612.604||AOC|FO||V|TP|||100||2|2|406.98|714.00|||20|44103
10048|ML|57|636.612.605||AEO|FO||V|TN|||100||2|2|406.98|714.00|||20|44103
10049|ML|57|636.612.606||AEO|FO||V|TP|||100||2|2|406.98|714.00|||20|44103
10050|ML|57|637.612.599||ARN|FC||V|TN|||120||2|2|436.62|766.00|||20|44103
10051|ML|57|637.612.600||ARN|FC||V|TP|||120||2|2|436.62|766.00|||20|44103
10052|ML|57|637.612.601||AEC|FC||V|TN|||120||2|2|436.62|766.00|||20|44103
10053|ML|57|637.612.602||AEC|FC||V|TP|||120||2|2|436.62|766.00|||20|44103
10054|ML|57|637.612.603||AOC|FO||V|TN|||120||2|2|436.62|766.00|||20|44103
10055|ML|57|637.612.604||AOC|FO||V|TP|||120||2|2|436.62|766.00|||20|44103
10056|ML|57|637.612.605||AEO|FO||V|TN|||120||2|2|436.62|766.00|||20|44103
10057|ML|57|637.612.606||AEO|FO||V|TP|||120||2|2|436.62|766.00|||20|44103
10058|TB|1|638|||||||||60||2|2|53.01|93.00|||21|31110
10059|TB|1|639|||||||||70||2|2|63.27|111.00|||21|31110
10060|TB|1|640|||||||||80||2|2|63.27|111.00|||21|31110
10061|TB|1|641|||||||||90||2|2|70.68|124.00|||21|31110
10062|TB|1|642|||||||||100||2|2|70.68|124.00|||21|31110
10063|TB|1|643|||||||||120||2|2|78.66|138.00|||21|31110
10064|TB|2|644|||||||||60||2|2|95.19|167.00|||21|56550
10065|TB|2|645|||||||||70||2|2|116.85|205.00|||21|56550
10066|TB|2|646|||||||||80||2|2|116.85|205.00|||21|56550
10067|TB|2|647|||||||||90||2|2|138.51|243.00|||21|56550
10068|TB|2|648|||||||||100||2|2|138.51|243.00|||21|56550
10069|TB|2|649|||||||||120||2|2|159.60|280.00|||21|56550
10070|TB|3|650|||||||||120||2|2|193.80|340.00|||22|51531
10071|TB|4|651|||||||||||2|2|142.50|250.00|||23|51538
10072|TB|5|652|||||||||||2|2|156.75|275.00|||23|51539
10073|TB|6|653||||||||||24|2|2|202.35|355.00|||23|56576
10074|TB|7|654|||||||||60||2|2|65.55|115.00|||23|51530
10075|TB|7|655|||||||||70||2|2|71.25|125.00|||23|51530
10076|TB|7|656|||||||||80||2|2|79.80|140.00|||23|51530
10077|TB|7|657|||||||||90||2|2|91.20|160.00|||23|51530
10078|TB|7|658|||||||||100||2|2|102.60|180.00|||23|51530
10079|TB|7|659|||||||||120||2|2|156.75|275.00|||23|51530
10080|ML|58|660.661|||||||CEN||60||2|2|173.85|305.00|||24|28101
10081|ML|58|660.662|||||||ESQ||60||2|2|173.85|305.00|||24|29101
10082|ML|58|660.663|||||||DIR||60||2|2|173.85|305.00|||24|33101
10083|ML|58|664.661|||||||CEN||70||2|2|178.98|314.00|||24|28101
10084|ML|58|664.662|||||||ESQ||70||2|2|178.98|314.00|||24|29101
10085|ML|58|664.663|||||||DIR||70||2|2|178.98|314.00|||24|33101
10086|ML|58|665.661|||||||CEN||80||2|2|186.39|327.00|||24|28101
10087|ML|58|665.662|||||||ESQ||80||2|2|186.39|327.00|||24|29101
10088|ML|58|665.663|||||||DIR||80||2|2|186.39|327.00|||24|33101
10089|ML|58|666.661|||||||CEN||90||2|2|193.23|339.00|||24|28101
10090|ML|58|666.662|||||||ESQ||90||2|2|193.23|339.00|||24|29101
10091|ML|58|666.663|||||||DIR||90||2|2|193.23|339.00|||24|33101
10092|ML|58|667.661|||||||CEN||100||2|2|209.19|367.00|||24|28101
10093|ML|58|667.662|||||||ESQ||100||2|2|209.19|367.00|||24|29101
10094|ML|58|667.663|||||||DIR||100||2|2|209.19|367.00|||24|33101
10095|ML|58|668.661|||||||CEN||120||2|2|214.89|377.00|||24|28101
10096|ML|58|668.662|||||||ESQ||120||2|2|214.89|377.00|||24|29101
10097|ML|58|668.663|||||||DIR||120||2|2|214.89|377.00|||24|33101
10098|ML|59|669.661|||||||CEN||60||2|2|246.81|433.00|||24|28141
10099|ML|59|669.662|||||||ESQ||60||2|2|246.81|433.00|||24|29141
10100|ML|59|669.663|||||||DIR||60||2|2|246.81|433.00|||24|33141
10101|ML|59|670.661|||||||CEN||70||2|2|252.51|443.00|||24|28141
10102|ML|59|670.662|||||||ESQ||70||2|2|252.51|443.00|||24|29141
10103|ML|59|670.663|||||||DIR||70||2|2|252.51|443.00|||24|33141
10104|ML|59|671.661|||||||CEN||80||2|2|260.49|457.00|||24|28141
10105|ML|59|671.662|||||||ESQ||80||2|2|260.49|457.00|||24|29141
10106|ML|59|671.663|||||||DIR||80||2|2|260.49|457.00|||24|33141
10107|ML|59|672.661|||||||CEN||90||2|2|268.47|471.00|||24|28141
10108|ML|59|672.662|||||||ESQ||90||2|2|268.47|471.00|||24|29141
10109|ML|59|672.663|||||||DIR||90||2|2|268.47|471.00|||24|33141
10110|ML|59|673.661|||||||CEN||100||2|2|285.57|501.00|||24|28141
10111|ML|59|673.662|||||||ESQ||100||2|2|285.57|501.00|||24|29141
10112|ML|59|673.663|||||||DIR||100||2|2|285.57|501.00|||24|33141
10113|ML|59|674.661|||||||CEN||120||2|2|292.41|513.00|||24|28141
10114|ML|59|674.662|||||||ESQ||120||2|2|292.41|513.00|||24|29141
10115|ML|59|674.663|||||||DIR||120||2|2|292.41|513.00|||24|33141
10116|ML|60|675.676.661|||||||CEN||60||2|2|192.09|337.00|||24|28126
10117|ML|60|675.676.662|||||||ESQ||60||2|2|192.09|337.00|||24|29126
10118|ML|60|675.676.663|||||||DIR||60||2|2|192.09|337.00|||24|33126
10119|ML|60|675.677.661|||||||CEN||70||2|2|197.79|347.00|||24|28126
10120|ML|60|675.677.662|||||||ESQ||70||2|2|197.79|347.00|||24|29126
10121|ML|60|675.677.663|||||||DIR||70||2|2|197.79|347.00|||24|33126
10122|ML|60|675.678.661|||||||CEN||80||2|2|205.77|361.00|||24|28126
10123|ML|60|675.678.662|||||||ESQ||80||2|2|205.77|361.00|||24|29126
10124|ML|60|675.678.663|||||||DIR||80||2|2|205.77|361.00|||24|33126
10125|ML|60|675.679.661|||||||CEN||90||2|2|209.76|368.00|||24|28126
10126|ML|60|675.679.662|||||||ESQ||90||2|2|209.76|368.00|||24|29126
10127|ML|60|675.679.663|||||||DIR||90||2|2|209.76|368.00|||24|33126
10128|ML|60|675.680.661|||||||CEN||100||2|2|218.88|384.00|||24|28126
10129|ML|60|675.680.662|||||||ESQ||100||2|2|218.88|384.00|||24|29126
10130|ML|60|675.680.663|||||||DIR||100||2|2|218.88|384.00|||24|33126
10131|ML|60|675.681.661|||||||CEN||120||2|2|241.68|424.00|||24|28126
10132|ML|60|675.681.662|||||||ESQ||120||2|2|241.68|424.00|||24|29126
10133|ML|60|675.681.663|||||||DIR||120||2|2|241.68|424.00|||24|33126
10134|ML|61|682.661|||||||CEN||60||2|2|261.63|459.00|||24|28102
10135|ML|61|682.662|||||||ESQ||60||2|2|261.63|459.00|||24|29102
10136|ML|61|682.663|||||||DIR||60||2|2|261.63|459.00|||24|33102
10137|ML|61|683.661|||||||CEN||70||2|2|273.60|480.00|||24|28102
10138|ML|61|683.662|||||||ESQ||70||2|2|273.60|480.00|||24|29102
10139|ML|61|683.663|||||||DIR||70||2|2|273.60|480.00|||24|33102
10140|ML|61|684.661|||||||CEN||80||2|2|278.73|489.00|||24|28102
10141|ML|61|684.662|||||||ESQ||80||2|2|278.73|489.00|||24|29102
10142|ML|61|684.663|||||||DIR||80||2|2|278.73|489.00|||24|33102
10143|ML|61|685.661|||||||CEN||90||2|2|305.52|536.00|||24|28102
10144|ML|61|685.662|||||||ESQ||90||2|2|305.52|536.00|||24|29102
10145|ML|61|685.663|||||||DIR||90||2|2|305.52|536.00|||24|33102
10146|ML|61|686.661|||||||CEN||100||2|2|320.34|562.00|||24|28102
10147|ML|61|686.662|||||||ESQ||100||2|2|320.34|562.00|||24|29102
10148|ML|61|686.663|||||||DIR||100||2|2|320.34|562.00|||24|33102
10149|ML|61|687.661|||||||CEN||120||2|2|337.44|592.00|||24|28102
10150|ML|61|687.662|||||||ESQ||120||2|2|337.44|592.00|||24|29102
10151|ML|61|687.663|||||||DIR||120||2|2|337.44|592.00|||24|33102
10152|ML|62|688.661|||||||CEN||60||2|2|274.74|482.00|||24|28142
10153|ML|62|688.662|||||||ESQ||60||2|2|274.74|482.00|||24|29142
10154|ML|62|688.663|||||||DIR||60||2|2|274.74|482.00|||24|33142
10155|ML|62|689.661|||||||CEN||70||2|2|287.28|504.00|||24|28142
10156|ML|62|689.662|||||||ESQ||70||2|2|287.28|504.00|||24|29142
10157|ML|62|689.663|||||||DIR||70||2|2|287.28|504.00|||24|33142
10158|ML|62|690.661|||||||CEN||80||2|2|292.41|513.00|||24|28142
10159|ML|62|690.662|||||||ESQ||80||2|2|292.41|513.00|||24|29142
10160|ML|62|690.663|||||||DIR||80||2|2|292.41|513.00|||24|33142
10161|ML|62|691.661|||||||CEN||90||2|2|320.91|563.00|||24|28142
10162|ML|62|691.662|||||||ESQ||90||2|2|320.91|563.00|||24|29142
10163|ML|62|691.663|||||||DIR||90||2|2|320.91|563.00|||24|33142
10164|ML|62|692.661|||||||CEN||100||2|2|336.30|590.00|||24|28142
10165|ML|62|692.662|||||||ESQ||100||2|2|336.30|590.00|||24|29142
10166|ML|62|692.663|||||||DIR||100||2|2|336.30|590.00|||24|33142
10167|ML|62|693.661|||||||CEN||120||2|2|354.54|622.00|||24|28142
10168|ML|62|693.662|||||||ESQ||120||2|2|354.54|622.00|||24|29142
10169|ML|62|693.663|||||||DIR||120||2|2|354.54|622.00|||24|33142
10170|ML|63|694.661|||||||CEN||60||2|2|359.67|631.00|||24|28103
10171|ML|63|694.662|||||||ESQ||60||2|2|359.67|631.00|||24|29103
10172|ML|63|694.663|||||||DIR||60||2|2|359.67|631.00|||24|33103
10173|ML|63|695.661|||||||CEN||70||2|2|376.77|661.00|||24|28103
10174|ML|63|695.662|||||||ESQ||70||2|2|376.77|661.00|||24|29103
10175|ML|63|695.663|||||||DIR||70||2|2|376.77|661.00|||24|33103
10176|ML|63|696.661|||||||CEN||80||2|2|392.16|688.00|||24|28103
10177|ML|63|696.662|||||||ESQ||80||2|2|392.16|688.00|||24|29103
10178|ML|63|696.663|||||||DIR||80||2|2|392.16|688.00|||24|33103
10179|ML|63|697.661|||||||CEN||90||2|2|414.96|728.00|||24|28103
10180|ML|63|697.662|||||||ESQ||90||2|2|414.96|728.00|||24|29103
10181|ML|63|697.663|||||||DIR||90||2|2|414.96|728.00|||24|33103
10182|ML|63|698.661|||||||CEN||100||2|2|425.22|746.00|||24|28103
10183|ML|63|698.662|||||||ESQ||100||2|2|425.22|746.00|||24|29103
10184|ML|63|698.663|||||||DIR||100||2|2|425.22|746.00|||24|33103
10185|ML|63|699.661|||||||CEN||120||2|2|456.00|800.00|||24|28103
10186|ML|63|699.662|||||||ESQ||120||2|2|456.00|800.00|||24|29103
10187|ML|63|699.663|||||||DIR||120||2|2|456.00|800.00|||24|33103
10188|TB|8|700||||||||||24|2|2|156.75|275.00|||25|56570
10189|TB|9|701||||||||||25|2|2|182.40|320.00|||25|56573
10190|TB|10|702|||||||||60||2|2|158.46|278.00|||25|56580
10191|TB|10|703|||||||||70||2|2|169.86|298.00|||25|56580
10192|TB|10|704|||||||||80||2|2|184.11|323.00|||25|56580
10193|TB|10|705|||||||||90||2|2|198.93|349.00|||25|56580
10194|TB|10|706|||||||||100||2|2|221.16|388.00|||25|56580
10195|TB|10|707|||||||||120||2|2|261.06|458.00|||25|56580
10196|TB|11|708|||||||||60||2|2|59.85|105.00|||25|51520
10197|TB|11|709|||||||||70||2|2|62.70|110.00|||25|51520
10198|TB|11|710|||||||||80||2|2|68.40|120.00|||25|51520
10199|TB|11|711|||||||||90||2|2|82.65|145.00|||25|51520
10200|TB|11|712|||||||||100||2|2|91.20|160.00|||25|51520
10201|TB|11|713|||||||||120||2|2|136.80|240.00|||25|51520
10202|ML|64|714|||||||||60||2|2|181.26|318.00|||26|26101
10203|ML|64|715|||||||||70||2|2|186.96|328.00|||26|26101
10204|ML|64|716|||||||||80||2|2|194.37|341.00|||26|26101
10205|ML|64|717|||||||||90||2|2|201.78|354.00|||26|26101
10206|ML|64|718|||||||||100||2|2|218.31|383.00|||26|26101
10207|ML|64|719|||||||||120||2|2|224.58|394.00|||26|26101
10208|ML|65|720|||||||||60||2|2|257.64|452.00|||27|26141
10209|ML|65|721|||||||||70||2|2|263.34|462.00|||27|26141
10210|ML|65|722|||||||||80||2|2|271.89|477.00|||27|26141
10211|ML|65|723|||||||||90||2|2|279.87|491.00|||27|26141
10212|ML|65|724|||||||||100||2|2|298.11|523.00|||27|26141
10213|ML|65|725|||||||||120||2|2|304.95|535.00|||27|26141
10214|ML|66|726|||||||||60||2|2|273.03|479.00|||27|26102
10215|ML|66|727|||||||||70||2|2|285.00|500.00|||27|26102
10216|ML|66|728|||||||||80||2|2|290.70|510.00|||27|26102
10217|ML|66|729|||||||||90||2|2|318.63|559.00|||27|26102
10218|ML|66|730|||||||||100||2|2|334.59|587.00|||27|26102
10219|ML|66|731|||||||||120||2|2|352.26|618.00|||27|26102
10220|ML|67|732|||||||||60||2|2|286.71|503.00|||27|26142
10221|ML|67|733|||||||||70||2|2|299.25|525.00|||27|26142
10222|ML|67|734|||||||||80||2|2|305.52|536.00|||27|26142
10223|ML|67|735|||||||||90||2|2|334.59|587.00|||27|26142
10224|ML|67|736|||||||||100||2|2|351.12|616.00|||27|26142
10225|ML|67|737|||||||||120||2|2|369.93|649.00|||27|26142
10226|ML|68|738|||||||||60||2|2|375.63|659.00|||27|26103
10227|ML|68|739|||||||||70||2|2|393.30|690.00|||27|26103
10228|ML|68|740|||||||||80||2|2|409.26|718.00|||27|26103
10229|ML|68|741|||||||||90||2|2|433.20|760.00|||27|26103
10230|ML|68|742|||||||||100||2|2|444.03|779.00|||27|26103
10231|ML|68|743|||||||||120||2|2|475.95|835.00|||27|26103
10232|ML|69|744.745.746|||||||||90||2|2|361.95|635.00|||28|26107
10233|ML|70|744.745.747|||||||||90||2|2|361.95|635.00|||28|26109
10234|ML|71|744.745.748.749|||||||||90||2|2|361.95|635.00|||28|26130
10235|ML|72|744.745.748.750|||||||||90||2|2|361.95|635.00|||28|26106
10236|ML|69|744.751.746|||||||||100||2|2|388.74|682.00|||28|26107
10237|ML|70|744.751.747|||||||||100||2|2|388.74|682.00|||28|26109
10238|ML|71|744.751.748.749|||||||||100||2|2|388.74|682.00|||28|26130
10239|ML|72|744.751.748.750|||||||||100||2|2|388.74|682.00|||28|26106
10240|ML|69|744.752.746|||||||||120||2|2|407.55|715.00|||28|26107
10241|ML|70|744.752.747|||||||||120||2|2|407.55|715.00|||28|26109
10242|ML|71|744.752.748.749|||||||||120||2|2|407.55|715.00|||28|26130
10243|ML|72|744.752.748.750|||||||||120||2|2|407.55|715.00|||28|26106
10244|TB|12|753|||||||||60||2|2|48.45|85.00|||29|31386
10245|TB|12|754|||||||||70||2|2|51.30|90.00|||29|31386
10246|TB|12|755|||||||||80||2|2|57.00|100.00|||29|31386
10247|TB|12|756|||||||||90||2|2|62.13|109.00|||29|31386
10248|TB|12|757|||||||||100||2|2|64.98|114.00|||29|31386
10249|TB|12|758|||||||||120||2|2|76.95|135.00|||29|31386
10250|TB|13|759|||||||||||2|2|82.65|145.00|||29|51534
10251|TB|14|760|||||||||90||2|2|198.93|349.00|||29|56582
10252|TB|14|761|||||||||100||2|2|221.16|388.00|||29|56582
10253|TB|14|762|||||||||120||2|2|261.06|458.00|||29|56582
10254|TB|15|763|||||||||80||2|2|193.80|340.00|||29|51543
10255|TB|15|764|||||||||100||2|2|239.40|420.00|||29|51543
10256|TB|15|765|||||||||120||2|2|282.15|495.00|||29|51543
10257|TB|16|766|||||||||80||2|2|156.75|275.00|||30|31369
10258|TB|16|767|||||||||100||2|2|168.15|295.00|||30|31369
10259|TB|16|768|||||||||120||2|2|176.70|310.00|||30|31369
10260|TB|17|769|||||||||80||2|2|57.00|100.00|||31|31382
10261|TB|17|770|||||||||100||2|2|64.98|114.00|||31|31382
10262|TB|17|771|||||||||120||2|2|76.95|135.00|||31|31382
10263|ML|73|772||||||||||26|3|3|205.70|374.00|||32|
10264|ML|73|773||||||||||27|3|3|221.10|402.00|||32|
10265|ML|73|774||||||||||28|3|3|240.35|437.00|||32|
10266|ML|73|775||||||||||29|3|3|411.40|748.00|||32|
10267|ML|74|776||||||||||26|3|3|205.70|374.00|||33|
10268|ML|74|777||||||||||27|3|3|221.10|402.00|||33|
10269|ML|74|778||||||||||28|3|3|240.35|437.00|||33|
10270|ML|74|779||||||||||29|3|3|411.40|748.00|||33|
10271|ML|75|780||||||||||26|3|3|123.20|224.00|||34|
10272|ML|75|781||||||||||27|3|3|138.60|252.00|||34|
10273|ML|75|782||||||||||28|3|3|157.85|287.00|||34|
10274|ML|75|783||||||||||29|3|3|247.50|450.00|||34|
10275|ML|76|784||||||||||26|3|3|123.20|224.00|||35|
10276|ML|76|785||||||||||27|3|3|138.60|252.00|||35|
10277|ML|76|786||||||||||28|3|3|157.85|287.00|||35|
10278|ML|76|787||||||||||29|3|3|247.50|450.00|||35|
10279|ML|77|788|||||||||60||3|3|157.30|286.00|||36|
10280|ML|77|789|||||||||80||3|3|168.85|307.00|||36|
10281|ML|77|790|||||||||100||3|3|179.85|327.00|||36|
10282|ML|77|791|||||||||120||3|3|314.60|572.00|||36|
10283|TB|18|792||||||||||30|3|3|34.10|62.00|||37|
10284|TB|18|793||||||||||31|3|3|38.50|70.00|||37|
10285|TB|18|794||||||||||32|3|3|41.80|76.00|||37|
10286|TB|18|795||||||||||33|3|3|45.65|83.00|||37|
10287|TB|18|796||||||||||34|3|3|51.70|94.00|||37|
10288|TB|18|797||||||||||35|3|3|59.95|109.00|||37|
10289|TB|19|798||||||||||30|3|3|47.85|87.00|||38|
10290|TB|19|799||||||||||31|3|3|57.20|104.00|||38|
10291|TB|19|800||||||||||32|3|3|70.95|129.00|||38|
10292|TB|19|801||||||||||33|3|3|74.25|135.00|||38|
10293|TB|19|802||||||||||34|3|3|84.15|153.00|||38|
10294|TB|19|803||||||||||35|3|3|96.25|175.00|||38|
10295|TB|20|804|||||||||||3|3|16.50|30.00|||39|
10296|TB|21|805|||||||||||3|3|33.00|60.00|||39|
10297|TB|22|806||||||||||30|3|3|70.95|129.00|||40|
10298|TB|22|807||||||||||31|3|3|85.80|156.00|||40|
10299|TB|22|808||||||||||32|3|3|102.85|187.00|||40|
10300|TB|23|809||||||||||33|3|3|121.00|220.00|||40|
10301|TB|24|810||||||||||33|3|3|121.00|220.00|||40|
10302|TB|25|811||||||||||33|3|3|121.00|220.00|||41|
10303|TB|26|812||||||||||36|3|3|70.95|129.00|||42|
10304|TB|26|813||||||||||37|3|3|85.80|156.00|||42|
10305|TB|26|814||||||||||38|3|3|102.85|187.00|||42|
10306|TB|27|815||||||||||39|3|3|70.95|129.00|||42|
10307|TB|28|816||||||||||39|3|3|70.95|129.00|||42|
10308|TB|29|817||||||||||40|3|3|85.80|156.00|||42|
10309|TB|30|818||||||||||41|3|3|85.80|156.00|||42|
10310|TB|31|819||||||||||40|3|3|85.80|156.00|||42|
10311|TB|32|820||||||||||41|3|3|85.80|156.00|||42|
10312|E|1|821||||||||||42|3|3|26.95|49.00|||43|
10313|E|1|822||||||||||43|3|3|34.65|63.00|||43|
10314|E|1|823||||||||||44|3|3|39.60|72.00|||43|
10315|E|1|824||||||||||45|3|3|58.85|107.00|||43|
10316|E|2|825||||||||||42|3|3|93.50|170.00|||44|
10317|E|2|826||||||||||43|3|3|102.30|186.00|||44|
10318|E|2|827||||||||||44|3|3|116.05|211.00|||44|
10319|E|2|828||||||||||45|3|3|125.40|228.00|||44|
10320|E|3|829||||||||||46|3|3|80.30|146.00|||45|
10321|E|3|830||||||||||47|3|3|96.80|176.00|||45|
10322|E|3|831||||||||||48|3|3|112.20|204.00|||45|
10323|E|4|832||||||||||46|3|3|100.65|183.00|||46|
10324|E|4|833||||||||||47|3|3|123.75|225.00|||46|
10325|E|4|834||||||||||48|3|3|141.35|257.00|||46|
10326|E|5|835||||||||||46|3|3|85.80|156.00|||47|
10327|E|5|836||||||||||47|3|3|105.60|192.00|||47|
10328|E|5|837||||||||||48|3|3|122.10|222.00|||47|
10329|E|6|838||||||||||49|3|3|34.65|63.00|||43|
10330|E|7|839||||||||||49|3|3|96.80|176.00|||45|
10331|E|8|840||||||||||50|3|3|96.80|176.00|||48|
10332|E|9|841||||||||||49|3|3|102.30|186.00|||49|
10333|E|10|842||||||||||49|3|3|123.75|225.00|||46|
10334|E|11|843||||||||||50|3|3|123.75|225.00|||50|
10335|C|1|844.845||TBL|TBL|||||||51|1|1|140.40|260.00|||51|
10336|C|1|844.846||TEA|TEA|||||||51|1|1|140.40|260.00|||51|
10337|C|1|844.847||OAK|OAK|||||||51|1|1|140.40|260.00|||51|
10338|C|1|844.848||JOP|JOP|||||||51|1|1|140.40|260.00|||51|
10339|C|1|844.849||TBL|BCO|B||||||51|1|1|167.40|310.00|||52|
10340|C|1|844.850||TBL|BCO|M||||||51|1|1|167.40|310.00|||52|
10341|C|1|844.851||TBL|CCL|B||||||51|1|1|167.40|310.00|||52|
10342|C|1|844.852||TBL|CCL|M||||||51|1|1|167.40|310.00|||52|
10343|C|1|844.853||TBL|CME|B||||||51|1|1|167.40|310.00|||52|
10344|C|1|844.854||TBL|CME|M||||||51|1|1|167.40|310.00|||52|
10345|C|1|844.855||TBL|ANT|B||||||51|1|1|167.40|310.00|||52|
10346|C|1|844.856||TBL|ANT|M||||||51|1|1|167.40|310.00|||52|
10347|C|1|844.857||TBL|PTO|B||||||51|1|1|167.40|310.00|||52|
10348|C|1|844.858||TBL|PTO|M||||||51|1|1|167.40|310.00|||52|
10349|C|1|844.859||TBL|CRE|B||||||51|1|1|167.40|310.00|||52|
10350|C|1|844.860||TBL|CRE|M||||||51|1|1|167.40|310.00|||52|
10351|C|1|844.861||TBL|CAM|B||||||51|1|1|167.40|310.00|||52|
10352|C|1|844.862||TBL|CAM|M||||||51|1|1|167.40|310.00|||52|
10353|C|1|844.863||TBL|OUR|B||||||51|1|1|167.40|310.00|||52|
10354|C|1|844.864||TBL|OUR|M||||||51|1|1|167.40|310.00|||52|
10355|C|1|844.865||TBL|COB|B||||||51|1|1|167.40|310.00|||52|
10356|C|1|844.866||TBL|COB|M||||||51|1|1|167.40|310.00|||52|
10357|C|1|844.867||TBL|CHO|B||||||51|1|1|167.40|310.00|||52|
10358|C|1|844.868||TBL|CHO|M||||||51|1|1|167.40|310.00|||52|
10359|C|1|844.869||TBL|VAG|B||||||51|1|1|167.40|310.00|||52|
10360|C|1|844.870||TBL|VAG|M||||||51|1|1|167.40|310.00|||52|
10361|C|1|844.871||TBL|AZE|B||||||51|1|1|167.40|310.00|||52|
10362|C|1|844.872||TBL|AZE|M||||||51|1|1|167.40|310.00|||52|
10363|C|1|844.873||TBL|AMA|B||||||51|1|1|167.40|310.00|||52|
10364|C|1|844.874||TBL|AMA|M||||||51|1|1|167.40|310.00|||52|
10365|C|1|844.875||TBL|AES|B||||||51|1|1|167.40|310.00|||52|
10366|C|1|844.876||TBL|AES|M||||||51|1|1|167.40|310.00|||52|
10367|C|1|844.877||TBL|PRA|B||||||51|1|1|167.40|310.00|||52|
10368|C|1|844.878||TBL|PRA|M||||||51|1|1|167.40|310.00|||52|
10369|C|1|844.879||TBL|ROS|B||||||51|1|1|167.40|310.00|||52|
10370|C|1|844.880||TBL|ROS|M||||||51|1|1|167.40|310.00|||52|
10371|C|1|844.881||TBL|VER|B||||||51|1|1|167.40|310.00|||52|
10372|C|1|844.882||TBL|VER|M||||||51|1|1|167.40|310.00|||52|
10373|C|1|844.883||TBL|AZB|||||||51|1|1|167.40|310.00|||52|
10374|C|1|844.884||TBL|DEN|||||||51|1|1|167.40|310.00|||52|
10375|C|1|844.885||TBL|BLK|||||||51|1|1|167.40|310.00|||52|
10376|C|1|844.886||TBL|ART|||||||51|1|1|167.40|310.00|||52|
10377|C|1|844.887||TBL|LIN|||||||51|1|1|167.40|310.00|||52|
10378|C|1|844.888||TBL|HAL|||||||51|1|1|167.40|310.00|||52|
10379|C|1|844.889||BCO|BCO|B||||||51|1|1|189.00|350.00|||52|
10380|C|1|844.890||BCO|BCO|M||||||51|1|1|189.00|350.00|||52|
10381|C|1|844.891||CCL|CCL|B||||||51|1|1|189.00|350.00|||52|
10382|C|1|844.892||CCL|CCL|M||||||51|1|1|189.00|350.00|||52|
10383|C|1|844.893||CME|CME|B||||||51|1|1|189.00|350.00|||52|
10384|C|1|844.894||CME|CME|M||||||51|1|1|189.00|350.00|||52|
10385|C|1|844.895||ANT|ANT|B||||||51|1|1|189.00|350.00|||52|
10386|C|1|844.896||ANT|ANT|M||||||51|1|1|189.00|350.00|||52|
10387|C|1|844.897||PTO|PTO|B||||||51|1|1|189.00|350.00|||52|
10388|C|1|844.898||PTO|PTO|M||||||51|1|1|189.00|350.00|||52|
10389|C|1|844.899||CRE|CRE|B||||||51|1|1|189.00|350.00|||52|
10390|C|1|844.900||CRE|CRE|M||||||51|1|1|189.00|350.00|||52|
10391|C|1|844.901||CAM|CAM|B||||||51|1|1|189.00|350.00|||52|
10392|C|1|844.902||CAM|CAM|M||||||51|1|1|189.00|350.00|||52|
10393|C|1|844.903||OUR|OUR|B||||||51|1|1|189.00|350.00|||52|
10394|C|1|844.904||OUR|OUR|M||||||51|1|1|189.00|350.00|||52|
10395|C|1|844.905||COB|COB|B||||||51|1|1|189.00|350.00|||52|
10396|C|1|844.906||COB|COB|M||||||51|1|1|189.00|350.00|||52|
10397|C|1|844.907||CHO|CHO|B||||||51|1|1|189.00|350.00|||52|
10398|C|1|844.908||CHO|CHO|M||||||51|1|1|189.00|350.00|||52|
10399|C|1|844.909||VAG|VAG|B||||||51|1|1|189.00|350.00|||52|
10400|C|1|844.910||VAG|VAG|M||||||51|1|1|189.00|350.00|||52|
10401|C|1|844.911||AZE|AZE|B||||||51|1|1|189.00|350.00|||52|
10402|C|1|844.912||AZE|AZE|M||||||51|1|1|189.00|350.00|||52|
10403|C|1|844.913||AMA|AMA|B||||||51|1|1|189.00|350.00|||52|
10404|C|1|844.914||AMA|AMA|M||||||51|1|1|189.00|350.00|||52|
10405|C|1|844.915||AES|AES|B||||||51|1|1|189.00|350.00|||52|
10406|C|1|844.916||AES|AES|M||||||51|1|1|189.00|350.00|||52|
10407|C|1|844.917||PRA|PRA|B||||||51|1|1|189.00|350.00|||52|
10408|C|1|844.918||PRA|PRA|M||||||51|1|1|189.00|350.00|||52|
10409|C|1|844.919||ROS|ROS|B||||||51|1|1|189.00|350.00|||52|
10410|C|1|844.920||ROS|ROS|M||||||51|1|1|189.00|350.00|||52|
10411|C|1|844.921||VER|VER|B||||||51|1|1|189.00|350.00|||52|
10412|C|1|844.922||VER|VER|M||||||51|1|1|189.00|350.00|||52|
10413|C|1|844.923||AZB|AZB|||||||51|1|1|189.00|350.00|||52|
10414|C|1|844.924||DEN|DEN|||||||51|1|1|189.00|350.00|||52|
10415|C|1|844.925||BLK|BLK|||||||51|1|1|189.00|350.00|||52|
10416|C|1|844.926||ART|ART|||||||51|1|1|189.00|350.00|||52|
10417|C|1|844.927||LIN|LIN|||||||51|1|1|189.00|350.00|||52|
10418|C|1|844.928||HAL|HAL|||||||51|1|1|189.00|350.00|||52|
10419|C|2|929||||||||||52|3|3|74.25|135.00|||53|1H
10420|C|3|930||||||||||53|3|3|83.60|152.00|||53|3H
10421|C|4|931.932||||||||ESQ||53|3|3|111.10|202.00|||53|PI
10422|C|4|931.933||||||||DIR||53|3|3|111.10|202.00|||53|PD
10423|C|5|934||||||||ESQ||53|3|3|101.75|185.00|||53|PHBI
10424|C|5|935||||||||DIR||53|3|3|101.75|185.00|||53|PHBD
10425|C|6|936||||||||ESQ||53|3|3|101.75|185.00|||53|PHAI
10426|C|6|937||||||||DIR||53|3|3|101.75|185.00|||53|PHAD
10427|C|7|938||||||||||52|3|3|46.75|85.00|||54|1H
10428|C|8|939||||||||||53|3|3|56.10|102.00|||54|3H
10429|C|9|940.941||||||||ESQ||53|3|3|61.05|111.00|||54|PI
10430|C|9|940.942||||||||DIR||53|3|3|61.05|111.00|||54|PD
10431|C|10|943||||||||ESQ||53|3|3|54.45|99.00|||54|PHBI
10432|C|10|944||||||||DIR||53|3|3|54.45|99.00|||54|PHBD
10433|C|11|945||||||||ESQ||53|3|3|54.45|99.00|||54|PHAI
10434|C|11|946||||||||DIR||53|3|3|54.45|99.00|||54|PHAD
10435|C|12|947.948.845||TBL|TBL|||||||54|1|1|71.28|132.00|||55|
10436|C|12|947.948.846||TEA|TEA|||||||54|1|1|71.28|132.00|||55|
10437|C|12|947.948.847||OAK|OAK|||||||54|1|1|71.28|132.00|||55|
10438|C|12|947.948.848||JOP|JOP|||||||54|1|1|71.28|132.00|||55|
10439|C|12|947.948.949||TBR|BCO|B||||||54|1|1|114.48|212.00|||55|
10440|C|12|947.948.950||TBR|BCO|M||||||54|1|1|114.48|212.00|||55|
10441|C|12|947.948.951||TBR|CCL|B||||||54|1|1|114.48|212.00|||55|
10442|C|12|947.948.952||TBR|CCL|M||||||54|1|1|114.48|212.00|||55|
10443|C|12|947.948.953||TBR|CME|B||||||54|1|1|114.48|212.00|||55|
10444|C|12|947.948.954||TBR|CME|M||||||54|1|1|114.48|212.00|||55|
10445|C|12|947.948.955||TBR|ANT|B||||||54|1|1|114.48|212.00|||55|
10446|C|12|947.948.956||TBR|ANT|M||||||54|1|1|114.48|212.00|||55|
10447|C|12|947.948.957||TBR|PTO|B||||||54|1|1|114.48|212.00|||55|
10448|C|12|947.948.958||TBR|PTO|M||||||54|1|1|114.48|212.00|||55|
10449|C|12|947.948.959||TBR|CRE|B||||||54|1|1|114.48|212.00|||55|
10450|C|12|947.948.960||TBR|CRE|M||||||54|1|1|114.48|212.00|||55|
10451|C|12|947.948.961||TBR|CAM|B||||||54|1|1|114.48|212.00|||55|
10452|C|12|947.948.962||TBR|CAM|M||||||54|1|1|114.48|212.00|||55|
10453|C|12|947.948.963||TBR|OUR|B||||||54|1|1|114.48|212.00|||55|
10454|C|12|947.948.964||TBR|OUR|M||||||54|1|1|114.48|212.00|||55|
10455|C|12|947.948.965||TBR|COB|B||||||54|1|1|114.48|212.00|||55|
10456|C|12|947.948.966||TBR|COB|M||||||54|1|1|114.48|212.00|||55|
10457|C|12|947.948.967||TBR|CHO|B||||||54|1|1|114.48|212.00|||55|
10458|C|12|947.948.968||TBR|CHO|M||||||54|1|1|114.48|212.00|||55|
10459|C|12|947.948.969||TBR|VAG|B||||||54|1|1|114.48|212.00|||55|
10460|C|12|947.948.970||TBR|VAG|M||||||54|1|1|114.48|212.00|||55|
10461|C|12|947.948.971||TBR|AZE|B||||||54|1|1|114.48|212.00|||55|
10462|C|12|947.948.972||TBR|AZE|M||||||54|1|1|114.48|212.00|||55|
10463|C|12|947.948.973||TBR|AMA|B||||||54|1|1|114.48|212.00|||55|
10464|C|12|947.948.974||TBR|AMA|M||||||54|1|1|114.48|212.00|||55|
10465|C|12|947.948.975||TBR|AES|B||||||54|1|1|114.48|212.00|||55|
10466|C|12|947.948.976||TBR|AES|M||||||54|1|1|114.48|212.00|||55|
10467|C|12|947.948.977||TBR|PRA|B||||||54|1|1|114.48|212.00|||55|
10468|C|12|947.948.978||TBR|PRA|M||||||54|1|1|114.48|212.00|||55|
10469|C|12|947.948.979||TBR|ROS|B||||||54|1|1|114.48|212.00|||55|
10470|C|12|947.948.980||TBR|ROS|M||||||54|1|1|114.48|212.00|||55|
10471|C|12|947.948.981||TBR|VER|B||||||54|1|1|114.48|212.00|||55|
10472|C|12|947.948.982||TBR|VER|M||||||54|1|1|114.48|212.00|||55|
10473|C|12|947.948.983||TBR|AZB|||||||54|1|1|114.48|212.00|||55|
10474|C|12|947.948.984||TBR|DEN|||||||54|1|1|114.48|212.00|||55|
10475|C|12|947.948.985||TBR|BLK|||||||54|1|1|114.48|212.00|||55|
10476|C|12|947.948.986||TBR|ART|||||||54|1|1|114.48|212.00|||55|
10477|C|12|947.948.987||TBR|LIN|||||||54|1|1|114.48|212.00|||55|
10478|C|12|947.948.988||TBR|HAL|||||||54|1|1|114.48|212.00|||55|
10479|C|12|947.948.989||BCO|BCO|B||||||54|1|1|136.08|252.00|||55|
10480|C|12|947.948.990||BCO|BCO|M||||||54|1|1|136.08|252.00|||55|
10481|C|12|947.948.991||CCL|CCL|B||||||54|1|1|136.08|252.00|||55|
10482|C|12|947.948.992||CCL|CCL|M||||||54|1|1|136.08|252.00|||55|
10483|C|12|947.948.993||CME|CME|B||||||54|1|1|136.08|252.00|||55|
10484|C|12|947.948.994||CME|CME|M||||||54|1|1|136.08|252.00|||55|
10485|C|12|947.948.995||ANT|ANT|B||||||54|1|1|136.08|252.00|||55|
10486|C|12|947.948.996||ANT|ANT|M||||||54|1|1|136.08|252.00|||55|
10487|C|12|947.948.997||PTO|PTO|B||||||54|1|1|136.08|252.00|||55|
10488|C|12|947.948.998||PTO|PTO|M||||||54|1|1|136.08|252.00|||55|
10489|C|12|947.948.999||CRE|CRE|B||||||54|1|1|136.08|252.00|||55|
10490|C|12|947.948.1000||CRE|CRE|M||||||54|1|1|136.08|252.00|||55|
10491|C|12|947.948.1001||CAM|CAM|B||||||54|1|1|136.08|252.00|||55|
10492|C|12|947.948.1002||CAM|CAM|M||||||54|1|1|136.08|252.00|||55|
10493|C|12|947.948.1003||OUR|OUR|B||||||54|1|1|136.08|252.00|||55|
10494|C|12|947.948.1004||OUR|OUR|M||||||54|1|1|136.08|252.00|||55|
10495|C|12|947.948.1005||COB|COB|B||||||54|1|1|136.08|252.00|||55|
10496|C|12|947.948.1006||COB|COB|M||||||54|1|1|136.08|252.00|||55|
10497|C|12|947.948.1007||CHO|CHO|B||||||54|1|1|136.08|252.00|||55|
10498|C|12|947.948.1008||CHO|CHO|M||||||54|1|1|136.08|252.00|||55|
10499|C|12|947.948.1009||VAG|VAG|B||||||54|1|1|136.08|252.00|||55|
10500|C|12|947.948.1010||VAG|VAG|M||||||54|1|1|136.08|252.00|||55|
10501|C|12|947.948.1011||AZE|AZE|B||||||54|1|1|136.08|252.00|||55|
10502|C|12|947.948.1012||AZE|AZE|M||||||54|1|1|136.08|252.00|||55|
10503|C|12|947.948.1013||AMA|AMA|B||||||54|1|1|136.08|252.00|||55|
10504|C|12|947.948.1014||AMA|AMA|M||||||54|1|1|136.08|252.00|||55|
10505|C|12|947.948.1015||AES|AES|B||||||54|1|1|136.08|252.00|||55|
10506|C|12|947.948.1016||AES|AES|M||||||54|1|1|136.08|252.00|||55|
10507|C|12|947.948.1017||PRA|PRA|B||||||54|1|1|136.08|252.00|||55|
10508|C|12|947.948.1018||PRA|PRA|M||||||54|1|1|136.08|252.00|||55|
10509|C|12|947.948.1019||ROS|ROS|B||||||54|1|1|136.08|252.00|||55|
10510|C|12|947.948.1020||ROS|ROS|M||||||54|1|1|136.08|252.00|||55|
10511|C|12|947.948.1021||VER|VER|B||||||54|1|1|136.08|252.00|||55|
10512|C|12|947.948.1022||VER|VER|M||||||54|1|1|136.08|252.00|||55|
10513|C|12|947.948.1023||AZB|AZB|||||||54|1|1|136.08|252.00|||55|
10514|C|12|947.948.1024||DEN|DEN|||||||54|1|1|136.08|252.00|||55|
10515|C|12|947.948.1025||BLK|BLK|||||||54|1|1|136.08|252.00|||55|
10516|C|12|947.948.1026||ART|ART|||||||54|1|1|136.08|252.00|||55|
10517|C|12|947.948.1027||LIN|LIN|||||||54|1|1|136.08|252.00|||55|
10518|C|12|947.948.1028||HAL|HAL|||||||54|1|1|136.08|252.00|||55|
10519|C|13|1029.1030.845||TBL|TBL|||||||55|1|1|91.80|170.00|||55|
10520|C|13|1029.1030.846||TEA|TEA|||||||55|1|1|91.80|170.00|||55|
10521|C|13|1029.1030.847||OAK|OAK|||||||55|1|1|91.80|170.00|||55|
10522|C|13|1029.1030.848||JOP|JOP|||||||55|1|1|91.80|170.00|||55|
10523|C|13|1029.1030.949||TBR|BCO|B||||||55|1|1|135.00|250.00|||55|
10524|C|13|1029.1030.950||TBR|BCO|M||||||55|1|1|135.00|250.00|||55|
10525|C|13|1029.1030.951||TBR|CCL|B||||||55|1|1|135.00|250.00|||55|
10526|C|13|1029.1030.952||TBR|CCL|M||||||55|1|1|135.00|250.00|||55|
10527|C|13|1029.1030.953||TBR|CME|B||||||55|1|1|135.00|250.00|||55|
10528|C|13|1029.1030.954||TBR|CME|M||||||55|1|1|135.00|250.00|||55|
10529|C|13|1029.1030.955||TBR|ANT|B||||||55|1|1|135.00|250.00|||55|
10530|C|13|1029.1030.956||TBR|ANT|M||||||55|1|1|135.00|250.00|||55|
10531|C|13|1029.1030.957||TBR|PTO|B||||||55|1|1|135.00|250.00|||55|
10532|C|13|1029.1030.958||TBR|PTO|M||||||55|1|1|135.00|250.00|||55|
10533|C|13|1029.1030.959||TBR|CRE|B||||||55|1|1|135.00|250.00|||55|
10534|C|13|1029.1030.960||TBR|CRE|M||||||55|1|1|135.00|250.00|||55|
10535|C|13|1029.1030.961||TBR|CAM|B||||||55|1|1|135.00|250.00|||55|
10536|C|13|1029.1030.962||TBR|CAM|M||||||55|1|1|135.00|250.00|||55|
10537|C|13|1029.1030.963||TBR|OUR|B||||||55|1|1|135.00|250.00|||55|
10538|C|13|1029.1030.964||TBR|OUR|M||||||55|1|1|135.00|250.00|||55|
10539|C|13|1029.1030.965||TBR|COB|B||||||55|1|1|135.00|250.00|||55|
10540|C|13|1029.1030.966||TBR|COB|M||||||55|1|1|135.00|250.00|||55|
10541|C|13|1029.1030.967||TBR|CHO|B||||||55|1|1|135.00|250.00|||55|
10542|C|13|1029.1030.968||TBR|CHO|M||||||55|1|1|135.00|250.00|||55|
10543|C|13|1029.1030.969||TBR|VAG|B||||||55|1|1|135.00|250.00|||55|
10544|C|13|1029.1030.970||TBR|VAG|M||||||55|1|1|135.00|250.00|||55|
10545|C|13|1029.1030.971||TBR|AZE|B||||||55|1|1|135.00|250.00|||55|
10546|C|13|1029.1030.972||TBR|AZE|M||||||55|1|1|135.00|250.00|||55|
10547|C|13|1029.1030.973||TBR|AMA|B||||||55|1|1|135.00|250.00|||55|
10548|C|13|1029.1030.974||TBR|AMA|M||||||55|1|1|135.00|250.00|||55|
10549|C|13|1029.1030.975||TBR|AES|B||||||55|1|1|135.00|250.00|||55|
10550|C|13|1029.1030.976||TBR|AES|M||||||55|1|1|135.00|250.00|||55|
10551|C|13|1029.1030.977||TBR|PRA|B||||||55|1|1|135.00|250.00|||55|
10552|C|13|1029.1030.978||TBR|PRA|M||||||55|1|1|135.00|250.00|||55|
10553|C|13|1029.1030.979||TBR|ROS|B||||||55|1|1|135.00|250.00|||55|
10554|C|13|1029.1030.980||TBR|ROS|M||||||55|1|1|135.00|250.00|||55|
10555|C|13|1029.1030.981||TBR|VER|B||||||55|1|1|135.00|250.00|||55|
10556|C|13|1029.1030.982||TBR|VER|M||||||55|1|1|135.00|250.00|||55|
10557|C|13|1029.1030.983||TBR|AZB|||||||55|1|1|135.00|250.00|||55|
10558|C|13|1029.1030.984||TBR|DEN|||||||55|1|1|135.00|250.00|||55|
10559|C|13|1029.1030.985||TBR|BLK|||||||55|1|1|135.00|250.00|||55|
10560|C|13|1029.1030.986||TBR|ART|||||||55|1|1|135.00|250.00|||55|
10561|C|13|1029.1030.987||TBR|LIN|||||||55|1|1|135.00|250.00|||55|
10562|C|13|1029.1030.988||TBR|HAL|||||||55|1|1|135.00|250.00|||55|
10563|C|13|1029.1030.989||BCO|BCO|B||||||55|1|1|156.60|290.00|||55|
10564|C|13|1029.1030.990||BCO|BCO|M||||||55|1|1|156.60|290.00|||55|
10565|C|13|1029.1030.991||CCL|CCL|B||||||55|1|1|156.60|290.00|||55|
10566|C|13|1029.1030.992||CCL|CCL|M||||||55|1|1|156.60|290.00|||55|
10567|C|13|1029.1030.993||CME|CME|B||||||55|1|1|156.60|290.00|||55|
10568|C|13|1029.1030.994||CME|CME|M||||||55|1|1|156.60|290.00|||55|
10569|C|13|1029.1030.995||ANT|ANT|B||||||55|1|1|156.60|290.00|||55|
10570|C|13|1029.1030.996||ANT|ANT|M||||||55|1|1|156.60|290.00|||55|
10571|C|13|1029.1030.997||PTO|PTO|B||||||55|1|1|156.60|290.00|||55|
10572|C|13|1029.1030.998||PTO|PTO|M||||||55|1|1|156.60|290.00|||55|
10573|C|13|1029.1030.999||CRE|CRE|B||||||55|1|1|156.60|290.00|||55|
10574|C|13|1029.1030.1000||CRE|CRE|M||||||55|1|1|156.60|290.00|||55|
10575|C|13|1029.1030.1001||CAM|CAM|B||||||55|1|1|156.60|290.00|||55|
10576|C|13|1029.1030.1002||CAM|CAM|M||||||55|1|1|156.60|290.00|||55|
10577|C|13|1029.1030.1003||OUR|OUR|B||||||55|1|1|156.60|290.00|||55|
10578|C|13|1029.1030.1004||OUR|OUR|M||||||55|1|1|156.60|290.00|||55|
10579|C|13|1029.1030.1005||COB|COB|B||||||55|1|1|156.60|290.00|||55|
10580|C|13|1029.1030.1006||COB|COB|M||||||55|1|1|156.60|290.00|||55|
10581|C|13|1029.1030.1007||CHO|CHO|B||||||55|1|1|156.60|290.00|||55|
10582|C|13|1029.1030.1008||CHO|CHO|M||||||55|1|1|156.60|290.00|||55|
10583|C|13|1029.1030.1009||VAG|VAG|B||||||55|1|1|156.60|290.00|||55|
10584|C|13|1029.1030.1010||VAG|VAG|M||||||55|1|1|156.60|290.00|||55|
10585|C|13|1029.1030.1011||AZE|AZE|B||||||55|1|1|156.60|290.00|||55|
10586|C|13|1029.1030.1012||AZE|AZE|M||||||55|1|1|156.60|290.00|||55|
10587|C|13|1029.1030.1013||AMA|AMA|B||||||55|1|1|156.60|290.00|||55|
10588|C|13|1029.1030.1014||AMA|AMA|M||||||55|1|1|156.60|290.00|||55|
10589|C|13|1029.1030.1015||AES|AES|B||||||55|1|1|156.60|290.00|||55|
10590|C|13|1029.1030.1016||AES|AES|M||||||55|1|1|156.60|290.00|||55|
10591|C|13|1029.1030.1017||PRA|PRA|B||||||55|1|1|156.60|290.00|||55|
10592|C|13|1029.1030.1018||PRA|PRA|M||||||55|1|1|156.60|290.00|||55|
10593|C|13|1029.1030.1019||ROS|ROS|B||||||55|1|1|156.60|290.00|||55|
10594|C|13|1029.1030.1020||ROS|ROS|M||||||55|1|1|156.60|290.00|||55|
10595|C|13|1029.1030.1021||VER|VER|B||||||55|1|1|156.60|290.00|||55|
10596|C|13|1029.1030.1022||VER|VER|M||||||55|1|1|156.60|290.00|||55|
10597|C|13|1029.1030.1023||AZB|AZB|||||||55|1|1|156.60|290.00|||55|
10598|C|13|1029.1030.1024||DEN|DEN|||||||55|1|1|156.60|290.00|||55|
10599|C|13|1029.1030.1025||BLK|BLK|||||||55|1|1|156.60|290.00|||55|
10600|C|13|1029.1030.1026||ART|ART|||||||55|1|1|156.60|290.00|||55|
10601|C|13|1029.1030.1027||LIN|LIN|||||||55|1|1|156.60|290.00|||55|
10602|C|13|1029.1030.1028||HAL|HAL|||||||55|1|1|156.60|290.00|||55|
10603|C|14|1031.1032.845||TBL|TBL|||||||56|1|1|97.20|180.00|||56|
10604|C|14|1031.1032.846||TEA|TEA|||||||56|1|1|97.20|180.00|||56|
10605|C|14|1031.1032.847||OAK|OAK|||||||56|1|1|97.20|180.00|||56|
10606|C|14|1031.1032.848||JOP|JOP|||||||56|1|1|97.20|180.00|||56|
10607|C|14|1031.1032.949||TBR|BCO|B||||||56|1|1|140.40|260.00|||56|
10608|C|14|1031.1032.950||TBR|BCO|M||||||56|1|1|140.40|260.00|||56|
10609|C|14|1031.1032.951||TBR|CCL|B||||||56|1|1|140.40|260.00|||56|
10610|C|14|1031.1032.952||TBR|CCL|M||||||56|1|1|140.40|260.00|||56|
10611|C|14|1031.1032.953||TBR|CME|B||||||56|1|1|140.40|260.00|||56|
10612|C|14|1031.1032.954||TBR|CME|M||||||56|1|1|140.40|260.00|||56|
10613|C|14|1031.1032.955||TBR|ANT|B||||||56|1|1|140.40|260.00|||56|
10614|C|14|1031.1032.956||TBR|ANT|M||||||56|1|1|140.40|260.00|||56|
10615|C|14|1031.1032.957||TBR|PTO|B||||||56|1|1|140.40|260.00|||56|
10616|C|14|1031.1032.958||TBR|PTO|M||||||56|1|1|140.40|260.00|||56|
10617|C|14|1031.1032.959||TBR|CRE|B||||||56|1|1|140.40|260.00|||56|
10618|C|14|1031.1032.960||TBR|CRE|M||||||56|1|1|140.40|260.00|||56|
10619|C|14|1031.1032.961||TBR|CAM|B||||||56|1|1|140.40|260.00|||56|
10620|C|14|1031.1032.962||TBR|CAM|M||||||56|1|1|140.40|260.00|||56|
10621|C|14|1031.1032.963||TBR|OUR|B||||||56|1|1|140.40|260.00|||56|
10622|C|14|1031.1032.964||TBR|OUR|M||||||56|1|1|140.40|260.00|||56|
10623|C|14|1031.1032.965||TBR|COB|B||||||56|1|1|140.40|260.00|||56|
10624|C|14|1031.1032.966||TBR|COB|M||||||56|1|1|140.40|260.00|||56|
10625|C|14|1031.1032.967||TBR|CHO|B||||||56|1|1|140.40|260.00|||56|
10626|C|14|1031.1032.968||TBR|CHO|M||||||56|1|1|140.40|260.00|||56|
10627|C|14|1031.1032.969||TBR|VAG|B||||||56|1|1|140.40|260.00|||56|
10628|C|14|1031.1032.970||TBR|VAG|M||||||56|1|1|140.40|260.00|||56|
10629|C|14|1031.1032.971||TBR|AZE|B||||||56|1|1|140.40|260.00|||56|
10630|C|14|1031.1032.972||TBR|AZE|M||||||56|1|1|140.40|260.00|||56|
10631|C|14|1031.1032.973||TBR|AMA|B||||||56|1|1|140.40|260.00|||56|
10632|C|14|1031.1032.974||TBR|AMA|M||||||56|1|1|140.40|260.00|||56|
10633|C|14|1031.1032.975||TBR|AES|B||||||56|1|1|140.40|260.00|||56|
10634|C|14|1031.1032.976||TBR|AES|M||||||56|1|1|140.40|260.00|||56|
10635|C|14|1031.1032.977||TBR|PRA|B||||||56|1|1|140.40|260.00|||56|
10636|C|14|1031.1032.978||TBR|PRA|M||||||56|1|1|140.40|260.00|||56|
10637|C|14|1031.1032.979||TBR|ROS|B||||||56|1|1|140.40|260.00|||56|
10638|C|14|1031.1032.980||TBR|ROS|M||||||56|1|1|140.40|260.00|||56|
10639|C|14|1031.1032.981||TBR|VER|B||||||56|1|1|140.40|260.00|||56|
10640|C|14|1031.1032.982||TBR|VER|M||||||56|1|1|140.40|260.00|||56|
10641|C|14|1031.1032.983||TBR|AZB|||||||56|1|1|140.40|260.00|||56|
10642|C|14|1031.1032.984||TBR|DEN|||||||56|1|1|140.40|260.00|||56|
10643|C|14|1031.1032.985||TBR|BLK|||||||56|1|1|140.40|260.00|||56|
10644|C|14|1031.1032.986||TBR|ART|||||||56|1|1|140.40|260.00|||56|
10645|C|14|1031.1032.987||TBR|LIN|||||||56|1|1|140.40|260.00|||56|
10646|C|14|1031.1032.988||TBR|HAL|||||||56|1|1|140.40|260.00|||56|
10647|C|14|1031.1032.989||BCO|BCO|B||||||56|1|1|162.00|300.00|||56|
10648|C|14|1031.1032.990||BCO|BCO|M||||||56|1|1|162.00|300.00|||56|
10649|C|14|1031.1032.991||CCL|CCL|B||||||56|1|1|162.00|300.00|||56|
10650|C|14|1031.1032.992||CCL|CCL|M||||||56|1|1|162.00|300.00|||56|
10651|C|14|1031.1032.993||CME|CME|B||||||56|1|1|162.00|300.00|||56|
10652|C|14|1031.1032.994||CME|CME|M||||||56|1|1|162.00|300.00|||56|
10653|C|14|1031.1032.995||ANT|ANT|B||||||56|1|1|162.00|300.00|||56|
10654|C|14|1031.1032.996||ANT|ANT|M||||||56|1|1|162.00|300.00|||56|
10655|C|14|1031.1032.997||PTO|PTO|B||||||56|1|1|162.00|300.00|||56|
10656|C|14|1031.1032.998||PTO|PTO|M||||||56|1|1|162.00|300.00|||56|
10657|C|14|1031.1032.999||CRE|CRE|B||||||56|1|1|162.00|300.00|||56|
10658|C|14|1031.1032.1000||CRE|CRE|M||||||56|1|1|162.00|300.00|||56|
10659|C|14|1031.1032.1001||CAM|CAM|B||||||56|1|1|162.00|300.00|||56|
10660|C|14|1031.1032.1002||CAM|CAM|M||||||56|1|1|162.00|300.00|||56|
10661|C|14|1031.1032.1003||OUR|OUR|B||||||56|1|1|162.00|300.00|||56|
10662|C|14|1031.1032.1004||OUR|OUR|M||||||56|1|1|162.00|300.00|||56|
10663|C|14|1031.1032.1005||COB|COB|B||||||56|1|1|162.00|300.00|||56|
10664|C|14|1031.1032.1006||COB|COB|M||||||56|1|1|162.00|300.00|||56|
10665|C|14|1031.1032.1007||CHO|CHO|B||||||56|1|1|162.00|300.00|||56|
10666|C|14|1031.1032.1008||CHO|CHO|M||||||56|1|1|162.00|300.00|||56|
10667|C|14|1031.1032.1009||VAG|VAG|B||||||56|1|1|162.00|300.00|||56|
10668|C|14|1031.1032.1010||VAG|VAG|M||||||56|1|1|162.00|300.00|||56|
10669|C|14|1031.1032.1011||AZE|AZE|B||||||56|1|1|162.00|300.00|||56|
10670|C|14|1031.1032.1012||AZE|AZE|M||||||56|1|1|162.00|300.00|||56|
10671|C|14|1031.1032.1013||AMA|AMA|B||||||56|1|1|162.00|300.00|||56|
10672|C|14|1031.1032.1014||AMA|AMA|M||||||56|1|1|162.00|300.00|||56|
10673|C|14|1031.1032.1015||AES|AES|B||||||56|1|1|162.00|300.00|||56|
10674|C|14|1031.1032.1016||AES|AES|M||||||56|1|1|162.00|300.00|||56|
10675|C|14|1031.1032.1017||PRA|PRA|B||||||56|1|1|162.00|300.00|||56|
10676|C|14|1031.1032.1018||PRA|PRA|M||||||56|1|1|162.00|300.00|||56|
10677|C|14|1031.1032.1019||ROS|ROS|B||||||56|1|1|162.00|300.00|||56|
10678|C|14|1031.1032.1020||ROS|ROS|M||||||56|1|1|162.00|300.00|||56|
10679|C|14|1031.1032.1021||VER|VER|B||||||56|1|1|162.00|300.00|||56|
10680|C|14|1031.1032.1022||VER|VER|M||||||56|1|1|162.00|300.00|||56|
10681|C|14|1031.1032.1023||AZB|AZB|||||||56|1|1|162.00|300.00|||56|
10682|C|14|1031.1032.1024||DEN|DEN|||||||56|1|1|162.00|300.00|||56|
10683|C|14|1031.1032.1025||BLK|BLK|||||||56|1|1|162.00|300.00|||56|
10684|C|14|1031.1032.1026||ART|ART|||||||56|1|1|162.00|300.00|||56|
10685|C|14|1031.1032.1027||LIN|LIN|||||||56|1|1|162.00|300.00|||56|
10686|C|14|1031.1032.1028||HAL|HAL|||||||56|1|1|162.00|300.00|||56|
10687|C|15|1031.1033.845||TBL|TBL|||||||56|1|1|116.64|216.00|||56|
10688|C|15|1031.1033.846||TEA|TEA|||||||56|1|1|116.64|216.00|||56|
10689|C|15|1031.1033.847||OAK|OAK|||||||56|1|1|116.64|216.00|||56|
10690|C|15|1031.1033.848||JOP|JOP|||||||56|1|1|116.64|216.00|||56|
10691|C|15|1031.1033.949||TBR|BCO|B||||||56|1|1|159.84|296.00|||56|
10692|C|15|1031.1033.950||TBR|BCO|M||||||56|1|1|159.84|296.00|||56|
10693|C|15|1031.1033.951||TBR|CCL|B||||||56|1|1|159.84|296.00|||56|
10694|C|15|1031.1033.952||TBR|CCL|M||||||56|1|1|159.84|296.00|||56|
10695|C|15|1031.1033.953||TBR|CME|B||||||56|1|1|159.84|296.00|||56|
10696|C|15|1031.1033.954||TBR|CME|M||||||56|1|1|159.84|296.00|||56|
10697|C|15|1031.1033.955||TBR|ANT|B||||||56|1|1|159.84|296.00|||56|
10698|C|15|1031.1033.956||TBR|ANT|M||||||56|1|1|159.84|296.00|||56|
10699|C|15|1031.1033.957||TBR|PTO|B||||||56|1|1|159.84|296.00|||56|
10700|C|15|1031.1033.958||TBR|PTO|M||||||56|1|1|159.84|296.00|||56|
10701|C|15|1031.1033.959||TBR|CRE|B||||||56|1|1|159.84|296.00|||56|
10702|C|15|1031.1033.960||TBR|CRE|M||||||56|1|1|159.84|296.00|||56|
10703|C|15|1031.1033.961||TBR|CAM|B||||||56|1|1|159.84|296.00|||56|
10704|C|15|1031.1033.962||TBR|CAM|M||||||56|1|1|159.84|296.00|||56|
10705|C|15|1031.1033.963||TBR|OUR|B||||||56|1|1|159.84|296.00|||56|
10706|C|15|1031.1033.964||TBR|OUR|M||||||56|1|1|159.84|296.00|||56|
10707|C|15|1031.1033.965||TBR|COB|B||||||56|1|1|159.84|296.00|||56|
10708|C|15|1031.1033.966||TBR|COB|M||||||56|1|1|159.84|296.00|||56|
10709|C|15|1031.1033.967||TBR|CHO|B||||||56|1|1|159.84|296.00|||56|
10710|C|15|1031.1033.968||TBR|CHO|M||||||56|1|1|159.84|296.00|||56|
10711|C|15|1031.1033.969||TBR|VAG|B||||||56|1|1|159.84|296.00|||56|
10712|C|15|1031.1033.970||TBR|VAG|M||||||56|1|1|159.84|296.00|||56|
10713|C|15|1031.1033.971||TBR|AZE|B||||||56|1|1|159.84|296.00|||56|
10714|C|15|1031.1033.972||TBR|AZE|M||||||56|1|1|159.84|296.00|||56|
10715|C|15|1031.1033.973||TBR|AMA|B||||||56|1|1|159.84|296.00|||56|
10716|C|15|1031.1033.974||TBR|AMA|M||||||56|1|1|159.84|296.00|||56|
10717|C|15|1031.1033.975||TBR|AES|B||||||56|1|1|159.84|296.00|||56|
10718|C|15|1031.1033.976||TBR|AES|M||||||56|1|1|159.84|296.00|||56|
10719|C|15|1031.1033.977||TBR|PRA|B||||||56|1|1|159.84|296.00|||56|
10720|C|15|1031.1033.978||TBR|PRA|M||||||56|1|1|159.84|296.00|||56|
10721|C|15|1031.1033.979||TBR|ROS|B||||||56|1|1|159.84|296.00|||56|
10722|C|15|1031.1033.980||TBR|ROS|M||||||56|1|1|159.84|296.00|||56|
10723|C|15|1031.1033.981||TBR|VER|B||||||56|1|1|159.84|296.00|||56|
10724|C|15|1031.1033.982||TBR|VER|M||||||56|1|1|159.84|296.00|||56|
10725|C|15|1031.1033.983||TBR|AZB|||||||56|1|1|159.84|296.00|||56|
10726|C|15|1031.1033.984||TBR|DEN|||||||56|1|1|159.84|296.00|||56|
10727|C|15|1031.1033.985||TBR|BLK|||||||56|1|1|159.84|296.00|||56|
10728|C|15|1031.1033.986||TBR|ART|||||||56|1|1|159.84|296.00|||56|
10729|C|15|1031.1033.987||TBR|LIN|||||||56|1|1|159.84|296.00|||56|
10730|C|15|1031.1033.988||TBR|HAL|||||||56|1|1|159.84|296.00|||56|
10731|C|15|1031.1033.989||BCO|BCO|B||||||56|1|1|181.44|336.00|||56|
10732|C|15|1031.1033.990||BCO|BCO|M||||||56|1|1|181.44|336.00|||56|
10733|C|15|1031.1033.991||CCL|CCL|B||||||56|1|1|181.44|336.00|||56|
10734|C|15|1031.1033.992||CCL|CCL|M||||||56|1|1|181.44|336.00|||56|
10735|C|15|1031.1033.993||CME|CME|B||||||56|1|1|181.44|336.00|||56|
10736|C|15|1031.1033.994||CME|CME|M||||||56|1|1|181.44|336.00|||56|
10737|C|15|1031.1033.995||ANT|ANT|B||||||56|1|1|181.44|336.00|||56|
10738|C|15|1031.1033.996||ANT|ANT|M||||||56|1|1|181.44|336.00|||56|
10739|C|15|1031.1033.997||PTO|PTO|B||||||56|1|1|181.44|336.00|||56|
10740|C|15|1031.1033.998||PTO|PTO|M||||||56|1|1|181.44|336.00|||56|
10741|C|15|1031.1033.999||CRE|CRE|B||||||56|1|1|181.44|336.00|||56|
10742|C|15|1031.1033.1000||CRE|CRE|M||||||56|1|1|181.44|336.00|||56|
10743|C|15|1031.1033.1001||CAM|CAM|B||||||56|1|1|181.44|336.00|||56|
10744|C|15|1031.1033.1002||CAM|CAM|M||||||56|1|1|181.44|336.00|||56|
10745|C|15|1031.1033.1003||OUR|OUR|B||||||56|1|1|181.44|336.00|||56|
10746|C|15|1031.1033.1004||OUR|OUR|M||||||56|1|1|181.44|336.00|||56|
10747|C|15|1031.1033.1005||COB|COB|B||||||56|1|1|181.44|336.00|||56|
10748|C|15|1031.1033.1006||COB|COB|M||||||56|1|1|181.44|336.00|||56|
10749|C|15|1031.1033.1007||CHO|CHO|B||||||56|1|1|181.44|336.00|||56|
10750|C|15|1031.1033.1008||CHO|CHO|M||||||56|1|1|181.44|336.00|||56|
10751|C|15|1031.1033.1009||VAG|VAG|B||||||56|1|1|181.44|336.00|||56|
10752|C|15|1031.1033.1010||VAG|VAG|M||||||56|1|1|181.44|336.00|||56|
10753|C|15|1031.1033.1011||AZE|AZE|B||||||56|1|1|181.44|336.00|||56|
10754|C|15|1031.1033.1012||AZE|AZE|M||||||56|1|1|181.44|336.00|||56|
10755|C|15|1031.1033.1013||AMA|AMA|B||||||56|1|1|181.44|336.00|||56|
10756|C|15|1031.1033.1014||AMA|AMA|M||||||56|1|1|181.44|336.00|||56|
10757|C|15|1031.1033.1015||AES|AES|B||||||56|1|1|181.44|336.00|||56|
10758|C|15|1031.1033.1016||AES|AES|M||||||56|1|1|181.44|336.00|||56|
10759|C|15|1031.1033.1017||PRA|PRA|B||||||56|1|1|181.44|336.00|||56|
10760|C|15|1031.1033.1018||PRA|PRA|M||||||56|1|1|181.44|336.00|||56|
10761|C|15|1031.1033.1019||ROS|ROS|B||||||56|1|1|181.44|336.00|||56|
10762|C|15|1031.1033.1020||ROS|ROS|M||||||56|1|1|181.44|336.00|||56|
10763|C|15|1031.1033.1021||VER|VER|B||||||56|1|1|181.44|336.00|||56|
10764|C|15|1031.1033.1022||VER|VER|M||||||56|1|1|181.44|336.00|||56|
10765|C|15|1031.1033.1023||AZB|AZB|||||||56|1|1|181.44|336.00|||56|
10766|C|15|1031.1033.1024||DEN|DEN|||||||56|1|1|181.44|336.00|||56|
10767|C|15|1031.1033.1025||BLK|BLK|||||||56|1|1|181.44|336.00|||56|
10768|C|15|1031.1033.1026||ART|ART|||||||56|1|1|181.44|336.00|||56|
10769|C|15|1031.1033.1027||LIN|LIN|||||||56|1|1|181.44|336.00|||56|
10770|C|15|1031.1033.1028||HAL|HAL|||||||56|1|1|181.44|336.00|||56|
10771|C|16|1034.1035.845||TBL|TBL|||||||57|1|1|127.98|237.00|||56|
10772|C|16|1034.1035.846||TEA|TEA|||||||57|1|1|127.98|237.00|||56|
10773|C|16|1034.1035.847||OAK|OAK|||||||57|1|1|127.98|237.00|||56|
10774|C|16|1034.1035.848||JOP|JOP|||||||57|1|1|127.98|237.00|||56|
10775|C|16|1034.1035.949||TBR|BCO|B||||||57|1|1|171.18|317.00|||56|
10776|C|16|1034.1035.950||TBR|BCO|M||||||57|1|1|171.18|317.00|||56|
10777|C|16|1034.1035.951||TBR|CCL|B||||||57|1|1|171.18|317.00|||56|
10778|C|16|1034.1035.952||TBR|CCL|M||||||57|1|1|171.18|317.00|||56|
10779|C|16|1034.1035.953||TBR|CME|B||||||57|1|1|171.18|317.00|||56|
10780|C|16|1034.1035.954||TBR|CME|M||||||57|1|1|171.18|317.00|||56|
10781|C|16|1034.1035.955||TBR|ANT|B||||||57|1|1|171.18|317.00|||56|
10782|C|16|1034.1035.956||TBR|ANT|M||||||57|1|1|171.18|317.00|||56|
10783|C|16|1034.1035.957||TBR|PTO|B||||||57|1|1|171.18|317.00|||56|
10784|C|16|1034.1035.958||TBR|PTO|M||||||57|1|1|171.18|317.00|||56|
10785|C|16|1034.1035.959||TBR|CRE|B||||||57|1|1|171.18|317.00|||56|
10786|C|16|1034.1035.960||TBR|CRE|M||||||57|1|1|171.18|317.00|||56|
10787|C|16|1034.1035.961||TBR|CAM|B||||||57|1|1|171.18|317.00|||56|
10788|C|16|1034.1035.962||TBR|CAM|M||||||57|1|1|171.18|317.00|||56|
10789|C|16|1034.1035.963||TBR|OUR|B||||||57|1|1|171.18|317.00|||56|
10790|C|16|1034.1035.964||TBR|OUR|M||||||57|1|1|171.18|317.00|||56|
10791|C|16|1034.1035.965||TBR|COB|B||||||57|1|1|171.18|317.00|||56|
10792|C|16|1034.1035.966||TBR|COB|M||||||57|1|1|171.18|317.00|||56|
10793|C|16|1034.1035.967||TBR|CHO|B||||||57|1|1|171.18|317.00|||56|
10794|C|16|1034.1035.968||TBR|CHO|M||||||57|1|1|171.18|317.00|||56|
10795|C|16|1034.1035.969||TBR|VAG|B||||||57|1|1|171.18|317.00|||56|
10796|C|16|1034.1035.970||TBR|VAG|M||||||57|1|1|171.18|317.00|||56|
10797|C|16|1034.1035.971||TBR|AZE|B||||||57|1|1|171.18|317.00|||56|
10798|C|16|1034.1035.972||TBR|AZE|M||||||57|1|1|171.18|317.00|||56|
10799|C|16|1034.1035.973||TBR|AMA|B||||||57|1|1|171.18|317.00|||56|
10800|C|16|1034.1035.974||TBR|AMA|M||||||57|1|1|171.18|317.00|||56|
10801|C|16|1034.1035.975||TBR|AES|B||||||57|1|1|171.18|317.00|||56|
10802|C|16|1034.1035.976||TBR|AES|M||||||57|1|1|171.18|317.00|||56|
10803|C|16|1034.1035.977||TBR|PRA|B||||||57|1|1|171.18|317.00|||56|
10804|C|16|1034.1035.978||TBR|PRA|M||||||57|1|1|171.18|317.00|||56|
10805|C|16|1034.1035.979||TBR|ROS|B||||||57|1|1|171.18|317.00|||56|
10806|C|16|1034.1035.980||TBR|ROS|M||||||57|1|1|171.18|317.00|||56|
10807|C|16|1034.1035.981||TBR|VER|B||||||57|1|1|171.18|317.00|||56|
10808|C|16|1034.1035.982||TBR|VER|M||||||57|1|1|171.18|317.00|||56|
10809|C|16|1034.1035.983||TBR|AZB|||||||57|1|1|171.18|317.00|||56|
10810|C|16|1034.1035.984||TBR|DEN|||||||57|1|1|171.18|317.00|||56|
10811|C|16|1034.1035.985||TBR|BLK|||||||57|1|1|171.18|317.00|||56|
10812|C|16|1034.1035.986||TBR|ART|||||||57|1|1|171.18|317.00|||56|
10813|C|16|1034.1035.987||TBR|LIN|||||||57|1|1|171.18|317.00|||56|
10814|C|16|1034.1035.988||TBR|HAL|||||||57|1|1|171.18|317.00|||56|
10815|C|16|1034.1035.989||BCO|BCO|B||||||57|1|1|192.78|357.00|||56|
10816|C|16|1034.1035.990||BCO|BCO|M||||||57|1|1|192.78|357.00|||56|
10817|C|16|1034.1035.991||CCL|CCL|B||||||57|1|1|192.78|357.00|||56|
10818|C|16|1034.1035.992||CCL|CCL|M||||||57|1|1|192.78|357.00|||56|
10819|C|16|1034.1035.993||CME|CME|B||||||57|1|1|192.78|357.00|||56|
10820|C|16|1034.1035.994||CME|CME|M||||||57|1|1|192.78|357.00|||56|
10821|C|16|1034.1035.995||ANT|ANT|B||||||57|1|1|192.78|357.00|||56|
10822|C|16|1034.1035.996||ANT|ANT|M||||||57|1|1|192.78|357.00|||56|
10823|C|16|1034.1035.997||PTO|PTO|B||||||57|1|1|192.78|357.00|||56|
10824|C|16|1034.1035.998||PTO|PTO|M||||||57|1|1|192.78|357.00|||56|
10825|C|16|1034.1035.999||CRE|CRE|B||||||57|1|1|192.78|357.00|||56|
10826|C|16|1034.1035.1000||CRE|CRE|M||||||57|1|1|192.78|357.00|||56|
10827|C|16|1034.1035.1001||CAM|CAM|B||||||57|1|1|192.78|357.00|||56|
10828|C|16|1034.1035.1002||CAM|CAM|M||||||57|1|1|192.78|357.00|||56|
10829|C|16|1034.1035.1003||OUR|OUR|B||||||57|1|1|192.78|357.00|||56|
10830|C|16|1034.1035.1004||OUR|OUR|M||||||57|1|1|192.78|357.00|||56|
10831|C|16|1034.1035.1005||COB|COB|B||||||57|1|1|192.78|357.00|||56|
10832|C|16|1034.1035.1006||COB|COB|M||||||57|1|1|192.78|357.00|||56|
10833|C|16|1034.1035.1007||CHO|CHO|B||||||57|1|1|192.78|357.00|||56|
10834|C|16|1034.1035.1008||CHO|CHO|M||||||57|1|1|192.78|357.00|||56|
10835|C|16|1034.1035.1009||VAG|VAG|B||||||57|1|1|192.78|357.00|||56|
10836|C|16|1034.1035.1010||VAG|VAG|M||||||57|1|1|192.78|357.00|||56|
10837|C|16|1034.1035.1011||AZE|AZE|B||||||57|1|1|192.78|357.00|||56|
10838|C|16|1034.1035.1012||AZE|AZE|M||||||57|1|1|192.78|357.00|||56|
10839|C|16|1034.1035.1013||AMA|AMA|B||||||57|1|1|192.78|357.00|||56|
10840|C|16|1034.1035.1014||AMA|AMA|M||||||57|1|1|192.78|357.00|||56|
10841|C|16|1034.1035.1015||AES|AES|B||||||57|1|1|192.78|357.00|||56|
10842|C|16|1034.1035.1016||AES|AES|M||||||57|1|1|192.78|357.00|||56|
10843|C|16|1034.1035.1017||PRA|PRA|B||||||57|1|1|192.78|357.00|||56|
10844|C|16|1034.1035.1018||PRA|PRA|M||||||57|1|1|192.78|357.00|||56|
10845|C|16|1034.1035.1019||ROS|ROS|B||||||57|1|1|192.78|357.00|||56|
10846|C|16|1034.1035.1020||ROS|ROS|M||||||57|1|1|192.78|357.00|||56|
10847|C|16|1034.1035.1021||VER|VER|B||||||57|1|1|192.78|357.00|||56|
10848|C|16|1034.1035.1022||VER|VER|M||||||57|1|1|192.78|357.00|||56|
10849|C|16|1034.1035.1023||AZB|AZB|||||||57|1|1|192.78|357.00|||56|
10850|C|16|1034.1035.1024||DEN|DEN|||||||57|1|1|192.78|357.00|||56|
10851|C|16|1034.1035.1025||BLK|BLK|||||||57|1|1|192.78|357.00|||56|
10852|C|16|1034.1035.1026||ART|ART|||||||57|1|1|192.78|357.00|||56|
10853|C|16|1034.1035.1027||LIN|LIN|||||||57|1|1|192.78|357.00|||56|
10854|C|16|1034.1035.1028||HAL|HAL|||||||57|1|1|192.78|357.00|||56|
10855|C|17|1034.1036.845||TBL|TBL|||||||57|1|1|150.66|279.00|||56|
10856|C|17|1034.1036.846||TEA|TEA|||||||57|1|1|150.66|279.00|||56|
10857|C|17|1034.1036.847||OAK|OAK|||||||57|1|1|150.66|279.00|||56|
10858|C|17|1034.1036.848||JOP|JOP|||||||57|1|1|150.66|279.00|||56|
10859|C|17|1034.1036.949||TBR|BCO|B||||||57|1|1|193.86|359.00|||56|
10860|C|17|1034.1036.950||TBR|BCO|M||||||57|1|1|193.86|359.00|||56|
10861|C|17|1034.1036.951||TBR|CCL|B||||||57|1|1|193.86|359.00|||56|
10862|C|17|1034.1036.952||TBR|CCL|M||||||57|1|1|193.86|359.00|||56|
10863|C|17|1034.1036.953||TBR|CME|B||||||57|1|1|193.86|359.00|||56|
10864|C|17|1034.1036.954||TBR|CME|M||||||57|1|1|193.86|359.00|||56|
10865|C|17|1034.1036.955||TBR|ANT|B||||||57|1|1|193.86|359.00|||56|
10866|C|17|1034.1036.956||TBR|ANT|M||||||57|1|1|193.86|359.00|||56|
10867|C|17|1034.1036.957||TBR|PTO|B||||||57|1|1|193.86|359.00|||56|
10868|C|17|1034.1036.958||TBR|PTO|M||||||57|1|1|193.86|359.00|||56|
10869|C|17|1034.1036.959||TBR|CRE|B||||||57|1|1|193.86|359.00|||56|
10870|C|17|1034.1036.960||TBR|CRE|M||||||57|1|1|193.86|359.00|||56|
10871|C|17|1034.1036.961||TBR|CAM|B||||||57|1|1|193.86|359.00|||56|
10872|C|17|1034.1036.962||TBR|CAM|M||||||57|1|1|193.86|359.00|||56|
10873|C|17|1034.1036.963||TBR|OUR|B||||||57|1|1|193.86|359.00|||56|
10874|C|17|1034.1036.964||TBR|OUR|M||||||57|1|1|193.86|359.00|||56|
10875|C|17|1034.1036.965||TBR|COB|B||||||57|1|1|193.86|359.00|||56|
10876|C|17|1034.1036.966||TBR|COB|M||||||57|1|1|193.86|359.00|||56|
10877|C|17|1034.1036.967||TBR|CHO|B||||||57|1|1|193.86|359.00|||56|
10878|C|17|1034.1036.968||TBR|CHO|M||||||57|1|1|193.86|359.00|||56|
10879|C|17|1034.1036.969||TBR|VAG|B||||||57|1|1|193.86|359.00|||56|
10880|C|17|1034.1036.970||TBR|VAG|M||||||57|1|1|193.86|359.00|||56|
10881|C|17|1034.1036.971||TBR|AZE|B||||||57|1|1|193.86|359.00|||56|
10882|C|17|1034.1036.972||TBR|AZE|M||||||57|1|1|193.86|359.00|||56|
10883|C|17|1034.1036.973||TBR|AMA|B||||||57|1|1|193.86|359.00|||56|
10884|C|17|1034.1036.974||TBR|AMA|M||||||57|1|1|193.86|359.00|||56|
10885|C|17|1034.1036.975||TBR|AES|B||||||57|1|1|193.86|359.00|||56|
10886|C|17|1034.1036.976||TBR|AES|M||||||57|1|1|193.86|359.00|||56|
10887|C|17|1034.1036.977||TBR|PRA|B||||||57|1|1|193.86|359.00|||56|
10888|C|17|1034.1036.978||TBR|PRA|M||||||57|1|1|193.86|359.00|||56|
10889|C|17|1034.1036.979||TBR|ROS|B||||||57|1|1|193.86|359.00|||56|
10890|C|17|1034.1036.980||TBR|ROS|M||||||57|1|1|193.86|359.00|||56|
10891|C|17|1034.1036.981||TBR|VER|B||||||57|1|1|193.86|359.00|||56|
10892|C|17|1034.1036.982||TBR|VER|M||||||57|1|1|193.86|359.00|||56|
10893|C|17|1034.1036.983||TBR|AZB|||||||57|1|1|193.86|359.00|||56|
10894|C|17|1034.1036.984||TBR|DEN|||||||57|1|1|193.86|359.00|||56|
10895|C|17|1034.1036.985||TBR|BLK|||||||57|1|1|193.86|359.00|||56|
10896|C|17|1034.1036.986||TBR|ART|||||||57|1|1|193.86|359.00|||56|
10897|C|17|1034.1036.987||TBR|LIN|||||||57|1|1|193.86|359.00|||56|
10898|C|17|1034.1036.988||TBR|HAL|||||||57|1|1|193.86|359.00|||56|
10899|C|17|1034.1036.989||BCO|BCO|B||||||57|1|1|215.46|399.00|||56|
10900|C|17|1034.1036.990||BCO|BCO|M||||||57|1|1|215.46|399.00|||56|
10901|C|17|1034.1036.991||CCL|CCL|B||||||57|1|1|215.46|399.00|||56|
10902|C|17|1034.1036.992||CCL|CCL|M||||||57|1|1|215.46|399.00|||56|
10903|C|17|1034.1036.993||CME|CME|B||||||57|1|1|215.46|399.00|||56|
10904|C|17|1034.1036.994||CME|CME|M||||||57|1|1|215.46|399.00|||56|
10905|C|17|1034.1036.995||ANT|ANT|B||||||57|1|1|215.46|399.00|||56|
10906|C|17|1034.1036.996||ANT|ANT|M||||||57|1|1|215.46|399.00|||56|
10907|C|17|1034.1036.997||PTO|PTO|B||||||57|1|1|215.46|399.00|||56|
10908|C|17|1034.1036.998||PTO|PTO|M||||||57|1|1|215.46|399.00|||56|
10909|C|17|1034.1036.999||CRE|CRE|B||||||57|1|1|215.46|399.00|||56|
10910|C|17|1034.1036.1000||CRE|CRE|M||||||57|1|1|215.46|399.00|||56|
10911|C|17|1034.1036.1001||CAM|CAM|B||||||57|1|1|215.46|399.00|||56|
10912|C|17|1034.1036.1002||CAM|CAM|M||||||57|1|1|215.46|399.00|||56|
10913|C|17|1034.1036.1003||OUR|OUR|B||||||57|1|1|215.46|399.00|||56|
10914|C|17|1034.1036.1004||OUR|OUR|M||||||57|1|1|215.46|399.00|||56|
10915|C|17|1034.1036.1005||COB|COB|B||||||57|1|1|215.46|399.00|||56|
10916|C|17|1034.1036.1006||COB|COB|M||||||57|1|1|215.46|399.00|||56|
10917|C|17|1034.1036.1007||CHO|CHO|B||||||57|1|1|215.46|399.00|||56|
10918|C|17|1034.1036.1008||CHO|CHO|M||||||57|1|1|215.46|399.00|||56|
10919|C|17|1034.1036.1009||VAG|VAG|B||||||57|1|1|215.46|399.00|||56|
10920|C|17|1034.1036.1010||VAG|VAG|M||||||57|1|1|215.46|399.00|||56|
10921|C|17|1034.1036.1011||AZE|AZE|B||||||57|1|1|215.46|399.00|||56|
10922|C|17|1034.1036.1012||AZE|AZE|M||||||57|1|1|215.46|399.00|||56|
10923|C|17|1034.1036.1013||AMA|AMA|B||||||57|1|1|215.46|399.00|||56|
10924|C|17|1034.1036.1014||AMA|AMA|M||||||57|1|1|215.46|399.00|||56|
10925|C|17|1034.1036.1015||AES|AES|B||||||57|1|1|215.46|399.00|||56|
10926|C|17|1034.1036.1016||AES|AES|M||||||57|1|1|215.46|399.00|||56|
10927|C|17|1034.1036.1017||PRA|PRA|B||||||57|1|1|215.46|399.00|||56|
10928|C|17|1034.1036.1018||PRA|PRA|M||||||57|1|1|215.46|399.00|||56|
10929|C|17|1034.1036.1019||ROS|ROS|B||||||57|1|1|215.46|399.00|||56|
10930|C|17|1034.1036.1020||ROS|ROS|M||||||57|1|1|215.46|399.00|||56|
10931|C|17|1034.1036.1021||VER|VER|B||||||57|1|1|215.46|399.00|||56|
10932|C|17|1034.1036.1022||VER|VER|M||||||57|1|1|215.46|399.00|||56|
10933|C|17|1034.1036.1023||AZB|AZB|||||||57|1|1|215.46|399.00|||56|
10934|C|17|1034.1036.1024||DEN|DEN|||||||57|1|1|215.46|399.00|||56|
10935|C|17|1034.1036.1025||BLK|BLK|||||||57|1|1|215.46|399.00|||56|
10936|C|17|1034.1036.1026||ART|ART|||||||57|1|1|215.46|399.00|||56|
10937|C|17|1034.1036.1027||LIN|LIN|||||||57|1|1|215.46|399.00|||56|
10938|C|17|1034.1036.1028||HAL|HAL|||||||57|1|1|215.46|399.00|||56|
10939|C|18|1037.1038.845||TBL|TBL|||||||58|1|1|65.34|121.00|||57|
10940|C|18|1037.1038.846||TEA|TEA|||||||58|1|1|65.34|121.00|||57|
10941|C|18|1037.1038.847||OAK|OAK|||||||58|1|1|65.34|121.00|||57|
10942|C|18|1037.1038.848||JOP|JOP|||||||58|1|1|65.34|121.00|||57|
10943|C|18|1037.1038.949||TBR|BCO|B||||||58|1|1|108.54|201.00|||57|
10944|C|18|1037.1038.950||TBR|BCO|M||||||58|1|1|108.54|201.00|||57|
10945|C|18|1037.1038.951||TBR|CCL|B||||||58|1|1|108.54|201.00|||57|
10946|C|18|1037.1038.952||TBR|CCL|M||||||58|1|1|108.54|201.00|||57|
10947|C|18|1037.1038.953||TBR|CME|B||||||58|1|1|108.54|201.00|||57|
10948|C|18|1037.1038.954||TBR|CME|M||||||58|1|1|108.54|201.00|||57|
10949|C|18|1037.1038.955||TBR|ANT|B||||||58|1|1|108.54|201.00|||57|
10950|C|18|1037.1038.956||TBR|ANT|M||||||58|1|1|108.54|201.00|||57|
10951|C|18|1037.1038.957||TBR|PTO|B||||||58|1|1|108.54|201.00|||57|
10952|C|18|1037.1038.958||TBR|PTO|M||||||58|1|1|108.54|201.00|||57|
10953|C|18|1037.1038.959||TBR|CRE|B||||||58|1|1|108.54|201.00|||57|
10954|C|18|1037.1038.960||TBR|CRE|M||||||58|1|1|108.54|201.00|||57|
10955|C|18|1037.1038.961||TBR|CAM|B||||||58|1|1|108.54|201.00|||57|
10956|C|18|1037.1038.962||TBR|CAM|M||||||58|1|1|108.54|201.00|||57|
10957|C|18|1037.1038.963||TBR|OUR|B||||||58|1|1|108.54|201.00|||57|
10958|C|18|1037.1038.964||TBR|OUR|M||||||58|1|1|108.54|201.00|||57|
10959|C|18|1037.1038.965||TBR|COB|B||||||58|1|1|108.54|201.00|||57|
10960|C|18|1037.1038.966||TBR|COB|M||||||58|1|1|108.54|201.00|||57|
10961|C|18|1037.1038.967||TBR|CHO|B||||||58|1|1|108.54|201.00|||57|
10962|C|18|1037.1038.968||TBR|CHO|M||||||58|1|1|108.54|201.00|||57|
10963|C|18|1037.1038.969||TBR|VAG|B||||||58|1|1|108.54|201.00|||57|
10964|C|18|1037.1038.970||TBR|VAG|M||||||58|1|1|108.54|201.00|||57|
10965|C|18|1037.1038.971||TBR|AZE|B||||||58|1|1|108.54|201.00|||57|
10966|C|18|1037.1038.972||TBR|AZE|M||||||58|1|1|108.54|201.00|||57|
10967|C|18|1037.1038.973||TBR|AMA|B||||||58|1|1|108.54|201.00|||57|
10968|C|18|1037.1038.974||TBR|AMA|M||||||58|1|1|108.54|201.00|||57|
10969|C|18|1037.1038.975||TBR|AES|B||||||58|1|1|108.54|201.00|||57|
10970|C|18|1037.1038.976||TBR|AES|M||||||58|1|1|108.54|201.00|||57|
10971|C|18|1037.1038.977||TBR|PRA|B||||||58|1|1|108.54|201.00|||57|
10972|C|18|1037.1038.978||TBR|PRA|M||||||58|1|1|108.54|201.00|||57|
10973|C|18|1037.1038.979||TBR|ROS|B||||||58|1|1|108.54|201.00|||57|
10974|C|18|1037.1038.980||TBR|ROS|M||||||58|1|1|108.54|201.00|||57|
10975|C|18|1037.1038.981||TBR|VER|B||||||58|1|1|108.54|201.00|||57|
10976|C|18|1037.1038.982||TBR|VER|M||||||58|1|1|108.54|201.00|||57|
10977|C|18|1037.1038.983||TBR|AZB|||||||58|1|1|108.54|201.00|||57|
10978|C|18|1037.1038.984||TBR|DEN|||||||58|1|1|108.54|201.00|||57|
10979|C|18|1037.1038.985||TBR|BLK|||||||58|1|1|108.54|201.00|||57|
10980|C|18|1037.1038.986||TBR|ART|||||||58|1|1|108.54|201.00|||57|
10981|C|18|1037.1038.987||TBR|LIN|||||||58|1|1|108.54|201.00|||57|
10982|C|18|1037.1038.988||TBR|HAL|||||||58|1|1|108.54|201.00|||57|
10983|C|18|1037.1038.989||BCO|BCO|B||||||58|1|1|130.14|241.00|||57|
10984|C|18|1037.1038.990||BCO|BCO|M||||||58|1|1|130.14|241.00|||57|
10985|C|18|1037.1038.991||CCL|CCL|B||||||58|1|1|130.14|241.00|||57|
10986|C|18|1037.1038.992||CCL|CCL|M||||||58|1|1|130.14|241.00|||57|
10987|C|18|1037.1038.993||CME|CME|B||||||58|1|1|130.14|241.00|||57|
10988|C|18|1037.1038.994||CME|CME|M||||||58|1|1|130.14|241.00|||57|
10989|C|18|1037.1038.995||ANT|ANT|B||||||58|1|1|130.14|241.00|||57|
10990|C|18|1037.1038.996||ANT|ANT|M||||||58|1|1|130.14|241.00|||57|
10991|C|18|1037.1038.997||PTO|PTO|B||||||58|1|1|130.14|241.00|||57|
10992|C|18|1037.1038.998||PTO|PTO|M||||||58|1|1|130.14|241.00|||57|
10993|C|18|1037.1038.999||CRE|CRE|B||||||58|1|1|130.14|241.00|||57|
10994|C|18|1037.1038.1000||CRE|CRE|M||||||58|1|1|130.14|241.00|||57|
10995|C|18|1037.1038.1001||CAM|CAM|B||||||58|1|1|130.14|241.00|||57|
10996|C|18|1037.1038.1002||CAM|CAM|M||||||58|1|1|130.14|241.00|||57|
10997|C|18|1037.1038.1003||OUR|OUR|B||||||58|1|1|130.14|241.00|||57|
10998|C|18|1037.1038.1004||OUR|OUR|M||||||58|1|1|130.14|241.00|||57|
10999|C|18|1037.1038.1005||COB|COB|B||||||58|1|1|130.14|241.00|||57|
11000|C|18|1037.1038.1006||COB|COB|M||||||58|1|1|130.14|241.00|||57|
11001|C|18|1037.1038.1007||CHO|CHO|B||||||58|1|1|130.14|241.00|||57|
11002|C|18|1037.1038.1008||CHO|CHO|M||||||58|1|1|130.14|241.00|||57|
11003|C|18|1037.1038.1009||VAG|VAG|B||||||58|1|1|130.14|241.00|||57|
11004|C|18|1037.1038.1010||VAG|VAG|M||||||58|1|1|130.14|241.00|||57|
11005|C|18|1037.1038.1011||AZE|AZE|B||||||58|1|1|130.14|241.00|||57|
11006|C|18|1037.1038.1012||AZE|AZE|M||||||58|1|1|130.14|241.00|||57|
11007|C|18|1037.1038.1013||AMA|AMA|B||||||58|1|1|130.14|241.00|||57|
11008|C|18|1037.1038.1014||AMA|AMA|M||||||58|1|1|130.14|241.00|||57|
11009|C|18|1037.1038.1015||AES|AES|B||||||58|1|1|130.14|241.00|||57|
11010|C|18|1037.1038.1016||AES|AES|M||||||58|1|1|130.14|241.00|||57|
11011|C|18|1037.1038.1017||PRA|PRA|B||||||58|1|1|130.14|241.00|||57|
11012|C|18|1037.1038.1018||PRA|PRA|M||||||58|1|1|130.14|241.00|||57|
11013|C|18|1037.1038.1019||ROS|ROS|B||||||58|1|1|130.14|241.00|||57|
11014|C|18|1037.1038.1020||ROS|ROS|M||||||58|1|1|130.14|241.00|||57|
11015|C|18|1037.1038.1021||VER|VER|B||||||58|1|1|130.14|241.00|||57|
11016|C|18|1037.1038.1022||VER|VER|M||||||58|1|1|130.14|241.00|||57|
11017|C|18|1037.1038.1023||AZB|AZB|||||||58|1|1|130.14|241.00|||57|
11018|C|18|1037.1038.1024||DEN|DEN|||||||58|1|1|130.14|241.00|||57|
11019|C|18|1037.1038.1025||BLK|BLK|||||||58|1|1|130.14|241.00|||57|
11020|C|18|1037.1038.1026||ART|ART|||||||58|1|1|130.14|241.00|||57|
11021|C|18|1037.1038.1027||LIN|LIN|||||||58|1|1|130.14|241.00|||57|
11022|C|18|1037.1038.1028||HAL|HAL|||||||58|1|1|130.14|241.00|||57|
11023|C|19|1037.1039.845||TBL|TBL|||||||58|1|1|75.60|140.00|||57|
11024|C|19|1037.1039.846||TEA|TEA|||||||58|1|1|75.60|140.00|||57|
11025|C|19|1037.1039.847||OAK|OAK|||||||58|1|1|75.60|140.00|||57|
11026|C|19|1037.1039.848||JOP|JOP|||||||58|1|1|75.60|140.00|||57|
11027|C|19|1037.1039.949||TBR|BCO|B||||||58|1|1|118.80|220.00|||57|
11028|C|19|1037.1039.950||TBR|BCO|M||||||58|1|1|118.80|220.00|||57|
11029|C|19|1037.1039.951||TBR|CCL|B||||||58|1|1|118.80|220.00|||57|
11030|C|19|1037.1039.952||TBR|CCL|M||||||58|1|1|118.80|220.00|||57|
11031|C|19|1037.1039.953||TBR|CME|B||||||58|1|1|118.80|220.00|||57|
11032|C|19|1037.1039.954||TBR|CME|M||||||58|1|1|118.80|220.00|||57|
11033|C|19|1037.1039.955||TBR|ANT|B||||||58|1|1|118.80|220.00|||57|
11034|C|19|1037.1039.956||TBR|ANT|M||||||58|1|1|118.80|220.00|||57|
11035|C|19|1037.1039.957||TBR|PTO|B||||||58|1|1|118.80|220.00|||57|
11036|C|19|1037.1039.958||TBR|PTO|M||||||58|1|1|118.80|220.00|||57|
11037|C|19|1037.1039.959||TBR|CRE|B||||||58|1|1|118.80|220.00|||57|
11038|C|19|1037.1039.960||TBR|CRE|M||||||58|1|1|118.80|220.00|||57|
11039|C|19|1037.1039.961||TBR|CAM|B||||||58|1|1|118.80|220.00|||57|
11040|C|19|1037.1039.962||TBR|CAM|M||||||58|1|1|118.80|220.00|||57|
11041|C|19|1037.1039.963||TBR|OUR|B||||||58|1|1|118.80|220.00|||57|
11042|C|19|1037.1039.964||TBR|OUR|M||||||58|1|1|118.80|220.00|||57|
11043|C|19|1037.1039.965||TBR|COB|B||||||58|1|1|118.80|220.00|||57|
11044|C|19|1037.1039.966||TBR|COB|M||||||58|1|1|118.80|220.00|||57|
11045|C|19|1037.1039.967||TBR|CHO|B||||||58|1|1|118.80|220.00|||57|
11046|C|19|1037.1039.968||TBR|CHO|M||||||58|1|1|118.80|220.00|||57|
11047|C|19|1037.1039.969||TBR|VAG|B||||||58|1|1|118.80|220.00|||57|
11048|C|19|1037.1039.970||TBR|VAG|M||||||58|1|1|118.80|220.00|||57|
11049|C|19|1037.1039.971||TBR|AZE|B||||||58|1|1|118.80|220.00|||57|
11050|C|19|1037.1039.972||TBR|AZE|M||||||58|1|1|118.80|220.00|||57|
11051|C|19|1037.1039.973||TBR|AMA|B||||||58|1|1|118.80|220.00|||57|
11052|C|19|1037.1039.974||TBR|AMA|M||||||58|1|1|118.80|220.00|||57|
11053|C|19|1037.1039.975||TBR|AES|B||||||58|1|1|118.80|220.00|||57|
11054|C|19|1037.1039.976||TBR|AES|M||||||58|1|1|118.80|220.00|||57|
11055|C|19|1037.1039.977||TBR|PRA|B||||||58|1|1|118.80|220.00|||57|
11056|C|19|1037.1039.978||TBR|PRA|M||||||58|1|1|118.80|220.00|||57|
11057|C|19|1037.1039.979||TBR|ROS|B||||||58|1|1|118.80|220.00|||57|
11058|C|19|1037.1039.980||TBR|ROS|M||||||58|1|1|118.80|220.00|||57|
11059|C|19|1037.1039.981||TBR|VER|B||||||58|1|1|118.80|220.00|||57|
11060|C|19|1037.1039.982||TBR|VER|M||||||58|1|1|118.80|220.00|||57|
11061|C|19|1037.1039.983||TBR|AZB|||||||58|1|1|118.80|220.00|||57|
11062|C|19|1037.1039.984||TBR|DEN|||||||58|1|1|118.80|220.00|||57|
11063|C|19|1037.1039.985||TBR|BLK|||||||58|1|1|118.80|220.00|||57|
11064|C|19|1037.1039.986||TBR|ART|||||||58|1|1|118.80|220.00|||57|
11065|C|19|1037.1039.987||TBR|LIN|||||||58|1|1|118.80|220.00|||57|
11066|C|19|1037.1039.988||TBR|HAL|||||||58|1|1|118.80|220.00|||57|
11067|C|19|1037.1039.989||BCO|BCO|B||||||58|1|1|140.40|260.00|||57|
11068|C|19|1037.1039.990||BCO|BCO|M||||||58|1|1|140.40|260.00|||57|
11069|C|19|1037.1039.991||CCL|CCL|B||||||58|1|1|140.40|260.00|||57|
11070|C|19|1037.1039.992||CCL|CCL|M||||||58|1|1|140.40|260.00|||57|
11071|C|19|1037.1039.993||CME|CME|B||||||58|1|1|140.40|260.00|||57|
11072|C|19|1037.1039.994||CME|CME|M||||||58|1|1|140.40|260.00|||57|
11073|C|19|1037.1039.995||ANT|ANT|B||||||58|1|1|140.40|260.00|||57|
11074|C|19|1037.1039.996||ANT|ANT|M||||||58|1|1|140.40|260.00|||57|
11075|C|19|1037.1039.997||PTO|PTO|B||||||58|1|1|140.40|260.00|||57|
11076|C|19|1037.1039.998||PTO|PTO|M||||||58|1|1|140.40|260.00|||57|
11077|C|19|1037.1039.999||CRE|CRE|B||||||58|1|1|140.40|260.00|||57|
11078|C|19|1037.1039.1000||CRE|CRE|M||||||58|1|1|140.40|260.00|||57|
11079|C|19|1037.1039.1001||CAM|CAM|B||||||58|1|1|140.40|260.00|||57|
11080|C|19|1037.1039.1002||CAM|CAM|M||||||58|1|1|140.40|260.00|||57|
11081|C|19|1037.1039.1003||OUR|OUR|B||||||58|1|1|140.40|260.00|||57|
11082|C|19|1037.1039.1004||OUR|OUR|M||||||58|1|1|140.40|260.00|||57|
11083|C|19|1037.1039.1005||COB|COB|B||||||58|1|1|140.40|260.00|||57|
11084|C|19|1037.1039.1006||COB|COB|M||||||58|1|1|140.40|260.00|||57|
11085|C|19|1037.1039.1007||CHO|CHO|B||||||58|1|1|140.40|260.00|||57|
11086|C|19|1037.1039.1008||CHO|CHO|M||||||58|1|1|140.40|260.00|||57|
11087|C|19|1037.1039.1009||VAG|VAG|B||||||58|1|1|140.40|260.00|||57|
11088|C|19|1037.1039.1010||VAG|VAG|M||||||58|1|1|140.40|260.00|||57|
11089|C|19|1037.1039.1011||AZE|AZE|B||||||58|1|1|140.40|260.00|||57|
11090|C|19|1037.1039.1012||AZE|AZE|M||||||58|1|1|140.40|260.00|||57|
11091|C|19|1037.1039.1013||AMA|AMA|B||||||58|1|1|140.40|260.00|||57|
11092|C|19|1037.1039.1014||AMA|AMA|M||||||58|1|1|140.40|260.00|||57|
11093|C|19|1037.1039.1015||AES|AES|B||||||58|1|1|140.40|260.00|||57|
11094|C|19|1037.1039.1016||AES|AES|M||||||58|1|1|140.40|260.00|||57|
11095|C|19|1037.1039.1017||PRA|PRA|B||||||58|1|1|140.40|260.00|||57|
11096|C|19|1037.1039.1018||PRA|PRA|M||||||58|1|1|140.40|260.00|||57|
11097|C|19|1037.1039.1019||ROS|ROS|B||||||58|1|1|140.40|260.00|||57|
11098|C|19|1037.1039.1020||ROS|ROS|M||||||58|1|1|140.40|260.00|||57|
11099|C|19|1037.1039.1021||VER|VER|B||||||58|1|1|140.40|260.00|||57|
11100|C|19|1037.1039.1022||VER|VER|M||||||58|1|1|140.40|260.00|||57|
11101|C|19|1037.1039.1023||AZB|AZB|||||||58|1|1|140.40|260.00|||57|
11102|C|19|1037.1039.1024||DEN|DEN|||||||58|1|1|140.40|260.00|||57|
11103|C|19|1037.1039.1025||BLK|BLK|||||||58|1|1|140.40|260.00|||57|
11104|C|19|1037.1039.1026||ART|ART|||||||58|1|1|140.40|260.00|||57|
11105|C|19|1037.1039.1027||LIN|LIN|||||||58|1|1|140.40|260.00|||57|
11106|C|19|1037.1039.1028||HAL|HAL|||||||58|1|1|140.40|260.00|||57|
11107|C|20|1040.1041.845||TBL|TBL|||||||59|1|1|85.86|159.00|||57|
11108|C|20|1040.1041.846||TEA|TEA|||||||59|1|1|85.86|159.00|||57|
11109|C|20|1040.1041.847||OAK|OAK|||||||59|1|1|85.86|159.00|||57|
11110|C|20|1040.1041.848||JOP|JOP|||||||59|1|1|85.86|159.00|||57|
11111|C|20|1040.1041.949||TBR|BCO|B||||||59|1|1|129.06|239.00|||57|
11112|C|20|1040.1041.950||TBR|BCO|M||||||59|1|1|129.06|239.00|||57|
11113|C|20|1040.1041.951||TBR|CCL|B||||||59|1|1|129.06|239.00|||57|
11114|C|20|1040.1041.952||TBR|CCL|M||||||59|1|1|129.06|239.00|||57|
11115|C|20|1040.1041.953||TBR|CME|B||||||59|1|1|129.06|239.00|||57|
11116|C|20|1040.1041.954||TBR|CME|M||||||59|1|1|129.06|239.00|||57|
11117|C|20|1040.1041.955||TBR|ANT|B||||||59|1|1|129.06|239.00|||57|
11118|C|20|1040.1041.956||TBR|ANT|M||||||59|1|1|129.06|239.00|||57|
11119|C|20|1040.1041.957||TBR|PTO|B||||||59|1|1|129.06|239.00|||57|
11120|C|20|1040.1041.958||TBR|PTO|M||||||59|1|1|129.06|239.00|||57|
11121|C|20|1040.1041.959||TBR|CRE|B||||||59|1|1|129.06|239.00|||57|
11122|C|20|1040.1041.960||TBR|CRE|M||||||59|1|1|129.06|239.00|||57|
11123|C|20|1040.1041.961||TBR|CAM|B||||||59|1|1|129.06|239.00|||57|
11124|C|20|1040.1041.962||TBR|CAM|M||||||59|1|1|129.06|239.00|||57|
11125|C|20|1040.1041.963||TBR|OUR|B||||||59|1|1|129.06|239.00|||57|
11126|C|20|1040.1041.964||TBR|OUR|M||||||59|1|1|129.06|239.00|||57|
11127|C|20|1040.1041.965||TBR|COB|B||||||59|1|1|129.06|239.00|||57|
11128|C|20|1040.1041.966||TBR|COB|M||||||59|1|1|129.06|239.00|||57|
11129|C|20|1040.1041.967||TBR|CHO|B||||||59|1|1|129.06|239.00|||57|
11130|C|20|1040.1041.968||TBR|CHO|M||||||59|1|1|129.06|239.00|||57|
11131|C|20|1040.1041.969||TBR|VAG|B||||||59|1|1|129.06|239.00|||57|
11132|C|20|1040.1041.970||TBR|VAG|M||||||59|1|1|129.06|239.00|||57|
11133|C|20|1040.1041.971||TBR|AZE|B||||||59|1|1|129.06|239.00|||57|
11134|C|20|1040.1041.972||TBR|AZE|M||||||59|1|1|129.06|239.00|||57|
11135|C|20|1040.1041.973||TBR|AMA|B||||||59|1|1|129.06|239.00|||57|
11136|C|20|1040.1041.974||TBR|AMA|M||||||59|1|1|129.06|239.00|||57|
11137|C|20|1040.1041.975||TBR|AES|B||||||59|1|1|129.06|239.00|||57|
11138|C|20|1040.1041.976||TBR|AES|M||||||59|1|1|129.06|239.00|||57|
11139|C|20|1040.1041.977||TBR|PRA|B||||||59|1|1|129.06|239.00|||57|
11140|C|20|1040.1041.978||TBR|PRA|M||||||59|1|1|129.06|239.00|||57|
11141|C|20|1040.1041.979||TBR|ROS|B||||||59|1|1|129.06|239.00|||57|
11142|C|20|1040.1041.980||TBR|ROS|M||||||59|1|1|129.06|239.00|||57|
11143|C|20|1040.1041.981||TBR|VER|B||||||59|1|1|129.06|239.00|||57|
11144|C|20|1040.1041.982||TBR|VER|M||||||59|1|1|129.06|239.00|||57|
11145|C|20|1040.1041.983||TBR|AZB|||||||59|1|1|129.06|239.00|||57|
11146|C|20|1040.1041.984||TBR|DEN|||||||59|1|1|129.06|239.00|||57|
11147|C|20|1040.1041.985||TBR|BLK|||||||59|1|1|129.06|239.00|||57|
11148|C|20|1040.1041.986||TBR|ART|||||||59|1|1|129.06|239.00|||57|
11149|C|20|1040.1041.987||TBR|LIN|||||||59|1|1|129.06|239.00|||57|
11150|C|20|1040.1041.988||TBR|HAL|||||||59|1|1|129.06|239.00|||57|
11151|C|20|1040.1041.989||BCO|BCO|B||||||59|1|1|150.66|279.00|||57|
11152|C|20|1040.1041.990||BCO|BCO|M||||||59|1|1|150.66|279.00|||57|
11153|C|20|1040.1041.991||CCL|CCL|B||||||59|1|1|150.66|279.00|||57|
11154|C|20|1040.1041.992||CCL|CCL|M||||||59|1|1|150.66|279.00|||57|
11155|C|20|1040.1041.993||CME|CME|B||||||59|1|1|150.66|279.00|||57|
11156|C|20|1040.1041.994||CME|CME|M||||||59|1|1|150.66|279.00|||57|
11157|C|20|1040.1041.995||ANT|ANT|B||||||59|1|1|150.66|279.00|||57|
11158|C|20|1040.1041.996||ANT|ANT|M||||||59|1|1|150.66|279.00|||57|
11159|C|20|1040.1041.997||PTO|PTO|B||||||59|1|1|150.66|279.00|||57|
11160|C|20|1040.1041.998||PTO|PTO|M||||||59|1|1|150.66|279.00|||57|
11161|C|20|1040.1041.999||CRE|CRE|B||||||59|1|1|150.66|279.00|||57|
11162|C|20|1040.1041.1000||CRE|CRE|M||||||59|1|1|150.66|279.00|||57|
11163|C|20|1040.1041.1001||CAM|CAM|B||||||59|1|1|150.66|279.00|||57|
11164|C|20|1040.1041.1002||CAM|CAM|M||||||59|1|1|150.66|279.00|||57|
11165|C|20|1040.1041.1003||OUR|OUR|B||||||59|1|1|150.66|279.00|||57|
11166|C|20|1040.1041.1004||OUR|OUR|M||||||59|1|1|150.66|279.00|||57|
11167|C|20|1040.1041.1005||COB|COB|B||||||59|1|1|150.66|279.00|||57|
11168|C|20|1040.1041.1006||COB|COB|M||||||59|1|1|150.66|279.00|||57|
11169|C|20|1040.1041.1007||CHO|CHO|B||||||59|1|1|150.66|279.00|||57|
11170|C|20|1040.1041.1008||CHO|CHO|M||||||59|1|1|150.66|279.00|||57|
11171|C|20|1040.1041.1009||VAG|VAG|B||||||59|1|1|150.66|279.00|||57|
11172|C|20|1040.1041.1010||VAG|VAG|M||||||59|1|1|150.66|279.00|||57|
11173|C|20|1040.1041.1011||AZE|AZE|B||||||59|1|1|150.66|279.00|||57|
11174|C|20|1040.1041.1012||AZE|AZE|M||||||59|1|1|150.66|279.00|||57|
11175|C|20|1040.1041.1013||AMA|AMA|B||||||59|1|1|150.66|279.00|||57|
11176|C|20|1040.1041.1014||AMA|AMA|M||||||59|1|1|150.66|279.00|||57|
11177|C|20|1040.1041.1015||AES|AES|B||||||59|1|1|150.66|279.00|||57|
11178|C|20|1040.1041.1016||AES|AES|M||||||59|1|1|150.66|279.00|||57|
11179|C|20|1040.1041.1017||PRA|PRA|B||||||59|1|1|150.66|279.00|||57|
11180|C|20|1040.1041.1018||PRA|PRA|M||||||59|1|1|150.66|279.00|||57|
11181|C|20|1040.1041.1019||ROS|ROS|B||||||59|1|1|150.66|279.00|||57|
11182|C|20|1040.1041.1020||ROS|ROS|M||||||59|1|1|150.66|279.00|||57|
11183|C|20|1040.1041.1021||VER|VER|B||||||59|1|1|150.66|279.00|||57|
11184|C|20|1040.1041.1022||VER|VER|M||||||59|1|1|150.66|279.00|||57|
11185|C|20|1040.1041.1023||AZB|AZB|||||||59|1|1|150.66|279.00|||57|
11186|C|20|1040.1041.1024||DEN|DEN|||||||59|1|1|150.66|279.00|||57|
11187|C|20|1040.1041.1025||BLK|BLK|||||||59|1|1|150.66|279.00|||57|
11188|C|20|1040.1041.1026||ART|ART|||||||59|1|1|150.66|279.00|||57|
11189|C|20|1040.1041.1027||LIN|LIN|||||||59|1|1|150.66|279.00|||57|
11190|C|20|1040.1041.1028||HAL|HAL|||||||59|1|1|150.66|279.00|||57|
11191|C|19|1040.1039.845||TBL|TBL|||||||59|1|1|96.12|178.00|||57|
11192|C|19|1040.1039.846||TEA|TEA|||||||59|1|1|96.12|178.00|||57|
11193|C|19|1040.1039.847||OAK|OAK|||||||59|1|1|96.12|178.00|||57|
11194|C|19|1040.1039.848||JOP|JOP|||||||59|1|1|96.12|178.00|||57|
11195|C|19|1040.1039.949||TBR|BCO|B||||||59|1|1|139.32|258.00|||57|
11196|C|19|1040.1039.950||TBR|BCO|M||||||59|1|1|139.32|258.00|||57|
11197|C|19|1040.1039.951||TBR|CCL|B||||||59|1|1|139.32|258.00|||57|
11198|C|19|1040.1039.952||TBR|CCL|M||||||59|1|1|139.32|258.00|||57|
11199|C|19|1040.1039.953||TBR|CME|B||||||59|1|1|139.32|258.00|||57|
11200|C|19|1040.1039.954||TBR|CME|M||||||59|1|1|139.32|258.00|||57|
11201|C|19|1040.1039.955||TBR|ANT|B||||||59|1|1|139.32|258.00|||57|
11202|C|19|1040.1039.956||TBR|ANT|M||||||59|1|1|139.32|258.00|||57|
11203|C|19|1040.1039.957||TBR|PTO|B||||||59|1|1|139.32|258.00|||57|
11204|C|19|1040.1039.958||TBR|PTO|M||||||59|1|1|139.32|258.00|||57|
11205|C|19|1040.1039.959||TBR|CRE|B||||||59|1|1|139.32|258.00|||57|
11206|C|19|1040.1039.960||TBR|CRE|M||||||59|1|1|139.32|258.00|||57|
11207|C|19|1040.1039.961||TBR|CAM|B||||||59|1|1|139.32|258.00|||57|
11208|C|19|1040.1039.962||TBR|CAM|M||||||59|1|1|139.32|258.00|||57|
11209|C|19|1040.1039.963||TBR|OUR|B||||||59|1|1|139.32|258.00|||57|
11210|C|19|1040.1039.964||TBR|OUR|M||||||59|1|1|139.32|258.00|||57|
11211|C|19|1040.1039.965||TBR|COB|B||||||59|1|1|139.32|258.00|||57|
11212|C|19|1040.1039.966||TBR|COB|M||||||59|1|1|139.32|258.00|||57|
11213|C|19|1040.1039.967||TBR|CHO|B||||||59|1|1|139.32|258.00|||57|
11214|C|19|1040.1039.968||TBR|CHO|M||||||59|1|1|139.32|258.00|||57|
11215|C|19|1040.1039.969||TBR|VAG|B||||||59|1|1|139.32|258.00|||57|
11216|C|19|1040.1039.970||TBR|VAG|M||||||59|1|1|139.32|258.00|||57|
11217|C|19|1040.1039.971||TBR|AZE|B||||||59|1|1|139.32|258.00|||57|
11218|C|19|1040.1039.972||TBR|AZE|M||||||59|1|1|139.32|258.00|||57|
11219|C|19|1040.1039.973||TBR|AMA|B||||||59|1|1|139.32|258.00|||57|
11220|C|19|1040.1039.974||TBR|AMA|M||||||59|1|1|139.32|258.00|||57|
11221|C|19|1040.1039.975||TBR|AES|B||||||59|1|1|139.32|258.00|||57|
11222|C|19|1040.1039.976||TBR|AES|M||||||59|1|1|139.32|258.00|||57|
11223|C|19|1040.1039.977||TBR|PRA|B||||||59|1|1|139.32|258.00|||57|
11224|C|19|1040.1039.978||TBR|PRA|M||||||59|1|1|139.32|258.00|||57|
11225|C|19|1040.1039.979||TBR|ROS|B||||||59|1|1|139.32|258.00|||57|
11226|C|19|1040.1039.980||TBR|ROS|M||||||59|1|1|139.32|258.00|||57|
11227|C|19|1040.1039.981||TBR|VER|B||||||59|1|1|139.32|258.00|||57|
11228|C|19|1040.1039.982||TBR|VER|M||||||59|1|1|139.32|258.00|||57|
11229|C|19|1040.1039.983||TBR|AZB|||||||59|1|1|139.32|258.00|||57|
11230|C|19|1040.1039.984||TBR|DEN|||||||59|1|1|139.32|258.00|||57|
11231|C|19|1040.1039.985||TBR|BLK|||||||59|1|1|139.32|258.00|||57|
11232|C|19|1040.1039.986||TBR|ART|||||||59|1|1|139.32|258.00|||57|
11233|C|19|1040.1039.987||TBR|LIN|||||||59|1|1|139.32|258.00|||57|
11234|C|19|1040.1039.988||TBR|HAL|||||||59|1|1|139.32|258.00|||57|
11235|C|19|1040.1039.989||BCO|BCO|B||||||59|1|1|160.92|298.00|||57|
11236|C|19|1040.1039.990||BCO|BCO|M||||||59|1|1|160.92|298.00|||57|
11237|C|19|1040.1039.991||CCL|CCL|B||||||59|1|1|160.92|298.00|||57|
11238|C|19|1040.1039.992||CCL|CCL|M||||||59|1|1|160.92|298.00|||57|
11239|C|19|1040.1039.993||CME|CME|B||||||59|1|1|160.92|298.00|||57|
11240|C|19|1040.1039.994||CME|CME|M||||||59|1|1|160.92|298.00|||57|
11241|C|19|1040.1039.995||ANT|ANT|B||||||59|1|1|160.92|298.00|||57|
11242|C|19|1040.1039.996||ANT|ANT|M||||||59|1|1|160.92|298.00|||57|
11243|C|19|1040.1039.997||PTO|PTO|B||||||59|1|1|160.92|298.00|||57|
11244|C|19|1040.1039.998||PTO|PTO|M||||||59|1|1|160.92|298.00|||57|
11245|C|19|1040.1039.999||CRE|CRE|B||||||59|1|1|160.92|298.00|||57|
11246|C|19|1040.1039.1000||CRE|CRE|M||||||59|1|1|160.92|298.00|||57|
11247|C|19|1040.1039.1001||CAM|CAM|B||||||59|1|1|160.92|298.00|||57|
11248|C|19|1040.1039.1002||CAM|CAM|M||||||59|1|1|160.92|298.00|||57|
11249|C|19|1040.1039.1003||OUR|OUR|B||||||59|1|1|160.92|298.00|||57|
11250|C|19|1040.1039.1004||OUR|OUR|M||||||59|1|1|160.92|298.00|||57|
11251|C|19|1040.1039.1005||COB|COB|B||||||59|1|1|160.92|298.00|||57|
11252|C|19|1040.1039.1006||COB|COB|M||||||59|1|1|160.92|298.00|||57|
11253|C|19|1040.1039.1007||CHO|CHO|B||||||59|1|1|160.92|298.00|||57|
11254|C|19|1040.1039.1008||CHO|CHO|M||||||59|1|1|160.92|298.00|||57|
11255|C|19|1040.1039.1009||VAG|VAG|B||||||59|1|1|160.92|298.00|||57|
11256|C|19|1040.1039.1010||VAG|VAG|M||||||59|1|1|160.92|298.00|||57|
11257|C|19|1040.1039.1011||AZE|AZE|B||||||59|1|1|160.92|298.00|||57|
11258|C|19|1040.1039.1012||AZE|AZE|M||||||59|1|1|160.92|298.00|||57|
11259|C|19|1040.1039.1013||AMA|AMA|B||||||59|1|1|160.92|298.00|||57|
11260|C|19|1040.1039.1014||AMA|AMA|M||||||59|1|1|160.92|298.00|||57|
11261|C|19|1040.1039.1015||AES|AES|B||||||59|1|1|160.92|298.00|||57|
11262|C|19|1040.1039.1016||AES|AES|M||||||59|1|1|160.92|298.00|||57|
11263|C|19|1040.1039.1017||PRA|PRA|B||||||59|1|1|160.92|298.00|||57|
11264|C|19|1040.1039.1018||PRA|PRA|M||||||59|1|1|160.92|298.00|||57|
11265|C|19|1040.1039.1019||ROS|ROS|B||||||59|1|1|160.92|298.00|||57|
11266|C|19|1040.1039.1020||ROS|ROS|M||||||59|1|1|160.92|298.00|||57|
11267|C|19|1040.1039.1021||VER|VER|B||||||59|1|1|160.92|298.00|||57|
11268|C|19|1040.1039.1022||VER|VER|M||||||59|1|1|160.92|298.00|||57|
11269|C|19|1040.1039.1023||AZB|AZB|||||||59|1|1|160.92|298.00|||57|
11270|C|19|1040.1039.1024||DEN|DEN|||||||59|1|1|160.92|298.00|||57|
11271|C|19|1040.1039.1025||BLK|BLK|||||||59|1|1|160.92|298.00|||57|
11272|C|19|1040.1039.1026||ART|ART|||||||59|1|1|160.92|298.00|||57|
11273|C|19|1040.1039.1027||LIN|LIN|||||||59|1|1|160.92|298.00|||57|
11274|C|19|1040.1039.1028||HAL|HAL|||||||59|1|1|160.92|298.00|||57|
11275|AL|1|1042|||||||||30||1|1|23.76|44.00|||58|
11276|AL|2|1043|||||||||30||1|1|||||59|86989703
11277|AL|3|1044|||||||||30||1|1|||||60|84826310
11278|AL|4|1045|||||||||60||1|1|43.20|80.00|||61|
11279|AL|5|1046|||||||||18||1|1|32.40|60.00|||62|
11280|E|12|1047||||||||||47|1|1|99.90|185.00|||63|
11281|E|12|1048||||||||||48|1|1|113.40|210.00|||63|
11282|E|12|1049||||||||||60|1|1|137.70|255.00|||63|
11283|E|13|1050||||||||||61|1|1|64.80|120.00|||64|
11284|E|14|1051||||||||||62|1|1|75.60|140.00|||65|
11285|E|15|1052||||||||||62|1|1|75.60|140.00|||65|
11286|E|16|1053||||||||||43|1|1|48.60|90.00|||66|
11287|E|16|1054||||||||||44|1|1|54.00|100.00|||66|
11288|E|16|1055||||||||||45|1|1|59.40|110.00|||66|
11289|E|17|1056||||||||||43|1|1|99.90|185.00|||67|
11290|E|17|1057||||||||||44|1|1|124.20|230.00|||67|
11291|E|17|1058||||||||||45|1|1|151.20|280.00|||67|
11292|E|17|1059||||||||||63|1|1|175.50|325.00|||67|
11293|E|18|1060||||||||||43|1|1|99.90|185.00|||67|
11294|E|18|1061||||||||||44|1|1|124.20|230.00|||67|
11295|E|18|1062||||||||||45|1|1|151.20|280.00|||67|
11296|E|18|1063||||||||||64|1|1|175.50|325.00|||67|
11297|E|19|1064||||||||||43|1|1|124.20|230.00|||64|
11298|E|19|1065||||||||||65|1|1|137.70|255.00|||64|
11299|E|19|1066||||||||||44|1|1|151.20|280.00|||64|
11300|E|19|1067||||||||||45|1|1|175.50|325.00|||64|
11301|E|20|1068||||||||||66|1|1|48.60|90.00|||68|
11302|E|20|1069||||||||||67|1|1|59.40|110.00|||68|
11303|E|20|1070||||||||||68|1|1|70.20|130.00|||68|
11304|E|20|1071||||||||||69|1|1|81.00|150.00|||68|
11305|E|20|1072||||||||||70|1|1|108.00|200.00|||68|
11306|E|21|1073||||||||||71|1|1|29.16|54.00|||69|
11307|E|21|1074||||||||||72|1|1|35.10|65.00|||69|
11308|E|21|1075||||||||||44|1|1|40.50|75.00|||69|
11309|E|21|1076||||||||||73|1|1|46.44|86.00|||69|
11310|E|21|1077||||||||||74|1|1|35.64|66.00|||69|
11311|E|21|1078||||||||||75|1|1|41.58|77.00|||69|
11312|E|21|1079||||||||||45|1|1|47.52|88.00|||69|
11313|E|21|1080||||||||||76|1|1|53.46|99.00|||69|
11314|E|21|1081||||||||||77|1|1|20.52|38.00|||69|
11315|E|21|1082||||||||||78|1|1|21.06|39.00|||69|
11316|E|21|1083||||||||||46|1|1|24.84|46.00|||69|
11317|E|21|1084||||||||||79|1|1|22.68|42.00|||69|
11318|E|21|1085||||||||||80|1|1|27.00|50.00|||69|
11319|E|21|1086||||||||||62|1|1|29.16|54.00|||69|
11320|E|21|1087||||||||||81|1|1|22.68|42.00|||69|
11321|E|21|1088||||||||||82|1|1|28.62|53.00|||69|
11322|E|21|1089||||||||||43|1|1|34.56|64.00|||69|
11323|E|21|1090||||||||||47|1|1|40.50|75.00|||69|
11324|E|21|1091||||||||||61|1|1|27.00|50.00|||69|
11325|E|21|1092||||||||||83|1|1|31.32|58.00|||69|
11326|E|21|1093||||||||||65|1|1|37.26|69.00|||69|
11327|E|21|1094||||||||||84|1|1|39.42|73.00|||69|
11328|E|22|1095||||||||||73|1|1|91.80|170.00|||70|
11329|E|22|1096||||||||||76|1|1|102.60|190.00|||70|
11330|E|22|1097||||||||||42|1|1|70.20|130.00|||71|
11331|E|22|1098||||||||||47|1|1|81.00|150.00|||70|
11332|E|23|1099||||||||||46|1|1|86.40|160.00|||72|
11333|E|23|1100||||||||||47|1|1|108.00|200.00|||72|
11334|E|24|1101||||||||||47|1|1|135.00|250.00|||73|
11335|E|25|1102||||||||||85|1|1|102.60|190.00|||74|
11336|E|25|1103||||||||||73|1|1|113.40|210.00|||74|
11337|E|25|1104||||||||||76|1|1|135.00|250.00|||74|
11338|E|25|1105||||||||||42|1|1|102.60|190.00|||75|
11339|E|25|1106||||||||||47|1|1|105.30|195.00|||74|
11340|E|26|1107||||||||||73|1|1|135.00|250.00|||76|
11341|E|26|1108||||||||||76|1|1|151.20|280.00|||76|
11342|E|26|1109||||||||||47|1|1|118.80|220.00|||76|
11343|E|27|1110||||||||||47|1|1|108.00|200.00|||77|
11344|E|28|1111||||||||||73|1|1|151.20|280.00|||78|
11345|E|28|1112||||||||||76|1|1|162.00|300.00|||78|
11346|E|28|1113||||||||||47|1|1|118.80|220.00|||78|
11347|E|29|1114||||||||||86|1|1|248.40|460.00|||79|
11348|E|30|1115||||||||||87|1|1|129.60|240.00|||80|
11349|E|30|1116||||||||||88|1|1|151.20|280.00|||81|
11350|E|30|1117||||||||||89|1|1|102.60|190.00|||82|
11351|E|31|1118||||||||||81|4|4||330.00|||83|
11352|E|32|1119||||||||||46|4|4||280.00|||84|
11353|E|32|1120||||||||||62|4|4||310.00|||84|
11354|E|32|1121||||||||||47|4|4||350.00|||84|
11355|E|32|1122||||||||||90|4|4||430.00|||84|
11356|E|33|1123.1124|P|||M||||||91|4|4||460.00|||85|
11357|E|33|1123.1125|B|||M||||||91|4|4||460.00|||85|
11358|E|33|1123.1126|D|||B||||||91|4|4||460.00|||85|
11359|E|33|1127.1124|P|||M||||||46|4|4||495.00|||85|
11360|E|33|1127.1125|B|||M||||||46|4|4||495.00|||85|
11361|E|33|1127.1126|D|||B||||||46|4|4||495.00|||85|
11362|E|33|1128.1124|P|||M||||||62|4|4||550.00|||85|
11363|E|33|1128.1125|B|||M||||||62|4|4||550.00|||85|
11364|E|33|1128.1126|D|||B||||||62|4|4||550.00|||85|
11365|E|33|1129.1124|P|||M||||||47|4|4||595.00|||85|
11366|E|33|1129.1125|B|||M||||||47|4|4||595.00|||85|
11367|E|33|1129.1126|D|||B||||||47|4|4||595.00|||85|
11368|E|34|1130||||||||||46|4|4||270.00|||86|
11369|E|34|1131||||||||||62|4|4||285.00|||86|
11370|E|34|1132||||||||||47|4|4||300.00|||86|
11371|E|35|1133||||||||||46|4|4||340.00|||87|
11372|E|35|1134||||||||||62|4|4||380.00|||87|
11373|E|35|1135||||||||||47|4|4||410.00|||87|
11374|E|36|1136||||||||||71|4|4||390.00|||88|
11375|E|36|1137||||||||||74|4|4||470.00|||88|
11376|E|36|1138||||||||||81|4|4||370.00|||88|
11377|E|37|1139||||||||||73|4|4||330.00|||89|
11378|E|37|1140||||||||||76|4|4||385.00|||89|
11379|E|37|1141||||||||||92|4|4||300.00|||89|
11380|E|37|1142||||||||||47|4|4||310.00|||89|
11381|E|38|1143||||||||||73|4|4||350.00|||90|
11382|E|38|1144||||||||||76|4|4||385.00|||90|
11383|E|38|1145||||||||||92|4|4||310.00|||90|
11384|E|38|1146||||||||||47|4|4||330.00|||90|
11385|E|39|1147||||||||||73|4|4||285.00|||91|
11386|E|39|1148||||||||||76|4|4||315.00|||91|
11387|E|39|1149||||||||||92|4|4||240.00|||91|
11388|E|39|1150||||||||||47|4|4||270.00|||91|
11389|E|40|1151||||||||||72|4|4||350.00|||92|
11390|E|40|1152||||||||||78|4|4||310.00|||92|
11391|E|40|1153||||||||||93|4|4||330.00|||92|
11392|E|41|1154||||||||||44|4|4||310.00|||93|
11393|E|41|1155||||||||||45|4|4||320.00|||93|
11394|E|41|1156||||||||||64|4|4||330.00|||93|
11395|E|41|1157||||||||||43|4|4||280.00|||93|
11396|E|42|1158||||||||||87|4|4||390.00|||94|
11397|E|42|1159||||||||||88|4|4||450.00|||94|
11398|E|42|1160||||||||||94|4|4||370.00|||94|
$linhas$, '\r?\n') AS s WHERE s <> '') x;
  IF EXISTS (SELECT 1 FROM _mv_linhas l WHERE l.sub IS NULL OR l.fornecedor IS NULL) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há linhas de dados com campos a menos.';
  END IF;
  ANALYZE _mv_linhas;
  -- o nome (sem PVP: « (sem preço)» no fim) e a medida
  UPDATE _mv_linhas l
  SET nome = (SELECT string_agg(d.texto, ' - ' ORDER BY u.o) FROM unnest(l.partes) WITH ORDINALITY AS u(n, o) JOIN _mv_nomes d ON d.n = u.n)
             || (CASE WHEN l.pvp IS NULL THEN ' (sem preço)' ELSE '' END);
  UPDATE _mv_linhas l SET med_tipo = d.tipo, med_l = d.l, med_a = d.a, med_p = d.p FROM _mv_medidas d WHERE d.n = l.medida;
  IF EXISTS (SELECT 1 FROM _mv_linhas l
             WHERE l.nome IS NULL OR (l.medida IS NOT NULL AND l.med_tipo IS NULL)
                OR cardinality(l.partes) <> (SELECT count(*) FROM unnest(l.partes) u JOIN _mv_nomes d ON d.n = u)) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há linhas cujo nome ou medida não se reconstrói.';
  END IF;
  IF (SELECT count(*) FROM _mv_nomes) <> 1160 OR (SELECT count(*) FROM _mv_medidas) <> 94 THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: os dicionários de nomes ou medidas gerados não batem.';
  END IF;

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome) INTO v_n, v_m FROM _mv_linhas l;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: os dados gerados têm % linhas (% nomes) em vez de %.', v_n, v_m, c_total;
  END IF;
  IF (SELECT count(l.custo) FROM _mv_linhas l) <> c_n_custo OR (SELECT count(l.pvp) FROM _mv_linhas l) <> c_n_pvp
     OR (SELECT count(l.grossista) FROM _mv_linhas l) <> c_n_gross OR (SELECT count(l.distribuidor) FROM _mv_linhas l) <> c_n_dist
     OR (SELECT count(l.cod_forn) FROM _mv_linhas l) <> c_n_cod OR (SELECT count(*) FROM _mv_opcoes) <> c_n_opcoes
     OR (SELECT count(*) FROM _mv_descs) <> c_n_descs THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: as contagens de preços, códigos, opções ou descrições geradas não batem.';
  END IF;
  IF EXISTS (SELECT 1 FROM _mv_linhas l
             WHERE NOT EXISTS (SELECT 1 FROM _mv_modelos m WHERE m.sub = l.sub AND m.numero = l.modelo)
                OR EXISTS (SELECT 1 FROM (VALUES ('cor', l.cor), ('cor_corpo', l.corpo), ('cor_frente', l.frente), ('tonalidade', l.ton),
                                                 ('veta', l.veta), ('puxador', l.pux), ('posicao_puxador', l.pos), ('lado', l.lado),
                                                 ('largura', l.larg)) AS v(papel, codigo)
                           WHERE v.codigo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _mv_opcoes o WHERE o.papel = v.papel AND o.codigo = v.codigo))
                OR (l.med_tipo IS NOT NULL AND (l.med_tipo NOT IN ('2D', '3D') OR l.med_l IS NULL OR l.med_a IS NULL
                                                OR (l.med_tipo = '3D') <> (l.med_p IS NOT NULL)))
                OR (l.med_tipo IS NOT NULL AND l.larg IS NOT NULL)
                OR (l.descricao IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _mv_descs d WHERE d.n = l.descricao))
                OR NOT EXISTS (SELECT 1 FROM _mv_forn f WHERE f.n = l.fornecedor)
                OR NOT EXISTS (SELECT 1 FROM _mv_marcas b WHERE b.n = l.marca)
                OR l.custo <= 0 OR l.pvp <= 0 OR l.grossista <= 0 OR l.distribuidor <= 0
                OR (l.pvp IS NULL AND l.nome NOT LIKE '% (sem preço)') OR (l.pvp IS NOT NULL AND l.nome LIKE '% (sem preço)')) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há linhas com modelo, opção, medida, descrição, marca, fornecedor, preço ou nome fora do esperado.';
  END IF;
  IF (SELECT sum(m.esperados) FROM _mv_modelos m) <> c_total OR (SELECT sum(s.esperados) FROM _mv_subs s) <> c_total
     OR (SELECT count(*) FROM _mv_modelos) <> c_n_modelos
     OR EXISTS (SELECT 1 FROM _mv_modelos m GROUP BY m.sub, public.fn_cat_chave_opcao(m.nome) HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM _mv_modelos m WHERE m.esperados <> (SELECT count(*) FROM _mv_linhas l WHERE l.sub = m.sub AND l.modelo = m.numero)) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: os modelos gerados não batem (contagens, ou nomes de modelo repetidos na subcategoria).';
  END IF;
  -- produto = modelo + atributos: nenhuma combinação repetida (senão o SKU repetia)
  SELECT string_agg(x.k, '; ') INTO v_txt FROM (
    SELECT l.sub || lpad(l.modelo::text, 4, '0') || ' ' || concat_ws('/', l.cor, l.corpo, l.frente, l.ton, l.veta, l.pux, l.pos, l.lado, l.larg,
                                                                      l.med_tipo, l.med_l, l.med_a, l.med_p) AS k
    FROM _mv_linhas l
    GROUP BY l.sub, l.modelo, l.cor, l.corpo, l.frente, l.ton, l.veta, l.pux, l.pos, l.lado, l.larg, l.med_tipo, l.med_l, l.med_a, l.med_p
    HAVING count(*) > 1 LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: combinações repetidas (mesmo modelo e atributos): %', v_txt; END IF;

  -- as subcategorias
  FOR r IN SELECT s.codigo, s.nome FROM _mv_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1],
           (array_agg(c.sigla ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_id, v_ativa, v_txt
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 THEN
      RAISE NOTICE 'moveis_wc_mudelar: a Mudelar não tem a subcategoria «%» › «%» — nada a fazer.', c_cat_nome, r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'moveis_wc_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'moveis_wc_mudelar: a subcategoria «%» está desativada.', r.nome; END IF;
    UPDATE _mv_subs s SET sub_id = v_id, sigla_antes = v_txt WHERE s.codigo = r.codigo;
  END LOOP;
  -- produtos nas subcategorias (vivos ou apagados: um apagado guarda o SKU) → inerte
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _mv_subs s);
  IF v_n > 0 THEN
    RAISE NOTICE 'moveis_wc_mudelar: as subcategorias de «%» já têm % produtos — nada a fazer.', c_cat_nome, v_n;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _mv_linhas l);
  IF v_n > 0 THEN
    RAISE NOTICE 'moveis_wc_mudelar: a Mudelar já tem % produtos vivos com nomes do Excel — nada a fazer.', v_n;
    RETURN;
  END IF;
  SELECT string_agg(s.codigo || ': ' || pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _mv_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _mv_modelos m
                WHERE m.sub = s.codigo
                  AND (pm.numero = m.numero OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)))
                  AND NOT (pm.numero = m.numero AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'moveis_wc_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do Excel (%) — nada a fazer.', left(v_txt, 1500);
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  IF v_cat_sigla IS DISTINCT FROM c_cat_sigla THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: a sigla de «%» é % (esperada %).', c_cat_nome, coalesce(v_cat_sigla, 'nenhuma'), c_cat_sigla;
  END IF;
  IF NOT v_cat_ativa THEN RAISE EXCEPTION 'moveis_wc_mudelar: «%» está desativada.', c_cat_nome; END IF;
  SELECT string_agg(c.name || ' (' || c.sigla || ')', ', ') INTO v_txt
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND c.sigla IN (SELECT s.codigo FROM _mv_subs s) AND c.id NOT IN (SELECT s.sub_id FROM _mv_subs s);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: outras subcategorias de «%» já têm as siglas: %.', c_cat_nome, v_txt; END IF;
  IF EXISTS (SELECT 1 FROM _mv_subs a JOIN _mv_subs b ON a.codigo = b.sigla_antes AND a.codigo <> b.codigo) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: uma sigla nova de subcategoria é a antiga de outra (trocar em dois passos).';
  END IF;

  -- quem fica em created_by: o membro ativo mais antigo da Mudelar (como 20270118400000)
  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  FOR r IN SELECT b.n, b.nome FROM _mv_marcas b ORDER BY b.n LOOP
    SELECT count(*), (array_agg(x.id ORDER BY x.created_at, x.id))[1], (array_agg(coalesce(x.is_active, true) ORDER BY x.created_at, x.id))[1]
      INTO v_n, v_id, v_ativa
    FROM brands x WHERE x.organization_id = c_org AND x.deleted_at IS NULL AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n <> 1 THEN RAISE EXCEPTION 'moveis_wc_mudelar: a Mudelar tem % marcas «%» (tem de ter uma).', v_n, r.nome; END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'moveis_wc_mudelar: a marca «%» está desativada.', r.nome; END IF;
    UPDATE _mv_marcas b SET id = v_id WHERE b.n = r.n;
  END LOOP;

  -- atributos base (pelo código): cor, tonalidade e largura de lista; medida em cm
  SELECT string_agg(x.c || '=' || coalesce(y.n, 0), ', ') INTO v_txt
  FROM unnest(ARRAY['cor', 'tonalidade', 'largura', 'medida']) AS x(c)
  LEFT JOIN (SELECT a.code::text AS c, count(*) AS n FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL
             GROUP BY a.code) y ON y.c = x.c
  WHERE coalesce(y.n, 0) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: a Mudelar tem de ter um atributo de cada (%).', v_txt; END IF;
  SELECT a.id, a.unit::text INTO v_a_med, v_med_unit FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'medida' AND a.is_measurement AND coalesce(a.sku_entra, false);
  IF v_a_med IS NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: a Medida da Mudelar não é medida ou não entra no SKU.'; END IF;
  IF coalesce(lower(v_med_unit), 'cm') <> 'cm' THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: a Medida da Mudelar está em «%»; as medidas do Excel são em cm.', v_med_unit;
  END IF;

  -- amostra de SKUs de outras categorias, para conferir que ficam iguais
  CREATE TEMP TABLE _mv_amostra ON COMMIT DROP AS
  SELECT x.id, x.sku FROM (
    SELECT p.id, p.sku, row_number() OVER (PARTITION BY p.subcategory_id ORDER BY p.sku, p.id) AS n
    FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted) x
  WHERE x.n <= 3;

  -- ─── Locks (as chaves das funções de gestão do Catálogo) ─────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_guardar_atributo:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _mv_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || c_org::text || ':' || v_cat::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. A ordem do SKU de hoje (para provar no fim que nenhum atributo existente mudou de posição relativa) ──
  SELECT array_agg(a.id ORDER BY a.sku_ordem NULLS LAST, coalesce(a.sort_order, 0), a.label, a.id) INTO v_ordem_antes
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;

  -- ─── 2. Os atributos de lista: os 6 deste ficheiro (criados se faltarem) + cor, tonalidade e largura ─────────
  FOR r IN SELECT n.papel, n.rotulo, n.hex FROM _mv_novos n ORDER BY n.ordem LOOP
    SELECT count(*), (array_agg(a.id))[1] INTO v_n, v_id FROM product_attributes a
    WHERE a.organization_id = c_org AND a.deleted_at IS NULL
      AND (a.code::text = r.papel OR public.fn_cat_chave_opcao(a.label::text) = public.fn_cat_chave_opcao(r.rotulo));
    IF v_n > 1 THEN RAISE EXCEPTION 'moveis_wc_mudelar: a Mudelar tem % atributos «%» (pelo código ou pelo nome).', v_n, r.rotulo; END IF;
    IF v_n = 0 THEN
      SELECT count(*), coalesce(max(pa.sort_order), 0) + 1 INTO v_n, v_ordem FROM product_attributes pa
      WHERE pa.organization_id = c_org AND pa.deleted_at IS NULL;
      IF v_n >= c_max_atributos THEN RAISE EXCEPTION 'moveis_wc_mudelar: a Mudelar já tem o máximo de atributos (%).', c_max_atributos; END IF;
      -- um código apagado não se reutiliza (product_attributes_organization_id_code_key): leva _2, _3…
      v_code := r.papel; v_i := 1;
      WHILE EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.organization_id = c_org AND pa.code = v_code) LOOP
        v_i := v_i + 1;
        v_code := r.papel || '_' || v_i::text;
      END LOOP;
      -- como cat_guardar_atributo: lista, grupo de opções da organização, entra no SKU (a posição acerta-se no passo 3)
      INSERT INTO product_attributes (organization_id, code, label, type, value_type, has_hex_color, is_measurement,
                                      measurement_type, unit, pricing_type, valorization_type, is_variant_option,
                                      is_variant_attribute, sort_order, created_by, sku_entra)
      VALUES (c_org, v_code, r.rotulo, 'select'::public.attribute_type, 'list', r.hex, false, NULL, NULL, 'none', 'none', false, false,
              v_ordem, v_criador, true)
      RETURNING id INTO v_id;
      INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
      VALUES (v_id, c_org, left(r.rotulo, 100), v_ordem, true, v_criador);
      UPDATE _mv_novos n SET attr_id = v_id, criado = true WHERE n.papel = r.papel;
      v_attr_criados := v_attr_criados || r.rotulo || ' (' || v_code || '); ';
    ELSE
      UPDATE _mv_novos n SET attr_id = v_id WHERE n.papel = r.papel;
    END IF;
  END LOOP;

  CREATE TEMP TABLE _mv_attr (papel text PRIMARY KEY, id uuid NOT NULL UNIQUE, grupo uuid, medida boolean NOT NULL,
                              sku_ordem integer, ordem integer NOT NULL, nome text NOT NULL, entra boolean NOT NULL) ON COMMIT DROP;
  INSERT INTO _mv_attr (papel, id, grupo, medida, sku_ordem, ordem, nome, entra)
  SELECT x.papel, a.id, (CASE WHEN NOT a.is_measurement THEN public.fn_cat_grupo_do_atributo(a.id, c_org) END), a.is_measurement,
         a.sku_ordem, coalesce(a.sort_order, 0), a.label::text, coalesce(a.sku_entra, false)
  FROM (SELECT n.papel, n.attr_id AS id FROM _mv_novos n
        UNION ALL
        SELECT a2.code::text, a2.id FROM product_attributes a2
        WHERE a2.organization_id = c_org AND a2.deleted_at IS NULL AND a2.code::text IN ('cor', 'tonalidade', 'largura', 'medida')) x
  JOIN product_attributes a ON a.id = x.id;
  IF (SELECT count(*) FROM _mv_attr) <> 10 THEN RAISE EXCEPTION 'moveis_wc_mudelar: os 10 atributos não são distintos.'; END IF;
  SELECT string_agg(t.nome, ', ') INTO v_txt FROM _mv_attr t
  WHERE NOT t.entra OR (t.papel = 'medida') <> t.medida
     OR (NOT t.medida AND NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = t.grupo AND g.organization_id = c_org));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: atributos que não entram no SKU, de outro tipo ou sem grupo de opções da Mudelar: %.', v_txt;
  END IF;
  IF (SELECT count(DISTINCT t.grupo) FROM _mv_attr t WHERE NOT t.medida) <> 9 THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: os atributos de lista partilham grupos de opções.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || t.grupo::text, 0))
  FROM (SELECT t2.grupo FROM _mv_attr t2 WHERE t2.grupo IS NOT NULL ORDER BY t2.grupo) t;

  -- ─── 3. Ordem do SKU: os criados agora entram junto da âncora (Cor do corpo e Cor da frente logo a seguir à Cor; Veta,
  --        Puxador, Posição do puxador e Lado logo antes da Medida); os existentes mantêm a ordem relativa ─────
  IF EXISTS (SELECT 1 FROM _mv_novos n WHERE n.criado) THEN
    UPDATE product_attributes pa SET sku_ordem = x.n
    FROM (SELECT a.id,
                 row_number() OVER (ORDER BY (CASE WHEN nv.criado THEN coalesce(anc.sku_ordem, 1000000) ELSE coalesce(a.sku_ordem, 1000000) END),
                                             (CASE WHEN nv.criado THEN nv.desvio ELSE 0 END),
                                             coalesce(a.sort_order, 0), a.label, a.id)::integer AS n
          FROM product_attributes a
          LEFT JOIN _mv_novos nv ON nv.attr_id = a.id AND nv.criado
          LEFT JOIN product_attributes anc ON nv.criado AND anc.organization_id = c_org AND anc.deleted_at IS NULL AND anc.code::text = nv.ancora
          WHERE a.organization_id = c_org AND a.deleted_at IS NULL) x
    WHERE pa.id = x.id AND pa.sku_ordem IS DISTINCT FROM x.n;
  END IF;
  SELECT array_agg(a.id ORDER BY a.sku_ordem NULLS LAST, coalesce(a.sort_order, 0), a.label, a.id) INTO v_ordem_depois
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.id = ANY (v_ordem_antes);
  IF v_ordem_depois IS DISTINCT FROM v_ordem_antes THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: a ordem do SKU dos atributos que já existiam mudou (os SKUs existentes mudavam).';
  END IF;
  IF EXISTS (SELECT 1 FROM product_attribute_values v JOIN _mv_novos n ON n.attr_id = v.attribute_id WHERE n.criado) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: um atributo acabado de criar já tem valores.';
  END IF;
  UPDATE _mv_attr t SET sku_ordem = a.sku_ordem FROM product_attributes a WHERE a.id = t.id;

  -- ─── 4. As opções (procuradas pelo nome sem acentos/maiúsculas; as novas com a sigla do gerador, nunca uma ocupada) ─
  UPDATE _mv_opcoes o SET grupo = t.grupo FROM _mv_attr t WHERE t.papel = o.papel;
  UPDATE _mv_opcoes o SET opcao_id = v.id
  FROM attribute_option_group_values v
  WHERE v.group_id = o.grupo AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(o.nome);
  SELECT string_agg(o.papel || ' ' || o.nome, ', ') INTO v_txt FROM _mv_opcoes o
  WHERE o.grupo IS NULL
     OR (SELECT count(*) FROM attribute_option_group_values v
         WHERE v.group_id = o.grupo AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(o.nome)) > 1
     OR (o.opcao_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.id = o.opcao_id AND v.is_active AND v.sigla IS NOT NULL));
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: opções ambíguas, desativadas ou sem sigla: %.', v_txt; END IF;
  SELECT string_agg(o.papel || ' ' || o.nome || ': a sigla ' || o.codigo || ' já é de «' || v.value_text || '»', '; ') INTO v_txt
  FROM _mv_opcoes o JOIN attribute_option_group_values v ON v.group_id = o.grupo AND v.sigla = o.codigo
  WHERE o.opcao_id IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: siglas ocupadas por outras opções: %', v_txt; END IF;
  INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
  SELECT o.grupo, o.nome, o.nome,
         (CASE WHEN o.papel IN ('cor_corpo', 'cor_frente') THEN
            (SELECT c.hex_color FROM attribute_option_group_values c
             WHERE c.group_id = (SELECT t.grupo FROM _mv_attr t WHERE t.papel = 'cor') AND c.hex_color IS NOT NULL
               AND public.fn_cat_chave_opcao(c.value_text::text) = public.fn_cat_chave_opcao(o.nome)
             ORDER BY c.sort_order, c.id LIMIT 1) END),
         coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = o.grupo), 0) + o.ordem, true, o.codigo
  FROM _mv_opcoes o WHERE o.opcao_id IS NULL ORDER BY o.papel, o.ordem;
  UPDATE _mv_opcoes o SET opcao_id = v.id, criada = true
  FROM attribute_option_group_values v
  WHERE o.opcao_id IS NULL AND v.group_id = o.grupo AND v.value_text::text = o.nome;
  UPDATE _mv_opcoes o SET valor = v.value_text::text, sigla = v.sigla FROM attribute_option_group_values v WHERE v.id = o.opcao_id;
  IF EXISTS (SELECT 1 FROM _mv_opcoes o WHERE o.opcao_id IS NULL OR o.valor IS NULL OR o.sigla IS NULL) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há opções que não ficaram criadas.';
  END IF;
  SELECT coalesce(string_agg(o.papel || ':' || o.nome || '=' || o.sigla, ', ' ORDER BY o.papel, o.ordem), '') INTO v_opc_criadas
  FROM _mv_opcoes o WHERE o.criada;

  -- ─── 5. Siglas das 5 subcategorias (numa só instrução) ───────────────────────
  UPDATE product_categories c SET sigla = s.codigo FROM _mv_subs s WHERE c.id = s.sub_id AND c.sigla IS DISTINCT FROM s.codigo;

  -- ─── 6. Os modelos ────────────────────────────────────────────────────────────
  UPDATE _mv_modelos m SET modelo_id = pm.id
  FROM product_models pm JOIN _mv_subs s ON s.sub_id = pm.subcategory_id
  WHERE s.codigo = m.sub AND pm.organization_id = c_org AND pm.numero = m.numero AND pm.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome);
  IF EXISTS (SELECT 1 FROM _mv_modelos m JOIN product_models pm ON pm.id = m.modelo_id WHERE NOT pm.is_active) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há modelos destes já existentes e desativados.';
  END IF;
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  SELECT count(*) INTO v_k FROM _mv_modelos m WHERE m.modelo_id IS NULL;
  IF v_n + v_k > c_max_modelos_ativos OR v_m + v_k > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos, % novos).', v_n, v_m, v_k;
  END IF;
  INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
  SELECT c_org, s.sub_id, m.nome, m.numero, true, v_criador
  FROM _mv_modelos m JOIN _mv_subs s ON s.codigo = m.sub WHERE m.modelo_id IS NULL ORDER BY s.ordem, m.numero;
  UPDATE _mv_modelos m SET modelo_id = pm.id
  FROM product_models pm JOIN _mv_subs s ON s.sub_id = pm.subcategory_id
  WHERE m.modelo_id IS NULL AND s.codigo = m.sub AND pm.organization_id = c_org AND pm.numero = m.numero
    AND pm.deleted_at IS NULL AND pm.name = m.nome;
  IF EXISTS (SELECT 1 FROM _mv_modelos m WHERE m.modelo_id IS NULL) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há modelos que não ficaram gravados.';
  END IF;

  -- ─── 7. Unidade «un» e fornecedores (criados se faltarem) ────────────────────
  v_uom := public.fn_cat_unidade(c_org, c_unidade);
  IF v_uom IS NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: sem unidade «%».', c_unidade; END IF;
  FOR r IN SELECT f.n, f.nome FROM _mv_forn f ORDER BY f.n LOOP
    SELECT count(*), (array_agg(s.id ORDER BY s.created_at, s.id))[1], (array_agg(coalesce(s.is_active, true) ORDER BY s.created_at, s.id))[1]
      INTO v_n, v_sup, v_ativa
    FROM suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'moveis_wc_mudelar: a Mudelar tem % fornecedores «%».', v_n, r.nome; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'moveis_wc_mudelar: o fornecedor «%» da Mudelar está desativado.', r.nome; END IF;
    IF v_n = 0 THEN
      INSERT INTO suppliers (organization_id, name, is_active, created_by)
      VALUES (c_org, public.fn_cat_limpar_nome(r.nome), true, v_criador)
      RETURNING id INTO v_sup;
      UPDATE _mv_forn f SET id = v_sup, criado = true WHERE f.n = r.n;
      v_forn_criados := v_forn_criados || r.nome || '; ';
    ELSE
      UPDATE _mv_forn f SET id = v_sup WHERE f.n = r.n;
    END IF;
  END LOOP;

  -- ─── 8. As linhas a gravar e os valores de atributos, com o SKU final (a regra de fn_cat_sku_partes, set-based) ──
  CREATE TEMP TABLE _mv ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, l.linha, l.sub, s.sub_id, l.modelo, m.modelo_id, l.nome, l.custo, l.pvp, l.grossista, l.distribuidor,
         l.cod_forn, d.texto AS descricao, b.id AS marca_id, b.nome AS marca, f.id AS forn_id, f.nome AS fornecedor,
         (CASE WHEN l.med_tipo IS NOT NULL THEN
            jsonb_build_object('tipo', l.med_tipo,
                               'largura', public.fn_cat_dimensao_medida(to_jsonb(l.med_l), 'A largura'),
                               'comprimento', public.fn_cat_dimensao_medida(to_jsonb(l.med_a), 'O comprimento'),
                               'espessura', (CASE WHEN l.med_tipo = '3D' THEN public.fn_cat_dimensao_medida(to_jsonb(l.med_p), 'A espessura') END),
                               'unidade', 'cm') END) AS med_json,
         NULL::text AS med_texto, NULL::text AS med_seg, NULL::text AS sku
  FROM _mv_linhas l
  JOIN _mv_subs s ON s.codigo = l.sub
  JOIN _mv_modelos m ON m.sub = l.sub AND m.numero = l.modelo
  JOIN _mv_marcas b ON b.n = l.marca
  JOIN _mv_forn f ON f.n = l.fornecedor
  LEFT JOIN _mv_descs d ON d.n = l.descricao;
  ALTER TABLE _mv ADD PRIMARY KEY (id);
  UPDATE _mv b SET med_texto = public.fn_cat_dimensao_texto(b.med_json -> 'largura') || ' × ' || public.fn_cat_dimensao_texto(b.med_json -> 'comprimento')
                               || (CASE WHEN b.med_json ->> 'tipo' = '3D' THEN ' × ' || public.fn_cat_dimensao_texto(b.med_json -> 'espessura') ELSE '' END)
                               || ' cm',
                   med_seg = public.fn_cat_sku_medida(b.med_json)
  WHERE b.med_json IS NOT NULL;
  SELECT count(*) INTO v_n FROM _mv;
  IF v_n <> c_total THEN RAISE EXCEPTION 'moveis_wc_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;
  IF EXISTS (SELECT 1 FROM _mv b WHERE b.modelo_id IS NULL OR b.marca_id IS NULL OR b.forn_id IS NULL OR b.sub_id IS NULL
             OR (b.med_json IS NOT NULL AND (b.med_seg IS NULL OR b.med_texto IS NULL OR public.fn_cat_medida_ler(b.med_json, 'cm') IS NULL))) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: há linhas sem modelo, marca, fornecedor ou com medida inválida.';
  END IF;

  -- um valor por atributo que o nome indica: (produto, atributo, texto, json, unidade, segmento do SKU)
  CREATE TEMP TABLE _mv_vals ON COMMIT DROP AS
  SELECT b.id AS product_id, t.id AS attribute_id, t.papel, o.valor AS value_text, NULL::jsonb AS value_json, NULL::text AS unit, o.sigla AS seg
  FROM _mv b JOIN _mv_linhas l ON l.linha = b.linha
  CROSS JOIN LATERAL (VALUES ('cor', l.cor), ('cor_corpo', l.corpo), ('cor_frente', l.frente), ('tonalidade', l.ton), ('veta', l.veta),
                             ('puxador', l.pux), ('posicao_puxador', l.pos), ('lado', l.lado), ('largura', l.larg)) AS x(papel, codigo)
  JOIN _mv_opcoes o ON o.papel = x.papel AND o.codigo = x.codigo
  JOIN _mv_attr t ON t.papel = x.papel
  WHERE x.codigo IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_med, 'medida', b.med_texto, b.med_json, 'cm', b.med_seg FROM _mv b WHERE b.med_json IS NOT NULL;
  ANALYZE _mv; ANALYZE _mv_vals;
  SELECT count(*) INTO v_n FROM _mv_vals;
  IF v_n <> c_n_valores THEN RAISE EXCEPTION 'moveis_wc_mudelar: % valores de atributos a gravar em vez de %.', v_n, c_n_valores; END IF;

  -- CAT-SUB-NNNN-<um segmento por atributo que entra e que o produto tem, por sku_ordem NULLS LAST, sort_order, nome, id>
  UPDATE _mv b SET sku = concat_ws('-', c_cat_sigla, b.sub, lpad(b.modelo::text, 4, '0'), x.resto)
  FROM (SELECT v.product_id, string_agg(v.seg, '-' ORDER BY t.sku_ordem NULLS LAST, t.ordem, t.nome, t.id) AS resto
        FROM _mv_vals v JOIN _mv_attr t ON t.id = v.attribute_id WHERE t.entra GROUP BY v.product_id) x
  WHERE x.product_id = b.id;
  UPDATE _mv b SET sku = concat_ws('-', c_cat_sigla, b.sub, lpad(b.modelo::text, 4, '0')) WHERE b.sku IS NULL;

  -- SKU repetido entre as linhas: para e diz quais
  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _mv b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: SKUs repetidos: %', v_txt; END IF;
  -- já usado por outro produto da Mudelar (vivo ou apagado: products_sku_organization_id_key cobre os dois)
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _mv b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'moveis_wc_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.codigo, '|' ORDER BY s.ordem) FROM _mv_subs s) || ')-[0-9]{4}(-[A-Z0-9]+){0,8}$';
  IF EXISTS (SELECT 1 FROM _mv b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'moveis_wc_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _mv b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;

  -- ─── 9. Gravar (auditoria por linha desligada: fica uma linha consolidada no fim) ───────────────
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- como cat_guardar_produto: vendável (produto), comprável, sem variantes, gere stock, estado active (o do Excel); o
  -- gatilho trg_cat_produto_tabelas preenche marca_livre, unidade e catalogo_categoria_id a partir dos ids
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado, short_description)
  SELECT b.id, c_org, b.sku, b.nome, 'active'::product_status, true, true, true, false, false,
         true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, b.marca_id, v_uom,
         b.forn_id, public.fn_cat_limpar_nome(b.fornecedor), true, b.descricao
  FROM _mv b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _mv b ORDER BY b.linha;

  -- custo (preco_exato a 6 casas, price a 2), PVP, grossista e distribuidor — só os que o Excel tem (> 0)
  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 6), v_agora, v_criador, 'purchase'::price_type, c_iva
  FROM _mv b WHERE b.custo IS NOT NULL
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva
  FROM _mv b WHERE b.pvp IS NOT NULL
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.grossista, 2), NULL::numeric, v_agora + interval '2 microseconds', v_criador, 'wholesale'::price_type, c_iva
  FROM _mv b WHERE b.grossista IS NOT NULL
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.distribuidor, 2), NULL::numeric, v_agora + interval '3 microseconds', v_criador, 'distributor'::price_type, c_iva
  FROM _mv b WHERE b.distribuidor IS NOT NULL;

  -- como cat_guardar_produto_atributos: opção = value_text da opção; medida = value_json em cm e o texto «a × b [× c] cm»
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit FROM _mv_vals v;

  -- como cat_ligar_fornecedor_produto: preferido; supplier_sku = código do fornecedor, ou o SKU se não vier; preço = custo
  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, b.forn_id, NULL, coalesce(b.cod_forn, b.sku), round(b.custo, 2), 'EUR', true, true, v_criador,
         (CASE WHEN b.custo IS NOT NULL THEN current_date END)
  FROM _mv b ORDER BY b.linha;

  PERFORM set_config('app.audit_bypass', 'off', true);
  PERFORM public.fn_manual_audit_log('products', v_cat, c_org, 'INSERT',
    jsonb_build_object('importacao', 'moveis_wc_mudelar', 'produtos', c_total, 'modelos', c_n_modelos, 'categoria', v_cat,
                       'fornecedores_criados', v_forn_criados, 'atributos_criados', v_attr_criados, 'opcoes_criadas', v_opc_criadas,
                       'unidade', v_uom, 'sem_custo', c_total - c_n_custo, 'sem_pvp', c_total - c_n_pvp),
    c_fonte, v_cat);
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_org AND e.source = c_fonte
                 AND e.table_name = 'products' AND e.created_at >= now()) THEN
    RAISE WARNING 'moveis_wc_mudelar: a linha consolidada da auditoria não ficou gravada (fn_manual_audit_log engole o erro).';
  END IF;

  -- ─── 10. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ──────────
  -- quantos: por subcategoria, por modelo, e os modelos
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _mv_subs s) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(s.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || s.esperados, '; ') INTO v_txt
  FROM _mv_subs s
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = s.sub_id
  WHERE coalesce(x.n, 0) <> s.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por subcategoria errada: %', v_txt; END IF;
  SELECT count(*), string_agg(m.sub || lpad(m.numero::text, 4, '0') || ' ' || coalesce(x.n, 0) || ' em vez de ' || m.esperados, '; ') INTO v_n, v_txt
  FROM _mv_modelos m
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = m.modelo_id
  WHERE coalesce(x.n, 0) <> m.esperados;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: contagem por modelo errada em %: %', v_n, left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM _mv_modelos m JOIN _mv_subs s ON s.codigo = m.sub LEFT JOIN product_models pm ON pm.id = m.modelo_id
  WHERE NOT coalesce(pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
                     AND pm.numero = m.numero AND pm.name = m.nome, false);
  SELECT count(*) INTO v_m FROM product_models pm
  WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _mv_subs s);
  IF v_n > 0 OR v_m <> c_n_modelos THEN
    RAISE EXCEPTION 'Conferir: % modelos errados; % nas subcategorias em vez de %.', v_n, v_m, c_n_modelos;
  END IF;

  -- cada produto tal como a sua linha (LEFT JOIN + NOT coalesce(…, false): o que falta também conta como errado)
  SELECT count(*), string_agg(b.linha::text, ', ') INTO v_n, v_txt
  FROM _mv b
  LEFT JOIN products p ON p.id = b.id
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN product_prices pg ON pg.product_id = b.id AND pg.price_type = 'wholesale'
  LEFT JOIN product_prices pd ON pd.product_id = b.id AND pd.price_type = 'distributor'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(
        p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id = b.marca_id AND p.marca_livre = b.marca
        AND p.uom_id = v_uom AND p.unidade = c_unidade AND p.status = 'active'::product_status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND NOT p.is_deleted AND p.supplier_id = b.forn_id
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(b.fornecedor)
        AND p.short_description IS NOT DISTINCT FROM b.descricao
        AND pc.price IS NOT DISTINCT FROM round(b.custo, 2) AND pc.preco_exato IS NOT DISTINCT FROM round(b.custo, 6)
        AND (pc.product_id IS NULL OR pc.vat_rate = c_iva)
        AND pv.price IS NOT DISTINCT FROM round(b.pvp, 2) AND (pv.product_id IS NULL OR pv.vat_rate = c_iva)
        AND pg.price IS NOT DISTINCT FROM round(b.grossista, 2) AND pd.price IS NOT DISTINCT FROM round(b.distribuidor, 2)
        AND i.supplier_id = b.forn_id AND i.is_preferred AND i.is_active AND i.organization_id = c_org
        AND i.purchase_price IS NOT DISTINCT FROM round(b.custo, 2) AND i.supplier_sku = coalesce(b.cod_forn, p.sku)
        AND i.preco_data IS NOT DISTINCT FROM (CASE WHEN b.custo IS NOT NULL THEN current_date END),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do Excel (linhas %).', v_n, left(v_txt, 1000); END IF;
  -- os valores de atributos: exatamente os previstos (nem a mais, nem a menos, nem diferentes)
  SELECT count(*) INTO v_n FROM (
    (SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit FROM _mv_vals v
     EXCEPT
     SELECT x.product_id, x.attribute_id, x.value_text, x.value_json, x.unit FROM product_attribute_values x JOIN _mv b ON b.id = x.product_id)
    UNION ALL
    (SELECT x.product_id, x.attribute_id, x.value_text, x.value_json, x.unit FROM product_attribute_values x JOIN _mv b ON b.id = x.product_id
     EXCEPT
     SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit FROM _mv_vals v)) d;
  SELECT count(*) INTO v_m FROM product_attribute_values x JOIN _mv b ON b.id = x.product_id;
  IF v_n > 0 OR v_m <> c_n_valores THEN
    RAISE EXCEPTION 'Conferir: % valores de atributos diferentes do previsto; % gravados em vez de %.', v_n, v_m, c_n_valores;
  END IF;
  SELECT (SELECT count(*) FROM product_prices x JOIN _mv b ON b.id = x.product_id),
         (SELECT count(*) FROM item_suppliers x JOIN _mv b ON b.id = x.product_id),
         (SELECT count(*) FROM product_organizations x JOIN _mv b ON b.id = x.product_id)
    INTO v_n, v_m, v_k;
  IF v_n <> c_n_custo + c_n_pvp + c_n_gross + c_n_dist OR v_m <> c_total OR v_k <> c_total THEN
    RAISE EXCEPTION 'Conferir: % preços (esperados %), % ligações a fornecedor e % product_organizations (esperados %).',
      v_n, c_n_custo + c_n_pvp + c_n_gross + c_n_dist, v_m, v_k, c_total;
  END IF;

  -- os atributos e as opções: de lista, a entrar no SKU, opções ativas com a sigla, siglas únicas por grupo
  SELECT count(*) INTO v_n FROM _mv_opcoes o LEFT JOIN attribute_option_group_values v ON v.id = o.opcao_id
  WHERE NOT coalesce(v.group_id = o.grupo AND v.value_text::text = o.valor AND v.sigla = o.sigla AND v.is_active
                     AND (NOT o.criada OR v.sigla = o.codigo), false);
  SELECT count(*) INTO v_m FROM (SELECT v.group_id FROM attribute_option_group_values v
                                 WHERE v.group_id IN (SELECT t.grupo FROM _mv_attr t) AND v.sigla IS NOT NULL
                                 GROUP BY v.group_id, v.sigla HAVING count(*) > 1) x;
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'Conferir: % opções erradas; % siglas repetidas nos grupos.', v_n, v_m; END IF;
  SELECT count(*) INTO v_n FROM _mv_attr t JOIN product_attributes a ON a.id = t.id
  WHERE NOT (a.organization_id = c_org AND a.deleted_at IS NULL AND coalesce(a.sku_entra, false) AND a.sku_ordem IS NOT NULL
             AND a.is_measurement = (t.papel = 'medida'));
  SELECT count(*) INTO v_m FROM _mv_subs s JOIN product_categories c ON c.id = s.sub_id WHERE c.sigla = s.codigo AND c.parent_id = v_cat;
  IF v_n > 0 OR v_m <> 5 THEN RAISE EXCEPTION 'Conferir: % atributos errados; % das 5 subcategorias com a sigla nova.', v_n, v_m; END IF;

  -- SKUs: únicos, no formato, e iguais ao que a regra do Catálogo calcula a partir do que ficou gravado (todos)
  -- (o grupo de opções de cada atributo calcula-se uma vez: assim a opção encontra-se pelo índice (group_id, value_text))
  CREATE TEMP TABLE _mv_grupos ON COMMIT DROP AS
  SELECT a.id, a.is_measurement, (CASE WHEN NOT a.is_measurement THEN public.fn_cat_grupo_do_atributo(a.id, c_org) END) AS grupo
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  ALTER TABLE _mv_grupos ADD PRIMARY KEY (id);
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex OR NOT p.sku_gerado) INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _mv_subs s) AND NOT p.is_deleted;
  IF v_m <> c_total OR v_n <> c_total THEN RAISE EXCEPTION 'Conferir: SKUs não únicos (% distintos em %).', v_m, v_n; END IF;
  IF v_k > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs fora do formato % ou não gerados.', v_k, v_regex; END IF;
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') FILTER (WHERE y.k <= 5) INTO v_n, v_txt
  FROM (SELECT x.sku, x.calc, row_number() OVER (ORDER BY x.sku) AS k FROM (
          SELECT p.sku, pt ->> 'faltas' AS faltas, (pt ->> 'prefixo') AS prefixo,
                 concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                           pt ->> 'resto') AS calc
          FROM products p
          CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
              SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'atributo', v.attribute_id, 'sigla', o.sigla,
                       'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
              FROM product_attribute_values v
              JOIN _mv_grupos a ON a.id = v.attribute_id
              LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text
              WHERE v.product_id = p.id)) AS pt) z
          WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _mv_subs s) AND NOT p.is_deleted) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- 20 ao acaso com cat_prever_sku_modelo, como um membro da Mudelar com products.edit (só leitura; claims locais)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'moveis_wc_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku, b.sub_id, b.modelo_id FROM _mv b ORDER BY random() LIMIT c_amostra LOOP
      SELECT coalesce(jsonb_agg(CASE WHEN t.medida THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                     ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.opcao_id) END), '[]'::jsonb)
        INTO v_attrs
      FROM _mv_vals v JOIN _mv_attr t ON t.id = v.attribute_id
      LEFT JOIN _mv_opcoes o ON NOT t.medida AND o.papel = t.papel AND o.valor = v.value_text
      WHERE v.product_id = r.id;
      v_prev := public.cat_prever_sku_modelo(c_org, v_cat, r.sub_id, r.modelo_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_amostra THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_amostra; END IF;
  END IF;

  -- nada foi escrito fora da Mudelar: nenhuma linha de outra organização tem o xmin desta transação
  v_xid := (txid_current() % 4294967296)::text;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products' AS t, count(*) AS n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attribute_values', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_organizations', count(*) FROM product_organizations x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'item_suppliers', count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'suppliers', count(*) FROM suppliers x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.id NOT IN (SELECT f.id FROM _mv_forn f WHERE f.criado))
    UNION ALL SELECT 'brands', count(*) FROM brands x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.id NOT IN (SELECT s.sub_id FROM _mv_subs s))
    UNION ALL SELECT 'product_models', count(*) FROM product_models x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.subcategory_id NOT IN (SELECT s.sub_id FROM _mv_subs s))
    UNION ALL SELECT 'uom', count(*) FROM uom x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.id NOT IN (SELECT t.grupo FROM _mv_attr t WHERE t.grupo IS NOT NULL))
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v
              WHERE v.xmin::text = v_xid AND v.id NOT IN (SELECT o.opcao_id FROM _mv_opcoes o WHERE o.criada)) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora do âmbito: %', v_txt; END IF;
  -- e a própria importação escreveu na transação de topo (senão a verificação acima não provava nada)
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid
                 AND p.subcategory_id IN (SELECT s.sub_id FROM _mv_subs s)) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação de «nada fora da Mudelar» não vale.';
  END IF;
  -- nenhum outro produto da Mudelar escrito, e a amostra de SKUs de outras categorias intacta
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mv b WHERE b.id = p.id);
  SELECT count(*) INTO v_k FROM _mv_amostra a LEFT JOIN products p ON p.id = a.id
  WHERE NOT coalesce(p.sku = a.sku AND NOT p.is_deleted AND p.organization_id = c_org, false);
  IF v_n > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: escritos % outros produtos da Mudelar; % SKUs da amostra de outras categorias mudaram.', v_n, v_k;
  END IF;

  RAISE NOTICE 'moveis_wc_mudelar: % produtos em «%» (% modelos, SKU %-SUB-NNNN-…). Atributos criados: %. Opções criadas: %. Fornecedores criados: %. Conferido.',
    c_total, c_cat_nome, c_n_modelos, c_cat_sigla, coalesce(nullif(v_attr_criados, ''), 'nenhum'),
    coalesce(nullif(v_opc_criadas, ''), 'nenhuma'), coalesce(nullif(v_forn_criados, ''), 'nenhum');
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
