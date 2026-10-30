import { Router, type IRouter } from "express";
import healthRouter from "./health";
import qlooRouter from "./qloo";
import discoveriesRouter from "./discoveries";
import plansRouter from "./plans";
import agentRouter from "./agent";
import venuesRouter from "./venues";

const router: IRouter = Router();

router.use(healthRouter);
router.use(qlooRouter);
router.use(discoveriesRouter);
router.use(plansRouter);
router.use(agentRouter);
router.use(venuesRouter);

export default router;
