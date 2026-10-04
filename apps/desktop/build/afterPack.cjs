const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

/**
 * electron-builder afterPack hook.
 *
 * Runs after the app is packaged but before code signing, which is exactly when
 * Electron fuses must be flipped.
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const appName = packager.appInfo.productFilename;

  let electronBinaryPath;
  switch (electronPlatformName) {
    case 'darwin':
      electronBinaryPath = path.join(
        appOutDir,
        `${appName}.app`,
        'Contents',
        'MacOS',
        appName,
      );
      break;
    case 'win32':
      electronBinaryPath = path.join(appOutDir, `${appName}.exe`);
      break;
    default: // linux
      electronBinaryPath = path.join(appOutDir, packager.executableName);
      break;
  }

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    // Re-sign the binary after flipping on macOS so it still launches (esp. on Apple Silicon).
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // The renderer is served over app:// (src/main/protocol.ts), so nothing needs file://'s extra privileges.
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
