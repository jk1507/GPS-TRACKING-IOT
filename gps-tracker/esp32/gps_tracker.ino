/*
   ============================================================
                 ESP32 GPS TRACKER
                 NEO-6M + GeoLinker
   ============================================================

   BOARD:
   ESP32 DevKit V1 / ESP32-WROOM-32

   GPS:
   NEO-6M

   GPS WIRING:
   NEO-6M TX  -> ESP32 GPIO 16
   NEO-6M RX  -> ESP32 GPIO 17
   NEO-6M GND -> ESP32 GND
   NEO-6M VCC -> ESP32 appropriate VCC

   ONBOARD LED:
   GPIO 2

   LED STATUS:
   OFF       -> WiFi disconnected
   SOLID ON  -> WiFi connected, GPS invalid
   BLINKING  -> WiFi connected, GPS valid
   ============================================================
*/


// ============================================================
// LIBRARIES
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <CircuitDigestCloud.h>
#include <vector>

// ============================================================
// WIFI
// ============================================================

const char* ssid = "JACK";
const char* password = "12344321";


// ============================================================
// CIRCUITDIGEST GEOLINKER
// ============================================================

const char* serverUrl =
    "https://www.circuitdigest.cloud/api/v1/geolinker";

const char* apiKey =
    "cd_boy_300926_UREknq";

// This name must match the tracker/device name
// you want to see in GeoLinker.
const char* deviceID = "Gsp";


// ============================================================
// YOUR RENDER BACKEND
// ============================================================

const char* renderUrl =
    "https://gps-tracking-iot.onrender.com/api/location";

const char* renderApiSecret =
    "c5f036fa5c6189b047628801d30d6e09";


// ============================================================
// GPS UART
// ============================================================

HardwareSerial gpsSerial(1);

// NEO-6M TX -> ESP32 RX
const int RXPin = 16;

// NEO-6M RX -> ESP32 TX
const int TXPin = 17;


// ============================================================
// ONBOARD LED
// ============================================================

const int onboardLED = 2;



// ============================================================
// GPS RAW DATA
// ============================================================

struct GPSRawData {

  double latitude = 0.0;
  char latitudeDir = 'N';

  double longitude = 0.0;
  char longitudeDir = 'E';

  int satellites = 0;

  double altitude = 0.0;

  int hours = 0;
  int minutes = 0;
  int seconds = 0;

  int day = 0;
  int month = 0;
  int year = 0;

  String timestamp = "";
};


// ============================================================
// GPS DATA FOR SERVER
// ============================================================

struct GPSData {

  double latitude = 0.0;
  double longitude = 0.0;

  String timestamp = "";
};


// ============================================================
// GLOBAL VARIABLES
// ============================================================

GPSRawData latestGPSRawData;

GPSData latestGPSData;

String geolinkerStatus = "unknown";
String lastRenderStatus = "unknown";

// GPS validity
bool gpsDataValid = false;


// Upload every 10 seconds
const unsigned long uploadInterval = 10000;

unsigned long lastUploadTime = 0;


// Store data when WiFi/server is unavailable
std::vector<GPSData> offlineData;


// ============================================================
// LED VARIABLES
// ============================================================

unsigned long lastLEDBlink = 0;

bool ledState = false;

const unsigned long blinkInterval = 500;


// ============================================================
// SETUP
// ============================================================

void setup() {

  // ----------------------------------------------------------
  // SERIAL MONITOR
  // ----------------------------------------------------------

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("======================================");
  Serial.println("       ESP32 GPS TRACKER");
  Serial.println("======================================");


  // ----------------------------------------------------------
  // GPS SERIAL
  // ----------------------------------------------------------

  gpsSerial.begin(
    9600,
    SERIAL_8N1,
    RXPin,
    TXPin
  );

  Serial.println("GPS Serial Started");
  Serial.println("GPS RX = GPIO16");
  Serial.println("GPS TX = GPIO17");


  // ----------------------------------------------------------
  // LED
  // ----------------------------------------------------------

  pinMode(onboardLED, OUTPUT);

  digitalWrite(onboardLED, LOW);


  // ----------------------------------------------------------
  // WIFI
  // ----------------------------------------------------------

  Serial.println();
  Serial.println("Connecting to WiFi...");

  WiFi.mode(WIFI_STA);

  WiFi.begin(ssid, password);


  while (WiFi.status() != WL_CONNECTED) {

    digitalWrite(onboardLED, LOW);

    delay(500);

    Serial.print(".");
  }


  Serial.println();
  Serial.println("--------------------------------------");
  Serial.println("WiFi connected!");
  Serial.println("--------------------------------------");

  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  Serial.print("Device ID: ");
  Serial.println(deviceID);

  Serial.println("--------------------------------------");


  updateLED();
}


// ============================================================
// MAIN LOOP
// ============================================================

void loop() {

  static String gpsData = "";


  // ==========================================================
  // READ GPS DATA
  // ==========================================================

  while (gpsSerial.available()) {

    char c = gpsSerial.read();

    gpsData += c;


    if (c == '\n') {

      processGPSData(gpsData);

      gpsData = "";
    }
  }


  // ==========================================================
  // UPDATE LED
  // ==========================================================

  updateLED();


  // ==========================================================
  // UPLOAD EVERY 10 SECONDS
  // ==========================================================

  if (millis() - lastUploadTime >= uploadInterval) {

    lastUploadTime = millis();


    // --------------------------------------------------------
    // GPS INVALID
    // --------------------------------------------------------

    if (!gpsDataValid) {

  Serial.println();
  Serial.println("--------------------------------------");
  Serial.println("GPS fix not available.");
  Serial.println("Sending telemetry to Render...");
  Serial.println("--------------------------------------");

  if (WiFi.status() == WL_CONNECTED) {

    sendGPSDataToRender(latestGPSData);

  }
}


    // --------------------------------------------------------
    // GPS VALID
    // --------------------------------------------------------

    else {

      // ======================================================
      // WIFI CONNECTED
      // ======================================================

      if (WiFi.status() == WL_CONNECTED) {

        Serial.println();
        Serial.println("======================================");
        Serial.println("GPS FIX VALID");
        Serial.println("======================================");


        Serial.print("Satellites: ");
        Serial.println(latestGPSRawData.satellites);

        Serial.print("Latitude: ");
        Serial.println(latestGPSData.latitude, 6);

        Serial.print("Longitude: ");
        Serial.println(latestGPSData.longitude, 6);

        Serial.print("Timestamp: ");
        Serial.println(latestGPSData.timestamp);


        // ----------------------------------------------------
        // SEND OLD OFFLINE DATA FIRST
        // ----------------------------------------------------

        // if (!offlineData.empty()) {

        //   Serial.println();
        //   Serial.println("Uploading stored offline data...");

        //   bool offlineUploadSuccess = true;


        //   for (auto& data : offlineData) {

        //     if (!sendGPSData(data)) {

        //       offlineUploadSuccess = false;

        //       Serial.println(
        //         "Failed to upload stored data."
        //       );

        //       break;
        //     }
        //   }


        //   if (offlineUploadSuccess) {

        //     offlineData.clear();

        //     Serial.println(
        //       "All offline data uploaded."
        //     );
        //   }
        // }


        // ----------------------------------------------------
        // SEND CURRENT GPS DATA
        // ----------------------------------------------------

        bool geoSuccess = sendGPSData(latestGPSData);

geolinkerStatus = geoSuccess ? "success" : "failed";

if (geoSuccess) {

  Serial.println();
  Serial.println(
    "Latest GPS data uploaded successfully!"
  );

}
else {

  Serial.println();
  Serial.println(
    "Failed to upload latest GPS data."
  );

  Serial.println(
    "Storing GPS data locally."
  );

  offlineData.push_back(latestGPSData);

}

    
             // ----------------------------------------------------
        // SEND CURRENT GPS DATA TO RENDER
        // ----------------------------------------------------

        bool renderSuccess =
          sendGPSDataToRender(latestGPSData);

        if (renderSuccess) {

          Serial.println();
          Serial.println("Render upload successful!");

        }
        else {

          Serial.println();
          Serial.println("Render upload failed!");

        }

      }

      // ======================================================
      // WIFI DISCONNECTED
      // ======================================================

      else {

        Serial.println();
        Serial.println("--------------------------------------");
        Serial.println("WiFi disconnected.");
        Serial.println("Storing GPS data locally.");
        Serial.println("--------------------------------------");


        offlineData.push_back(latestGPSData);


        // Try reconnecting
        WiFi.disconnect();

        delay(100);

        WiFi.begin(ssid, password);
      }
    }
  }
}


// ============================================================
// LED CONTROL
// ============================================================

void updateLED() {

  // ==========================================================
  // WIFI DISCONNECTED
  // ==========================================================

  if (WiFi.status() != WL_CONNECTED) {

    digitalWrite(onboardLED, LOW);

    ledState = false;

    return;
  }


  // ==========================================================
  // WIFI CONNECTED BUT GPS INVALID
  // ==========================================================

  if (!gpsDataValid) {

    digitalWrite(onboardLED, HIGH);

    return;
  }


  // ==========================================================
  // WIFI CONNECTED + GPS VALID
  // ==========================================================

  if (millis() - lastLEDBlink >= blinkInterval) {

    lastLEDBlink = millis();

    ledState = !ledState;

    digitalWrite(
      onboardLED,
      ledState
    );
  }
}


// ============================================================
// SEND GPS DATA TO GEOLINKER
// ============================================================

bool sendGPSData(GPSData data) {

  HTTPClient http;


  Serial.println();
  Serial.println("======================================");
  Serial.println("Sending GPS data to GeoLinker...");
  Serial.println("======================================");


  // ----------------------------------------------------------
  // CONNECT TO SERVER
  // ----------------------------------------------------------

  http.begin(serverUrl);


  // ----------------------------------------------------------
  // HTTP HEADERS
  // ----------------------------------------------------------

  http.addHeader(
    "Content-Type",
    "application/json"
  );


  // IMPORTANT:
  // GeoLinker requires Bearer authentication

  http.addHeader(
    "Authorization",
    "Bearer " + String(apiKey)
  );


  // ----------------------------------------------------------
  // CREATE JSON
  // ----------------------------------------------------------

  String payload = "{";


  // DEVICE ID

  payload += "\"device_id\":\"";
  payload += deviceID;
  payload += "\",";


  // TIMESTAMP

  payload += "\"timestamp\":[\"";
  payload += data.timestamp;
  payload += "\"],";


  // LATITUDE

  payload += "\"lat\":[";
  payload += String(data.latitude, 6);
  payload += "],";


  // LONGITUDE

  payload += "\"long\":[";
  payload += String(data.longitude, 6);
  payload += "]";


  payload += "}";


  // ----------------------------------------------------------
  // PRINT PAYLOAD
  // ----------------------------------------------------------

  Serial.println();
  Serial.println("JSON Payload:");
  Serial.println(payload);

  Serial.println();


  // ----------------------------------------------------------
  // SEND POST REQUEST
  // ----------------------------------------------------------

  int httpResponseCode = http.POST(payload);


  // ----------------------------------------------------------
  // RESPONSE CODE
  // ----------------------------------------------------------

  Serial.print(
    "GeoLinker HTTP Response Code: "
  );

  Serial.println(httpResponseCode);


  // ----------------------------------------------------------
  // RESPONSE BODY
  // ----------------------------------------------------------

  String response = http.getString();

  Serial.println("GeoLinker Response:");

  Serial.println(response);


  // ----------------------------------------------------------
  // CLOSE CONNECTION
  // ----------------------------------------------------------

  http.end();


  // ----------------------------------------------------------
  // CHECK RESULT
  // ----------------------------------------------------------

  if (
    httpResponseCode == 200 ||
    httpResponseCode == 201
  ) {

    Serial.println();
    Serial.println("SUCCESS: GPS data accepted by server.");

    return true;
  }


  // ----------------------------------------------------------
  // ERROR INFORMATION
  // ----------------------------------------------------------

  if (httpResponseCode == 400) {

    Serial.println(
      "ERROR 400: Bad request / JSON problem."
    );
  }

  else if (httpResponseCode == 401) {

    Serial.println(
      "ERROR 401: API key/authentication problem."
    );
  }

  else if (httpResponseCode == 403) {

    Serial.println(
      "ERROR 403: Access denied."
    );
  }

  else if (httpResponseCode == -1) {

    Serial.println(
      "ERROR -1: Could not connect to server."
    );
  }


  return false;
}

// ============================================================
// SEND GPS DATA TO RENDER BACKEND
// ============================================================

bool sendGPSDataToRender(GPSData data) {

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  Serial.println();
  Serial.println("======================================");
  Serial.println("Sending GPS data to Render...");
  Serial.println("======================================");

  if (!http.begin(client, renderUrl)) {
    Serial.println("ERROR: Could not connect to Render.");
    return false;
  }

  // Headers
  http.addHeader("Content-Type", "application/json");

  http.addHeader(
    "Authorization",
    "Bearer " + String(renderApiSecret)
  );

  // JSON payload expected by your backend
  String payload = "{";


payload += "\"device_id\":\"";
payload += deviceID;
payload += "\",";

payload += "\"latitude\":";
payload += String(data.latitude, 6);
payload += ",";

payload += "\"longitude\":";
payload += String(data.longitude, 6);
payload += ",";

payload += "\"altitude\":";
payload += String(latestGPSRawData.altitude, 2);
payload += ",";

payload += "\"satellites\":";
payload += String(latestGPSRawData.satellites);
payload += ",";

payload += "\"gps_fix\":";
payload += (gpsDataValid ? "true" : "false");
payload += ",";

payload += "\"wifi_connected\":true,";

payload += "\"wifi_rssi\":";
payload += String(WiFi.RSSI());
payload += ",";

payload += "\"geolinker_status\":\"";
payload += geolinkerStatus;
payload += "\",";

payload += "\"render_status\":\"";
payload += lastRenderStatus;
payload += "\",";

payload += "\"timestamp\":\"";
payload += data.timestamp;
payload += "\"";

payload += "}";

  Serial.println();
  Serial.println("Render JSON Payload:");
  Serial.println(payload);

  // POST
  int httpResponseCode = http.POST(payload);

  Serial.print("Render HTTP Response Code: ");
  Serial.println(httpResponseCode);

  String response = http.getString();

  Serial.println("Render Response:");
  Serial.println(response);

  http.end();

  if (httpResponseCode >= 200 && httpResponseCode < 300) {

  Serial.println("SUCCESS: GPS data accepted by Render.");

  lastRenderStatus = "success";

  return true;
}

Serial.println("ERROR: Render rejected GPS data.");

lastRenderStatus = "failed";

return false;
}


// ============================================================
// PROCESS GPS NMEA DATA
// ============================================================

void processGPSData(String raw) {

  // Remove carriage return/newline
  raw.trim();


  // ----------------------------------------------------------
  // GPGGA
  // ----------------------------------------------------------

  if (raw.startsWith("$GPGGA")) {

    parseGPGGA(raw);
  }


  // ----------------------------------------------------------
  // GPRMC
  // ----------------------------------------------------------

  else if (raw.startsWith("$GPRMC")) {

    parseGPRMC(raw);
  }
}


// ============================================================
// PARSE GPGGA
// ============================================================

void parseGPGGA(String gpgga) {

  String tokens[15];

  int tokenIndex = 0;

  int startIndex = 0;


  // ----------------------------------------------------------
  // SPLIT NMEA STRING
  // ----------------------------------------------------------

  for (int i = 0; i < gpgga.length(); i++) {

    if (
      gpgga[i] == ',' ||
      gpgga[i] == '*'
    ) {

      if (tokenIndex < 15) {

        tokens[tokenIndex++] =
          gpgga.substring(
            startIndex,
            i
          );
      }

      startIndex = i + 1;
    }
  }


  // ----------------------------------------------------------
  // MAKE SURE DATA EXISTS
  // ----------------------------------------------------------

  if (tokenIndex <= 9) {

    return;
  }


  // ==========================================================
  // UTC TIME
  // ==========================================================

  String utcTime = tokens[1];


  if (utcTime.length() >= 6) {

    latestGPSRawData.hours =
      utcTime.substring(0, 2).toInt();

    latestGPSRawData.minutes =
      utcTime.substring(2, 4).toInt();

    latestGPSRawData.seconds =
      utcTime.substring(4, 6).toInt();
  }


  // ==========================================================
  // LATITUDE
  // ==========================================================

  latestGPSRawData.latitude =
    nmeaToDecimal(tokens[2]);

  latestGPSData.latitude =
    nmeaToDecimal(tokens[2]);


  if (tokens[3].length() > 0) {

    latestGPSRawData.latitudeDir =
      tokens[3].charAt(0);
  }


  // ==========================================================
  // LONGITUDE
  // ==========================================================

  latestGPSRawData.longitude =
    nmeaToDecimal(tokens[4]);

  latestGPSData.longitude =
    nmeaToDecimal(tokens[4]);


  if (tokens[5].length() > 0) {

    latestGPSRawData.longitudeDir =
      tokens[5].charAt(0);
  }


  // ==========================================================
  // SATELLITES
  // ==========================================================

  latestGPSRawData.satellites =
    tokens[7].toInt();


  // ==========================================================
  // ALTITUDE
  // ==========================================================

  latestGPSRawData.altitude =
    tokens[9].toDouble();


  // ==========================================================
  // GPS VALIDITY
  // ==========================================================

  if (
    latestGPSRawData.satellites >= 4 &&
    (
      latestGPSData.latitude != 0 ||
      latestGPSData.longitude != 0
    )
  ) {

    gpsDataValid = true;


    Serial.println();
    Serial.println("******** GPS FIX VALID ********");

    Serial.print("Satellites: ");
    Serial.println(
      latestGPSRawData.satellites
    );

    Serial.print("Latitude: ");
    Serial.println(
      latestGPSData.latitude,
      6
    );

    Serial.print("Longitude: ");
    Serial.println(
      latestGPSData.longitude,
      6
    );


    updateTimestamp();
  }

  else {

    gpsDataValid = false;

    Serial.println();
    Serial.println("GPS fix not available.");

    Serial.print("Satellites: ");
    Serial.println(
      latestGPSRawData.satellites
    );
  }
}


// ============================================================
// PARSE GPRMC
// ============================================================

void parseGPRMC(String gprmc) {

  String tokens[15];

  int tokenIndex = 0;

  int startIndex = 0;


  // ----------------------------------------------------------
  // SPLIT NMEA STRING
  // ----------------------------------------------------------

  for (int i = 0; i < gprmc.length(); i++) {

    if (
      gprmc[i] == ',' ||
      gprmc[i] == '*'
    ) {

      if (tokenIndex < 15) {

        tokens[tokenIndex++] =
          gprmc.substring(
            startIndex,
            i
          );
      }

      startIndex = i + 1;
    }
  }


  // ----------------------------------------------------------
  // MAKE SURE DATE EXISTS
  // ----------------------------------------------------------

  if (tokenIndex <= 9) {

    return;
  }


  // ==========================================================
  // RMC DATE
  // ==========================================================

  String utcDate = tokens[9];


  if (utcDate.length() >= 6) {

    latestGPSRawData.day =
      utcDate.substring(0, 2).toInt();

    latestGPSRawData.month =
      utcDate.substring(2, 4).toInt();

    latestGPSRawData.year =
      2000 +
      utcDate.substring(4, 6).toInt();


    // Update timestamp once date is available
    updateTimestamp();
  }
}


// ============================================================
// CREATE IST TIMESTAMP
// ============================================================

void updateTimestamp() {

  // We need a valid date and time
  if (
    latestGPSRawData.year == 0 ||
    latestGPSRawData.month == 0 ||
    latestGPSRawData.day == 0
  ) {

    return;
  }


  // ----------------------------------------------------------
  // Copy UTC time
  // ----------------------------------------------------------

  int localHours =
    latestGPSRawData.hours;

  int localMinutes =
    latestGPSRawData.minutes;

  int localSeconds =
    latestGPSRawData.seconds;


  int localDay =
    latestGPSRawData.day;


  int localMonth =
    latestGPSRawData.month;


  int localYear =
    latestGPSRawData.year;


  // ----------------------------------------------------------
  // IST = UTC + 5 hours 30 minutes
  // ----------------------------------------------------------

  localMinutes += 30;

  localHours += 5;


  // ----------------------------------------------------------
  // Handle minutes
  // ----------------------------------------------------------

  if (localMinutes >= 60) {

    localMinutes -= 60;

    localHours++;
  }


  // ----------------------------------------------------------
  // Handle day rollover
  // ----------------------------------------------------------

  if (localHours >= 24) {

    localHours -= 24;

    localDay++;


    // Simple month-day handling
    int daysInMonth = 31;


    if (
      localMonth == 4 ||
      localMonth == 6 ||
      localMonth == 9 ||
      localMonth == 11
    ) {

      daysInMonth = 30;
    }

    else if (localMonth == 2) {

      bool leapYear =
        (
          (localYear % 4 == 0) &&
          (
            localYear % 100 != 0 ||
            localYear % 400 == 0
          )
        );

      daysInMonth =
        leapYear ? 29 : 28;
    }


    if (localDay > daysInMonth) {

      localDay = 1;

      localMonth++;


      if (localMonth > 12) {

        localMonth = 1;

        localYear++;
      }
    }
  }


  // ----------------------------------------------------------
  // Create timestamp
  // ----------------------------------------------------------

  char timeBuffer[30];


  snprintf(
    timeBuffer,
    sizeof(timeBuffer),

    "%04d-%02d-%02d %02d:%02d:%02d",

    localYear,
    localMonth,
    localDay,

    localHours,
    localMinutes,
    localSeconds
  );


  latestGPSRawData.timestamp =
    String(timeBuffer);


  latestGPSData.timestamp =
    String(timeBuffer);
}


// ============================================================
// NMEA COORDINATE -> DECIMAL DEGREES
// ============================================================

double nmeaToDecimal(String nmeaCoord) {

  if (nmeaCoord.length() == 0) {

    return 0.0;
  }


  double raw =
    nmeaCoord.toDouble();


  int degrees =
    int(raw / 100);


  double minutes =
    raw -
    (degrees * 100);


  return
    degrees +
    (minutes / 60.0);
}


// ============================================================
// PRINT CURRENT GPS DATA
// ============================================================

void printLatestGPSData() {

  Serial.println();
  Serial.println("======================================");
  Serial.println("CURRENT GPS DATA");
  Serial.println("======================================");


  Serial.print("Latitude: ");
  Serial.println(
    latestGPSData.latitude,
    6
  );


  Serial.print("Longitude: ");
  Serial.println(
    latestGPSData.longitude,
    6
  );


  Serial.print("Satellites: ");
  Serial.println(
    latestGPSRawData.satellites
  );


  Serial.print("Altitude: ");
  Serial.println(
    latestGPSRawData.altitude
  );


  Serial.print("Timestamp: ");
  Serial.println(
    latestGPSData.timestamp
  );


  Serial.println("======================================");
}