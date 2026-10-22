import rateLimit from "express-rate-limit";

export const providerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Provider request limit reached. Please retry later." },
});
