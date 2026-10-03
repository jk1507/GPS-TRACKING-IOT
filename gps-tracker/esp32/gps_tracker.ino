/* ==========================================================================
   ESP32 GPS Tracker  -  NEO-6M  ->  REST backend
   --------------------------------------------------------------------------
   Hardware
     ESP32 DevKit V1 / ESP32-WROOM-32
     NEO-6M  TX  -> ESP32 GPIO16  (ESP32 UART RX)
     NEO-6M  RX  -> ESP32 GPIO17  (ESP32 UART TX)
     NEO-6M  GND -> ESP32 GND
     NEO-6M  VCC -> ESP32 3V3      (do NOT power it from 5V)
     Onboard LED -> GPIO2

   Behaviour
     - Reads NMEA sentences from the NEO-6M on UART1 (9600 baud)
     - Parses $GxGGA (fix, satellites, altitude, HDOP) and $GxRMC
       (date/time, ground speed, course)
     - POSTs a JSON fix every 10 s, but only with a valid fix, non-zero
       coordinates and at least 4 satellites
     - Retries failed uploads and reconnects Wi-Fi automatically
     - LED: OFF = no Wi-Fi | SOLID = Wi-Fi, no fix | BLINKING = Wi-Fi + fix

   Before flashing
     1. Copy secrets.h.example to secrets.h and fill it in.
     2. Select board "ESP32 Dev Module" and the correct COM port.
   ========================================================================== */

#include <WiFi.h>
#include <HTTPClient.h>
#include <math.h>

#include "secrets.h"

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------
static const int RXPin = 16;   // ESP32 RX  <- NEO-6M TX
static const int TXPin = 17;   // ESP32 TX  -> NEO-6M RX
static const int LED_PIN = 2;
static const bool LED_ACTIVE_HIGH = true;

static const uint32_t GPS_BAUD = 9600;
static const uint32_t SERIAL_BAUD = 115200;
static const uint32_t SEND_INTERVAL_MS = 10000;   // upload every 10 seconds
static const uint32_t WIFI_RETRY_MS = 10000;
static const uint32_t LED_BLINK_MS = 500;
static const uint32_t HTTP_TIMEOUT_MS = 8000;
static const int MIN_SATELLITES = 4;
static const int MAX_UPLOAD_ATTEMPTS = 3;

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------
HardwareSerial gpsSerial(1);

struct GpsData {
  bool hasFix = false;         // seen a valid GGA + RMC
  double latitude = 0.0;       // decimal degrees
  double longitude = 0.0;      // decimal degrees
  double altitude = 0.0;       // metres
  int satellites = 0;
  double speedKnots = -1.0;    // RMC ground speed (knots); -1 = unknown
  double course = -1.0;        // RMC track angle (degrees true); -1 = unknown
  double hdop = -1.0;          // GGA HDOP; -1 = unknown
  char utcTime[12] = "";       // "hhmmss.sss"
  char utcDate[8] = "";        // "ddmmyy"
  uint32_t lastFixMs = 0;
};

GpsData gps;

char nmeaBuffer[128];
uint8_t nmeaIndex = 0;

uint32_t lastSendMs = 0;
uint32_t lastWifiAttemptMs = 0;
uint32_t lastBlinkMs = 0;
bool blinkState = false;

bool uploadPending = false;    // a fix is waiting for a successful upload
String pendingPayload = "";

// --------------------------------------------------------------------------
// NMEA helpers
// --------------------------------------------------------------------------

/** "4807.038" + 'N'  ->  48.117300 */
double nmeaToDegrees(const char *value, char hemisphere) {
  if (value == nullptr || value[0] == '\0') return 0.0;

  double raw = atof(value);
  int degrees = (int)(raw / 100.0);
  double minutes = raw - (degrees * 100.0);
  double decimal = degrees + (minutes / 60.0);

  if (hemisphere == 'S' || hemisphere == 'W') decimal = -decimal;
  return decimal;
}

/** Split a comma separated NMEA line into fields (in place). */
int splitNmea(char *line, char *fields[], int maxFields) {
  int count = 0;
  char *cursor = line;
  while (count < maxFields) {
    fields[count++] = cursor;
    char *comma = strchr(cursor, ',');
    if (comma == nullptr) break;
    *comma = '\0';
    cursor = comma + 1;
  }
  return count;
}

/** XOR checksum between '$' and '*'. */
bool checksumValid(const char *line) {
  if (line[0] != '$') return false;
  const char *star = strchr(line, '*');
  if (star == nullptr) return false;

  uint8_t checksum = 0;
  for (const char *p = line + 1; p < star; ++p) checksum ^= (uint8_t)(*p);

  uint8_t expected = (uint8_t)strtol(star + 1, nullptr, 16);
  return checksum == expected;
}

/** $GxGGA - position fix, satellites, altitude. */
void parseGga(char *fields[], int count) {
  if (count < 10) return;

  // fields[6] = fix quality (0 = invalid)
  if (fields[6][0] == '0' || fields[6][0] == '\0') {
    gps.hasFix = false;
    return;
  }

  double lat = nmeaToDegrees(fields[2], fields[3][0]);
  double lon = nmeaToDegrees(fields[4], fields[5][0]);
  if (lat == 0.0 && lon == 0.0) {
    gps.hasFix = false;
    return;
  }

  gps.latitude = lat;
  gps.longitude = lon;
  gps.satellites = atoi(fields[7]);
  if (count > 8 && fields[8][0] != '\0') gps.hdop = atof(fields[8]);
  gps.altitude = atof(fields[9]);
  strncpy(gps.utcTime, fields[1], sizeof(gps.utcTime) - 1);
  gps.lastFixMs = millis();
  gps.hasFix = true;
}

/** $GxRMC - date + validity flag (needed to build the timestamp). */
void parseRmc(char *fields[], int count) {
  if (count < 10) return;

  if (fields[2][0] != 'A') {   // 'A' = active/valid, 'V' = void
    gps.hasFix = false;
    return;
  }
  strncpy(gps.utcDate, fields[9], sizeof(gps.utcDate) - 1);

  // RMC also carries ground speed (knots) and track angle (degrees true).
  if (count > 7 && fields[7][0] != '\0') gps.speedKnots = atof(fields[7]);
  if (count > 8 && fields[8][0] != '\0') gps.course = atof(fields[8]);
}

void handleNmeaLine(char *line) {
  if (!checksumValid(line)) return;

  char *star = strchr(line, '*');
  if (star != nullptr) *star = '\0';

  char *fields[24];
  int count = splitNmea(line + 1, fields, 24);  // skip the leading '$'
  if (count == 0) return;

  const char *sentence = fields[0];            // e.g. "GPGGA", "GNRMC"
  if (strlen(sentence) < 5) return;

  const char *type = sentence + 2;             // skip the talker ID
  if (strcmp(type, "GGA") == 0) {
    parseGga(fields, count);
  } else if (strcmp(type, "RMC") == 0) {
    parseRmc(fields, count);
  }
}

/** Drain whatever the GPS module has buffered. Never blocks. */
void readGps() {
  while (gpsSerial.available() > 0) {
    char c = (char)gpsSerial.read();

    if (c == '\n' || c == '\r') {
      if (nmeaIndex > 0) {
        nmeaBuffer[nmeaIndex] = '\0';
        handleNmeaLine(nmeaBuffer);
        nmeaIndex = 0;
      }
      continue;
    }

    if (nmeaIndex < sizeof(nmeaBuffer) - 1) {
      nmeaBuffer[nmeaIndex++] = c;
    } else {
      nmeaIndex = 0;   // overflow: drop the malformed line
    }
  }
}

// --------------------------------------------------------------------------
// LED
// --------------------------------------------------------------------------
void updateLed() {
  bool wifiUp = (WiFi.status() == WL_CONNECTED);
  bool hasFix = (gps.hasFix && gps.satellites >= MIN_SATELLITES);

  if (!wifiUp) {
    // OFF: no Wi-Fi
    digitalWrite(LED_PIN, LED_ACTIVE_HIGH ? LOW : HIGH);
    return;
  }

  if (!hasFix) {
    // SOLID: Wi-Fi connected, waiting for a GPS fix
    digitalWrite(LED_PIN, LED_ACTIVE_HIGH ? HIGH : LOW);
    return;
  }

  // BLINKING: Wi-Fi connected and a valid fix is available
  if (millis() - lastBlinkMs >= LED_BLINK_MS) {
    lastBlinkMs = millis();
    blinkState = !blinkState;
  }
  bool level = LED_ACTIVE_HIGH ? blinkState : !blinkState;
  digitalWrite(LED_PIN, level ? HIGH : LOW);
}

// --------------------------------------------------------------------------
// Wi-Fi
// --------------------------------------------------------------------------
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiAttemptMs < WIFI_RETRY_MS) return;

  lastWifiAttemptMs = millis();
  Serial.print("[wifi] connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 8000) {
    readGps();     // keep parsing NMEA while we wait
    updateLed();
    delay(20);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[wifi] connected, IP ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[wifi] not connected yet - will retry");
  }
}

// --------------------------------------------------------------------------
// Upload
// --------------------------------------------------------------------------

/** Build the ISO-8601 timestamp the backend expects (UTC). */
String buildTimestamp() {
  if (strlen(gps.utcDate) != 6 || strlen(gps.utcTime) < 6) return "";

  char day[3] = {gps.utcDate[0], gps.utcDate[1], '\0'};
  char month[3] = {gps.utcDate[2], gps.utcDate[3], '\0'};
  char year[5] = {'2', '0', gps.utcDate[4], gps.utcDate[5], '\0'};

  char hh[3] = {gps.utcTime[0], gps.utcTime[1], '\0'};
  char mm[3] = {gps.utcTime[2], gps.utcTime[3], '\0'};
  char ss[3] = {gps.utcTime[4], gps.utcTime[5], '\0'};

  char stamp[32];
  snprintf(stamp, sizeof(stamp), "%s-%s-%sT%s:%s:%s", year, month, day, hh, mm, ss);
  return String(stamp);
}

String buildPayload() {
  String payload = "{";
  payload += "\"device_id\":\"" DEVICE_ID "\",";
  payload += "\"latitude\":" + String(gps.latitude, 6) + ",";
  payload += "\"longitude\":" + String(gps.longitude, 6) + ",";
  payload += "\"altitude\":" + String(gps.altitude, 1) + ",";
  payload += "\"satellites\":" + String(gps.satellites) + ",";

  // Ground speed (m/s), heading (degrees) and a rough accuracy estimate
  // (HDOP x ~5 m for the NEO-6M). The backend already validates and stores
  // all three - the dashboard uses them for the live speed card.
  if (gps.speedKnots >= 0.0) {
    payload += "\"speed\":" + String(gps.speedKnots * 0.514444, 2) + ",";
  }
  if (gps.course >= 0.0) {
    payload += "\"heading\":" + String(gps.course, 1) + ",";
  }
  if (gps.hdop > 0.0) {
    payload += "\"accuracy\":" + String(gps.hdop * 5.0, 1) + ",";
  }

  String stamp = buildTimestamp();
  if (stamp.length() > 0) {
    payload += "\"timestamp\":\"" + stamp + "\"";
  } else {
    payload += "\"timestamp\":\"" + String(millis()) + "\"";
  }
  payload += "}";
  return payload;
}

/** POST one fix. Returns true on a 2xx response. */
bool uploadLocation(const String &payload) {
  if (WiFi.status() != WL_CONNECTED) return false;

  String url = String(API_BASE_URL) + "/api/location";

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(client, url)) {
    Serial.println("[http] begin() failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + API_SECRET);

  int status = http.POST(payload);
  String body = http.getString();
  http.end();

  if (status >= 200 && status < 300) {
    Serial.printf("[http] %d ok - %s\n", status, body.c_str());
    return true;
  }

  Serial.printf("[http] upload failed (%d) - %s\n", status, body.c_str());
  return false;
}

/** Send the current fix, retrying a few times before leaving it pending. */
void sendCurrentFix() {
  String payload = buildPayload();

  for (int attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    if (uploadLocation(payload)) {
      uploadPending = false;
      pendingPayload = "";
      return;
    }
    Serial.printf("[http] retry %d/%d\n", attempt, MAX_UPLOAD_ATTEMPTS);
    delay(400);
  }

  // Keep it and try again on the next loop, so a brief outage never loses data.
  uploadPending = true;
  pendingPayload = payload;
  Serial.println("[http] upload deferred to next cycle");
}

// --------------------------------------------------------------------------
// Arduino entry points
// --------------------------------------------------------------------------
void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);
  Serial.println();
  Serial.println("=== ESP32 GPS Tracker ===");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LED_ACTIVE_HIGH ? LOW : HIGH);

  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, RXPin, TXPin);
  Serial.printf("[gps] NEO-6M on UART1 RX=%d TX=%d @ %u baud\n", RXPin, TXPin, GPS_BAUD);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  ensureWifi();

  lastSendMs = millis();
}

void loop() {
  // Always read the GPS, even while the Wi-Fi is down.
  readGps();
  ensureWifi();
  updateLed();

  // Retry a deferred upload as soon as we have a connection again.
  if (uploadPending && WiFi.status() == WL_CONNECTED) {
    Serial.println("[http] retrying deferred upload");
    if (uploadLocation(pendingPayload)) {
      uploadPending = false;
      pendingPayload = "";
    }
  }

  uint32_t now = millis();
  if (now - lastSendMs < SEND_INTERVAL_MS) return;

  lastSendMs = now;

  const bool validFix = gps.hasFix && gps.latitude != 0.0 && gps.longitude != 0.0 &&
                        gps.satellites >= MIN_SATELLITES;

  if (!validFix) {
    Serial.printf("[gps] no fix yet (sats=%d, lat=%.6f, lon=%.6f)\n", gps.satellites, gps.latitude,
                  gps.longitude);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[wifi] offline - keeping the fix for the next cycle");
    return;
  }

  Serial.printf("[gps] fix lat=%.6f lon=%.6f alt=%.1fm sats=%d\n", gps.latitude, gps.longitude,
                gps.altitude, gps.satellites);
  sendCurrentFix();
}
