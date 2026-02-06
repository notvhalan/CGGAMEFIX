import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAuth } from "~/lib/auth.server";

interface Settlement {
  id: string;
  settlement_id: string;
  market_id: string;
  market_name: string;
  position_side: string;
  contracts_settled: string;
  entry_price_yes_pts: number;
  is_winner: boolean;
  payout_gbp: string;
  profit_loss_gbp: string;
  winning_outcome: string;
  settled_at: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  
  const url = new URL(request.url);
  const limit = url.searchParams.get('limit') || '20';
  const offset = url.searchParams.get('offset') || '0';

  const response = await fetch(
    `${process.env.API_GATEWAY_URL}/v1/settlements/user/history?limit=${limit}&offset=${offset}`,
    {
      headers: {
        Cookie: request.headers.get('Cookie') || '',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to load settlement history');
  }

  const data = await response.json();

  return json({
    ...data,
    user,
  });
}

export default function SettlementHistory() {
  const { settlements, total, limit, offset } = useLoaderData<typeof loader>();

  const formatPrice = (pts: number) => {
    return (pts / 10_000_000 * 100).toFixed(2) + '%';
  };

  const formatContracts = (micros: string) => {
    return (parseInt(micros) / 1_000_000).toFixed(2);
  };

  const formatMoney = (gbp: string) => {
    const amount = parseFloat(gbp);
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Settlement History</h1>
        <p className="text-gray-400">View your past market settlements and P&L</p>
      </div>

      {settlements.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No settlements yet</p>
          <Link to="/app/markets" className="text-blue-400 hover:text-blue-300 mt-2 inline-block">
            Browse Markets
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {settlements.map((settlement: Settlement) => (
            <div
              key={settlement.id}
              className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <Link
                    to={`/app/markets/${settlement.market_id}`}
                    className="text-lg font-semibold hover:text-blue-400 transition-colors"
                  >
                    {settlement.market_name}
                  </Link>
                  <p className="text-sm text-gray-400 mt-1">
                    Settled {formatDate(settlement.settled_at)}
                  </p>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    settlement.is_winner
                      ? 'bg-green-900/50 text-green-400'
                      : 'bg-red-900/50 text-red-400'
                  }`}
                >
                  {settlement.is_winner ? '✓ Won' : '✗ Lost'}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 mb-1">Position</p>
                  <p className="font-medium">
                    {settlement.position_side === 'FOR' ? 'BUY YES' : 'SELL YES'}
                  </p>
                </div>

                <div>
                  <p className="text-gray-400 mb-1">Contracts</p>
                  <p className="font-medium">{formatContracts(settlement.contracts_settled)}</p>
                </div>

                <div>
                  <p className="text-gray-400 mb-1">Entry Price</p>
                  <p className="font-medium">{formatPrice(settlement.entry_price_yes_pts)}</p>
                </div>

                <div>
                  <p className="text-gray-400 mb-1">Winning Outcome</p>
                  <p className="font-medium text-blue-400">{settlement.winning_outcome}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between">
                <div className="flex gap-6">
                  {settlement.is_winner && (
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Payout</p>
                      <p className="font-semibold text-green-400">
                        {formatMoney(settlement.payout_gbp)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Profit/Loss</p>
                    <p
                      className={`font-semibold ${
                        parseFloat(settlement.profit_loss_gbp) >= 0
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {parseFloat(settlement.profit_loss_gbp) >= 0 ? '+' : ''}
                      {formatMoney(settlement.profit_loss_gbp)}
                    </p>
                  </div>
                </div>

                <Link
                  to={`/app/settlements/market/${settlement.market_id}`}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  View Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > parseInt(limit) && (
        <div className="mt-8 flex justify-center gap-2">
          {parseInt(offset) > 0 && (
            <Link
              to={`?limit=${limit}&offset=${Math.max(0, parseInt(offset) - parseInt(limit))}`}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              ← Previous
            </Link>
          )}
          {parseInt(offset) + parseInt(limit) < total && (
            <Link
              to={`?limit=${limit}&offset=${parseInt(offset) + parseInt(limit)}`}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 text-center text-sm text-gray-400">
        Showing {parseInt(offset) + 1} - {Math.min(parseInt(offset) + parseInt(limit), total)} of {total} settlements
      </div>
    </div>
  );
}
