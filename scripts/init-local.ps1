$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    Write-Host '.env already exists; preserved existing secrets.'
    exit 0
}
$password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$jwt = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$content = Get-Content -Raw (Join-Path $projectRoot '.env.example')
$content = $content.Replace('replace-with-a-random-local-password', $password)
$content = $content.Replace('replace-with-at-least-32-random-bytes-before-starting', $jwt)
[IO.File]::WriteAllText($envPath, $content)
Write-Host 'Created local secrets in .env (ignored by Git).'
