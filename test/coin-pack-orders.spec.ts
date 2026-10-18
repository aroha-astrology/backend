import { beforeEach, describe, expect, it, vi } from 'vitest';

// The coin packs in the order flow (switch money.coinPacks) and charging in other currencies on the
// website (switch money.razorpayIntl). Rules under test:
//  - the list is the old top-up amounts until money.coinPacks is on, then the four packs;
//  - a coin-pack order can only be started while money.coinPacks is on, an old id always works;
//  - orders keep the pack's RUPEE price in amount/final_amount (so admin revenue sums stay rupees)
//    and the real charge in charged_minor, in the order's currency;
//  - Razorpay is asked for the real charge, in the real currency;
//  - with money.razorpayIntl off, everything is rupees.

const state = vi.hoisted(() => ({
  switches: new Set<string>(),
  insertOrder: vi.fn(),
  setOrderGatewayOrderId: vi.fn(),
  createRazorpayOrder: vi.fn(),
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  isFeatureOn: (_user: string, key: string) => Promise.resolve(state.switches.has(key)),
}));
vi.mock('../src/modules/billing/billing.repo.js', () => ({
  insertOrder: state.insertOrder,
  setOrderGatewayOrderId: state.setOrderGatewayOrderId,
  findOrderByIdForUser: vi.fn(),
  findOrdersForUser: vi.fn(),
  findDebitsForUser: vi.fn(),
  findLatestOrderForPack: vi.fn(),
  findStalePendingRazorpayOrders: vi.fn(),
  confirmOrderAndGrantCredits: vi.fn(),
  refundOrder: vi.fn(),
}));
vi.mock('../src/modules/billing/razorpay.js', () => ({
  createRazorpayOrder: state.createRazorpayOrder,
  getRazorpayKeyId: () => 'rzp_test_key',
  verifyRazorpaySignature: vi.fn(),
  fetchRazorpayOrderPayments: vi.fn(),
  isRazorpayConfigured: () => true,
}));
vi.mock('../src/modules/billing/google-play-verifier.js', () => ({
  verifyGooglePlayPurchase: vi.fn(),
  consumeGooglePlayPurchase: vi.fn(),
  fetchGooglePlayPurchase: vi.fn(),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({ findActiveUserById: vi.fn() }));
vi.mock('../src/lib/notifications/telegram.js', () => ({ notifyWalletTopUp: vi.fn() }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { listTopUps, checkout, startRazorpayCheckout, resolveChargeCurrency } = await import(
  '../src/modules/billing/billing.service.js'
);

beforeEach(() => {
  state.switches = new Set();
  state.insertOrder.mockReset().mockImplementation((v: Record<string, unknown>) => Promise.resolve({ id: 'order-1', ...v }));
  state.setOrderGatewayOrderId.mockReset().mockResolvedValue(undefined);
  state.createRazorpayOrder.mockReset().mockResolvedValue('order_rzp_1');
});

describe('listTopUps', () => {
  it('is the old top-up list, in rupees, while money.coinPacks is off', async () => {
    const out = await listTopUps('u1', 'US');
    expect(out.coinPacks).toBe(false);
    expect(out.currency).toBe('INR');
    expect(out.amounts.map((a) => a.id)).toEqual([
      'recharge_25',
      'recharrge_50',
      '100_recharge',
      'recharge_250',
      'recharge_500',
    ]);
  });

  it('is the four coin packs in rupees once money.coinPacks is on (money.razorpayIntl still off)', async () => {
    state.switches.add('money.coinPacks');
    const out = await listTopUps('u1', 'US', 'USD');
    expect(out.coinPacks).toBe(true);
    expect(out.currency).toBe('INR');
    expect(out.currencies).toEqual(['INR']);
    expect(out.amounts.map((a) => [a.id, a.label, a.coins])).toEqual([
      ['coins_100', '₹99', 100],
      ['coins_330', '₹299', 330],
      ['coins_700', '₹599', 700],
      ['coins_1800', '₹1499', 1800],
    ]);
    expect(out.amounts.find((a) => a.id === 'coins_330')?.popular).toBe(true);
  });

  it('quotes a US buyer in dollars and a German one in euros once money.razorpayIntl is on', async () => {
    state.switches.add('money.coinPacks').add('money.razorpayIntl');
    const us = await listTopUps('u1', 'US');
    expect(us.currency).toBe('USD');
    expect(us.amounts.map((a) => a.label)).toEqual(['$1.99', '$4.99', '$9.99', '$19.99']);
    const de = await listTopUps('u1', 'DE');
    expect(de.amounts.map((a) => a.label)).toEqual(['€1.99', '€4.99', '€9.99', '€19.99']);
    expect(us.currencies).toEqual(['INR', 'USD', 'EUR', 'GBP']);
  });

  it('honours a currency the app asks for only while money.razorpayIntl is on', async () => {
    state.switches.add('money.coinPacks');
    expect((await listTopUps('u1', 'IN', 'GBP')).currency).toBe('INR');
    state.switches.add('money.razorpayIntl');
    expect((await listTopUps('u1', 'IN', 'GBP')).currency).toBe('GBP');
  });
});

describe('resolveChargeCurrency', () => {
  it('is always rupees while money.razorpayIntl is off', async () => {
    expect(await resolveChargeCurrency('u1', 'US', 'USD')).toBe('INR');
  });

  it('is the requested currency, else the one for the country, once it is on', async () => {
    state.switches.add('money.razorpayIntl');
    expect(await resolveChargeCurrency('u1', 'IN', 'EUR')).toBe('EUR');
    expect(await resolveChargeCurrency('u1', 'GB')).toBe('GBP');
    expect(await resolveChargeCurrency('u1', null)).toBe('INR');
  });
});

describe('starting an order', () => {
  it('refuses a coin pack while money.coinPacks is off, on the Play and the website routes alike', async () => {
    await expect(checkout('u1', 'coins_330')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(startRazorpayCheckout('u1', 'coins_330')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(state.insertOrder).not.toHaveBeenCalled();
  });

  it('an old top-up id always works, even with the coin packs on (older apps, orders in flight)', async () => {
    state.switches.add('money.coinPacks');
    await checkout('u1', 'recharge_250');
    expect(state.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ packId: 'recharge_250', amountPaise: 25000, currency: 'INR', chargedMinor: null }),
    );
  });

  it('a Play coin-pack order is recorded at the rupee list price (Play charges its own local price)', async () => {
    state.switches.add('money.coinPacks');
    await checkout('u1', 'coins_330');
    expect(state.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: 'coins_330',
        amountPaise: 29900,
        finalAmountPaise: 29900,
        currency: 'INR',
        chargedMinor: null,
      }),
    );
  });

  it('a dollar order keeps the rupee list price for revenue sums and charges Razorpay in dollars', async () => {
    state.switches.add('money.coinPacks').add('money.razorpayIntl');
    const out = await startRazorpayCheckout('u1', 'coins_330', { country: 'US' });
    expect(state.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: 'coins_330',
        amountPaise: 29900,
        finalAmountPaise: 29900,
        currency: 'USD',
        chargedMinor: 499,
        gatewayProvider: 'razorpay',
      }),
    );
    expect(state.createRazorpayOrder).toHaveBeenCalledWith({
      amountPaise: 499,
      currency: 'USD',
      receipt: 'order-1',
    });
    expect(out.razorpayOrderId).toBe('order_rzp_1');
  });

  it('an app that asks for dollars is still charged rupees while money.razorpayIntl is off', async () => {
    state.switches.add('money.coinPacks');
    await startRazorpayCheckout('u1', 'coins_330', { country: 'US', currency: 'USD' });
    expect(state.createRazorpayOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: 29900, currency: 'INR' }),
    );
  });

  it('an old top-up is charged exactly as before: its own amount, in rupees', async () => {
    await startRazorpayCheckout('u1', '100_recharge');
    expect(state.createRazorpayOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: 10000, currency: 'INR' }),
    );
  });

  it('an unknown pack id is refused', async () => {
    state.switches.add('money.coinPacks');
    await expect(startRazorpayCheckout('u1', 'coins_999')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
