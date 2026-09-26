"use client";

import { useEffect, useState } from "react";

const ANDROID_PACKAGE = "mx.sntss1puebla.credenciales";
type InstalledApp = { platform?: string; id?: string };
type InstallNavigator = Navigator & { getInstalledRelatedApps?: () => Promise<InstalledApp[]> };

export function RadioCarInstall() {
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    const agent = navigator.userAgent;
    if (/Android/i.test(agent)) setPlatform("android");
    else if (/iPhone|iPad|iPod/i.test(agent)) setPlatform("ios");
    else return;

    let active = true;
    const checkInstallation = async () => {
      if (!/Android/i.test(agent)) return;
      const related = (navigator as InstallNavigator).getInstalledRelatedApps;
      try {
        const apps = related ? await related.call(navigator) : [];
        if (active) setInstalled(apps.some((app) => app.platform === "play" && app.id === ANDROID_PACKAGE));
      } catch {
        // An unsupported or denied check cannot prove that the app is installed.
        if (active) setInstalled(false);
      }
    };
    void checkInstallation();
    document.addEventListener("visibilitychange", checkInstallation);
    window.addEventListener("pageshow", checkInstallation);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", checkInstallation);
      window.removeEventListener("pageshow", checkInstallation);
    };
  }, []);

  if (platform === "ios") return <div className="radioAndroidInstall"><small>La versión para iPhone y CarPlay aún no está disponible para instalar.</small></div>;
  if (platform !== "android" || installed !== false) return null;

  return <div className="radioAndroidInstall" aria-label="Extensión de Radio Sindical para Android Auto">
    <a href="https://github.com/cncdigital/sntss1puebla/releases/download/v0.10.3/RadioSindical-0.10.3.apk" download="RadioSindical-0.10.3.apk" type="application/vnd.android.package-archive">♫ Instala la Extensión de Radio Sindical para tu Auto <span aria-hidden="true">↓</span></a>
    <small>Android Auto · versión 0.10.3. Si ya tienes una versión anterior con la misma firma, instálala como actualización. En navegadores sin detección de apps instaladas, el botón puede seguir visible.</small>
  </div>;
}
