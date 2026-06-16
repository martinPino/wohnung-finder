import type { AppProps } from "next/app";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../styles/globals.css";
import LicenseGate from "@/components/LicenseGate";

export default function App({ Component, pageProps }: AppProps) {
  // LicenseGate enforces the paywall inside the packaged Electron app. In a
  // plain web build / `next dev` (no window.license bridge) it passes through,
  // and while the app is unprovisioned / LICENSE_DEV_BYPASS=1 the main process
  // reports an active license, so development is never blocked.
  return (
    <LicenseGate>
      <Component {...pageProps} />
      <SpeedInsights />
    </LicenseGate>
  );
}
