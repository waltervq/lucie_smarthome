const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "IIIIIIIVVVIVIIVIIIIX";

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ===================== FICHIER D'ÉTATS =====================
const FILE = "./states.json";

// Pins GPIO valides
const VALID_PINS = ["gpio26", "gpio27", "gpio25", "gpio33", "gpio32", "gpio14"];
//                  salon    chambre  cuisine  veranda  ext.lamps  ventilo

/**
 * Charge les états depuis le fichier JSON.
 * Initialise avec toutes les pins à "off" et capteurs à null.
 */
function loadStates() {
    if (!fs.existsSync(FILE)) {
        const init = {
            gpio26: "off",   // Salon
            gpio27: "off",   // Chambre
            gpio25: "off",   // Cuisine
            gpio33: "off",   // Véranda
            gpio32: "off",   // Lampes extérieur
            gpio14: "off",   // Ventilateur
            temperature: null,
            humidite: null
        };
        fs.writeFileSync(FILE, JSON.stringify(init, null, 2));
        return init;
    }
    return JSON.parse(fs.readFileSync(FILE));
}

function saveStates(data) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}



// =========================
// ESP32 → LECTURE ÉTATS
// =========================

/**
 * GET /api
 * L'ESP32 appelle cette route pour récupérer les états actuels de tous les GPIOs.
 */
app.get("/api", (req, res) => {
    res.json(loadStates());
});



// =========================
// BOT WHATSAPP → MODIFICATION GPIO
// =========================

/**
 * POST /api
 * Le bot WhatsApp envoie : { key, pin, state }
 * pour changer l'état d'un GPIO.
 */
app.post("/api", (req, res) => {

    const key = req.body.key;

    if (key !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const pin   = req.body.pin;
    const state = req.body.state;

    if (!VALID_PINS.includes(pin) || !["on", "off"].includes(state)) {
        return res.status(400).json({
            error: "Invalid command",
            validPins: VALID_PINS,
            validStates: ["on", "off"]
        });
    }

    let states = loadStates();
    states[pin] = state;
    saveStates(states);

    console.log(`[API] ${pin} → ${state}`);

    res.json({
        success: true,
        pin,
        state,
        all: states
    });

});



// =========================
// ESP32 → MISE À JOUR CAPTEURS
// =========================

/**
 * POST /api/sensors
 * L'ESP32 publie les données du capteur DHT22 : { key, temperature, humidite }
 */
app.post("/api/sensors", (req, res) => {

    const key = req.body.key;

    if (key !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const temperature = parseFloat(req.body.temperature);
    const humidite    = parseFloat(req.body.humidite);

    if (isNaN(temperature) || isNaN(humidite)) {
        return res.status(400).json({ error: "Invalid sensor data" });
    }

    let states = loadStates();
    states.temperature = temperature;
    states.humidite    = humidite;
    saveStates(states);

    console.log(`[SENSORS] Temp=${temperature}°C | Hum=${humidite}%`);

    res.json({
        success: true,
        temperature,
        humidite
    });

});



// =========================
// DÉMARRAGE
// =========================

app.listen(PORT, () => {
    console.log(`🏠 API SmartHome démarrée sur port ${PORT}`);
    console.log(`   Pins gérées : ${VALID_PINS.join(", ")}`);
});