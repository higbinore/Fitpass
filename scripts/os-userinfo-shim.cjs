/* eslint-disable @typescript-eslint/no-require-imports */
const os = require("node:os");

function isOptInEnabled(env = process.env) {
  return env.FITPASS_OS_USERINFO_SHIM === "1";
}

function installOsUserInfoShim({ platform = process.platform, osModule = os, env = process.env } = {}) {
  if (platform !== "win32") return false;

  const originalUserInfo = osModule.userInfo.bind(osModule);
  osModule.userInfo = (...args) => {
    try {
      return originalUserInfo(...args);
    } catch (error) {
      const isNativePasswdEnomem = error?.code === "ERR_SYSTEM_ERROR"
        && error?.info?.code === "ENOMEM"
        && error?.syscall === "uv_os_get_passwd";
      if (!error || (error.code !== "ENOMEM" && !isNativePasswdEnomem)) throw error;

      let homedir;
      try {
        homedir = osModule.homedir();
      } catch {
        homedir = undefined;
      }
      if (typeof homedir !== "string" || homedir.length === 0) homedir = env.USERPROFILE;
      if (typeof homedir !== "string" || homedir.length === 0) throw error;

      return { username: "user", uid: -1, gid: -1, shell: null, homedir };
    }
  };
  return true;
}

if (isOptInEnabled()) installOsUserInfoShim();

module.exports = { installOsUserInfoShim, isOptInEnabled };
