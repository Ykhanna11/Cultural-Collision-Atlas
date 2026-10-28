import rateLimit from "express-rate-limit";

export const publicMutationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Public demo write limit reached. Please retry later." },
});
