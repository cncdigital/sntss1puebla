"use client";

import { useEffect, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};
type MobilePlatform = "ios" | "android" | "other";

function isInstalledApp() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(standaloneNavigator.standalone);
}

function detectPlatform(): MobilePlatform {
  const userAgent = navigator.userAgent;
  const isIPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/i.test(userAgent) || isIPadDesktopMode) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [platform, setPlatform] = useState<MobilePlatform>("other");

  useEffect(() => {
    const currentPlatform = detectPlatform();
    const standaloneMedia = window.matchMedia("(display-mode: standalone)");

    const platformTimer = window.setTimeout(() => {
      setPlatform(currentPlatform);
      setInstalled(isInstalledApp());
    }, 0);

    const showTimer = window.setTimeout(() => {
      if (!isInstalledApp() && (currentPlatform !== "other" || window.innerWidth <= 900)) setVisible(true);
    }, 1400);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setGuideOpen(false);
      setDeferredPrompt(null);
    };
    const handleDisplayMode = () => {
      if (isInstalledApp()) handleInstalled();
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    standaloneMedia.addEventListener("change", handleDisplayMode);
    return () => {
      window.clearTimeout(platformTimer);
      window.clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      standaloneMedia.removeEventListener("change", handleDisplayMode);
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) {
      setGuideOpen(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setVisible(false);
    } else {
      setVisible(false);
    }
  };

  if (installed) return null;

  return (
    <>
      {visible && (
        <aside className="installAppPrompt" aria-label="Instalar aplicación SNTSS1PUEBLA">
          <button className="installPromptClose" type="button" onClick={() => setVisible(false)} aria-label="Cerrar invitación de instalación">×</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-icon-192.png" alt="" aria-hidden="true" />
          <div>
            <b>Instala SNTSS1PUEBLA</b>
            <span>Sitio oficial, Credenciales, DeVi y servicios sindicales en un solo lugar.</span>
          </div>
          <button className="button gold" type="button" onClick={() => void installApp()}>
            Instalar app
          </button>
        </aside>
      )}

      {guideOpen && (
        <div className="installGuideOverlay" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onMouseDown={(event) => event.target === event.currentTarget && setGuideOpen(false)}>
          <section className="installGuideCard">
            <button className="installGuideClose" type="button" onClick={() => setGuideOpen(false)} aria-label="Cerrar guía">×</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon-192.png" alt="Icono de SNTSS1PUEBLA" />
            <span className="eyebrow">INSTALACIÓN EN EL CELULAR</span>
            <h2 id="install-guide-title">{platform === "ios" ? "Agregar en iPhone o iPad" : platform === "android" ? "Instalar en Android" : "Agregar como aplicación"}</h2>
            <p>Solo se realiza una vez. Después abrirá desde su propia pantalla, como cualquier otra app.</p>
            <ol>
              {platform === "ios" ? (
                <>
                  <li><b>1</b><span>Abra este sitio en <strong>Safari</strong>.</span></li>
                  <li><b>2</b><span>Pulse <strong>Compartir</strong> —el cuadro con flecha hacia arriba—.</span></li>
                  <li><b>3</b><span>Seleccione <strong>Agregar a pantalla de inicio</strong> y confirme.</span></li>
                </>
              ) : (
                <>
                  <li><b>1</b><span>Abra el menú del navegador <strong>⋮</strong>.</span></li>
                  <li><b>2</b><span>Pulse <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</span></li>
                  <li><b>3</b><span>Confirme con <strong>Instalar</strong>.</span></li>
                </>
              )}
            </ol>
            <button className="button primary full" type="button" onClick={() => setGuideOpen(false)}>Entendido</button>
          </section>
        </div>
      )}
    </>
  );
}
