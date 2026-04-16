/**
 * Barrel re-export. All callers import from "@/lib/project-store" and
 * continue to work unchanged — the real implementations now live in
 * focused modules under lib/store/.
 */

// --- persistence / read helpers ---
export {
  getProjects,
  getProjectById,
  splitListValue,
  slugify
} from "@/lib/store/persistence";

// --- CRUD mutations ---
export {
  createProject,
  deleteProject,
  importProject,
  patchBomItem,
  setValidationDismissal,
  addRevision
} from "@/lib/store/mutations";

// --- AI generation ---
export {
  generateProject,
  runImproveDesign
} from "@/lib/store/generate";

// --- export jobs ---
export {
  createExportJob,
  getExportJob,
  getExportFilePath,
  runExportJob
} from "@/lib/store/export";
