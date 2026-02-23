import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  LiveReload,
  useLoaderData,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import "~/styles/theme.css";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
  },
];

function normalizePublicApiUrl(rawUrl?: string) {
  const fallback = 'http://localhost:3000';
  const candidate = (rawUrl || fallback).trim();

  try {
    const url = new URL(candidate);
    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (!isLocalHost && url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return candidate.replace(/\/$/, '');
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const apiUrl = normalizePublicApiUrl(
    process.env.VITE_API_URL || process.env.API_BASE_URL || 'http://localhost:3000',
  );

  return json({
    ENV: {
      API_URL: apiUrl,
      WS_URL: process.env.VITE_WS_URL || 'ws://localhost:3000',
      RUST_WS_URL: process.env.VITE_RUST_WS_URL || process.env.RUST_WS_URL || 'ws://localhost:3001/ws',
    },
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
        {children}
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export default function App() {
  const data = useLoaderData<typeof loader>();
  
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.ENV = ${JSON.stringify(data.ENV)}`,
        }}
      />
      <Outlet />
    </>
  );
}
