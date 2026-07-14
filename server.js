const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const QRCode = require("qrcode");
const bot = require("./whatsapp-bot");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "IIIIIIIVVVIVIIVIIIIX";
const STATES_FILE = path.join(__dirname, "states.json");

const VALID_PINS = ["gpio26", "gpio27", "gpio25", "gpio33", "gpio32", "gpio14"];

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function defaultStates() {
    return {
        gpio26: "off",
        gpio27: "off",
        gpio25: "off",
        gpio33: "off",
        gpio32: "off",
        gpio14: "off",
        temperature: null,
        humidite: null
    };
}

function loadStates() {
    if (!fs.existsSync(STATES_FILE)) {
        const init = defaultStates();
        saveStates(init);
        return init;
    }

    try {
        return { ...defaultStates(), ...JSON.parse(fs.readFileSync(STATES_FILE, "utf8")) };
    } catch (err) {
        console.error("[API] states.json invalide:", err.message);
        return defaultStates();
    }
}

function saveStates(data) {
    fs.writeFileSync(STATES_FILE, JSON.stringify(data, null, 2));
}

bot.startBot().catch((err) => {
    console.error("[BOT] Impossible de demarrer le bot WhatsApp:", err);
});

app.get("/", (req, res) => {
    res.json({
        ok: true,
        api: "/api",
        qr: "/qr",
        bot: "/bot/status"
    });
});

app.get("/api", (req, res) => {
    res.json(loadStates());
});

app.post("/api", (req, res) => {
    if (req.body.key !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { pin, state } = req.body;
    if (!VALID_PINS.includes(pin) || !["on", "off"].includes(state)) {
        return res.status(400).json({
            error: "Invalid command",
            validPins: VALID_PINS,
            validStates: ["on", "off"]
        });
    }

    const states = loadStates();
    states[pin] = state;
    saveStates(states);

    console.log(`[API] ${pin} -> ${state}`);
    res.json({ success: true, pin, state, all: states });
});

app.post("/api/sensors", (req, res) => {
    if (req.body.key !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const temperature = parseFloat(req.body.temperature);
    const humidite = parseFloat(req.body.humidite);

    if (Number.isNaN(temperature) || Number.isNaN(humidite)) {
        return res.status(400).json({ error: "Invalid sensor data" });
    }

    const states = loadStates();
    states.temperature = temperature;
    states.humidite = humidite;
    saveStates(states);

    console.log(`[SENSORS] Temp=${temperature}C | Hum=${humidite}%`);
    res.json({ success: true, temperature, humidite });
});

app.get("/qr", async (req, res) => {
    try {
        if (bot.isConnected()) {
            return res.send(renderPage("Bot WhatsApp connecte", "<p>Aucun QR Code necessaire.</p>"));
        }

        const qr = bot.getQR();
        if (!qr) {
            return res.send(renderPage(
                "Generation du QR Code...",
                "<p>Actualisez cette page dans quelques secondes.</p>"
            ));
        }

        const image = await QRCode.toDataURL(qr);
        return res.send(renderPage(
            "Scanner ce QR avec WhatsApp",
            `<img src="${image}" width="320" height="320" alt="QR Code WhatsApp">
             <p>WhatsApp -> Appareils connectes -> Connecter un appareil</p>`
        ));
    } catch (err) {
        console.error("[QR]", err);
        return res.status(500).send("Erreur lors de la generation du QR.");
    }
});

app.get("/bot/status", (req, res) => {
    res.json({
        connected: bot.isConnected(),
        qrAvailable: Boolean(bot.getQR())
    });
});

function renderPage(title, body) {
    return `<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
</head>
<body style="font-family:Arial,sans-serif;text-align:center;padding:30px;background:#f5f5f5">
    <h2>${title}</h2>
    ${body}
</body>
</html>`;
}

app.listen(PORT, () => {
    console.log(`API SmartHome demarree sur port ${PORT}`);
    console.log(`Pins gerees : ${VALID_PINS.join(", ")}`);
});
