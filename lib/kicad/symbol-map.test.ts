import { describe, it, expect } from "vitest";
import { mapToStdSymbol } from "./symbol-map";
import type { BomItem } from "@/types/project";

function bi(designator: string, name = "x"): BomItem {
  return { id: designator, designator, name, quantity: 1, package: "x", status: "selected" };
}

describe("mapToStdSymbol", () => {
  it("maps resistor designators to Device:R", () => {
    expect(mapToStdSymbol(bi("R1"))).toBe("Device:R");
    expect(mapToStdSymbol(bi("R1-R2"))).toBe("Device:R");
    expect(mapToStdSymbol(bi("R99"))).toBe("Device:R");
  });

  it("maps capacitor designators to Device:C", () => {
    expect(mapToStdSymbol(bi("C1"))).toBe("Device:C");
    expect(mapToStdSymbol(bi("C42"))).toBe("Device:C");
  });

  it("maps inductor, diode, LED, transistor, crystal", () => {
    expect(mapToStdSymbol(bi("L1"))).toBe("Device:L");
    expect(mapToStdSymbol(bi("D1"))).toBe("Device:D");
    expect(mapToStdSymbol(bi("D1", "Status LED red"))).toBe("Device:LED");
    expect(mapToStdSymbol(bi("Q1"))).toBe("Device:Q_NPN_BCE");
    expect(mapToStdSymbol(bi("Y1"))).toBe("Device:Crystal");
  });

  it("maps USB-C connector names to Connector:USB_C_Receptacle_USB2.0", () => {
    expect(mapToStdSymbol(bi("J1", "USB-C receptacle"))).toBe(
      "Connector:USB_C_Receptacle_USB2.0"
    );
    expect(mapToStdSymbol(bi("J2", "USB Type-C 16-pin"))).toBe(
      "Connector:USB_C_Receptacle_USB2.0"
    );
  });

  it("maps generic headers to Connector_Generic:Conn_01x04", () => {
    expect(mapToStdSymbol(bi("J1", "SWD 1x04 header"))).toBe(
      "Connector_Generic:Conn_01x04"
    );
  });

  it("returns null for unknown / custom ICs (caller emits a local placeholder)", () => {
    expect(mapToStdSymbol(bi("U1", "ESP32-S3-WROOM-1"))).toBeNull();
    expect(mapToStdSymbol(bi("U2", "BQ24074 charger IC"))).toBeNull();
  });

  it("extracts reference prefix correctly for compound designators", () => {
    expect(mapToStdSymbol(bi("R10-R15"))).toBe("Device:R");
    expect(mapToStdSymbol(bi("C1-C3"))).toBe("Device:C");
  });
});
