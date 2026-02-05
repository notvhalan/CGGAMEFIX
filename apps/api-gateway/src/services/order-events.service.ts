import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NATS_SUBJECTS, EventType } from '@betting-exchange/shared-types';
import { NatsClient } from '../nats/nats.client';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class OrderEventsService implements OnModuleInit {
  private readonly logger = new Logger(OrderEventsService.name);

  constructor(
    private readonly natsClient: NatsClient,
    private readonly databaseService: DatabaseService,
  ) {}

  async onModuleInit() {
    // Subscribe to order cancellation events from matching engine
    this.natsClient.subscribe(NATS_SUBJECTS.EVENTS_ORDER_CANCELLED, async (data) => {
      try {
        await this.handleOrderCancelled(data);
      } catch (error) {
        this.logger.error('Failed to handle order cancelled event', error);
      }
    });
    
    // Subscribe to order rejection events from matching engine
    this.natsClient.subscribe(NATS_SUBJECTS.EVENTS_ORDER_REJECTED, async (data) => {
      try {
        await this.handleOrderRejected(data);
      } catch (error) {
        this.logger.error('Failed to handle order rejected event', error);
      }
    });
    
    // Subscribe to trade execution events for wallet settlement
    this.natsClient.subscribe(NATS_SUBJECTS.EVENTS_TRADE_EXECUTED, async (data) => {
      try {
        await this.handleTradeExecuted(data);
      } catch (error) {
        this.logger.error('Failed to handle trade executed event', error);
      }
    });
    
    this.logger.log(`Subscribed to order and trade events: ${NATS_SUBJECTS.EVENTS_ORDER_CANCELLED}, ${NATS_SUBJECTS.EVENTS_ORDER_REJECTED}, ${NATS_SUBJECTS.EVENTS_TRADE_EXECUTED}`);
  }

  private async handleOrderCancelled(data: any) {
    const { orderId, userId, remainingContractsMicros } = data;
    
    this.logger.log(`Handling cancellation for order ${orderId} (remaining: ${remainingContractsMicros})`);

    try {
      // Get the order from database to get liability
      const orders = await this.databaseService.getOrdersByUserId(userId, 1000);
      const order = orders.find(o => o.id === orderId);
      
      if (!order) {
        this.logger.warn(`Order ${orderId} not found in database`);
        return;
      }

      // Use remainingContractsMicros from the event (not from DB, as IOC orders set it to 0)
      const remainingContracts = BigInt(remainingContractsMicros);
      const originalContracts = BigInt(order.originalContracts);
      
      if (originalContracts === 0n) {
        this.logger.warn(`Order ${orderId} has 0 original contracts, skipping unlock`);
        return;
      }

      // Calculate proportional liability for the remaining (unfilled) portion
      // Use BigInt math to avoid overflow/precision issues
      const unlockPence = (BigInt(order.liabilityPence) * remainingContracts) / originalContracts;
      const lockedPence = Number(unlockPence);

      if (lockedPence > 0) {
        this.logger.log(`Unlocking ${lockedPence}p for cancelled order ${orderId} (${remainingContracts}/${originalContracts} contracts)`);
        
        try {
          await this.databaseService.unlockBalance(userId, lockedPence);
          this.logger.log(`Balance unlocked successfully for order ${orderId}: ${lockedPence}p`);
        } catch (unlockError) {
          this.logger.error(`Failed to unlock balance for order ${orderId}`, unlockError);
        }
      } else {
        this.logger.debug(`No balance to unlock for order ${orderId} (lockedPence=${lockedPence})`);
      }
    } catch (error) {
      this.logger.error(`Error handling cancellation for order ${orderId}`, error);
    }
  }

  private async handleOrderRejected(data: any) {
    const { orderId, userId, reason } = data;
    
    this.logger.log(`Handling rejection for order ${orderId}: ${reason}`);

    try {
      // Get the order from database to get full liability
      const orders = await this.databaseService.getOrdersByUserId(userId, 1000);
      const order = orders.find(o => o.id === orderId);
      
      if (!order) {
        this.logger.warn(`Order ${orderId} not found in database`);
        return;
      }

      // Rejected orders never matched, so unlock the FULL liability
      const lockedPence = order.liabilityPence;

      if (lockedPence > 0) {
        this.logger.log(`Unlocking full ${lockedPence}p for rejected order ${orderId}`);
        
        try {
          await this.databaseService.unlockBalance(userId, lockedPence);
          this.logger.log(`Balance unlocked successfully for rejected order ${orderId}: ${lockedPence}p`);
        } catch (unlockError) {
          this.logger.error(`Failed to unlock balance for rejected order ${orderId}`, unlockError);
        }
      } else {
        this.logger.debug(`No balance to unlock for rejected order ${orderId}`);
      }
    } catch (error) {
      this.logger.error(`Error handling rejection for order ${orderId}`, error);
    }
  }

  /**
   * Handle trade executed event - settle wallet balances for both sides
   */
  private async handleTradeExecuted(data: any) {
    const {
      tradeId,
      makerOrderId,
      takerOrderId,
      makerUserId,
      takerUserId,
      qtyMicros,
      notionalPence,
      takerSide,
      makerFeePence,
      takerFeePence,
    } = data;

    this.logger.log(`Settling trade ${tradeId}: ${qtyMicros} micros @ ${notionalPence}p`);

    const filledQtyMicros = BigInt(qtyMicros);
    const notional = BigInt(notionalPence);

    // Maker side is opposite of taker
    const makerSide: 'BUY_YES' | 'SELL_YES' = takerSide === 'BUY_YES' ? 'SELL_YES' : 'BUY_YES';

    try {
      // Settle both legs atomically in a single transaction
      await this.databaseService.transaction(async (client) => {
        await this.settleOneOrder(client, {
          tradeId,
          orderId: takerOrderId,
          userId: takerUserId,
          side: takerSide,
          filledQtyMicros,
          notionalPence: notional,
          feePence: BigInt(takerFeePence),
        });

        await this.settleOneOrder(client, {
          tradeId,
          orderId: makerOrderId,
          userId: makerUserId,
          side: makerSide,
          filledQtyMicros,
          notionalPence: notional,
          feePence: BigInt(makerFeePence),
        });
      });

      this.logger.log(`Trade ${tradeId} settled successfully`);
    } catch (error) {
      this.logger.error(`Failed to settle trade ${tradeId}`, error);
    }
  }

  /**
   * Settle one order side of a trade (FOR or LAY)
   */
  private async settleOneOrder(
    client: any,
    args: {
      tradeId: string;
      orderId: string;
      userId: string;
      side: 'BUY_YES' | 'SELL_YES' | 'FOR' | 'LAY'; // Support both new and legacy values
      filledQtyMicros: bigint;
      notionalPence: bigint;
      feePence: bigint;
    }
  ) {
    const { tradeId, orderId, userId, side, filledQtyMicros, notionalPence, feePence } = args;

    // 1) Idempotency: only settle once per (tradeId, orderId)
    const inserted = await this.databaseService.insertSettlementOnce(client, tradeId, orderId, userId);
    if (!inserted) {
      this.logger.debug(`Trade ${tradeId} order ${orderId} already settled (idempotent skip)`);
      return;
    }

    // 2) Load order details
    const order = await this.databaseService.getOrderForSettlement(client, orderId);
    if (!order) {
      this.logger.warn(`Order ${orderId} not found for settlement (synthetic/missing)`);
      return;
    }

    const liabilityPence = BigInt(order.liability_pence ?? 0);
    const originalQtyMicros = BigInt(order.qty_original_micros ?? 0);

    if (liabilityPence <= 0n || originalQtyMicros <= 0n) {
      this.logger.warn(`Invalid liability/qty for order ${orderId}: ${liabilityPence}/${originalQtyMicros}`);
      return;
    }

    // 3) Calculate proportional lock portion for this fill
    const lockPortionPence = (liabilityPence * filledQtyMicros) / originalQtyMicros;
    if (lockPortionPence <= 0n) {
      return;
    }

    const lockPortionPounds = this.penceToPoundsStr(lockPortionPence);

    // Get wallet_id for ledger entry
    const walletResult = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = 'GBP'`,
      [userId]
    );
    const walletId = walletResult.rows[0]?.id;
    const balanceBefore = parseFloat(walletResult.rows[0]?.balance || '0');

    // 4) Binary collateralized settlement: BUY YES and BUY NO (not buyer/seller)
    // 
    // Each contract pays out 100p (£1.00) total. At open, both sides contribute collateral:
    // - BUY YES contributes: notionalPence (the YES cost)
    // - BUY NO contributes: (total payout - notionalPence) = the NO cost
    //
    // Both REDUCE available cash at open. Only closing increases cash.
    // 
    // Process:
    // 1. Unlock the order lock (move from locked back to available)
    // 2. Debit the collateral contribution (INTO escrow/position)
    // 3. Position value increases by same amount → equity unchanged
    
    // Calculate total payout for this fill (£1.00 per contract)
    const CONTRACT_SCALE = 1_000_000n; // micros
    const CONTRACT_PAYOUT_PENCE = 100n; // £1.00 per contract
    const totalPayoutPence = (filledQtyMicros * CONTRACT_PAYOUT_PENCE) / CONTRACT_SCALE;
    
    if (side === 'BUY_YES' || side === 'FOR') {
      // BUY YES: Contribute YES cost (notional + fee) into escrow
      const yesContributionPence = notionalPence + feePence;
      const yesContributionPounds = this.penceToPoundsStr(yesContributionPence);

      await client.query(
        `UPDATE wallets
         SET locked_balance = locked_balance - $1::numeric,
             balance = balance + $1::numeric - $2::numeric,
             updated_at = NOW()
         WHERE user_id = $3
           AND currency = 'GBP'
           AND locked_balance >= $1::numeric`,
        [lockPortionPounds, yesContributionPounds, userId]
      );

      // Write ledger entry
      const balanceAfter = balanceBefore + Number(lockPortionPounds) - Number(yesContributionPounds);
      const debit = Number(yesContributionPounds);
      
      await client.query(
        `INSERT INTO ledger_entries (user_id, wallet_id, entry_type, debit, credit, balance, description, created_at)
         VALUES ($1, $2, 'TRADE_SETTLEMENT', $3, $4, $5, $6, NOW())`,
        [
          userId,
          walletId,
          debit,
          0,
          balanceAfter,
          `Trade ${tradeId}: BUY YES ${orderId}, unlocked=${lockPortionPounds}, paid=${yesContributionPounds} (YES cost+fee)`
        ]
      );

      this.logger.log(`Settled BUY YES ${orderId}: unlocked=${lockPortionPounds} paid=${yesContributionPounds}`);
    } else {
      // BUY NO (UI "Sell YES"): Contribute NO cost into escrow
      // NO cost = total payout - YES cost = (100p per contract) - notionalPence
      const noContributionPence = totalPayoutPence - notionalPence + feePence; // NO cost + fee
      const noContributionPounds = this.penceToPoundsStr(noContributionPence);

      this.logger.log(`BUY NO settlement: unlocked=${lockPortionPounds}, paid=${noContributionPounds} (NO cost+fee), totalPayout=${this.penceToPoundsStr(totalPayoutPence)}, notional=${this.penceToPoundsStr(notionalPence)}`);

      await client.query(
        `UPDATE wallets
         SET locked_balance = locked_balance - $1::numeric,
             balance = balance + $1::numeric - $2::numeric,
             updated_at = NOW()
         WHERE user_id = $3
           AND currency = 'GBP'
           AND locked_balance >= $1::numeric`,
        [lockPortionPounds, noContributionPounds, userId]
      );

      // Write ledger entry
      const balanceAfter = balanceBefore + Number(lockPortionPounds) - Number(noContributionPounds);
      const debit = Number(noContributionPounds);
      
      await client.query(
        `INSERT INTO ledger_entries (user_id, wallet_id, entry_type, debit, credit, balance, description, created_at)
         VALUES ($1, $2, 'TRADE_SETTLEMENT', $3, $4, $5, $6, NOW())`,
        [
          userId,
          walletId,
          debit,
          0,
          balanceAfter,
          `Trade ${tradeId}: BUY NO ${orderId}, unlocked=${lockPortionPounds}, paid=${noContributionPounds} (NO cost+fee)`
        ]
      );

      this.logger.log(`Settled BUY NO ${orderId}: unlocked=${lockPortionPounds} paid=${noContributionPounds}`);
    }
  }

  /**
   * Convert pence bigint to pounds string for NUMERIC(15,2)
   */
  private penceToPoundsStr(pence: bigint): string {
    const sign = pence < 0n ? '-' : '';
    const abs = pence < 0n ? -pence : pence;
    const pounds = abs / 100n;
    const pennies = abs % 100n;
    return `${sign}${pounds.toString()}.${pennies.toString().padStart(2, '0')}`;
  }
}
