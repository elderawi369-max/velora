import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { turnstileSiteKey } from "../../config";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  onTokenChange: (token: string) => void;
};

const turnstileScriptId = "velora-turnstile-script";
const nativeAndroidBypassToken = "android-native-bypass";

function isNativeAndroidApp() {
  return Capacitor.getPlatform() === "android" && Capacitor.isNativePlatform();
}

export function TurnstileWidget({ onTokenChange }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const nativeAndroid = isNativeAndroidApp();

  useEffect(() => {
    if (!turnstileSiteKey) {
      onTokenChange(nativeAndroid ? nativeAndroidBypassToken : "dev-bypass");
      return;
    }

    onTokenChange("");

    function renderWidget() {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current) {
        return;
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token) => {
          onTokenChange(token);
          setLoadError("");
        },
        "expired-callback": () => {
          onTokenChange("");
        },
        "error-callback": () => {
          onTokenChange("");
          setLoadError("Human verification could not load. Please refresh and try again.");
        },
        theme: "light",
      });
    }

    const existing = document.getElementById(turnstileScriptId) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) {
        renderWidget();
      } else {
        existing.addEventListener("load", renderWidget, { once: true });
      }
    } else {
      const script = document.createElement("script");
      script.id = turnstileScriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => renderWidget();
      script.onerror = () => {
        onTokenChange("");
        setLoadError("Human verification could not load. Please refresh and try again.");
      };
      document.head.appendChild(script);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [nativeAndroid, onTokenChange]);

  if (!turnstileSiteKey) {
    if (nativeAndroid) {
      return null;
    }

    return (
      <div className="panel form-panel">
        <span className="meta-title">Human verification</span>
        <p className="status-message">
          Turnstile is not configured in this environment yet, so local development is bypassing it.
        </p>
      </div>
    );
  }

  return (
    <div className="field">
      <span>Human verification</span>
      <div className="turnstile-shell" ref={containerRef} />
      {loadError ? <p className="form-error">{loadError}</p> : null}
    </div>
  );
}
