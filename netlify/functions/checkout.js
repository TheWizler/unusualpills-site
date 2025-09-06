const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { items } = JSON.parse(event.body || '{}');
  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: 'No items.' };
  }

  const currency = items[0].currency || 'usd';
  const line_items = items.map(it => ({
    price_data: {
      currency,
      product_data: { name: it.name },
      unit_amount: it.price_cents,
    },
    quantity: it.quantity,
    adjustable_quantity: { enabled: true, minimum: 1 }
  }));

  // Promo: for every 4 shirts, 2 cheapest free
  const shirtUnits = [];
  items.forEach(it => {
    if (it.is_shirt) for (let q = 0; q < it.quantity; q++) shirtUnits.push(it.price_cents);
  });

  let couponId = null;
  if (shirtUnits.length >= 4) {
    const freeCount = Math.floor(shirtUnits.length / 4) * 2;
    const discountAmount = shirtUnits.sort((a,b)=>a-b).slice(0, freeCount).reduce((s,p)=>s+p,0);
    if (discountAmount > 0) {
      const expiresAt = Math.floor(Date.now()/1000) + 3600; // 1 hour
      const coupon = await stripe.coupons.create({
        amount_off: discountAmount,
        currency,
        duration: 'once',
        max_redemptions: 1,
        name: 'Buy 2 Get 2 (auto)',
        redeem_by: expiresAt
      });
      couponId = coupon.id;
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      discounts: couponId ? [{ coupon: couponId }] : undefined,
      allow_promotion_codes: true,
      shipping_address_collection: { allowed_countries: ['US','CA'] },
      automatic_tax: { enabled: true },
      success_url: `${process.env.SITE_URL}/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/cart.html`,
    });
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Stripe error' };
  }
};
