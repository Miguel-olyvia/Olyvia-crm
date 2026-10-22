-- «Esta fatura já foi paga?» — só leitura.
-- Mude o número da fatura abaixo (tal como aparece no Eticadata, ex.: 'FAT 15200126/12').
-- Validado a 22/10/2026 na Emp_Z004: o fltValorPendente do cabeçalho bate com Total - recibos em 3785 de 3786 faturas FAT.
DECLARE @numero varchar(50) = 'FAT 15200126/1';

-- 1) A fatura e o estado
SELECT c.strNumero AS fatura, c.strATCUD AS atcud, c.dtmData AS data, c.dtmDataVencimento AS vencimento,
       c.strCVDNumContrib AS nif, c.strCVDNome AS cliente,
       c.fltTotal AS total, c.fltTotal - c.fltValorPendente AS pago, c.fltValorPendente AS em_falta,
       CASE WHEN c.bitAnulado = 1 THEN 'anulada'
            WHEN c.fltValorPendente <= 0.005 THEN 'paga'
            WHEN c.fltValorPendente < c.fltTotal THEN 'paga em parte'
            WHEN c.dtmDataVencimento < CAST(GETDATE() AS date) THEN 'vencida'
            ELSE 'por pagar' END AS estado
FROM Mov_Venda_Cab c
WHERE c.strNumero = @numero;

-- 2) Os recibos que a liquidaram: quando, quanto e por que meio
SELECT lc.strNumero AS recibo, lc.dtmData AS data, l.fltAtribuido AS valor,
       STUFF((SELECT DISTINCT ', ' + ISNULL(tp.strDescricao, p.strAbrevTpMovPagTes)
              FROM Mov_Liquidacao_CabPagamento p
              LEFT JOIN Tbl_Gce_Tipos_MovPag tp ON tp.strAbreviatura = p.strAbrevTpMovPagTes
              WHERE p.strCodSeccao = lc.strCodSeccao AND p.strCodExercicio = lc.strCodExercicio
                AND p.strAbrevTpDoc = lc.strAbrevTpDoc AND p.intNumero = lc.intNumero
              FOR XML PATH('')), 1, 2, '') AS meio
FROM Mov_Venda_Cab c
JOIN Mov_Liquidacao_Lin l ON l.strCodSeccaoPend = c.strCodSeccao AND l.strAbrevTpDocPend = c.strAbrevTpDoc
     AND l.strCodExercicioPend = c.strCodExercicio AND l.intNumeroPend = c.intNumero AND l.bitAnulado = 0
JOIN Mov_Liquidacao_Cab lc ON lc.strCodSeccao = l.strCodSeccao AND lc.strCodExercicio = l.strCodExercicio
     AND lc.strAbrevTpDoc = l.strAbrevTpDoc AND lc.intNumero = l.intNumero AND lc.bitAnulado = 0
WHERE c.strNumero = @numero
ORDER BY lc.dtmData;
