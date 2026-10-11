import { Router, type IRouter } from "express";
import healthRouter from "./health";
import qlooRouter from "./qloo";
import discoveriesRouter from "./discoveries";
import plansRouter from "./plans";

const router: IRouter = Router();

router.use(healthRouter);
router.use(qlooRouter);
router.use(discoveriesRouter);
router.use(plansRouter);

export default router;
