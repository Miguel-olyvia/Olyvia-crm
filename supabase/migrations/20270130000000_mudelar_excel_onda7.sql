-- =============================================================================
-- Catálogo — MUDELAR igual aos Excels, ONDA 7: IVA, nomes com o código do fabricante, medidas erradas dos tampos e o par
-- repetido. MIGRATION DE DADOS. Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). SÓ A MUDELAR (3242e925-da26-459a-8258-be04d904e355): todas as escritas
-- !!! levam a organização. Os ids, SKU, nomes, preços e atributos foram lidos na RH a 27/11/2026 (SELECT como administrador,
-- !!! sem RLS), DEPOIS da onda 6 (20270129900000). Noutra base (a principal) a organização ou a cópia da onda 6 não existem e
-- !!! a migration sai por RAISE NOTICE sem escrever nada. Antes do `db push`, confirmar supabase/.temp/project-ref =
-- !!! uetjghdkwbywbftedtth.
--
-- Pedido do dono: «Man, eu só quero que os produtos que estão no modular sejam iguais aos do Excel. Se o Excel tiver um
-- produto que é literalmente igual ao outro, claro que só mantens uma versão.» e, sobre as perguntas da prova de igualdade,
-- «as bases de duche mete a ativo ne 2. esses produtos sem preco metes sem n tem mal , os 12 com esse ivva metes , n vejo o
-- problma». Fonte: os Excels originais (base-mudelar, lidos por mudelar-audit/onda7/o7_excel.py) e a prova de igualdade
-- (mudelar-audit/prova-diferencas.csv). Plano gerado por script (mudelar-audit/onda7: o7_gen.py), fora da pasta do projeto.
--
-- O QUE FAZ, quatro frentes, listas fechadas embutidas abaixo (nada se calcula na hora):
--   A. IVA: os 12 «PLACA DE ACIONAMENTO» (Loiças Sanitárias / Kit´s para Sanitários) passam a ter o IVA que o Excel lhes dá,
--      de 24 a 32 % (lido no Loiças Sanitárias.xlsx, linhas 69 a 80): LS-KS-0002-P-M 24 %; LS-KS-0003-CRD 25 %; LS-KS-0003-D 29 %; LS-KS-0003-D-M 30 %; LS-KS-0003-GMT 27 %; LS-KS-0003-P-M 28 %; LS-KS-0003-RG 26 %; LS-KS-0004-B-M 31 %; LS-KS-0004-CRD 32 %; LS-KS-0004-D 32 %; LS-KS-0004-P-M 32 %; LS-KS-0004-PG 32 %.
--      Escreve-se product_prices.vat_rate nas 24 linhas de preço dos 12 (compra e PVP, como o ecrã de preços do produto,
--      que grava a taxa em todas as linhas que o produto tem). O preço não muda (o gatilho log_product_price_change só
--      escreve histórico quando muda o preço: 0 linhas); a auditoria é a do gatilho fn_audit_product_prices (uma por linha).
--      Em products, product_prices e item_suppliers nenhuma CHECK limita a taxa (lido: em product_prices só
--      product_prices_preco_exato_check) e o ecrã aceita de 0 a 100. ATENÇÃO: orcamento_linhas.taxa_iva tem a CHECK
--      orcamento_linhas_taxa_iva_check, que só aceita 6, 13 ou 23. Hoje não parte nada (nenhuma função da base copia o
--      vat_rate do produto para taxa_iva; a Emylia descarta 24 a 32 % e só lê o IVA dos serviços; a Mudelar não tem linhas
--      em orcamento_linhas), mas se algum dia o IVA do produto for copiado para orcamento_linhas estas 12 placas rebentam
--      essa CHECK. Nota de negócio: 24 a 32 % não são taxas legais em Portugal; é decisão do dono, e como as placas estão
--      ativas os orçamentos novos do QuoteBuilder passam a cobrar essas taxas.
--      NÃO entram os outros 422 produtos com IVA no Excel (23 %, sobretudo Resguardos, Móveis e Tampos em rascunho): não
--      têm NENHUMA linha de preço nem no Excel nem na base, e o IVA só existe na linha de preço (price é NOT NULL). Criar uma
--      linha a 0 não se faz: o ecrã de preços nunca cria uma linha a 0 («nothing to save»), e no orçamento (AddItemsDialog)
--      uma linha de PVP a 0 passa o produto de «sem preço» (null) a vendável a 0,00 €. Sem linha, a app já usa 23 % (a
--      omissão da coluna vat_rate e de AddItemsDialog), que é o que o Excel diz. Lista em mudelar-audit/onda7/fora_iva_sem_preco.csv.
--   B. NOMES: 5 produtos em que o Excel acrescenta o código do fabricante (por decidir desde a onda 1; 3 deles repostos pela
--      onda 4b) passam a ter o nome do Excel, letra a letra:
--   EL-MLL-0001-45         «MÁQUINA DE LAVAR LOUÇA BALAY 45CM» → «MÁQUINA DE LAVAR LOUÇA BALAY - 3VT4031NA - 45CM» (EMLL0008)
--   EL-MLL-0004-45         «Máquina lavar loiça INDESIT 45CM» → «Máquina lavar loiça INDESIT 45CM- IN2FD10CS70W» (EMLL0007)
--   EL-PL-0001-80          «PLACA COM EXAUSTOR INTGRADO AEG 80CM» → «PLACA COM EXAUSTOR INTGRADO AEG - TH84CB03FB 80CM» (EP0012)
--   MCC-AC-0018-528X545MM  «ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE» → «ESTRUTURA LAUNDRY CARRIER 500 940TUL0000004 3270821 2X33L 528MM ALT 545MM ANTRACITE» (MCCAC0018)
--   TM-MMG-0002-GRF        «Misturadoras Monocomando Giratoria SOPHIE Metal Edition Grafite» → «Misturadoras Monocomando Giratoria SOPHIE Metal Edition Grafite (cod. GN)» (TMMMG00001MGN)
--      Não mexe nos 4 «Perfil Acessorio» (o Excel dá o mesmo nome a dois produtos diferentes) nem nos 370 «Resguardo
--      Resguardo» (decisão do dono a 17/11). Auditoria pelo gatilho fn_generic_entity_audit (uma linha por produto).
--   C. MEDIDAS: apaga a medida que a onda 6 deu aos 27 «Tampo Modular 4cm / Tampo Sleep 4cm NNNx4x46» (o «4» é a espessura
--      e a onda 6 gravou-o como comprimento e o 46 como espessura). Só as 27 linhas que a onda 6 inseriu, ainda iguais à cópia
--      _mudelar_excel.onda6_atributos_novos; os 27 ficam sem nenhum atributo, como antes da onda 6. São rascunhos, sem modelo
--      e fora de famílias. Auditoria pelo gatilho fn_audit_product_attribute_values (uma linha por valor apagado).
--      A REVERSÃO DA ONDA 6 (mudelar-reverter-onda6.sql) passa a abortar enquanto estes 27 estiverem apagados: reverter
--      primeiro esta onda.
--   D. PARES COM O MESMO NOME: dos 4 pares lidos, só MACBML0161 / MACBML0162 («Móvel BRAGA c/tampo 120x81x45 - 2 Portas c/
--      Prat + 4 Gav») são o mesmo artigo: a linha de products só difere no id e no SKU (subcategoria, marca, fornecedor,
--      estado e data de criação iguais), os mesmos preços (342,00 / 205,20 com 23 %), a mesma medida e a mesma ligação ao
--      fornecedor. Fica MACBML0161 (os dois têm linha no Excel csv antigo, nenhum tem referências e foram criados no mesmo
--      instante pela onda 3: fica o da primeira linha, 207); ARQUIVA-SE MACBML0162 (linha 327) como rpc_delete_product
--      (is_deleted, deleted_at e deleted_by, os três, e uma linha de auditoria) e a única ligação a fornecedor dele como
--      rpc_delete_item_supplier; o gatilho fn_item_suppliers_sync_preferred limpa products.supplier_id dele. Os outros 3 pares
--      (DBRS0255XX / -2: 251 e 271 €; MACBML0145 / 0146: 306 e 333 €; MACBML0152 / 0153: 342 e 378 €) NÃO são o mesmo artigo
--      (o Excel e a base dão-lhes preços diferentes): ficam os dois, listados em mudelar-audit/onda7/fora_pares.csv.
--
-- O QUE NÃO FAZ: não muda SKU (nenhuma chamada a cat_gerar_sku_produto; C2 exige 0 SKU alterados em TODOS os produtos da
-- Mudelar), estado (as bases de duche ficam ATIVAS; a onda 5 não se faz), subcategoria, modelo, marca, fornecedor, preços
-- (só a taxa de IVA dos 24), atributos fora dos 27, famílias, códigos nem documentos. Não cria produtos, preços, atributos
-- nem opções (nenhum INSERT fora das listas e da cópia). Não toca noutra organização.
--
-- GUARDAS (falham a migration inteira; nada fica): G0 a Mudelar e a cópia da onda 6 existem (senão NOTICE e sai); L1 as
-- listas têm os números do cabeçalho; já aplicada (tudo com os valores desta onda e a cópia _mudelar_excel.onda7_* existe) →
-- NOTICE e sai, a meio → falha; G1 contagens de partida (32150 produtos vivos, 145 consumíveis CONS-, 548 famílias,
-- 14637 membros); G2 (A) cada linha de preço existe com o tipo, o preço e o IVA 23 lidos, e é a única linha de preço do
-- produto além da outra da lista; G3 (B) cada produto vivo da Mudelar com o SKU e o nome lidos; G4 (C) cada valor igual à
-- cópia da onda 6, de «medida», e o produto vivo, com o SKU lido, sem modelo, fora de famílias e só com esse atributo; G5 (D)
-- os dois do par vivos e iguais (products sem id, sku e updated_at; preços; atributos; a ligação), o arquivado sem
-- referências em documentos, receitas, famílias, stock nem encomendas por receber, e com uma só ligação viva; G6 o utilizador
-- da auditoria é membro ativo e app.audit_bypass desligado. Lock: pg_advisory_xact_lock(hashtextextended('cat_familias:' ||
-- org, 0)) e os produtos tocados FOR NO KEY UPDATE por ordem.
-- CONFERÊNCIAS no fim: C1 cada escrita ficou como a lista diz e o resto da linha igual à cópia; C2 0 SKU alterados; C3
-- products fora de B e D iguais (sem updated_at; estado, subcategoria e modelo incluídos), vivos = 32150 − 1; C4 preços
-- fora dos 24 iguais, códigos, organizações e histórico de preços iguais; C5 atributos fora dos 27 iguais e −27 no total; C6
-- ligações fora da do D iguais e −1 vivas; C7 145 consumíveis; C8 famílias (548 / 14637 e impressão digital); C9 documentos e
-- receitas iguais; C10 nada escrito fora da Mudelar (xmin); C11 o schema _mudelar_excel e as tabelas fechados (ACL lida por
-- ::text); C12 as linhas de auditoria: 24 de preços, 5 de nomes, 27 de atributos, 1 + 1 do arquivo.
--
-- CÓPIA E REVERSÃO: o estado antigo fica em _mudelar_excel.onda7_precos, onda7_produtos, onda7_atributos e
-- onda7_item_suppliers (só postgres). REVERSÃO fora da pasta das migrations (estar aqui é ser aplicada):
-- mudelar-reverter-onda7.sql, guardado com o trabalho; repõe só o que ainda está com o valor desta onda. Para a aplicar,
-- entra como uma migration nova.
--
-- ORDEM: depois de 20270129900000 (onda 6, a última no remoto RH a 27/11). `supabase db push` aplica TUDO o que estiver
-- pendente: listar com `supabase migration list --linked` imediatamente antes e empurrar só esta (`db push --dry-run` lista
-- só esta).
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ─── 1. As listas fechadas (tabelas temporárias: desaparecem no COMMIT) ─────────────────────────────
-- A: as linhas de preço dos 12 produtos, com o tipo e o preço lidos, o IVA de agora (de) e o do Excel (para)
CREATE TEMP TABLE _o7_iva (id uuid PRIMARY KEY, product_id uuid NOT NULL, sku text NOT NULL, price_type text NOT NULL,
  price numeric NOT NULL, de numeric NOT NULL, para numeric NOT NULL, linha_excel text NOT NULL) ON COMMIT DROP;
INSERT INTO _o7_iva (id, product_id, sku, price_type, price, de, para, linha_excel) VALUES
  ('cc8eb574-d9f4-454e-88aa-a8a8403b6b47', 'ce7aafb9-e43b-424f-bed9-5d5cdbf828fa', 'LS-KS-0002-P-M', 'purchase', 30.00, 23, 24, 'LSKS0002PM'),
  ('c73119d2-3a6d-4893-91fc-c3abc982a509', 'ce7aafb9-e43b-424f-bed9-5d5cdbf828fa', 'LS-KS-0002-P-M', 'retail', 60.00, 23, 24, 'LSKS0002PM'),
  ('354c735e-97ad-4ea4-8a93-2d4f8e038259', 'b1fe849f-1e0c-48db-b45e-f07b700817c5', 'LS-KS-0003-CRD', 'purchase', 18.00, 23, 25, 'LSKS0003CR'),
  ('e535dcea-6a16-4290-8ee6-ebab9f81c424', 'b1fe849f-1e0c-48db-b45e-f07b700817c5', 'LS-KS-0003-CRD', 'retail', 36.00, 23, 25, 'LSKS0003CR'),
  ('61d725c0-0743-428a-b3fc-a22cd2c79745', '6ed23aa4-d952-4c8d-ab95-0420904c5dd9', 'LS-KS-0003-D', 'purchase', 106.00, 23, 29, 'LSKS0003OR'),
  ('2f3bd1c1-4137-434b-b2a7-1f58313dba11', '6ed23aa4-d952-4c8d-ab95-0420904c5dd9', 'LS-KS-0003-D', 'retail', 212.00, 23, 29, 'LSKS0003OR'),
  ('e380e96d-815d-4fb9-9e34-2ca8b242c5ef', 'a23327e6-1da1-43b3-bf61-a47ee6ebd7d6', 'LS-KS-0003-D-M', 'purchase', 50.00, 23, 30, 'LSKS0003DM'),
  ('218ab436-3626-4966-bde7-ac810d6a187c', 'a23327e6-1da1-43b3-bf61-a47ee6ebd7d6', 'LS-KS-0003-D-M', 'retail', 100.00, 23, 30, 'LSKS0003DM'),
  ('d1b64b7f-ee1c-4fe2-9e4d-01ff8ef47b93', 'e0a59f2a-1714-4968-a5d6-e575a9864d97', 'LS-KS-0003-GMT', 'purchase', 50.00, 23, 27, 'LSKS0003GM'),
  ('601c4c4e-944c-4f5d-9fbb-467ac11735bd', 'e0a59f2a-1714-4968-a5d6-e575a9864d97', 'LS-KS-0003-GMT', 'retail', 100.00, 23, 27, 'LSKS0003GM'),
  ('1fa297d5-d03c-4bc8-8c4b-53576d610569', '7946e811-b1d5-4f5d-a2cd-a294404b78c4', 'LS-KS-0003-P-M', 'purchase', 27.00, 23, 28, 'LSKS0003PM'),
  ('2ac97e9a-20ba-4190-b397-e5942930f233', '7946e811-b1d5-4f5d-a2cd-a294404b78c4', 'LS-KS-0003-P-M', 'retail', 54.00, 23, 28, 'LSKS0003PM'),
  ('cb63b720-8e5a-41cf-bf91-19eba8782264', '8d282827-0236-4a24-b750-a4476861f6c9', 'LS-KS-0003-RG', 'purchase', 50.00, 23, 26, 'LSKS0003RG'),
  ('9eac325a-e379-4ac1-a87b-8bee42e945e7', '8d282827-0236-4a24-b750-a4476861f6c9', 'LS-KS-0003-RG', 'retail', 100.00, 23, 26, 'LSKS0003RG'),
  ('ecf9e079-502c-4ca6-8c69-cb9c36656078', '06d20fe4-95d0-4bb2-99c5-f23312e86ca5', 'LS-KS-0004-B-M', 'purchase', 16.00, 23, 31, 'LSKS0004BM'),
  ('c2f7e917-f66e-4a61-875d-52a4be7d620b', '06d20fe4-95d0-4bb2-99c5-f23312e86ca5', 'LS-KS-0004-B-M', 'retail', 32.00, 23, 31, 'LSKS0004BM'),
  ('c02aac64-0dc4-40d9-9901-c13575485abc', '27bdfd46-ef0a-4b2e-b20b-bbc6f2321731', 'LS-KS-0004-CRD', 'purchase', 18.00, 23, 32, 'LSKS0004CR'),
  ('3b821b58-5f43-4ac1-9a23-be8ab582c1a8', '27bdfd46-ef0a-4b2e-b20b-bbc6f2321731', 'LS-KS-0004-CRD', 'retail', 36.00, 23, 32, 'LSKS0004CR'),
  ('e82cdee5-56d7-4e3e-9963-53f5353a42cb', '9ccfe22e-22f8-4f17-9909-8f19e5d3894c', 'LS-KS-0004-D', 'purchase', 106.00, 23, 32, 'LSKS0004OR'),
  ('37315ad8-7af8-494e-a236-51d1501a4c5b', '9ccfe22e-22f8-4f17-9909-8f19e5d3894c', 'LS-KS-0004-D', 'retail', 212.00, 23, 32, 'LSKS0004OR'),
  ('732b3657-040e-4ec2-8b37-afc3ac562e96', 'a5d00aeb-12af-4c84-b31d-8a8dd94a3876', 'LS-KS-0004-P-M', 'purchase', 27.00, 23, 32, 'LSKS0004PM'),
  ('2ea3c447-ba9f-49a9-bff5-2b69f20f27f7', 'a5d00aeb-12af-4c84-b31d-8a8dd94a3876', 'LS-KS-0004-P-M', 'retail', 54.00, 23, 32, 'LSKS0004PM'),
  ('b14cff4f-676b-4823-b083-8391f6beabe1', '6b09503c-1884-4917-847c-79c8668f9922', 'LS-KS-0004-PG', 'purchase', 50.00, 23, 32, 'LSKS0004PG'),
  ('b9dacb77-7a63-47dd-bbc1-29bf1b49b6a9', '6b09503c-1884-4917-847c-79c8668f9922', 'LS-KS-0004-PG', 'retail', 100.00, 23, 32, 'LSKS0004PG');
-- B: os nomes (de = o da base lido a 27/11, para = o do Excel)
CREATE TEMP TABLE _o7_nome (id uuid PRIMARY KEY, sku text NOT NULL, de text NOT NULL, para text NOT NULL, linha_excel text NOT NULL) ON COMMIT DROP;
INSERT INTO _o7_nome (id, sku, de, para, linha_excel) VALUES
  ('b03d6e45-487a-4adf-bd93-95b24fd05303', 'EL-MLL-0001-45', 'MÁQUINA DE LAVAR LOUÇA BALAY 45CM', 'MÁQUINA DE LAVAR LOUÇA BALAY - 3VT4031NA - 45CM', 'EMLL0008'),
  ('aa35a10d-b228-418d-933a-13fcb8f2a64b', 'EL-MLL-0004-45', 'Máquina lavar loiça INDESIT 45CM', 'Máquina lavar loiça INDESIT 45CM- IN2FD10CS70W', 'EMLL0007'),
  ('98b724e0-72dd-4b56-9255-e71a969d8c83', 'EL-PL-0001-80', 'PLACA COM EXAUSTOR INTGRADO AEG 80CM', 'PLACA COM EXAUSTOR INTGRADO AEG - TH84CB03FB 80CM', 'EP0012'),
  ('0e4d7311-8c06-4757-b70f-3376404f7736', 'MCC-AC-0018-528X545MM', 'ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE', 'ESTRUTURA LAUNDRY CARRIER 500 940TUL0000004 3270821 2X33L 528MM ALT 545MM ANTRACITE', 'MCCAC0018'),
  ('43fa1f61-25b8-4990-bf50-b800e3f74e22', 'TM-MMG-0002-GRF', 'Misturadoras Monocomando Giratoria SOPHIE Metal Edition Grafite', 'Misturadoras Monocomando Giratoria SOPHIE Metal Edition Grafite (cod. GN)', 'TMMMG00001MGN');
-- C: as medidas que a onda 6 deu aos tampos NNNx4x46 (id do valor, produto, SKU)
CREATE TEMP TABLE _o7_attr (id uuid PRIMARY KEY, product_id uuid NOT NULL UNIQUE, sku text NOT NULL) ON COMMIT DROP;
INSERT INTO _o7_attr (id, product_id, sku) VALUES
  ('353771cb-4937-43f8-849f-0321b403b835', 'fb50e400-b95e-504a-a910-8c4581e7c620', 'MACBTB0002100X4X46'),
  ('fa735d11-3e94-4561-9a22-50f4c8df4e93', '8f04a1bf-05ec-5b1b-8ff9-9b392f448eda', 'MACBTB0002120X4X46'),
  ('f32f5213-9c55-48da-95fd-6888f19052a9', '6e367026-4383-5d68-aa17-b8554e66a001', 'MACBTB0002140X4X46'),
  ('e36916af-ae96-4d33-886a-81685df0492f', '146edeca-6c5b-56f1-968b-47e26a7854d1', 'MACBTB0002150X4X46'),
  ('309478a2-8ce1-49b1-bf33-c8067136c9aa', '9788446a-96de-5086-a962-7c7ba70cef2b', 'MACBTB0002160X4X46'),
  ('1286e70e-6a87-49cf-9e32-8759f3d6b4da', 'a60f9fe9-bb12-558b-8b9f-dd3d9b058473', 'MACBTB0002170X4X46'),
  ('41b66254-9b34-4f04-98db-5dee11db626b', 'c9402729-4dcc-524c-b75a-05b8dc1597f8', 'MACBTB0002180X4X46'),
  ('08a5dbd6-08f2-4372-8649-01f767568b20', '0da61d17-4634-5109-857b-bb8218d96569', 'MACBTB000260X4X46'),
  ('83c7949b-5644-4553-8ca1-0ac1df1b0038', 'f52c526c-e606-56e5-aa30-47a5f75e56fb', 'MACBTB000280X4X46'),
  ('c30e8a8d-b158-4292-9a32-7b862fae5a0d', '9083124e-48c4-595a-866f-b3fb1a3de1bb', 'MACBTB0004100X4X46-LB'),
  ('9cd9cc2b-ab1f-48fc-b01a-30c033ff854d', '5e878db4-8318-55fb-93a7-9517d2762100', 'MACBTB0004100X4X46-ME'),
  ('b682b26f-c34f-4690-abf3-0b598d85a097', 'a85f73d7-1032-599e-8dee-7e9fa5ae632a', 'MACBTB0004120X4X46-LB'),
  ('bc46bdcd-58cb-40b0-991f-1d764f53abd5', '481d0415-a922-5f12-8ec9-39477796c7af', 'MACBTB0004120X4X46-ME'),
  ('dea5d13a-ab09-4f67-84b9-84da10d665c3', '5ddfaaef-4020-56f2-917e-33fcf24c2fa4', 'MACBTB0004140X4X46-LB'),
  ('7133fdea-9a7e-4723-a6b7-a2c74a0d7cb0', 'c4fda3a1-eb57-556d-ae58-71275eeefdc0', 'MACBTB0004140X4X46-ME'),
  ('3855dc63-3566-4494-86f3-5055d921bdd7', 'c80ebb19-8a83-5e47-82cc-1e8eb9b4f83c', 'MACBTB0004150X4X46-LB'),
  ('3dbad93e-9593-477d-b8d7-afe9e2386dfc', '9e2f126e-ab49-53e9-a4d7-14e983b9c09a', 'MACBTB0004150X4X46-ME'),
  ('91ffea01-6787-43b0-9d37-a502bb3f238f', 'db5aa5b5-c6d3-5a5e-ae74-c961648cf482', 'MACBTB0004160X4X46-LB'),
  ('0914bf4a-2841-4451-a81d-db4599ee7649', '05c1d2ba-d25d-579d-bb41-9ab76947a1f8', 'MACBTB0004160X4X46-ME'),
  ('20cd3d77-95b3-4d9e-9bc7-5667309740d0', '938f01be-4cc2-51c9-9381-23766893b9e1', 'MACBTB0004170X4X46-LB'),
  ('a6bb0fe6-297e-453e-8404-258413d60d0e', 'e033b3c6-a8ee-58a9-8713-96090fec2995', 'MACBTB0004170X4X46-ME'),
  ('43edc8d3-0b5f-4f16-b4ef-75877bfa059a', '888709cf-6599-5721-b8e5-10be87cfed71', 'MACBTB0004180X4X46-LB'),
  ('7ff5e7b6-4361-4971-96fb-6294c2e50ba7', '47022e74-c461-57e7-aaac-f91d3968ddf1', 'MACBTB0004180X4X46-ME'),
  ('ffe13db1-2892-48de-b1d3-92bcc1143046', 'ba843ca2-cada-52b4-83cc-010ad341bdb7', 'MACBTB000460X4X46-LB'),
  ('c825e5f9-fa7d-4a51-95fc-ddc81ac47185', '11a3fecd-9b4e-5a83-b30a-07b0968b4f26', 'MACBTB000460X4X46-ME'),
  ('b17c1749-3f8c-430a-aabb-fae805dc11cf', 'bb069eab-139a-5623-b7e0-bcb322d79a23', 'MACBTB000480X4X46-LB'),
  ('f41dbeef-f503-43be-a7dc-7d44d9450fa8', '406262bd-6d3c-5a73-ac63-31908693cf93', 'MACBTB000480X4X46-ME');
-- D: o produto do par que se arquiva, o que fica, e a ligação a fornecedor do arquivado
CREATE TEMP TABLE _o7_arq (id uuid PRIMARY KEY, sku text NOT NULL, fica_id uuid NOT NULL, fica_sku text NOT NULL, isup_id uuid NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO _o7_arq (id, sku, fica_id, fica_sku, isup_id) VALUES
  ('ba20b7f4-74d7-5aa0-b1e2-94f73d642891', 'MACBML0162', '8f72daab-4e4b-51ec-846b-6fe332b3989a', 'MACBML0161', 'a5b26ec8-f9e8-4166-b42f-c23dab3c9b59');

-- ─── 2. Guardas, cópia, escrita e conferências (um só bloco: tudo ou nada) ──────────────────────────
DO $mig$
DECLARE
  c_org           constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_criador       constant uuid    := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  c_fonte         constant text    := 'migration:mudelar_excel_onda7';
  c_n_mudelar     constant integer := 32150;
  c_n_cons        constant integer := 145;
  c_n_fam         constant integer := 548;
  c_n_membros     constant integer := 14637;
  c_n_iva         constant integer := 24;
  c_n_iva_prod    constant integer := 12;
  c_n_nome        constant integer := 5;
  c_n_attr        constant integer := 27;
  c_n_arq         constant integer := 1;
  v_n bigint; v_m bigint; v_arq_antes bigint; v_isup_vivas bigint; v_attr_total bigint;
  v_f_iva bigint; v_f_nome bigint; v_f_attr bigint; v_f_arq bigint;
  v_txt text; v_acl text; v_xid text; v_t text;
  v_h_sku_antes text;   v_h_sku_depois text;
  v_h_out_antes text;   v_h_out_depois text;
  v_h_preco_antes text; v_h_preco_depois text;
  v_h_isup_antes text;  v_h_isup_depois text;
  v_h_attr_antes text;  v_h_attr_depois text;
  v_h_cod_antes text;   v_h_cod_depois text;
  v_h_fam_antes text;   v_h_fam_depois text;
  v_h_docs_antes text;  v_h_docs_depois text;
BEGIN
  -- G0: só a Mudelar da base de RH, depois da onda 6
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'mudelar_excel_onda7: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('_mudelar_excel.onda6_atributos_novos') IS NULL THEN
    RAISE NOTICE 'mudelar_excel_onda7: a cópia da onda 6 (_mudelar_excel.onda6_atributos_novos) não existe nesta base — nada a fazer.';
    RETURN;
  END IF;

  -- L1: as listas embutidas têm os números do cabeçalho e não se cruzam
  IF (SELECT count(*) FROM _o7_iva) <> c_n_iva OR (SELECT count(DISTINCT x.product_id) FROM _o7_iva x) <> c_n_iva_prod
     OR (SELECT count(*) FROM _o7_nome) <> c_n_nome OR (SELECT count(*) FROM _o7_attr) <> c_n_attr OR (SELECT count(*) FROM _o7_arq) <> c_n_arq THEN
    RAISE EXCEPTION 'L1: as listas não têm % linhas de preço de % produtos, % nomes, % atributos e % arquivo.', c_n_iva, c_n_iva_prod, c_n_nome, c_n_attr, c_n_arq;
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT z.id FROM (
      SELECT DISTINCT x.product_id AS id FROM _o7_iva x UNION ALL SELECT x.id FROM _o7_nome x
      UNION ALL SELECT x.product_id FROM _o7_attr x UNION ALL SELECT x.id FROM _o7_arq x UNION ALL SELECT x.fica_id FROM _o7_arq x) z
    GROUP BY z.id HAVING count(*) > 1) d;
  IF v_n > 0 THEN RAISE EXCEPTION 'L1: % produtos estão em mais do que uma frente.', v_n; END IF;

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', c_criador::text, true);
  -- o lock das funções das famílias do ecrã, e os produtos e a ligação presos até ao fim, por ordem fixa
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_familias:' || c_org::text, 0));
  PERFORM 1 FROM products p WHERE p.id IN (
    SELECT x.product_id FROM _o7_iva x UNION SELECT x.id FROM _o7_nome x UNION SELECT x.product_id FROM _o7_attr x
    UNION SELECT x.id FROM _o7_arq x UNION SELECT x.fica_id FROM _o7_arq x) ORDER BY p.id FOR NO KEY UPDATE;
  PERFORM 1 FROM item_suppliers i WHERE i.id IN (SELECT x.isup_id FROM _o7_arq x) ORDER BY i.id FOR NO KEY UPDATE;

  -- já aplicada? (todas as frentes com o valor desta onda e a cópia existe); a meio, falha
  SELECT count(*) INTO v_f_iva FROM _o7_iva x JOIN product_prices pp ON pp.id = x.id WHERE pp.vat_rate = x.para;
  SELECT count(*) INTO v_f_nome FROM _o7_nome x JOIN products p ON p.id = x.id WHERE p.organization_id = c_org AND p.name = x.para;
  SELECT count(*) INTO v_f_attr FROM _o7_attr x WHERE NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.id = x.id);
  SELECT count(*) INTO v_f_arq FROM _o7_arq x JOIN products p ON p.id = x.id
  WHERE p.organization_id = c_org AND p.is_deleted AND p.deleted_by = c_criador;
  IF v_f_iva = c_n_iva AND v_f_nome = c_n_nome AND v_f_attr = c_n_attr AND v_f_arq = c_n_arq
     AND to_regclass('_mudelar_excel.onda7_produtos') IS NOT NULL THEN
    RAISE NOTICE 'mudelar_excel_onda7: já aplicada (IVA, nomes, medidas e arquivo com os valores desta onda) — nada a fazer.';
    RETURN;
  END IF;
  IF v_f_iva > 0 OR v_f_nome > 0 OR v_f_attr > 0 OR v_f_arq > 0
     OR to_regclass('_mudelar_excel.onda7_produtos') IS NOT NULL OR to_regclass('_mudelar_excel.onda7_precos') IS NOT NULL
     OR to_regclass('_mudelar_excel.onda7_atributos') IS NOT NULL OR to_regclass('_mudelar_excel.onda7_item_suppliers') IS NOT NULL THEN
    RAISE EXCEPTION 'mudelar_excel_onda7: estado a meio: IVA % de %, nomes % de %, medidas apagadas % de %, arquivo % de %, ou a cópia já existe.',
      v_f_iva, c_n_iva, v_f_nome, c_n_nome, v_f_attr, c_n_attr, v_f_arq, c_n_arq;
  END IF;

  -- G1: contagens de partida
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  IF v_n <> c_n_mudelar THEN RAISE EXCEPTION 'G1: a Mudelar tem % produtos vivos e esperavam-se %.', v_n, c_n_mudelar; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku LIKE 'CONS-%';
  IF v_n <> c_n_cons THEN RAISE EXCEPTION 'G1: a Mudelar tem % consumíveis vivos e esperavam-se %.', v_n, c_n_cons; END IF;
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'G1: a Mudelar tem % famílias e % membros; esperavam-se % e %.', v_n, v_m, c_n_fam, c_n_membros;
  END IF;
  SELECT count(*) INTO v_arq_antes FROM products p WHERE p.organization_id = c_org AND (p.is_deleted OR p.deleted_at IS NOT NULL);
  SELECT count(*) INTO v_isup_vivas FROM item_suppliers i WHERE i.organization_id = c_org AND i.deleted_at IS NULL;
  SELECT count(*) INTO v_attr_total FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;

  -- G2 (A): cada linha de preço com o tipo, o preço e o IVA lidos; e são as únicas linhas de preço destes produtos
  SELECT count(*) INTO v_n FROM _o7_iva x
  JOIN product_prices pp ON pp.id = x.id JOIN products p ON p.id = pp.product_id
  WHERE pp.product_id = x.product_id AND p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku = x.sku
    AND pp.price_type::text = x.price_type AND pp.price = x.price AND pp.vat_rate = x.de;
  IF v_n <> c_n_iva THEN
    SELECT string_agg(x.sku || ' ' || x.price_type, '; ' ORDER BY x.sku, x.price_type) INTO v_txt FROM _o7_iva x
    LEFT JOIN product_prices pp ON pp.id = x.id
    WHERE pp.id IS NULL OR pp.price IS DISTINCT FROM x.price OR pp.vat_rate IS DISTINCT FROM x.de OR pp.price_type::text <> x.price_type;
    RAISE EXCEPTION 'G2: só % de % linhas de preço estão como lidas a 27/11. Fora do esperado: %', v_n, c_n_iva, coalesce(v_txt, '(produto ou SKU)');
  END IF;
  SELECT count(*) INTO v_n FROM product_prices pp WHERE pp.product_id IN (SELECT x.product_id FROM _o7_iva x);
  IF v_n <> c_n_iva THEN RAISE EXCEPTION 'G2: os % produtos têm % linhas de preço; esperavam-se %.', c_n_iva_prod, v_n, c_n_iva; END IF;

  -- G3 (B): cada produto vivo da Mudelar, com o SKU e o nome lidos
  SELECT count(*) INTO v_n FROM _o7_nome x JOIN products p ON p.id = x.id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku = x.sku AND p.name = x.de;
  IF v_n <> c_n_nome THEN
    SELECT string_agg(x.sku, '; ' ORDER BY x.sku) INTO v_txt FROM _o7_nome x LEFT JOIN products p ON p.id = x.id
    WHERE p.id IS NULL OR p.name IS DISTINCT FROM x.de OR p.is_deleted OR p.sku IS DISTINCT FROM x.sku;
    RAISE EXCEPTION 'G3: só % de % produtos têm o nome lido a 27/11. Fora do esperado: %', v_n, c_n_nome, coalesce(v_txt, '(organização)');
  END IF;

  -- G4 (C): cada valor igual à cópia da onda 6, de «medida», o único atributo de um produto vivo sem modelo e fora de famílias
  SELECT count(*) INTO v_n FROM _o7_attr x
  JOIN product_attribute_values v ON v.id = x.id
  JOIN _mudelar_excel.onda6_atributos_novos n ON n.id = x.id
  JOIN product_attributes a ON a.id = v.attribute_id
  JOIN products p ON p.id = v.product_id
  WHERE v.product_id = x.product_id AND n.product_id = x.product_id AND to_jsonb(v) = n.linha
    AND a.code::text = 'medida' AND a.organization_id = c_org
    AND p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku = x.sku AND p.model_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM product_family_members m WHERE m.product_id = p.id)
    AND (SELECT count(*) FROM product_attribute_values v2 WHERE v2.product_id = p.id) = 1;
  IF v_n <> c_n_attr THEN
    SELECT string_agg(x.sku, '; ' ORDER BY x.sku) INTO v_txt FROM _o7_attr x LEFT JOIN product_attribute_values v ON v.id = x.id
    LEFT JOIN _mudelar_excel.onda6_atributos_novos n ON n.id = x.id
    WHERE v.id IS NULL OR n.id IS NULL OR to_jsonb(v) IS DISTINCT FROM n.linha;
    RAISE EXCEPTION 'G4: só % de % medidas estão como a onda 6 as escreveu, sozinhas num produto sem modelo nem família. Fora do esperado: %', v_n, c_n_attr, coalesce(v_txt, '(produto)');
  END IF;

  -- G5 (D): os dois do par vivos e iguais (products sem id, sku e updated_at; preços; atributos; ligações vivas)
  SELECT count(*) INTO v_n FROM _o7_arq x JOIN products a ON a.id = x.id JOIN products k ON k.id = x.fica_id
  WHERE a.organization_id = c_org AND k.organization_id = c_org AND a.sku = x.sku AND k.sku = x.fica_sku
    AND NOT a.is_deleted AND a.deleted_at IS NULL AND NOT k.is_deleted AND k.deleted_at IS NULL
    AND (to_jsonb(a) - ARRAY['id', 'sku', 'updated_at']) = (to_jsonb(k) - ARRAY['id', 'sku', 'updated_at'])
    AND (SELECT string_agg(z, ',' ORDER BY z) FROM (SELECT pp.price_type::text || '|' || pp.price::text || '|' || coalesce(pp.vat_rate::text, '')
           || '|' || pp.currency::text || '|' || coalesce(pp.preco_exato::text, '') AS z FROM product_prices pp WHERE pp.product_id = a.id) s)
      = (SELECT string_agg(z, ',' ORDER BY z) FROM (SELECT pp.price_type::text || '|' || pp.price::text || '|' || coalesce(pp.vat_rate::text, '')
           || '|' || pp.currency::text || '|' || coalesce(pp.preco_exato::text, '') AS z FROM product_prices pp WHERE pp.product_id = k.id) s)
    AND (SELECT string_agg(z, ',' ORDER BY z) FROM (SELECT v.attribute_id::text || '|' || coalesce(v.value_text, '') || '|' || coalesce(v.value_json::text, '')
           || '|' || coalesce(v.unit, '') AS z FROM product_attribute_values v WHERE v.product_id = a.id) s)
      = (SELECT string_agg(z, ',' ORDER BY z) FROM (SELECT v.attribute_id::text || '|' || coalesce(v.value_text, '') || '|' || coalesce(v.value_json::text, '')
           || '|' || coalesce(v.unit, '') AS z FROM product_attribute_values v WHERE v.product_id = k.id) s)
    AND (SELECT string_agg(z, ',' ORDER BY z) FROM (SELECT i.supplier_id::text || '|' || coalesce(i.supplier_sku, '') || '|' || coalesce(i.purchase_price::text, '')
           || '|' || i.is_preferred::text AS z FROM item_suppliers i WHERE i.product_id = a.id AND i.deleted_at IS NULL) s)
      = (SELECT string_agg(z, ',' ORDER BY z) FROM (SELECT i.supplier_id::text || '|' || coalesce(i.supplier_sku, '') || '|' || coalesce(i.purchase_price::text, '')
           || '|' || i.is_preferred::text AS z FROM item_suppliers i WHERE i.product_id = k.id AND i.deleted_at IS NULL) s);
  IF v_n <> c_n_arq THEN
    RAISE EXCEPTION 'G5: só % de % pares são o mesmo artigo (produto, preços, atributos e fornecedor iguais, os dois vivos).', v_n, c_n_arq;
  END IF;
  -- G5: o arquivado tem uma só ligação viva (a da lista, preferencial)
  SELECT count(*) INTO v_n FROM item_suppliers i WHERE i.product_id IN (SELECT x.id FROM _o7_arq x) AND i.deleted_at IS NULL;
  SELECT count(*) INTO v_m FROM _o7_arq x JOIN item_suppliers i ON i.id = x.isup_id
  WHERE i.product_id = x.id AND i.organization_id = c_org AND i.deleted_at IS NULL AND i.is_preferred;
  IF v_n <> c_n_arq OR v_m <> c_n_arq THEN
    RAISE EXCEPTION 'G5: o arquivado tem % ligações vivas e % da lista viva e preferencial; esperava-se % e %.', v_n, v_m, c_n_arq, c_n_arq;
  END IF;
  -- G5: o arquivado não tem referências (documentos, receitas, famílias, stock, encomendas, modelos, pacotes, configuradores...)
  SELECT (SELECT count(*) FROM quote_lines t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM negocio_produtos t WHERE t.produto_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM purchase_order_items t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM purchase_order_receipts t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM receiving_scans t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM supplier_delivery_note_lines t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM stock_movements t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM product_family_members t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM service_materials t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM negocio_vista_cliente t, _o7_arq x WHERE t.organization_id = c_org AND strpos(t.vista::text, x.id::text) > 0)
       + (SELECT count(*) FROM deal_need_items t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM deal_need_diagnostic_materials t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM ops_custo t WHERE t.produto_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM quote_template_items t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM quote_suggestion_rules t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM quote_diagnostic_area_suggestions t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM bundle_components t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM product_config_slot_options t WHERE t.component_product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM product_configuration_templates t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM cat_config_3d t WHERE t.produto_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM adenda_linha_materiais t WHERE t.produto_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM neg_linha_modelo_materiais t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM direct_sale_lines t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM inventory_count_lines t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM fleet_restock_requests t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM supplier_price_change_requests t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM orcamento_linhas t WHERE t.produto_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM quote_versao_produtos t WHERE t.produto_id IN (SELECT x.id FROM _o7_arq x))
       + (SELECT count(*) FROM stocks t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x) AND t.quantity > 0)
       + (SELECT count(*) FROM product_stock t WHERE t.product_id IN (SELECT x.id FROM _o7_arq x) AND t.qty_available > 0)
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'G5: o produto a arquivar tem % referências (documentos, receitas, famílias, stock ou outras).', v_n; END IF;

  -- G6: o utilizador da auditoria existe e é membro ativo da Mudelar; a auditoria dos gatilhos está ligada
  IF NOT EXISTS (SELECT 1 FROM anew_users u WHERE u.id = c_criador AND u.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM anew_memberships ms WHERE ms.user_id = c_criador AND ms.organization_id = c_org AND ms.status = 'active') THEN
    RAISE EXCEPTION 'G6: o utilizador % não existe em anew_users, está apagado ou não é membro ativo da Mudelar.', c_criador;
  END IF;
  IF coalesce(current_setting('app.audit_bypass', true), '') = 'on' THEN
    RAISE EXCEPTION 'G6: app.audit_bypass já está ligado antes da escrita.';
  END IF;

  -- ─── impressões digitais de partida (sem updated_at; sem as linhas que esta onda escreve) ──────────
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_antes FROM products p WHERE p.organization_id = c_org;
  SELECT md5(string_agg(md5((to_jsonb(p) - 'updated_at')::text), '' ORDER BY p.id)) INTO v_h_out_antes
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT x.id FROM _o7_nome x UNION SELECT x.id FROM _o7_arq x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_antes
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org AND pp.id NOT IN (SELECT x.id FROM _o7_iva x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_antes
  FROM item_suppliers i JOIN products p ON p.id = i.product_id WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.isup_id FROM _o7_arq x);
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')) INTO v_h_attr_antes
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org AND v.id NOT IN (SELECT x.id FROM _o7_attr x);
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_cod_antes FROM (
    SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM product_codes t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'o' || md5((to_jsonb(t) - 'updated_at')::text) FROM product_organizations t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'h' || md5(to_jsonb(t)::text) FROM product_price_history t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org) z;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_antes FROM (
    SELECT 'f' || md5((to_jsonb(f) - 'updated_at')::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_antes FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5(to_jsonb(t)::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'r' || md5(to_jsonb(t)::text) FROM purchase_order_receipts t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'e' || md5(to_jsonb(t)::text) FROM receiving_scans t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'g' || md5(to_jsonb(t)::text) FROM supplier_delivery_note_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(t)::text) FROM stock_movements t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;

  -- ─── 3. Cópia do estado antigo (schema privado, só postgres) ───────────────────────────────────────
  CREATE SCHEMA IF NOT EXISTS _mudelar_excel;
  REVOKE ALL ON SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  CREATE TABLE _mudelar_excel.onda7_precos (id uuid PRIMARY KEY, product_id uuid NOT NULL, para numeric NOT NULL, linha jsonb NOT NULL,
    copiado_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE _mudelar_excel.onda7_produtos (id uuid PRIMARY KEY, frente text NOT NULL, para text, linha jsonb NOT NULL,
    copiado_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE _mudelar_excel.onda7_atributos (id uuid PRIMARY KEY, product_id uuid NOT NULL, linha jsonb NOT NULL,
    copiado_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE _mudelar_excel.onda7_item_suppliers (id uuid PRIMARY KEY, product_id uuid NOT NULL, linha jsonb NOT NULL,
    copiado_em timestamptz NOT NULL DEFAULT now());
  REVOKE ALL ON ALL TABLES IN SCHEMA _mudelar_excel FROM PUBLIC, anon, authenticated, service_role;
  INSERT INTO _mudelar_excel.onda7_precos (id, product_id, para, linha)
  SELECT pp.id, pp.product_id, x.para, to_jsonb(pp) FROM product_prices pp JOIN _o7_iva x ON x.id = pp.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_iva THEN RAISE EXCEPTION 'B1: % linhas de preço copiadas, esperadas %.', v_n, c_n_iva; END IF;
  INSERT INTO _mudelar_excel.onda7_produtos (id, frente, para, linha)
  SELECT p.id, 'B', x.para, to_jsonb(p) FROM products p JOIN _o7_nome x ON x.id = p.id
  UNION ALL SELECT p.id, 'D', NULL, to_jsonb(p) FROM products p JOIN _o7_arq x ON x.id = p.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_nome + c_n_arq THEN RAISE EXCEPTION 'B1: % produtos copiados, esperados %.', v_n, c_n_nome + c_n_arq; END IF;
  INSERT INTO _mudelar_excel.onda7_atributos (id, product_id, linha)
  SELECT v.id, v.product_id, to_jsonb(v) FROM product_attribute_values v JOIN _o7_attr x ON x.id = v.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'B1: % atributos copiados, esperados %.', v_n, c_n_attr; END IF;
  INSERT INTO _mudelar_excel.onda7_item_suppliers (id, product_id, linha)
  SELECT i.id, i.product_id, to_jsonb(i) FROM item_suppliers i JOIN _o7_arq x ON x.isup_id = i.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_arq THEN RAISE EXCEPTION 'B1: % ligações copiadas, esperadas %.', v_n, c_n_arq; END IF;

  -- ─── 4. Escrita ────────────────────────────────────────────────────────────────────────────────────
  -- W1 (A): a taxa de IVA nas linhas de preço (o preço não muda: log_product_price_change não escreve; auditoria do gatilho)
  UPDATE product_prices pp SET vat_rate = x.para FROM _o7_iva x
  WHERE pp.id = x.id AND pp.product_id = x.product_id AND pp.vat_rate = x.de;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_iva THEN RAISE EXCEPTION 'W1: % linhas de preço com o IVA do Excel, esperadas %.', v_n, c_n_iva; END IF;
  -- W2 (B): os nomes do Excel (nenhum gatilho de products reage ao nome além do updated_at e da auditoria)
  UPDATE products p SET name = x.para FROM _o7_nome x
  WHERE p.id = x.id AND p.organization_id = c_org AND p.name = x.de;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_nome THEN RAISE EXCEPTION 'W2: % nomes escritos, esperados %.', v_n, c_n_nome; END IF;
  -- W3 (C): as medidas dos tampos NNNx4x46 que a onda 6 inseriu (auditoria do gatilho, uma por valor)
  DELETE FROM product_attribute_values v USING _o7_attr x
  WHERE v.id = x.id AND v.product_id = x.product_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'W3: % medidas apagadas, esperadas %.', v_n, c_n_attr; END IF;
  -- W4 (D): arquivar o repetido e a ligação dele, como rpc_delete_product e rpc_delete_item_supplier (auditoria dos gatilhos
  -- desligada só aqui; o gatilho de preferencial limpa products.supplier_id dele)
  PERFORM set_config('app.audit_bypass', 'on', true);
  UPDATE products p SET is_deleted = true, deleted_at = now(), deleted_by = c_criador
  WHERE p.id IN (SELECT x.id FROM _o7_arq x) AND p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_arq THEN RAISE EXCEPTION 'W4: % produtos arquivados, esperados %.', v_n, c_n_arq; END IF;
  UPDATE item_suppliers i SET deleted_at = now(), deleted_by = c_criador, updated_at = now()
  WHERE i.id IN (SELECT x.isup_id FROM _o7_arq x) AND i.organization_id = c_org AND i.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_arq THEN RAISE EXCEPTION 'W4: % ligações arquivadas, esperadas %.', v_n, c_n_arq; END IF;
  PERFORM set_config('app.audit_bypass', 'off', true);
  IF current_setting('app.audit_bypass', true) <> 'off' THEN RAISE EXCEPTION 'W4: app.audit_bypass não voltou a off.'; END IF;
  -- W5: uma linha de auditoria pelo produto e outra pela ligação, iguais às das RPC
  PERFORM fn_manual_audit_log('products', x.id, c_org, 'UPDATE',
    jsonb_build_object('products', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(now())))), c_fonte)
  FROM _o7_arq x;
  PERFORM fn_manual_audit_log('item_suppliers', x.isup_id, c_org, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', NULL, 'new', to_jsonb(c_criador))), c_fonte)
  FROM _o7_arq x;

  -- ─── 5. Conferências ──────────────────────────────────────────────────────────────────────────────
  -- C1 (A): só mudou a taxa de IVA, para a do Excel
  SELECT count(*) INTO v_n FROM _o7_iva x JOIN product_prices pp ON pp.id = x.id JOIN _mudelar_excel.onda7_precos b ON b.id = x.id
  WHERE pp.vat_rate = x.para AND (to_jsonb(pp) - ARRAY['updated_at', 'vat_rate']) = (b.linha - ARRAY['updated_at', 'vat_rate']);
  IF v_n <> c_n_iva THEN RAISE EXCEPTION 'C1: % de % linhas de preço ficaram só com o IVA do Excel.', v_n, c_n_iva; END IF;
  -- C1 (B): só mudou o nome, para o do Excel
  SELECT count(*) INTO v_n FROM _o7_nome x JOIN products p ON p.id = x.id JOIN _mudelar_excel.onda7_produtos b ON b.id = x.id
  WHERE p.name = x.para AND (to_jsonb(p) - ARRAY['updated_at', 'name']) = (b.linha - ARRAY['updated_at', 'name']);
  IF v_n <> c_n_nome THEN RAISE EXCEPTION 'C1: % de % produtos ficaram só com o nome do Excel.', v_n, c_n_nome; END IF;
  -- C1 (C): as medidas saíram e os 27 tampos ficaram sem nenhum atributo
  SELECT count(*) INTO v_n FROM product_attribute_values v WHERE v.id IN (SELECT x.id FROM _o7_attr x) OR v.product_id IN (SELECT x.product_id FROM _o7_attr x);
  IF v_n > 0 THEN RAISE EXCEPTION 'C1: os tampos ainda têm % atributos.', v_n; END IF;
  -- C1 (D): no arquivado só mudou o arquivo e o supplier_id (limpo pelo gatilho); na ligação só o arquivo; o que fica, vivo
  SELECT count(*) INTO v_n FROM _o7_arq x JOIN products p ON p.id = x.id JOIN _mudelar_excel.onda7_produtos b ON b.id = x.id
  WHERE p.is_deleted AND p.deleted_at = now() AND p.deleted_by = c_criador AND p.supplier_id IS NULL
    AND (to_jsonb(p) - ARRAY['updated_at', 'is_deleted', 'deleted_at', 'deleted_by', 'supplier_id'])
      = (b.linha - ARRAY['updated_at', 'is_deleted', 'deleted_at', 'deleted_by', 'supplier_id']);
  IF v_n <> c_n_arq THEN RAISE EXCEPTION 'C1: % de % produtos arquivados ficaram só com o arquivo.', v_n, c_n_arq; END IF;
  SELECT count(*) INTO v_n FROM _o7_arq x JOIN item_suppliers i ON i.id = x.isup_id JOIN _mudelar_excel.onda7_item_suppliers b ON b.id = x.isup_id
  WHERE i.deleted_at = now() AND i.deleted_by = c_criador
    AND (to_jsonb(i) - ARRAY['updated_at', 'deleted_at', 'deleted_by']) = (b.linha - ARRAY['updated_at', 'deleted_at', 'deleted_by']);
  IF v_n <> c_n_arq THEN RAISE EXCEPTION 'C1: % de % ligações arquivadas ficaram só com o arquivo.', v_n, c_n_arq; END IF;
  SELECT count(*) INTO v_n FROM _o7_arq x JOIN products p ON p.id = x.fica_id WHERE NOT p.is_deleted AND p.deleted_at IS NULL AND p.supplier_id IS NOT NULL;
  IF v_n <> c_n_arq THEN RAISE EXCEPTION 'C1: % de % produtos que ficam continuam vivos com fornecedor.', v_n, c_n_arq; END IF;
  -- C2: nenhum SKU da Mudelar mudou
  SELECT md5(string_agg(p.id::text || '=' || p.sku, ',' ORDER BY p.id)) INTO v_h_sku_depois FROM products p WHERE p.organization_id = c_org;
  IF v_h_sku_depois <> v_h_sku_antes THEN RAISE EXCEPTION 'C2: há SKU alterados na Mudelar.'; END IF;
  -- C3: os produtos fora de B e D ficaram iguais (estado, subcategoria e modelo incluídos); vivos e arquivados contados
  SELECT md5(string_agg(md5((to_jsonb(p) - 'updated_at')::text), '' ORDER BY p.id)) INTO v_h_out_depois
  FROM products p WHERE p.organization_id = c_org AND p.id NOT IN (SELECT x.id FROM _o7_nome x UNION SELECT x.id FROM _o7_arq x);
  IF v_h_out_depois <> v_h_out_antes THEN RAISE EXCEPTION 'C3: mudaram produtos da Mudelar que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;
  SELECT count(*) INTO v_m FROM products p WHERE p.organization_id = c_org AND (p.is_deleted OR p.deleted_at IS NOT NULL);
  IF v_n <> c_n_mudelar - c_n_arq OR v_m <> v_arq_antes + c_n_arq THEN
    RAISE EXCEPTION 'C3: a Mudelar ficou com % produtos vivos e % arquivados; esperavam-se % e %.', v_n, v_m, c_n_mudelar - c_n_arq, v_arq_antes + c_n_arq;
  END IF;
  -- C4: preços fora dos 24 iguais; códigos, organizações e histórico de preços iguais
  SELECT md5(coalesce(string_agg(md5((to_jsonb(pp) - 'updated_at')::text), '' ORDER BY pp.id), '')) INTO v_h_preco_depois
  FROM product_prices pp JOIN products p ON p.id = pp.product_id WHERE p.organization_id = c_org AND pp.id NOT IN (SELECT x.id FROM _o7_iva x);
  IF v_h_preco_depois <> v_h_preco_antes THEN RAISE EXCEPTION 'C4: mudaram preços da Mudelar que não são desta onda.'; END IF;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_cod_depois FROM (
    SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM product_codes t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'o' || md5((to_jsonb(t) - 'updated_at')::text) FROM product_organizations t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'h' || md5(to_jsonb(t)::text) FROM product_price_history t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org) z;
  IF v_h_cod_depois <> v_h_cod_antes THEN RAISE EXCEPTION 'C4: mudaram códigos, organizações ou o histórico de preços da Mudelar.'; END IF;
  -- C5: atributos fora dos 27 iguais, e menos 27 no total
  SELECT md5(coalesce(string_agg(md5((to_jsonb(v) - 'updated_at')::text), '' ORDER BY v.id), '')) INTO v_h_attr_depois
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org AND v.id NOT IN (SELECT x.id FROM _o7_attr x);
  IF v_h_attr_depois <> v_h_attr_antes THEN RAISE EXCEPTION 'C5: mudaram atributos da Mudelar que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products p ON p.id = v.product_id WHERE p.organization_id = c_org;
  IF v_n <> v_attr_total - c_n_attr THEN RAISE EXCEPTION 'C5: a Mudelar ficou com % atributos; esperavam-se %.', v_n, v_attr_total - c_n_attr; END IF;
  -- C6: ligações a fornecedores fora da do par iguais; vivas contadas
  SELECT md5(coalesce(string_agg(md5((to_jsonb(i) - 'updated_at')::text), '' ORDER BY i.id), '')) INTO v_h_isup_depois
  FROM item_suppliers i JOIN products p ON p.id = i.product_id WHERE p.organization_id = c_org AND i.id NOT IN (SELECT x.isup_id FROM _o7_arq x);
  IF v_h_isup_depois <> v_h_isup_antes THEN RAISE EXCEPTION 'C6: mudaram ligações a fornecedores que não são desta onda.'; END IF;
  SELECT count(*) INTO v_n FROM item_suppliers i WHERE i.organization_id = c_org AND i.deleted_at IS NULL;
  IF v_n <> v_isup_vivas - c_n_arq THEN RAISE EXCEPTION 'C6: a Mudelar ficou com % ligações vivas; esperavam-se %.', v_n, v_isup_vivas - c_n_arq; END IF;
  -- C7: os consumíveis vivos continuam os mesmos
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.sku LIKE 'CONS-%';
  IF v_n <> c_n_cons THEN RAISE EXCEPTION 'C7: a Mudelar ficou com % consumíveis vivos; esperavam-se %.', v_n, c_n_cons; END IF;
  -- C8: famílias intactas (contagens e impressão digital)
  SELECT count(*) INTO v_n FROM product_families f WHERE f.organization_id = c_org;
  SELECT count(*) INTO v_m FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org;
  IF v_n <> c_n_fam OR v_m <> c_n_membros THEN
    RAISE EXCEPTION 'C8: a Mudelar ficou com % famílias e % membros (eram % e %).', v_n, v_m, c_n_fam, c_n_membros;
  END IF;
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_fam_depois FROM (
    SELECT 'f' || md5((to_jsonb(f) - 'updated_at')::text) AS h FROM product_families f WHERE f.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(m)::text) FROM product_family_members m JOIN product_families f ON f.id = m.family_id WHERE f.organization_id = c_org
    UNION ALL SELECT 'a' || md5(to_jsonb(a)::text) FROM product_family_axes a JOIN product_families f ON f.id = a.family_id WHERE f.organization_id = c_org) z;
  IF v_h_fam_depois <> v_h_fam_antes THEN RAISE EXCEPTION 'C8: as famílias da Mudelar mudaram.'; END IF;
  -- C9: orçamentos, negócios, receitas, compras, receções, guias, stock e a vista do cliente iguais
  SELECT md5(coalesce(string_agg(h, '' ORDER BY h), '')) INTO v_h_docs_depois FROM (
    SELECT 'q' || md5((to_jsonb(t) - 'updated_at')::text) AS h FROM quote_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'n' || md5(to_jsonb(t)::text) FROM negocio_produtos t JOIN products p ON p.id = t.produto_id WHERE p.organization_id = c_org
    UNION ALL SELECT 's' || md5((to_jsonb(t) - 'updated_at')::text) FROM service_materials t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'c' || md5((to_jsonb(t) - 'updated_at')::text) FROM purchase_order_items t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'r' || md5(to_jsonb(t)::text) FROM purchase_order_receipts t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'e' || md5(to_jsonb(t)::text) FROM receiving_scans t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'g' || md5(to_jsonb(t)::text) FROM supplier_delivery_note_lines t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'm' || md5(to_jsonb(t)::text) FROM stock_movements t JOIN products p ON p.id = t.product_id WHERE p.organization_id = c_org
    UNION ALL SELECT 'v' || md5((to_jsonb(t) - 'atualizada_em')::text) FROM negocio_vista_cliente t WHERE t.organization_id = c_org) z;
  IF v_h_docs_depois <> v_h_docs_antes THEN RAISE EXCEPTION 'C9: mudaram documentos, receitas ou vistas da Mudelar.'; END IF;
  -- C10: nada escrito fora da Mudelar (nenhuma linha de outra organização tem o xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT (SELECT count(*) FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org)
       + (SELECT count(*) FROM product_prices x WHERE x.xmin::text = v_xid
            AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = x.product_id AND p.organization_id = c_org))
       + (SELECT count(*) FROM product_attribute_values x WHERE x.xmin::text = v_xid
            AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = x.product_id AND p.organization_id = c_org))
       + (SELECT count(*) FROM entity_audit_log x WHERE x.created_at = now() AND x.source = c_fonte AND x.organization_id IS DISTINCT FROM c_org)
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION 'C10: % linhas de outras organizações foram escritas.', v_n; END IF;
  -- C11: a cópia continua fechada (schema e tabelas sem privilégios para PUBLIC, anon, authenticated nem service_role)
  SELECT coalesce(n.nspacl::text, '') INTO v_acl FROM pg_namespace n WHERE n.nspname = '_mudelar_excel';
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
    RAISE EXCEPTION 'C11: o schema _mudelar_excel ficou aberto (%).', v_acl;
  END IF;
  FOR v_t IN SELECT c.oid::regclass::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = '_mudelar_excel' AND c.relkind::text = 'r' LOOP
    SELECT coalesce(c.relacl::text, '') INTO v_acl FROM pg_class c WHERE c.oid = to_regclass(v_t);
    IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl LIKE '%service_role=%' OR v_acl LIKE '{=%' OR v_acl LIKE '%,=%' THEN
      RAISE EXCEPTION 'C11: % ficou aberta (%).', v_t, v_acl;
    END IF;
  END LOOP;
  -- C12: as linhas de auditoria desta transação (now() = o início dela): 24 de preços, 5 de nomes, 27 de atributos, 1 + 1 do arquivo
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.table_name = 'product_prices' AND l.operation = 'UPDATE'
    AND l.entity_id IN (SELECT x.product_id FROM _o7_iva x) AND l.changed_fields ? 'vat_rate';
  IF v_n <> c_n_iva THEN RAISE EXCEPTION 'C12: % linhas de auditoria de preços, esperadas %.', v_n, c_n_iva; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.table_name = 'products' AND l.operation = 'UPDATE'
    AND l.entity_id IN (SELECT x.id FROM _o7_nome x) AND l.changed_fields ? 'name';
  IF v_n <> c_n_nome THEN RAISE EXCEPTION 'C12: % linhas de auditoria de nomes, esperadas %.', v_n, c_n_nome; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.table_name = 'product_attribute_values' AND l.operation = 'DELETE'
    AND l.entity_id IN (SELECT x.product_id FROM _o7_attr x);
  IF v_n <> c_n_attr THEN RAISE EXCEPTION 'C12: % linhas de auditoria de atributos, esperadas %.', v_n, c_n_attr; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l
  WHERE l.created_at = now() AND l.source = c_fonte AND l.changed_by = c_criador
    AND ((l.table_name = 'products' AND l.entity_id IN (SELECT x.id FROM _o7_arq x))
      OR (l.table_name = 'item_suppliers' AND l.entity_id IN (SELECT x.isup_id FROM _o7_arq x)));
  IF v_n <> 2 * c_n_arq THEN RAISE EXCEPTION 'C12: % linhas de auditoria do arquivo, esperadas %.', v_n, 2 * c_n_arq; END IF;
  SELECT count(*) INTO v_n FROM entity_audit_log l WHERE l.created_at = now() AND l.source = c_fonte;
  IF v_n <> c_n_iva + c_n_nome + c_n_attr + 2 * c_n_arq THEN
    RAISE EXCEPTION 'C12: % linhas de auditoria nesta transação, esperadas %.', v_n, c_n_iva + c_n_nome + c_n_attr + 2 * c_n_arq;
  END IF;

  RAISE NOTICE 'mudelar_excel_onda7: IVA do Excel em % linhas de preço de % produtos; % nomes do Excel; % medidas apagadas; % produto repetido arquivado.',
    c_n_iva, c_n_iva_prod, c_n_nome, c_n_attr, c_n_arq;
END $mig$;

COMMIT;
