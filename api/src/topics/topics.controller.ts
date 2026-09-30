import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Auth, CurrentPrincipal, Principal } from '../auth/principal';
import { ChildrenService } from '../children/children.service';
import {
  LEVEL_DESCRIPTION,
  MAX_LEVEL,
  tierForLevel,
  TIER_LABEL,
  type TierOption,
  tierOptionsFor,
  TOPIC_META,
  TOPICS,
} from '../domain/topics';

export class TopicView {
  code: string;
  label: string;
  symbol: string;
  blurb: string;
  /** This child's current level in this topic. */
  level: number;
  maxLevel: number;
  /** Easy | Medium | Hard — the three the child is shown. */
  tier: string;
  /** Plain description of what this level asks for, for the parent view. */
  levelDescription: string;
  /**
   * The three difficulties the child may pick, with the level each would put
   * them on. Computed here so the tier-to-level mapping has one home rather
   * than being duplicated in the interface.
   */
  tiers: TierOption[];
}

@ApiTags('topics')
@ApiBearerAuth()
@Controller('topics')
@UseGuards(AuthGuard)
export class TopicsController {
  constructor(private readonly children: ChildrenService) {}

  /**
   * The four topics with the calling child's level in each.
   *
   * Difficulty is a property of (child, topic), so this is the only endpoint
   * that can answer "how hard should adding be for me right now".
   */
  @Get()
  @Auth('child')
  @ApiOperation({ summary: 'Topics with this child’s level in each' })
  async list(@CurrentPrincipal() principal: Principal): Promise<TopicView[]> {
    const views: TopicView[] = [];
    for (const code of TOPICS) {
      const { level } = await this.children.levelFor(principal.id, code);
      const meta = TOPIC_META[code];
      views.push({
        code,
        label: meta.label,
        symbol: meta.symbol,
        blurb: meta.blurb,
        level,
        maxLevel: MAX_LEVEL,
        tier: TIER_LABEL[tierForLevel(level)],
        levelDescription: LEVEL_DESCRIPTION[code][level] ?? `Level ${level}`,
        tiers: tierOptionsFor(code, level),
      });
    }
    return views;
  }
}
