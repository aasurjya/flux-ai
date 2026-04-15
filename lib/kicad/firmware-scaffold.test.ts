import { describe, it, expect } from "vitest";
import { detectMcuFamily, generateFirmwareEntries } from "./firmware-scaffold";
import type { BomItem, CircuitBlock } from "@/types/project";

function bom(...items: Array<Partial<BomItem> & Pick<BomItem, "name">>): BomItem[] {
  return items.map((i, idx) => ({
    id: i.id ?? `u${idx + 1}`,
    designator: i.designator ?? `U${idx + 1}`,
    quantity: i.quantity ?? 1,
    package: i.package ?? "TBD",
    status: i.status ?? "selected",
    ...i
  }));
}

describe("detectMcuFamily", () => {
  it("detects esp32 from ESP32-S3-WROOM-1", () => {
    expect(detectMcuFamily(bom({ name: "ESP32-S3-WROOM-1" }))).toBe("esp32");
  });
  it("detects esp8266", () => {
    expect(detectMcuFamily(bom({ name: "ESP8266EX" }))).toBe("esp8266");
  });
  it("detects stm32", () => {
    expect(detectMcuFamily(bom({ name: "STM32G071" }))).toBe("stm32");
  });
  it("detects rp2040", () => {
    expect(detectMcuFamily(bom({ name: "RP2040 microcontroller" }))).toBe("rp2040");
  });
  it("detects atmega", () => {
    expect(detectMcuFamily(bom({ name: "ATmega328P" }))).toBe("atmega");
  });
  it("returns null when no MCU is present (passives only)", () => {
    const items = bom(
      { name: "10k pull-up", designator: "R1" },
      { name: "100nF ceramic", designator: "C1" }
    );
    expect(detectMcuFamily(items)).toBeNull();
  });
  it("returns the first family when multiple MCUs in BOM (unusual but possible)", () => {
    const items = bom(
      { name: "ESP32-S3", designator: "U1" },
      { name: "ATmega328P co-processor", designator: "U2" }
    );
    expect(detectMcuFamily(items)).toBe("esp32");
  });
});

const blocks: CircuitBlock[] = [
  { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3", "imu"] },
  { id: "3v3", label: "3V3 Rail", kind: "power", connections: ["mcu"] },
  { id: "imu", label: "IMU", kind: "sensor", connections: ["mcu"] },
  { id: "usb", label: "USB-C input", kind: "interface", connections: ["3v3"] }
];

describe("generateFirmwareEntries", () => {
  it("returns empty array when no MCU is detected (graceful no-op)", () => {
    const entries = generateFirmwareEntries(bom({ name: "passive only", designator: "R1" }), blocks);
    expect(entries).toEqual([]);
  });

  it("emits PlatformIO triplet for ESP32 (platformio.ini + src/main.cpp + README.md)", () => {
    const entries = generateFirmwareEntries(bom({ name: "ESP32-S3-WROOM-1" }), blocks);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(["firmware/README.md", "firmware/platformio.ini", "firmware/src/main.cpp"]);

    const ini = entries.find((e) => e.name === "firmware/platformio.ini")!.content;
    expect(ini).toContain("[env:");
    expect(ini).toContain("platform = espressif32");
    expect(ini).toContain("framework = arduino");
  });

  it("emits Arduino variant for ATmega (firmware.ino + README.md)", () => {
    const entries = generateFirmwareEntries(bom({ name: "ATmega328P" }), blocks);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(["firmware/README.md", "firmware/firmware.ino"]);
    const ino = entries.find((e) => e.name === "firmware/firmware.ino")!.content;
    expect(ino).toContain("void setup()");
    expect(ino).toContain("void loop()");
  });

  it("emits PlatformIO for STM32 with the stm32 platform", () => {
    const entries = generateFirmwareEntries(bom({ name: "STM32G071" }), blocks);
    const ini = entries.find((e) => e.name === "firmware/platformio.ini")!.content;
    expect(ini).toContain("platform = ststm32");
  });

  it("emits PlatformIO for RP2040 with the raspberrypi platform", () => {
    const entries = generateFirmwareEntries(bom({ name: "RP2040" }), blocks);
    const ini = entries.find((e) => e.name === "firmware/platformio.ini")!.content;
    expect(ini).toContain("platform = raspberrypi");
  });

  it("generates pinMode stubs for every sensor/interface block", () => {
    const entries = generateFirmwareEntries(bom({ name: "ESP32-S3" }), blocks);
    const src = entries.find((e) => e.name === "firmware/src/main.cpp")!.content;
    // IMU is a sensor → expect a stub referencing it
    expect(src).toMatch(/PIN_IMU/i);
    // USB is interface → expect a stub referencing it
    expect(src).toMatch(/PIN_USB/i);
    // Power blocks should NOT generate pinMode stubs (not sensor/interface)
    expect(src).not.toMatch(/PIN_3V3/i);
    // pinMode scaffold must be present
    expect(src).toContain("pinMode(");
  });

  it("README explicitly flags pin numbers as placeholders", () => {
    const entries = generateFirmwareEntries(bom({ name: "ESP32-S3" }), blocks);
    const readme = entries.find((e) => e.name === "firmware/README.md")!.content;
    expect(readme).toMatch(/placeholder|replace|assign/i);
  });

  it("does not emit stubs for architectures with no sensor/interface blocks", () => {
    const minimal: CircuitBlock[] = [
      { id: "mcu", label: "MCU", kind: "processing", connections: ["3v3"] },
      { id: "3v3", label: "3V3", kind: "power", connections: ["mcu"] }
    ];
    const entries = generateFirmwareEntries(bom({ name: "ESP32-S3" }), minimal);
    const src = entries.find((e) => e.name === "firmware/src/main.cpp")!.content;
    // setup() body still present, just without pinMode stubs
    expect(src).toContain("void setup()");
    // Source should still compile — no dangling content
    expect(src).toMatch(/\/\/ No .* blocks detected|no pins to configure|TODO: configure/i);
  });
});
