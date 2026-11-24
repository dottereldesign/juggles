#include <Arduino.h>
#include <Wire.h>

uint8_t imuAddress = 0;
int piezoPeak = 0;
uint32_t lastSample = 0;

bool readRegisters(uint8_t address, uint8_t reg, uint8_t *bytes, size_t count) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address, count) != count) return false;
  for (size_t i = 0; i < count; ++i) bytes[i] = Wire.read();
  return true;
}

bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(imuAddress);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

void stopWith(const char *message) {
  for (;;) {
    Serial.println(message);
    delay(2000);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Wire.begin(D4, D5);
  Wire.setClock(400000);
  for (uint8_t address = 0x68; address <= 0x69; ++address) {
    uint8_t id;
    if (readRegisters(address, 0x00, &id, 1) && id == 0xD1) {
      imuAddress = address;
      break;
    }
  }
  if (!imuAddress) stopWith("No BMI160 at 0x68 or 0x69. Check power and I2C.");
  if (!writeRegister(0x7E, 0x11)) stopWith("Accelerometer startup failed.");
  delay(10);
  if (!writeRegister(0x7E, 0x15)) stopWith("Gyroscope startup failed.");
  delay(100);
  // 100 Hz, normal filtering, +/-16 g and +/-2000 degrees/sec.
  if (!writeRegister(0x40, 0x28) || !writeRegister(0x41, 0x0C) ||
      !writeRegister(0x42, 0x28) || !writeRegister(0x43, 0x00)) {
    stopWith("Sensor configuration failed.");
  }
  Serial.println("ms,gx_raw,gy_raw,gz_raw,ax_raw,ay_raw,az_raw,piezo_peak");
}

void loop() {
  int reading = analogRead(A1);
  if (reading > piezoPeak) piezoPeak = reading;
  uint32_t now = millis();
  if (now - lastSample < 10) return;
  lastSample = now;
  uint8_t data[12];
  if (!readRegisters(imuAddress, 0x0C, data, sizeof(data))) {
    stopWith("IMU read failed. Check connections and reset.");
  }
  Serial.print(now);
  for (size_t i = 0; i < sizeof(data); i += 2) {
    int16_t axis = (int16_t)(data[i] | ((uint16_t)data[i + 1] << 8));
    Serial.print(',');
    Serial.print(axis);
  }
  Serial.print(',');
  Serial.println(piezoPeak);
  piezoPeak = 0;
}
