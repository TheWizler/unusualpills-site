/// netlify/functions/create-checkout.js
const Stripe = require('stripe');

exports.handler = async (event) => {
  // Allow only POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Method Not Allowed',
    };
  }

  try {
    // --- Env & client ---
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Missing STRIPE_SECRET_KEY env var');
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // --- Parse body ---
    let items = [];
    try {
      const body = JSON.parse(event.body || '{}');
      items = Array.isArray(body.items) ? body.items : [];
    } catch {
      throw new Error('Invalid JSON body');
    }
    if (!items.length) throw new Error('No items provided');

    // Log the incoming payload in function logs (Netlify → Functions → Logs)
    console.log('checkout payload:', JSON.stringify(items));

    // --- Build line items (validate) ---
    const currency = String(items[0].currency || 'usd').toLowerCase();
    const line_items = items.map((it, idx) => {
      const name = it?.name ? String(it.name) : `Item ${idx + 1}`;
      const unit_amount = Number(it?.price_cents);
      const quantity = Number(it?.quantity || 1);

      if (!Number.isFinite(unit_amount) || unit_amount <= 0) {
        throw new Error(`Invalid price_cents for "${name}" (got: ${it?.price_cents})`);
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for "${name}" (got: ${it?.quantity})`);
      }

      return {
        price_data: {
          currency,
          product_data: { name },
          unit_amount, // cents
        },
        quantity,
        adjustable_quantity: { enabled: true, minimum: 1 },
      };
    });

    // --- Compute Buy-2-Get-2 discount (2 cheapest free for each group of 4 shirts) ---
    const shirtUnits = [];
    items.forEach((it) => {
      const qty = Number(it?.quantity || 1);
      if (it?.is_shirt) {
        for (let q = 0; q < qty; q++) {
          shirtUnits.push(Number(it.price_cents));
        }
      }
    });

    let discounts;
    if (shirtUnits.length >= 4) {
      const freeCount = Math.floor(shirtUnits.length / 4) * 2;
      const discountAmount = shirtUnits
        .sort((a, b) => a - b)
        .slice(0, freeCount)
        .reduce((s, p) => s + p, 0);

      if (discountAmount > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: discountAmount,
          currency,
          duration: 'once',
          max_redemptions: 1,
          name: 'Buy 2 Get 2 (auto)',
          redeem_by: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        });
        discounts = [{ coupon: coupon.id }];
      }
    }

    // --- URLs ---
    const siteUrl =
      process.env.SITE_URL ||
      event.headers?.origin ||
      `https://${event.headers?.host || 'unusualpills.com'}`;

    // --- Create Stripe Checkout session ---
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      discounts,
      allow_promotion_codes: true,
      // automatic_tax: { enabled: true }, // keep disabled unless enabled in Stripe
      success_url: `${siteUrl}/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart.html`,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    // Include as much error detail as possible
    const details = {
      message: err?.message || 'Stripe error',
      type: err?.type || err?.raw?.type,
      code: err?.code || err?.raw?.code,
      stripe_message: err?.raw?.message,
    };
    console.error('create-checkout error:', details);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `${details.message}${details.stripe_message ? ' — ' + details.stripe_message : ''}` }),
    };
  }
};
