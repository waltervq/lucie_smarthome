/**
 * =====================================================
 *  ESP32 Smart Home - Code ESP32 Arduino
 *  Fichier : esp32_poll.ino
 *  Description : Interroge l'API PHP sur InfinityFree
 *                toutes les 2 secondes et applique les
 *                états reçus aux GPIOs 26 et 27.
 *
 *  Librairies requises (via Gestionnaire de librairies Arduino) :
 *    - ArduinoJson  (Benoit Blanchon) version >= 6.x
 * =====================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ===================== CONFIGURATION =====================
// WiFi
const char* ssid     = "Galaxy Z Flip5 6884";
const char* password = "IIIIIIIVVVIVII";

// URL de votre API PHP hébergée sur InfinityFree
// Exemple : "https://votrenom.infinityfreeapp.com/api.php"
const char* apiUrl = "https://lucie-smarthome.ct.ws/api.php";

// GPIOs
const int PIN_GPIO26 = 26;
const int PIN_GPIO27 = 27;

// Intervalle de polling en millisecondes
const unsigned long POLL_INTERVAL = 2000;

// ===================== VARIABLES =====================
unsigned long lastPollTime = 0;
String lastState26 = "";
String lastState27 = "";

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);

  // Configuration des GPIOs
  pinMode(PIN_GPIO26, OUTPUT);
  pinMode(PIN_GPIO27, OUTPUT);
  digitalWrite(PIN_GPIO26, LOW);
  digitalWrite(PIN_GPIO27, LOW);

  // Connexion WiFi
  Serial.print("\n[WiFi] Connexion à : ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[WiFi] Connecté !");
  Serial.print("[WiFi] IP : ");
  Serial.println(WiFi.localIP());
  Serial.println("[ESP32] Démarrage du polling vers l'API PHP...");
}

// ===================== LOOP =====================
void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = currentTime;
    pollAPI();
  }
}

// ===================== POLLING API =====================
void pollAPI() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Déconnecté ! Tentative de reconnexion...");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(apiUrl);
  http.setTimeout(5000); // Timeout 5 secondes

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.print("[API] Réponse : ");
    Serial.println(payload);

    // Analyse JSON
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.print("[JSON] Erreur de parsing : ");
      Serial.println(error.c_str());
      http.end();
      return;
    }

    // Récupération des états
    String state26 = doc["gpio26"] | "off";
    String state27 = doc["gpio27"] | "off";

    // Application GPIO 26
    if (state26 != lastState26) {
      lastState26 = state26;
      if (state26 == "on") {
        digitalWrite(PIN_GPIO26, HIGH);
        Serial.println("[GPIO26] --> ALLUMÉ");
      } else {
        digitalWrite(PIN_GPIO26, LOW);
        Serial.println("[GPIO26] --> ÉTEINT");
      }
    }

    // Application GPIO 27
    if (state27 != lastState27) {
      lastState27 = state27;
      if (state27 == "on") {
        digitalWrite(PIN_GPIO27, HIGH);
        Serial.println("[GPIO27] --> ALLUMÉ");
      } else {
        digitalWrite(PIN_GPIO27, LOW);
        Serial.println("[GPIO27] --> ÉTEINT");
      }
    }

  } else {
    Serial.print("[HTTP] Erreur : code ");
    Serial.println(httpCode);
  }

  http.end();
}
