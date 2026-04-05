require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Config ---
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || "sandbox";
const PAYPAL_API = PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const PRICE = "5.00";
const CURRENCY = "USD"; // PayPal AZN desteklemir, USD istifade edirik

// --- Middleware ---
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://www.paypal.com",
          "https://www.sandbox.paypal.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameSrc: ["https://www.paypal.com", "https://www.sandbox.paypal.com"],
        connectSrc: ["'self'", "https://www.paypal.com", "https://www.sandbox.paypal.com"],
        imgSrc: ["'self'", "data:", "https://www.paypalobjects.com", "https://t.paypal.com"],
      },
    },
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- PayPal Access Token ---
async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token xetasi: ${res.status} - ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

// --- API: PayPal Client ID (frontend ucun) ---
app.get("/api/config", (req, res) => {
  res.json({
    clientId: PAYPAL_CLIENT_ID,
    mode: PAYPAL_MODE,
  });
});

// --- API: Sifaris yarat ---
app.post("/api/orders", async (req, res) => {
  try {
    const accessToken = await getPayPalAccessToken();

    const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: CURRENCY,
              value: PRICE,
            },
            description: "Psixoloji Saglamliq Testi - Tam Netice",
          },
        ],
      }),
    });

    if (!orderRes.ok) {
      const text = await orderRes.text();
      throw new Error(`Sifaris yaratma xetasi: ${orderRes.status} - ${text}`);
    }

    const order = await orderRes.json();
    res.json({ id: order.id });
  } catch (err) {
    console.error("Order creation error:", err.message);
    res.status(500).json({ error: "Sifaris yaradila bilmedi" });
  }
});

// --- API: Odenis tesdiqle ---
app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const { orderID } = req.params;
    const accessToken = await getPayPalAccessToken();

    const captureRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!captureRes.ok) {
      const text = await captureRes.text();
      throw new Error(`Capture xetasi: ${captureRes.status} - ${text}`);
    }

    const captureData = await captureRes.json();

    if (captureData.status === "COMPLETED") {
      console.log(`Odenis ugurlu: Order ${orderID}, Mebleg: ${PRICE} ${CURRENCY}`);
      res.json({ success: true, order: captureData });
    } else {
      res.json({ success: false, status: captureData.status });
    }
  } catch (err) {
    console.error("Capture error:", err.message);
    res.status(500).json({ error: "Odenis tesdiq oluna bilmedi" });
  }
});

// --- SPA fallback ---
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`Server isleyir: http://localhost:${PORT}`);
  console.log(`PayPal rejimi: ${PAYPAL_MODE}`);
  if (PAYPAL_CLIENT_ID === "your_paypal_client_id_here") {
    console.warn("\n DIQQET: .env faylinda PayPal melumatlarini daxil edin!");
    console.warn("   https://developer.paypal.com/dashboard/applications\n");
  }
});
