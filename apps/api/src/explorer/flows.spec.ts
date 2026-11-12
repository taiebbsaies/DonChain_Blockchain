import { formatUnits6, toCsv, toFlowRow, type EventRow } from './flows.js';

const row = (event_name: string, args: EventRow['args']): EventRow => ({
  block_number: '12',
  block_time: '1790000000',
  tx_hash: '0xabc',
  log_index: 0,
  contract: 'vault',
  event_name,
  args,
});

describe('flux des fonds', () => {
  it('formate les montants USDC sans perte', () => {
    expect(formatUnits6('1500000000')).toBe('1500');
    expect(formatUnits6('1')).toBe('0.000001');
    expect(formatUnits6('10500000')).toBe('10.5');
    expect(formatUnits6(null)).toBe('');
  });

  it('classe les mouvements', () => {
    expect(toFlowRow(row('DonationReceived', { donor: '0xd', amount: '5', receiptId: '1' }))).toMatchObject({
      category: 'donation',
      party: '0xd',
      amount: '5',
    });
    expect(toFlowRow(row('FundsReleased', { milestoneId: '2', supplier: '0xs', amount: '9' }))).toMatchObject({
      category: 'release',
      milestoneId: 2,
      party: '0xs',
    });
    expect(toFlowRow(row('DisputeResolved', { id: '0', resolver: '0xr', upheld: true, note: '' }))!.label).toContain(
      'retenue',
    );
    expect(toFlowRow(row('MilestoneReleased', { id: '0', supplier: '0xs', amount: '9' }))).toBeNull();
  });

  it('neutralise les formules dans le CSV', () => {
    const r = toFlowRow(row('DonationReceived', { donor: '=HYPERLINK("x")', amount: '1', receiptId: '1' }))!;
    const csv = toCsv([r]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
