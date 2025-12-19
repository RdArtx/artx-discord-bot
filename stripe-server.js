require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');

console.log("STRIPE_SECRET_KEY loaded?", process.env.STRIPE_SECRET_KEY?.startsWith("sk_"));
console.log("STRIPE_WEBHOOK_SECRET loaded?", Boolean(process.env.STRIPE_WEBHOOK_SECRET));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature failed:', err.message);
    return res.status(400).send('Webhook Error');
  }

  // ✅ Log every event type so you can see what's coming in
  console.log("📩 Stripe event:", event.type);

  // ✅ Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log("💰 checkout.session.completed received");
    console.log("Session ID:", session.id);
    console.log("Email:", session.customer_email || "(none provided)");
    console.log("Mode:", session.mode);
    console.log("Metadata:", session.metadata || {});
  }

  res.json({ received: true });
});

app.listen(3000, () => console.log('✅ Stripe webhook running on port 3000'));