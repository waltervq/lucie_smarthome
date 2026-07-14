const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode-terminal");
const axios = require("axios");
const pino = require("pino");


// ===================== CONFIG =====================
const API_URL = "https://lucie-smarthome.onrender.com/api";

const API_KEY = "IIIIIIIVVVIVIIVIIIIX";

const AUTHORIZED_NUMBERS = [
    "243977075005",
    "94296292257905",
    "243977089129"
];


// ===================== MAPPING PIECES / PINS =====================
// Chaque pièce = une ou plusieurs clés GPIO
const ROOMS = {
    salon: ["gpio26"],
    chambre: ["gpio25"],
    cuisine: ["gpio27"],
    veranda: ["gpio33"],
    exterieur: ["gpio32"],           // lampes extérieur (sans véranda)
    ventilateur: ["gpio14"],
};

// Groupes logiques
const GROUPS = {
    interieur: ["gpio26", "gpio27", "gpio25"], // salon + chambre + cuisine 
    exterieur: ["gpio32", "gpio33"],          // lampes ext + véranda
    tout: ["gpio26", "gpio27", "gpio25", "gpio33", "gpio32", "gpio14"],
};

// Noms lisibles pour les retours WhatsApp
const ROOM_LABELS = {
    gpio26: "Salon",
    gpio27: "Chambre",
    gpio25: "Cuisine",
    gpio33: "Véranda",
    gpio32: "Lampes extérieur",
    gpio14: "Ventilateur",
};


// ===================== HELPERS =====================

/**
 * Normalise le texte : minuscules + supprime accents.
 * Permet "Éteins", "eteins", "éteins" → "eteins"
 */
function normalize(str) {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // retire les diacritiques
}

/**
 * Envoie un ordre ON/OFF à une GPIO via l'API.
 */
async function setGPIO(pin, state) {
    const params = new URLSearchParams({ key: API_KEY, pin, state });
    const response = await axios.post(
        API_URL,
        params.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    console.log(`[API] ${pin} → ${state}`, response.data);
}

/**
 * Applique un état ON/OFF sur une liste de pins.
 */
async function setPins(pins, state) {
    for (const pin of pins) {
        await setGPIO(pin, state);
    }
}

/**
 * Lit les états actuels (température, humidité, gpio).
 */
async function getStates() {
    const response = await axios.get(API_URL);
    return response.data;
}

/**
 * Construit le message de confirmation d'allumage/extinction.
 */
function buildConfirmMessage(pins, state) {
    const emoji = state === "on" ? "✅" : "🔴";
    const action = state === "on" ? "allumé(e)" : "éteint(e)";
    const labels = pins.map(p => ROOM_LABELS[p] || p).join(", ");
    return `${emoji} ${labels} ${action}`;
}


// ===================== TRAITEMENT COMMANDES =====================

async function handleCommand(cmd, sock, from) {
    const c = normalize(cmd);  // commande normalisée, sans accents, minuscules

    // ---- ALLUMER pièce individuelle ----
    if (c.match(/allume[sz]?\s+salon/)) {
        await setPins(ROOMS.salon, "on");
        return buildConfirmMessage(ROOMS.salon, "on");
    }
    if (c.match(/allume[sz]?\s+chambre/)) {
        await setPins(ROOMS.chambre, "on");
        return buildConfirmMessage(ROOMS.chambre, "on");
    }
    if (c.match(/allume[sz]?\s+cuisine/)) {
        await setPins(ROOMS.cuisine, "on");
        return buildConfirmMessage(ROOMS.cuisine, "on");
    }
    if (c.match(/allume[sz]?\s+(veranda|véranda)/)) {
        await setPins(ROOMS.veranda, "on");
        return buildConfirmMessage(ROOMS.veranda, "on");
    }

    // ---- ALLUMER groupes ----
    if (c.match(/allume[sz]?\s+int[eé]rieur/)) {
        await setPins(GROUPS.interieur, "on");
        return "✅ Intérieur allumé (Salon, Chambre, Cuisine)";
    }
    if (c.match(/allume[sz]?\s+ext[eé]rieur/)) {
        await setPins(GROUPS.exterieur, "on");
        return "✅ Extérieur allumé (Lampes ext. + Véranda)";
    }
    if (c.match(/allume[sz]?\s+tout/)) {
        await setPins(GROUPS.tout, "on");
        return "✅ Tout est allumé";
    }

    // ---- ÉTEINDRE pièce individuelle ----
    if (c.match(/[eé]tein[st]\s+salon/)) {
        await setPins(ROOMS.salon, "off");
        return buildConfirmMessage(ROOMS.salon, "off");
    }
    if (c.match(/[eé]tein[st]\s+chambre/)) {
        await setPins(ROOMS.chambre, "off");
        return buildConfirmMessage(ROOMS.chambre, "off");
    }
    if (c.match(/[eé]tein[st]\s+cuisine/)) {
        await setPins(ROOMS.cuisine, "off");
        return buildConfirmMessage(ROOMS.cuisine, "off");
    }
    if (c.match(/[eé]tein[st]\s+(veranda|véranda)/)) {
        await setPins(ROOMS.veranda, "off");
        return buildConfirmMessage(ROOMS.veranda, "off");
    }
    if (c.match(/[eé]tein[st]\s+ext[eé]rieur/)) {
        await setPins(GROUPS.exterieur, "off");
        return "🔴 Extérieur éteint (Lampes ext. + Véranda)";
    }

    // ---- ÉTEINDRE groupes ----
    if (c.match(/[eé]tein[st]\s+int[eé]rieur/)) {
        await setPins(GROUPS.interieur, "off");
        return "🔴 Intérieur éteint (Salon, Chambre, Cuisine)";
    }
    if (c.match(/[eé]tein[st]\s+tout/)) {
        await setPins(GROUPS.tout, "off");
        return "🔴 Tout est éteint";
    }

    // ---- VENTILATEUR ----
    if (c.match(/rafraichi[rt]/)) {
        await setPins(ROOMS.ventilateur, "on");
        return "✅ Ventilateur allumé 🌬️";
    }
    if (c.match(/frais|stop.?ventilateur|[eé]tein[st].?ventilateur/)) {
        await setPins(ROOMS.ventilateur, "off");
        return "🔴 Ventilateur éteint";
    }

    // ---- CAPTEURS ----
    if (c.match(/temp[eé]rature|temp[eé]|temperature/)) {
        const states = await getStates();
        const temp = states.temperature !== undefined ? states.temperature : "N/A";
        return `🌡️ Température actuelle : *${temp}°C*`;
    }
    if (c.match(/humid[iì]t[eé]|humidite/)) {
        const states = await getStates();
        const hum = states.humidite !== undefined ? states.humidite : "N/A";
        return `💧 Humidité actuelle : *${hum}%*`;
    }

    // ---- STATUT ----
    if (c.match(/statut|status|etat|état/)) {
        const states = await getStates();

        const devices = [
            { key: "gpio26", label: "💡 Salon" },
            { key: "gpio27", label: "💡 Chambre" },
            { key: "gpio25", label: "💡 Cuisine" },
            { key: "gpio33", label: "💡 Véranda" },
            { key: "gpio32", label: "💡 Lampes extérieur" },
            { key: "gpio14", label: "🌬️ Ventilateur" },
        ];

        const lines = devices.map(d => {
            const isOn = states[d.key] === "on";
            return `${isOn ? "✅" : "🔴"} ${d.label} : ${isOn ? "Allumé" : "Éteint"}`;
        });

        const temp = states.temperature != null ? `${states.temperature}°C` : "N/A";
        const hum = states.humidite != null ? `${states.humidite}%` : "N/A";

        return (
            `🏠 *État de la maison :*

${lines.join("\n")}

🌡️ Température : *${temp}*
💧 Humidité : *${hum}*`
        );
    }

    // ---- AIDE ----
    if (c.match(/aide|help|\?/)) {
        return (
            `🏠 *Commandes SmartHome disponibles :*

💡 *Allumer :*
• allumes salon / chambre / cuisine / veranda
• allumes intérieur → toutes les pièces
• allumes extérieur → lampes ext + véranda
• allumes tout

🔴 *Éteindre :*
• éteins salon / chambre / cuisine / veranda
• éteins intérieur / extérieur / tout

🌬️ *Ventilateur :*
• rafraichir → allume ventilateur
• frais → éteint ventilateur

🌡️ *Capteurs :*
• température → affiche la temp
• humidité → affiche l'humidité`
        );
    }

    // Commande non reconnue
    return null;
}


// ===================== BOT WHATSAPP =====================

// Mémorise les IDs des messages envoyés par le bot pour ne pas les retraiter
const botSentIds = new Set();

async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("auth");

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" })
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {

        if (qr) {
            console.log("Scanne ce QR avec WhatsApp");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✅ Bot WhatsApp connecté");
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startBot();
            }
        }
    });

    /**
     * Envoie un message en mémorisant son ID pour éviter de le retraiter.
     */
    async function sendReply(jid, content) {
        const sent = await sock.sendMessage(jid, content);
        if (sent?.key?.id) {
            botSentIds.add(sent.key.id);
            // Nettoyage automatique après 30s pour éviter une fuite mémoire
            setTimeout(() => botSentIds.delete(sent.key.id), 30000);
        }
    }

    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];
        if (!msg.message) return;

        // Ignorer les messages que le BOT a lui-même envoyés (anti-boucle infinie)
        // Fonctionne même en mode "linked device" où fromMe=true pour tout
        if (botSentIds.has(msg.key.id)) return;

        // Éviter les groupes
        const from = msg.key.remoteJid;
        if (from.includes("@g.us")) return;

        // Récupérer le texte
        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            "";

        if (!text.trim()) return;

        console.log("📩 Commande reçue :", text, "| De :", from);

        // Vérifier autorisation
        const number = from.split("@")[0];
        if (!AUTHORIZED_NUMBERS.includes(number)) {
            console.log("🚫 Numéro non autorisé :", number);
            return;
        }

        try {
            const reply = await handleCommand(text, sock, from);

            if (reply) {
                await sendReply(from, { text: reply });
            } else {
                await sendReply(from, {
                    text: "❓ Commande inconnue. Envoie *aide* pour voir les commandes disponibles."
                });
            }
        } catch (err) {
            console.error("❌ Erreur lors du traitement :", err.message);
            await sendReply(from, {
                text: "⚠️ Erreur de communication avec l'API. Réessaie dans un instant."
            });
        }

    });

}


startBot();