'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [installedSuccessfully, setInstalledSuccessfully] = useState(false);

  useEffect(() => {
    // Check if already running as installed PWA / standalone
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandaloneMode) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    setIsIOS(isIOSDevice);

    // Listen for Chrome / Android / Edge native install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalledSuccessfully(true);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Do not show button if already running as standalone app
  if (isStandalone) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android / Chrome / Edge native 1-click prompt
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalledSuccessfully(true);
        setDeferredPrompt(null);
      }
    } else {
      // iOS Safari or browser without direct prompt API -> open modal with step-by-step instructions
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Instalar ou adicionar ao ecrã principal"
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95"
      >
        <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        <span className="hidden sm:inline">Adicionar App</span>
        <span className="sm:hidden">App</span>
      </button>

      {/* Instructional Modal (especially for iOS Safari & manual browser guidance) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 flex flex-col gap-4 text-slate-800">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#00529c] flex items-center justify-center shadow-md text-white font-black text-sm tracking-tighter">
                  IST
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                    Adicionar ao Ecrã
                  </h3>
                  <p className="text-xs text-slate-500">IST Room Visualizer</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Instala no teu ecrã inicial para aceder instantaneamente como uma app nativa, em ecrã inteiro e sem a barra do browser.
            </p>

            {/* iOS Instructions */}
            {isIOS ? (
              <div className="flex flex-col gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs text-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-xl bg-blue-100 text-[#00529c] font-black flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div>
                    No <strong>Safari</strong>, toca no botão de <strong>Partilhar</strong>{' '}
                    <span className="inline-flex items-center justify-center w-5 h-5 bg-white border border-slate-300 rounded text-blue-600 align-middle">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </span>{' '}
                    na barra inferior.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-xl bg-blue-100 text-[#00529c] font-black flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div>
                    Desliza para baixo e seleciona{' '}
                    <span className="font-semibold text-slate-900 inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      &quot;Ecrã Principal&quot;
                    </span>
                    .
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-xl bg-blue-100 text-[#00529c] font-black flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div>
                    Toca em <strong>&quot;Adicionar&quot;</strong> no canto superior direito.
                  </div>
                </div>
              </div>
            ) : (
              /* Android / Desktop fallback Instructions */
              <div className="flex flex-col gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                    1
                  </span>
                  <span>Abre o menu do browser (três pontos <strong>⋮</strong> no topo/fundo).</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                    2
                  </span>
                  <span>
                    Escolhe <strong>&quot;Instalar aplicação&quot;</strong> ou <strong>&quot;Adicionar ao ecrã inicial&quot;</strong>.
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="w-full py-2.5 bg-[#00529c] hover:bg-[#003d7a] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
