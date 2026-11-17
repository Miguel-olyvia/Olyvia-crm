-- ============================================================
-- Testes: 20270119900000_catalogo_eletrodomesticos_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar_eletro.js) a partir do CSV, como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push (falha no passo 0: a subcategoria «Fornos» da Mudelar não tem produtos); depois do push
-- termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito.
--
-- O teste NÃO assume que atributos, opções ou marcas não existiam: lê-os como estão (outra importação pode tê-los criado
-- antes) e o SKU esperado calcula-se a partir das siglas que lá estão.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_eletrodomesticos_mudelar.test.sql
--
-- O que PROVA:
--   1. 72 produtos vivos nas 13 subcategorias de «Eletrodomésticos» (contagem por subcategoria); 49 modelos com
--      o número e o nome do ficheiro, e a quantidade de produtos de cada um.
--   2. Cada produto, pelo nome: o modelo, a marca (ou nenhuma, no Ventax WC), o fornecedor Prome Retail S.A., unidade un, estado
--      active, SKU gerado; custo, PVP, IVA 23, e grossista/distribuidor só nas linhas com valor (18 e 18);
--      fornecedor preferido com preço = custo e supplier_sku = o código do ficheiro ou, sem ele, o SKU.
--   3. Os atributos de cada produto (Cor, Largura, Capacidade, Gás): exatamente os da linha, e nenhum a mais.
--   4. O SKU exato: EL-SUB-NNNN seguido das siglas dos atributos pela ordem sku_ordem; únicos; no formato.
--   5. Os atributos Capacidade e Gás (lista, entram no SKU) com as opções e siglas decididas (15L … 150L, 24G, 41G; NAT, PB);
--      a Largura com a opção 90; a Cor com Inox e Silver.
--   6. As marcas (uma só de cada) e o fornecedor (um só).
--   7. Nenhuma linha de outra organização tem o xmin da transação da importação, e nenhum outro produto da Mudelar foi escrito
--      (os SKUs de Duche & Banho, Loiças e Acessórios não mudaram).
--   8. Todos os produtos: cat_prever_sku_modelo dá o SKU gravado, sem faltas.
--   9. A auditoria registou os produtos com a fonte migration:eletrodomesticos_mudelar.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p JOIN product_categories s ON s.id = p.subcategory_id
                 JOIN product_categories c ON c.id = s.parent_id
                 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                   AND public.fn_cat_chave_opcao(s.name) = 'fornos' AND public.fn_cat_chave_opcao(c.name) = 'eletrodomesticos') THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a subcategoria «Fornos» de «Eletrodomésticos» da Mudelar não tem produtos (aplicar 20270119900000).';
  END IF;
END $t0$;

-- ─── 1 a 9 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 72;
  c_n_modelos constant integer := 49;
  c_n_gross constant integer := 18;
  c_n_dist constant integer := 18;
  c_iva constant numeric := 23;
  v_cat uuid; v_subs uuid[]; v_n bigint; v_m bigint; v_k bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'eletrodomesticos';
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL;
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM 13 THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria Eletrodomésticos ou 13 subcategorias).';
  END IF;
  IF (SELECT c.sigla FROM product_categories c WHERE c.id = v_cat) IS DISTINCT FROM 'EL' THEN
    RAISE EXCEPTION 'FALHOU: a sigla de Eletrodomésticos não é EL.';
  END IF;

  -- 1. quantos, por subcategoria e por modelo
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos em Eletrodomésticos em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('ES', 'Esquentador', 2), ('EX', 'Exaustores', 13), ('FR', 'Fornos', 3), ('FRG', 'Frigoríficos', 10), ('GR', 'Garrafeira', 2), ('MLSR', 'Máquinas lavar & secar roupa', 4), ('MLL', 'Máquinas lavar loiça', 8), ('MLR', 'Máquinas lavar roupa', 5), ('MSR', 'Máquinas secar roupa', 2), ('MO', 'Micro-ondas', 3), ('PL', 'Placas', 12), ('TR', 'Termoacumulador', 7), ('VN', 'Ventax', 1)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome) AND c.sigla = e.sigla
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = c.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por subcategoria (ou sigla): %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs);
  IF v_n <> c_n_modelos THEN RAISE EXCEPTION 'FALHOU: passo 1 — % modelos nas subcategorias em vez de %.', v_n, c_n_modelos; END IF;
  SELECT string_agg(e.sub || lpad(e.numero::text, 4, '0') || ' ' || e.nome || ' ' || coalesce(x.n, 0) || '/' || e.n, '; ') INTO v_txt
  FROM (VALUES ('ES', 1, 'Esquentador Vulcano', 2), ('EX', 1, 'Exaustor AEG', 1), ('EX', 2, 'Exaustor convencional Indesit', 2), ('EX', 3, 'Exaustor de encastre Frasa OBI s/ motor', 2), ('EX', 4, 'Exaustor de ilha Whirlpool', 1), ('EX', 5, 'Exaustor de parede Whirlpool', 2), ('EX', 6, 'Exaustor decorativo Whirlpool', 1), ('EX', 7, 'Exaustor integrável Whirlpool', 1), ('EX', 8, 'Exaustor telescópico Indesit', 1), ('EX', 9, 'Exaustor telescópico Whirlpool', 2), ('FR', 1, 'Forno de encastre Indesit', 2), ('FR', 2, 'Forno de encastre Whirlpool', 1), ('FRG', 1, 'Arca vertical AEG', 1), ('FRG', 2, 'Frigorífico Americano LG s/ ligação à rede', 1), ('FRG', 3, 'Frigorífico Americano Whirlpool', 1), ('FRG', 4, 'Frigorífico Combinado de encastre Indesit', 1), ('FRG', 5, 'Frigorífico Combinado de encastre Whirlpool', 1), ('FRG', 6, 'Frigorífico Combinado Indesit', 2), ('FRG', 7, 'Frigorífico Combinado Whirlpool', 2), ('FRG', 8, 'Frigorífico Integ. Beko', 1), ('GR', 1, 'Garrafeira Sommelier Teka', 2), ('MLSR', 1, 'Máquina lavar & secar roupa encastre Indesit', 1), ('MLSR', 2, 'Máquina lavar & secar roupa encastre Whirlpool', 1), ('MLSR', 3, 'Máquina lavar & secar roupa Indesit', 1), ('MLSR', 4, 'Máquina lavar & secar roupa Whirlpool', 1), ('MLL', 1, 'Máquina lavar loiça Balay', 1), ('MLL', 2, 'Máquina lavar loiça encastre Indesit', 1), ('MLL', 3, 'Máquina lavar loiça encastre Whirlpool', 1), ('MLL', 4, 'Máquina lavar loiça Indesit', 3), ('MLL', 5, 'Máquina lavar loiça Whirlpool', 2), ('MLR', 1, 'Máquina lavar roupa encastre Indesit', 1), ('MLR', 2, 'Máquina lavar roupa encastre Whirlpool', 1), ('MLR', 3, 'Máquina lavar roupa Indesit', 1), ('MLR', 4, 'Máquina lavar roupa Whirlpool', 2), ('MSR', 1, 'Máquina secar roupa Indesit', 1), ('MSR', 2, 'Máquina secar roupa Whirlpool', 1), ('MO', 1, 'Micro-ondas de encastre Indesit', 2), ('MO', 2, 'Micro-ondas de encastre Whirlpool', 1), ('PL', 1, 'Placa com exaustor integrado AEG', 1), ('PL', 2, 'Placa de gás Indesit', 3), ('PL', 3, 'Placa de gás Whirlpool', 2), ('PL', 4, 'Placa de indução e gás Teka Cristal', 2), ('PL', 5, 'Placa de indução Indesit', 1), ('PL', 6, 'Placa de indução Whirlpool', 1), ('PL', 7, 'Placa vitrocerâmica Indesit', 1), ('PL', 8, 'Placa vitrocerâmica Whirlpool', 1), ('TR', 1, 'Termoacumulador Slim Teka', 3), ('TR', 2, 'Termoacumulador Vulcano', 4), ('VN', 1, 'Ventax WC', 1)) AS e(sub, numero, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND c.sigla = e.sub
  LEFT JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = c.id AND pm.deleted_at IS NULL AND pm.is_active
                              AND pm.numero = e.numero AND pm.name = e.nome
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE pm.id IS NULL OR coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — modelos com nome, número ou produtos errados: %', left(v_txt, 1500); END IF;

  -- 2. cada produto, pelo nome: modelo, marca, fornecedor, preços, supplier_sku
  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('Forno DE ENCASTRE INDESIT INOX', 'FR', 'Forno de encastre Indesit', 'INDESIT', 225.28, 352.00, NULL, NULL, '074.F.IFW3844HX', 'Inox', NULL, NULL, NULL),
    ('Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 60', 'PL', 'Placa de indução e gás Teka Cristal', 'TEKA', 519.68, 812.00, NULL, NULL, NULL, 'Preto', '60', NULL, NULL),
    ('Exaustor TELESCÓPICO WHIRPOOL 60CM', 'EX', 'Exaustor telescópico Whirlpool', 'Whirlpool', 192.64, 301.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Termoacumulador VULCANO 74L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 206.08, 322.00, NULL, NULL, NULL, NULL, NULL, '74 L', NULL),
    ('Frigorifico Combinado DE ENCASTRE WHIRPOOL', 'FRG', 'Frigorífico Combinado de encastre Whirlpool', 'Whirlpool', 643.20, 1005.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor de Encastre Frasa OBI 90cm S/Motor', 'EX', 'Exaustor de encastre Frasa OBI s/ motor', 'FRASA', 204.75, 315.00, NULL, NULL, NULL, NULL, '90', NULL, NULL),
    ('Placa DE INDUÇÃO INDESIT', 'PL', 'Placa de indução Indesit', 'INDESIT', 250.88, 392.00, NULL, NULL, '074.P.IB65B60NE', NULL, NULL, NULL, NULL),
    ('Frigorifico Americano LG S/LIGAÇÃO À REDE', 'FRG', 'Frigorífico Americano LG s/ ligação à rede', 'LG', 1051.52, 1643.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor CONVENCIONAL INDESIT 90CM', 'EX', 'Exaustor convencional Indesit', 'INDESIT', 186.24, 291.00, NULL, NULL, NULL, NULL, '90', NULL, NULL),
    ('Esquentador VULCANO 15L GÁS NATURAL', 'ES', 'Esquentador Vulcano', 'VULCANO', 417.28, 652.00, NULL, NULL, '012.E.736506294', NULL, NULL, '15 L', 'Natural'),
    ('Frigorifico Integ. Beko', 'FRG', 'Frigorífico Integ. Beko', 'BEKO', 391.17, 651.95, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor DE PAREDE WHIRPOOL 90CM', 'EX', 'Exaustor de parede Whirlpool', 'Whirlpool', 349.44, 546.00, NULL, NULL, NULL, NULL, '90', NULL, NULL),
    ('Forno DE ENCASTRE INDESIT PRETO', 'FR', 'Forno de encastre Indesit', 'INDESIT', 225.28, 352.00, NULL, NULL, NULL, 'Preto', NULL, NULL, NULL),
    ('Exaustor CONVENCIONAL INDESIT 60CM', 'EX', 'Exaustor convencional Indesit', 'INDESIT', 155.52, 243.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Ventax WC', 'VN', 'Ventax WC', NULL, 30.00, 45.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Frigorifico Combinado INDESIT INOX', 'FRG', 'Frigorífico Combinado Indesit', 'INDESIT', 312.96, 489.00, NULL, NULL, '073.C.XITBT2EX', 'Inox', NULL, NULL, NULL),
    ('Máquina lavar & secar roupa ENCASTRE INDESIT', 'MLSR', 'Máquina lavar & secar roupa encastre Indesit', 'INDESIT', 435.20, 680.00, 12.00, 11.00, '1024.M.WDL861485', NULL, NULL, NULL, NULL),
    ('Micro-ondas DE ENCASTRE WHIRPOOL', 'MO', 'Micro-ondas de encastre Whirlpool', 'Whirlpool', 357.12, 558.00, NULL, NULL, '035.M.AMW4900IX', NULL, NULL, NULL, NULL),
    ('Esquentador VULCANO 15L PROPANO OU BUTANO', 'ES', 'Esquentador Vulcano', 'VULCANO', 417.28, 652.00, NULL, NULL, NULL, NULL, NULL, '15 L', 'Propano/Butano'),
    ('Exaustor TELESCÓPICO INDESIT', 'EX', 'Exaustor telescópico Indesit', 'INDESIT', 103.68, 162.00, NULL, NULL, '074.B.H461IX', NULL, NULL, NULL, NULL),
    ('Placa VITROCERÂMICA INDESIT', 'PL', 'Placa vitrocerâmica Indesit', 'INDESIT', 149.76, 234.00, NULL, NULL, '074.P.RI161C', NULL, NULL, NULL, NULL),
    ('Máquina lavar roupa ENCASTRE WHIRPOOL', 'MLR', 'Máquina lavar roupa encastre Whirlpool', 'Whirlpool', 447.36, 699.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Forno DE ENCASTRE WHIRPOOL', 'FR', 'Forno de encastre Whirlpool', 'Whirlpool', 526.72, 823.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Máquina lavar roupa WHIRPOOL BRANCO', 'MLR', 'Máquina lavar roupa Whirlpool', 'Whirlpool', 486.40, 760.00, 12.00, 11.00, NULL, 'Branco', NULL, NULL, NULL),
    ('PLACA COM EXAUSTOR INTGRADO AEG 80CM', 'PL', 'Placa com exaustor integrado AEG', 'AEG', 1111.83, 1853.05, NULL, NULL, NULL, NULL, '80', NULL, NULL),
    ('Máquina lavar loiça WHIRPOOL SILVER', 'MLL', 'Máquina lavar loiça Whirlpool', 'Whirlpool', 447.36, 699.00, 12.00, 11.00, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina lavar loiça INDESIT BRANCO', 'MLL', 'Máquina lavar loiça Indesit', 'INDESIT', 295.68, 462.00, 12.00, 11.00, '073.M.DFO3T133AF', 'Branco', NULL, NULL, NULL),
    ('Máquina lavar loiça ENCASTRE INDESIT', 'MLL', 'Máquina lavar loiça encastre Indesit', 'INDESIT', 298.88, 467.00, 12.00, 11.00, '074.M.DIC3C24A', NULL, NULL, NULL, NULL),
    ('Placa DE GÁS WHIRPOOL INOX 90', 'PL', 'Placa de gás Whirlpool', 'Whirlpool', 280.32, 438.00, NULL, NULL, NULL, 'Inox', '90', NULL, NULL),
    ('Máquina lavar roupa ENCASTRE INDESIT', 'MLR', 'Máquina lavar roupa encastre Indesit', 'INDESIT', 331.52, 518.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Placa DE GÁS INDESIT PRETO', 'PL', 'Placa de gás Indesit', 'INDESIT', 213.12, 333.00, NULL, NULL, '074.P.ING61TBK', 'Preto', NULL, NULL, NULL),
    ('Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 90', 'PL', 'Placa de indução e gás Teka Cristal', 'TEKA', 399.36, 624.00, NULL, NULL, NULL, 'Preto', '90', NULL, NULL),
    ('Placa VITROCERÂMICA WHIRPOOL', 'PL', 'Placa vitrocerâmica Whirlpool', 'Whirlpool', 192.64, 301.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Frigorifico Combinado DE ENCASTRE INDESIT', 'FRG', 'Frigorífico Combinado de encastre Indesit', 'INDESIT', 469.12, 733.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Frigorifico Americano WHIRPOOL SILVER', 'FRG', 'Frigorífico Americano Whirlpool', 'Whirlpool', 1246.72, 1948.00, NULL, NULL, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina lavar loiça WHIRPOOL BRANCO', 'MLL', 'Máquina lavar loiça Whirlpool', 'Whirlpool', 447.36, 699.00, 12.00, 11.00, NULL, 'Branco', NULL, NULL, NULL),
    ('Exaustor INTEGRÁVEL WHIRPOOL 60CM', 'EX', 'Exaustor integrável Whirlpool', 'Whirlpool', 206.08, 322.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Frigorifico Combinado WHIRPOOL BRANCO', 'FRG', 'Frigorífico Combinado Whirlpool', 'Whirlpool', 453.12, 708.00, NULL, NULL, NULL, 'Branco', NULL, NULL, NULL),
    ('Exaustor TELESCÓPICO WHIRPOOL 90CM', 'EX', 'Exaustor telescópico Whirlpool', 'Whirlpool', 257.28, 402.00, NULL, NULL, '035.E.4KR443', NULL, '90', NULL, NULL),
    ('Termoacumulador SLIM TEKA 50L', 'TR', 'Termoacumulador Slim Teka', 'TEKA', 168.32, 263.00, NULL, NULL, '1086.T.42080060', NULL, NULL, '50 L', NULL),
    ('Máquina lavar loiça INDESIT SILVER', 'MLL', 'Máquina lavar loiça Indesit', 'INDESIT', 295.68, 462.00, 12.00, 11.00, '073.M.DFO3T133AFX', 'Silver', NULL, NULL, NULL),
    ('Termoacumulador SLIM TEKA 80L', 'TR', 'Termoacumulador Slim Teka', 'TEKA', 211.20, 330.00, NULL, NULL, '1086.T.42080090', NULL, NULL, '80 L', NULL),
    ('Máquina lavar & secar roupa WHIRPOOL', 'MLSR', 'Máquina lavar & secar roupa Whirlpool', 'Whirlpool', 544.00, 850.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Termoacumulador VULCANO 57L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 179.84, 281.00, NULL, NULL, NULL, NULL, NULL, '57 L', NULL),
    ('ARCA VERTICAL AEG', 'FRG', 'Arca vertical AEG', 'AEG', 675.30, 1125.50, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Placa DE GÁS WHIRPOOL INOX 60', 'PL', 'Placa de gás Whirlpool', 'Whirlpool', 188.80, 295.00, NULL, NULL, NULL, 'Inox', '60', NULL, NULL),
    ('Exaustor DECORATIVO WHIRPOOL 60CM', 'EX', 'Exaustor decorativo Whirlpool', 'Whirlpool', 228.48, 357.00, NULL, NULL, '035.C.AKR62FLTK', NULL, '60', NULL, NULL),
    ('Máquina lavar loiça INDESIT 45CM', 'MLL', 'Máquina lavar loiça Indesit', 'INDESIT', 259.05, 423.90, 12.00, 11.00, NULL, NULL, '45', NULL, NULL),
    ('MÁQUINA DE LAVAR LOUÇA BALAY 45CM', 'MLL', 'Máquina lavar loiça Balay', 'BALAY', 360.30, 600.50, NULL, NULL, NULL, NULL, '45', NULL, NULL),
    ('Exaustor DE ILHA WHIRPOOL 100CM', 'EX', 'Exaustor de ilha Whirlpool', 'Whirlpool', 681.60, 1065.00, NULL, NULL, NULL, NULL, '100', NULL, NULL),
    ('Termoacumulador VULCANO 93L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 234.88, 367.00, NULL, NULL, NULL, NULL, NULL, '93 L', NULL),
    ('Termoacumulador SLIM TEKA 100L', 'TR', 'Termoacumulador Slim Teka', 'TEKA', 229.12, 358.00, NULL, NULL, NULL, NULL, NULL, '100 L', NULL),
    ('Máquina lavar & secar roupa ENCASTRE WHIRPOOL', 'MLSR', 'Máquina lavar & secar roupa encastre Whirlpool', 'Whirlpool', 567.04, 886.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Termoacumulador VULCANO 150L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 266.88, 417.00, NULL, NULL, NULL, NULL, NULL, '150 L', NULL),
    ('Máquina lavar & secar roupa INDESIT', 'MLSR', 'Máquina lavar & secar roupa Indesit', 'INDESIT', 359.04, 561.00, 12.00, 11.00, '073.M.964369W', NULL, NULL, NULL, NULL),
    ('Máquina lavar roupa INDESIT', 'MLR', 'Máquina lavar roupa Indesit', 'INDESIT', 284.80, 445.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor AEG', 'EX', 'Exaustor AEG', 'AEG', 290.28, 483.80, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor de Encastre Frasa OBI 60cm S/Motor', 'EX', 'Exaustor de encastre Frasa OBI s/ motor', 'FRASA', 180.70, 278.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Frigorifico Combinado INDESIT BRANCO', 'FRG', 'Frigorífico Combinado Indesit', 'INDESIT', 312.96, 489.00, NULL, NULL, '074.C.INC18T311', 'Branco', NULL, NULL, NULL),
    ('Placa DE GÁS INDESIT INOX', 'PL', 'Placa de gás Indesit', 'INDESIT', 110.08, 172.00, NULL, NULL, '074.P.THP642IX', 'Inox', NULL, NULL, NULL),
    ('Placa DE GÁS INDESIT BRANCO', 'PL', 'Placa de gás Indesit', 'INDESIT', 213.12, 333.00, NULL, NULL, NULL, 'Branco', NULL, NULL, NULL),
    ('Frigorifico Combinado WHIRPOOL SILVER', 'FRG', 'Frigorífico Combinado Whirlpool', 'Whirlpool', 460.80, 720.00, NULL, NULL, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina lavar loiça ENCASTRE WHIRPOOL', 'MLL', 'Máquina lavar loiça encastre Whirlpool', 'Whirlpool', 454.40, 710.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Garrafeira SOMMELIER TEKA 41 GARRAFAS', 'GR', 'Garrafeira Sommelier Teka', 'TEKA', 656.00, 1025.00, NULL, NULL, NULL, NULL, NULL, '41 garrafas', NULL),
    ('Máquina lavar roupa SILVER', 'MLR', 'Máquina lavar roupa Whirlpool', 'Whirlpool', 538.24, 841.00, 12.00, 11.00, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina secar roupa WHIRPOOL', 'MSR', 'Máquina secar roupa Whirlpool', 'Whirlpool', 487.04, 761.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Placa DE INDUÇÃO WHIRPOOL', 'PL', 'Placa de indução Whirlpool', 'Whirlpool', 282.88, 442.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Micro-ondas DE ENCASTRE INDESIT PRETO', 'MO', 'Micro-ondas de encastre Indesit', 'INDESIT', 239.36, 374.00, NULL, NULL, NULL, 'Preto', NULL, NULL, NULL),
    ('Micro-ondas DE ENCASTRE INDESIT INOX', 'MO', 'Micro-ondas de encastre Indesit', 'INDESIT', 239.36, 374.00, NULL, NULL, '074.M.MWI6211X', 'Inox', NULL, NULL, NULL),
    ('Máquina secar roupa INDESIT', 'MSR', 'Máquina secar roupa Indesit', 'INDESIT', 270.08, 422.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Garrafeira SOMMELIER TEKA 24 GARRAFAS', 'GR', 'Garrafeira Sommelier Teka', 'TEKA', 577.28, 902.00, NULL, NULL, '026.F.113600009', NULL, NULL, '24 garrafas', NULL),
    ('Exaustor DE PAREDE WHIRPOOL 60CM', 'EX', 'Exaustor de parede Whirlpool', 'Whirlpool', 314.88, 492.00, NULL, NULL, NULL, NULL, '60', NULL, NULL)) AS e(nome, sub, modelo, marca, custo, pvp, grossista, distribuidor, cod_forn, cor, largura, capacidade, gas)
  LEFT JOIN products p ON p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted AND p.name = e.nome
  WHERE NOT coalesce(
        p.sku_gerado AND p.status = 'active' AND p.tipo_catalogo = 'produto'
        AND p.is_active AND p.is_sellable AND p.is_purchasable AND p.manages_stock AND p.unidade = 'un' AND p.uom_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM product_models pm JOIN product_categories c ON c.id = pm.subcategory_id
                    WHERE pm.id = p.model_id AND pm.subcategory_id = p.subcategory_id AND pm.name = e.modelo AND c.sigla = e.sub)
        AND (CASE WHEN e.marca IS NULL THEN p.brand_id IS NULL AND p.marca_livre IS NULL
                  ELSE p.marca_livre = e.marca
                       AND EXISTS (SELECT 1 FROM brands b WHERE b.id = p.brand_id AND b.organization_id = c_org AND b.deleted_at IS NULL AND b.name = e.marca) END)
        AND p.fornecedor_livre = 'Prome Retail S.A.'
        AND EXISTS (SELECT 1 FROM suppliers s WHERE s.id = p.supplier_id AND s.organization_id = c_org AND s.name = 'Prome Retail S.A.')
        -- preços: compra, venda e, só onde há valor, grossista e distribuidor
        AND (SELECT count(*) FROM product_prices x WHERE x.product_id = p.id)
            = 2 + (CASE WHEN e.grossista IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN e.distribuidor IS NOT NULL THEN 1 ELSE 0 END)
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'purchase'
                    AND x.price = round(e.custo, 2) AND x.preco_exato = round(e.custo, 6) AND x.vat_rate = c_iva AND x.currency = 'EUR')
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'retail'
                    AND x.price = round(e.pvp, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR')
        AND (e.grossista IS NULL OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'wholesale'
                                            AND x.price = round(e.grossista, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR'))
        AND (e.distribuidor IS NULL OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'distributor'
                                               AND x.price = round(e.distribuidor, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR'))
        -- um fornecedor, o preferido, preço = custo, supplier_sku = o do ficheiro (ou o SKU)
        AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL) = 1
        AND EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL AND i.supplier_id = p.supplier_id
                    AND i.is_preferred AND i.is_active AND i.organization_id = c_org AND i.supplier_sku = coalesce(e.cod_forn, p.sku)
                    AND i.purchase_price = round(e.custo, 2)),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes da linha do ficheiro: %', v_n, left(v_txt, 1500); END IF;
  SELECT count(*) FILTER (WHERE x.price_type = 'wholesale'), count(*) FILTER (WHERE x.price_type = 'distributor') INTO v_n, v_m
  FROM product_prices x JOIN products p ON p.id = x.product_id WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted;
  IF v_n <> c_n_gross OR v_m <> c_n_dist THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — % preços grossista (esperados %) e % distribuidor (esperados %).', v_n, c_n_gross, v_m, c_n_dist;
  END IF;

  -- 3 e 4. os atributos de cada produto (os da linha e nenhum a mais) e o SKU exato, com as siglas lidas da base
  SELECT count(*), string_agg(e.nome || ' → ' || coalesce(x.valores, 'nenhum') || ' / ' || coalesce(x.sku_esp, 'null'), ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('Forno DE ENCASTRE INDESIT INOX', 'FR', 'Forno de encastre Indesit', 'INDESIT', 225.28, 352.00, NULL, NULL, '074.F.IFW3844HX', 'Inox', NULL, NULL, NULL),
    ('Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 60', 'PL', 'Placa de indução e gás Teka Cristal', 'TEKA', 519.68, 812.00, NULL, NULL, NULL, 'Preto', '60', NULL, NULL),
    ('Exaustor TELESCÓPICO WHIRPOOL 60CM', 'EX', 'Exaustor telescópico Whirlpool', 'Whirlpool', 192.64, 301.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Termoacumulador VULCANO 74L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 206.08, 322.00, NULL, NULL, NULL, NULL, NULL, '74 L', NULL),
    ('Frigorifico Combinado DE ENCASTRE WHIRPOOL', 'FRG', 'Frigorífico Combinado de encastre Whirlpool', 'Whirlpool', 643.20, 1005.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor de Encastre Frasa OBI 90cm S/Motor', 'EX', 'Exaustor de encastre Frasa OBI s/ motor', 'FRASA', 204.75, 315.00, NULL, NULL, NULL, NULL, '90', NULL, NULL),
    ('Placa DE INDUÇÃO INDESIT', 'PL', 'Placa de indução Indesit', 'INDESIT', 250.88, 392.00, NULL, NULL, '074.P.IB65B60NE', NULL, NULL, NULL, NULL),
    ('Frigorifico Americano LG S/LIGAÇÃO À REDE', 'FRG', 'Frigorífico Americano LG s/ ligação à rede', 'LG', 1051.52, 1643.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor CONVENCIONAL INDESIT 90CM', 'EX', 'Exaustor convencional Indesit', 'INDESIT', 186.24, 291.00, NULL, NULL, NULL, NULL, '90', NULL, NULL),
    ('Esquentador VULCANO 15L GÁS NATURAL', 'ES', 'Esquentador Vulcano', 'VULCANO', 417.28, 652.00, NULL, NULL, '012.E.736506294', NULL, NULL, '15 L', 'Natural'),
    ('Frigorifico Integ. Beko', 'FRG', 'Frigorífico Integ. Beko', 'BEKO', 391.17, 651.95, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor DE PAREDE WHIRPOOL 90CM', 'EX', 'Exaustor de parede Whirlpool', 'Whirlpool', 349.44, 546.00, NULL, NULL, NULL, NULL, '90', NULL, NULL),
    ('Forno DE ENCASTRE INDESIT PRETO', 'FR', 'Forno de encastre Indesit', 'INDESIT', 225.28, 352.00, NULL, NULL, NULL, 'Preto', NULL, NULL, NULL),
    ('Exaustor CONVENCIONAL INDESIT 60CM', 'EX', 'Exaustor convencional Indesit', 'INDESIT', 155.52, 243.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Ventax WC', 'VN', 'Ventax WC', NULL, 30.00, 45.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Frigorifico Combinado INDESIT INOX', 'FRG', 'Frigorífico Combinado Indesit', 'INDESIT', 312.96, 489.00, NULL, NULL, '073.C.XITBT2EX', 'Inox', NULL, NULL, NULL),
    ('Máquina lavar & secar roupa ENCASTRE INDESIT', 'MLSR', 'Máquina lavar & secar roupa encastre Indesit', 'INDESIT', 435.20, 680.00, 12.00, 11.00, '1024.M.WDL861485', NULL, NULL, NULL, NULL),
    ('Micro-ondas DE ENCASTRE WHIRPOOL', 'MO', 'Micro-ondas de encastre Whirlpool', 'Whirlpool', 357.12, 558.00, NULL, NULL, '035.M.AMW4900IX', NULL, NULL, NULL, NULL),
    ('Esquentador VULCANO 15L PROPANO OU BUTANO', 'ES', 'Esquentador Vulcano', 'VULCANO', 417.28, 652.00, NULL, NULL, NULL, NULL, NULL, '15 L', 'Propano/Butano'),
    ('Exaustor TELESCÓPICO INDESIT', 'EX', 'Exaustor telescópico Indesit', 'INDESIT', 103.68, 162.00, NULL, NULL, '074.B.H461IX', NULL, NULL, NULL, NULL),
    ('Placa VITROCERÂMICA INDESIT', 'PL', 'Placa vitrocerâmica Indesit', 'INDESIT', 149.76, 234.00, NULL, NULL, '074.P.RI161C', NULL, NULL, NULL, NULL),
    ('Máquina lavar roupa ENCASTRE WHIRPOOL', 'MLR', 'Máquina lavar roupa encastre Whirlpool', 'Whirlpool', 447.36, 699.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Forno DE ENCASTRE WHIRPOOL', 'FR', 'Forno de encastre Whirlpool', 'Whirlpool', 526.72, 823.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Máquina lavar roupa WHIRPOOL BRANCO', 'MLR', 'Máquina lavar roupa Whirlpool', 'Whirlpool', 486.40, 760.00, 12.00, 11.00, NULL, 'Branco', NULL, NULL, NULL),
    ('PLACA COM EXAUSTOR INTGRADO AEG 80CM', 'PL', 'Placa com exaustor integrado AEG', 'AEG', 1111.83, 1853.05, NULL, NULL, NULL, NULL, '80', NULL, NULL),
    ('Máquina lavar loiça WHIRPOOL SILVER', 'MLL', 'Máquina lavar loiça Whirlpool', 'Whirlpool', 447.36, 699.00, 12.00, 11.00, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina lavar loiça INDESIT BRANCO', 'MLL', 'Máquina lavar loiça Indesit', 'INDESIT', 295.68, 462.00, 12.00, 11.00, '073.M.DFO3T133AF', 'Branco', NULL, NULL, NULL),
    ('Máquina lavar loiça ENCASTRE INDESIT', 'MLL', 'Máquina lavar loiça encastre Indesit', 'INDESIT', 298.88, 467.00, 12.00, 11.00, '074.M.DIC3C24A', NULL, NULL, NULL, NULL),
    ('Placa DE GÁS WHIRPOOL INOX 90', 'PL', 'Placa de gás Whirlpool', 'Whirlpool', 280.32, 438.00, NULL, NULL, NULL, 'Inox', '90', NULL, NULL),
    ('Máquina lavar roupa ENCASTRE INDESIT', 'MLR', 'Máquina lavar roupa encastre Indesit', 'INDESIT', 331.52, 518.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Placa DE GÁS INDESIT PRETO', 'PL', 'Placa de gás Indesit', 'INDESIT', 213.12, 333.00, NULL, NULL, '074.P.ING61TBK', 'Preto', NULL, NULL, NULL),
    ('Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 90', 'PL', 'Placa de indução e gás Teka Cristal', 'TEKA', 399.36, 624.00, NULL, NULL, NULL, 'Preto', '90', NULL, NULL),
    ('Placa VITROCERÂMICA WHIRPOOL', 'PL', 'Placa vitrocerâmica Whirlpool', 'Whirlpool', 192.64, 301.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Frigorifico Combinado DE ENCASTRE INDESIT', 'FRG', 'Frigorífico Combinado de encastre Indesit', 'INDESIT', 469.12, 733.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Frigorifico Americano WHIRPOOL SILVER', 'FRG', 'Frigorífico Americano Whirlpool', 'Whirlpool', 1246.72, 1948.00, NULL, NULL, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina lavar loiça WHIRPOOL BRANCO', 'MLL', 'Máquina lavar loiça Whirlpool', 'Whirlpool', 447.36, 699.00, 12.00, 11.00, NULL, 'Branco', NULL, NULL, NULL),
    ('Exaustor INTEGRÁVEL WHIRPOOL 60CM', 'EX', 'Exaustor integrável Whirlpool', 'Whirlpool', 206.08, 322.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Frigorifico Combinado WHIRPOOL BRANCO', 'FRG', 'Frigorífico Combinado Whirlpool', 'Whirlpool', 453.12, 708.00, NULL, NULL, NULL, 'Branco', NULL, NULL, NULL),
    ('Exaustor TELESCÓPICO WHIRPOOL 90CM', 'EX', 'Exaustor telescópico Whirlpool', 'Whirlpool', 257.28, 402.00, NULL, NULL, '035.E.4KR443', NULL, '90', NULL, NULL),
    ('Termoacumulador SLIM TEKA 50L', 'TR', 'Termoacumulador Slim Teka', 'TEKA', 168.32, 263.00, NULL, NULL, '1086.T.42080060', NULL, NULL, '50 L', NULL),
    ('Máquina lavar loiça INDESIT SILVER', 'MLL', 'Máquina lavar loiça Indesit', 'INDESIT', 295.68, 462.00, 12.00, 11.00, '073.M.DFO3T133AFX', 'Silver', NULL, NULL, NULL),
    ('Termoacumulador SLIM TEKA 80L', 'TR', 'Termoacumulador Slim Teka', 'TEKA', 211.20, 330.00, NULL, NULL, '1086.T.42080090', NULL, NULL, '80 L', NULL),
    ('Máquina lavar & secar roupa WHIRPOOL', 'MLSR', 'Máquina lavar & secar roupa Whirlpool', 'Whirlpool', 544.00, 850.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Termoacumulador VULCANO 57L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 179.84, 281.00, NULL, NULL, NULL, NULL, NULL, '57 L', NULL),
    ('ARCA VERTICAL AEG', 'FRG', 'Arca vertical AEG', 'AEG', 675.30, 1125.50, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Placa DE GÁS WHIRPOOL INOX 60', 'PL', 'Placa de gás Whirlpool', 'Whirlpool', 188.80, 295.00, NULL, NULL, NULL, 'Inox', '60', NULL, NULL),
    ('Exaustor DECORATIVO WHIRPOOL 60CM', 'EX', 'Exaustor decorativo Whirlpool', 'Whirlpool', 228.48, 357.00, NULL, NULL, '035.C.AKR62FLTK', NULL, '60', NULL, NULL),
    ('Máquina lavar loiça INDESIT 45CM', 'MLL', 'Máquina lavar loiça Indesit', 'INDESIT', 259.05, 423.90, 12.00, 11.00, NULL, NULL, '45', NULL, NULL),
    ('MÁQUINA DE LAVAR LOUÇA BALAY 45CM', 'MLL', 'Máquina lavar loiça Balay', 'BALAY', 360.30, 600.50, NULL, NULL, NULL, NULL, '45', NULL, NULL),
    ('Exaustor DE ILHA WHIRPOOL 100CM', 'EX', 'Exaustor de ilha Whirlpool', 'Whirlpool', 681.60, 1065.00, NULL, NULL, NULL, NULL, '100', NULL, NULL),
    ('Termoacumulador VULCANO 93L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 234.88, 367.00, NULL, NULL, NULL, NULL, NULL, '93 L', NULL),
    ('Termoacumulador SLIM TEKA 100L', 'TR', 'Termoacumulador Slim Teka', 'TEKA', 229.12, 358.00, NULL, NULL, NULL, NULL, NULL, '100 L', NULL),
    ('Máquina lavar & secar roupa ENCASTRE WHIRPOOL', 'MLSR', 'Máquina lavar & secar roupa encastre Whirlpool', 'Whirlpool', 567.04, 886.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Termoacumulador VULCANO 150L', 'TR', 'Termoacumulador Vulcano', 'VULCANO', 266.88, 417.00, NULL, NULL, NULL, NULL, NULL, '150 L', NULL),
    ('Máquina lavar & secar roupa INDESIT', 'MLSR', 'Máquina lavar & secar roupa Indesit', 'INDESIT', 359.04, 561.00, 12.00, 11.00, '073.M.964369W', NULL, NULL, NULL, NULL),
    ('Máquina lavar roupa INDESIT', 'MLR', 'Máquina lavar roupa Indesit', 'INDESIT', 284.80, 445.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor AEG', 'EX', 'Exaustor AEG', 'AEG', 290.28, 483.80, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Exaustor de Encastre Frasa OBI 60cm S/Motor', 'EX', 'Exaustor de encastre Frasa OBI s/ motor', 'FRASA', 180.70, 278.00, NULL, NULL, NULL, NULL, '60', NULL, NULL),
    ('Frigorifico Combinado INDESIT BRANCO', 'FRG', 'Frigorífico Combinado Indesit', 'INDESIT', 312.96, 489.00, NULL, NULL, '074.C.INC18T311', 'Branco', NULL, NULL, NULL),
    ('Placa DE GÁS INDESIT INOX', 'PL', 'Placa de gás Indesit', 'INDESIT', 110.08, 172.00, NULL, NULL, '074.P.THP642IX', 'Inox', NULL, NULL, NULL),
    ('Placa DE GÁS INDESIT BRANCO', 'PL', 'Placa de gás Indesit', 'INDESIT', 213.12, 333.00, NULL, NULL, NULL, 'Branco', NULL, NULL, NULL),
    ('Frigorifico Combinado WHIRPOOL SILVER', 'FRG', 'Frigorífico Combinado Whirlpool', 'Whirlpool', 460.80, 720.00, NULL, NULL, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina lavar loiça ENCASTRE WHIRPOOL', 'MLL', 'Máquina lavar loiça encastre Whirlpool', 'Whirlpool', 454.40, 710.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Garrafeira SOMMELIER TEKA 41 GARRAFAS', 'GR', 'Garrafeira Sommelier Teka', 'TEKA', 656.00, 1025.00, NULL, NULL, NULL, NULL, NULL, '41 garrafas', NULL),
    ('Máquina lavar roupa SILVER', 'MLR', 'Máquina lavar roupa Whirlpool', 'Whirlpool', 538.24, 841.00, 12.00, 11.00, NULL, 'Silver', NULL, NULL, NULL),
    ('Máquina secar roupa WHIRPOOL', 'MSR', 'Máquina secar roupa Whirlpool', 'Whirlpool', 487.04, 761.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Placa DE INDUÇÃO WHIRPOOL', 'PL', 'Placa de indução Whirlpool', 'Whirlpool', 282.88, 442.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('Micro-ondas DE ENCASTRE INDESIT PRETO', 'MO', 'Micro-ondas de encastre Indesit', 'INDESIT', 239.36, 374.00, NULL, NULL, NULL, 'Preto', NULL, NULL, NULL),
    ('Micro-ondas DE ENCASTRE INDESIT INOX', 'MO', 'Micro-ondas de encastre Indesit', 'INDESIT', 239.36, 374.00, NULL, NULL, '074.M.MWI6211X', 'Inox', NULL, NULL, NULL),
    ('Máquina secar roupa INDESIT', 'MSR', 'Máquina secar roupa Indesit', 'INDESIT', 270.08, 422.00, 12.00, 11.00, NULL, NULL, NULL, NULL, NULL),
    ('Garrafeira SOMMELIER TEKA 24 GARRAFAS', 'GR', 'Garrafeira Sommelier Teka', 'TEKA', 577.28, 902.00, NULL, NULL, '026.F.113600009', NULL, NULL, '24 garrafas', NULL),
    ('Exaustor DE PAREDE WHIRPOOL 60CM', 'EX', 'Exaustor de parede Whirlpool', 'Whirlpool', 314.88, 492.00, NULL, NULL, NULL, NULL, '60', NULL, NULL)) AS e(nome, sub, modelo, marca, custo, pvp, grossista, distribuidor, cod_forn, cor, largura, capacidade, gas)
  JOIN products p ON p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted AND p.name = e.nome
  JOIN product_models pm ON pm.id = p.model_id
  LEFT JOIN LATERAL (
    SELECT concat_ws('-', 'EL', e.sub, lpad(pm.numero::text, 4, '0'),
                     (SELECT string_agg(o.sigla, '-' ORDER BY a.sku_ordem)
                      FROM (VALUES ('cor', e.cor), ('largura', e.largura), ('capacidade', e.capacidade), ('gás', e.gas)) t(attr, val)
                      JOIN product_attributes a ON a.organization_id = c_org AND a.deleted_at IS NULL
                           AND public.fn_cat_chave_opcao(a.label) = public.fn_cat_chave_opcao(t.attr)
                      JOIN attribute_option_group_values o ON o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org)
                           AND public.fn_cat_chave_opcao(o.value_text::text) = public.fn_cat_chave_opcao(t.val)
                      WHERE t.val IS NOT NULL)) AS sku_esp,
           (SELECT string_agg(a.label || '=' || v.value_text, ', ' ORDER BY a.label)
            FROM product_attribute_values v JOIN product_attributes a ON a.id = v.attribute_id WHERE v.product_id = p.id) AS valores,
           (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = p.id) AS n_valores,
           (SELECT count(*) FROM (VALUES (e.cor), (e.largura), (e.capacidade), (e.gas)) t(x) WHERE t.x IS NOT NULL) AS n_esp,
           (SELECT count(*) FROM (VALUES ('cor', e.cor), ('largura', e.largura), ('capacidade', e.capacidade), ('gás', e.gas)) t(attr, val)
            JOIN product_attributes a ON a.organization_id = c_org AND a.deleted_at IS NULL
                 AND public.fn_cat_chave_opcao(a.label) = public.fn_cat_chave_opcao(t.attr)
            JOIN product_attribute_values v ON v.product_id = p.id AND v.attribute_id = a.id
                 AND public.fn_cat_chave_opcao(v.value_text) = public.fn_cat_chave_opcao(t.val)
            WHERE t.val IS NOT NULL) AS n_certos
  ) x ON true
  WHERE p.sku IS DISTINCT FROM x.sku_esp OR x.n_valores <> x.n_esp OR x.n_certos <> x.n_esp;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passos 3 e 4 — % produtos com atributos ou SKU errados: %', v_n, left(v_txt, 1500); END IF;
  SELECT count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^EL-(ES|EX|FR|FRG|GR|MLSR|MLL|MLR|MSR|MO|PL|TR|VN)-[0-9]{4}(-[A-Z0-9]{1,6}){0,4}$' OR NOT p.sku_gerado)
    INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted;
  IF v_n <> c_total OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (esperados %), % fora do formato ou não gerados.', v_n, c_total, v_m;
  END IF;

  -- 5. os atributos novos e as opções decididas (lê-se o que lá está; não se assume quem os criou)
  SELECT string_agg(e.attr || ' ' || e.val || ' (sigla ' || e.sigla || ')', '; ') INTO v_txt
  FROM (VALUES ('Cor', 'Inox', NULL), ('Cor', 'Preto', NULL), ('Cor', 'Branco', NULL), ('Cor', 'Silver', NULL), ('Largura', '45', '45'), ('Largura', '60', '60'), ('Largura', '80', '80'), ('Largura', '90', '90'), ('Largura', '100', '100'), ('Capacidade', '15 L', '15L'), ('Capacidade', '50 L', '50L'), ('Capacidade', '57 L', '57L'), ('Capacidade', '74 L', '74L'), ('Capacidade', '80 L', '80L'), ('Capacidade', '93 L', '93L'), ('Capacidade', '100 L', '100L'), ('Capacidade', '150 L', '150L'), ('Capacidade', '24 garrafas', '24G'), ('Capacidade', '41 garrafas', '41G'), ('Gás', 'Natural', 'NAT'), ('Gás', 'Propano/Butano', 'PB')) AS e(attr, val, sigla)
  WHERE (SELECT count(*) FROM product_attributes a
         JOIN attribute_option_group_values o ON o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org)
         WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND NOT a.is_measurement AND a.value_type = 'list' AND a.sku_entra
           AND public.fn_cat_chave_opcao(a.label) = public.fn_cat_chave_opcao(e.attr)
           AND public.fn_cat_chave_opcao(o.value_text::text) = public.fn_cat_chave_opcao(e.val) AND o.is_active
           AND (e.sigla IS NULL OR o.sigla = e.sigla)) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — opções em falta, repetidas ou com outra sigla: %', v_txt; END IF;
  SELECT string_agg(e.attr, ', ') INTO v_txt FROM (VALUES ('Cor'), ('Largura'), ('Capacidade'), ('Gás')) e(attr)
  WHERE (SELECT count(*) FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL
         AND public.fn_cat_chave_opcao(a.label) = public.fn_cat_chave_opcao(e.attr)) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — atributos que não existem uma vez: %', v_txt; END IF;

  -- 6. as marcas e o fornecedor, uma vez cada
  SELECT string_agg(e.marca || ' ×' || (SELECT count(*) FROM brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL
                                        AND public.fn_cat_chave_opcao(b.name) = public.fn_cat_chave_opcao(e.marca)), '; ') INTO v_txt
  FROM (VALUES ('AEG'), ('BALAY'), ('BEKO'), ('FRASA'), ('INDESIT'), ('LG'), ('TEKA'), ('VULCANO'), ('Whirlpool')) AS e(marca)
  WHERE (SELECT count(*) FROM brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL
         AND public.fn_cat_chave_opcao(b.name) = public.fn_cat_chave_opcao(e.marca)) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — marcas: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
                                              AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao('Prome Retail S.A.');
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: passo 6 — % fornecedores «Prome Retail S.A.» (esperado 1).', v_n; END IF;

  -- 7. nada escrito fora da Mudelar, nem outros produtos da Mudelar
  SELECT mode() WITHIN GROUP (ORDER BY p.xmin::text) INTO v_xid FROM products p
  WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products' AS t, count(*) AS n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attribute_values', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_organizations', count(*) FROM product_organizations x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'item_suppliers', count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'suppliers', count(*) FROM suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_models', count(*) FROM product_models x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'brands', count(*) FROM brands x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values x JOIN attribute_option_groups g ON g.id = x.group_id
              WHERE x.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — linhas de outras organizações ou categorias escritas pela importação: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND p.category_id IS DISTINCT FROM v_cat;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 7 — % outros produtos da Mudelar escritos pela importação.', v_n; END IF;
  -- a regra de SKU continua a dar o mesmo nos produtos de Duche & Banho, Loiças e Acessórios (amostra de 3 por categoria)
  SELECT count(*), string_agg(x.sku || ' ≠ ' || coalesce(x.prev, 'null'), '; ') INTO v_n, v_txt
  FROM (SELECT p.sku, p.id, row_number() OVER (PARTITION BY c.id ORDER BY p.sku, p.id) AS k,
               concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'), pt ->> 'resto') AS prev
        FROM products p JOIN product_categories c ON c.id = p.category_id
        CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'atributo', v.attribute_id, 'sigla', o.sigla,
                     'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
            FROM product_attribute_values v
            JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
            LEFT JOIN attribute_option_group_values o
              ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
            WHERE v.product_id = p.id)) AS pt) z
        WHERE p.organization_id = c_org AND NOT p.is_deleted AND c.parent_id IS NULL AND c.sigla IN ('DB', 'LS', 'ACB')) x
  WHERE x.k <= 3 AND x.prev IS DISTINCT FROM x.sku;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 7 — % SKUs da amostra de outras categorias já não batem com a regra: %', v_n, v_txt; END IF;

  -- 8. todos: cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 8 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id
           FROM products p WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted ORDER BY p.sku LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id)), '[]'::jsonb) INTO v_attrs
    FROM product_attribute_values v
    JOIN attribute_option_group_values o ON o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
    WHERE v.product_id = r.id;
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 8 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 8 — só % produtos comparados.', v_n; END IF;

  -- 9. a auditoria registou a criação dos produtos, com a fonte da importação
  SELECT count(DISTINCT e.record_id) INTO v_n FROM entity_audit_log e
  WHERE e.organization_id = c_org AND e.source = 'migration:eletrodomesticos_mudelar' AND e.table_name = 'products'
    AND e.operation = 'INSERT'
    AND e.record_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.category_id = v_cat);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 9 — a auditoria tem % dos % produtos com a fonte da importação.', v_n, c_total; END IF;
END $t$;

SELECT 'OK: eletrodomésticos da Mudelar (72 produtos, 49 modelos, SKU EL-SUB-NNNN-atributos) conferidos nos passos 0 a 9.' AS resultado;

ROLLBACK;
