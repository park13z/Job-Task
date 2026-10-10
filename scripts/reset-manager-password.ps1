param([string]$Username = "Ex")
$ErrorActionPreference = "Stop"
$secret = Read-Host "Re-enter EXISTING Job Task Manager password (at least 8 characters)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  if ($secret.Length -lt 8) { throw "Password must be at least 8 characters; no D1 changes." }
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $plain | & node.exe "$PSScriptRoot\prepare-manager-reset.mjs" --username $Username
  if ($LASTEXITCODE -ne 0) { throw "Preparation failed; no D1 changes. Review the message above." }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $secret.Dispose()
  Remove-Variable plain -ErrorAction SilentlyContinue
}
