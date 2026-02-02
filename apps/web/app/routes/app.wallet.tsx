import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import { getWallet, depositFunds } from "~/lib/api.server";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  
  try {
    const wallet = await getWallet(request);
    return json({ wallet, error: null });
  } catch (error: any) {
    console.error('Failed to load wallet:', error);
    return json({ wallet: null, error: error.message });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "deposit") {
    const amount = parseFloat(formData.get("amount") as string);
    
    if (isNaN(amount) || amount <= 0) {
      return json({ success: false, error: "Invalid amount" }, { status: 400 });
    }
    
    try {
      const result = await depositFunds(request, amount, "USD");
      return json({ success: true, message: `Successfully deposited £${amount.toFixed(2)}`, result });
    } catch (error: any) {
      return json({ success: false, error: error.message }, { status: 400 });
    }
  }
  
  return json({ success: false, error: "Invalid action" }, { status: 400 });
}

export default function Wallet() {
  const { wallet, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px' }}>
      <h1 style={{ 
        fontSize: '2rem', 
        fontWeight: 700, 
        marginBottom: '0.5rem', 
        color: '#e6edf3',
        background: 'linear-gradient(135deg, #3fb950, #58a6ff)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text'
      }}>
        Wallet
      </h1>
      <p style={{ color: '#8b949e', marginBottom: '2rem', fontSize: '0.9375rem' }}>
        Manage your funds and test deposits
      </p>

      {actionData && !actionData.success && (
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(248, 81, 73, 0.1)',
          border: '1px solid rgba(248, 81, 73, 0.3)',
          color: '#f85149', 
          borderRadius: '12px',
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          Error: {actionData.error}
        </div>
      )}

      {actionData && actionData.success && (
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(63, 185, 80, 0.1)',
          border: '1px solid rgba(63, 185, 80, 0.3)',
          color: '#3fb950', 
          borderRadius: '12px',
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          {actionData.message}
        </div>
      )}

      {error && (
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(248, 81, 73, 0.1)',
          border: '1px solid rgba(248, 81, 73, 0.3)',
          color: '#f85149', 
          borderRadius: '12px',
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          Failed to load wallet: {error}
        </div>
      )}

      <div style={{ 
        background: 'rgba(22, 27, 34, 0.6)', 
        padding: '2rem', 
        borderRadius: '12px', 
        border: '1px solid rgba(88, 166, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)', 
        marginBottom: '2rem',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ fontSize: '0.875rem', color: '#8b949e', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Available Balance
        </div>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#e6edf3', marginBottom: '1rem' }}>
          £{wallet?.balance?.toFixed(2) ?? '0.00'}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#8b949e' }}>
          Locked: £{wallet?.lockedBalance?.toFixed(2) ?? '0.00'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div style={{ 
          background: 'rgba(22, 27, 34, 0.6)', 
          padding: '1.5rem', 
          borderRadius: '12px', 
          border: '1px solid rgba(88, 166, 255, 0.2)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#e6edf3' }}>
            Deposit Test Funds
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#8b949e', marginBottom: '1.5rem' }}>
            Add test money to your wallet (not real currency)
          </p>
          <Form method="post" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="hidden" name="action" value="deposit" />
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontSize: '0.875rem', 
                fontWeight: 500,
                color: '#c9d1d9'
              }}>
                Amount
              </label>
              <input
                type="number"
                name="amount"
                min="1"
                step="1"
                defaultValue="1000"
                required
                style={{ 
                  width: '100%', 
                  padding: '0.75rem', 
                  background: 'rgba(13, 17, 23, 0.6)',
                  border: '1px solid rgba(88, 166, 255, 0.2)', 
                  borderRadius: '8px', 
                  boxSizing: 'border-box',
                  color: '#e6edf3',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s'
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
            <button
              type="submit"
              style={{
                padding: '0.75rem',
                background: 'linear-gradient(135deg, #3fb950, #2ea043)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(63, 185, 80, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(63, 185, 80, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(63, 185, 80, 0.3)';
              }}
            >
              Add Test Funds
            </button>
          </Form>
        </div>

        <div style={{ 
          background: 'rgba(22, 27, 34, 0.6)', 
          padding: '1.5rem', 
          borderRadius: '12px', 
          border: '1px solid rgba(88, 166, 255, 0.2)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#e6edf3' }}>
            Withdraw
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#8b949e', marginBottom: '1.5rem' }}>
            Withdraw funds from your wallet
          </p>
          <Form method="post" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="hidden" name="action" value="withdraw" />
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontSize: '0.875rem', 
                fontWeight: 500,
                color: '#c9d1d9'
              }}>
                Amount
              </label>
              <input
                type="number"
                name="amount"
                min="0"
                step="0.01"
                required
                style={{ 
                  width: '100%', 
                  padding: '0.75rem', 
                  background: 'rgba(13, 17, 23, 0.6)',
                  border: '1px solid rgba(88, 166, 255, 0.2)', 
                  borderRadius: '8px', 
                  boxSizing: 'border-box',
                  color: '#e6edf3',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s'
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
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontSize: '0.875rem', 
                fontWeight: 500,
                color: '#c9d1d9'
              }}>
                Destination
              </label>
              <input
                type="text"
                name="destination"
                required
                placeholder="Bank account"
                style={{ 
                  width: '100%', 
                  padding: '0.75rem', 
                  background: 'rgba(13, 17, 23, 0.6)',
                  border: '1px solid rgba(88, 166, 255, 0.2)', 
                  borderRadius: '8px', 
                  boxSizing: 'border-box',
                  color: '#e6edf3',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'all 0.2s'
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
            <button
              type="submit"
              style={{
                padding: '0.75rem',
                background: 'linear-gradient(135deg, #f85149, #da3633)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(248, 81, 73, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(248, 81, 73, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(248, 81, 73, 0.3)';
              }}
            >
              Withdraw
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
