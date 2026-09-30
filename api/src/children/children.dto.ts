import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { MAX_AGE, MIN_AGE } from '../domain/topics';

/**
 * Avatars are picked from a fixed set, not uploaded. A child chooses by
 * tapping a picture, and the API never has to accept an image from a
 * five-year-old's device.
 */
export const AVATARS = ['fox', 'panda', 'owl', 'cat', 'robot', 'dino', 'bee', 'whale'] as const;
export type Avatar = (typeof AVATARS)[number];

export class CreateChildDto {
  /** The child's first name, as they would say it. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Please type a name' })
  @MaxLength(30)
  name: string;

  /** 5 to 10 inclusive. */
  @IsInt({ message: 'Age must be a whole number' })
  @Min(MIN_AGE, { message: `This game is for ages ${MIN_AGE} to ${MAX_AGE}` })
  @Max(MAX_AGE, { message: `This game is for ages ${MIN_AGE} to ${MAX_AGE}` })
  age: number;

  @IsOptional()
  @IsIn(AVATARS)
  avatar?: Avatar;
}

export class UpdateChildDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_AGE)
  @Max(MAX_AGE)
  age?: number;

  @IsOptional()
  @IsIn(AVATARS)
  avatar?: Avatar;
}

export class TopicLevelView {
  topic: string;
  label: string;
  level: number;
  tier: string;
}

export class ChildView {
  id: string;
  name: string;
  age: number;
  avatar: string;
  xpTotal: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
  levels: TopicLevelView[];
}
