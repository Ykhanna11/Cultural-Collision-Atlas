export type MutationFeedback = {
  type: "success" | "error";
  message: string;
} | null;

export type MutationFeedbackAction =
  { type: "clear" } | { type: "success" | "error"; message: string };

export function mutationFeedbackReducer(
  _state: MutationFeedback,
  action: MutationFeedbackAction,
): MutationFeedback {
  if (action.type === "clear") return null;
  return { type: action.type, message: action.message };
}
