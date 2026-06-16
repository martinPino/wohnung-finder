import type { AppProps } from "next/app";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <SpeedInsights />
    </>
  );
}
