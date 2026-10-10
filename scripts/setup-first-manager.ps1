param(
  [Parameter(Mandatory=$true)][string]$Username,
  [string]$Name = "Manager"
)
$ErrorActionPreference = "Stop"
$secret = Read-Host "Initial Manager password (at least 8 characters)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  if ($secret.Length -lt 8) { throw "Password must be at least 8 characters; no file or D1 data was changed." }
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  # PowerShell 5.1 otherwise pipes non-ASCII characters using legacy ASCII encoding.
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  # Password is piped through process stdin: never command-line args, git or console output.
  $plain | & node.exe "$PSScriptRoot\prepare-bootstrap.mjs" --username $Username --name $Name
  if ($LASTEXITCODE -ne 0) { throw "Bootstrap preparation failed. Check the reason shown above; D1 was not changed." }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $secret.Dispose()
  Remove-Variable plain -ErrorAction SilentlyContinue
}
