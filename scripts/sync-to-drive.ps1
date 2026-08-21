<#
.NOTES
  Este ficheiro TEM de ser guardado em UTF-8 COM BOM.
  O Windows PowerShell 5.1 lê .ps1 sem BOM como ANSI, e os acentos portugueses
  passam a bytes soltos que rebentam o parser com erros noutras linhas.

.SYNOPSIS
  Sincroniza o código-fonte da área de trabalho local para a pasta do Google Drive.

.DESCRIPTION
  O Google Drive (G:) monta uma unidade virtual que não aguenta um `npm install`:
  são dezenas de milhares de ficheiros pequenos e o `npm` rebenta a meio com
  EPERM / EBADF, deixando um `node_modules` corrompido. Confirmado a 2026-08-17.

  Por isso o projeto tem dois sítios, com papéis diferentes:

    C:\Users\sergi\dev\totalmobi-booking   ← onde se trabalha e se corre tudo
    G:\O meu disco\Totalmobi CMS\booking totalmobi   ← cópia sincronizada, sem node_modules

  Este script empurra o código de um para o outro. Nunca copia `node_modules`,
  `.next` nem `dist` — é precisamente isso que partia o Drive.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\sync-to-drive.ps1
#>

param(
  [string]$Source = "C:\Users\sergi\dev\totalmobi-booking",
  [string]$Destination = "G:\O meu disco\Totalmobi CMS\booking totalmobi",
  [switch]$Reverse
)

$ErrorActionPreference = 'Stop'

if ($Reverse) {
  $from = $Destination
  $to = $Source
  Write-Host "Drive → local" -ForegroundColor Cyan
} else {
  $from = $Source
  $to = $Destination
  Write-Host "Local → Drive" -ForegroundColor Cyan
}

if (-not (Test-Path $from)) { throw "Origem não encontrada: $from" }
New-Item -ItemType Directory -Force -Path $to | Out-Null

$excludeDirs = @('node_modules', '.next', 'dist', 'coverage', '.turbo', 'test-results', 'playwright-report')
$excludeFiles = @('*.tsbuildinfo', '*.log', '.env', '.env.local', '.env.production')

Write-Host "  de: $from"
Write-Host " para: $to"
Write-Host ""

# /MIR espelha (apaga no destino o que já não existe na origem).
# /XD e /XF são o que impede o node_modules de voltar a matar o Drive.
#
# A variável NÃO se pode chamar $args: é automática no PowerShell e atribuir-lhe
# um valor é erro de sintaxe (com uma mensagem que aponta para a linha errada).
$roboArgs = @(
  $from, $to,
  '/MIR',
  '/XD'
) + $excludeDirs + @('/XF') + $excludeFiles + @(
  '/R:2', '/W:2',
  '/NFL', '/NDL', '/NJH', '/NP'
)

& robocopy @roboArgs | Out-String | Write-Host

# O robocopy usa códigos de saída como bitmask: 0-7 é sucesso, 8+ é erro.
if ($LASTEXITCODE -ge 8) {
  throw "robocopy falhou com código $LASTEXITCODE"
}

Write-Host ""
Write-Host "Sincronizado. (robocopy: $LASTEXITCODE — abaixo de 8 é sucesso)" -ForegroundColor Green
Write-Host "Lembrete: o Drive pode demorar a mostrar os ficheiros no Explorador." -ForegroundColor DarkGray
