Unicode true
ManifestDPIAware true

!define APP_NAME "BlockDeck"
!define APP_VERSION "1.1.0"
!define APP_PUBLISHER "Jordan8868"
!define APP_EXE "BlockDeck.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlockDeck"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "..\release\BlockDeck-${APP_VERSION}-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\BlockDeck"
InstallDirRegKey HKCU "Software\BlockDeck" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetCompressorDictSize 64
CRCCheck on
BrandingText "${APP_PUBLISHER} · BlockDeck ${APP_VERSION}"
Caption "BlockDeck ${APP_VERSION} 安装程序"

VIProductVersion "1.1.0.0"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "FileDescription" "BlockDeck 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "1.1.0.0"
VIAddVersionKey /LANG=2052 "InternalName" "BlockDeckSetup"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright © 2026 Jordan8868"
VIAddVersionKey /LANG=2052 "OriginalFilename" "BlockDeck-${APP_VERSION}-Setup.exe"
VIAddVersionKey /LANG=2052 "ProductName" "BlockDeck"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VERSION}"

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_WELCOMEPAGE_TITLE "安装 BlockDeck ${APP_VERSION}"
!define MUI_WELCOMEPAGE_TEXT "BlockDeck 是一款 Minecraft Java 版启动器。$\r$\n$\r$\n安装程序启动时会自动请求管理员权限。程序文件会安装到当前用户目录，游戏与账户数据仍保存在当前用户目录。$\r$\n$\r$\n发布者信息：Jordan8868"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "启动 BlockDeck（将请求管理员权限）"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Section "BlockDeck 主程序（必需）" SEC_MAIN
  SetShellVarContext current
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "..\release\BlockDeck-win32-x64\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\BlockDeck" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "BlockDeck ${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE},0"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" 340000
SectionEnd

Section "创建桌面快捷方式" SEC_DESKTOP
  SetShellVarContext current
  CreateShortCut "$DESKTOP\BlockDeck.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
SectionEnd

Section "创建开始菜单快捷方式" SEC_START
  SetShellVarContext current
  CreateDirectory "$SMPROGRAMS\BlockDeck"
  CreateShortCut "$SMPROGRAMS\BlockDeck\BlockDeck.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\BlockDeck\卸载 BlockDeck.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

LangString DESC_SEC_MAIN ${LANG_SIMPCHINESE} "BlockDeck 启动器及运行所需的全部文件。"
LangString DESC_SEC_DESKTOP ${LANG_SIMPCHINESE} "在桌面创建 BlockDeck 快捷方式。"
LangString DESC_SEC_START ${LANG_SIMPCHINESE} "在开始菜单创建启动与卸载快捷方式。"

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_MAIN} $(DESC_SEC_MAIN)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESKTOP} $(DESC_SEC_DESKTOP)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_START} $(DESC_SEC_START)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\BlockDeck.lnk"
  Delete "$SMPROGRAMS\BlockDeck\BlockDeck.lnk"
  Delete "$SMPROGRAMS\BlockDeck\卸载 BlockDeck.lnk"
  RMDir "$SMPROGRAMS\BlockDeck"

  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\BlockDeck"

  RMDir /r "$INSTDIR"
SectionEnd
