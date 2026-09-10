import { describe, expect, it } from 'vitest';
import { RATING_VALUES } from './ratingControl';
import { MAX_DERIVATION_LIMIT, MAX_RATINGS_SCAN, PAGE_SIZE, RATING_PAGE_SIZE } from './trustLimits';
import {
  DEVELOPER_REFERENCE_ENDPOINTS,
  DEVELOPER_REFERENCE_SECTIONS,
  DIRECTORY_BOUNDS,
  RATING_VALUE_RANGE,
  ROLE_MAPPINGS,
  SUBMISSION_TIMING,
  formatDurationMs,
} from './developerReference';

describe('developerReference data', () => {
  it('derives the rating range from the real RATING_VALUES constant', () => {
    expect(RATING_VALUE_RANGE.min).toBe(Math.min(...RATING_VALUES));
    expect(RATING_VALUE_RANGE.max).toBe(Math.max(...RATING_VALUES));
    expect(RATING_VALUE_RANGE.removalValue).toBe(0);
    expect(RATING_VALUE_RANGE.values).toEqual([...RATING_VALUES].sort((a, b) => a - b));
  });

  it('mirrors the real directory/activity bound constants, not a hand-typed copy', () => {
    expect(DIRECTORY_BOUNDS.pageSize).toBe(PAGE_SIZE);
    expect(DIRECTORY_BOUNDS.ratingPageSize).toBe(RATING_PAGE_SIZE);
    expect(DIRECTORY_BOUNDS.maxDerivationLimit).toBe(MAX_DERIVATION_LIMIT);
    expect(DIRECTORY_BOUNDS.maxRatingsScan).toBe(MAX_RATINGS_SCAN);
  });

  it('formats millisecond durations without hardcoding a unit', () => {
    expect(formatDurationMs(SUBMISSION_TIMING.pollIntervalMs)).toBe('8 seconds');
    expect(formatDurationMs(SUBMISSION_TIMING.timeoutMs)).toBe('3 minutes');
    expect(formatDurationMs(60_000)).toBe('1 minute');
    expect(formatDurationMs(1_000)).toBe('1 second');
    expect(formatDurationMs(1_500)).toBe('1500 ms');
  });

  it('covers all four wire categories exactly once in the role mapping', () => {
    expect(ROLE_MAPPINGS.map((role) => role.wireCategory).sort()).toEqual(
      ['MANAGER', 'PLAYER', 'SUBJECT', 'TRAINER'].sort(),
    );
  });

  it('lists a unique, non-empty set of reference sections and endpoints', () => {
    expect(DEVELOPER_REFERENCE_SECTIONS.length).toBeGreaterThan(0);
    expect(new Set(DEVELOPER_REFERENCE_SECTIONS.map((section) => section.id)).size).toBe(
      DEVELOPER_REFERENCE_SECTIONS.length,
    );
    expect(DEVELOPER_REFERENCE_ENDPOINTS.length).toBeGreaterThan(0);
    expect(new Set(DEVELOPER_REFERENCE_ENDPOINTS.map((endpoint) => endpoint.path)).size).toBe(
      DEVELOPER_REFERENCE_ENDPOINTS.length,
    );
  });
});
