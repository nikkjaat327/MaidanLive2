const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const builder = require('electron-builder');
const { NsisTarget } = require('app-builder-lib/out/targets/nsis/NsisTarget');
const { UninstallerReader, nsisTemplatesDir } = require('app-builder-lib/out/targets/nsis/nsisUtil');
const { WineVmManager } = require('app-builder-lib/out/vm/WineVm');
const fsExtra = require('fs-extra');

function hasWineBinary() {
  if (process.platform === 'win32') return true;
  try {
    execFileSync('which', ['wine'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// On headless Linux hosts without Wine, electron-builder's native Linux makensis
// compiles the NSIS binary cleanly, and electron-builder's built-in pure-JS
// UninstallerReader extracts __uninstaller.exe (just as it does on macOS Catalina+).
if (!hasWineBinary()) {
  NsisTarget.prototype.computeScriptAndSignUninstaller = async function (
    defines,
    commands,
    installerPath,
    sharedHeader,
    archs
  ) {
    const packager = this.packager;
    const customScriptPath = await packager.getResource(this.options.script, 'installer.nsi');
    const script = await fsExtra.readFile(
      customScriptPath || path.join(nsisTemplatesDir, 'installer.nsi'),
      'utf8'
    );
    if (customScriptPath != null) {
      return { script, isCustomScript: true };
    }

    const uninstallerPath = path.join(
      this.outDir,
      `${path.basename(installerPath, 'exe')}__uninstaller.exe`
    );
    const isWin = process.platform === 'win32';
    defines.BUILD_UNINSTALLER = null;
    defines.UNINSTALLER_OUT_FILE = isWin ? uninstallerPath : path.win32.join('Z:', uninstallerPath);
    await this.executeMakensis(
      defines,
      commands,
      sharedHeader + (await this.computeFinalScript(script, false, archs))
    );

    try {
      await UninstallerReader.exec(installerPath, uninstallerPath);
    } catch (err) {
      // Fallback to Wine only if UninstallerReader ever fails
      const wineVm = new WineVmManager(packager.config.toolsets?.wine);
      await wineVm.exec(installerPath, [], { env: { __COMPAT_LAYER: 'RunAsInvoker' } });
    }

    await packager.signIf(uninstallerPath);
    delete defines.BUILD_UNINSTALLER;
    defines.UNINSTALLER_OUT_FILE = uninstallerPath;
    return { script, isCustomScript: false };
  };
}

async function run() {
  const projectDir = path.resolve(__dirname, '..');
  process.chdir(projectDir);
  const targets = builder.Platform.WINDOWS.createTarget('nsis', builder.Arch.x64);
  const artifacts = await builder.build({
    targets,
    publish: 'never',
    projectDir,
  });
  for (const filePath of artifacts) {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`Built Windows artifact: ${filePath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
    }
  }
}

run().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
