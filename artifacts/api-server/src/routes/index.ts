import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import qlooRouter from "./qloo";
import discoveriesRouter from "./discoveries";
import plansRouter from "./plans";
import agentRouter from "./agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(qlooRouter);
router.use(discoveriesRouter);
router.use(plansRouter);
router.use(agentRouter);

export default router;
