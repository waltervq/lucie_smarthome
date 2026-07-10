/**
 * =====================================================
 *  ESP32 Smart Home - Bot WhatsApp
 *  Fichier : whatsapp_bot.js
 *  Description : Bot WhatsApp basé sur whatsapp-web.js
 *                Écoute les commandes et met à jour
 *                l'API PHP sur InfinityFree.
 *
 *  Installation :
 *    npm install whatsapp-web.js qrcode-terminal axios
 *
 *  Démarrage :
 *    node whatsapp_bot.js
 * =====================================================
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// ===================== CONFIGURATION =====================

// URL de votre API PHP sur InfinityFree
const API_URL = 'https://lucie-smarthome.onrender.com';

// Clé API (doit correspondre à celle dans api.php)
const API_KEY = 'IIIIIIIVVVIVIIVIIIIX';

// Numéros WhatsApp autorisés à envoyer des commandes
// Format : "22899000000@c.us"  (code pays sans le +)
// Laissez vide [] pour accepter tout le monde (déconseillé en production)
const AUTHORIZED_NUMBERS = [
    // '22899000000@c.us',

];

// ===================== COMMANDES =====================
// Mappings de commandes : [regex] -> { pin, state }
// Les expressions régulières sont insensibles à la casse et
// gèrent les variantes courantes avec/sans accents.

const COMMANDS = [
    // Allume GPIO 26 (Appareil 1)
    { regex: /\b(allum[eé]s?|allumer)\s+(1|un)\b/i, pin: 'gpio26', state: 'on', label: 'GPIO 26 (Appareil 1)' },
    // Éteins GPIO 26 (Appareil 1)
    { regex: /\b([eé]tein[st]?|[eé]teindre|eteins?)\s+(1|un)\b/i, pin: 'gpio26', state: 'off', label: 'GPIO 26 (Appareil 1)' },
    // Allume GPIO 27 (Appareil 2)
    { regex: /\b(allum[eé]s?|allumer)\s+(2|deux)\b/i, pin: 'gpio27', state: 'on', label: 'GPIO 27 (Appareil 2)' },
    // Éteins GPIO 27 (Appareil 2)
    { regex: /\b([eé]tein[st]?|[eé]teindre|eteins?)\s+(2|deux)\b/i, pin: 'gpio27', state: 'off', label: 'GPIO 27 (Appareil 2)' },
    // Allume TOUT
    { regex: /\b(allum[eé]s?|allumer)\s+(tout|all|tous)\b/i, pin: 'all', state: 'on', label: 'Tout' },
    // Éteins TOUT
    { regex: /\b([eé]tein[st]?|[eé]teindre|eteins?)\s+(tout|all|tous)\b/i, pin: 'all', state: 'off', label: 'Tout' },
];

const HELP_TEXT = `🤖 *Commandes disponibles :*

💡 *Allumer :*
  • allumes 1  ➡️  GPIO 26
  • allumes 2  ➡️  GPIO 27
  • allumes tout  ➡️  Les deux

🔴 *Éteindre :*
  • éteins 1  ➡️  GPIO 26
  • éteins 2  ➡️  GPIO 27
  • éteins tout  ➡️  Les deux

📊 *Statut :*
  • statut  ➡️  Voir l'état actuel`;

// ===================== INITIALISATION CLIENT =====================

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'esp32-bot' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

// ===================== ÉVÉNEMENTS =====================

client.on('qr', (qr) => {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║   Scannez le QR code avec WhatsApp   ║');
    console.log('║  (Appareils connectés > Ajouter)     ║');
    console.log('╚══════════════════════════════════════╝\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n✅ Bot WhatsApp connecté et prêt !');
    console.log(`🌐 API PHP : ${API_URL}`);
    console.log('📱 En attente de commandes...\n');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Échec d\'authentification WhatsApp :', msg);
});

client.on('disconnected', (reason) => {
    console.warn('⚠️  Bot déconnecté :', reason);
});

// ===================== GESTION DES MESSAGES =====================

client.on('message', async (message) => {
    console.log("===============");
    console.log("FROM :", message.from);
    console.log("BODY :", message.body);

    const sender = message.from;
    const text = message.body.trim();

    // Vérification des numéros autorisés
    if (AUTHORIZED_NUMBERS.length > 0 && !AUTHORIZED_NUMBERS.includes(sender)) {
        console.log(`[BOT] Message ignoré (non autorisé) : ${sender}`);
        return;
    }

    // Ignorer les messages de groupe sauf si mentionné (optionnel)
    if (message.isGroupMsg) return;

    console.log(`[BOT] Message reçu de ${sender} : "${text}"`);

    // Commande : statut
    if (/^(statut|status|état|etat)$/i.test(text)) {
        await handleStatus(message);
        return;
    }

    // Commande : aide
    if (/^(aide|help|\?|commandes?)$/i.test(text)) {
        await message.reply(HELP_TEXT);
        return;
    }

    // Recherche d'une commande GPIO
    let matched = false;
    for (const cmd of COMMANDS) {
        if (cmd.regex.test(text)) {
            matched = true;
            await handleGPIOCommand(message, cmd);
            break;
        }
    }

    // Commande non reconnue
    if (!matched) {
        await message.reply(
            `❓ Commande non reconnue : *${text}*\n\nEnvoyez *aide* pour voir les commandes disponibles.`
        );
    }
});

// ===================== FONCTIONS =====================

/**
 * Envoie une requête POST à l'API PHP pour modifier l'état d'un GPIO.
 */
async function setGPIO(pin, state) {

    const params = new URLSearchParams({
        key: API_KEY,
        pin: pin,
        state: state
    });

    const response = await axios.post(
        API_URL,
        params.toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            timeout: 10000
        }
    );

    console.log("REPONSE API :", response.data);

    return response.data;
}
/**
 * Gère une commande GPIO reçue via WhatsApp.
 */
async function handleGPIOCommand(message, cmd) {
    try {
        const emoji = cmd.state === 'on' ? '✅' : '🔴';
        const action = cmd.state === 'on' ? 'allumé(e)' : 'éteint(e)';

        if (cmd.pin === 'all') {
            // Envoyer les deux commandes en parallèle
            await Promise.all([
                setGPIO('gpio26', cmd.state),
                setGPIO('gpio27', cmd.state),
            ]);
            await message.reply(
                `${emoji} *Tout ${action} !*\n\n• GPIO 26 (Appareil 1) : ${cmd.state.toUpperCase()}\n• GPIO 27 (Appareil 2) : ${cmd.state.toUpperCase()}`
            );
        } else {
            const result = await setGPIO(cmd.pin, cmd.state);
            await message.reply(
                `${emoji} *${cmd.label} ${action} !*\n\n• ${cmd.pin.toUpperCase()} : ${cmd.state.toUpperCase()}`
            );
        }

        console.log(`[GPIO] ${cmd.pin} -> ${cmd.state}`);

    } catch (error) {
        console.error('[ERREUR] Impossible de contacter l\'API :', error.message);
        await message.reply(
            `⚠️ *Erreur* : Impossible de contacter l'API ESP32.\n\nVérifiez que votre serveur InfinityFree est en ligne.`
        );
    }
}

/**
 * Gère la commande "statut" : lit l'état actuel des GPIOs depuis l'API.
 */
async function handleStatus(message) {
    try {
        const response = await axios.get(API_URL, { timeout: 10000 });
        const states = response.data;

        const icon26 = states.gpio26 === 'on' ? '✅ ON' : '🔴 OFF';
        const icon27 = states.gpio27 === 'on' ? '✅ ON' : '🔴 OFF';

        await message.reply(
            `📊 *État actuel des appareils :*\n\n💡 Appareil 1 (GPIO 26) : ${icon26}\n💡 Appareil 2 (GPIO 27) : ${icon27}`
        );
    } catch (error) {
        console.error('[ERREUR] Impossible de lire le statut :', error.message);
        await message.reply('⚠️ *Erreur* : Impossible de récupérer le statut de l\'API.');
    }
}

// ===================== DÉMARRAGE =====================
console.log('🚀 Démarrage du bot WhatsApp ESP32...');
client.initialize();
