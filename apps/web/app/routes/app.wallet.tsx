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
      return json({ success: true, message: `Successfully deposited $${amount.toFixed(2)}`, result });
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
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem', color: '#1a202c' }}>
        Wallet
      </h1>

      {actionData && !actionData.success && (
        <div style={{ 
          padding: '1rem', 
          background: '#fed7d7', 
          color: '#c53030', 
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          Error: {actionData.error}
        </div>
      )}

      {actionData && actionData.success && (
        <div style={{ 
          padding: '1rem', 
          background: '#c6f6d5', 
          color: '#22543d', 
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          {actionData.message}
        </div>
      )}

      {error && (
        <div style={{ 
          padding: '1rem', 
          background: '#fed7d7', 
          color: '#c53030', 
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          Failed to load wallet: {error}
        </div>
      )}

      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Available Balance</div>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#1a202c', marginBottom: '1rem' }}>
          £{wallet?.balance?.toFixed(2) ?? '0.00'}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#718096' }}>
          Locked: £{wallet?.lockedBalance?.toFixed(2) ?? '0.00'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Deposit Test Funds</h2>
          <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '1rem' }}>
            Add test money to your wallet (not real currency)
          </p>
          <Form method="post" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="hidden" name="action" value="deposit" />
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                Amount
              </label>
              <input
                type="number"
                name="amount"
                min="1"
                step="1"
                defaultValue="1000"
                required
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '6px', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: '0.75rem',
                background: '#48bb78',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Add Test Funds
            </button>
          </Form>
        </div>

        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Withdraw</h2>
          <Form method="post" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="hidden" name="action" value="withdraw" />
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                Amount
              </label>
              <input
                type="number"
                name="amount"
                min="0"
                step="0.01"
                required
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '6px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                Destination
              </label>
              <input
                type="text"
                name="destination"
                required
                placeholder="Bank account or crypto address"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '6px', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: '0.75rem',
                background: '#e53e3e',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer'
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
