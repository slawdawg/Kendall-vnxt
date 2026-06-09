# Kendall_Nxt Agent Notes

## PowerShell Commands

- Prefer running PowerShell directly in the current shell over nested `powershell -Command "..."`.
- Avoid nested `powershell -Command "..."` when the command contains `$variables`, `$_`, loops, arrays, scriptblocks, or mixed quotes. Use a direct command or a small `.ps1` script/block instead.
- Do not retry the same failed quoting shape. Simplify the command first.
- Use `Get-Content -Raw` for whole-file reads, parser/token checks, and text that must preserve line structure.
- Quote literal paths and use `-LiteralPath` for file operations when possible.
- Avoid `Format-Table` and `Format-List` when another command needs the data; formatting is for display only and can hide structured properties.
- Prefer assigning command results to variables and inspecting properties directly when working with structured objects such as scheduled tasks, CIM objects, and process records.
- For interactive tools such as Codex, prefer Windows user-logon startup over pre-login boot services. A pre-login service does not provide a useful interactive terminal.
- For per-user Windows Scheduled Tasks, prefer `New-ScheduledTaskPrincipal -RunLevel Limited` unless elevation is truly required. `-RunLevel Highest` can make otherwise ordinary per-user task registration fail with access denied.
- When working with Windows Scheduled Tasks, expect both registration and detailed inspection to require task-scheduler permissions. If `Get-ScheduledTask` fails with access denied after registration used elevation, verify through the same approved/elevated path instead of assuming the task is missing.
- When verifying Scheduled Task actions, inspect the raw `$task.Actions` objects directly. Computed `Select-Object` projections or formatted output can return blank-looking `Execute`/`Arguments` fields even when the task action is valid.
- For cmdlet enum parameters, verify accepted values with `Get-Help`, parameter metadata, or the error message before retrying with guessed names. Use the exact enum names PowerShell reports, such as `Limited` or `Highest` for `New-ScheduledTaskPrincipal -RunLevel`.
- Prefer native PowerShell cmdlets over `cmd /c` unless `cmd` behavior is specifically required.
- Remember PowerShell wildcards, quoting, redirection, and command separators differ from Bash; check the shell semantics before porting command shapes.
