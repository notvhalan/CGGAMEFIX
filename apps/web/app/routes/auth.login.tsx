import { Link } from "@remix-run/react";
import { useState } from "react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import "~/styles/pages/landing.css";

// Use window.ENV if available, otherwise default to localhost
const getApiUrl = () => {
  if (typeof window !== 'undefined' && (window as any).ENV?.API_BASE_URL) {
    return (window as any).ENV.API_BASE_URL;
  }
  return typeof window !== 'undefined' && window.ENV?.API_URL 
    ? window.ENV.API_URL 
    : 'http://localhost:3000';
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const mode = formData.get("mode"); // "login" or "signup"
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("name");

  const API_BASE_URL = process.env.API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3000';

  try {
    const endpoint = mode === "signup" ? "/v1/auth/signup" : "/v1/auth/login";
    const body = mode === "signup" 
      ? { email, password, name }
      : { email, password };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      return json({ error: data.message || "Authentication failed" }, { status: response.status });
    }

    // Forward the Set-Cookie header from backend to browser
    const setCookie = response.headers.get("Set-Cookie");
    
    // Redirect to app on success with the session cookie
    return redirect("/app", {
      headers: setCookie ? { "Set-Cookie": setCookie } : {},
    });
  } catch (error) {
    return json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// OAuth Button Component
function OAuthButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="oauthBtn"
      aria-label={label}
    >
      <span className="oauthBtn__inner">
        <span className="oauthBtn__icon" aria-hidden>
          {icon}
        </span>
        <span className="oauthBtn__label">{label}</span>
      </span>
    </a>
  );
}

export default function Login() {
  const API_BASE_URL = getApiUrl();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: '#0d1117',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Ambient Glow */}
      <div 
        className="ambient-glow" 
        style={{ 
          top: '30%', 
          left: '50%', 
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, rgba(88, 166, 255, 0.15) 0%, transparent 70%)'
        }} 
      />

      {/* Login Glass Card */}
      <div className="glass-card" style={{ 
        width: '100%', 
        maxWidth: '480px', 
        padding: '3rem',
        margin: '2rem',
        animation: 'cinematicReveal 1.2s cubic-bezier(0.19, 1, 0.22, 1) forwards',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Logo/Brand */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <Link 
            to="/" 
            style={{ 
              color: '#58a6ff', 
              fontSize: '2rem', 
              fontWeight: 800, 
              textDecoration: 'none',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}
          >
            GAMEFIX
          </Link>
          <h2 style={{ 
            fontSize: '1.75rem', 
            fontWeight: 700, 
            marginTop: '1.5rem', 
            color: '#ffffff',
            letterSpacing: '-0.02em'
          }}>
            Welcome Back
          </h2>
          <p style={{ 
            color: '#8b949e', 
            fontSize: '1rem', 
            marginTop: '0.75rem',
            lineHeight: '1.6'
          }}>
            Sign in to access your trading dashboard
          </p>
        </div>

        <div className="auth-stack">
          {/* Google Sign-In Button */}
          <OAuthButton
            href={`${API_BASE_URL}/v1/auth/google`}
            label="Continue with Google"
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4"/>
                <path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853"/>
                <path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05"/>
                <path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335"/>
              </svg>
            }
          />

          {/* Divider */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
            <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
          </div>
        </div>

        {/* Mode Switcher */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem',
          marginBottom: '1.5rem',
          background: 'rgba(22, 27, 34, 0.6)',
          padding: '0.375rem',
          borderRadius: '8px'
        }}>
          <button
            type="button"
            onClick={() => setMode("login")}
            style={{
              flex: 1,
              padding: '0.625rem',
              background: mode === "login" ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
              color: mode === "login" ? '#58a6ff' : '#8b949e',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            style={{
              flex: 1,
              padding: '0.625rem',
              background: mode === "signup" ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
              color: mode === "signup" ? '#58a6ff' : '#8b949e',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Error Message */}
        {actionData?.error && (
          <div style={{
            padding: '1rem',
            background: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid rgba(248, 81, 73, 0.3)',
            borderRadius: '8px',
            color: '#f85149',
            fontSize: '0.875rem',
            marginBottom: '1.25rem'
          }}>
            {actionData.error}
          </div>
        )}

        {/* Email/Password Form */}
        <Form method="post" style={{ marginBottom: '1.5rem' }}>
          <input type="hidden" name="mode" value={mode} />

          {mode === "signup" && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ 
                display: 'block', 
                color: '#c9d1d9', 
                fontSize: '0.9375rem',
                fontWeight: 500,
                marginBottom: '0.5rem'
              }}>
                Name (optional)
              </label>
              <input
                type="text"
                name="name"
                placeholder="Your name"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  background: 'rgba(22, 27, 34, 0.6)',
                  border: '1px solid rgba(88, 166, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '1rem',
                  backdropFilter: 'blur(10px)',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(88, 166, 255, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.2)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ 
              display: 'block', 
              color: '#c9d1d9', 
              fontSize: '0.9375rem',
              fontWeight: 500,
              marginBottom: '0.5rem'
            }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                background: 'rgba(22, 27, 34, 0.6)',
                border: '1px solid rgba(88, 166, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '1rem',
                backdropFilter: 'blur(10px)',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(88, 166, 255, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              color: '#c9d1d9', 
              fontSize: '0.9375rem',
              fontWeight: 500,
              marginBottom: '0.5rem'
            }}>
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                background: 'rgba(22, 27, 34, 0.6)',
                border: '1px solid rgba(88, 166, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '1rem',
                backdropFilter: 'blur(10px)',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(88, 166, 255, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {mode === "signup" && (
              <p style={{ 
                color: '#8b949e', 
                fontSize: '0.8125rem', 
                marginTop: '0.5rem',
                marginBottom: 0
              }}>
                Minimum 6 characters
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '1rem',
              background: isSubmitting 
                ? 'rgba(88, 166, 255, 0.3)'
                : 'linear-gradient(135deg, #58a6ff 0%, #409eff 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.0625rem',
              fontWeight: 600,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {isSubmitting ? "Please wait..." : mode === "signup" ? "Create Account" : "Log In"}
          </button>
        </Form>

        {/* Info Text */}
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(88, 166, 255, 0.05)',
          border: '1px solid rgba(88, 166, 255, 0.1)',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <p style={{
            color: '#8b949e',
            fontSize: '0.875rem',
            lineHeight: '1.6',
            margin: 0,
            textAlign: 'center'
          }}>
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 16 16" 
              fill="currentColor"
              style={{ 
                verticalAlign: 'middle', 
                marginRight: '0.5rem',
                color: '#58a6ff'
              }}
            >
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0z"/>
              <path d="M8 3.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
            </svg>
            {mode === "signup" 
              ? "New users get £10,000 to start trading" 
              : "Secure session-based authentication"}
          </p>
        </div>

        {/* Footer Links */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <Link 
            to="/" 
            style={{ 
              color: '#8b949e', 
              fontSize: '0.9375rem', 
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#58a6ff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#8b949e'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.5 7.5a.5.5 0 0 1 0 1H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5z"/>
            </svg>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
