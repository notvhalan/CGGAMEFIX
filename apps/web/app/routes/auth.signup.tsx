import { json, type ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  // TODO: Implement actual user registration
  // For now, this is just a scaffold
  
  if (!email || !password || !confirmPassword) {
    return json({ error: "All fields are required" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return json({ error: "Passwords do not match" }, { status: 400 });
  }

  // In production: create user, send verification email, create session, redirect
  return json({ error: "Registration not yet implemented" }, { status: 501 });
}

export default function Signup() {
  const actionData = useActionData<typeof action>();

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '400px', 
        padding: '2rem',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ color: '#667eea', fontSize: '1.75rem', fontWeight: 700, textDecoration: 'none' }}>
            Betting Exchange
          </Link>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '1rem', color: '#1a202c' }}>
            Create Account
          </h2>
        </div>

        {actionData?.error && (
          <div style={{ 
            padding: '0.75rem', 
            background: '#fed7d7', 
            color: '#c53030', 
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {actionData.error}
          </div>
        )}

        <Form method="post" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#2d3748' }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#2d3748' }}>
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#2d3748' }}>
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '0.5rem'
            }}
          >
            Sign Up
          </button>
        </Form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', color: '#718096', fontSize: '0.85rem' }}>
          By signing up, you agree to our{' '}
          <Link to="/legal" style={{ color: '#667eea', textDecoration: 'none' }}>Terms</Link>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1rem', color: '#718096' }}>
          Already have an account?{' '}
          <Link to="/auth/login" style={{ color: '#667eea', fontWeight: 600, textDecoration: 'none' }}>
            Log In
          </Link>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/" style={{ color: '#a0aec0', fontSize: '0.9rem', textDecoration: 'none' }}>
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
