$ErrorActionPreference = "Stop"
$secret = Read-Host "Set NEW temporary Manager password (8+ characters)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  if ($secret.Length -lt 8) { throw "Minimum password length is 8 characters." }
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $plain | & node.exe "$PSScriptRoot\prepare-temp-rearm.mjs"
  if ($LASTEXITCODE -ne 0) { throw "Temp password preparation failed; nothing was written to D1." }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $secret.Dispose()
  Remove-Variable plain -ErrorAction SilentlyContinue
}
