-- Eticadata · 1.º passo: descobrir onde estão as faturas, os recibos e o que está por pagar.
-- SÓ LEITURA (só SELECT sobre o catálogo do SQL Server). Correr primeiro na BD de testes da Mudelar.
-- Como: no SQL Server Management Studio, ligado a BMINVESTE-SRV\ETICADATA, ou com
--   sqlcmd -S BMINVESTE-SRV\ETICADATA -d Emp_Z004 -U <utilizador> -i 1-descobrir-tabelas.sql -o resultado-1.txt -W -s ";"
-- e enviar o resultado (resultado-1.txt) ao Claude.

USE Emp_Z004;

-- a) as tabelas com nomes de vendas, recibos, pagamentos, contas correntes e clientes, com o número de linhas
SELECT s.name AS esquema, t.name AS tabela, SUM(p.rows) AS linhas
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.name LIKE '%Venda%' OR t.name LIKE '%Vnd%' OR t.name LIKE '%Recib%' OR t.name LIKE '%Pag%'
   OR t.name LIKE '%Liquid%' OR t.name LIKE '%Pend%' OR t.name LIKE '%CC%' OR t.name LIKE '%Conta%'
   OR t.name LIKE '%Client%' OR t.name LIKE '%Entidad%' OR t.name LIKE '%Serie%' OR t.name LIKE '%TipoDoc%'
GROUP BY s.name, t.name
ORDER BY t.name;

-- b) as vistas com os mesmos nomes (o ERP às vezes já tem vistas prontas para isto)
SELECT s.name AS esquema, v.name AS vista
FROM sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id
WHERE v.name LIKE '%Venda%' OR v.name LIKE '%Recib%' OR v.name LIKE '%Pend%' OR v.name LIKE '%CC%' OR v.name LIKE '%Client%'
ORDER BY v.name;

-- c) as colunas das tabelas de vendas e de recibos/pendentes (para escrever a consulta certa no 2.º passo)
SELECT t.name AS tabela, c.column_id AS n, c.name AS coluna, ty.name AS tipo, c.max_length AS tamanho
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.name LIKE '%Venda%Cab%' OR t.name LIKE '%Recib%' OR t.name LIKE '%Pend%' OR t.name LIKE '%Liquid%'
ORDER BY t.name, c.column_id;
