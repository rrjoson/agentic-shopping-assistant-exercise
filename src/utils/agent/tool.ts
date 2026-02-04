import React from "react";
import { z } from "zod";

export type ToolParameters = z.ZodTypeAny;

// 🚀 ACTION TYPES: Things a tool can tell the UI to do
export type ToolAction =
  | { type: "navigate"; url: string }  // Navigate to a URL
  | { type: "openModal"; modalId: string }  // Open a modal
  | { type: "scroll"; elementId: string };  // Scroll to element

export type ToolResult = {
  nextPrompt: string;
  render?: () => React.ReactElement;
  action?: ToolAction;  // Optional action for the UI to execute!
};

export type Tool<PARAMETERS extends ToolParameters = any> = {
  description?: string;
  parameters: PARAMETERS;
  execute: (args: z.infer<PARAMETERS>) => Promise<ToolResult>;
  // Use z.input for examples since they represent INPUT (before defaults applied)
  examples: Array<{ query: string; parameters: z.input<PARAMETERS> }>;
};

const tool = <PARAMETERS extends ToolParameters>(
  definition: Tool<PARAMETERS>
): Tool<PARAMETERS> => definition;

export default tool;
