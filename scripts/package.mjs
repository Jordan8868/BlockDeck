import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const cwd = process.cwd()
const outDir = path.join(cwd, 'release')
const appDir = path.join(outDir, 'BlockDeck-win32-x64')
const electronDist = path.join(cwd, 'node_modules', 'electron', 'dist')

if (!fs.existsSync(path.join(cwd, 'out', 'main', 'index.js'))) {
  throw new Error('请先执行 npm run build')
}
if (!fs.existsSync(electronDist)) {
  throw new Error('未找到 node_modules/electron/dist，无法打包')
}

console.log('[package] preparing release directory...')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(appDir, { recursive: true })
fs.cpSync(electronDist, appDir, { recursive: true })

const resourcesApp = path.join(appDir, 'resources', 'app')
fs.mkdirSync(resourcesApp, { recursive: true })
fs.cpSync(path.join(cwd, 'out'), path.join(resourcesApp, 'out'), { recursive: true })
fs.cpSync(path.join(cwd, 'build', 'icon.png'), path.join(resourcesApp, 'build', 'icon.png'))
fs.cpSync(
  path.join(cwd, 'node_modules', 'adm-zip'),
  path.join(resourcesApp, 'node_modules', 'adm-zip'),
  { recursive: true }
)
fs.writeFileSync(
  path.join(resourcesApp, 'package.json'),
  JSON.stringify(
    {
      name: 'blockdeck',
      productName: 'BlockDeck',
      version: '1.1.0',
      description: '方块工坊 BlockDeck - Minecraft Java 版启动器',
      main: 'out/main/index.js',
      author: 'BlockDeck',
      license: 'MIT'
    },
    null,
    2
  ),
  'utf8'
)

const sourceExe = path.join(appDir, 'electron.exe')
const appExe = path.join(appDir, 'BlockDeckApp.exe')
fs.renameSync(sourceExe, appExe)
console.log('[package] copied Electron runtime and app resources')

try {
  const { NtExecutable, NtExecutableResource, Resource, Data } = await import('resedit')
  const exe = NtExecutable.from(fs.readFileSync(appExe), { ignoreCert: true })
  const res = NtExecutableResource.from(exe)
  const iconFile = Data.IconFile.from(fs.readFileSync(path.join(cwd, 'build', 'icon.ico')))
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    1033,
    iconFile.icons.map((icon) => icon.data)
  )
  const translation = { lang: 1033, codepage: 1200 }
  const versionInfo =
    Resource.VersionInfo.fromEntries(res.entries)[0] ?? Resource.VersionInfo.createEmpty()
  versionInfo.setStringValues(
    translation,
    {
      CompanyName: 'Jordan8868',
      FileDescription: 'BlockDeck 方块工坊',
      ProductName: 'BlockDeck',
      LegalCopyright: 'Copyright © 2026 Jordan8868',
      OriginalFilename: 'BlockDeckApp.exe',
      InternalName: 'BlockDeck'
    },
    true
  )
  versionInfo.setFileVersion('1.1.0.0')
  versionInfo.setProductVersion('1.1.0.0')
  versionInfo.outputToResourceEntries(res.entries)
  res.outputResource(exe)
  fs.writeFileSync(appExe, Buffer.from(exe.generate()))
  console.log('[package] patched main executable icon and version metadata')
} catch (error) {
  console.warn('[package] could not patch main executable resources:', error.message)
}

const cscCandidates = [
  'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  'C:/Windows/Microsoft.NET/Framework/v4.0.30319/csc.exe'
]
const csc = cscCandidates.find((candidate) => fs.existsSync(candidate))
if (!csc) throw new Error('找不到 .NET Framework csc.exe，无法生成启动包装器')

console.log('[package] compiling compatibility launcher...')
const compile = spawnSync(
  csc,
  [
    '/nologo',
    '/target:winexe',
    `/win32icon:${path.join(cwd, 'build', 'icon.ico')}`,
    `/win32manifest:${path.join(cwd, 'scripts', 'app.manifest')}`,
    `/out:${path.join(appDir, 'BlockDeck.exe')}`,
    path.join(cwd, 'scripts', 'stub.cs')
  ],
  { encoding: 'utf8', windowsHide: true }
)
if (compile.status !== 0) {
  throw new Error(`包装器编译失败：${compile.stdout}\n${compile.stderr}`)
}

if (fs.existsSync(path.join(cwd, 'README.md'))) {
  fs.copyFileSync(path.join(cwd, 'README.md'), path.join(appDir, 'README.md'))
}
if (fs.existsSync(path.join(cwd, 'docs'))) {
  fs.cpSync(path.join(cwd, 'docs'), path.join(appDir, 'docs'), { recursive: true })
}

fs.writeFileSync(
  path.join(appDir, '启动说明.txt'),
  [
    'BlockDeck · 方块工坊',
    '',
    '双击 BlockDeck.exe 即可启动。Windows 会立即弹出 UAC 提示，',
    '请点击「是」授予管理员权限；启动器需要管理员权限来写入游戏目录、',
    '安装 Java 运行时并启动游戏进程。',
    '',
    'BlockDeck.exe 是带管理员清单的启动包装器；真正的主程序是 BlockDeckApp.exe。',
    '在少数远程桌面 / 受限 Windows 会话中，Chromium 沙箱不可用，包装器会自动',
    '添加 --no-sandbox 参数。若你希望强制启用沙箱，请先设置环境变量',
    'BLOCKDECK_ENABLE_SANDBOX=1，再运行 BlockDeck.exe。',
    '',
    '默认游戏目录：%APPDATA%\\.blockdeck\\minecraft',
    '启动器数据目录：%APPDATA%\\BlockDeck',
    ''
  ].join('\r\n'),
  'utf8'
)

const zipPath = path.join(outDir, 'BlockDeck-1.1.0-Portable-win64.zip')
console.log('[package] creating zip...')
const zip = spawnSync('python', [path.join(cwd, 'scripts', 'zip.py'), appDir, zipPath], {
  encoding: 'utf8',
  windowsHide: true
})
if (zip.status !== 0) {
  console.warn('[package] zip failed (folder is still usable):', zip.stdout, zip.stderr)
} else {
  console.log('[package] zip created:', zipPath)
}

const nsisCandidates = [
  path.join(cwd, '.tools', 'nsis', 'nsis-3.11', 'makensis.exe'),
  'C:/Program Files (x86)/NSIS/makensis.exe',
  'C:/Program Files/NSIS/makensis.exe'
]
const makensis = nsisCandidates.find((candidate) => fs.existsSync(candidate))
if (makensis) {
  const tempDir = path.join(cwd, '.nstmp')
  fs.mkdirSync(tempDir, { recursive: true })
  console.log('[package] compiling installer...')
  const setup = spawnSync(makensis, ['installer.nsi'], {
    cwd: path.join(cwd, 'scripts'),
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, TEMP: tempDir, TMP: tempDir }
  })
  if (setup.status === 0) {
    console.log('[package] installer created:', path.join(outDir, 'BlockDeck-1.1.0-Setup.exe'))
  } else {
    console.warn('[package] installer build failed:', setup.stdout, setup.stderr)
  }
} else {
  console.warn('[package] NSIS not found; skipped installer build (install NSIS or place it in .tools/nsis)')
}
console.log('[package] done:', appDir)
