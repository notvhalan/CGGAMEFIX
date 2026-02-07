import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { getAuthenticatedUser } from "~/lib/auth.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  const { marketId } = params;

  const response = await fetch(
    `${process.env.API_GATEWAY_URL}/v1/settlements/market/${marketId}`,
    {
      headers: {
        Cookie: request.headers.get('Cookie') || '',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to load settlement details');
  }

  const data = await response.json();

  return json({
    ...data,
    user,
  });
}

export default function SettlementDetails() {
  const { found, settlement, participants } = useLoaderData<typeof loader>();

  if (!found) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No settlement found for this market</p>
          <Link to="/app/settlements/history" className="text-blue-400 hover:text-blue-300 mt-2 inline-block">
            ← Back to History
          </Link>
        </div>
      </div>
    );
  }

  const formatMoney = (gbp: string | number) => {
    const amount = typeof gbp === 'string' ? parseFloat(gbp) : gbp;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatContracts = (contracts: string) => {
    return (parseInt(contracts) / 1_000_000).toFixed(2);
  };

  const formatPrice = (pts: number) => {
    return (pts / 10_000_000 * 100).toFixed(2) + '%';
  };

  const winners = participants.filter((p: any) => p.is_winner);
  const losers = participants.filter((p: any) => !p.is_winner);

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/app/settlements/history" className="text-blue-400 hover:text-blue-300 mb-6 inline-block">
        ← Back to History
      </Link>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2">{settlement.market_name}</h1>
            {settlement.market_description && (
              <p className="text-gray-400 mb-3">{settlement.market_description}</p>
            )}
            <p className="text-sm text-gray-400">
              Settled {formatDate(settlement.settled_at)} by {settlement.resolved_by_name || settlement.resolved_by_email}
            </p>
          </div>
          <div className="px-4 py-2 bg-blue-900/50 rounded-lg text-center">
            <p className="text-sm text-gray-400 mb-1">Winning Outcome</p>
            <p className="text-2xl font-bold text-blue-400">{settlement.winning_outcome}</p>
          </div>
        </div>

        {settlement.settlement_reason && (
          <div className="mt-4 p-3 bg-gray-750 rounded">
            <p className="text-sm text-gray-400 mb-1">Reason</p>
            <p>{settlement.settlement_reason}</p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400 mb-1">Total Payout</p>
          <p className="text-xl font-bold text-green-400">
            {formatMoney(settlement.total_payout_gbp)}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400 mb-1">Winners</p>
          <p className="text-xl font-bold text-green-400">{settlement.winners_count}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400 mb-1">Losers</p>
          <p className="text-xl font-bold text-red-400">{settlement.losers_count}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400 mb-1">Positions</p>
          <p className="text-xl font-bold">{settlement.positions_settled}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400 mb-1">Orders Cancelled</p>
          <p className="text-xl font-bold">{settlement.orders_cancelled}</p>
        </div>
      </div>

      {/* Winners Leaderboard */}
      {winners.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-green-400">🏆 Winners</h2>
          <div className="space-y-3">
            {winners.slice(0, 10).map((participant: any, index: number) => (
              <div
                key={participant.user_id}
                className="flex items-center justify-between p-3 bg-gray-750 rounded"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="text-gray-400 font-mono w-8">#{index + 1}</div>
                  <div className="flex-1">
                    <p className="font-medium">{participant.name || participant.email}</p>
                    <p className="text-sm text-gray-400">
                      {participant.position_side} • {formatContracts(participant.contracts_settled)} contracts @ {formatPrice(participant.entry_price_yes_pts)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-400">
                    +{formatMoney(participant.profit_loss_gbp)}
                  </p>
                  <p className="text-sm text-gray-400">
                    {formatMoney(participant.payout_gbp)} payout
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Losers List */}
      {losers.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-red-400">Losers</h2>
          <div className="space-y-3">
            {losers.slice(0, 10).map((participant: any) => (
              <div
                key={participant.user_id}
                className="flex items-center justify-between p-3 bg-gray-750 rounded"
              >
                <div className="flex-1">
                  <p className="font-medium">{participant.name || participant.email}</p>
                  <p className="text-sm text-gray-400">
                    {participant.position_side} • {formatContracts(participant.contracts_settled)} contracts @ {formatPrice(participant.entry_price_yes_pts)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-400">
                    {formatMoney(participant.profit_loss_gbp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {participants.length > 20 && (
        <p className="text-center text-sm text-gray-400 mt-4">
          Showing top 20 participants • Total participants: {participants.length}
        </p>
      )}
    </div>
  );
}
