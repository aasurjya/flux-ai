import { ProjectSummary } from "@/types/project";

export const mockProjects: ProjectSummary[] = [
  {
    id: "esp32-sensor-node",
    name: "ESP32 Sensor Node",
    prompt:
      "Design a battery-powered ESP32-S3 board with USB-C input, charger, IMU over I2C, status LEDs, and programming header.",
    status: "review",
    updatedAt: "Updated 2h ago",
    constraints: ["2-layer board", "Low-cost BOM", "USB-C input", "Battery powered"],
    outputs: {
      requirements: [
        "3.3V regulated rail required for ESP32-S3 and IMU",
        "USB-C power input with battery charging path",
        "Programming and reset access required",
        "I2C pull-up network required"
      ],
      architecture: [
        "USB-C power entry with ESD and charger stage",
        "Single-cell battery path with regulated 3.3V rail",
        "ESP32-S3 control block with boot and reset network",
        "IMU sensor block on shared I2C bus"
      ],
      bom: [
        {
          id: "u1",
          designator: "U1",
          name: "ESP32-S3-WROOM-1",
          quantity: 1,
          package: "Module",
          status: "selected"
        },
        {
          id: "u2",
          designator: "U2",
          name: "BQ24074 Battery Charger",
          quantity: 1,
          package: "QFN",
          status: "selected"
        },
        {
          id: "u3",
          designator: "U3",
          name: "ICM-42688-P IMU",
          quantity: 1,
          package: "LGA",
          status: "needs_review"
        },
        {
          id: "r1",
          designator: "R1-R2",
          name: "I2C Pull-up Resistors",
          quantity: 2,
          package: "0402",
          status: "selected"
        }
      ],
      validations: [
        {
          id: "v1",
          severity: "warning",
          title: "Review charger current limit",
          detail: "The selected charger should be checked against the intended USB source profile and battery capacity."
        },
        {
          id: "v2",
          severity: "info",
          title: "Add test pads",
          detail: "Add test pads for 3V3, GND, UART TX, and UART RX before export."
        }
      ],
      exportReady: false
    },
    revisions: [
      {
        id: "rev-1",
        title: "Initial draft",
        description: "Generated from product prompt and starter constraints.",
        createdAt: "Today",
        changes: [
          "Created base architecture",
          "Selected starter BOM",
          "Flagged charger configuration for review"
        ]
      }
    ]
  }
];

export function getProjectById(id: string) {
  return mockProjects.find((project) => project.id === id);
}
