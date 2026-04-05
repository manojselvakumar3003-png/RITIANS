/**
 * Ritians Transport – Live GPS Tracking Backend
 * Node.js + Express server
 * Stores latest vehicle GPS coordinates in memory (no database needed)
 */

const express = require("express");
const cors = require("cors");

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors()); // Allow requests from frontend (different port / origin)
app.use(express.json()); // Parse incoming JSON bodies
const path = require("path");
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});
const MAPS_API_KEY = 'AIzaSyAI4IB0sZzUYKtWp8QLQfVVurCYXqROtvo';

// ── In-Memory Location Store ──────────────────────────────────────────────────
// Structure: { vehicleId: { lat, lng, speed, heading, updatedAt, status } }
const locationStore = {};

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /update-location
 * Called by the driver's browser every few seconds with their GPS coordinates.
 * Body: { vehicleId, lat, lng, speed, heading }
 */
app.post("/update-location", (req, res) => {
  const { vehicleId, lat, lng, speed, heading } = req.body;

  // Validate required fields
  if (!vehicleId || lat === undefined || lng === undefined) {
    return res
      .status(400)
      .json({ success: false, error: "vehicleId, lat, and lng are required." });
  }

  const now = Date.now();
  const prev = locationStore[vehicleId];

  // Determine movement status: "Moving" if speed > 1 km/h, else "Stopped"
  const kmh = speed ? (speed * 3.6).toFixed(1) : 0;
  const status = parseFloat(kmh) > 1 ? "Moving" : "Stopped";

  // Store latest location
  locationStore[vehicleId] = {
    vehicleId,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    speed: parseFloat(kmh), // km/h
    heading: heading || 0,
    status,
    updatedAt: now,
    // Keep history of last 50 points for smooth path drawing (optional)
    path: prev
      ? [...(prev.path || []).slice(-49), { lat: parseFloat(lat), lng: parseFloat(lng), t: now }]
      : [{ lat: parseFloat(lat), lng: parseFloat(lng), t: now }],
  };

  console.log(
    `[GPS] ${vehicleId} → lat:${lat}, lng:${lng}, speed:${kmh}km/h, ${status}`
  );
  res.json({ success: true, status });
});

/**
 * GET /get-location/:vehicleId
 * Called by the tracking page to get the latest position of a vehicle.
 */
app.get("/get-location/:vehicleId", (req, res) => {
  const { vehicleId } = req.params;
  const data = locationStore[vehicleId];

  if (!data) {
    return res
      .status(404)
      .json({ success: false, error: "Vehicle not found or not tracking." });
  }

  // Check if location is stale (older than 60 seconds = driver went offline)
  const isStale = Date.now() - data.updatedAt > 60_000;
  res.json({ success: true, ...data, isStale });
});

/**
 * GET /all-vehicles
 * Returns all currently tracked vehicles (for admin overview).
 */
app.get("/all-vehicles", (req, res) => {
  const vehicles = Object.values(locationStore).map((v) => ({
    vehicleId: v.vehicleId,
    lat: v.lat,
    lng: v.lng,
    speed: v.speed,
    status: v.status,
    updatedAt: v.updatedAt,
    isStale: Date.now() - v.updatedAt > 60_000,
  }));
  res.json({ success: true, count: vehicles.length, vehicles });
});

/**
 * GET /health
 * Simple health check endpoint.
 */
app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), tracked: Object.keys(locationStore).length })
);

// ── Start ─────────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:4007';
const PORT = process.env.PORT || 4007;

app.listen(PORT, () => {
  console.log(`\n🚌 Ritians Transport – GPS Backend running on port ${PORT}`);
  console.log(`   POST /update-location   ← driver sends GPS`);
  console.log(`   GET  /get-location/:id  ← tracking page polls`);
  console.log(`   GET  /all-vehicles      ← all active vehicles`);
  console.log(`   GET  /health            ← server health\n`);
});
