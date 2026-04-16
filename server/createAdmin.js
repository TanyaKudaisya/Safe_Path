import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "./models/User.Model.js";

const MONGO_URI = "mongodb+srv://shreyaporwal167:shreya167@cluster0.8mljwgq.mongodb.net/pothhole?retryWrites=true&w=majority&appName=Cluster0";

const createAdmin = async () => {
    try {
        await mongoose.connect(MONGO_URI);

        const existingAdmin = await User.findOne({ role: "admin" });

        if (existingAdmin) {
            console.log("Admin already exists");
            process.exit();
        }

        const hashedPassword = await bcrypt.hash("admin123", 10);

        await User.create({
            name: "Admin",
            email: "admin@gmail.com",
            password: hashedPassword,
            role: "admin",
        });

        console.log("✅ Admin created");
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

createAdmin();