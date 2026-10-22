-- Uma fatura FAT de 2026 paga e uma por pagar, para testar o 2-fatura-paga.sql
SELECT TOP 1 'paga' tipo, strNumero FROM Mov_Venda_Cab WHERE strAbrevTpDoc='FAT' AND bitAnulado=0 AND strCodExercicio='2026' AND fltValorPendente=0 ORDER BY dtmData DESC;
SELECT TOP 1 'parcial' tipo, strNumero FROM Mov_Venda_Cab WHERE strAbrevTpDoc='FAT' AND bitAnulado=0 AND fltValorPendente>0 AND fltValorPendente<fltTotal ORDER BY dtmData DESC;
SELECT TOP 1 'por pagar' tipo, strNumero FROM Mov_Venda_Cab WHERE strAbrevTpDoc='FAT' AND bitAnulado=0 AND fltValorPendente=fltTotal ORDER BY dtmData DESC;
