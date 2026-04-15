/**
 * Minimal .kicad_pro (KiCad project) file in JSON form. KiCad is
 * forgiving about missing fields, so we include only the keys it reads
 * on first open for a schematic-only workflow.
 */

export interface ProjectFileInput {
  projectName: string;
}

export function generateKicadProject(input: ProjectFileInput): string {
  const proj = {
    board: {
      design_settings: {
        defaults: {},
        rules: {}
      },
      layer_presets: [],
      viewports: []
    },
    boards: [],
    cvpcb: {
      equivalence_files: []
    },
    erc: {
      erc_exclusions: [],
      meta: { version: 0 },
      pin_map: [],
      rule_severities: {},
      rules: []
    },
    libraries: {
      pinned_footprint_libs: [],
      pinned_symbol_libs: []
    },
    meta: {
      filename: `${input.projectName}.kicad_pro`,
      version: 1
    },
    net_settings: {
      classes: [
        {
          bus_width: 12,
          clearance: 0.2,
          diff_pair_gap: 0.25,
          diff_pair_via_gap: 0.25,
          diff_pair_width: 0.2,
          line_style: 0,
          microvia_diameter: 0.3,
          microvia_drill: 0.1,
          name: "Default",
          pcb_color: "rgba(0, 0, 0, 0.000)",
          schematic_color: "rgba(0, 0, 0, 0.000)",
          track_width: 0.25,
          via_diameter: 0.8,
          via_drill: 0.4,
          wire_width: 6
        }
      ],
      meta: { version: 3 },
      net_colors: null,
      netclass_assignments: null,
      netclass_patterns: []
    },
    pcbnew: {
      last_paths: {
        gencad: "",
        idf: "",
        netlist: "",
        plot: "",
        pos_files: "",
        specctra_dsn: "",
        step: "",
        svg: "",
        vrml: ""
      },
      page_layout_descr_file: ""
    },
    schematic: {
      annotate_start_num: 0,
      drawing: {
        dashed_lines_dash_length_ratio: 12.0,
        dashed_lines_gap_length_ratio: 3.0,
        default_line_thickness: 6.0,
        default_text_size: 50.0,
        field_names: [],
        intersheets_ref_own_page: false,
        intersheets_ref_prefix: "",
        intersheets_ref_short: false,
        intersheets_ref_show: false,
        intersheets_ref_suffix: "",
        junction_size_choice: 3,
        label_size_ratio: 0.375,
        pin_symbol_size: 25.0,
        text_offset_ratio: 0.15
      },
      legacy_lib_dir: "",
      legacy_lib_list: [],
      meta: { version: 1 },
      net_format_name: "",
      page_layout_descr_file: "",
      plot_directory: "",
      spice_adjust_passive_values: false,
      spice_external_command: "spice \"%I\"",
      subpart_first_id: 65,
      subpart_id_separator: 0
    },
    sheets: [[SHEET_UUID, "Root"]],
    text_variables: {}
  };
  return JSON.stringify(proj, null, 2) + "\n";
}

const SHEET_UUID = "00000000-0000-4000-a000-000000000001";
