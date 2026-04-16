import express from "express";
import { ReportController } from "../controllers/ReportController.js";
import upload from "../middleware/multer.js";
import verifyToken from "../middleware/verifyToken.js";
import admin from "../middleware/admin.js";

const router = express.Router();

// USER
router.post("/report/register", upload.single("photo"), ReportController.register);
router.get("/report/user/:user_id", ReportController.getReportByUserId);
router.get("/report/:id", ReportController.getReportById);

// ADMIN
router.get("/report", verifyToken, admin, ReportController.getAllReports);
router.delete("/report/:id", verifyToken, admin, ReportController.deleteReport);
router.put("/report/:id/resolve", verifyToken, admin, ReportController.resolveReport);

export default router;