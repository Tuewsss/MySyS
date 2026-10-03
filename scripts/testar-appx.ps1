# Gera o pacote da Microsoft Store assinado com um certificado de TESTE, para
# instalar e testar no próprio PC antes de enviar para a loja.
# Uso: npm run store:teste
#
# Na loja não é preciso certificado: a Microsoft assina o pacote enviado.
$ErrorActionPreference = 'Stop'

# O publisher da loja (package.json) é trocado por este só neste build de teste.
$subject = 'CN=MySyS Teste'
$pfx = Join-Path $PSScriptRoot '..\release\teste-cert.pfx'
$cer = Join-Path $PSScriptRoot '..\release\teste-cert.cer'
$senha = 'mysys-teste'  # só protege o certificado de teste local

New-Item -ItemType Directory -Force (Split-Path $pfx) | Out-Null

$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object Subject -eq $subject | Select-Object -First 1
if (-not $cert) {
  Write-Host "Criando certificado de teste ($subject)..."
  $cert = New-SelfSignedCertificate -Type Custom -Subject $subject -KeyUsage DigitalSignature `
    -FriendlyName 'MySyS - certificado de teste' -CertStoreLocation Cert:\CurrentUser\My `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
}
$senhaSegura = ConvertTo-SecureString $senha -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $senhaSegura | Out-Null
Export-Certificate -Cert $cert -FilePath $cer | Out-Null

$env:CSC_LINK = (Resolve-Path $pfx).Path
$env:CSC_KEY_PASSWORD = $senha
npm run dist:store -- "-c.appx.publisher=$subject"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$appx = Get-ChildItem (Join-Path $PSScriptRoot '..\release') -Filter 'MySyS-*.appx' | Sort-Object LastWriteTime | Select-Object -Last 1
$cerFull = (Resolve-Path $cer).Path
Write-Host ''
Write-Host "Pacote gerado: $($appx.FullName)"
Write-Host ''
Write-Host 'Para instalar (uma vez só, num PowerShell como ADMINISTRADOR, confia no certificado de teste):'
Write-Host "  Import-Certificate -FilePath '$cerFull' -CertStoreLocation Cert:\LocalMachine\TrustedPeople"
Write-Host ''
Write-Host 'Depois, num PowerShell normal:'
Write-Host "  Add-AppxPackage '$($appx.FullName)'"
Write-Host ''
Write-Host 'Para desinstalar: Get-AppxPackage MateusMonteiroMendes.MySyS | Remove-AppxPackage'
