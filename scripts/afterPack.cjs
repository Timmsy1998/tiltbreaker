const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.projectDir;
  const rceditPath = join(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
  const exePath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = join(projectDir, "build", "icon.ico");

  if (!existsSync(rceditPath) || !existsSync(exePath) || !existsSync(iconPath)) {
    return;
  }

  execFileSync(rceditPath, [exePath, "--set-icon", iconPath], {
    stdio: "inherit",
    windowsHide: true
  });
};
