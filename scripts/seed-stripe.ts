import { getStripe } from "../src/lib/stripe";

/**
 * Creates a handful of succeeded test-mode payments so the refunds dashboard
 * has Stripe charges to search and refund. Safe to run repeatedly; each run
 * adds new charges. Requires STRIPE_SECRET_KEY (a test key) in the environment.
 */
const PAYMENTS = [
  { name: "Nadia Haddad", email: "nadia.haddad@example.com", amount: 24_900, description: "Annual subscription — Pro plan" },
  { name: "Tobias Lindqvist", email: "tobias.lindqvist@example.com", amount: 132_500, description: "Hardware bundle, order 55120" },
  { name: "Grace Abiola", email: "grace.abiola@example.com", amount: 50_000, description: "Freight charge, shipment 8871" },
  { name: "Marcus Feld", email: "marcus.feld@example.com", amount: 78_400, description: "Repair service, invoice R-2291" },
  { name: "Ana Beltrán", email: "ana.beltran@example.com", amount: 8_750, description: "Course materials" },
];

async function main() {
  const stripe = getStripe();

  for (const payment of PAYMENTS) {
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
      billing_details: { name: payment.name, email: payment.email },
    });
    const intent = await stripe.paymentIntents.create({
      amount: payment.amount,
      currency: "usd",
      description: payment.description,
      receipt_email: payment.email,
      payment_method: paymentMethod.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });
    console.log(`${intent.id} ${payment.name} ${payment.amount / 100} USD`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
