; Dida user-level installer (Inno Setup 6, free for commercial use and redistribution)
; Compile: ISCC.exe /DArch=arm64 /DAppVersion=1.101.0 /DSourceDir=..\..\dist\win32-arm64 build\win32\dida-setup.iss

#ifndef Arch
	#define Arch "arm64"
#endif
#ifndef AppVersion
	#define AppVersion "0.0.0"
#endif
#ifndef SourceDir
	#define SourceDir "..\..\dist\win32-" + Arch
#endif

[Setup]
AppId={{7D1C2E8A-5B3F-4A9D-8E2C-1A0B3C4D5E6F}
AppName=Dida
AppVersion={#AppVersion}
AppPublisher=Nova Globen AB
AppPublisherURL=https://code.didabit.com
AppSupportURL=https://code.didabit.com/issues
DefaultDirName={localappdata}\Programs\dida
DefaultGroupName=Dida
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=DidaSetup-{#Arch}-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
#if Arch == "arm64"
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#else
ArchitecturesInstallIn64BitMode=x64compatible
#endif
UninstallDisplayIcon={app}\Dida.exe
WizardStyle=modern
CloseApplications=yes
LicenseFile={#SourceDir}\resources\app\LICENSE.txt

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "addtopath"; Description: "Add Dida to PATH (requires restarting open terminals)"; GroupDescription: "Other:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Dida"; Filename: "{app}\Dida.exe"
Name: "{userdesktop}\Dida"; Filename: "{app}\Dida.exe"; Tasks: desktopicon

[Registry]
; user PATH entry for the CLI shim in bin\
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Tasks: addtopath; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

[Run]
Filename: "{app}\Dida.exe"; Description: "{cm:LaunchProgram,Dida}"; Flags: nowait postinstall skipifsilent

[Code]
function NeedsAddPath(Param: string): boolean;
var
	OrigPath: string;
begin
	if not RegQueryStringValue(HKCU, 'Environment', 'Path', OrigPath) then
	begin
		Result := True;
		exit;
	end;
	Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;
