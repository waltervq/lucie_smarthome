/**
 * =====================================================
 *  ESP32 Smart Home - esp32_poll.ino
 *  Description : Interroge l'API Node.js sur Render
 *                toutes les 2 secondes et applique les
 *                états reçus aux GPIOs.
 *                Publie également température et humidité
 *                via le capteur DHT22.
 *
 *  === MAPPING DES PINS ===
 *  GPIO 26 → Lumière Salon
 *  GPIO 27 → Lumière Chambre
 *  GPIO 25 → Lumière Cuisine
 *  GPIO 33 → Lumière Véranda
 *  GPIO 32 → Lampes Extérieur
 *  GPIO 14 → Ventilateur
 *  GPIO  4 → Capteur DHT22 (données)
 *
 *  Librairies requises (via Gestionnaire de librairies Arduino) :
 *    - ArduinoJson  (Benoit Blanchon) >= 6.x
 *    - DHT sensor library (Adafruit)
 *    - Adafruit Unified Sensor
 * =====================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ===================== CONFIGURATION WIFI =====================
const char* ssid     = "Galaxy Z Flip5 6884";
const char* password = "IIIIIIIVVVIVII";

// ===================== CONFIGURATION API =====================
const char* apiGetUrl     = "https://lucie-smarthome.onrender.com/api";
const char* apiSensorUrl  = "https://lucie-smarthome.onrender.com/api/sensors";
const char* API_KEY       = "IIIIIIIVVVIVIIVIIIIX";

// ===================== PINS GPIO =====================
const int PIN_SALON     = 26;   // Lumière salon
const int PIN_CHAMBRE   = 27;   // Lumière chambre
const int PIN_CUISINE   = 25;   // Lumière cuisine
const int PIN_VERANDA   = 33;   // Lumière véranda
const int PIN_EXTERIEUR = 32;   // Lampes extérieur
const int PIN_VENTILO   = 14;   // Ventilateur
const int PIN_DHT       = 4;    // Capteur DHT22

// ===================== CAPTEUR DHT22 =====================
#define DHTTYPE DHT22
DHT dht(PIN_DHT, DHTTYPE);

// ===================== INTERVALLES =====================
const unsigned long POLL_INTERVAL   = 2000;   // lecture GPIO (2s)
const unsigned long SENSOR_INTERVAL = 30000;  // envoi capteurs (30s)

// ===================== VARIABLES D'ÉTAT =====================
unsigned long lastPollTime   = 0;
unsigned long lastSensorTime = 0;

String lastSalon     = "";
String lastChambre   = "";
String lastCuisine   = "";
String lastVeranda   = "";
String lastExterieur = "";
String lastVentilo   = "";


// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);

  // Configuration des sorties GPIO
  pinMode(PIN_SALON,     OUTPUT); digitalWrite(PIN_SALON,     LOW);
  pinMode(PIN_CHAMBRE,   OUTPUT); digitalWrite(PIN_CHAMBRE,   LOW);
  pinMode(PIN_CUISINE,   OUTPUT); digitalWrite(PIN_CUISINE,   LOW);
  pinMode(PIN_VERANDA,   OUTPUT); digitalWrite(PIN_VERANDA,   LOW);
  pinMode(PIN_EXTERIEUR, OUTPUT); digitalWrite(PIN_EXTERIEUR, LOW);
  pinMode(PIN_VENTILO,   OUTPUT); digitalWrite(PIN_VENTILO,   LOW);

  // Démarrage capteur DHT
  dht.begin();

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
  Serial.println("[ESP32] SmartHome démarré.");
}


// ===================== LOOP =====================
void loop() {
  unsigned long now = millis();

  // Lecture des commandes GPIO toutes les 2s
  if (now - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = now;
    pollAPI();
  }

  // Envoi des données capteurs toutes les 30s
  if (now - lastSensorTime >= SENSOR_INTERVAL) {
    lastSensorTime = now;
    sendSensorData();
  }
}


// ===================== APPLIQUER UN GPIO =====================
void applyGPIO(int pin, String state, String lastState, String label) {
  if (state != lastState) {
    if (state == "on") {
      digitalWrite(pin, HIGH);
      Serial.print("[GPIO] "); Serial.print(label); Serial.println(" --> ALLUMÉ");
    } else {
      digitalWrite(pin, LOW);
      Serial.print("[GPIO] "); Serial.print(label); Serial.println(" --> ÉTEINT");
    }
  }
}


// ===================== POLLING API (COMMANDES GPIO) =====================
void pollAPI() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Déconnecté ! Tentative de reconnexion...");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(apiGetUrl);
  http.setTimeout(5000);

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.print("[API] Réponse : ");
    Serial.println(payload);

    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.print("[JSON] Erreur : ");
      Serial.println(error.c_str());
      http.end();
      return;
    }

    // Récupération des états
    String sSalon     = doc["gpio26"] | "off";
    String sChambre   = doc["gpio27"] | "off";
    String sCuisine   = doc["gpio25"] | "off";
    String sVeranda   = doc["gpio33"] | "off";
    String sExterieur = doc["gpio32"] | "off";
    String sVentilo   = doc["gpio14"] | "off";

    // Application conditionnelle (seulement si changement)
    if (sSalon     != lastSalon)     { applyGPIO(PIN_SALON,     sSalon,     lastSalon,     "Salon");           lastSalon     = sSalon; }
    if (sChambre   != lastChambre)   { applyGPIO(PIN_CHAMBRE,   sChambre,   lastChambre,   "Chambre");         lastChambre   = sChambre; }
    if (sCuisine   != lastCuisine)   { applyGPIO(PIN_CUISINE,   sCuisine,   lastCuisine,   "Cuisine");         lastCuisine   = sCuisine; }
    if (sVeranda   != lastVeranda)   { applyGPIO(PIN_VERANDA,   sVeranda,   lastVeranda,   "Veranda");         lastVeranda   = sVeranda; }
    if (sExterieur != lastExterieur) { applyGPIO(PIN_EXTERIEUR, sExterieur, lastExterieur, "Ext. Lampes");     lastExterieur = sExterieur; }
    if (sVentilo   != lastVentilo)   { applyGPIO(PIN_VENTILO,   sVentilo,   lastVentilo,   "Ventilateur");     lastVentilo   = sVentilo; }

  } else {
    Serial.print("[HTTP] Erreur code : ");
    Serial.println(httpCode);
  }

  http.end();
}


// ===================== ENVOI CAPTEURS DHT22 =====================
void sendSensorData() {
  if (WiFi.status() != WL_CONNECTED) return;

  float temperature = dht.readTemperature();
  float humidite    = dht.readHumidity();

  // Vérification lecture valide
  if (isnan(temperature) || isnan(humidite)) {
    Serial.println("[DHT] Lecture invalide, capteur non connecté ?");
    return;
  }

  Serial.print("[DHT] Temp="); Serial.print(temperature);
  Serial.print("°C | Hum="); Serial.print(humidite); Serial.println("%");

  // Construction du body
  String postData = "key=";
  postData += API_KEY;
  postData += "&temperature=";
  postData += String(temperature, 1);
  postData += "&humidite=";
  postData += String(humidite, 1);

  HTTPClient http;
  http.begin(apiSensorUrl);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  int httpCode = http.POST(postData);

  if (httpCode == HTTP_CODE_OK) {
    Serial.println("[DHT] Données envoyées à l'API ✓");
  } else {
    Serial.print("[DHT] Erreur envoi : code ");
    Serial.println(httpCode);
  }

  http.end();
}
