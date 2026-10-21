# Corre uma consulta SÓ DE LEITURA no SQL Server do Eticadata e grava o resultado em CSV ao lado do .sql.
# A ligação NÃO fica neste ficheiro nem no repositório: lê-se de D:\Olyvia\.eticadata (fora do git), com uma linha:
#   Server=BMINVESTE-SRV\ETICADATA;Database=Emp_Z004;User ID=<utilizador>;Password=<password>
# Uso:  powershell -ExecutionPolicy Bypass -File consultar.ps1 1-descobrir-tabelas.sql
#       powershell -ExecutionPolicy Bypass -File consultar.ps1 2-fatura-paga.sql -Bd Emp_Z004
param(
  [Parameter(Mandatory = $true)][string]$Sql,
  [string]$Bd = "Emp_Z004",
  [string]$Ligacao = "D:\Olyvia\.eticadata"
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Ligacao)) { throw "Falta o ficheiro da ligação: $Ligacao (uma linha com a connection string)." }
$cs = (Get-Content $Ligacao -Raw).Trim()
# a BD escolhe-se aqui (por omissão, a de testes da Mudelar) e a ligação é marcada como só de leitura
$cs = ($cs -replace 'Database=[^;]*;?', '') + ";Database=$Bd;ApplicationIntent=ReadOnly;Connect Timeout=20"

$texto = Get-Content (Resolve-Path $Sql) -Raw -Encoding UTF8
# só leitura: recusa qualquer comando que escreva ou mude alguma coisa
$semComentarios = ($texto -replace '--[^\r\n]*', '') -replace '/\*[\s\S]*?\*/', ''
if ($semComentarios -match '\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|BACKUP|RESTORE|DBCC|SHUTDOWN|KILL|sp_\w+|xp_\w+)\b') {
  throw "Recusado: a consulta tem um comando que não é só de leitura ($($Matches[1]))."
}
$semUse = $semComentarios -replace '(?im)^\s*USE\s+\S+;?\s*$', ''

$con = New-Object System.Data.SqlClient.SqlConnection $cs
$con.Open()
try {
  $cmd = $con.CreateCommand()
  $cmd.CommandTimeout = 120
  $cmd.CommandText = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;`n" + $semUse
  $ad = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
  $ds = New-Object System.Data.DataSet
  [void]$ad.Fill($ds)
  $base = [System.IO.Path]::ChangeExtension((Resolve-Path $Sql).Path, $null).TrimEnd('.')
  $i = 1
  foreach ($t in $ds.Tables) {
    $saida = "$base.resultado-$i.csv"
    $t | Export-Csv -Path $saida -NoTypeInformation -Delimiter ';' -Encoding UTF8
    Write-Output "Resultado $i : $($t.Rows.Count) linhas -> $saida"
    $i++
  }
} finally { $con.Close() }
