import { describe, expect, test } from 'vitest';
import {
  BRAND_DEALS_CACHE_TTL_MS,
  PIPELINE_ORDER,
  fetchBrandDeals,
  groupDeals,
  parseNotionDeal,
} from '@/lib/connectors/brand-deals';
import { BrandDealSchema, type BrandDeal } from '@/lib/schemas';

/**
 * /brand-deals mirrors the Notion "Brand Deals Hub" database. Notion stays the
 * source of truth (the brand-deal agents and any invited collaborators work
 * there); the OS renders it. An iframe was measured dead — Notion sends
 * X-Frame-Options: SAMEORIGIN even on published pages — so this reads the API.
 */

// A trimmed but shape-accurate Notion API page object, as databases.query returns.
const NOTION_PAGE = {
  id: 'abc-123',
  url: 'https://www.notion.so/Acme-abc123',
  last_edited_time: '2026-08-10T12:00:00.000Z',
  properties: {
    'Brand Name': { type: 'title', title: [{ plain_text: 'Acme Tools' }] },
    Status: { type: 'status', status: { name: 'Negotiating' } },
    'Brand Tier': { type: 'select', select: { name: 'A' } },
    'Deal Value': { type: 'number', number: 4500 },
    Budget: { type: 'number', number: 6000 },
    'Amount Agreed': { type: 'number', number: null },
    'Suggested Rate': { type: 'number', number: 5000 },
    'Paid in Full': { type: 'checkbox', checkbox: false },
    Deadline: { type: 'date', date: { start: '2026-09-01' } },
    'Follow-up Date': { type: 'date', date: null },
    'Contact Name': { type: 'rich_text', rich_text: [{ plain_text: 'Jo Doe' }] },
    'Contact Email': { type: 'email', email: 'jo@acme.com' },
    'Main Channel': { type: 'select', select: { name: 'Instagram' } },
    'Video Type': { type: 'select', select: { name: 'Integration' } },
    Source: { type: 'select', select: { name: 'Inbound' } },
    'ICP Fit': { type: 'select', select: { name: 'Strong' } },
  },
};

describe('parseNotionDeal', () => {
  test('maps a Notion page into a validated BrandDeal', () => {
    const deal = parseNotionDeal(NOTION_PAGE);
    expect(deal).not.toBeNull();
    expect(BrandDealSchema.parse(deal)).toEqual(deal);
    expect(deal!.brand).toBe('Acme Tools');
    expect(deal!.status).toBe('Negotiating');
    expect(deal!.dealValueUsd).toBe(4500);
    expect(deal!.amountAgreedUsd).toBeNull();
    expect(deal!.deadline).toBe('2026-09-01');
    expect(deal!.followUpDate).toBeNull();
    expect(deal!.contactEmail).toBe('jo@acme.com');
    expect(deal!.notionUrl).toContain('notion.so');
  });

  test('tolerates missing properties rather than dropping the row', () => {
    const bare = {
      id: 'x',
      url: 'https://www.notion.so/x',
      last_edited_time: '2026-08-01T00:00:00.000Z',
      properties: { 'Brand Name': { type: 'title', title: [{ plain_text: 'Mystery Co' }] } },
    };
    const deal = parseNotionDeal(bare);
    expect(deal!.brand).toBe('Mystery Co');
    expect(deal!.status).toBe('New'); // Notion's default status group
    expect(deal!.dealValueUsd).toBeNull();
  });

  test('a page with no title becomes null, not an unnamed row', () => {
    expect(parseNotionDeal({ id: 'y', url: 'u', last_edited_time: 't', properties: {} })).toBeNull();
  });
});

describe('groupDeals — the pipeline board', () => {
  const sampleDeal: BrandDeal = {
    id: 'test-1', brand: 'Test Brand', status: 'New', tier: 'A',
    dealValueUsd: 1000, budgetUsd: 2000, amountAgreedUsd: null, suggestedRateUsd: 1500,
    paidInFull: false, deadline: null, followUpDate: null,
    contactName: null, contactEmail: null, mainChannel: 'Instagram',
    videoType: 'Short-form', source: 'Inbound', icpFit: 'Decent',
    notionUrl: 'https://notion.so/', lastEdited: '2026-08-13T15:00:00.000Z', seeded: false,
  };

  test('groups by status in the Notion pipeline order, not alphabetically', () => {
    const deals = [
      { ...sampleDeal, status: 'Paid' },
      { ...sampleDeal, status: 'New' },
      { ...sampleDeal, status: 'Negotiating' },
    ];
    const lanes = groupDeals(deals);
    const named = lanes.filter((l) => l.deals.length > 0).map((l) => l.status);
    expect(named).toEqual(['New', 'Negotiating', 'Paid']);
    // and the full order matches the Notion board
    expect(PIPELINE_ORDER.slice(0, 3)).toEqual(['New', 'Negotiating', 'Aligned']);
    expect(PIPELINE_ORDER).toContain('Invoiced');
  });

  test('an unknown status still shows up rather than silently vanishing', () => {
    const lanes = groupDeals([{ ...sampleDeal, status: 'Weird Custom' }]);
    expect(lanes.some((l) => l.status === 'Weird Custom' && l.deals.length === 1)).toBe(true);
  });
});

describe('honest empty state when Notion is not configured', () => {
  test('returns empty deals when Notion API key is missing', async () => {
    const res = await fetchBrandDeals({});
    expect(res.mode).toBe('error');
    expect(res.deals).toEqual([]);
    expect(res.detail).toContain('NOTION_API_KEY');
  });

  test('returns empty deals when data-source id is unset', async () => {
    const res = await fetchBrandDeals({ NOTION_API_KEY: 'secret_x' });
    expect(res.mode).toBe('error');
    expect(res.deals).toEqual([]);
    expect(res.detail).toContain('NOTION_BRAND_DEALS_SOURCE');
  });
});
