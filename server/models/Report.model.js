import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        description: {
            type: String,
        },
        photo: {
            type: String,
            default: null,
        },
        location: {
            latitude: {
                type: Number,
                required: true,
            },
            longitude: {
                type: Number,
                required: true,
            },
        },
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // ✅ NEW FIELD (IMPORTANT)
        status: {
            type: String,
            enum: ["pending", "resolved"],
            default: "pending",
        },

        detections: [
            {
                damage_type: {
                    type: String,
                    required: true,
                },
                confidence_score: {
                    type: Number,
                    required: true,
                },
            },
        ],
    },
    { timestamps: true }
);

const Report = mongoose.model("Report", ReportSchema);
export default Report;