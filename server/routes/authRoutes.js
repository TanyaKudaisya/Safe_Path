import express from 'express';
import { AuthController } from '../controllers/AuthController.js';
import verifyToken from '../middleware/verifyToken.js';
import upload from '../middleware/multer.js';

const router = express.Router();

router.post('/signup', AuthController.signup);
router.post('/login', AuthController.login);
router.put('/update', verifyToken, upload.single("avatar"), AuthController.updateProfile);

export default router;