const { Client, Environment } = require('square');
const crypto = require('crypto');

const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox
});

// Valid prices in pence
const PRICES = {
  'Basic Report': 3999,
  'Standard Report': 4999,
  'Premium Report': 5999
};

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { sourceId, amountPence, currency, planName, customerName, customerEmail, postalCode } = body;

    // Validate required fields
    if (!sourceId || !amountPence || !currency || !planName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Missing required fields.' })
      };
    }

    // Validate amount matches plan
    const expected = PRICES[planName];
    if (!expected || expected !== amountPence) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Invalid plan or amount.' })
      };
    }

    // Create payment
    const { result } = await squareClient.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(amountPence),
        currency
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      buyerEmailAddress: customerEmail,
      billingAddress: { postalCode },
      note: `${planName} for ${customerName}`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        paymentId: result.payment.id,
        status: result.payment.status,
        receiptUrl: result.payment.receiptUrl
      })
    };

  } catch (err) {
    console.error('Payment error:', err);
    const squareErrors = err.result?.errors;
    let message = 'Payment failed. Please try a different card.';
    if (squareErrors?.length) {
      message = squareErrors[0].detail || message;
    }
    return {
      statusCode: 402,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: message })
    };
  }
};
