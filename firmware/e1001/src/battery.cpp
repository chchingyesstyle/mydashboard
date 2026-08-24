#include "battery.h"

#include <Arduino.h>

namespace {
constexpr int kBatteryEnablePin = 21;
constexpr int kBatteryAdcPin = 1;
// Two 10k resistors divide the battery voltage in half before the ADC.
constexpr double kVoltageDividerRatio = 2.0;
}  // namespace

double readBatteryVoltage() {
  pinMode(kBatteryEnablePin, OUTPUT);
  digitalWrite(kBatteryEnablePin, HIGH);
  delay(10);

  analogSetPinAttenuation(kBatteryAdcPin, ADC_11db);
  int milliVolts = analogReadMilliVolts(kBatteryAdcPin);

  digitalWrite(kBatteryEnablePin, LOW);

  return (milliVolts / 1000.0) * kVoltageDividerRatio;
}
