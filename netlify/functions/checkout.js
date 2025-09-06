// netlify/functions/checkout.js
// CommonJS style so Netlify finds exports.handler
const Stripe = require('stripe');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'text/plain' }, body: 'Method Not Allowed' };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = event.headers?.origin || `https://${event.headers?.host || ''}`;

    const { items } = JSON.parse(event.body || '{}');
    if (!Array.isArray(items) || !items.length) {
      return { statusCode: 400, body: 'No items provided' };
    }

    // Build line items
    const line_items = items.map(it => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: it.name || 'Item',
          images: it.image ? [origin + '/' + it.image.replace(/^\//, '')] : [],
          metadata: {
            slug: it.slug || '',
            size: it.size || '',
            color: it.color || '',
            type: (it.type || '').toLowerCase(),
          },
        },
        unit_amount: Math.round((it.price || 0) * 100),
      },
      quantity: it.qty || 1,
    }));

    // --- Buy 2 Get 2 (tees only) ---
    const tees = items.filter(it => (it.type || '').toLowerCase() === 'tee');
    const teeCount = tees.reduce((n, it) => n + (it.qty || 1), 0);

    let discounts;
    if (teeCount >= 4) {
      const groups = Math.floor(teeCount / 4);               // 4 tees -> 2 free
      const teeUnit = Math.round((tees[0].price || 0) * 100); // cents
      const discountCents = groups * 2 * teeUnit;
      if (discountCents > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: discountCents,
          currency: 'usd',
          duration: 'once',
          name: `Buy 2 Get 2 (${groups * 2} free)`,
        });
        discounts = [{ coupon: coupon.id }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      discounts, // only present if we created a coupon
      allow_promotion_codes: true,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      success_url: `${origin}/thanks.html?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart.html`,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
