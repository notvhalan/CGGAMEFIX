import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface RustOrderRequest {
  market_id: string;
  side: 'BuyYes' | 'SellYes';
  risk_pence: number;
  limit_yes_pts: number;
  time_in_force?: 'GTC' | 'IOC';
  reduce_only?: boolean;
}

interface RustOrderResponse {
  order_id: string;
  contracts_micros: number;
  status: string;
}

interface RustCancelOrderResponse {
  order_id: string;
  status: string;
  market_id: string;
}

interface RustOrdersResponse {
  orders: any[];
}

@Injectable()
export class RustExchangeService {
  private readonly logger = new Logger(RustExchangeService.name);
  private readonly rustExchangeUrl: string;

  constructor() {
    this.rustExchangeUrl = process.env.RUST_EXCHANGE_URL || 'http://localhost:3001';
  }

  /**
   * Submit an order to the Rust exchange
   */
  async submitOrder(params: {
    marketId: string;
    userId?: string;
    side: 'BUY_YES' | 'SELL_YES';
    riskPence: number;
    limitYesPts: number;
    timeInForce?: 'GTC' | 'IOC';
    reduceOnly?: boolean;
  }): Promise<RustOrderResponse> {
    try {
      const requestBody: RustOrderRequest = {
        market_id: params.marketId,
        side: params.side === 'BUY_YES' ? 'BuyYes' : 'SellYes',
        risk_pence: params.riskPence,
        limit_yes_pts: params.limitYesPts,
        time_in_force: params.timeInForce || 'GTC',
        ...(params.reduceOnly ? { reduce_only: true } : {}),
      };

      this.logger.debug('Submitting order to Rust exchange', { requestBody });

      const response = await axios.post<RustOrderResponse>(
        `${this.rustExchangeUrl}/api/orders`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(params.userId ? { 'X-User-Id': params.userId } : {}),
          },
          timeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to submit order to Rust exchange', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`Rust exchange error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Cancel an order via Rust exchange
   */
  async cancelOrder(params: {
    orderId: string;
    userId: string;
  }): Promise<RustCancelOrderResponse> {
    const cancelUrl = `${this.rustExchangeUrl}/api/orders/${params.orderId}`;
    const headers = {
      'X-User-Id': params.userId,
    };

    try {
      const response = await axios.delete<RustCancelOrderResponse>(
        cancelUrl,
        {
          headers,
          timeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      // Compatibility fallback for older deployments that exposed POST cancel route.
      if (error.response?.status === 404) {
        const legacyCancelUrl = `${this.rustExchangeUrl}/api/orders/${params.orderId}/cancel`;
        try {
          const legacyResponse = await axios.post<RustCancelOrderResponse>(
            legacyCancelUrl,
            undefined,
            {
              headers,
              timeout: 5000,
            },
          );
          this.logger.warn('Used legacy Rust cancel endpoint', {
            orderId: params.orderId,
            legacyCancelUrl,
          });
          return legacyResponse.data;
        } catch {
          // Fall through to structured error below.
        }
      }

      this.logger.error('Failed to cancel order on Rust exchange', {
        orderId: params.orderId,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        cancelUrl,
      });

      if (error.response?.status === 404) {
        throw new Error(
          `Rust exchange cancel endpoint not found at ${cancelUrl}. ` +
          `Restart rust-exchange from current code and verify RUST_EXCHANGE_URL.`
        );
      }

      throw new Error(`Rust exchange error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get quote from Rust exchange
   */
  async getQuote(params: {
    marketId: string;
    side: 'BUY_YES' | 'SELL_YES';
    riskPence: number;
  }): Promise<{ limit_yes_pts: number; contracts_micros: number }> {
    try {
      const side = params.side === 'BUY_YES' ? 'BuyYes' : 'SellYes';
      
      const response = await axios.get(
        `${this.rustExchangeUrl}/api/markets/${params.marketId}/quote`,
        {
          params: {
            side,
            risk_pence: params.riskPence,
          },
          timeout: 3000,
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get quote from Rust exchange', {
        error: error.message,
        response: error.response?.data,
      });
      throw new Error(`Quote error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get user orders from Rust exchange
   */
  async getUserOrders(params: {
    userId: string;
    marketId?: string;
    includeHistory?: boolean;
    limit?: number;
  }): Promise<any[]> {
    try {
      const response = await axios.get<RustOrdersResponse>(
        `${this.rustExchangeUrl}/api/orders`,
        {
          params: {
            market_id: params.marketId,
            include_history: params.includeHistory,
            limit: params.limit,
          },
          headers: {
            'X-User-Id': params.userId,
          },
          timeout: 5000,
        }
      );

      return response.data.orders || [];
    } catch (error) {
      this.logger.error('Failed to fetch orders from Rust exchange', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`Rust exchange error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get user position for a market from Rust exchange
   */
  async getPositionForMarket(params: {
    userId: string;
    marketId: string;
  }): Promise<any> {
    try {
      const response = await axios.get(
        `${this.rustExchangeUrl}/api/positions/markets/${params.marketId}/me`,
        {
          headers: {
            'X-User-Id': params.userId,
          },
          timeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch position from Rust exchange', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`Rust exchange error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get all user positions from Rust exchange
   */
  async getPositions(params: { userId: string }): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.rustExchangeUrl}/api/positions/me`,
        {
          headers: {
            'X-User-Id': params.userId,
          },
          timeout: 5000,
        }
      );

      return response.data || [];
    } catch (error) {
      this.logger.error('Failed to fetch positions from Rust exchange', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`Rust exchange error: ${error.response?.data?.error || error.message}`);
    }
  }
}
