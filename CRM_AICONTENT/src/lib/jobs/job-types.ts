export type JobCategory = "pipeline" | "photo";

export interface JobTypeDefinition {
  type: string;
  label: string;
  name: string;
  category: JobCategory;
  defaultCost: number;
}

export const JOB_TYPES: JobTypeDefinition[] = [
  {
    type: "video",
    label: "VID",
    name: "Single Video",
    category: "pipeline",
    defaultCost: 0.056,
  },
  {
    type: "batch",
    label: "BAT",
    name: "Batch Video",
    category: "pipeline",
    defaultCost: 0.234,
  },
  {
    type: "ltx",
    label: "LTX",
    name: "LTX Video",
    category: "pipeline",
    defaultCost: 0.048,
  },
  {
    type: "photo",
    label: "IMG",
    name: "Flexible Image",
    category: "photo",
    defaultCost: 0.018,
  },
  {
    type: "construct",
    label: "CNS",
    name: "Construct Image",
    category: "photo",
    defaultCost: 0.022,
  },
  {
    type: "upscale",
    label: "UPS",
    name: "Image Upscaler",
    category: "photo",
    defaultCost: 0.012,
  },
];

export function getJobTypeDefinition(type: string): JobTypeDefinition {
  return (
    JOB_TYPES.find((item) => item.type === type) ?? {
      type,
      label: type.slice(0, 3).toUpperCase(),
      name: type,
      category: "pipeline",
      defaultCost: 0.05,
    }
  );
}

export function getJobCategory(type: string): JobCategory {
  return getJobTypeDefinition(type).category;
}
