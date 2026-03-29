// ============================================================
// Ladder Markets — Controller
// ============================================================

import { Controller, Get, Post, Param, Body, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { LadderService } from './ladder.service';
import { LadderSettlementService } from './ladder-settlement.service';
import { DatabaseService } from '../../database/database.service';

@Controller('v1/ladder')
export class LadderController {
  private readonly ADMIN_EMAILS = ['vhalan02@gmail.com', 'developer@gmail.com'];

  constructor(
    private readonly ladderService: LadderService,
    private readonly settlementService: LadderSettlementService,
    private readonly db: DatabaseService,
  ) {}

  /** List all ladder groups */
  @Get()
  async listGroups() {
    const groups = await this.ladderService.listGroups();
    return { groups };
  }

  /** Get full ladder data for a group (fitted curve + intervals) */
  @Get(':groupSlug')
  async getLadder(@Param('groupSlug') groupSlug: string) {
    return this.ladderService.getLadder(groupSlug);
  }

  /** Admin: resolve an event and cascade-settle all child maturities */
  @Post(':groupSlug/resolve')
  async resolveEvent(
    @Param('groupSlug') groupSlug: string,
    @Body() body: {
      occurred: boolean;
      occurredAt?: string;
      source: string;
      sourceUrl?: string;
      notes?: string;
    },
    @Req() req: FastifyRequest & { session: any },
  ) {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    await this.checkAdmin(userId);

    return this.settlementService.resolveEvent({
      groupSlug,
      occurred: body.occurred,
      occurredAt: body.occurredAt || null,
      source: body.source,
      sourceUrl: body.sourceUrl,
      notes: body.notes,
      resolvedByUserId: userId,
    });
  }

  private async checkAdmin(userId: string) {
    const res = await this.db.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`, [userId],
    );
    if (!res.rows.length || !this.ADMIN_EMAILS.includes(res.rows[0].email)) {
      throw new ForbiddenException('Admin access required');
    }
  }
}
