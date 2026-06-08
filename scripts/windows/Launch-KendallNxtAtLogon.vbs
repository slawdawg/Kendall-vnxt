Set shell = CreateObject("WScript.Shell")
scriptPath = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(WScript.ScriptFullName)
cmdPath = CreateObject("Scripting.FileSystemObject").BuildPath(CreateObject("Scripting.FileSystemObject").GetParentFolderName(scriptPath), "Launch-KendallNxtAtLogon.cmd")
shell.Run Chr(34) & cmdPath & Chr(34), 0, False
