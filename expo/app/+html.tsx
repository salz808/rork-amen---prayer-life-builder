import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; frame-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.revenuecat.com https://*.revenuecat.com https://texttospeech.googleapis.com https://iammadewhole.com https://*.iammadewhole.com; media-src 'self' data: blob: https:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests; block-all-mixed-content" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="Cross-Origin-Opener-Policy" content="same-origin" />
        <meta httpEquiv="Cross-Origin-Resource-Policy" content="same-origin" />
        <meta httpEquiv="X-DNS-Prefetch-Control" content="off" />
        <meta httpEquiv="X-Permitted-Cross-Domain-Policies" content="none" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta httpEquiv="Permissions-Policy" content="accelerometer=(), autoplay=(), camera=(), display-capture=(), fullscreen=(self), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()" />
        <meta httpEquiv="Origin-Agent-Cluster" content="?1" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
