<?php
/**
 * =====================================================
 *  ESP32 Smart Home - API PHP (InfinityFree)
 *  Fichier : api.php
 *  Description : Passerelle HTTP entre le bot WhatsApp
 *                et l'ESP32. Stocke les états GPIO dans
 *                un fichier JSON local (states.json).
 * =====================================================
 */

// ---- Sécurité ----
// Remplacez par une clé secrète partagée entre le bot et ce script.
define('API_KEY', 'IIIIIIIVVVIVIIVIIIIX');

// ---- CORS (permet à l'ESP32 et au bot d'appeler depuis n'importe où) ----
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// ---- Fichier de stockage des états ----
$statesFile = __DIR__ . '/states.json';

// ---- Initialisation du fichier si inexistant ----
function loadStates($file) {
    if (!file_exists($file)) {
        $default = ['gpio26' => 'off', 'gpio27' => 'off'];
        file_put_contents($file, json_encode($default));
        return $default;
    }
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    if (!is_array($data)) {
        $data = ['gpio26' => 'off', 'gpio27' => 'off'];
    }
    return $data;
}

function saveStates($file, $states) {
    file_put_contents($file, json_encode($states));
}

// ---- Lecture de la méthode HTTP ----
$method = $_SERVER['REQUEST_METHOD'];

// ================================================================
//  GET  ->  Lecture des états (appelé par l'ESP32 en polling)
// ================================================================
if ($method === 'GET' && !isset($_GET['pin'])) {
    $states = loadStates($statesFile);
    echo json_encode($states);
    exit;
}

// ================================================================
//  POST  ->  Écriture d'un état (appelé par le bot WhatsApp)
// ================================================================
if ($method === 'POST') {
    // Vérification de la clé API
    $key = isset($_POST['key']) ? $_POST['key'] : '';
    if ($key !== API_KEY) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $pin   = isset($_POST['pin'])   ? $_POST['pin']   : '';
    $state = isset($_POST['state']) ? strtolower($_POST['state']) : '';

    // Validation
    $allowedPins   = ['gpio26', 'gpio27'];
    $allowedStates = ['on', 'off'];

    if (!in_array($pin, $allowedPins) || !in_array($state, $allowedStates)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid pin or state', 'pin' => $pin, 'state' => $state]);
        exit;
    }

    $states = loadStates($statesFile);
    $states[$pin] = $state;
    saveStates($statesFile, $states);

    echo json_encode(['success' => true, 'pin' => $pin, 'state' => $state, 'all' => $states]);
    exit;
}

// ================================================================
//  GET avec paramètres  ->  Écriture simplifiée (mode debug)
//  Exemple : api.php?key=SECRET&pin=gpio26&state=on
// ================================================================
if ($method === 'GET' && isset($_GET['pin'])) {
    $key = isset($_GET['key']) ? $_GET['key'] : '';
    if ($key !== API_KEY) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $pin   = isset($_GET['pin'])   ? $_GET['pin']   : '';
    $state = isset($_GET['state']) ? strtolower($_GET['state']) : '';

    $allowedPins   = ['gpio26', 'gpio27'];
    $allowedStates = ['on', 'off'];

    if (!in_array($pin, $allowedPins) || !in_array($state, $allowedStates)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid pin or state']);
        exit;
    }

    $states = loadStates($statesFile);
    $states[$pin] = $state;
    saveStates($statesFile, $states);

    echo json_encode(['success' => true, 'pin' => $pin, 'state' => $state, 'all' => $states]);
    exit;
}

// ---- Fallback ----
http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
