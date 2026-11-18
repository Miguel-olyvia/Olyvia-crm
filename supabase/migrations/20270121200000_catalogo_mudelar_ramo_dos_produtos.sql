-- 17/11: ANULADA. Esta migração gravava products.catalogo_categoria_id (o ramo da árvore dos serviços) nos produtos importados da Mudelar.
-- Foi aplicada na base RH (uetjgh) a 17/11 e o gatilho trg_cat_produto_tabelas (20270117100000) mudou com ela a categoria de produto e
-- o modelo dos 29 639 produtos. A reposição está em 20270121250000_catalogo_mudelar_repor_categorias_produtos.sql.
-- O ramo de cada categoria de produto passou a viver na app (src/emylia/ramoDosProdutos.ts): esta migração não faz nada.
select 1;
